import { client } from '../../lib/api.js';

export const aiApi = {
  providers: () => client.get('/ai/providers').then((r) => r.data.data),
  usage: (days = 30) => client.get('/ai/usage', { params: { days } }).then((r) => r.data.data),
  calls: () => client.get('/ai/calls').then((r) => r.data.data),
  prompts: () => client.get('/ai/prompts').then((r) => r.data.data),
  runPrompt: (key, vars) => client.post(`/ai/prompts/${key}/run`, { vars }).then((r) => r.data.data),
  description: (id) => client.post(`/ai/products/${id}/description`).then((r) => r.data.data),
  keywords: (id) => client.post(`/ai/products/${id}/keywords`).then((r) => r.data.data),
  duplicates: (id) => client.get(`/ai/products/${id}/duplicates`).then((r) => r.data.data),
  forecast: (id) => client.get(`/ai/products/${id}/forecast`).then((r) => r.data.data),
  priceSuggestion: (id, params) => client.get(`/ai/products/${id}/price`, { params }).then((r) => r.data.data),
  insights: () => client.get('/ai/insights').then((r) => r.data.data),
};
