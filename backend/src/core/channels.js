/**
 * Channel connection & per-channel pricing logic — pure, deterministic, no I/O.
 *
 * THE CENTRAL IDEA: you set a TARGET MARGIN per channel, not a markup. Each channel
 * charges different fees (eBay ~12.9% + $0.30; your own website ~2.9% + $0.30), so the
 * same 30% margin requires a DIFFERENT list price on each. We solve for that price with
 * `priceForTargetMargin`, which inverts the fee structure:
 *
 *     margin = (price - fees(price) - cost) / price
 *  => price  = (cost + fixedFees) / (1 - variableFeeRate - targetMargin)
 *
 * A margin FLOOR is a hard clamp: no rounding or promotion can push a channel price below it.
 */
import { applyRounding, computeFees, marginBps, priceForTargetMargin } from './pricing-engine.js';

/* --------------------------- platform presets ---------------------------- */
/**
 * Real-world default fee schedules, in basis points and minor units.
 * These are starting points — every connection can override them.
 */
export const PLATFORM_PRESETS = {
  EBAY: {
    label: 'eBay',
    kind: 'MARKETPLACE',
    // eBay final value fee ~12.9% + $0.30 per order for most categories.
    fees: { referralBps: 1290, paymentBps: 0, paymentFixed: 30, fixedFee: 0, otherFee: 0 },
    credentialFields: ['clientId', 'clientSecret', 'refreshToken', 'siteId'],
    supportsPricePush: true,
    supportsQuantityPush: true,
  },
  AMAZON: {
    label: 'Amazon',
    kind: 'MARKETPLACE',
    fees: { referralBps: 1500, paymentBps: 0, paymentFixed: 0, fixedFee: 0, otherFee: 0 },
    credentialFields: ['sellerId', 'refreshToken', 'marketplaceId'],
    supportsPricePush: true,
    supportsQuantityPush: true,
  },
  SHOPIFY: {
    label: 'Shopify (brand website)',
    kind: 'OWNED_STORE',
    // Your own store: only the payment processor takes a cut.
    fees: { referralBps: 0, paymentBps: 290, paymentFixed: 30, fixedFee: 0, otherFee: 0 },
    credentialFields: ['shopDomain', 'accessToken'],
    supportsPricePush: true,
    supportsQuantityPush: true,
  },
  WOOCOMMERCE: {
    label: 'WooCommerce (brand website)',
    kind: 'OWNED_STORE',
    fees: { referralBps: 0, paymentBps: 290, paymentFixed: 30, fixedFee: 0, otherFee: 0 },
    credentialFields: ['storeUrl', 'consumerKey', 'consumerSecret'],
    supportsPricePush: true,
    supportsQuantityPush: true,
  },
  CUSTOM_WEBSITE: {
    label: 'Custom website (webhook)',
    kind: 'OWNED_STORE',
    fees: { referralBps: 0, paymentBps: 290, paymentFixed: 30, fixedFee: 0, otherFee: 0 },
    credentialFields: ['endpointUrl', 'apiKey'],
    supportsPricePush: true,
    supportsQuantityPush: true,
  },
};

export const platformNames = () => Object.keys(PLATFORM_PRESETS);
export const presetFor = (platform) => PLATFORM_PRESETS[String(platform).toUpperCase()] ?? null;

/* ------------------------------ credentials ------------------------------ */
/** Which credential fields a platform requires. Missing ones are reported, not guessed. */
export function missingCredentials(platform, credentials = {}) {
  const preset = presetFor(platform);
  if (!preset) return ['unknown platform'];
  return preset.credentialFields.filter((f) => !credentials[f] || String(credentials[f]).trim() === '');
}

/** Never render a secret. Show enough to identify it, nothing more. */
export function maskCredentials(platform, credentials = {}) {
  const preset = presetFor(platform);
  const out = {};
  for (const f of preset?.credentialFields ?? Object.keys(credentials)) {
    const v = credentials[f];
    if (v == null || v === '') { out[f] = null; continue; }
    const s = String(v);
    // Non-secret identifiers stay readable; anything token-ish gets masked.
    const isSecret = /secret|token|key|password/i.test(f);
    out[f] = isSecret ? `${s.slice(0, 4)}${'•'.repeat(8)}${s.slice(-2)}` : s;
  }
  return out;
}

/* ---------------------------- channel pricing ---------------------------- */
/**
 * Compute the price to publish on one channel.
 *
 * Pipeline: landed cost -> solve for target margin AFTER that channel's fees
 *           -> apply rounding -> clamp to the margin floor -> clamp to min/max.
 *
 * `floorApplied` tells you the target was unreachable and the floor took over — the
 * caller can surface that rather than silently publishing an unprofitable price.
 */
