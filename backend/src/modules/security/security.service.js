import { SecurityEvent } from '../../models/security-event.model.js';
import { LoginAttempt, AccountLockout } from '../../models/login-attempt.model.js';
import { UserSession } from '../../models/user-session.model.js';
import { RateLimitPolicy, IpAllowlistEntry } from '../../models/access-policy.model.js';
import { DataRetentionPolicy, GdprRequest, ComplianceControl } from '../../models/privacy.model.js';
import { Customer } from '../../models/customer.model.js';
import { Order } from '../../models/order.model.js';
import { ApiError } from '../../utils/asyncHandler.js';
import {
  DEFAULT_LOCKOUT, STARTER_CONTROLS, anonymize, buildErasurePlan, buildExportManifest,
  classifyEvent, complianceGaps, detectBruteForce, deviceLabel, distinctIpsInWindow,
  dueForDeletion, evaluateLockout, generateSecret, hashToken, ipAllowed, isLocked,
  readinessLabel, redactPii, riskScore, scoreControls, sessionsToEvict,
} from '../../core/security.js';

const SESSION_CAP = 5;
const SESSION_TTL_MS = 7 * 86_400_000;

/* --------------------------------- events -------------------------------- */
/** Record a security event; severity is derived, never passed in. Exported for all modules. */
export async function recordEvent(orgId, { type, userId, email, ip, userAgent, detail, risk }) {
  return SecurityEvent.create({
    organizationId: orgId, type, severity: classifyEvent(type),
    userId, email, ip, userAgent, detail, riskScore: risk,
  });
}

export async function listEvents(orgId, { skip, limit, severity, type }) {
  const where = { organizationId: orgId };
  if (severity) where.severity = severity;
  if (type) where.type = type;
  const [data, total] = await Promise.all([
    SecurityEvent.find(where).sort({ createdAt: -1 }).skip(skip).limit(limit),
    SecurityEvent.countDocuments(where),
  ]);
  return { data, total };
}

/* ---------------------------- auth / lockout ----------------------------- */
/**
 * Record a login attempt and evaluate lockout. Consecutive-recent failures lock the
 * account; a success resets the streak. Also runs brute-force and risk scoring.
 */
export async function recordLoginAttempt(orgId, { email, success, ip, userAgent, reason }) {
  await LoginAttempt.create({ organizationId: orgId, email, success, ip, userAgent, reason });

  const since = new Date(Date.now() - DEFAULT_LOCKOUT.windowSec * 1000);
  const recent = await LoginAttempt.find({ email, createdAt: { $gte: since } }).sort({ createdAt: 1 }).lean();
  const points = recent.map((a) => ({ at: a.createdAt.getTime(), success: a.success, ip: a.ip }));
  const now = Date.now();

  const lock = evaluateLockout(points, now);
  const brute = detectBruteForce(points, now);
  const distinctIps = distinctIpsInWindow(points, now);
  const risk = riskScore({ failures: lock.failedCount, distinctIps, newDevice: false, offHours: false });

  await recordEvent(orgId, { type: success ? 'LOGIN_SUCCESS' : 'LOGIN_FAILURE', email, ip, userAgent, risk });

  if (lock.locked) {
    await AccountLockout.findOneAndUpdate(
      { email },
      { $set: { organizationId: orgId, lockedUntil: new Date(lock.lockedUntilMs), failedCount: lock.failedCount } },
      { upsert: true },
    );
    await recordEvent(orgId, { type: 'LOCKOUT', email, ip, detail: { failedCount: lock.failedCount }, risk });
  } else if (success) {
    await AccountLockout.deleteOne({ email });
  }

  return { locked: lock.locked, failedCount: lock.failedCount, bruteForce: brute, distinctIps, riskScore: risk };
}

/** Is this account currently locked? Called before password verification. */
export async function lockStatus(email) {
  const row = await AccountLockout.findOne({ email });
  const locked = isLocked(row?.lockedUntil?.getTime(), Date.now());
  return { locked, lockedUntil: locked ? row.lockedUntil : null, failedCount: row?.failedCount ?? 0 };
}

export async function clearLockout(orgId, email) {
  await AccountLockout.deleteOne({ email });
  await recordEvent(orgId, { type: 'PASSWORD_CHANGED', email, detail: { action: 'lockout cleared' } });
  return { email, cleared: true };
}

export const loginHistory = (email, limit = 50) => LoginAttempt.find({ email }).sort({ createdAt: -1 }).limit(limit);

