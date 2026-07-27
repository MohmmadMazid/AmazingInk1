import { PlatformApiKey } from '../../models/platform-key.model.js';
import { ApiClient, OAuthAccessToken, OAuthAuthorizationCode } from '../../models/oauth.model.js';
import { EventSubscription, EventDelivery } from '../../models/event-subscription.model.js';
import { ApiRequestLog, ApiVersion } from '../../models/api-request-log.model.js';
import { ApiError } from '../../utils/asyncHandler.js';
import {
  DEFAULT_VERSION, LIVE_PREFIX, PUBLIC_API_ENDPOINTS, SANDBOX_PREFIX, SUPPORTED_VERSIONS,
  buildOpenApiDocument, buildSdkPlan, classifyOutcome, computeBackoffMs, environmentForKey,
  EVENT_CATALOG, generateAccessToken, generateAuthCode, generateClientId, generateClientSecret,
  generateRefreshToken, grantableScopes, hashSecret, isDead, isExpired, matchesSubscription,
  newEventId, quotaExceeded, quotaRemaining, resolveVersion, shouldRetry, signPayload,
  summarizeUsage, validatePatterns, verifyPkce,
} from '../../core/devplatform.js';

const ACCESS_TTL_SEC = 3600;
const CODE_TTL_MS = 600_000;

/* -------------------------------- API keys ------------------------------- */
/** Create a platform key. The prefix encodes the environment; plaintext is returned once. */
export async function createKey(orgId, { name, scopes, environment = 'SANDBOX', rateTier = 'FREE', expiresAt }) {
  const env = environment === 'LIVE' ? 'LIVE' : 'SANDBOX';
  const raw = `${env === 'LIVE' ? LIVE_PREFIX : SANDBOX_PREFIX}${generateAccessToken().slice(4)}`;
  const keyPrefix = raw.slice(0, 8);
  const masked = `${raw.slice(0, 12)}${'*'.repeat(8)}${raw.slice(-4)}`;

  const key = await PlatformApiKey.create({
    organizationId: orgId, name, keyPrefix, keyHash: hashSecret(raw), maskedKey: masked,
    scopes: scopes ?? [], environment: env, rateTier,
    expiresAt: expiresAt ? new Date(expiresAt) : undefined,
  });
  return { key, secret: raw };
}

export const listKeys = (orgId) => PlatformApiKey.find({ organizationId: orgId }).sort({ createdAt: -1 });

export async function revokeKey(orgId, id) {
  const k = await PlatformApiKey.findOneAndUpdate({ _id: id, organizationId: orgId }, { $set: { status: 'REVOKED' } }, { new: true });
  if (!k) throw new ApiError(404, 'Key not found', 'not_found');
  return { id, revoked: true };
}

/** Authenticate a raw key. The environment is derived from the prefix, never trusted from input. */
export async function verifyKey(rawKey) {
  const record = await PlatformApiKey.findOne({ keyHash: hashSecret(rawKey), status: 'ACTIVE' });
  if (!record) return null;
  if (record.expiresAt && record.expiresAt.getTime() < Date.now()) return null;
  PlatformApiKey.updateOne({ _id: record._id }, { $set: { lastUsedAt: new Date() } }).catch(() => {});
  return { record, environment: environmentForKey(rawKey) };
}

/* ------------------------------ OAuth clients ---------------------------- */
export async function createClient(orgId, { name, grantTypes, redirectUris, scopes, environment, rateTier }) {
  const clientId = generateClientId();
  const secret = generateClientSecret();
  const client = await ApiClient.create({
    organizationId: orgId, name, clientId, secretHash: hashSecret(secret),
    grantTypes: grantTypes ?? ['CLIENT_CREDENTIALS'], redirectUris: redirectUris ?? [],
    scopes: scopes ?? [], environment: environment === 'LIVE' ? 'LIVE' : 'SANDBOX', rateTier: rateTier ?? 'FREE',
  });
  return { client, clientSecret: secret };
}

export const listClients = (orgId) => ApiClient.find({ organizationId: orgId }).sort({ createdAt: -1 });

export async function removeClient(orgId, id) {
  const c = await ApiClient.findOneAndUpdate({ _id: id, organizationId: orgId }, { $set: { active: false } }, { new: true });
  if (!c) throw new ApiError(404, 'Client not found', 'not_found');
  return { id, disabled: true };
}

