<?php

namespace App\Services;

use App\Models\BackupArtifact;
use App\Models\BackupConnection;
use App\Models\BackupRun;
use App\Models\BackupSetting;
use Exception;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class BackupManagerService
{
    public function __construct(
        protected DatabaseBackupService $databaseBackupService,
        protected FileBackupService $fileBackupService,
        protected BackupEncryptionService $encryptionService,
        protected GoogleDriveService $driveService,
        protected BackupVerificationService $verificationService,
        protected BackupRetentionService $retentionService,
        protected BackupNotificationService $notificationService,
        protected BackupAuditService $auditService
    ) {}

    /**
     * Execute full backup pipeline.
     */
    public function runBackup(
        string $type = 'manual',
        ?int $userId = null,
        ?int $connectionId = null,
        bool $includeFiles = true
    ): BackupRun {
        // Resolve active Google Drive connection
        $connection = $connectionId
            ? BackupConnection::findOrFail($connectionId)
            : BackupConnection::where('status', 'connected')->first();

        if (!$connection) {
            throw new Exception('No connected Google Drive account found. Please connect Google Drive first.');
        }

        $runCode = 'BKP-' . date('Ymd-His') . '-' . strtoupper(Str::random(4));
        $tempDir = storage_path('app/backup_temp/' . $runCode);
        if (!is_dir($tempDir)) {
            mkdir($tempDir, 0755, true);
        }

        $run = BackupRun::create([
            'backup_connection_id' => $connection->id,
            'user_id' => $userId,
            'run_code' => $runCode,
            'type' => $type,
            'status' => 'preparing',
            'manifest' => [
                'run_code' => $runCode,
                'installation_id' => config('backup.installation_id'),
                'type' => $type,
                'include_files' => $includeFiles,
                'initiated_at' => now()->toIso8601String(),
            ],
            'started_at' => now(),
        ]);

        $this->auditService->log(
            'start_backup',
            'success',
            ['run_code' => $runCode, 'type' => $type],
            null,
            $run->id,
            $connection->id,
            $userId
        );

        $createdFiles = [];

        try {
            // STEP 1: Database Backup
            $run->update(['status' => 'database_backup']);
            $rawDbPath = $tempDir . DIRECTORY_SEPARATOR . 'db_dump_' . time() . '.sql';
            $dbDumpResult = $this->databaseBackupService->createDump($rawDbPath);
            $createdFiles[] = $rawDbPath;

            $dbArtifact = BackupArtifact::create([
                'backup_run_id' => $run->id,
                'type' => 'database',
                'file_name' => 'database_' . date('Ymd_His') . '.sql.enc',
                'raw_size_bytes' => $dbDumpResult['size'],
                'raw_sha256' => $dbDumpResult['sha256'],
                'encryption_algorithm' => 'aes-256-gcm',
                'metadata' => [
                    'table_count' => $dbDumpResult['table_count'],
                    'method' => $dbDumpResult['method'],
                ],
            ]);

            // STEP 2: Uploaded Files Backup (if enabled)
            $filesArtifact = null;
            $rawFilesPath = null;
            if ($includeFiles) {
                $run->update(['status' => 'files_backup']);
                $rawFilesPath = $tempDir . DIRECTORY_SEPARATOR . 'uploads_archive_' . time() . '.tar';
                $filesArchiveResult = $this->fileBackupService->createUploadsArchive($rawFilesPath);
                $createdFiles[] = $rawFilesPath;

                $filesArtifact = BackupArtifact::create([
                    'backup_run_id' => $run->id,
                    'type' => 'files',
                    'file_name' => 'uploads_' . date('Ymd_His') . '.tar.enc',
                    'raw_size_bytes' => $filesArchiveResult['archive_bytes'],
                    'raw_sha256' => $filesArchiveResult['sha256'],
                    'encryption_algorithm' => 'aes-256-gcm',
                    'metadata' => [
                        'file_count' => $filesArchiveResult['file_count'],
                        'uncompressed_bytes' => $filesArchiveResult['uncompressed_bytes'],
                    ],
                ]);
            }

            // STEP 3: Encrypt Artifacts
            $run->update(['status' => 'encrypting']);

            $encDbPath = $tempDir . DIRECTORY_SEPARATOR . $dbArtifact->file_name;
            $dbEncResult = $this->encryptionService->encryptFile($rawDbPath, $encDbPath);
            $createdFiles[] = $encDbPath;

            $dbArtifact->update([
                'encrypted_size_bytes' => filesize($encDbPath),
                'encrypted_sha256' => hash_file('sha256', $encDbPath),
                'key_version' => $this->encryptionService->getCurrentKeyVersion(),
                'encryption_iv' => $dbEncResult['iv'] ?? null,
                'encryption_tag' => $dbEncResult['tag'] ?? null,
            ]);

            // Remove unencrypted SQL immediately
            if (file_exists($rawDbPath)) {
                @unlink($rawDbPath);
            }

            $encFilesPath = null;
            if ($filesArtifact && $rawFilesPath && file_exists($rawFilesPath)) {
                $encFilesPath = $tempDir . DIRECTORY_SEPARATOR . $filesArtifact->file_name;
                $filesEncResult = $this->encryptionService->encryptFile($rawFilesPath, $encFilesPath);
                $createdFiles[] = $encFilesPath;

                $filesArtifact->update([
                    'encrypted_size_bytes' => filesize($encFilesPath),
                    'encrypted_sha256' => hash_file('sha256', $encFilesPath),
                    'key_version' => $this->encryptionService->getCurrentKeyVersion(),
                    'encryption_iv' => $filesEncResult['iv'] ?? null,
                    'encryption_tag' => $filesEncResult['tag'] ?? null,
                ]);

                // Remove unencrypted tar immediately
                @unlink($rawFilesPath);
            }

            // STEP 4: Upload to Google Drive
            $run->update(['status' => 'uploading']);

            // Ensure backup folder exists in Drive
            $folderName = BackupSetting::get('drive_backup_folder', 'NixaERP Backups');
            $folder = $this->driveService->ensureFolder($connection, $folderName);
            $folderId = $folder['id'];

            // Update connection selected folder if unset
            if (!$connection->folder_id) {
                $connection->update([
                    'folder_id' => $folderId,
                    'folder_name' => $folder['name'],
                ]);
            }

            // Upload database artifact
            $dbUpload = $this->driveService->uploadFileResumable(
                $connection,
                $encDbPath,
                $dbArtifact->file_name,
                $folderId,
                'application/octet-stream'
            );

            $dbArtifact->update([
                'drive_file_id' => $dbUpload['id'],
                'drive_folder_id' => $folderId,
                'is_uploaded' => true,
                'uploaded_at' => now(),
            ]);

            // Upload files artifact
            if ($filesArtifact && $encFilesPath && file_exists($encFilesPath)) {
                $filesUpload = $this->driveService->uploadFileResumable(
                    $connection,
                    $encFilesPath,
                    $filesArtifact->file_name,
                    $folderId,
                    'application/octet-stream'
                );

                $filesArtifact->update([
                    'drive_file_id' => $filesUpload['id'],
                    'drive_folder_id' => $folderId,
                    'is_uploaded' => true,
                    'uploaded_at' => now(),
                ]);
            }

            // STEP 5: Verification
            $run->update(['status' => 'verifying']);
            $this->verificationService->verifyRun($run, false);

            // STEP 6: Finalize Run
            $totalEncryptedBytes = $dbArtifact->encrypted_size_bytes + ($filesArtifact ? $filesArtifact->encrypted_size_bytes : 0);
            $manifest = $run->manifest;
            $manifest['completed_at'] = now()->toIso8601String();
            $manifest['database'] = $dbArtifact->metadata;
            if ($filesArtifact) {
                $manifest['files'] = $filesArtifact->metadata;
            }

            $run->update([
                'status' => 'completed',
                'total_size_bytes' => $totalEncryptedBytes,
                'manifest' => $manifest,
                'completed_at' => now(),
            ]);

            $this->auditService->log(
                'backup_success',
                'success',
                [
                    'run_code' => $runCode,
                    'total_size_bytes' => $totalEncryptedBytes,
                    'drive_folder_id' => $folderId,
                ],
                null,
                $run->id,
                $connection->id,
                $userId
            );

            // STEP 7: Dispatch Notification
            $this->notificationService->notifyBackupSuccess($run);

            // STEP 8: Trigger Retention Pruning
            try {
                $this->retentionService->applyRetention();
            } catch (Exception $retEx) {
                Log::warning("BackupManagerService: Retention pruning error: " . $retEx->getMessage());
            }

            return $run->fresh(['artifacts', 'connection']);
        } catch (Exception $e) {
            Log::error("BackupManagerService: Backup execution failed for {$runCode}: " . $e->getMessage(), ['trace' => $e->getTraceAsString()]);

            $run->update([
                'status' => 'failed',
                'error_message' => $e->getMessage(),
                'completed_at' => now(),
            ]);

            $this->auditService->log(
                'backup_failed',
                'failed',
                ['run_code' => $runCode],
                $e->getMessage(),
                $run->id,
                $connection->id,
                $userId
            );

            $this->notificationService->notifyBackupFailure($run, $e->getMessage());

            throw $e;
        } finally {
            // Clean up all local temporary files
            $this->cleanupTempFiles($createdFiles, $tempDir);
        }
    }

    /**
     * Delete all created temporary files and directory.
     */
    protected function cleanupTempFiles(array $files, string $dir): void
    {
        foreach ($files as $file) {
            if (file_exists($file)) {
                @unlink($file);
            }
        }

        if (is_dir($dir)) {
            @rmdir($dir);
        }
    }
}
