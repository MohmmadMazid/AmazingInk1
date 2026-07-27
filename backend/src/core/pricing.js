/** Pure pricing logic — no I/O, unit-testable. Mirrors the "pure core" pattern from the original
 *  platform. All amounts are integer minor units. */

export function applyDiscount(amountMinor, percentOff) {
  if (amountMinor < 0) throw new Error('amount must be non-negative');
  const clamped = Math.max(0, Math.min(100, percentOff));
  return Math.round(amountMinor * (1 - clamped / 100));
}

/** Compute order totals from lines. Tax is a flat rate here; swap for a tax service later. */
export function computeOrderTotals(lines, taxRate = 0.08) {
  const subtotalMinor = lines.reduce((sum, l) => sum + l.unitPriceMinor * l.quantity, 0);
  const taxMinor = Math.round(subtotalMinor * taxRate);
  return { subtotalMinor, taxMinor, totalMinor: subtotalMinor + taxMinor };
}
