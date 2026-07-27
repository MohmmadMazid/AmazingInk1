import mongoose from 'mongoose';
import { DailySalesRollup } from '../../models/daily-rollup.model.js';
import { SavedReport } from '../../models/saved-report.model.js';
import { Order } from '../../models/order.model.js';
import { Product } from '../../models/product.model.js';
import { VariantPricing } from '../../models/variant-pricing.model.js';
import { StockLevel } from '../../models/stock-level.model.js';
import { ApiError } from '../../utils/asyncHandler.js';
import {
  attachComparison, buildPnl, buildSeries, comparisonRange, growthPct, pareto,
  resolveRange, salesKpis, toCsv, topN,
} from '../../core/analytics.js';

/* --------------------------------- rollups ------------------------------- */
/**
 * Rebuild the daily rollups for a date range by aggregating orders ONCE. Idempotent —
 * re-running overwrites the same (org, date, channel) documents. In production this is a
 * nightly job plus an incremental run for today; dashboards never touch orders directly.
 */
export async function rebuildRollups(orgId, { from, to } = {}) {
  const range = resolveRange({ from, to, preset: 'last_90_days' });
  const start = new Date(range.from + 'T00:00:00Z');
  const end = new Date(range.to + 'T23:59:59Z');

  // Cost basis per product, so COGS is real rather than guessed.
  const pricing = await VariantPricing.find({ organizationId: orgId }).select('productId cost').lean();
  const costOf = new Map(pricing.map((p) => [p.productId.toString(), p.cost ?? 0]));

  const orders = await Order.find({
    organizationId: orgId, deletedAt: null,
    status: { $ne: 'CANCELLED' },
    placedAt: { $gte: start, $lte: end },
  }).select('placedAt channel lines subtotalMinor taxMinor totalMinor customerId').lean();

  // Bucket by (date, channel) in one pass.
  const buckets = new Map();
  for (const o of orders) {
    const date = o.placedAt.toISOString().slice(0, 10);
    for (const channel of [o.channel ?? 'web', 'all']) {
      const key = `${date}|${channel}`;
      const b = buckets.get(key) ?? { date, channel, orders: 0, units: 0, customers: new Set(), grossRevenue: 0, discounts: 0, refunds: 0, cogs: 0, tax: 0 };
      b.orders += 1;
      b.units += (o.lines ?? []).reduce((s, l) => s + l.quantity, 0);
      if (o.customerId) b.customers.add(o.customerId.toString());
      b.grossRevenue += o.subtotalMinor ?? 0;
      b.tax += o.taxMinor ?? 0;
      b.cogs += (o.lines ?? []).reduce((s, l) => s + (costOf.get(l.productId?.toString()) ?? 0) * l.quantity, 0);
      buckets.set(key, b);
    }
  }

  const ops = [...buckets.values()].map((b) => ({
    updateOne: {
      filter: { organizationId: orgId, date: b.date, channel: b.channel },
      update: {
        $set: {
          organizationId: orgId, date: b.date, channel: b.channel,
          orders: b.orders, units: b.units, customers: b.customers.size,
          grossRevenue: b.grossRevenue, discounts: b.discounts, refunds: b.refunds,
          netRevenue: b.grossRevenue - b.discounts - b.refunds,
          cogs: b.cogs, tax: b.tax, computedAt: new Date(),
        },
      },
      upsert: true,
    },
  }));

  if (ops.length) await DailySalesRollup.bulkWrite(ops);
  return { range, days: new Set([...buckets.values()].map((b) => b.date)).size, documents: ops.length, ordersScanned: orders.length };
}

/** Sum rollup rows into the totals shape the KPI core expects. */
function sumRollups(rows) {
  return rows.reduce((t, r) => ({
    orders: t.orders + r.orders, units: t.units + r.units, customers: t.customers + r.customers,
    grossRevenue: t.grossRevenue + r.grossRevenue, netRevenue: t.netRevenue + r.netRevenue,
    refunds: t.refunds + r.refunds, discounts: t.discounts + r.discounts, cogs: t.cogs + r.cogs, tax: t.tax + r.tax,
  }), { orders: 0, units: 0, customers: 0, grossRevenue: 0, netRevenue: 0, refunds: 0, discounts: 0, cogs: 0, tax: 0 });
}

const fetchRollups = (orgId, range, channel = 'all') =>
  DailySalesRollup.find({ organizationId: orgId, channel, date: { $gte: range.from, $lte: range.to } }).sort({ date: 1 }).lean();

/* -------------------------------- dashboard ------------------------------ */
/**
 * The sales dashboard: KPIs with period-over-period comparison, and a revenue/orders
 * timeseries. Reads only rollups, so cost is O(days) regardless of order volume.
 */
export async function dashboard(orgId, { preset, from, to, grain = 'DAY', compare = 'previous', channel = 'all' } = {}) {
  const range = resolveRange({ preset, from, to });
  const prevRange = comparisonRange(range, compare);

  const [cur, prev] = await Promise.all([fetchRollups(orgId, range, channel), fetchRollups(orgId, prevRange, channel)]);

  const curTotals = sumRollups(cur);
  const prevTotals = sumRollups(prev);

  const revenueSeries = buildSeries(cur.map((r) => ({ date: r.date, value: r.netRevenue })), grain, range);
  const prevRevenue = buildSeries(prev.map((r) => ({ date: r.date, value: r.netRevenue })), grain, prevRange);
  const ordersSeries = buildSeries(cur.map((r) => ({ date: r.date, value: r.orders })), grain, range);

  return {
    range, comparisonRange: prevRange, grain,
    kpis: salesKpis(curTotals, prevTotals),
    revenueSeries: attachComparison(revenueSeries, prevRevenue),
    ordersSeries,
    totals: curTotals,
  };
}

