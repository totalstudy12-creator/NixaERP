<?php

namespace App\Services;

use App\Jobs\DeliverNotification;
use App\Models\Customer;
use App\Models\FinancialEntry;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\PurchaseInvoice;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

class NotificationAutomationService
{
    public function __construct(private readonly NotificationDeliveryService $deliveryService)
    {
    }

    public function queueModelEvent(string $event, Model $model): void
    {
        if (! in_array($model::class, [Invoice::class, Payment::class, Customer::class, PurchaseInvoice::class, FinancialEntry::class], true)) return;
        \App\Jobs\ProcessNotificationAutomation::dispatch($event, $model::class, (int) $model->getKey())->afterCommit();
    }

    public function dispatchOverdueInvoices(): int
    {
        if (! DB::table('notification_automation_rules')->where('event', 'invoice.overdue')->where('enabled', true)->exists()) return 0;

        $count = 0;
        Invoice::query()
            ->whereNotNull('due_date')
            ->whereDate('due_date', '<', now()->toDateString())
            ->whereNotIn('status', ['paid', 'cancelled', 'draft'])
            ->whereRaw('COALESCE(paid_amount, 0) < COALESCE(total_amount, 0)')
            ->orderBy('id')
            ->chunkById(200, function ($invoices) use (&$count) {
                foreach ($invoices as $invoice) {
                    $this->queueModelEvent('invoice.overdue', $invoice);
                    $count++;
                }
            });

        return $count;
    }

    public function process(string $event, string $modelClass, int $modelId): void
    {
        if (! in_array($modelClass, [Invoice::class, Payment::class, Customer::class, PurchaseInvoice::class, FinancialEntry::class], true)) return;
        $resource = $modelClass::query()->find($modelId);
        if (! $resource) return;

        $rules = DB::table('notification_automation_rules')
            ->where('event', $event)
            ->where('enabled', true)
            ->where(fn ($query) => $query->whereNull('company_id')->orWhere('company_id', $resource->company_id))
            ->where(fn ($query) => $query->whereNull('branch_id')->orWhere('branch_id', $resource->branch_id))
            ->get();

        if ($rules->isEmpty()) return;

        $recipients = User::query()->get()->filter(fn (User $user) => $user->hasAnyPermission(['notifications.receive', 'notifications.view']))->values();
        if ($resource->company_id || $resource->branch_id) {
            $recipients = $recipients->filter(function (User $user) use ($resource) {
                if (! array_key_exists('company_id', $user->getAttributes()) && $resource->company_id) return false;
                if (! array_key_exists('branch_id', $user->getAttributes()) && $resource->branch_id) return false;
                return (! $resource->company_id || (int) $user->company_id === (int) $resource->company_id)
                    && (! $resource->branch_id || (int) $user->branch_id === (int) $resource->branch_id);
            });
        }
        if ($recipients->isEmpty()) return;

        foreach ($rules as $rule) {
            $channels = json_decode((string) $rule->channels, true) ?: [];
            $variables = $this->variablesFor($resource);
            $template = $rule->template_id
                ? DB::table('notification_templates')->where('id', $rule->template_id)->where('active', true)->first()
                : null;
            $title = $template?->name ?: ($rule->label ?: $event);
            $message = $template?->body ?: $this->defaultMessage($event, $variables);
            $subject = $template?->subject ?: $title;
            foreach ($variables as $name => $value) {
                $title = str_replace('{{' . $name . '}}', (string) $value, $title);
                $message = str_replace('{{' . $name . '}}', (string) $value, $message);
                $subject = str_replace('{{' . $name . '}}', (string) $value, $subject);
            }

            foreach ($recipients as $recipient) {
                foreach ($channels as $channel) {
                    $this->createDelivery($rule, $event, $resource, $recipient, $channel, $title, $message, $subject);
                }
            }
        }
    }

