import { ChannelConnection } from '../../models/channel-connection.model.js';
import { ChannelPricingProfile } from '../../models/channel-pricing-profile.model.js';
import { ChannelListing } from '../../models/channel-listing.model.js';
import { Product } from '../../models/product.model.js';
import { VariantPricing } from '../../models/variant-pricing.model.js';
import { StockLevel } from '../../models/stock-level.model.js';
import { SyncOutbox } from '../../models/sync-outbox.model.js';
import { ApiError } from '../../utils/asyncHandler.js';
import { env } from '../../config/env.js';
import { getStore, storePlatforms } from '../../adapters/store.registry.js';
import { deriveKey, encryptField, decryptField } from '../../core/security.js';
import { idempotencyKey, classifyPushOutcome } from '../../core/sync.js';
import {
  PLATFORM_PRESETS, buildPriceMatrix, computeChannelPrice, connectionHealth, marginBreakdown,
  maskCredentials, missingCredentials, presetFor, shouldPushPrice, summarizePropagation,
} from '../../core/channels.js';
import { buildRetailPrice, postageFor, profitFromDisplayPrice } from '../../core/retail-pricing.js';

const KEY = deriveKey(env.jwtSecret || 'dev-master-key');

/* ------------------------------- credentials ----------------------------- */
const seal = (creds) => encryptField(JSON.stringify(creds), KEY);
const unseal = (blob) => (blob ? JSON.parse(decryptField(blob, KEY)) : {});

/** Load a connection WITH its decrypted credentials. Never leaves this module. */
async function loadWithCreds(orgId, connectionId) {
  const conn = await ChannelConnection.findOne({ _id: connectionId, organizationId: orgId }).select('+credentialsEnc');
  if (!conn) throw new ApiError(404, 'Connection not found', 'not_found');
  return { conn, creds: unseal(conn.credentialsEnc) };
}

/* ------------------------------- platforms ------------------------------- */
export const listPlatforms = () =>
  storePlatforms().map((p) => ({ platform: p, ...presetFor(p) }));

/* ------------------------------ connections ------------------------------ */
/** Attach a store. Credentials are validated, encrypted at rest, and never returned. */
export async function createConnection(orgId, { name, platform, credentials, siteId }) {
  const preset = presetFor(platform);
  if (!preset) throw new ApiError(400, `Unknown platform ${platform}`, 'validation');

  const missing = missingCredentials(platform, credentials);
  if (missing.length) throw new ApiError(400, `Missing credentials: ${missing.join(', ')}`, 'validation');

  const conn = await ChannelConnection.create({
    organizationId: orgId, name, platform, kind: preset.kind, siteId,
    credentialsEnc: seal(credentials),
  });

  // Create the channel-wide default pricing profile from the platform's fee preset.
  await ChannelPricingProfile.create({
    organizationId: orgId, connectionId: conn._id, productId: null,
    priceMode: 'MARGIN', targetMarginBps: 3000, floorMarginBps: 1000,
    fees: preset.fees, rounding: 'CHARM_99',
  });

  return conn;
}

/** Verify the credentials actually work, and record the outcome on the connection. */
export async function testConnection(orgId, connectionId) {
  const { conn, creds } = await loadWithCreds(orgId, connectionId);
  const store = getStore(conn.platform);
  const result = await store.testConnection(creds);

  if (result.ok) {
    conn.status = 'CONNECTED';
    conn.externalAccountId = result.accountId;
    conn.lastError = undefined;
    conn.consecutiveFailures = 0;
    conn.lastSyncAt = new Date();
  } else {
    conn.status = 'ERROR';
    conn.lastError = result.error;
    conn.consecutiveFailures += 1;
  }
  await conn.save();
  return { ...result, status: conn.status };
}

export async function listConnections(orgId) {
  const conns = await ChannelConnection.find({ organizationId: orgId }).sort({ createdAt: -1 }).lean();
  return conns.map((c) => ({
    ...c,
    health: connectionHealth(c),
    credentialFields: presetFor(c.platform)?.credentialFields ?? [],
  }));
}

/** Show which credential fields are set — masked. Secrets are never revealed. */
export async function connectionCredentials(orgId, connectionId) {
  const { conn, creds } = await loadWithCreds(orgId, connectionId);
  return { connectionId, platform: conn.platform, credentials: maskCredentials(conn.platform, creds) };
}

