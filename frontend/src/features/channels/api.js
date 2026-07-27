import { client } from '../../lib/api.js';

export const channelsApi = {
  platforms: () => client.get('/channels/platforms').then((r) => r.data.data),
  connections: () => client.get('/channels/connections').then((r) => r.data.data),
  createConnection: (body) => client.post('/channels/connections', body).then((r) => r.data.data),
  testConnection: (id) => client.post(`/channels/connections/${id}/test`).then((r) => r.data.data),
  credentials: (id) => client.get(`/channels/connections/${id}/credentials`).then((r) => r.data.data),
  updateCredentials: (id, credentials) => client.put(`/channels/connections/${id}/credentials`, { credentials }).then((r) => r.data.data),
  removeConnection: (id) => client.delete(`/channels/connections/${id}`).then((r) => r.data.data),

  profiles: (connectionId) => client.get('/channels/profiles', { params: { connectionId } }).then((r) => r.data.data),
  upsertProfile: (body) => client.put('/channels/profiles', body).then((r) => r.data.data),
  preview: (body) => client.post('/channels/profiles/preview', body).then((r) => r.data.data),

  priceMatrix: (productId) => client.get(`/channels/price-matrix/${productId}`).then((r) => r.data.data),
  publish: (body) => client.post('/channels/listings/publish', body).then((r) => r.data.data),
  listings: (params) => client.get('/channels/listings', { params }).then((r) => r.data.data),
  refresh: (id) => client.post(`/channels/listings/${id}/refresh`).then((r) => r.data.data),

  propagate: (productId, force) => client.post(`/channels/propagate/${productId}${force ? '?force=true' : ''}`).then((r) => r.data.data),
  propagateAll: () => client.post('/channels/propagate-all').then((r) => r.data.data),
  drain: () => client.post('/channels/drain').then((r) => r.data.data),
};
