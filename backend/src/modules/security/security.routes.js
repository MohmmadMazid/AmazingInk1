import { Router } from 'express';
import * as controller from './security.controller.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { requirePermission } from '../../middleware/permissions.middleware.js';

const router = Router();
router.use(requireAuth);

router.get('/dashboard', requirePermission('security:view'), asyncHandler(controller.dashboard));
router.get('/events', requirePermission('security:view'), asyncHandler(controller.listEvents));

router.get('/login-history', requirePermission('security:view'), asyncHandler(controller.loginHistory));
router.get('/lock-status', requirePermission('security:view'), asyncHandler(controller.lockStatus));
router.post('/clear-lockout', requirePermission('security:manage'), asyncHandler(controller.clearLockout));

router.get('/sessions', asyncHandler(controller.listSessions));
router.post('/sessions/revoke-all', asyncHandler(controller.revokeAllSessions));
router.delete('/sessions/:id', asyncHandler(controller.revokeSession));

router.get('/rate-limits', requirePermission('security:view'), asyncHandler(controller.listRateLimitPolicies));
router.put('/rate-limits', requirePermission('security:manage'), asyncHandler(controller.upsertRateLimitPolicy));
router.get('/ip-allowlist', requirePermission('security:view'), asyncHandler(controller.listIpAllowlist));
router.post('/ip-allowlist', requirePermission('security:manage'), asyncHandler(controller.addIpEntry));
router.delete('/ip-allowlist/:id', requirePermission('security:manage'), asyncHandler(controller.removeIpEntry));

router.get('/retention', requirePermission('security:view'), asyncHandler(controller.listRetentionPolicies));
router.put('/retention', requirePermission('security:manage'), asyncHandler(controller.upsertRetentionPolicy));
router.post('/retention/run', requirePermission('security:manage'), asyncHandler(controller.runRetention));

router.get('/gdpr', requirePermission('security:view'), asyncHandler(controller.listGdprRequests));
router.post('/gdpr', requirePermission('security:manage'), asyncHandler(controller.createGdprRequest));
router.post('/gdpr/:id/access', requirePermission('security:manage'), asyncHandler(controller.processAccess));
router.post('/gdpr/:id/erasure', requirePermission('security:manage'), asyncHandler(controller.processErasure));

router.get('/compliance/controls', requirePermission('security:view'), asyncHandler(controller.listControls));
router.post('/compliance/seed', requirePermission('security:manage'), asyncHandler(controller.seedFramework));
router.put('/compliance/controls/:id', requirePermission('security:manage'), asyncHandler(controller.updateControl));
router.get('/compliance/:framework', requirePermission('security:view'), asyncHandler(controller.complianceReport));

export default router;
