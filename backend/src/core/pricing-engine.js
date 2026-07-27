/**
 * The Pricing Calculation Engine — pure, ported from the original platform's pricing engine
 * (rounding, fees, margin, promotion, coupon, and price cores). No I/O; fully deterministic.
 *
 * All money is integer minor units. All rates are basis points (bps): 10_000 bps = 100%.
 */

export const ZERO_FEES = { referralBps: 0, paymentBps: 0, paymentFixed: 0, fixedFee: 0, otherFee: 0 };

/* ------------------------------- rounding ------------------------------- */
/** Psychological / unit rounding on minor units. */
export function applyRounding(price, mode) {
  if (price <= 0) return Math.max(0, price);
  switch (mode) {
    case 'CHARM_99': return Math.max(99, Math.round((price - 99) / 100) * 100 + 99);
    case 'CHARM_95': return Math.max(95, Math.round((price - 95) / 100) * 100 + 95);
    case 'NEAREST_UNIT': return Math.round(price / 100) * 100;
    case 'NEAREST_10': return Math.round(price / 1000) * 1000;
    case 'NONE':
    default: return price;
  }
}

/* --------------------------------- fees --------------------------------- */
/** Marketplace fees on a sale at `price`. */
export function computeFees(price, s = ZERO_FEES) {
  if (price <= 0) return { referral: 0, payment: 0, fixed: 0, total: 0 };
  const referral = Math.round((price * s.referralBps) / 10_000);
  const payment = Math.round((price * s.paymentBps) / 10_000) + s.paymentFixed;
  const fixed = s.fixedFee + s.otherFee;
  return { referral, payment, fixed, total: referral + payment + fixed };
}

export const netProceeds = (price, s = ZERO_FEES) => price - computeFees(price, s).total;

/* -------------------------------- margin -------------------------------- */
/** Margin on revenue: (net - cost) / price, in basis points. */
export function marginBps(price, cost, fees = ZERO_FEES) {
  if (price <= 0) return 0;
  const net = price - computeFees(price, fees).total;
  return Math.round(((net - cost) / price) * 10_000);
}

/**
 * Smallest price achieving a target margin AFTER fees:
 *   net = P*(1 - f) - fixedTotal ;  margin = (net - cost)/P = m
 *   => P*(1 - f - m) = cost + fixedTotal
 * Returns null when infeasible (variable fees + margin >= 100%).
 */
export function priceForTargetMargin(cost, targetBps, fees = ZERO_FEES) {
  const f = (fees.referralBps + fees.paymentBps) / 10_000;
  const m = targetBps / 10_000;
  const fixedTotal = fees.fixedFee + fees.otherFee + fees.paymentFixed;
  const denom = 1 - f - m;
  if (denom <= 0) return null;
  return Math.ceil((cost + fixedTotal) / denom);
}

/* ------------------------------ promotions ------------------------------ */
/** Apply a single promotion to a price. Never below zero. */
export function applyPromotion(price, promo) {
  let out = price;
  switch (promo.type) {
    case 'PERCENT_OFF': out = price - Math.round((price * promo.value) / 10_000); break;
    case 'AMOUNT_OFF': out = price - promo.value; break;
    case 'FIXED_PRICE': out = promo.value; break;
    default: break;
  }
  return Math.max(0, out);
}

/* -------------------------------- coupons ------------------------------- */
/** Validate a coupon against a cart context and compute its discount. */
export function evaluateCoupon(c, ctx) {
  const now = ctx.now ?? new Date();
  const fail = (reason) => ({ valid: false, discount: 0, freeShipping: false, reason });

  if (!c.active) return fail('Coupon is not active.');
  if (c.startsAt && new Date(c.startsAt) > now) return fail('Coupon is not yet valid.');
  if (c.endsAt && new Date(c.endsAt) < now) return fail('Coupon has expired.');
  if (c.maxRedemptions != null && c.redeemedCount >= c.maxRedemptions) return fail('Coupon redemption limit reached.');
  if (c.minSubtotal != null && ctx.subtotal < c.minSubtotal) return fail('Subtotal below coupon minimum.');

  if (c.type === 'FREE_SHIPPING') return { valid: true, discount: 0, freeShipping: true };
  const discount = c.type === 'PERCENT'
    ? Math.round((ctx.subtotal * c.value) / 10_000)
    : Math.min(c.value, ctx.subtotal);
  return { valid: true, discount: Math.max(0, discount), freeShipping: false };
}

