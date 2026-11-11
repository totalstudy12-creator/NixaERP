<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\ExecuteBackupJob;
use App\Jobs\RestoreBackupJob;
use App\Models\BackupArtifact;
use App\Models\BackupAuditLog;
use App\Models\BackupConnection;
use App\Models\BackupRun;
use App\Models\BackupSetting;
use App\Services\BackupAuditService;
use App\Services\BackupEncryptionService;
use App\Services\BackupManagerService;
use App\Services\BackupRestoreService;
use App\Services\BackupRetentionService;
use App\Services\BackupVerificationService;
use App\Services\DatabaseBackupService;
use App\Services\GoogleDriveService;
use App\Services\GoogleOAuthService;
use Exception;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;

class BackupSystemController extends Controller
{
    public function __construct(
        protected GoogleOAuthService $oauthService,
        protected GoogleDriveService $driveService,
        protected BackupManagerService $backupManager,
        protected BackupVerificationService $verificationService,
        protected BackupRestoreService $restoreService,
        protected BackupRetentionService $retentionService,
        protected BackupAuditService $auditService,
        protected DatabaseBackupService $databaseBackupService,
        protected BackupEncryptionService $encryptionService
    ) {}

    /**
     * Get high-level backup dashboard status, metrics, and health overview.
     */
    public function status(): JsonResponse
    {
        $connection = BackupConnection::where('status', 'connected')->first();
        $totalRuns = BackupRun::count();
        $successfulRuns = BackupRun::whereIn('status', ['completed', 'verified'])->count();
        $failedRuns = BackupRun::where('status', 'failed')->count();
        $lastSuccessful = BackupRun::whereIn('status', ['completed', 'verified'])
            ->orderByDesc('completed_at')
            ->first();

        $storageQuota = null;
        if ($connection) {
            try {
                $storageQuota = $this->driveService->getStorageQuota($connection);
            } catch (Exception $e) {
                Log::debug('Failed to fetch Drive quota: ' . $e->getMessage());
            }
        }

        $totalBackupBytes = (int) BackupRun::whereIn('status', ['completed', 'verified'])->sum('total_size_bytes');

        return response()->json([
            'status' => 'success',
            'data' => [
                'has_active_connection' => $connection !== null,
                'connection' => $connection ? [
                    'id' => $connection->id,
                    'account_email' => $connection->account_email,
                    'account_name' => $connection->account_name,
                    'folder_id' => $connection->folder_id,
                    'folder_name' => $connection->folder_name,
                    'connected_at' => $connection->created_at?->toIso8601String(),
                    'last_authorized_at' => $connection->last_authorized_at?->toIso8601String(),
                ] : null,
                'metrics' => [
                    'total_runs' => $totalRuns,
                    'successful_runs' => $successfulRuns,
                    'failed_runs' => $failedRuns,
                    'total_backup_bytes' => $totalBackupBytes,
                    'last_successful_run' => $lastSuccessful ? [
                        'id' => $lastSuccessful->id,
                        'run_code' => $lastSuccessful->run_code,
                        'completed_at' => $lastSuccessful->completed_at?->toIso8601String(),
                        'total_size_bytes' => $lastSuccessful->total_size_bytes,
                        'is_verified' => $lastSuccessful->is_verified,
                    ] : null,
                ],
                'drive_quota' => $storageQuota,
                'scheduler' => [
                    'frequency' => 'daily',
                    'scheduled_time' => '02:00 AM IST (Asia/Kolkata)',
                    'timezone' => 'Asia/Kolkata',
                    'retention_daily_days' => (int) BackupSetting::get('retention_daily_days', 30),
                    'retention_weekly_weeks' => (int) BackupSetting::get('retention_weekly_weeks', 12),
                    'retention_monthly_months' => (int) BackupSetting::get('retention_monthly_months', 12),
                ],
            ],
        ]);
    }

    /**
     * Get Google Drive authorization URL.
     */
    public function getOAuthRedirect(): JsonResponse
    {
        $redirectUrl = $this->oauthService->getAuthorizationUrl();

        return response()->json([
            'status' => 'success',
            'data' => [
                'auth_url' => $redirectUrl,
            ],
        ]);
    }

