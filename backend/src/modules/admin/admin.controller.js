import { z } from 'zod';
import * as service from './admin.service.js';
import { ok, created, paginated, pageParams } from '../../utils/envelope.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'invalid id');
const settingSchema = z.object({ namespace: z.string().min(1), key: z.string().min(1), value: z.any() });
const credentialSchema = z.object({
  name: z.string().min(1), scopes: z.array(z.string()).optional(),
  env: z.enum(['live', 'test']).optional(), expiresAt: z.string().datetime().optional(),
});
const webhookSchema = z.object({ url: z.string().url(), events: z.array(z.string()).min(1) });
const flagSchema = z.object({
  key: z.string().min(1), description: z.string().optional(), enabled: z.boolean().optional(),
  audience: z.enum(['ALL', 'ROLE', 'PERCENTAGE', 'USERS']).optional(),
  rolloutPct: z.number().int().min(0).max(100).optional(),
  roleFilter: z.string().nullable().optional(), userIds: z.array(z.string()).optional(),
});
const roleSchema = z.object({ name: z.string().min(1), description: z.string().optional(), permissions: z.array(z.string()) });
const userSchema = z.object({ roles: z.array(z.string()).optional(), permissions: z.array(z.string()).optional(), active: z.boolean().optional() });

const actor = (req) => ({ id: req.user.id, email: req.user.email });

export async function getSettings(req, res) { ok(res, await service.getSettings(req.user.orgId, req.query.namespace)); }
export async function setSetting(req, res) { ok(res, await service.setSetting(req.user.orgId, settingSchema.parse(req.body), actor(req))); }

export async function listAudit(req, res) {
  const { page, limit, skip } = pageParams(req.query);
  const { data, total } = await service.listAudit(req.user.orgId, { skip, limit, resource: req.query.resource, action: req.query.action, kind: req.query.kind });
  paginated(res, data, { total, page, limit });
}

export async function listCredentials(req, res) { ok(res, await service.listCredentials(req.user.orgId)); }
export async function createCredential(req, res) { created(res, await service.createCredential(req.user.orgId, credentialSchema.parse(req.body), actor(req))); }
export async function revokeCredential(req, res) { ok(res, await service.revokeCredential(req.user.orgId, req.params.id, actor(req))); }

export async function listWebhooks(req, res) { ok(res, await service.listWebhooks(req.user.orgId)); }
export async function createWebhook(req, res) { created(res, await service.createWebhook(req.user.orgId, webhookSchema.parse(req.body), actor(req))); }
export async function removeWebhook(req, res) { ok(res, await service.removeWebhook(req.user.orgId, req.params.id, actor(req))); }
export async function testWebhook(req, res) {
  const event = z.object({ event: z.string() }).parse(req.body).event;
  ok(res, await service.dispatchWebhook(req.user.orgId, event, { test: true, at: new Date().toISOString() }));
}

export async function listFlags(req, res) { ok(res, await service.listFlags(req.user.orgId)); }
export async function upsertFlag(req, res) { ok(res, await service.upsertFlag(req.user.orgId, flagSchema.parse(req.body), actor(req))); }
export async function evaluateFlags(req, res) { ok(res, await service.evaluateFlags(req.user.orgId, { userId: req.user.id, role: req.user.roles?.[0] })); }

export async function listRoles(req, res) { ok(res, await service.listRoles(req.user.orgId)); }
export async function permissionCatalog(req, res) { ok(res, service.permissionCatalog()); }
export async function upsertRole(req, res) { ok(res, await service.upsertRole(req.user.orgId, roleSchema.parse(req.body), actor(req))); }
export async function removeRole(req, res) { ok(res, await service.removeRole(req.user.orgId, req.params.id, actor(req))); }

export async function listUsers(req, res) { ok(res, await service.listUsers(req.user.orgId)); }
export async function updateUser(req, res) { ok(res, await service.updateUser(req.user.orgId, req.params.id, userSchema.parse(req.body), actor(req))); }
export async function effectivePermissions(req, res) { ok(res, await service.effectivePermissions(req.user.orgId, req.params.id)); }

export async function checkPassword(req, res) {
  const password = z.object({ password: z.string() }).parse(req.body).password;
  ok(res, await service.checkPassword(req.user.orgId, password));
}
