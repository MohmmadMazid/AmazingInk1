import { client } from '../../lib/api.js';

export const importsApi = {
  columns: () => client.get('/imports/columns').then((r) => r.data.data),
  preview: (csv, mapping) => client.post('/imports/preview', { csv, mapping }).then((r) => r.data.data),
  commit: (csv, mapping, applyStock) => client.post('/imports/commit', { csv, mapping, applyStock }).then((r) => r.data.data),
  templateUrl: '/api/imports/template',
  exportUrl: '/api/imports/export',
};
