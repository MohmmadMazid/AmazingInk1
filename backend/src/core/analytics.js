/**
 * Analytics domain logic — pure, ported from the original platform's date-range, timeseries,
 * distribution, kpi, and pnl cores. No I/O; deterministic and unit-testable.
 *
 * All money is integer minor units.
 */

const DAY = 86_400_000;
const iso = (d) => d.toISOString().slice(0, 10);

/* ------------------------------ date ranges ------------------------------ */
/** Resolve a preset or explicit range to inclusive ISO dates. */
export function resolveRange(input = {}, now = new Date()) {
  if (input.from && input.to) return { from: input.from.slice(0, 10), to: input.to.slice(0, 10) };
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(today);
  switch (input.preset) {
    case 'today': break;
    case 'yesterday': start.setUTCDate(start.getUTCDate() - 1); return { from: iso(start), to: iso(start) };
    case 'last_7_days': start.setUTCDate(start.getUTCDate() - 6); break;
    case 'last_30_days': start.setUTCDate(start.getUTCDate() - 29); break;
    case 'last_90_days': start.setUTCDate(start.getUTCDate() - 89); break;
    case 'this_month': start.setUTCDate(1); break;
    case 'this_year': return { from: iso(new Date(Date.UTC(today.getUTCFullYear(), 0, 1))), to: iso(today) };
    case 'last_12_months': start.setUTCMonth(start.getUTCMonth() - 12); break;
    default: start.setUTCDate(start.getUTCDate() - 29);
  }
  return { from: iso(start), to: iso(today) };
}

export const rangeDays = (r) => Math.round((Date.parse(r.to) - Date.parse(r.from)) / DAY) + 1;

/** The comparison window: the immediately-preceding period, or the same window last year. */
export function comparisonRange(r, mode = 'previous') {
  if (mode === 'year_over_year') {
    const shift = (s) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCFullYear(d.getUTCFullYear() - 1); return iso(d); };
    return { from: shift(r.from), to: shift(r.to) };
  }
  const days = rangeDays(r);
  const to = new Date(Date.parse(r.from) - DAY);
  const from = new Date(to.getTime() - (days - 1) * DAY);
  return { from: iso(from), to: iso(to) };
}

