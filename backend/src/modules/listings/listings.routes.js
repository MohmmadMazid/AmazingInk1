import { Router } from 'express';
import * as controller from './listings.controller.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { requirePermission } from '../../middleware/permissions.middleware.js';

const router = Router();
router.use(requireAuth);

// Static segments before ':id'.
router.get('/channels', requirePermission('listings:view'), asyncHandler(controller.listChannels));
router.post('/channels', requirePermission('listings:manage'), asyncHandler(controller.createChannel));

router.get('/outbox', requirePermission('listings:view'), asyncHandler(controller.listOutbox));
router.get('/conflicts', requirePermission('listings:view'), asyncHandler(controller.listConflicts));

router.post('/sync-all', requirePermission('listings:manage'), asyncHandler(controller.syncAll));
router.post('/drain', requirePermission('listings:manage'), asyncHandler(controller.drainOutbox));
router.post('/publish', requirePermission('listings:manage'), asyncHandler(controller.publishListing));

router.get('/', requirePermission('listings:view'), asyncHandler(controller.listListings));
router.post('/:id/sync', requirePermission('listings:manage'), asyncHandler(controller.syncListing));

export default router;
