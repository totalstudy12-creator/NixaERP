// src/pages/BackupRestorePage.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
} from 'react';
import {
  FiDatabase,
  FiCloud,
  FiRefreshCw,
  FiShield,
  FiSettings,
  FiList,
  FiPlus,
  FiAlertTriangle,
  FiLock,
  FiX,
  FiCheckCircle,
  FiClock,
  FiActivity,
  FiHardDrive,
  FiDownload,
} from 'react-icons/fi';

import { useNotification } from '../components/NotificationContext';
import { usePermission } from '../hooks/usePermission';
import { useAuthStore } from '../store/auth';
import {
  BackupRunItem,
  BackupSystemStatus,
  backupSystemService,
} from '../services/backupSystemService';
import { addAppLog } from '../services/appLogger';

import { GoogleDriveConnectCard } from './BackupCenter/GoogleDriveConnectCard';
import { BackupKPIOverview } from './BackupCenter/BackupKPIOverview';
import { BackupHistoryTable } from './BackupCenter/BackupHistoryTable';
import { RestoreConfirmationModal } from './BackupCenter/RestoreConfirmationModal';
import { BackupSettingsModal } from './BackupCenter/BackupSettingsModal';
import { BackupAuditModal } from './BackupCenter/BackupAuditModal';

/* ── Types ─────────────────────────────────────────────────────────── */

interface ApiErrorLike {
  message?: string;
  status?: number;
  response?: { status?: number };
}

interface AppLogEntry {
  module: string;
  action: string;
  status: 'success' | 'error' | 'info';
  message: string;
}

/* ── Constants ─────────────────────────────────────────────────────── */

const OAUTH_STATE_PATTERN = /^[A-Za-z0-9_-]{16,256}$/;
const OAUTH_CODE_PATTERN = /^[A-Za-z0-9._~/\-]{1,512}$/;
const MANUAL_BACKUP_TIMEOUT_MS = 5 * 60 * 1000; // 5 min
const AUTO_REFRESH_MS = 30_000; // 30s
const RUNS_PER_PAGE = 50;

/* ── Helpers ───────────────────────────────────────────────────────── */

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const m = (error as ApiErrorLike).message;
    if (typeof m === 'string' && m.trim()) return m;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function safeLog(entry: AppLogEntry): void {
  try {
    addAppLog(entry);
  } catch {
    /* logging must never throw */
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        window.clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(timer);
        reject(e);
      },
    );
  });
}

function safeNum(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/* ── Sub-components (presentational, memoized) ─────────────────────── */

const SkeletonBlock = memo(function SkeletonBlock({
  className = '',
}: {
  className?: string;
}) {
  return <div className={`animate-pulse rounded-xl bg-slate-100 ${className}`} />;
});

const LoadingShell = memo(function LoadingShell() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 text-sm font-medium text-slate-600 shadow-sm">
        Loading permissions…
      </div>
    </div>
  );
});

const AccessDenied = memo(function AccessDenied({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-600">
          <FiLock size={22} />
        </div>
        <h2 className="mt-4 text-lg font-bold text-slate-900">Access restricted</h2>
        <p className="mt-1.5 text-sm text-slate-500">{message}</p>
      </div>
    </div>
  );
});

const ErrorShell = memo(function ErrorShell({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-600">
          <FiAlertTriangle size={24} />
        </div>
        <h2 className="mt-4 text-lg font-bold text-slate-900">Something went wrong</h2>
        <p className="mt-1.5 text-sm text-slate-500">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <FiRefreshCw size={14} /> Try again
        </button>
      </div>
    </div>
  );
});

interface KPISkeletonProps {
  count?: number;
}
const KPISkeleton = memo(function KPISkeleton({ count = 4 }: KPISkeletonProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
        >
          <SkeletonBlock className="h-3 w-24" />
          <SkeletonBlock className="mt-3 h-6 w-16" />
        </div>
      ))}
    </div>
  );
});

/* ── Main Page ─────────────────────────────────────────────────────── */