    private function createDelivery(object $rule, string $event, Model $resource, User $recipient, string $channel, string $title, string $message, string $subject): void
    {
        if (! in_array($channel, ['in_app', 'email', 'whatsapp', 'sms', 'push'], true)) return;
        if (! $this->preferenceAllows($recipient->id, $event, $channel, $rule->priority)) return;
        if ($resource->company_id || $resource->branch_id) {
            if ((int) ($recipient->company_id ?? 0) !== (int) $resource->company_id || (int) ($recipient->branch_id ?? 0) !== (int) $resource->branch_id) return;
        }

        $dedupeKey = sprintf('automation:%d:%s:%d:%s:%d:%s', $rule->id, class_basename($resource), $resource->getKey(), $event, $recipient->id, $channel);
        $inserted = DB::table('notifications')->insertOrIgnore([
            'type' => 'App\\Notifications\\SystemAlert',
            'notifiable_type' => User::class,
            'notifiable_id' => $recipient->id,
            'data' => json_encode([
                'title' => $title,
                'message' => $message,
                'subject' => $subject,
                'event' => $event,
                'channel' => $channel,
                'priority' => $rule->priority,
                'resource_type' => class_basename($resource),
                'resource_id' => $resource->getKey(),
            ], JSON_THROW_ON_ERROR),
            'company_id' => $resource->company_id,
            'branch_id' => $resource->branch_id,
            'event' => $event,
            'category' => explode('.', $event)[0],
            'priority' => $rule->priority,
            'channel' => $channel,
            'resource_type' => $resource::class,
            'resource_id' => $resource->getKey(),
            'dedupe_key' => $dedupeKey,
            'read_at' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        if ($inserted === 0) return;
        $notificationId = (int) DB::table('notifications')->where('dedupe_key', $dedupeKey)->value('id');
        if ($notificationId === 0) return;

        $status = $this->deliveryService->channelStatus($recipient)[$channel];
        $ready = $channel === 'in_app' || $status['ready'] || ($channel === 'whatsapp' && $status['configured']);
        $address = match ($channel) {
            'email' => (string) $recipient->email,
            'sms', 'whatsapp' => (string) $recipient->phone,
            default => 'internal',
        };
        $idempotencyKey = $dedupeKey . ':' . $notificationId;
        $logId = DB::table('notification_logs')->insertGetId([
            'user_id' => $recipient->id,
            'created_by' => $rule->created_by,
            'company_id' => $resource->company_id,
            'branch_id' => $resource->branch_id,
            'notification_id' => $notificationId,
            'event' => $event,
            'channel' => $channel,
            'provider' => match ($channel) {
                'email' => config('mail.default'),
                'sms' => 'twilio',
                'whatsapp' => 'whatsapp_web_js',
                'push' => 'webpush',
                default => 'erp-app',
            },
            'recipient' => $address,
            'status' => $channel === 'in_app' ? 'sent' : ($ready ? 'queued' : 'failed'),
            'attempt_count' => 0,
            'error_message' => $ready ? null : $status['detail'],
            'sent_at' => $channel === 'in_app' ? now() : null,
            'failed_at' => ! $ready ? now() : null,
            'idempotency_key' => $idempotencyKey,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        if ($channel !== 'in_app' && $ready) DeliverNotification::dispatch($logId)->afterCommit();
    }

    private function preferenceAllows(int $userId, string $event, string $channel, string $priority): bool
    {
        $channelEnabled = DB::table('notification_preferences')->where('user_id', $userId)->where('event_name', '*')->where('channel', $channel)->value('enabled');
        $eventEnabled = DB::table('notification_preferences')->where('user_id', $userId)->where('event_name', $event)->where('channel', '*')->value('enabled');
        if (($channelEnabled !== null && ! (bool) $channelEnabled || $eventEnabled !== null && ! (bool) $eventEnabled) && ! in_array($priority, ['critical', 'high'], true)) return false;

        $settings = DB::table('notification_user_settings')->where('user_id', $userId)->first();
        if (! $settings?->quiet_hours || ($priority === 'critical' && $settings->critical_override)) return true;
        $clock = now()->format('H:i:s');
        $from = $settings->quiet_from;
        $to = $settings->quiet_to;
        $quiet = $from <= $to ? ($clock >= $from && $clock < $to) : ($clock >= $from || $clock < $to);

        return ! $quiet;
    }

    private function variablesFor(Model $model): array
    {
        $customer = $model instanceof Invoice ? $model->customer : null;
        $supplier = $model instanceof PurchaseInvoice ? $model->supplier : null;

        return [
            'customer_name' => $customer?->name ?? $model->customer_name ?? '',
            'invoice_number' => $model->invoice_no ?? $model->invoice_number ?? $model->purchase_number ?? '',
            'amount' => $model->total_amount ?? $model->grand_total ?? $model->amount ?? '',
            'company_name' => $model->company?->name ?? '',
            'branch_name' => $model->branch?->name ?? '',
            'date' => $model->invoice_date ?? $model->purchase_date ?? $model->transaction_date ?? $model->entry_date ?? now()->toDateString(),
            'vendor_name' => $supplier?->name ?? $model->counterparty ?? '',
            'product_name' => '',
            'order_number' => $model->order?->order_no ?? '',
            'payment_method' => $model->payment_method ?? '',
        ];
    }

    private function defaultMessage(string $event, array $variables): string
    {
        return match ($event) {
            'invoice.created' => 'Invoice {{invoice_number}} was created for {{customer_name}}. Amount: {{amount}}.',
            'invoice.paid' => 'Invoice {{invoice_number}} for {{customer_name}} has been paid.',
            'payment.received' => 'A payment of {{amount}} was received.',
            'customer.created' => 'A new customer, {{customer_name}}, was added.',
            'purchase.created' => 'Purchase {{invoice_number}} was created for {{vendor_name}}. Amount: {{amount}}.',
            'expense.created' => 'An expense of {{amount}} was recorded.',
            'expense.approved' => 'An expense of {{amount}} was approved.',
            'expense.rejected' => 'An expense of {{amount}} was rejected.',
            default => 'ERP event: ' . $event,
        };
    }
}
