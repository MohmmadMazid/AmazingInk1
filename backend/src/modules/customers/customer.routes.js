import { Router } from 'express';
import * as controller from './customer.controller.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { requirePermission } from '../../middleware/permissions.middleware.js';

const router = Router();
router.use(requireAuth);
// Static/collection routes before ':id' so they are not shadowed by the param route.
router.get('/', requirePermission('customers:view'), asyncHandler(controller.list));
router.get('/duplicates', requirePermission('customers:view'), asyncHandler(controller.duplicates));
router.post('/', requirePermission('customers:manage'), asyncHandler(controller.create));
router.get('/:id', requirePermission('customers:view'), asyncHandler(controller.get));
router.get('/:id/metrics', requirePermission('customers:view'), asyncHandler(controller.metrics));
router.put('/:id', requirePermission('customers:manage'), asyncHandler(controller.update));
router.delete('/:id', requirePermission('customers:manage'), asyncHandler(controller.remove));
router.post('/:id/notes', requirePermission('customers:manage'), asyncHandler(controller.addNote));
export default router;
