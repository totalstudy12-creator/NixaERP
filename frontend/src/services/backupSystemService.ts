// src/services/backupSystemService.ts
import { apiClient } from '../api';
import { useAuthStore } from '../store/auth';

export interface GoogleDriveQuota {
  total_bytes: number;
  used_bytes: number;
  trash_bytes: number;
  available_bytes: number;
  used_percent: number;
  total_formatted: string;
  used_formatted: string;
  available_formatted: string;
}

export interface BackupConnectionInfo {
  id: number;
  account_email: string;
  account_name: string | null;
  folder_id: string | null;
  folder_name: string | null;
  connected_at: string | null;
  last_authorized_at: string | null;
}

export interface BackupMetrics {
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  total_backup_bytes: number;
  last_successful_run: {
    id: number;
    run_code: string;
    completed_at: string | null;
    total_size_bytes: number;
    is_verified: boolean;
  } | null;
}

export interface BackupSystemStatus {
  has_active_connection: boolean;
  connection: BackupConnectionInfo | null;
  metrics: BackupMetrics;
  drive_quota: GoogleDriveQuota | null;
  scheduler: {
    frequency: string;
    scheduled_time: string;
    timezone: string;
    retention_daily_days: number;
    retention_weekly_weeks: number;
    retention_monthly_months: number;
  };
}

export interface BackupArtifact {
  id: number;
  backup_run_id: number;
  type: 'database' | 'files' | 'manifest';
  file_name: string;
  raw_size_bytes: number;
  encrypted_size_bytes: number;
  drive_file_id: string | null;
  is_uploaded: boolean;
  is_verified: boolean;
  encryption_algorithm: string;
  key_version: string;
  metadata?: any;
}

export interface BackupRunItem {
  id: number;
  uuid: string;
  run_code: string;
  type: 'manual' | 'daily' | 'weekly' | 'monthly' | 'pre_restore_safety';
  status: 'queued' | 'preparing' | 'database_backup' | 'files_backup' | 'encrypting' | 'uploading' | 'verifying' | 'completed' | 'verified' | 'failed' | 'pruned';
  current_step: string | null;
  progress_percent: number;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number;
  total_size_bytes: number;
  is_verified: boolean;
  verified_at: string | null;
  verification_notes: string | null;
  is_protected: boolean;
  error_message: string | null;
  created_at: string;
  artifacts?: BackupArtifact[];
  connection?: {
    account_email: string;
    folder_name: string;
  };
  user?: {
    id: number;
    name: string;
    email: string;
  };
}

export interface BackupSettings {
  drive_backup_folder: string;
  retention_daily_days: number;
  retention_weekly_weeks: number;
  retention_monthly_months: number;
  retention_min_keep: number;
  notifications_enabled: boolean;
  notify_on_success: boolean;
  notify_on_failure: boolean;
  notification_emails: string;
  scheduled_time: string;
  timezone: string;
}

export interface BackupAuditItem {
  id: number;
  action: string;
  status: 'success' | 'failed' | 'warning';
  details: any;
  error_message: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  user?: {
    id: number;
    name: string;
    email: string;
  };
  backupRun?: {
    id: number;
    run_code: string;
  };
}

