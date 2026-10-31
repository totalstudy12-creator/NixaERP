// src/pages/SecurityPage.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiShield,
  FiUsers,
  FiLock,
  FiKey,
  FiActivity,
  FiLayers,
  FiBriefcase,
  FiMapPin,
  FiChevronRight,
  FiFileText,
  FiServer,
  FiSlash,
  FiCheckCircle,
  FiXCircle,
  FiAlertTriangle,
  FiTrash2,
  FiPlus,
  FiRefreshCw,
  FiMonitor,
  FiSmartphone,
  FiSearch,
  FiClock,
} from 'react-icons/fi';
import { useAuthStore } from '../store/auth';
import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';

/* ------------------------------------------------------------------ */
/* RBAC — Permission keys                                              */
/* ------------------------------------------------------------------ */

const PERMISSIONS = {
  SECURITY_VIEW: 'security.view',
  SECURITY_ROLES_VIEW: 'security.roles.view',
  SECURITY_USERS_VIEW: 'security.users.view',
  SECURITY_2FA_VIEW: 'security.2fa.view',
  SECURITY_LOGS_VIEW: 'security.logs.view',
  SECURITY_SESSIONS_VIEW: 'security.sessions.view',
  SECURITY_APPROVALS_VIEW: 'security.approvals.view',
} as const;

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
/* Navigation policy cards                                             */
/* ------------------------------------------------------------------ */

interface SecurityCard {
  key: string;
  title: string;
  detail: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  route?: string;
  permission?: string;
  infoOnly?: boolean;
}

const POLICY_CARDS: SecurityCard[] = [
  {
    key: 'roles',
    title: 'Role-Based Access Control',
    detail:
      'Define roles, assign granular permissions, and control access by module, company and branch. Every ERP action is gated by real permissions.',
    icon: FiShield,
    route: '/user-roles',
    permission: PERMISSIONS.SECURITY_ROLES_VIEW,
  },
  {
    key: 'users',
    title: 'User Governance & Banning',
    detail:
      'Manage users, assign roles, enforce temporary suspensions, issue permanent bans, and clear lockouts.',
    icon: FiUsers,
    route: '/users',
    permission: PERMISSIONS.SECURITY_USERS_VIEW,
  },
  {
    key: '2fa',
    title: 'Two-Factor Authentication',
    detail:
      'Configure TOTP-based two-factor authentication and manage single-use recovery codes.',
    icon: FiKey,
    route: '/settings?tab=security',
    permission: PERMISSIONS.SECURITY_2FA_VIEW,
  },
  {
    key: 'activity-log',
    title: 'Audit Logs & Diff Ledger',
    detail:
      'Every ERP action is recorded with actor ID, timestamp, before/after values, IP address and outcome.',
    icon: FiActivity,
    route: '/audit-logs',
    permission: PERMISSIONS.SECURITY_LOGS_VIEW,
  },
  {
    key: 'approvals',
    title: 'Approval Workflow',
    detail:
      'Sensitive actions like payroll runs, backup triggers, and MCP token creation require elevated permissions.',
    icon: FiFileText,
    permission: PERMISSIONS.SECURITY_APPROVALS_VIEW,
    infoOnly: true,
  },
  {
    key: 'encryption',
    title: 'Encryption & Secret Masking',
    detail:
      'TOTP secrets, API credentials, and database passwords are encrypted at rest and masked in responses.',
    icon: FiLayers,
    infoOnly: true,
  },
];

/* ------------------------------------------------------------------ */
/* Main SecurityPage Component                                         */
/* ------------------------------------------------------------------ */

