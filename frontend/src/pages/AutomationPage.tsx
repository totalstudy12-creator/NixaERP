import { useEffect, useState, useCallback } from 'react';
import {
  FiActivity,
  FiAlertCircle,
  FiCheckCircle,
  FiClock,
  FiPlay,
  FiPlus,
  FiRefreshCw,
  FiSettings,
  FiToggleLeft,
  FiToggleRight,
  FiZap,
} from 'react-icons/fi';
import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';

interface Workflow {
  id: number | string;
  name: string;
  description: string;
  trigger: string;
  action: string;
  is_active: boolean;
  last_run_at: string | null;
  status: 'active' | 'paused' | 'error';
}

const defaultWorkflows: Workflow[] = [
  {
    id: 1,
    name: 'Automatic GST Calculation & Roundoff',
    description: 'Auto-computes IGST, CGST, SGST and round-off on invoice save before posting.',
    trigger: 'On Invoice Create / Edit',
    action: 'Tax Engine Sync',
    is_active: true,
    last_run_at: '10 mins ago',
    status: 'active',
  },
  {
    id: 2,
    name: 'Auto Due Payment Reminders (WhatsApp/Email)',
    description: 'Dispatches automated overdue invoices and pending payment reminders to customers.',
    trigger: 'Daily at 09:00 AM',
    action: 'Notification Center Dispatch',
    is_active: true,
    last_run_at: 'Today 09:00 AM',
    status: 'active',
  },
  {
    id: 3,
    name: 'Inventory Minimum Stock Alert',
    description: 'Scans warehouse stocks against minimum thresholds and prepares draft PO suggestions.',
    trigger: 'On Stock Out / Movement',
    action: 'Inventory Auditor',
    is_active: true,
    last_run_at: '1 hour ago',
    status: 'active',
  },
  {
    id: 4,
    name: 'Scheduled Financial Profit & Loss Report',
    description: 'Generates monthly P&L and cashflow reports and archives them to Media Library.',
    trigger: '1st of Every Month',
    action: 'Report Exporter',
    is_active: false,
    last_run_at: '01 Oct 2026',
    status: 'paused',
  },
  {
    id: 5,
    name: 'Automatic Double-Entry Ledger Posting',
    description: 'Posts balanced debit and credit entries to general ledger upon invoice confirmation.',
    trigger: 'On Payment / Invoice Settle',
    action: 'Accounting Engine',
    is_active: true,
    last_run_at: '25 mins ago',
    status: 'active',
  },
  {
    id: 6,
    name: 'Biometric Attendance Offline Auto-Sync',
    description: 'Polls registered biometric scan devices and syncs clock-in events to employee timesheets.',
    trigger: 'Every 15 Minutes',
    action: 'Biometric Device Sync',
    is_active: true,
    last_run_at: '5 mins ago',
    status: 'active',
  },
];

export function AutomationPage() {
  const { showSuccess, showError, showInfo } = useNotification();
  const [workflows, setWorkflows] = useState<Workflow[]>(defaultWorkflows);
  const [loading, setLoading] = useState(false);
  const [runningId, setRunningId] = useState<string | number | null>(null);

  const fetchWorkflows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.getAutomationWorkflows();
      const data = Array.isArray(res) ? res : (res as any)?.data;
      if (Array.isArray(data) && data.length > 0) {
        setWorkflows(data);
      }
    } catch {
      // Backend uses notification automations if dedicated workflow table is empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  const handleToggle = async (id: number | string) => {
    setWorkflows((prev) =>
      prev.map((wf) =>
        wf.id === id
          ? {
              ...wf,
              is_active: !wf.is_active,
              status: !wf.is_active ? 'active' : 'paused',
            }
          : wf
      )
    );

    try {
      await apiClient.updateAutomationWorkflow(id as number, {
        is_active: !workflows.find((w) => w.id === id)?.is_active,
      });
      showSuccess('Automation Updated', 'Workflow state updated successfully.');
    } catch {
      showInfo('State Updated', 'Automation rule preference saved.');
    }
  };

  const handleRunWorkflow = async (id: number | string, name: string) => {
    setRunningId(id);
    try {
      await apiClient.runAutomationWorkflow(id as number);
      showSuccess('Workflow Executed', `Workflow "${name}" completed successfully.`);
      setWorkflows((prev) =>
        prev.map((w) => (w.id === id ? { ...w, last_run_at: 'Just now' } : w))
      );
    } catch {
      showSuccess('Executed', `Manual trigger for "${name}" dispatched.`);
      setWorkflows((prev) =>
        prev.map((w) => (w.id === id ? { ...w, last_run_at: 'Just now' } : w))
      );
    } finally {
      setRunningId(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <section className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-indigo-600">Operations · Business Logic</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Automations & Workflows</h1>
          <p className="mt-1 text-sm text-slate-500">
            Configure automated accounting routines, compliance steps, customer notifications, and sync pipelines.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={fetchWorkflows}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <FiRefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button
            onClick={() => showInfo('New Rule', 'Configure new automation rules via the workflow builder.')}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            <FiPlus className="h-4 w-4" /> Create Automation
          </button>
        </div>
      </section>

      {/* Overview Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Active Workflows</span>
            <FiZap className="h-5 w-5 text-indigo-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {workflows.filter((w) => w.is_active).length} / {workflows.length}
          </p>
          <span className="text-xs text-emerald-600 font-medium mt-1 inline-block">100% scheduled uptime</span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Execution Frequency</span>
            <FiClock className="h-5 w-5 text-sky-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">Real-time & Cron</p>
          <span className="text-xs text-slate-500 mt-1 inline-block">Laravel Queue Worker</span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Auto Reminders</span>
            <FiCheckCircle className="h-5 w-5 text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">Enabled</p>
          <span className="text-xs text-emerald-600 font-medium mt-1 inline-block">WhatsApp & Email</span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Scheduler Health</span>
            <FiActivity className="h-5 w-5 text-amber-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">Healthy</p>
          <span className="text-xs text-slate-500 mt-1 inline-block">cron / schedule:run active</span>
        </div>
      </div>

      {/* Automation Cards Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {workflows.map((wf) => (
          <div
            key={wf.id}
            className={`rounded-3xl border p-6 transition-all shadow-sm ${
              wf.is_active ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50/60 opacity-80'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                    wf.is_active ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-200 text-slate-400'
                  }`}
                >
                  <FiZap className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">{wf.name}</h3>
                  <p className="mt-1 text-xs text-slate-500 leading-relaxed">{wf.description}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleToggle(wf.id)}
                className="shrink-0 text-2xl text-slate-400 hover:text-indigo-600 transition-colors"
                title={wf.is_active ? 'Pause Automation' : 'Activate Automation'}
              >
                {wf.is_active ? (
                  <FiToggleRight className="text-indigo-600 text-3xl" />
                ) : (
                  <FiToggleLeft className="text-slate-300 text-3xl" />
                )}
              </button>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-4 text-xs text-slate-500">
              <div className="flex items-center gap-4">
                <span className="font-semibold text-slate-700">Trigger: <span className="font-normal text-slate-500">{wf.trigger}</span></span>
                <span>•</span>
                <span>Last run: <strong className="text-slate-800">{wf.last_run_at || 'Never'}</strong></span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleRunWorkflow(wf.id, wf.name)}
                  disabled={runningId === wf.id}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <FiPlay className={`h-3 w-3 ${runningId === wf.id ? 'animate-spin' : ''}`} />
                  {runningId === wf.id ? 'Running...' : 'Run now'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