/* ---------------------------------- P&L ---------------------------------- */
/** Profit & loss for the period, built from rollups (real COGS from the cost basis). */
export async function pnl(orgId, { preset, from, to } = {}) {
  const range = resolveRange({ preset, from, to });
  const rows = await fetchRollups(orgId, range);
  const t = sumRollups(rows);
  const statement = buildPnl({
    grossRevenue: t.grossRevenue, discounts: t.discounts, refunds: t.refunds,
    cogs: t.cogs, shippingRevenue: 0, shippingCost: 0, fees: 0, tax: t.tax,
  });
  return { range, ...statement };
}

/* -------------------------------- breakdowns ----------------------------- */
/** Revenue by channel, with share % and an "Other" fold. */
export async function byChannel(orgId, { preset, from, to } = {}) {
  const range = resolveRange({ preset, from, to });
  const rows = await DailySalesRollup.find({
    organizationId: orgId, channel: { $ne: 'all' }, date: { $gte: range.from, $lte: range.to },
  }).lean();

  const byKey = new Map();
  for (const r of rows) {
    const b = byKey.get(r.channel) ?? { key: r.channel, label: r.channel, value: 0, secondary: 0 };
    b.value += r.netRevenue; b.secondary += r.orders;
    byKey.set(r.channel, b);
  }
  return { range, slices: topN([...byKey.values()], 8) };
}

/** Top products by revenue over the period, with a Pareto (80/20) view. */
export async function topProducts(orgId, { preset, from, to, limit = 10 } = {}) {
  const range = resolveRange({ preset, from, to });
  const rows = await Order.aggregate([
    { $match: { organizationId: orgId, deletedAt: null, status: { $ne: 'CANCELLED' }, placedAt: { $gte: new Date(range.from + 'T00:00:00Z'), $lte: new Date(range.to + 'T23:59:59Z') } } },
    { $unwind: '$lines' },
    { $group: { _id: '$lines.productId', revenue: { $sum: '$lines.lineTotalMinor' }, units: { $sum: '$lines.quantity' } } },
    { $sort: { revenue: -1 } },
    { $limit: 100 },
  ]);

  const products = await Product.find({ _id: { $in: rows.map((r) => r._id) } }).select('sku title').lean();
  const nameOf = new Map(products.map((p) => [p._id.toString(), p]));

  const slices = rows.map((r) => {
    const p = nameOf.get(r._id?.toString());
    return { key: r._id?.toString() ?? 'unknown', label: p ? `${p.sku} — ${p.title}` : 'unknown', value: r.revenue, secondary: r.units };
  });

  return { range, slices: topN(slices, limit), pareto: pareto(slices).slice(0, limit) };
}

/** Inventory valuation at cost, plus units on hand. */
export async function inventoryValuation(orgId) {
  const [levels, pricing] = await Promise.all([
    StockLevel.find({ organizationId: orgId }).populate('productId', 'sku title').lean(),
    VariantPricing.find({ organizationId: orgId }).select('productId cost').lean(),
  ]);
  const costOf = new Map(pricing.map((p) => [p.productId.toString(), p.cost ?? 0]));

  const rows = levels.map((l) => {
    const cost = costOf.get(l.productId?._id?.toString()) ?? 0;
    return { sku: l.productId?.sku ?? '—', title: l.productId?.title ?? '', onHand: l.onHand, reserved: l.reserved, unitCost: cost, valueAtCost: cost * l.onHand };
  });
  return { rows, totalUnits: rows.reduce((s, r) => s + r.onHand, 0), totalValue: rows.reduce((s, r) => s + r.valueAtCost, 0) };
}

/* --------------------------------- exports ------------------------------- */
/** Export a report as CSV (uses the pure toCsv, which handles quoting/escaping). */
export async function exportCsv(orgId, type, params) {
  switch (type) {
    case 'SALES': {
      const range = resolveRange(params);
      const rows = await fetchRollups(orgId, range);
      return toCsv(rows.map((r) => ({ date: r.date, orders: r.orders, units: r.units, grossRevenue: r.grossRevenue, netRevenue: r.netRevenue, cogs: r.cogs })));
    }
    case 'INVENTORY': {
      const { rows } = await inventoryValuation(orgId);
      return toCsv(rows);
    }
    case 'PRODUCTS': {
      const { slices } = await topProducts(orgId, params);
      return toCsv(slices.map((s) => ({ product: s.label, revenue: s.value, units: s.secondary ?? 0, sharePct: s.sharePct })));
    }
    default:
      throw new ApiError(400, `Unsupported export type ${type}`, 'validation');
  }
}

/* ------------------------------ saved reports ---------------------------- */
export const listSavedReports = (orgId) => SavedReport.find({ organizationId: orgId }).sort({ createdAt: -1 });
export const createSavedReport = (orgId, body, userId) => SavedReport.create({ ...body, organizationId: orgId, createdBy: userId });
export async function removeSavedReport(orgId, id) {
  const r = await SavedReport.findOneAndDelete({ _id: id, organizationId: orgId });
  if (!r) throw new ApiError(404, 'Report not found', 'not_found');
  return { id, deleted: true };
}
