<?php

namespace App\Jobs;

use App\Services\NotificationDeliveryService;
use App\Services\NotificationFallbackService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Throwable;

class DeliverNotification implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public array $backoff = [10, 60, 300];

    public function __construct(public readonly int $logId)
    {
    }

    public function handle(NotificationDeliveryService $deliveryService, NotificationFallbackService $fallbackService): void
    {
        $log = DB::table('notification_logs')->where('id', $this->logId)->first();
        if (! $log || in_array($log->status, ['cancelled', 'sent', 'delivered', 'failed'], true)) return;

        DB::table('notification_logs')->where('id', $this->logId)->update([
            'status' => 'sending',
            'attempt_count' => DB::raw('attempt_count + 1'),
            'updated_at' => now(),
        ]);

        try {
            $deliveryService->deliver($this->logId);
        } catch (Throwable $exception) {
            $statusCode = method_exists($exception, 'getStatusCode') ? (int) $exception->getStatusCode() : (int) $exception->getCode();
            $permanent = $statusCode >= 400 && $statusCode < 500 && $statusCode !== 429;
            $failed = $permanent || $this->attempts() >= $this->tries;
            DB::table('notification_logs')->where('id', $this->logId)->update([
                'status' => $failed ? 'failed' : 'retrying',
                'error_message' => mb_substr($exception->getMessage(), 0, 4000),
                'failed_at' => $failed ? now() : null,
                'updated_at' => now(),
            ]);

            if ($permanent) return;
            if ($failed) $fallbackService->attemptAfterTransientFailure($this->logId);
            throw $exception;
        }
    }

    public function failed(?Throwable $exception): void
    {
        DB::table('notification_logs')->where('id', $this->logId)->update([
            'status' => 'failed',
            'error_message' => $exception ? mb_substr($exception->getMessage(), 0, 4000) : 'Delivery failed.',
            'failed_at' => now(),
            'updated_at' => now(),
        ]);
    }
}