<?php

namespace App\Console\Commands;

use App\Jobs\ExecuteBackupJob;
use App\Models\BackupConnection;
use App\Services\BackupManagerService;
use Exception;
use Illuminate\Console\Command;

class RunBackupCommand extends Command
{
    protected $signature = 'backup:run 
                            {--type=daily : Type of backup (manual, daily, weekly, monthly)}
                            {--without-files : Exclude uploaded business files and backup only the database}
                            {--async : Queue the backup job instead of running synchronously}';

    protected $description = 'Execute NixaERP automated database and business files backup to Google Drive';

    public function handle(BackupManagerService $manager): int
    {
        $type = (string) $this->option('type');
        $includeFiles = !$this->option('without-files');
        $async = (bool) $this->option('async');

        $this->info("Initiating NixaERP backup [type: {$type}, files: " . ($includeFiles ? 'yes' : 'no') . "]...");

        $connection = BackupConnection::where('status', 'connected')->first();
        if (!$connection) {
            $this->error('Error: No active Google Drive connection found. Please connect Google Drive in Backup Center.');
            return Command::FAILURE;
        }

        if ($async) {
            ExecuteBackupJob::dispatch($type, null, $connection->id, $includeFiles);
            $this->info('Backup job dispatched to queue successfully.');
            return Command::SUCCESS;
        }

        try {
            $run = $manager->runBackup(
                type: $type,
                userId: null,
                connectionId: $connection->id,
                includeFiles: $includeFiles
            );

            $this->info("✅ Backup completed successfully!");
            $this->line("Run Code: {$run->run_code}");
            $this->line("Status: {$run->status}");
            $this->line("Total Size: " . number_format($run->total_size_bytes / 1048576, 2) . " MB");
            $this->line("Artifacts: " . $run->artifacts()->count());
            $this->line("Verified: " . ($run->is_verified ? 'Yes' : 'No'));

            return Command::SUCCESS;
        } catch (Exception $e) {
            $this->error("🚨 Backup execution failed: " . $e->getMessage());
            return Command::FAILURE;
        }
    }
}
