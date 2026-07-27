import { OrgSetting } from '../../models/org-setting.model.js';
import { ApiCredential } from '../../models/api-credential.model.js';
import { WebhookEndpoint } from '../../models/webhook-endpoint.model.js';
import { AuditLog } from '../../models/audit-log.model.js';
import { FeatureFlag } from '../../models/feature-flag.model.js';
import { Role } from '../../models/role.model.js';
import { User } from '../../models/user.model.js';
import { ApiError } from '../../utils/asyncHandler.js';
import {
  DEFAULT_PASSWORD_POLICY, PERMISSION_CATALOG, computeDiff, evaluateFlag, generateApiKey,
  hashApiKey, invalidPermissions, maskKey, mergeRoles, signPayload, summarize, validatePassword,
} from '../../core/admin.js';

/* --------------------------------- audit --------------------------------- */
/**
 * Write an audit entry. Exported so ANY module can record a change:
 *   await writeAudit(orgId, { action:'update', resource:'Product', before, after, actor });
 * The diff is computed and secret-looking fields are redacted before persisting.
 */
export async function writeAudit(orgId, { action, resource, resourceId, before, after, actor, kind = 'CHANGE', ip }) {
  const diff = computeDiff(before ?? {}, after ?? {});
  return AuditLog.create({
    organizationId: orgId, kind, action, resource, resourceId,
    actorId: actor?.id, actorEmail: actor?.email,
    summary: summarize(action, resource, diff), diff, ip,
  });
}

export async function listAudit(orgId, { skip, limit, resource, action, kind }) {
  const where = { organizationId: orgId };
  if (resource) where.resource = resource;
  if (action) where.action = action;
  if (kind) where.kind = kind;
  const [data, total] = await Promise.all([
    AuditLog.find(where).sort({ createdAt: -1 }).skip(skip).limit(limit),
    AuditLog.countDocuments(where),
  ]);
  return { data, total };
}

/* -------------------------------- settings ------------------------------- */
export async function getSettings(orgId, namespace) {
  const where = { organizationId: orgId };
  if (namespace) where.namespace = namespace;
  const rows = await OrgSetting.find(where);
  const out = {};
  for (const r of rows) (out[r.namespace] ??= {})[r.key] = r.value;
  // Surface the effective password policy even when unset.
  out.security ??= {};
  out.security.passwordPolicy ??= DEFAULT_PASSWORD_POLICY;
  return out;
}

export async function setSetting(orgId, { namespace, key, value }, actor) {
  const existing = await OrgSetting.findOne({ organizationId: orgId, namespace, key });
  const row = await OrgSetting.findOneAndUpdate(
    { organizationId: orgId, namespace, key },
    { $set: { value, organizationId: orgId, namespace, key } },
    { new: true, upsert: true },
  );
  await writeAudit(orgId, { action: 'update', resource: 'OrgSetting', resourceId: `${namespace}.${key}`, before: { value: existing?.value }, after: { value }, actor });
  return row;
}

/* ------------------------------ credentials ------------------------------ */
/** Create a credential. Returns the plaintext key ONCE — it is never retrievable again. */
export async function createCredential(orgId, { name, scopes, env = 'live', expiresAt }, actor) {
  const { key, prefix, hash } = generateApiKey(env);
  const cred = await ApiCredential.create({
    organizationId: orgId, name, prefix, keyHash: hash, scopes: scopes ?? [],
    expiresAt, createdBy: actor?.id,
  });
  await writeAudit(orgId, { action: 'create', resource: 'ApiCredential', resourceId: cred._id.toString(), after: { name, scopes }, actor, kind: 'SECURITY' });
  return { credential: { ...cred.toObject(), maskedKey: maskKey(prefix) }, plaintextKey: key };
}

export async function listCredentials(orgId) {
  const rows = await ApiCredential.find({ organizationId: orgId }).sort({ createdAt: -1 });
  return rows.map((c) => ({ ...c.toObject(), keyHash: undefined, maskedKey: maskKey(c.prefix) }));
}

export async function revokeCredential(orgId, id, actor) {
  const cred = await ApiCredential.findOneAndUpdate({ _id: id, organizationId: orgId }, { $set: { status: 'REVOKED' } }, { new: true });
  if (!cred) throw new ApiError(404, 'Credential not found', 'not_found');
  await writeAudit(orgId, { action: 'revoke', resource: 'ApiCredential', resourceId: id, after: { status: 'REVOKED' }, actor, kind: 'SECURITY' });
  return { id, revoked: true };
}

/** Authenticate a raw API key (constant-time via hash lookup). */
export async function verifyCredential(rawKey) {
  const cred = await ApiCredential.findOne({ keyHash: hashApiKey(rawKey), status: 'ACTIVE' });
  if (!cred) return null;
  if (cred.expiresAt && cred.expiresAt < new Date()) return null;
  ApiCredential.updateOne({ _id: cred._id }, { $set: { lastUsedAt: new Date() } }).catch(() => {});
  return cred;
}

/* -------------------------------- webhooks ------------------------------- */
export const listWebhooks = (orgId) => WebhookEndpoint.find({ organizationId: orgId }).sort({ createdAt: -1 });

export async function createWebhook(orgId, { url, events }, actor) {
  const secret = `whsec_${generateApiKey('hook').key.slice(-32)}`;
  const hook = await WebhookEndpoint.create({ organizationId: orgId, url, events: events ?? [], secret });
  await writeAudit(orgId, { action: 'create', resource: 'WebhookEndpoint', resourceId: hook._id.toString(), after: { url, events }, actor });
  return hook;
}

