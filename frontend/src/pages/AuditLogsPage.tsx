// src/pages/AuditLogsPage.tsx
import {
  useEffect,
  useState,
  useCallback,
  useMemo,
  memo,
} from 'react';
import {
  FiTrash2,
  FiRefreshCw,
  FiDownload,
  FiAlertCircle,
  FiSearch,
  FiFilter,
  FiCheckCircle,
  FiXCircle,
  FiFileText,
  FiUser,
  FiX,
  FiChevronDown,
  FiClock,
  FiHash,
  FiActivity,
  FiCopy,
  FiCheck,
  FiCalendar,
} from 'react-icons/fi';

import { useNotification } from '../components/NotificationContext';
import { getAppLogs } from '../services/appLogger';
import type { AppLogEntry } from '../services/appLogger';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/* ------------------------------------------------------------------ */
/* Extended log entry with optional user metadata                     */
/* ------------------------------------------------------------------ */

interface LogUser {
  id?: number;
  name?: string;
  email?: string;
}

interface ExtendedLogEntry extends Omit<AppLogEntry, 'id'> {
  // Possible user fields the backend might attach. All optional.
  user?: LogUser | null;
  user_name?: string;
  user_email?: string;
  user_id?: number;
  created_by?: string | number;
  ip_address?: string;
  user_agent?: string;
  metadata?: Record<string, unknown>;
  id?: string | number;
  [key: string]: unknown;
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const ROWS_PER_PAGE = 15;
const TABLE_COLUMN_COUNT = 7;

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'success', label: 'Success' },
  { value: 'error', label: 'Error' },
  { value: 'info', label: 'Info' },
] as const;

const DATE_RANGE_OPTIONS = [
  { value: 0, label: 'All time' },
  { value: 1, label: 'Last 24 hours' },
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
] as const;

const TABLE_HEAD_CLASS = 'text-[11px] font-semibold uppercase tracking-wide text-slate-500';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const m = (error as { message?: unknown }).message;
    if (typeof m === 'string' && m.trim()) return m;
  }
  return fallback;
}

function getUserName(entry: ExtendedLogEntry): string {
  if (entry.user?.name) return entry.user.name;
  if (typeof entry.user_name === 'string' && entry.user_name.trim()) return entry.user_name;
  if (typeof entry.created_by === 'string' && entry.created_by.trim()) return entry.created_by;
  if (typeof entry.created_by === 'number') return `User #${entry.created_by}`;
  if (entry.user?.id) return `User #${entry.user.id}`;
  return '—';
}

function getUserEmail(entry: ExtendedLogEntry): string | null {
  if (entry.user?.email) return entry.user.email;
  if (typeof entry.user_email === 'string' && entry.user_email.trim()) return entry.user_email;
  return null;
}

function getUserId(entry: ExtendedLogEntry): number | string | null {
  if (typeof entry.user?.id === 'number') return entry.user.id;
  if (typeof entry.user_id === 'number') return entry.user_id;
  if (typeof entry.created_by === 'number') return entry.created_by;
  return null;
}

