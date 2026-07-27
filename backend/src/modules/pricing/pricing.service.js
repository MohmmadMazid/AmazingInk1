import { PricingRule } from '../../models/pricing-rule.model.js';
import { VariantPricing } from '../../models/variant-pricing.model.js';
import { Promotion } from '../../models/promotion.model.js';
import { Coupon } from '../../models/coupon.model.js';
import { PriceChange } from '../../models/price-change.model.js';
import { Product } from '../../models/product.model.js';
import { ApiError } from '../../utils/asyncHandler.js';
import { computeQuote, evaluateCoupon, ZERO_FEES } from '../../core/pricing-engine.js';

/**
 * Auto-propagation hook. Changing a product's COST changes the price every channel must
 * publish to hold its margin — so we recompute and enqueue on every cost change.
 * Imported lazily to avoid a circular import (channels -> pricing -> channels).
 */
async function propagateToChannels(orgId, productId) {
  try {
    const channels = await import('../channels/channels.service.js');
    return await channels.propagatePrice(orgId, productId);
  } catch (e) {
    // Never let a channel push break the pricing write that triggered it.
    return { error: e.message };
  }
}

/* ------------------------------ pricing data ----------------------------- */
export async function getPricing(orgId, productId) {
  return VariantPricing.findOne({ organizationId: orgId, productId });
}

export async function upsertPricing(orgId, productId, body) {
  const before = await VariantPricing.findOne({ organizationId: orgId, productId }).lean();
  const row = await VariantPricing.findOneAndUpdate(
    { organizationId: orgId, productId },
    { $set: { ...body, organizationId: orgId, productId } },
    { new: true, upsert: true, runValidators: true },
  );

  // A cost change moves every channel's price. Recompute and enqueue automatically.
  const costChanged = before?.cost !== row.cost;
  const propagation = costChanged ? await propagateToChannels(orgId, productId) : undefined;
  return { pricing: row, costChanged, propagation };
}

/* --------------------------------- rules -------------------------------- */
export const listRules = (orgId) => PricingRule.find({ organizationId: orgId }).sort({ priority: -1, createdAt: -1 });
export const createRule = (orgId, body) => PricingRule.create({ ...body, organizationId: orgId });
export async function removeRule(orgId, id) {
  const r = await PricingRule.findOneAndDelete({ _id: id, organizationId: orgId });
  if (!r) throw new ApiError(404, 'Rule not found', 'not_found');
  return { id, deleted: true };
}

/** The highest-priority active rule for a product (product-specific beats global). */
async function resolveRule(orgId, productId) {
  const rules = await PricingRule.find({ organizationId: orgId, active: true, $or: [{ productId }, { productId: null }] })
    .sort({ productId: -1, priority: -1 }); // product-specific first (non-null sorts before null desc)
  return rules[0] ?? null;
}

/** The active promotion for a product, if any. */
async function resolvePromotion(orgId, productId, now = new Date()) {
  return Promotion.findOne({
    organizationId: orgId, active: true,
    $or: [{ productId }, { productId: null }],
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
    ],
  }).sort({ productId: -1 });
}

/* ------------------------------ the quote -------------------------------- */
/**
 * Compute a full price quote for a product: resolves its pricing inputs, the winning rule,
 * and any live promotion, then runs the pure engine. Returns list/final price, fees, margin,
 * guardrail flags, and an audit trail of steps.
 */
export async function quote(orgId, productId, { applyPromotion: withPromo = true } = {}) {
  const product = await Product.findOne({ _id: productId, organizationId: orgId, deletedAt: null });
  if (!product) throw new ApiError(404, 'Product not found', 'not_found');

  const pricing = await getPricing(orgId, productId);
  const rule = await resolveRule(orgId, productId);
  const promotion = withPromo ? await resolvePromotion(orgId, productId) : null;

  const result = computeQuote({
    currency: pricing?.currency ?? product.price?.currency ?? 'USD',
    cost: pricing?.cost ?? null,
    basePrice: pricing?.basePrice ?? product.price?.amountMinor ?? null,
    minPrice: pricing?.minPrice ?? null,
    maxPrice: pricing?.maxPrice ?? null,
    fees: pricing?.fees ? { ...ZERO_FEES, ...pricing.fees.toObject?.() ?? pricing.fees } : ZERO_FEES,
    rule: rule ? {
      type: rule.type, marginBps: rule.marginBps, markupBps: rule.markupBps, fixedPrice: rule.fixedPrice,
      competitiveDeltaBps: rule.competitiveDeltaBps, rounding: rule.rounding, respectMinMax: rule.respectMinMax,
    } : null,
    promotion: promotion ? { type: promotion.type, value: promotion.value } : null,
  });

  return { productId, sku: product.sku, title: product.title, ruleApplied: rule?.name ?? null, promotionApplied: promotion?.name ?? null, ...result };
}

