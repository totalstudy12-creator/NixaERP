<?php

namespace App\Services;

use App\Models\Backup;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Str;
use RuntimeException;
use ZipArchive;

class BackupService
{
    public const DISK = 'local';
    public const BACKUP_FOLDER = 'backups';

    public function createBackup(string $type = 'manual'): Backup
    {
        $startedAt = now();
        $archiveFormat = $this->supportsArchiveCompression() ? 'zip' : 'sql';
        $name = 'backup-' . $startedAt->format('Ymd-His') . '.' . $archiveFormat;
        $path = self::BACKUP_FOLDER . '/' . $name;
        $backup = Backup::create([
            'name' => $name,
            'disk' => self::DISK,
            'path' => $path,
            'type' => $type,
            'status' => 'Running',
            'size' => 0,
            'duration' => 0,
            'details' => ['type' => $type],
            'started_at' => $startedAt,
        ]);

        $tempDir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'erp-backup-' . Str::random(8);
        $archivePath = $tempDir . DIRECTORY_SEPARATOR . $name;

        if (!is_dir($tempDir) && !mkdir($tempDir, 0777, true) && !is_dir($tempDir)) {
            throw new RuntimeException('Unable to create temporary directory for backup');
        }

        try {
            $dumpFile = $tempDir . DIRECTORY_SEPARATOR . 'database.sql';
            $this->dumpDatabase($dumpFile);

            if ($this->supportsArchiveCompression()) {
                $this->createArchive($archivePath, $dumpFile);
            } else {
                copy($dumpFile, $archivePath);
            }

            $fileContents = file_get_contents($archivePath);
            if ($fileContents === false) {
                throw new RuntimeException('Failed to read backup contents');
            }

            Storage::disk(self::DISK)->put($path, $fileContents);
            $size = Storage::disk(self::DISK)->size($path);
            $duration = max(0, (int) now()->diffInSeconds($startedAt));

            $backup->update([
                'status' => 'Succeeded',
                'size' => $size,
                'duration' => $duration,
                'details' => array_merge($backup->details ?? [], [
                    'db_connection' => config('database.default'),
                    'included_paths' => $this->supportsArchiveCompression() ? ['database.sql', 'uploads'] : ['database.sql'],
                    'format' => $archiveFormat,
                ]),
                'completed_at' => now(),
            ]);

            return $backup;
        } catch (\Throwable $exception) {
            $backup->update([
                'status' => 'Failed',
                'duration' => max(0, (int) now()->diffInSeconds($startedAt)),
                'details' => array_merge($backup->details ?? [], [
                    'error' => $exception->getMessage(),
                ]),
                'completed_at' => now(),
            ]);

            throw $exception;
        } finally {
            $this->cleanupDirectory($tempDir);
        }
    }

    public function restoreBackup(Backup $backup): Backup
    {
        if (!Storage::disk($backup->disk)->exists($backup->path)) {
            throw new RuntimeException('Backup file not found on disk');
        }

        $tempDir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'erp-restore-' . Str::random(8);
        if (!is_dir($tempDir) && !mkdir($tempDir, 0777, true) && !is_dir($tempDir)) {
            throw new RuntimeException('Unable to create temporary directory for restore');
        }

        try {
            $archivePath = Storage::disk($backup->disk)->path($backup->path);
            $restored = ['database' => false, 'uploads' => false];

            if (str_ends_with(strtolower($archivePath), '.sql')) {
                $this->restoreDatabase($archivePath);
                $restored['database'] = true;
            } else {
                $this->extractArchive($archivePath, $tempDir);

                $dbDump = $tempDir . DIRECTORY_SEPARATOR . 'database.sql';
                if (file_exists($dbDump)) {
                    $this->restoreDatabase($dbDump);
                    $restored['database'] = true;
                }

                $uploadsSource = $tempDir . DIRECTORY_SEPARATOR . 'uploads';
                if (is_dir($uploadsSource)) {
                    $this->restoreUploads($uploadsSource);
                    $restored['uploads'] = true;
                }
            }

            $backup->update([
                'status' => 'Restored',
                'details' => array_merge($backup->details ?? [], [
                    'restored_at' => now()->toDateTimeString(),
                    'restored' => $restored,
                ]),
            ]);

            return $backup;
        } finally {
            $this->cleanupDirectory($tempDir);
        }
    }

