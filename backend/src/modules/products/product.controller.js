import { z } from 'zod';
import * as service from './product.service.js';
import { ok, created, paginated, pageParams } from '../../utils/envelope.js';

const moneySchema = z.object({ amountMinor: z.number().int().nonnegative(), currency: z.string().length(3) });
const createSchema = z.object({
  sku: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  price: moneySchema,
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
  barcode: z.string().optional(),
  weightGrams: z.number().optional(),
});

export async function list(req, res) {
  const { page, limit, skip } = pageParams(req.query);
  const { data, total } = await service.list(req.user.orgId, { skip, limit, status: req.query.status, q: req.query.q });
  paginated(res, data, { total, page, limit });
}
export async function get(req, res) { ok(res, await service.get(req.user.orgId, req.params.id)); }
export async function create(req, res) { created(res, await service.create(req.user.orgId, createSchema.parse(req.body))); }
export async function update(req, res) { ok(res, await service.update(req.user.orgId, req.params.id, createSchema.partial().parse(req.body))); }
export async function remove(req, res) { ok(res, await service.remove(req.user.orgId, req.params.id)); }