/** Apply the computed list price back onto the product, recording the change. */
export async function applyQuote(orgId, productId, actorId) {
  const q = await quote(orgId, productId);
  const product = await Product.findOne({ _id: productId, organizationId: orgId });
  const oldPrice = product.price?.amountMinor ?? null;

  product.price = { amountMinor: q.listPrice, currency: q.currency };
  await product.save();
  await PriceChange.create({ organizationId: orgId, productId, oldPrice, newPrice: q.listPrice, source: 'RULE', actorId });

  // The base price moved, so PASSTHROUGH/MARKUP channels must follow it.
  const propagation = oldPrice !== q.listPrice ? await propagateToChannels(orgId, productId) : undefined;
  return { productId, oldPrice, newPrice: q.listPrice, quote: q, propagation };
}

/** Recompute and apply prices for every product with a resolvable rule. */
export async function bulkApply(orgId, actorId) {
  const products = await Product.find({ organizationId: orgId, deletedAt: null }).select('_id');
  const results = [];
  for (const p of products) {
    try { results.push(await applyQuote(orgId, p._id.toString(), actorId)); }
    catch (e) { results.push({ productId: p._id, error: e.message }); }
  }
  const changed = results.filter((r) => !r.error && r.oldPrice !== r.newPrice).length;
  return { total: results.length, changed, results };
}

/* -------------------------------- history -------------------------------- */
export async function history(orgId, { productId, skip, limit }) {
  const where = { organizationId: orgId };
  if (productId) where.productId = productId;
  const [data, total] = await Promise.all([
    PriceChange.find(where).sort({ createdAt: -1 }).skip(skip).limit(limit),
    PriceChange.countDocuments(where),
  ]);
  return { data, total };
}

/* ------------------------------- promotions ------------------------------ */
export const listPromotions = (orgId) => Promotion.find({ organizationId: orgId }).sort({ createdAt: -1 });
export const createPromotion = (orgId, body) => Promotion.create({ ...body, organizationId: orgId });

/* --------------------------------- coupons ------------------------------- */
export const listCoupons = (orgId) => Coupon.find({ organizationId: orgId }).sort({ createdAt: -1 });
export const createCoupon = (orgId, body) => Coupon.create({ ...body, organizationId: orgId });

/** Validate a coupon code against a subtotal (uses the pure core). */
export async function validateCoupon(orgId, code, subtotal) {
  const coupon = await Coupon.findOne({ organizationId: orgId, code: code.toUpperCase() });
  if (!coupon) return { valid: false, discount: 0, freeShipping: false, reason: 'Coupon not found.' };
  return { code: coupon.code, ...evaluateCoupon(coupon, { subtotal }) };
}

/** Redeem a coupon atomically — the guard prevents exceeding maxRedemptions under concurrency. */
export async function redeemCoupon(orgId, code, subtotal) {
  const check = await validateCoupon(orgId, code, subtotal);
  if (!check.valid) throw new ApiError(400, check.reason ?? 'Coupon invalid', 'coupon_invalid');

  const updated = await Coupon.findOneAndUpdate(
    {
      organizationId: orgId, code: code.toUpperCase(), active: true,
      $or: [{ maxRedemptions: null }, { $expr: { $lt: ['$redeemedCount', '$maxRedemptions'] } }],
    },
    { $inc: { redeemedCount: 1 } },
    { new: true },
  );
  if (!updated) throw new ApiError(409, 'Coupon redemption limit reached', 'conflict');
  return { ...check, redeemedCount: updated.redeemedCount };
}