function getUserInitials(name: string): string {
  if (!name || name === '—') return '?';
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

function formatDate(value?: string | number | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

function formatDateTime(value?: string | number | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(d);
}

function formatRelative(value?: string | number | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(value);
}

function escapeCsvField(value: unknown): string {
  const raw = String(value ?? '');
  const dangerous = /^[=+\-@\t\r]/.test(raw);
  const safe = dangerous ? `\t${raw}` : raw;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/* ------------------------------------------------------------------ */
/* Uniform table header                                                */
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
/* Status badge                                                        */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status?: string }) {
  const value = String(status ?? '').toLowerCase();
  const config: Record<string, { label: string; className: string; dot: string }> = {
    success: {
      label: 'Success',
      className: 'border-emerald-200/70 bg-emerald-50 text-emerald-700',
      dot: 'bg-emerald-500',
    },
    error: {
      label: 'Error',
      className: 'border-rose-200/70 bg-rose-50 text-rose-700',
      dot: 'bg-rose-500',
    },
    info: {
      label: 'Info',
      className: 'border-sky-200/70 bg-sky-50 text-sky-700',
      dot: 'bg-sky-500',
    },
  };
  const selected = config[value] ?? {
    label: status || 'Unknown',
    className: 'border-slate-200 bg-slate-50 text-slate-600',
    dot: 'bg-slate-400',
  };

  return (
    <Badge
      variant="outline"
      className={`gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${selected.className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${selected.dot}`} />
      {selected.label}
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/* Skeletons                                                           */
/* ------------------------------------------------------------------ */

const StatCardSkeleton = memo(() => (
  <div className="flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-4">
    <div className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-slate-200" />
    <div className="flex-1 space-y-2">
      <div className="h-3 w-20 animate-pulse rounded bg-slate-200" />
      <div className="h-6 w-16 animate-pulse rounded bg-slate-200" />
    </div>
  </div>
));
StatCardSkeleton.displayName = 'StatCardSkeleton';

/* ------------------------------------------------------------------ */
/* Stat card                                                           */
/* ------------------------------------------------------------------ */

type Accent = 'indigo' | 'emerald' | 'rose' | 'amber' | 'violet' | 'teal' | 'sky';

const StatCard = memo(
  ({
    icon: Icon,
    label,
    value,
    accent = 'indigo',
    hint,
  }: {
    icon: React.ElementType;
    label: string;
    value: string | number;
    accent?: Accent;
    hint?: string;
  }) => {
    const accents: Record<Accent, { bg: string; icon: string; ring: string }> = {
      indigo: { bg: 'bg-indigo-50', icon: 'text-indigo-600', ring: 'ring-indigo-500/10' },
      emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600', ring: 'ring-emerald-500/10' },
      rose: { bg: 'bg-rose-50', icon: 'text-rose-600', ring: 'ring-rose-500/10' },
      amber: { bg: 'bg-amber-50', icon: 'text-amber-600', ring: 'ring-amber-500/10' },
      violet: { bg: 'bg-violet-50', icon: 'text-violet-600', ring: 'ring-violet-500/10' },
      teal: { bg: 'bg-teal-50', icon: 'text-teal-600', ring: 'ring-teal-500/10' },
      sky: { bg: 'bg-sky-50', icon: 'text-sky-600', ring: 'ring-sky-500/10' },
    };
    const style = accents[accent];

    return (
      <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300/80 hover:shadow-[0_8px_24px_-12px_rgba(15,23,42,0.15)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              {label}
            </p>
            <p className="mt-2 truncate text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              {value}
            </p>
            {hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
          </div>
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${style.bg} ring-1 ${style.ring}`}>
            <Icon size={18} className={style.icon} />
          </div>
        </div>
      </div>
    );
  }
);
StatCard.displayName = 'StatCard';

/* ------------------------------------------------------------------ */
/* AuditLogsPage                                                       */
/* ------------------------------------------------------------------ */

export function AuditLogsPage() {
  const { showSuccess, showError } = useNotification();

  const [logs, setLogs] = useState<ExtendedLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterModule, setFilterModule] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterUser, setFilterUser] = useState<string>('all');
  const [filterDays, setFilterDays] = useState<number>(0);

  const [viewingLog, setViewingLog] = useState<ExtendedLogEntry | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);

  /* -------------------- Load logs -------------------- */

  const loadLogs = useCallback(() => {
    setLoading(true);
    setError(null);
    try {
      const data = getAppLogs() as ExtendedLogEntry[];
      setLogs(data);
      setLastUpdated(new Date());
    } catch (err: unknown) {
      const msg = getErrorMessage(err, 'Failed to load audit logs.');
      setError(msg);
      showError('Load failed', msg);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadLogs();
    const listener = () => loadLogs();
    window.addEventListener('app-log-updated', listener);
    return () => window.removeEventListener('app-log-updated', listener);
  }, [loadLogs]);

  /* -------------------- Derived: filter options -------------------- */

  const moduleOptions = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l) => {
      if (l.module) set.add(l.module);
    });
    return Array.from(set).sort();
  }, [logs]);

  const userOptions = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l) => {
      const name = getUserName(l);
      if (name && name !== '—') set.add(name);
    });
    return Array.from(set).sort();
  }, [logs]);

  /* -------------------- Filtering -------------------- */

  const filteredLogs = useMemo(() => {
    let filtered = [...logs];

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((log) => {
        const userName = getUserName(log).toLowerCase();
        const userEmail = (getUserEmail(log) || '').toLowerCase();
        return (
          log.module?.toLowerCase().includes(term) ||
          log.action?.toLowerCase().includes(term) ||
          log.message?.toLowerCase().includes(term) ||
          userName.includes(term) ||
          userEmail.includes(term)
        );
      });
    }

    if (filterModule !== 'all') {
      filtered = filtered.filter((log) => log.module === filterModule);
    }

    if (filterStatus !== 'all') {
      filtered = filtered.filter((log) => log.status === filterStatus);
    }

    if (filterUser !== 'all') {
      filtered = filtered.filter((log) => getUserName(log) === filterUser);
    }

    if (filterDays > 0) {
      const cutoff = Date.now() - filterDays * 24 * 60 * 60 * 1000;
      filtered = filtered.filter((log) => new Date(log.timestamp).getTime() >= cutoff);
    }

    // Newest first
    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return filtered;
  }, [logs, searchTerm, filterModule, filterStatus, filterUser, filterDays]);

  /* -------------------- Summary -------------------- */

  const summary = useMemo(() => {
    const total = logs.length;
    const success = logs.filter((l) => l.status === 'success').length;
    const errorCount = logs.filter((l) => l.status === 'error').length;
    const activeUsers = new Set(
      logs.map((l) => getUserName(l)).filter((n) => n && n !== '—'),
    ).size;
    const last24h = logs.filter(
      (l) => Date.now() - new Date(l.timestamp).getTime() < 24 * 60 * 60 * 1000,
    ).length;
    return { total, success, errorCount, activeUsers, last24h };
  }, [logs]);

  const activeFilterCount = [
    searchTerm,
    filterModule !== 'all' ? filterModule : undefined,
    filterStatus !== 'all' ? filterStatus : undefined,
    filterUser !== 'all' ? filterUser : undefined,
    filterDays > 0 ? filterDays : undefined,
  ].filter(Boolean).length;

  const clearFilters = useCallback(() => {
    setSearchTerm('');
    setFilterModule('all');
    setFilterStatus('all');
    setFilterUser('all');
    setFilterDays(0);
  }, []);

  /* -------------------- Pagination -------------------- */

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / ROWS_PER_PAGE));
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * ROWS_PER_PAGE;
    return filteredLogs.slice(start, start + ROWS_PER_PAGE);
  }, [filteredLogs, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterModule, filterStatus, filterUser, filterDays]);

  /* -------------------- Actions -------------------- */

  const handleClearLogs = () => {
    if (!window.confirm('Clear all audit logs? This cannot be undone.')) return;
    try {
      localStorage.removeItem('business_os_audit_logs');
      loadLogs();
      showSuccess('Logs cleared', 'Audit logs have been cleared.');
    } catch (err: unknown) {
      showError('Clear failed', getErrorMessage(err, 'Could not clear logs.'));
    }
  };

  const handleExport = () => {
    if (filteredLogs.length === 0) {
      showError('Export failed', 'No logs to export.');
      return;
    }
    const headers = ['Timestamp', 'User', 'Email', 'Module', 'Action', 'Status', 'Message'];
    const rows = filteredLogs.map((log) =>
      [
        escapeCsvField(new Date(log.timestamp).toISOString()),
        escapeCsvField(getUserName(log)),
        escapeCsvField(getUserEmail(log) || ''),
        escapeCsvField(log.module),
        escapeCsvField(log.action),
        escapeCsvField(log.status),
        escapeCsvField(log.message),
      ].join(','),
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showSuccess('Export', 'Audit logs exported.');
  };

  const handleCopy = useCallback(
    async (value: string, field: string) => {
      try {
        await navigator.clipboard.writeText(value);
        setCopiedField(field);
        window.setTimeout(() => setCopiedField(null), 1500);
      } catch {
        showError('Copy failed', 'Could not copy to clipboard.');
      }
    },
    [showError],
  );

  /* -------------------- Render -------------------- */

  return (
    <>
      <style>{`
        .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
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
                  <FiActivity size={12} />
                  Audit · Monitoring
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-[32px]">
                  Audit logs
                </h1>
                <p className="mt-1.5 max-w-2xl text-sm text-slate-300">
                  Track every system event, success, and failure with full user attribution.
                </p>
                {lastUpdated && (
                  <p className="mt-1.5 text-xs text-slate-400">
                    Last updated: {lastUpdated.toLocaleString()}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={handleExport}
                  disabled={loading || filteredLogs.length === 0}
                  className="h-10 rounded-xl border-white/10 bg-white/5 text-white shadow-none backdrop-blur transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                >
                  <FiDownload className="mr-2" size={14} />
                  Export
                </Button>
                <Button
                  variant="outline"
                  onClick={loadLogs}
                  disabled={loading}
                  className="h-10 rounded-xl border-white/10 bg-white/5 text-white shadow-none backdrop-blur transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                >
                  <FiRefreshCw className={`mr-2 ${loading ? 'animate-spin' : ''}`} size={14} />
                  Refresh
                </Button>
                <Button
                  onClick={handleClearLogs}
                  disabled={logs.length === 0}
                  className="h-10 rounded-xl bg-red-600 font-semibold text-white shadow-lg shadow-red-500/20 transition hover:bg-red-700 disabled:opacity-50"
                >
                  <FiTrash2 className="mr-2" size={14} />
                  Clear logs
                </Button>
              </div>
            </div>
          </section>

          {/* KPI */}
          <section className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-5">
            {loading && logs.length === 0 ? (
              Array.from({ length: 5 }).map((_, i) => <StatCardSkeleton key={i} />)
            ) : (
              <>
                <StatCard
                  icon={FiFileText}
                  label="Total logs"
                  value={summary.total.toLocaleString('en-IN')}
                  accent="indigo"
                />
                <StatCard
                  icon={FiCheckCircle}
                  label="Success"
                  value={summary.success.toLocaleString('en-IN')}
                  accent="emerald"
                />
                <StatCard
                  icon={FiXCircle}
                  label="Errors"
                  value={summary.errorCount.toLocaleString('en-IN')}
                  accent="rose"
                />
                <StatCard
                  icon={FiUser}
                  label="Active users"
                  value={summary.activeUsers.toLocaleString('en-IN')}
                  accent="violet"
                />
                <StatCard
                  icon={FiClock}
                  label="Last 24h"
                  value={summary.last24h.toLocaleString('en-IN')}
                  accent="amber"
                />
              </>
            )}
          </section>

          {/* Filters */}
          <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3.5 sm:px-5">
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-50 text-indigo-600 ring-1 ring-indigo-500/10">
                  <FiFilter size={14} />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-800">Filters</CardTitle>
                  <CardDescription className="text-[11px] text-slate-500">
                    {activeFilterCount > 0
                      ? `${activeFilterCount} active filter${activeFilterCount > 1 ? 's' : ''}`
                      : 'Refine logs by module, status, user or date'}
                  </CardDescription>
                </div>
              </div>
              {activeFilterCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-9 rounded-lg text-slate-500 hover:text-slate-800"
                >
                  <FiX className="mr-1.5" size={14} />
                  Reset
                </Button>
              )}
            </CardHeader>

            <CardContent className="bg-white p-4 sm:p-5">
              <div className="grid gap-3 lg:grid-cols-12">
                <div className="relative lg:col-span-4">
                  <FiSearch
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    size={16}
                  />
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-10 rounded-xl border-slate-200 pl-10 shadow-sm focus-visible:ring-4 focus-visible:ring-indigo-500/10"
                    placeholder="Search by module, action, message, user…"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>

                <div className="lg:col-span-2">
                  <div className="relative">
                    <select
                      aria-label="Module"
                      value={filterModule}
                      onChange={(e) => setFilterModule(e.target.value)}
                      className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                    >
                      <option value="all">All modules</option>
                      {moduleOptions.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <FiChevronDown
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                      size={14}
                    />
                  </div>
                </div>

                <div className="lg:col-span-2">
                  <div className="relative">
                    <select
                      aria-label="Status"
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                    >
                      {STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <FiChevronDown
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                      size={14}
                    />
                  </div>
                </div>

                <div className="lg:col-span-2">
                  <div className="relative">
                    <select
                      aria-label="User"
                      value={filterUser}
                      onChange={(e) => setFilterUser(e.target.value)}
                      disabled={userOptions.length === 0}
                      className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                    >
                      <option value="all">All users</option>
                      {userOptions.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                    <FiChevronDown
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                      size={14}
                    />
                  </div>
                </div>

                <div className="lg:col-span-2">
                  <div className="relative">
                    <FiCalendar
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                      size={14}
                    />
                    <select
                      aria-label="Date range"
                      value={filterDays}
                      onChange={(e) => setFilterDays(parseInt(e.target.value, 10))}
                      className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-9 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                    >
                      {DATE_RANGE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <FiChevronDown
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                      size={14}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-800 shadow-sm">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rose-100 text-rose-600">
                <FiAlertCircle size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Unable to load audit logs</p>
                <p className="mt-0.5 break-words text-rose-700/90">{error}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
                onClick={loadLogs}
              >
                Retry
              </Button>
            </div>
          )}

          {/* Table card */}
          <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <CardHeader className="flex flex-col gap-3 border-b border-slate-100 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600">
                  <FiFileText size={14} />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-800">
                    Audit trail
                  </CardTitle>
                  <CardDescription className="text-[11px] text-slate-500">
                    {loading
                      ? 'Loading logs…'
                      : `${filteredLogs.length.toLocaleString('en-IN')} record${
                          filteredLogs.length === 1 ? '' : 's'
                        } · Click a row to view full details`}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <div className="overflow-x-auto">
              <Table className="min-w-[1180px]">
                <TableHeader>
                  <TableRow className="border-slate-100 bg-slate-50/70 hover:bg-slate-50/70">
                    <TableHead>
                      <TableHeadLabel>Timestamp</TableHeadLabel>
                    </TableHead>
                    <TableHead>
                      <TableHeadLabel>User</TableHeadLabel>
                    </TableHead>
                    <TableHead>
                      <TableHeadLabel>Module</TableHeadLabel>
                    </TableHead>
                    <TableHead>
                      <TableHeadLabel>Action</TableHeadLabel>
                    </TableHead>
                    <TableHead>
                      <TableHeadLabel>Status</TableHeadLabel>
                    </TableHead>
                    <TableHead>
                      <TableHeadLabel>Message</TableHeadLabel>
                    </TableHead>
                    <TableHead className="w-16 text-right">
                      <TableHeadLabel align="right">Detail</TableHeadLabel>
                    </TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {loading && logs.length === 0 &&
                    Array.from({ length: 8 }).map((_, index) => (
                      <TableRow key={`skeleton-${index}`} className="border-slate-100">
                        {Array.from({ length: TABLE_COLUMN_COUNT }).map((__, cellIndex) => (
                          <TableCell key={cellIndex}>
                            <div className="h-4 animate-pulse rounded bg-slate-100" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}

                  {!loading &&
                    paginatedLogs.map((log, index) => {
                      const userName = getUserName(log);
                      const userEmail = getUserEmail(log);
                      const initials = getUserInitials(userName);

                      return (
                        <TableRow
                          key={log.id ?? `${log.timestamp}-${index}`}
                          className="cursor-pointer border-slate-100 transition-colors hover:bg-slate-50/70"
                          onClick={() => setViewingLog(log)}
                        >
                          <TableCell>
                            <div className="min-w-[140px]">
                              <p className="text-sm font-medium text-slate-800">
                                {formatDateTime(log.timestamp)}
                              </p>
                              <p className="mt-0.5 text-[11px] text-slate-400">
                                {formatRelative(log.timestamp)}
                              </p>
                            </div>
                          </TableCell>

                          <TableCell>
                            <div className="flex min-w-[180px] items-center gap-2.5">
                              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[11px] font-bold text-white">
                                {initials}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-slate-800">
                                  {userName}
                                </p>
                                {userEmail && (
                                  <p className="truncate text-[11px] text-slate-500">
                                    {userEmail}
                                  </p>
                                )}
                              </div>
                            </div>
                          </TableCell>

                          <TableCell>
                            <Badge
                              variant="outline"
                              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700"
                            >
                              {log.module || '—'}
                            </Badge>
                          </TableCell>

                          <TableCell>
                            <span className="text-sm font-medium text-slate-800">
                              {log.action || '—'}
                            </span>
                          </TableCell>

                          <TableCell>
                            <StatusBadge status={log.status} />
                          </TableCell>

                          <TableCell>
                            <p className="max-w-[320px] truncate text-sm text-slate-600">
                              {log.message || '—'}
                            </p>
                          </TableCell>

                          <TableCell className="text-right">
                            <span className="text-[11px] font-semibold text-indigo-600">
                              View
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}

                  {!loading && !paginatedLogs.length && (
                    <TableRow>
                      <TableCell colSpan={TABLE_COLUMN_COUNT} className="py-20 text-center">
                        <div className="mx-auto max-w-md px-4">
                          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-slate-200/70">
                            <FiFileText className="h-6 w-6 text-slate-400" />
                          </div>
                          <p className="mt-4 text-base font-semibold text-slate-800">
                            No audit logs found
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            Try adjusting the filters or check back later.
                          </p>
                          {activeFilterCount > 0 && (
                            <Button
                              className="mt-5 rounded-lg"
                              variant="outline"
                              onClick={clearFilters}
                            >
                              <FiFilter className="mr-2" size={14} />
                              Reset filters
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {!loading && totalPages > 1 && (
              <div className="flex flex-col gap-3 border-t border-slate-100 bg-white px-4 py-3.5 sm:px-5 md:flex-row md:items-center md:justify-between">
                <p className="text-xs text-slate-500 sm:text-[13px]">
                  Showing{' '}
                  <span className="font-semibold text-slate-700">
                    {(currentPage - 1) * ROWS_PER_PAGE + 1}
                  </span>
                  –
                  <span className="font-semibold text-slate-700">
                    {Math.min(currentPage * ROWS_PER_PAGE, filteredLogs.length)}
                  </span>{' '}
                  of{' '}
                  <span className="font-semibold text-slate-700">
                    {filteredLogs.length.toLocaleString('en-IN')}
                  </span>
                </p>
                <div className="flex items-center justify-between gap-1.5 sm:justify-end">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 rounded-lg"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(1)}
                    aria-label="First page"
                  >
                    «
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 rounded-lg"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    aria-label="Previous page"
                  >
                    ‹
                  </Button>
                  <div className="mx-1 min-w-[76px] rounded-lg bg-slate-100 px-3 py-1.5 text-center text-xs font-semibold text-slate-700">
                    {currentPage} / {totalPages}
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 rounded-lg"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    aria-label="Next page"
                  >
                    ›
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 rounded-lg"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(totalPages)}
                    aria-label="Last page"
                  >
                    »
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* ─────────────── Detail Sheet ─────────────── */}
      <Sheet
        open={!!viewingLog}
        onOpenChange={(open) => {
          if (!open) setViewingLog(null);
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-lg">
          {viewingLog && (
            <>
              {/* Header */}
              <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur">
                <SheetHeader className="space-y-0">
                  <SheetTitle className="flex items-center gap-2 pr-8">
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
                      <FiFileText size={13} />
                    </span>
                    <span className="text-base font-bold text-slate-900">Log entry detail</span>
                  </SheetTitle>
                </SheetHeader>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={viewingLog.status} />
                  {viewingLog.module && (
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                      {viewingLog.module}
                    </span>
                  )}
                  {viewingLog.id != null && (
                    <span className="font-mono text-[11px] text-slate-400">
                      #{String(viewingLog.id)}
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-4 px-5 py-4">
                {/* User card */}
                <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
                  <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Performed by
                  </p>
                  <div className="flex items-start gap-3">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-base font-bold text-white shadow-sm">
                      {getUserInitials(getUserName(viewingLog))}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-bold text-slate-900">
                        {getUserName(viewingLog)}
                      </p>
                      {getUserEmail(viewingLog) && (
                        <p className="truncate text-xs text-slate-500">
                          {getUserEmail(viewingLog)}
                        </p>
                      )}
                      {getUserId(viewingLog) != null && (
                        <p className="mt-0.5 font-mono text-[10px] text-slate-400">
                          User ID: {getUserId(viewingLog)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Timestamp card */}
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="border-b border-slate-100 px-3.5 py-2.5">
                    <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <FiClock size={12} /> When
                    </p>
                  </div>
                  <div className="divide-y divide-slate-100">
                    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                        Timestamp
                      </span>
                      <span className="text-xs font-semibold text-slate-800">
                        {formatDateTime(viewingLog.timestamp)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                        Relative
                      </span>
                      <span className="text-xs font-semibold text-slate-800">
                        {formatRelative(viewingLog.timestamp)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                        ISO
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(new Date(viewingLog.timestamp).toISOString(), 'iso')
                        }
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[10px] text-slate-600 transition hover:bg-slate-100"
                      >
                        {copiedField === 'iso' ? (
                          <>
                            <FiCheck size={11} className="text-emerald-600" /> Copied
                          </>
                        ) : (
                          <>
                            <FiCopy size={11} />
                            Copy
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Event card */}
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="border-b border-slate-100 px-3.5 py-2.5">
                    <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <FiActivity size={12} /> Event
                    </p>
                  </div>
                  <div className="divide-y divide-slate-100">
                    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                        Module
                      </span>
                      <span className="text-xs font-semibold text-slate-800">
                        {viewingLog.module || '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                        Action
                      </span>
                      <span className="text-xs font-semibold text-slate-800">
                        {viewingLog.action || '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                        Status
                      </span>
                      <StatusBadge status={viewingLog.status} />
                    </div>
                  </div>
                </div>

                {/* Message */}
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Message
                    </p>
                    <button
                      type="button"
                      onClick={() => handleCopy(viewingLog.message || '', 'message')}
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                    >
                      {copiedField === 'message' ? (
                        <>
                          <FiCheck size={11} className="text-emerald-600" /> Copied
                        </>
                      ) : (
                        <>
                          <FiCopy size={11} /> Copy
                        </>
                      )}
                    </button>
                  </div>
                  <div className="px-3.5 py-3 text-xs text-slate-700">
                    <p className="whitespace-pre-line break-words">
                      {viewingLog.message || '—'}
                    </p>
                  </div>
                </div>

                {/* Technical details — only when present */}
                {(viewingLog.ip_address ||
                  viewingLog.user_agent ||
                  viewingLog.metadata) && (
                  <>
                    <Separator />
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <div className="border-b border-slate-100 px-3.5 py-2.5">
                        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          <FiHash size={12} /> Technical details
                        </p>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {viewingLog.ip_address && (
                          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                              IP address
                            </span>
                            <span className="font-mono text-xs font-semibold text-slate-800">
                              {viewingLog.ip_address}
                            </span>
                          </div>
                        )}
                        {viewingLog.user_agent && (
                          <div className="flex flex-col gap-1 px-3.5 py-2.5">
                            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                              User agent
                            </span>
                            <span className="break-words text-[11px] text-slate-600">
                              {viewingLog.user_agent}
                            </span>
                          </div>
                        )}
                        {viewingLog.metadata && (
                          <div className="flex flex-col gap-1 px-3.5 py-2.5">
                            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                              Metadata
                            </span>
                            <pre className="max-h-48 overflow-auto rounded-lg bg-slate-50 p-2.5 font-mono text-[10px] text-slate-700">
                              {JSON.stringify(viewingLog.metadata, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* Actions */}
                <div className="pt-1">
                  <Button
                    variant="outline"
                    onClick={() => setViewingLog(null)}
                    className="h-10 w-full rounded-xl"
                  >
                    Close
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

export default AuditLogsPage;