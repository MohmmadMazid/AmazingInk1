import { AiUsageLog } from '../../models/ai-usage.model.js';
import { AiPromptTemplate } from '../../models/ai-prompt.model.js';
import { Product } from '../../models/product.model.js';
import { Order } from '../../models/order.model.js';
import { StockLevel } from '../../models/stock-level.model.js';
import { VariantPricing } from '../../models/variant-pricing.model.js';
import { DailySalesRollup } from '../../models/daily-rollup.model.js';
import { ApiError } from '../../utils/asyncHandler.js';
import { PRICE_TABLE, getProvider, providerNames } from '../../adapters/llm.registry.js';
import {
  bestMatches, classifyTrend, computeCostMinor, detectAnomalies, forecastDemand, parseJson,
  parseList, recommendedOrderQty, renderMessages, reorderPoint, safetyStock, scoreImage,
  stddev, suggestPrice, sumUsage,
} from '../../core/ai.js';

/* ------------------------------- completion ------------------------------ */
/**
 * The single entry point to any model. Every call is metered: tokens counted, cost computed
 * in minor units, latency recorded, errors logged. Exported so other modules can use the LLM
 * without re-implementing accounting.
 */
export async function complete(orgId, { feature, system, user, json = false, userId, providerName }) {
  const provider = getProvider(providerName);
  const started = Date.now();

  try {
    const res = await provider.complete({ system, user, json });
    const costMinor = computeCostMinor(res.usage, PRICE_TABLE[provider.name] ?? PRICE_TABLE.ECHO);

    await AiUsageLog.create({
      organizationId: orgId, userId, feature, provider: provider.name, model: res.model,
      promptTokens: res.usage.promptTokens, completionTokens: res.usage.completionTokens,
      costMinor, status: 'SUCCESS', latencyMs: Date.now() - started,
    });

    return { ...res, provider: provider.name, costMinor };
  } catch (err) {
    await AiUsageLog.create({
      organizationId: orgId, userId, feature, provider: provider.name,
      status: 'ERROR', error: err.message, latencyMs: Date.now() - started,
    }).catch(() => {});
    throw new ApiError(502, `AI provider error: ${err.message}`, 'ai_provider_error');
  }
}

/** Run a stored prompt template against variables. */
export async function runPrompt(orgId, key, vars, userId) {
  const tpl = await AiPromptTemplate.findOne({ organizationId: orgId, key, active: true });
  if (!tpl) throw new ApiError(404, `Prompt template ${key} not found`, 'not_found');

  const { system, user, missing } = renderMessages(tpl, vars ?? {});
  const res = await complete(orgId, { feature: `prompt.${key}`, system, user, json: tpl.json, userId });
  return { ...res, missingVars: missing, parsed: tpl.json ? parseJson(res.text) : undefined };
}

/* ---------------------------- catalog assistance ------------------------- */
/** Generate marketing copy for a product. Prose only — no numbers involved. */
export async function generateDescription(orgId, productId, userId) {
  const product = await Product.findOne({ _id: productId, organizationId: orgId, deletedAt: null });
  if (!product) throw new ApiError(404, 'Product not found', 'not_found');

  const res = await complete(orgId, {
    feature: 'content.description', userId,
    system: 'You are an e-commerce copywriter. Write concise, benefit-led product copy. No fabricated specifications.',
    user: `Write a product description for: ${product.title}. Existing notes: ${product.description ?? 'none'}`,
  });
  return { productId, title: product.title, description: res.text, costMinor: res.costMinor, provider: res.provider };
}

/** Suggest SEO keywords (structured output, parsed defensively). */
export async function generateKeywords(orgId, productId, userId) {
  const product = await Product.findOne({ _id: productId, organizationId: orgId, deletedAt: null });
  if (!product) throw new ApiError(404, 'Product not found', 'not_found');

  const res = await complete(orgId, {
    feature: 'content.keywords', userId, json: true,
    system: 'Return ONLY a JSON array of 5-8 lowercase search keywords.',
    user: `Generate keywords for: ${product.title}. ${product.description ?? ''}`,
  });
  return { productId, keywords: parseList(res.text), costMinor: res.costMinor, provider: res.provider };
}

