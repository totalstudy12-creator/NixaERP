import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
  FiRefreshCw, FiClock, FiCloud, FiCpu, FiDatabase,
  FiShield, FiZap, FiServer, FiCloudRain, FiAlertTriangle,
  FiClock as FiClockAlt, FiTrendingUp, FiActivity,
} from 'react-icons/fi';
import { LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useNotification } from '../components/NotificationContext';
import { HealthSummaryCard } from '../components/health/HealthSummaryCard';
import { HealthStatusBadge } from '../components/health/HealthStatusBadge';
import { SystemHealthScore } from '../components/health/SystemHealthScore';
import { ServiceStatusGrid } from '../components/health/ServiceStatusGrid';
import { DatabaseHealthPanel } from '../components/health/DatabaseHealthPanel';
import { ApiHealthTable } from '../components/health/ApiHealthTable';
import { IntegrationStatusTable } from '../components/health/IntegrationStatusTable';
import { TestConnectionModal } from '../components/health/TestConnectionModal';
import {
  getHealthOverview,
  getServerHealth,
  getDatabaseHealth,
  getApiHealth,
  getIntegrationHealth,
  getQueueHealth,
  getCronHealth,
  getStorageHealth,
  getBackupHealth,
  getSecurityHealth,
  getLogHealth,
  getPerformanceHealth,
  getUptimeHealth,
  getAlertHealth,
  getHistorySections,
  getServiceStatusGrid,
  testDatabaseConnection,
  testApiConnection,
  testIntegrationConnection,
  testStorageConnection,
  testQueueConnection,
  triggerBackupNow,
  resolveAlert,
  HealthOverview,
  ServerHealth,
  DatabaseHealth,
  ApiHealthEntry,
  IntegrationHealthEntry,
  QueueHealth,
  CronTask,
  StorageHealth,
  BackupHealth,
  SecurityHealth,
  LogEntry,
  PerformanceHealth,
  UptimeHealth,
  AlertEntry,
  HistorySection,
  ServiceStatusItem,
} from '../services/healthService';
import { formatDateTime } from '../utils/date';

const autoRefreshOptions = [
  { label: 'Off', value: 0 },
  { label: '10 seconds', value: 10 },
  { label: '30 seconds', value: 30 },
  { label: '1 minute', value: 60 },
  { label: '5 minutes', value: 300 },
];

function formatDeltaSeconds(seconds: number) {
  if (seconds <= 0) return 'Refreshing now';
  if (seconds < 60) return `Next refresh in ${seconds}s`;
  return `Next refresh in ${Math.ceil(seconds / 60)}m`;
}

function formatStatusLabel(status: string) {
  if (status === 'Healthy') return 'All systems operational';
  if (status === 'Warning') return 'Limited degradation detected';
  if (status === 'Critical') return 'Immediate attention required';
  return 'No connection';
}

function safeFormatDateTime(date?: string | number | Date | null) {
  if (!date) return 'Unknown';
  try {
    return formatDateTime(date);
  } catch {
    return 'Unknown';
  }
}

