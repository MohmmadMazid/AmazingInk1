import { Channel } from '../../models/channel.model.js';
import { Listing } from '../../models/listing.model.js';
import { SyncOutbox } from '../../models/sync-outbox.model.js';
import { SyncConflict } from '../../models/sync-conflict.model.js';
import { Product } from '../../models/product.model.js';
import { StockLevel } from '../../models/stock-level.model.js';
import { ApiError } from '../../utils/asyncHandler.js';
import { getMarketplace } from '../../adapters/marketplace.registry.js';
import {
  backoffMs, channelPrice, classifyPushOutcome, computeQuantity, decideConflict,
  idempotencyKey, listingHealth, shouldRetry,
} from '../../core/sync.js';

/* -------------------------------- channels ------------------------------- */
export const listChannels = (orgId) => Channel.find({ organizationId: orgId }).sort({ code: 1 });
export const createChannel = (orgId, body) => Channel.create({ ...body, organizationId: orgId });

/* -------------------------------- listings ------------------------------- */
export async function listListings(orgId, { skip, limit, channelId, status }) {
  const where = { organizationId: orgId, deletedAt: null };
  if (channelId) where.channelId = channelId;
  if (status) where.status = status;
  const [rows, total] = await Promise.all([
    Listing.find(where).populate('productId', 'sku title price').populate('channelId', 'code name').sort({ updatedAt: -1 }).skip(skip).limit(limit),
    Listing.countDocuments(where),
  ]);
  const data = rows.map((l) => {
    const o = l.toObject();
    const hours = l.lastSyncedAt ? (Date.now() - l.lastSyncedAt.getTime()) / 3_600_000 : 999;
    return { ...o, health: listingHealth({ status: l.status, errorCount: l.errorCount, lastSyncStatus: l.lastSyncStatus, hoursSinceSync: hours }) };
  });
  return { data, total };
}

/** Create a listing and publish it to the marketplace (gets an externalId). */
export async function publishListing(orgId, { productId, channelId }) {
  const [product, channel] = await Promise.all([
    Product.findOne({ _id: productId, organizationId: orgId, deletedAt: null }),
    Channel.findOne({ _id: channelId, organizationId: orgId }),
  ]);
  if (!product) throw new ApiError(404, 'Product not found', 'not_found');
  if (!channel) throw new ApiError(404, 'Channel not found', 'not_found');

  const adapter = getMarketplace(channel.code);
  if (!adapter) throw new ApiError(400, `Unknown channel ${channel.code}`, 'validation');

  const price = channelPrice(product.price?.amountMinor ?? 0, channel.priceRule);
  const res = await adapter.publish({ sku: product.sku, title: product.title, price });
  if (classifyPushOutcome(res.statusCode) !== 'success') throw new ApiError(502, 'Marketplace rejected publish', 'publish_failed');

  return Listing.findOneAndUpdate(
    { organizationId: orgId, productId, channelId },
    { $set: { externalId: res.externalId, title: product.title, status: 'ACTIVE', lastSyncStatus: 'IDLE' } },
    { new: true, upsert: true },
  );
}

/* ------------------------- the sync engine (delta) ----------------------- */
/**
 * Compute the quantity this listing should show, compare against what we last pushed and
 * what the marketplace currently reports, and enqueue an outbox entry ONLY if something
 * actually changed. Drift is recorded as a conflict and resolved by the channel policy.
 *
 * This is the delta-sync gate: a no-op sync writes nothing and calls no API.
 */
export async function syncListing(orgId, listingId, { force = false } = {}) {
  const listing = await Listing.findOne({ _id: listingId, organizationId: orgId, deletedAt: null });
  if (!listing) throw new ApiError(404, 'Listing not found', 'not_found');
  const channel = await Channel.findById(listing.channelId);
  const adapter = getMarketplace(channel.code);
  if (!adapter) throw new ApiError(400, `Unknown channel ${channel.code}`, 'validation');

  // 1) What SHOULD the marketplace show?
  const levels = await StockLevel.find({ organizationId: orgId, productId: listing.productId });
  const rows = levels.map((l) => ({ enabled: true, priority: 1, onHand: l.onHand, reserved: l.reserved, buffer: l.bufferQuantity }));
  const { available, allocated, quantityToPush } = computeQuantity(rows, channel.syncRule ?? {});

  // 2) What does it currently show? (drift detection)
  const remote = await adapter.fetchRemote(listing).catch(() => ({ statusCode: 0 }));
  const remoteQty = remote.statusCode === 200 ? remote.quantity : null;

  // 3) Decide: push, skip (delta), or defer (conflict).
  const decision = decideConflict({ computedQty: quantityToPush, lastPushedQty: listing.lastPushedQty, remoteQty }, channel.conflictPolicy);

  if (decision.conflict) {
    await SyncConflict.create({
      organizationId: orgId, listingId: listing._id, type: decision.conflict.type,
      resolution: decision.conflict.resolution, detail: decision.conflict.detail,
      systemQty: decision.conflict.systemQty, marketplaceQty: decision.conflict.marketplaceQty,
      resolvedAt: decision.shouldPush ? new Date() : null,
    });
    if (!decision.shouldPush) {
      listing.lastSyncStatus = 'CONFLICT';
      listing.remoteQty = remoteQty;
      await listing.save();
      return { listing, available, allocated, quantityToPush, pushed: false, reason: 'conflict', conflict: decision.conflict };
    }
  }

  if (!decision.shouldPush && !force) {
    listing.lastSyncStatus = 'SYNCED';
    listing.lastSyncedAt = new Date();
    listing.remoteQty = remoteQty;
    await listing.save();
    return { listing, available, allocated, quantityToPush, pushed: false, reason: 'no_change' };
  }

  // 4) Enqueue to the outbox with an idempotency key. A duplicate key = already enqueued.
  const key = idempotencyKey({ orgId, listingId: listing._id.toString(), channel: channel.code, field: 'quantity', value: quantityToPush });
  let entry;
  try {
    entry = await SyncOutbox.create({
      organizationId: orgId, listingId: listing._id, channelId: channel._id,
      idempotencyKey: key, field: 'quantity', value: quantityToPush,
    });
  } catch (e) {
    if (e.code === 11000) return { listing, available, allocated, quantityToPush, pushed: false, reason: 'already_enqueued' };
    throw e;
  }

  listing.lastSyncStatus = 'PENDING';
  await listing.save();
  return { listing, available, allocated, quantityToPush, pushed: false, reason: 'enqueued', outboxId: entry._id };
}

