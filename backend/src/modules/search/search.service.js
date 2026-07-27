import { Product } from '../../models/product.model.js';
import { Customer } from '../../models/customer.model.js';
import { Order } from '../../models/order.model.js';
import { SavedSearch } from '../../models/saved-search.model.js';
import { SearchSynonym } from '../../models/search-synonym.model.js';
import { SearchQueryLog } from '../../models/search-query-log.model.js';
import { ApiError } from '../../utils/asyncHandler.js';
import { ENGINE, INDEX_REGISTRY, engineName } from '../../adapters/search.registry.js';
import { expandSynonyms, highlight, looksLikeBarcode, snippet, tokenize, validateBarcode } from '../../core/search.js';

const ENTITIES = Object.keys(INDEX_REGISTRY);

/* -------------------------------- indexing ------------------------------- */
/** Project a mongo doc into the flat shape the engine indexes. */
function project(entity, d) {
  switch (entity) {
    case 'PRODUCT': return { id: d._id.toString(), sku: d.sku, title: d.title, description: d.description ?? '', status: d.status, barcode: d.barcode ?? '', priceMinor: d.price?.amountMinor ?? 0 };
    case 'CUSTOMER': return { id: d._id.toString(), email: d.email, firstName: d.firstName ?? '', lastName: d.lastName ?? '', status: d.status };
    case 'ORDER': return { id: d._id.toString(), orderNumber: d.orderNumber, channel: d.channel, status: d.status, totalMinor: d.totalMinor };
    default: return { id: d._id.toString() };
  }
}

const SOURCE = { PRODUCT: Product, CUSTOMER: Customer, ORDER: Order };

/** Rebuild one entity's index from MongoDB. Idempotent. */
export async function reindex(orgId, entity) {
  const Model = SOURCE[entity];
  if (!Model) throw new ApiError(400, `Unknown entity ${entity}`, 'validation');
  await ENGINE.clear(entity, orgId);
  const docs = await Model.find({ organizationId: orgId, deletedAt: null }).lean();
  const indexed = await ENGINE.bulkIndex(entity, orgId, docs.map((d) => project(entity, d)));
  return { entity, indexed, engine: engineName() };
}

export async function reindexAll(orgId) {
  const results = [];
  for (const e of ENTITIES) results.push(await reindex(orgId, e));
  return { engine: engineName(), results };
}

/** Index a single document — call this from other modules on create/update. */
export async function indexDoc(orgId, entity, doc) {
  return ENGINE.index(entity, orgId, project(entity, doc));
}
export const removeDoc = (orgId, entity, id) => ENGINE.remove(entity, orgId, String(id));

export async function indexStatus(orgId) {
  const out = {};
  for (const e of ENTITIES) out[e] = await ENGINE.count(e, orgId);
  return { engine: engineName(), counts: out };
}

/* --------------------------------- search -------------------------------- */
async function synonymGroups(orgId) {
  const rows = await SearchSynonym.find({ organizationId: orgId, active: true }).lean();
  return rows.map((r) => r.terms.map((t) => t.toLowerCase()));
}

/**
 * Search one entity. The query is tokenized, expanded through synonym groups, then scored
 * by the engine. Results carry highlighted snippets. Every query is logged for analytics.
 */
export async function search(orgId, entity, { query, filters, fuzzy = true, from = 0, size = 20, userId }) {
  if (!INDEX_REGISTRY[entity]) throw new ApiError(400, `Unknown entity ${entity}`, 'validation');
  const started = Date.now();

  // Expand the query through synonyms before handing it to the engine.
  const groups = await synonymGroups(orgId);
  const expanded = groups.length ? expandSynonyms(tokenize(query ?? ''), groups).join(' ') : query;

  const res = await ENGINE.search(entity, orgId, { query: expanded, filters, fuzzy, from, size });
  const cfg = INDEX_REGISTRY[entity];

  const hits = res.hits.map(({ doc, score }) => {
    const primary = cfg.fields[0].field;
    return {
      ...doc, _score: Math.round(score * 100) / 100,
      _highlight: highlight(String(doc[primary] ?? ''), res.terms),
      _snippet: doc.description ? snippet(doc.description, res.terms) : undefined,
    };
  });

  const tookMs = Date.now() - started;
  SearchQueryLog.create({ organizationId: orgId, userId, entity, query: query ?? '', resultCount: res.total, tookMs }).catch(() => {});

  return { entity, query, total: res.total, from, size, tookMs, hits, facets: res.facets };
}

