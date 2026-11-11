// src/pages/BackupCenter/BackupSettingsModal.tsx
import React, { useEffect, useState } from 'react';
import { FiSettings, FiX, FiCheck, FiTrash2, FiBell, FiShield, FiCalendar, FiRefreshCw } from 'react-icons/fi';
import { BackupSettings, backupSystemService } from '../../services/backupSystemService';
import { useNotification } from '../../components/NotificationContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const BackupSettingsModal: React.FC<Props> = ({ isOpen, onClose, onSaved }) => {
  const { showSuccess, showError } = useNotification();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pruning, setPruning] = useState(false);

  const [settings, setSettings] = useState<BackupSettings>({
    drive_backup_folder: 'NixaERP Backups',
    retention_daily_days: 30,
    retention_weekly_weeks: 12,
    retention_monthly_months: 12,
    retention_min_keep: 2,
    notifications_enabled: true,
    notify_on_success: true,
    notify_on_failure: true,
    notification_emails: '',
    scheduled_time: '02:00',
    timezone: 'Asia/Kolkata',
  });

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await backupSystemService.getSettings();
      setSettings(data);
    } catch (err: any) {
      showError(err.message || 'Failed to load backup settings.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await backupSystemService.updateSettings(settings);
      showSuccess('Backup settings updated successfully.');
      onSaved();
      onClose();
    } catch (err: any) {
      showError(err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleRunPrune = async () => {
    if (!window.confirm('Apply retention policy now? Older backups exceeding daily/weekly/monthly thresholds will be pruned from Google Drive, while preserving newest recovery points.')) {
      return;
    }

    setPruning(true);
    try {
      const res = await backupSystemService.runRetention();
      showSuccess(res.message || 'Retention policy applied successfully.');
      onSaved();
    } catch (err: any) {
      showError(err.message || 'Retention execution failed.');
    } finally {
      setPruning(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-2xl">
              <FiSettings className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Backup & Retention Configuration</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Manage storage policies, alerts, and retention rules</p>
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

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-6">
          {loading ? (
            <div className="py-12 flex justify-center items-center text-slate-500">
              <FiRefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
            </div>
          ) : (
            <>
              {/* 1. Retention Policies */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200">
                  <FiCalendar className="w-4 h-4 text-indigo-500" />
                  <span>Retention Cycles (GFS: Grandfather-Father-Son)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Daily Retention (Days)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={settings.retention_daily_days}
                      onChange={(e) => setSettings({ ...settings, retention_daily_days: parseInt(e.target.value) || 30 })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-sm dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Weekly Retention (Weeks)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={104}
                      value={settings.retention_weekly_weeks}
                      onChange={(e) => setSettings({ ...settings, retention_weekly_weeks: parseInt(e.target.value) || 12 })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-sm dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Monthly Retention (Months)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={settings.retention_monthly_months}
                      onChange={(e) => setSettings({ ...settings, retention_monthly_months: parseInt(e.target.value) || 12 })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-sm dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                </div>

                <div className="bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30 rounded-xl p-3 text-xs text-indigo-800 dark:text-indigo-300 flex items-center justify-between">
                  <span>Minimum recovery points strictly preserved: <strong>{settings.retention_min_keep}</strong></span>
                  <button
                    type="button"
                    onClick={handleRunPrune}
                    disabled={pruning}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-700 transition-colors shadow-sm disabled:opacity-50"
                  >
                    <FiTrash2 className="w-3.5 h-3.5" />
                    {pruning ? 'Pruning...' : 'Prune Expired Now'}
                  </button>
                </div>
              </div>

              {/* 2. Destination Folder */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Google Drive Target Folder Name
                </label>
                <input
                  type="text"
                  value={settings.drive_backup_folder}
                  onChange={(e) => setSettings({ ...settings, drive_backup_folder: e.target.value })}
                  placeholder="NixaERP Backups"
                  className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-sm dark:bg-slate-800 dark:text-white"
                />
              </div>

              {/* 3. Alerts & Notifications */}
              <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200">
                  <FiBell className="w-4 h-4 text-indigo-500" />
                  <span>Automated Incident & Status Alerts</span>
                </div>

                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.notify_on_failure}
                      onChange={(e) => setSettings({ ...settings, notify_on_failure: e.target.checked })}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Alert on Failures</span>
                  </label>

                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.notify_on_success}
                      onChange={(e) => setSettings({ ...settings, notify_on_success: e.target.checked })}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Alert on Success</span>
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Notification Recipient Emails (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={settings.notification_emails}
                    onChange={(e) => setSettings({ ...settings, notification_emails: e.target.value })}
                    placeholder="sysadmin@example.com, cto@example.com"
                    className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-sm dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>
            </>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-300 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || loading}
              className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-md shadow-indigo-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <FiRefreshCw className="w-4 h-4 animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <FiCheck className="w-4 h-4" /> Save Configuration
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
