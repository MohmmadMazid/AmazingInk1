import { client } from '../../lib/api.js';

export const analyticsApi = {
  dashboard: (params) => client.get('/analytics/dashboard', { params }).then((r) => r.data.data),
  pnl: (params) => client.get('/analytics/pnl', { params }).then((r) => r.data.data),
  byChannel: (params) => client.get('/analytics/by-channel', { params }).then((r) => r.data.data),
  topProducts: (params) => client.get('/analytics/top-products', { params }).then((r) => r.data.data),
  inventoryValuation: () => client.get('/analytics/inventory-valuation').then((r) => r.data.data),
  rebuildRollups: (body) => client.post('/analytics/rollups/rebuild', body ?? {}).then((r) => r.data.data),
  exportUrl: (type, params) => `/api/analytics/export/${type}?${new URLSearchParams(params ?? {})}`,
};
