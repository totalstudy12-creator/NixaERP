import { useEffect, useState, useCallback, useMemo, lazy, Suspense, memo } from 'react';
import {
  FiPlus, FiRefreshCw, FiUser, FiShield, FiTrash2, FiEdit,
  FiChevronDown, FiChevronRight, FiAlertCircle, FiSearch,
  FiCheck, FiX, FiSave
} from 'react-icons/fi';
import clsx from 'clsx';

// ---------- Lazy loaded heavy components ----------
const ModernDataTable = lazy(() =>
  import('../components/ModernDataTable').then(m => ({ default: m.ModernDataTable }))
);
const Offcanvas = lazy(() =>
  import('../components/Offcanvas').then(m => ({ default: m.Offcanvas }))
);

import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';
import { formatDateTime } from '../utils/date';

// ---------- Simple API Cache Hook ----------
const cache = new Map<string, { data: any; timestamp: number }>();

function useApiCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = 300_000
): {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (skipCache = false) => {
    if (!skipCache) {
      const entry = cache.get(key);
      if (entry && Date.now() - entry.timestamp < ttlMs) {
        setData(entry.data);
        setLoading(false);
        return;
      }
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetcher();
      const result = Array.isArray(res) ? res : (res as any).data ?? [];
      cache.set(key, { data: result, timestamp: Date.now() });
      setData(result);
    } catch (err: any) {
      const msg = err.message || 'Failed to load';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [key, fetcher, ttlMs]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refresh: () => fetchData(true) };
}

// ---------- Types ----------
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
  permissions: number[]; // permission IDs
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

// ---------- Skeleton Components ----------
const TableSkeleton = memo(() => (
  <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4 animate-pulse">
    <div className="h-6 w-48 bg-slate-200 rounded" />
    {[...Array(10)].map((_, i) => (
      <div key={i} className="flex gap-4">
        <div className="h-4 w-1/4 bg-slate-200 rounded" />
        <div className="h-4 w-1/5 bg-slate-200 rounded" />
        <div className="h-4 w-1/6 bg-slate-200 rounded" />
        <div className="h-4 w-1/6 bg-slate-200 rounded" />
        <div className="h-4 w-1/4 bg-slate-200 rounded" />
      </div>
    ))}
  </div>
));

// ---------- Component ----------
export function UserRoleManagementPage() {
  const { showSuccess, showError } = useNotification();
  const [activeTab, setActiveTab] = useState<'users' | 'roles'>('users');
  const [userSearch, setUserSearch] = useState('');
  const [roleSearch, setRoleSearch] = useState('');
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Offcanvas states
  const [isUserPanelOpen, setIsUserPanelOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userRoleForm, setUserRoleForm] = useState<{ roleIds: number[] }>({ roleIds: [] });

  const [isRolePanelOpen, setIsRolePanelOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [roleForm, setRoleForm] = useState({
    name: '', group: '', description: '', permissionIds: [] as number[], active: true,
  });

  // Expandable sections for role form
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    basic: true,
    permissions: true,
  });

  // ---------- API Caching ----------
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

  // Combined loading/error
  const isLoading = usersLoading || rolesLoading || permsLoading;
  const errors = [usersError, rolesError, permsError].filter(Boolean).join(', ');

  useEffect(() => {
    if (errors) setGlobalError(errors);
    else setGlobalError(null);
  }, [errors]);

  // ---------- Filter & Search ----------
  const filteredUsers = useMemo(() => {
    if (!users) return [];
    if (!userSearch.trim()) return users;
    const q = userSearch.toLowerCase();
    return users.filter(u =>
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q)
    );
  }, [users, userSearch]);

  const filteredRoles = useMemo(() => {
    if (!roles) return [];
    if (!roleSearch.trim()) return roles;
    const q = roleSearch.toLowerCase();
    return roles.filter(r =>
      r.name?.toLowerCase().includes(q) ||
      r.group?.toLowerCase().includes(q)
    );
  }, [roles, roleSearch]);

  // ---------- Pagination ----------
  const [userPage, setUserPage] = useState(1);
  const [rolePage, setRolePage] = useState(1);
  const rowsPerPage = 15;

  const paginatedUsers = useMemo(() => {
    const start = (userPage - 1) * rowsPerPage;
    return filteredUsers.slice(start, start + rowsPerPage);
  }, [filteredUsers, userPage]);

  const paginatedRoles = useMemo(() => {
    const start = (rolePage - 1) * rowsPerPage;
    return filteredRoles.slice(start, start + rowsPerPage);
  }, [filteredRoles, rolePage]);

  useEffect(() => setUserPage(1), [userSearch]);
  useEffect(() => setRolePage(1), [roleSearch]);

  // ---------- Table Columns ----------
  const userColumns = useMemo(() => [
    {
      name: 'Name',
      selector: (row: User) => row.name,
      sortable: true,
      cell: (row: User) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
            {row.name?.[0]?.toUpperCase() || '?'}
          </div>
          <span className="font-medium">{row.name}</span>
        </div>
      ),
      width: '200px',
    },
    {
      name: 'Email',
      selector: (row: User) => row.email,
      cell: (row: User) => <span className="text-sm text-slate-600">{row.email}</span>,
      sortable: true,
      width: '220px',
    },
    {
      name: 'Roles',
      selector: (row: User) => (row.roles || []).map(r => r.name).join(', ') || '-',
      cell: (row: User) => (
        <div className="flex flex-wrap gap-1">
          {(row.roles || []).map(r => (
            <span key={r.id} className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
              {r.name}
            </span>
          ))}
        </div>
      ),
      width: '200px',
    },
    {
      name: 'Verified',
      selector: (row: User) => row.email_verified_at ? 'Yes' : 'No',
      cell: (row: User) => (
        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${row.email_verified_at ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
          {row.email_verified_at ? 'Yes' : 'No'}
        </span>
      ),
      sortable: true,
      width: '110px',
    },
    {
      name: 'Actions',
      cell: (row: User) => (
        <div className="flex items-center gap-1">
          <button onClick={() => handleEditUser(row)} className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50" title="Manage Roles">
            <FiShield size={16} />
          </button>
          <button onClick={() => handleDeleteUser(row)} className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50" title="Delete">
            <FiTrash2 size={16} />
          </button>
        </div>
      ),
      width: '100px',
    },
  ], []);

  const roleColumns = useMemo(() => [
    {
      name: 'Role Name',
      selector: (row: Role) => row.name,
      sortable: true,
      cell: (row: Role) => <span className="font-medium">{row.name}</span>,
      width: '160px',
    },
    {
      name: 'Group',
      selector: (row: Role) => row.group || '-',
      cell: (row: Role) => <span className="text-sm">{row.group || '-'}</span>,
      width: '120px',
    },
    {
      name: 'Description',
      selector: (row: Role) => row.description || '-',
      cell: (row: Role) => <span className="text-sm text-slate-600">{row.description || '-'}</span>,
      width: '200px',
    },
    {
      name: 'Permissions',
      selector: (row: Role) => (row.permissions || []).length,
      cell: (row: Role) => <span className="text-sm">{row.permissions?.length || 0}</span>,
      sortable: true,
      width: '130px',
    },
    {
      name: 'Status',
      selector: (row: Role) => row.active ? 'Active' : 'Inactive',
      cell: (row: Role) => (
        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${row.active ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
          {row.active ? 'Active' : 'Inactive'}
        </span>
      ),
      sortable: true,
      width: '110px',
    },
    {
      name: 'Actions',
      cell: (row: Role) => (
        <div className="flex items-center gap-1">
          <button onClick={() => handleEditRole(row)} className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50" title="Edit">
            <FiEdit size={16} />
          </button>
          <button onClick={() => handleDeleteRole(row)} className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50" title="Delete">
            <FiTrash2 size={16} />
          </button>
        </div>
      ),
      width: '100px',
    },
  ], []);

  // ---------- User CRUD ----------
  const handleEditUser = useCallback((user: User) => {
    setSelectedUser(user);
    setUserRoleForm({ roleIds: (user.roles || []).map(r => r.id) });
    setIsUserPanelOpen(true);
  }, []);

  const handleDeleteUser = async (user: User) => {
    if (!confirm(`Delete user "${user.name}"?`)) return;
    try {
      await apiClient.deleteUser(user.id);
      showSuccess('User deleted', `${user.name} removed.`);
      addAppLog({ module: 'UserRoles', action: 'Delete user', status: 'success', message: `Deleted user ${user.name}` });
      refreshUsers();
    } catch (err: any) {
      showError('Delete failed', err.message);
    }
  };

  const handleSaveUserRoles = async () => {
    if (!selectedUser) return;
    setSubmitting(true);
    try {
      await apiClient.assignRolesToUser(selectedUser.id, userRoleForm.roleIds);
      showSuccess('Roles updated', 'User roles updated successfully.');
      addAppLog({ module: 'UserRoles', action: 'Update roles', status: 'success', message: `Updated roles for ${selectedUser.name}` });
      setIsUserPanelOpen(false);
      refreshUsers();
    } catch (err: any) {
      showError('Update failed', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- Role CRUD ----------
  const handleCreateRole = () => {
    setSelectedRole(null);
    setRoleForm({ name: '', group: '', description: '', permissionIds: [], active: true });
    setIsRolePanelOpen(true);
  };

  const handleEditRole = (role: Role) => {
    setSelectedRole(role);
    setRoleForm({
      name: role.name || '',
      group: role.group || '',
      description: role.description || '',
      permissionIds: role.permissions || [],
      active: role.active ?? true,
    });
    setIsRolePanelOpen(true);
  };

  const handleDeleteRole = async (role: Role) => {
    if (!confirm(`Delete role "${role.name}"?`)) return;
    try {
      await apiClient.deleteRole(role.id);
      showSuccess('Role deleted', `${role.name} removed.`);
      addAppLog({ module: 'UserRoles', action: 'Delete role', status: 'success', message: `Deleted role ${role.name}` });
      refreshRoles();
    } catch (err: any) {
      showError('Delete failed', err.message);
    }
  };

  const handleSaveRole = async () => {
    if (!roleForm.name.trim()) {
      setGlobalError('Role name is required.');
      return;
    }
    setGlobalError(null);

    const payload = {
      name: roleForm.name,
      group: roleForm.group || null,
      description: roleForm.description || null,
      permission_ids: roleForm.permissionIds,
      active: roleForm.active,
    };

    setSubmitting(true);
    try {
      if (selectedRole) {
        await apiClient.updateRole(selectedRole.id, payload);
        showSuccess('Role updated', `${roleForm.name} updated.`);
        addAppLog({ module: 'UserRoles', action: 'Update role', status: 'success', message: `Updated role ${roleForm.name}` });
      } else {
        await apiClient.createRole(payload);
        showSuccess('Role created', `${roleForm.name} created.`);
        addAppLog({ module: 'UserRoles', action: 'Create role', status: 'success', message: `Created role ${roleForm.name}` });
      }
      setIsRolePanelOpen(false);
      refreshRoles();
    } catch (err: any) {
      showError('Save failed', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- UI helpers ----------
  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const renderSection = (title: string, sectionKey: string, icon: React.ReactNode, children: React.ReactNode) => (
    <div className="border-b border-gray-200 pb-4 mb-4 last:border-0">
      <button
        type="button"
        onClick={() => toggleSection(sectionKey)}
        className="flex items-center justify-between w-full text-left group"
      >
        <div className="flex items-center gap-2 text-base font-semibold text-gray-800">
          {icon}
          <span>{title}</span>
        </div>
        <span className="text-gray-400 group-hover:text-gray-600">
          {expandedSections[sectionKey] ? <FiChevronDown size={20} /> : <FiChevronRight size={20} />}
        </span>
      </button>
      {expandedSections[sectionKey] && (
        <div className="mt-4 space-y-4 animate-fadeIn">{children}</div>
      )}
    </div>
  );

  // ---------- Render ----------
  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 md:p-7 text-slate-800">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 mb-6 rounded-3xl bg-slate-950 px-5 py-6 md:px-8 md:py-7 shadow-xl shadow-slate-300/50">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> Access Control
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl flex items-center gap-3">
            <FiShield className="text-cyan-300" /> Users & Roles
            <span className="text-sm font-normal text-cyan-100/70 ml-2">RBAC</span>
          </h1>
          <p className="text-sm text-slate-300">Manage system users, roles, and permissions</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { refreshUsers(); refreshRoles(); refreshPerms(); }} disabled={isLoading} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 transition hover:bg-white/20 disabled:opacity-60">
            <FiRefreshCw className={isLoading ? 'animate-spin inline mr-1' : 'inline mr-1'} size={14} /> Refresh
          </button>
          {activeTab === 'roles' && (
            <button onClick={handleCreateRole} className="rounded-xl bg-cyan-400 text-slate-950 px-3 py-2 text-sm font-medium transition hover:bg-cyan-300 shadow-md shadow-cyan-500/20">
              <FiPlus className="inline mr-1" size={14} /> New Role
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 bg-white rounded-xl p-1 border border-slate-200 w-fit">
        <button
          onClick={() => setActiveTab('users')}
          className={clsx(
            'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            activeTab === 'users' ? 'bg-blue-500 text-white shadow-sm' : 'text-slate-600 hover:text-slate-800'
          )}
        >
          <FiUser className="inline mr-1" size={16} /> Users ({users?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('roles')}
          className={clsx(
            'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            activeTab === 'roles' ? 'bg-blue-500 text-white shadow-sm' : 'text-slate-600 hover:text-slate-800'
          )}
        >
          <FiShield className="inline mr-1" size={16} /> Roles ({roles?.length || 0})
        </button>
      </div>

      {/* Search Bars */}
      <div className="mb-4">
        {activeTab === 'users' ? (
          <div className="relative max-w-md">
            <FiSearch className="absolute left-3 top-2.5 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search users by name or email..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none placeholder:text-slate-400 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 transition-all"
            />
          </div>
        ) : (
          <div className="relative max-w-md">
            <FiSearch className="absolute left-3 top-2.5 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search roles by name or group..."
              value={roleSearch}
              onChange={(e) => setRoleSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none placeholder:text-slate-400 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 transition-all"
            />
          </div>
        )}
      </div>

      {/* Error banner */}
      {globalError && (
        <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-2 animate-shake">
          <FiAlertCircle size={20} /> {globalError}
        </div>
      )}

      {/* Tables with skeleton & pagination */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <Suspense fallback={<TableSkeleton />}>
          {isLoading ? (
            <TableSkeleton />
          ) : activeTab === 'users' ? (
            <>
              <ModernDataTable
                title=""
                columns={userColumns}
                data={paginatedUsers}
                loading={false}
                striped
                highlightOnHover
                pointerOnHover
              />
              {Math.ceil(filteredUsers.length / rowsPerPage) > 1 && (
                <Pagination
                  currentPage={userPage}
                  totalPages={Math.ceil(filteredUsers.length / rowsPerPage)}
                  onPageChange={setUserPage}
                  totalItems={filteredUsers.length}
                  itemsPerPage={rowsPerPage}
                />
              )}
            </>
          ) : (
            <>
              <ModernDataTable
                title=""
                columns={roleColumns}
                data={paginatedRoles}
                loading={false}
                striped
                highlightOnHover
                pointerOnHover
              />
              {Math.ceil(filteredRoles.length / rowsPerPage) > 1 && (
                <Pagination
                  currentPage={rolePage}
                  totalPages={Math.ceil(filteredRoles.length / rowsPerPage)}
                  onPageChange={setRolePage}
                  totalItems={filteredRoles.length}
                  itemsPerPage={rowsPerPage}
                />
              )}
            </>
          )}
        </Suspense>
      </div>

      {/* Offcanvas for User Role Assignment */}
      {isUserPanelOpen && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"><div className="bg-white p-8 rounded-2xl">Loading...</div></div>}>
          <Offcanvas
            isOpen={isUserPanelOpen}
            title={`Manage Roles for ${selectedUser?.name || ''}`}
            onClose={() => setIsUserPanelOpen(false)}
            footer={
              <div className="flex justify-end gap-3">
                <button onClick={() => setIsUserPanelOpen(false)} className="btn btn-secondary">Cancel</button>
                <button onClick={handleSaveUserRoles} disabled={submitting} className="btn btn-primary">
                  {submitting ? 'Saving...' : 'Save Roles'}
                </button>
              </div>
            }
          >
            <div className="space-y-4">
              <p className="text-sm text-slate-500">Select which roles are assigned to this user.</p>
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {roles?.map(role => (
                  <label key={role.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={userRoleForm.roleIds.includes(role.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setUserRoleForm(prev => ({ roleIds: [...prev.roleIds, role.id] }));
                        } else {
                          setUserRoleForm(prev => ({ roleIds: prev.roleIds.filter(id => id !== role.id) }));
                        }
                      }}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <div className="font-medium text-slate-800">{role.name}</div>
                      <div className="text-xs text-slate-400">{role.description || ''}</div>
                    </div>
                  </label>
                ))}
                {(!roles || roles.length === 0) && (
                  <p className="text-sm text-slate-500 italic">No roles defined yet.</p>
                )}
              </div>
            </div>
          </Offcanvas>
        </Suspense>
      )}

      {/* Offcanvas for Role Create/Edit */}
      {isRolePanelOpen && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"><div className="bg-white p-8 rounded-2xl">Loading form...</div></div>}>
          <Offcanvas
            isOpen={isRolePanelOpen}
            title={selectedRole ? 'Edit Role' : 'Create Role'}
            onClose={() => setIsRolePanelOpen(false)}
            footer={
              <div className="flex justify-end gap-3">
                <button onClick={() => setIsRolePanelOpen(false)} className="btn btn-secondary" disabled={submitting}>Cancel</button>
                <button onClick={handleSaveRole} disabled={submitting} className="btn btn-primary">
                  {submitting ? 'Saving...' : selectedRole ? 'Update Role' : 'Create Role'}
                </button>
              </div>
            }
          >
            <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
              {renderSection('Basic Information', 'basic', <FiShield size={18} className="text-blue-500" />,
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Role Name *</label>
                    <input
                      type="text"
                      value={roleForm.name}
                      onChange={e => setRoleForm(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                      placeholder="e.g., Admin"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Group</label>
                    <input
                      type="text"
                      value={roleForm.group}
                      onChange={e => setRoleForm(prev => ({ ...prev, group: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                      placeholder="e.g., management"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <input
                      type="text"
                      value={roleForm.description}
                      onChange={e => setRoleForm(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                      placeholder="Optional description"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      value={roleForm.active ? '1' : '0'}
                      onChange={e => setRoleForm(prev => ({ ...prev, active: e.target.value === '1' }))}
                      className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    >
                      <option value="1">Active</option>
                      <option value="0">Inactive</option>
                    </select>
                  </div>
                </div>
              )}

              {renderSection('Permissions', 'permissions', <FiCheck size={18} className="text-indigo-500" />,
                <div className="max-h-64 overflow-y-auto border rounded-lg p-3 space-y-2">
                  {allPermissions && allPermissions.length > 0 ? (
                    allPermissions.map(perm => (
                      <label key={perm.id} className="flex items-center gap-3 p-1 rounded hover:bg-slate-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={roleForm.permissionIds.includes(perm.id)}
                          onChange={e => {
                            if (e.target.checked) {
                              setRoleForm(prev => ({ ...prev, permissionIds: [...prev.permissionIds, perm.id] }));
                            } else {
                              setRoleForm(prev => ({ ...prev, permissionIds: prev.permissionIds.filter(id => id !== perm.id) }));
                            }
                          }}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm">{perm.name}</span>
                        <span className="text-xs text-gray-400 ml-auto">({perm.group || 'general'})</span>
                      </label>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500 italic">No permissions configured.</p>
                  )}
                </div>
              )}
            </div>
          </Offcanvas>
        </Suspense>
      )}

      {/* Styles */}
      <style>{`
        .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-shake { animation: shake 0.4s ease-in-out; }
        @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        @media (max-width: 640px) {
          .rdt_TableCol, .rdt_TableCell { white-space: nowrap; }
        }
        .rdt_TableHeader .search-container,
        .rdt_TableHeader input[type="text"] { display: none !important; }
        .rdt_TableHeader > div:last-child { display: none !important; }
        .rdt_TableCol:first-child, .rdt_TableCell:first-child { display: none !important; }
      `}</style>
    </div>
  );
}

// ---------- Pagination Component ----------
const Pagination = ({ currentPage, totalPages, onPageChange, totalItems, itemsPerPage }: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems: number;
  itemsPerPage: number;
}) => (
  <div className="flex items-center justify-between px-6 py-3 border-t">
    <span className="text-sm text-slate-600">
      Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, totalItems)} of {totalItems}
    </span>
    <div className="flex gap-1">
      <button onClick={() => onPageChange(1)} disabled={currentPage === 1} className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40">««</button>
      <button onClick={() => onPageChange(Math.max(1, currentPage - 1))} disabled={currentPage === 1} className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40">‹</button>
      <span className="px-3 py-1 text-sm font-medium">{currentPage} / {totalPages}</span>
      <button onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40">›</button>
      <button onClick={() => onPageChange(totalPages)} disabled={currentPage === totalPages} className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40">»»</button>
    </div>
  </div>
);