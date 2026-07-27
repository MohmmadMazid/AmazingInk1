import { z } from 'zod';
import * as service from './automation.service.js';
import { ok, created, paginated, pageParams } from '../../utils/envelope.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'invalid id');
const retrySchema = z.object({
  strategy: z.enum(['FIXED', 'LINEAR', 'EXPONENTIAL']).optional(),
  delayMs: z.number().int().positive().optional(),
  maxAttempts: z.number().int().min(1).max(20).optional(),
  capMs: z.number().int().positive().optional(),
  jitter: z.boolean().optional(),
}).optional();
const jobDefSchema = z.object({ key: z.string().min(1), name: z.string().min(1), description: z.string().optional(), retry: retrySchema, enabled: z.boolean().optional() });
const scheduleSchema = z.object({ name: z.string().min(1), jobKey: z.string().min(1), cron: z.string().min(1), payload: z.record(z.any()).optional(), enabled: z.boolean().optional() });
const ruleSchema = z.object({
  name: z.string().min(1), event: z.string().min(1),
  condition: z.record(z.any()).optional(), jobKey: z.string().optional(),
  workflowId: objectId.optional(), enabled: z.boolean().optional(),
});
const workflowSchema = z.object({
  name: z.string().min(1), status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED']).optional(),
  steps: z.array(z.object({ name: z.string(), jobKey: z.string(), input: z.record(z.any()).optional(), condition: z.record(z.any()).optional() })),
});

export async function listJobDefinitions(req, res) { ok(res, await service.listJobDefinitions(req.user.orgId)); }
export async function availableHandlers(req, res) { ok(res, service.availableHandlers()); }
export async function upsertJobDefinition(req, res) { ok(res, await service.upsertJobDefinition(req.user.orgId, jobDefSchema.parse(req.body))); }

export async function enqueueJob(req, res) {
  const { jobKey, payload } = z.object({ jobKey: z.string(), payload: z.record(z.any()).optional() }).parse(req.body);
  created(res, await service.enqueueJob(req.user.orgId, jobKey, payload ?? {}, 'MANUAL'));
}
export async function retryRun(req, res) { ok(res, await service.retryRun(req.user.orgId, req.params.id)); }

export async function listRuns(req, res) {
  const { page, limit, skip } = pageParams(req.query);
  const { data, total } = await service.listRuns(req.user.orgId, { skip, limit, state: req.query.state, jobKey: req.query.jobKey });
  paginated(res, data, { total, page, limit });
}

export async function listSchedules(req, res) { ok(res, await service.listSchedules(req.user.orgId)); }
export async function upsertSchedule(req, res) { ok(res, await service.upsertSchedule(req.user.orgId, scheduleSchema.parse(req.body))); }
export async function removeSchedule(req, res) { ok(res, await service.removeSchedule(req.user.orgId, req.params.id)); }
export async function tickScheduler(req, res) { ok(res, await service.tickScheduler(req.user.orgId)); }

export async function listRules(req, res) { ok(res, await service.listRules(req.user.orgId)); }
export async function upsertRule(req, res) { ok(res, await service.upsertRule(req.user.orgId, ruleSchema.parse(req.body))); }
export async function removeRule(req, res) { ok(res, await service.removeRule(req.user.orgId, req.params.id)); }
export async function testRule(req, res) { ok(res, await service.testRule(req.user.orgId, req.params.id, req.body?.payload ?? {})); }
export async function emitEvent(req, res) {
  const { event, payload } = z.object({ event: z.string(), payload: z.record(z.any()).optional() }).parse(req.body);
  ok(res, await service.emitEvent(req.user.orgId, event, payload ?? {}));
}

export async function listWorkflows(req, res) { ok(res, await service.listWorkflows(req.user.orgId)); }
export async function upsertWorkflow(req, res) { ok(res, await service.upsertWorkflow(req.user.orgId, workflowSchema.parse(req.body))); }
export async function runWorkflow(req, res) { ok(res, await service.runWorkflow(req.user.orgId, req.params.id, req.body?.payload ?? {})); }
export async function listWorkflowRuns(req, res) { ok(res, await service.listWorkflowRuns(req.user.orgId)); }

export async function monitoring(req, res) { ok(res, await service.monitoring(req.user.orgId)); }
export async function pauseQueue(req, res) { ok(res, service.pauseQueue()); }
export async function resumeQueue(req, res) { ok(res, service.resumeQueue()); }
