import { Router } from 'express';
import * as controller from './analytics.controller.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { requirePermission } from '../../middleware/permissions.middleware.js';

const router = Router();
router.use(requireAuth);

router.get('/dashboard', requirePermission('analytics:view'), asyncHandler(controller.dashboard));
router.get('/pnl', requirePermission('analytics:view'), asyncHandler(controller.pnl));
router.get('/by-channel', requirePermission('analytics:view'), asyncHandler(controller.byChannel));
router.get('/top-products', requirePermission('analytics:view'), asyncHandler(controller.topProducts));
router.get('/inventory-valuation', requirePermission('analytics:view'), asyncHandler(controller.inventoryValuation));

router.post('/rollups/rebuild', requirePermission('analytics:manage'), asyncHandler(controller.rebuildRollups));

router.get('/saved-reports', requirePermission('analytics:view'), asyncHandler(controller.listSavedReports));
router.post('/saved-reports', requirePermission('analytics:manage'), asyncHandler(controller.createSavedReport));
router.delete('/saved-reports/:id', requirePermission('analytics:manage'), asyncHandler(controller.removeSavedReport));

// ':type' last so it never shadows the static routes above.
router.get('/export/:type', requirePermission('analytics:view'), asyncHandler(controller.exportCsv));

export default router;
