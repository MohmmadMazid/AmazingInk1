import { Router } from 'express';
import * as controller from './pricing.controller.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { requirePermission } from '../../middleware/permissions.middleware.js';

const router = Router();
router.use(requireAuth);

// Static segments first so they are never shadowed by ':productId' / ':id'.
router.get('/rules', requirePermission('pricing:view'), asyncHandler(controller.listRules));
router.post('/rules', requirePermission('pricing:manage'), asyncHandler(controller.createRule));
router.delete('/rules/:id', requirePermission('pricing:manage'), asyncHandler(controller.removeRule));

router.get('/promotions', requirePermission('pricing:view'), asyncHandler(controller.listPromotions));
router.post('/promotions', requirePermission('pricing:manage'), asyncHandler(controller.createPromotion));

router.get('/coupons', requirePermission('pricing:view'), asyncHandler(controller.listCoupons));
router.post('/coupons', requirePermission('pricing:manage'), asyncHandler(controller.createCoupon));
router.post('/coupons/validate', requirePermission('pricing:view'), asyncHandler(controller.validateCoupon));
router.post('/coupons/redeem', requirePermission('pricing:manage'), asyncHandler(controller.redeemCoupon));

router.get('/history', requirePermission('pricing:view'), asyncHandler(controller.history));
router.post('/bulk-apply', requirePermission('pricing:manage'), asyncHandler(controller.bulkApply));

router.get('/quote/:productId', requirePermission('pricing:view'), asyncHandler(controller.quote));
router.post('/quote/:productId/apply', requirePermission('pricing:manage'), asyncHandler(controller.applyQuote));
router.get('/:productId', requirePermission('pricing:view'), asyncHandler(controller.getPricing));
router.put('/:productId', requirePermission('pricing:manage'), asyncHandler(controller.upsertPricing));

export default router;