    public function getHealthSummary(): array
    {
        $latest = Backup::where('status', 'Succeeded')->orderByDesc('completed_at')->first();
        $lastFailed = Backup::where('status', 'Failed')->orderByDesc('completed_at')->first();
        $history = Backup::orderByDesc('completed_at')->limit(10)->get();
        $status = $latest ? 'Healthy' : 'Warning';

        return [
            'status' => $status,
            'databaseStatus' => $status,
            'fileStatus' => $status,
            'lastSuccessful' => $latest ? $latest->completed_at?->format('Y-m-d H:i:s') : 'Never',
            'lastFailed' => $lastFailed ? $lastFailed->completed_at?->format('Y-m-d H:i:s') : 'Never',
            'size' => $latest ? $this->formatBytes($latest->size) : '0 B',
            'destination' => Storage::disk(self::DISK)->path(self::BACKUP_FOLDER),
            'schedule' => env('BACKUP_SCHEDULE', 'Manual only'),
            'retention' => env('BACKUP_RETENTION_DAYS', 30) . ' days',
            'verification' => 'On-demand only',
            'history' => $history->map(function (Backup $backup) {
                return [
                    'id' => $backup->id,
                    'date' => $backup->completed_at?->format('Y-m-d H:i:s') ?? $backup->created_at->format('Y-m-d H:i:s'),
                    'type' => ucfirst($backup->type),
                    'size' => $this->formatBytes($backup->size),
                    'status' => $backup->status === 'Succeeded' ? 'Healthy' : 'Critical',
                    'duration' => $backup->duration ? $this->formatDuration($backup->duration) : 'N/A',
                    'location' => $backup->path,
                ];
            })->toArray(),
        ];
    }

    private function dumpDatabase(string $outputPath): void
    {
        $connection = config('database.default');
        $config = config("database.connections.{$connection}");

        if (!$config) {
            throw new RuntimeException('Database connection configuration not found');
        }

        if ($config['driver'] === 'sqlite') {
            $databasePath = $config['database'];
            if (!str_starts_with($databasePath, '/') && !str_starts_with($databasePath, '\\')) {
                $databasePath = database_path($databasePath);
            }

            if (!file_exists($databasePath)) {
                throw new RuntimeException('SQLite database file not found');
            }

            if (!copy($databasePath, $outputPath)) {
                throw new RuntimeException('Failed to copy SQLite database file');
            }

            return;
        }

        if (!in_array($config['driver'], ['mysql', 'mariadb'], true)) {
            throw new RuntimeException('Unsupported database driver for backup: ' . $config['driver']);
        }

        $binary = $this->resolveBinaryPath('mysqldump');
        $this->assertBinaryAvailable($binary, 'mysqldump');

        $host = $config['host'] ?? '127.0.0.1';
        $port = $config['port'] ?? 3306;
        $database = $config['database'];
        $username = $config['username'];
        $password = $config['password'] ?? '';
        $command = escapeshellcmd($binary);
        $command .= ' --host=' . escapeshellarg($host);
        $command .= ' --port=' . escapeshellarg($port);
        $command .= ' --user=' . escapeshellarg($username);
        if ($password !== '') {
            $command .= ' --password=' . escapeshellarg($password);
        }
        $command .= ' --default-character-set=utf8mb4';
        $command .= ' --single-transaction --quick --skip-lock-tables';
        $command .= ' ' . escapeshellarg($database);
        $command .= ' > ' . escapeshellarg($outputPath);

        exec($command . ' 2>&1', $output, $status);

        if ($status !== 0) {
            throw new RuntimeException('mysqldump failed: ' . implode('\n', $output));
        }

        if (!file_exists($outputPath) || filesize($outputPath) === 0) {
            throw new RuntimeException('Database dump file was not created or is empty');
        }
    }

