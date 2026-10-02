// src/components/RequirePermission.tsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { PermissionDeniedPage } from '../pages/PermissionDeniedPage';

interface Props {
  permissions?: string[];
  allPermissions?: string[];
  roles?: string[];
  children: React.ReactNode;
}

export const RequirePermission: React.FC<Props> = ({
  permissions,
  allPermissions,
  roles,
  children,
}) => {
  const location = useLocation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasAnyPermission = useAuthStore((s) => s.hasAnyPermission);
  const hasAllPermissions = useAuthStore((s) => s.hasAllPermissions);
  const hasAnyRole = useAuthStore((s) => s.hasAnyRole);
  const isSuperAdmin = useAuthStore((s) => s.isSuperAdmin)();
  const loadingUser = useAuthStore((s) => s.loadingUser);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (loadingUser) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-600" role="status">
        Loading your access...
      </div>
    );
  }

  const allowed = (() => {
    if (isSuperAdmin) return true;
    if (allPermissions?.length) return hasAllPermissions(allPermissions);
    if (permissions?.length) return hasAnyPermission(permissions);
    if (roles?.length) return hasAnyRole(roles);
    return true;
  })();

  return allowed ? <>{children}</> : <PermissionDeniedPage />;
};

export default RequirePermission;