import { apiClient } from '../api';

export type HealthStatus = 'Healthy' | 'Warning' | 'Critical' | 'Offline';
export type HealthConnectionStatus = 'Connected' | 'Disconnected' | 'Warning' | 'Authentication Error';

export interface HealthOverview {
  status: HealthStatus;
  score: number;
  uptimePercentage: number;
  totalServices: number;
  healthyServices: number;
  warningServices: number;
  criticalServices: number;
  offlineServices: number;
  lastChecked: string;
}

export interface ServerHealth {
  cpuUsage: number;
  ramUsage: number;
  storageUsage: number;
  serverLoad: number;
  diskRead: string;
  diskWrite: string;
  networkUpload: string;
  networkDownload: string;
  serverUptime: string;
  phpVersion: string;
  appVersion: string;
  dbVersion: string;
  webServer: string;
}

export interface DatabaseHealth {
  status: HealthStatus;
  connectionStatus: string;
  responseTimeMs: number;
  databaseSize: string;
  tables: number;
  activeConnections: number;
  maxConnections: number;
  failedConnections: number;
  slowQueries: number;
  failedQueries: number;
  errors: number;
  lastBackup: string;
  backupSize: string;
}

export interface ApiHealthEntry {
  endpoint: string;
  method: string;
  status: HealthStatus;
  responseTimeMs: number;
  requestCount: number;
  errors: number;
  httpStatus: number;
  lastSuccessful: string;
  lastFailed?: string;
  timeouts: number;
  rateLimitStatus: string;
}

export interface IntegrationHealthEntry {
  name: string;
  status: HealthConnectionStatus;
  responseTimeMs: number;
  lastSuccessfulSync: string;
  lastFailedRequest?: string;
  errors: number;
  authStatus: string;
}

export interface QueueHealth {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  retryCount: number;
  delay: string;
  scheduledJobs: number;
}

