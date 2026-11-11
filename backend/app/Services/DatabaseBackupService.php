<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use RuntimeException;
use PDO;

class DatabaseBackupService
{
    /**
     * Resolve the path to mysqldump binary.
     */
    public function resolveMysqldumpBinary(): ?string
    {
        $configured = config('backup.mysqldump_binary');
        if (!empty($configured) && file_exists($configured)) {
            return $configured;
        }

        $commonPaths = [
            'mysqldump',
            'c:\\xampp\\mysql\\bin\\mysqldump.exe',
            'd:\\xampp\\mysql\\bin\\mysqldump.exe',
            '/usr/bin/mysqldump',
            '/usr/local/bin/mysqldump',
            '/usr/local/mysql/bin/mysqldump',
            '/opt/lampp/bin/mysqldump',
        ];

        foreach ($commonPaths as $path) {
            if ($this->isExecutableBinary($path)) {
                return $path;
            }
        }

        return null;
    }

    /**
     * Resolve the path to mysql client binary.
     */
    public function resolveMysqlBinary(): ?string
    {
        $configured = config('backup.mysql_binary');
        if (!empty($configured) && file_exists($configured)) {
            return $configured;
        }

        $commonPaths = [
            'mysql',
            'c:\\xampp\\mysql\\bin\\mysql.exe',
            'd:\\xampp\\mysql\\bin\\mysql.exe',
            '/usr/bin/mysql',
            '/usr/local/bin/mysql',
            '/usr/local/mysql/bin/mysql',
            '/opt/lampp/bin/mysql',
        ];

        foreach ($commonPaths as $path) {
            if ($this->isExecutableBinary($path)) {
                return $path;
            }
        }

        return null;
    }

    private function isExecutableBinary(string $binary): bool
    {
        if (file_exists($binary) && is_file($binary)) {
            return true;
        }

        $which = strtolower(PHP_OS_FAMILY) === 'windows' ? 'where.exe' : 'which';
        $escaped = escapeshellarg($binary);
        exec("{$which} {$escaped} 2>NUL", $output, $status);
        return $status === 0 && !empty($output);
    }

    /**
     * Create an unencrypted database dump and return metadata.
     * Alias used by BackupManagerService and BackupRestoreService.
     */
    public function createDump(string $outputPath): array
    {
        $res = $this->exportDatabase($outputPath);
        $size = file_exists($outputPath) ? filesize($outputPath) : ($res['file_size'] ?? 0);
        $sha256 = file_exists($outputPath) ? hash_file('sha256', $outputPath) : '';
        $tableCount = $this->estimateTableCount();

        return [
            'path' => $outputPath,
            'size' => $size,
            'file_size' => $size,
            'sha256' => $sha256,
            'records_count' => $res['records_count'] ?? 0,
            'table_count' => $tableCount,
            'method' => $this->resolveMysqldumpBinary() ? 'mysqldump_cli' : 'php_engine',
            'engine_version' => $res['engine_version'] ?? 'unknown',
        ];
    }

    /**
     * Restore database from an unencrypted SQL file and return status.
     * Alias used by BackupRestoreService.
     */
    public function restoreFromDump(string $sqlFilePath): array
    {
        $this->restoreDatabase($sqlFilePath);
        return [
            'status' => 'success',
            'file_path' => $sqlFilePath,
            'file_size' => file_exists($sqlFilePath) ? filesize($sqlFilePath) : 0,
        ];
    }

    /**
     * Estimate total tables in active database.
     */
    public function estimateTableCount(): int
    {
        try {
            $database = config('database.connections.' . config('database.default') . '.database');
            return (int) DB::table('information_schema.tables')
                ->where('table_schema', $database)
                ->where('table_type', 'BASE TABLE')
                ->count();
        } catch (\Throwable $e) {
            return count(DB::connection()->getSchemaBuilder()->getTableListing());
        }
    }

    /**
     * Export complete database schema, triggers, routines, and data to SQL file.
     *
     * @param string $outputPath File to write the SQL dump into
     * @return array [records_count, file_size, engine_version]
     */
    public function exportDatabase(string $outputPath): array
    {
        $connection = config('database.default');
        $config = config("database.connections.{$connection}");

        if (!$config) {
            throw new RuntimeException("Database connection '{$connection}' configuration not found.");
        }

        $dir = dirname($outputPath);
        if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
            throw new RuntimeException("Failed to create backup output directory: {$dir}");
        }

        $driver = $config['driver'] ?? 'mysql';

        if ($driver === 'sqlite') {
            return $this->exportSqlite($config['database'], $outputPath);
        }

        if (!in_array($driver, ['mysql', 'mariadb'], true)) {
            throw new RuntimeException("Unsupported database driver for backup: {$driver}");
        }

        $binary = $this->resolveMysqldumpBinary();

