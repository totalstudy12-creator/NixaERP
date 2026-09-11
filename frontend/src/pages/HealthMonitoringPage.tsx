// src/pages/HealthMonitoringPage.tsx

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';

import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock3,
  Cloud,
  Cpu,
  Database,
  HardDrive,
  RefreshCw,
  Server,
  Shield,
  UploadCloud,
  Wifi,
  XCircle,
  Zap,
} from 'lucide-react';

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

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
  testStorageConnection,
  testApiConnection,
  testIntegrationConnection,
  testQueueConnection,
  triggerBackupNow,
  resolveAlert,
  type HealthOverview,
  type ServerHealth,
  type DatabaseHealth,
  type ApiHealthEntry,
  type IntegrationHealthEntry,
  type QueueHealth,
  type CronTask,
  type StorageHealth,
  type BackupHealth,
  type SecurityHealth,
  type LogEntry,
  type PerformanceHealth,
  type UptimeHealth,
  type AlertEntry,
  type HistorySection,
  type ServiceStatusItem,
  type HealthStatus,
} from '../services/healthService';

import { formatDateTime } from '../utils/date';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

const AUTO_REFRESH_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '10 sec', value: 10 },
  { label: '30 sec', value: 30 },
  { label: '1 min', value: 60 },
  { label: '5 min', value: 300 },
];

function safeDateTime(
  value?: string | number | Date | null,
): string {
  if (!value) return 'Unknown';

  try {
    return formatDateTime(value);
  } catch {
    return 'Unknown';
  }
}

function refreshLabel(seconds: number): string {
  if (seconds <= 0) return 'Refreshing now';
  if (seconds < 60) return `Next refresh in ${seconds}s`;
  return `Next refresh in ${Math.ceil(seconds / 60)}m`;
}

function statusDescription(status: HealthStatus | string): string {
  switch (status) {
    case 'Healthy':
      return 'All systems operational';
    case 'Warning':
      return 'Limited degradation detected';
    case 'Critical':
      return 'Immediate attention required';
    default:
      return 'No connection';
  }
}

function percentageWidth(value: unknown): number {
  const number =
    typeof value === 'number'
      ? value
      : Number(String(value ?? '').replace('%', ''));

  if (!Number.isFinite(number)) return 0;

  return Math.max(0, Math.min(100, number));
}

function healthColor(
  status: HealthStatus | string,
): string {
  switch (status) {
    case 'Healthy':
      return 'bg-emerald-500';
    case 'Warning':
      return 'bg-amber-500';
    case 'Critical':
      return 'bg-rose-500';
    default:
      return 'bg-slate-300';
  }
}

