import { ApiError } from '../utils/asyncHandler.js';
import { hasPermission } from '../core/admin.js';

/**
 * Guards a route by a granular `resource:action` permission.
 *
 * Wildcards are honoured via the admin core: `*` grants everything, and `resource:*` grants
 * every action on that resource. Usage:
 *   router.post('/', requireAuth, requirePermission('products:manage'), handler)
 */
export const requirePermission = (permission) => (req, _res, next) => {
  const held = req.user?.permissions ?? [];
  if (hasPermission(held, permission)) return next();
  next(new ApiError(403, `Missing permission: ${permission}`, 'forbidden'));
};
