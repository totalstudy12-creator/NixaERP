<?php

namespace App\Console\Commands;

use App\Services\BackupRetentionService;
use Exception;
use Illuminate\Console\Command;

class PruneBackupsCommand extends Command
{
    protected $signature = 'backup:prune';

    protected $description = 'Apply retention policies (daily, weekly, monthly) and prune expired Google Drive backups';

    public function handle(BackupRetentionService $retentionService): int
    {
        $this->info("Applying automated retention policies to Google Drive backups...");

        try {
            $result = $retentionService->applyRetention();
            $this->info($result['message']);
            return Command::SUCCESS;
        } catch (Exception $e) {
            $this->error("Failed to prune backups: " . $e->getMessage());
            return Command::FAILURE;
        }
    }
}
