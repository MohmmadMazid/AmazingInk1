import { client, rawResponse } from '../../lib/api.js';

export const shippingApi = {
  packages: () => client.get('/shipping/packages').then((r) => r.data.data),
  createPackage: (body) => client.post('/shipping/packages', body).then((r) => r.data.data),
  rules: () => client.get('/shipping/rules').then((r) => r.data.data),
  createRule: (body) => client.post('/shipping/rules', body).then((r) => r.data.data),
  removeRule: (id) => client.delete(`/shipping/rules/${id}`).then((r) => r.data.data),
  shopRates: (body) => client.post('/shipping/rates', body).then((r) => r.data.data),
  shipments: (params) => rawResponse(client.get('/shipping/shipments', { params })),
  refresh: (id) => client.post(`/shipping/shipments/${id}/refresh`).then((r) => r.data.data),
};
