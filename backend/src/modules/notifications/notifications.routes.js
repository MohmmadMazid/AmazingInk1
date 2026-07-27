import { Router } from 'express';
import * as controller from './notifications.controller.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { requirePermission } from '../../middleware/permissions.middleware.js';

const router = Router();
router.use(requireAuth);

// Every user manages their own inbox and settings — no extra permission needed.
router.get('/', asyncHandler(controller.inbox));
router.post('/read-all', asyncHandler(controller.markAllRead));
router.get('/settings', asyncHandler(controller.getSettings));
router.put('/settings', asyncHandler(controller.updateSettings));
router.get('/digest', asyncHandler(controller.pendingDigest));
router.post('/digest/send', asyncHandler(controller.sendDigest));
router.get('/provider-outbox', asyncHandler(controller.providerOutbox));

// Templates + emitting are operator actions.
router.get('/templates', requirePermission('notifications:view'), asyncHandler(controller.listTemplates));
router.post('/templates', requirePermission('notifications:manage'), asyncHandler(controller.createTemplate));
router.post('/templates/:key/preview', requirePermission('notifications:view'), asyncHandler(controller.previewTemplate));
router.post('/emit', requirePermission('notifications:manage'), asyncHandler(controller.emit));
router.post('/broadcast', requirePermission('notifications:manage'), asyncHandler(controller.broadcast));

// ':id' last so it never shadows the static routes above.
router.post('/:id/read', asyncHandler(controller.markRead));

export default router;