export const backupSystemService = {
  /**
   * Fetch system overview status, active connection, metrics, and drive quota.
   */
  async getStatus(): Promise<BackupSystemStatus> {
    const res = await apiClient.request<{ status: string; data: BackupSystemStatus }>('GET', '/backup-system/status');
    return res.data;
  },

  /**
   * Fetch Google Drive OAuth URL.
   */
  async getOAuthRedirect(): Promise<string> {
    const res = await apiClient.request<{ status: string; data: { auth_url: string } }>('GET', '/backup-system/oauth/redirect');
    return res.data.auth_url;
  },

  /**
   * Complete Google Drive OAuth exchange with authorization code and state.
   */
  async handleOAuthCallback(code: string, state: string): Promise<any> {
    const res = await apiClient.request<{ status: string; message: string; data: any }>(
      'POST',
      '/backup-system/oauth/callback',
      { code, state }
    );
    return res.data;
  },

  /**
   * Disconnect a Google Drive account.
   */
  async disconnect(id: number): Promise<void> {
    await apiClient.request('POST', `/backup-system/connections/${id}/disconnect`);
  },

  /**
   * Test connection and retrieve folder/quota verification.
   */
  async testConnection(id: number): Promise<any> {
    const res = await apiClient.request<{ status: string; data: any }>('POST', `/backup-system/connections/${id}/test`);
    return res.data;
  },

  /**
   * List backup runs with pagination and filters.
   */
  async listRuns(params?: { page?: number; per_page?: number; status?: string; type?: string; start_date?: string; end_date?: string }): Promise<{
    data: BackupRunItem[];
    current_page: number;
    last_page: number;
    total: number;
  }> {
    const res = await apiClient.request<{ status: string; data: any }>('GET', '/backup-system/runs', undefined, params);
    return res.data;
  },

  /**
   * Retrieve single backup run.
   */
  async getRun(id: number): Promise<BackupRunItem> {
    const res = await apiClient.request<{ status: string; data: BackupRunItem }>('GET', `/backup-system/runs/${id}`);
    return res.data;
  },

  /**
   * Trigger an on-demand manual backup run.
   */
  async triggerRun(payload: { type?: string; include_files?: boolean; async?: boolean }): Promise<BackupRunItem> {
    const res = await apiClient.request<{ status: string; data: BackupRunItem }>('POST', '/backup-system/runs', payload);
    return res.data;
  },

  /**
   * Verify backup artifacts locally or on remote Drive.
   */
  async verifyRun(id: number, deep: boolean = false): Promise<any> {
    const res = await apiClient.request<{ status: string; data: any }>('POST', `/backup-system/runs/${id}/verify`, { deep });
    return res.data;
  },

  /**
   * Initiate Disaster Recovery Restore.
   */
  async restoreRun(id: number, payload: { confirmation_phrase: string; restore_database?: boolean; restore_files?: boolean }): Promise<any> {
    const res = await apiClient.request<{ status: string; message: string; data: any }>(
      'POST',
      `/backup-system/runs/${id}/restore`,
      payload
    );
    return res.data;
  },

  /**
   * Delete single backup run and its remote artifacts.
   */
  async deleteRun(id: number): Promise<void> {
    await apiClient.request('DELETE', `/backup-system/runs/${id}`);
  },

  /**
   * Get backup configuration settings.
   */
  async getSettings(): Promise<BackupSettings> {
    const res = await apiClient.request<{ status: string; data: BackupSettings }>('GET', '/backup-system/settings');
    return res.data;
  },

  /**
   * Update backup settings.
   */
  async updateSettings(payload: Partial<BackupSettings>): Promise<BackupSettings> {
    const res = await apiClient.request<{ status: string; data: BackupSettings }>('PUT', '/backup-system/settings', payload);
    return res.data;
  },

  /**
   * Manually trigger retention policy pruning.
   */
  async runRetention(): Promise<any> {
    const res = await apiClient.request<{ status: string; data: any }>('POST', '/backup-system/retention/run');
    return res.data;
  },

  /**
   * List audit logs.
   */
  async getAuditLogs(params?: { page?: number; per_page?: number; action?: string; status?: string }): Promise<{
    data: BackupAuditItem[];
    current_page: number;
    last_page: number;
    total: number;
  }> {
    const res = await apiClient.request<{ status: string; data: any }>('GET', '/backup-system/audit-logs', undefined, params);
    return res.data;
  },

  /**
   * List Drive folders.
   */
  async listDriveFolders(): Promise<Array<{ id: string; name: string }>> {
    const res = await apiClient.request<{ status: string; data: Array<{ id: string; name: string }> }>('GET', '/backup-system/drive/folders');
    return res.data;
  },

  /**
   * Create Drive folder.
   */
  async createDriveFolder(folder_name: string, parent_id?: string): Promise<{ id: string; name: string }> {
    const res = await apiClient.request<{ status: string; data: { id: string; name: string } }>(
      'POST',
      '/backup-system/drive/folders',
      { folder_name, parent_id }
    );
    return res.data;
  },

  /**
   * Directly download a fresh on-demand SQL dump to user's computer.
   */
  async downloadDirectBackup(): Promise<void> {
    const token = useAuthStore.getState().token;
    const apiBase = import.meta.env.VITE_API_URL || '/api';
    const res = await fetch(`${apiBase}/backup-system/direct-download`, {
      method: 'GET',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        Accept: 'application/octet-stream, application/sql',
      },
    });

    if (!res.ok) {
      let errMsg = 'Failed to download direct database backup.';
      try {
        const json = await res.json();
        if (json?.message) errMsg = json.message;
      } catch { /* soft */ }
      throw new Error(errMsg);
    }

    const blob = await res.blob();
    const disposition = res.headers.get('content-disposition');
    let filename = `raptorerp_backup_${new Date().toISOString().slice(0, 10)}.sql`;
    if (disposition && disposition.includes('filename=')) {
      const match = disposition.match(/filename="?([^";]+)"?/);
      if (match && match[1]) filename = match[1];
    }

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(link);
  },

  /**
   * Download the artifact(s) of a completed backup run snapshot.
   */
  async downloadRunSnapshot(runId: number, runCode: string, decrypt: boolean = true): Promise<void> {
    const token = useAuthStore.getState().token;
    const apiBase = import.meta.env.VITE_API_URL || '/api';
    const res = await fetch(`${apiBase}/backup-system/runs/${runId}/download?decrypt=${decrypt ? 1 : 0}`, {
      method: 'GET',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        Accept: 'application/octet-stream',
      },
    });

    if (!res.ok) {
      let errMsg = 'Failed to download backup snapshot artifact.';
      try {
        const json = await res.json();
        if (json?.message) errMsg = json.message;
      } catch { /* soft */ }
      throw new Error(errMsg);
    }

    const blob = await res.blob();
    const disposition = res.headers.get('content-disposition');
    let filename = `${runCode || `backup_${runId}`}.sql`;
    if (disposition && disposition.includes('filename=')) {
      const match = disposition.match(/filename="?([^";]+)"?/);
      if (match && match[1]) filename = match[1];
    }

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(link);
  },
};
