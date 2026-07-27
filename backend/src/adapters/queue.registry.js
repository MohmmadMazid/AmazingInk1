/**
 * Queue adapters — the seam between the automation engine and a real job queue.
 *
 * The IN-MEMORY queue is the default and is fully functional: it schedules with setTimeout,
 * respects concurrency, and drives retries through the same state machine. It is NOT durable
 * — restarting the process loses queued jobs.
 *
 * For production, swap in BullMQ (Redis-backed, durable, distributed):
 *
 *   import { Queue, Worker } from 'bullmq';
 *   const q = new Queue('automation', { connection: { url: process.env.REDIS_URL } });
 *   new Worker('automation', async (job) => runner(job.data), { connection, concurrency: 5 });
 *
 * The engine only calls enqueue / schedule / size / pause / resume / onProcess.
 */

function createInMemoryQueue({ concurrency = 5 } = {}) {
  const pending = [];         // { id, data, runAt }
  const timers = new Map();
  let active = 0;
  let paused = false;
  let runner = null;

  const pump = () => {
    if (paused || !runner) return;
    while (active < concurrency && pending.length) {
      const now = Date.now();
      const idx = pending.findIndex((j) => j.runAt <= now);
      if (idx === -1) break;
      const [job] = pending.splice(idx, 1);
      active++;
      Promise.resolve(runner(job.data))
        .catch(() => {})
        .finally(() => { active--; setImmediate(pump); });
    }
  };

  // Wake periodically so delayed jobs fire.
  const ticker = setInterval(pump, 250);
  if (ticker.unref) ticker.unref();

  return {
    name: 'in-memory',
    onProcess(fn) { runner = fn; pump(); },

    async enqueue(data) {
      const id = `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      pending.push({ id, data, runAt: Date.now() });
      pump();
      return id;
    },

    /** Schedule a job to run after `delayMs` (used by retries and cron). */
    async schedule(data, delayMs) {
      const id = `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      pending.push({ id, data, runAt: Date.now() + Math.max(0, delayMs) });
      if (delayMs <= 0) pump();
      return id;
    },

    async size() { return { waiting: pending.length, active, paused }; },
    async oldestQueuedAgeMs() {
      if (!pending.length) return 0;
      const oldest = Math.min(...pending.map((j) => j.runAt));
      return Math.max(0, Date.now() - oldest);
    },
    pause() { paused = true; },
    resume() { paused = false; pump(); },
    clear() { pending.length = 0; timers.clear(); },
  };
}

export const QUEUE = createInMemoryQueue();
export const queueName = () => QUEUE.name;
