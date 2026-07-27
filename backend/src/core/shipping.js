/**
 * Shipping domain logic — pure, ported from the original platform's rates, packing,
 * carrier-rules, and tracking cores. No I/O; deterministic and unit-testable.
 *
 * Money is integer minor units. Weight is grams, dimensions millimetres.
 */

/* --------------------------------- rates -------------------------------- */
/** Rank rates by strategy. BEST_VALUE trades price against speed (~$5/day penalty). */
export function rankRates(rates, strategy = 'CHEAPEST') {
  const list = [...rates];
  switch (strategy) {
    case 'FASTEST':
      return list.sort((a, b) => (a.estDeliveryDays ?? 99) - (b.estDeliveryDays ?? 99) || a.amount - b.amount);
    case 'BEST_VALUE':
      return list.sort((a, b) => (a.amount + (a.estDeliveryDays ?? 5) * 500) - (b.amount + (b.estDeliveryDays ?? 5) * 500));
    case 'CHEAPEST':
    default:
      return list.sort((a, b) => a.amount - b.amount || (a.estDeliveryDays ?? 99) - (b.estDeliveryDays ?? 99));
  }
}

/** Pick a single rate for a strategy (null when none available). */
export function pickRate(rates, strategy = 'CHEAPEST') {
  return rankRates(rates, strategy)[0] ?? null;
}

/* -------------------------------- packing -------------------------------- */
/** Dimensional weight in grams: volume in cm3 / divisor (cm3 per kg), default 5000. */
export function dimWeightG(lengthMm, widthMm, heightMm, divisor = 5000) {
  const cm3 = (lengthMm / 10) * (widthMm / 10) * (heightMm / 10);
  return Math.round((cm3 / divisor) * 1000);
}

/** Carriers bill on the greater of actual and dimensional weight. */
export function billableWeightG(actualG, lengthMm, widthMm, heightMm, divisor = 5000) {
  return Math.max(actualG, dimWeightG(lengthMm, widthMm, heightMm, divisor));
}

/** Smallest-volume package whose weight cap fits the total content weight. */
export function selectPackage(items, packages) {
  const contentG = items.reduce((s, i) => s + i.weightG * i.quantity, 0);
  const candidates = packages
    .filter((p) => p.maxWeightG == null || contentG + p.emptyWeightG <= p.maxWeightG)
    .sort((a, b) => a.lengthMm * a.widthMm * a.heightMm - b.lengthMm * b.widthMm * b.heightMm);
  return candidates[0] ?? null;
}

/** Build the billable parcel for a chosen package + items. */
export function buildParcel(pkg, items, divisor = 5000) {
  const contentG = items.reduce((s, i) => s + i.weightG * i.quantity, 0);
  const weightG = billableWeightG(contentG + pkg.emptyWeightG, pkg.lengthMm, pkg.widthMm, pkg.heightMm, divisor);
  return { lengthMm: pkg.lengthMm, widthMm: pkg.widthMm, heightMm: pkg.heightMm, weightG };
}

/* ----------------------------- carrier rules ----------------------------- */
function matches(cond, ctx) {
  const v = ctx[cond.field];
  if (v == null) return false;
  switch (cond.op) {
    case 'eq': return v === cond.value;
    case 'ne': return v !== cond.value;
    case 'gt': return v > cond.value;
    case 'lt': return v < cond.value;
    case 'gte': return v >= cond.value;
    case 'lte': return v <= cond.value;
    case 'in': return Array.isArray(cond.value) && cond.value.includes(v);
    default: return false;
  }
}

/** First active rule (by priority) whose every condition matches wins. */
export function evaluateRules(rules, ctx) {
  const active = rules.filter((r) => r.isActive).sort((a, b) => a.priority - b.priority);
  for (const rule of active) {
    if (rule.conditions.every((c) => matches(c, ctx))) return rule.action;
  }
  return null;
}

/* -------------------------------- tracking ------------------------------- */
/**
 * Map a carrier's raw tracking status to our normalized status.
 *
 * NOTE: order matters. "out for delivery" and "attempted delivery" both contain "deliver"
 * but are NOT terminal, so they must be tested BEFORE the delivered check. (The original
 * implementation checked /deliver/ first and mis-classified them as DELIVERED, which also
 * stopped further tracking polls.)
 */
export function mapTrackingStatus(raw) {
  const s = (raw || '').toLowerCase();
  if (/out for delivery|attempted deliver|delivery attempt|undeliver/.test(s)) {
    return /undeliver/.test(s) ? 'EXCEPTION' : 'IN_TRANSIT';
  }
  if (/deliver/.test(s)) return 'DELIVERED';
  if (/in.?transit|arrived|departed|accepted|picked up/.test(s)) return 'IN_TRANSIT';
  if (/label|manifest|pre.?transit|created|ready/.test(s)) return 'LABEL_PURCHASED';
  if (/return/.test(s)) return 'RETURNED';
  if (/cancel|void/.test(s)) return 'CANCELLED';
  if (/except|fail|delay|held|undeliver/.test(s)) return 'EXCEPTION';
  if (/ship/.test(s)) return 'SHIPPED';
  return 'IN_TRANSIT';
}

/** Terminal states stop further polling. */
export function isTrackingTerminal(status) {
  return status === 'DELIVERED' || status === 'RETURNED' || status === 'CANCELLED';
}
