<?php

namespace App\Services;

use App\Models\BackupConnection;
use App\Models\BackupRun;
use App\Models\BackupSetting;
use Exception;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class BackupRestoreService
{
    public function __construct(
        protected GoogleDriveService $driveService,
        protected BackupEncryptionService $encryptionService,
        protected DatabaseBackupService $databaseBackupService,
        protected FileBackupService $fileBackupService,
        protected BackupNotificationService $notificationService,
        protected BackupAuditService $auditService
    ) {}

    /**
     * Perform a complete disaster recovery restoration from a backup run.
     * Enforces pre-restore safety snapshot, staging, and automatic rollback on failure.
     */
    public function restoreFromRun(BackupRun $run, bool $restoreDatabase = true, bool $restoreFiles = true): array
    {
        $connection = $run->connection;
        $recoveryDir = storage_path('app/backup_recovery/' . uniqid('restore_'));
        if (!is_dir($recoveryDir)) {
            mkdir($recoveryDir, 0755, true);
        }

        $safetySnapshotDir = storage_path('app/backup_recovery/safety_' . date('Ymd_His'));
        if (!is_dir($safetySnapshotDir)) {
            mkdir($safetySnapshotDir, 0755, true);
        }

        $isDown = false;
        $safetyBackupCreated = false;

        // Capture current active Google Drive connections & settings to preserve them
        $preservedConnections = BackupConnection::all()->toArray();
        $preservedSettings = BackupSetting::all()->toArray();

        try {
            Log::info("BackupRestoreService: Initiating disaster recovery restore for run {$run->run_code}");

            // 1. Pre-restore Safety Backup
            $safetySql = $safetySnapshotDir . DIRECTORY_SEPARATOR . 'safety_db.sql';
            $this->databaseBackupService->createDump($safetySql);
            $safetyBackupCreated = true;
            Log::info("BackupRestoreService: Pre-restore safety database snapshot saved to {$safetySql}");

            // 2. Put application into maintenance mode if in production
            try {
                Artisan::call('down', ['--secret' => 'restore-in-progress-' . time()]);
                $isDown = true;
            } catch (Exception $downEx) {
                Log::warning("BackupRestoreService: Artisan down skipped: " . $downEx->getMessage());
            }

            // 3. Download and Decrypt Artifacts
            $decryptedSqlPath = null;
            $decryptedTarPath = null;

            foreach ($run->artifacts as $artifact) {
                if ($artifact->type === 'database' && $restoreDatabase) {
                    $localEnc = $recoveryDir . DIRECTORY_SEPARATOR . $artifact->file_name;
                    $localDec = $recoveryDir . DIRECTORY_SEPARATOR . 'dec_' . str_replace('.enc', '', $artifact->file_name);

                    // Fetch file from Drive if not already local
                    if (!file_exists($localEnc) && $artifact->drive_file_id && $connection) {
                        $this->driveService->downloadFile($connection, $artifact->drive_file_id, $localEnc);
                    }

                    if (!file_exists($localEnc)) {
                        throw new Exception("Encrypted database artifact {$artifact->file_name} could not be retrieved.");
                    }

                    // Decrypt
                    $this->encryptionService->decryptFile($localEnc, $localDec);

                    // Verify raw checksum
                    $decSha = hash_file('sha256', $localDec);
                    if ($decSha !== $artifact->raw_sha256) {
                        throw new Exception("Decrypted database artifact checksum mismatch.");
                    }

                    $decryptedSqlPath = $localDec;
                }

                if ($artifact->type === 'files' && $restoreFiles) {
                    $localEnc = $recoveryDir . DIRECTORY_SEPARATOR . $artifact->file_name;
                    $localDec = $recoveryDir . DIRECTORY_SEPARATOR . 'dec_' . str_replace('.enc', '', $artifact->file_name);

                    if (!file_exists($localEnc) && $artifact->drive_file_id && $connection) {
                        $this->driveService->downloadFile($connection, $artifact->drive_file_id, $localEnc);
                    }

                    if (!file_exists($localEnc)) {
                        throw new Exception("Encrypted uploads artifact {$artifact->file_name} could not be retrieved.");
                    }

                    // Decrypt
                    $this->encryptionService->decryptFile($localEnc, $localDec);

                    // Verify raw checksum
                    $decSha = hash_file('sha256', $localDec);
                    if ($decSha !== $artifact->raw_sha256) {
                        throw new Exception("Decrypted files artifact checksum mismatch.");
                    }

                    $decryptedTarPath = $localDec;
                }
            }

            // 4. Restore Database Dump
            $dbResult = null;
            if ($restoreDatabase) {
                if (!$decryptedSqlPath || !file_exists($decryptedSqlPath)) {
                    throw new Exception("No valid database artifact found for restore.");
                }

                $dbResult = $this->databaseBackupService->restoreFromDump($decryptedSqlPath);
                Log::info("BackupRestoreService: Database restored successfully.", $dbResult);

                // Preserve critical backup configuration & Google Drive credentials
                $this->restorePreservedState($preservedConnections, $preservedSettings);
            }

            // 5. Restore Uploaded Files
            $filesResult = null;
            if ($restoreFiles) {
                if ($decryptedTarPath && file_exists($decryptedTarPath)) {
                    $filesResult = $this->fileBackupService->restoreUploadsArchive($decryptedTarPath);
                    Log::info("BackupRestoreService: Uploaded files restored successfully.", $filesResult);
                }
            }

            // 6. Post-restore Verification
            $this->verifyPostRestore();

            // 7. Audit & Notify
            $this->auditService->log(
                'restore_backup',
                'success',
                [
                    'run_code' => $run->run_code,
                    'database_restored' => $restoreDatabase,
                    'files_restored' => $restoreFiles,
                    'db_result' => $dbResult,
                    'files_result' => $filesResult,
                ],
                null,
                $run->id,
                $run->backup_connection_id
            );

            $this->notificationService->notifyRestoreCompleted($run, true);

            return [
                'success' => true,
                'run_code' => $run->run_code,
                'database' => $dbResult,
                'files' => $filesResult,
                'message' => 'Disaster recovery restore completed successfully.',
            ];
        } catch (Exception $e) {
            Log::error("BackupRestoreService CRITICAL RESTORE FAILURE: " . $e->getMessage(), ['trace' => $e->getTraceAsString()]);

            // Automatic Rollback using safety snapshot
            if ($safetyBackupCreated && file_exists($safetySql)) {
                Log::warning("BackupRestoreService: Attempting emergency rollback from safety backup {$safetySql}");
                try {
                    $this->databaseBackupService->restoreFromDump($safetySql);
                    $this->restorePreservedState($preservedConnections, $preservedSettings);
                    Log::info("BackupRestoreService: Emergency rollback succeeded.");
                } catch (Exception $rbEx) {
                    Log::critical("BackupRestoreService: EMERGENCY ROLLBACK FAILED: " . $rbEx->getMessage());
                }
            }

            $this->auditService->log(
                'restore_backup',
                'failed',
                ['run_code' => $run->run_code],
                $e->getMessage(),
                $run->id,
                $run->backup_connection_id
            );

            $this->notificationService->notifyRestoreCompleted($run, false, $e->getMessage());

            throw new Exception("Disaster recovery restore failed: " . $e->getMessage(), 0, $e);
        } finally {
            // Take application back up if it was placed in maintenance mode
            if ($isDown) {
                try {
                    Artisan::call('up');
                } catch (Exception $upEx) {
                    Log::debug("Artisan up call skipped: " . $upEx->getMessage());
                }
            }

            // Clean staging directory
            $this->cleanDirectory($recoveryDir);
        }
    }

    /**
     * Restore preserved connections and settings to prevent breaking Google OAuth during restore.
     */
    protected function restorePreservedState(array $connections, array $settings): void
    {
        try {
            foreach ($connections as $conn) {
                BackupConnection::updateOrCreate(
                    ['id' => $conn['id']],
                    $conn
                );
            }

            foreach ($settings as $setting) {
                BackupSetting::updateOrCreate(
                    ['key' => $setting['key']],
                    ['value' => $setting['value'], 'group' => $setting['group'] ?? 'general']
                );
            }
        } catch (Exception $e) {
            Log::warning("BackupRestoreService: Failed to restore preserved settings: " . $e->getMessage());
        }
    }

    /**
     * Verify database contains essential system data after restore.
     */
    protected function verifyPostRestore(): void
    {
        $userCount = DB::table('users')->count();
        if ($userCount === 0) {
            throw new Exception("Post-restore verification failed: No users found in database.");
        }
    }

    /**
     * Delete directory safely.
     */
    protected function cleanDirectory(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }

        $files = glob($dir . '/*');
        if ($files) {
            foreach ($files as $file) {
                if (is_file($file)) {
                    @unlink($file);
                }
            }
        }
        @rmdir($dir);
    }
}
