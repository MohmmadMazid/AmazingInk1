/** Fuzzy duplicate detection — pure, ported from the original CRM domain core. */

export const normalizeEmail = (e) => (e ?? '').trim().toLowerCase();
export const normalizePhone = (p) => (p ?? '').replace(/[^\d]/g, '').replace(/^0+/, '');
export const nameKey = (a, b) => `${(a ?? '').trim().toLowerCase()} ${(b ?? '').trim().toLowerCase()}`.trim();

/** Levenshtein edit distance. */
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const curr = [i + 1];
    for (let j = 0; j < b.length; j++) {
      curr[j + 1] = Math.min(prev[j + 1] + 1, curr[j] + 1, prev[j] + (a[i] === b[j] ? 0 : 1));
    }
    prev = curr;
  }
  return prev[b.length];
}

/** Similarity ratio in [0,1]. */
export function similarity(a, b) {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - levenshtein(a, b) / max;
}

/** Score how likely two customers are the same, with reasons. Exact email is decisive. */
export function scoreDuplicate(a, b) {
  const reasons = [];
  let score = 0;
  const ea = normalizeEmail(a.email), eb = normalizeEmail(b.email);
  if (ea && eb) {
    if (ea === eb) { score = Math.max(score, 0.97); reasons.push('identical email'); }
    else { const s = similarity(ea, eb); if (s > 0.85) { score = Math.max(score, s * 0.7); reasons.push('similar email'); } }
  }
  const pa = normalizePhone(a.phone), pb = normalizePhone(b.phone);
  if (pa && pb && pa === pb) { score = Math.max(score, 0.9); reasons.push('identical phone'); }

  const na = nameKey(a.firstName, a.lastName), nb = nameKey(b.firstName, b.lastName);
  if (na && nb) { const s = similarity(na, nb); if (s >= 0.8) { score = Math.min(1, score + s * 0.3); reasons.push('matching name'); } }

  return { aId: a.id, bId: b.id, score: Math.round(score * 100) / 100, reasons };
}

/** Cluster a list into candidate duplicate pairs above a threshold. */
export function findDuplicates(customers, threshold = 0.8) {
  const out = [];
  for (let i = 0; i < customers.length; i++) {
    for (let j = i + 1; j < customers.length; j++) {
      const m = scoreDuplicate(customers[i], customers[j]);
      if (m.score >= threshold) out.push(m);
    }
  }
  return out.sort((x, y) => y.score - x.score);
}
