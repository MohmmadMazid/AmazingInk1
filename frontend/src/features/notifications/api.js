import { client, rawResponse } from '../../lib/api.js';

export const notificationsApi = {
  inbox: (params) => rawResponse(client.get('/notifications', { params })),   // { data, meta.unread }
  markRead: (id) => client.post(`/notifications/${id}/read`).then((r) => r.data.data),
  markAllRead: () => client.post('/notifications/read-all').then((r) => r.data.data),
  settings: () => client.get('/notifications/settings').then((r) => r.data.data),
  updateSettings: (body) => client.put('/notifications/settings', body).then((r) => r.data.data),
  templates: () => client.get('/notifications/templates').then((r) => r.data.data),
  preview: (key, vars) => client.post(`/notifications/templates/${key}/preview`, { vars }).then((r) => r.data.data),
  emit: (body) => client.post('/notifications/emit', body).then((r) => r.data.data),
  digest: () => client.get('/notifications/digest').then((r) => r.data.data),
  providerOutbox: () => client.get('/notifications/provider-outbox').then((r) => r.data.data),
};
