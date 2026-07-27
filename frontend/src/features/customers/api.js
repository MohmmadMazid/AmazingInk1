import { client, rawResponse } from '../../lib/api.js';

export const customersApi = {
  list: (params) => rawResponse(client.get('/customers', { params })),
  create: (body) => client.post('/customers', body).then((r) => r.data.data),
  remove: (id) => client.delete(`/customers/${id}`).then((r) => r.data.data),
  metrics: (id) => client.get(`/customers/${id}/metrics`).then((r) => r.data.data),
  duplicates: () => client.get('/customers/duplicates').then((r) => r.data.data),
};
