// src/pages/BackupCenter/BackupAuditModal.tsx
import React, { useEffect, useState } from 'react';
import { FiList, FiX, FiCheckCircle, FiAlertCircle, FiRefreshCw } from 'react-icons/fi';
import { BackupAuditItem, backupSystemService } from '../../services/backupSystemService';
import { useNotification } from '../../components/NotificationContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const BackupAuditModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { showError } = useNotification();
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<BackupAuditItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    if (isOpen) {
      loadLogs(1);
    }
  }, [isOpen]);

  const loadLogs = async (p: number) => {
    setLoading(true);
    try {
      const res = await backupSystemService.getAuditLogs({ page: p, per_page: 15 });
      setLogs(res.data);
      setPage(res.current_page);
      setTotalPages(res.last_page);
    } catch (err: any) {
      showError(err.message || 'Failed to load audit logs.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-4xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-2xl">
              <FiList className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Backup Audit & Incident Ledger</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Tamper-evident record of backup, restore, and security actions</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <FiX className="w-6 h-6" />
          </button>
        </div>

        {/* Content Table */}
        <div className="overflow-y-auto flex-1 p-6">
          {loading ? (
            <div className="py-20 flex justify-center items-center text-slate-500">
              <FiRefreshCw className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : logs.length === 0 ? (
            <div className="py-16 text-center text-slate-500">
              <p>No audit events recorded yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <th className="pb-3 px-3">Status</th>
                    <th className="pb-3 px-3">Action</th>
                    <th className="pb-3 px-3">Actor</th>
                    <th className="pb-3 px-3">IP Address</th>
                    <th className="pb-3 px-3">Timestamp</th>
                    <th className="pb-3 px-3">Details / Errors</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono text-xs">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-3">
                        {log.status === 'success' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-sans font-semibold">
                            <FiCheckCircle className="w-3.5 h-3.5" /> OK
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-sans font-semibold">
                            <FiAlertCircle className="w-3.5 h-3.5" /> FAIL
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-800 dark:text-slate-200 font-sans">
                        {log.action}
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-400 font-sans">
                        {log.user ? log.user.name : 'System CLI'}
                      </td>
                      <td className="py-3 px-3 text-slate-500">
                        {log.ip_address || 'Local'}
                      </td>
                      <td className="py-3 px-3 text-slate-500">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-400 truncate max-w-xs">
                        {log.error_message || JSON.stringify(log.details)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer with Pagination */}
        <div className="flex items-center justify-between p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 shrink-0">
          <span className="text-xs text-slate-500">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => loadLogs(page - 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-white dark:hover:bg-slate-800 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => loadLogs(page + 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-white dark:hover:bg-slate-800 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
