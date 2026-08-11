import { useCallback, useEffect, useMemo, useState } from 'react';
import { FiDatabase, FiCloud, FiRefreshCw, FiShield } from 'react-icons/fi';
import { useNotification } from '../components/NotificationContext';
import { apiClient } from '../api';
import { ModernDataTable } from '../components/ModernDataTable';

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

export function BackupRestorePage() {
  const { showSuccess, showError } = useNotification();
  const [summary, setSummary] = useState<BackupSummary | null>(null);
  const [history, setHistory] = useState<BackupEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);

  const loadBackupSummary = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.request('GET', '/backups');
      const data = response?.data || response;
      setSummary(data);
      setHistory(data.history || []);
      showSuccess('Backup status loaded', 'Backup page is up to date.');
    } catch (error: any) {
      showError('Unable to load backup status', error?.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, [showError, showSuccess]);

  useEffect(() => {
    loadBackupSummary();
  }, [loadBackupSummary]);

  const createBackup = async () => {
    setCreating(true);
    try {
      const response = await apiClient.request('POST', '/backups', { type: 'manual' });
      showSuccess('Backup created', response.message || 'Backup creation started.');
      await loadBackupSummary();
    } catch (error: any) {
      showError('Backup creation failed', error?.message || 'Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const restoreBackup = async (backupId: number) => {
    setRestoringId(backupId);
    try {
      const response = await apiClient.request('POST', '/backups/restore', { backup_id: backupId });
      showSuccess('Backup restored', response.message || 'Restore completed successfully.');
      await loadBackupSummary();
    } catch (error: any) {
      showError('Restore failed', error?.message || 'Please try again.');
    } finally {
      setRestoringId(null);
    }
  };

  const columns = useMemo(() => [
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
          <a href={`/api/backups/${row.id}/download`} className="btn btn-sm btn-outline" target="_blank" rel="noreferrer">Download</a>
          <button
            className="btn btn-sm btn-secondary"
            onClick={() => restoreBackup(row.id)}
            disabled={restoringId === row.id}
          >
            {restoringId === row.id ? 'Restoring...' : 'Restore'}
          </button>
        </div>
      ),
    },
  ], [restoringId]);

  return (
    <div className="space-y-8">
      <section className="page-header">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="page-title">Backup & Restore</h1>
            <p className="page-description">Create, download, and restore backups of your ERP database and uploaded files.</p>
            <p className="mt-3 text-sm text-slate-500">Backups are stored securely on the application server and are created from the active database connection.</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={loadBackupSummary} className="btn btn-secondary inline-flex items-center gap-2" disabled={loading}><FiRefreshCw /> Refresh</button>
            <button onClick={createBackup} className="btn btn-primary inline-flex items-center gap-2" disabled={creating}><FiCloud /> {creating ? 'Creating...' : 'Create Backup'}</button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3 text-slate-500">
            <FiShield size={20} />
            <span className="font-semibold uppercase tracking-[0.2em] text-xs">Backup Health</span>
          </div>
          <div className="mt-6 space-y-4">
            <div className="rounded-3xl bg-slate-50 p-4">
              <div className="text-sm text-slate-500">System status</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{summary?.status || 'Unknown'}</div>
              <div className="text-sm text-slate-500">Database: {summary?.databaseStatus || 'Unknown'}</div>
              <div className="text-sm text-slate-500">Files: {summary?.fileStatus || 'Unknown'}</div>
            </div>
            <div className="rounded-3xl bg-slate-50 p-4">
              <div className="text-sm text-slate-500">Last successful</div>
              <div className="mt-2 text-lg font-semibold text-slate-900">{summary?.lastSuccessful || 'Never'}</div>
            </div>
            <div className="rounded-3xl bg-slate-50 p-4">
              <div className="text-sm text-slate-500">Backup destination</div>
              <div className="mt-2 text-lg font-semibold text-slate-900 break-words">{summary?.destination || 'Unknown'}</div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm text-slate-500">Latest backup</div>
              <div className="mt-2 text-3xl font-semibold text-slate-900">{summary?.size || '0 B'}</div>
            </div>
            <div className="text-right text-sm text-slate-500">
              <div>Schedule: {summary?.schedule || 'Manual only'}</div>
              <div>Retention: {summary?.retention || '30 days'}</div>
              <div>Verification: {summary?.verification || 'On-demand only'}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Backup history</h2>
            <p className="text-sm text-slate-500">Review completed backup artifacts and restore selected archives.</p>
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
