import { Router } from 'express';
import * as controller from './order.controller.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { requirePermission } from '../../middleware/permissions.middleware.js';

const router = Router();
router.use(requireAuth);
router.get('/', requirePermission('orders:view'), asyncHandler(controller.list));
router.get('/:id', requirePermission('orders:view'), asyncHandler(controller.get));
router.post('/', requirePermission('orders:manage'), asyncHandler(controller.create));
router.patch('/:id/status', requirePermission('orders:manage'), asyncHandler(controller.setStatus));
export default router;
