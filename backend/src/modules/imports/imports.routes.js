import { Router } from 'express';
import * as controller from './imports.controller.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { requirePermission } from '../../middleware/permissions.middleware.js';
import { rateLimit } from '../../middleware/security.middleware.js';

const router = Router();
router.use(requireAuth);

// Imports touch the whole catalogue and can trigger a reprice across every store.
const importLimit = rateLimit({ windowSec: 60, maxRequests: 10, keyBy: 'user' });

router.get('/columns', requirePermission('products:view'), asyncHandler(controller.columns));
router.get('/template', requirePermission('products:view'), asyncHandler(controller.template));
router.get('/export', requirePermission('products:view'), asyncHandler(controller.exportProducts));

router.post('/preview', importLimit, requirePermission('products:view'), asyncHandler(controller.preview));
router.post('/commit', importLimit, requirePermission('products:manage'), asyncHandler(controller.commit));

export default router;
