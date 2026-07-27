import { z } from 'zod';
import * as service from './customer.service.js';
import { ok, created, paginated, pageParams } from '../../utils/envelope.js';

const createSchema = z.object({
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED']).optional(),
  tags: z.array(z.string()).optional(),
});
const noteSchema = z.object({ body: z.string().min(1), kind: z.enum(['NOTE', 'INTERNAL']).optional() });

export async function list(req, res) {
  const { page, limit, skip } = pageParams(req.query);
  const { data, total } = await service.list(req.user.orgId, { skip, limit, status: req.query.status, q: req.query.q });
  paginated(res, data, { total, page, limit });
}
export async function get(req, res) { ok(res, await service.get(req.user.orgId, req.params.id)); }
export async function create(req, res) { created(res, await service.create(req.user.orgId, createSchema.parse(req.body))); }
export async function update(req, res) { ok(res, await service.update(req.user.orgId, req.params.id, createSchema.partial().parse(req.body))); }
export async function remove(req, res) { ok(res, await service.remove(req.user.orgId, req.params.id)); }
export async function addNote(req, res) { created(res, await service.addNote(req.user.orgId, req.params.id, { ...noteSchema.parse(req.body), authorId: req.user.id })); }
export async function metrics(req, res) { ok(res, await service.metrics(req.user.orgId, req.params.id)); }
export async function duplicates(req, res) { ok(res, await service.duplicates(req.user.orgId, req.query.threshold ? Number(req.query.threshold) : 0.8)); }
