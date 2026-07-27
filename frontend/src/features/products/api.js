import { client, rawResponse } from '../../lib/api.js';

export const productsApi = {
  list: (params) => rawResponse(client.get('/products', { params })),        // { data, meta }
  create: (body) => client.post('/products', body).then((r) => r.data.data),
  remove: (id) => client.delete(`/products/${id}`).then((r) => r.data.data),
};
