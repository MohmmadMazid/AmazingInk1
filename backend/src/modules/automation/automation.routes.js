import { Router } from 'express';
import * as controller from './automation.controller.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { requirePermission } from '../../middleware/permissions.middleware.js';

const router = Router();
router.use(requireAuth);

router.get('/monitoring', requirePermission('automation:view'), asyncHandler(controller.monitoring));
router.post('/queue/pause', requirePermission('automation:manage'), asyncHandler(controller.pauseQueue));
router.post('/queue/resume', requirePermission('automation:manage'), asyncHandler(controller.resumeQueue));

router.get('/handlers', requirePermission('automation:view'), asyncHandler(controller.availableHandlers));
router.get('/jobs', requirePermission('automation:view'), asyncHandler(controller.listJobDefinitions));
router.put('/jobs', requirePermission('automation:manage'), asyncHandler(controller.upsertJobDefinition));
router.post('/jobs/enqueue', requirePermission('automation:manage'), asyncHandler(controller.enqueueJob));

router.get('/runs', requirePermission('automation:view'), asyncHandler(controller.listRuns));
router.post('/runs/:id/retry', requirePermission('automation:manage'), asyncHandler(controller.retryRun));

router.get('/schedules', requirePermission('automation:view'), asyncHandler(controller.listSchedules));
router.put('/schedules', requirePermission('automation:manage'), asyncHandler(controller.upsertSchedule));
router.post('/schedules/tick', requirePermission('automation:manage'), asyncHandler(controller.tickScheduler));
router.delete('/schedules/:id', requirePermission('automation:manage'), asyncHandler(controller.removeSchedule));

router.get('/rules', requirePermission('automation:view'), asyncHandler(controller.listRules));
router.put('/rules', requirePermission('automation:manage'), asyncHandler(controller.upsertRule));
router.post('/rules/emit', requirePermission('automation:manage'), asyncHandler(controller.emitEvent));
router.post('/rules/:id/test', requirePermission('automation:view'), asyncHandler(controller.testRule));
router.delete('/rules/:id', requirePermission('automation:manage'), asyncHandler(controller.removeRule));

router.get('/workflows', requirePermission('automation:view'), asyncHandler(controller.listWorkflows));
router.put('/workflows', requirePermission('automation:manage'), asyncHandler(controller.upsertWorkflow));
router.get('/workflow-runs', requirePermission('automation:view'), asyncHandler(controller.listWorkflowRuns));
router.post('/workflows/:id/run', requirePermission('automation:manage'), asyncHandler(controller.runWorkflow));

export default router;
