import { z } from 'zod';
import * as service from './channels.service.js';
import { ok, created } from '../../utils/envelope.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'invalid id');
const PLATFORM = z.enum(['EBAY', 'AMAZON', 'SHOPIFY', 'WOOCOMMERCE', 'CUSTOM_WEBSITE']);

const connectionSchema = z.object({
  name: z.string().min(1),
  platform: PLATFORM,
  credentials: z.record(z.string()),
  siteId: z.string().optional(),
});

const feesSchema = z.object({
  referralBps: z.number().int().min(0).optional(),
  paymentBps: z.number().int().min(0).optional(),
  paymentFixed: z.number().int().min(0).optional(),
  fixedFee: z.number().int().min(0).optional(),
  otherFee: z.number().int().min(0).optional(),
}).optional();

const profileSchema = z.object({
  connectionId: objectId,
  productId: objectId.nullable().optional(),
  priceMode: z.enum(['MARGIN', 'MARKUP', 'FIXED', 'PASSTHROUGH']).optional(),
  targetMarginBps: z.number().int().min(0).max(9900).optional(),
  floorMarginBps: z.number().int().min(0).max(9900).optional(),
  markupBps: z.number().int().min(0).optional(),
  fixedPriceMinor: z.number().int().min(0).nullable().optional(),
  fees: feesSchema,
  handlingFeeMinor: z.number().int().min(0).optional(),
  shippingCostMinor: z.number().int().min(0).optional(),
  rounding: z.enum(['NONE', 'CHARM_99', 'CHARM_95', 'NEAREST_UNIT', 'NEAREST_10']).optional(),
  minPriceMinor: z.number().int().min(0).nullable().optional(),
  maxPriceMinor: z.number().int().min(0).nullable().optional(),
  autoPropagate: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export async function listPlatforms(req, res) { ok(res, service.listPlatforms()); }

export async function listConnections(req, res) { ok(res, await service.listConnections(req.user.orgId)); }
export async function createConnection(req, res) { created(res, await service.createConnection(req.user.orgId, connectionSchema.parse(req.body))); }
export async function testConnection(req, res) { ok(res, await service.testConnection(req.user.orgId, req.params.id)); }
export async function connectionCredentials(req, res) { ok(res, await service.connectionCredentials(req.user.orgId, req.params.id)); }
export async function updateCredentials(req, res) { ok(res, await service.updateCredentials(req.user.orgId, req.params.id, z.record(z.string()).parse(req.body.credentials))); }
export async function removeConnection(req, res) { ok(res, await service.removeConnection(req.user.orgId, req.params.id)); }

export async function listProfiles(req, res) { ok(res, await service.listProfiles(req.user.orgId, req.query.connectionId)); }
export async function upsertProfile(req, res) { ok(res, await service.upsertProfile(req.user.orgId, profileSchema.parse(req.body))); }
export async function previewProfile(req, res) {
  const body = z.object({ productId: objectId, connectionId: objectId, profile: profileSchema.partial().omit({ connectionId: true }) }).parse(req.body);
  ok(res, await service.previewProfile(req.user.orgId, body));
}

export async function priceMatrix(req, res) { ok(res, await service.priceMatrix(req.user.orgId, req.params.productId)); }

export async function publishProduct(req, res) {
  const body = z.object({ connectionId: objectId, productId: objectId }).parse(req.body);
  created(res, await service.publishProduct(req.user.orgId, body.connectionId, body.productId));
}

export async function propagatePrice(req, res) {
  ok(res, await service.propagatePrice(req.user.orgId, req.params.productId, { force: req.query.force === 'true' }));
}
export async function propagateAll(req, res) { ok(res, await service.propagateAll(req.user.orgId)); }
export async function drain(req, res) { ok(res, await service.drainChannelOutbox(req.user.orgId, {})); }

export async function listListings(req, res) {
  ok(res, await service.listChannelListings(req.user.orgId, { connectionId: req.query.connectionId, productId: req.query.productId }));
}
export async function refreshRemote(req, res) { ok(res, await service.refreshRemote(req.user.orgId, req.params.id)); }

export async function retailMatrix(req, res) { ok(res, await service.retailMatrix(req.user.orgId, req.params.productId)); }
export async function whatIf(req, res) {
  const body = z.object({ productId: objectId, connectionId: objectId, displayMinor: z.number().int().positive() }).parse(req.body);
  ok(res, await service.whatIf(req.user.orgId, body));
}
