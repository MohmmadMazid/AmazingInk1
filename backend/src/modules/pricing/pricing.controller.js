import { z } from 'zod';
import * as service from './pricing.service.js';
import { ok, created, paginated, pageParams } from '../../utils/envelope.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'invalid id');
const feesSchema = z.object({
  referralBps: z.number().int().min(0).optional(), paymentBps: z.number().int().min(0).optional(),
  paymentFixed: z.number().int().min(0).optional(), fixedFee: z.number().int().min(0).optional(),
  otherFee: z.number().int().min(0).optional(),
}).optional();
const pricingSchema = z.object({
  currency: z.string().length(3).optional(), cost: z.number().int().min(0).nullable().optional(),
  basePrice: z.number().int().min(0).nullable().optional(), minPrice: z.number().int().min(0).nullable().optional(),
  maxPrice: z.number().int().min(0).nullable().optional(), fees: feesSchema,
});
const ruleSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['COST_PLUS_MARGIN', 'MARKUP_PERCENT', 'FIXED_PRICE', 'COMPETITIVE', 'MARGIN_FLOOR']),
  productId: objectId.nullable().optional(),
  marginBps: z.number().int().optional(), markupBps: z.number().int().optional(),
  fixedPrice: z.number().int().optional(), competitiveDeltaBps: z.number().int().optional(),
  rounding: z.enum(['NONE', 'CHARM_99', 'CHARM_95', 'NEAREST_UNIT', 'NEAREST_10']).optional(),
  respectMinMax: z.boolean().optional(), priority: z.number().int().optional(), active: z.boolean().optional(),
});
const promotionSchema = z.object({
  name: z.string().min(1), type: z.enum(['PERCENT_OFF', 'AMOUNT_OFF', 'FIXED_PRICE']),
  value: z.number().int().min(0), productId: objectId.nullable().optional(),
  startsAt: z.string().datetime().optional(), endsAt: z.string().datetime().optional(),
});
const couponSchema = z.object({
  code: z.string().min(1), type: z.enum(['PERCENT', 'AMOUNT', 'FREE_SHIPPING']),
  value: z.number().int().min(0).optional(), minSubtotal: z.number().int().min(0).nullable().optional(),
  maxRedemptions: z.number().int().min(1).nullable().optional(),
  startsAt: z.string().datetime().optional(), endsAt: z.string().datetime().optional(),
});

export async function getPricing(req, res) { ok(res, await service.getPricing(req.user.orgId, req.params.productId)); }
export async function upsertPricing(req, res) { ok(res, await service.upsertPricing(req.user.orgId, req.params.productId, pricingSchema.parse(req.body))); }  // returns { pricing, costChanged, propagation }

export async function quote(req, res) { ok(res, await service.quote(req.user.orgId, req.params.productId)); }
export async function applyQuote(req, res) { ok(res, await service.applyQuote(req.user.orgId, req.params.productId, req.user.id)); }
export async function bulkApply(req, res) { ok(res, await service.bulkApply(req.user.orgId, req.user.id)); }

export async function listRules(req, res) { ok(res, await service.listRules(req.user.orgId)); }
export async function createRule(req, res) { created(res, await service.createRule(req.user.orgId, ruleSchema.parse(req.body))); }
export async function removeRule(req, res) { ok(res, await service.removeRule(req.user.orgId, req.params.id)); }

export async function listPromotions(req, res) { ok(res, await service.listPromotions(req.user.orgId)); }
export async function createPromotion(req, res) { created(res, await service.createPromotion(req.user.orgId, promotionSchema.parse(req.body))); }

export async function listCoupons(req, res) { ok(res, await service.listCoupons(req.user.orgId)); }
export async function createCoupon(req, res) { created(res, await service.createCoupon(req.user.orgId, couponSchema.parse(req.body))); }
export async function validateCoupon(req, res) {
  const { code, subtotal } = z.object({ code: z.string(), subtotal: z.number().int().min(0) }).parse(req.body);
  ok(res, await service.validateCoupon(req.user.orgId, code, subtotal));
}
export async function redeemCoupon(req, res) {
  const { code, subtotal } = z.object({ code: z.string(), subtotal: z.number().int().min(0) }).parse(req.body);
  ok(res, await service.redeemCoupon(req.user.orgId, code, subtotal));
}

export async function history(req, res) {
  const { page, limit, skip } = pageParams(req.query);
  const { data, total } = await service.history(req.user.orgId, { productId: req.query.productId, skip, limit });
  paginated(res, data, { total, page, limit });
}
