import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const loadingUser = useAuthStore((s) => s.loadingUser);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (loadingUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600" role="status">
        Loading your access...
      </div>
    );
  }

  return <>{children}</>;
}
