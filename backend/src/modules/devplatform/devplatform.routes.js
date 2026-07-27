import { Router } from 'express';
import * as controller from './devplatform.controller.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { requirePermission } from '../../middleware/permissions.middleware.js';
import { rateLimit } from '../../middleware/security.middleware.js';

const router = Router();

/* --- PUBLIC OAuth endpoints: the client authenticates with its own credentials, so these
       sit BEFORE requireAuth. Rate-limited, since they are unauthenticated. --- */
const oauthLimit = rateLimit({ windowSec: 60, maxRequests: 30 });
router.post('/oauth/token', oauthLimit, asyncHandler(controller.token));
router.post('/oauth/authorize', oauthLimit, asyncHandler(controller.authorize));

/* --- Everything below requires a console session. --- */
router.use(requireAuth);

router.post('/oauth/introspect', requirePermission('developer:manage'), asyncHandler(controller.introspect));
router.post('/oauth/revoke', requirePermission('developer:manage'), asyncHandler(controller.revokeToken));

router.get('/keys', requirePermission('developer:view'), asyncHandler(controller.listKeys));
router.post('/keys', requirePermission('developer:manage'), asyncHandler(controller.createKey));
router.delete('/keys/:id', requirePermission('developer:manage'), asyncHandler(controller.revokeKey));

router.get('/clients', requirePermission('developer:view'), asyncHandler(controller.listClients));
router.post('/clients', requirePermission('developer:manage'), asyncHandler(controller.createClient));
router.delete('/clients/:id', requirePermission('developer:manage'), asyncHandler(controller.removeClient));

router.get('/subscriptions', requirePermission('developer:view'), asyncHandler(controller.listSubscriptions));
router.post('/subscriptions', requirePermission('developer:manage'), asyncHandler(controller.createSubscription));
router.delete('/subscriptions/:id', requirePermission('developer:manage'), asyncHandler(controller.removeSubscription));

router.get('/deliveries', requirePermission('developer:view'), asyncHandler(controller.listDeliveries));
router.post('/deliveries/drain', requirePermission('developer:manage'), asyncHandler(controller.drain));
router.post('/deliveries/:id/redeliver', requirePermission('developer:manage'), asyncHandler(controller.redeliver));

router.get('/usage/summary', requirePermission('developer:view'), asyncHandler(controller.usageSummary));
router.get('/usage/timeseries', requirePermission('developer:view'), asyncHandler(controller.usageTimeseries));
router.get('/usage/quota', requirePermission('developer:view'), asyncHandler(controller.quota));

router.get('/versions', requirePermission('developer:view'), asyncHandler(controller.listVersions));
router.post('/versions/seed', requirePermission('developer:manage'), asyncHandler(controller.seedVersions));
router.put('/versions', requirePermission('developer:manage'), asyncHandler(controller.upsertVersion));

router.get('/reference/openapi', requirePermission('developer:view'), asyncHandler(controller.openapi));
router.get('/reference/sdk', requirePermission('developer:view'), asyncHandler(controller.sdk));
router.get('/reference/events', requirePermission('developer:view'), asyncHandler(controller.events));
router.post('/reference/events/test', requirePermission('developer:manage'), asyncHandler(controller.testEvent));

export default router;
