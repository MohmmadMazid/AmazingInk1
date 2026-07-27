import { Router } from 'express';
import * as controller from './shipping.controller.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { requirePermission } from '../../middleware/permissions.middleware.js';

const router = Router();
router.use(requireAuth);

// Static segments before ':id' so they are never shadowed.
router.get('/packages', requirePermission('shipping:view'), asyncHandler(controller.listPackages));
router.post('/packages', requirePermission('shipping:manage'), asyncHandler(controller.createPackage));

router.get('/rules', requirePermission('shipping:view'), asyncHandler(controller.listRules));
router.post('/rules', requirePermission('shipping:manage'), asyncHandler(controller.createRule));
router.delete('/rules/:id', requirePermission('shipping:manage'), asyncHandler(controller.removeRule));

router.post('/rates', requirePermission('shipping:view'), asyncHandler(controller.shopRates));
router.post('/tracking/webhook', requirePermission('shipping:manage'), asyncHandler(controller.trackingWebhook));

router.get('/shipments', requirePermission('shipping:view'), asyncHandler(controller.listShipments));
router.post('/shipments', requirePermission('shipping:manage'), asyncHandler(controller.createShipment));
router.get('/shipments/:id', requirePermission('shipping:view'), asyncHandler(controller.getShipment));
router.post('/shipments/:id/refresh', requirePermission('shipping:manage'), asyncHandler(controller.refreshTracking));

export default router;
