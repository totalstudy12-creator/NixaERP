import { toIST } from '../utils/date';
export type AppLogEntry = {
  id: string;
  timestamp: string;
  module: string;
  action: string;
  status: 'success' | 'error' | 'info';
  message: string;
};

const STORAGE_KEY = 'business_os_audit_logs';

export function getAppLogs(): AppLogEntry[] {
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

export function addAppLog(entry: Omit<AppLogEntry, 'id' | 'timestamp'>) {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const newEntry: AppLogEntry = {
    id,
    timestamp: toIST(new Date()).toISOString(),
    ...entry,
  };
  const logs = [newEntry, ...getAppLogs()].slice(0, 200);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
  window.dispatchEvent(new CustomEvent('app-log-updated'));
  return logs;
}
