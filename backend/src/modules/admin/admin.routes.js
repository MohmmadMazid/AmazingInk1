import { Router } from 'express';
import * as controller from './admin.controller.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { requirePermission } from '../../middleware/permissions.middleware.js';

const router = Router();
router.use(requireAuth);

// Flag evaluation is for the current user — no admin permission needed.
router.get('/flags/evaluate', asyncHandler(controller.evaluateFlags));

router.get('/settings', requirePermission('admin:view'), asyncHandler(controller.getSettings));
router.put('/settings', requirePermission('admin:manage'), asyncHandler(controller.setSetting));

router.get('/audit', requirePermission('admin:view'), asyncHandler(controller.listAudit));

router.get('/credentials', requirePermission('admin:view'), asyncHandler(controller.listCredentials));
router.post('/credentials', requirePermission('admin:manage'), asyncHandler(controller.createCredential));
router.delete('/credentials/:id', requirePermission('admin:manage'), asyncHandler(controller.revokeCredential));

router.get('/webhooks', requirePermission('admin:view'), asyncHandler(controller.listWebhooks));
router.post('/webhooks', requirePermission('admin:manage'), asyncHandler(controller.createWebhook));
router.post('/webhooks/test', requirePermission('admin:manage'), asyncHandler(controller.testWebhook));
router.delete('/webhooks/:id', requirePermission('admin:manage'), asyncHandler(controller.removeWebhook));

router.get('/flags', requirePermission('admin:view'), asyncHandler(controller.listFlags));
router.put('/flags', requirePermission('admin:manage'), asyncHandler(controller.upsertFlag));

router.get('/permissions', requirePermission('admin:view'), asyncHandler(controller.permissionCatalog));
router.get('/roles', requirePermission('admin:view'), asyncHandler(controller.listRoles));
router.put('/roles', requirePermission('admin:manage'), asyncHandler(controller.upsertRole));
router.delete('/roles/:id', requirePermission('admin:manage'), asyncHandler(controller.removeRole));

router.post('/security/check-password', requirePermission('admin:view'), asyncHandler(controller.checkPassword));

router.get('/users', requirePermission('admin:view'), asyncHandler(controller.listUsers));
router.get('/users/:id/permissions', requirePermission('admin:view'), asyncHandler(controller.effectivePermissions));
router.put('/users/:id', requirePermission('admin:manage'), asyncHandler(controller.updateUser));

export default router;
