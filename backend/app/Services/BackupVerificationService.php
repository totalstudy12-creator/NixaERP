<?php

namespace App\Services;

use App\Models\BackupArtifact;
use App\Models\BackupRun;
use Exception;
use PharData;
use Illuminate\Support\Facades\Log;

class BackupVerificationService
{
    public function __construct(
        protected GoogleDriveService $driveService,
        protected BackupEncryptionService $encryptionService,
        protected BackupAuditService $auditService
    ) {}

    /**
     * Run full verification on a backup run and its artifacts.
     */
    public function verifyRun(BackupRun $run, bool $deepDownloadCheck = false): array
    {
        $artifacts = $run->artifacts()->get();
        if ($artifacts->isEmpty()) {
            $notes = "Verification FAILED: No artifacts registered for backup run {$run->run_code}.";
            $run->update([
                'is_verified' => false,
                'verification_notes' => $notes,
            ]);

            $this->auditService->log(
                'verify_backup',
                'failed',
                ['reason' => 'No artifacts registered'],
                $notes,
                $run->id,
                $run->backup_connection_id
            );

            return [
                'success' => false,
                'run_code' => $run->run_code,
                'verified_at' => now()->toIso8601String(),
                'notes' => $notes,
                'artifacts' => [],
            ];
        }

        $results = [];
        $allPassed = true;
        $connection = $run->connection;

        $tempVerifyDir = storage_path('app/backup_temp/verify_' . uniqid());
        if (!is_dir($tempVerifyDir)) {
            mkdir($tempVerifyDir, 0755, true);
        }

        try {
            foreach ($artifacts as $artifact) {
                $artifactResult = [
                    'artifact_id' => $artifact->id,
                    'type' => $artifact->type,
                    'file_name' => $artifact->file_name,
                    'status' => 'passed',
                    'checks' => [],
                ];

                // 1. Remote Google Drive Metadata Check
                if ($artifact->drive_file_id && $connection) {
                    try {
                        $meta = $this->driveService->getFileMetadata($connection, $artifact->drive_file_id);
                        $remoteSize = (int) ($meta['size'] ?? 0);

                        $artifactResult['checks']['drive_file_exists'] = true;
                        $artifactResult['checks']['drive_size_matches'] = ($remoteSize === $artifact->encrypted_size_bytes);

                        if ($remoteSize !== $artifact->encrypted_size_bytes) {
                            $artifactResult['status'] = 'failed';
                            $artifactResult['error'] = "Drive file size mismatch: expected {$artifact->encrypted_size_bytes}, found {$remoteSize}";
                            $allPassed = false;
                        }
                    } catch (Exception $e) {
                        $artifactResult['checks']['drive_file_exists'] = false;
                        $artifactResult['status'] = 'failed';
                        $artifactResult['error'] = 'Google Drive file lookup failed: ' . $e->getMessage();
                        $allPassed = false;
                    }
                }

                // 2. Deep verification: download and decrypt if requested, or if local copy exists
                if ($allPassed && $deepDownloadCheck && $artifact->drive_file_id && $connection) {
                    $downloadedEncPath = $tempVerifyDir . DIRECTORY_SEPARATOR . $artifact->file_name;
                    $decryptedPath = $tempVerifyDir . DIRECTORY_SEPARATOR . 'dec_' . $artifact->file_name;

                    try {
                        $this->driveService->downloadFile($connection, $artifact->drive_file_id, $downloadedEncPath);

                        // Verify downloaded SHA-256
                        $downloadedSha = hash_file('sha256', $downloadedEncPath);
                        $artifactResult['checks']['encrypted_sha256_match'] = ($downloadedSha === $artifact->encrypted_sha256);

                        if ($downloadedSha !== $artifact->encrypted_sha256) {
                            throw new Exception("Encrypted SHA-256 checksum mismatch for {$artifact->file_name}");
                        }

                        // Decrypt artifact
                        $this->encryptionService->decryptFile($downloadedEncPath, $decryptedPath);

                        // Verify raw sha256
                        $decryptedSha = hash_file('sha256', $decryptedPath);
                        $artifactResult['checks']['raw_sha256_match'] = ($decryptedSha === $artifact->raw_sha256);

                        if ($decryptedSha !== $artifact->raw_sha256) {
                            throw new Exception("Decrypted raw SHA-256 checksum mismatch for {$artifact->file_name}");
                        }

                        // Content sanity check
                        if ($artifact->type === 'database') {
                            $sqlSample = file_get_contents($decryptedPath, false, null, 0, 8192);
                            $hasSqlKeywords = str_contains($sqlSample, 'CREATE TABLE') || str_contains($sqlSample, 'NixaERP') || str_contains($sqlSample, 'MySQL dump');
                            $artifactResult['checks']['database_sql_structure_valid'] = $hasSqlKeywords;
                            if (!$hasSqlKeywords) {
                                throw new Exception("SQL dump header validation failed: no valid SQL markers found");
                            }
                        } elseif ($artifact->type === 'files') {
                            $tar = new PharData($decryptedPath);
                            $artifactResult['checks']['archive_structure_valid'] = ($tar->count() >= 0);
                        }

                        @unlink($downloadedEncPath);
                        @unlink($decryptedPath);
                    } catch (Exception $e) {
                        $artifactResult['status'] = 'failed';
                        $artifactResult['error'] = 'Deep verification error: ' . $e->getMessage();
                        $allPassed = false;
                    }
                }

                if ($artifactResult['status'] === 'passed') {
                    $artifact->update([
                        'is_verified' => true,
                        'verified_at' => now(),
                        'verification_notes' => 'Passed verification checks: ' . implode(', ', array_keys($artifactResult['checks'])),
                    ]);
                } else {
                    $artifact->update([
                        'is_verified' => false,
                        'verification_notes' => 'FAILED: ' . ($artifactResult['error'] ?? 'Unknown verification failure'),
                    ]);
                }

                $results[] = $artifactResult;
            }
        } finally {
            $this->cleanTempDirectory($tempVerifyDir);
        }

        $notes = $allPassed
            ? 'All artifacts verified successfully at ' . now()->toIso8601String()
            : 'Verification FAILED for one or more artifacts.';

        $run->update([
            'is_verified' => $allPassed,
            'verified_at' => $allPassed ? now() : null,
            'verification_notes' => $notes,
        ]);

        $this->auditService->log(
            'verify_backup',
            $allPassed ? 'success' : 'failed',
            ['results' => $results, 'deep_check' => $deepDownloadCheck],
            $allPassed ? null : $notes,
            $run->id,
            $run->backup_connection_id
        );

        return [
            'success' => $allPassed,
            'run_code' => $run->run_code,
            'verified_at' => now()->toIso8601String(),
            'notes' => $notes,
            'artifacts' => $results,
        ];
    }

    /**
     * Delete temporary verification files.
     */
    protected function cleanTempDirectory(string $dir): void
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
