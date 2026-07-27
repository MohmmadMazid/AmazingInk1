import { z } from 'zod';
import * as service from './imports.service.js';
import { ok } from '../../utils/envelope.js';

// The browser reads the file with FileReader and posts its TEXT — no multipart, no multer.
const MAX_BYTES = 5 * 1024 * 1024;
const csvSchema = z.object({
  csv: z.string().min(1).max(MAX_BYTES, 'File too large (5MB limit)'),
  mapping: z.record(z.string()).optional(),
  applyStock: z.boolean().optional(),
});

export async function columns(req, res) { ok(res, service.columnSpec()); }

export async function preview(req, res) {
  const { csv, mapping } = csvSchema.parse(req.body);
  ok(res, await service.preview(req.user.orgId, csv, mapping));
}

export async function commit(req, res) {
  const { csv, mapping, applyStock } = csvSchema.parse(req.body);
  ok(res, await service.commit(req.user.orgId, csv, { mapping, applyStock, actorId: req.user.id }));
}

export async function template(req, res) {
  const csv = await service.template(req.user.orgId);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="product-import-template.csv"');
  res.send(csv);
}

export async function exportProducts(req, res) {
  const csv = await service.exportProducts(req.user.orgId);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="products.csv"');
  res.send(csv);
}
