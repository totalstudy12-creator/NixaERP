// src/components/PermissionGate.tsx
import React from 'react';
import { useAuthStore } from '../store/auth';

interface Props {
  /** ANY-of permission check (default). */
  permissions?: string[];
  /** ALL-of permission check — takes precedence over `permissions`. */
  allPermissions?: string[];
  /** ANY-of role check. */
  roles?: string[];
  /** Rendered when the check fails. Defaults to nothing. */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Inline RBAC conditional.
 *
 *   <PermissionGate permissions={['create users']}>
 *     <NewUserButton />
 *   </PermissionGate>
 *
 *   <PermissionGate allPermissions={['edit users', 'delete users']} fallback={<ReadOnly />}>
 *     <AdminPanel />
 *   </PermissionGate>
 */
export const PermissionGate: React.FC<Props> = ({
  permissions,
  allPermissions,
  roles,
  fallback = null,
  children,
}) => {
  const hasAnyPermission = useAuthStore((s) => s.hasAnyPermission);
  const hasAllPermissions = useAuthStore((s) => s.hasAllPermissions);
  const hasAnyRole = useAuthStore((s) => s.hasAnyRole);
  const isSuperAdmin = useAuthStore((s) => s.isSuperAdmin)();

  const allowed = (() => {
    if (isSuperAdmin) return true;
    if (allPermissions?.length) return hasAllPermissions(allPermissions);
    if (permissions?.length) return hasAnyPermission(permissions);
    if (roles?.length) return hasAnyRole(roles);
    return true;
  })();

  return <>{allowed ? children : fallback}</>;
};

export default PermissionGate;