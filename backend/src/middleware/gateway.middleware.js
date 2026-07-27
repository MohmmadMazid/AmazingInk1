/**
 * The public API gateway. This is what turns the developer platform from a console into a
 * real API: it authenticates external callers, resolves their environment and version,
 * enforces the monthly quota for their rate tier, and meters every request.
 *
 * Mount it in front of the versioned public routes (`/v1/*`), NOT the console routes.
 */
import { ApiError } from '../utils/asyncHandler.js';
import * as devplatform from '../modules/devplatform/devplatform.service.js';
import { allowsSideEffect, isSandbox, quotaExceeded } from '../core/devplatform.js';

/**
 * Authenticate by platform API key (`Bearer dk_live_…` / `dk_test_…`) or OAuth access
 * token (`Bearer dat_…`). The ENVIRONMENT comes from the credential itself, never from a
 * header the caller controls.
 */
export const apiGatewayAuth = async (req, _res, next) => {
  const header = req.headers.authorization ?? '';
  const raw = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!raw) return next(new ApiError(401, 'Missing API credential', 'unauthenticated'));

  try {
    // Platform key?
    if (raw.startsWith('dk_')) {
      const result = await devplatform.verifyKey(raw);
      if (!result) return next(new ApiError(401, 'Invalid or revoked API key', 'unauthenticated'));
      req.api = {
        orgId: result.record.organizationId, keyId: result.record._id.toString(),
        scopes: result.record.scopes, environment: result.environment, rateTier: result.record.rateTier,
      };
      return next();
    }

    // OAuth access token? We must find its org, so introspect against the token hash directly.
    const { OAuthAccessToken } = await import('../models/oauth.model.js');
    const { hashSecret } = await import('../core/devplatform.js');
    const row = await OAuthAccessToken.findOne({ tokenHash: hashSecret(raw), revokedAt: null });
    if (!row || row.expiresAt.getTime() <= Date.now()) {
      return next(new ApiError(401, 'Invalid or expired access token', 'unauthenticated'));
    }
    const { ApiClient } = await import('../models/oauth.model.js');
    const client = await ApiClient.findOne({ clientId: row.clientId });
    req.api = {
      orgId: row.organizationId, clientId: row.clientId, scopes: row.scopes,
      environment: row.environment, rateTier: client?.rateTier ?? 'FREE',
    };
    next();
  } catch (e) { next(e); }
};

/** Enforce the caller's monthly quota for its rate tier. */
export const enforceQuota = async (req, res, next) => {
  if (!req.api) return next();
  try {
    const { used, remaining } = await devplatform.quota(req.api.orgId, req.api.rateTier);
    res.setHeader('X-Quota-Limit', String(remaining == null ? 'unlimited' : used + remaining));
    res.setHeader('X-Quota-Remaining', String(remaining ?? 'unlimited'));
    if (quotaExceeded(used, req.api.rateTier)) {
      return next(new ApiError(429, `Monthly quota exceeded for the ${req.api.rateTier} tier`, 'quota_exceeded'));
    }
    next();
  } catch (e) { next(e); }
};

/** Resolve the API version from the `MCCMS-Version` header; a bad version falls back with a warning. */
export const resolveVersion = async (req, res, next) => {
  try {
    const requested = req.get('MCCMS-Version');
    const { version, ok } = await devplatform.resolveApiVersion(requested);
    req.apiVersion = version;
    res.setHeader('MCCMS-Version', version);
    if (!ok) res.setHeader('Warning', `299 - "Unknown version '${requested}', using ${version}"`);
    next();
  } catch (e) { next(e); }
};

/**
 * Sandbox guard. A sandbox credential may read and write to its own data, but must never
 * cause an external side effect (charge a card, post to a marketplace, send an email).
 * Route handlers declare their effect; this refuses the ones sandbox can't perform.
 */
export const requireEffect = (effect) => (req, _res, next) => {
  if (!req.api) return next();
  if (allowsSideEffect(req.api.environment, effect)) return next();
  next(new ApiError(403, `Sandbox credentials cannot perform '${effect}' side effects`, 'sandbox_blocked'));
};

/** Meter every request: method, path, status, latency, environment. Runs on response finish. */
export const meterRequest = (req, res, next) => {
  if (!req.api) return next();
  const started = Date.now();
  res.on('finish', () => {
    devplatform.recordRequest(req.api.orgId, {
      keyId: req.api.keyId, clientId: req.api.clientId,
      method: req.method, path: req.route?.path ?? req.path,
      version: req.apiVersion, statusCode: res.statusCode,
      latencyMs: Date.now() - started, environment: req.api.environment, ip: req.ip,
    });
  });
  next();
};

/** Require an OAuth/key scope for a route. */
export const requireScope = (scope) => (req, _res, next) => {
  if (!req.api) return next(new ApiError(401, 'Not authenticated', 'unauthenticated'));
  if (req.api.scopes.includes('*') || req.api.scopes.includes(scope)) return next();
  next(new ApiError(403, `Missing scope: ${scope}`, 'insufficient_scope'));
};

/** Convenience: the full gateway stack, in order. */
export const apiGateway = [apiGatewayAuth, resolveVersion, enforceQuota, meterRequest];

export { isSandbox };
