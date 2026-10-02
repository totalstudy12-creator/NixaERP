// src/hooks/usePermission.ts
import { useAuthStore } from '../store/auth';

export function usePermission() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const hasAnyPermission = useAuthStore((s) => s.hasAnyPermission);
  const hasAllPermissions = useAuthStore((s) => s.hasAllPermissions);
  const hasRole = useAuthStore((s) => s.hasRole);
  const hasAnyRole = useAuthStore((s) => s.hasAnyRole);
  const isSuperAdmin = useAuthStore((s) => s.isSuperAdmin);
  const user = useAuthStore((s) => s.user);

  return {
    can: hasPermission,
    canAny: hasAnyPermission,
    canAll: hasAllPermissions,
    hasRole,
    hasAnyRole,
    isSuperAdmin: isSuperAdmin(),
    user,
  };
}