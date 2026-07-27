/** Customer metrics & RFM segmentation — pure, ported from the original CRM domain core.
 *  All money is integer minor units. */

const isRevenue = (status) => !['CANCELLED'].includes(status);
const ts = (d) => (d ? new Date(d).getTime() : null);

/** Derive LTV / AOV / frequency from a customer's orders. */
export function computeMetrics(orders, now = new Date()) {
  const counted = orders.filter((o) => isRevenue(o.status) && o.placedAt);
  const ordersCount = counted.length;
  const grossRevenue = counted.reduce((s, o) => s + (o.totalMinor ?? 0), 0);
  const refundedAmount = counted.reduce((s, o) => s + (o.refundedMinor ?? 0), 0);
  const netRevenue = grossRevenue - refundedAmount;
  const times = counted.map((o) => ts(o.placedAt)).filter(Boolean).sort((a, b) => a - b);
  const firstOrderAt = times.length ? new Date(times[0]).toISOString() : null;
  const lastOrderAt = times.length ? new Date(times[times.length - 1]).toISOString() : null;
  const spanDays = times.length > 1 ? (times[times.length - 1] - times[0]) / 86_400_000 : 0;
  const orderFrequencyDays = ordersCount > 1 ? Math.round((spanDays / (ordersCount - 1)) * 10) / 10 : null;
  const daysSinceLastOrder = lastOrderAt ? Math.floor((now.getTime() - times[times.length - 1]) / 86_400_000) : null;
  return {
    ordersCount, grossRevenue, netRevenue, refundedAmount,
    ltv: netRevenue,
    averageOrderValue: ordersCount ? Math.round(netRevenue / ordersCount) : 0,
    firstOrderAt, lastOrderAt, orderFrequencyDays, daysSinceLastOrder,
  };
}

/** RFM scoring (1..5) mapped to a lifecycle segment. */
export function rfmSegment(m) {
  const recency = m.daysSinceLastOrder == null ? 1 : m.daysSinceLastOrder <= 30 ? 5 : m.daysSinceLastOrder <= 90 ? 4 : m.daysSinceLastOrder <= 180 ? 3 : m.daysSinceLastOrder <= 365 ? 2 : 1;
  const frequency = m.ordersCount >= 10 ? 5 : m.ordersCount >= 5 ? 4 : m.ordersCount >= 3 ? 3 : m.ordersCount >= 1 ? 2 : 1;
  const monetary = m.ltv >= 100_000 ? 5 : m.ltv >= 50_000 ? 4 : m.ltv >= 20_000 ? 3 : m.ltv > 0 ? 2 : 1;

  let segment;
  if (m.ordersCount === 0) segment = 'PROSPECT';
  else if (monetary >= 4 && frequency >= 4 && recency >= 4) segment = 'VIP';
  else if (recency >= 4) segment = m.ordersCount === 1 ? 'NEW' : 'ACTIVE';
  else if (recency === 3) segment = 'AT_RISK';
  else segment = 'LAPSED';
  return { recency, frequency, monetary, segment };
}
