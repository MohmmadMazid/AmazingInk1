import { Router } from 'express';
import * as controller from './settings.controller.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { requirePermission } from '../../middleware/permissions.middleware.js';

const router = Router();
router.use(requireAuth);

// Every authenticated user needs the currency to render prices.
router.get('/bootstrap', asyncHandler(controller.bootstrap));
router.get('/currency', asyncHandler(controller.getCurrency));
router.get('/currencies', asyncHandler(controller.supported));

router.put('/currency', requirePermission('admin:manage'), asyncHandler(controller.setCurrency));

export default router;