export async function removeWebhook(orgId, id, actor) {
  const hook = await WebhookEndpoint.findOneAndDelete({ _id: id, organizationId: orgId });
  if (!hook) throw new ApiError(404, 'Webhook not found', 'not_found');
  await writeAudit(orgId, { action: 'delete', resource: 'WebhookEndpoint', resourceId: id, before: { url: hook.url }, actor });
  return { id, deleted: true };
}

/**
 * Dispatch an event to every subscribed endpoint, signing each payload with that endpoint's
 * secret (HMAC over `timestamp.body`, replay-protected). Exported so other modules can emit.
 */
export async function dispatchWebhook(orgId, event, payload) {
  const hooks = await WebhookEndpoint.find({ organizationId: orgId, active: true, events: event });
  const body = JSON.stringify({ event, data: payload, at: new Date().toISOString() });
  const ts = Math.floor(Date.now() / 1000);

  const results = [];
  for (const hook of hooks) {
    const signature = signPayload(hook.secret, body, ts);
    let record;
    try {
      const res = await fetch(hook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-MCCMS-Signature': signature },
        body,
        signal: AbortSignal.timeout(5000),
      });
      record = { event, status: res.ok ? 'SUCCESS' : 'FAILED', statusCode: res.status, signature };
    } catch (e) {
      record = { event, status: 'FAILED', error: e.message, signature };
    }
    hook.recentDeliveries.unshift(record);
    hook.recentDeliveries = hook.recentDeliveries.slice(0, 20);
    await hook.save();
    results.push({ url: hook.url, ...record });
  }
  return { event, endpoints: hooks.length, results };
}

/* ----------------------------- feature flags ----------------------------- */
export const listFlags = (orgId) => FeatureFlag.find({ organizationId: orgId }).sort({ key: 1 });

export async function upsertFlag(orgId, body, actor) {
  const before = await FeatureFlag.findOne({ organizationId: orgId, key: body.key });
  const flag = await FeatureFlag.findOneAndUpdate(
    { organizationId: orgId, key: body.key },
    { $set: { ...body, organizationId: orgId } },
    { new: true, upsert: true, runValidators: true },
  );
  await writeAudit(orgId, { action: before ? 'update' : 'create', resource: 'FeatureFlag', resourceId: body.key, before: before?.toObject(), after: flag.toObject(), actor });
  return flag;
}

/** Evaluate every flag for a user — the shape the frontend consumes. */
export async function evaluateFlags(orgId, ctx) {
  const flags = await FeatureFlag.find({ organizationId: orgId });
  const out = {};
  for (const f of flags) out[f.key] = evaluateFlag(f.key, f, ctx);
  return out;
}

/* --------------------------------- roles --------------------------------- */
export const listRoles = (orgId) => Role.find({ organizationId: orgId }).sort({ name: 1 });
export const permissionCatalog = () => PERMISSION_CATALOG;

export async function upsertRole(orgId, body, actor) {
  const bad = invalidPermissions(body.permissions ?? [], PERMISSION_CATALOG);
  if (bad.length) throw new ApiError(400, `Unknown permissions: ${bad.join(', ')}`, 'validation');

  const before = await Role.findOne({ organizationId: orgId, name: body.name });
  const role = await Role.findOneAndUpdate(
    { organizationId: orgId, name: body.name },
    { $set: { ...body, organizationId: orgId } },
    { new: true, upsert: true },
  );
  await writeAudit(orgId, { action: before ? 'update' : 'create', resource: 'Role', resourceId: role._id.toString(), before: { permissions: before?.permissions }, after: { permissions: role.permissions }, actor, kind: 'SECURITY' });
  return role;
}

export async function removeRole(orgId, id, actor) {
  const role = await Role.findOne({ _id: id, organizationId: orgId });
  if (!role) throw new ApiError(404, 'Role not found', 'not_found');
  if (role.system) throw new ApiError(400, 'System roles cannot be deleted', 'validation');
  await role.deleteOne();
  await writeAudit(orgId, { action: 'delete', resource: 'Role', resourceId: id, before: { name: role.name }, actor, kind: 'SECURITY' });
  return { id, deleted: true };
}

/** Recompute a user's effective permissions from their roles (wildcards expanded). */
export async function effectivePermissions(orgId, userId) {
  const user = await User.findOne({ _id: userId, organizationId: orgId });
  if (!user) throw new ApiError(404, 'User not found', 'not_found');
  const roles = await Role.find({ organizationId: orgId, name: { $in: user.roles ?? [] } });
  return { roles: user.roles, permissions: mergeRoles(roles, PERMISSION_CATALOG) };
}

/* --------------------------------- users --------------------------------- */
export const listUsers = (orgId) => User.find({ organizationId: orgId, deletedAt: null }).sort({ createdAt: -1 });

export async function updateUser(orgId, id, body, actor) {
  const before = await User.findOne({ _id: id, organizationId: orgId });
  if (!before) throw new ApiError(404, 'User not found', 'not_found');
  const user = await User.findOneAndUpdate({ _id: id, organizationId: orgId }, { $set: body }, { new: true });
  await writeAudit(orgId, { action: 'update', resource: 'User', resourceId: id, before: { roles: before.roles, permissions: before.permissions, active: before.active }, after: { roles: user.roles, permissions: user.permissions, active: user.active }, actor, kind: 'SECURITY' });
  return user;
}

/* ------------------------------ security --------------------------------- */
/** Check a candidate password against the org's effective policy. */
export async function checkPassword(orgId, password) {
  const settings = await getSettings(orgId, 'security');
  const policy = settings.security?.passwordPolicy ?? DEFAULT_PASSWORD_POLICY;
  const failures = validatePassword(password, policy);
  return { valid: failures.length === 0, failures, policy };
}
