import { z } from 'zod';
import * as service from './listings.service.js';
import { ok, created, paginated, pageParams } from '../../utils/envelope.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'invalid id');
const channelSchema = z.object({
  code: z.string().min(1), name: z.string().min(1),
  syncRule: z.object({
    allocation: z.enum(['SUM_ALL', 'PRIORITY_FILL']).optional(),
    bufferPercent: z.number().int().min(0).optional(), bufferQty: z.number().int().min(0).optional(),
    pushPercent: z.number().int().min(0).max(10000).optional(),
    minPush: z.number().int().min(0).optional(), maxPush: z.number().int().positive().nullable().optional(),
  }).optional(),
  priceRule: z.object({
    type: z.enum(['PASSTHROUGH', 'MARKUP_PERCENT', 'MARKUP_AMOUNT', 'FIXED']).optional(),
    value: z.number().int().optional(), rounding: z.enum(['NONE', 'CHARM_99', 'NEAREST_UNIT']).optional(),
  }).optional(),
  conflictPolicy: z.enum(['SYSTEM_WINS', 'MARKETPLACE_WINS', 'NEWEST_WINS']).optional(),
});
const publishSchema = z.object({ productId: objectId, channelId: objectId });

export async function listChannels(req, res) { ok(res, await service.listChannels(req.user.orgId)); }
export async function createChannel(req, res) { created(res, await service.createChannel(req.user.orgId, channelSchema.parse(req.body))); }

export async function listListings(req, res) {
  const { page, limit, skip } = pageParams(req.query);
  const { data, total } = await service.listListings(req.user.orgId, { skip, limit, channelId: req.query.channelId, status: req.query.status });
  paginated(res, data, { total, page, limit });
}
export async function publishListing(req, res) { created(res, await service.publishListing(req.user.orgId, publishSchema.parse(req.body))); }

export async function syncListing(req, res) { ok(res, await service.syncListing(req.user.orgId, req.params.id, { force: req.query.force === 'true' })); }
export async function syncAll(req, res) { ok(res, await service.syncAll(req.user.orgId)); }
export async function drainOutbox(req, res) { ok(res, await service.drainOutbox(req.user.orgId, {})); }

export async function listOutbox(req, res) { ok(res, await service.listOutbox(req.user.orgId, { status: req.query.status })); }
export async function listConflicts(req, res) { ok(res, await service.listConflicts(req.user.orgId)); }
