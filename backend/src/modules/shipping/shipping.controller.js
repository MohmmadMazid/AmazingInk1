import { z } from 'zod';
import * as service from './shipping.service.js';
import { ok, created, paginated, pageParams } from '../../utils/envelope.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'invalid id');
const addressSchema = z.object({
  name: z.string().optional(), line1: z.string().optional(), city: z.string().optional(),
  state: z.string().optional(), postalCode: z.string().min(1), country: z.string().default('US'),
});
const itemsSchema = z.array(z.object({
  weightG: z.number().int().positive(), quantity: z.number().int().positive(),
  lengthMm: z.number().int().optional(), widthMm: z.number().int().optional(), heightMm: z.number().int().optional(),
})).min(1);
const strategy = z.enum(['CHEAPEST', 'FASTEST', 'BEST_VALUE', 'CARRIER_RULE']).optional();

const packageSchema = z.object({
  name: z.string().min(1), kind: z.enum(['BOX', 'ENVELOPE', 'SOFT_PACK', 'TUBE', 'CUSTOM']).optional(),
  lengthMm: z.number().int().positive(), widthMm: z.number().int().positive(), heightMm: z.number().int().positive(),
  emptyWeightG: z.number().int().min(0).optional(), maxWeightG: z.number().int().positive().nullable().optional(),
});
const ruleSchema = z.object({
  name: z.string().min(1), priority: z.number().int().optional(), isActive: z.boolean().optional(),
  conditions: z.array(z.object({ field: z.string(), op: z.enum(['eq', 'ne', 'gt', 'lt', 'gte', 'lte', 'in']), value: z.any() })),
  action: z.object({ carrier: z.string(), serviceCode: z.string().optional() }),
});
const shopSchema = z.object({ from: addressSchema, to: addressSchema, items: itemsSchema, strategy, currency: z.string().length(3).optional() });
const shipmentSchema = shopSchema.extend({ orderId: objectId, carrier: z.string().optional(), serviceCode: z.string().optional() });

export async function listPackages(req, res) { ok(res, await service.listPackages(req.user.orgId)); }
export async function createPackage(req, res) { created(res, await service.createPackage(req.user.orgId, packageSchema.parse(req.body))); }

export async function listRules(req, res) { ok(res, await service.listRules(req.user.orgId)); }
export async function createRule(req, res) { created(res, await service.createRule(req.user.orgId, ruleSchema.parse(req.body))); }
export async function removeRule(req, res) { ok(res, await service.removeRule(req.user.orgId, req.params.id)); }

export async function shopRates(req, res) { ok(res, await service.shopRates(req.user.orgId, shopSchema.parse(req.body))); }
export async function createShipment(req, res) { created(res, await service.createShipment(req.user.orgId, shipmentSchema.parse(req.body))); }

export async function listShipments(req, res) {
  const { page, limit, skip } = pageParams(req.query);
  const { data, total } = await service.listShipments(req.user.orgId, { skip, limit, status: req.query.status, orderId: req.query.orderId });
  paginated(res, data, { total, page, limit });
}
export async function getShipment(req, res) { ok(res, await service.getShipment(req.user.orgId, req.params.id)); }
export async function refreshTracking(req, res) { ok(res, await service.refreshTracking(req.user.orgId, req.params.id)); }
export async function trackingWebhook(req, res) {
  const { trackingNumber, rawStatus, message } = z.object({ trackingNumber: z.string(), rawStatus: z.string(), message: z.string().optional() }).parse(req.body);
  ok(res, await service.applyTrackingUpdate(req.user.orgId, trackingNumber, rawStatus, message));
}
