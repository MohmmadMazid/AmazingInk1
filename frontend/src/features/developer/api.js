import { client, rawResponse } from '../../lib/api.js';

export const devApi = {
  keys: () => client.get('/developer/keys').then((r) => r.data.data),
  createKey: (body) => client.post('/developer/keys', body).then((r) => r.data.data),
  revokeKey: (id) => client.delete(`/developer/keys/${id}`).then((r) => r.data.data),
  clients: () => client.get('/developer/clients').then((r) => r.data.data),
  createClient: (body) => client.post('/developer/clients', body).then((r) => r.data.data),
  removeClient: (id) => client.delete(`/developer/clients/${id}`).then((r) => r.data.data),
  subscriptions: () => client.get('/developer/subscriptions').then((r) => r.data.data),
  createSubscription: (body) => client.post('/developer/subscriptions', body).then((r) => r.data.data),
  removeSubscription: (id) => client.delete(`/developer/subscriptions/${id}`).then((r) => r.data.data),
  deliveries: (params) => rawResponse(client.get('/developer/deliveries', { params })),
  drain: () => client.post('/developer/deliveries/drain').then((r) => r.data.data),
  redeliver: (id) => client.post(`/developer/deliveries/${id}/redeliver`).then((r) => r.data.data),
  testEvent: (eventType) => client.post('/developer/reference/events/test', { eventType }).then((r) => r.data.data),
  usage: (hours = 24) => client.get('/developer/usage/summary', { params: { hours } }).then((r) => r.data.data),
  quota: (tier) => client.get('/developer/usage/quota', { params: { tier } }).then((r) => r.data.data),
  versions: () => client.get('/developer/versions').then((r) => r.data.data),
  seedVersions: () => client.post('/developer/versions/seed').then((r) => r.data.data),
  openapi: () => client.get('/developer/reference/openapi').then((r) => r.data.data),
  sdk: () => client.get('/developer/reference/sdk').then((r) => r.data.data),
  events: () => client.get('/developer/reference/events').then((r) => r.data.data),
};
