// src/store/auth.ts
import { create } from 'zustand';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface AuthRole { id: number; name: string; group?: string | null }
export interface AuthPermission { id: number; name: string; group?: string | null }

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  location?: string | null;
  timezone?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  two_factor_enabled?: boolean;

  roles: AuthRole[];
  permissions: AuthPermission[];

  role_names: string[];
  permission_names: string[];
  permission_ids: number[];

  created_at?: string;
  updated_at?: string;
}

interface AuthStore {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;

  /** True while an initial /me is in flight; prevents showing "Read-only" prematurely. */
  loadingUser: boolean;

  setToken: (token: string | null) => void;
  setUser: (user: AuthUser | null) => void;
  setAuth: (token: string, user: AuthUser) => void;
  setLoadingUser: (loading: boolean) => void;

  logout: () => void;

  hasPermission: (name: string) => boolean;
  hasAnyPermission: (names: string[]) => boolean;
  hasAllPermissions: (names: string[]) => boolean;
  hasRole: (name: string) => boolean;
  hasAnyRole: (names: string[]) => boolean;
  isSuperAdmin: () => boolean;
}

const TOKEN_KEY = 'token';
const USER_KEY = 'auth_user';

/* ------------------------------------------------------------------ */
/* RBAC — tolerant super-role detection                                */
/* ------------------------------------------------------------------ */

/**
 * These names match the backend User permission resolver exactly.
 */
const SUPER_ADMIN_ROLES = new Set(['Admin', 'Super Admin']);

function isSuperAdminRole(name: unknown): boolean {
  return typeof name === 'string' && SUPER_ADMIN_ROLES.has(name);
}

/**
 * Collapse a permission key so that different notations of the SAME
 * permission match each other. Mirrors the `normalisePermission()`
 * helper used by every RBAC-aware page.
 *
 *   "users.view"        → "users view"
 *   "view users"        → "users view"
 *   "users:view"        → "users view"
 *   "payroll:mark_paid" → "mark paid payroll"
 *   "mark payroll paid" → "mark paid payroll"
 */
