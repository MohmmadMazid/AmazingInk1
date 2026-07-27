import { client, rawResponse } from '../../lib/api.js';

export const listingsApi = {
  channels: () => client.get('/listings/channels').then((r) => r.data.data),
  createChannel: (body) => client.post('/listings/channels', body).then((r) => r.data.data),
  listings: (params) => rawResponse(client.get('/listings', { params })),
  publish: (body) => client.post('/listings/publish', body).then((r) => r.data.data),
  sync: (id) => client.post(`/listings/${id}/sync`).then((r) => r.data.data),
  syncAll: () => client.post('/listings/sync-all').then((r) => r.data.data),
  drain: () => client.post('/listings/drain').then((r) => r.data.data),
  outbox: (params) => client.get('/listings/outbox', { params }).then((r) => r.data.data),
  conflicts: () => client.get('/listings/conflicts').then((r) => r.data.data),
};
