/**
 * Automation domain logic — pure, ported from the original platform's cron, rule-engine,
 * retry-policy, workflow, job-status, and alert cores. No I/O; deterministic.
 */

/* ---------------------------------- cron --------------------------------- */
/** Expand one cron field: wildcards, lists (a,b), ranges (a-b), and steps (*\/n, a-b/n). */
function expandField(expr, min, max) {
  const out = new Set();
  for (const part of expr.split(',')) {
    const [range, stepStr] = part.split('/');
    const step = stepStr ? parseInt(stepStr, 10) : 1;
    let lo = min, hi = max;
    if (range !== '*') {
      const [a, b] = range.split('-');
      lo = parseInt(a, 10);
      hi = b !== undefined ? parseInt(b, 10) : (stepStr ? max : lo);
    }
    for (let v = lo; v <= hi; v += step) if (v >= min && v <= max) out.add(v);
  }
  return out;
}

/** Parse a 5-field cron expression: minute hour day-of-month month day-of-week. */
export function parseCron(expr) {
  const parts = String(expr).trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`Invalid cron: expected 5 fields, got ${parts.length}`);
  return {
    minute: expandField(parts[0], 0, 59), hour: expandField(parts[1], 0, 23),
    dom: expandField(parts[2], 1, 31), month: expandField(parts[3], 1, 12), dow: expandField(parts[4], 0, 6),
  };
}

/** Does a date satisfy the cron fields? (dow 0 = Sunday, all UTC.) */
export function cronMatches(fields, d) {
  return fields.minute.has(d.getUTCMinutes()) && fields.hour.has(d.getUTCHours()) &&
    fields.dom.has(d.getUTCDate()) && fields.month.has(d.getUTCMonth() + 1) && fields.dow.has(d.getUTCDay());
}

/** The next run strictly after `from`, searching minute-by-minute up to ~4 years. */
export function nextRun(expr, from = new Date()) {
  const fields = parseCron(expr);
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), from.getUTCHours(), from.getUTCMinutes(), 0, 0));
  d.setUTCMinutes(d.getUTCMinutes() + 1);
  for (let i = 0; i < 366 * 4 * 24 * 60; i++) {
    if (cronMatches(fields, d)) return d;
    d.setUTCMinutes(d.getUTCMinutes() + 1);
  }
  return null;
}

/* ------------------------------- rule engine ----------------------------- */
/** Read a dotted path from a payload. */
export const getPath = (obj, path) => path.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);

function compare(actual, op, expected) {
  switch (op) {
    case 'eq': return actual === expected;
    case 'ne': return actual !== expected;
    case 'gt': return typeof actual === 'number' && actual > Number(expected);
    case 'gte': return typeof actual === 'number' && actual >= Number(expected);
    case 'lt': return typeof actual === 'number' && actual < Number(expected);
    case 'lte': return typeof actual === 'number' && actual <= Number(expected);
    case 'in': return Array.isArray(expected) && expected.includes(actual);
    case 'nin': return Array.isArray(expected) && !expected.includes(actual);
    case 'contains': return typeof actual === 'string' ? actual.includes(String(expected)) : Array.isArray(actual) && actual.includes(expected);
    case 'regex': try { return typeof actual === 'string' && new RegExp(String(expected)).test(actual); } catch { return false; }
    case 'exists': return (actual != null) === Boolean(expected);
    default: return false;
  }
}

/**
 * Recursively evaluate a condition tree (all / any / not + leaf comparisons) against a
 * payload. An empty condition matches everything.
 */
export function evaluateCondition(cond, payload) {
  if (!cond || Object.keys(cond).length === 0) return true;
  if (cond.all) return cond.all.every((c) => evaluateCondition(c, payload));
  if (cond.any) return cond.any.some((c) => evaluateCondition(c, payload));
  if (cond.not) return !evaluateCondition(cond.not, payload);
  if (cond.field && cond.op) return compare(getPath(payload, cond.field), cond.op, cond.value);
  return true;
}

/* ------------------------------ retry policy ----------------------------- */
export const DEFAULT_RETRY = { strategy: 'EXPONENTIAL', delayMs: 1000, maxAttempts: 5, capMs: 3_600_000, jitter: false };

/** Backoff delay (ms) for a 1-based attempt. Deterministic unless jitter is enabled. */
export function computeBackoff(policy, attempt, rand = 0.5) {
  const base = policy.delayMs;
  let delay;
  switch (policy.strategy) {
    case 'FIXED': delay = base; break;
    case 'LINEAR': delay = base * attempt; break;
    case 'EXPONENTIAL': delay = base * 2 ** (attempt - 1); break;
    default: delay = base;
  }
  if (policy.capMs) delay = Math.min(delay, policy.capMs);
  if (policy.jitter) delay = Math.round(delay * (0.5 + rand * 0.5));
  return Math.round(delay);
}

