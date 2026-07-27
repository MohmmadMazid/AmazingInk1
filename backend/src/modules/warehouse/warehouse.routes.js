import { Router } from 'express';
import * as controller from './warehouse.controller.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { requirePermission } from '../../middleware/permissions.middleware.js';

const router = Router();
router.use(requireAuth);

// Static segments before ':id' so they are never shadowed.
router.get('/bins', requirePermission('warehouse:view'), asyncHandler(controller.listBins));
router.post('/bins', requirePermission('warehouse:manage'), asyncHandler(controller.createBin));
router.get('/bin-contents', requirePermission('warehouse:view'), asyncHandler(controller.binContents));

router.get('/receipts', requirePermission('warehouse:view'), asyncHandler(controller.listReceipts));
router.post('/receipts', requirePermission('warehouse:manage'), asyncHandler(controller.createReceipt));
router.post('/receipts/:id/receive', requirePermission('warehouse:manage'), asyncHandler(controller.receiveItems));
router.get('/receipts/:id/putaway-suggestions', requirePermission('warehouse:view'), asyncHandler(controller.putawaySuggestions));
router.post('/receipts/:id/putaway', requirePermission('warehouse:manage'), asyncHandler(controller.confirmPutaway));

router.get('/allocate/:orderId', requirePermission('warehouse:view'), asyncHandler(controller.allocateOrder));

router.get('/pick-lists', requirePermission('warehouse:view'), asyncHandler(controller.listPickLists));
router.post('/pick-lists', requirePermission('warehouse:manage'), asyncHandler(controller.createPickList));
router.get('/pick-lists/:id', requirePermission('warehouse:view'), asyncHandler(controller.getPickList));
router.post('/pick-lists/:id/pick', requirePermission('warehouse:manage'), asyncHandler(controller.recordPick));

export default router;
