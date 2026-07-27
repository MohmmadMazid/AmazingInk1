import { Router } from 'express';
import * as controller from './channels.controller.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { requirePermission } from '../../middleware/permissions.middleware.js';

const router = Router();
router.use(requireAuth);

// Static segments before ':id' / ':productId'.
router.get('/platforms', requirePermission('channels:view'), asyncHandler(controller.listPlatforms));

router.get('/connections', requirePermission('channels:view'), asyncHandler(controller.listConnections));
router.post('/connections', requirePermission('channels:manage'), asyncHandler(controller.createConnection));
router.get('/connections/:id/credentials', requirePermission('channels:manage'), asyncHandler(controller.connectionCredentials));
router.put('/connections/:id/credentials', requirePermission('channels:manage'), asyncHandler(controller.updateCredentials));
router.post('/connections/:id/test', requirePermission('channels:manage'), asyncHandler(controller.testConnection));
router.delete('/connections/:id', requirePermission('channels:manage'), asyncHandler(controller.removeConnection));

router.get('/profiles', requirePermission('channels:view'), asyncHandler(controller.listProfiles));
router.put('/profiles', requirePermission('channels:manage'), asyncHandler(controller.upsertProfile));
router.post('/profiles/preview', requirePermission('channels:view'), asyncHandler(controller.previewProfile));

router.get('/listings', requirePermission('channels:view'), asyncHandler(controller.listListings));
router.post('/listings/publish', requirePermission('channels:manage'), asyncHandler(controller.publishProduct));
router.post('/listings/:id/refresh', requirePermission('channels:view'), asyncHandler(controller.refreshRemote));

router.post('/propagate-all', requirePermission('channels:manage'), asyncHandler(controller.propagateAll));
router.post('/drain', requirePermission('channels:manage'), asyncHandler(controller.drain));
router.get('/price-matrix/:productId', requirePermission('channels:view'), asyncHandler(controller.priceMatrix));
router.get('/retail-matrix/:productId', requirePermission('channels:view'), asyncHandler(controller.retailMatrix));
router.post('/what-if', requirePermission('channels:view'), asyncHandler(controller.whatIf));
router.post('/propagate/:productId', requirePermission('channels:manage'), asyncHandler(controller.propagatePrice));

export default router;
