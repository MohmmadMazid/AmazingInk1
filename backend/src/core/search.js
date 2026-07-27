/**
 * Search domain logic — pure, ported from the original platform's analyzer, fuzzy, barcode,
 * scoring, facet, filter, and highlight cores. No I/O; deterministic and unit-testable.
 */

/* -------------------------------- analyzer ------------------------------- */
const DIACRITICS = /[\u0300-\u036f]/g;

/** Normalize: strip diacritics, lowercase, trim. ("Café" -> "cafe") */
export const normalize = (s) => (s ?? '').normalize('NFKD').replace(DIACRITICS, '').toLowerCase().trim();

export const tokenize = (s) => normalize(s).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);

/** Edge n-grams of a token ("shoe" -> sh, sho, shoe) for prefix/autocomplete indexing. */
export function edgeNgrams(token, min = 2, max = 20) {
  const out = [];
  for (let n = min; n <= Math.min(max, token.length); n++) out.push(token.slice(0, n));
  return out;
}

/** Expand tokens through synonym groups. */
export function expandSynonyms(tokens, groups) {
  const out = new Set(tokens);
  for (const t of tokens) for (const g of groups) if (g.includes(t)) g.forEach((x) => out.add(x));
  return [...out];
}

/* --------------------------------- fuzzy --------------------------------- */
export function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

/** Damerau variant — adjacent transpositions ("teh"/"the") count as ONE edit. */
export function damerauLevenshtein(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

/** Elasticsearch "AUTO" fuzziness: 0 edits under 3 chars, 1 for 3-5, 2 beyond. */
export const fuzzinessFor = (term) => (term.length < 3 ? 0 : term.length <= 5 ? 1 : 2);

export function isFuzzyMatch(term, candidate, maxEdits = fuzzinessFor(term)) {
  if (maxEdits === 0) return term === candidate;
  if (Math.abs(term.length - candidate.length) > maxEdits) return false;
  return damerauLevenshtein(term, candidate) <= maxEdits;
}

export const rankByDistance = (term, candidates) =>
  candidates.map((c) => ({ term: c, distance: damerauLevenshtein(term, c) })).sort((a, b) => a.distance - b.distance);

/* -------------------------------- barcodes ------------------------------- */
export const normalizeBarcode = (code) => (code ?? '').replace(/[\s-]/g, '');

export function looksLikeBarcode(q) {
  const c = normalizeBarcode(q);
  return /^\d+$/.test(c) && [8, 12, 13, 14].includes(c.length);
}

/** GTIN mod-10 check digit (EAN-8/13, UPC-A, GTIN-14). */
function gtinChecksumValid(code) {
  const digits = code.split('').map(Number);
  const check = digits.pop();
  let sum = 0;
  for (let i = digits.length - 1, pos = 0; i >= 0; i--, pos++) sum += digits[i] * (pos % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === check;
}

export function detectBarcodeType(code) {
  const c = normalizeBarcode(code);
  if (!/^\d+$/.test(c)) return 'UNKNOWN';
  return { 8: 'EAN8', 12: 'UPCA', 13: 'EAN13', 14: 'GTIN14' }[c.length] ?? 'UNKNOWN';
}

export function validateBarcode(code) {
  const c = normalizeBarcode(code);
  return looksLikeBarcode(c) && gtinChecksumValid(c);
}

/* -------------------------------- scoring -------------------------------- */
/**
 * Field-weighted relevance. Exact term hits score 1.0, prefix hits 0.6, fuzzy hits 0.4,
 * each multiplied by the field's weight — so a title match outranks a description match.
 */
export function scoreDoc(queryTerms, doc, fields, fuzzy = false) {
  if (!queryTerms.length) return 0;
  let score = 0;
  for (const { field, weight } of fields) {
    const raw = doc[field];
    if (raw == null) continue;
    const docTerms = tokenize(String(raw));
    if (!docTerms.length) continue;
    for (const qt of queryTerms) {
      let hit = 0;
      for (const dt of docTerms) {
        if (dt === qt) hit = Math.max(hit, 1);
        else if (dt.startsWith(qt) && qt.length >= 2) hit = Math.max(hit, 0.6);
        else if (fuzzy && isFuzzyMatch(qt, dt)) hit = Math.max(hit, 0.4);
      }
      score += hit * weight;
    }
  }
  return score;
}

/* --------------------------------- facets -------------------------------- */
/** Aggregate facet counts over a result set. */
export function computeFacets(docs, facetFields, maxBuckets = 20) {
  const out = {};
  for (const field of facetFields) {
    const counts = new Map();
    for (const doc of docs) {
      const raw = doc[field];
      if (raw == null) continue;
      for (const val of Array.isArray(raw) ? raw : [raw]) {
        const key = String(val);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    out[field] = [...counts.entries()].map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count).slice(0, maxBuckets);
  }
  return out;
}

/* --------------------------------- filters ------------------------------- */
/** Apply structured filters (eq / in / range) to a doc. */
export function matchesFilters(doc, filters = {}) {
  for (const [field, cond] of Object.entries(filters)) {
    const val = doc[field];
    if (cond == null) continue;
    if (typeof cond === 'object' && !Array.isArray(cond)) {
      if (cond.gte != null && !(val >= cond.gte)) return false;
      if (cond.lte != null && !(val <= cond.lte)) return false;
      if (cond.gt != null && !(val > cond.gt)) return false;
      if (cond.lt != null && !(val < cond.lt)) return false;
    } else if (Array.isArray(cond)) {
      if (!cond.includes(val)) return false;
    } else if (val !== cond) return false;
  }
  return true;
}

/* ------------------------------- highlighting ---------------------------- */
/** Wrap matched terms in marker tags. */
export function highlight(text, terms, pre = '<mark>', post = '</mark>') {
  if (!text || !terms.length) return text ?? '';
  const escaped = terms.filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length);
  if (!escaped.length) return text;
  return text.replace(new RegExp(`(${escaped.join('|')})`, 'gi'), `${pre}$1${post}`);
}

/** A short excerpt centered on the first matched term. */
export function snippet(text, terms, radius = 60) {
  if (!text) return '';
  const norm = normalize(text);
  let idx = -1;
  for (const t of terms) {
    const i = norm.indexOf(normalize(t));
    if (i >= 0 && (idx < 0 || i < idx)) idx = i;
  }
  if (idx < 0) return text.slice(0, radius * 2);
  const start = Math.max(0, idx - radius), end = Math.min(text.length, idx + radius);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

/* ------------------------------- suggestions ----------------------------- */
/** "Did you mean" — closest indexed term within the AUTO fuzziness budget. */
export function didYouMean(term, vocabulary) {
  const budget = fuzzinessFor(term);
  if (!budget) return null;
  const ranked = rankByDistance(term, vocabulary).filter((r) => r.distance > 0 && r.distance <= budget);
  return ranked[0]?.term ?? null;
}

/** Prefix autocomplete over a vocabulary, most-frequent first. */
export function autocomplete(prefix, vocabulary, limit = 10) {
  const p = normalize(prefix);
  if (!p) return [];
  return vocabulary.filter((v) => normalize(v.term).startsWith(p))
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0)).slice(0, limit).map((v) => v.term);
}
