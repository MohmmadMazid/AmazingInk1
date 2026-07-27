import { z } from 'zod';
import * as service from './search.service.js';
import { ok, created } from '../../utils/envelope.js';

const ENTITY = z.enum(['PRODUCT', 'CUSTOMER', 'ORDER']);
const savedSchema = z.object({ name: z.string().min(1), entity: ENTITY, query: z.string().optional(), filters: z.record(z.any()).optional() });

export async function globalSearch(req, res) {
  const query = String(req.query.q ?? '');
  ok(res, await service.globalSearch(req.user.orgId, { query, size: Number(req.query.size ?? 5), userId: req.user.id }));
}

export async function search(req, res) {
  const entity = ENTITY.parse(String(req.params.entity).toUpperCase());
  const filters = req.query.filters ? JSON.parse(req.query.filters) : {};
  ok(res, await service.search(req.user.orgId, entity, {
    query: String(req.query.q ?? ''), filters,
    fuzzy: req.query.fuzzy !== 'false',
    from: Number(req.query.from ?? 0), size: Number(req.query.size ?? 20),
    userId: req.user.id,
  }));
}

export async function suggest(req, res) {
  const entity = ENTITY.parse(String(req.query.entity ?? 'PRODUCT').toUpperCase());
  ok(res, await service.suggest(req.user.orgId, entity, String(req.query.q ?? '')));
}

export async function reindexAll(req, res) { ok(res, await service.reindexAll(req.user.orgId)); }
export async function reindexEntity(req, res) { ok(res, await service.reindex(req.user.orgId, ENTITY.parse(String(req.params.entity).toUpperCase()))); }
export async function indexStatus(req, res) { ok(res, await service.indexStatus(req.user.orgId)); }

export async function listSynonyms(req, res) { ok(res, await service.listSynonyms(req.user.orgId)); }
export async function createSynonym(req, res) {
  const terms = z.object({ terms: z.array(z.string()).min(2) }).parse(req.body).terms;
  created(res, await service.createSynonym(req.user.orgId, terms));
}
export async function removeSynonym(req, res) { ok(res, await service.removeSynonym(req.user.orgId, req.params.id)); }

export async function listSavedSearches(req, res) { ok(res, await service.listSavedSearches(req.user.orgId, req.user.id)); }
export async function createSavedSearch(req, res) { created(res, await service.createSavedSearch(req.user.orgId, req.user.id, savedSchema.parse(req.body))); }
export async function removeSavedSearch(req, res) { ok(res, await service.removeSavedSearch(req.user.orgId, req.user.id, req.params.id)); }

export async function analytics(req, res) { ok(res, await service.searchAnalytics(req.user.orgId, { days: Number(req.query.days ?? 30) })); }