function normalisePermission(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .toLowerCase()
    .replace(/[.:_/\-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

/**
 * A protected route must fail closed until the backend provides RBAC data.
 */
function hasRbacMetadata(user: AuthUser): boolean {
  return (
    user.permission_names.length > 0 ||
    user.permissions.length > 0 ||
    user.role_names.length > 0 ||
    user.roles.length > 0
  );
}

/* ------------------------------------------------------------------ */
/* Normalizer — the crucial bit                                        */
/* ------------------------------------------------------------------ */

function normalizeUser(raw: unknown): AuthUser | null {
  if (!raw || typeof raw !== 'object') return null;

  // Some backends wrap in { data: {...} }.
  const container = raw as { data?: unknown };
  const source = (
    container.data && typeof container.data === 'object'
      ? container.data
      : raw
  ) as Record<string, unknown>;

  const roles: AuthRole[] = Array.isArray(source.roles)
    ? (source.roles as Array<Record<string, unknown>>)
        .map((r) => ({
          id: Number(r.id),
          name: String(r.name ?? ''),
          group: (r.group as string | null | undefined) ?? null,
        }))
        .filter((r) => r.id && r.name)
    : [];

  const permissions: AuthPermission[] = Array.isArray(source.permissions)
    ? (source.permissions as Array<Record<string, unknown>>)
        .map((p) => ({
          id: Number(p.id),
          name: String(p.name ?? ''),
          group: (p.group as string | null | undefined) ?? null,
        }))
        .filter((p) => p.id && p.name)
    : [];

  // Prefer backend-provided flat arrays; fall back to deriving them.
  const role_names: string[] =
    Array.isArray(source.role_names) && (source.role_names as unknown[]).length
      ? (source.role_names as unknown[]).map((x) => String(x))
      : roles.map((r) => r.name);

  const permission_names: string[] =
    Array.isArray(source.permission_names) && (source.permission_names as unknown[]).length
      ? (source.permission_names as unknown[]).map((x) => String(x))
      : permissions.map((p) => p.name);

  const permission_ids: number[] =
    Array.isArray(source.permission_ids) && (source.permission_ids as unknown[]).length
      ? (source.permission_ids as unknown[]).map((x) => Number(x))
      : permissions.map((p) => p.id);

  return {
    id: Number(source.id),
    name: String(source.name ?? ''),
    email: String(source.email ?? ''),
    phone: (source.phone as string | null | undefined) ?? null,
    location: (source.location as string | null | undefined) ?? null,
    timezone: (source.timezone as string | null | undefined) ?? null,
    bio: (source.bio as string | null | undefined) ?? null,
    avatar_url: (source.avatar_url as string | null | undefined) ?? null,
    two_factor_enabled: Boolean(source.two_factor_enabled),

    roles,
    permissions,
    role_names,
    permission_names,
    permission_ids,

    created_at: source.created_at as string | undefined,
    updated_at: source.updated_at as string | undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Hydration                                                           */
/* ------------------------------------------------------------------ */

function readToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

function readCachedUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    return normalizeUser(JSON.parse(raw));
  } catch { return null; }
}

function persistUser(user: AuthUser | null): void {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch { /* quota */ }
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

export const useAuthStore = create<AuthStore>((set, get) => ({
  token: readToken(),
  user: readCachedUser(),
  isAuthenticated: !!readToken(),
  loadingUser: !!readToken(),

  setToken: (token) => {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch { /* ignore */ }
    set({ token, isAuthenticated: !!token });
  },

  setUser: (user) => {
    const normalized = user ? normalizeUser(user) : null;
    persistUser(normalized);
    set({ user: normalized });
  },

  setAuth: (token, user) => {
    const normalized = normalizeUser(user);
    try { localStorage.setItem(TOKEN_KEY, token); } catch { /* ignore */ }
    persistUser(normalized);
    set({ token, user: normalized, isAuthenticated: true, loadingUser: true });
  },

  setLoadingUser: (loading) => set({ loadingUser: loading }),

  logout: () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch { /* ignore */ }
    set({ token: null, user: null, isAuthenticated: false, loadingUser: false });
  },

  /* --------- RBAC --------- */

  hasPermission: (name) => {
    const { user } = get();
    if (!user) return false;

    // Super-admin role names bypass every check.
    if (user.role_names.some(isSuperAdminRole)) return true;

    if (!hasRbacMetadata(user)) return false;

    // Exact match first (fast path).
    if (user.permission_names.includes(name)) return true;

    // Normalised fallback so "users.view" matches "view users" etc.
    const needle = normalisePermission(name);
    return user.permission_names.some((p) => normalisePermission(p) === needle);
  },

  hasAnyPermission: (names) => {
    const { user } = get();
    if (!user) return false;

    if (user.role_names.some(isSuperAdminRole)) return true;
    if (!hasRbacMetadata(user)) return false;

    const exact = new Set(user.permission_names);
    const normalised = new Set(user.permission_names.map(normalisePermission));

    return names.some(
      (n) => exact.has(n) || normalised.has(normalisePermission(n)),
    );
  },

  hasAllPermissions: (names) => {
    const { user } = get();
    if (!user) return false;

    if (user.role_names.some(isSuperAdminRole)) return true;
    if (!hasRbacMetadata(user)) return false;

    const exact = new Set(user.permission_names);
    const normalised = new Set(user.permission_names.map(normalisePermission));

    return names.every(
      (n) => exact.has(n) || normalised.has(normalisePermission(n)),
    );
  },

  hasRole: (name) => {
    const { user } = get();
    if (!user) return false;
    const needle = name.trim().toLowerCase();
    return user.role_names.some((r) => r.trim().toLowerCase() === needle);
  },

  hasAnyRole: (names) => {
    const { user } = get();
    if (!user) return false;
    const needles = new Set(names.map((n) => n.trim().toLowerCase()));
    return user.role_names.some((r) => needles.has(r.trim().toLowerCase()));
  },

  isSuperAdmin: () => {
    const { user } = get();
    if (!user) return false;
    return user.role_names.some(isSuperAdminRole);
  },
}));