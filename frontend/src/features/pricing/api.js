import { client } from '../../lib/api.js';

export const pricingApi = {
  quote: (productId) => client.get(`/pricing/quote/${productId}`).then((r) => r.data.data),
  applyQuote: (productId) => client.post(`/pricing/quote/${productId}/apply`).then((r) => r.data.data),
  bulkApply: () => client.post('/pricing/bulk-apply').then((r) => r.data.data),
  rules: () => client.get('/pricing/rules').then((r) => r.data.data),
  createRule: (body) => client.post('/pricing/rules', body).then((r) => r.data.data),
  removeRule: (id) => client.delete(`/pricing/rules/${id}`).then((r) => r.data.data),
  upsertPricing: (productId, body) => client.put(`/pricing/${productId}`, body).then((r) => r.data.data),
  coupons: () => client.get('/pricing/coupons').then((r) => r.data.data),
  validateCoupon: (body) => client.post('/pricing/coupons/validate', body).then((r) => r.data.data),
};
