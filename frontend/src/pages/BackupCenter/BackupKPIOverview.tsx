// src/pages/BackupCenter/BackupKPIOverview.tsx
import React from 'react';
import { FiDatabase, FiShield, FiClock, FiCheckCircle, FiAlertTriangle } from 'react-icons/fi';
import { BackupMetrics } from '../../services/backupSystemService';

interface Props {
  metrics: BackupMetrics;
  scheduler: {
    frequency: string;
    scheduled_time: string;
    timezone: string;
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return bytes + ' B';
}

export const BackupKPIOverview: React.FC<Props> = ({ metrics, scheduler }) => {
  const successRate = metrics.total_runs > 0
    ? Math.round((metrics.successful_runs / metrics.total_runs) * 100)
    : 100;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
      {/* 1. Total Backups */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Backups</span>
          <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-xl">
            <FiDatabase className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-3xl font-extrabold text-slate-900 dark:text-white">{metrics.total_runs}</span>
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
            {successRate}% Success
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          {metrics.successful_runs} verified / {metrics.failed_runs} failed
        </p>
      </div>

      {/* 2. Protected Storage */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Protected Storage</span>
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-xl">
            <FiShield className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
            {formatBytes(metrics.total_backup_bytes)}
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Encrypted AES-256-GCM off-site
        </p>
      </div>

      {/* 3. Last Recovery Point */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Last Recovery Point</span>
          <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl">
            <FiCheckCircle className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-3">
          {metrics.last_successful_run ? (
            <>
              <p className="font-mono text-sm font-bold text-slate-800 dark:text-slate-200 truncate">
                {metrics.last_successful_run.run_code}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {new Date(metrics.last_successful_run.completed_at || '').toLocaleString()}
              </p>
            </>
          ) : (
            <p className="mt-3 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <FiAlertTriangle className="w-4 h-4" /> No recovery points yet
            </p>
          )}
        </div>
      </div>

      {/* 4. Automated Schedule */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Automated Schedule</span>
          <div className="p-2.5 bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 rounded-xl">
            <FiClock className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-xl font-bold text-slate-900 dark:text-white">Daily at 02:00 AM</span>
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          {scheduler.timezone} • Atomic Lock Protected
        </p>
      </div>
    </div>
  );
};
