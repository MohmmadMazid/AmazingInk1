import { z } from 'zod';
import * as service from './notifications.service.js';
import { ok, created, paginated, pageParams } from '../../utils/envelope.js';

const CHANNELS = ['IN_APP', 'EMAIL', 'SMS', 'PUSH'];
const settingsSchema = z.object({
  inAppEnabled: z.boolean().optional(), emailEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(), pushEnabled: z.boolean().optional(),
  quietHoursStart: z.number().int().min(0).max(1439).nullable().optional(),
  quietHoursEnd: z.number().int().min(0).max(1439).nullable().optional(),
  digest: z.enum(['NONE', 'DAILY', 'WEEKLY']).optional(),
  digestHour: z.number().int().min(0).max(23).optional(),
  preferences: z.array(z.object({ category: z.string(), channel: z.enum(CHANNELS), enabled: z.boolean() })).optional(),
});
const templateSchema = z.object({
  key: z.string().min(1), category: z.string().min(1),
  subject: z.string().optional(), bodyText: z.string().min(1), bodyHtml: z.string().optional(),
  active: z.boolean().optional(),
});
const emitSchema = z.object({
  userId: z.string().optional(), category: z.string().min(1),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  templateKey: z.string().optional(), vars: z.record(z.any()).optional(),
  title: z.string().optional(), body: z.string().optional(),
  entityType: z.string().optional(), entityId: z.string().optional(),
});

export async function getSettings(req, res) { ok(res, await service.getSettings(req.user.orgId, req.user.id)); }
export async function updateSettings(req, res) { ok(res, await service.updateSettings(req.user.orgId, req.user.id, settingsSchema.parse(req.body))); }

export async function listTemplates(req, res) { ok(res, await service.listTemplates(req.user.orgId)); }
export async function createTemplate(req, res) { created(res, await service.createTemplate(req.user.orgId, templateSchema.parse(req.body))); }
export async function previewTemplate(req, res) { ok(res, await service.previewTemplate(req.user.orgId, req.params.key, req.body?.vars)); }

export async function emit(req, res) {
  const dto = emitSchema.parse(req.body);
  created(res, await service.emit(req.user.orgId, { ...dto, userId: dto.userId ?? req.user.id }));
}
export async function broadcast(req, res) { ok(res, await service.broadcast(req.user.orgId, emitSchema.omit({ userId: true }).parse(req.body))); }

export async function inbox(req, res) {
  const { page, limit, skip } = pageParams(req.query);
  const { data, total, unread } = await service.inbox(req.user.orgId, req.user.id, { skip, limit, unreadOnly: req.query.unreadOnly === 'true' });
  res.json({ success: true, data, meta: { total, page, limit, pages: Math.ceil(total / limit), unread } });
}
export async function markRead(req, res) { ok(res, await service.markRead(req.user.orgId, req.user.id, req.params.id)); }
export async function markAllRead(req, res) { ok(res, await service.markAllRead(req.user.orgId, req.user.id)); }

export async function pendingDigest(req, res) { ok(res, await service.pendingDigest(req.user.orgId, req.user.id)); }
export async function sendDigest(req, res) { ok(res, await service.sendDigest(req.user.orgId, req.user.id)); }
export async function providerOutbox(req, res) { ok(res, service.providerOutbox()); }
