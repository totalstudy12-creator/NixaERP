// src/pages/UserRoleManagementPage.tsx
import {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  lazy,
  Suspense,
  memo,
} from 'react';
import {
  FiPlus,
  FiRefreshCw,
  FiShield,
  FiTrash2,
  FiEdit,
  FiChevronDown,
  FiChevronRight,
  FiAlertCircle,
  FiSearch,
  FiUsers,
  FiMail,
  FiLock,
  FiKey,
  FiCheck,
  FiFolder,
  FiFile,
} from 'react-icons/fi';

import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const Offcanvas = lazy(() =>
  import('../components/Offcanvas').then((m) => ({ default: m.Offcanvas }))
);

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface Permission {
  id: number;
  name: string;
  group: string | null;
  description: string | null;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

interface Role {
  id: number;
  name: string;
  group: string | null;
  description: string | null;
  active: boolean;
  permissions: number[];
  created_at?: string;
  updated_at?: string;
}

interface User {
  id: number;
  name: string;
  email: string;
  email_verified_at?: string | null;
  roles: Role[];
  created_at?: string;
  updated_at?: string;
}

interface AppLogEntry {
  module: string;
  action: string;
  status: 'success' | 'error' | 'info';
  message: string;
}

interface ApiErrorLike {
  message?: string;
  status?: number;
  response?: { status?: number; data?: { message?: string } };
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const CACHE_TTL_MS = 300_000;
const ROWS_PER_PAGE = 15;
const USER_COLUMN_COUNT = 5;
const ROLE_COLUMN_COUNT = 6;
const TABLE_HEAD_CLASS = 'text-[11px] font-semibold uppercase tracking-wide text-slate-500';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null) {
    const e = error as ApiErrorLike;
    const candidate = e.response?.data?.message || e.message;
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function safeLog(entry: AppLogEntry): void {
  try {
    addAppLog(entry);
  } catch {
    /* no-op */
  }
}

/* ------------------------------------------------------------------ */
/* Cache hook (race-safe)                                              */
/* ------------------------------------------------------------------ */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function useApiCache<T>(key: string, fetcher: () => Promise<T>, ttlMs = CACHE_TTL_MS) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  const fetchData = useCallback(
    async (skipCache = false) => {
      const requestId = ++requestIdRef.current;

      if (!skipCache) {
        const entry = cache.get(key);
        if (entry && Date.now() - entry.timestamp < ttlMs) {
          if (!mountedRef.current || requestId !== requestIdRef.current) return;
          setData(entry.data as T);
          setLoading(false);
          setError(null);
          return;
        }
      }

      setLoading(true);
      setError(null);

      try {
        const res = await fetcherRef.current();
        if (!mountedRef.current || requestId !== requestIdRef.current) return;
        const result = Array.isArray(res)
          ? (res as T)
          : ((res as { data?: T })?.data ?? ([] as unknown as T));
        cache.set(key, { data: result, timestamp: Date.now() });
        setData(result);
      } catch (err: unknown) {
        if (!mountedRef.current || requestId !== requestIdRef.current) return;
        setError(getErrorMessage(err, 'Failed to load'));
      } finally {
        if (mountedRef.current && requestId === requestIdRef.current) setLoading(false);
      }
    },
    [key, ttlMs]
  );

  useEffect(() => {
    mountedRef.current = true;
    void fetchData();
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, [fetchData]);

  const refresh = useCallback(() => {
    cache.delete(key);
    return fetchData(true);
  }, [fetchData, key]);

  return { data, loading, error, refresh };
}

/* ------------------------------------------------------------------ */
/* Table header label                                                  */
/* ------------------------------------------------------------------ */

function TableHeadLabel({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}) {
  const alignClass = align === 'right' ? 'justify-end' : '';
  return (
    <span className={`inline-flex items-center gap-1 ${alignClass} ${TABLE_HEAD_CLASS}`}>
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Permission tree                                                     */
/* ------------------------------------------------------------------ */

interface PermissionGroup {
  group: string;
  permissions: Permission[];
}

/**
 * Tri-state checkbox — handles checked / unchecked / indeterminate.
 */
function TreeCheckbox({
  checked,
  indeterminate,
  onChange,
  className = '',
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked;
  }, [indeterminate, checked]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className={`h-4 w-4 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/30 ${className}`}
    />
  );
}

const PermissionTree = memo(
  ({
    groups,
    selectedIds,
    onToggle,
    onToggleMany,
    searchTerm,
  }: {
    groups: PermissionGroup[];
    selectedIds: number[];
    onToggle: (id: number, checked: boolean) => void;
    onToggleMany: (ids: number[], checked: boolean) => void;
    searchTerm: string;
  }) => {
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

    // Auto-expand groups that have matched permissions when searching
    useEffect(() => {
      if (searchTerm.trim()) {
        setCollapsed({});
      }
    }, [searchTerm]);

    const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

    // Filter groups by search
    const visibleGroups = useMemo(() => {
      const term = searchTerm.trim().toLowerCase();
      if (!term) return groups;
      return groups
        .map((g) => ({
          ...g,
          permissions: g.permissions.filter(
            (p) =>
              p.name.toLowerCase().includes(term) ||
              (p.description ?? '').toLowerCase().includes(term) ||
              g.group.toLowerCase().includes(term),
          ),
        }))
        .filter((g) => g.permissions.length > 0);
    }, [groups, searchTerm]);

    if (visibleGroups.length === 0) {
      return (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 py-8 text-center">
          <FiLock className="mx-auto h-5 w-5 text-slate-400" />
          <p className="mt-2 text-sm font-semibold text-slate-700">
            {searchTerm.trim() ? 'No matching permissions' : 'No permissions configured'}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {searchTerm.trim()
              ? 'Try a different search term.'
              : 'Permissions will appear here once they are defined in the backend.'}
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-1.5">
        {visibleGroups.map((group) => {
          const groupIds = group.permissions.map((p) => p.id);
          const selectedInGroup = groupIds.filter((id) => selectedSet.has(id)).length;
          const totalInGroup = groupIds.length;
          const allChecked = selectedInGroup === totalInGroup && totalInGroup > 0;
          const someChecked = selectedInGroup > 0;
          const isCollapsed = collapsed[group.group];

          return (
            <div
              key={group.group}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white"
            >
              {/* Group header */}
              <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-2">
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((prev) => ({ ...prev, [group.group]: !prev[group.group] }))
                  }
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-500 transition hover:bg-slate-200/60 hover:text-slate-700"
                  aria-label={isCollapsed ? 'Expand group' : 'Collapse group'}
                >
                  {isCollapsed ? <FiChevronRight size={12} /> : <FiChevronDown size={12} />}
                </button>

                <TreeCheckbox
                  checked={allChecked}
                  indeterminate={!allChecked && someChecked}
                  onChange={(checked) => onToggleMany(groupIds, checked)}
                />

                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <FiFolder size={12} className="shrink-0 text-indigo-500" />
                  <span className="truncate text-[11px] font-bold uppercase tracking-wide text-slate-700">
                    {group.group}
                  </span>
                </div>

                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    selectedInGroup > 0
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {selectedInGroup}/{totalInGroup}
                </span>
              </div>

              {/* Children */}
              {!isCollapsed && (
                <div className="divide-y divide-slate-100">
                  {group.permissions.map((perm) => {
                    const checked = selectedSet.has(perm.id);
                    return (
                      <label
                        key={perm.id}
                        className={`flex cursor-pointer items-start gap-2.5 py-2 pl-9 pr-3 transition ${
                          checked ? 'bg-indigo-50/40' : 'hover:bg-slate-50'
                        }`}
                      >
                        <TreeCheckbox
                          checked={checked}
                          indeterminate={false}
                          onChange={(v) => onToggle(perm.id, v)}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <FiFile size={11} className="shrink-0 text-slate-400" />
                            <span className="truncate text-sm font-medium text-slate-800">
                              {perm.name}
                            </span>
                          </div>
                          {perm.description && (
                            <p className="mt-0.5 text-[11px] text-slate-500">
                              {perm.description}
                            </p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  },
);
PermissionTree.displayName = 'PermissionTree';

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export function UserRoleManagementPage() {
  const { showSuccess, showError } = useNotification();

  const [activeTab, setActiveTab] = useState<'users' | 'roles'>('users');
  const [userSearch, setUserSearch] = useState('');
  const [roleSearch, setRoleSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  /* User role assignment panel */
  const [isUserPanelOpen, setIsUserPanelOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userRoleForm, setUserRoleForm] = useState<{ roleIds: number[] }>({ roleIds: [] });

  /* Role create / edit panel */
  const [isRolePanelOpen, setIsRolePanelOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [roleForm, setRoleForm] = useState({
    name: '',
    group: '',
    description: '',
    permissionIds: [] as number[],
    active: true,
  });
  const [roleFormError, setRoleFormError] = useState<string | null>(null);
  const [permissionSearch, setPermissionSearch] = useState('');

  /* -------------------- Data -------------------- */

  const {
    data: users,
    loading: usersLoading,
    error: usersError,
    refresh: refreshUsers,
  } = useApiCache<User[]>('users', () => apiClient.getUsers());

  const {
    data: roles,
    loading: rolesLoading,
    error: rolesError,
    refresh: refreshRoles,
  } = useApiCache<Role[]>('roles', () => apiClient.getRoles());

  const {
    data: allPermissions,
    loading: permsLoading,
    error: permsError,
    refresh: refreshPerms,
  } = useApiCache<Permission[]>('permissions', () => apiClient.getPermissions());

  const isLoading = usersLoading || rolesLoading || permsLoading;
  const combinedError = [usersError, rolesError, permsError].filter(Boolean).join(' · ');

  /* -------------------- Filtering -------------------- */

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    if (!userSearch.trim()) return users;
    const q = userSearch.toLowerCase();
    return users.filter(
      (u) =>
        u.name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q),
    );
  }, [users, userSearch]);

  const filteredRoles = useMemo(() => {
    if (!roles) return [];
    if (!roleSearch.trim()) return roles;
    const q = roleSearch.toLowerCase();
    return roles.filter(
      (r) =>
        r.name?.toLowerCase().includes(q) ||
        r.group?.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q),
    );
  }, [roles, roleSearch]);

  /* -------------------- Permission groups (tree) -------------------- */

  const permissionGroups = useMemo<PermissionGroup[]>(() => {
    const map = new Map<string, Permission[]>();
    (allPermissions ?? []).forEach((p) => {
      const key = (p.group || 'General').trim() || 'General';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    });
    return Array.from(map.entries())
      .map(([group, permissions]) => ({
        group,
        permissions: permissions.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.group.localeCompare(b.group));
  }, [allPermissions]);

  /* -------------------- Pagination -------------------- */

  const [userPage, setUserPage] = useState(1);
  const [rolePage, setRolePage] = useState(1);

  const userTotalPages = Math.max(1, Math.ceil(filteredUsers.length / ROWS_PER_PAGE));
  const roleTotalPages = Math.max(1, Math.ceil(filteredRoles.length / ROWS_PER_PAGE));

  const paginatedUsers = useMemo(() => {
    const start = (userPage - 1) * ROWS_PER_PAGE;
    return filteredUsers.slice(start, start + ROWS_PER_PAGE);
  }, [filteredUsers, userPage]);

  const paginatedRoles = useMemo(() => {
    const start = (rolePage - 1) * ROWS_PER_PAGE;
    return filteredRoles.slice(start, start + ROWS_PER_PAGE);
  }, [filteredRoles, rolePage]);

  useEffect(() => {
    setUserPage(1);
  }, [userSearch]);

  useEffect(() => {
    setRolePage(1);
  }, [roleSearch]);

  /* -------------------- User actions -------------------- */

  const handleEditUser = useCallback((user: User) => {
    setSelectedUser(user);
    setUserRoleForm({ roleIds: (user.roles || []).map((r) => r.id) });
    setIsUserPanelOpen(true);
  }, []);

  const handleDeleteUser = useCallback(
    async (user: User) => {
      if (!window.confirm(`Delete user "${user.name}"? This cannot be undone.`)) return;
      try {
        await apiClient.deleteUser(user.id);
        showSuccess('User deleted', `${user.name} removed.`);
        safeLog({
          module: 'UserRoles',
          action: 'Delete user',
          status: 'success',
          message: `Deleted user ${user.name}`,
        });
        refreshUsers();
      } catch (err: unknown) {
        showError('Delete failed', getErrorMessage(err, 'Delete failed.'));
      }
    },
    [refreshUsers, showError, showSuccess],
  );

  const handleSaveUserRoles = useCallback(async () => {
    if (!selectedUser) return;
    setSubmitting(true);
    try {
      await apiClient.assignRolesToUser(selectedUser.id, userRoleForm.roleIds);
      showSuccess('Roles updated', `Roles for ${selectedUser.name} updated.`);
      safeLog({
        module: 'UserRoles',
        action: 'Update roles',
        status: 'success',
        message: `Updated roles for ${selectedUser.name}`,
      });
      setIsUserPanelOpen(false);
      setSelectedUser(null);
      refreshUsers();
    } catch (err: unknown) {
      showError('Update failed', getErrorMessage(err, 'Update failed.'));
    } finally {
      setSubmitting(false);
    }
  }, [selectedUser, userRoleForm, refreshUsers, showError, showSuccess]);

  const toggleUserRole = useCallback((roleId: number, checked: boolean) => {
    setUserRoleForm((prev) => ({
      roleIds: checked
        ? Array.from(new Set([...prev.roleIds, roleId]))
        : prev.roleIds.filter((id) => id !== roleId),
    }));
  }, []);

  /* -------------------- Role actions -------------------- */

  const handleCreateRole = useCallback(() => {
    setSelectedRole(null);
    setRoleForm({
      name: '',
      group: '',
      description: '',
      permissionIds: [],
      active: true,
    });
    setRoleFormError(null);
    setPermissionSearch('');
    setIsRolePanelOpen(true);
  }, []);

  const handleEditRole = useCallback((role: Role) => {
    setSelectedRole(role);
    setRoleForm({
      name: role.name || '',
      group: role.group || '',
      description: role.description || '',
      permissionIds: role.permissions || [],
      active: role.active ?? true,
    });
    setRoleFormError(null);
    setPermissionSearch('');
    setIsRolePanelOpen(true);
  }, []);

  const handleDeleteRole = useCallback(
    async (role: Role) => {
      if (!window.confirm(`Delete role "${role.name}"? This cannot be undone.`)) return;
      try {
        await apiClient.deleteRole(role.id);
        showSuccess('Role deleted', `${role.name} removed.`);
        safeLog({
          module: 'UserRoles',
          action: 'Delete role',
          status: 'success',
          message: `Deleted role ${role.name}`,
        });
        refreshRoles();
      } catch (err: unknown) {
        showError('Delete failed', getErrorMessage(err, 'Delete failed.'));
      }
    },
    [refreshRoles, showError, showSuccess],
  );

  const handleSaveRole = useCallback(async () => {
    const trimmed = roleForm.name.trim();
    if (!trimmed) {
      setRoleFormError('Role name is required.');
      return;
    }
    setRoleFormError(null);

    const payload = {
      name: trimmed,
      group: roleForm.group.trim() || null,
      description: roleForm.description.trim() || null,
      permission_ids: roleForm.permissionIds,
      active: roleForm.active,
    };

    setSubmitting(true);
    try {
      if (selectedRole) {
        await apiClient.updateRole(selectedRole.id, payload);
        showSuccess('Role updated', `${trimmed} updated.`);
        safeLog({
          module: 'UserRoles',
          action: 'Update role',
          status: 'success',
          message: `Updated role ${trimmed}`,
        });
      } else {
        await apiClient.createRole(payload);
        showSuccess('Role created', `${trimmed} created.`);
        safeLog({
          module: 'UserRoles',
          action: 'Create role',
          status: 'success',
          message: `Created role ${trimmed}`,
        });
      }
      setIsRolePanelOpen(false);
      setSelectedRole(null);
      refreshRoles();
    } catch (err: unknown) {
      showError('Save failed', getErrorMessage(err, 'Save failed.'));
    } finally {
      setSubmitting(false);
    }
  }, [roleForm, selectedRole, refreshRoles, showError, showSuccess]);

  // ✅ FIX: spread `...prev` so all other form fields are preserved.
  const toggleRolePermission = useCallback((permissionId: number, checked: boolean) => {
    setRoleForm((prev) => ({
      ...prev,
      permissionIds: checked
        ? Array.from(new Set([...prev.permissionIds, permissionId]))
        : prev.permissionIds.filter((id) => id !== permissionId),
    }));
  }, []);

  // ✅ FIX: spread `...prev` so all other form fields are preserved.
  const toggleManyPermissions = useCallback((ids: number[], checked: boolean) => {
    setRoleForm((prev) => ({
      ...prev,
      permissionIds: checked
        ? Array.from(new Set([...prev.permissionIds, ...ids]))
        : prev.permissionIds.filter((id) => !ids.includes(id)),
    }));
  }, []);

  const selectAllPermissions = useCallback(() => {
    setRoleForm((prev) => ({
      ...prev,
      permissionIds: (allPermissions ?? []).map((p) => p.id),
    }));
  }, [allPermissions]);

  const clearAllPermissions = useCallback(() => {
    setRoleForm((prev) => ({ ...prev, permissionIds: [] }));
  }, []);

  /* -------------------- Error state -------------------- */

  if (combinedError && !isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-600">
            <FiAlertCircle size={24} />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">
            Failed to load access control data
          </h2>
          <p className="mt-1.5 text-sm text-slate-500">{combinedError}</p>
          <Button
            onClick={() => {
              refreshUsers();
              refreshRoles();
              refreshPerms();
            }}
            className="mt-5 rounded-xl bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <FiRefreshCw className="mr-2" size={14} />
            Try again
          </Button>
        </div>
      </div>
    );
  }

  /* -------------------- Render -------------------- */

  return (
    <>
      <style>{`
        .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }

        .rbac-offcanvas-wide {
          width: min(720px, 96vw) !important;
          max-width: min(720px, 96vw) !important;
        }
        @media (max-width: 640px) {
          .rbac-offcanvas-wide { width: 100vw !important; max-width: 100vw !important; }
        }
        .rbac-offcanvas-wide .rbac-form-scroll {
          overflow-y: auto;
          overflow-x: hidden;
          min-height: 0;
          flex: 1 1 auto;
          max-height: calc(100vh - 180px);
          scrollbar-width: thin;
          scrollbar-color: #cbd5e1 transparent;
        }
        .rbac-offcanvas-wide .rbac-form-scroll::-webkit-scrollbar { width: 8px; }
        .rbac-offcanvas-wide .rbac-form-scroll::-webkit-scrollbar-track { background: transparent; }
        .rbac-offcanvas-wide .rbac-form-scroll::-webkit-scrollbar-thumb {
          background-color: #cbd5e1; border-radius: 8px;
        }
        .rbac-offcanvas-wide .rbac-form-scroll::-webkit-scrollbar-thumb:hover {
          background-color: #94a3b8;
        }
      `}</style>

      <div className="min-h-full bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100/60">
        <div className="mx-auto w-full max-w-[1900px] space-y-5 p-3 sm:p-4 lg:space-y-6 lg:p-6">
          {/* Hero */}
          <section className="relative overflow-hidden rounded-2xl border border-slate-800/10 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-5 py-6 shadow-[0_20px_40px_-20px_rgba(15,23,42,0.45)] sm:px-7 lg:px-8">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />

            <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200 backdrop-blur">
                  <FiLock size={12} />
                  Access · RBAC
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-[32px]">
                  Users & roles
                </h1>
                <p className="mt-1.5 max-w-2xl text-sm text-slate-300">
                  Manage system users, role definitions, and granular permissions.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    refreshUsers();
                    refreshRoles();
                    refreshPerms();
                  }}
                  disabled={isLoading}
                  className="h-10 rounded-xl border-white/10 bg-white/5 text-white shadow-none backdrop-blur transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                >
                  <FiRefreshCw className={`mr-2 ${isLoading ? 'animate-spin' : ''}`} size={14} />
                  Refresh
                </Button>
                {activeTab === 'roles' && (
                  <Button
                    onClick={handleCreateRole}
                    className="h-10 rounded-xl bg-gradient-to-b from-cyan-300 to-cyan-400 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:from-cyan-200 hover:to-cyan-300"
                  >
                    <FiPlus className="mr-2" size={14} />
                    New role
                  </Button>
                )}
              </div>
            </div>
          </section>

          {/* Tabs + search */}
          <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <CardHeader className="flex flex-col gap-3 border-b border-slate-100 bg-white px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('users')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                    activeTab === 'users'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-500 hover:bg-white hover:text-slate-900'
                  }`}
                >
                  <FiUsers size={13} />
                  Users
                  <span
                    className={`ml-1 rounded-full px-1.5 text-[10px] ${
                      activeTab === 'users'
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {users?.length ?? 0}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('roles')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                    activeTab === 'roles'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-500 hover:bg-white hover:text-slate-900'
                  }`}
                >
                  <FiShield size={13} />
                  Roles
                  <span
                    className={`ml-1 rounded-full px-1.5 text-[10px] ${
                      activeTab === 'roles'
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {roles?.length ?? 0}
                  </span>
                </button>
              </div>

              <div className="relative w-full sm:max-w-xs">
                <FiSearch
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  size={14}
                />
                <input
                  type="text"
                  placeholder={activeTab === 'users' ? 'Search users…' : 'Search roles…'}
                  value={activeTab === 'users' ? userSearch : roleSearch}
                  onChange={(e) =>
                    activeTab === 'users'
                      ? setUserSearch(e.target.value)
                      : setRoleSearch(e.target.value)
                  }
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            </CardHeader>

            {/* Users table */}
            {activeTab === 'users' && (
              <>
                <div className="overflow-x-auto">
                  <Table className="min-w-[1000px]">
                    <TableHeader>
                      <TableRow className="border-slate-100 bg-slate-50/70 hover:bg-slate-50/70">
                        <TableHead>
                          <TableHeadLabel>User</TableHeadLabel>
                        </TableHead>
                        <TableHead>
                          <TableHeadLabel>Email</TableHeadLabel>
                        </TableHead>
                        <TableHead>
                          <TableHeadLabel>Roles</TableHeadLabel>
                        </TableHead>
                        <TableHead>
                          <TableHeadLabel>Verified</TableHeadLabel>
                        </TableHead>
                        <TableHead className="w-24 text-right">
                          <TableHeadLabel align="right">Actions</TableHeadLabel>
                        </TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {isLoading &&
                        Array.from({ length: 8 }).map((_, index) => (
                          <TableRow key={`skeleton-${index}`} className="border-slate-100">
                            {Array.from({ length: USER_COLUMN_COUNT }).map((__, cellIndex) => (
                              <TableCell key={cellIndex}>
                                <div className="h-4 animate-pulse rounded bg-slate-100" />
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}

                      {!isLoading &&
                        paginatedUsers.map((user) => {
                          const userRoles = user.roles || [];
                          return (
                            <TableRow
                              key={user.id}
                              className="border-slate-100 transition-colors hover:bg-slate-50/70"
                            >
                              <TableCell>
                                <div className="flex min-w-[220px] items-center gap-2.5">
                                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[11px] font-bold text-white">
                                    {(user.name || '?')[0]?.toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-slate-900">
                                      {user.name}
                                    </p>
                                    <p className="truncate font-mono text-[11px] text-slate-400">
                                      #{user.id}
                                    </p>
                                  </div>
                                </div>
                              </TableCell>

                              <TableCell>
                                <span className="truncate text-sm text-slate-700">
                                  {user.email}
                                </span>
                              </TableCell>

                              <TableCell>
                                {userRoles.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {userRoles.map((r) => (
                                      <Badge
                                        key={r.id}
                                        variant="outline"
                                        className="rounded-full border border-indigo-200/70 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700"
                                      >
                                        {r.name}
                                      </Badge>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-sm text-slate-400">—</span>
                                )}
                              </TableCell>

                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                                    user.email_verified_at
                                      ? 'border-emerald-200/70 bg-emerald-50 text-emerald-700'
                                      : 'border-amber-200/70 bg-amber-50 text-amber-700'
                                  }`}
                                >
                                  {user.email_verified_at ? 'Verified' : 'Pending'}
                                </Badge>
                              </TableCell>

                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => handleEditUser(user)}
                                    className="grid h-8 w-8 place-items-center rounded-lg text-indigo-500 transition hover:bg-indigo-50 hover:text-indigo-700"
                                    title="Manage roles"
                                  >
                                    <FiShield size={15} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteUser(user)}
                                    className="grid h-8 w-8 place-items-center rounded-lg text-red-500 transition hover:bg-red-50 hover:text-red-700"
                                    title="Delete user"
                                  >
                                    <FiTrash2 size={15} />
                                  </button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}

                      {!isLoading && !paginatedUsers.length && (
                        <TableRow>
                          <TableCell colSpan={USER_COLUMN_COUNT} className="py-20 text-center">
                            <div className="mx-auto max-w-md px-4">
                              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-slate-200/70">
                                <FiUsers className="h-6 w-6 text-slate-400" />
                              </div>
                              <p className="mt-4 text-base font-semibold text-slate-800">
                                No users found
                              </p>
                              <p className="mt-1 text-sm text-slate-500">
                                Try a different search term.
                              </p>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                {!isLoading && userTotalPages > 1 && (
                  <Pagination
                    currentPage={userPage}
                    totalPages={userTotalPages}
                    onPageChange={setUserPage}
                    totalItems={filteredUsers.length}
                    itemsPerPage={ROWS_PER_PAGE}
                  />
                )}
              </>
            )}

            {/* Roles table */}
            {activeTab === 'roles' && (
              <>
                <div className="overflow-x-auto">
                  <Table className="min-w-[1000px]">
                    <TableHeader>
                      <TableRow className="border-slate-100 bg-slate-50/70 hover:bg-slate-50/70">
                        <TableHead>
                          <TableHeadLabel>Role</TableHeadLabel>
                        </TableHead>
                        <TableHead>
                          <TableHeadLabel>Group</TableHeadLabel>
                        </TableHead>
                        <TableHead>
                          <TableHeadLabel>Description</TableHeadLabel>
                        </TableHead>
                        <TableHead className="text-right">
                          <TableHeadLabel align="right">Permissions</TableHeadLabel>
                        </TableHead>
                        <TableHead>
                          <TableHeadLabel>Status</TableHeadLabel>
                        </TableHead>
                        <TableHead className="w-24 text-right">
                          <TableHeadLabel align="right">Actions</TableHeadLabel>
                        </TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {isLoading &&
                        Array.from({ length: 8 }).map((_, index) => (
                          <TableRow key={`skeleton-${index}`} className="border-slate-100">
                            {Array.from({ length: ROLE_COLUMN_COUNT }).map((__, cellIndex) => (
                              <TableCell key={cellIndex}>
                                <div className="h-4 animate-pulse rounded bg-slate-100" />
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}

                      {!isLoading &&
                        paginatedRoles.map((role) => (
                          <TableRow
                            key={role.id}
                            className="border-slate-100 transition-colors hover:bg-slate-50/70"
                          >
                            <TableCell>
                              <div className="flex min-w-[180px] items-center gap-2.5">
                                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white">
                                  <FiShield size={14} />
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-slate-900">
                                    {role.name}
                                  </p>
                                  <p className="truncate font-mono text-[11px] text-slate-400">
                                    #{role.id}
                                  </p>
                                </div>
                              </div>
                            </TableCell>

                            <TableCell>
                              {role.group ? (
                                <Badge
                                  variant="outline"
                                  className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700"
                                >
                                  {role.group}
                                </Badge>
                              ) : (
                                <span className="text-sm text-slate-400">—</span>
                              )}
                            </TableCell>

                            <TableCell>
                              <p className="max-w-[280px] truncate text-sm text-slate-600">
                                {role.description || '—'}
                              </p>
                            </TableCell>

                            <TableCell className="text-right">
                              <span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-2 py-1 text-xs font-bold tabular-nums text-indigo-700">
                                <FiKey size={11} />
                                {(role.permissions || []).length}
                              </span>
                            </TableCell>

                            <TableCell>
                              <Badge
                                variant="outline"
                                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                                  role.active
                                    ? 'border-emerald-200/70 bg-emerald-50 text-emerald-700'
                                    : 'border-red-200/70 bg-red-50 text-red-700'
                                }`}
                              >
                                {role.active ? 'Active' : 'Inactive'}
                              </Badge>
                            </TableCell>

                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleEditRole(role)}
                                  className="grid h-8 w-8 place-items-center rounded-lg text-indigo-500 transition hover:bg-indigo-50 hover:text-indigo-700"
                                  title="Edit role"
                                >
                                  <FiEdit size={15} />
                                </button>
                                <button
                                  onClick={() => handleDeleteRole(role)}
                                  className="grid h-8 w-8 place-items-center rounded-lg text-red-500 transition hover:bg-red-50 hover:text-red-700"
                                  title="Delete role"
                                >
                                  <FiTrash2 size={15} />
                                </button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}

                      {!isLoading && !paginatedRoles.length && (
                        <TableRow>
                          <TableCell colSpan={ROLE_COLUMN_COUNT} className="py-20 text-center">
                            <div className="mx-auto max-w-md px-4">
                              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-slate-200/70">
                                <FiShield className="h-6 w-6 text-slate-400" />
                              </div>
                              <p className="mt-4 text-base font-semibold text-slate-800">
                                No roles found
                              </p>
                              <p className="mt-1 text-sm text-slate-500">
                                {roleSearch.trim()
                                  ? 'Try a different search term.'
                                  : 'Create your first role to get started.'}
                              </p>
                              {!roleSearch.trim() && (
                                <Button
                                  className="mt-5 rounded-lg"
                                  variant="outline"
                                  onClick={handleCreateRole}
                                >
                                  <FiPlus className="mr-2" size={14} />
                                  Create role
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                {!isLoading && roleTotalPages > 1 && (
                  <Pagination
                    currentPage={rolePage}
                    totalPages={roleTotalPages}
                    onPageChange={setRolePage}
                    totalItems={filteredRoles.length}
                    itemsPerPage={ROWS_PER_PAGE}
                  />
                )}
              </>
            )}
          </Card>
        </div>
      </div>

      {/* ─────────── User role assignment offcanvas ─────────── */}
      {isUserPanelOpen && selectedUser && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm">
              <div className="rounded-2xl bg-white p-8 text-sm text-slate-600 shadow-xl">
                Loading…
              </div>
            </div>
          }
        >
          <Offcanvas
            isOpen={isUserPanelOpen}
            title={`Roles for ${selectedUser.name}`}
            onClose={() => {
              setIsUserPanelOpen(false);
              setSelectedUser(null);
            }}
            className="rbac-offcanvas-wide"
            footer={
              <div className="flex w-full justify-between">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsUserPanelOpen(false);
                    setSelectedUser(null);
                  }}
                  disabled={submitting}
                  className="rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveUserRoles}
                  disabled={submitting}
                  className="rounded-xl bg-indigo-600 font-semibold hover:bg-indigo-700"
                >
                  {submitting ? 'Saving…' : 'Save roles'}
                </Button>
              </div>
            }
          >
            <div className="rbac-form-scroll space-y-4 pr-2">
              <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
                <div className="flex items-start gap-3">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-base font-bold text-white shadow-sm">
                    {(selectedUser.name || '?')[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-bold text-slate-900">
                      {selectedUser.name}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500">
                      <FiMail size={11} />
                      {selectedUser.email}
                    </p>
                    <div className="mt-1.5">
                      <Badge
                        variant="outline"
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                          selectedUser.email_verified_at
                            ? 'border-emerald-200/70 bg-emerald-50 text-emerald-700'
                            : 'border-amber-200/70 bg-amber-50 text-amber-700'
                        }`}
                      >
                        {selectedUser.email_verified_at ? 'Verified' : 'Pending'}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Assign roles
                  </p>
                  <span className="text-[11px] font-semibold text-indigo-600">
                    {userRoleForm.roleIds.length} selected
                  </span>
                </div>

                {(roles ?? []).length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 py-8 text-center">
                    <FiShield className="mx-auto h-5 w-5 text-slate-400" />
                    <p className="mt-2 text-sm font-semibold text-slate-700">
                      No roles defined
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Create roles first from the Roles tab.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {(roles ?? []).map((role) => {
                      const checked = userRoleForm.roleIds.includes(role.id);
                      return (
                        <label
                          key={role.id}
                          className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                            checked
                              ? 'border-indigo-300 bg-indigo-50/50 ring-1 ring-indigo-500/10'
                              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => toggleUserRole(role.id, e.target.checked)}
                            className="mt-0.5 h-4 w-4 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-semibold text-slate-800">
                                {role.name}
                              </span>
                              {role.group && (
                                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                                  {role.group}
                                </span>
                              )}
                              {!role.active && (
                                <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600">
                                  Inactive
                                </span>
                              )}
                            </div>
                            {role.description && (
                              <p className="mt-0.5 text-xs text-slate-500">
                                {role.description}
                              </p>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </Offcanvas>
        </Suspense>
      )}

      {/* ─────────── Role create / edit offcanvas ─────────── */}
      {isRolePanelOpen && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm">
              <div className="rounded-2xl bg-white p-8 text-sm text-slate-600 shadow-xl">
                Loading form…
              </div>
            </div>
          }
        >
          <Offcanvas
            isOpen={isRolePanelOpen}
            title={selectedRole ? 'Edit role' : 'New role'}
            onClose={() => {
              setIsRolePanelOpen(false);
              setSelectedRole(null);
            }}
            className="rbac-offcanvas-wide"
            footer={
              <div className="flex w-full justify-between">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsRolePanelOpen(false);
                    setSelectedRole(null);
                  }}
                  disabled={submitting}
                  className="rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveRole}
                  disabled={submitting}
                  className="rounded-xl bg-indigo-600 font-semibold hover:bg-indigo-700"
                >
                  {submitting ? 'Saving…' : selectedRole ? 'Update role' : 'Create role'}
                </Button>
              </div>
            }
          >
            <div className="rbac-form-scroll space-y-5 pr-2">
              {roleFormError && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <FiAlertCircle className="mt-0.5 shrink-0" size={16} />
                  <span className="break-words">{roleFormError}</span>
                </div>
              )}

              {/* Basic information */}
              <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-indigo-500" /> Basic information
                </legend>
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="min-w-0">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Role name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={roleForm.name}
                      onChange={(e) =>
                        setRoleForm((prev) => ({ ...prev, name: e.target.value }))
                      }
                      placeholder="e.g., Admin"
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Group
                    </label>
                    <input
                      type="text"
                      value={roleForm.group}
                      onChange={(e) =>
                        setRoleForm((prev) => ({ ...prev, group: e.target.value }))
                      }
                      placeholder="e.g., management"
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                    />
                  </div>
                  <div className="min-w-0 sm:col-span-2">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Description
                    </label>
                    <input
                      type="text"
                      value={roleForm.description}
                      onChange={(e) =>
                        setRoleForm((prev) => ({ ...prev, description: e.target.value }))
                      }
                      placeholder="Optional description"
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Status
                    </label>
                    <div className="relative">
                      <select
                        value={roleForm.active ? '1' : '0'}
                        onChange={(e) =>
                          setRoleForm((prev) => ({ ...prev, active: e.target.value === '1' }))
                        }
                        className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                      >
                        <option value="1">Active</option>
                        <option value="0">Inactive</option>
                      </select>
                      <FiChevronDown
                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                        size={14}
                      />
                    </div>
                  </div>
                </div>
              </fieldset>

              {/* Permissions tree */}
              <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-violet-500" /> Permissions
                </legend>

                <div className="mt-3 space-y-3">
                  {/* Header: count + actions */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2 py-1 font-semibold text-indigo-700">
                        <FiCheck size={11} />
                        {roleForm.permissionIds.length} selected
                      </span>
                      <span>of {allPermissions?.length ?? 0}</span>
                    </div>
                    {allPermissions && allPermissions.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={selectAllPermissions}
                          className="rounded-md px-2 py-1 text-[11px] font-semibold text-indigo-600 transition hover:bg-indigo-50"
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          onClick={clearAllPermissions}
                          disabled={roleForm.permissionIds.length === 0}
                          className="rounded-md px-2 py-1 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-100 disabled:opacity-50"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Search */}
                  {allPermissions && allPermissions.length > 0 && (
                    <div className="relative">
                      <FiSearch
                        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                        size={13}
                      />
                      <input
                        type="text"
                        value={permissionSearch}
                        onChange={(e) => setPermissionSearch(e.target.value)}
                        placeholder="Filter permissions…"
                        className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-700 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </div>
                  )}

                  {/* Tree */}
                  <PermissionTree
                    groups={permissionGroups}
                    selectedIds={roleForm.permissionIds}
                    onToggle={toggleRolePermission}
                    onToggleMany={toggleManyPermissions}
                    searchTerm={permissionSearch}
                  />
                </div>
              </fieldset>
            </div>
          </Offcanvas>
        </Suspense>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Pagination component                                                */
/* ------------------------------------------------------------------ */

function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  itemsPerPage,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems: number;
  itemsPerPage: number;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 bg-white px-4 py-3.5 sm:px-5 md:flex-row md:items-center md:justify-between">
      <p className="text-xs text-slate-500 sm:text-[13px]">
        Showing{' '}
        <span className="font-semibold text-slate-700">
          {(currentPage - 1) * itemsPerPage + 1}
        </span>
        –
        <span className="font-semibold text-slate-700">
          {Math.min(currentPage * itemsPerPage, totalItems)}
        </span>{' '}
        of <span className="font-semibold text-slate-700">{totalItems}</span>
      </p>
      <div className="flex items-center justify-between gap-1.5 sm:justify-end">
        <button
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
          aria-label="First page"
        >
          «
        </button>
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
          aria-label="Previous page"
        >
          ‹
        </button>
        <div className="mx-1 min-w-[76px] rounded-lg bg-slate-100 px-3 py-1.5 text-center text-xs font-semibold text-slate-700">
          {currentPage} / {totalPages}
        </div>
        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
          aria-label="Next page"
        >
          ›
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
          aria-label="Last page"
        >
          »
        </button>
      </div>
    </div>
  );
}

export default UserRoleManagementPage;