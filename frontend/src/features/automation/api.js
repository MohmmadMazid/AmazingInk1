import { client, rawResponse } from '../../lib/api.js';

export const automationApi = {
  monitoring: () => client.get('/automation/monitoring').then((r) => r.data.data),
  pause: () => client.post('/automation/queue/pause').then((r) => r.data.data),
  resume: () => client.post('/automation/queue/resume').then((r) => r.data.data),
  handlers: () => client.get('/automation/handlers').then((r) => r.data.data),
  enqueue: (jobKey, payload) => client.post('/automation/jobs/enqueue', { jobKey, payload }).then((r) => r.data.data),
  runs: (params) => rawResponse(client.get('/automation/runs', { params })),
  retryRun: (id) => client.post(`/automation/runs/${id}/retry`).then((r) => r.data.data),
  schedules: () => client.get('/automation/schedules').then((r) => r.data.data),
  upsertSchedule: (body) => client.put('/automation/schedules', body).then((r) => r.data.data),
  removeSchedule: (id) => client.delete(`/automation/schedules/${id}`).then((r) => r.data.data),
  tick: () => client.post('/automation/schedules/tick').then((r) => r.data.data),
  rules: () => client.get('/automation/rules').then((r) => r.data.data),
  upsertRule: (body) => client.put('/automation/rules', body).then((r) => r.data.data),
  testRule: (id, payload) => client.post(`/automation/rules/${id}/test`, { payload }).then((r) => r.data.data),
  emit: (event, payload) => client.post('/automation/rules/emit', { event, payload }).then((r) => r.data.data),
  workflows: () => client.get('/automation/workflows').then((r) => r.data.data),
  runWorkflow: (id, payload) => client.post(`/automation/workflows/${id}/run`, { payload }).then((r) => r.data.data),
  workflowRuns: () => client.get('/automation/workflow-runs').then((r) => r.data.data),
};
