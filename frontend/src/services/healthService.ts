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
  name: string;
  status: HealthStatus;
  lastRun: string;
  nextRun: string;
  duration: string;
  failures: number;
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
  return apiClient.request('GET', '/health/apis');
}

export async function getIntegrationHealth(): Promise<IntegrationHealthEntry[]> {
  return apiClient.request('GET', '/health/integrations');
}

export async function getQueueHealth(): Promise<QueueHealth> {
  return apiClient.request('GET', '/health/queue');
}

export async function getCronHealth(): Promise<CronTask[]> {
  return apiClient.request('GET', '/health/cron');
}

export async function getStorageHealth(): Promise<StorageHealth> {
  return apiClient.request('GET', '/health/storage');
}

export async function getBackupHealth(): Promise<BackupHealth> {
  return apiClient.request('GET', '/health/backups');
}

export async function getSecurityHealth(): Promise<SecurityHealth> {
  return apiClient.request('GET', '/health/security');
}

export async function getLogHealth(): Promise<LogEntry[]> {
  return apiClient.request('GET', '/health/logs');
}

export async function getPerformanceHealth(): Promise<PerformanceHealth> {
  return apiClient.request('GET', '/health/performance');
}

export async function getUptimeHealth(): Promise<UptimeHealth> {
  return apiClient.request('GET', '/health/uptime');
}

export async function getAlertHealth(): Promise<AlertEntry[]> {
  return apiClient.request('GET', '/health/alerts');
}

export async function getHistorySections(): Promise<HistorySection[]> {
  return apiClient.request('GET', '/health/history');
}

export async function getServiceStatusGrid(): Promise<ServiceStatusItem[]> {
  return apiClient.request('GET', '/health/services');
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
