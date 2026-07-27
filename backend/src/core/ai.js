/**
 * AI domain logic — pure, ported from the original platform's forecast, similarity,
 * price-optimization, token-cost, output-parser, prompt-template, trend, and
 * image-quality cores. No I/O; deterministic.
 *
 * ARCHITECTURAL PRINCIPLE (preserved from the original):
 *   The LLM NARRATES these numbers; it never COMPUTES them. Every recommendation is
 *   derived by the deterministic math below, and the model only explains it in prose.
 *   That keeps the system auditable and immune to hallucinated figures.
 */

/* -------------------------------- forecasting ---------------------------- */
export function movingAverage(series, window) {
  if (!series.length) return 0;
  const w = Math.min(window, series.length);
  return series.slice(-w).reduce((a, b) => a + b, 0) / w;
}

/** Simple exponential smoothing; returns the smoothed level. */
export function exponentialSmoothing(series, alpha = 0.5) {
  if (!series.length) return 0;
  return series.reduce((level, x, i) => (i === 0 ? x : alpha * x + (1 - alpha) * level), series[0]);
}

/** Holt's linear trend method: forecasts `horizon` periods using level + trend. */
export function forecastDemand(series, horizon, alpha = 0.5, beta = 0.3) {
  if (series.length < 2) {
    const v = series[0] ?? 0;
    return Array(horizon).fill(v);
  }
  let level = series[0], trend = series[1] - series[0];
  for (let i = 1; i < series.length; i++) {
    const prev = level;
    level = alpha * series[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prev) + (1 - beta) * trend;
  }
  return Array.from({ length: horizon }, (_, h) => Math.max(0, level + (h + 1) * trend));
}

export function stddev(series) {
  if (series.length < 2) return 0;
  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  return Math.sqrt(series.reduce((a, b) => a + (b - mean) ** 2, 0) / (series.length - 1));
}

/** Safety stock = z · σ(demand) · √leadTime  (z=1.65 ≈ 95% service level). */
export const safetyStock = (demandStd, leadTimeDays, z = 1.65) =>
  Math.ceil(z * demandStd * Math.sqrt(Math.max(0, leadTimeDays)));

export const reorderPoint = (avgDailyDemand, leadTimeDays, safety) =>
  Math.ceil(avgDailyDemand * leadTimeDays + safety);

/** Order quantity given the current position and a target coverage window. */
export function recommendedOrderQty(rop, onHand, onOrder, coverUnits) {
  if (onHand + onOrder > rop) return 0;
  return Math.max(0, Math.ceil(rop + coverUnits - onHand - onOrder));
}

/* -------------------------------- similarity ----------------------------- */
export const tokenize = (s) => (s ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);

/** Jaccard similarity over word sets. */
export function jaccard(a, b) {
  const sa = new Set(tokenize(a)), sb = new Set(tokenize(b));
  if (!sa.size && !sb.size) return 1;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter || 1);
}

export function trigrams(s) {
  const clean = ` ${(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')} `;
  const out = new Set();
  for (let i = 0; i < clean.length - 2; i++) out.add(clean.slice(i, i + 3));
  return out;
}

export function trigramSimilarity(a, b) {
  const ta = trigrams(a), tb = trigrams(b);
  if (!ta.size && !tb.size) return 1;
  let inter = 0;
  for (const g of ta) if (tb.has(g)) inter++;
  return inter / (ta.size + tb.size - inter || 1);
}

/** Deterministic pre-filter: rank candidates before an LLM confirms borderline matches. */
export const bestMatches = (target, candidates, threshold = 0.4) =>
  candidates
    .map((c) => ({ id: c.id, score: +(0.5 * jaccard(target, c.text) + 0.5 * trigramSimilarity(target, c.text)).toFixed(3) }))
    .filter((m) => m.score >= threshold)
    .sort((a, b) => b.score - a.score);

/* ---------------------------- price optimization ------------------------- */
export const marginPct = (priceMinor, costMinor) => (priceMinor <= 0 ? 0 : ((priceMinor - costMinor) / priceMinor) * 100);

