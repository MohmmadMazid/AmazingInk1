import { client } from '../../lib/api.js';

export const searchApi = {
  global: (q, size = 5) => client.get('/search', { params: { q, size } }).then((r) => r.data.data),
  entity: (entity, params) => client.get(`/search/${entity.toLowerCase()}`, { params }).then((r) => r.data.data),
  suggest: (q, entity = 'PRODUCT') => client.get('/search/suggest', { params: { q, entity } }).then((r) => r.data.data),
  indexStatus: () => client.get('/search/index/status').then((r) => r.data.data),
  rebuild: () => client.post('/search/index/rebuild').then((r) => r.data.data),
  synonyms: () => client.get('/search/synonyms').then((r) => r.data.data),
  createSynonym: (terms) => client.post('/search/synonyms', { terms }).then((r) => r.data.data),
  removeSynonym: (id) => client.delete(`/search/synonyms/${id}`).then((r) => r.data.data),
  analytics: (days = 30) => client.get('/search/analytics', { params: { days } }).then((r) => r.data.data),
};