    private function restoreDatabase(string $dumpPath): void
    {
        $connection = config('database.default');
        $config = config("database.connections.{$connection}");

        if (!$config) {
            throw new RuntimeException('Database connection configuration not found');
        }

        if ($config['driver'] === 'sqlite') {
            $databasePath = $config['database'];
            if (!str_starts_with($databasePath, '/') && !str_starts_with($databasePath, '\\')) {
                $databasePath = database_path($databasePath);
            }

            if (!copy($dumpPath, $databasePath)) {
                throw new RuntimeException('Failed to restore SQLite database file');
            }

            return;
        }

        $binary = $this->resolveBinaryPath('mysql');
        $this->assertBinaryAvailable($binary, 'mysql');

        $host = $config['host'] ?? '127.0.0.1';
        $port = $config['port'] ?? 3306;
        $database = $config['database'];
        $username = $config['username'];
        $password = $config['password'] ?? '';
        $command = escapeshellcmd($binary);
        $command .= ' --host=' . escapeshellarg($host);
        $command .= ' --port=' . escapeshellarg($port);
        $command .= ' --user=' . escapeshellarg($username);
        if ($password !== '') {
            $command .= ' --password=' . escapeshellarg($password);
        }
        $command .= ' --default-character-set=utf8mb4';
        $command .= ' ' . escapeshellarg($database);
        $command .= ' < ' . escapeshellarg($dumpPath);

        exec($command . ' 2>&1', $output, $status);

        if ($status !== 0) {
            throw new RuntimeException('mysql restore failed: ' . implode('\n', $output));
        }
    }

    private function restoreUploads(string $sourceDir): void
    {
        $destinationRoot = storage_path('app/public/uploads');
        if (!is_dir($destinationRoot) && !mkdir($destinationRoot, 0777, true) && !is_dir($destinationRoot)) {
            throw new RuntimeException('Unable to create uploads destination directory');
        }

        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($sourceDir, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::SELF_FIRST
        );

        foreach ($iterator as $item) {
            $relativePath = str_replace($sourceDir . DIRECTORY_SEPARATOR, '', $item->getPathname());
            $targetPath = $destinationRoot . DIRECTORY_SEPARATOR . $relativePath;

            if ($item->isDir()) {
                if (!is_dir($targetPath) && !mkdir($targetPath, 0777, true) && !is_dir($targetPath)) {
                    throw new RuntimeException('Failed to create directory during upload restore: ' . $targetPath);
                }
                continue;
            }

            if (!copy($item->getPathname(), $targetPath)) {
                throw new RuntimeException('Failed to restore upload file: ' . $relativePath);
            }
        }
    }

    private function createArchive(string $zipPath, string $dumpFile): void
    {
        if (class_exists(\ZipArchive::class)) {
            $zip = new \ZipArchive();
            if ($zip->open($zipPath, \ZipArchive::CREATE | \ZipArchive::OVERWRITE) !== true) {
                throw new RuntimeException('Unable to create archive file');
            }

            $zip->addFile($dumpFile, 'database.sql');

            $publicFiles = Storage::disk('public')->allFiles('uploads');
            foreach ($publicFiles as $file) {
                $sourcePath = Storage::disk('public')->path($file);
                if (is_file($sourcePath)) {
                    $zip->addFile($sourcePath, $file);
                }
            }

            $zip->close();
            return;
        }

        if ($this->runSystemCommand('zip', ['-j', $zipPath, $dumpFile]) === 0) {
            return;
        }

        if (!copy($dumpFile, $zipPath)) {
            throw new RuntimeException('ZIP archive support is unavailable and a fallback archive could not be created.');
        }
    }

    private function extractArchive(string $archivePath, string $targetDir): void
    {
        if (class_exists(\ZipArchive::class)) {
            $zip = new \ZipArchive();
            if ($zip->open($archivePath) !== true) {
                throw new RuntimeException('Unable to open backup archive');
            }
            $zip->extractTo($targetDir);
            $zip->close();
            return;
        }

        if ($this->runSystemCommand('unzip', ['-o', $archivePath, '-d', $targetDir]) === 0) {
            return;
        }

        $restoreFile = $targetDir . DIRECTORY_SEPARATOR . basename($archivePath);
        if (copy($archivePath, $restoreFile)) {
            return;
        }

        throw new RuntimeException('Unable to extract backup archive');
    }