    /**
     * Complete Google Drive OAuth authorization.
     */
    public function handleOAuthCallback(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'code' => 'required|string',
            'state' => 'required|string',
        ]);

        try {
            $connection = $this->oauthService->handleCallback($validated['code'], $validated['state']);

            return response()->json([
                'status' => 'success',
                'message' => 'Google Drive connected successfully.',
                'data' => [
                    'connection' => [
                        'id' => $connection->id,
                        'account_email' => $connection->account_email,
                        'account_name' => $connection->account_name,
                        'folder_name' => $connection->folder_name,
                        'status' => $connection->status,
                    ],
                ],
            ]);
        } catch (Exception $e) {
            return response()->json([
                'status' => 'error',
                'message' => 'OAuth Authorization Failed: ' . $e->getMessage(),
            ], 400);
        }
    }

    /**
     * Disconnect Google Drive account.
     */
    public function disconnect(int $id): JsonResponse
    {
        $connection = BackupConnection::findOrFail($id);

        try {
            $this->oauthService->disconnect($connection);

            return response()->json([
                'status' => 'success',
                'message' => 'Google Drive disconnected successfully.',
            ]);
        } catch (Exception $e) {
            return response()->json([
                'status' => 'error',
                'message' => 'Disconnect error: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Test Google Drive connection and query account/folder status.
     */
    public function testConnection(int $id): JsonResponse
    {
        $connection = BackupConnection::findOrFail($id);

        try {
            $quota = $this->driveService->getStorageQuota($connection);
            $folders = $this->driveService->listFolders($connection, 10);

            return response()->json([
                'status' => 'success',
                'message' => 'Google Drive connection verified successfully.',
                'data' => [
                    'quota' => $quota,
                    'folders_sample' => $folders,
                ],
            ]);
        } catch (Exception $e) {
            return response()->json([
                'status' => 'error',
                'message' => 'Connection test failed: ' . $e->getMessage(),
            ], 400);
        }
    }

    /**
     * List all Google Drive connections.
     */
    public function listConnections(): JsonResponse
    {
        $connections = BackupConnection::all()->map(function ($c) {
            return [
                'id' => $c->id,
                'account_email' => $c->account_email,
                'account_name' => $c->account_name,
                'folder_id' => $c->folder_id,
                'folder_name' => $c->folder_name,
                'status' => $c->status,
                'last_authorized_at' => $c->last_authorized_at?->toIso8601String(),
                'created_at' => $c->created_at?->toIso8601String(),
            ];
        });

        return response()->json([
            'status' => 'success',
            'data' => $connections,
        ]);
    }

    /**
     * List backup runs with pagination and filtering.
     */
    public function listRuns(Request $request): JsonResponse
    {
        $query = BackupRun::with(['artifacts', 'connection', 'user:id,name,email'])
            ->orderByDesc('created_at');

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }

        if ($request->filled('type')) {
            $query->where('type', $request->input('type'));
        }

        if ($request->filled('start_date') && $request->filled('end_date')) {
            $query->whereBetween('created_at', [$request->input('start_date'), $request->input('end_date') . ' 23:59:59']);
        }

        $perPage = min((int) $request->input('per_page', 15), 100);
        $runs = $query->paginate($perPage);

        return response()->json([
            'status' => 'success',
            'data' => $runs,
        ]);
    }

    /**
     * Get single backup run details.
     */
    public function showRun(int $id): JsonResponse
    {
        $run = BackupRun::with(['artifacts', 'connection', 'user:id,name,email', 'auditLogs'])
            ->findOrFail($id);

        return response()->json([
            'status' => 'success',
            'data' => $run,
        ]);
    }

    /**
     * Trigger a new manual backup run.
     */
    public function triggerRun(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'type' => 'nullable|string|in:manual,daily,weekly,monthly',
            'include_files' => 'nullable|boolean',
            'async' => 'nullable|boolean',
        ]);

        $type = $validated['type'] ?? 'manual';
        $includeFiles = $validated['include_files'] ?? true;
        $async = $validated['async'] ?? false;

        $connection = BackupConnection::where('status', 'connected')->first();
        if (!$connection) {
            return response()->json([
                'status' => 'error',
                'message' => 'No active Google Drive connection found. Please connect Google Drive first.',
            ], 422);
        }

        if ($async) {
            ExecuteBackupJob::dispatch($type, Auth::id(), $connection->id, $includeFiles);

            return response()->json([
                'status' => 'success',
                'message' => 'Backup job queued successfully. Check progress in Backup Center.',
            ], 202);
        }

        try {
            $run = $this->backupManager->runBackup(
                type: $type,
                userId: Auth::id(),
                connectionId: $connection->id,
                includeFiles: $includeFiles
            );

            return response()->json([
                'status' => 'success',
                'message' => 'Backup completed successfully.',
                'data' => $run,
            ]);
        } catch (Exception $e) {
            return response()->json([
                'status' => 'error',
                'message' => 'Backup run failed: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Trigger verification of a backup run.
     */
    public function verifyRun(int $id, Request $request): JsonResponse
    {
        $run = BackupRun::findOrFail($id);
        $deepCheck = (bool) $request->input('deep', false);

        if ($run->status === 'failed' || $run->artifacts()->count() === 0) {
            return response()->json([
                'status' => 'error',
                'message' => "Cannot verify backup run {$run->run_code}: This run is marked as '{$run->status}' and contains no registered artifacts. Please execute a new backup.",
            ], 422);
        }

        try {
            $result = $this->verificationService->verifyRun($run, $deepCheck);

            return response()->json([
                'status' => $result['success'] ? 'success' : 'warning',
                'message' => $result['notes'] ?? 'Verification completed.',
                'data' => $result,
            ]);
        } catch (Exception $e) {
            return response()->json([
                'status' => 'error',
                'message' => 'Verification failed: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Execute disaster recovery restore workflow from a backup run.
     */
    public function restoreRun(int $id, Request $request): JsonResponse
    {
        $run = BackupRun::findOrFail($id);

        $validated = $request->validate([
            'restore_database' => 'nullable|boolean',
            'restore_files' => 'nullable|boolean',
            'confirmation_phrase' => 'required|string',
        ]);

        if (trim($validated['confirmation_phrase']) !== 'RESTORE ' . $run->run_code) {
            return response()->json([
                'status' => 'error',
                'message' => "Safety validation failed. Confirmation phrase must exactly equal 'RESTORE {$run->run_code}'.",
            ], 422);
        }

        $restoreDb = $validated['restore_database'] ?? true;
        $restoreFiles = $validated['restore_files'] ?? true;

        try {
            $result = $this->restoreService->restoreFromRun($run, $restoreDb, $restoreFiles);

            return response()->json([
                'status' => 'success',
                'message' => 'Disaster recovery restore completed successfully.',
                'data' => $result,
            ]);
        } catch (Exception $e) {
            return response()->json([
                'status' => 'error',
                'message' => 'Restore execution failed: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Delete/prune a specific backup run.
     */
    public function destroyRun(int $id): JsonResponse
    {
        $run = BackupRun::findOrFail($id);

        // Safety check: Don't delete the only completed backup
        $remainingCount = BackupRun::whereIn('status', ['completed', 'verified'])
            ->where('id', '!=', $id)
            ->count();

        if ($remainingCount === 0) {
            return response()->json([
                'status' => 'error',
                'message' => 'Action rejected: Safety invariant prevents deleting the only existing backup point.',
            ], 422);
        }

        try {
            $this->retentionService->pruneSingleRun($run);

            return response()->json([
                'status' => 'success',
                'message' => "Backup run {$run->run_code} and all associated remote artifacts deleted successfully.",
            ]);
        } catch (Exception $e) {
            return response()->json([
                'status' => 'error',
                'message' => 'Failed to delete backup: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get backup settings.
     */
    public function getSettings(): JsonResponse
    {
        $settings = [
            'drive_backup_folder' => BackupSetting::get('drive_backup_folder', 'NixaERP Backups'),
            'retention_daily_days' => (int) BackupSetting::get('retention_daily_days', 30),
            'retention_weekly_weeks' => (int) BackupSetting::get('retention_weekly_weeks', 12),
            'retention_monthly_months' => (int) BackupSetting::get('retention_monthly_months', 12),
            'retention_min_keep' => (int) BackupSetting::get('retention_min_keep', 2),
            'notifications_enabled' => BackupSetting::get('notifications_enabled', '1') === '1',
            'notify_on_success' => BackupSetting::get('notify_on_success', '1') === '1',
            'notify_on_failure' => BackupSetting::get('notify_on_failure', '1') === '1',
            'notification_emails' => BackupSetting::get('notification_emails', ''),
            'scheduled_time' => BackupSetting::get('scheduled_time', '02:00'),
            'timezone' => BackupSetting::get('timezone', 'Asia/Kolkata'),
        ];

        return response()->json([
            'status' => 'success',
            'data' => $settings,
        ]);
    }

    /**
     * Update backup settings.
     */
    public function updateSettings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'drive_backup_folder' => 'nullable|string|max:255',
            'retention_daily_days' => 'nullable|integer|min:1|max:365',
            'retention_weekly_weeks' => 'nullable|integer|min:1|max:104',
            'retention_monthly_months' => 'nullable|integer|min:1|max:60',
            'retention_min_keep' => 'nullable|integer|min:1|max:10',
            'notifications_enabled' => 'nullable|boolean',
            'notify_on_success' => 'nullable|boolean',
            'notify_on_failure' => 'nullable|boolean',
            'notification_emails' => 'nullable|string',
            'scheduled_time' => 'nullable|string',
            'timezone' => 'nullable|string',
        ]);

        foreach ($validated as $key => $val) {
            if ($val !== null) {
                $stringVal = is_bool($val) ? ($val ? '1' : '0') : (string) $val;
                BackupSetting::set($key, $stringVal);
            }
        }

        $this->auditService->log('update_settings', 'success', ['updated_keys' => array_keys($validated)]);

        return response()->json([
            'status' => 'success',
            'message' => 'Backup settings updated successfully.',
            'data' => $this->getSettings()->getData()->data,
        ]);
    }

    /**
     * Execute manual retention pruning.
     */
    public function runRetention(): JsonResponse
    {
        try {
            $result = $this->retentionService->applyRetention();

            return response()->json([
                'status' => 'success',
                'data' => $result,
            ]);
        } catch (Exception $e) {
            return response()->json([
                'status' => 'error',
                'message' => 'Retention execution failed: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * List audit logs for backup operations.
     */
    public function auditLogs(Request $request): JsonResponse
    {
        $query = BackupAuditLog::with(['user:id,name,email', 'backupRun:id,run_code'])
            ->orderByDesc('created_at');

        if ($request->filled('action')) {
            $query->where('action', $request->input('action'));
        }

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }

        $perPage = min((int) $request->input('per_page', 20), 100);
        $logs = $query->paginate($perPage);

        return response()->json([
            'status' => 'success',
            'data' => $logs,
        ]);
    }

    /**
     * List folders in Google Drive for picker.
     */
    public function listDriveFolders(): JsonResponse
    {
        $connection = BackupConnection::where('status', 'connected')->first();
        if (!$connection) {
            return response()->json([
                'status' => 'error',
                'message' => 'Google Drive is not connected.',
            ], 422);
        }

        try {
            $folders = $this->driveService->listFolders($connection, 50);

            return response()->json([
                'status' => 'success',
                'data' => $folders,
            ]);
        } catch (Exception $e) {
            return response()->json([
                'status' => 'error',
                'message' => 'Failed to list Drive folders: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Create a new folder on Google Drive.
     */
    public function createDriveFolder(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'folder_name' => 'required|string|max:255',
            'parent_id' => 'nullable|string',
        ]);

        $connection = BackupConnection::where('status', 'connected')->first();
        if (!$connection) {
            return response()->json([
                'status' => 'error',
                'message' => 'Google Drive is not connected.',
            ], 422);
        }

        try {
            $folder = $this->driveService->createFolder(
                $connection,
                $validated['folder_name'],
                $validated['parent_id'] ?? null
            );

            // Update connection folder
            $connection->update([
                'folder_id' => $folder['id'],
                'folder_name' => $folder['name'],
            ]);

            return response()->json([
                'status' => 'success',
                'message' => "Folder '{$folder['name']}' created and set as active backup destination.",
                'data' => $folder,
            ]);
        } catch (Exception $e) {
            return response()->json([
                'status' => 'error',
                'message' => 'Failed to create folder: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Generate an on-demand fresh database backup dump and stream download directly to browser.
     */
    public function directDownload(Request $request)
    {
        $fileName = 'raptorerp_backup_' . date('Y-m-d_His') . '.sql';

        $tempDir = storage_path('app/backup_temp');
        if (!is_dir($tempDir)) {
            mkdir($tempDir, 0755, true);
        }

        $tempPath = $tempDir . DIRECTORY_SEPARATOR . 'direct_dump_' . uniqid() . '.sql';

        try {
            $dumpResult = $this->databaseBackupService->createDump($tempPath);

            $this->auditService->log(
                'manual_direct_download',
                'success',
                [
                    'file_name' => $fileName,
                    'file_size' => filesize($tempPath),
                    'table_count' => $dumpResult['table_count'] ?? 0,
                    'records_count' => $dumpResult['records_count'] ?? 0,
                ],
                null,
                null,
                null,
                Auth::id()
            );

            return response()->download($tempPath, $fileName, [
                'Content-Type' => 'application/sql',
                'Content-Disposition' => "attachment; filename=\"{$fileName}\"",
                'Cache-Control' => 'no-cache, no-store, must-revalidate',
            ])->deleteFileAfterSend(true);
        } catch (Exception $e) {
            Log::error('Direct database backup download failed: ' . $e->getMessage(), ['trace' => $e->getTraceAsString()]);
            if (file_exists($tempPath)) {
                @unlink($tempPath);
            }

            return response()->json([
                'status' => 'error',
                'message' => 'Failed to generate direct database backup: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Download the artifact(s) of an existing backup snapshot.
     */
    public function downloadRun(int $id, Request $request)
    {
        $run = BackupRun::with(['artifacts', 'connection'])->findOrFail($id);

        if ($run->status === 'failed') {
            return response()->json([
                'status' => 'error',
                'message' => 'Cannot download a failed backup snapshot.',
            ], 400);
        }

        // Look for database artifact or primary artifact
        $artifact = $run->artifacts()->where('type', 'database')->first()
            ?? $run->artifacts()->first();

        if (!$artifact) {
            return response()->json([
                'status' => 'error',
                'message' => 'No artifacts found for backup snapshot ' . $run->run_code,
            ], 404);
        }

        $tempDir = storage_path('app/backup_temp/dl_' . uniqid());
        if (!is_dir($tempDir)) {
            mkdir($tempDir, 0755, true);
        }

        $fileName = $artifact->file_name;
        $localPath = $tempDir . DIRECTORY_SEPARATOR . $fileName;

        try {
            // Retrieve from remote Google Drive if needed
            if (!file_exists($localPath)) {
                if ($artifact->drive_file_id && $run->connection) {
                    $this->driveService->downloadFile($run->connection, $artifact->drive_file_id, $localPath);
                } elseif (!empty($artifact->local_temp_path) && file_exists($artifact->local_temp_path)) {
                    copy($artifact->local_temp_path, $localPath);
                } else {
                    return response()->json([
                        'status' => 'error',
                        'message' => 'Backup artifact not found on remote storage or local cache.',
                    ], 404);
                }
            }

            // Check if decryption is requested (default: true)
            $decrypt = $request->boolean('decrypt', true);
            if ($decrypt && str_ends_with($fileName, '.enc')) {
                $decryptedName = preg_replace('/\.enc$/', '', $fileName);
                $decryptedPath = $tempDir . DIRECTORY_SEPARATOR . $decryptedName;

                try {
                    $this->encryptionService->decryptFile(
                        $localPath,
                        $decryptedPath,
                        $artifact->encryption_iv ?? '',
                        $artifact->encryption_tag ?? '',
                        $artifact->key_version ?? 'v1'
                    );

                    @unlink($localPath);
                    $localPath = $decryptedPath;
                    $fileName = $decryptedName;
                } catch (Exception $decEx) {
                    Log::warning("Decryption during download failed ({$decEx->getMessage()}), providing encrypted artifact instead.");
                }
            }

            $this->auditService->log(
                'download_snapshot',
                'success',
                [
                    'run_id' => $run->id,
                    'run_code' => $run->run_code,
                    'file_name' => $fileName,
                    'file_size' => filesize($localPath),
                ],
                null,
                $run->id,
                $run->backup_connection_id,
                Auth::id()
            );

            return response()->download($localPath, $fileName, [
                'Content-Disposition' => "attachment; filename=\"{$fileName}\"",
                'Cache-Control' => 'no-cache, no-store, must-revalidate',
            ])->deleteFileAfterSend(true);
        } catch (Exception $e) {
            Log::error("Download of backup {$run->run_code} failed: " . $e->getMessage());

            return response()->json([
                'status' => 'error',
                'message' => 'Failed to download backup snapshot: ' . $e->getMessage(),
            ], 500);
        }
    }
}
