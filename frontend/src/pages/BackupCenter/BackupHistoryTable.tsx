// src/pages/BackupCenter/BackupHistoryTable.tsx
import React, { useState } from 'react';
import { FiCheckCircle, FiAlertCircle, FiRefreshCw, FiShield, FiLock, FiTrash2, FiRotateCcw, FiFilter, FiSearch, FiFileText, FiDownload } from 'react-icons/fi';
import { BackupRunItem, backupSystemService } from '../../services/backupSystemService';
import { useNotification } from '../../components/NotificationContext';

interface Props {
  runs: BackupRunItem[];
  loading: boolean;
  onRefresh: () => void;
  onSelectRestore: (run: BackupRunItem) => void;
  canCreate: boolean;
  canRestore: boolean;
  canDelete: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return bytes + ' B';
}

export const BackupHistoryTable: React.FC<Props> = ({
  runs,
  loading,
  onRefresh,
  onSelectRestore,
  canRestore,
  canDelete,
}) => {
  const { showSuccess, showError } = useNotification();
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [verifyingId, setVerifyingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const filteredRuns = runs.filter((run) => {
    const matchesSearch =
      run.run_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (run.error_message && run.error_message.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesType = typeFilter === 'all' || run.type === typeFilter;
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'verified' ? run.is_verified : run.status === statusFilter);

    return matchesSearch && matchesType && matchesStatus;
  });

  const handleVerify = async (run: BackupRunItem) => {
    setVerifyingId(run.id);
    try {
      const res = await backupSystemService.verifyRun(run.id, false);
      if (res.success) {
        showSuccess(`Run ${run.run_code} successfully verified on Google Drive.`);
      } else {
        showError(`Verification warning: ${res.notes || 'Artifact check failed'}`);
      }
      onRefresh();
    } catch (err: any) {
      showError(err.message || 'Verification check failed.');
    } finally {
      setVerifyingId(null);
    }
  };

  const handleDelete = async (run: BackupRunItem) => {
    if (!canDelete) return;
    if (!window.confirm(`Are you sure you want to delete backup snapshot ${run.run_code}? This will remove remote artifacts from Google Drive.`)) {
      return;
    }

    setDeletingId(run.id);
    try {
      await backupSystemService.deleteRun(run.id);
      showSuccess(`Backup ${run.run_code} deleted successfully.`);
      onRefresh();
    } catch (err: any) {
      showError(err.message || 'Failed to delete backup.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownload = async (run: BackupRunItem) => {
    setDownloadingId(run.id);
    try {
      await backupSystemService.downloadRunSnapshot(run.id, run.run_code, true);
      showSuccess(`Backup snapshot ${run.run_code} downloaded successfully.`);
    } catch (err: any) {
      showError(err.message || 'Failed to download backup snapshot.');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden">
      {/* Table Header Controls */}
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Backup Snapshot History</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            List of encrypted off-site restore points stored in Google Drive
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search Box */}
          <div className="relative">
            <FiSearch className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search run code..."
              className="pl-9 pr-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs dark:bg-slate-800 dark:text-white w-48 sm:w-56 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs dark:bg-slate-800 dark:text-white"
          >
            <option value="all">All Types</option>
            <option value="manual">Manual</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs dark:bg-slate-800 dark:text-white"
          >
            <option value="all">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="verified">Verified</option>
            <option value="failed">Failed</option>
          </select>

          {/* Refresh button */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="p-2 border border-slate-300 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-50"
            title="Refresh History"
          >
            <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Table Body */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-slate-50/70 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <th className="py-3.5 px-6">Run Code</th>
              <th className="py-3.5 px-4">Type</th>
              <th className="py-3.5 px-4">Size</th>
              <th className="py-3.5 px-4">Encryption</th>
              <th className="py-3.5 px-4">Completed At</th>
              <th className="py-3.5 px-4">Integrity</th>
              <th className="py-3.5 px-6 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans text-xs">
            {loading && runs.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-16 text-center text-slate-500">
                  <FiRefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-600 mb-2" />
                  Loading recovery points...
                </td>
              </tr>
            ) : filteredRuns.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-16 text-center text-slate-500">
                  <FiFileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  No backup snapshots match your criteria.
                </td>
              </tr>
            ) : (
              filteredRuns.map((run) => (
                <tr key={run.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                  {/* Run Code */}
                  <td className="py-4 px-6 font-mono font-bold text-slate-800 dark:text-slate-200">
                    <div className="flex items-center gap-2">
                      <span>{run.run_code}</span>
                      {run.is_protected && (
                        <span className="p-1 text-amber-500" title="Protected recovery point">
                          <FiLock className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Type */}
                  <td className="py-4 px-4">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize ${
                      run.type === 'daily'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                        : run.type === 'weekly'
                        ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300'
                        : run.type === 'monthly'
                        ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300'
                        : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                    }`}>
                      {run.type}
                    </span>
                  </td>

                  {/* Size */}
                  <td className="py-4 px-4 font-medium text-slate-700 dark:text-slate-300">
                    {formatBytes(run.total_size_bytes)}
                  </td>

                  {/* Encryption */}
                  <td className="py-4 px-4">
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                      <FiLock className="w-3 h-3 text-indigo-500" />
                      AES-256-GCM
                    </span>
                  </td>

                  {/* Completed At */}
                  <td className="py-4 px-4 text-slate-500 dark:text-slate-400">
                    {run.completed_at ? new Date(run.completed_at).toLocaleString() : 'In Progress'}
                  </td>

                  {/* Integrity Status */}
                  <td className="py-4 px-4">
                    {run.status === 'failed' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
                        <FiAlertCircle className="w-3.5 h-3.5" /> Failed
                      </span>
                    ) : run.is_verified ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                        <FiCheckCircle className="w-3.5 h-3.5" /> Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400">
                        Pending
                      </span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="py-4 px-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {/* Verify button */}
                      <button
                        type="button"
                        onClick={() => handleVerify(run)}
                        disabled={verifyingId === run.id || run.status === 'failed' || run.status === 'pruned'}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title={run.status === 'failed' ? 'Cannot verify failed run (no artifacts)' : 'Verify integrity on Google Drive'}
                      >
                        <FiShield className={`w-4 h-4 ${verifyingId === run.id ? 'animate-spin text-blue-500' : ''}`} />
                      </button>

                      {/* Download button */}
                      {run.status !== 'failed' && (
                        <button
                          type="button"
                          onClick={() => handleDownload(run)}
                          disabled={downloadingId === run.id}
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Download Snapshot (Decrypted SQL / Archive)"
                        >
                          <FiDownload className={`w-4 h-4 ${downloadingId === run.id ? 'animate-bounce text-emerald-500' : ''}`} />
                        </button>
                      )}

                      {/* Restore button */}
                      {canRestore && run.status !== 'failed' && (
                        <button
                          type="button"
                          onClick={() => onSelectRestore(run)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/60 font-semibold text-xs transition-colors shadow-sm"
                          title="Initiate Disaster Recovery"
                        >
                          <FiRotateCcw className="w-3.5 h-3.5" />
                          Restore
                        </button>
                      )}

                      {/* Delete button */}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDelete(run)}
                          disabled={deletingId === run.id}
                          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 text-slate-400 hover:text-red-500 transition-colors"
                          title="Delete snapshot"
                        >
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
