/**
 * Built-in job handlers. A handler is `async (payload, ctx) => result`; throwing triggers
 * the retry policy. Register new handlers here — the automation engine looks them up by key.
 *
 * These deliberately reuse existing module services rather than reimplementing logic.
 */
import * as inventoryService from '../inventory/inventory.service.js';
import * as listingsService from '../listings/listings.service.js';
import * as analyticsService from '../analytics/analytics.service.js';
import * as notificationsService from '../notifications/notifications.service.js';
import * as searchService from '../search/search.service.js';

export const HANDLERS = {
  /** Push stock levels to every marketplace (delta-gated, so no-ops are free). */
  'sync.listings': async (payload, ctx) => listingsService.syncAll(ctx.orgId),

  /** Drain the marketplace outbox — retries and idempotency handled there. */
  'sync.drain-outbox': async (payload, ctx) => listingsService.drainOutbox(ctx.orgId, {}),

  /** Rebuild the analytics rollups so dashboards stay current. */
  'analytics.rebuild-rollups': async (payload, ctx) => analyticsService.rebuildRollups(ctx.orgId, payload ?? {}),

  /** Rebuild search indices. */
  'search.reindex': async (payload, ctx) => searchService.reindexAll(ctx.orgId),

  /** Alert on anything at or below its reorder point. */
  'inventory.reorder-check': async (payload, ctx) => {
    const report = await inventoryService.reorderReport(ctx.orgId);
    return { lowSkus: report.length, items: report.slice(0, 10).map((r) => ({ sku: r.product?.sku, available: r.available, reorder: r.recommendedReorderQty })) };
  },

  /** Send a notification. Used as a workflow step. */
  'notify.send': async (payload, ctx) =>
    notificationsService.emit(ctx.orgId, {
      userId: payload.userId ?? ctx.userId,
      category: payload.category ?? 'SYSTEM',
      priority: payload.priority ?? 'NORMAL',
      title: payload.title ?? 'Automation',
      body: payload.body,
      templateKey: payload.templateKey,
      vars: payload.vars,
    }),

  /** A no-op used for testing schedules and workflows. */
  'system.noop': async (payload) => ({ ok: true, echo: payload }),

  /** Deliberately fails — demonstrates the retry/backoff/DEAD path. */
  'system.always-fail': async () => { throw new Error('This handler always fails (retry demo)'); },
};

export const handlerKeys = () => Object.keys(HANDLERS);
export const getHandler = (key) => HANDLERS[key] ?? null;