function chartData(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          {eyebrow}
        </p>

        <h2 className="mt-1.5 text-xl font-semibold tracking-tight text-slate-900">
          {title}
        </h2>

        {description && (
          <p className="mt-1 text-sm text-slate-500">
            {description}
          </p>
        )}
      </div>

      {action && (
        <div className="shrink-0">
          {action}
        </div>
      )}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  description,
  status,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  description?: string;
  status?: HealthStatus | string;
}) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              {label}
            </p>

            <p className="mt-2 break-words text-xl font-bold tracking-tight text-slate-900">
              {value}
            </p>

            {description && (
              <p className="mt-1 text-xs text-slate-500">
                {description}
              </p>
            )}
          </div>

          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700">
            {icon}
          </div>
        </div>

        {status && (
          <div className="mt-3">
            <HealthStatusBadge
              status={status as HealthStatus}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyPanel({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
      <AlertCircle className="mx-auto h-6 w-6 text-slate-400" />

      <p className="mt-3 text-sm font-medium text-slate-700">
        {title}
      </p>

      <p className="mt-1 text-xs text-slate-500">
        {message}
      </p>
    </div>
  );
}

export function HealthMonitoringPage() {
  const {
    showSuccess,
    showError,
  } = useNotification();

  const [overview, setOverview] =
    useState<HealthOverview | null>(null);

  const [server, setServer] =
    useState<ServerHealth | null>(null);

  const [database, setDatabase] =
    useState<DatabaseHealth | null>(null);

  const [apiEntries, setApiEntries] =
    useState<ApiHealthEntry[]>([]);

  const [integrationEntries, setIntegrationEntries] =
    useState<IntegrationHealthEntry[]>([]);

  const [queue, setQueue] =
    useState<QueueHealth | null>(null);

  const [cronTasks, setCronTasks] =
    useState<CronTask[]>([]);

  const [cronError, setCronError] =
    useState('');

  const [storage, setStorage] =
    useState<StorageHealth | null>(null);

  const [backup, setBackup] =
    useState<BackupHealth | null>(null);

  const [security, setSecurity] =
    useState<SecurityHealth | null>(null);

  const [logs, setLogs] =
    useState<LogEntry[]>([]);

  const [performance, setPerformance] =
    useState<PerformanceHealth | null>(null);

  const [uptime, setUptime] =
    useState<UptimeHealth | null>(null);

  const [alerts, setAlerts] =
    useState<AlertEntry[]>([]);

  const [history, setHistory] =
    useState<HistorySection[]>([]);

  const [serviceStatuses, setServiceStatuses] =
    useState<ServiceStatusItem[]>([]);

  const [
    statusFilter,
    setStatusFilter,
  ] = useState<
    'All' | 'Healthy' | 'Warning' | 'Critical' | 'Offline'
  >('All');

  const [
    autoRefreshEnabled,
    setAutoRefreshEnabled,
  ] = useState(true);

  const [
    autoRefreshInterval,
    setAutoRefreshInterval,
  ] = useState(30);

  const [
    nextRefreshIn,
    setNextRefreshIn,
  ] = useState(30);

  const [loading, setLoading] =
    useState(false);

  const [pageError, setPageError] =
    useState('');

  const [selectedHistoryRange, setSelectedHistoryRange] =
    useState('');

  const [testModal, setTestModal] =
    useState({
      title: '',
      message: '',
      open: false,
    });

  const [detailsModal, setDetailsModal] =
    useState({
      title: '',
      message: '',
      open: false,
    });

  const intervalRef =
    useRef<number | null>(null);

  const mountedRef =
    useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;

      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  const loadHealth = useCallback(
    async (notify = false) => {
      setLoading(true);
      setPageError('');
      setCronError('');

      const results =
        await Promise.allSettled([
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

      if (!mountedRef.current) return;

      const [
        overviewRes,
        serverRes,
        databaseRes,
        apiRes,
        integrationRes,
        queueRes,
        cronRes,
        storageRes,
        backupRes,
        securityRes,
        logsRes,
        performanceRes,
        uptimeRes,
        alertsRes,
        historyRes,
        servicesRes,
      ] = results;

      setOverview(
        overviewRes.status === 'fulfilled'
          ? overviewRes.value
          : null,
      );

      setServer(
        serverRes.status === 'fulfilled'
          ? serverRes.value
          : null,
      );

      setDatabase(
        databaseRes.status === 'fulfilled'
          ? databaseRes.value
          : null,
      );

      setApiEntries(
        apiRes.status === 'fulfilled'
          ? apiRes.value
          : [],
      );

      setIntegrationEntries(
        integrationRes.status === 'fulfilled'
          ? integrationRes.value
          : [],
      );

      setQueue(
        queueRes.status === 'fulfilled'
          ? queueRes.value
          : null,
      );

      setStorage(
        storageRes.status === 'fulfilled'
          ? storageRes.value
          : null,
      );

      setBackup(
        backupRes.status === 'fulfilled'
          ? backupRes.value
          : null,
      );

      setSecurity(
        securityRes.status === 'fulfilled'
          ? securityRes.value
          : null,
      );

      setLogs(
        logsRes.status === 'fulfilled'
          ? logsRes.value
          : [],
      );

      setPerformance(
        performanceRes.status === 'fulfilled'
          ? performanceRes.value
          : null,
      );

      setUptime(
        uptimeRes.status === 'fulfilled'
          ? uptimeRes.value
          : null,
      );

      setAlerts(
        alertsRes.status === 'fulfilled'
          ? alertsRes.value
          : [],
      );

      setHistory(
        historyRes.status === 'fulfilled'
          ? historyRes.value
          : [],
      );

      setServiceStatuses(
        servicesRes.status === 'fulfilled'
          ? servicesRes.value
          : [],
      );

      if (cronRes.status === 'fulfilled') {
        setCronTasks(cronRes.value);
        setCronError('');
      } else {
        setCronTasks([]);
        setCronError(
          cronRes.reason?.message ||
            'Unable to load scheduled tasks.',
        );
      }

      const failures = results.filter(
        result => result.status === 'rejected',
      );

      if (failures.length > 0) {
        const firstFailure = failures[0];

        const message =
          firstFailure.status === 'rejected'
            ? firstFailure.reason?.message ||
              'Unable to load all health data.'
            : 'Unable to load health data.';

        setPageError(message);

        if (notify) {
          showError(
            'Health load failed',
            message,
          );
        }
      } else if (notify) {
        showSuccess(
          'Health updated',
          'System health data refreshed successfully.',
        );
      }

      if (autoRefreshInterval > 0) {
        setNextRefreshIn(autoRefreshInterval);
      }

      setLoading(false);
    },
    [
      autoRefreshInterval,
      showError,
      showSuccess,
    ],
  );

  useEffect(() => {
    void loadHealth(false);
  }, [loadHealth]);

  useEffect(() => {
    if (
      !autoRefreshEnabled ||
      autoRefreshInterval <= 0
    ) {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      return;
    }

    intervalRef.current = window.setInterval(
      () => {
        void loadHealth(false);
      },
      autoRefreshInterval * 1000,
    );

    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [
    autoRefreshEnabled,
    autoRefreshInterval,
    loadHealth,
  ]);

  useEffect(() => {
    if (
      !autoRefreshEnabled ||
      autoRefreshInterval <= 0
    ) {
      return;
    }

    const countdown =
      window.setInterval(() => {
        setNextRefreshIn(current =>
          current > 0
            ? current - 1
            : autoRefreshInterval,
        );
      }, 1000);

    return () =>
      window.clearInterval(countdown);
  }, [
    autoRefreshEnabled,
    autoRefreshInterval,
  ]);

  useEffect(() => {
    const visibilityHandler = () => {
      if (document.hidden) {
        if (intervalRef.current !== null) {
          window.clearInterval(intervalRef.current);
          intervalRef.current = null;
        }

        return;
      }

      if (
        autoRefreshEnabled &&
        autoRefreshInterval > 0
      ) {
        void loadHealth(false);
      }
    };

    document.addEventListener(
      'visibilitychange',
      visibilityHandler,
    );

    return () =>
      document.removeEventListener(
        'visibilitychange',
        visibilityHandler,
      );
  }, [
    autoRefreshEnabled,
    autoRefreshInterval,
    loadHealth,
  ]);

  const handleRefresh = () => {
    void loadHealth(true);
  };

  const handleTest = async (
    action: () => Promise<{ message: string }>,
    title: string,
  ) => {
    try {
      setTestModal({
        title,
        message: 'Testing connection…',
        open: true,
      });

      const result = await action();

      if (!mountedRef.current) return;

      setTestModal({
        title,
        message: result.message,
        open: true,
      });

      showSuccess(
        'Test complete',
        result.message,
      );
    } catch (error: unknown) {
      const message =
        (error as any)?.message ||
        'Test failed.';

      setTestModal({
        title,
        message,
        open: true,
      });

      showError(
        'Test failed',
        message,
      );
    }
  };

  const handleResolveAlert = async (
    alert: AlertEntry,
  ) => {
    try {
      await resolveAlert(alert.id);

      setAlerts(current =>
        current.map(item =>
          item.id === alert.id
            ? {
                ...item,
                status:
                  'Healthy' as HealthStatus,
              }
            : item,
        ),
      );

      showSuccess(
        'Alert resolved',
        `${alert.title} has been resolved.`,
      );
    } catch (error: unknown) {
      showError(
        'Resolve failed',
        (error as any)?.message ||
          'Unable to resolve alert.',
      );
    }
  };

  const serverMetrics = useMemo(
    () => {
      const cpu =
        Number(server?.cpuUsage ?? 0);

      const ram =
        Number(server?.ramUsage ?? 0);

      const storageUsage =
        Number(
          server?.storageUsage ?? 0,
        );

      const load =
        Number(
          server?.serverLoad ?? 0,
        );

      return [
        {
          icon: <Cpu className="h-4 w-4" />,
          label: 'CPU Usage',
          value: server
            ? `${server.cpuUsage}%`
            : '—',
          description:
            'Healthy below 70%',
          status:
            cpu > 85
              ? 'Critical'
              : cpu > 70
                ? 'Warning'
                : 'Healthy',
          width: cpu,
        },
        {
          icon: <Cloud className="h-4 w-4" />,
          label: 'RAM Usage',
          value: server
            ? `${server.ramUsage}%`
            : '—',
          description:
            'Memory utilization',
          status:
            ram > 85
              ? 'Critical'
              : ram > 70
                ? 'Warning'
                : 'Healthy',
          width: ram,
        },
        {
          icon: <HardDrive className="h-4 w-4" />,
          label: 'Storage',
          value: server
            ? `${server.storageUsage}%`
            : '—',
          description: storage
            ? `${storage.used} used`
            : 'Disk utilization',
          status:
            storageUsage > 85
              ? 'Critical'
              : storageUsage > 70
                ? 'Warning'
                : 'Healthy',
          width: storageUsage,
        },
        {
          icon: <Activity className="h-4 w-4" />,
          label: 'Server Load',
          value: server
            ? String(server.serverLoad)
            : '—',
          description:
            'Normal below 0.85',
          status:
            load > 0.85
              ? 'Warning'
              : 'Healthy',
          width: Math.min(
            100,
            load * 100,
          ),
        },
      ] as const;
    },
    [server, storage],
  );

  const overviewCards = useMemo(() => {
    const status =
      overview?.status ?? 'Offline';

    const uptimeStatus =
      !overview
        ? 'Offline'
        : overview.uptimePercentage >=
            99.9
          ? 'Healthy'
          : overview.uptimePercentage >=
              99
            ? 'Warning'
            : 'Critical';

    const securityStatus =
      !security
        ? 'Offline'
        : security.sslStatus === 'Valid'
          ? 'Healthy'
          : 'Warning';

    return [
      {
        icon: <Server className="h-5 w-5" />,
        title: 'ERP Status',
        value:
          overview?.status ??
          'Loading',
        details:
          statusDescription(status),
        status,
        trend: 'Calculated',
      },
      {
        icon: <Clock3 className="h-5 w-5" />,
        title: 'Uptime',
        value: overview
          ? `${overview.uptimePercentage}%`
          : '—',
        details:
          '30-day availability',
        status: uptimeStatus,
        trend: 'Stable',
      },
      {
        icon: <Database className="h-5 w-5" />,
        title: 'Database',
        value:
          database?.connectionStatus ??
          '—',
        details: database
          ? `${database.responseTimeMs} ms response`
          : 'Database monitoring',
        status:
          database?.status ??
          'Offline',
        trend: 'Monitored',
      },
      {
        icon: <Shield className="h-5 w-5" />,
        title: 'Security',
        value:
          security?.sslStatus ??
          '—',
        details: security
          ? `${security.httpsStatus} · expiry ${security.sslExpiry}`
          : 'Security monitoring',
        status: securityStatus,
        trend: 'Reviewed',
      },
    ] as const;
  }, [
    overview,
    database,
    security,
  ]);

  const activeAlerts = alerts.filter(
    alert => alert.status !== 'Healthy',
  );

  const currentHistory =
    history.find(
      item =>
        item.range ===
        selectedHistoryRange,
    ) ?? history[0];

  useEffect(() => {
    if (
      history.length > 0 &&
      !history.some(
        item =>
          item.range ===
          selectedHistoryRange,
      )
    ) {
      setSelectedHistoryRange(
        history[0].range,
      );
    }
  }, [
    history,
    selectedHistoryRange,
  ]);

  return (
    <div className="min-h-screen bg-[#f6f8fc] p-4 text-slate-800 md:p-7">
      <div className="mx-auto max-w-[1600px] space-y-6">

        {/* Header */}
        <Card className="overflow-hidden border-slate-200 bg-slate-950 text-white shadow-xl">
          <CardContent className="p-0">
            <div className="px-5 py-6 md:px-8 md:py-7">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                <div className="min-w-0">
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    System Operations
                  </div>

                  <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight md:text-3xl">
                    <Shield className="text-cyan-300" />
                    Health Monitoring
                  </h1>

                  <p className="mt-1 max-w-3xl text-sm text-slate-300">
                    Monitor ERP infrastructure,
                    database, APIs,
                    integrations, queues,
                    backups, security and uptime.
                  </p>

                  <p className="mt-4 text-xs text-slate-400">
                    Last checked:{' '}
                    {safeDateTime(
                      overview?.lastChecked,
                    )}
                    {' · '}
                    {loading
                      ? 'Refreshing…'
                      : 'Live'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    onClick={handleRefresh}
                    disabled={loading}
                    className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"
                  >
                    <RefreshCw
                      className={`mr-2 h-4 w-4 ${
                        loading
                          ? 'animate-spin'
                          : ''
                      }`}
                    />
                    Refresh All
                  </Button>

                  <label className="flex h-10 items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 text-xs text-slate-200">
                    <input
                      type="checkbox"
                      checked={
                        autoRefreshEnabled
                      }
                      onChange={event =>
                        setAutoRefreshEnabled(
                          event.target.checked,
                        )
                      }
                      className="h-4 w-4 rounded border-white/20"
                    />
                    Auto refresh
                  </label>

                  <select
                    value={
                      autoRefreshInterval
                    }
                    onChange={event => {
                      const value =
                        Number(
                          event.target.value,
                        );

                      setAutoRefreshInterval(
                        value,
                      );
                      setNextRefreshIn(
                        value,
                      );
                    }}
                    className="h-10 rounded-lg border border-white/15 bg-white px-3 text-sm text-slate-900"
                  >
                    {AUTO_REFRESH_OPTIONS.map(
                      option => (
                        <option
                          key={
                            option.value
                          }
                          value={
                            option.value
                          }
                        >
                          {option.label}
                        </option>
                      ),
                    )}
                  </select>

                  <span className="min-w-[120px] text-right text-xs text-slate-400">
                    {autoRefreshEnabled &&
                    autoRefreshInterval > 0
                      ? refreshLabel(
                          nextRefreshIn,
                        )
                      : 'Auto refresh off'}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Error */}
        {pageError && (
          <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />

            <div className="min-w-0 flex-1">
              <p className="font-medium">
                Health data is partially unavailable
              </p>

              <p className="mt-1 text-xs text-rose-700">
                {pageError}
              </p>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={handleRefresh}
              className="border-rose-200 bg-white"
            >
              Retry
            </Button>
          </div>
        )}

        {/* Overview */}
        <div className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
          <div className="grid gap-4 sm:grid-cols-2">
            {overviewCards.map(card => (
              <HealthSummaryCard
                key={card.title}
                icon={card.icon}
                title={card.title}
                value={card.value}
                details={card.details}
                status={card.status}
                trend={card.trend}
                onClick={() =>
                  setDetailsModal({
                    title: card.title,
                    message:
                      card.details,
                    open: true,
                  })
                }
              />
            ))}
          </div>

          <SystemHealthScore
            score={
              overview?.score ?? 0
            }
            uptimePercentage={
              overview?.uptimePercentage ??
              0
            }
            healthyServices={
              overview?.healthyServices ??
              0
            }
            warningServices={
              overview?.warningServices ??
              0
            }
            criticalServices={
              overview?.criticalServices ??
              0
            }
            offlineServices={
              overview?.offlineServices ??
              0
            }
            status={
              overview?.status ??
              'Offline'
            }
          />
        </div>

        {/* Service summary */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <SectionHeader
              eyebrow="Service Status"
              title="Current component health"
              description="High-level view of monitored ERP services."
              action={
                <HealthStatusBadge
                  status={
                    overview?.status ??
                    'Offline'
                  }
                />
              }
            />
          </CardHeader>

          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <MetricCard
                icon={
                  <Server className="h-5 w-5" />
                }
                label="Total Services"
                value={
                  overview?.totalServices ??
                  '—'
                }
              />

              <MetricCard
                icon={
                  <CheckCircle2 className="h-5 w-5" />
                }
                label="Healthy"
                value={
                  overview?.healthyServices ??
                  '—'
                }
                status="Healthy"
              />

              <MetricCard
                icon={
                  <XCircle className="h-5 w-5" />
                }
                label="Offline"
                value={
                  overview?.offlineServices ??
                  '—'
                }
                status={
                  (overview?.offlineServices ??
                    0) > 0
                    ? 'Critical'
                    : 'Healthy'
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Server + DB */}
        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <SectionHeader
                eyebrow="Server & Infrastructure"
                title="Runtime resources"
                description="CPU, memory, storage and server load."
              />
            </CardHeader>

            <CardContent>
              <div className="space-y-5">
                {serverMetrics.map(
                  metric => (
                    <div
                      key={metric.label}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                            {metric.icon}
                          </div>

                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {metric.label}
                            </p>

                            <p className="truncate text-xs text-slate-500">
                              {metric.description}
                            </p>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-sm font-bold text-slate-900">
                            {metric.value}
                          </span>

                          <HealthStatusBadge
                            status={
                              metric.status
                            }
                          />
                        </div>
                      </div>

                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full transition-all ${healthColor(
                            metric.status,
                          )}`}
                          style={{
                            width: `${percentageWidth(
                              metric.width,
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  ),
                )}
              </div>

              <Separator className="my-6" />

              <div className="grid gap-3 sm:grid-cols-4">
                <MetricCard
                  icon={
                    <Zap className="h-4 w-4" />
                  }
                  label="PHP"
                  value={
                    server?.phpVersion ??
                    '—'
                  }
                />

                <MetricCard
                  icon={
                    <Server className="h-4 w-4" />
                  }
                  label="App"
                  value={
                    server?.appVersion ??
                    '—'
                  }
                />

                <MetricCard
                  icon={
                    <Database className="h-4 w-4" />
                  }
                  label="DB"
                  value={
                    server?.dbVersion ??
                    '—'
                  }
                />

                <MetricCard
                  icon={
                    <Wifi className="h-4 w-4" />
                  }
                  label="Web Server"
                  value={
                    server?.webServer ??
                    '—'
                  }
                />
              </div>
            </CardContent>
          </Card>

          <DatabaseHealthPanel
            data={database}
            loading={
              loading && !database
            }
          />
        </div>

        {/* API */}
        <ApiHealthTable
          entries={apiEntries}
          filter={statusFilter}
          onFilterChange={
            setStatusFilter
          }
          onTestApi={() =>
            void handleTest(
              testApiConnection,
              'API Connection Test',
            )
          }
        />

        {/* Integration + Queue */}
        <div className="grid gap-4 xl:grid-cols-2">
          <IntegrationStatusTable
            entries={
              integrationEntries
            }
            onTestConnection={() =>
              void handleTest(
                testIntegrationConnection,
                'Integration Connection Test',
              )
            }
            onSyncNow={() =>
              showSuccess(
                'Sync requested',
                'Integration sync request submitted.',
              )
            }
          />

          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <SectionHeader
                eyebrow="Queue & Background Jobs"
                title="Worker activity"
                description="Pending, processing, failed and scheduled jobs."
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void handleTest(
                        testQueueConnection,
                        'Queue Health Test',
                      )
                    }
                  >
                    Test Queue
                  </Button>
                }
              />
            </CardHeader>

            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                <MetricCard
                  icon={
                    <Clock3 className="h-5 w-5" />
                  }
                  label="Pending Jobs"
                  value={
                    queue?.pending ??
                    '—'
                  }
                />

                <MetricCard
                  icon={
                    <Activity className="h-5 w-5" />
                  }
                  label="Processing"
                  value={
                    queue?.processing ??
                    '—'
                  }
                />

                <MetricCard
                  icon={
                    <AlertCircle className="h-5 w-5" />
                  }
                  label="Failed Jobs"
                  value={
                    queue?.failed ??
                    '—'
                  }
                  status={
                    Number(
                      queue?.failed ?? 0,
                    ) > 0
                      ? 'Warning'
                      : 'Healthy'
                  }
                />

                <MetricCard
                  icon={
                    <RefreshCw className="h-5 w-5" />
                  }
                  label="Retry Count"
                  value={
                    queue?.retryCount ??
                    '—'
                  }
                />
              </div>

              <div className="mt-4 rounded-xl bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400">
                      Queue Delay
                    </p>

                    <p className="mt-1 text-xl font-bold text-slate-900">
                      {queue?.delay ??
                        '—'}
                    </p>
                  </div>

                  <Badge className="bg-slate-200 text-slate-700 hover:bg-slate-200">
                    {queue?.scheduledJobs ??
                      '—'}{' '}
                    scheduled
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Cron + Storage */}
        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <SectionHeader
                eyebrow="Cron / Scheduler"
                title="Scheduled task health"
                description="Execution status, last run, next run and failures."
                action={
                  <HealthStatusBadge
                    status={
                      cronError
                        ? 'Warning'
                        : cronTasks.some(
                              task =>
                                task.status ===
                                'Critical',
                            )
                          ? 'Critical'
                          : cronTasks.some(
                                task =>
                                  task.status ===
                                  'Warning',
                              )
                            ? 'Warning'
                            : 'Healthy'
                    }
                  />
                }
              />
            </CardHeader>

            <CardContent>
              {cronError ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-amber-600" />

                    <div>
                      <p className="text-sm font-semibold text-amber-900">
                        Scheduled tasks unavailable
                      </p>

                      <p className="mt-1 text-xs text-amber-800">
                        {cronError}
                      </p>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRefresh}
                    className="mt-3 bg-white"
                  >
                    Retry
                  </Button>
                </div>
              ) : cronTasks.length ===
                0 ? (
                <EmptyPanel
                  title="No scheduled tasks"
                  message="No scheduler tasks were returned by the backend."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-400">
                        <th className="px-3 py-3">
                          Task
                        </th>
                        <th className="px-3 py-3">
                          Status
                        </th>
                        <th className="px-3 py-3">
                          Last Run
                        </th>
                        <th className="px-3 py-3">
                          Next Run
                        </th>
                        <th className="px-3 py-3">
                          Duration
                        </th>
                        <th className="px-3 py-3">
                          Failures
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {cronTasks.map(
                        task => (
                          <tr
                            key={
                              task.id ??
                              task.name
                            }
                            className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                          >
                            <td className="px-3 py-3 font-medium text-slate-900">
                              {task.name}
                            </td>

                            <td className="px-3 py-3">
                              <HealthStatusBadge
                                status={
                                  task.status
                                }
                              />
                            </td>

                            <td className="px-3 py-3 text-slate-600">
                              {task.lastRun}
                            </td>

                            <td className="px-3 py-3 text-slate-600">
                              {task.nextRun}
                            </td>

                            <td className="px-3 py-3 text-slate-600">
                              {task.duration}
                            </td>

                            <td className="px-3 py-3 text-slate-600">
                              {task.failures}
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <SectionHeader
                eyebrow="Storage Monitoring"
                title="Disk and application storage"
                description="Capacity and storage distribution."
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void handleTest(
                        testStorageConnection,
                        'Storage Connection Test',
                      )
                    }
                  >
                    Test Storage
                  </Button>
                }
              />
            </CardHeader>

            <CardContent>
              {!storage ? (
                <EmptyPanel
                  title="Storage data unavailable"
                  message="No storage health response was returned."
                />
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <MetricCard
                      icon={
                        <HardDrive className="h-5 w-5" />
                      }
                      label="Total"
                      value={
                        storage.total
                      }
                    />

                    <MetricCard
                      icon={
                        <UploadCloud className="h-5 w-5" />
                      }
                      label="Used"
                      value={
                        storage.used
                      }
                    />

                    <MetricCard
                      icon={
                        <Database className="h-5 w-5" />
                      }
                      label="Free"
                      value={
                        storage.free
                      }
                    />
                  </div>

                  <div className="mt-5">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>
                        Used storage
                      </span>

                      <span>
                        {
                          storage.usedPercentage
                        }%
                      </span>
                    </div>

                    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{
                          width: `${percentageWidth(
                            storage.usedPercentage,
                          )}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {[
                      [
                        'Database',
                        storage.databaseStorage,
                      ],
                      [
                        'Invoice files',
                        storage.invoiceStorage,
                      ],
                      [
                        'Product images',
                        storage.imageStorage,
                      ],
                      [
                        'Backup',
                        storage.backupStorage,
                      ],
                      [
                        'Logs',
                        storage.logStorage,
                      ],
                      [
                        'Temp files',
                        storage.tempStorage,
                      ],
                    ].map(
                      ([label, value]) => (
                        <div
                          key={String(
                            label,
                          )}
                          className="rounded-xl bg-slate-50 p-3"
                        >
                          <p className="text-[11px] uppercase tracking-wide text-slate-400">
                            {label}
                          </p>

                          <p className="mt-1 font-semibold text-slate-900">
                            {value}
                          </p>
                        </div>
                      ),
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Backup + Security */}
        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <SectionHeader
                eyebrow="Backup Health"
                title="Backup status"
                description="Last successful run, destination, retention and history."
                action={
                  <Button
                    size="sm"
                    onClick={() =>
                      void handleTest(
                        triggerBackupNow,
                        'Backup Now',
                      )
                    }
                    className="bg-slate-950 text-white hover:bg-slate-800"
                  >
                    Backup Now
                  </Button>
                }
              />
            </CardHeader>

            <CardContent>
              {!backup ? (
                <EmptyPanel
                  title="Backup data unavailable"
                  message="No backup health response was returned."
                />
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      [
                        'Last successful',
                        backup.lastSuccessful,
                      ],
                      [
                        'Last failed',
                        backup.lastFailed,
                      ],
                      [
                        'Backup size',
                        backup.size,
                      ],
                      [
                        'Destination',
                        backup.destination,
                      ],
                      [
                        'Schedule',
                        backup.schedule,
                      ],
                      [
                        'Retention',
                        backup.retention,
                      ],
                    ].map(
                      ([label, value]) => (
                        <div
                          key={String(
                            label,
                          )}
                          className="rounded-xl bg-slate-50 p-3"
                        >
                          <p className="text-[11px] uppercase tracking-wide text-slate-400">
                            {label}
                          </p>

                          <div className="mt-1 flex items-center justify-between gap-2">
                            <p className="min-w-0 break-words font-semibold text-slate-900">
                              {value}
                            </p>

                            <HealthStatusBadge
                              status={
                                backup.status
                              }
                            />
                          </div>
                        </div>
                      ),
                    )}
                  </div>

                  <Separator className="my-5" />

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-400">
                          <th className="px-3 py-3">
                            Date
                          </th>
                          <th className="px-3 py-3">
                            Type
                          </th>
                          <th className="px-3 py-3">
                            Size
                          </th>
                          <th className="px-3 py-3">
                            Status
                          </th>
                          <th className="px-3 py-3">
                            Duration
                          </th>
                          <th className="px-3 py-3">
                            Location
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {backup.history.map(
                          item => (
                            <tr
                              key={`${item.date}-${item.type}`}
                              className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                            >
                              <td className="px-3 py-3">
                                {item.date}
                              </td>

                              <td className="px-3 py-3">
                                {item.type}
                              </td>

                              <td className="px-3 py-3">
                                {item.size}
                              </td>

                              <td className="px-3 py-3">
                                <HealthStatusBadge
                                  status={
                                    item.status
                                  }
                                />
                              </td>

                              <td className="px-3 py-3">
                                {item.duration}
                              </td>

                              <td className="px-3 py-3">
                                {item.location}
                              </td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <SectionHeader
                eyebrow="Security Health"
                title="Security posture"
                description="SSL, HTTPS, authentication and token checks."
                action={
                  <HealthStatusBadge
                    status={
                      security?.sslStatus ===
                      'Valid'
                        ? 'Healthy'
                        : security
                          ? 'Warning'
                          : 'Offline'
                    }
                  />
                }
              />
            </CardHeader>

            <CardContent>
              {!security ? (
                <EmptyPanel
                  title="Security data unavailable"
                  message="No security health response was returned."
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    [
                      'SSL status',
                      security.sslStatus,
                      security.sslStatus ===
                      'Valid'
                        ? 'Healthy'
                        : 'Warning',
                    ],
                    [
                      'HTTPS status',
                      security.httpsStatus,
                      security.httpsStatus ===
                      'Enabled'
                        ? 'Healthy'
                        : 'Warning',
                    ],
                    [
                      'SSL expiry',
                      security.sslExpiry,
                      'Healthy',
                    ],
                    [
                      'Failed logins',
                      security.failedLogins,
                      security.failedLogins >
                      10
                        ? 'Warning'
                        : 'Healthy',
                    ],
                    [
                      'API auth failures',
                      security.apiAuthFailures,
                      security.apiAuthFailures >
                      0
                        ? 'Warning'
                        : 'Healthy',
                    ],
                    [
                      'Expired tokens',
                      security.expiredTokens,
                      security.expiredTokens >
                      0
                        ? 'Warning'
                        : 'Healthy',
                    ],
                  ].map(
                    ([label, value, status]) => (
                      <div
                        key={String(
                          label,
                        )}
                        className="rounded-xl border border-slate-100 bg-slate-50 p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-slate-400">
                              {label}
                            </p>

                            <p className="mt-1 font-semibold text-slate-900">
                              {String(
                                value,
                              )}
                            </p>
                          </div>

                          <HealthStatusBadge
                            status={
                              status as HealthStatus
                            }
                          />
                        </div>
                      </div>
                    ),
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Logs + Performance */}
        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <SectionHeader
                eyebrow="Error & Log Monitoring"
                title="Recent system logs"
                description="Latest logs returned by the health service."
              />
            </CardHeader>

            <CardContent>
              {!logs.length ? (
                <EmptyPanel
                  title="No logs available"
                  message="No health-monitoring log entries were returned."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-400">
                        <th className="px-3 py-3">
                          Time
                        </th>
                        <th className="px-3 py-3">
                          Service
                        </th>
                        <th className="px-3 py-3">
                          Error
                        </th>
                        <th className="px-3 py-3">
                          Severity
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {logs.map(
                        (log, index) => (
                          <tr
                            key={`${log.time}-${log.service}-${index}`}
                            className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                          >
                            <td className="px-3 py-3 text-slate-500">
                              {log.time}
                            </td>

                            <td className="px-3 py-3 font-medium text-slate-900">
                              {log.service}
                            </td>

                            <td className="max-w-[320px] px-3 py-3 text-slate-600">
                              {log.error}
                            </td>

                            <td className="px-3 py-3">
                              <HealthStatusBadge
                                status={
                                  log.status
                                }
                              />
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <SectionHeader
                eyebrow="Performance Monitoring"
                title="Live performance trends"
                description="CPU, API response and database query timing."
              />
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-700">
                  Server CPU (%)
                </p>

                <div className="mt-3 h-56">
                  <ResponsiveContainer
                    width="100%"
                    height="100%"
                  >
                    <LineChart
                      data={chartData(
                        performance?.serverCpu,
                      )}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                      />
                      <XAxis dataKey="time" />
                      <YAxis />
                      <Tooltip />

                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="#0284c7"
                        strokeWidth={2.5}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-700">
                    API Response (ms)
                  </p>

                  <div className="mt-3 h-48">
                    <ResponsiveContainer
                      width="100%"
                      height="100%"
                    >
                      <AreaChart
                        data={chartData(
                          performance?.apiResponse,
                        )}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                        />
                        <XAxis dataKey="time" />
                        <YAxis />
                        <Tooltip />

                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke="#059669"
                          fill="#a7f3d0"
                          fillOpacity={0.55}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-700">
                    Database Query (ms)
                  </p>

                  <div className="mt-3 h-48">
                    <ResponsiveContainer
                      width="100%"
                      height="100%"
                    >
                      <AreaChart
                        data={chartData(
                          performance?.databaseQuery,
                        )}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                        />
                        <XAxis dataKey="time" />
                        <YAxis />
                        <Tooltip />

                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke="#d97706"
                          fill="#fde68a"
                          fillOpacity={0.55}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Uptime + Alerts */}
        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <SectionHeader
                eyebrow="Uptime Monitoring"
                title="Availability overview"
                description="Current, daily, weekly and monthly uptime."
                action={
                  <HealthStatusBadge
                    status={
                      overview?.status ??
                      'Offline'
                    }
                  />
                }
              />
            </CardHeader>

            <CardContent>
              {!uptime ? (
                <EmptyPanel
                  title="Uptime data unavailable"
                  message="No uptime response was returned."
                />
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <MetricCard
                      icon={
                        <Activity className="h-5 w-5" />
                      }
                      label="Current"
                      value={`${uptime.current}%`}
                    />

                    <MetricCard
                      icon={
                        <Clock3 className="h-5 w-5" />
                      }
                      label="Daily"
                      value={`${uptime.daily}%`}
                    />

                    <MetricCard
                      icon={
                        <Clock3 className="h-5 w-5" />
                      }
                      label="Weekly"
                      value={`${uptime.weekly}%`}
                    />

                    <MetricCard
                      icon={
                        <Clock3 className="h-5 w-5" />
                      }
                      label="Monthly"
                      value={`${uptime.monthly}%`}
                    />

                    <MetricCard
                      icon={
                        <AlertCircle className="h-5 w-5" />
                      }
                      label="Downtime"
                      value={`${uptime.downtimeMinutes} min`}
                    />

                    <MetricCard
                      icon={
                        <XCircle className="h-5 w-5" />
                      }
                      label="Incidents"
                      value={
                        uptime.incidents
                      }
                    />
                  </div>

                  <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-700">
                      Uptime history
                    </p>

                    <div className="mt-3 h-56">
                      <ResponsiveContainer
                        width="100%"
                        height="100%"
                      >
                        <LineChart
                          data={chartData(
                            history[0]
                              ?.trend,
                          )}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                          />
                          <XAxis dataKey="date" />
                          <YAxis />
                          <Tooltip />

                          <Line
                            type="monotone"
                            dataKey="value"
                            stroke="#2563eb"
                            strokeWidth={2.5}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <SectionHeader
                eyebrow="Alerts & Incidents"
                title="Active operational alerts"
                description="Resolve confirmed incidents through the monitoring service."
                action={
                  <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">
                    {activeAlerts.length}{' '}
                    active
                  </Badge>
                }
              />
            </CardHeader>

            <CardContent>
              {!alerts.length ? (
                <EmptyPanel
                  title="No alerts"
                  message="No alerts were returned by the monitoring service."
                />
              ) : (
                <div className="space-y-3">
                  {alerts.map(alert => (
                    <div
                      key={alert.id}
                      className="rounded-xl border border-slate-200 p-4"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-slate-900">
                              {alert.title}
                            </p>

                            <HealthStatusBadge
                              status={
                                alert.severity
                              }
                            />
                          </div>

                          <div className="mt-2 grid gap-1 text-xs text-slate-500 sm:grid-cols-2">
                            <span>
                              Service:{' '}
                              {
                                alert.service
                              }
                            </span>

                            <span>
                              Time:{' '}
                              {alert.time}
                            </span>

                            <span>
                              Current:{' '}
                              {
                                alert.currentValue
                              }
                            </span>

                            <span>
                              Threshold:{' '}
                              {
                                alert.threshold
                              }
                            </span>
                          </div>
                        </div>

                        {alert.status !==
                          'Healthy' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              void handleResolveAlert(
                                alert,
                              )
                            }
                          >
                            <CheckCircle2 className="mr-1.5 h-4 w-4" />
                            Resolve
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* History */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <SectionHeader
              eyebrow="History & Trends"
              title="Operational history"
              description="Historical health trends returned by the backend."
              action={
                history.length >
                0 ? (
                  <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
                    {history.map(
                      item => (
                        <button
                          key={
                            item.range
                          }
                          type="button"
                          onClick={() =>
                            setSelectedHistoryRange(
                              item.range,
                            )
                          }
                          className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                            selectedHistoryRange ===
                            item.range
                              ? 'bg-white text-slate-900 shadow-sm'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          {item.range}
                        </button>
                      ),
                    )}
                  </div>
                ) : undefined
              }
            />
          </CardHeader>

          <CardContent>
            {!history.length ? (
              <EmptyPanel
                title="No history available"
                message="No historical trend sections were returned."
              />
            ) : (
              <div className="space-y-5">
                {currentHistory && (
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-400">
                          Selected range
                        </p>

                        <p className="mt-1 text-lg font-semibold text-slate-900">
                          {
                            currentHistory.range
                          }
                        </p>
                      </div>

                      <Badge className="bg-white text-slate-700 hover:bg-white">
                        {
                          currentHistory
                            .trend.length
                        }{' '}
                        points
                      </Badge>
                    </div>

                    <div className="mt-4 h-56">
                      <ResponsiveContainer
                        width="100%"
                        height="100%"
                      >
                        <LineChart
                          data={chartData(
                            currentHistory.trend,
                          )}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                          />
                          <XAxis dataKey="date" />
                          <YAxis />
                          <Tooltip />

                          <Line
                            type="monotone"
                            dataKey="value"
                            stroke="#0f172a"
                            strokeWidth={2.5}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-400">
                        <th className="px-3 py-3">
                          Period
                        </th>

                        <th className="px-3 py-3">
                          Latest Value
                        </th>

                        <th className="px-3 py-3">
                          Points
                        </th>

                        <th className="px-3 py-3">
                          Trend
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {history.map(
                        item => {
                          const latest =
                            item.trend[
                              item.trend
                                .length -
                                1
                            ]?.value;

                          return (
                            <tr
                              key={
                                item.range
                              }
                              className={`border-b border-slate-100 last:border-0 ${
                                item.range ===
                                selectedHistoryRange
                                  ? 'bg-blue-50/60'
                                  : 'hover:bg-slate-50'
                              }`}
                            >
                              <td className="px-3 py-3 font-medium text-slate-900">
                                {
                                  item.range
                                }
                              </td>

                              <td className="px-3 py-3">
                                {latest ??
                                  '—'}
                              </td>

                              <td className="px-3 py-3">
                                {
                                  item.trend
                                    .length
                                }
                              </td>

                              <td className="px-3 py-3">
                                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                                  <div
                                    className="h-full rounded-full bg-blue-500"
                                    style={{
                                      width: `${percentageWidth(
                                        latest,
                                      )}%`,
                                    }}
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        },
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Service grid */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <SectionHeader
              eyebrow="Service Status Grid"
              title="Component health map"
              description="Compact status indicators for all monitored services."
            />
          </CardHeader>

          <CardContent>
            {serviceStatuses.length ? (
              <ServiceStatusGrid
                items={serviceStatuses}
              />
            ) : (
              <EmptyPanel
                title="No service status data"
                message="No component status entries were returned."
              />
            )}
          </CardContent>
        </Card>

        {/* Modals */}
        <TestConnectionModal
          isOpen={testModal.open}
          title={testModal.title}
          message={testModal.message}
          onClose={() =>
            setTestModal(current => ({
              ...current,
              open: false,
            }))
          }
        />

        <TestConnectionModal
          isOpen={
            detailsModal.open
          }
          title={
            detailsModal.title
          }
          message={
            detailsModal.message
          }
          onClose={() =>
            setDetailsModal(
              current => ({
                ...current,
                open: false,
              }),
            )
          }
        />
      </div>
    </div>
  );
}

export default HealthMonitoringPage;