/* -------------------------------- OAuth flow ----------------------------- */
async function authenticateClient(clientId, clientSecret) {
  const client = await ApiClient.findOne({ clientId });
  if (!client || !client.active || client.secretHash !== hashSecret(clientSecret ?? '')) return null;
  return client;
}

async function issue(orgId, clientId, scopes, environment, withRefresh) {
  const accessToken = generateAccessToken();
  const refreshToken = withRefresh ? generateRefreshToken() : undefined;
  await OAuthAccessToken.create({
    organizationId: orgId, clientId, tokenHash: hashSecret(accessToken),
    refreshHash: refreshToken ? hashSecret(refreshToken) : null,
    scopes, environment, expiresAt: new Date(Date.now() + ACCESS_TTL_SEC * 1000),
  });
  return {
    access_token: accessToken, token_type: 'Bearer', expires_in: ACCESS_TTL_SEC,
    scope: scopes.join(' '), ...(refreshToken ? { refresh_token: refreshToken } : {}),
  };
}

/** grant_type=client_credentials */
export async function clientCredentials(clientId, clientSecret, scopes = []) {
  const client = await authenticateClient(clientId, clientSecret);
  if (!client) return { error: 'invalid_client' };
  if (!client.grantTypes.includes('CLIENT_CREDENTIALS')) return { error: 'unauthorized_client' };
  return issue(client.organizationId, client.clientId, grantableScopes(scopes, client.scopes), client.environment, false);
}

/** Authorization-code step 1: issue a single-use code, optionally bound to a PKCE challenge. */
export async function authorize(clientId, redirectUri, scopes = [], codeChallenge) {
  const client = await ApiClient.findOne({ clientId });
  if (!client || !client.active || !client.redirectUris.includes(redirectUri)) return { error: 'invalid_request' };
  const code = generateAuthCode();
  await OAuthAuthorizationCode.create({
    clientId, codeHash: hashSecret(code), redirectUri,
    scopes: grantableScopes(scopes, client.scopes), codeChallenge,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });
  return { code };
}

/** Step 2: exchange the code. The code is single-use and PKCE-verified. */
export async function exchangeCode(clientId, clientSecret, code, verifier) {
  const client = await authenticateClient(clientId, clientSecret);
  if (!client) return { error: 'invalid_client' };

  const row = await OAuthAuthorizationCode.findOne({ codeHash: hashSecret(code ?? '') });
  if (!row || row.clientId !== clientId || row.consumedAt || isExpired(row.expiresAt.getTime(), Date.now())) {
    return { error: 'invalid_grant' };
  }
  if (!verifyPkce(verifier, row.codeChallenge)) return { error: 'invalid_grant' };

  row.consumedAt = new Date();   // single use — a replayed code fails the check above
  await row.save();
  return issue(client.organizationId, clientId, row.scopes, client.environment, true);
}

/** Refresh rotates the token: the old refresh token is revoked as the new one is issued. */
export async function refresh(clientId, clientSecret, refreshToken) {
  const client = await authenticateClient(clientId, clientSecret);
  if (!client) return { error: 'invalid_client' };
  const existing = await OAuthAccessToken.findOne({ clientId, refreshHash: hashSecret(refreshToken ?? ''), revokedAt: null });
  if (!existing) return { error: 'invalid_grant' };
  existing.revokedAt = new Date();
  await existing.save();
  return issue(client.organizationId, clientId, existing.scopes, existing.environment, true);
}

export async function introspect(orgId, token) {
  const row = await OAuthAccessToken.findOne({ tokenHash: hashSecret(token ?? '') });
  if (!row || row.organizationId !== orgId || row.revokedAt || isExpired(row.expiresAt.getTime(), Date.now())) {
    return { active: false };
  }
  return { active: true, client_id: row.clientId, scope: row.scopes.join(' '), environment: row.environment, exp: Math.floor(row.expiresAt.getTime() / 1000) };
}

export async function revokeToken(orgId, token) {
  await OAuthAccessToken.updateMany({ organizationId: orgId, tokenHash: hashSecret(token ?? '') }, { $set: { revokedAt: new Date() } });
  return { revoked: true };
}

/* ------------------------------ subscriptions ---------------------------- */
export const listSubscriptions = (orgId) => EventSubscription.find({ organizationId: orgId }).sort({ createdAt: -1 });

