import React, { useState, useEffect, useCallback } from 'react';
import {
  FiShield,
  FiX,
  FiSmartphone,
  FiMonitor,
  FiAlertTriangle,
  FiClock,
  FiCheckCircle,
  FiXCircle,
  FiLogOut,
  FiRefreshCw,
  FiUserCheck,
  FiLock,
} from 'react-icons/fi';
import { apiClient } from '../api';
import { useNotification } from './NotificationContext';

interface UserSecurityModalProps {
  userId: number | null;
  userName?: string;
  isOpen: boolean;
  onClose: () => void;
  onUserStatusChanged?: () => void;
}

export function UserSecurityModal({
  userId,
  userName,
  isOpen,
  onClose,
  onUserStatusChanged,
}: UserSecurityModalProps) {
  const { showSuccess, showError } = useNotification();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'sessions' | 'attempts' | 'history'>('sessions');
  const [terminatingSessionId, setTerminatingSessionId] = useState<number | null>(null);
  const [forcingLogout, setForcingLogout] = useState(false);

  const fetchOverview = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res: any = await apiClient.getUserSecurityOverview(userId);
      setData(res);
    } catch (err: any) {
      showError('Failed to load user security details', err?.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  }, [userId, showError]);

  useEffect(() => {
    if (isOpen && userId) {
      void fetchOverview();
    } else {
      setData(null);
    }
  }, [isOpen, userId, fetchOverview]);

  if (!isOpen || !userId) return null;

  const handleTerminateSession = async (sessionId: number) => {
    setTerminatingSessionId(sessionId);
    try {
      await apiClient.terminateSessionAdmin(sessionId);
      showSuccess('Session Terminated', 'The device session has been revoked.');
      void fetchOverview();
    } catch (err: any) {
      showError('Action Failed', err?.response?.data?.message || err.message);
    } finally {
      setTerminatingSessionId(null);
    }
  };

  const handleForceLogoutAll = async () => {
    if (!window.confirm(`Are you sure you want to revoke all active sessions for this user?`)) {
      return;
    }
    setForcingLogout(true);
    try {
      await apiClient.forceLogoutUser(userId);
      showSuccess('Sessions Revoked', 'All active sessions and access tokens were invalidated.');
      void fetchOverview();
      onUserStatusChanged?.();
    } catch (err: any) {
      showError('Action Failed', err?.response?.data?.message || err.message);
    } finally {
      setForcingLogout(false);
    }
  };

  const user = data?.user;
  const sessions = data?.active_sessions || [];
  const attempts = data?.login_attempts || [];
  const banHistory = data?.ban_history || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fadeIn">
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
              <FiShield size={20} />
            </span>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Security &amp; Device Sessions — {userName || user?.name || `User #${userId}`}
              </h2>
              <p className="text-xs text-slate-500">
                Audit active logins, threat attempts, and administrative security history.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void fetchOverview()}
              disabled={loading}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              title="Refresh"
            >
              <FiRefreshCw className={loading ? 'animate-spin' : ''} size={16} />
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
            >
              <FiX size={18} />
            </button>
          </div>
        </div>

        {/* User Status Bar */}
        {user && (
          <div className="grid grid-cols-2 gap-4 border-b border-slate-100 bg-slate-50/70 px-6 py-3 sm:grid-cols-4 text-xs">
            <div>
              <span className="text-slate-500">Account Status:</span>
              <div className="mt-0.5 font-semibold capitalize text-slate-800">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-[10px] ${
                    user.status === 'banned'
                      ? 'bg-rose-100 text-rose-800'
                      : user.status === 'suspended'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {user.status || 'Active'}
                </span>
              </div>
            </div>
            <div>
              <span className="text-slate-500">Failed Logins:</span>
              <div className="mt-0.5 font-semibold text-slate-800">
                {user.failed_login_count ?? 0}
                {user.lockout_until && (
                  <span className="ml-1 text-rose-600 font-normal">
                    (Locked until {new Date(user.lockout_until).toLocaleTimeString()})
                  </span>
                )}
              </div>
            </div>
            <div>
              <span className="text-slate-500">Last Login:</span>
              <div className="mt-0.5 font-medium text-slate-800">
                {user.last_login_at
                  ? new Date(user.last_login_at).toLocaleString()
                  : 'Never'}
              </div>
            </div>
            <div>
              <span className="text-slate-500">Active Sessions:</span>
              <div className="mt-0.5 font-semibold text-indigo-600">{sessions.length}</div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-6">
          <button
            onClick={() => setActiveTab('sessions')}
            className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${
              activeTab === 'sessions'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Active Sessions ({sessions.length})
          </button>
          <button
            onClick={() => setActiveTab('attempts')}
            className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${
              activeTab === 'attempts'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Login Attempts ({attempts.length})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${
              activeTab === 'history'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Ban &amp; Restriction History ({banHistory.length})
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && !data ? (
            <div className="flex h-48 items-center justify-center text-sm text-slate-500">
              <FiRefreshCw className="mr-2 animate-spin text-indigo-600" /> Loading security details…
            </div>
          ) : activeTab === 'sessions' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  Devices currently authenticated with active session tokens.
                </p>
                {sessions.length > 0 && (
                  <button
                    onClick={handleForceLogoutAll}
                    disabled={forcingLogout}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition disabled:opacity-50"
                  >
                    <FiLogOut size={13} /> Force Logout All Devices
                  </button>
                )}
              </div>

              {sessions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-slate-500 text-sm">
                  No active device sessions found for this user.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                  {sessions.map((s: any) => (
                    <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div className="flex items-center gap-3">
                        <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-600">
                          {s.device_type === 'mobile' ? (
                            <FiSmartphone size={18} />
                          ) : (
                            <FiMonitor size={18} />
                          )}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-900">
                              {s.device_name || 'Web Browser'}
                            </span>
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                              {s.ip_address}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {s.browser || 'Unknown'} · {s.platform || 'Unknown OS'}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-400">
                            Last active: {new Date(s.last_activity_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleTerminateSession(s.id)}
                        disabled={terminatingSessionId === s.id}
                        className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition disabled:opacity-50"
                      >
                        {terminatingSessionId === s.id ? 'Revoking…' : 'Terminate'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : activeTab === 'attempts' ? (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                Recent authentication records including IP addresses and security outcomes.
              </p>
              {attempts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-slate-500 text-sm">
                  No login attempt records found.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                      <tr>
                        <th className="p-3">Status</th>
                        <th className="p-3">Time</th>
                        <th className="p-3">IP Address</th>
                        <th className="p-3">Device / Browser</th>
                        <th className="p-3">Failure Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {attempts.map((a: any) => (
                        <tr key={a.id} className="hover:bg-slate-50/70">
                          <td className="p-3">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                a.status === 'success'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : a.status === 'blocked'
                                  ? 'bg-amber-50 text-amber-800'
                                  : 'bg-rose-50 text-rose-700'
                              }`}
                            >
                              {a.status === 'success' ? (
                                <FiCheckCircle size={10} />
                              ) : (
                                <FiXCircle size={10} />
                              )}
                              {a.status}
                            </span>
                          </td>
                          <td className="p-3 text-slate-600">
                            {new Date(a.attempted_at).toLocaleString()}
                          </td>
                          <td className="p-3 font-mono text-slate-700">{a.ip_address}</td>
                          <td className="p-3 text-slate-600">
                            {a.browser || 'Unknown'} · {a.platform || 'Unknown OS'}
                          </td>
                          <td className="p-3 text-rose-600">{a.failure_reason || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                Audit log of administrator actions applied to this user account.
              </p>
              {banHistory.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-slate-500 text-sm">
                  No restriction or ban records for this user.
                </div>
              ) : (
                <div className="space-y-2">
                  {banHistory.map((h: any) => (
                    <div
                      key={h.id}
                      className="rounded-xl border border-slate-200 bg-white p-4 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold capitalize text-slate-900">
                          Action: {h.action}
                        </span>
                        <span className="text-slate-400">
                          {new Date(h.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-1 text-slate-600">
                        <strong className="text-slate-700">Reason:</strong> {h.reason}
                      </p>
                      {h.banned_until && (
                        <p className="mt-0.5 text-amber-700">
                          <strong>Active Until:</strong> {new Date(h.banned_until).toLocaleString()}
                        </p>
                      )}
                      <p className="mt-1 text-[11px] text-slate-400">
                        Administered by: {h.performer?.name || `Admin #${h.performed_by_user_id}`}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-6 py-3 text-right">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