export const shouldRetry = (policy, attempt) => attempt < policy.maxAttempts;

/** When to retry next, or null when attempts are exhausted (the job goes DEAD). */
export function nextRetryAt(policy, attempt, now = new Date(), rand = 0.5) {
  if (!shouldRetry(policy, attempt)) return null;
  return new Date(now.getTime() + computeBackoff(policy, attempt + 1, rand));
}

/* -------------------------------- workflow ------------------------------- */
/** Interpolate {{dotted.path}} placeholders in a step's input from the workflow context. */
export function interpolateInputs(input, context) {
  if (!input) return {};
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === 'string') {
      out[k] = v.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path) => {
        const val = getPath(context, path);
        return val == null ? '' : typeof val === 'object' ? JSON.stringify(val) : String(val);
      });
    } else out[k] = v;
  }
  return out;
}

/** Which steps run, given per-step conditions, with their inputs interpolated in order. */
export const resolveSteps = (steps, context) =>
  steps.filter((s) => evaluateCondition(s.condition, context)).map((s) => ({ step: s, input: interpolateInputs(s.input, context) }));

/* ------------------------------- job status ------------------------------ */
/** Allowed job-state transitions. Guards the run lifecycle against illegal jumps. */
const TRANSITIONS = {
  QUEUED: ['ACTIVE', 'PAUSED', 'DEAD'],
  ACTIVE: ['COMPLETED', 'FAILED', 'RETRYING'],
  RETRYING: ['QUEUED', 'ACTIVE', 'DEAD'],
  FAILED: ['RETRYING', 'DEAD', 'QUEUED'],
  PAUSED: ['QUEUED'],
  COMPLETED: [],
  DEAD: ['QUEUED'],   // recoverable
};

export const canTransition = (from, to) => TRANSITIONS[from]?.includes(to) ?? false;
export const TERMINAL = ['COMPLETED', 'DEAD'];
export const isTerminal = (s) => TERMINAL.includes(s);

/** Aggregate run records into monitoring stats. */
export function summarizeRuns(runs) {
  const byState = {};
  let durSum = 0, durN = 0;
  for (const r of runs) {
    byState[r.state] = (byState[r.state] ?? 0) + 1;
    if (typeof r.durationMs === 'number') { durSum += r.durationMs; durN++; }
  }
  const completed = byState.COMPLETED ?? 0;
  const failed = (byState.FAILED ?? 0) + (byState.DEAD ?? 0);
  const finished = completed + failed;
  return {
    total: runs.length, byState,
    successRate: finished ? +(completed / finished).toFixed(3) : 0,
    failureRate: finished ? +(failed / finished).toFixed(3) : 0,
    avgDurationMs: durN ? Math.round(durSum / durN) : 0,
  };
}

/* --------------------------------- alerts -------------------------------- */
export const DEFAULT_THRESHOLDS = {
  failureRateWarn: 0.2, failureRateCrit: 0.5,
  queueDepthWarn: 500, queueDepthCrit: 2000,
  deadWarn: 1, stalledWarn: 1, staleAgeMsWarn: 15 * 60_000,
};

/** Turn engine metrics into alerts by threshold. */
export function evaluateAlerts(m, t = DEFAULT_THRESHOLDS) {
  const alerts = [];
  if (m.failureRate >= t.failureRateCrit) alerts.push({ kind: 'FAILURE_RATE', severity: 'CRITICAL', message: `Failure rate ${(m.failureRate * 100).toFixed(0)}% exceeds critical threshold` });
  else if (m.failureRate >= t.failureRateWarn) alerts.push({ kind: 'FAILURE_RATE', severity: 'WARNING', message: `Failure rate ${(m.failureRate * 100).toFixed(0)}% elevated` });
  if (m.queueDepth >= t.queueDepthCrit) alerts.push({ kind: 'QUEUE_DEPTH', severity: 'CRITICAL', message: `Queue depth ${m.queueDepth} is critical` });
  else if (m.queueDepth >= t.queueDepthWarn) alerts.push({ kind: 'QUEUE_DEPTH', severity: 'WARNING', message: `Queue depth ${m.queueDepth} is high` });
  if (m.deadCount >= t.deadWarn) alerts.push({ kind: 'DEAD_JOBS', severity: 'WARNING', message: `${m.deadCount} dead job(s) need recovery` });
  if (m.activeStalledCount >= t.stalledWarn) alerts.push({ kind: 'STALLED', severity: 'WARNING', message: `${m.activeStalledCount} stalled active job(s)` });
  if (m.oldestQueuedAgeMs >= t.staleAgeMsWarn) alerts.push({ kind: 'STALE_QUEUE', severity: 'WARNING', message: `Oldest queued job is ${Math.round(m.oldestQueuedAgeMs / 60000)}m old` });
  return alerts;
}