export async function createSubscription(orgId, { endpointUrl, eventTypes, description, environment }) {
  const { valid, unknown } = validatePatterns(eventTypes);
  if (!valid.length) throw new ApiError(400, `No valid event patterns (unknown: ${unknown.join(', ')})`, 'validation');

  const secret = generateClientSecret();
  const sub = await EventSubscription.create({
    organizationId: orgId, endpointUrl, description, eventTypes: valid,
    secretHash: hashSecret(secret), signingSecret: secret,
    environment: environment === 'LIVE' ? 'LIVE' : 'SANDBOX',
  });
  return { subscription: sub, signingSecret: secret, ignored: unknown };
}

export async function removeSubscription(orgId, id) {
  const s = await EventSubscription.findOneAndUpdate({ _id: id, organizationId: orgId }, { $set: { status: 'DISABLED' } }, { new: true });
  if (!s) throw new ApiError(404, 'Subscription not found', 'not_found');
  return { id, disabled: true };
}

/* ----------------------------- event dispatcher -------------------------- */
/**
 * THE FAN-OUT. Any module calls this on a domain event; every active subscription whose
 * patterns match gets an EventDelivery row queued for the retry worker.
 */
export async function dispatch(orgId, eventType, payload, { environment } = {}) {
  const subs = await EventSubscription.find({
    organizationId: orgId, status: 'ACTIVE',
    ...(environment ? { environment } : {}),
  });
  const targets = subs.filter((s) => matchesSubscription(eventType, s.eventTypes));
  if (!targets.length) return { matched: 0, deliveries: [] };

  const eventId = newEventId();
  const deliveries = [];
  for (const s of targets) {
    const d = await EventDelivery.create({
      organizationId: orgId, subscriptionId: s._id, eventType, eventId,
      payload, nextAttemptAt: new Date(),
    });
    deliveries.push(d._id.toString());
  }
  return { matched: targets.length, eventId, deliveries };
}

/**
 * Attempt one delivery: sign the payload, POST it, then apply the retry state machine.
 * success -> SUCCEEDED; retryable -> reschedule with exponential backoff; else DEAD.
 */
