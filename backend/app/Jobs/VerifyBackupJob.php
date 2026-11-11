<?php

namespace App\Jobs;

use App\Models\BackupRun;
use App\Services\BackupVerificationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Throwable;

class VerifyBackupJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 600; // 10 minutes
    public int $tries = 1;

    public function __construct(
        public int $backupRunId,
        public bool $deepCheck = false
    ) {}

    public function handle(BackupVerificationService $verificationService): void
    {
        $run = BackupRun::findOrFail($this->backupRunId);
        Log::info("VerifyBackupJob started for run {$run->run_code}");
        $verificationService->verifyRun($run, $this->deepCheck);
        Log::info("VerifyBackupJob completed for run {$run->run_code}");
    }

    public function failed(Throwable $exception): void
    {
        Log::error("VerifyBackupJob failed: " . $exception->getMessage(), [
            'backup_run_id' => $this->backupRunId,
        ]);
    }
}
