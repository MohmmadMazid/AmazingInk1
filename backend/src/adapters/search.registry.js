/**
 * Search engine adapters — the seam between the search service and a real engine.
 *
 * The IN-MEMORY adapter is the default and is fully functional: it builds an inverted
 * index in process, scores with the pure core, and supports facets, filters, fuzzy
 * matching, and highlighting. Good to a few hundred thousand docs.
 *
 * For larger corpora, swap in the OpenSearch adapter (documented below). The service only
 * ever calls `index`, `bulkIndex`, `remove`, `search`, `suggest`, and `clear` — nothing
 * else in the codebase changes.
 */
import { computeFacets, matchesFilters, normalize, scoreDoc, tokenize, autocomplete, didYouMean } from '../core/search.js';

/** Per-entity field weights: a title hit outranks a description hit. */
export const INDEX_REGISTRY = {
  PRODUCT: { fields: [{ field: 'title', weight: 3 }, { field: 'sku', weight: 4 }, { field: 'description', weight: 1 }], facets: ['status'] },
  CUSTOMER: { fields: [{ field: 'email', weight: 3 }, { field: 'firstName', weight: 2 }, { field: 'lastName', weight: 2 }], facets: ['status'] },
  ORDER: { fields: [{ field: 'orderNumber', weight: 4 }, { field: 'channel', weight: 1 }], facets: ['status', 'channel'] },
};

function createInMemoryEngine() {
  // entity -> orgId -> Map<docId, doc>
  const store = new Map();
  const bucket = (entity, orgId) => {
    if (!store.has(entity)) store.set(entity, new Map());
    const byOrg = store.get(entity);
    if (!byOrg.has(orgId)) byOrg.set(orgId, new Map());
    return byOrg.get(orgId);
  };

  return {
    name: 'in-memory',

    async index(entity, orgId, doc) { bucket(entity, orgId).set(String(doc.id), doc); },
    async bulkIndex(entity, orgId, docs) { const b = bucket(entity, orgId); for (const d of docs) b.set(String(d.id), d); return docs.length; },
    async remove(entity, orgId, id) { return bucket(entity, orgId).delete(String(id)); },
    async clear(entity, orgId) { bucket(entity, orgId).clear(); },
    async count(entity, orgId) { return bucket(entity, orgId).size; },

    /** Score, filter, facet, and paginate. Facets are computed over the FILTERED set. */
    async search(entity, orgId, { query, filters = {}, fuzzy = true, from = 0, size = 20 }) {
      const cfg = INDEX_REGISTRY[entity] ?? { fields: [], facets: [] };
      const all = [...bucket(entity, orgId).values()];
      const filtered = all.filter((d) => matchesFilters(d, filters));

      const terms = tokenize(query ?? '');
      const scored = terms.length
        ? filtered.map((doc) => ({ doc, score: scoreDoc(terms, doc, cfg.fields, fuzzy) })).filter((r) => r.score > 0)
        : filtered.map((doc) => ({ doc, score: 1 }));

      scored.sort((a, b) => b.score - a.score);
      return {
        total: scored.length,
        hits: scored.slice(from, from + size),
        facets: computeFacets(filtered, cfg.facets),
        terms,
      };
    },

    /** Autocomplete + "did you mean" over the indexed vocabulary. */
    async suggest(entity, orgId, prefix) {
      const cfg = INDEX_REGISTRY[entity] ?? { fields: [] };
      const counts = new Map();
      for (const doc of bucket(entity, orgId).values()) {
        for (const { field } of cfg.fields) {
          for (const t of tokenize(String(doc[field] ?? ''))) counts.set(t, (counts.get(t) ?? 0) + 1);
        }
      }
      const vocab = [...counts.entries()].map(([term, count]) => ({ term, count }));
      const completions = autocomplete(prefix, vocab);
      return {
        completions,
        didYouMean: completions.length ? null : didYouMean(normalize(prefix), vocab.map((v) => v.term)),
      };
    },
  };
}

/**
 * OpenSearch adapter (production). Implement the same six methods against an OpenSearch
 * client — `search` maps to a multi_match query with the same field weights, `suggest` to a
 * completion suggester. Then set SEARCH_ENGINE=opensearch.
 *
 *   import { Client } from '@opensearch-project/opensearch';
 *   const client = new Client({ node: process.env.OPENSEARCH_URL });
 */
export const ENGINE = createInMemoryEngine();
export const engineName = () => ENGINE.name;
