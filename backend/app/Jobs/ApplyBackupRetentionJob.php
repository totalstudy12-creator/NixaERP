<?php

namespace App\Jobs;

use App\Services\BackupRetentionService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Throwable;

class ApplyBackupRetentionJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 600;
    public int $tries = 1;

    public function handle(BackupRetentionService $retentionService): void
    {
        Log::info("ApplyBackupRetentionJob started.");
        $result = $retentionService->applyRetention();
        Log::info("ApplyBackupRetentionJob completed.", $result);
    }

    public function failed(Throwable $exception): void
    {
        Log::error("ApplyBackupRetentionJob failed: " . $exception->getMessage());
    }
}
