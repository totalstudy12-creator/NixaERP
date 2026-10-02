// src/pages/BackupRestorePage.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FiDatabase, FiCloud, FiRefreshCw, FiShield, FiLock, FiDownload } from 'react-icons/fi';
import { useNotification } from '../components/NotificationContext';
import { apiClient, API_BASE } from '../api';
import { usePermission } from '../hooks/usePermission';
import { useAuthStore } from '../store/auth';
import { ModernDataTable } from '../components/ModernDataTable';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface BackupEntry {
  id: number;
  date: string;
  type: string;
  size: string;
  status: string;
  duration: string;
  location: string;
}

interface BackupSummary {
  status: string;
  databaseStatus: string;
  fileStatus: string;
  lastSuccessful: string;
  lastFailed: string;
  size: string;
  destination: string;
  schedule: string;
  retention: string;
  verification: string;
  history: BackupEntry[];
}

interface ApiErrorLike {
  message?: string;
  status?: number;
  response?: { status?: number; data?: { message?: string } };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null) {
    const e = error as ApiErrorLike;
    const candidate = e.response?.data?.message || e.message;
    if (typeof candidate === 'string' && candidate.trim()) return candidate;

    const status = e.response?.status ?? e.status;
    if (status === 401) return 'Your session has expired. Please sign in again.';
    if (status === 403) return 'You do not have permission to perform this action.';
    if (status === 404) return 'The requested resource was not found.';
    if (status === 429) return 'Too many requests. Please wait a moment and try again.';
    if (status && status >= 500) return 'The server is temporarily unavailable. Please try again shortly.';
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function BackupRestorePage() {
  const { showSuccess, showError } = useNotification();
  const { can, isSuperAdmin } = usePermission();
  const loadingUser = useAuthStore((s) => s.loadingUser);
  const hasUser = useAuthStore((s) => Boolean(s.user));

  /* ---- Capability flags ---- */
  const canViewBackups    = isSuperAdmin || can('view backups');
  const canCreateBackup   = isSuperAdmin || can('create backup');
  const canRestoreBackup  = isSuperAdmin || can('restore backup');
  const canDownloadBackup = isSuperAdmin || can('download backup');

  const [summary, setSummary] = useState<BackupSummary | null>(null);
  const [history, setHistory] = useState<BackupEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);

  /* ---------------- Load ---------------- */

  const loadBackupSummary = useCallback(async () => {
    if (!canViewBackups) {
      setSummary(null);
      setHistory([]);
      return;
    }
    setLoading(true);
    try {
      const response = await apiClient.request('GET', '/backups');
      const data = (response as { data?: BackupSummary })?.data ?? (response as BackupSummary);
      setSummary(data ?? null);
      setHistory(data?.history ?? []);
    } catch (error: unknown) {
      showError('Unable to load backup status', getErrorMessage(error, 'Please try again.'));
    } finally {
      setLoading(false);
    }
  }, [canViewBackups, showError]);

  useEffect(() => {
    if (loadingUser && !hasUser) return;
    void loadBackupSummary();
  }, [loadBackupSummary, loadingUser, hasUser]);

  /* ---------------- Create ---------------- */

  const createBackup = async () => {
    if (!canCreateBackup) {
      showError('Permission denied', 'You do not have permission to create backups.');
      return;
    }
    if (creating) return;
    setCreating(true);
    try {
      const response = await apiClient.request('POST', '/backups', { type: 'manual' });
      const message =
        (response as { message?: string })?.message ?? 'Backup creation started.';
      showSuccess('Backup created', message);
      await loadBackupSummary();
    } catch (error: unknown) {
      showError('Backup creation failed', getErrorMessage(error, 'Please try again.'));
    } finally {
      setCreating(false);
    }
  };

  /* ---------------- Restore ---------------- */

  const restoreBackup = async (backupId: number) => {
    if (!canRestoreBackup) {
      showError('Permission denied', 'You do not have permission to restore backups.');
      return;
    }
    if (!window.confirm('Restore this backup? Current data will be overwritten.')) return;
    if (restoringId !== null) return;

    setRestoringId(backupId);
    try {
      const response = await apiClient.request('POST', '/backups/restore', { backup_id: backupId });
      const message =
        (response as { message?: string })?.message ?? 'Restore completed successfully.';
      showSuccess('Backup restored', message);
      await loadBackupSummary();
    } catch (error: unknown) {
      showError('Restore failed', getErrorMessage(error, 'Please try again.'));
    } finally {
      setRestoringId(null);
    }
  };

  /* ---------------- Download ---------------- */

  const handleDownload = useCallback(
    (backupId: number) => {
      if (!canDownloadBackup) {
        showError('Permission denied', 'You do not have permission to download backups.');
        return;
      }
      // Uses the apiClient's API_BASE so this works in dev (/api) and prod alike.
      const url = `${API_BASE}/backups/${backupId}/download`;
      const token = useAuthStore.getState().token;

      // Fetch with the bearer token so the file download respects auth.
      fetch(url, {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then(async (res) => {
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error((body as { message?: string })?.message || res.statusText);
          }
          return res.blob();
        })
        .then((blob) => {
          const objectUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = objectUrl;
          a.download = `backup-${backupId}.zip`;
          a.click();
          URL.revokeObjectURL(objectUrl);
        })
        .catch((err: unknown) => {
          showError('Download failed', getErrorMessage(err, 'Please try again.'));
        });
    },
    [canDownloadBackup, showError],
  );

  /* ---------------- Columns ---------------- */

  const columns = useMemo(
    () => [
      { name: 'Date', selector: (row: BackupEntry) => row.date, sortable: true },
      { name: 'Type', selector: (row: BackupEntry) => row.type, sortable: true },
      { name: 'Size', selector: (row: BackupEntry) => row.size, sortable: true },
      { name: 'Status', selector: (row: BackupEntry) => row.status, sortable: true },
      { name: 'Duration', selector: (row: BackupEntry) => row.duration, sortable: true },
      { name: 'Location', selector: (row: BackupEntry) => row.location, sortable: false },
      {
        name: 'Actions',
        cell: (row: BackupEntry) => (
          <div className="flex flex-wrap gap-2">
            {canDownloadBackup && (
              <button
                type="button"
                onClick={() => handleDownload(row.id)}
                className="btn btn-sm btn-outline inline-flex items-center gap-1.5"
              >
                <FiDownload size={12} /> Download
              </button>
            )}
            {canRestoreBackup && (
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => restoreBackup(row.id)}
                disabled={restoringId === row.id}
              >
                {restoringId === row.id ? 'Restoring...' : 'Restore'}
              </button>
            )}
            {!canDownloadBackup && !canRestoreBackup && (
              <span className="text-[11px] text-slate-400">Read-only</span>
            )}
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [restoringId, canDownloadBackup, canRestoreBackup, handleDownload],
  );

  /* ---------------- Loading guard ---------------- */

  if (loadingUser && !hasUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="rounded-2xl bg-white px-6 py-5 text-sm text-slate-600 shadow-sm">
          Loading permissions…
        </div>
      </div>
    );
  }

  /* ---------------- No access ---------------- */

  if (!canViewBackups) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-600">
            <FiLock size={22} />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">Access denied</h2>
          <p className="mt-1.5 text-sm text-slate-500">
            You don't have permission to view backup & restore.
          </p>
        </div>
      </div>
    );
  }

  /* ---------------- Render ---------------- */

  return (
    <div className="space-y-8">
      {/* Header */}
      <section className="page-header">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="page-title">Backup &amp; Restore</h1>
            <p className="page-description">
              Create, download, and restore backups of your ERP database and uploaded files.
            </p>
            <p className="mt-3 text-sm text-slate-500">
              Backups are stored securely on the application server and are created from the active database connection.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {!canCreateBackup && !canRestoreBackup && (
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
                Read-only
              </span>
            )}
            <button
              onClick={loadBackupSummary}
              className="btn btn-secondary inline-flex items-center gap-2"
              disabled={loading}
            >
              <FiRefreshCw className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
            {canCreateBackup && (
              <button
                onClick={createBackup}
                className="btn btn-primary inline-flex items-center gap-2"
                disabled={creating}
              >
                <FiCloud /> {creating ? 'Creating...' : 'Create Backup'}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Health + Latest */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3 text-slate-500">
            <FiShield size={20} />
            <span className="font-semibold uppercase tracking-[0.2em] text-xs">Backup Health</span>
          </div>
          <div className="mt-6 space-y-4">
            <div className="rounded-3xl bg-slate-50 p-4">
              <div className="text-sm text-slate-500">System status</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">
                {summary?.status || 'Unknown'}
              </div>
              <div className="text-sm text-slate-500">Database: {summary?.databaseStatus || 'Unknown'}</div>
              <div className="text-sm text-slate-500">Files: {summary?.fileStatus || 'Unknown'}</div>
            </div>
            <div className="rounded-3xl bg-slate-50 p-4">
              <div className="text-sm text-slate-500">Last successful</div>
              <div className="mt-2 text-lg font-semibold text-slate-900">
                {summary?.lastSuccessful || 'Never'}
              </div>
            </div>
            <div className="rounded-3xl bg-slate-50 p-4">
              <div className="text-sm text-slate-500">Backup destination</div>
              <div className="mt-2 text-lg font-semibold text-slate-900 break-words">
                {summary?.destination || 'Unknown'}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm text-slate-500">Latest backup</div>
              <div className="mt-2 text-3xl font-semibold text-slate-900">
                {summary?.size || '0 B'}
              </div>
            </div>
            <div className="text-right text-sm text-slate-500">
              <div>Schedule: {summary?.schedule || 'Manual only'}</div>
              <div>Retention: {summary?.retention || '30 days'}</div>
              <div>Verification: {summary?.verification || 'On-demand only'}</div>
            </div>
          </div>
        </div>
      </section>

      {/* History */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Backup history</h2>
            <p className="text-sm text-slate-500">
              Review completed backup artifacts
              {canRestoreBackup ? ' and restore selected archives' : ''}.
            </p>
          </div>
        </div>
        <ModernDataTable
          title="Backup history"
          columns={columns}
          data={history}
          loading={loading}
          selectable={false}
        />
      </section>
    </div>
  );
}

export default BackupRestorePage;