/** Find near-duplicate products. The similarity math is deterministic; the LLM never guesses. */
export async function findDuplicates(orgId, productId, threshold = 0.4) {
  const target = await Product.findOne({ _id: productId, organizationId: orgId, deletedAt: null });
  if (!target) throw new ApiError(404, 'Product not found', 'not_found');

  const others = await Product.find({ organizationId: orgId, _id: { $ne: target._id }, deletedAt: null }).select('title description').lean();
  const matches = bestMatches(
    `${target.title} ${target.description ?? ''}`,
    others.map((p) => ({ id: p._id.toString(), text: `${p.title} ${p.description ?? ''}` })),
    threshold,
  );
  const byId = new Map(others.map((p) => [p._id.toString(), p]));
  return { productId, matches: matches.map((m) => ({ ...m, title: byId.get(m.id)?.title })) };
}

/* --------------------------- forecasting & reorder ----------------------- */
/**
 * Demand forecast + reorder recommendation. ALL NUMBERS ARE COMPUTED HERE, deterministically.
 * The LLM is then asked to *explain* the figures — never to produce them.
 */
export async function forecastProduct(orgId, productId, { horizon = 7, leadTimeDays = 7, explain = true, userId } = {}) {
  const product = await Product.findOne({ _id: productId, organizationId: orgId, deletedAt: null });
  if (!product) throw new ApiError(404, 'Product not found', 'not_found');

  // Daily units sold over the last 30 days.
  const since = new Date(Date.now() - 30 * 86_400_000);
  const orders = await Order.find({
    organizationId: orgId, deletedAt: null, status: { $ne: 'CANCELLED' },
    placedAt: { $gte: since }, 'lines.productId': product._id,
  }).select('placedAt lines').lean();

  const byDay = new Map();
  for (const o of orders) {
    const day = o.placedAt.toISOString().slice(0, 10);
    const qty = o.lines.filter((l) => String(l.productId) === String(product._id)).reduce((s, l) => s + l.quantity, 0);
    byDay.set(day, (byDay.get(day) ?? 0) + qty);
  }
  const series = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);

  const level = await StockLevel.findOne({ organizationId: orgId, productId: product._id });
  const onHand = level?.onHand ?? 0;
  const reserved = level?.reserved ?? 0;

  const projected = forecastDemand(series, horizon);
  const avgDaily = series.length ? series.reduce((a, b) => a + b, 0) / series.length : 0;
  const sd = stddev(series);
  const safety = safetyStock(sd, leadTimeDays);
  const rop = reorderPoint(avgDaily, leadTimeDays, safety);
  const coverUnits = Math.ceil(avgDaily * horizon);
  const orderQty = recommendedOrderQty(rop, onHand - reserved, 0, coverUnits);
  const trend = classifyTrend(series);
  const anomalies = detectAnomalies(series);

  const numbers = {
    historyDays: series.length, series, avgDailyDemand: +avgDaily.toFixed(2), demandStdDev: +sd.toFixed(2),
    projected: projected.map((v) => +v.toFixed(1)), onHand, reserved, available: onHand - reserved,
    safetyStock: safety, reorderPoint: rop, recommendedOrderQty: orderQty, trend, anomalies,
  };

  if (!explain) return { productId, sku: product.sku, ...numbers };

  // The LLM narrates the computed figures — it cannot alter them.
  const res = await complete(orgId, {
    feature: 'forecast.explain', userId,
    system: 'You are an inventory analyst. Explain the provided figures in 2-3 sentences. Do NOT invent or recompute any number; use only what is given.',
    user: `Product: ${product.title}. Figures: ${JSON.stringify(numbers)}`,
  });

  return { productId, sku: product.sku, ...numbers, explanation: res.text, provider: res.provider, costMinor: res.costMinor };
}