/* ---------------------------- the price engine --------------------------- */
function rawFromRule(input, steps, flags) {
  const rule = input.rule;
  const fees = input.fees ?? ZERO_FEES;
  const cost = input.cost ?? null;
  if (!rule) return input.basePrice ?? cost ?? null;

  switch (rule.type) {
    case 'COST_PLUS_MARGIN': {
      if (cost == null || rule.marginBps == null) return input.basePrice ?? cost;
      const p = priceForTargetMargin(cost, rule.marginBps, fees);
      if (p == null) { flags.marginInfeasible = true; steps.push('margin target infeasible -> fallback'); return input.basePrice ?? cost; }
      steps.push(`cost-plus-margin -> ${p}`);
      return p;
    }
    case 'MARKUP_PERCENT': {
      if (cost == null || rule.markupBps == null) return input.basePrice ?? cost;
      const p = Math.round(cost * (1 + rule.markupBps / 10_000));
      steps.push(`markup -> ${p}`);
      return p;
    }
    case 'FIXED_PRICE':
      steps.push(`fixed -> ${rule.fixedPrice ?? 0}`);
      return rule.fixedPrice ?? null;
    case 'COMPETITIVE': {
      const reference = input.basePrice;
      if (reference == null) return cost;
      const p = Math.round(reference * (1 + (rule.competitiveDeltaBps ?? 0) / 10_000));
      steps.push(`competitive(ref ${reference}) -> ${p}`);
      return p;
    }
    case 'MARGIN_FLOOR': {
      let p = input.basePrice ?? cost ?? 0;
      if (cost != null && rule.marginBps != null) {
        const floor = priceForTargetMargin(cost, rule.marginBps, fees);
        if (floor != null && p < floor) { p = floor; steps.push(`raised to margin floor ${floor}`); }
      }
      return p;
    }
    default:
      return input.basePrice ?? cost ?? null;
  }
}

/**
 * Compute a full price quote. Deterministic pipeline:
 *   raw(rule) -> clamp[min,max] -> round -> re-clamp -> listPrice
 *   -> promotion -> finalPrice -> fees + margin on finalPrice.
 * Returns the quote plus `flags` and an audit trail of `steps`.
 */
export function computeQuote(input) {
  const fees = input.fees ?? ZERO_FEES;
  const cost = input.cost ?? null;
  const steps = [];
  const flags = { clampedToMin: false, clampedToMax: false, belowCost: false, marginInfeasible: false };

  // 1) Raw price from the rule strategy.
  let raw = rawFromRule(input, steps, flags);
  if (raw == null) { raw = input.basePrice ?? cost ?? 0; steps.push(`fallback to base/cost ${raw}`); }

  // 2) Guardrails.
  const respect = input.rule?.respectMinMax ?? true;
  if (respect) {
    if (input.minPrice != null && raw < input.minPrice) { raw = input.minPrice; flags.clampedToMin = true; steps.push(`clamp up to min ${raw}`); }
    if (input.maxPrice != null && raw > input.maxPrice) { raw = input.maxPrice; flags.clampedToMax = true; steps.push(`clamp down to max ${raw}`); }
  }

  // 3) Rounding, then a light re-clamp so rounding cannot break guardrails.
  let listPrice = applyRounding(raw, input.rule?.rounding ?? 'NONE');
  if (respect) {
    if (input.minPrice != null && listPrice < input.minPrice) listPrice = input.minPrice;
    if (input.maxPrice != null && listPrice > input.maxPrice) listPrice = input.maxPrice;
  }
  listPrice = Math.max(0, listPrice);
  steps.push(`list price ${listPrice}`);

  // 4) Promotion (sale) — may dip below min/cost; flagged but allowed.
  let finalPrice = listPrice;
  let onSale = false;
  if (input.promotion) {
    finalPrice = applyPromotion(listPrice, input.promotion);
    onSale = finalPrice !== listPrice;
    if (onSale) steps.push(`promotion -> ${finalPrice}`);
  }

  // 5) Fees + margin on the final price.
  const feeBreakdown = computeFees(finalPrice, fees);
  const net = finalPrice - feeBreakdown.total;
  const profit = cost == null ? null : net - cost;
  const mBps = cost == null ? null : marginBps(finalPrice, cost, fees);
  if (cost != null && finalPrice < cost) flags.belowCost = true;

  return { currency: input.currency, listPrice, finalPrice, onSale, cost, fees: feeBreakdown, netProceeds: net, profit, marginBps: mBps, flags, steps };
}
