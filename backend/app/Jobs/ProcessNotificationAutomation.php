<?php

namespace App\Jobs;

use App\Services\NotificationAutomationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class ProcessNotificationAutomation implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 2;

    public function __construct(
        public readonly string $event,
        public readonly string $modelClass,
        public readonly int $modelId,
    ) {
    }

    public function handle(NotificationAutomationService $automationService): void
    {
        $automationService->process($this->event, $this->modelClass, $this->modelId);
    }
}
