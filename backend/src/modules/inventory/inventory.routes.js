import { Router } from 'express';
import * as controller from './inventory.controller.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { requirePermission } from '../../middleware/permissions.middleware.js';

const router = Router();
router.use(requireAuth);

// Static segments declared before ':id' routes so they are never shadowed.
router.get('/warehouses', requirePermission('inventory:view'), asyncHandler(controller.listWarehouses));
router.post('/warehouses', requirePermission('inventory:manage'), asyncHandler(controller.createWarehouse));

router.get('/levels', requirePermission('inventory:view'), asyncHandler(controller.listLevels));
router.get('/history', requirePermission('inventory:view'), asyncHandler(controller.history));
router.get('/reorder-report', requirePermission('inventory:view'), asyncHandler(controller.reorderReport));
router.get('/forecast/:productId', requirePermission('inventory:view'), asyncHandler(controller.forecast));

router.post('/adjust', requirePermission('inventory:manage'), asyncHandler(controller.adjust));
router.post('/reserve', requirePermission('inventory:manage'), asyncHandler(controller.reserve));
router.post('/reservations/:id/release', requirePermission('inventory:manage'), asyncHandler(controller.release));
router.post('/reservations/:id/fulfill', requirePermission('inventory:manage'), asyncHandler(controller.fulfill));

export default router;