export function HealthMonitoringPage() {
  const { showSuccess, showError } = useNotification();
  const [overview, setOverview] = useState<HealthOverview | null>(null);
  const [server, setServer] = useState<ServerHealth | null>(null);
  const [database, setDatabase] = useState<DatabaseHealth | null>(null);
  const [apiEntries, setApiEntries] = useState<ApiHealthEntry[]>([]);
  const [integrationEntries, setIntegrationEntries] = useState<IntegrationHealthEntry[]>([]);
  const [queue, setQueue] = useState<QueueHealth | null>(null);
  const [cronTasks, setCronTasks] = useState<CronTask[]>([]);
  const [storage, setStorage] = useState<StorageHealth | null>(null);
  const [backup, setBackup] = useState<BackupHealth | null>(null);
  const [security, setSecurity] = useState<SecurityHealth | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [performance, setPerformance] = useState<PerformanceHealth | null>(null);
  const [uptime, setUptime] = useState<UptimeHealth | null>(null);
  const [alerts, setAlerts] = useState<AlertEntry[]>([]);
  const [history, setHistory] = useState<HistorySection[] | null>(null);
  const [serviceStatuses, setServiceStatuses] = useState<ServiceStatusItem[]>([]);
  const [filter, setFilter] = useState<'All' | 'Healthy' | 'Warning' | 'Critical' | 'Offline'>('All');
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(30);
  const [nextRefreshIn, setNextRefreshIn] = useState(autoRefreshInterval);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [testModal, setTestModal] = useState<{ title: string; message: string; open: boolean }>({ title: '', message: '', open: false });
  const [detailsModal, setDetailsModal] = useState<{ title: string; description: string; open: boolean }>({ title: '', description: '', open: false });
  const intervalRef = useRef<number | null>(null);

  const loadHealth = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      const [overviewRes, serverRes, dbRes, apiRes, integrationRes, queueRes, cronRes, storageRes, backupRes, securityRes, logsRes, perfRes, uptimeRes, alertRes, historyRes, servicesRes] = await Promise.all([
        getHealthOverview(),
        getServerHealth(),
        getDatabaseHealth(),
        getApiHealth(),
        getIntegrationHealth(),
        getQueueHealth(),
        getCronHealth(),
        getStorageHealth(),
        getBackupHealth(),
        getSecurityHealth(),
        getLogHealth(),
        getPerformanceHealth(),
        getUptimeHealth(),
        getAlertHealth(),
        getHistorySections(),
        getServiceStatusGrid(),
      ]);
      setOverview(overviewRes);
      setServer(serverRes);
      setDatabase(dbRes);
      setApiEntries(Array.isArray(apiRes) ? apiRes : Array.isArray(apiRes?.data) ? apiRes.data : []);
      setIntegrationEntries(Array.isArray(integrationRes) ? integrationRes : Array.isArray(integrationRes?.data) ? integrationRes.data : []);
      setQueue(queueRes);
      setCronTasks(Array.isArray(cronRes) ? cronRes : Array.isArray(cronRes?.data) ? cronRes.data : []);
      setStorage(storageRes);
      setBackup(backupRes);
      setSecurity(securityRes);
      setLogs(Array.isArray(logsRes) ? logsRes : Array.isArray(logsRes?.data) ? logsRes.data : []);
      setPerformance(perfRes);
      setUptime(uptimeRes);
      setAlerts(Array.isArray(alertRes) ? alertRes : Array.isArray(alertRes?.data) ? alertRes.data : []);
      setHistory(Array.isArray(historyRes) ? historyRes : Array.isArray(historyRes?.data) ? historyRes.data : []);
      setServiceStatuses(Array.isArray(servicesRes) ? servicesRes : Array.isArray(servicesRes?.data) ? servicesRes.data : []);
      setNextRefreshIn(autoRefreshInterval);
      showSuccess('Health updated', 'System health data refreshed successfully');
    } catch (error: any) {
      const message = error?.message || 'Unable to load health data';
      setPageError(message);
      showError('Health load failed', message);
    } finally {
      setLoading(false);
    }
  }, [autoRefreshInterval, showError, showSuccess]);

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  useEffect(() => {
    if (!autoRefreshEnabled || autoRefreshInterval <= 0) {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = window.setInterval(() => {
      loadHealth();
      setNextRefreshIn(autoRefreshInterval);
    }, autoRefreshInterval * 1000);

    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [autoRefreshEnabled, autoRefreshInterval, loadHealth]);

  useEffect(() => {
    if (!autoRefreshEnabled || autoRefreshInterval <= 0) return;
    const countdown = window.setInterval(() => {
      setNextRefreshIn((current) => (current > 0 ? current - 1 : autoRefreshInterval));
    }, 1000);
    return () => window.clearInterval(countdown);
  }, [autoRefreshEnabled, autoRefreshInterval]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      } else if (!document.hidden && autoRefreshEnabled && autoRefreshInterval > 0) {
        loadHealth();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [autoRefreshEnabled, autoRefreshInterval, loadHealth]);

  const handleRefresh = async () => {
    await loadHealth();
  };

  const handleTest = async (action: () => Promise<{ message: string }>, title: string) => {
    try {
      setTestModal({ title, message: 'Testing connection…', open: true });
      const result = await action();
      setTestModal({ title, message: result.message, open: true });
      showSuccess('Test complete', result.message);
    } catch (err: any) {
      const message = err?.message || 'Test failed';
      setTestModal({ title, message, open: true });
      showError('Test failed', message);
    }
  };

  const safeAlerts = Array.isArray(alerts) ? alerts : [];
  const activeAlerts = safeAlerts.filter((item) => item.status !== 'Healthy');

  const serverSummary = useMemo(() => [
    { icon: <FiCpu size={20} />, title: 'CPU Usage', value: server ? `${server.cpuUsage}%` : '—', details: 'Load threshold < 70%', status: server && server.cpuUsage > 85 ? 'Critical' : server && server.cpuUsage > 70 ? 'Warning' : 'Healthy', trend: 'Stable' },
    { icon: <FiCloud size={20} />, title: 'RAM Usage', value: server ? `${server.ramUsage}%` : '—', details: 'Memory healthy', status: server && server.ramUsage > 85 ? 'Critical' : server && server.ramUsage > 70 ? 'Warning' : 'Healthy', trend: 'Moderate' },
    { icon: <FiCloudRain size={20} />, title: 'Storage', value: server ? `${server.storageUsage}%` : '—', details: server ? `${storage?.used} used` : '', status: server && server.storageUsage > 85 ? 'Critical' : server && server.storageUsage > 70 ? 'Warning' : 'Healthy', trend: 'Increasing' },
    { icon: <FiTrendingUp size={20} />, title: 'Server Load', value: server ? `${server.serverLoad}` : '—', details: 'Normal < 1.0', status: server && server.serverLoad > 0.85 ? 'Warning' : 'Healthy', trend: 'Normal' },
  ] as const, [server, storage]);

  const overviewSummary = useMemo(() => [
    { icon: <FiServer size={20} />, title: 'ERP Status', value: overview ? overview.status : 'Loading', details: overview ? formatStatusLabel(overview.status) : '', status: overview ? overview.status : 'Offline' as HealthStatus, trend: 'Calculated' as string },
    { icon: <FiClockAlt size={20} />, title: 'Uptime', value: overview ? `${overview.uptimePercentage}%` : '—', details: '30-day availability', status: overview ? (overview.uptimePercentage >= 99.9 ? 'Healthy' : overview.uptimePercentage >= 99 ? 'Warning' : 'Critical') as HealthStatus : 'Offline' as HealthStatus, trend: 'Stable' },
    { icon: <FiDatabase size={20} />, title: 'Database', value: database ? database.connectionStatus : '—', details: database ? `${database.responseTimeMs} ms response` : '', status: database ? database.status : 'Offline' as HealthStatus, trend: 'Monitored' },
    { icon: <FiShield size={20} />, title: 'Security', value: security ? security.sslStatus : '—', details: security ? `${security.httpsStatus} / expires ${security.sslExpiry}` : '', status: security ? (security.sslStatus === 'Valid' ? 'Healthy' : 'Warning') as HealthStatus : 'Offline' as HealthStatus, trend: 'Reviewed' },
  ], [overview, database, security]);

  return (
    <div className="space-y-8">
      <div className="page-header">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="page-title">Health Monitoring</h1>
            <p className="page-description">Monitor ERP server, database, APIs, integrations and system performance</p>
            <p className="mt-4 text-sm text-slate-500">Last checked: {overview ? safeFormatDateTime(overview.lastChecked) : 'Loading...'} · {loading ? 'Refreshing…' : 'Idle'}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={handleRefresh} className="btn btn-primary inline-flex items-center gap-2"><FiRefreshCw /> Refresh All</button>
            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <input type="checkbox" checked={autoRefreshEnabled} onChange={(event) => setAutoRefreshEnabled(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
              Auto-refresh
            </label>
            <select value={autoRefreshInterval} onChange={(event) => setAutoRefreshInterval(Number(event.target.value))} className="input-field w-auto bg-white text-slate-900">
              {autoRefreshOptions.map((option) => (<option key={option.value} value={option.value}>{option.label}</option>))}
            </select>
            <span className="text-sm text-slate-500">{autoRefreshEnabled ? formatDeltaSeconds(nextRefreshIn) : 'Auto refresh off'}</span>
          </div>
        </div>
        {pageError && <div className="mt-6 rounded-3xl border border-rose-200 bg-rose-50 p-4 text-rose-700">{pageError}</div>}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="grid gap-4 md:grid-cols-2">
          {overviewSummary.map((card) => (
            <HealthSummaryCard
              key={card.title}
              icon={card.icon}
              title={card.title}
              value={card.value}
              details={card.details}
              status={card.status}
              trend={card.trend}
              onClick={() => setDetailsModal({ title: card.title, description: `Detailed ${card.title.toLowerCase()} metrics`, open: true })}
            />
          ))}
        </div>
        <div className="space-y-4">
          <SystemHealthScore
            score={overview?.score ?? 0}
            uptimePercentage={overview?.uptimePercentage ?? 0}
            healthyServices={overview?.healthyServices ?? 0}
            warningServices={overview?.warningServices ?? 0}
            criticalServices={overview?.criticalServices ?? 0}
            offlineServices={overview?.offlineServices ?? 0}
            status={overview?.status ?? 'Offline'}
          />
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Service Status</p>
                <p className="mt-2 text-xl font-semibold text-slate-900">Latest system component view</p>
              </div>
              <HealthStatusBadge status={overview?.status ?? 'Offline'} />
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Total Services</p>
                <p className="mt-3 text-3xl font-semibold text-slate-900">{overview?.totalServices ?? '—'}</p>
              </div>
              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Offline Services</p>
                <p className="mt-3 text-3xl font-semibold text-slate-900">{overview?.offlineServices ?? '—'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Server & Infrastructure</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">CPU, memory, storage and runtime</p>
            </div>
            <div className="rounded-3xl bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">Normal &lt; 70%</div>
          </div>
          <div className="mt-6 space-y-5">
            {serverSummary.map((item) => (
              <div key={item.title} className="space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                    <p className="text-sm text-slate-500">{item.details}</p>
                  </div>
                  <HealthStatusBadge status={item.status} />
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500" style={{ width: `${Math.min(100, Number(item.value.toString().replace('%', '')))}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">PHP Version</p>
              <p className="mt-3 text-lg font-semibold text-slate-900">{server?.phpVersion ?? '—'}</p>
            </div>
            <div className="rounded-3xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">App Version</p>
              <p className="mt-3 text-lg font-semibold text-slate-900">{server?.appVersion ?? '—'}</p>
            </div>
            <div className="rounded-3xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">DB Version</p>
              <p className="mt-3 text-lg font-semibold text-slate-900">{server?.dbVersion ?? '—'}</p>
            </div>
            <div className="rounded-3xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Web Server</p>
              <p className="mt-3 text-lg font-semibold text-slate-900">{server?.webServer ?? '—'}</p>
            </div>
          </div>
        </div>

        <DatabaseHealthPanel data={database} loading={loading && !database} />
      </div>

      <div className="space-y-4">
        <ApiHealthTable entries={apiEntries} filter={filter} onFilterChange={setFilter} onTestApi={() => handleTest(testApiConnection, 'API Connection Test')} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <IntegrationStatusTable entries={integrationEntries} onTestConnection={() => handleTest(testIntegrationConnection, 'Integration Connection Test')} onSyncNow={() => showSuccess('Sync requested', 'Integration sync requested successfully')} />
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Queue & Background Jobs</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">Pending, failed and scheduled work</p>
            </div>
            <button onClick={() => handleTest(testQueueConnection, 'Queue Health Test')} className="btn btn-outline">Test Queue</button>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Pending Jobs</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{queue?.pending ?? '—'}</p>
            </div>
            <div className="rounded-3xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Processing</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{queue?.processing ?? '—'}</p>
            </div>
            <div className="rounded-3xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Failed Jobs</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{queue?.failed ?? '—'}</p>
            </div>
            <div className="rounded-3xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Retry Count</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{queue?.retryCount ?? '—'}</p>
            </div>
          </div>
          <div className="mt-6 rounded-3xl bg-slate-100 p-4 text-slate-600">
            <p className="text-sm font-medium">Queue delay</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{queue?.delay ?? '—'}</p>
            <p className="mt-1 text-sm">Scheduled jobs: {queue?.scheduledJobs ?? '—'}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Cron / Scheduler</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">Task execution and schedule health</p>
            </div>
            <HealthStatusBadge status={cronTasks.some((task) => task.status === 'Warning') ? 'Warning' : 'Healthy'} />
          </div>
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-left text-sm text-slate-600">
              <thead className="border-b border-slate-200 text-slate-900">
                <tr>
                  <th className="px-4 py-3">Task</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last Run</th>
                  <th className="px-4 py-3">Next Run</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Failures</th>
                </tr>
              </thead>
              <tbody>
                {cronTasks.map((task) => (
                  <tr key={task.name} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{task.name}</td>
                    <td className="px-4 py-3"><HealthStatusBadge status={task.status} /></td>
                    <td className="px-4 py-3">{task.lastRun}</td>
                    <td className="px-4 py-3">{task.nextRun}</td>
                    <td className="px-4 py-3">{task.duration}</td>
                    <td className="px-4 py-3">{task.failures}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Storage Monitoring</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">Disk, database, backup and logs</p>
              </div>
              <button onClick={() => showSuccess('Storage tool', 'Open manage storage in settings')} className="btn btn-outline">Manage Storage</button>
            </div>
            <div className="mt-6 space-y-4">
              {storage && [
                { label: 'Total storage', value: storage.total },
                { label: 'Used storage', value: storage.used },
                { label: 'Free storage', value: storage.free },
              ].map((item) => (
                <div key={item.label} className="rounded-3xl bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{item.label}</p>
                  <p className="mt-3 text-lg font-semibold text-slate-900">{item.value}</p>
                </div>
              ))}
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-500" style={{ width: `${storage?.usedPercentage ?? 0}%` }} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {storage && [
                  { label: 'Database', value: storage.databaseStorage },
                  { label: 'Invoice files', value: storage.invoiceStorage },
                  { label: 'Product images', value: storage.imageStorage },
                  { label: 'Backup', value: storage.backupStorage },
                  { label: 'Logs', value: storage.logStorage },
                  { label: 'Temp files', value: storage.tempStorage },
                ].map((item) => (
                  <div key={item.label} className="rounded-3xl bg-slate-100 p-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{item.label}</p>
                    <p className="mt-3 text-lg font-semibold text-slate-900">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Backup Health</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">Last run, destination and verification</p>
              </div>
              <button onClick={() => handleTest(triggerBackupNow, 'Backup Now')} className="btn btn-primary">Backup Now</button>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {backup && [
                { label: 'Last successful', value: backup.lastSuccessful, status: backup.status },
                { label: 'Last failed', value: backup.lastFailed, status: backup.status === 'Healthy' ? 'Warning' : 'Critical' },
                { label: 'Backup size', value: backup.size, status: backup.status },
                { label: 'Destination', value: backup.destination, status: backup.status },
                { label: 'Schedule', value: backup.schedule, status: backup.status },
                { label: 'Retention', value: backup.retention, status: backup.status },
              ].map((item) => (
                <div key={item.label} className="rounded-3xl bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{item.label}</p>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-lg font-semibold text-slate-900">{item.value}</p>
                    <HealthStatusBadge status={item.status} className="text-[10px]" />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-left text-sm text-slate-600">
                <thead className="border-b border-slate-200 text-slate-900">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Size</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Duration</th>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {backup?.history.map((item) => (
                    <tr key={item.date + item.type} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3">{item.date}</td>
                      <td className="px-4 py-3">{item.type}</td>
                      <td className="px-4 py-3">{item.size}</td>
                      <td className="px-4 py-3"><HealthStatusBadge status={item.status} /></td>
                      <td className="px-4 py-3">{item.duration}</td>
                      <td className="px-4 py-3">{item.location}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button className="btn btn-outline px-3 py-1 text-xs">Verify Backup</button>
                          <button className="btn btn-outline px-3 py-1 text-xs">View History</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Security Health</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">SSL, auth and configuration checks</p>
            </div>
            <HealthStatusBadge status={security?.sslStatus === 'Valid' ? 'Healthy' : 'Warning'} />
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {security && [
              { label: 'SSL status', value: security.sslStatus, status: security.sslStatus === 'Valid' ? 'Healthy' : 'Warning' },
              { label: 'HTTPS status', value: security.httpsStatus, status: security.httpsStatus === 'Enabled' ? 'Healthy' : 'Warning' },
              { label: 'SSL expiry', value: security.sslExpiry, status: security.sslExpiry.includes('days') && parseInt(security.sslExpiry, 10) < 30 ? 'Warning' : 'Healthy' },
              { label: 'Failed logins', value: security.failedLogins.toString(), status: security.failedLogins > 10 ? 'Warning' : 'Healthy' },
              { label: 'API auth failures', value: security.apiAuthFailures.toString(), status: security.apiAuthFailures > 0 ? 'Warning' : 'Healthy' },
              { label: 'Expired tokens', value: security.expiredTokens.toString(), status: security.expiredTokens > 0 ? 'Warning' : 'Healthy' },
            ].map((item) => (
              <div key={item.label} className="rounded-3xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{item.label}</p>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-lg font-semibold text-slate-900">{item.value}</p>
                  <HealthStatusBadge status={item.status} className="text-[10px]" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Error & Log Monitoring</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">Recent critical and warning logs</p>
            </div>
            <button className="btn btn-outline">View Related Logs</button>
          </div>
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-left text-sm text-slate-600">
              <thead className="border-b border-slate-200 text-slate-900">
                <tr>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Service</th>
                  <th className="px-4 py-3">Error</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={`${log.time}-${log.service}`} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">{log.time}</td>
                    <td className="px-4 py-3">{log.service}</td>
                    <td className="px-4 py-3">{log.error}</td>
                    <td className="px-4 py-3"><HealthStatusBadge status={log.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button className="btn btn-outline px-3 py-1 text-xs">View Details</button>
                        <button className="btn btn-outline px-3 py-1 text-xs">Mark Resolved</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Performance Monitoring</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">Performance trend charts</p>
            </div>
            <div className="text-sm text-slate-500">Live metrics over time</div>
          </div>
          <div className="mt-6 grid gap-4">
            <div className="h-64 rounded-3xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-700">Server CPU (%)</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={performance?.serverCpu || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="time" tick={{ fill: '#475569' }} />
                  <YAxis tick={{ fill: '#475569' }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="value" stroke="#0ea5e9" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="h-64 rounded-3xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-700">API Response (ms)</p>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={performance?.apiResponse || []}>
                    <defs>
                      <linearGradient id="apiGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#34d399" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#34d399" stopOpacity={0.1} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="time" tick={{ fill: '#475569' }} />
                    <YAxis tick={{ fill: '#475569' }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="value" stroke="#059669" fillOpacity={1} fill="url(#apiGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="h-64 rounded-3xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-700">Database Query (ms)</p>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={performance?.databaseQuery || []}>
                    <defs>
                      <linearGradient id="dbGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.1} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="time" tick={{ fill: '#475569' }} />
                    <YAxis tick={{ fill: '#475569' }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="value" stroke="#d97706" fillOpacity={1} fill="url(#dbGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Uptime Monitoring</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">Availability and downtime</p>
            </div>
            <HealthStatusBadge status={overview?.status ?? 'Offline'} />
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {uptime && [
              { label: 'Current uptime', value: `${uptime.current}%` },
              { label: 'Daily uptime', value: `${uptime.daily}%` },
              { label: 'Weekly uptime', value: `${uptime.weekly}%` },
              { label: 'Monthly uptime', value: `${uptime.monthly}%` },
              { label: 'Downtime', value: `${uptime.downtimeMinutes} min` },
              { label: 'Incidents', value: uptime.incidents.toString() },
            ].map((item) => (
              <div key={item.label} className="rounded-3xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{item.label}</p>
                <p className="mt-3 text-lg font-semibold text-slate-900">{item.value}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 h-64 rounded-3xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-700">Uptime history</p>
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={history?.[0]?.trend || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fill: '#475569' }} />
                <YAxis tick={{ fill: '#475569' }} />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Alerts & Incidents</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">Proactive notification and resolution</p>
            </div>
            <button className="btn btn-outline">View details</button>
          </div>
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-left text-sm text-slate-600">
              <thead className="border-b border-slate-200 text-slate-900">
                <tr>
                  <th className="px-4 py-3">Alert</th>
                  <th className="px-4 py-3">Service</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Current</th>
                  <th className="px-4 py-3">Threshold</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {safeAlerts.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{item.title}</td>
                    <td className="px-4 py-3">{item.service}</td>
                    <td className="px-4 py-3">{item.severity}</td>
                    <td className="px-4 py-3">{item.time}</td>
                    <td className="px-4 py-3">{item.currentValue}</td>
                    <td className="px-4 py-3">{item.threshold}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button onClick={async () => { await resolveAlert(item.id); showSuccess('Alert resolved', `${item.title} has been resolved`); }} className="btn btn-outline px-3 py-1 text-xs">Resolve</button>
                        <button className="btn btn-outline px-3 py-1 text-xs">Snooze</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">History & Trends</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">Operational performance over time</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {history?.map((item) => (
                <button key={item.range} onClick={() => setHistory([item] as any)} className="btn btn-outline px-4 py-2 text-xs">{item.range}</button>
              ))}
            </div>
          </div>
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-left text-sm text-slate-600">
              <thead className="border-b border-slate-200 text-slate-900">
                <tr>
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3">Uptime</th>
                  <th className="px-4 py-3">API Availability</th>
                  <th className="px-4 py-3">Server Usage</th>
                  <th className="px-4 py-3">DB Response</th>
                  <th className="px-4 py-3">Errors</th>
                  <th className="px-4 py-3">Backup Status</th>
                </tr>
              </thead>
              <tbody>
                {history?.map((item) => (
                  <tr key={item.range} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{item.range}</td>
                    <td className="px-4 py-3">{item.trend[item.trend.length - 1]?.value ?? '—'}%</td>
                    <td className="px-4 py-3">{item.trend[item.trend.length - 1]?.value ?? '—'}%</td>
                    <td className="px-4 py-3">{item.trend[item.trend.length - 1]?.value ?? '—'}%</td>
                    <td className="px-4 py-3">{item.trend[item.trend.length - 1]?.value ?? '—'} ms</td>
                    <td className="px-4 py-3">{item.trend.length}</td>
                    <td className="px-4 py-3"><HealthStatusBadge status="Healthy" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Service Status Grid</p>
          <p className="mt-2 text-xl font-semibold text-slate-900">Compact health indicators</p>
          <div className="mt-6">
            <ServiceStatusGrid items={serviceStatuses} />
          </div>
        </div>
      </div>

      <TestConnectionModal isOpen={testModal.open} title={testModal.title} message={testModal.message} onClose={() => setTestModal((prev) => ({ ...prev, open: false }))} />
      <TestConnectionModal isOpen={detailsModal.open} title={detailsModal.title} message={detailsModal.description} onClose={() => setDetailsModal((prev) => ({ ...prev, open: false }))} />
    </div>
  );
}