export async function attemptDelivery(deliveryId) {
  const d = await EventDelivery.findById(deliveryId);
  if (!d || d.status === 'SUCCEEDED' || d.status === 'DEAD') return null;

  const sub = await EventSubscription.findById(d.subscriptionId).select('+signingSecret');
  if (!sub || sub.status !== 'ACTIVE') {
    d.status = 'DEAD'; d.lastError = 'subscription inactive';
    await d.save();
    return d;
  }

  const attempt = d.attempt + 1;
  const body = JSON.stringify({ id: d.eventId, type: d.eventType, created: Math.floor(Date.now() / 1000), data: d.payload });
  const tsSec = Math.floor(Date.now() / 1000);
  const signature = signPayload(body, sub.signingSecret, tsSec);

  let statusCode = 0, error;
  try {
    const res = await fetch(sub.endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-MCCMS-Event': d.eventType,
        'X-MCCMS-Delivery': d._id.toString(),
        'X-MCCMS-Signature': signature,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    statusCode = res.status;
  } catch (e) {
    statusCode = 0;
    error = e.message;
  }

  d.attempt = attempt;
  d.lastStatusCode = statusCode;

  if (classifyOutcome(statusCode) === 'success') {
    d.status = 'SUCCEEDED'; d.deliveredAt = new Date(); d.nextAttemptAt = null; d.lastError = undefined;
  } else if (isDead(statusCode, attempt, d.maxAttempts) || !shouldRetry(statusCode, attempt, d.maxAttempts)) {
    d.status = 'DEAD'; d.lastError = error ?? `HTTP ${statusCode}`; d.nextAttemptAt = null;
  } else {
    d.status = 'FAILED'; d.lastError = error ?? `HTTP ${statusCode}`;
    d.nextAttemptAt = new Date(Date.now() + computeBackoffMs(attempt + 1));
  }
  await d.save();
  return d;
}

/** Drain due deliveries. In production a queue worker calls this; here it's an endpoint. */
export async function drainDeliveries(orgId, { limit = 25 } = {}) {
  const due = await EventDelivery.find({
    organizationId: orgId, status: { $in: ['PENDING', 'FAILED'] }, nextAttemptAt: { $lte: new Date() },
  }).sort({ nextAttemptAt: 1 }).limit(limit);

  const results = [];
  for (const d of due) {
    const updated = await attemptDelivery(d._id.toString());
    results.push({ id: d._id, status: updated?.status, attempt: updated?.attempt, statusCode: updated?.lastStatusCode });
  }
  return { processed: results.length, results };
}

export async function listDeliveries(orgId, { skip, limit, status, subscriptionId }) {
  const where = { organizationId: orgId };
  if (status) where.status = status;
  if (subscriptionId) where.subscriptionId = subscriptionId;
  const [data, total] = await Promise.all([
    EventDelivery.find(where).sort({ createdAt: -1 }).skip(skip).limit(limit),
    EventDelivery.countDocuments(where),
  ]);
  return { data, total };
}

export async function redeliver(orgId, id) {
  const d = await EventDelivery.findOne({ _id: id, organizationId: orgId });
  if (!d) throw new ApiError(404, 'Delivery not found', 'not_found');
  d.status = 'PENDING'; d.nextAttemptAt = new Date();
  await d.save();
  return attemptDelivery(id);
}

/* ---------------------------------- usage -------------------------------- */
/** Record a public-API request. Called by the gateway middleware. */
export const recordRequest = (orgId, entry) =>
  ApiRequestLog.create({ organizationId: orgId, ...entry }).catch(() => undefined);

export async function usageSummary(orgId, hours = 24) {
  const since = new Date(Date.now() - hours * 3_600_000);
  const logs = await ApiRequestLog.find({ organizationId: orgId, createdAt: { $gte: since } })
    .select('path statusCode latencyMs').limit(50_000).lean();
  return { sinceHours: hours, ...summarizeUsage(logs) };
}

export async function usageTimeseries(orgId, hours = 24) {
  const since = new Date(Date.now() - hours * 3_600_000);
  const logs = await ApiRequestLog.find({ organizationId: orgId, createdAt: { $gte: since } })
    .select('createdAt statusCode').sort({ createdAt: 1 }).lean();
  const buckets = {};
  for (const l of logs) {
    const hour = l.createdAt.toISOString().slice(0, 13);
    const b = (buckets[hour] ??= { requests: 0, errors: 0 });
    b.requests++;
    if (l.statusCode >= 400) b.errors++;
  }
  return Object.entries(buckets).map(([hour, b]) => ({ hour, ...b }));
}

/** Monthly quota against the caller's rate tier. */
export async function quota(orgId, tier = 'FREE') {
  const monthStart = new Date();
  monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const used = await ApiRequestLog.countDocuments({ organizationId: orgId, createdAt: { $gte: monthStart } });
  return { tier, used, remaining: quotaRemaining(used, tier), exceeded: quotaExceeded(used, tier) };
}

/* -------------------------------- versioning ----------------------------- */
export const listVersions = () => ApiVersion.find().sort({ version: -1 });

export async function seedVersions() {
  const existing = await ApiVersion.countDocuments();
  if (existing) return { seeded: 0 };
  for (const v of SUPPORTED_VERSIONS) await ApiVersion.create({ version: v }).catch(() => {});
  return { seeded: SUPPORTED_VERSIONS.length };
}

export const upsertVersion = (body) =>
  ApiVersion.findOneAndUpdate({ version: body.version }, { $set: body }, { new: true, upsert: true });

export async function resolveApiVersion(requested) {
  const rows = await ApiVersion.find({ status: { $ne: 'SUNSET' } }).select('version').lean();
  const supported = rows.length ? rows.map((r) => r.version) : SUPPORTED_VERSIONS;
  return resolveVersion(requested, supported, DEFAULT_VERSION);
}

/* ------------------------------ docs & SDK ------------------------------- */
/** The OpenAPI document and the SDK plan are generated from ONE endpoint registry. */
export function openApiDocument(baseUrl = 'https://api.mccms.example.com') {
  return buildOpenApiDocument(
    { title: 'MCCMS Commerce API', version: DEFAULT_VERSION, description: 'Multi-Channel Commerce Management public API' },
    PUBLIC_API_ENDPOINTS,
    { servers: [{ url: baseUrl, description: 'Production' }, { url: `${baseUrl}/sandbox`, description: 'Sandbox' }], tokenUrl: `${baseUrl}/developer/oauth/token` },
  );
}

export const sdkPlan = (languages = ['typescript', 'python', 'ruby', 'go']) => buildSdkPlan(PUBLIC_API_ENDPOINTS, languages);
export const eventCatalog = () => ({ events: EVENT_CATALOG });
