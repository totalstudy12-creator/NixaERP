// src/pages/UsersPage.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiRefreshCw, FiLock, FiUser, FiShield, FiMail, FiAlertCircle } from 'react-icons/fi';
import { ModernDataTable } from '../components/ModernDataTable';
import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { useAuthStore } from '../store/auth';

/* ------------------------------------------------------------------ */
/* RBAC — Permission keys                                              */
/* ------------------------------------------------------------------ */

const PERMISSIONS = {
  USERS_VIEW: 'users.view',
} as const;

type PermissionKey = typeof PERMISSIONS[keyof typeof PERMISSIONS];

/* ------------------------------------------------------------------ */
/* RBAC — Store-backed permissions (admin-aware + notation-insensitive) */
/* ------------------------------------------------------------------ */

/**
 * Collapse a permission key so different notations of the SAME permission
 * match each other:
 *
 *   "users.view"       → "users view"
 *   "view users"       → "users view"
 *   "users:view"       → "users view"
 */
function normalisePermission(input: string): string {
  return input
    .toLowerCase()
    .replace(/[.:_/\-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

interface UsePagePermissionsResult {
  can: (permission: string | string[]) => boolean;
  isAuthenticated: boolean;
  isSuperAdmin: boolean;
  loadingUser: boolean;
}

function usePagePermissions(): UsePagePermissionsResult {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const loadingUser = useAuthStore((s) => s.loadingUser);
  const storeIsSuperAdmin = useAuthStore((s) => s.isSuperAdmin);
  const storeHasAnyPermission = useAuthStore((s) => s.hasAnyPermission);

  const isSuperAdmin = useMemo(() => storeIsSuperAdmin(), [storeIsSuperAdmin, user]);

  const can = useCallback(
    (permission: string | string[]): boolean => {
      if (!isAuthenticated) return false;
      if (isSuperAdmin) return true;

      const keys = Array.isArray(permission) ? permission : [permission];

      if (storeHasAnyPermission(keys)) return true;

      const hasMetadata =
        (user?.permission_names?.length ?? 0) > 0 ||
        (user?.permissions?.length ?? 0) > 0 ||
        (user?.roles?.length ?? 0) > 0 ||
        (user?.role_names?.length ?? 0) > 0;
      if (!hasMetadata) return false;

      const normalised = new Set<string>();
      (user?.permission_names ?? []).forEach((p) =>
        normalised.add(normalisePermission(p)),
      );
      (user?.permissions ?? []).forEach((p) =>
        normalised.add(normalisePermission(p.name)),
      );

      return keys.some((k) => normalised.has(normalisePermission(k)));
    },
    [isAuthenticated, isSuperAdmin, storeHasAnyPermission, user],
  );

  return { can, isAuthenticated, isSuperAdmin, loadingUser };
}

/* ------------------------------------------------------------------ */
/* Access-restricted screen                                            */
/* ------------------------------------------------------------------ */

function AccessRestricted() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-rose-500">
          <FiLock size={26} />
        </div>
        <h1 className="mt-4 text-lg font-bold text-gray-900">Access restricted</h1>
        <p className="mt-2 text-sm leading-6 text-gray-500">
          Your account does not have permission to view Users. Contact your
          administrator to request the{' '}
          <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px]">
            users.view
          </code>{' '}
          permission.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface UserRow {
  id: number;
  name: string;
  email: string;
  roles: Array<{ id: number; name: string }>;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

function unwrapList<T>(response: unknown): T[] {
  if (Array.isArray(response)) return response as T[];
  const data = (response as { data?: unknown })?.data;
  if (Array.isArray(data)) return data as T[];
  return [];
}

function errorMessage(error: unknown, fallback: string): string {
  const err = error as any;
  return (
    err?.response?.data?.message ||
    err?.response?.data?.error ||
    err?.backendMessage ||
    err?.message ||
    fallback
  );
}

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function UsersPage() {
  const { showError } = useNotification();
  const { can, isAuthenticated, loadingUser } = usePagePermissions();
  const canView = can(PERMISSIONS.USERS_VIEW);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  const loadUsers = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.getUsers();
      if (!mountedRef.current || requestId !== requestIdRef.current) return;

      const list = unwrapList<Record<string, unknown>>(response);
      const mapped: UserRow[] = list.map((u) => ({
        id: Number(u.id),
        name: String(u.name ?? ''),
        email: String(u.email ?? ''),
        roles: Array.isArray(u.roles)
          ? (u.roles as Array<Record<string, unknown>>).map((r) => ({
              id: Number(r.id),
              name: String(r.name ?? ''),
            }))
          : [],
        is_active: typeof u.is_active === 'boolean' ? u.is_active : undefined,
        created_at: u.created_at ? String(u.created_at) : undefined,
        updated_at: u.updated_at ? String(u.updated_at) : undefined,
      }));

      setUsers(mapped);
      setLastUpdated(new Date());
    } catch (err: unknown) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      const message = errorMessage(err, 'Unable to load users.');
      setError(message);
      showError('Failed to load users', message);
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [canView, showError]);

  useEffect(() => {
    if (!canView) return;
    void loadUsers();
  }, [loadUsers, canView]);

  const columns = useMemo(
    () => [
      {
        name: 'User',
        selector: (row: UserRow) => row.name,
        cell: (row: UserRow) => (
          <div className="flex min-w-[220px] items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[11px] font-bold text-white">
              {(row.name || '?').charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">
                {row.name || `User #${row.id}`}
              </p>
              <p className="truncate font-mono text-[11px] text-slate-400">
                #{row.id}
              </p>
            </div>
          </div>
        ),
        sortable: true,
        width: '260px',
      },
      {
        name: 'Email',
        selector: (row: UserRow) => row.email,
        cell: (row: UserRow) => (
          <span className="flex items-center gap-1.5 text-sm text-slate-700">
            <FiMail size={12} className="shrink-0 text-slate-400" />
            <span className="truncate">{row.email || '—'}</span>
          </span>
        ),
        sortable: true,
      },
      {
        name: 'Roles',
        selector: (row: UserRow) =>
          (row.roles || []).map((role) => role.name).join(', ') || '—',
        cell: (row: UserRow) =>
          row.roles.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {row.roles.map((role) => (
                <span
                  key={role.id}
                  className="inline-flex items-center gap-1 rounded-full border border-indigo-200/70 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700"
                >
                  <FiShield size={10} />
                  {role.name}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-sm text-slate-400">—</span>
          ),
        sortable: true,
      },
      {
        name: 'Status',
        selector: (row: UserRow) => (row.is_active === false ? 'Inactive' : 'Active'),
        cell: (row: UserRow) => {
          const inactive = row.is_active === false;
          return (
            <span
              className={
                'inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ' +
                (inactive
                  ? 'border-rose-200/70 bg-rose-50 text-rose-700'
                  : 'border-emerald-200/70 bg-emerald-50 text-emerald-700')
              }
            >
              {inactive ? 'Inactive' : 'Active'}
            </span>
          );
        },
        sortable: true,
        width: '120px',
      },
      {
        name: 'Created',
        selector: (row: UserRow) => row.created_at || '',
        cell: (row: UserRow) => (
          <span className="text-sm text-slate-500">{formatDate(row.created_at)}</span>
        ),
        sortable: true,
        width: '140px',
      },
    ],
    [],
  );

  /* --------------------------------------------------------------- */
  /* RBAC page gate                                                  */
  /* --------------------------------------------------------------- */

  if (loadingUser && !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="rounded-2xl bg-white px-6 py-5 text-sm text-gray-600 shadow-sm">
          Loading permissions…
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !canView) {
    return <AccessRestricted />;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md">
            <FiUser size={20} />
          </span>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Users</h1>
            <p className="text-gray-600">
              Review and manage the available system users.
              {lastUpdated && (
                <>
                  {' '}
                  <span className="text-xs text-gray-400">
                    · Updated {lastUpdated.toLocaleTimeString('en-IN')}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        <button
          onClick={() => void loadUsers()}
          disabled={loading}
          className="btn btn-secondary gap-2 inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <FiRefreshCw className={loading ? 'animate-spin' : ''} size={14} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <FiAlertCircle className="mt-0.5 shrink-0" size={18} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Unable to load users</p>
            <p className="mt-0.5 break-words">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => void loadUsers()}
            className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
          >
            Retry
          </button>
        </div>
      )}

      <ModernDataTable
        title="Users"
        columns={columns}
        data={users}
        loading={loading}
      />
    </div>
  );
}

export default UsersPage;