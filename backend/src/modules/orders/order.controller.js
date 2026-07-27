import { z } from 'zod';
import * as service from './order.service.js';
import { ok, created, paginated, pageParams } from '../../utils/envelope.js';

const createSchema = z.object({
  customerId: z.string().optional(),
  channel: z.enum(['web', 'amazon', 'ebay', 'pos']).optional(),
  lines: z.array(z.object({ productId: z.string().min(1), quantity: z.number().int().positive() })).min(1),
});
const statusSchema = z.object({ status: z.enum(['PENDING', 'PAID', 'FULFILLED', 'CANCELLED']) });

export async function list(req, res) {
  const { page, limit, skip } = pageParams(req.query);
  const { data, total } = await service.list(req.user.orgId, { skip, limit, status: req.query.status });
  paginated(res, data, { total, page, limit });
}
export async function get(req, res) { ok(res, await service.get(req.user.orgId, req.params.id)); }
export async function create(req, res) { created(res, await service.create(req.user.orgId, createSchema.parse(req.body))); }
export async function setStatus(req, res) { ok(res, await service.setStatus(req.user.orgId, req.params.id, statusSchema.parse(req.body).status)); }
