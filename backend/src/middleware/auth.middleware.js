import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from '../utils/asyncHandler.js';

/** Verifies the Bearer JWT and attaches req.user = { id, orgId, roles, permissions }. */
export function requireAuth(req, _res, next) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new ApiError(401, 'Authentication required', 'unauthenticated'));
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    req.user = { id: payload.sub, orgId: payload.orgId, roles: payload.roles ?? [], permissions: payload.permissions ?? [] };
    next();
  } catch {
    next(new ApiError(401, 'Invalid or expired token', 'unauthenticated'));
  }
}
