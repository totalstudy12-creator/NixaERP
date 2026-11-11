<?php

namespace App\Services;

use Exception;
use PharData;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use Illuminate\Support\Facades\Log;

class FileBackupService
{
    /**
     * File extensions or directory names strictly excluded from file backups.
     */
    protected const EXCLUDED_PATTERNS = [
        '.git',
        'node_modules',
        'vendor',
        '.env',
        '.env.*',
        'storage/framework/cache',
        'storage/framework/sessions',
        'storage/framework/views',
        'storage/logs',
        'storage/app/backup_temp',
        'storage/app/backup_recovery',
        '.DS_Store',
        'Thumbs.db',
    ];

    /**
     * Create an unencrypted tar archive of business uploaded files.
     * Returns metadata array with archive path, file count, raw size, and sha256 checksum.
     */
    public function createUploadsArchive(string $destinationPath, ?array $customSourceDirs = null): array
    {
        $sourceDirs = $customSourceDirs ?: $this->resolveUploadDirectories();
        $tempDir = dirname($destinationPath);
        if (!is_dir($tempDir)) {
            mkdir($tempDir, 0755, true);
        }

        if (file_exists($destinationPath)) {
            @unlink($destinationPath);
        }

        $manifest = [
            'created_at' => now()->toIso8601String(),
            'total_files' => 0,
            'total_bytes' => 0,
            'files' => [],
        ];

        $collectedFiles = [];

        foreach ($sourceDirs as $sourceDir) {
            if (!is_dir($sourceDir)) {
                continue;
            }

            $realSource = realpath($sourceDir);
            $iterator = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($realSource, RecursiveDirectoryIterator::SKIP_DOTS),
                RecursiveIteratorIterator::SELF_FIRST
            );

            foreach ($iterator as $item) {
                if ($item->isDir()) {
                    continue;
                }

                $filePath = $item->getRealPath();
                $relativePath = ltrim(str_replace([$realSource, '\\'], ['', '/'], $filePath), '/');

                if ($this->isExcluded($filePath, $relativePath)) {
                    continue;
                }

                $size = (int) $item->getSize();
                $sha256 = hash_file('sha256', $filePath);

                $collectedFiles[] = [
                    'absolute_path' => $filePath,
                    'relative_path' => $relativePath,
                    'size' => $size,
                    'sha256' => $sha256,
                ];

                $manifest['files'][] = [
                    'path' => $relativePath,
                    'size' => $size,
                    'sha256' => $sha256,
                ];

                $manifest['total_files']++;
                $manifest['total_bytes'] += $size;
            }
        }

        // Write manifest file to temp
        $manifestPath = $tempDir . DIRECTORY_SEPARATOR . 'file_manifest_' . uniqid() . '.json';
        file_put_contents($manifestPath, json_encode($manifest, JSON_PRETTY_PRINT));

        // Create TAR archive using PharData
        try {
            $tar = new PharData($destinationPath);

            // Add manifest
            $tar->addFile($manifestPath, 'manifest.json');

            // Add each collected file
            foreach ($collectedFiles as $file) {
                // Prepend uploads/ directory inside tar archive
                $tar->addFile($file['absolute_path'], 'uploads/' . $file['relative_path']);
            }
        } catch (Exception $e) {
            @unlink($manifestPath);
            @unlink($destinationPath);
            Log::error('FileBackupService: Failed to create tar archive: ' . $e->getMessage());
            throw new Exception('Failed to create uploaded files backup archive: ' . $e->getMessage(), 0, $e);
        } finally {
            if (file_exists($manifestPath)) {
                @unlink($manifestPath);
            }
        }

        if (!file_exists($destinationPath)) {
            throw new Exception("Archive creation failed: {$destinationPath} does not exist.");
        }

        $archiveSize = filesize($destinationPath);
        $archiveSha256 = hash_file('sha256', $destinationPath);

