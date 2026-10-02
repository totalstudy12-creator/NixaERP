<?php

namespace App\Services;

use App\Jobs\DeliverNotification;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class NotificationFallbackService
{
    public function __construct(private readonly NotificationDeliveryService $deliveryService)
    {
    }

    public function attemptAfterTransientFailure(int $deliveryId): ?int
    {
        $failed = DB::table('notification_logs')->where('id', $deliveryId)->first();
        if (! $failed || ! $failed->user_id) return null;

        $settings = DB::table('notification_fallback_settings')
            ->where('user_id', $failed->user_id)
            ->where('enabled', true)
            ->first();
        if (! $settings) return null;

        $order = json_decode((string) $settings->channel_order, true) ?: [];
        $failedIndex = array_search($failed->channel, $order, true);
        if ($failedIndex === false) return null;

        $user = User::query()->find($failed->user_id);
        if (! $user) return null;
        $statuses = $this->deliveryService->channelStatus($user);

        for ($index = $failedIndex + 1; $index < count($order); $index++) {
            $channel = $order[$index];
            $status = $statuses[$channel] ?? null;
            if (! $status || ($channel !== 'in_app' && ! $status['ready'])) continue;

            $recipient = match ($channel) {
                'email' => (string) $user->email,
                'sms', 'whatsapp' => (string) $user->phone,
                default => 'internal',
            };
            $key = 'fallback:' . $deliveryId . ':' . $channel;
            $existing = DB::table('notification_logs')->where('idempotency_key', $key)->value('id');
            if ($existing) return (int) $existing;

            $fallbackId = DB::table('notification_logs')->insertGetId([
                'user_id' => $user->id,
                'created_by' => $failed->created_by,
                'company_id' => $failed->company_id,
                'branch_id' => $failed->branch_id,
                'notification_id' => $failed->notification_id,
                'event' => $failed->event,
                'channel' => $channel,
                'provider' => match ($channel) {
                    'email' => config('mail.default'),
                    'sms', 'whatsapp' => 'twilio',
                    'push' => 'webpush',
                    default => 'erp-app',
                },
                'recipient' => $recipient,
                'status' => $channel === 'in_app' ? 'sent' : 'queued',
                'attempt_count' => 0,
                'error_message' => null,
                'sent_at' => $channel === 'in_app' ? now() : null,
                'idempotency_key' => $key,
                'fallback_from_delivery_id' => $deliveryId,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            DB::table('notification_audit_logs')->insert([
                'actor_id' => $failed->created_by,
                'notification_id' => $failed->notification_id,
                'action' => 'notification.fallback_queued',
                'context' => json_encode(['failed_delivery_id' => $deliveryId, 'fallback_delivery_id' => $fallbackId, 'channel' => $channel], JSON_THROW_ON_ERROR),
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            if ($channel !== 'in_app') DeliverNotification::dispatch($fallbackId)->afterCommit();

            return $fallbackId;
        }

        return null;
    }
}