/* --------------------------- price optimization -------------------------- */
/** Elasticity-based price suggestion with a hard margin floor. The floor is never crossed. */
export async function suggestProductPrice(orgId, productId, { elasticity = -1.5, floorMarginPct = 30, explain = true, userId } = {}) {
  const [product, pricing] = await Promise.all([
    Product.findOne({ _id: productId, organizationId: orgId, deletedAt: null }),
    VariantPricing.findOne({ organizationId: orgId, productId }),
  ]);
  if (!product) throw new ApiError(404, 'Product not found', 'not_found');
  const costMinor = pricing?.cost;
  if (costMinor == null) throw new ApiError(400, 'No cost basis for this product', 'validation');

  const suggestion = suggestPrice({ currentMinor: product.price.amountMinor, costMinor, elasticity, floorMarginPct });
  const numbers = { currentMinor: product.price.amountMinor, costMinor, elasticity, floorMarginPct, ...suggestion };

  if (!explain) return { productId, sku: product.sku, ...numbers };

  const res = await complete(orgId, {
    feature: 'pricing.explain', userId,
    system: 'You are a pricing analyst. Explain the recommendation in 2 sentences using only the given figures. Never suggest a price below the floor.',
    user: `Product: ${product.title}. Figures: ${JSON.stringify(numbers)}`,
  });
  return { productId, sku: product.sku, ...numbers, explanation: res.text, provider: res.provider, costMinor: res.costMinor };
}

/* --------------------------------- insights ------------------------------ */
/** Narrate the analytics rollups: trend, anomalies, and a plain-English summary. */
export async function businessInsights(orgId, { days = 30, userId } = {}) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const rows = await DailySalesRollup.find({ organizationId: orgId, channel: 'all', date: { $gte: since } }).sort({ date: 1 }).lean();
  if (!rows.length) throw new ApiError(400, 'No rollup data — rebuild analytics rollups first', 'validation');

  const revenue = rows.map((r) => r.netRevenue);
  const orders = rows.map((r) => r.orders);
  const numbers = {
    days: rows.length,
    totalRevenueMinor: revenue.reduce((a, b) => a + b, 0),
    totalOrders: orders.reduce((a, b) => a + b, 0),
    revenueTrend: classifyTrend(revenue),
    ordersTrend: classifyTrend(orders),
    revenueAnomalies: detectAnomalies(revenue).map((a) => ({ date: rows[a.index].date, value: a.value, z: a.z })),
    forecastNext7: forecastDemand(revenue, 7).map((v) => Math.round(v)),
  };

  const res = await complete(orgId, {
    feature: 'insights.summary', userId,
    system: 'You are a business analyst. Summarize the figures in 3 sentences. Use only the given numbers; do not compute new ones.',
    user: `Sales figures: ${JSON.stringify(numbers)}`,
  });
  return { ...numbers, summary: res.text, provider: res.provider, costMinor: res.costMinor };
}

/* ------------------------------ image quality ---------------------------- */
export const checkImage = (meta) => scoreImage(meta);

/* --------------------------------- prompts ------------------------------- */
export const listPrompts = (orgId) => AiPromptTemplate.find({ organizationId: orgId }).sort({ key: 1 });
export const upsertPrompt = (orgId, body) =>
  AiPromptTemplate.findOneAndUpdate({ organizationId: orgId, key: body.key }, { $set: { ...body, organizationId: orgId } }, { new: true, upsert: true });

/* ---------------------------------- usage -------------------------------- */
export const availableProviders = () => ({ providers: providerNames(), active: getProvider().name, prices: PRICE_TABLE });

/** Usage and spend, by feature and by provider. */
export async function usageReport(orgId, { days = 30 } = {}) {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await AiUsageLog.find({ organizationId: orgId, createdAt: { $gte: since } }).lean();
  const totals = sumUsage(rows.map((r) => ({ promptTokens: r.promptTokens, completionTokens: r.completionTokens, costMinor: r.costMinor })));

  const group = (key) => {
    const m = new Map();
    for (const r of rows) {
      const k = r[key] ?? 'unknown';
      const e = m.get(k) ?? { calls: 0, costMinor: 0, errors: 0 };
      e.calls++; e.costMinor += r.costMinor ?? 0;
      if (r.status === 'ERROR') e.errors++;
      m.set(k, e);
    }
    return [...m.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.calls - a.calls);
  };

  return {
    days, calls: rows.length, ...totals,
    errorRate: rows.length ? +(rows.filter((r) => r.status === 'ERROR').length / rows.length).toFixed(3) : 0,
    avgLatencyMs: rows.length ? Math.round(rows.reduce((a, r) => a + (r.latencyMs ?? 0), 0) / rows.length) : 0,
    byFeature: group('feature'), byProvider: group('provider'),
  };
}

export const recentCalls = (orgId, limit = 50) => AiUsageLog.find({ organizationId: orgId }).sort({ createdAt: -1 }).limit(limit);
