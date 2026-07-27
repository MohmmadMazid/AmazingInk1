import { z } from 'zod';
import * as service from './analytics.service.js';
import { ok, created } from '../../utils/envelope.js';

const rangeQuery = (q) => ({ preset: q.preset, from: q.from, to: q.to });
const savedSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['SALES', 'PRODUCTS', 'CUSTOMERS', 'INVENTORY', 'FINANCE', 'CHANNELS']),
  params: z.record(z.any()).optional(),
});

export async function dashboard(req, res) {
  ok(res, await service.dashboard(req.user.orgId, { ...rangeQuery(req.query), grain: req.query.grain, compare: req.query.compare, channel: req.query.channel }));
}
export async function pnl(req, res) { ok(res, await service.pnl(req.user.orgId, rangeQuery(req.query))); }
export async function byChannel(req, res) { ok(res, await service.byChannel(req.user.orgId, rangeQuery(req.query))); }
export async function topProducts(req, res) { ok(res, await service.topProducts(req.user.orgId, { ...rangeQuery(req.query), limit: req.query.limit ? Number(req.query.limit) : 10 })); }
export async function inventoryValuation(req, res) { ok(res, await service.inventoryValuation(req.user.orgId)); }

export async function rebuildRollups(req, res) { ok(res, await service.rebuildRollups(req.user.orgId, rangeQuery(req.body ?? {}))); }

export async function exportCsv(req, res) {
  const csv = await service.exportCsv(req.user.orgId, String(req.params.type).toUpperCase(), rangeQuery(req.query));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.type.toLowerCase()}.csv"`);
  res.send(csv);
}

export async function listSavedReports(req, res) { ok(res, await service.listSavedReports(req.user.orgId)); }
export async function createSavedReport(req, res) { created(res, await service.createSavedReport(req.user.orgId, savedSchema.parse(req.body), req.user.id)); }
export async function removeSavedReport(req, res) { ok(res, await service.removeSavedReport(req.user.orgId, req.params.id)); }