export function BackupRestorePage() {
  const { showSuccess, showError } = useNotification();
  const { can, isSuperAdmin } = usePermission();
  const loadingUser = useAuthStore((s) => s.loadingUser);
  const hasUser = useAuthStore((s) => Boolean(s.user));

  /* ── RBAC ──────────────────────────────────────────────────────── */
  const canView =
    isSuperAdmin || can('system.backups.view') || can('view backups');
  const canCreate =
    isSuperAdmin || can('system.backups.create') || can('create backup');
  const canRestore =
    isSuperAdmin || can('system.backups.restore') || can('restore backup');
  const canDelete = isSuperAdmin || can('system.backups.delete');
  const canSettings =
    isSuperAdmin || can('system.backups.settings') || can('edit settings');

  /* ── State ─────────────────────────────────────────────────────── */
  const [status, setStatus] = useState<BackupSystemStatus | null>(null);
  const [runs, setRuns] = useState<BackupRunItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [downloadingDirect, setDownloadingDirect] = useState(false);
  const [manualProgress, setManualProgress] = useState<string>('');

  const [selectedRestoreRun, setSelectedRestoreRun] = useState<BackupRunItem | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const [isManualBackupModalOpen, setIsManualBackupModalOpen] = useState(false);
  const [manualIncludeFiles, setManualIncludeFiles] = useState(true);

  /* ── Refs / lifecycle ──────────────────────────────────────────── */
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  const oauthHandledRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      abortRef.current?.abort();
    };
  }, []);

  /* ── Loaders ───────────────────────────────────────────────────── */

  const loadData = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!canView) return;
      const reqId = ++requestIdRef.current;
      if (!opts?.silent) setLoading(true);
      try {
        const [statusRes, runsRes] = await Promise.all([
          backupSystemService.getStatus(),
          backupSystemService.listRuns({ per_page: RUNS_PER_PAGE }),
        ]);
        if (!mountedRef.current || reqId !== requestIdRef.current) return;
        setStatus(statusRes);
        setRuns(Array.isArray(runsRes?.data) ? runsRes.data : []);
        setBootError(null);
      } catch (err) {
        if (!mountedRef.current || reqId !== requestIdRef.current) return;
        const message = getErrorMessage(err, 'Failed to load backup data.');
        if (!status) setBootError(message);
        if (!opts?.silent) showError(message);
      } finally {
        if (mountedRef.current && reqId === requestIdRef.current) setLoading(false);
      }
    },
    [canView, showError, status],
  );

  /* Initial load — only after permissions are resolved */
  useEffect(() => {
    if (loadingUser) return;
    if (!hasUser) return;
    if (!canView) return;
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingUser, hasUser, canView]);

  /* Auto-refresh (paused when tab hidden or backups modal is busy) */
  useEffect(() => {
    if (!canView) return;
    if (creating) return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      void loadData({ silent: true });
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [canView, creating, loadData]);

  /* ── OAuth Callback handler (safe, one-shot) ───────────────────── */

  useEffect(() => {
    if (oauthHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');

    if (!code || !state) return;

    oauthHandledRef.current = true;

    // Always scrub the URL immediately so refresh never replays.
    try {
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch {
      /* noop */
    }

    // Validate against patterns before sending to the server.
    if (!OAUTH_CODE_PATTERN.test(code) || !OAUTH_STATE_PATTERN.test(state)) {
      showError('Authorization failed', 'Invalid OAuth response. Please try connecting again.');
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      try {
        const res = await withTimeout(
          backupSystemService.handleOAuthCallback(code, state),
          30_000,
          'Google Drive authorization timed out. Please try again.',
        );
        if (!mountedRef.current) return;
        showSuccess(res?.message || 'Google Drive connected successfully.');
        safeLog({
          module: 'Backups',
          action: 'Google Drive OAuth',
          status: 'success',
          message: 'Connection established',
        });
        await loadData();
      } catch (err) {
        if (!mountedRef.current) return;
        const msg = getErrorMessage(err, 'Failed to complete Google Drive authorization.');
        showError(msg);
        safeLog({
          module: 'Backups',
          action: 'Google Drive OAuth',
          status: 'error',
          message: msg,
        });
      } finally {
        abortRef.current = null;
      }
    })();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Manual backup ─────────────────────────────────────────────── */

  const handleTriggerManualBackup = useCallback(async () => {
    if (!canCreate || creating) return;

    if (!status?.has_active_connection) {
      showError('Google Drive not connected', 'Connect Google Drive before running off-site backups.');
      return;
    }

    setCreating(true);
    setManualProgress('Preparing encrypted snapshot…');
    setIsManualBackupModalOpen(false);

    try {
      const promise = backupSystemService.triggerRun({
        type: 'manual',
        include_files: manualIncludeFiles,
        async: false,
      });

      setManualProgress('Encrypting and uploading to Google Drive…');
      await withTimeout(
        promise,
        MANUAL_BACKUP_TIMEOUT_MS,
        'Manual backup exceeded the 5 minute timeout. It may still be running — refresh to check status.',
      );

      if (!mountedRef.current) return;
      showSuccess('Backup complete', 'Snapshot encrypted, uploaded, and verified on Google Drive.');
      safeLog({
        module: 'Backups',
        action: 'Manual backup',
        status: 'success',
        message: `include_files=${manualIncludeFiles}`,
      });
      setManualProgress('');
      await loadData({ silent: true });
    } catch (err) {
      if (!mountedRef.current) return;
      const msg = getErrorMessage(err, 'Manual backup execution failed.');
      showError('Backup failed', msg);
      safeLog({
        module: 'Backups',
        action: 'Manual backup',
        status: 'error',
        message: msg,
      });
      setManualProgress('');
    } finally {
      if (mountedRef.current) setCreating(false);
    }
  }, [canCreate, creating, status, manualIncludeFiles, showSuccess, showError, loadData]);

  const handleDirectDownload = useCallback(async () => {
    setDownloadingDirect(true);
    try {
      await backupSystemService.downloadDirectBackup();
      showSuccess('Database backup generated and downloaded successfully.');
      safeLog({
        module: 'Backups',
        action: 'Direct manual backup download',
        status: 'success',
        message: 'Direct SQL backup downloaded to user machine',
      });
    } catch (err: any) {
      showError(err.message || 'Failed to download direct database backup.');
    } finally {
      if (mountedRef.current) setDownloadingDirect(false);
    }
  }, [showSuccess, showError, safeLog]);

  /* ── Memoized derived state ────────────────────────────────────── */

  const isBusy = creating;
  const canRunManual = canCreate && !!status?.has_active_connection && !isBusy;

  const summaryForHeader = useMemo(() => {
    const total = runs.length;
    const ok = runs.filter((r) => r.status === 'completed').length;
    const fail = runs.filter((r) => r.status === 'failed').length;
    return { total, ok, fail };
  }, [runs]);

  /* ── Guards (loading / access) ─────────────────────────────────── */

  if (loadingUser) return <LoadingShell />;

  if (!hasUser) {
    return <AccessDenied message="Please sign in to view the Backup & Disaster Recovery Center." />;
  }

  if (!canView) {
    return (
      <AccessDenied message="You do not have permission to view the Backup & Disaster Recovery Center." />
    );
  }

  if (bootError && !status) {
    return <ErrorShell message={bootError} onRetry={() => void loadData()} />;
  }

  /* ── Render ────────────────────────────────────────────────────── */

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100/60">
      <div className="mx-auto w-full max-w-[1900px] space-y-5 p-3 sm:p-4 lg:space-y-6 lg:p-6">
        {/* ── HERO / HEADER ──────────────────────────────────────── */}
        <section
          className="relative overflow-hidden rounded-2xl border border-slate-800/10 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-5 py-6 shadow-[0_20px_40px_-20px_rgba(15,23,42,0.45)] sm:px-7 lg:px-8"
          aria-label="Backup center header"
        >
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />

          <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200 backdrop-blur">
                <FiShield size={12} /> Ops · Disaster Recovery
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-[32px]">
                Backup & Disaster Recovery Center
              </h1>
              <p className="mt-1.5 max-w-2xl text-sm text-slate-300">
                Automated off-site encryption, Google Drive integration, and verified recovery snapshots.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setIsAuditOpen(true)}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 text-xs font-semibold text-white shadow-none backdrop-blur transition hover:border-white/20 hover:bg-white/10"
              >
                <FiList size={14} className="text-cyan-300" /> Audit Ledger
              </button>

              <button
                type="button"
                onClick={() => void loadData()}
                disabled={loading}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 text-xs font-semibold text-white shadow-none backdrop-blur transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Refresh backup status"
              >
                <FiRefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                Refresh
              </button>

              {canSettings && (
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(true)}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 text-xs font-semibold text-white shadow-none backdrop-blur transition hover:border-white/20 hover:bg-white/10"
                >
                  <FiSettings size={14} className="text-indigo-300" /> Settings
                </button>
              )}

              <button
                type="button"
                onClick={handleDirectDownload}
                disabled={downloadingDirect}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 text-xs font-semibold text-emerald-200 shadow-none backdrop-blur transition hover:border-emerald-500/50 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                title="Generate and download fresh database SQL dump directly to your computer"
              >
                <FiDownload size={14} className={downloadingDirect ? 'animate-bounce text-emerald-400' : 'text-emerald-300'} />
                {downloadingDirect ? 'Downloading SQL…' : 'Download SQL Backup'}
              </button>

              {canCreate && (
                <button
                  type="button"
                  onClick={() => setIsManualBackupModalOpen(true)}
                  disabled={!canRunManual}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-b from-cyan-300 to-cyan-400 px-4 text-xs font-bold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:from-cyan-200 hover:to-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FiPlus size={14} />
                  {creating ? 'Executing…' : 'Create Backup Now'}
                </button>
              )}
            </div>
          </div>

          {/* Inline summary in hero */}
          <div className="relative mt-5 grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Total snapshots</p>
              <p className="mt-1 text-sm font-bold text-white">
                {loading && !status ? '…' : summaryForHeader.total}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Successful</p>
              <p className="mt-1 text-sm font-bold text-emerald-300">
                {loading && !status ? '…' : summaryForHeader.ok}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Failed</p>
              <p className="mt-1 text-sm font-bold text-rose-300">
                {loading && !status ? '…' : summaryForHeader.fail}
              </p>
            </div>
          </div>
        </section>

        {/* ── Progress banner while a manual backup is running ─── */}
        {creating && (
          <div
            className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm shadow-sm"
            role="status"
            aria-live="polite"
          >
            <div className="mt-0.5 shrink-0 text-amber-600">
              <FiClock size={18} className="animate-pulse" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-amber-900">Backup in progress</p>
              <p className="text-xs text-amber-800">{manualProgress || 'Working…'}</p>
            </div>
          </div>
        )}

        {/* ── Google Drive Connection Card ─────────────────────── */}
        <GoogleDriveConnectCard
          connection={status?.connection || null}
          quota={status?.drive_quota || null}
          onRefresh={() => void loadData()}
          canManageSettings={canSettings}
        />

        {/* ── KPIs ─────────────────────────────────────────────── */}
        {status ? (
          <BackupKPIOverview metrics={status.metrics} scheduler={status.scheduler} />
        ) : (
          <KPISkeleton />
        )}

        {/* ── History / management table ───────────────────────── */}
        <BackupHistoryTable
          runs={runs}
          loading={loading}
          onRefresh={() => void loadData()}
          onSelectRestore={(run) => setSelectedRestoreRun(run)}
          canCreate={canCreate}
          canRestore={canRestore}
          canDelete={canDelete}
        />

        {/* ── Modals ───────────────────────────────────────────── */}
        <RestoreConfirmationModal
          run={selectedRestoreRun}
          isOpen={Boolean(selectedRestoreRun)}
          onClose={() => setSelectedRestoreRun(null)}
          onSuccess={() => void loadData()}
        />

        <BackupSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          onSaved={() => void loadData()}
        />

        <BackupAuditModal isOpen={isAuditOpen} onClose={() => setIsAuditOpen(false)} />

        {/* ── Manual backup modal ──────────────────────────────── */}
        {isManualBackupModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manual-backup-title"
          >
            <div className="w-full max-w-md animate-in rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl fade-in zoom-in-95 duration-200 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-blue-50 p-3 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                  <FiDatabase className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <h3
                    id="manual-backup-title"
                    className="text-lg font-bold text-slate-900 dark:text-white"
                  >
                    Create On-Demand Backup
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Capture and upload a fresh encrypted snapshot
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsManualBackupModalOpen(false)}
                  className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                  aria-label="Close"
                >
                  <FiX size={16} />
                </button>
              </div>

              <div className="mt-5 space-y-3">
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
                  <input
                    type="checkbox"
                    checked
                    disabled
                    readOnly
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Database Tables &amp; Core Schemas (required)
                  </span>
                </label>

                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3.5 transition hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-800/40">
                  <input
                    type="checkbox"
                    checked={manualIncludeFiles}
                    onChange={(e) => setManualIncludeFiles(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Include uploaded business assets (images, invoices, PDFs)
                  </span>
                </label>

                <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50/60 p-3 text-[11px] text-blue-800">
                  <FiCloud className="mt-0.5 shrink-0" size={13} />
                  <span>
                    Snapshot will be encrypted, uploaded to Google Drive, then verified before completion.
                  </span>
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsManualBackupModalOpen(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleTriggerManualBackup()}
                  disabled={creating}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <FiActivity size={14} />
                  {creating ? 'Starting…' : 'Start Backup'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default BackupRestorePage;