export async function updateCredentials(orgId, connectionId, credentials) {
  const { conn, creds } = await loadWithCreds(orgId, connectionId);
  const merged = { ...creds, ...credentials };
  const missing = missingCredentials(conn.platform, merged);
  if (missing.length) throw new ApiError(400, `Missing credentials: ${missing.join(', ')}`, 'validation');
  conn.credentialsEnc = seal(merged);
  conn.status = 'DISCONNECTED';   // re-test required after a credential change
  await conn.save();
  return { connectionId, updated: true, retestRequired: true };
}

export async function removeConnection(orgId, id) {
  const conn = await ChannelConnection.findOneAndUpdate(
    { _id: id, organizationId: orgId }, { $set: { active: false, status: 'DISCONNECTED' } }, { new: true },
  );
  if (!conn) throw new ApiError(404, 'Connection not found', 'not_found');
  return { id, disconnected: true };
}

/* ---------------------------- pricing profiles --------------------------- */
export const listProfiles = (orgId, connectionId) =>
  ChannelPricingProfile.find({ organizationId: orgId, ...(connectionId ? { connectionId } : {}) })
    .populate('connectionId', 'name platform').populate('productId', 'sku title');

/** Upsert the channel default (productId null) or a per-product override. */
export async function upsertProfile(orgId, body) {
  const conn = await ChannelConnection.findOne({ _id: body.connectionId, organizationId: orgId });
  if (!conn) throw new ApiError(404, 'Connection not found', 'not_found');
  return ChannelPricingProfile.findOneAndUpdate(
    { organizationId: orgId, connectionId: body.connectionId, productId: body.productId ?? null },
    { $set: { ...body, organizationId: orgId, productId: body.productId ?? null } },
    { new: true, upsert: true, runValidators: true },
  );
}

/** The effective profile for (connection, product): product override beats channel default. */
async function effectiveProfile(orgId, connectionId, productId) {
  const [override, base] = await Promise.all([
    ChannelPricingProfile.findOne({ organizationId: orgId, connectionId, productId, enabled: true }).lean(),
    ChannelPricingProfile.findOne({ organizationId: orgId, connectionId, productId: null, enabled: true }).lean(),
  ]);
  return override ?? base ?? null;
}

/* ------------------------------ price matrix ----------------------------- */
/** One product, every channel: what price would we publish, and what margin does it net? */
export async function priceMatrix(orgId, productId) {
  const [product, pricing, conns] = await Promise.all([
    Product.findOne({ _id: productId, organizationId: orgId, deletedAt: null }).lean(),
    VariantPricing.findOne({ organizationId: orgId, productId }).lean(),
    ChannelConnection.find({ organizationId: orgId, active: true }).lean(),
  ]);
  if (!product) throw new ApiError(404, 'Product not found', 'not_found');
  if (pricing?.cost == null) throw new ApiError(400, 'Product has no cost basis — set a cost first', 'validation');

  const profiles = [];
  for (const c of conns) {
    const p = await effectiveProfile(orgId, c._id, productId);
    if (!p) continue;
    profiles.push({
      ...p,
      connectionId: c._id.toString(),
      channelLabel: c.name,
      platform: c.platform,
      isOverride: p.productId != null,
    });
  }

  return {
    productId, sku: product.sku, title: product.title,
    costMinor: pricing.cost, basePriceMinor: product.price?.amountMinor ?? null,
    channels: buildPriceMatrix({ costMinor: pricing.cost, basePriceMinor: product.price?.amountMinor, profiles })
      .map((row, i) => ({ ...row, isOverride: profiles[i].isOverride })),
  };
}

/** Preview a profile change without saving it. */
export async function previewProfile(orgId, { productId, connectionId, profile }) {
  const pricing = await VariantPricing.findOne({ organizationId: orgId, productId }).lean();
  if (pricing?.cost == null) throw new ApiError(400, 'Product has no cost basis', 'validation');
  const product = await Product.findById(productId).lean();
  const preset = presetFor((await ChannelConnection.findById(connectionId).lean())?.platform);
  const merged = { fees: preset?.fees ?? {}, ...profile };
  const computed = computeChannelPrice({ costMinor: pricing.cost, profile: merged, basePriceMinor: product?.price?.amountMinor });
  return { ...computed, ...marginBreakdown({ priceMinor: computed.priceMinor, costMinor: pricing.cost, profile: merged }) };
}

