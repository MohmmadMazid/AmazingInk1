import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../../models/user.model.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/asyncHandler.js';
import * as security from '../security/security.service.js';

function sign(user) {
  return jwt.sign(
    { sub: user._id.toString(), orgId: user.organizationId, roles: user.roles, permissions: user.permissions },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn },
  );
}

export async function register({ organizationId, email, password, firstName, lastName, permissions }) {
  const existing = await User.findOne({ organizationId, email: email.toLowerCase() });
  if (existing) throw new ApiError(409, 'Email already registered', 'conflict');
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ organizationId, email, passwordHash, firstName, lastName, permissions: permissions ?? [] });
  return { user, token: sign(user) };
}

/**
 * Login, guarded by the security module: the account lockout is checked BEFORE the password
 * is verified, and every attempt (success or failure) feeds the lockout / brute-force /
 * risk-scoring pipeline. This is what makes the security module defend rather than observe.
 */
export async function login({ email, password, ip, userAgent }) {
  const normalized = email.toLowerCase();

  // 1) Refuse locked accounts up front — no password check, no timing signal.
  const lock = await security.lockStatus(normalized);
  if (lock.locked) {
    throw new ApiError(423, `Account locked until ${lock.lockedUntil.toISOString()}`, 'account_locked');
  }

  const user = await User.findOne({ email: normalized, deletedAt: null }).select('+passwordHash');
  const okPw = user && user.active && (await bcrypt.compare(password, user.passwordHash));

  // 2) Record the attempt either way; this is what trips the lockout.
  const orgId = user?.organizationId ?? 'unknown';
  const result = await security.recordLoginAttempt(orgId, {
    email: normalized, success: Boolean(okPw), ip, userAgent,
    reason: okPw ? undefined : 'invalid credentials',
  });

  if (!okPw) {
    const remaining = Math.max(0, 5 - result.failedCount);
    throw new ApiError(401, remaining ? `Invalid credentials (${remaining} attempts remaining)` : 'Invalid credentials', 'unauthenticated');
  }

  return { user, token: sign(user), security: { riskScore: result.riskScore } };
}

export async function me(userId) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'User not found', 'not_found');
  return user;
}
