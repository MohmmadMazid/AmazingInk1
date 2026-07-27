import { JobDefinition } from '../../models/job-definition.model.js';
import { JobRun } from '../../models/job-run.model.js';
import { ScheduledTask } from '../../models/scheduled-task.model.js';
import { AutomationRule } from '../../models/automation-rule.model.js';
import { Workflow, WorkflowRun } from '../../models/workflow.model.js';
import { ApiError } from '../../utils/asyncHandler.js';
import { QUEUE, queueName } from '../../adapters/queue.registry.js';
import { getHandler, handlerKeys } from './handlers.js';
import {
  DEFAULT_RETRY, DEFAULT_THRESHOLDS, canTransition, computeBackoff, evaluateAlerts,
  evaluateCondition, nextRetryAt, nextRun, parseCron, resolveSteps, shouldRetry, summarizeRuns,
} from '../../core/automation.js';

/* ------------------------------ job execution ---------------------------- */
/** Move a run to a new state, refusing illegal transitions (guarded by the state machine). */
async function transition(run, to, patch = {}) {
  if (!canTransition(run.state, to)) throw new ApiError(409, `Illegal transition ${run.state} -> ${to}`, 'conflict');
  Object.assign(run, patch, { state: to });
  await run.save();
  return run;
}

/**
 * Execute one job run. Success completes it; a throw applies the retry policy —
 * reschedule with backoff, or mark DEAD when attempts are exhausted.
 */
export async function executeRun(runId) {
  const run = await JobRun.findById(runId);
  if (!run || run.state === 'COMPLETED' || run.state === 'DEAD') return;

  const handler = getHandler(run.jobKey);
  if (!handler) {
    // QUEUED -> DEAD is legal (a job with no handler can never run).
    await transition(run, 'DEAD', { error: `No handler for ${run.jobKey}`, finishedAt: new Date() });
    return;
  }

  const def = await JobDefinition.findOne({ organizationId: run.organizationId, key: run.jobKey });
  const policy = def?.retry ?? DEFAULT_RETRY;

  await transition(run, 'ACTIVE', { startedAt: new Date(), attempt: run.attempt + 1 });
  const started = Date.now();

  try {
    const result = await handler(run.payload, { orgId: run.organizationId });
    await transition(run, 'COMPLETED', { result, finishedAt: new Date(), durationMs: Date.now() - started });
  } catch (err) {
    const durationMs = Date.now() - started;
    if (shouldRetry(policy, run.attempt)) {
      // ACTIVE -> RETRYING (records the failure), then RETRYING -> QUEUED (ready for the
      // next attempt). Both are legal transitions; the queue fires it after the backoff.
      const delay = computeBackoff(policy, run.attempt + 1);
      await transition(run, 'RETRYING', { error: err.message, nextRetryAt: nextRetryAt(policy, run.attempt), durationMs });
      await transition(run, 'QUEUED');
      await QUEUE.schedule({ runId: run._id.toString() }, delay);
    } else {
      // Attempts exhausted. ACTIVE -> DEAD is NOT a legal jump; the state machine requires
      // passing through FAILED first, which keeps the run's history honest.
      await transition(run, 'FAILED', { error: err.message, durationMs });
      await transition(run, 'DEAD', { finishedAt: new Date() });
    }
  }
}

// Bind the queue runner once.
QUEUE.onProcess(async ({ runId }) => executeRun(runId));

/** Enqueue a job for execution. */
export async function enqueueJob(orgId, jobKey, payload = {}, trigger = 'MANUAL') {
  if (!getHandler(jobKey)) throw new ApiError(400, `Unknown job handler ${jobKey}`, 'validation');
  const def = await JobDefinition.findOne({ organizationId: orgId, key: jobKey });
  const run = await JobRun.create({
    organizationId: orgId, jobKey, trigger, payload,
    maxAttempts: def?.retry?.maxAttempts ?? DEFAULT_RETRY.maxAttempts,
  });
  await QUEUE.enqueue({ runId: run._id.toString() });
  return run;
}