/* --------------------------- publish to a store -------------------------- */
/** Publish a product to a connected store for the first time. */
export async function publishProduct(orgId, connectionId, productId) {
  const { conn, creds } = await loadWithCreds(orgId, connectionId);
  if (conn.status !== 'CONNECTED') throw new ApiError(400, 'Connection is not verified — test it first', 'validation');

  const [product, pricing, level] = await Promise.all([
    Product.findOne({ _id: productId, organizationId: orgId, deletedAt: null }),
    VariantPricing.findOne({ organizationId: orgId, productId }),
    StockLevel.findOne({ organizationId: orgId, productId }),
  ]);
  if (!product) throw new ApiError(404, 'Product not found', 'not_found');
  if (pricing?.cost == null) throw new ApiError(400, 'Product has no cost basis', 'validation');

  const profile = await effectiveProfile(orgId, connectionId, productId);
  if (!profile) throw new ApiError(400, 'No pricing profile for this channel', 'validation');

  const { priceMinor, floorApplied } = computeChannelPrice({
    costMinor: pricing.cost, profile, basePriceMinor: product.price?.amountMinor,
  });
  const qty = Math.max(0, (level?.onHand ?? 0) - (level?.reserved ?? 0));

  const store = getStore(conn.platform);
  const res = await store.publish(creds, { sku: product.sku, title: product.title }, priceMinor, qty);
  if (classifyPushOutcome(res.statusCode) !== 'success') throw new ApiError(502, 'Store rejected the publish', 'publish_failed');

  const listing = await ChannelListing.findOneAndUpdate(
    { organizationId: orgId, connectionId, productId },
    {
      $set: {
        externalListingId: res.externalListingId, status: 'ACTIVE',
        lastPushedPriceMinor: priceMinor, lastPushedQty: qty,
        lastSyncStatus: 'SYNCED', lastSyncedAt: new Date(),
      },
    },
    { new: true, upsert: true },
  );
  return { listing, priceMinor, quantity: qty, floorApplied };
}

/* ======================= THE PROPAGATION ENGINE ========================== */
/**
 * Recompute this product's price on EVERY connected store and enqueue the changes.
 *
 * This is the answer to "change the price here and it reflects on eBay and the website":
 *   cost/base price changes -> per-channel margin solve -> delta gate -> idempotent outbox
 *   -> drain -> store adapter -> live.
 *
 * Nothing is pushed if the computed price is unchanged, so a no-op reprice costs zero
 * API calls. The idempotency key means a retried push can never double-post.
 */
export async function propagatePrice(orgId, productId, { force = false } = {}) {
  const [product, pricing] = await Promise.all([
    Product.findOne({ _id: productId, organizationId: orgId, deletedAt: null }).lean(),
    VariantPricing.findOne({ organizationId: orgId, productId }).lean(),
  ]);
  if (!product) throw new ApiError(404, 'Product not found', 'not_found');
  if (pricing?.cost == null) throw new ApiError(400, 'Product has no cost basis', 'validation');

  const listings = await ChannelListing.find({ organizationId: orgId, productId, status: 'ACTIVE' });
  const results = [];

  for (const listing of listings) {
    const conn = await ChannelConnection.findOne({ _id: listing.connectionId, organizationId: orgId, active: true });
    if (!conn || conn.status !== 'CONNECTED') {
      results.push({ connectionId: listing.connectionId, action: 'blocked', reason: 'connection not verified' });
      continue;
    }

    const profile = await effectiveProfile(orgId, conn._id, productId);
    if (!profile) { results.push({ channel: conn.name, action: 'blocked', reason: 'no pricing profile' }); continue; }
    if (!profile.autoPropagate && !force) { results.push({ channel: conn.name, action: 'blocked', reason: 'auto-propagate off' }); continue; }

    const { priceMinor, floorApplied } = computeChannelPrice({
      costMinor: pricing.cost, profile, basePriceMinor: product.price?.amountMinor,
    });

    // Delta gate: don't call an API to set a price it already has.
    if (!force && !shouldPushPrice(priceMinor, listing.lastPushedPriceMinor)) {
      results.push({ channel: conn.name, action: 'no_change', priceMinor });
      continue;
    }

    const key = idempotencyKey({
      orgId, listingId: listing._id.toString(), channel: conn.platform, field: 'price', value: priceMinor,
    });

    try {
      await SyncOutbox.create({
        organizationId: orgId, listingId: listing._id, channelId: conn._id,
        idempotencyKey: key, field: 'price', value: priceMinor,
      });
      listing.lastSyncStatus = 'PENDING';
      await listing.save();
      results.push({ channel: conn.name, platform: conn.platform, action: 'enqueued', priceMinor, floorApplied });
    } catch (e) {
      if (e.code === 11000) results.push({ channel: conn.name, action: 'no_change', reason: 'already enqueued', priceMinor });
      else results.push({ channel: conn.name, action: 'error', reason: e.message });
    }
  }

  return { productId, sku: product.sku, ...summarizePropagation(results), results };
}