        if ($binary) {
            return $this->exportUsingMysqldumpCli($binary, $config, $outputPath);
        }

        // Pure PHP engine fallback for environments without CLI access
        Log::info('[DatabaseBackupService] CLI mysqldump not found, running pure PHP MySQL backup engine.');
        return $this->exportUsingPhpEngine($outputPath);
    }

    /**
     * Export using mysqldump CLI with secure credentials file.
     */
    private function exportUsingMysqldumpCli(string $binary, array $config, string $outputPath): array
    {
        $host = $config['host'] ?? '127.0.0.1';
        $port = $config['port'] ?? 3306;
        $database = $config['database'];
        $username = $config['username'];
        $password = $config['password'] ?? '';

        // Write private credentials file (protects password from `ps` and shell logs)
        $cnfFile = tempnam(sys_get_temp_dir(), 'mycnf_');
        $cnfContent = "[client]\n";
        $cnfContent .= "user=" . addcslashes($username, "\n\r\\\"'") . "\n";
        if ($password !== '') {
            $cnfContent .= "password=" . addcslashes($password, "\n\r\\\"'") . "\n";
        }
        $cnfContent .= "host=" . addcslashes($host, "\n\r\\\"'") . "\n";
        $cnfContent .= "port=" . (int)$port . "\n";
        file_put_contents($cnfFile, $cnfContent);
        chmod($cnfFile, 0600);

        try {
            $cmd = escapeshellcmd($binary);
            $cmd .= ' --defaults-extra-file=' . escapeshellarg($cnfFile);
            $cmd .= ' --default-character-set=utf8mb4';
            $cmd .= ' --single-transaction';
            $cmd .= ' --quick';
            $cmd .= ' --routines';
            $cmd .= ' --triggers';
            $cmd .= ' --events';
            $cmd .= ' --hex-blob';
            $cmd .= ' --skip-lock-tables';
            $cmd .= ' ' . escapeshellarg($database);
            $cmd .= ' > ' . escapeshellarg($outputPath);

            exec($cmd . ' 2>&1', $output, $status);

            if ($status !== 0) {
                $errorMsg = implode("\n", $output);
                throw new RuntimeException("mysqldump failed with exit code {$status}: {$errorMsg}");
            }

            if (!file_exists($outputPath) || filesize($outputPath) === 0) {
                throw new RuntimeException('Database dump output file was not created or is 0 bytes.');
            }

            $version = (string) DB::scalar('SELECT VERSION()');
            $recordCount = $this->estimateTotalRecords();

            return [
                'records_count' => $recordCount,
                'file_size' => filesize($outputPath),
                'engine_version' => $version,
            ];
        } finally {
            if (file_exists($cnfFile)) {
                @unlink($cnfFile);
            }
        }
    }

    /**
     * Pure PHP MySQL schema and table dumper (Zero-dependency fallback).
     */
    public function exportUsingPhpEngine(string $outputPath): array
    {
        $pdo = DB::connection()->getPdo();
        $handle = fopen($outputPath, 'wb');
        if ($handle === false) {
            throw new RuntimeException("Cannot open file for writing: {$outputPath}");
        }

        $version = (string) DB::scalar('SELECT VERSION()');
        $timestamp = now()->toDateTimeString();

        fwrite($handle, "-- NixaERP Pure PHP Database Dump Engine\n");
        fwrite($handle, "-- Generation Time: {$timestamp}\n");
        fwrite($handle, "-- Server Version: {$version}\n");
        fwrite($handle, "SET NAMES utf8mb4;\n");
        fwrite($handle, "SET FOREIGN_KEY_CHECKS = 0;\n\n");

        $tables = DB::connection()->getDoctrineSchemaManager()->listTableNames();
        $totalRecords = 0;

        foreach ($tables as $table) {
            // Table structure
            $createRow = DB::selectOne("SHOW CREATE TABLE `{$table}`");
            if ($createRow) {
                $createSql = ((array)$createRow)['Create Table'] ?? '';
                fwrite($handle, "DROP TABLE IF EXISTS `{$table}`;\n");
                fwrite($handle, $createSql . ";\n\n");
            }

            // Table data in chunks
            $rows = DB::table($table)->orderBy(DB::raw('1'))->cursor();
            $batch = [];
            $batchCount = 0;

            foreach ($rows as $row) {
                $totalRecords++;
                $values = array_map(function ($val) use ($pdo) {
                    if ($val === null) {
                        return 'NULL';
                    }
                    if (is_numeric($val) && !is_string($val)) {
                        return (string)$val;
                    }
                    return $pdo->quote((string)$val);
                }, (array)$row);

                $batch[] = '(' . implode(', ', $values) . ')';
                $batchCount++;

                if ($batchCount >= 250) {
                    fwrite($handle, "INSERT INTO `{$table}` VALUES \n" . implode(",\n", $batch) . ";\n");
                    $batch = [];
                    $batchCount = 0;
                }
            }

            if (!empty($batch)) {
                fwrite($handle, "INSERT INTO `{$table}` VALUES \n" . implode(",\n", $batch) . ";\n");
            }
            fwrite($handle, "\n");
        }

        fwrite($handle, "SET FOREIGN_KEY_CHECKS = 1;\n");
        fclose($handle);

        return [
            'records_count' => $totalRecords,
            'file_size' => filesize($outputPath),
            'engine_version' => $version,
        ];
    }

    private function exportSqlite(string $dbPath, string $outputPath): array
    {
        if (!file_exists($dbPath)) {
            $dbPath = database_path($dbPath);
        }
        if (!file_exists($dbPath)) {
            throw new RuntimeException("SQLite database file not found: {$dbPath}");
        }

        if (!copy($dbPath, $outputPath)) {
            throw new RuntimeException("Failed to copy SQLite database file to: {$outputPath}");
        }

        return [
            'records_count' => 0,
            'file_size' => filesize($outputPath),
            'engine_version' => 'SQLite 3',
        ];
    }

    /**
     * Restore database from an unencrypted SQL file.
     */
    public function restoreDatabase(string $sqlFilePath): void
    {
        if (!file_exists($sqlFilePath) || filesize($sqlFilePath) === 0) {
            throw new RuntimeException("SQL dump file not found or empty: {$sqlFilePath}");
        }

        $connection = config('database.default');
        $config = config("database.connections.{$connection}");

        if ($config['driver'] === 'sqlite') {
            $dbPath = $config['database'];
            if (!file_exists($dbPath)) {
                $dbPath = database_path($dbPath);
            }
            if (!copy($sqlFilePath, $dbPath)) {
                throw new RuntimeException("Failed to restore SQLite database from: {$sqlFilePath}");
            }
            return;
        }

        $binary = $this->resolveMysqlBinary();
        if ($binary) {
            $this->restoreUsingMysqlCli($binary, $config, $sqlFilePath);
            return;
        }

        // Pure PHP execution
        $this->restoreUsingPhpEngine($sqlFilePath);
    }

    private function restoreUsingMysqlCli(string $binary, array $config, string $sqlFilePath): void
    {
        $host = $config['host'] ?? '127.0.0.1';
        $port = $config['port'] ?? 3306;
        $database = $config['database'];
        $username = $config['username'];
        $password = $config['password'] ?? '';

        $cnfFile = tempnam(sys_get_temp_dir(), 'mycnf_');
        $cnfContent = "[client]\n";
        $cnfContent .= "user=" . addcslashes($username, "\n\r\\\"'") . "\n";
        if ($password !== '') {
            $cnfContent .= "password=" . addcslashes($password, "\n\r\\\"'") . "\n";
        }
        $cnfContent .= "host=" . addcslashes($host, "\n\r\\\"'") . "\n";
        $cnfContent .= "port=" . (int)$port . "\n";
        file_put_contents($cnfFile, $cnfContent);
        chmod($cnfFile, 0600);

        try {
            $cmd = escapeshellcmd($binary);
            $cmd .= ' --defaults-extra-file=' . escapeshellarg($cnfFile);
            $cmd .= ' --default-character-set=utf8mb4';
            $cmd .= ' ' . escapeshellarg($database);
            $cmd .= ' < ' . escapeshellarg($sqlFilePath);

            exec($cmd . ' 2>&1', $output, $status);

            if ($status !== 0) {
                $errorMsg = implode("\n", $output);
                throw new RuntimeException("mysql restore failed with exit code {$status}: {$errorMsg}");
            }
        } finally {
            if (file_exists($cnfFile)) {
                @unlink($cnfFile);
            }
        }
    }

    private function restoreUsingPhpEngine(string $sqlFilePath): void
    {
        $pdo = DB::connection()->getPdo();
        $sql = file_get_contents($sqlFilePath);
        if ($sql === false) {
            throw new RuntimeException("Failed to read SQL restore file: {$sqlFilePath}");
        }

        // Temporarily disable foreign keys and run restore queries
        $pdo->exec("SET FOREIGN_KEY_CHECKS = 0;");
        $pdo->exec($sql);
        $pdo->exec("SET FOREIGN_KEY_CHECKS = 1;");
    }

    private function estimateTotalRecords(): int
    {
        try {
            $tables = DB::select("SELECT table_name, table_rows FROM information_schema.tables WHERE table_schema = DATABASE()");
            $total = 0;
            foreach ($tables as $t) {
                $total += (int)($t->table_rows ?? 0);
            }
            return $total;
        } catch (\Throwable $e) {
            return 0;
        }
    }
}
