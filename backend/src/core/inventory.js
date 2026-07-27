/**
 * Inventory domain logic — pure, ported from the original platform's inventory util,
 * movement service, and forecast service. No I/O; fully unit-testable.
 *
 * Core invariant: `available` and `sellable` are ALWAYS derived, never stored.
 */

/** Physically available (on-hand minus what's committed to orders). */
export const available = (s) => s.onHand - s.reserved;

/** Sellable to customers: available minus the held-back buffer, floored at 0. */
export const sellable = (s) => Math.max(0, s.onHand - s.reserved - (s.bufferQuantity ?? 0));

/** Classify a stock position. */
export function stockStatus(avail, lowThreshold, overstockThreshold = null) {
  if (avail <= 0) return 'out';
  if (overstockThreshold != null && avail >= overstockThreshold) return 'overstock';
  if (avail <= lowThreshold) return 'low';
  return 'in_stock';
}

/** Validate a signed change to on-hand. Returns the new value or throws. */
export function applyOnHandDelta(row, delta) {
  const newOnHand = row.onHand + delta;
  if (newOnHand < 0) throw new Error(`Insufficient stock: on-hand ${row.onHand}, requested change ${delta}.`);
  if (newOnHand < row.reserved) throw new Error(`Cannot reduce on-hand below reserved (${row.reserved}).`);
  return newOnHand;
}

/**
 * Validate a signed change to reserved — this is the no-overselling guarantee.
 * Reserved may never go negative, nor exceed on-hand.
 */
export function applyReservedDelta(row, delta) {
  const newReserved = row.reserved + delta;
  if (newReserved < 0) throw new Error('Reserved cannot go negative.');
  if (delta > 0 && newReserved > row.onHand) {
    throw new Error(`Cannot reserve ${delta}: only ${row.onHand - row.reserved} available.`);
  }
  return newReserved;
}

/**
 * Demand forecast: average daily demand over a window, days of cover, projected stockout,
 * and a reorder quantity that covers lead-time demand plus safety stock.
 */
export function forecast({ demandUnits, windowDays, avail, leadTimeDays = 7, safetyStock = 0 }, now = new Date()) {
  const avgDailyDemand = windowDays > 0 ? demandUnits / windowDays : 0;
  const daysOfCover = avgDailyDemand > 0 ? avail / avgDailyDemand : null;
  const projectedStockoutAt = daysOfCover != null ? new Date(now.getTime() + daysOfCover * 86_400_000) : null;
  const leadTimeDemand = avgDailyDemand * leadTimeDays;
  const recommendedReorderQty = Math.max(0, Math.ceil(leadTimeDemand + safetyStock - avail));
  const forecastDemand = Math.ceil(avgDailyDemand * (leadTimeDays + windowDays));
  return {
    windowDays,
    avgDailyDemand: Math.round(avgDailyDemand * 100) / 100,
    forecastDemand,
    daysOfCover: daysOfCover != null ? Math.round(daysOfCover * 10) / 10 : null,
    projectedStockoutAt,
    recommendedReorderQty,
  };
}
