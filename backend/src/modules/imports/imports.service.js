import { Product } from '../../models/product.model.js';
import { VariantPricing } from '../../models/variant-pricing.model.js';
import { StockLevel } from '../../models/stock-level.model.js';
import { Warehouse } from '../../models/warehouse.model.js';
import { ApiError } from '../../utils/asyncHandler.js';
import { getCurrency } from '../settings/settings.service.js';
import { PRODUCT_COLUMNS, autoMap, buildImportPlan, parseCsvObjects, summarizePlan } from '../../core/csv.js';
import { toMajorString } from '../../core/money.js';
import { toCsv } from '../../core/analytics.js';

const MAX_ROWS = 10_000;

/** Load the current state of every SKU in the file, so the plan can diff against reality. */
async function existingBySku(orgId, skus) {
  const products = await Product.find({ organizationId: orgId, sku: { $in: skus }, deletedAt: null }).lean();
  const ids = products.map((p) => p._id);
  const [pricing, levels] = await Promise.all([
    VariantPricing.find({ organizationId: orgId, productId: { $in: ids } }).lean(),
    StockLevel.find({ organizationId: orgId, productId: { $in: ids } }).lean(),
  ]);
  const costOf = new Map(pricing.map((v) => [v.productId.toString(), v.cost]));
  const qtyOf = new Map(levels.map((l) => [l.productId.toString(), l.onHand]));

  return new Map(products.map((p) => [p.sku, {
    _id: p._id,
    title: p.title,
    description: p.description,
    barcode: p.barcode,
    weightgrams: p.weightGrams,
    status: p.status,
    price: p.price?.amountMinor,
    cost: costOf.get(p._id.toString()),
    quantity: qtyOf.get(p._id.toString()),
  }]));
}

/**
 * DRY RUN. Parse, auto-map, validate, and classify every row — writing nothing.
 * The caller shows this plan to the user and only then commits.
 */
export async function preview(orgId, csvText, overrideMapping) {
  const { currency } = await getCurrency(orgId);
  const { headers, rawHeaders, rows } = parseCsvObjects(csvText);

  if (!rows.length) throw new ApiError(400, 'The file has a header but no data rows', 'validation');
  if (rows.length > MAX_ROWS) throw new ApiError(400, `Too many rows (${rows.length}); the limit is ${MAX_ROWS}`, 'validation');

  const auto = autoMap(headers, PRODUCT_COLUMNS);
  const mapping = { ...auto.mapping, ...(overrideMapping ?? {}) };

  if (!mapping.sku) {
    throw new ApiError(400, `No SKU column found. Expected one of: ${PRODUCT_COLUMNS.sku.aliases.join(', ')}`, 'validation');
  }

  const skus = [...new Set(rows.map((r) => r[mapping.sku]).filter(Boolean))];
  const existing = await existingBySku(orgId, skus);

  const plan = buildImportPlan(rows, mapping, existing, currency, PRODUCT_COLUMNS);
  return {
    currency,
    headers, rawHeaders,
    mapping,
    unmapped: auto.unmapped.filter((h) => !Object.values(mapping).includes(h)),
    summary: summarizePlan(plan),
    plan: plan.slice(0, 500),          // cap what we ship to the browser
    truncated: plan.length > 500,
  };
}

/**
 * COMMIT. Re-plans from the same CSV (so nothing stale is applied), then writes only the
 * create/update rows. Error rows are skipped and returned, never partially applied.
 *
 * Cost changes flow through the pricing service, which auto-propagates the new price to
 * every connected store — so a supplier price list import repriced eBay and your website.
 */
