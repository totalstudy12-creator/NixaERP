import { toIST } from '../utils/date';
import { useAuthStore } from '../store/auth';
import { apiClient } from '../api';

export type AppLogUser = {
  id?: number;
  name?: string;
  email?: string;
};

export type AppLogEntry = {
  id: string;
  timestamp: string;
  module: string;
  action: string;
  status: 'success' | 'error' | 'info' | 'warning';  // ✅ 'warning' added
  message: string;
  user?: AppLogUser | null;
  user_id?: number;
  user_name?: string;
  user_email?: string;
  ip_address?: string;
  user_agent?: string;
  server_persisted?: boolean;
};

const STORAGE_KEY = 'business_os_audit_logs';

function getLocalAppLogs(): AppLogEntry[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return [];
    }
    const parsed = JSON.parse(stored) as AppLogEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function storeLocalAppLogs(logs: AppLogEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(0, 200)));
  } catch {
    // Audit persistence must not interrupt the business action being logged.
  }
}

function notifyAuditLogUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('app-log-updated'));
  }
}

function isSystemAdmin(): boolean {
  const user = useAuthStore.getState().user;
  return user?.role_names.some((role) => role === 'Admin' || role === 'Super Admin') ?? false;
}

function isVisibleToCurrentUser(log: AppLogEntry): boolean {
  const user = useAuthStore.getState().user;
  if (!user) return false;
  if (isSystemAdmin()) return true;
  return log.user_id === user.id || log.user?.id === user.id;
}

export async function getAppLogs(): Promise<AppLogEntry[]> {
  try {
    const response = await apiClient.get<unknown>('/audit-logs?limit=1000');
    const remoteLogs = Array.isArray(response)
      ? response as AppLogEntry[]
      : Array.isArray((response as { data?: unknown } | null)?.data)
        ? (response as { data: AppLogEntry[] }).data
        : [];
    const offlineLogs = getLocalAppLogs()
      .filter((log) => !log.server_persisted && isVisibleToCurrentUser(log));
    const merged = new Map<string, AppLogEntry>();

    [...offlineLogs, ...remoteLogs].forEach((log) => merged.set(String(log.id), log));

    return Array.from(merged.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  } catch (error) {
    const status = (error as { status?: number } | null)?.status;
    if (status === 401 || status === 403) throw error;

    const localLogs = getLocalAppLogs().filter(isVisibleToCurrentUser);
    if (localLogs.length > 0) return localLogs;
    throw new Error('Unable to load shared audit logs. Please try again.');
  }
}

export async function clearAppLogs(): Promise<void> {
  await apiClient.delete('/audit-logs');
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // The server clear succeeded; ignore a browser storage cleanup failure.
  }
  notifyAuditLogUpdated();
}

/**
 * Adds an application log entry.
 * Returns a Promise resolving to the updated log list (so callers can use .catch).
 */
export async function addAppLog(
  entry: Omit<AppLogEntry, 'id' | 'timestamp'>
): Promise<AppLogEntry[]> {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const actor = useAuthStore.getState().user;

  const newEntry: AppLogEntry = {
    id,
    timestamp: toIST(new Date()).toISOString(),
    ...entry,
    user: entry.user ?? (actor ? {
      id: actor.id,
      name: actor.name,
      email: actor.email,
    } : undefined),
    user_id: entry.user_id ?? actor?.id,
    user_name: entry.user_name ?? actor?.name,
    user_email: entry.user_email ?? actor?.email,
  };

  storeLocalAppLogs([newEntry, ...getLocalAppLogs()]);
  notifyAuditLogUpdated();

  try {
    const saved = await apiClient.post<AppLogEntry>('/audit-logs', {
      module: newEntry.module,
      action: newEntry.action,
      status: newEntry.status,
      message: newEntry.message,
    });
    const persistedEntry = { ...saved, server_persisted: true };
    const logs = [
      persistedEntry,
      ...getLocalAppLogs().filter((log) => log.id !== id && !log.server_persisted),
    ].slice(0, 200);
    storeLocalAppLogs(logs);
    notifyAuditLogUpdated();
    return logs;
  } catch {
    return getLocalAppLogs();
  }

}