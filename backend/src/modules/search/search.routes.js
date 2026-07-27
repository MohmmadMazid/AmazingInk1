import { Router } from 'express';
import * as controller from './search.controller.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { requirePermission } from '../../middleware/permissions.middleware.js';

const router = Router();
router.use(requireAuth);

// Static segments before ':entity'.
router.get('/', asyncHandler(controller.globalSearch));            // global omnibox
router.get('/suggest', asyncHandler(controller.suggest));
router.get('/index/status', requirePermission('admin:view'), asyncHandler(controller.indexStatus));
router.post('/index/rebuild', requirePermission('admin:manage'), asyncHandler(controller.reindexAll));
router.post('/index/rebuild/:entity', requirePermission('admin:manage'), asyncHandler(controller.reindexEntity));

router.get('/synonyms', asyncHandler(controller.listSynonyms));
router.post('/synonyms', requirePermission('admin:manage'), asyncHandler(controller.createSynonym));
router.delete('/synonyms/:id', requirePermission('admin:manage'), asyncHandler(controller.removeSynonym));

router.get('/saved', asyncHandler(controller.listSavedSearches));
router.post('/saved', asyncHandler(controller.createSavedSearch));
router.delete('/saved/:id', asyncHandler(controller.removeSavedSearch));

router.get('/analytics', requirePermission('analytics:view'), asyncHandler(controller.analytics));

router.get('/:entity', asyncHandler(controller.search));           // must be last
export default router;