/* -------------------------------- sessions ------------------------------- */
/** Create a session; only the token hash is stored, and the concurrent cap evicts the oldest. */
export async function createSession(orgId, userId, { ip, userAgent }) {
  const token = generateSecret();
  const existing = await UserSession.find({ organizationId: orgId, userId, status: 'ACTIVE' }).lean();
  const evict = sessionsToEvict(existing.map((s) => ({ id: s._id.toString(), lastSeenAt: s.lastSeenAt.getTime() })), SESSION_CAP - 1);
  if (evict.length) {
    await UserSession.updateMany({ _id: { $in: evict.map((e) => e.id) } }, { $set: { status: 'REVOKED', revokedAt: new Date() } });
    await recordEvent(orgId, { type: 'SESSION_REVOKED', userId, detail: { reason: 'concurrent session cap', count: evict.length } });
  }

  const session = await UserSession.create({
    organizationId: orgId, userId, tokenHash: hashToken(token), ip, userAgent,
    deviceLabel: deviceLabel(userAgent), expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  return { session, token };   // raw token returned once
}

export const listSessions = (orgId, userId) => UserSession.find({ organizationId: orgId, userId }).sort({ lastSeenAt: -1 });

export async function revokeSession(orgId, id) {
  const s = await UserSession.findOneAndUpdate(
    { _id: id, organizationId: orgId }, { $set: { status: 'REVOKED', revokedAt: new Date() } }, { new: true },
  );
  if (!s) throw new ApiError(404, 'Session not found', 'not_found');
  await recordEvent(orgId, { type: 'SESSION_REVOKED', userId: s.userId, detail: { sessionId: id } });
  return { id, revoked: true };
}

export async function revokeAllSessions(orgId, userId) {
  const r = await UserSession.updateMany({ organizationId: orgId, userId, status: 'ACTIVE' }, { $set: { status: 'REVOKED', revokedAt: new Date() } });
  await recordEvent(orgId, { type: 'SESSION_REVOKED', userId, detail: { all: true, count: r.modifiedCount } });
  return { revoked: r.modifiedCount };
}

/* ----------------------------- access control ---------------------------- */
export const listRateLimitPolicies = (orgId) => RateLimitPolicy.find({ organizationId: orgId }).sort({ createdAt: -1 });
export const upsertRateLimitPolicy = (orgId, body) =>
  RateLimitPolicy.findOneAndUpdate({ organizationId: orgId, name: body.name }, { $set: { ...body, organizationId: orgId } }, { new: true, upsert: true });

export const listIpAllowlist = (orgId) => IpAllowlistEntry.find({ organizationId: orgId }).sort({ createdAt: -1 });
export const addIpEntry = (orgId, body) => IpAllowlistEntry.create({ ...body, organizationId: orgId });
export async function removeIpEntry(orgId, id) {
  const e = await IpAllowlistEntry.findOneAndDelete({ _id: id, organizationId: orgId });
  if (!e) throw new ApiError(404, 'Entry not found', 'not_found');
  return { id, deleted: true };
}

/** Is an IP permitted? An empty allowlist means allow-all. Used by the guard middleware. */
export async function checkIp(orgId, ip) {
  const entries = await IpAllowlistEntry.find({ organizationId: orgId, enabled: true }).lean();
  return ipAllowed(ip, entries.map((e) => e.cidr));
}

/* -------------------------------- retention ------------------------------ */
export const listRetentionPolicies = (orgId) => DataRetentionPolicy.find({ organizationId: orgId });
export const upsertRetentionPolicy = (orgId, body) =>
  DataRetentionPolicy.findOneAndUpdate({ organizationId: orgId, entity: body.entity }, { $set: { ...body, organizationId: orgId } }, { new: true, upsert: true });

const RETENTION_MODELS = { SecurityEvent, LoginAttempt };

/** Apply every enabled retention policy: delete or anonymize records past their TTL. */
export async function runRetention(orgId) {
  const policies = await DataRetentionPolicy.find({ organizationId: orgId, enabled: true });
  const results = [];
  for (const p of policies) {
    const Model = RETENTION_MODELS[p.entity];
    if (!Model) { results.push({ entity: p.entity, skipped: 'no model' }); continue; }

    const records = await Model.find({ organizationId: orgId }).select('_id createdAt').lean();
    const ids = dueForDeletion(records.map((r) => ({ id: r._id.toString(), createdAt: r.createdAt.getTime() })), p.ttlDays, Date.now());

    if (!ids.length) { results.push({ entity: p.entity, affected: 0 }); continue; }

    if (p.action === 'DELETE') {
      await Model.deleteMany({ _id: { $in: ids } });
    } else {
      for (const id of ids) {
        const doc = await Model.findById(id).lean();
        await Model.updateOne({ _id: id }, { $set: anonymize(doc, p.piiFields) });
      }
    }
    p.lastRunAt = new Date();
    await p.save();
    results.push({ entity: p.entity, action: p.action, affected: ids.length });
  }
  return { policies: policies.length, results };
}

/* ---------------------------------- GDPR --------------------------------- */
export const listGdprRequests = (orgId) => GdprRequest.find({ organizationId: orgId }).sort({ createdAt: -1 });
export const createGdprRequest = (orgId, body, userId) => GdprRequest.create({ ...body, organizationId: orgId, requestedBy: userId });

/** Subject access / portability: gather everything about a subject, PII intact for the subject. */
export async function processAccessRequest(orgId, id) {
  const req = await GdprRequest.findOne({ _id: id, organizationId: orgId });
  if (!req) throw new ApiError(404, 'Request not found', 'not_found');

  const customer = await Customer.findOne({ organizationId: orgId, email: req.subjectEmail }).lean();
  const orders = customer ? await Order.find({ organizationId: orgId, customerId: customer._id }).lean() : [];
  const logins = await LoginAttempt.find({ email: req.subjectEmail }).lean();

  const manifest = buildExportManifest(req.subjectEmail, [
    { source: 'customer', records: customer ? [customer] : [] },
    { source: 'orders', records: orders },
    { source: 'loginAttempts', records: logins },
  ]);

  req.status = 'COMPLETED';
  req.result = manifest;
  req.completedAt = new Date();
  await req.save();
  await recordEvent(orgId, { type: 'DATA_EXPORT', email: req.subjectEmail, detail: { totalRecords: manifest.totalRecords } });
  return manifest;
}

/** Erasure: a plan first, then execute (customer anonymized, orders retained for accounting). */
export async function processErasureRequest(orgId, id, { dryRun = true } = {}) {
  const req = await GdprRequest.findOne({ _id: id, organizationId: orgId });
  if (!req) throw new ApiError(404, 'Request not found', 'not_found');

  const customer = await Customer.findOne({ organizationId: orgId, email: req.subjectEmail });
  const logins = await LoginAttempt.find({ email: req.subjectEmail }).select('_id').lean();

  const plan = buildErasurePlan([
    { source: 'customer', strategy: 'anonymize', ids: customer ? [customer._id.toString()] : [] },
    { source: 'loginAttempts', strategy: 'delete', ids: logins.map((l) => l._id.toString()) },
  ]);

  if (dryRun) return { dryRun: true, plan };

  if (customer) {
    Object.assign(customer, anonymize(customer.toObject(), ['email', 'firstName', 'lastName', 'phone']));
    customer.email = `erased_${customer._id}@invalid.local`;   // keep the unique index satisfied
    customer.deletedAt = new Date();
    await customer.save();
  }
  await LoginAttempt.deleteMany({ email: req.subjectEmail });

  req.status = 'COMPLETED';
  req.result = plan;
  req.completedAt = new Date();
  await req.save();
  await recordEvent(orgId, { type: 'DATA_DELETION', email: req.subjectEmail, detail: plan });
  return { dryRun: false, plan };
}

/* -------------------------------- compliance ----------------------------- */
export const listControls = (orgId, framework) =>
  ComplianceControl.find({ organizationId: orgId, ...(framework ? { framework } : {}) }).sort({ controlId: 1 });

export async function seedFramework(orgId, framework) {
  const starters = STARTER_CONTROLS[framework];
  if (!starters) throw new ApiError(400, `No starter checklist for ${framework}`, 'validation');
  for (const c of starters) {
    await ComplianceControl.findOneAndUpdate(
      { organizationId: orgId, framework, controlId: c.controlId },
      { $setOnInsert: { organizationId: orgId, framework, ...c } },
      { upsert: true },
    );
  }
  return { framework, seeded: starters.length };
}

export const updateControl = (orgId, id, body) =>
  ComplianceControl.findOneAndUpdate({ _id: id, organizationId: orgId }, { $set: body }, { new: true });

/** Readiness report: score, label, and prioritized gaps. */
export async function complianceReport(orgId, framework) {
  const controls = await ComplianceControl.find({ organizationId: orgId, framework }).lean();
  const score = scoreControls(controls);
  return {
    framework, ...score,
    readiness: readinessLabel(score.score),
    gaps: complianceGaps(controls).map((c) => ({ controlId: c.controlId, title: c.title, status: c.status })),
  };
}

/* -------------------------------- dashboard ------------------------------ */
export async function dashboard(orgId) {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [bySeverity, recent, activeSessions, lockouts, frameworks] = await Promise.all([
    SecurityEvent.aggregate([
      { $match: { organizationId: orgId, createdAt: { $gte: since } } },
      { $group: { _id: '$severity', count: { $sum: 1 } } },
    ]),
    SecurityEvent.find({ organizationId: orgId }).sort({ createdAt: -1 }).limit(10).lean(),
    UserSession.countDocuments({ organizationId: orgId, status: 'ACTIVE' }),
    AccountLockout.countDocuments({ lockedUntil: { $gt: new Date() } }),
    ComplianceControl.distinct('framework', { organizationId: orgId }),
  ]);

  const reports = await Promise.all(frameworks.map((f) => complianceReport(orgId, f)));
  return {
    eventsBySeverity: Object.fromEntries(bySeverity.map((b) => [b._id, b.count])),
    recentEvents: recent,
    activeSessions, activeLockouts: lockouts,
    compliance: reports.map((r) => ({ framework: r.framework, score: r.score, readiness: r.readiness })),
  };
}

/** Redact PII from any payload — exported so other modules can sanitize before logging. */
export { redactPii };