/** Requeue a dead run (DEAD -> QUEUED is an allowed recovery transition). */
export async function retryRun(orgId, runId) {
  const run = await JobRun.findOne({ _id: runId, organizationId: orgId });
  if (!run) throw new ApiError(404, 'Run not found', 'not_found');
  await transition(run, 'QUEUED', { attempt: 0, error: undefined, nextRetryAt: undefined });
  await QUEUE.enqueue({ runId: run._id.toString() });
  return run;
}

/* -------------------------------- job defs ------------------------------- */
export const listJobDefinitions = (orgId) => JobDefinition.find({ organizationId: orgId }).sort({ key: 1 });
export const availableHandlers = () => handlerKeys();
export const upsertJobDefinition = (orgId, body) =>
  JobDefinition.findOneAndUpdate({ organizationId: orgId, key: body.key }, { $set: { ...body, organizationId: orgId } }, { new: true, upsert: true });

/* ---------------------------------- runs --------------------------------- */
export async function listRuns(orgId, { skip, limit, state, jobKey }) {
  const where = { organizationId: orgId };
  if (state) where.state = state;
  if (jobKey) where.jobKey = jobKey;
  const [data, total] = await Promise.all([
    JobRun.find(where).sort({ createdAt: -1 }).skip(skip).limit(limit),
    JobRun.countDocuments(where),
  ]);
  return { data, total };
}

/* -------------------------------- schedules ------------------------------ */
export const listSchedules = (orgId) => ScheduledTask.find({ organizationId: orgId }).sort({ nextRunAt: 1 });

export async function upsertSchedule(orgId, body) {
  parseCron(body.cron);   // throws on an invalid expression
  return ScheduledTask.findOneAndUpdate(
    { organizationId: orgId, name: body.name },
    { $set: { ...body, organizationId: orgId, nextRunAt: nextRun(body.cron) } },
    { new: true, upsert: true },
  );
}

export async function removeSchedule(orgId, id) {
  const t = await ScheduledTask.findOneAndDelete({ _id: id, organizationId: orgId });
  if (!t) throw new ApiError(404, 'Schedule not found', 'not_found');
  return { id, deleted: true };
}

/**
 * The scheduler tick: enqueue every task whose nextRunAt has passed, then recompute it.
 * In production a cron process (or BullMQ repeatable job) calls this each minute.
 */
export async function tickScheduler(orgId, now = new Date()) {
  const due = await ScheduledTask.find({ organizationId: orgId, enabled: true, nextRunAt: { $lte: now } });
  const fired = [];
  for (const task of due) {
    await enqueueJob(orgId, task.jobKey, task.payload, 'SCHEDULE');
    task.lastRunAt = now;
    task.nextRunAt = nextRun(task.cron, now);
    await task.save();
    fired.push({ name: task.name, jobKey: task.jobKey, nextRunAt: task.nextRunAt });
  }
  return { fired: fired.length, tasks: fired };
}

/* ---------------------------------- rules -------------------------------- */
export const listRules = (orgId) => AutomationRule.find({ organizationId: orgId }).sort({ createdAt: -1 });
export const upsertRule = (orgId, body) =>
  AutomationRule.findOneAndUpdate({ organizationId: orgId, name: body.name }, { $set: { ...body, organizationId: orgId } }, { new: true, upsert: true });

export async function removeRule(orgId, id) {
  const r = await AutomationRule.findOneAndDelete({ _id: id, organizationId: orgId });
  if (!r) throw new ApiError(404, 'Rule not found', 'not_found');
  return { id, deleted: true };
}

/**
 * THE EVENT BUS. Other modules call this on a domain event; every enabled rule for that
 * event whose condition matches the payload fires its job or workflow.
 */
