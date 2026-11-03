// src/features/security/UserBanManagement.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FiSlash,
  FiCheckCircle,
  FiAlertTriangle,
  FiClock,
  FiSearch,
  FiRefreshCw,
  FiUserX,
  FiShield,
  FiUnlock,
  FiLogOut,
  FiUserCheck,
} from 'react-icons/fi';
import { apiClient } from '../../api';
import { useNotification } from '../../components/NotificationContext';
import { UserBanModal } from '../../components/UserBanModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface UserRecord {
  id: number;
  name: string;
  email: string;
  phone?: string;
  status?: string;
  banned_at?: string | null;
  banned_until?: string | null;
  banned_reason?: string | null;
  failed_login_count?: number;
  lockout_until?: string | null;
  active_sessions_count?: number;
  roles?: Array<{ id: number; name: string }>;
  role_names?: string[];
  ban_history?: Array<{
    id: number;
    action: string;
    reason: string;
    created_at: string;
    expires_at?: string | null;
    performer?: { id: number; name: string };
  }>;
}

export function UserBanManagement() {
  const { showSuccess, showError } = useNotification();

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [bannedUsers, setBannedUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'banned' | 'suspended' | 'locked'>('all');

  // Modal State
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);
  const [modalMode, setModalMode] = useState<'ban' | 'unban'>('ban');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Quick Ban Target
  const [selectedUserIdToBan, setSelectedUserIdToBan] = useState<number | ''>('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [allUsersRes, bannedRes] = await Promise.all([
        apiClient.getUsers(),
        apiClient.getBannedUsers().catch(() => ({ data: [] })),
      ]);

      const allList = (allUsersRes as { data?: UserRecord[] })?.data || (allUsersRes as UserRecord[]) || [];
      const bList = (bannedRes as { data?: UserRecord[] })?.data || (bannedRes as UserRecord[]) || [];

      setUsers(Array.isArray(allList) ? allList : []);
      setBannedUsers(Array.isArray(bList) ? bList : []);
    } catch {
      showError('Failed to load users', 'Could not load user security and account status list.');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleOpenBan = (user: UserRecord) => {
    setSelectedUser(user);
    setModalMode('ban');
    setIsModalOpen(true);
  };

  const handleOpenUnban = (user: UserRecord) => {
    setSelectedUser(user);
    setModalMode('unban');
    setIsModalOpen(true);
  };

  const handleQuickUnban = async (user: UserRecord) => {
    if (!window.confirm(`Restore account access for ${user.name} (${user.email})?`)) return;
    try {
      await apiClient.unbanUser(user.id, 'Restored from Settings Page');
      showSuccess('User Restored', `Account for ${user.name} has been unbanned and restored to active status.`);
      void loadData();
    } catch (err: any) {
      showError('Unban Failed', err?.response?.data?.message || err.message || 'Could not unban user.');
    }
  };

  const handleResetLockout = async (user: UserRecord) => {
    try {
      await apiClient.resetUserLockout(user.id);
      showSuccess('Lockout Cleared', `Login lockout removed for ${user.name}.`);
      void loadData();
    } catch {
      showError('Reset failed', 'Could not clear login lockout.');
    }
  };

  const handleTerminateSessions = async (user: UserRecord) => {
    if (!window.confirm(`Revoke all active mobile and web sessions for ${user.name}?`)) return;
    try {
      await apiClient.forceLogoutUser(user.id);
      showSuccess('Sessions Revoked', `All active sessions and tokens terminated for ${user.name}.`);
      void loadData();
    } catch {
      showError('Action failed', 'Could not terminate sessions.');
    }
  };

  const handleQuickBanSelect = () => {
    if (!selectedUserIdToBan) return;
    const target = users.find((u) => u.id === Number(selectedUserIdToBan));
    if (target) {
      handleOpenBan(target);
      setSelectedUserIdToBan('');
    }
  };

  // Filtered List of restricted/banned accounts
  const displayedBannedUsers = useMemo(() => {
    return bannedUsers.filter((u) => {
      const matchesSearch =
        !searchTerm ||
        u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.banned_reason || '').toLowerCase().includes(searchTerm.toLowerCase());

      const isBanned = u.status === 'banned';
      const isSuspended = u.status === 'suspended';
      const isLocked = Boolean(u.lockout_until && new Date(u.lockout_until) > new Date());

      if (statusFilter === 'banned') return matchesSearch && isBanned;
      if (statusFilter === 'suspended') return matchesSearch && isSuspended;
      if (statusFilter === 'locked') return matchesSearch && isLocked;
      return matchesSearch;
    });
  }, [bannedUsers, searchTerm, statusFilter]);

  const activeUsersCount = users.filter((u) => u.status === 'active' || !u.status).length;
  const totalBannedCount = bannedUsers.filter((u) => u.status === 'banned').length;
  const totalSuspendedCount = bannedUsers.filter((u) => u.status === 'suspended').length;
  const totalLockedCount = users.filter((u) => u.lockout_until && new Date(u.lockout_until) > new Date()).length;

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="rounded-2xl border border-rose-200 bg-gradient-to-r from-rose-50 via-white to-amber-50 p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-600">
                Security &amp; Account Access Control
              </p>
            </div>
            <h2 className="text-xl font-bold text-slate-900">User Ban &amp; Mobile Access Restrictions</h2>
            <p className="mt-1 text-xs text-slate-600 sm:text-sm">
              Manage account bans, temporary suspensions, failed login lockouts, and revoke active Flutter/mobile sessions in real-time.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              disabled={loading}
              className="h-9 rounded-xl border-slate-300 text-xs text-slate-700"
            >
              <FiRefreshCw className={`mr-1.5 ${loading ? 'animate-spin' : ''}`} size={13} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Security Metric Cards */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-emerald-100 bg-white/90 p-3">
            <p className="text-[10px] font-bold uppercase text-emerald-600">Active Accounts</p>
            <p className="mt-0.5 text-lg font-bold text-emerald-700">{activeUsersCount}</p>
          </div>
          <div className="rounded-xl border border-rose-100 bg-white/90 p-3">
            <p className="text-[10px] font-bold uppercase text-rose-600">Permanently Banned</p>
            <p className="mt-0.5 text-lg font-bold text-rose-700">{totalBannedCount}</p>
          </div>
          <div className="rounded-xl border border-amber-100 bg-white/90 p-3">
            <p className="text-[10px] font-bold uppercase text-amber-600">Temporarily Suspended</p>
            <p className="mt-0.5 text-lg font-bold text-amber-700">{totalSuspendedCount}</p>
          </div>
          <div className="rounded-xl border border-purple-100 bg-white/90 p-3">
            <p className="text-[10px] font-bold uppercase text-purple-600">Locked Out (Brute Force)</p>
            <p className="mt-0.5 text-lg font-bold text-purple-700">{totalLockedCount}</p>
          </div>
        </div>
      </div>

      {/* Quick Action: Select User to Ban */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
          Restrict Any User Directly from Settings
        </h3>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <select
              value={selectedUserIdToBan}
              onChange={(e) => setSelectedUserIdToBan(e.target.value ? Number(e.target.value) : '')}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
            >
              <option value="">-- Choose active user to ban or suspend --</option>
              {users
                .filter((u) => u.status !== 'banned')
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email}) — Role: {u.role_names?.join(', ') || 'Staff'} {u.status === 'suspended' ? '[Suspended]' : ''}
                  </option>
                ))}
            </select>
          </div>
          <Button
            size="sm"
            onClick={handleQuickBanSelect}
            disabled={!selectedUserIdToBan}
            className="h-10 rounded-xl bg-rose-600 px-4 text-xs font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
          >
            <FiSlash className="mr-1.5" size={13} />
            Apply Ban / Suspension
          </Button>
        </div>
      </div>

      {/* Banned Users Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Restricted &amp; Banned Users Directory</h3>
            <p className="text-xs text-slate-500">
              Users listed here cannot log in to web ERP or any Flutter mobile application.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <FiSearch className="absolute left-3 top-2.5 text-slate-400" size={13} />
              <input
                type="text"
                placeholder="Search by name, email, reason..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8 w-56 rounded-xl border border-slate-200 pl-8 pr-3 text-xs outline-none focus:border-indigo-400"
              />
            </div>

            <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 text-xs">
              {(['all', 'banned', 'suspended', 'locked'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setStatusFilter(mode)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-medium capitalize transition ${
                    statusFilter === mode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading user security records...</div>
        ) : displayedBannedUsers.length === 0 ? (
          <div className="p-10 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
              <FiUserCheck size={24} />
            </div>
            <h4 className="mt-3 text-sm font-bold text-slate-800">No Banned Users Found</h4>
            <p className="mt-1 text-xs text-slate-500">
              {searchTerm
                ? 'No restricted users match your search criteria.'
                : 'All system accounts are currently in good standing and authorized for mobile access.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Restriction Reason</th>
                  <th className="px-3 py-3">Banned At</th>
                  <th className="px-3 py-3">Expires At</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedBannedUsers.map((user) => {
                  const isSuspended = user.status === 'suspended';
                  const isLocked = Boolean(user.lockout_until && new Date(user.lockout_until) > new Date());

                  return (
                    <tr key={user.id} className="hover:bg-slate-50/60 transition">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        <div className="flex items-center gap-2">
                          <span className="grid h-7 w-7 place-items-center rounded-full bg-slate-100 font-bold text-slate-700 text-xs">
                            {user.name.charAt(0).toUpperCase()}
                          </span>
                          <div>
                            <p className="font-semibold">{user.name}</p>
                            <p className="text-[11px] text-slate-500">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-1">
                          <Badge
                            variant="outline"
                            className={`text-[10px] w-fit font-semibold ${
                              isSuspended
                                ? 'border-amber-200 bg-amber-50 text-amber-800'
                                : 'border-rose-200 bg-rose-50 text-rose-700'
                            }`}
                          >
                            {isSuspended ? 'Suspended' : 'Banned'}
                          </Badge>
                          {isLocked && (
                            <Badge variant="outline" className="text-[9px] border-purple-200 bg-purple-50 text-purple-700">
                              Locked
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 max-w-xs text-slate-700">
                        <p className="line-clamp-2">{user.banned_reason || 'No specific reason entered.'}</p>
                      </td>
                      <td className="px-3 py-3 text-slate-500">
                        {user.banned_at ? new Date(user.banned_at).toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-3 text-slate-500">
                        {user.banned_until ? (
                          <span className="font-mono text-amber-700">
                            {new Date(user.banned_until).toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Permanent</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            onClick={() => void handleQuickUnban(user)}
                            className="h-7 rounded-lg bg-emerald-600 px-2.5 text-[11px] font-semibold text-white hover:bg-emerald-700 shadow-sm"
                            title="Unban and restore access immediately"
                          >
                            <FiUnlock className="mr-1" size={11} /> Unban
                          </Button>

                          {isLocked && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void handleResetLockout(user)}
                              className="h-7 rounded-lg border-purple-200 text-[11px] font-medium text-purple-700 hover:bg-purple-50"
                              title="Clear brute-force lockout"
                            >
                              Reset Lock
                            </Button>
                          )}

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleTerminateSessions(user)}
                            className="h-7 rounded-lg border-slate-200 text-[11px] text-slate-600 hover:bg-slate-100"
                            title="Kill active mobile sessions"
                          >
                            <FiLogOut size={11} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* User Ban / Unban Modal */}
      <UserBanModal
        user={selectedUser}
        mode={modalMode}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedUser(null);
        }}
        onSuccess={() => void loadData()}
      />
    </div>
  );
}

export default UserBanManagement;
