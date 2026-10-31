// src/pages/UsersPage.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FiRefreshCw,
  FiLock,
  FiUser,
  FiShield,
  FiMail,
  FiAlertCircle,
  FiSlash,
  FiCheck,
  FiLogOut,
  FiUnlock,
  FiSearch,
  FiActivity,
  FiClock,
} from 'react-icons/fi';
import { ModernDataTable } from '../components/ModernDataTable';
import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { useAuthStore } from '../store/auth';
import { UserSecurityModal } from '../components/UserSecurityModal';
import { UserBanModal } from '../components/UserBanModal';

/* ------------------------------------------------------------------ */
/* RBAC — Permission keys                                              */
/* ------------------------------------------------------------------ */

const PERMISSIONS = {
  USERS_VIEW: 'users.view',
  USERS_BAN: 'users.ban',
} as const;

/* ------------------------------------------------------------------ */
/* RBAC — Store-backed permissions (admin-aware + notation-insensitive) */
/* ------------------------------------------------------------------ */

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
  status?: 'active' | 'banned' | 'suspended' | 'inactive';
  is_active?: boolean;
  failed_login_count?: number;
  last_failed_login_at?: string;
  lockout_until?: string;
  last_login_at?: string;
  last_login_ip?: string;
  banned_at?: string;
  banned_until?: string;
  banned_reason?: string;
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
  const { showSuccess, showError } = useNotification();
  const { can, isAuthenticated, loadingUser } = usePagePermissions();
  const canView = can(PERMISSIONS.USERS_VIEW);
  const canBan = can(PERMISSIONS.USERS_BAN);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modals state
  const [securityModalUserId, setSecurityModalUserId] = useState<number | null>(null);
  const [securityModalUserName, setSecurityModalUserName] = useState<string>('');
  const [banModalUser, setBanModalUser] = useState<UserRow | null>(null);
  const [banModalMode, setBanModalMode] = useState<'ban' | 'unban'>('ban');

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
        status: (u.status as any) || (u.is_active === false ? 'inactive' : 'active'),
        is_active: typeof u.is_active === 'boolean' ? u.is_active : undefined,
        failed_login_count: Number(u.failed_login_count ?? 0),
        last_failed_login_at: u.last_failed_login_at ? String(u.last_failed_login_at) : undefined,
        lockout_until: u.lockout_until ? String(u.lockout_until) : undefined,
        last_login_at: u.last_login_at ? String(u.last_login_at) : undefined,
        last_login_ip: u.last_login_ip ? String(u.last_login_ip) : undefined,
        banned_at: u.banned_at ? String(u.banned_at) : undefined,
        banned_until: u.banned_until ? String(u.banned_until) : undefined,
        banned_reason: u.banned_reason ? String(u.banned_reason) : undefined,
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

  const handleResetLockout = async (userId: number, userName: string) => {
    try {
      await apiClient.resetUserLockout(userId);
      showSuccess('Lockout Cleared', `Login restrictions reset for ${userName}.`);
      void loadUsers();
    } catch (err: any) {
      showError('Action Failed', err?.response?.data?.message || err.message);
    }
  };

  const handleForceLogout = async (userId: number, userName: string) => {
    if (!window.confirm(`Revoke all active device sessions for ${userName}?`)) return;
    try {
      await apiClient.forceLogoutUser(userId);
      showSuccess('Sessions Revoked', `All tokens for ${userName} have been invalidated.`);
      void loadUsers();
    } catch (err: any) {
      showError('Action Failed', err?.response?.data?.message || err.message);
    }
  };

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      // Status filter
      if (statusFilter !== 'all') {
        const uStatus = u.status || (u.is_active === false ? 'inactive' : 'active');
        if (statusFilter === 'locked') {
          const isLocked = Boolean(
            u.lockout_until && new Date(u.lockout_until).getTime() > Date.now(),
          );
          if (!isLocked) return false;
        } else if (uStatus !== statusFilter) {
          return false;
        }
      }

      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = u.name.toLowerCase().includes(q);
        const matchesEmail = u.email.toLowerCase().includes(q);
        const matchesRole = u.roles.some((r) => r.name.toLowerCase().includes(q));
        if (!matchesName && !matchesEmail && !matchesRole) return false;
      }

      return true;
    });
  }, [users, statusFilter, search]);

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
        width: '240px',
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
        name: 'Account Status',
        selector: (row: UserRow) => row.status || (row.is_active === false ? 'inactive' : 'active'),
        cell: (row: UserRow) => {
          const status = row.status || (row.is_active === false ? 'inactive' : 'active');
          const isLocked = Boolean(
            row.lockout_until && new Date(row.lockout_until).getTime() > Date.now(),
          );

          return (
            <div className="flex flex-col gap-1">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${
                  status === 'banned'
                    ? 'border border-rose-300 bg-rose-50 text-rose-700'
                    : status === 'suspended'
                    ? 'border border-amber-300 bg-amber-50 text-amber-800'
                    : status === 'inactive'
                    ? 'border border-slate-300 bg-slate-50 text-slate-600'
                    : 'border border-emerald-300 bg-emerald-50 text-emerald-700'
                }`}
              >
                {status}
              </span>
              {isLocked && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-600">
                  <FiLock size={10} /> Lockout Active
                </span>
              )}
            </div>
          );
        },
        sortable: true,
        width: '140px',
      },
      {
        name: 'Security & Logins',
        selector: (row: UserRow) => row.last_login_at || '',
        cell: (row: UserRow) => (
          <div className="text-xs">
            <p className="text-slate-700">
              {row.last_login_at ? formatDate(row.last_login_at) : 'Never'}
            </p>
            {row.last_login_ip && (
              <p className="font-mono text-[10px] text-slate-400">{row.last_login_ip}</p>
            )}
            {(row.failed_login_count ?? 0) > 0 && (
              <p className="font-semibold text-rose-600 text-[10px]">
                {row.failed_login_count} failed
              </p>
            )}
          </div>
        ),
        sortable: true,
        width: '140px',
      },
      {
        name: 'Actions',
        cell: (row: UserRow) => {
          const isBannedOrSuspended = row.status === 'banned' || row.status === 'suspended';
          const hasLockout = Boolean(
            (row.failed_login_count ?? 0) > 0 ||
              (row.lockout_until && new Date(row.lockout_until).getTime() > Date.now()),
          );

          return (
            <div className="flex items-center gap-1 py-1">
              {/* Security & Sessions */}
              <button
                type="button"
                onClick={() => {
                  setSecurityModalUserId(row.id);
                  setSecurityModalUserName(row.name);
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                title="View active sessions, threat history, and audit log"
              >
                <FiActivity size={12} className="text-indigo-600" />
                Sessions
              </button>

              {/* Ban / Unban */}
              {canBan && !isBannedOrSuspended && (
                <button
                  type="button"
                  onClick={() => {
                    setBanModalUser(row);
                    setBanModalMode('ban');
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition"
                  title="Ban or temporarily suspend account"
                >
                  <FiSlash size={12} />
                  Ban
                </button>
              )}

              {canBan && isBannedOrSuspended && (
                <button
                  type="button"
                  onClick={() => {
                    setBanModalUser(row);
                    setBanModalMode('unban');
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition"
                  title="Restore and unban user account"
                >
                  <FiCheck size={12} />
                  Unban
                </button>
              )}

              {/* Reset Lockout */}
              {hasLockout && (
                <button
                  type="button"
                  onClick={() => handleResetLockout(row.id, row.name)}
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition"
                  title="Reset failed login counter and lockout"
                >
                  <FiUnlock size={12} />
                </button>
              )}

              {/* Force Logout */}
              <button
                type="button"
                onClick={() => handleForceLogout(row.id, row.name)}
                className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                title="Force logout all devices"
              >
                <FiLogOut size={12} />
              </button>
            </div>
          );
        },
        width: '260px',
      },
    ],
    [canBan],
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
    <div className="min-h-screen bg-gray-50 p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md">
            <FiUser size={20} />
          </span>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Enterprise Users &amp; Access</h1>
            <p className="text-gray-600">
              Account governance, device session termination, lockout resets, and administrative banning.
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

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <input
            type="text"
            placeholder="Search by name, email, or role…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto">
          {[
            { id: 'all', label: 'All Users' },
            { id: 'active', label: 'Active' },
            { id: 'banned', label: 'Banned' },
            { id: 'suspended', label: 'Suspended' },
            { id: 'locked', label: 'Locked Out' },
            { id: 'inactive', label: 'Inactive' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                statusFilter === tab.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
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
        title={`Users (${filteredUsers.length})`}
        columns={columns}
        data={filteredUsers}
        loading={loading}
      />

      {/* User Security Overview Modal */}
      <UserSecurityModal
        userId={securityModalUserId}
        userName={securityModalUserName}
        isOpen={securityModalUserId !== null}
        onClose={() => setSecurityModalUserId(null)}
        onUserStatusChanged={() => void loadUsers()}
      />

      {/* User Ban / Unban Modal */}
      <UserBanModal
        user={banModalUser}
        mode={banModalMode}
        isOpen={banModalUser !== null}
        onClose={() => setBanModalUser(null)}
        onSuccess={() => void loadUsers()}
      />
    </div>
  );
}

export default UsersPage;