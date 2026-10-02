<?php

namespace App\Services;

use App\Jobs\DeliverNotification;
use App\Models\Setting;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class DailySummaryService
{
    public function __construct(
        private readonly ReportService $reportService,
        private readonly NotificationDeliveryService $deliveryService,
    ) {}

    public function settings(): array
    {
        $values = Setting::query()
            ->whereIn('key', [
                'daily_summary_enabled',
                'daily_summary_send_time',
                'daily_summary_timezone',
                'daily_summary_company_id',
                'daily_summary_branch_id',
                'daily_summary_channels',
                'daily_summary_recipients',
            ])
            ->get()
            ->keyBy('key');

        return [
            'enabled' => (bool) filter_var($values->get('daily_summary_enabled')?->value ?? '0', FILTER_VALIDATE_BOOLEAN),
            'send_time' => $values->get('daily_summary_send_time')?->value ?? '21:00',
            'timezone' => $values->get('daily_summary_timezone')?->value ?? config('app.timezone', 'Asia/Kolkata'),
            'company_id' => (int) ($values->get('daily_summary_company_id')?->value ?? 0),
            'branch_id' => (int) ($values->get('daily_summary_branch_id')?->value ?? 0),
            'channels' => $this->parseArraySetting($values->get('daily_summary_channels')?->value),
            'recipients' => $this->parseArraySetting($values->get('daily_summary_recipients')?->value),
        ];
    }

    public function saveSettings(array $payload): array
    {
        $settings = [
            'daily_summary_enabled' => (bool) ($payload['enabled'] ?? false) ? '1' : '0',
            'daily_summary_send_time' => (string) ($payload['send_time'] ?? '21:00'),
            'daily_summary_timezone' => (string) ($payload['timezone'] ?? config('app.timezone', 'Asia/Kolkata')),
            'daily_summary_company_id' => (string) ($payload['company_id'] ?? 0),
            'daily_summary_branch_id' => (string) ($payload['branch_id'] ?? 0),
            'daily_summary_channels' => json_encode($payload['channels'] ?? ['email']),
            'daily_summary_recipients' => json_encode($payload['recipients'] ?? []),
        ];

        DB::transaction(function () use ($settings) {
            foreach ($settings as $key => $value) {
                Setting::query()->updateOrCreate(['key' => $key], [
                    'key' => $key,
                    'value' => $value,
                    'group' => 'notifications',
                    'description' => 'Daily summary configuration',
                    'is_public' => false,
                ]);
            }
        });

        return $this->settings();
    }

    public function dispatchDueSummary(): int
    {
        $settings = $this->settings();
        if (! $settings['enabled']) return 0;

        $timezone = $settings['timezone'] ?: config('app.timezone', 'Asia/Kolkata');
        $localNow = Carbon::now($timezone);
        if ($localNow->format('H:i') !== substr($settings['send_time'], 0, 5)) return 0;

        $companyId = (int) $settings['company_id'];
        $branchId = (int) $settings['branch_id'];
        $recipients = User::query()->with('roles')->get()->filter(fn (User $user) =>
            $user->hasAnyPermission(['daily_summary.receive', 'reports.daily_summary.receive'])
            && $user->hasAnyPermission(['daily_summary.view', 'reports.daily_summary.view', 'view dashboard profit'])
            && (! $companyId || (int) $user->company_id === $companyId)
            && ($branchId
                ? (int) $user->branch_id === $branchId
                : (! $companyId || $user->branch_id === null))
        )->values();

        if ($settings['recipients'] !== []) {
            $allowed = collect($settings['recipients'])->map(fn ($value) => mb_strtolower((string) $value));
            $recipients = $recipients->filter(fn (User $user) =>
                $allowed->contains((string) $user->id)
                || $allowed->contains(mb_strtolower((string) $user->email))
                || $user->roles->contains(fn ($role) => $allowed->contains(mb_strtolower((string) $role->name)))
            );
        }

        if ($recipients->isEmpty()) return 0;

        $summary = $this->buildSummary(null, null, $localNow->toDateString());
        $title = 'Daily Admin Summary - ' . $localNow->toDateString();
        $message = implode("\n", [
            'Sales: ' . number_format((float) $summary['sales'], 2),
            'Expenses: ' . number_format((float) $summary['expenses'], 2),
            'Gross Profit: ' . number_format((float) $summary['profit']['gross_profit'], 2),
            'Net Profit: ' . number_format((float) $summary['profit']['net_profit'], 2),
            'Receivables: ' . number_format((float) $summary['receivables'], 2),
            'Payables: ' . number_format((float) $summary['payables'], 2),
        ]);

        $created = 0;
        foreach ($recipients as $recipient) {
            foreach ($settings['channels'] as $channel) {
                if (! in_array($channel, ['in_app', 'email', 'whatsapp', 'sms', 'push'], true)) continue;
                $key = sprintf('daily-summary:%s:%d:%d:%s:%d:%s', $localNow->toDateString(), $companyId, $branchId, $channel, $recipient->id, $title);
                $inserted = DB::table('notifications')->insertOrIgnore([
                    'type' => 'App\\Notifications\\DailySummary',
                    'notifiable_type' => User::class,
                    'notifiable_id' => $recipient->id,
                    'data' => json_encode(['title' => $title, 'message' => $message, 'channel' => $channel, 'event' => 'daily.summary', 'summary' => $summary], JSON_THROW_ON_ERROR),
                    'company_id' => $companyId ?: null,
                    'branch_id' => $branchId ?: null,
                    'event' => 'daily.summary',
                    'category' => 'reports',
                    'priority' => 'normal',
                    'channel' => $channel,
                    'dedupe_key' => $key,
                    'read_at' => null,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                if ($inserted === 0) continue;

                $notificationId = (int) DB::table('notifications')->where('dedupe_key', $key)->value('id');
                $status = $this->deliveryService->channelStatus($recipient)[$channel];
                $isInApp = $channel === 'in_app';
                $ready = $isInApp || $status['ready'];
                $logId = DB::table('notification_logs')->insertGetId([
                    'user_id' => $recipient->id,
                    'company_id' => $companyId ?: null,
                    'branch_id' => $branchId ?: null,
                    'notification_id' => $notificationId,
                    'event' => 'daily.summary',
                    'channel' => $channel,
                    'provider' => match ($channel) {
                        'email' => config('mail.default'),
                        'sms', 'whatsapp' => 'twilio',
                        'push' => 'webpush',
                        default => 'erp-app',
                    },
                    'recipient' => match ($channel) {
                        'email' => $recipient->email,
                        'sms', 'whatsapp' => $recipient->phone,
                        default => 'internal',
                    },
                    'status' => $isInApp ? 'sent' : ($ready ? 'queued' : 'failed'),
                    'attempt_count' => 0,
                    'error_message' => $ready ? null : $status['detail'],
                    'sent_at' => $isInApp ? now() : null,
                    'failed_at' => ! $ready ? now() : null,
                    'idempotency_key' => $key,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                if (! $isInApp && $ready) DeliverNotification::dispatch($logId)->afterCommit();
                $created++;
            }
        }

        return $created;
    }

    public function buildSummary(?int $companyId = null, ?int $branchId = null, ?string $date = null): array
    {
        $date = $date ? Carbon::parse($date) : Carbon::now();
        $companyId = $companyId ?? (int) ($this->settings()['company_id'] ?? 0);
        $branchId = $branchId ?? (int) ($this->settings()['branch_id'] ?? 0);

        $profitSummary = $this->reportService->getProfitLossSummary($companyId, $branchId, $date->copy()->startOfDay()->format('Y-m-d'), $date->copy()->endOfDay()->format('Y-m-d'));
        $outstandingSales = $this->reportService->getOutstandingSales($companyId, $branchId);
        $outstandingPurchases = $this->reportService->getOutstandingPurchases($companyId, $branchId);

        $sales = round((float) ($profitSummary['total_sales'] ?? 0), 2);
        $expenses = round((float) ($profitSummary['operating_expenses'] ?? 0), 2);
        $income = round((float) ($profitSummary['other_income'] ?? 0), 2);
        $receivables = round((float) ($outstandingSales['total_outstanding'] ?? 0), 2);
        $payables = round((float) ($outstandingPurchases['total_outstanding'] ?? 0), 2);

        return [
            'date' => $date->format('Y-m-d'),
            'company_id' => $companyId,
            'branch_id' => $branchId,
            'sales' => $sales,
            'sales_detail' => [
                'invoice_count' => (int) ($profitSummary['invoice_count'] ?? 0),
                'total' => $sales,
            ],
            'income' => $income,
            'expenses' => $expenses,
            'receivables' => $receivables,
            'payables' => $payables,
            'profit' => [
                'gross_profit' => round((float) ($profitSummary['gross_profit'] ?? 0), 2),
                'net_profit' => round((float) ($profitSummary['net_profit'] ?? 0), 2),
            ],
            'outstanding' => ['sales' => $receivables, 'purchases' => $payables],
            'generated_at' => now()->toDateTimeString(),
        ];
    }

    protected function parseArraySetting(?string $value): array
    {
        if (empty($value)) {
            return [];
        }

        $decoded = json_decode($value, true);
        if (is_array($decoded)) {
            return $decoded;
        }

        return array_values(array_filter(array_map('trim', explode(',', (string) $value))));
    }
}
