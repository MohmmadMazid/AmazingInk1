/**
 * Admin domain logic — pure, ported from the original platform's api-key, feature-flag,
 * audit-diff, webhook-signature, security-policy, and permission-set cores.
 * No I/O; deterministic and unit-testable.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/* -------------------------------- API keys ------------------------------- */
/** Generate an API key. The plaintext is shown ONCE; only the hash is persisted. */
export function generateApiKey(env = 'live') {
  const body = randomBytes(24).toString('base64url');
  const key = `mk_${env}_${body}`;
  return { key, prefix: key.slice(0, 12), hash: hashApiKey(key) };
}
export const hashApiKey = (key) => createHash('sha256').update(key).digest('hex');
export const maskKey = (prefix) => `${prefix}${'•'.repeat(8)}`;

/* ------------------------------ feature flags ---------------------------- */
/** Stable 0..99 bucket for (key, subject) so percentage rollouts are deterministic and sticky. */
export function bucket(key, subject) {
  const h = createHash('sha256').update(`${key}:${subject}`).digest();
  return h.readUInt32BE(0) % 100;
}

/** Evaluate a flag for a context. Pure and deterministic — same user always gets the same answer. */
export function evaluateFlag(key, rule, ctx = {}) {
  if (!rule.enabled) return false;
  switch (rule.audience) {
    case 'ALL': return true;
    case 'ROLE': return !!ctx.role && ctx.role === rule.roleFilter;
    case 'USERS': return !!ctx.userId && (rule.userIds ?? []).includes(ctx.userId);
    case 'PERCENTAGE': {
      const pct = Math.max(0, Math.min(100, rule.rolloutPct ?? 0));
      if (pct >= 100) return true;
      if (pct <= 0) return false;
      return bucket(key, ctx.userId ?? 'anon') < pct;
    }
    default: return false;
  }
}

/* ------------------------------- audit diff ------------------------------ */
const SECRET_KEYS = /(password|secret|token|key|hash|authorization|apikey)/i;

/** Field-level diff of two objects, REDACTING secret-looking values so audit logs never leak. */
export function computeDiff(before = {}, after = {}) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const diff = {};
  for (const k of keys) {
    const b = before[k], a = after[k];
    if (JSON.stringify(b) === JSON.stringify(a)) continue;
    const redact = (v) => (v == null ? v : SECRET_KEYS.test(k) ? '***redacted***' : v);
    diff[k] = { before: redact(b), after: redact(a) };
  }
  return diff;
}

export function summarize(action, resource, diff) {
  const fields = Object.keys(diff);
  if (!fields.length) return `${action} on ${resource}`;
  return `${action}: changed ${fields.slice(0, 5).join(', ')}${fields.length > 5 ? '…' : ''}`;
}

/* --------------------------- webhook signatures -------------------------- */
/** Sign a webhook payload: HMAC-SHA256 over `${timestamp}.${body}`. */
export function signPayload(secret, body, timestamp) {
  const mac = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${mac}`;
}

/** Verify a signature header, constant-time, within a tolerance window (replay protection). */
export function verifySignature(secret, body, header, nowSeconds, toleranceSeconds = 300) {
  const parts = Object.fromEntries(String(header).split(',').map((kv) => kv.split('=')));
  if (!parts.t || !parts.v1) return false;
  const ts = Number(parts.t);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > toleranceSeconds) return false;
  const expected = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
  try { return timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1)); } catch { return false; }
}

/* ----------------------------- security policy --------------------------- */
export const DEFAULT_PASSWORD_POLICY = { minLength: 10, requireUpper: true, requireLower: true, requireNumber: true, requireSymbol: false };

/** Validate a password; returns the list of UNMET requirements (empty = valid). */
export function validatePassword(password, policy = DEFAULT_PASSWORD_POLICY) {
  const fail = [];
  if (password.length < policy.minLength) fail.push(`at least ${policy.minLength} characters`);
  if (policy.requireUpper && !/[A-Z]/.test(password)) fail.push('an uppercase letter');
  if (policy.requireLower && !/[a-z]/.test(password)) fail.push('a lowercase letter');
  if (policy.requireNumber && !/[0-9]/.test(password)) fail.push('a number');
  if (policy.requireSymbol && !/[^A-Za-z0-9]/.test(password)) fail.push('a symbol');
  return fail;
}

/** A rough 0..4 strength score for UI hints. */
export function passwordStrength(password) {
  let s = 0;
  if (password.length >= 8) s++;
  if (password.length >= 12) s++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) s++;
  if (/[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password)) s++;
  return Math.min(4, s);
}

/** True if an IP is allowed (empty allowlist = allow all). */
export function ipAllowed(ip, allowlist = []) {
  if (!allowlist.length) return true;
  return allowlist.some((entry) => entry === ip || (entry.endsWith('.') && ip.startsWith(entry)));
}

/* ---------------------------- permission sets ---------------------------- */
/**
 * Expand a granted list against the catalog. `*` grants everything; `resource:*` grants
 * every action on that resource; otherwise only exact catalog matches count.
 */
export function expandPermissions(granted, catalog) {
  const out = new Set();
  if (granted.includes('*')) return new Set(catalog);
  for (const g of granted) {
    if (g.endsWith(':*')) {
      const res = g.slice(0, -2);
      for (const c of catalog) if (c.startsWith(`${res}:`)) out.add(c);
    } else if (catalog.includes(g)) out.add(g);
  }
  return out;
}

export function mergeRoles(roles, catalog) {
  const set = new Set();
  for (const r of roles) for (const p of expandPermissions(r.permissions, catalog)) set.add(p);
  return [...set].sort();
}

/** What a role change adds and removes — feeds the audit diff. */
export function diffPermissions(before, after) {
  const b = new Set(before), a = new Set(after);
  return { added: after.filter((p) => !b.has(p)).sort(), removed: before.filter((p) => !a.has(p)).sort() };
}

/** Reject unknown permissions against the catalog (guards typos in role editors). */
export function invalidPermissions(granted, catalog) {
  return granted.filter((g) => g !== '*' && !g.endsWith(':*') && !catalog.includes(g));
}

/** Does a held permission set satisfy a required permission (honouring wildcards)? */
export function hasPermission(held, required) {
  if (held.includes('*') || held.includes(required)) return true;
  const [resource] = required.split(':');
  return held.includes(`${resource}:*`);
}

/** The catalog of every permission this platform defines. */
export const PERMISSION_CATALOG = [
  'products:view', 'products:manage',
  'orders:view', 'orders:manage',
  'customers:view', 'customers:manage',
  'inventory:view', 'inventory:manage',
  'pricing:view', 'pricing:manage',
  'shipping:view', 'shipping:manage',
  'warehouse:view', 'warehouse:manage',
  'listings:view', 'listings:manage',
  'channels:view', 'channels:manage',
  'analytics:view', 'analytics:manage',
  'notifications:view', 'notifications:manage',
  'automation:view', 'automation:manage',
  'security:view', 'security:manage',
  'ai:view', 'ai:use', 'ai:manage',
  'developer:view', 'developer:manage',
  'search:view', 'search:manage',
  'admin:view', 'admin:manage',
];