/** The price yielding a target margin over cost. */
export function priceFromMargin(costMinor, targetMarginPct) {
  const m = Math.min(99.9, Math.max(0, targetMarginPct)) / 100;
  return Math.round(costMinor / (1 - m));
}

/** How far a single suggestion may move the current price (guards against wild swings). */
export const MAX_PRICE_MOVE_PCT = 25;

/**
 * Constant-elasticity price suggestion. For elastic demand (e < -1), the revenue-optimal
 * markup over cost is 1 / (1 + 1/e).
 *
 * TWO GUARDRAILS the original lacked:
 *   1. The markup formula has a POLE at e = -1: as elasticity approaches unit-elastic from
 *      below, markup -> infinity (at e = -1.05 it is 21x cost). We clamp elasticity away
 *      from the pole so the suggestion stays finite and sane.
 *   2. Any suggestion is capped to +/- MAX_PRICE_MOVE_PCT of the current price, then the
 *      margin FLOOR is applied as a hard lower clamp. The LLM explains the recommendation
 *      but can never push a price below the floor or make a violent jump.
 */
export function suggestPrice({ currentMinor, costMinor, elasticity, floorMarginPct, maxMovePct = MAX_PRICE_MOVE_PCT }) {
  const floor = priceFromMargin(costMinor, floorMarginPct);

  let target = currentMinor;
  if (elasticity < -1) {
    // Stay clear of the pole at e = -1; -1.2 keeps markup at a finite 6x worst case.
    const e = Math.min(elasticity, -1.2);
    target = Math.round(costMinor * (1 / (1 + 1 / e)));
  } else if (elasticity >= -1 && elasticity < 0) {
    target = Math.round(currentMinor * 1.05);   // inelastic: modest raise
  }

  // Cap the move relative to today's price.
  const upper = Math.round(currentMinor * (1 + maxMovePct / 100));
  const lower = Math.round(currentMinor * (1 - maxMovePct / 100));
  const capped = Math.min(upper, Math.max(lower, target));
  const moveCapped = capped !== target;

  // The floor wins over everything.
  const suggested = Math.max(floor, capped);

  return {
    suggestedMinor: suggested,
    rationale: suggested > currentMinor ? 'raise' : suggested < currentMinor ? 'lower' : 'hold',
    marginPct: +marginPct(suggested, costMinor).toFixed(2),
    floorApplied: suggested === floor && capped < floor,
    moveCapped,
  };
}

/* ------------------------------ tokens & cost ---------------------------- */
/** Rough estimate (~4 chars/token) for pre-flight limits and the echo provider. */
export const estimateTokens = (text) => Math.ceil((text?.length ?? 0) / 4);

/** Cost in integer minor units from usage and a per-million-token price table. */
export function computeCostMinor(usage, price) {
  const input = (usage.promptTokens / 1_000_000) * price.inputPerMTokMinor;
  const output = (usage.completionTokens / 1_000_000) * price.outputPerMTokMinor;
  return Math.round(input + output);
}

export const sumUsage = (rows) =>
  rows.reduce((a, r) => ({
    promptTokens: a.promptTokens + r.promptTokens,
    completionTokens: a.completionTokens + r.completionTokens,
    costMinor: a.costMinor + r.costMinor,
  }), { promptTokens: 0, completionTokens: 0, costMinor: 0 });

/* ------------------------------ output parsing --------------------------- */
/** Extract JSON from a response that may be fenced or wrapped in prose. Never throws. */
export function parseJson(text) {
  if (!text) return null;
  const s = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const first = s.search(/[[{]/);
  if (first === -1) return null;
  const open = s[first], close = open === '{' ? '}' : ']';
  let depth = 0, end = -1;
  for (let i = first; i < s.length; i++) {
    if (s[i] === open) depth++;
    else if (s[i] === close && --depth === 0) { end = i; break; }
  }
  if (end === -1) return null;
  try { return JSON.parse(s.slice(first, end + 1)); } catch { return null; }
}

/** Split a response into clean, de-duplicated list items. */
export function parseList(text) {
  const json = parseJson(text);
  if (Array.isArray(json)) return [...new Set(json.map((x) => String(x).trim()).filter(Boolean))];
  return [...new Set(String(text).split(/\r?\n|,/).map((l) => l.replace(/^[\s\-*\d.)]+/, '').trim()).filter(Boolean))];
}

/* ----------------------------- prompt templates -------------------------- */
/** Interpolate {{var}} / {{dotted.path}}; collect missing keys rather than failing silently. */
export function interpolate(template, vars) {
  const missing = [];
  const text = String(template).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path) => {
    const val = path.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), vars);
    if (val == null) { missing.push(path); return ''; }
    return typeof val === 'object' ? JSON.stringify(val) : String(val);
  });
  return { text, missing };
}

