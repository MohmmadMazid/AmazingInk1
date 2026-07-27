/**
 * Developer platform domain logic — pure, ported from the original platform's token,
 * signing, delivery, event-catalog, versioning, sandbox, rate-tier, usage, openapi,
 * and sdk cores. Deterministic given their inputs.
 */
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

/* --------------------------------- tokens -------------------------------- */
export const generateClientId = () => `mccms_cid_${randomBytes(12).toString('hex')}`;
export const generateClientSecret = () => `dcs_${randomBytes(32).toString('base64url')}`;
export const generateAccessToken = () => `dat_${randomBytes(32).toString('base64url')}`;
export const generateRefreshToken = () => `drt_${randomBytes(32).toString('base64url')}`;
export const generateAuthCode = () => randomBytes(24).toString('base64url');
export const hashSecret = (secret) => createHash('sha256').update(secret).digest('hex');

export function safeEqualHex(a, b) {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** PKCE S256: challenge = base64url(sha256(verifier)). */
export const pkceChallengeS256 = (verifier) => createHash('sha256').update(verifier).digest('base64url');

/** No challenge stored = PKCE not required for this client. */
export function verifyPkce(verifier, challenge) {
  if (!challenge) return true;
  return safeEqualHex(pkceChallengeS256(verifier ?? ''), challenge);
}

export const isExpired = (expiresAtMs, now) => now >= expiresAtMs;

/** The subset of requested scopes the client is actually granted (empty = all its scopes). */
export const grantableScopes = (requested, allowed) =>
  (!requested.length ? allowed : requested.filter((s) => allowed.includes(s)));

/* -------------------------------- signing -------------------------------- */
/** Webhook signature: `t=<unix>,v1=<hmac-sha256 of "t.body">`. */
export function signPayload(payload, secret, tsSec) {
  const mac = createHmac('sha256', secret).update(`${tsSec}.${payload}`).digest('hex');
  return `t=${tsSec},v1=${mac}`;
}

export function parseSignature(header) {
  const out = {};
  for (const part of String(header).split(',')) {
    const [k, v] = part.split('=');
    if (k === 't') out.t = Number(v);
    else if (k === 'v1') out.v1 = v;
  }
  return out;
}

/** Constant-time verify, bounded by a tolerance window so old signatures can't be replayed. */
export function verifySignature(payload, header, secret, nowSec, toleranceSec = 300) {
  const { t, v1 } = parseSignature(header);
  if (t == null || !v1 || !Number.isFinite(t)) return false;
  if (Math.abs(nowSec - t) > toleranceSec) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

/* -------------------------------- delivery ------------------------------- */
/** 2xx = success; 429/5xx/network = retryable; other 4xx = permanent (don't retry). */
export function classifyOutcome(statusCode) {
  if (statusCode >= 200 && statusCode < 300) return 'success';
  if (statusCode === 429 || statusCode === 0 || statusCode >= 500) return 'retryable';
  return 'permanent';
}

export function computeBackoffMs(attempt, baseMs = 1000, factor = 2, capMs = 3_600_000, jitter = 0) {
  const raw = Math.min(capMs, baseMs * Math.pow(factor, Math.max(0, attempt - 1)));
  return Math.round(raw + raw * jitter);
}

export const shouldRetry = (statusCode, attempt, maxAttempts) =>
  classifyOutcome(statusCode) === 'retryable' && attempt < maxAttempts;

export function isDead(statusCode, attempt, maxAttempts) {
  const outcome = classifyOutcome(statusCode);
  if (outcome === 'success') return false;
  if (outcome === 'permanent') return true;
  return attempt >= maxAttempts;
}

/* ------------------------------ event catalog ---------------------------- */
export const EVENT_CATALOG = [
  { type: 'order.created', category: 'order', description: 'A new order was placed' },
  { type: 'order.updated', category: 'order', description: 'An order was modified' },
  { type: 'order.fulfilled', category: 'order', description: 'An order was fully shipped' },
  { type: 'order.cancelled', category: 'order', description: 'An order was cancelled' },
  { type: 'inventory.low_stock', category: 'inventory', description: 'A SKU crossed its reorder point' },
  { type: 'inventory.adjusted', category: 'inventory', description: 'Stock levels were adjusted' },
  { type: 'product.created', category: 'product', description: 'A product was created' },
  { type: 'product.updated', category: 'product', description: 'A product was updated' },
  { type: 'listing.published', category: 'listing', description: 'A listing went live on a channel' },
  { type: 'customer.created', category: 'customer', description: 'A customer record was created' },
  { type: 'shipment.delivered', category: 'shipment', description: 'A shipment was delivered' },
  { type: 'payment.succeeded', category: 'payment', description: 'A payment was captured' },
];

export const CATALOG_TYPES = EVENT_CATALOG.map((e) => e.type);

/** Exact match, `order.*` category wildcard, or `*` global. */
export const matchesSubscription = (eventType, patterns) =>
  patterns.some((p) => (p === '*' ? true : p.endsWith('.*') ? eventType.startsWith(p.slice(0, -1)) : p === eventType));

export const isKnownEvent = (eventType) => CATALOG_TYPES.includes(eventType);

/** Split requested patterns into valid and unknown, so callers can warn rather than fail. */
export function validatePatterns(patterns) {
  const valid = [], unknown = [];
  for (const p of patterns) {
    if (p === '*' || p.endsWith('.*') || isKnownEvent(p)) valid.push(p);
    else unknown.push(p);
  }
  return { valid, unknown };
}

export const newEventId = () => randomUUID();

/* -------------------------------- versioning ----------------------------- */
export const SUPPORTED_VERSIONS = ['2024-01-01', '2024-07-01', '2025-01-01'];
export const DEFAULT_VERSION = SUPPORTED_VERSIONS[SUPPORTED_VERSIONS.length - 1];

/** Resolve a requested version, falling back to the default and reporting whether it was valid. */
export function resolveVersion(requested, supported = SUPPORTED_VERSIONS, fallback = DEFAULT_VERSION) {
  if (!requested) return { version: fallback, ok: true };
  return supported.includes(requested) ? { version: requested, ok: true } : { version: fallback, ok: false };
}

export const compareVersions = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
export const isSunset = (version, meta, now) => {
  const m = meta.find((x) => x.version === version);
  return Boolean(m?.sunsetAtMs && m.sunsetAtMs <= now);
};

/* --------------------------------- sandbox ------------------------------- */
export const LIVE_PREFIX = 'dk_live_';
export const SANDBOX_PREFIX = 'dk_test_';

/** The key prefix IS the environment — a sandbox key can never touch live data. */
export const environmentForKey = (rawKey) => (String(rawKey).startsWith(SANDBOX_PREFIX) ? 'SANDBOX' : 'LIVE');
export const isSandbox = (env) => env === 'SANDBOX';

/** Sandbox permits reads and simulated writes, but never real external side effects. */
export const allowsSideEffect = (env, effect) => (env === 'LIVE' ? true : effect !== 'external');

/* ------------------------------- rate tiers ------------------------------ */
export const TIERS = {
  FREE: { rps: 5, burst: 10, monthlyQuota: 10_000 },
  STANDARD: { rps: 50, burst: 100, monthlyQuota: 1_000_000 },
  ENTERPRISE: { rps: 500, burst: 1000, monthlyQuota: null },   // null = unlimited
};

export const limitsFor = (tier) => TIERS[tier] ?? TIERS.FREE;

export function quotaExceeded(usedThisMonth, tier) {
  const q = limitsFor(tier).monthlyQuota;
  return q != null && usedThisMonth >= q;
}

export function quotaRemaining(usedThisMonth, tier) {
  const q = limitsFor(tier).monthlyQuota;
  return q == null ? null : Math.max(0, q - usedThisMonth);
}

/* ---------------------------------- usage -------------------------------- */
/** Nearest-rank percentile. */
export function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

/** Roll request logs into usage analytics: status mix, latency percentiles, per-endpoint. */
export function summarizeUsage(logs) {
  const total = logs.length;
  const byStatus = {};
  const endpoints = {};
  const latencies = [];
  let errors = 0;

  for (const l of logs) {
    const bucket = `${Math.floor(l.statusCode / 100)}xx`;
    byStatus[bucket] = (byStatus[bucket] ?? 0) + 1;
    if (l.statusCode >= 400) errors++;
    latencies.push(l.latencyMs);
    const e = (endpoints[l.path] ??= { count: 0, totalLatency: 0, errors: 0 });
    e.count++; e.totalLatency += l.latencyMs;
    if (l.statusCode >= 400) e.errors++;
  }

  const byEndpoint = Object.entries(endpoints)
    .map(([path, e]) => ({ path, count: e.count, avgLatencyMs: Math.round(e.totalLatency / e.count), errorRate: +(e.errors / e.count).toFixed(3) }))
    .sort((a, b) => b.count - a.count);

  return {
    total,
    errorRate: total ? +(errors / total).toFixed(3) : 0,
    byStatus,
    latency: { p50: percentile(latencies, 50), p95: percentile(latencies, 95), p99: percentile(latencies, 99) },
    byEndpoint,
  };
}

/* --------------------------------- OpenAPI ------------------------------- */
/** Build an OpenAPI 3.1 document from the endpoint registry. Deterministic. */
export function buildOpenApiDocument(info, endpoints, opts) {
  const paths = {};
  for (const ep of endpoints) {
    const openapiPath = ep.path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
    const op = {
      summary: ep.summary,
      tags: ep.tags,
      parameters: (ep.params ?? []).map((p) => ({
        name: p.name, in: p.in, required: p.required ?? p.in === 'path', schema: { type: p.type ?? 'string' },
      })),
      responses: Object.fromEntries(Object.entries(ep.responses ?? { 200: 'OK' }).map(([code, desc]) => [code, { description: desc }])),
      security: (ep.security ?? ['apiKey']).map((s) => ({ [s]: [] })),
    };
    if (ep.requestBody) op.requestBody = { content: { 'application/json': { schema: ep.requestBody } } };
    (paths[openapiPath] ??= {})[ep.method.toLowerCase()] = op;
  }

  return {
    openapi: '3.1.0',
    info,
    servers: opts.servers,
    paths,
    components: {
      securitySchemes: {
        apiKey: { type: 'apiKey', in: 'header', name: 'Authorization', description: 'Bearer <API key>' },
        oauth2: { type: 'oauth2', flows: { clientCredentials: { tokenUrl: opts.tokenUrl, scopes: {} } } },
      },
    },
  };
}

/* ----------------------------------- SDK --------------------------------- */
/** Conventional SDK method name from an endpoint's shape. */
export function methodName(ep) {
  const hasId = /:[A-Za-z0-9_]+$/.test(ep.path);
  const m = ep.method.toUpperCase();
  if (m === 'GET') return hasId ? 'retrieve' : 'list';
  if (m === 'POST') return 'create';
  if (m === 'PUT' || m === 'PATCH') return 'update';
  if (m === 'DELETE') return 'del';
  return m.toLowerCase();
}

/** Group endpoints into resources by tag — the plan a code generator consumes. */
export function buildSdkPlan(endpoints, languages) {
  const resources = {};
  for (const ep of endpoints) {
    const tag = ep.tags[0] ?? 'core';
    (resources[tag] ??= []).push({ name: methodName(ep), method: ep.method.toUpperCase(), path: ep.path, summary: ep.summary });
  }
  return {
    languages,
    resourceCount: Object.keys(resources).length,
    endpointCount: endpoints.length,
    resources: Object.entries(resources).map(([name, methods]) => ({ resource: name, methods })),
  };
}

/* --------------------------- the public API surface ---------------------- */
/** Single source of truth: drives BOTH the OpenAPI document and the SDK plan. */
export const PUBLIC_API_ENDPOINTS = [
  { method: 'GET', path: '/v1/products', summary: 'List products', tags: ['products'], params: [{ name: 'limit', in: 'query', type: 'integer' }], security: ['apiKey', 'oauth2'] },
  { method: 'POST', path: '/v1/products', summary: 'Create a product', tags: ['products'], requestBody: { type: 'object' }, security: ['apiKey'] },
  { method: 'GET', path: '/v1/products/:id', summary: 'Retrieve a product', tags: ['products'], security: ['apiKey', 'oauth2'] },
  { method: 'PUT', path: '/v1/products/:id', summary: 'Update a product', tags: ['products'], requestBody: { type: 'object' }, security: ['apiKey'] },
  { method: 'GET', path: '/v1/orders', summary: 'List orders', tags: ['orders'], params: [{ name: 'status', in: 'query' }], security: ['apiKey', 'oauth2'] },
  { method: 'POST', path: '/v1/orders', summary: 'Create an order', tags: ['orders'], requestBody: { type: 'object' }, security: ['apiKey'] },
  { method: 'GET', path: '/v1/orders/:id', summary: 'Retrieve an order', tags: ['orders'], security: ['apiKey', 'oauth2'] },
  { method: 'GET', path: '/v1/inventory', summary: 'List inventory levels', tags: ['inventory'], security: ['apiKey', 'oauth2'] },
  { method: 'GET', path: '/v1/customers', summary: 'List customers', tags: ['customers'], security: ['apiKey', 'oauth2'] },
  { method: 'GET', path: '/v1/customers/:id', summary: 'Retrieve a customer', tags: ['customers'], security: ['apiKey', 'oauth2'] },
  { method: 'POST', path: '/v1/shipments', summary: 'Create a shipment', tags: ['shipments'], requestBody: { type: 'object' }, security: ['apiKey'] },
];
