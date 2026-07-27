import { client } from '../../lib/api.js';

export const warehouseApi = {
  bins: (params) => client.get('/warehouse/bins', { params }).then((r) => r.data.data),
  createBin: (body) => client.post('/warehouse/bins', body).then((r) => r.data.data),
  binContents: (params) => client.get('/warehouse/bin-contents', { params }).then((r) => r.data.data),
  receipts: (params) => client.get('/warehouse/receipts', { params }).then((r) => r.data.data),
  createReceipt: (body) => client.post('/warehouse/receipts', body).then((r) => r.data.data),
  receive: (id, body) => client.post(`/warehouse/receipts/${id}/receive`, body).then((r) => r.data.data),
  putawaySuggestions: (id) => client.get(`/warehouse/receipts/${id}/putaway-suggestions`).then((r) => r.data.data),
  confirmPutaway: (id, body) => client.post(`/warehouse/receipts/${id}/putaway`, body).then((r) => r.data.data),
  pickLists: (params) => client.get('/warehouse/pick-lists', { params }).then((r) => r.data.data),
  createPickList: (body) => client.post('/warehouse/pick-lists', body).then((r) => r.data.data),
  getPickList: (id) => client.get(`/warehouse/pick-lists/${id}`).then((r) => r.data.data),
  recordPick: (id, body) => client.post(`/warehouse/pick-lists/${id}/pick`, body).then((r) => r.data.data),
};
