<?php

namespace App\Services;

use App\Jobs\DeliverNotification;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class NotificationScheduleService
{
    public function __construct(private readonly NotificationDeliveryService $deliveryService)
    {
    }

    public function runDueSchedules(int $limit = 50): int
    {
        $ids = DB::table('scheduled_notifications')
            ->where('enabled', true)
            ->whereNotNull('next_run_at')
            ->where('next_run_at', '<=', now())
            ->orderBy('next_run_at')
            ->limit($limit)
            ->pluck('id');

        $processed = 0;
        foreach ($ids as $id) {
            if ($this->process((int) $id)) $processed++;
        }

        return $processed;
    }

    private function process(int $id): bool
    {
        return DB::transaction(function () use ($id) {
            $schedule = DB::table('scheduled_notifications')->where('id', $id)->lockForUpdate()->first();
            if (! $schedule || ! $schedule->enabled || ! $schedule->next_run_at || Carbon::parse($schedule->next_run_at)->isFuture()) return false;

            $scheduledFor = Carbon::parse($schedule->next_run_at)->utc();
            $runKey = sprintf('schedule:%d:%s', $schedule->id, $scheduledFor->format('YmdHi'));
            $recipients = json_decode((string) $schedule->recipients, true) ?: [];
            if ($recipients === []) {
                $owner = User::query()->find($schedule->created_by);
                if ($owner) $recipients = [['type' => User::class, 'id' => $owner->id, 'address' => $this->addressFor($owner, $schedule->channel)]];
            }

            foreach ($recipients as $recipient) {
                $recipientUser = ($recipient['type'] ?? null) === User::class ? User::query()->find($recipient['id'] ?? 0) : null;
                $address = (string) ($recipient['address'] ?? ($recipientUser ? $this->addressFor($recipientUser, $schedule->channel) : ''));
                $owner = $recipientUser ?: User::query()->find($schedule->created_by);
                $status = $owner ? ($this->deliveryService->channelStatus($owner)[$schedule->channel] ?? null) : null;
                $isInApp = $schedule->channel === 'in_app';
                $ready = $isInApp || ($status && $status['configured'] && ($schedule->channel === 'whatsapp' ? $address !== '' : ($recipientUser ? $status['ready'] : $address !== '')));
                $recipientKey = hash('sha256', strtolower($address ?: (string) ($recipient['id'] ?? 'internal')));
                $dedupeKey = $runKey . ':' . $recipientKey;

                $inserted = DB::table('notifications')->insertOrIgnore([
                    'type' => 'App\\Notifications\\SystemAlert',
                    'notifiable_type' => $recipientUser ? User::class : 'external',
                    'notifiable_id' => $recipientUser?->id ?? 0,
                    'data' => json_encode([
                        'title' => $schedule->title,
                        'message' => $schedule->message,
                        'channel' => $schedule->channel,
                        'priority' => $schedule->priority,
                        'schedule_id' => $schedule->id,
                    ], JSON_THROW_ON_ERROR),
                    'company_id' => $schedule->company_id,
                    'branch_id' => $schedule->branch_id,
                    'event' => 'scheduled.notification',
                    'category' => 'system',
                    'priority' => $schedule->priority,
                    'channel' => $schedule->channel,
                    'dedupe_key' => $dedupeKey,
                    'read_at' => null,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                if ($inserted === 0) continue;
                $notificationId = (int) DB::table('notifications')->where('dedupe_key', $dedupeKey)->value('id');
                if ($notificationId === 0) continue;

                $logId = DB::table('notification_logs')->insertGetId([
                    'user_id' => $recipientUser?->id,
                    'created_by' => $schedule->created_by,
                    'company_id' => $schedule->company_id,
                    'branch_id' => $schedule->branch_id,
                    'notification_id' => $notificationId,
                    'event' => 'scheduled.notification',
                    'channel' => $schedule->channel,
                    'provider' => $this->providerFor($schedule->channel),
                    'recipient' => $address ?: 'internal',
                    'status' => $isInApp ? 'sent' : ($ready ? 'queued' : 'failed'),
                    'attempt_count' => 0,
                    'error_message' => $ready ? null : ($status['detail'] ?? 'Recipient or provider is not configured.'),
                    'sent_at' => $isInApp ? now() : null,
                    'failed_at' => ! $ready && ! $isInApp ? now() : null,
                    'idempotency_key' => $dedupeKey,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                if (! $isInApp && $ready) DeliverNotification::dispatch($logId)->afterCommit();
            }

            $localNext = Carbon::parse($schedule->next_run_at, 'UTC')->setTimezone($schedule->timezone ?: config('app.timezone'));
            $next = match ($schedule->schedule_type) {
                'daily' => $localNext->addDay(),
                'weekly' => $localNext->addWeek(),
                'monthly' => $localNext->addMonthNoOverflow(),
                default => null,
            };
            while ($next && $next->lessThanOrEqualTo(now($schedule->timezone ?: config('app.timezone')))) {
                $next = match ($schedule->schedule_type) {
                    'daily' => $next->addDay(),
                    'weekly' => $next->addWeek(),
                    'monthly' => $next->addMonthNoOverflow(),
                    default => null,
                };
            }

            DB::table('scheduled_notifications')->where('id', $id)->update([
                'last_run_at' => now(),
                'next_run_at' => $next?->utc()->toDateTimeString(),
                'enabled' => $next ? $schedule->enabled : false,
                'updated_at' => now(),
            ]);

            return true;
        });
    }

    private function addressFor(User $user, string $channel): string
    {
        return match ($channel) {
            'email' => (string) $user->email,
            'sms', 'whatsapp' => (string) $user->phone,
            default => 'internal',
        };
    }

    private function providerFor(string $channel): string
    {
        return match ($channel) {
            'email' => (string) config('mail.default'),
            'sms' => 'twilio',
            'whatsapp' => 'whatsapp_web_js',
            'push' => 'webpush',
            default => 'erp-app',
        };
    }
}