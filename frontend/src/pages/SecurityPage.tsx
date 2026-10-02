// src/pages/SecurityPage.tsx
import { useCallback, useMemo } from 'react';
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
} from 'react-icons/fi';
import { useAuthStore } from '../store/auth';

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

type PermissionKey = typeof PERMISSIONS[keyof typeof PERMISSIONS];

/* ------------------------------------------------------------------ */
/* RBAC — Store-backed permissions (admin-aware + notation-insensitive) */
/* ------------------------------------------------------------------ */

/**
 * Collapse a permission key so different notations of the SAME permission
 * match each other:
 *
 *   "security.roles.view"      → "roles security view"
 *   "view security roles"      → "roles security view"
 *   "security:roles:view"      → "roles security view"
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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-rose-500">
          <FiLock size={26} />
        </div>
        <h1 className="mt-4 text-lg font-bold text-slate-900">Access restricted</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Your account does not have permission to view the Security & Controls
          module. Contact your administrator to request the{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px]">
            security.view
          </code>{' '}
          permission.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Navigation cards                                                    */
/* ------------------------------------------------------------------ */

interface SecurityCard {
  key: string;
  title: string;
  detail: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  route?: string;
  permission?: PermissionKey;
  /** Cards without a route explain an enforced policy; they are informational. */
  infoOnly?: boolean;
}

const CARDS: SecurityCard[] = [
  {
    key: 'roles',
    title: 'Role-Based Access Control',
    detail:
      'Define roles, assign granular permissions, and control access by module, company and branch. Every ERP action is gated by real permissions.',
    icon: FiShield,
    route: '/user-role-management',
    permission: PERMISSIONS.SECURITY_ROLES_VIEW,
  },
  {
    key: 'users',
    title: 'User Management',
    detail:
      'Create ERP users, assign them to roles, and monitor their login activity and account status.',
    icon: FiUsers,
    route: '/user-role-management',
    permission: PERMISSIONS.SECURITY_USERS_VIEW,
  },
  {
    key: '2fa',
    title: 'Two-Factor Authentication',
    detail:
      'Enable TOTP-based two-factor authentication and manage single-use recovery codes for your account.',
    icon: FiKey,
    route: '/settings?tab=security',
    permission: PERMISSIONS.SECURITY_2FA_VIEW,
  },
  {
    key: 'activity-log',
    title: 'Activity Logs',
    detail:
      'Every ERP action is recorded with the acting user, timestamp, module and outcome for a complete audit trail.',
    icon: FiActivity,
    route: '/settings?tab=api',
    permission: PERMISSIONS.SECURITY_LOGS_VIEW,
  },
  {
    key: 'sessions',
    title: 'Active Sessions',
    detail:
      'Monitor and revoke active login sessions, API tokens and MCP credentials from a single place.',
    icon: FiServer,
    route: '/settings?tab=api',
    permission: PERMISSIONS.SECURITY_SESSIONS_VIEW,
  },
  {
    key: 'approvals',
    title: 'Approval Workflow',
    detail:
      'Sensitive actions like payroll runs, backup triggers, and MCP token creation require elevated permissions. Each approval is logged.',
    icon: FiFileText,
    permission: PERMISSIONS.SECURITY_APPROVALS_VIEW,
    infoOnly: true,
  },
  {
    key: 'branch-access',
    title: 'Branch-Level Access',
    detail:
      'Users are scoped to companies and branches. Data outside their scope is filtered at the API level, not just hidden in the UI.',
    icon: FiMapPin,
    infoOnly: true,
  },
  {
    key: 'dept-access',
    title: 'Department-Level Access',
    detail:
      'HR and Payroll data is protected by dedicated permissions such as "view employee compensation" and "view sensitive employee data".',
    icon: FiBriefcase,
    infoOnly: true,
  },
  {
    key: 'encryption',
    title: 'Encryption of Sensitive Data',
    detail:
      'TOTP secrets, MCP tokens, and API credentials are hashed or encrypted at rest with your application key.',
    icon: FiLayers,
    infoOnly: true,
  },
];

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function SecurityPage() {
  const navigate = useNavigate();
  const { can, isAuthenticated, loadingUser } = usePagePermissions();

  const canView = can(PERMISSIONS.SECURITY_VIEW);

  // Filter cards by permission so the page only shows what the user can act on.
  const visibleCards = useMemo(
    () => CARDS.filter((card) => !card.permission || can(card.permission)),
    [can],
  );

  /* --------------------------------------------------------------- */
  /* RBAC page gate                                                  */
  /* --------------------------------------------------------------- */

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
    return <AccessRestricted />;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
          <FiShield className="text-slate-500" size={14} />
          System Protection
        </div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Security &amp; Controls
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Review and manage every security control in the ERP — role-based access,
          two-factor authentication, sessions, and audit logs. All controls are
          enforced by the backend; only features you have access to are shown
          below.
        </p>
      </div>

      {visibleCards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center shadow-sm">
          <FiLock className="mx-auto mb-3 text-slate-300" size={40} />
          <p className="text-sm font-semibold text-slate-700">
            No security sections available
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Your account does not have access to any of the security controls.
            Contact your administrator to request access.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visibleCards.map((card) => {
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
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        {card.detail}
                      </p>
                    </div>
                  </div>
                  {isClickable && (
                    <FiChevronRight
                      className="mt-1 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-700"
                      size={16}
                    />
                  )}
                </div>
                {card.infoOnly && (
                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-500/10">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Enforced by backend
                  </div>
                )}
              </>
            );

            if (!isClickable) {
              return (
                <div
                  key={card.key}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  {content}
                </div>
              );
            }

            return (
              <button
                key={card.key}
                type="button"
                onClick={() => navigate(card.route!)}
                className="group rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default SecurityPage;