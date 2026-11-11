<?php

namespace App\Jobs;

use App\Services\BackupManagerService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Throwable;

class ExecuteBackupJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 1800; // 30 minutes
    public int $tries = 1;

    public function __construct(
        public string $type = 'scheduled',
        public ?int $userId = null,
        public ?int $connectionId = null,
        public bool $includeFiles = true
    ) {}

    public function handle(BackupManagerService $manager): void
    {
        Log::info("ExecuteBackupJob started: type={$this->type}, userId={$this->userId}");
        $manager->runBackup(
            type: $this->type,
            userId: $this->userId,
            connectionId: $this->connectionId,
            includeFiles: $this->includeFiles
        );
        Log::info("ExecuteBackupJob completed successfully.");
    }

    public function failed(Throwable $exception): void
    {
        Log::error("ExecuteBackupJob failed permanently: " . $exception->getMessage(), [
            'type' => $this->type,
            'userId' => $this->userId,
        ]);
    }
}