/* ------------------------------- timeseries ------------------------------ */
/** Truncate an ISO date to the start of its grain bucket. */
export function bucketKey(isoDate, grain) {
  const d = new Date(isoDate + (isoDate.length <= 10 ? 'T00:00:00Z' : ''));
  const y = d.getUTCFullYear();
  switch (grain) {
    case 'YEAR': return `${y}-01-01`;
    case 'QUARTER': { const q = Math.floor(d.getUTCMonth() / 3) * 3; return `${y}-${String(q + 1).padStart(2, '0')}-01`; }
    case 'MONTH': return `${y}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
    case 'WEEK': { const day = d.getUTCDay(); const monday = new Date(d); monday.setUTCDate(d.getUTCDate() - ((day + 6) % 7)); return iso(monday); }
    default: return iso(d);
  }
}

/** Bucket dated values by grain and fill empty buckets with zero across the whole range. */
export function buildSeries(values, grain, range) {
  const sums = new Map();
  for (const v of values) {
    const k = bucketKey(v.date, grain);
    sums.set(k, (sums.get(k) ?? 0) + v.value);
  }
  const out = [];
  const seen = new Set();
  const cursor = new Date(range.from + 'T00:00:00Z');
  const end = new Date(range.to + 'T00:00:00Z');
  while (cursor <= end) {
    const k = bucketKey(iso(cursor), grain);
    if (!seen.has(k)) { seen.add(k); out.push({ date: k, value: sums.get(k) ?? 0 }); }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/** Align a comparison series onto the primary series positionally. */
export const attachComparison = (primary, compare) =>
  primary.map((p, i) => ({ ...p, compare: compare[i]?.value ?? 0 }));

/** Percentage growth. Returns null from a zero base — "n/a" rather than a fake infinity. */
export function growthPct(current, previous) {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/* ------------------------------ distributions ---------------------------- */
/** Rank slices, keep top-N, fold the remainder into "Other", add share %. */
export function topN(slices, n = 10) {
  const sorted = [...slices].sort((a, b) => b.value - a.value);
  const total = sorted.reduce((s, x) => s + x.value, 0) || 1;
  const head = sorted.slice(0, n);
  const tail = sorted.slice(n);
  const withShare = head.map((s) => ({ ...s, sharePct: Math.round((s.value / total) * 1000) / 10 }));
  if (tail.length) {
    const rest = tail.reduce((s, x) => s + x.value, 0);
    withShare.push({ key: '__other__', label: `Other (${tail.length})`, value: rest, sharePct: Math.round((rest / total) * 1000) / 10 });
  }
  return withShare;
}

/** Cumulative share for a Pareto (80/20) view. */
export function pareto(slices) {
  const sorted = [...slices].sort((a, b) => b.value - a.value);
  const total = sorted.reduce((s, x) => s + x.value, 0) || 1;
  let acc = 0;
  return sorted.map((s) => { acc += s.value; return { ...s, cumulativePct: Math.round((acc / total) * 1000) / 10 }; });
}

/* ---------------------------------- KPIs --------------------------------- */
/** Build a KPI with an optional comparison delta. */
export function kpi(key, label, value, unit, previous) {
  const out = { key, label, value, unit };
  if (previous !== undefined) { out.delta = value - previous; out.deltaPct = growthPct(value, previous); }
  return out;
}

/** The standard sales KPI set, optionally compared to a prior period. */
export function salesKpis(cur, prev) {
  const aov = (t) => (t.orders ? Math.round(t.netRevenue / t.orders) : 0);
  const upo = (t) => (t.orders ? Math.round((t.units / t.orders) * 100) / 100 : 0);
  return [
    kpi('netRevenue', 'Net revenue', cur.netRevenue, 'money', prev?.netRevenue),
    kpi('orders', 'Orders', cur.orders, 'count', prev?.orders),
    kpi('aov', 'Avg order value', aov(cur), 'money', prev ? aov(prev) : undefined),
    kpi('units', 'Units sold', cur.units, 'count', prev?.units),
    kpi('unitsPerOrder', 'Units / order', upo(cur), 'count', prev ? upo(prev) : undefined),
    kpi('refunds', 'Refunds', cur.refunds, 'money', prev?.refunds),
  ];
}

/* ---------------------------------- P&L ---------------------------------- */
/**
 * Build a P&L statement from money totals.
 *   net revenue      = gross - discounts - refunds
 *   gross profit     = net revenue - COGS
 *   operating profit = gross profit + shipping margin - fees
 */
export function buildPnl(i) {
  const netRevenue = i.grossRevenue - i.discounts - i.refunds;
  const grossProfit = netRevenue - i.cogs;
  const shippingMargin = (i.shippingRevenue ?? 0) - (i.shippingCost ?? 0);
  const operatingProfit = grossProfit + shippingMargin - (i.fees ?? 0);

  const lines = [
    { key: 'grossRevenue', label: 'Gross revenue', amount: i.grossRevenue, kind: 'revenue' },
    { key: 'discounts', label: 'Discounts', amount: -i.discounts, kind: 'cost' },
    { key: 'refunds', label: 'Refunds', amount: -i.refunds, kind: 'cost' },
    { key: 'netRevenue', label: 'Net revenue', amount: netRevenue, kind: 'subtotal' },
    { key: 'cogs', label: 'Cost of goods sold', amount: -i.cogs, kind: 'cost' },
    { key: 'grossProfit', label: 'Gross profit', amount: grossProfit, kind: 'subtotal' },
    { key: 'shippingMargin', label: 'Shipping margin', amount: shippingMargin, kind: 'revenue' },
    { key: 'fees', label: 'Fees', amount: -(i.fees ?? 0), kind: 'cost' },
    { key: 'operatingProfit', label: 'Operating profit', amount: operatingProfit, kind: 'total' },
  ];
  return {
    lines,
    grossMarginPct: netRevenue ? Math.round((grossProfit / netRevenue) * 1000) / 10 : 0,
    netMarginPct: netRevenue ? Math.round((operatingProfit / netRevenue) * 1000) / 10 : 0,
  };
}

/* ------------------------------- CSV export ------------------------------ */
/** Serialize rows to CSV, quoting fields that need it. */
export function toCsv(rows, columns) {
  if (!rows.length) return '';
  const cols = columns ?? Object.keys(rows[0]);
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}
