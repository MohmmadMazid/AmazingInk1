import { client, rawResponse } from '../../lib/api.js';

export const inventoryApi = {
  levels: (params) => rawResponse(client.get('/inventory/levels', { params })),
  warehouses: () => client.get('/inventory/warehouses').then((r) => r.data.data),
  adjust: (body) => client.post('/inventory/adjust', body).then((r) => r.data.data),
  reserve: (body) => client.post('/inventory/reserve', body).then((r) => r.data.data),
  reorderReport: () => client.get('/inventory/reorder-report').then((r) => r.data.data),
  history: (params) => rawResponse(client.get('/inventory/history', { params })),
};