export function computeChannelPrice({ costMinor, profile, basePriceMinor }) {
  const fees = profile.fees;
  // Landed cost = product cost + per-unit handling + shipping you absorb.
  const landedCost = costMinor + (profile.handlingFeeMinor ?? 0) + (profile.shippingCostMinor ?? 0);

  const steps = [];
  let target;

  switch (profile.priceMode) {
    case 'MARGIN': {
      target = priceForTargetMargin(landedCost, profile.targetMarginBps, fees);
      if (target == null) {
        steps.push(`target margin ${profile.targetMarginBps / 100}% infeasible with these fees`);
        target = basePriceMinor ?? landedCost;
      } else {
        steps.push(`solve ${profile.targetMarginBps / 100}% margin after fees -> ${target}`);
      }
      break;
    }
    case 'MARKUP':
      target = Math.round(landedCost * (1 + profile.markupBps / 10_000));
      steps.push(`markup ${profile.markupBps / 100}% on landed cost -> ${target}`);
      break;
    case 'FIXED':
      target = profile.fixedPriceMinor ?? basePriceMinor ?? landedCost;
      steps.push(`fixed price -> ${target}`);
      break;
    case 'PASSTHROUGH':
    default:
      target = basePriceMinor ?? landedCost;
      steps.push(`passthrough base price -> ${target}`);
  }

  // Rounding (charm pricing etc.) may nudge the price down — re-clamp after.
  let price = applyRounding(target, profile.rounding ?? 'NONE');
  if (price !== target) steps.push(`rounding ${profile.rounding} -> ${price}`);

  // The margin FLOOR is a hard clamp. Nothing crosses it.
  const floor = priceForTargetMargin(landedCost, profile.floorMarginBps ?? 0, fees);
  let floorApplied = false;
  if (floor != null && price < floor) {
    price = floor;
    floorApplied = true;
    steps.push(`raised to ${(profile.floorMarginBps ?? 0) / 100}% margin floor -> ${floor}`);
  }

  // Optional absolute guardrails.
  if (profile.minPriceMinor != null && price < profile.minPriceMinor) { price = profile.minPriceMinor; steps.push(`clamped to min ${price}`); }
  if (profile.maxPriceMinor != null && price > profile.maxPriceMinor) { price = profile.maxPriceMinor; steps.push(`clamped to max ${price}`); }

  price = Math.max(0, price);
  return { priceMinor: price, landedCost, floorApplied, steps };
}

/** The full economics of one channel price: fees, net proceeds, profit, realized margin. */
export function marginBreakdown({ priceMinor, costMinor, profile }) {
  const landedCost = costMinor + (profile.handlingFeeMinor ?? 0) + (profile.shippingCostMinor ?? 0);
  const feeBreakdown = computeFees(priceMinor, profile.fees);
  const netProceeds = priceMinor - feeBreakdown.total;
  const profit = netProceeds - landedCost;
  return {
    priceMinor,
    costMinor,
    landedCost,
    fees: feeBreakdown,
    netProceeds,
    profit,
    marginBps: marginBps(priceMinor, landedCost, profile.fees),
    profitable: profit > 0,
  };
}

/**
 * Build the price matrix for one product across every channel profile.
 * This is what the admin sees: one cost, N channels, N prices, N margins.
 */
export function buildPriceMatrix({ costMinor, basePriceMinor, profiles }) {
  return profiles.map((p) => {
    const { priceMinor, landedCost, floorApplied, steps } = computeChannelPrice({ costMinor, profile: p, basePriceMinor });
    const economics = marginBreakdown({ priceMinor, costMinor, profile: p });
    return {
      connectionId: p.connectionId,
      channel: p.channelLabel,
      platform: p.platform,
      priceMode: p.priceMode,
      targetMarginBps: p.targetMarginBps,
      priceMinor,
      landedCost,
      floorApplied,
      steps,
      ...economics,
    };
  });
}

/* ------------------------- propagation decisions ------------------------- */
/**
 * Delta gate for price: only push when the computed price actually differs from what we
 * last pushed. `tolerance` lets you ignore sub-cent churn from rounding.
 */
export function shouldPushPrice(computedMinor, lastPushedMinor, toleranceMinor = 0) {
  if (lastPushedMinor == null) return true;
  return Math.abs(computedMinor - lastPushedMinor) > toleranceMinor;
}

/** Summarize a propagation run for the UI / audit trail. */
export function summarizePropagation(results) {
  return {
    total: results.length,
    pushed: results.filter((r) => r.action === 'enqueued').length,
    unchanged: results.filter((r) => r.action === 'no_change').length,
    blocked: results.filter((r) => r.action === 'blocked').length,
    failed: results.filter((r) => r.action === 'error').length,
  };
}

/* ------------------------------ connection health ------------------------ */
export function connectionHealth({ status, lastSyncAt, lastError, consecutiveFailures = 0 }) {
  if (status === 'DISCONNECTED') return 'DISCONNECTED';
  if (status === 'ERROR' || consecutiveFailures >= 3) return 'ERROR';
  if (lastError || consecutiveFailures > 0) return 'DEGRADED';
  const staleHours = lastSyncAt ? (Date.now() - new Date(lastSyncAt).getTime()) / 3_600_000 : Infinity;
  if (staleHours > 24) return 'STALE';
  return 'HEALTHY';
}
