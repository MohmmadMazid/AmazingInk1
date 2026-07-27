import { client, rawResponse } from '../../lib/api.js';

export const ordersApi = {
  list: (params) => rawResponse(client.get('/orders', { params })),
  create: (body) => client.post('/orders', body).then((r) => r.data.data),
  setStatus: (id, status) => client.patch(`/orders/${id}/status`, { status }).then((r) => r.data.data),
};
