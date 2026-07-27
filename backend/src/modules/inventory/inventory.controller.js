import { z } from 'zod';
import * as service from './inventory.service.js';
import { ok, created, paginated, pageParams } from '../../utils/envelope.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'invalid id');
const warehouseSchema = z.object({ code: z.string().min(1), name: z.string().min(1), address: z.string().optional() });
const adjustSchema = z.object({
  productId: objectId, warehouseId: objectId,
  delta: z.number().int().refine((n) => n !== 0, 'delta must be non-zero'),
  reason: z.enum(['PURCHASE', 'SALE', 'RETURN', 'DAMAGE', 'COUNT', 'TRANSFER', 'CORRECTION']).optional(),
  note: z.string().optional(),
});
const reserveSchema = z.object({
  productId: objectId, warehouseId: objectId,
  quantity: z.number().int().positive(),
  orderId: objectId.optional(),
  expiresAt: z.string().datetime().optional(),
});

export async function listWarehouses(req, res) { ok(res, await service.listWarehouses(req.user.orgId)); }
export async function createWarehouse(req, res) { created(res, await service.createWarehouse(req.user.orgId, warehouseSchema.parse(req.body))); }

export async function listLevels(req, res) {
  const { page, limit, skip } = pageParams(req.query);
  const { data, total } = await service.listLevels(req.user.orgId, { skip, limit, warehouseId: req.query.warehouseId, lowOnly: req.query.lowOnly === 'true' });
  paginated(res, data, { total, page, limit });
}

export async function adjust(req, res) {
  ok(res, await service.adjust(req.user.orgId, { ...adjustSchema.parse(req.body), actorId: req.user.id }));
}
export async function reserve(req, res) {
  created(res, await service.reserve(req.user.orgId, { ...reserveSchema.parse(req.body), actorId: req.user.id }));
}
export async function release(req, res) { ok(res, await service.release(req.user.orgId, req.params.id, req.user.id)); }
export async function fulfill(req, res) { ok(res, await service.fulfill(req.user.orgId, req.params.id, req.user.id)); }

export async function history(req, res) {
  const { page, limit, skip } = pageParams(req.query);
  const { data, total } = await service.history(req.user.orgId, { productId: req.query.productId, skip, limit });
  paginated(res, data, { total, page, limit });
}
export async function forecast(req, res) {
  ok(res, await service.forecastProduct(req.user.orgId, req.params.productId, req.query.windowDays ? Number(req.query.windowDays) : 30));
}
export async function reorderReport(req, res) { ok(res, await service.reorderReport(req.user.orgId)); }
