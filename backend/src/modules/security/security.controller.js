import { z } from 'zod';
import * as service from './security.service.js';
import { ok, created, paginated, pageParams } from '../../utils/envelope.js';

const rateLimitSchema = z.object({
  name: z.string().min(1), scope: z.enum(['IP', 'USER', 'API_KEY', 'ROUTE', 'GLOBAL']).optional(),
  routePattern: z.string().optional(), windowSec: z.number().int().positive().optional(),
  maxRequests: z.number().int().positive().optional(), enabled: z.boolean().optional(),
});
const ipSchema = z.object({ cidr: z.string().min(7), label: z.string().optional() });
const retentionSchema = z.object({
  entity: z.string().min(1), ttlDays: z.number().int().min(1),
  action: z.enum(['DELETE', 'ANONYMIZE']).optional(), piiFields: z.array(z.string()).optional(),
});
const gdprSchema = z.object({ type: z.enum(['ACCESS', 'ERASURE', 'PORTABILITY', 'RECTIFICATION']), subjectEmail: z.string().email() });
const controlSchema = z.object({ status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'IMPLEMENTED', 'NOT_APPLICABLE']).optional(), owner: z.string().optional(), notes: z.string().optional() });

export async function dashboard(req, res) { ok(res, await service.dashboard(req.user.orgId)); }

export async function listEvents(req, res) {
  const { page, limit, skip } = pageParams(req.query);
  const { data, total } = await service.listEvents(req.user.orgId, { skip, limit, severity: req.query.severity, type: req.query.type });
  paginated(res, data, { total, page, limit });
}

export async function loginHistory(req, res) { ok(res, await service.loginHistory(String(req.query.email ?? req.user.email))); }
export async function lockStatus(req, res) { ok(res, await service.lockStatus(String(req.query.email))); }
export async function clearLockout(req, res) { ok(res, await service.clearLockout(req.user.orgId, String(req.body.email))); }

export async function listSessions(req, res) { ok(res, await service.listSessions(req.user.orgId, req.query.userId ?? req.user.id)); }
export async function revokeSession(req, res) { ok(res, await service.revokeSession(req.user.orgId, req.params.id)); }
export async function revokeAllSessions(req, res) { ok(res, await service.revokeAllSessions(req.user.orgId, req.body.userId ?? req.user.id)); }

export async function listRateLimitPolicies(req, res) { ok(res, await service.listRateLimitPolicies(req.user.orgId)); }
export async function upsertRateLimitPolicy(req, res) { ok(res, await service.upsertRateLimitPolicy(req.user.orgId, rateLimitSchema.parse(req.body))); }
export async function listIpAllowlist(req, res) { ok(res, await service.listIpAllowlist(req.user.orgId)); }
export async function addIpEntry(req, res) { created(res, await service.addIpEntry(req.user.orgId, ipSchema.parse(req.body))); }
export async function removeIpEntry(req, res) { ok(res, await service.removeIpEntry(req.user.orgId, req.params.id)); }

export async function listRetentionPolicies(req, res) { ok(res, await service.listRetentionPolicies(req.user.orgId)); }
export async function upsertRetentionPolicy(req, res) { ok(res, await service.upsertRetentionPolicy(req.user.orgId, retentionSchema.parse(req.body))); }
export async function runRetention(req, res) { ok(res, await service.runRetention(req.user.orgId)); }

export async function listGdprRequests(req, res) { ok(res, await service.listGdprRequests(req.user.orgId)); }
export async function createGdprRequest(req, res) { created(res, await service.createGdprRequest(req.user.orgId, gdprSchema.parse(req.body), req.user.id)); }
export async function processAccess(req, res) { ok(res, await service.processAccessRequest(req.user.orgId, req.params.id)); }
export async function processErasure(req, res) { ok(res, await service.processErasureRequest(req.user.orgId, req.params.id, { dryRun: req.query.dryRun !== 'false' })); }

export async function listControls(req, res) { ok(res, await service.listControls(req.user.orgId, req.query.framework)); }
export async function seedFramework(req, res) { ok(res, await service.seedFramework(req.user.orgId, String(req.body.framework))); }
export async function updateControl(req, res) { ok(res, await service.updateControl(req.user.orgId, req.params.id, controlSchema.parse(req.body))); }
export async function complianceReport(req, res) { ok(res, await service.complianceReport(req.user.orgId, String(req.params.framework))); }