export function SecurityPage() {
  const navigate = useNavigate();
  const { showSuccess, showError } = useNotification();
  const { can, isAuthenticated, loadingUser } = usePagePermissions();

  const canView = can(PERMISSIONS.SECURITY_VIEW);

  // Active top-level tab
  const [activeTab, setActiveTab] = useState<'overview' | 'firewall' | 'attempts' | 'sessions' | 'policies'>('overview');

  // Dashboard Stats
  const [dashboard, setDashboard] = useState<any>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);

  // IP Rules Firewall
  const [ipRules, setIpRules] = useState<any[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [showAddRuleModal, setShowAddRuleModal] = useState(false);
  const [newIpAddress, setNewIpAddress] = useState('');
  const [newRuleType, setNewRuleType] = useState<'deny' | 'allow'>('deny');
  const [newRuleReason, setNewRuleReason] = useState('');
  const [newRuleDuration, setNewRuleDuration] = useState<number | ''>('');
  const [submittingRule, setSubmittingRule] = useState(false);

  // Login Attempts
  const [attempts, setAttempts] = useState<any[]>([]);
  const [loadingAttempts, setLoadingAttempts] = useState(false);
  const [attemptSearch, setAttemptSearch] = useState('');
  const [attemptFilterStatus, setAttemptFilterStatus] = useState('all');

  // Active Sessions
  const [sessions, setSessions] = useState<any[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [terminatingSessionId, setTerminatingSessionId] = useState<number | null>(null);

  // Fetch Dashboard Overview
  const fetchDashboard = useCallback(async () => {
    setLoadingDashboard(true);
    try {
      const res: any = await apiClient.getSecurityDashboard();
      setDashboard(res);
    } catch (err: any) {
      showError('Failed to load security overview', err?.response?.data?.message || err.message);
    } finally {
      setLoadingDashboard(false);
    }
  }, [showError]);

  // Fetch IP Rules
  const fetchIpRules = useCallback(async () => {
    setLoadingRules(true);
    try {
      const res: any = await apiClient.getIpRules();
      setIpRules(Array.isArray(res) ? res : res?.data || []);
    } catch (err: any) {
      showError('Failed to load IP rules', err?.response?.data?.message || err.message);
    } finally {
      setLoadingRules(false);
    }
  }, [showError]);

  // Fetch Login Attempts
  const fetchAttempts = useCallback(async () => {
    setLoadingAttempts(true);
    try {
      const res: any = await apiClient.getLoginAttempts({ limit: 100 });
      setAttempts(Array.isArray(res) ? res : res?.data || []);
    } catch (err: any) {
      showError('Failed to load login attempts', err?.response?.data?.message || err.message);
    } finally {
      setLoadingAttempts(false);
    }
  }, [showError]);

  // Fetch Active Sessions
  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const res: any = await apiClient.getActiveSessionsAdmin();
      setSessions(Array.isArray(res) ? res : res?.data || []);
    } catch (err: any) {
      showError('Failed to load active sessions', err?.response?.data?.message || err.message);
    } finally {
      setLoadingSessions(false);
    }
  }, [showError]);

  // Initial load
  useEffect(() => {
    if (canView) {
      void fetchDashboard();
    }
  }, [canView, fetchDashboard]);

  // Tab switch effect
  useEffect(() => {
    if (!canView) return;
    if (activeTab === 'overview') void fetchDashboard();
    if (activeTab === 'firewall') void fetchIpRules();
    if (activeTab === 'attempts') void fetchAttempts();
    if (activeTab === 'sessions') void fetchSessions();
  }, [activeTab, canView, fetchDashboard, fetchIpRules, fetchAttempts, fetchSessions]);

  // Add IP Rule Handler
  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIpAddress.trim()) {
      showError('Validation Error', 'Please specify a valid IP address or CIDR subnet.');
      return;
    }
    setSubmittingRule(true);
    try {
      await apiClient.createIpRule({
        ip_address: newIpAddress.trim(),
        rule_type: newRuleType,
        reason: newRuleReason.trim() || undefined,
        duration_minutes: newRuleDuration ? Number(newRuleDuration) : undefined,
      });
      showSuccess('Rule Created', `IP rule for ${newIpAddress} successfully created.`);
      setShowAddRuleModal(false);
      setNewIpAddress('');
      setNewRuleReason('');
      setNewRuleDuration('');
      void fetchIpRules();
      void fetchDashboard();
    } catch (err: any) {
      showError('Failed to create rule', err?.response?.data?.message || err.message);
    } finally {
      setSubmittingRule(false);
    }
  };

  // Delete IP Rule Handler
  const handleDeleteRule = async (ruleId: number, ip: string) => {
    if (!window.confirm(`Are you sure you want to remove the rule for ${ip}?`)) return;
    try {
      await apiClient.deleteIpRule(ruleId);
      showSuccess('Rule Removed', `Access rule for ${ip} deleted.`);
      void fetchIpRules();
      void fetchDashboard();
    } catch (err: any) {
      showError('Action Failed', err?.response?.data?.message || err.message);
    }
  };

  // Terminate Active Session Handler
  const handleTerminateSession = async (sessionId: number) => {
    if (!window.confirm('Terminate this active device session? The user will be logged out immediately.')) return;
    setTerminatingSessionId(sessionId);
    try {
      await apiClient.terminateSessionAdmin(sessionId);
      showSuccess('Session Terminated', 'Device session revoked.');
      void fetchSessions();
      void fetchDashboard();
    } catch (err: any) {
      showError('Action Failed', err?.response?.data?.message || err.message);
    } finally {
      setTerminatingSessionId(null);
    }
  };

  // Filtered attempts
  const filteredAttempts = useMemo(() => {
    return attempts.filter((a) => {
      if (attemptFilterStatus !== 'all' && a.status !== attemptFilterStatus) return false;
      if (attemptSearch.trim()) {
        const q = attemptSearch.toLowerCase();
        const matchIp = (a.ip_address || '').toLowerCase().includes(q);
        const matchUser = (a.user?.name || a.email || '').toLowerCase().includes(q);
        const matchReason = (a.failure_reason || '').toLowerCase().includes(q);
        if (!matchIp && !matchUser && !matchReason) return false;
      }
      return true;
    });
  }, [attempts, attemptFilterStatus, attemptSearch]);

  if (loadingUser && !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="rounded-2xl bg-white px-6 py-5 text-sm text-slate-600 shadow-sm">
          Loading permissions…
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !canView) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-rose-500">
            <FiLock size={26} />
          </div>
          <h1 className="mt-4 text-lg font-bold text-slate-900">Access restricted</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Your account does not have permission to view the Security &amp; Firewall module.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 min-h-screen bg-slate-50 p-6 sm:p-8">
      {/* Header Banner */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 text-white shadow-md">
              <FiShield size={24} />
            </span>
            <div>
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-600">
                Enterprise Defense &amp; Governance
              </div>
              <h1 className="text-2xl font-bold text-slate-900">
                Security Firewall &amp; Controls
              </h1>
              <p className="mt-1 text-xs text-slate-500 max-w-2xl">
                Real-time IP access control, CIDR subnet blocking, threat intelligence, and remote device session termination.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (activeTab === 'overview') void fetchDashboard();
                if (activeTab === 'firewall') void fetchIpRules();
                if (activeTab === 'attempts') void fetchAttempts();
                if (activeTab === 'sessions') void fetchSessions();
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <FiRefreshCw size={13} /> Refresh
            </button>
            <button
              onClick={() => setShowAddRuleModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"
            >
              <FiPlus size={14} /> Add IP Rule
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="mt-6 flex border-b border-slate-100 overflow-x-auto gap-2">
          {[
            { id: 'overview', label: 'Security Dashboard' },
            { id: 'firewall', label: `IP Firewall (${ipRules.length || dashboard?.ip_rules?.total || 0})` },
            { id: 'attempts', label: `Threat & Logins (${attempts.length || 0})` },
            { id: 'sessions', label: `Active Sessions (${sessions.length || dashboard?.active_sessions?.total || 0})` },
            { id: 'policies', label: 'Security Architecture' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`border-b-2 px-4 py-2.5 text-xs font-bold transition whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab 1: Overview Dashboard */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Total IP Rules</span>
              <p className="mt-2 text-2xl font-bold text-slate-900">{dashboard?.ip_rules?.total ?? 0}</p>
              <span className="mt-1 text-[11px] text-slate-400">Firewall policies</span>
            </div>
            <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-4 shadow-sm">
              <span className="text-[11px] font-medium text-rose-700 uppercase tracking-wide">Blocked IPs</span>
              <p className="mt-2 text-2xl font-bold text-rose-700">{dashboard?.ip_rules?.denied ?? 0}</p>
              <span className="mt-1 text-[11px] text-rose-600">Active denylists</span>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm">
              <span className="text-[11px] font-medium text-emerald-700 uppercase tracking-wide">Allowlisted IPs</span>
              <p className="mt-2 text-2xl font-bold text-emerald-700">{dashboard?.ip_rules?.allowed ?? 0}</p>
              <span className="mt-1 text-[11px] text-emerald-600">Trusted addresses</span>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 shadow-sm">
              <span className="text-[11px] font-medium text-amber-800 uppercase tracking-wide">Failed Today</span>
              <p className="mt-2 text-2xl font-bold text-amber-800">{dashboard?.today_attempts?.failed ?? 0}</p>
              <span className="mt-1 text-[11px] text-amber-700">Auth rejections</span>
            </div>
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 shadow-sm">
              <span className="text-[11px] font-medium text-indigo-700 uppercase tracking-wide">Active Sessions</span>
              <p className="mt-2 text-2xl font-bold text-indigo-700">{dashboard?.active_sessions?.total ?? 0}</p>
              <span className="mt-1 text-[11px] text-indigo-600">Live devices</span>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Suspended Users</span>
              <p className="mt-2 text-2xl font-bold text-slate-900">{dashboard?.users?.banned ?? 0}</p>
              <span className="mt-1 text-[11px] text-slate-400">Account bans</span>
            </div>
          </div>

          {/* Recent Threat Logs & Active Sessions Quick View */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Login Attempts */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <FiAlertTriangle className="text-amber-500" /> Recent Authentication Activity
                </h3>
                <button
                  onClick={() => setActiveTab('attempts')}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  View All &rarr;
                </button>
              </div>
              <div className="mt-3 divide-y divide-slate-100">
                {(dashboard?.recent_attempts || []).slice(0, 5).map((a: any) => (
                  <div key={a.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            a.status === 'success'
                              ? 'bg-emerald-50 text-emerald-700'
                              : a.status === 'blocked'
                              ? 'bg-amber-50 text-amber-800'
                              : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {a.status}
                        </span>
                        <span className="font-mono text-slate-700 font-medium">{a.ip_address}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {a.browser} on {a.platform} {a.failure_reason ? `· ${a.failure_reason}` : ''}
                      </p>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {new Date(a.attempted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
                {(dashboard?.recent_attempts || []).length === 0 && (
                  <p className="py-6 text-center text-xs text-slate-400">No recent authentication records.</p>
                )}
              </div>
            </div>

            {/* Active IP Rules */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <FiSlash className="text-rose-500" /> Active Deny &amp; Allow Rules
                </h3>
                <button
                  onClick={() => setActiveTab('firewall')}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  Manage Rules &rarr;
                </button>
              </div>
              <div className="mt-3 divide-y divide-slate-100">
                {(dashboard?.active_rules || []).slice(0, 5).map((r: any) => (
                  <div key={r.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            r.rule_type === 'deny'
                              ? 'bg-rose-50 text-rose-700'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {r.rule_type.toUpperCase()}
                        </span>
                        <span className="font-mono font-semibold text-slate-800">{r.ip_address}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500 truncate max-w-xs">
                        {r.reason || 'No reason provided'}
                      </p>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {r.expires_at ? `Expires ${new Date(r.expires_at).toLocaleDateString()}` : 'Permanent'}
                    </span>
                  </div>
                ))}
                {(dashboard?.active_rules || []).length === 0 && (
                  <p className="py-6 text-center text-xs text-slate-400">No active IP rules configured.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: IP Firewall */}
      {activeTab === 'firewall' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Control network access with single IPv4/IPv6 addresses or CIDR blocks (e.g. <code>192.168.1.0/24</code>, <code>2001:db8::/32</code>).
            </p>
            <button
              onClick={() => setShowAddRuleModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
            >
              <FiPlus size={14} /> Add IP Rule
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50/80 font-semibold text-slate-600">
                <tr>
                  <th className="p-3.5">Rule Type</th>
                  <th className="p-3.5">IP / CIDR Pattern</th>
                  <th className="p-3.5">Reason &amp; Purpose</th>
                  <th className="p-3.5">Created By</th>
                  <th className="p-3.5">Created Date</th>
                  <th className="p-3.5">Expiration</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ipRules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-slate-50/50">
                    <td className="p-3.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                          rule.rule_type === 'deny'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {rule.rule_type === 'deny' ? <FiSlash size={10} /> : <FiCheckCircle size={10} />}
                        {rule.rule_type}
                      </span>
                    </td>
                    <td className="p-3.5 font-mono font-semibold text-slate-900 text-sm">
                      {rule.ip_address}
                    </td>
                    <td className="p-3.5 text-slate-600 max-w-xs truncate">
                      {rule.reason || '—'}
                    </td>
                    <td className="p-3.5 text-slate-600">
                      {rule.creator?.name || `User #${rule.created_by_user_id || 'System'}`}
                    </td>
                    <td className="p-3.5 text-slate-500">
                      {new Date(rule.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-3.5">
                      {rule.expires_at ? (
                        <span className="text-amber-700 font-medium">
                          {new Date(rule.expires_at).toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-slate-400">Permanent</span>
                      )}
                    </td>
                    <td className="p-3.5 text-right">
                      <button
                        onClick={() => handleDeleteRule(rule.id, rule.ip_address)}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-100 transition"
                      >
                        <FiTrash2 size={12} /> Remove
                      </button>
                    </td>
                  </tr>
                ))}
                {ipRules.length === 0 && !loadingRules && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      No IP access rules defined. All legitimate traffic is currently allowed.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Threat & Logins Audit */}
      {activeTab === 'attempts' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative min-w-[240px] max-w-sm flex-1">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                placeholder="Search by IP, email, or failure reason…"
                value={attemptSearch}
                onChange={(e) => setAttemptSearch(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div className="flex items-center gap-1.5">
              {['all', 'success', 'failed', 'blocked'].map((st) => (
                <button
                  key={st}
                  onClick={() => setAttemptFilterStatus(st)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
                    attemptFilterStatus === st
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50/80 font-semibold text-slate-600">
                <tr>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5">Attempted User</th>
                  <th className="p-3.5">IP Address</th>
                  <th className="p-3.5">Client &amp; OS</th>
                  <th className="p-3.5">Timestamp</th>
                  <th className="p-3.5">Failure Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAttempts.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/50">
                    <td className="p-3.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          a.status === 'success'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : a.status === 'blocked'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {a.status === 'success' ? (
                          <FiCheckCircle size={10} />
                        ) : a.status === 'blocked' ? (
                          <FiSlash size={10} />
                        ) : (
                          <FiXCircle size={10} />
                        )}
                        {a.status}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <span className="font-semibold text-slate-900">
                        {a.user?.name || a.email || '—'}
                      </span>
                    </td>
                    <td className="p-3.5 font-mono text-slate-800">{a.ip_address}</td>
                    <td className="p-3.5 text-slate-600">
                      {a.browser || 'Unknown'} · {a.platform || 'Unknown OS'}
                    </td>
                    <td className="p-3.5 text-slate-500">
                      {new Date(a.attempted_at).toLocaleString()}
                    </td>
                    <td className="p-3.5 text-rose-600 font-medium">
                      {a.failure_reason || '—'}
                    </td>
                  </tr>
                ))}
                {filteredAttempts.length === 0 && !loadingAttempts && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      No authentication records match your filter criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Active Device Sessions */}
      {activeTab === 'sessions' && (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Real-time directory of all active browser and API sessions across all system users.
          </p>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50/80 font-semibold text-slate-600">
                <tr>
                  <th className="p-3.5">User</th>
                  <th className="p-3.5">Device</th>
                  <th className="p-3.5">IP Address</th>
                  <th className="p-3.5">Platform &amp; Browser</th>
                  <th className="p-3.5">Last Active</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/50">
                    <td className="p-3.5">
                      <div className="flex items-center gap-2">
                        <span className="grid h-7 w-7 place-items-center rounded-full bg-indigo-50 text-[10px] font-bold text-indigo-700">
                          {(s.user?.name || '?')[0].toUpperCase()}
                        </span>
                        <div>
                          <p className="font-semibold text-slate-900">{s.user?.name || `User #${s.user_id}`}</p>
                          <p className="text-[11px] text-slate-400">{s.user?.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3.5 text-slate-700 font-medium">
                      <div className="flex items-center gap-1.5">
                        {s.device_type === 'mobile' ? <FiSmartphone /> : <FiMonitor />}
                        {s.device_name || 'Browser Session'}
                      </div>
                    </td>
                    <td className="p-3.5 font-mono text-slate-800">{s.ip_address}</td>
                    <td className="p-3.5 text-slate-600">
                      {s.browser || 'Unknown'} · {s.platform || 'Unknown OS'}
                    </td>
                    <td className="p-3.5 text-slate-500">
                      {new Date(s.last_activity_at).toLocaleString()}
                    </td>
                    <td className="p-3.5 text-right">
                      <button
                        onClick={() => handleTerminateSession(s.id)}
                        disabled={terminatingSessionId === s.id}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-100 transition disabled:opacity-50"
                      >
                        {terminatingSessionId === s.id ? 'Revoking…' : 'Terminate'}
                      </button>
                    </td>
                  </tr>
                ))}
                {sessions.length === 0 && !loadingSessions && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      No active sessions found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 5: Security Architecture & Policies */}
      {activeTab === 'policies' && (
        <div className="grid gap-4 md:grid-cols-2">
          {POLICY_CARDS.map((card) => {
            const Icon = card.icon;
            const isClickable = Boolean(card.route) && !card.infoOnly;
            const content = (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700">
                      <Icon size={18} />
                    </span>
                    <div className="min-w-0">
                      <h2 className="font-semibold text-slate-900">{card.title}</h2>
                      <p className="mt-1 text-xs leading-5 text-slate-600">{card.detail}</p>
                    </div>
                  </div>
                  {isClickable && (
                    <FiChevronRight className="mt-1 shrink-0 text-slate-400" size={16} />
                  )}
                </div>
                {card.infoOnly && (
                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-500/10">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Enforced by backend architecture
                  </div>
                )}
              </>
            );

            if (!isClickable) {
              return (
                <div key={card.key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  {content}
                </div>
              );
            }

            return (
              <button
                key={card.key}
                type="button"
                onClick={() => navigate(card.route!)}
                className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
              >
                {content}
              </button>
            );
          })}
        </div>
      )}

      {/* Add IP Rule Modal */}
      {showAddRuleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FiPlus className="text-indigo-600" /> Create IP Access Rule
              </h3>
              <button
                onClick={() => setShowAddRuleModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateRule} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700">Rule Type</label>
                <div className="mt-1.5 grid grid-cols-2 gap-3">
                  <label
                    className={`flex cursor-pointer items-center justify-center rounded-xl border p-2.5 font-semibold transition ${
                      newRuleType === 'deny'
                        ? 'border-rose-500 bg-rose-50/50 text-rose-800 ring-2 ring-rose-500/20'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="ruleType"
                      value="deny"
                      checked={newRuleType === 'deny'}
                      onChange={() => setNewRuleType('deny')}
                      className="sr-only"
                    />
                    <span>Deny (Block IP)</span>
                  </label>
                  <label
                    className={`flex cursor-pointer items-center justify-center rounded-xl border p-2.5 font-semibold transition ${
                      newRuleType === 'allow'
                        ? 'border-emerald-500 bg-emerald-50/50 text-emerald-800 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="ruleType"
                      value="allow"
                      checked={newRuleType === 'allow'}
                      onChange={() => setNewRuleType('allow')}
                      className="sr-only"
                    />
                    <span>Allow (Allowlist)</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700">
                  IP Address or CIDR Subnet <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 203.0.113.195 or 192.168.1.0/24"
                  value={newIpAddress}
                  onChange={(e) => setNewIpAddress(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 font-mono text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Supports single IPv4/IPv6 addresses and CIDR notation.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700">Duration (Minutes)</label>
                <input
                  type="number"
                  min="1"
                  placeholder="Leave blank for permanent rule"
                  value={newRuleDuration}
                  onChange={(e) => setNewRuleDuration(e.target.value ? Number(e.target.value) : '')}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Examples: 60 = 1 hour, 1440 = 24 hours, empty = permanent.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700">Reason / Notes</label>
                <textarea
                  rows={2}
                  placeholder="Security audit justification…"
                  value={newRuleReason}
                  onChange={(e) => setNewRuleReason(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddRuleModal(false)}
                  className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingRule}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submittingRule ? 'Saving…' : 'Save Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default SecurityPage;