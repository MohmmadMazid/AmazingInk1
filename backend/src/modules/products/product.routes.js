import { Router } from 'express';
import * as controller from './product.controller.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { requirePermission } from '../../middleware/permissions.middleware.js';

const router = Router();
router.use(requireAuth);
router.get('/', requirePermission('products:view'), asyncHandler(controller.list));
router.get('/:id', requirePermission('products:view'), asyncHandler(controller.get));
router.post('/', requirePermission('products:manage'), asyncHandler(controller.create));
router.put('/:id', requirePermission('products:manage'), asyncHandler(controller.update));
router.delete('/:id', requirePermission('products:manage'), asyncHandler(controller.remove));
export default router;