/** Propagate every product that is listed anywhere. Used after a bulk cost update. */
export async function propagateAll(orgId) {
  const productIds = await ChannelListing.distinct('productId', { organizationId: orgId, status: 'ACTIVE' });
  const runs = [];
  for (const pid of productIds) {
    try { runs.push(await propagatePrice(orgId, pid.toString())); }
    catch (e) { runs.push({ productId: pid, error: e.message }); }
  }
  return {
    products: runs.length,
    enqueued: runs.reduce((a, r) => a + (r.pushed ?? 0), 0),
    unchanged: runs.reduce((a, r) => a + (r.unchanged ?? 0), 0),
    runs,
  };
}

/**
 * Drain the outbox: send each due price/quantity change to its store, with the idempotency
 * key. Retries use exponential backoff; permanent failures dead-letter.
 */
export async function drainChannelOutbox(orgId, { limit = 50 } = {}) {
  const { backoffMs, shouldRetry } = await import('../../core/sync.js');
  const due = await SyncOutbox.find({
    organizationId: orgId, status: { $in: ['PENDING', 'FAILED'] }, nextAttemptAt: { $lte: new Date() },
  }).sort({ nextAttemptAt: 1 }).limit(limit);

  const results = [];
  for (const entry of due) {
    const listing = await ChannelListing.findById(entry.listingId);
    const conn = listing && await ChannelConnection.findById(entry.channelId).select('+credentialsEnc');
    const store = conn && getStore(conn.platform);

    if (!listing || !conn || !store) {
      entry.status = 'DEAD'; entry.lastError = 'listing or connection missing';
      await entry.save();
      results.push({ id: entry._id, status: 'DEAD' });
      continue;
    }

    const creds = unseal(conn.credentialsEnc);
    const attempt = entry.attempt + 1;
    let res;
    try {
      res = entry.field === 'price'
        ? await store.pushPrice(creds, listing, entry.value, entry.idempotencyKey)
        : await store.pushQuantity(creds, listing, entry.value, entry.idempotencyKey);
    } catch (err) {
      res = { statusCode: 0, error: err.message };
    }

    entry.attempt = attempt;
    entry.lastStatusCode = res.statusCode;

    if (classifyPushOutcome(res.statusCode) === 'success') {
      entry.status = 'SENT'; entry.sentAt = new Date(); entry.nextAttemptAt = null;
      if (entry.field === 'price') listing.lastPushedPriceMinor = entry.value;
      else listing.lastPushedQty = entry.value;
      listing.lastSyncStatus = 'SYNCED'; listing.lastSyncedAt = new Date(); listing.lastError = undefined;
      await listing.save();
      conn.lastSyncAt = new Date(); conn.consecutiveFailures = 0;
      await conn.save();
    } else if (shouldRetry(res.statusCode, attempt, entry.maxAttempts)) {
      entry.status = 'FAILED';
      entry.lastError = res.error ?? `HTTP ${res.statusCode}`;
      entry.nextAttemptAt = new Date(Date.now() + backoffMs(attempt + 1));
    } else {
      entry.status = 'DEAD';
      entry.lastError = res.error ?? `HTTP ${res.statusCode}`;
      listing.lastSyncStatus = 'FAILED'; listing.lastError = entry.lastError;
      await listing.save();
      conn.consecutiveFailures += 1; conn.lastError = entry.lastError;
      await conn.save();
    }
    await entry.save();
    results.push({ id: entry._id, channel: conn.name, field: entry.field, value: entry.value, status: entry.status, attempt });
  }
  return { processed: results.length, results };
}

/* -------------------------------- listings ------------------------------- */
export const listChannelListings = (orgId, { connectionId, productId } = {}) =>
  ChannelListing.find({ organizationId: orgId, ...(connectionId ? { connectionId } : {}), ...(productId ? { productId } : {}) })
    .populate('connectionId', 'name platform').populate('productId', 'sku title');

/** Pull the remote price/qty so drift (a manual edit in eBay) becomes visible. */
export async function refreshRemote(orgId, listingId) {
  const listing = await ChannelListing.findOne({ _id: listingId, organizationId: orgId });
  if (!listing) throw new ApiError(404, 'Listing not found', 'not_found');
  const { conn, creds } = await loadWithCreds(orgId, listing.connectionId);
  const store = getStore(conn.platform);

  const remote = await store.fetchRemote(creds, listing);
  if (remote.statusCode !== 200) return { listingId, found: false };

  listing.remotePriceMinor = remote.priceMinor;
  listing.remoteQty = remote.quantity;
  const drift = listing.lastPushedPriceMinor != null && remote.priceMinor !== listing.lastPushedPriceMinor;
  listing.lastSyncStatus = drift ? 'CONFLICT' : listing.lastSyncStatus;
  await listing.save();

  return {
    listingId, found: true, drift,
    lastPushedPriceMinor: listing.lastPushedPriceMinor, remotePriceMinor: remote.priceMinor,
  };
}