export async function emitEvent(orgId, event, payload = {}) {
  const rules = await AutomationRule.find({ organizationId: orgId, event, enabled: true });
  const fired = [];
  for (const rule of rules) {
    if (!evaluateCondition(rule.condition, payload)) continue;
    if (rule.workflowId) await runWorkflow(orgId, rule.workflowId.toString(), payload);
    else if (rule.jobKey) await enqueueJob(orgId, rule.jobKey, payload, 'EVENT');
    rule.lastFiredAt = new Date();
    rule.fireCount += 1;
    await rule.save();
    fired.push(rule.name);
  }
  return { event, matched: fired.length, rules: fired };
}

/** Dry-run a rule's condition against a sample payload — no side effects. */
export async function testRule(orgId, id, payload) {
  const rule = await AutomationRule.findOne({ _id: id, organizationId: orgId });
  if (!rule) throw new ApiError(404, 'Rule not found', 'not_found');
  return { rule: rule.name, matches: evaluateCondition(rule.condition, payload), payload };
}

/* -------------------------------- workflows ------------------------------ */
export const listWorkflows = (orgId) => Workflow.find({ organizationId: orgId }).sort({ createdAt: -1 });
export const upsertWorkflow = (orgId, body) =>
  Workflow.findOneAndUpdate({ organizationId: orgId, name: body.name }, { $set: { ...body, organizationId: orgId } }, { new: true, upsert: true });

/**
 * Run a workflow: resolve which steps apply (per-step conditions), interpolate each step's
 * input from the accumulating context, and execute them in order. A failing step stops the run.
 */
export async function runWorkflow(orgId, workflowId, triggerPayload = {}) {
  const wf = await Workflow.findOne({ _id: workflowId, organizationId: orgId });
  if (!wf) throw new ApiError(404, 'Workflow not found', 'not_found');
  if (wf.status !== 'ACTIVE') throw new ApiError(400, 'Workflow is not active', 'validation');

  const run = await WorkflowRun.create({ organizationId: orgId, workflowId: wf._id, status: 'RUNNING', context: { trigger: triggerPayload }, startedAt: new Date() });
  const context = { trigger: triggerPayload };

  for (const { step, input } of resolveSteps(wf.steps, context)) {
    const handler = getHandler(step.jobKey);
    if (!handler) {
      run.stepResults.push({ name: step.name, status: 'FAILED', error: `No handler ${step.jobKey}` });
      run.status = 'FAILED';
      break;
    }
    try {
      const result = await handler(input, { orgId });
      run.stepResults.push({ name: step.name, status: 'SUCCEEDED', result });
      context[step.name] = result;   // later steps can reference {{stepName.field}}
    } catch (err) {
      run.stepResults.push({ name: step.name, status: 'FAILED', error: err.message });
      run.status = 'FAILED';
      break;
    }
  }

  if (run.status === 'RUNNING') run.status = 'SUCCEEDED';
  run.context = context;
  run.finishedAt = new Date();
  await run.save();
  return run;
}

export const listWorkflowRuns = (orgId) => WorkflowRun.find({ organizationId: orgId }).sort({ createdAt: -1 }).limit(50);

/* ------------------------------- monitoring ------------------------------ */
/** Queue depth, run stats, and threshold-derived alerts. */
export async function monitoring(orgId) {
  const [runs, size, oldestMs, deadCount] = await Promise.all([
    JobRun.find({ organizationId: orgId }).select('state durationMs').sort({ createdAt: -1 }).limit(500).lean(),
    QUEUE.size(),
    QUEUE.oldestQueuedAgeMs(),
    JobRun.countDocuments({ organizationId: orgId, state: 'DEAD' }),
  ]);

  const stats = summarizeRuns(runs);
  const alerts = evaluateAlerts({
    failureRate: stats.failureRate, queueDepth: size.waiting,
    deadCount, activeStalledCount: 0, oldestQueuedAgeMs: oldestMs,
  });

  return { engine: queueName(), queue: size, stats, deadCount, alerts, thresholds: DEFAULT_THRESHOLDS };
}

export const pauseQueue = () => { QUEUE.pause(); return { paused: true }; };
export const resumeQueue = () => { QUEUE.resume(); return { paused: false }; };
