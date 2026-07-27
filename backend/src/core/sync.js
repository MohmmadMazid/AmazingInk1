/**
 * Marketplace sync domain logic — pure, ported from the original platform's quantity and
 * conflict-resolution cores, plus the idempotency/backoff helpers the outbox needs.
 * No I/O; deterministic and unit-testable.
 */

import { createHash } from 'node:crypto';

/* ------------------------- quantity to publish --------------------------- */
/**
 * Given stock spread across warehouses and a resolved sync rule, compute what quantity to
 * push to the marketplace.
 *
 *   available = SUM max(0, onHand - reserved - warehouseBuffer) over enabled warehouses
 *   allocated = SUM_ALL -> available ; PRIORITY_FILL -> sum of the highest-priority tier
 *   push      = floor(allocated * (1 - bufferPercent)) - bufferQty, then * pushPercent,
 *               clamped to [minPush..maxPush] (below minPush we push nothing)
 */
export function computeQuantity(rows, rule) {
  const eligible = rows.filter((r) => r.enabled);
  const perWarehouse = eligible.map((r) => ({ priority: r.priority, qty: Math.max(0, r.onHand - r.reserved - (r.buffer ?? 0)) }));
  const available = perWarehouse.reduce((s, w) => s + w.qty, 0);

  let allocated;
  if (rule.allocation === 'PRIORITY_FILL' && perWarehouse.length > 0) {
    const top = Math.min(...perWarehouse.map((w) => w.priority));
    allocated = perWarehouse.filter((w) => w.priority === top).reduce((s, w) => s + w.qty, 0);
  } else {
    allocated = available;
  }

  let qty = Math.floor(allocated * (1 - (rule.bufferPercent ?? 0) / 10_000)) - (rule.bufferQty ?? 0);
  qty = Math.max(0, qty);
  qty = Math.floor(qty * ((rule.pushPercent ?? 10_000) / 10_000));

  if (rule.maxPush != null) qty = Math.min(qty, rule.maxPush);
  if (qty < (rule.minPush ?? 0)) qty = 0;

  return { available, allocated, quantityToPush: Math.max(0, qty) };
}

/* --------------------------- conflict resolution ------------------------- */
/**
 * Drift = the marketplace's current quantity differs from what we last pushed (an external
 * sale, or someone edited the listing in the marketplace UI). The policy decides whether our
 * computed quantity overwrites it.
 *
 * With no drift this is the DELTA-SYNC gate: push only when the quantity actually changed.
 */
export function decideConflict({ computedQty, lastPushedQty, remoteQty }, policy = 'SYSTEM_WINS') {
  const drift = remoteQty != null && lastPushedQty != null && remoteQty !== lastPushedQty;

  if (drift) {
    if (policy === 'MARKETPLACE_WINS') {
      return {
        shouldPush: false, quantity: computedQty,
        conflict: { type: 'DRIFT', resolution: 'MARKETPLACE_WINS', detail: 'Remote quantity changed; deferring to marketplace.', systemQty: computedQty, marketplaceQty: remoteQty },
      };
    }
    return {
      shouldPush: true, quantity: computedQty,
      conflict: { type: 'DRIFT', resolution: policy === 'NEWEST_WINS' ? 'NEWEST_WINS' : 'SYSTEM_WINS', detail: 'Remote drift detected; overwriting with system quantity.', systemQty: computedQty, marketplaceQty: remoteQty },
    };
  }

  // No conflict: delta sync — only push a genuine change.
  return { shouldPush: computedQty !== lastPushedQty, quantity: computedQty };
}

/* ------------------------------- idempotency ----------------------------- */
/**
 * A stable key for one logical push. Retrying the same intent produces the same key, so the
 * marketplace (and our outbox) can dedupe. This closes the double-post gap the original had.
 */
export function idempotencyKey({ orgId, listingId, channel, field, value }) {
  return createHash('sha256').update(`${orgId}:${channel}:${listingId}:${field}:${value}`).digest('hex').slice(0, 32);
}

/** Exponential backoff with a cap, for outbox retries. */
export function backoffMs(attempt, baseMs = 1000, factor = 2, capMs = 3_600_000) {
  return Math.min(capMs, Math.round(baseMs * Math.pow(factor, Math.max(0, attempt - 1))));
}

/** Classify a marketplace push result: retry transient failures, give up on permanent ones. */
export function classifyPushOutcome(statusCode) {
  if (statusCode >= 200 && statusCode < 300) return 'success';
  if (statusCode === 429 || statusCode === 0 || statusCode >= 500) return 'retryable';
  return 'permanent';
}

export function shouldRetry(statusCode, attempt, maxAttempts) {
  return classifyPushOutcome(statusCode) === 'retryable' && attempt < maxAttempts;
}

/* ------------------------------ listing price ---------------------------- */
/** Channel price from the base price: passthrough / markup / fixed, then rounding. */
export function channelPrice(basePriceMinor, rule) {
  let p = basePriceMinor;
  switch (rule?.type) {
    case 'MARKUP_PERCENT': p = Math.round(basePriceMinor * (1 + rule.value / 10_000)); break;
    case 'MARKUP_AMOUNT': p = basePriceMinor + rule.value; break;
    case 'FIXED': p = rule.value; break;
    case 'PASSTHROUGH':
    default: break;
  }
  if (rule?.rounding === 'CHARM_99') p = Math.max(99, Math.round((p - 99) / 100) * 100 + 99);
  else if (rule?.rounding === 'NEAREST_UNIT') p = Math.round(p / 100) * 100;
  return Math.max(0, p);
}

/* ------------------------------ listing health --------------------------- */
/** Roll a listing's recent errors and sync state into a health status. */
export function listingHealth({ status, errorCount = 0, lastSyncStatus, hoursSinceSync = 0 }) {
  if (status === 'ERROR' || lastSyncStatus === 'FAILED') return 'ERROR';
  if (errorCount > 0 || hoursSinceSync > 24 || lastSyncStatus === 'CONFLICT') return 'AT_RISK';
  if (status === 'ACTIVE' && lastSyncStatus === 'SYNCED') return 'HEALTHY';
  return 'UNKNOWN';
}