    private function supportsArchiveCompression(): bool
    {
        return class_exists(\ZipArchive::class) || $this->commandExists('zip') || $this->commandExists('unzip');
    }

    private function commandExists(string $command): bool
    {
        $which = strtolower(PHP_OS_FAMILY) === 'windows' ? 'where' : 'which';
        exec(sprintf('%s %s 2>NUL', escapeshellcmd($which), escapeshellcmd($command)), $output, $status);
        return $status === 0 && !empty($output);
    }

    private function runSystemCommand(string $command, array $args = []): int
    {
        if (!$this->commandExists($command)) {
            return 1;
        }

        $cmd = escapeshellcmd($command);
        foreach ($args as $arg) {
            $cmd .= ' ' . escapeshellarg((string) $arg);
        }

        exec($cmd . ' 2>&1', $output, $status);

        return $status;
    }

    private function cleanupDirectory(string $path): void
    {
        if (!is_dir($path)) {
            return;
        }

        $items = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($path, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::CHILD_FIRST
        );

        foreach ($items as $item) {
            if ($item->isDir()) {
                @rmdir($item->getPathname());
            } else {
                @unlink($item->getPathname());
            }
        }

        @rmdir($path);
    }

    private function resolveBinaryPath(string $tool): string
    {
        $configured = trim((string) env(strtoupper($tool) . '_BINARY', ''));
        $candidates = [];

        if ($configured !== '') {
            $candidates[] = $configured;
        }

        $toolName = $tool === 'mysql' ? 'mysql' : 'mysqldump';
        $candidates = array_merge($candidates, [
            'C:\\xampp\\mysql\\bin\\' . $toolName . '.exe',
            'C:/xampp/mysql/bin/' . $toolName . '.exe',
            'C:\\xampp\\mysql\\bin\\' . $toolName,
            'C:/xampp/mysql/bin/' . $toolName,
            'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\' . $toolName . '.exe',
            'C:/Program Files/MySQL/MySQL Server 8.0/bin/' . $toolName . '.exe',
            '/usr/local/bin/' . $toolName,
            '/usr/bin/' . $toolName,
            '/opt/homebrew/bin/' . $toolName,
            $toolName,
        ]);

        foreach (array_unique($candidates) as $candidate) {
            $candidate = trim((string) $candidate);
            if ($candidate === '') {
                continue;
            }

            if ($this->isBinaryUsable($candidate)) {
                return $candidate;
            }
        }

        $envVar = strtoupper($tool) . '_BINARY';
        throw new RuntimeException("{$tool} binary is not available on the server. Set the {$envVar} environment variable if it is installed in a custom location.");
    }

    private function isBinaryUsable(string $binary): bool
    {
        if ($binary === '') {
            return false;
        }

        if (file_exists($binary) && is_file($binary)) {
            return true;
        }

        $cmd = escapeshellcmd($binary) . ' --version 2>&1';
        exec($cmd, $output, $status);

        return $status === 0;
    }

    private function assertBinaryAvailable(string $binary, string $tool): void
    {
        if (!$this->isBinaryUsable($binary)) {
            $envVar = strtoupper($tool) . '_BINARY';
            throw new RuntimeException("{$tool} binary is not available on the server. Set the {$envVar} environment variable if it is installed in a custom location.");
        }
    }

    private function formatBytes(int $bytes): string
    {
        if ($bytes <= 0) {
            return '0 B';
        }

        $units = ['B', 'KB', 'MB', 'GB', 'TB'];
        $power = (int) floor(log($bytes, 1024));
        return round($bytes / (1024 ** $power), 2) . ' ' . $units[$power];
    }

    private function formatDuration(int $seconds): string
    {
        $minutes = intdiv($seconds, 60);
        $seconds = $seconds % 60;
        return sprintf('%02dm %02ds', $minutes, $seconds);
    }
}
