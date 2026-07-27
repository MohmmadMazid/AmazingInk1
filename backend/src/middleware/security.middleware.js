/**
 * Security middleware. These wire the pure cores into the live request path — this is what
 * makes the security module *defend* the app rather than just report on it.
 */
import { ApiError } from '../utils/asyncHandler.js';
import { checkRateLimit } from '../core/security.js';
import * as security from '../modules/security/security.service.js';

/* ------------------------------- rate limit ------------------------------ */
/**
 * Fixed-window rate limiter. State lives in memory here; swap the `store` for Redis in
 * production (the pure core already returns the next state, so nothing else changes).
 */
const store = new Map();

export const rateLimit = ({ windowSec = 60, maxRequests = 100, keyBy = 'ip' } = {}) => (req, res, next) => {
  const key = `${keyBy}:${keyBy === 'user' ? req.user?.id ?? req.ip : req.ip}:${req.baseUrl}`;
  const result = checkRateLimit(store.get(key) ?? null, { windowSec, maxRequests }, Date.now());
  store.set(key, result.state);

  res.setHeader('X-RateLimit-Limit', maxRequests);
  res.setHeader('X-RateLimit-Remaining', result.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAtMs / 1000));

  if (!result.allowed) {
    res.setHeader('Retry-After', result.retryAfterSec);
    if (req.user?.orgId) {
      security.recordEvent(req.user.orgId, { type: 'RATE_LIMITED', userId: req.user.id, ip: req.ip, detail: { path: req.originalUrl } }).catch(() => {});
    }
    return next(new ApiError(429, 'Too many requests', 'rate_limited'));
  }
  next();
};

/* ----------------------------- IP allowlist ------------------------------ */
/** Blocks requests from IPs outside the org's allowlist (empty allowlist = allow all). */
export const ipAllowlist = async (req, _res, next) => {
  if (!req.user?.orgId) return next();
  try {
    const allowed = await security.checkIp(req.user.orgId, req.ip);
    if (allowed) return next();
    await security.recordEvent(req.user.orgId, { type: 'IP_BLOCKED', userId: req.user.id, ip: req.ip });
    next(new ApiError(403, 'IP address not allowed', 'ip_blocked'));
  } catch (e) { next(e); }
};

/* ---------------------------- security headers --------------------------- */
/** Baseline headers. `helmet` covers most of this; these are the explicit few we assert. */
export const securityHeaders = (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
};

/* --------------------------- permission auditing ------------------------- */
/** Records PERMISSION_DENIED events so the dashboard sees authorization failures. */
export const auditPermissionDenials = (err, req, _res, next) => {
  if (err?.status === 403 && req.user?.orgId) {
    security.recordEvent(req.user.orgId, {
      type: 'PERMISSION_DENIED', userId: req.user.id, ip: req.ip,
      detail: { path: req.originalUrl, message: err.message },
    }).catch(() => {});
  }
  next(err);
};