/**
 * Global search across every entity. If the query is a valid barcode, we short-circuit to
 * an exact product lookup — scanning a barcode should never return fuzzy noise.
 */
export async function globalSearch(orgId, { query, size = 5, userId }) {
  if (looksLikeBarcode(query)) {
    const valid = validateBarcode(query);
    const product = await Product.findOne({ organizationId: orgId, barcode: query.replace(/[\s-]/g, ''), deletedAt: null }).lean();
    return {
      mode: 'barcode', query, barcodeValid: valid,
      results: product ? [{ entity: 'PRODUCT', hits: [project('PRODUCT', product)], total: 1 }] : [],
      note: valid ? undefined : 'Barcode checksum is invalid',
    };
  }

  const results = [];
  for (const entity of ENTITIES) {
    const r = await search(orgId, entity, { query, size, userId });
    if (r.total) results.push({ entity, total: r.total, hits: r.hits });
  }
  return { mode: 'text', query, results };
}

/** Autocomplete + "did you mean". */
export async function suggest(orgId, entity, prefix) {
  if (!INDEX_REGISTRY[entity]) throw new ApiError(400, `Unknown entity ${entity}`, 'validation');
  return ENGINE.suggest(entity, orgId, prefix);
}

/* -------------------------------- synonyms ------------------------------- */
export const listSynonyms = (orgId) => SearchSynonym.find({ organizationId: orgId }).sort({ createdAt: -1 });
export async function createSynonym(orgId, terms) {
  if (terms.length < 2) throw new ApiError(400, 'A synonym group needs at least two terms', 'validation');
  return SearchSynonym.create({ organizationId: orgId, terms: terms.map((t) => t.toLowerCase().trim()) });
}
export async function removeSynonym(orgId, id) {
  const r = await SearchSynonym.findOneAndDelete({ _id: id, organizationId: orgId });
  if (!r) throw new ApiError(404, 'Synonym not found', 'not_found');
  return { id, deleted: true };
}

/* ------------------------------ saved searches --------------------------- */
export const listSavedSearches = (orgId, userId) => SavedSearch.find({ organizationId: orgId, userId }).sort({ createdAt: -1 });
export const createSavedSearch = (orgId, userId, body) => SavedSearch.create({ ...body, organizationId: orgId, userId });
export async function removeSavedSearch(orgId, userId, id) {
  const r = await SavedSearch.findOneAndDelete({ _id: id, organizationId: orgId, userId });
  if (!r) throw new ApiError(404, 'Saved search not found', 'not_found');
  return { id, deleted: true };
}

/* -------------------------------- analytics ------------------------------ */
/** Top queries and — more usefully — the ZERO-RESULT queries that reveal catalog gaps. */
export async function searchAnalytics(orgId, { days = 30 } = {}) {
  const since = new Date(Date.now() - days * 86_400_000);
  const [top, zeroResult, stats] = await Promise.all([
    SearchQueryLog.aggregate([
      { $match: { organizationId: orgId, createdAt: { $gte: since }, query: { $ne: '' } } },
      { $group: { _id: '$query', count: { $sum: 1 }, avgResults: { $avg: '$resultCount' } } },
      { $sort: { count: -1 } }, { $limit: 20 },
    ]),
    SearchQueryLog.aggregate([
      { $match: { organizationId: orgId, createdAt: { $gte: since }, resultCount: 0, query: { $ne: '' } } },
      { $group: { _id: '$query', count: { $sum: 1 } } },
      { $sort: { count: -1 } }, { $limit: 20 },
    ]),
    SearchQueryLog.aggregate([
      { $match: { organizationId: orgId, createdAt: { $gte: since } } },
      { $group: { _id: null, total: { $sum: 1 }, avgTookMs: { $avg: '$tookMs' }, zeroCount: { $sum: { $cond: [{ $eq: ['$resultCount', 0] }, 1, 0] } } } },
    ]),
  ]);
  const s = stats[0] ?? { total: 0, avgTookMs: 0, zeroCount: 0 };
  return {
    days,
    totalQueries: s.total,
    avgTookMs: Math.round(s.avgTookMs ?? 0),
    zeroResultRate: s.total ? Math.round((s.zeroCount / s.total) * 1000) / 10 : 0,
    topQueries: top.map((t) => ({ query: t._id, count: t.count, avgResults: Math.round(t.avgResults) })),
    zeroResultQueries: zeroResult.map((z) => ({ query: z._id, count: z.count })),
  };
}