export interface CronTask {
  id?: string | number;
  name: string;
  command?: string;
  schedule?: string;
  status: HealthStatus;
  lastRun: string;
  nextRun: string;
  duration: string;
  failures: number;
  enabled?: boolean;
  error?: string;
  createdAt?: string;
  updatedAt?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const extractArrayPayload = <T>(payload: unknown, candidateKeys: string[] = ['data', 'items', 'tasks', 'cronTasks']): T[] => {
  if (Array.isArray(payload)) return payload as T[];

  if (!isRecord(payload)) {
    if (isRecord((payload as any)?.response)) {
      return extractArrayPayload<T>((payload as any).response, candidateKeys);
    }
    return [];
  }

  for (const key of candidateKeys) {
    const value = payload[key];
    if (Array.isArray(value)) return value as T[];
  }

  const nestedData = payload.data;
  if (Array.isArray(nestedData)) return nestedData as T[];

  if (payload.success === false) {
    const message = typeof payload.message === 'string' ? payload.message : 'Request failed';
    throw new Error(message);
  }

  const errorMessage = typeof payload.message === 'string' ? payload.message : null;
  if (errorMessage) {
    throw new Error(errorMessage);
  }

  const knownObjectKeys = Object.keys(payload);
  const hasArrayValues = knownObjectKeys.some((key) => Array.isArray(payload[key]));
  if (hasArrayValues) {
    for (const key of knownObjectKeys) {
      if (Array.isArray(payload[key])) return payload[key] as T[];
    }
  }

  throw new Error('Malformed health API response: expected an array payload');
};

export function normalizeCronTasks(response: unknown): CronTask[] {
  try {
    const tasks = extractArrayPayload<CronTask>(response, ['data', 'tasks', 'cronTasks']);
    return tasks.map((task, index) => {
      const record = isRecord(task) ? (task as Record<string, unknown>) : null;
      const statusValue = record?.['status'];
      const normalizedStatus: HealthStatus = statusValue === 'Warning' || statusValue === 'Critical' || statusValue === 'Offline' || statusValue === 'Healthy'
        ? statusValue
        : 'Healthy';

      const idValue = record?.['id'];
      const id: string | number | undefined = typeof idValue === 'string' || typeof idValue === 'number' ? idValue : `${index + 1}`;
      const nameValue = record?.['name'] ?? record?.['task'] ?? `Task ${index + 1}`;
      const commandValue = record?.['command'];
      const scheduleValue = record?.['schedule'];
      const lastRunValue = record?.['lastRun'] ?? record?.['last_run'] ?? 'Unknown';
      const nextRunValue = record?.['nextRun'] ?? record?.['next_run'] ?? 'Unknown';
      const durationValue = record?.['duration'] ?? 0;
      const failuresValue = record?.['failures'] ?? 0;

      return {
        id,
        name: String(nameValue),
        command: typeof commandValue === 'string' ? commandValue : undefined,
        schedule: typeof scheduleValue === 'string' ? scheduleValue : undefined,
        status: normalizedStatus,
        lastRun: typeof lastRunValue === 'string' ? lastRunValue : 'Unknown',
        nextRun: typeof nextRunValue === 'string' ? nextRunValue : 'Unknown',
        duration: typeof durationValue === 'string' ? durationValue : `${durationValue ?? 0}s`,
        failures: typeof failuresValue === 'number' ? failuresValue : Number(failuresValue ?? 0),
        enabled: typeof record?.['enabled'] === 'boolean' ? record['enabled'] as boolean : undefined,
        error: typeof record?.['error'] === 'string' ? record['error'] as string : undefined,
        createdAt: typeof record?.['createdAt'] === 'string' ? record['createdAt'] as string : undefined,
        updatedAt: typeof record?.['updatedAt'] === 'string' ? record['updatedAt'] as string : undefined,
      } satisfies CronTask;
    });
  } catch (error) {
    throw error instanceof Error ? error : new Error('Unable to load scheduled tasks');
  }
}

export interface StorageHealth {
  total: string;
  used: string;
  free: string;
  usedPercentage: number;
  databaseStorage: string;
  invoiceStorage: string;
  imageStorage: string;
  backupStorage: string;
  logStorage: string;
  tempStorage: string;
}

export interface BackupHistoryEntry {
  date: string;
  type: string;
  size: string;
  status: HealthStatus;
  duration: string;
  location: string;
}

export interface BackupHealth {
  status: HealthStatus;
  databaseStatus: HealthStatus;
  fileStatus: HealthStatus;
  lastSuccessful: string;
  lastFailed: string;
  size: string;
  destination: string;
  schedule: string;
  retention: string;
  verification: string;
  history: BackupHistoryEntry[];
}

export interface SecurityHealth {
  sslStatus: string;
  httpsStatus: string;
  sslExpiry: string;
  authenticationFailures: number;
  failedLogins: number;
  apiAuthFailures: number;
  expiredTokens: number;
  configIssues: number;
  filePermissions: number;
  suspiciousRequests: number;
}

export interface LogEntry {
  time: string;
  service: string;
  error: string;
  severity: 'Info' | 'Warning' | 'Error' | 'Critical';
  status: HealthStatus;
}

export interface PerformanceHealth {
  serverCpu: Array<{ time: string; value: number }>;
  serverRam: Array<{ time: string; value: number }>;
  serverLoad: Array<{ time: string; value: number }>;
  apiResponse: Array<{ time: string; value: number }>;
  databaseQuery: Array<{ time: string; value: number }>;
  appResponse: Array<{ time: string; value: number }>;
  requestsPerMinute: Array<{ time: string; value: number }>;
  storageGrowth: Array<{ time: string; value: number }>;
}

export interface UptimeHealth {
  current: number;
  daily: number;
  weekly: number;
  monthly: number;
  downtimeMinutes: number;
  incidents: number;
  history: Array<{ date: string; uptime: number; incidents: number }>;
}

export interface AlertEntry {
  id: string;
  title: string;
  service: string;
  severity: 'Info' | 'Warning' | 'Critical';
  time: string;
  description: string;
  currentValue: string;
  threshold: string;
  status: HealthStatus;
}

export interface HistorySummary {
  label: string;
  uptime: number;
  availability: number;
  serverUsage: number;
  dbResponse: number;
  errorCount: number;
  integrationFailures: number;
  backupStatus: HealthStatus;
}

export interface HistorySection {
  range: 'Today' | '7 Days' | '30 Days' | '90 Days';
  trend: Array<{ date: string; value: number }>;
}

export interface ServiceStatusItem {
  name: string;
  status: HealthStatus | HealthConnectionStatus;
}

export async function getHealthOverview(): Promise<HealthOverview> {
  return apiClient.request('GET', '/health');
}

export async function getServerHealth(): Promise<ServerHealth> {
  return apiClient.request('GET', '/health/server');
}

export async function getDatabaseHealth(): Promise<DatabaseHealth> {
  return apiClient.request('GET', '/health/database');
}

export async function getApiHealth(): Promise<ApiHealthEntry[]> {
  const response = await apiClient.request('GET', '/health/apis');
  return extractArrayPayload<ApiHealthEntry>(response, ['data', 'items', 'checks', 'endpoints']);
}

export async function getIntegrationHealth(): Promise<IntegrationHealthEntry[]> {
  const response = await apiClient.request('GET', '/health/integrations');
  return extractArrayPayload<IntegrationHealthEntry>(response, ['data', 'items', 'integrations']);
}

export async function getQueueHealth(): Promise<QueueHealth> {
  const response = await apiClient.request('GET', '/health/queue');
  if (isRecord(response)) {
    const record = response as Record<string, unknown>;
    return {
      pending: Number(record.pending ?? 0),
      processing: Number(record.processing ?? 0),
      completed: Number(record.completed ?? 0),
      failed: Number(record.failed ?? 0),
      retryCount: Number(record.retryCount ?? 0),
      delay: typeof record.delay === 'string' ? record.delay : 'Unavailable',
      scheduledJobs: Number(record.scheduledJobs ?? 0),
    } satisfies QueueHealth;
  }
  return { pending: 0, processing: 0, completed: 0, failed: 0, retryCount: 0, delay: 'Unavailable', scheduledJobs: 0 };
}

export async function getCronHealth(): Promise<CronTask[]> {
  const response = await apiClient.request('GET', '/health/cron');
  return normalizeCronTasks(response);
}

export async function getStorageHealth(): Promise<StorageHealth> {
  const response = await apiClient.request('GET', '/health/storage');
  if (isRecord(response)) {
    const record = response as Record<string, unknown>;
    return {
      total: typeof record.total === 'string' ? record.total : 'Unavailable',
      used: typeof record.used === 'string' ? record.used : 'Unavailable',
      free: typeof record.free === 'string' ? record.free : 'Unavailable',
      usedPercentage: Number(record.usedPercentage ?? 0),
      databaseStorage: typeof record.databaseStorage === 'string' ? record.databaseStorage : 'Unavailable',
      invoiceStorage: typeof record.invoiceStorage === 'string' ? record.invoiceStorage : 'Unavailable',
      imageStorage: typeof record.imageStorage === 'string' ? record.imageStorage : 'Unavailable',
      backupStorage: typeof record.backupStorage === 'string' ? record.backupStorage : 'Unavailable',
      logStorage: typeof record.logStorage === 'string' ? record.logStorage : 'Unavailable',
      tempStorage: typeof record.tempStorage === 'string' ? record.tempStorage : 'Unavailable',
    } satisfies StorageHealth;
  }
  return { total: 'Unavailable', used: 'Unavailable', free: 'Unavailable', usedPercentage: 0, databaseStorage: 'Unavailable', invoiceStorage: 'Unavailable', imageStorage: 'Unavailable', backupStorage: 'Unavailable', logStorage: 'Unavailable', tempStorage: 'Unavailable' };
}

export async function getBackupHealth(): Promise<BackupHealth> {
  const response = await apiClient.request('GET', '/health/backups');
  if (isRecord(response)) {
    const record = response as Record<string, unknown>;
    return {
      status: (record.status as HealthStatus) ?? 'Offline',
      databaseStatus: (record.databaseStatus as HealthStatus) ?? 'Offline',
      fileStatus: (record.fileStatus as HealthStatus) ?? 'Offline',
      lastSuccessful: typeof record.lastSuccessful === 'string' ? record.lastSuccessful : 'Never',
      lastFailed: typeof record.lastFailed === 'string' ? record.lastFailed : 'Never',
      size: typeof record.size === 'string' ? record.size : '0 B',
      destination: typeof record.destination === 'string' ? record.destination : 'Unavailable',
      schedule: typeof record.schedule === 'string' ? record.schedule : 'Manual only',
      retention: typeof record.retention === 'string' ? record.retention : '30 days',
      verification: typeof record.verification === 'string' ? record.verification : 'Unavailable',
      history: Array.isArray(record.history) ? record.history as BackupHistoryEntry[] : [],
    } satisfies BackupHealth;
  }
  return { status: 'Offline', databaseStatus: 'Offline', fileStatus: 'Offline', lastSuccessful: 'Never', lastFailed: 'Never', size: '0 B', destination: 'Unavailable', schedule: 'Manual only', retention: '30 days', verification: 'Unavailable', history: [] };
}

export async function getSecurityHealth(): Promise<SecurityHealth> {
  const response = await apiClient.request('GET', '/health/security');
  if (isRecord(response)) {
    const record = response as Record<string, unknown>;
    return {
      sslStatus: typeof record.sslStatus === 'string' ? record.sslStatus : 'Unavailable',
      httpsStatus: typeof record.httpsStatus === 'string' ? record.httpsStatus : 'Unavailable',
      sslExpiry: typeof record.sslExpiry === 'string' ? record.sslExpiry : 'Unavailable',
      authenticationFailures: Number(record.authenticationFailures ?? 0),
      failedLogins: Number(record.failedLogins ?? 0),
      apiAuthFailures: Number(record.apiAuthFailures ?? 0),
      expiredTokens: Number(record.expiredTokens ?? 0),
      configIssues: Number(record.configIssues ?? 0),
      filePermissions: Number(record.filePermissions ?? 0),
      suspiciousRequests: Number(record.suspiciousRequests ?? 0),
    } satisfies SecurityHealth;
  }
  return { sslStatus: 'Unavailable', httpsStatus: 'Unavailable', sslExpiry: 'Unavailable', authenticationFailures: 0, failedLogins: 0, apiAuthFailures: 0, expiredTokens: 0, configIssues: 0, filePermissions: 0, suspiciousRequests: 0 };
}

export async function getLogHealth(): Promise<LogEntry[]> {
  const response = await apiClient.request('GET', '/health/logs');
  return extractArrayPayload<LogEntry>(response, ['data', 'items', 'logs']);
}

export async function getPerformanceHealth(): Promise<PerformanceHealth> {
  const response = await apiClient.request('GET', '/health/performance');
  if (isRecord(response)) {
    const record = response as Record<string, unknown>;
    return {
      serverCpu: Array.isArray(record.serverCpu) ? record.serverCpu as Array<{ time: string; value: number }> : [],
      serverRam: Array.isArray(record.serverRam) ? record.serverRam as Array<{ time: string; value: number }> : [],
      serverLoad: Array.isArray(record.serverLoad) ? record.serverLoad as Array<{ time: string; value: number }> : [],
      apiResponse: Array.isArray(record.apiResponse) ? record.apiResponse as Array<{ time: string; value: number }> : [],
      databaseQuery: Array.isArray(record.databaseQuery) ? record.databaseQuery as Array<{ time: string; value: number }> : [],
      appResponse: Array.isArray(record.appResponse) ? record.appResponse as Array<{ time: string; value: number }> : [],
      requestsPerMinute: Array.isArray(record.requestsPerMinute) ? record.requestsPerMinute as Array<{ time: string; value: number }> : [],
      storageGrowth: Array.isArray(record.storageGrowth) ? record.storageGrowth as Array<{ time: string; value: number }> : [],
    } satisfies PerformanceHealth;
  }
  return { serverCpu: [], serverRam: [], serverLoad: [], apiResponse: [], databaseQuery: [], appResponse: [], requestsPerMinute: [], storageGrowth: [] };
}

export async function getUptimeHealth(): Promise<UptimeHealth> {
  const response = await apiClient.request('GET', '/health/uptime');
  if (isRecord(response)) {
    const record = response as Record<string, unknown>;
    return {
      current: Number(record.current ?? 0),
      daily: Number(record.daily ?? 0),
      weekly: Number(record.weekly ?? 0),
      monthly: Number(record.monthly ?? 0),
      downtimeMinutes: Number(record.downtimeMinutes ?? 0),
      incidents: Number(record.incidents ?? 0),
      history: Array.isArray(record.history) ? record.history as Array<{ date: string; uptime: number; incidents: number }> : [],
    } satisfies UptimeHealth;
  }
  return { current: 0, daily: 0, weekly: 0, monthly: 0, downtimeMinutes: 0, incidents: 0, history: [] };
}

export async function getAlertHealth(): Promise<AlertEntry[]> {
  const response = await apiClient.request('GET', '/health/alerts');
  return extractArrayPayload<AlertEntry>(response, ['data', 'items', 'alerts']);
}

export async function getHistorySections(): Promise<HistorySection[]> {
  const response = await apiClient.request('GET', '/health/history');
  return extractArrayPayload<HistorySection>(response, ['data', 'items', 'history']);
}

export async function getServiceStatusGrid(): Promise<ServiceStatusItem[]> {
  const response = await apiClient.request('GET', '/health/services');
  return extractArrayPayload<ServiceStatusItem>(response, ['data', 'items', 'services']);
}

export async function testDatabaseConnection(): Promise<{ message: string }> {
  return apiClient.request('POST', '/health/test/database');
}

export async function testApiConnection(): Promise<{ message: string }> {
  return apiClient.request('POST', '/health/test/api');
}

export async function testIntegrationConnection(): Promise<{ message: string }> {
  return apiClient.request('POST', '/health/test/integration');
}

export async function testStorageConnection(): Promise<{ message: string }> {
  return apiClient.request('POST', '/health/test/storage');
}

export async function testQueueConnection(): Promise<{ message: string }> {
  return apiClient.request('POST', '/health/test/queue');
}

export async function triggerBackupNow(): Promise<{ message: string }> {
  return apiClient.request('POST', '/health/backup');
}

export async function resolveAlert(id: string): Promise<{ message: string }> {
  return apiClient.request('POST', `/health/alerts/${id}/resolve`);
}
