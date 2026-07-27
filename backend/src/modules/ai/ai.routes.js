import { Router } from 'express';
import * as controller from './ai.controller.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { requirePermission } from '../../middleware/permissions.middleware.js';
import { rateLimit } from '../../middleware/security.middleware.js';

const router = Router();
router.use(requireAuth);

// LLM calls cost money and latency — rate-limit them per user.
const aiLimit = rateLimit({ windowSec: 60, maxRequests: 20, keyBy: 'user' });

router.get('/providers', requirePermission('ai:view'), asyncHandler(controller.providers));
router.get('/usage', requirePermission('ai:view'), asyncHandler(controller.usageReport));
router.get('/calls', requirePermission('ai:view'), asyncHandler(controller.recentCalls));

router.get('/prompts', requirePermission('ai:view'), asyncHandler(controller.listPrompts));
router.put('/prompts', requirePermission('ai:manage'), asyncHandler(controller.upsertPrompt));
router.post('/prompts/:key/run', aiLimit, requirePermission('ai:use'), asyncHandler(controller.runPrompt));

router.get('/insights', aiLimit, requirePermission('ai:use'), asyncHandler(controller.insights));
router.post('/image/check', requirePermission('ai:view'), asyncHandler(controller.checkImage));

router.post('/products/:productId/description', aiLimit, requirePermission('ai:use'), asyncHandler(controller.generateDescription));
router.post('/products/:productId/keywords', aiLimit, requirePermission('ai:use'), asyncHandler(controller.generateKeywords));
router.get('/products/:productId/duplicates', requirePermission('ai:view'), asyncHandler(controller.findDuplicates));
router.get('/products/:productId/forecast', aiLimit, requirePermission('ai:use'), asyncHandler(controller.forecast));
router.get('/products/:productId/price', aiLimit, requirePermission('ai:use'), asyncHandler(controller.suggestPrice));

export default router;