        return [
            'archive_path' => $destinationPath,
            'file_count' => $manifest['total_files'],
            'uncompressed_bytes' => $manifest['total_bytes'],
            'archive_bytes' => $archiveSize,
            'sha256' => $archiveSha256,
            'manifest' => $manifest,
        ];
    }

    /**
     * Restore an unencrypted uploads archive safely into the target uploads directory.
     * Validates paths to prevent zip-slip / tar-slip directory traversal attacks.
     */
    public function restoreUploadsArchive(string $tarPath, ?string $targetDir = null): array
    {
        if (!file_exists($tarPath)) {
            throw new Exception("Cannot restore uploaded files: archive {$tarPath} not found.");
        }

        $destination = $targetDir ?: $this->getPrimaryUploadDirectory();
        if (!is_dir($destination)) {
            mkdir($destination, 0755, true);
        }
        $realDest = realpath($destination);

        $tempExtractDir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'bkp_extract_' . uniqid();
        mkdir($tempExtractDir, 0755, true);

        $restoredCount = 0;
        $restoredBytes = 0;

        try {
            $tar = new PharData($tarPath);
            $tar->extractTo($tempExtractDir);

            // Read manifest if present
            $manifestPath = $tempExtractDir . DIRECTORY_SEPARATOR . 'manifest.json';
            $manifest = null;
            if (file_exists($manifestPath)) {
                $manifest = json_decode(file_get_contents($manifestPath), true);
            }

            // Move files to real destination with path traversal protection
            $extractedUploads = $tempExtractDir . DIRECTORY_SEPARATOR . 'uploads';
            $sourceRoot = is_dir($extractedUploads) ? $extractedUploads : $tempExtractDir;

            $iterator = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($sourceRoot, RecursiveDirectoryIterator::SKIP_DOTS),
                RecursiveIteratorIterator::SELF_FIRST
            );

            foreach ($iterator as $item) {
                if ($item->isDir()) {
                    continue;
                }

                $filePath = $item->getRealPath();
                $relativePath = ltrim(str_replace([$sourceRoot, '\\'], ['', '/'], $filePath), '/');

                if ($relativePath === 'manifest.json') {
                    continue;
                }

                // Path traversal check
                $targetFile = $realDest . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relativePath);
                $targetFileDir = dirname($targetFile);

                // Prevent directory traversal
                if (strpos(realpath($targetFileDir) ?: $targetFileDir, $realDest) !== 0 && !str_starts_with($targetFileDir, $realDest)) {
                    throw new Exception("Security Alert: Malicious file path detected during restore: {$relativePath}");
                }

                if (!is_dir($targetFileDir)) {
                    mkdir($targetFileDir, 0755, true);
                }

                copy($filePath, $targetFile);
                $restoredCount++;
                $restoredBytes += filesize($targetFile);
            }
        } finally {
            $this->deleteDirectoryRecursive($tempExtractDir);
        }

        return [
            'restored_files' => $restoredCount,
            'restored_bytes' => $restoredBytes,
            'destination' => $realDest,
        ];
    }

    /**
     * Resolve default upload directories to include in backups.
     */
    public function resolveUploadDirectories(): array
    {
        $directories = [
            storage_path('app/public'),
            storage_path('app/uploads'),
            public_path('uploads'),
        ];

        return array_values(array_filter($directories, function ($dir) {
            return is_dir($dir);
        }));
    }

    /**
     * Resolve primary upload directory for restoration.
     */
    public function getPrimaryUploadDirectory(): string
    {
        $storagePublic = storage_path('app/public');
        if (is_dir($storagePublic)) {
            return $storagePublic;
        }

        return public_path('uploads');
    }

    /**
     * Check if a file or path matches an exclusion pattern.
     */
    protected function isExcluded(string $absolutePath, string $relativePath): bool
    {
        $normalizedPath = str_replace('\\', '/', $absolutePath);
        $normalizedRelative = str_replace('\\', '/', $relativePath);

        foreach (self::EXCLUDED_PATTERNS as $pattern) {
            if (str_contains($normalizedPath, $pattern) || str_contains($normalizedRelative, $pattern)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Recursively delete a directory and all its contents.
     */
    protected function deleteDirectoryRecursive(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }

        $items = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST
        );

        foreach ($items as $item) {
            if ($item->isDir()) {
                @rmdir($item->getRealPath());
            } else {
                @unlink($item->getRealPath());
            }
        }

        @rmdir($dir);
    }
}