export { PLATFORM_PRESETS };


/* ===================== RETAIL BUILD-UP (the merchant's sheet) ===================== */
/**
 * The price sheet, computed for every connected store at once:
 *
 *     Cost + Postage → + Profit → + VAT  =  Live display price
 *
 * Each store carries its own VAT set, its own deducted fee (eBay 12.9%, card 2.5%), and
 * its own profit target — so ONE cost change produces a DIFFERENT correct shelf price on
 * each, and every one still clears the profit the merchant asked for.
 */
export async function retailMatrix(orgId, productId) {
  const [product, pricing, conns] = await Promise.all([
    Product.findOne({ _id: productId, organizationId: orgId, deletedAt: null }).lean(),
    VariantPricing.findOne({ organizationId: orgId, productId }).lean(),
    ChannelConnection.find({ organizationId: orgId, active: true }).lean(),
  ]);
  if (!product) throw new ApiError(404, 'Product not found', 'not_found');
  if (pricing?.cost == null) throw new ApiError(400, 'Product has no cost basis — set a cost first', 'validation');

  const rows = [];
  for (const c of conns) {
    const profile = await effectiveProfile(orgId, c._id, productId);
    if (!profile) continue;

    // The platform's commission is a DEDUCTED fee, not an added markup.
    const preset = presetFor(c.platform);
    const feeBps = (preset?.fees?.referralBps ?? 0) + (preset?.fees?.paymentBps ?? 0);

    const result = buildRetailPrice({
      costMinor: pricing.cost,
      weightGrams: product.weightGrams ?? null,
      postageBands: profile.postageBands?.length ? profile.postageBands : null,
      postageMinor: profile.shippingCostMinor ?? 0,
      profitMode: profile.profitMode ?? 'FIXED_AMOUNT',
      profitValue: profile.profitMode === 'FIXED_AMOUNT'
        ? (profile.fixedProfitMinor ?? 0)
        : (profile.targetMarginBps ?? 0),
      taxes: profile.taxes?.length ? profile.taxes : [{ label: 'VAT', bps: 2000 }],
      fees: feeBps ? [{ label: `${c.platform} fee`, bps: feeBps }] : [],
      rounding: profile.rounding ?? 'NONE',
      minProfitMinor: profile.minProfitMinor ?? null,
      sheetMode: profile.sheetMode ?? false,
    });

    rows.push({ connectionId: c._id.toString(), channel: c.name, platform: c.platform, ...result });
  }

  return {
    productId, sku: product.sku, title: product.title,
    costMinor: pricing.cost, weightGrams: product.weightGrams ?? null,
    channels: rows,
  };
}

/** "If I charge £X on this store, what do I actually make?" */
export async function whatIf(orgId, { productId, connectionId, displayMinor }) {
  const [product, pricing, conn] = await Promise.all([
    Product.findOne({ _id: productId, organizationId: orgId, deletedAt: null }).lean(),
    VariantPricing.findOne({ organizationId: orgId, productId }).lean(),
    ChannelConnection.findOne({ _id: connectionId, organizationId: orgId }).lean(),
  ]);
  if (!product || !conn) throw new ApiError(404, 'Product or connection not found', 'not_found');
  if (pricing?.cost == null) throw new ApiError(400, 'Product has no cost basis', 'validation');

  const profile = await effectiveProfile(orgId, conn._id, productId);
  const preset = presetFor(conn.platform);
  const feeBps = (preset?.fees?.referralBps ?? 0) + (preset?.fees?.paymentBps ?? 0);
  const postage = product.weightGrams != null && profile?.postageBands?.length
    ? postageFor(product.weightGrams, profile.postageBands).priceMinor
    : (profile?.shippingCostMinor ?? 0);

  return {
    channel: conn.name,
    ...profitFromDisplayPrice({
      displayMinor, costMinor: pricing.cost, postageMinor: postage,
      taxes: profile?.taxes?.length ? profile.taxes : [{ label: 'VAT', bps: 2000 }],
      fees: feeBps ? [{ label: `${conn.platform} fee`, bps: feeBps }] : [],
    }),
  };
}