export async function commit(orgId, csvText, { mapping: overrideMapping, actorId, applyStock = true } = {}) {
  const { currency, plan, mapping } = await (async () => {
    const p = await preview(orgId, csvText, overrideMapping);
    // Re-plan on the full set (preview caps at 500 for display only).
    const { rows } = parseCsvObjects(csvText);
    const skus = [...new Set(rows.map((r) => r[p.mapping.sku]).filter(Boolean))];
    const existing = await existingBySku(orgId, skus);
    return { currency: p.currency, mapping: p.mapping, plan: buildImportPlan(rows, p.mapping, existing, p.currency, PRODUCT_COLUMNS) };
  })();

  const warehouse = applyStock ? await Warehouse.findOne({ organizationId: orgId }) : null;
  const pricingService = await import('../pricing/pricing.service.js');

  const applied = [];
  const failed = plan.filter((p) => p.action === 'error').map((p) => ({ line: p.line, sku: p.sku, errors: p.errors }));

  for (const row of plan) {
    if (row.action === 'error' || row.action === 'skip') continue;
    const v = row.value;

    try {
      // 1) Product document.
      const productDoc = {
        organizationId: orgId, sku: v.sku,
        ...(v.title != null && { title: v.title }),
        ...(v.description != null && { description: v.description }),
        ...(v.barcode != null && { barcode: v.barcode }),
        ...(v.weightgrams != null && { weightGrams: v.weightgrams }),
        ...(v.status != null && { status: v.status.toUpperCase() }),
        ...(v.price != null && { price: { amountMinor: v.price, currency } }),
      };
      if (row.action === 'create' && !productDoc.title) productDoc.title = v.sku;
      if (row.action === 'create' && !productDoc.price) productDoc.price = { amountMinor: v.cost ?? 0, currency };

      const product = await Product.findOneAndUpdate(
        { organizationId: orgId, sku: v.sku },
        { $set: productDoc },
        { new: true, upsert: true, runValidators: true },
      );

      // 2) Cost -> pricing service, which auto-propagates to every connected channel.
      let propagation;
      if (v.cost != null) {
        const res = await pricingService.upsertPricing(orgId, product._id.toString(), { cost: v.cost, currency });
        propagation = res?.propagation;
      }

      // 3) Stock (absolute set, not a delta — a stock file states the truth).
      if (applyStock && v.quantity != null && warehouse) {
        await StockLevel.findOneAndUpdate(
          { organizationId: orgId, productId: product._id, warehouseId: warehouse._id },
          { $set: { onHand: v.quantity }, $setOnInsert: { reserved: 0 } },
          { upsert: true },
        );
      }

      applied.push({
        line: row.line, sku: v.sku, action: row.action, productId: product._id,
        ...(propagation?.pushed ? { channelsRepriced: propagation.pushed } : {}),
      });
    } catch (e) {
      failed.push({ line: row.line, sku: v.sku, errors: [e.message] });
    }
  }

  return {
    currency,
    mapping,
    created: applied.filter((a) => a.action === 'create').length,
    updated: applied.filter((a) => a.action === 'update').length,
    skipped: plan.filter((p) => p.action === 'skip').length,
    failed: failed.length,
    channelsRepriced: applied.reduce((n, a) => n + (a.channelsRepriced ?? 0), 0),
    applied, errors: failed,
  };
}

/* -------------------------------- templates ------------------------------ */
/** A ready-to-fill CSV template, in the org's currency. */
export async function template(orgId) {
  const { currency } = await getCurrency(orgId);
  return toCsv([
    { sku: 'SKU-001', title: 'Wireless Mouse', description: 'Ergonomic, silent click', barcode: '036000291452', cost: '10.00', price: '19.99', quantity: '50', status: 'ACTIVE' },
    { sku: 'SKU-002', title: 'Mechanical Keyboard', description: 'Tactile switches', barcode: '5901234123457', cost: '45.00', price: '89.99', quantity: '20', status: 'ACTIVE' },
  ], ['sku', 'title', 'description', 'barcode', 'cost', 'price', 'quantity', 'status']);
}

/** Export the current catalogue as CSV — the same shape the importer accepts (round-trips). */
export async function exportProducts(orgId) {
  const { currency } = await getCurrency(orgId);
  const products = await Product.find({ organizationId: orgId, deletedAt: null }).lean();
  const [pricing, levels] = await Promise.all([
    VariantPricing.find({ organizationId: orgId }).lean(),
    StockLevel.find({ organizationId: orgId }).lean(),
  ]);
  const costOf = new Map(pricing.map((v) => [v.productId.toString(), v.cost]));
  const qtyOf = new Map(levels.map((l) => [l.productId.toString(), l.onHand]));

  const rows = products.map((p) => ({
    sku: p.sku,
    title: p.title,
    description: p.description ?? '',
    barcode: p.barcode ?? '',
    cost: toMajorString(costOf.get(p._id.toString()), currency),
    price: toMajorString(p.price?.amountMinor, currency),
    quantity: qtyOf.get(p._id.toString()) ?? '',
    status: p.status,
  }));
  return toCsv(rows, ['sku', 'title', 'description', 'barcode', 'cost', 'price', 'quantity', 'status']);
}

export const columnSpec = () =>
  Object.entries(PRODUCT_COLUMNS).map(([field, s]) => ({ field, aliases: s.aliases, required: s.required, type: s.money ? 'money' : s.integer ? 'integer' : 'text' }));
