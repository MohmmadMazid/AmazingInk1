/**
 * Notifications domain logic — pure, ported from the original platform's template,
 * preference, dedupe, and digest cores. No I/O; deterministic and unit-testable.
 */

export const ALL_CHANNELS = ['IN_APP', 'EMAIL', 'SMS', 'PUSH'];
const MASTER = { IN_APP: 'inAppEnabled', EMAIL: 'emailEnabled', SMS: 'smsEnabled', PUSH: 'pushEnabled' };

/** Categories a user may never fully opt out of (critical operational/security alerts). */
export const NON_SUPPRESSIBLE = ['ERROR', 'SYNC_FAILURE'];

/* -------------------------------- templates ------------------------------ */
/**
 * Interpolate {{var}} / {{ var }} placeholders, supporting dotted paths. Missing vars render
 * as empty and are collected so callers can warn. HTML rendering escapes values.
 */
export function interpolate(tpl, vars, escape = false) {
  const missing = [];
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const text = String(tpl).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key) => {
    const val = key.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), vars);
    if (val === undefined || val === null) { missing.push(key); return ''; }
    const s = String(val);
    return escape ? esc(s) : s;
  });
  return { text, missing };
}

/** Render a template's subject/text/html against variables. */
export function renderTemplate(tpl, vars) {
  const subject = tpl.subject ? interpolate(tpl.subject, vars) : undefined;
  const text = interpolate(tpl.bodyText, vars);
  const html = tpl.bodyHtml ? interpolate(tpl.bodyHtml, vars, true) : undefined;
  const missing = [...new Set([...(subject?.missing ?? []), ...text.missing, ...(html?.missing ?? [])])];
  return { message: { subject: subject?.text, text: text.text, html: html?.text }, missing };
}

/* ------------------------------- preferences ----------------------------- */
/**
 * Decide which channels a notification goes out on. The heart of the system.
 *   1. A channel is eligible only if its master switch is on (IN_APP always eligible).
 *   2. A per-(category, channel) preference of enabled=false suppresses it...
 *   3. ...unless priority is URGENT or the category is non-suppressible — those still
 *      deliver in-app (and email), so critical alerts are never silently dropped.
 *   4. Default with no explicit preference: IN_APP + EMAIL on, SMS/PUSH off.
 */
export function resolveChannels(category, priority, prefs, settings) {
  const prefMap = new Map(prefs.filter((p) => p.category === category).map((p) => [p.channel, p.enabled]));
  const critical = priority === 'URGENT' || NON_SUPPRESSIBLE.includes(category);

  return ALL_CHANNELS.filter((ch) => {
    const masterOn = ch === 'IN_APP' ? settings.inAppEnabled !== false : settings[MASTER[ch]] === true;
    const defaultOn = ch === 'IN_APP' || ch === 'EMAIL';
    const pref = prefMap.has(ch) ? prefMap.get(ch) : defaultOn;

    if (critical && (ch === 'IN_APP' || ch === 'EMAIL')) return ch === 'IN_APP' ? true : masterOn;
    return masterOn && pref;
  });
}

/** True when `nowMinutes` (minutes from midnight) falls inside quiet hours. Handles wrap past midnight. */
export function isQuietHour(nowMinutes, settings) {
  const s = settings.quietHoursStart, e = settings.quietHoursEnd;
  if (s == null || e == null) return false;
  return s <= e ? nowMinutes >= s && nowMinutes < e : nowMinutes >= s || nowMinutes < e;
}

/**
 * During quiet hours, non-urgent EMAIL/SMS/PUSH are held (deferred to digest); IN_APP always
 * goes through and URGENT always breaks through.
 */
export function applyQuietHours(channels, priority, nowMinutes, settings) {
  if (priority === 'URGENT' || !isQuietHour(nowMinutes, settings)) return { deliver: channels, deferred: [] };
  return {
    deliver: channels.filter((c) => c === 'IN_APP'),
    deferred: channels.filter((c) => c !== 'IN_APP'),
  };
}

/* --------------------------------- dedupe -------------------------------- */
/** A stable key so repeated alerts about the same thing collapse. */
export function dedupeKey(category, entityType, entityId, extra) {
  return [category, entityType ?? '-', entityId ?? '-', extra ?? '-'].join(':');
}

/** Given the last time this key fired, should we suppress a repeat now? */
export function shouldSuppress(lastFiredAt, now, windowMinutes) {
  if (!lastFiredAt) return false;
  return now.getTime() - new Date(lastFiredAt).getTime() < windowMinutes * 60_000;
}

/* --------------------------------- digest -------------------------------- */
/** The next digest send time for a user's cadence and digest hour (UTC). */
export function nextDigestAt(settings, from = new Date()) {
  if (!settings.digest || settings.digest === 'NONE') return null;
  const hour = settings.digestHour ?? 8;
  const next = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), hour, 0, 0));
  if (next <= from) next.setUTCDate(next.getUTCDate() + 1);
  if (settings.digest === 'WEEKLY') {
    while (next.getUTCDay() !== 1) next.setUTCDate(next.getUTCDate() + 1); // next Monday
  }
  return next;
}

/** Group deferred notifications into a compact digest summary. */
export function buildDigest(items) {
  const counts = new Map();
  for (const it of items) counts.set(it.category, (counts.get(it.category) ?? 0) + 1);
  const byCategory = [...counts.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count);
  const latest = [...items].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 10);
  return { total: items.length, byCategory, latest };
}