/**
 * Drain the outbox: send each due entry to its marketplace with the idempotency key.
 * Transient failures reschedule with exponential backoff; permanent ones go DEAD.
 * In production this runs on a queue worker; the endpoint lets you drive it manually.
 */
export async function drainOutbox(orgId, { limit = 50 } = {}) {
  const due = await SyncOutbox.find({ organizationId: orgId, status: { $in: ['PENDING', 'FAILED'] }, nextAttemptAt: { $lte: new Date() } })
    .sort({ nextAttemptAt: 1 }).limit(limit);

  const results = [];
  for (const entry of due) {
    const [listing, channel] = await Promise.all([Listing.findById(entry.listingId), Channel.findById(entry.channelId)]);
    const adapter = getMarketplace(channel?.code);
    if (!listing || !adapter) {
      entry.status = 'DEAD'; entry.lastError = 'listing or channel missing';
      await entry.save(); results.push({ id: entry._id, status: 'DEAD' }); continue;
    }

    const attempt = entry.attempt + 1;
    let res;
    try {
      res = entry.field === 'price'
        ? await adapter.pushPrice(listing, entry.value, entry.idempotencyKey)
        : await adapter.pushQuantity(listing, entry.value, entry.idempotencyKey);
    } catch (err) {
      res = { statusCode: 0, error: err.message };
    }

    const outcome = classifyPushOutcome(res.statusCode);
    entry.attempt = attempt;
    entry.lastStatusCode = res.statusCode;

    if (outcome === 'success') {
      entry.status = 'SENT'; entry.sentAt = new Date(); entry.nextAttemptAt = null;
      if (entry.field === 'quantity') listing.lastPushedQty = entry.value;
      if (entry.field === 'price') listing.lastPushedPrice = entry.value;
      listing.lastSyncStatus = 'SYNCED'; listing.lastSyncedAt = new Date(); listing.errorCount = 0; listing.lastError = undefined;
      await listing.save();
    } else if (shouldRetry(res.statusCode, attempt, entry.maxAttempts)) {
      entry.status = 'FAILED';
      entry.lastError = res.error ?? `HTTP ${res.statusCode}`;
      entry.nextAttemptAt = new Date(Date.now() + backoffMs(attempt + 1));
    } else {
      entry.status = 'DEAD';
      entry.lastError = res.error ?? `HTTP ${res.statusCode}`;
      listing.lastSyncStatus = 'FAILED'; listing.errorCount += 1; listing.lastError = entry.lastError;
      await listing.save();
    }
    await entry.save();
    results.push({ id: entry._id, listingId: listing._id, status: entry.status, attempt, statusCode: res.statusCode });
  }
  return { processed: results.length, results };
}

/** Sync every active listing (delta-gated, so unchanged listings cost nothing). */
export async function syncAll(orgId) {
  const listings = await Listing.find({ organizationId: orgId, status: 'ACTIVE', deletedAt: null }).select('_id');
  const results = [];
  for (const l of listings) {
    try { results.push(await syncListing(orgId, l._id.toString())); }
    catch (e) { results.push({ listingId: l._id, error: e.message }); }
  }
  const enqueued = results.filter((r) => r.reason === 'enqueued').length;
  const skipped = results.filter((r) => r.reason === 'no_change').length;
  const conflicts = results.filter((r) => r.reason === 'conflict').length;
  return { total: results.length, enqueued, skipped, conflicts, results };
}

/* -------------------------------- reporting ------------------------------ */
export const listOutbox = (orgId, { status } = {}) =>
  SyncOutbox.find({ organizationId: orgId, ...(status ? { status } : {}) }).sort({ createdAt: -1 }).limit(100);

export const listConflicts = (orgId) =>
  SyncConflict.find({ organizationId: orgId }).sort({ createdAt: -1 }).limit(100).populate('listingId', 'title externalId');