export function renderMessages(tpl, vars) {
  const sys = interpolate(tpl.systemPrompt ?? '', vars);
  const usr = interpolate(tpl.userTemplate ?? '', vars);
  return { system: sys.text, user: usr.text, missing: [...new Set([...sys.missing, ...usr.missing])] };
}

/* ---------------------------------- trend -------------------------------- */
/** Least-squares slope of a series (units per period). */
export function linearSlope(series) {
  const n = series.length;
  if (n < 2) return 0;
  const xMean = (n - 1) / 2;
  const yMean = series.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (i - xMean) * (series[i] - yMean); den += (i - xMean) ** 2; }
  return den === 0 ? 0 : num / den;
}

/** Classify a trend with a dead-band so noise isn't reported as movement. */
export function classifyTrend(series, deadBandPct = 5) {
  const slope = linearSlope(series);
  const mean = series.reduce((a, b) => a + b, 0) / (series.length || 1);
  const pctPerPeriod = mean === 0 ? 0 : (slope / mean) * 100;
  const direction = Math.abs(pctPerPeriod) < deadBandPct ? 'flat' : pctPerPeriod > 0 ? 'rising' : 'falling';
  return { slope: +slope.toFixed(3), pctPerPeriod: +pctPerPeriod.toFixed(2), direction };
}

export function median(series) {
  if (!series.length) return 0;
  const s = [...series].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Robust anomaly detection using the median and MAD (median absolute deviation).
 *
 * The original used mean/stddev, which suffers from MASKING: a single large outlier
 * inflates sigma so much that its own z-score falls under the threshold. On [10,10,10,50,10]
 * the mean/sd method returns NO anomalies. MAD is resistant — the median barely moves —
 * so the outlier is caught. (0.6745 rescales MAD to be comparable to a standard deviation.)
 */
export function detectAnomalies(series, z = 3) {
  if (series.length < 3) return [];
  const med = median(series);
  const mad = median(series.map((v) => Math.abs(v - med)));
  if (mad === 0) {
    // Degenerate spread (e.g. [10,10,10,50,10] has MAD 0): every point equals the median
    // except the outliers, so flag anything that differs. `z` is reported as a large finite
    // number rather than Infinity, which would serialize to null over JSON.
    return series.map((v, i) => ({ index: i, value: v, z: v === med ? 0 : 999 }))
      .filter((p) => p.z !== 0);
  }
  return series
    .map((v, i) => ({ index: i, value: v, z: +(0.6745 * (v - med) / mad).toFixed(2) }))
    .filter((p) => Math.abs(p.z) >= z);
}

/* ------------------------------ image quality ---------------------------- */
/** Score listing-image quality against marketplace requirements. */
export function scoreImage({ widthPx, heightPx, sizeBytes, format }) {
  const issues = [];
  if (widthPx < 1000 || heightPx < 1000) issues.push('below the 1000px minimum for zoom');
  if (Math.abs(widthPx / heightPx - 1) > 0.15) issues.push('not close to square (1:1 preferred)');
  if (sizeBytes > 10_000_000) issues.push('file exceeds 10MB');
  if (!['jpeg', 'jpg', 'png', 'webp'].includes(String(format).toLowerCase())) issues.push(`unsupported format: ${format}`);
  const score = Math.max(0, 100 - issues.length * 25);
  return { score, issues, passes: issues.length === 0 };
}
