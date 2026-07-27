import { useAuth } from './AuthContext.jsx';

/** Renders children only if the current user holds the permission (or '*'). Mirrors the original
 *  platform's RequirePermission component. */
export function RequirePermission({ permission, children, fallback = null }) {
  const { user } = useAuth();
  const perms = user?.permissions ?? [];
  if (perms.includes('*') || perms.includes(permission)) return children;
  return fallback;
}
