<?php

namespace App\Jobs;

use App\Models\BackupRun;
use App\Services\BackupRestoreService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Throwable;

class RestoreBackupJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 3600; // 1 hour for major database and asset restores
    public int $tries = 1;

    public function __construct(
        public int $backupRunId,
        public bool $restoreDatabase = true,
        public bool $restoreFiles = true
    ) {}

    public function handle(BackupRestoreService $restoreService): void
    {
        $run = BackupRun::findOrFail($this->backupRunId);
        Log::info("RestoreBackupJob started for run {$run->run_code}");
        $restoreService->restoreFromRun($run, $this->restoreDatabase, $this->restoreFiles);
        Log::info("RestoreBackupJob completed for run {$run->run_code}");
    }

    public function failed(Throwable $exception): void
    {
        Log::critical("RestoreBackupJob failed permanently: " . $exception->getMessage(), [
            'backup_run_id' => $this->backupRunId,
        ]);
    }
}
