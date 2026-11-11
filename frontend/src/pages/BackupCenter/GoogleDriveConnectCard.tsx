// src/pages/BackupCenter/GoogleDriveConnectCard.tsx
import React, { useState } from 'react';
import { FiCloud, FiCheckCircle, FiAlertCircle, FiRefreshCw, FiExternalLink, FiFolder, FiHardDrive, FiPower } from 'react-icons/fi';
import { BackupConnectionInfo, GoogleDriveQuota, backupSystemService } from '../../services/backupSystemService';
import { useNotification } from '../../components/NotificationContext';

interface Props {
  connection: BackupConnectionInfo | null;
  quota: GoogleDriveQuota | null;
  onRefresh: () => void;
  canManageSettings: boolean;
}

export const GoogleDriveConnectCard: React.FC<Props> = ({
  connection,
  quota,
  onRefresh,
  canManageSettings,
}) => {
  const { showSuccess, showError } = useNotification();
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const handleConnect = async () => {
    if (!canManageSettings) return;
    setConnecting(true);
    try {
      const authUrl = await backupSystemService.getOAuthRedirect();
      // Redirect to Google OAuth consent screen
      window.location.href = authUrl;
    } catch (err: any) {
      showError(err.message || 'Failed to initiate Google Drive authorization.');
      setConnecting(false);
    }
  };

  const handleTestConnection = async () => {
    if (!connection) return;
    setTesting(true);
    try {
      const res = await backupSystemService.testConnection(connection.id);
      showSuccess(res.message || 'Google Drive connection and access permissions verified successfully.');
      onRefresh();
    } catch (err: any) {
      showError(err.message || 'Connection test failed. Google Drive may require re-authorization.');
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!connection || !canManageSettings) return;
    if (!window.confirm('Are you sure you want to disconnect Google Drive? Scheduled backups will be paused until reconnected.')) {
      return;
    }

    setDisconnecting(true);
    try {
      await backupSystemService.disconnect(connection.id);
      showSuccess('Google Drive account disconnected successfully.');
      onRefresh();
    } catch (err: any) {
      showError(err.message || 'Failed to disconnect Google Drive.');
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 mb-8 transition-all">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        {/* Left column: Status & Identity */}
        <div className="flex items-start gap-4">
          <div className={`p-4 rounded-2xl ${connection ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400' : 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400'}`}>
            <FiCloud className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Google Drive Cloud Storage</h2>
              {connection ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                  <FiCheckCircle className="w-3.5 h-3.5" /> Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                  <FiAlertCircle className="w-3.5 h-3.5" /> Disconnected
                </span>
              )}
            </div>

            {connection ? (
              <div className="mt-2 text-sm text-slate-600 dark:text-slate-400 space-y-1">
                <p className="flex items-center gap-2">
                  <span className="font-medium text-slate-800 dark:text-slate-200">{connection.account_email}</span>
                  {connection.account_name && <span className="text-xs text-slate-400">({connection.account_name})</span>}
                </p>
                <p className="flex items-center gap-1.5 text-xs text-slate-500">
                  <FiFolder className="w-3.5 h-3.5 text-blue-500" />
                  Target Folder: <span className="font-medium text-slate-700 dark:text-slate-300">{connection.folder_name || 'NixaERP Backups'}</span>
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 max-w-xl">
                Connect your organization's Google Drive account to enable automated, encrypted daily off-site database and business files disaster recovery backups.
              </p>
            )}
          </div>
        </div>

        {/* Right column: Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {connection ? (
            <>
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors shadow-sm disabled:opacity-50"
              >
                <FiRefreshCw className={`w-4 h-4 ${testing ? 'animate-spin' : ''}`} />
                {testing ? 'Testing...' : 'Test Connection'}
              </button>

              {canManageSettings && (
                <>
                  <button
                    type="button"
                    onClick={handleConnect}
                    disabled={connecting}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors shadow-sm"
                  >
                    <FiExternalLink className="w-4 h-4 text-blue-500" />
                    Reconnect
                  </button>

                  <button
                    type="button"
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-950/40 text-sm font-medium text-red-600 dark:text-red-400 transition-colors shadow-sm"
                  >
                    <FiPower className="w-4 h-4" />
                    Disconnect
                  </button>
                </>
              )}
            </>
          ) : (
            canManageSettings && (
              <button
                type="button"
                onClick={handleConnect}
                disabled={connecting}
                className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold shadow-md shadow-blue-500/20 transition-all transform active:scale-95 disabled:opacity-50"
              >
                <FiCloud className="w-5 h-5" />
                {connecting ? 'Redirecting to Google...' : 'Connect Google Drive'}
              </button>
            )
          )}
        </div>
      </div>

      {/* Storage Quota Progress Bar (when connected and quota is available) */}
      {connection && quota && (
        <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800/80">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-2 text-xs">
            <div className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
              <FiHardDrive className="w-4 h-4 text-indigo-500" />
              <span>Google Drive Storage Quota</span>
            </div>
            <div className="text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-800 dark:text-slate-200">{quota.used_formatted}</span> used of{' '}
              <span className="font-semibold text-slate-800 dark:text-slate-200">{quota.total_formatted}</span>{' '}
              ({quota.used_percent}% utilized)
            </div>
          </div>
          <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                quota.used_percent > 90
                  ? 'bg-red-500'
                  : quota.used_percent > 75
                  ? 'bg-amber-500'
                  : 'bg-gradient-to-r from-blue-500 to-indigo-600'
              }`}
              style={{ width: `${Math.min(quota.used_percent, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
