// src/pages/BackupCenter/RestoreConfirmationModal.tsx
import React, { useState } from 'react';
import { FiAlertTriangle, FiShield, FiDatabase, FiFolder, FiCheckCircle, FiX, FiRefreshCw } from 'react-icons/fi';
import { BackupRunItem, backupSystemService } from '../../services/backupSystemService';
import { useNotification } from '../../components/NotificationContext';

interface Props {
  run: BackupRunItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const RestoreConfirmationModal: React.FC<Props> = ({
  run,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { showSuccess, showError } = useNotification();
  const [confirmationInput, setConfirmationInput] = useState('');
  const [restoreDb, setRestoreDb] = useState(true);
  const [restoreFiles, setRestoreFiles] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [restoreStage, setRestoreStage] = useState<string>('');

  if (!isOpen || !run) return null;

  const expectedPhrase = `RESTORE ${run.run_code}`;
  const isPhraseValid = confirmationInput.trim() === expectedPhrase;

  const handleExecuteRestore = async () => {
    if (!isPhraseValid || restoring) return;

    if (!restoreDb && !restoreFiles) {
      showError('Please select at least one component (Database or Files) to restore.');
      return;
    }

    setRestoring(true);
    setRestoreStage('Creating pre-restore safety snapshot and preparing system...');

    try {
      setRestoreStage('Decrypting recovery artifacts and restoring data...');
      const res = await backupSystemService.restoreRun(run.id, {
        confirmation_phrase: confirmationInput.trim(),
        restore_database: restoreDb,
        restore_files: restoreFiles,
      });

      showSuccess(res.message || 'Disaster recovery restore executed successfully.');
      onSuccess();
      onClose();
    } catch (err: any) {
      showError(err.message || 'Disaster recovery restore failed. The system rolled back to the safety snapshot.');
    } finally {
      setRestoring(false);
      setRestoreStage('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-xl w-full border border-red-200 dark:border-red-900/60 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header with High-Visibility Warning */}
        <div className="bg-red-500 text-white p-6 relative">
          <button
            type="button"
            onClick={onClose}
            disabled={restoring}
            className="absolute top-5 right-5 p-1 rounded-full text-red-100 hover:text-white hover:bg-red-600/60 transition-colors disabled:opacity-40"
          >
            <FiX className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-red-600/80 rounded-2xl">
              <FiAlertTriangle className="w-8 h-8 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold">Disaster Recovery Restoration</h3>
              <p className="text-red-100 text-sm">Critical System State Replacement</p>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6">
          {/* Target Snapshot Details */}
          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 text-sm">
            <div className="flex justify-between items-center mb-2">
              <span className="text-slate-500 dark:text-slate-400">Target Recovery Point:</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{run.run_code}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500 dark:text-slate-400">Snapshot Timestamp:</span>
              <span className="text-slate-700 dark:text-slate-300">
                {run.completed_at ? new Date(run.completed_at).toLocaleString() : 'N/A'}
              </span>
            </div>
          </div>

          {/* Safety Architecture Notice */}
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40 rounded-2xl p-4 flex items-start gap-3 text-xs text-blue-800 dark:text-blue-300">
            <FiShield className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block mb-0.5">Automated Pre-Restore Safety Snapshot</span>
              Before any current database tables or uploads are modified, an automatic emergency safety backup is captured on the server. If any error occurs during restoration, the system automatically rolls back without data loss.
            </div>
          </div>

          {/* Components to Restore */}
          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Select Components to Restore:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                  restoreDb
                    ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-200'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                <input
                  type="checkbox"
                  checked={restoreDb}
                  onChange={(e) => setRestoreDb(e.target.checked)}
                  disabled={restoring}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <FiDatabase className="w-5 h-5 text-indigo-600" />
                <span className="text-sm font-medium">Database Tables</span>
              </label>

              <label
                className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                  restoreFiles
                    ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-200'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                <input
                  type="checkbox"
                  checked={restoreFiles}
                  onChange={(e) => setRestoreFiles(e.target.checked)}
                  disabled={restoring}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <FiFolder className="w-5 h-5 text-indigo-600" />
                <span className="text-sm font-medium">Uploaded Assets</span>
              </label>
            </div>
          </div>

          {/* Security Type-To-Confirm */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Type <code className="bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 px-1.5 py-0.5 rounded font-mono font-bold select-all">{expectedPhrase}</code> to confirm:
            </label>
            <input
              type="text"
              value={confirmationInput}
              onChange={(e) => setConfirmationInput(e.target.value)}
              disabled={restoring}
              placeholder={expectedPhrase}
              className="w-full px-4 py-3 border border-slate-300 dark:border-slate-700 rounded-xl font-mono text-sm dark:bg-slate-800 focus:ring-2 focus:ring-red-500 dark:text-white"
            />
          </div>

          {/* Active progress indicator during restoration */}
          {restoring && (
            <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/40 rounded-2xl flex items-center gap-3 text-xs text-amber-800 dark:text-amber-300 animate-pulse">
              <FiRefreshCw className="w-5 h-5 animate-spin text-amber-600 shrink-0" />
              <div>
                <span className="font-semibold block">Restoration In Progress — Do Not Close This Tab</span>
                <span>{restoreStage}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 dark:bg-slate-800/40 px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={restoring}
            className="px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-300 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExecuteRestore}
            disabled={!isPhraseValid || restoring}
            className="px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold shadow-md shadow-red-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {restoring ? (
              <>
                <FiRefreshCw className="w-4 h-4 animate-spin" />
                Restoring...
              </>
            ) : (
              <>
                <FiCheckCircle className="w-4 h-4" />
                Confirm & Restore System
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
