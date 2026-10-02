<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\DeliverNotification;
use App\Models\Customer;
use App\Models\Employee;
use App\Models\Role;
use App\Models\Setting;
use App\Models\Supplier;
use App\Models\User;
use App\Services\DailySummaryService;
use App\Services\NotificationDeliveryService;
use App\Services\ReportService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Carbon\Carbon;
use Illuminate\Validation\ValidationException;
use Twilio\Security\RequestValidator;

class NotificationController extends Controller
{
    public function __construct(
        private readonly DailySummaryService $dailySummaryService,
        private readonly ReportService $reportService,
        private readonly NotificationDeliveryService $notificationDeliveryService,
    ) {
    }

    public function index(Request $request)
    {
        $user = $request->user();
        $query = DB::table('notifications')
            ->where('notifiable_type', User::class)
            ->where('notifiable_id', $user->id)
            ->whereNull('archived_at');
        $this->applyNotificationScope($query, $user);

        if ($request->filled('read')) {
            $request->input('read') === 'unread' ? $query->whereNull('read_at') : $query->whereNotNull('read_at');
        }
        if ($request->filled('channel') && $request->input('channel') !== 'all') $query->where('channel', $request->string('channel'));
        if ($request->filled('priority') && $request->input('priority') !== 'all') $query->where('priority', $request->string('priority'));
        if ($request->filled('event') && $request->input('event') !== 'all') $query->where('event', $request->string('event'));
        if ($request->filled('date_from')) $query->whereDate('created_at', '>=', $request->input('date_from'));
        if ($request->filled('date_to')) $query->whereDate('created_at', '<=', $request->input('date_to'));
        if ($request->filled('search')) {
            $term = '%' . addcslashes($request->string('search')->toString(), '%_') . '%';
            $query->where('data', 'like', $term);
        }

        $perPage = min(100, max(1, (int) $request->input('per_page', 20)));
        $page = $query->orderByDesc('created_at')->paginate($perPage)->withQueryString();
        $notifications = $page->getCollection()->map(fn ($notification) => $this->formatNotification($notification));

        return response()->json([
            'success' => true,
            'data' => $notifications->all(),
            'current_page' => $page->currentPage(),
            'last_page' => $page->lastPage(),
            'per_page' => $page->perPage(),
            'total' => $page->total(),
        ]);
    }

    private function formatNotification(object $notification): array
    {
        $data = is_string($notification->data) ? json_decode($notification->data, true) : (array) ($notification->data ?? []);

        return [
            'id' => (int) $notification->id,
            'type' => $notification->type,
            'title' => $data['title'] ?? $notification->type,
            'message' => $data['message'] ?? '',
            'read' => ! empty($notification->read_at),
            'read_at' => $notification->read_at,
            'created_at' => $notification->created_at,
            'category' => $notification->event ?? $data['event'] ?? $notification->category ?? $data['category'] ?? null,
            'priority' => $notification->priority ?? $data['priority'] ?? 'normal',
            'channel' => $notification->channel ?? $data['channel'] ?? 'in_app',
            'event' => $notification->event ?? $data['event'] ?? null,
            'data' => $data,
        ];
    }

    private function applyNotificationScope($query, User $user): void
    {
        if ($user->hasAnyRole(['Admin', 'Super Admin'])) return;
        if ($user->company_id) {
            $query->where('company_id', $user->company_id);
        } else {
            $query->whereNull('company_id');
        }
        if ($user->branch_id) $query->where('branch_id', $user->branch_id);
    }

    public function unreadCount(Request $request)
    {
        $user = $request->user();
        $query = DB::table('notifications')
            ->where('notifiable_type', User::class)
            ->where('notifiable_id', $user->id)
            ->whereNull('read_at')
            ->whereNull('archived_at');
        $this->applyNotificationScope($query, $user);
        $count = $query->count();

        return response()->json([
            'success' => true,
            'data' => ['count' => $count],
        ]);
    }

    public function summaryStats(Request $request)
    {
        $user = $request->user();
        $notifications = DB::table('notifications')
            ->where('notifiable_type', User::class)
            ->where('notifiable_id', $user->id)
            ->whereNull('archived_at');
        $this->applyNotificationScope($notifications, $user);
        $total = (clone $notifications)->count();
        $unread = (clone $notifications)->whereNull('read_at')->count();
        $critical = (clone $notifications)->whereNull('read_at')->whereIn('priority', ['critical', 'urgent'])->count();

        $deliveries = DB::table('notification_logs')
            ->where(fn ($query) => $query->where('user_id', $user->id)->orWhere('created_by', $user->id));
        $this->applyDeliveryScope($deliveries, $user);
        $deliveryTotal = (clone $deliveries)->count();
        $sent = (clone $deliveries)->whereIn('status', ['sent', 'delivered'])->count();
        $failed = (clone $deliveries)->where('status', 'failed')->count();
        $byChannel = [];
        foreach ((clone $deliveries)->select('channel', 'status', DB::raw('COUNT(*) as count'))->groupBy('channel', 'status')->get() as $row) {
            $byChannel[$row->channel][$row->status] = (int) $row->count;
        }

        return response()->json(['success' => true, 'data' => [
            'notifications' => ['total' => $total, 'unread' => $unread, 'critical' => $critical],
            'deliveries' => ['total' => $deliveryTotal, 'sent' => $sent, 'failed' => $failed, 'rate' => $deliveryTotal ? (int) round(($sent / $deliveryTotal) * 100) : 0, 'by_channel' => $byChannel],
        ]]);
    }

    public function markRead(Request $request, $id)
    {
        $user = $request->user();

        $query = DB::table('notifications')
            ->where('id', $id)
            ->where('notifiable_type', User::class)
            ->where('notifiable_id', $user->id);
        $this->applyNotificationScope($query, $user);
        $notification = $query->first();

        if (! $notification) {
            return response()->json(['message' => 'Notification not found.'], 404);
        }

        $query = DB::table('notifications')->where('id', $id);
        $this->applyNotificationScope($query, $user);
        $query->update(['read_at' => now()]);

        return response()->json([
            'success' => true,
            'data' => ['id' => (int) $id, 'read' => true],
        ]);
    }

    public function show(Request $request, $id)
    {
        $query = DB::table('notifications')
            ->where('id', $id)
            ->where('notifiable_type', User::class)
            ->where('notifiable_id', $request->user()->id)
            ->whereNull('archived_at');
        $this->applyNotificationScope($query, $request->user());
        $notification = $query->first();

        abort_unless((bool) $notification, 404, 'Notification not found.');

        return response()->json(['success' => true, 'data' => $this->formatNotification($notification)]);
    }

    public function markUnread(Request $request, $id)
    {
        $query = DB::table('notifications')
            ->where('id', $id)
            ->where('notifiable_type', User::class)
            ->where('notifiable_id', $request->user()->id)
            ->whereNull('archived_at');
        $this->applyNotificationScope($query, $request->user());
        $updated = $query->update(['read_at' => null, 'updated_at' => now()]);

        abort_unless($updated, 404, 'Notification not found.');

        return response()->json(['success' => true, 'data' => ['id' => (int) $id, 'read' => false]]);
    }

    public function archive(Request $request, $id)
    {
        $query = DB::table('notifications')
            ->where('id', $id)
            ->where('notifiable_type', User::class)
            ->where('notifiable_id', $request->user()->id)
            ->whereNull('archived_at');
        $this->applyNotificationScope($query, $request->user());
        $updated = $query->update(['archived_at' => now(), 'updated_at' => now()]);

        abort_unless($updated, 404, 'Notification not found.');
        $this->audit($request, 'notification.archived', (int) $id);

        return response()->json(['success' => true]);
    }

    public function destroy(Request $request, $id)
    {
        $query = DB::table('notifications')
            ->where('id', $id)
            ->where('notifiable_type', User::class)
            ->where('notifiable_id', $request->user()->id);
        $this->applyNotificationScope($query, $request->user());
        $deleted = $query->delete();

        abort_unless($deleted, 404, 'Notification not found.');
        $this->audit($request, 'notification.deleted', (int) $id);

        return response()->json(['success' => true]);
    }

    public function markAllRead(Request $request)
    {
        $user = $request->user();

        $query = DB::table('notifications')
            ->where('notifiable_type', User::class)
            ->where('notifiable_id', $user->id)
            ->whereNull('read_at')
            ->whereNull('archived_at');
        $this->applyNotificationScope($query, $user);
        $query->update(['read_at' => now()]);

        return response()->json([
            'success' => true,
            'data' => ['updated' => true],
        ]);
    }

    public function settings(Request $request)
    {
        return response()->json([
            'success' => true,
            'data' => $this->dailySummaryService->settings(),
        ]);
    }

    public function updateSettings(Request $request)
    {
        foreach (['company_id', 'branch_id'] as $scopeKey) {
            if ($request->input($scopeKey) === '' || $request->input($scopeKey) === 0 || $request->input($scopeKey) === '0') {
                $request->merge([$scopeKey => null]);
            }
        }
        $validated = $request->validate([
            'enabled' => ['sometimes', 'boolean'],
            'send_time' => ['sometimes', 'string', 'max:5'],
            'timezone' => ['sometimes', 'timezone'],
            'company_id' => ['sometimes', 'nullable', 'integer', 'exists:companies,id'],
            'branch_id' => ['sometimes', 'nullable', 'integer', 'exists:branches,id'],
            'channels' => ['sometimes', 'array'],
            'channels.*' => ['in:in_app,email,whatsapp,sms,push'],
            'recipients' => ['sometimes', 'array', 'max:500'],
            'recipients.*' => ['string', 'max:255'],
        ]);

        if (! empty($validated['company_id']) && ! empty($validated['branch_id'])
            && ! DB::table('branches')->where('id', $validated['branch_id'])->where('company_id', $validated['company_id'])->exists()) {
            throw ValidationException::withMessages(['branch_id' => ['The selected branch does not belong to the selected company.']]);
        }

        $actor = $request->user();
        if (array_key_exists('channels', $validated)) {
            $this->requireWhatsAppSendPermission($actor, $validated['channels']);
        }
        if (! $actor->hasAnyRole(['Admin', 'Super Admin'])) {
            $companyId = $validated['company_id'] ?? $actor->company_id;
            $branchId = $validated['branch_id'] ?? $actor->branch_id;
            if (($companyId && (int) $companyId !== (int) $actor->company_id)
                || ($branchId && (int) $branchId !== (int) $actor->branch_id)) {
                abort(403, 'You do not have access to configure that company or branch summary.');
            }
            $validated['company_id'] = $companyId;
            $validated['branch_id'] = $branchId;
        }

        $result = $this->dailySummaryService->saveSettings($validated);
        $this->audit($request, 'daily_summary.settings_updated');

        return response()->json([
            'success' => true,
            'data' => $result,
        ]);
    }

    public function sendTest(Request $request)
    {
        $validated = $request->validate([
            'title' => ['required', 'string', 'max:200'],
            'message' => ['required', 'string', 'max:1000'],
            'channel' => ['sometimes', 'string', 'in:in_app,email,whatsapp,sms,push'],
            'subject' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);

        $user = $request->user();
        $channel = $validated['channel'] ?? 'in_app';
        $this->requireWhatsAppSendPermission($user, $channel);
        $channelStatus = $this->notificationDeliveryService->channelStatus($user)[$channel];

        if (! $channelStatus['ready']) {
            return response()->json([
                'message' => $channelStatus['detail'],
                'errors' => ['channel' => [$channelStatus['detail']]],
            ], 422);
        }

        $recipient = match ($channel) {
            'email' => $user->email,
            'sms', 'whatsapp' => $user->phone,
            'push', 'in_app' => 'internal',
        };

        $notificationId = DB::table('notifications')->insertGetId([
            'type' => 'App\\Notifications\\SystemAlert',
            'notifiable_type' => User::class,
            'notifiable_id' => $user->id,
            'data' => json_encode([
                'title' => $validated['title'],
                'message' => $validated['message'],
                'subject' => $validated['subject'] ?? $validated['title'],
                'channel' => $channel,
                'module' => 'system',
                'priority' => 'normal',
            ], JSON_THROW_ON_ERROR),
            'company_id' => $user->company_id,
            'branch_id' => $user->branch_id,
            'event' => 'system.alert',
            'category' => 'system',
            'priority' => 'normal',
            'channel' => $channel,
            'read_at' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $logId = DB::table('notification_logs')->insertGetId([
            'user_id' => $user->id,
            'created_by' => $user->id,
            'company_id' => $user->company_id,
            'branch_id' => $user->branch_id,
            'notification_id' => $notificationId,
            'event' => 'system.alert',
            'channel' => $channel,
            'provider' => match ($channel) {
                'email' => config('mail.default'),
                'whatsapp' => 'whatsapp_web_js',
                'sms' => 'twilio',
                'push' => 'webpush',
                default => 'erp-app',
            },
            'recipient' => $recipient,
            'status' => $channel === 'in_app' ? 'sent' : 'queued',
            'provider_message_id' => null,
            'attempt_count' => 0,
            'error_message' => null,
            'sent_at' => $channel === 'in_app' ? now() : null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        if ($channel !== 'in_app') {
            DeliverNotification::dispatch($logId);
        }
        $deliveryStatus = DB::table('notification_logs')->where('id', $logId)->value('status');
        $isSent = $deliveryStatus === 'sent';

        Log::info('Frontend test notification accepted', [
            'user_id' => $user->id,
            'channel' => $channel,
            'notification_id' => $notificationId,
        ]);

        return response()->json([
            'success' => true,
            'message' => $isSent ? 'Notification delivered successfully.' : 'Notification queued for delivery.',
            'data' => [
                'id' => $notificationId,
                'channel' => $channel,
                'status' => $deliveryStatus,
            ],
        ], $isSent ? 201 : 202);
    }

    public function send(Request $request)
    {
        $validated = $request->validate([
            'title' => ['required', 'string', 'max:200'],
            'message' => ['required', 'string', 'max:10000'],
            'channel' => ['required', 'in:in_app,email,whatsapp,sms,push'],
            'priority' => ['sometimes', 'in:critical,high,normal,low'],
            'subject' => ['sometimes', 'nullable', 'string', 'max:255'],
            'recipients' => ['sometimes', 'array', 'min:1', 'max:500'],
            'recipients.*' => ['required', 'string', 'max:255'],
            'variables' => ['sometimes', 'array'],
            'template_id' => ['sometimes', 'nullable', 'integer', 'exists:notification_templates,id'],
            'schedule_at' => ['sometimes', 'nullable', 'date', 'after:now'],
            'company_id' => ['sometimes', 'nullable', 'integer', 'exists:companies,id'],
            'branch_id' => ['sometimes', 'nullable', 'integer', 'exists:branches,id'],
            'attachment' => ['sometimes', 'nullable', 'string', 'max:2048'],
        ]);

        $actor = $request->user();
        $channel = $validated['channel'];
        $title = $validated['title'];
        $message = $validated['message'];
        $subject = $validated['subject'] ?? $title;

        if (! empty($validated['template_id'])) {
            $template = DB::table('notification_templates')->where('id', $validated['template_id'])->where('active', true)->first();
            if (! $template) throw ValidationException::withMessages(['template_id' => ['The selected template is not active.']]);
            $title = $template->name;
            $message = $template->body;
            $subject = (string) ($template->subject ?: $template->name);
            $channel = $template->channel;
        }

        $this->requireWhatsAppSendPermission($actor, $channel);

        $replacements = $this->templateReplacements($validated['variables'] ?? []);
        preg_match_all('/\\{\\{([a-z_]+)\\}\\}/', implode("\n", [$title, $message, $subject]), $variableMatches);
        $missingVariables = collect($variableMatches[1] ?? [])->unique()->filter(function (string $name) use ($replacements) {
            $key = '{{' . $name . '}}';

            return ! array_key_exists($key, $replacements) || trim($replacements[$key]) === '';
        })->values()->all();
        if ($missingVariables !== []) {
            throw ValidationException::withMessages([
                'variables' => ['Provide a value for every message variable: ' . implode(', ', $missingVariables) . '.'],
            ]);
        }
        $title = strtr($title, $replacements);
        $message = strtr($message, $replacements);
        $subject = strtr($subject, $replacements);

        if (! empty($validated['attachment'])) {
            $ownedPath = preg_match('#^notifications/attachments/' . $actor->id . '/[A-Za-z0-9_-]+\.(pdf|png|jpe?g|docx?|xlsx?)$#i', $validated['attachment']) === 1;
            if ($channel !== 'email' || ! $ownedPath || ! Storage::disk('local')->exists($validated['attachment'])) {
                throw ValidationException::withMessages(['attachment' => ['Choose a valid attachment uploaded by your account. Attachments are currently supported for email.']]);
            }
        }

        $companyId = $validated['company_id'] ?? ($actor->company_id ?: null);
        $branchId = $validated['branch_id'] ?? ($actor->branch_id ?: null);
        if (! $actor->hasAnyRole(['Admin', 'Super Admin'])) {
            if (($companyId && (int) $actor->company_id !== (int) $companyId)
                || ($branchId && (int) $actor->branch_id !== (int) $branchId)) {
                abort(403, 'You do not have access to the selected company or branch.');
            }
        }
        $validated['company_id'] = $companyId;
        $validated['branch_id'] = $branchId;

        $recipientTokens = $validated['recipients'] ?? [];
        $targets = $this->resolveRecipients($recipientTokens, $actor, $companyId, $branchId, $channel);
        if ($companyId || $branchId) {
            $targets = array_values(array_filter($targets, function ($target) use ($companyId, $branchId) {
                if (! $target['user']) return true;
                if ($companyId && (int) $target['user']->company_id !== (int) $companyId) return false;
                return ! $branchId || (int) $target['user']->branch_id === (int) $branchId;
            }));
        }
        if ($recipientTokens !== [] && $targets === []) {
            throw ValidationException::withMessages(['recipients' => ['No matching recipients are assigned to the selected company or branch.']]);
        }
        if (collect($targets)->contains(fn ($target) => $target['type'] !== User::class) && ! $actor->hasPermission('notifications.manage')) {
            abort(403, 'Managing external recipients requires notification management permission.');
        }
        if ($channel === 'in_app' && collect($targets)->contains(fn ($target) => ! $target['user'])) {
            throw ValidationException::withMessages(['recipients' => ['In-App notifications can only target ERP users or roles.']]);
        }
        if (in_array($channel, ['push', 'in_app'], true) && collect($targets)->contains(fn ($target) => ! $target['user'])) {
            throw ValidationException::withMessages(['recipients' => ['Push and In-App channels require ERP user recipients.']]);
        }
        if (empty($targets)) $targets = [['type' => User::class, 'id' => $actor->id, 'user' => $actor, 'address' => $this->addressForUser($actor, $channel)]];
        $this->validateTargetsForChannel($targets, $channel);
        if ($channel === 'whatsapp' && count($targets) !== 1) {
            throw ValidationException::withMessages(['recipients' => ['Send WhatsApp notifications to one recipient per request.']]);
        }

        if (! empty($validated['schedule_at'])) {
            $scheduleTimezone = $actor->timezone ?: config('app.timezone');
            $scheduledAt = Carbon::parse($validated['schedule_at'], $scheduleTimezone);
            $schedule = DB::table('scheduled_notifications')->insertGetId([
                'created_by' => $actor->id,
                'company_id' => $validated['company_id'] ?? null,
                'branch_id' => $validated['branch_id'] ?? null,
                'title' => $title,
                'message' => $message,
                'channel' => $channel,
                'priority' => $validated['priority'] ?? 'normal',
                'recipients' => json_encode(array_map(fn ($target) => ['type' => $target['type'], 'id' => $target['id'], 'address' => $target['address']], $targets), JSON_THROW_ON_ERROR),
                'schedule_type' => 'once',
                'run_at' => $scheduledAt->toDateTimeString(),
                'timezone' => $scheduleTimezone,
                'enabled' => true,
                'next_run_at' => $scheduledAt->utc()->toDateTimeString(),
                'idempotency_key' => (string) Str::uuid(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $this->audit($request, 'notification.scheduled', null, ['schedule_id' => $schedule, 'channel' => $channel]);

            return response()->json(['success' => true, 'message' => 'Notification scheduled.', 'data' => ['schedule_id' => $schedule, 'status' => 'scheduled']], 201);
        }

        $queued = 0;
        DB::transaction(function () use ($request, $targets, $actor, $channel, $title, $message, $subject, $validated, $companyId, $branchId, &$queued) {
            foreach ($targets as $target) {
                if ($target['user'] && ! $this->preferenceAllows($target['user']->id, 'system.alert', $channel, $validated['priority'] ?? 'normal')) continue;
                $isEmailRecipient = filter_var($target['address'], FILTER_VALIDATE_EMAIL) !== false;
                $isPhoneRecipient = $this->normalizePhoneNumber((string) $target['address']) !== null;
                $channelStatus = $this->notificationDeliveryService->channelStatus($target['user'] ?? $actor)[$channel];
                $recipientValid = match ($channel) {
                    'email' => $isEmailRecipient,
                    'sms', 'whatsapp' => $isPhoneRecipient,
                    'in_app', 'push' => (bool) $target['user'],
                    default => false,
                };
                $providerReady = $target['user'] ? $channelStatus['ready'] : $channelStatus['configured'];
                $whatsappCanQueue = $channel === 'whatsapp' && ($channelStatus['configured'] ?? false);
                if (! $recipientValid) {
                    throw ValidationException::withMessages(['recipients' => ['A recipient is not valid for the selected channel.']]);
                }
                if (! $providerReady && ! $whatsappCanQueue) {
                    throw ValidationException::withMessages(['channel' => [$channelStatus['detail']]]);
                }

                $notificationId = DB::table('notifications')->insertGetId([
                    'type' => 'App\\Notifications\\SystemAlert',
                    'notifiable_type' => $target['user'] ? User::class : 'external',
                    'notifiable_id' => $target['user']?->id ?? 0,
                    'data' => json_encode([
                        'title' => $title,
                        'message' => $message,
                        'subject' => $subject,
                        'channel' => $channel,
                        'priority' => $validated['priority'] ?? 'normal',
                        'attachment' => $validated['attachment'] ?? null,
                    ], JSON_THROW_ON_ERROR),
                    'company_id' => $validated['company_id'] ?? null,
                    'branch_id' => $validated['branch_id'] ?? null,
                    'event' => 'system.alert',
                    'category' => 'system',
                    'priority' => $validated['priority'] ?? 'normal',
                    'channel' => $channel,
                    'resource_type' => null,
                    'resource_id' => null,
                    'read_at' => null,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                $logId = DB::table('notification_logs')->insertGetId([
                    'user_id' => $target['user']?->id,
                    'created_by' => $actor->id,
                    'company_id' => $companyId,
                    'branch_id' => $branchId,
                    'notification_id' => $notificationId,
                    'event' => 'system.alert',
                    'channel' => $channel,
                    'provider' => $this->providerFor($channel),
                    'recipient' => $target['address'] ?: 'internal',
                    'status' => $channel === 'in_app' ? 'sent' : 'queued',
                    'attempt_count' => 0,
                    'sent_at' => $channel === 'in_app' ? now() : null,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                if ($channel !== 'in_app') DeliverNotification::dispatch($logId)->afterCommit();
                $queued++;
            }
            $this->audit($request, 'notification.created', null, ['channel' => $channel, 'recipient_count' => $queued]);
        });

        if ($queued === 0) throw ValidationException::withMessages(['recipients' => ['No eligible recipients were found.']]);

        return response()->json(['success' => true, 'message' => $channel === 'in_app' ? 'In-App notification delivered.' : 'Notification queued for delivery.', 'data' => ['status' => $channel === 'in_app' ? 'sent' : 'queued', 'recipient_count' => $queued]], 202);
    }

    public function recipientOptions(Request $request)
    {
        $options = Role::query()
            ->whereHas('users')
            ->orderBy('name')
            ->get(['name'])
            ->map(fn (Role $role) => ['value' => 'role:' . $role->name, 'label' => $role->name])
            ->values();

        if ($request->user()->hasAnyRole(['Admin', 'Super Admin'])) {
            $options->prepend(['value' => 'all users', 'label' => 'All Users']);
        }

        return response()->json(['success' => true, 'data' => $options]);
    }

    private function resolveRecipients(array $tokens, User $actor, ?int $companyId, ?int $branchId, string $channel): array
    {
        $targets = [];
        foreach ($tokens as $rawToken) {
            $token = trim($rawToken);
            if ($token === '') continue;
            $parts = explode(':', $token, 2);
            $kind = count($parts) === 2 ? strtolower($parts[0]) : '';
            $value = count($parts) === 2 ? trim($parts[1]) : $token;

            if (in_array(strtolower($value), ['all users', 'all'], true) || $kind === 'all') {
                if (! $actor->hasAnyRole(['Admin', 'Super Admin'])) throw ValidationException::withMessages(['recipients' => ['Only an ERP administrator can target all users.']]);
                $users = User::query()->when(Schema::hasColumn('users', 'is_active'), fn ($q) => $q->where('is_active', true))->get();
                foreach ($users as $user) $targets[] = ['type' => User::class, 'id' => $user->id, 'user' => $user, 'address' => $this->addressForUser($user, $channel)];
                continue;
            }

            if ($kind === 'user' || ctype_digit($value)) {
                $user = User::query()->find($value);
                if ($user) $targets[] = ['type' => User::class, 'id' => $user->id, 'user' => $user, 'address' => $this->addressForUser($user, $channel)];
                continue;
            }

            if ($kind === 'role' || $kind === '') {
                $role = Role::query()->whereRaw('LOWER(name) = ?', [mb_strtolower($value)])->first();
                if ($role) {
                    foreach ($role->users as $user) $targets[] = ['type' => User::class, 'id' => $user->id, 'user' => $user, 'address' => $this->addressForUser($user, $channel)];
                    continue;
                }
            }

            if ($kind === 'customer' || $kind === 'vendor' || $kind === 'supplier' || $kind === 'employee') {
                $model = match ($kind) { 'customer' => Customer::class, 'vendor', 'supplier' => Supplier::class, default => Employee::class };
                $contact = $model::query()->when($companyId, fn ($q) => $q->where('company_id', $companyId))->when($branchId, fn ($q) => $q->where('branch_id', $branchId))->find($value);
                if ($contact) $targets[] = ['type' => $model, 'id' => $contact->id, 'user' => null, 'address' => in_array($channel, ['sms', 'whatsapp'], true) ? ($contact->phone ?: $contact->contact_no) : $contact->email];
                continue;
            }

            if (filter_var($value, FILTER_VALIDATE_EMAIL)) {
                $targets[] = ['type' => 'external', 'id' => 0, 'user' => null, 'address' => $value];
                continue;
            }

            $phone = $this->normalizePhoneNumber($value);
            if ($phone !== null) {
                $targets[] = ['type' => 'external', 'id' => 0, 'user' => null, 'address' => $phone];
                continue;
            }

            throw ValidationException::withMessages(['recipients' => ["Recipient '{$value}' is not a valid user, existing role, contact ID, email, or phone number."]]);
        }

        $unique = [];
        foreach ($targets as $target) $unique[$target['type'] . ':' . $target['id'] . ':' . strtolower((string) $target['address'])] = $target;

        return array_values($unique);
    }

    private function addressForUser(User $user, string $channel): string
    {
        return match ($channel) {
            'email' => (string) $user->email,
            'sms', 'whatsapp' => $this->normalizePhoneNumber((string) $user->phone) ?? (string) $user->phone,
            default => 'internal',
        };
    }

    private function normalizePhoneNumber(?string $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $digits = preg_replace('/\D+/', '', trim($value));
        if ($digits === '' || strlen($digits) < 8 || strlen($digits) > 15) {
            return null;
        }

        if (strlen($digits) === 10) {
            return '+91' . $digits;
        }

        if (strlen($digits) === 11 && str_starts_with($digits, '0')) {
            return '+91' . substr($digits, 1);
        }

        if (strlen($digits) >= 12 && strlen($digits) <= 15) {
            return '+' . $digits;
        }

        return null;
    }

    private function validateTargetsForChannel(array $targets, string $channel): void
    {
        foreach ($targets as $target) {
            $valid = match ($channel) {
                'email' => filter_var((string) $target['address'], FILTER_VALIDATE_EMAIL) !== false,
                'sms', 'whatsapp' => $this->normalizePhoneNumber((string) $target['address']) !== null,
                'in_app', 'push' => (bool) $target['user'],
                default => false,
            };
            if (! $valid) throw ValidationException::withMessages(['recipients' => ['A recipient is missing a valid destination for the selected channel.']]);
        }
    }

    private function preferenceAllows(int $userId, string $event, string $channel, string $priority): bool
    {
        $channelPreference = DB::table('notification_preferences')->where('user_id', $userId)->where('event_name', '*')->where('channel', $channel)->value('enabled');
        $eventPreference = DB::table('notification_preferences')->where('user_id', $userId)->where('event_name', $event)->where('channel', '*')->value('enabled');
        if (($channelPreference === 0 || $eventPreference === 0) && ! in_array($priority, ['critical', 'high'], true)) return false;

        $settings = DB::table('notification_user_settings')->where('user_id', $userId)->first();
        if (! $settings?->quiet_hours || ($priority === 'critical' && $settings->critical_override)) return true;
        $now = now()->format('H:i:s');
        $from = $settings->quiet_from;
        $to = $settings->quiet_to;
        $isQuiet = $from <= $to ? ($now >= $from && $now < $to) : ($now >= $from || $now < $to);

        return ! $isQuiet;
    }

    private function templateReplacements(array $variables): array
    {
        $allowed = ['customer_name', 'invoice_number', 'amount', 'company_name', 'branch_name', 'date', 'vendor_name', 'product_name', 'order_number', 'payment_method'];
        $replacements = [];
        foreach ($variables as $key => $value) {
            $name = trim((string) $key, '{} ');
            if (in_array($name, $allowed, true) && is_scalar($value)) $replacements['{{' . $name . '}}'] = (string) $value;
        }

        return $replacements;
    }

    private function providerFor(string $channel): string
    {
        return match ($channel) {
            'email' => (string) config('mail.default'),
            'whatsapp' => 'whatsapp_web_js',
            'sms' => 'twilio',
            'push' => 'webpush',
            default => 'erp-app',
        };
    }

    private function requireWhatsAppSendPermission(User $user, string|array $channels): void
    {
        $channels = is_array($channels) ? $channels : [$channels];
        if (in_array('whatsapp', $channels, true)) {
            abort_unless($user->hasPermission('notifications.whatsapp.send'), 403, 'You are not allowed to send WhatsApp notifications.');
        }
    }

    private function applyTenantResourceScope($query, User $user): void
    {
        if ($user->hasAnyRole(['Admin', 'Super Admin'])) return;
        if ($user->company_id) {
            $query->where(fn ($scope) => $scope->whereNull('company_id')->orWhere('company_id', $user->company_id));
        } else {
            $query->whereNull('company_id');
        }
        if ($user->branch_id) {
            $query->where(fn ($scope) => $scope->whereNull('branch_id')->orWhere('branch_id', $user->branch_id));
        }
    }

    public function providerStatus(Request $request)
    {
        $channels = $this->notificationDeliveryService->channelStatus($request->user());
        foreach ($channels as $channel => &$status) {
            $lastSuccess = DB::table('notification_logs')->where('channel', $channel)->where('status', 'sent')->max('sent_at');
            $lastError = DB::table('notification_logs')->where('channel', $channel)->where('status', 'failed')->max('failed_at');
            $status['last_success_at'] = $lastSuccess;
            $status['last_error_at'] = $lastError;
            $status['health'] = $lastError && (! $lastSuccess || $lastError > $lastSuccess)
                ? 'degraded'
                : ($lastSuccess ? 'healthy' : ($channel === 'in_app' ? 'healthy' : 'unknown'));
        }
        unset($status);

        return response()->json([
            'success' => true,
            'data' => $channels,
        ]);
    }

    public function twilioStatus(Request $request)
    {
        $authToken = config('services.twilio.auth_token');
        $callbackUrl = config('services.twilio.status_callback_url') ?: $request->fullUrl();
        $signature = (string) $request->header('X-Twilio-Signature', '');
        if (! filled($authToken) || $signature === '' || !(new RequestValidator($authToken))->validate($signature, $callbackUrl, $request->all())) {
            return response()->json(['message' => 'Invalid provider callback signature.'], 403);
        }

        $values = $request->validate([
            'MessageSid' => ['required', 'string', 'max:64'],
            'MessageStatus' => ['required', 'in:accepted,queued,sending,sent,delivered,read,failed,undelivered,canceled,cancelled'],
            'ErrorCode' => ['sometimes', 'nullable', 'string', 'max:32'],
        ]);
        $status = match ($values['MessageStatus']) {
            'accepted', 'queued', 'sending' => 'sending',
            'sent' => 'sent',
            'delivered', 'read' => 'delivered',
            'failed', 'undelivered' => 'failed',
            default => 'cancelled',
        };
        $log = DB::table('notification_logs')->where('provider_message_id', $values['MessageSid'])->first();
        if (! $log) return response()->json(['message' => 'Delivery not ready for callback.'], 503);
        if (! in_array($log->status, ['delivered', 'failed', 'cancelled'], true)) {
            DB::table('notification_logs')->where('id', $log->id)->update([
                'status' => $status,
                'error_message' => $values['ErrorCode'] ?? null,
                'sent_at' => in_array($status, ['sent', 'delivered'], true) ? ($log->sent_at ?: now()) : $log->sent_at,
                'delivered_at' => $status === 'delivered' ? now() : $log->delivered_at,
                'failed_at' => $status === 'failed' ? now() : $log->failed_at,
                'updated_at' => now(),
            ]);
        }

        return response()->json(['success' => true]);
    }

    public function deliveryLogs(Request $request)
    {
        $user = $request->user();
        $query = DB::table('notification_logs')
            ->where(fn ($query) => $query->where('user_id', $user->id)->orWhere('created_by', $user->id));
        $this->applyDeliveryScope($query, $user);
        $logs = $query
            ->orderByDesc('created_at')
            ->paginate(min(100, max(1, (int) $request->input('per_page', 50))))
            ->through(fn ($log) => [
                'id' => (int) $log->id,
                'notification_id' => $log->notification_id,
                'channel' => $log->channel,
                'provider' => $log->provider,
                'recipient' => $log->recipient,
                'event' => $log->event,
                'status' => $log->status,
                'attempt_count' => (int) $log->attempt_count,
                'error_message' => $log->error_message,
                'sent_at' => $log->sent_at,
                'delivered_at' => $log->delivered_at,
                'failed_at' => $log->failed_at,
                'created_at' => $log->created_at,
            ]);

        return response()->json(['success' => true, 'data' => $logs]);
    }

    public function templates(Request $request)
    {
        $query = DB::table('notification_templates');
        $this->applyTenantResourceScope($query, $request->user());
        $templates = $query->orderBy('name')->get()->map(fn ($template) => [
            'id' => $template->id,
            'name' => $template->name,
            'event' => $template->event_name,
            'channel' => $template->channel,
            'subject' => $template->subject,
            'body' => $template->body,
            'enabled' => (bool) $template->active,
            'created_at' => $template->created_at,
            'updated_at' => $template->updated_at,
        ]);

        return response()->json(['success' => true, 'data' => $templates]);
    }

    public function storeTemplate(Request $request)
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'channel' => ['required', 'in:in_app,email,whatsapp,sms,push'],
            'subject' => ['nullable', 'string', 'max:255'],
            'body' => ['required', 'string', 'max:10000'],
            'event' => ['sometimes', 'nullable', 'string', 'max:100'],
            'enabled' => ['sometimes', 'boolean'],
        ]);
        $this->requireWhatsAppSendPermission($request->user(), $validated['channel']);
        $id = DB::table('notification_templates')->insertGetId([
            'name' => $validated['name'],
            'company_id' => $request->user()->company_id,
            'branch_id' => $request->user()->branch_id,
            'event_name' => $validated['event'] ?? 'system.alert',
            'channel' => $validated['channel'],
            'language' => 'en',
            'subject' => $validated['subject'] ?? null,
            'body' => $validated['body'],
            'variables' => json_encode(['customer_name', 'invoice_number', 'amount', 'company_name', 'branch_name', 'date', 'vendor_name', 'product_name', 'order_number', 'payment_method']),
            'active' => $validated['enabled'] ?? true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $this->audit($request, 'template.created', null, ['template_id' => $id]);

        return response()->json(['success' => true, 'data' => ['id' => $id]], 201);
    }

    public function updateTemplate(Request $request, int $id)
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:150'],
            'channel' => ['sometimes', 'required', 'in:in_app,email,whatsapp,sms,push'],
            'subject' => ['sometimes', 'nullable', 'string', 'max:255'],
            'body' => ['sometimes', 'required', 'string', 'max:10000'],
            'event' => ['sometimes', 'nullable', 'string', 'max:100'],
            'enabled' => ['sometimes', 'boolean'],
        ]);
        $update = array_intersect_key($validated, array_flip(['name', 'channel', 'subject', 'body']));
        if (array_key_exists('event', $validated)) $update['event_name'] = $validated['event'] ?: 'system.alert';
        if (array_key_exists('enabled', $validated)) $update['active'] = $validated['enabled'];
        $update['updated_at'] = now();
        $query = DB::table('notification_templates')->where('id', $id);
        $this->applyTenantResourceScope($query, $request->user());
        $template = $query->first();
        abort_unless((bool) $template, 404, 'Template not found.');
        $this->requireWhatsAppSendPermission($request->user(), $validated['channel'] ?? $template->channel);
        $query->update($update);
        $this->audit($request, 'template.updated', null, ['template_id' => $id]);

        return response()->json(['success' => true]);
    }

    public function deleteTemplate(Request $request, int $id)
    {
        $query = DB::table('notification_templates')->where('id', $id);
        $this->applyTenantResourceScope($query, $request->user());
        $deleted = $query->delete();
        abort_unless($deleted, 404, 'Template not found.');
        $this->audit($request, 'template.deleted', null, ['template_id' => $id]);

        return response()->json(['success' => true]);
    }

    public function testTemplate(Request $request, int $id)
    {
        $query = DB::table('notification_templates')->where('id', $id)->where('active', true);
        $this->applyTenantResourceScope($query, $request->user());
        $template = $query->first();
        abort_unless((bool) $template, 404, 'Active template not found.');
        $request->merge(['title' => $template->name, 'message' => $template->body, 'subject' => $template->subject ?: $template->name, 'channel' => $template->channel]);

        return $this->sendTest($request);
    }

    public function automationRules(Request $request)
    {
        $query = DB::table('notification_automation_rules');
        $this->applyTenantResourceScope($query, $request->user());
        $rules = $query->orderBy('event')->get()->map(fn ($rule) => [
            'id' => $rule->id,
            'event' => $rule->event,
            'label' => $rule->label,
            'channels' => json_decode($rule->channels, true) ?: [],
            'priority' => $rule->priority,
            'enabled' => (bool) $rule->enabled,
            'template_id' => $rule->template_id,
        ]);

        return response()->json(['success' => true, 'data' => $rules]);
    }

    public function storeAutomationRule(Request $request)
    {
        $validated = $this->validateAutomationRule($request);
        $this->requireWhatsAppSendPermission($request->user(), $validated['channels']);
        $id = DB::table('notification_automation_rules')->insertGetId($this->automationValues($validated, $request->user()));
        $this->audit($request, 'automation.created', null, ['rule_id' => $id, 'event' => $validated['event']]);

        return response()->json(['success' => true, 'data' => ['id' => $id]], 201);
    }

    public function updateAutomationRule(Request $request, int $id)
    {
        $validated = $this->validateAutomationRule($request, true);
        $existingQuery = DB::table('notification_automation_rules')->where('id', $id);
        $this->applyTenantResourceScope($existingQuery, $request->user());
        $existing = $existingQuery->first();
        abort_unless((bool) $existing, 404, 'Automation rule not found.');
        if (array_key_exists('channels', $validated)) $this->requireWhatsAppSendPermission($request->user(), $validated['channels']);
        $values = ['updated_at' => now()];
        if (array_key_exists('event', $validated)) $values['event'] = $validated['event'];
        if (array_key_exists('label', $validated)) $values['label'] = $validated['label'];
        if (array_key_exists('channels', $validated)) $values['channels'] = json_encode($validated['channels'], JSON_THROW_ON_ERROR);
        if (array_key_exists('priority', $validated)) $values['priority'] = $validated['priority'];
        if (array_key_exists('enabled', $validated)) $values['enabled'] = $validated['enabled'];
        if (array_key_exists('template_id', $validated)) $values['template_id'] = $validated['template_id'];
        $existingQuery->update($values);
        $this->audit($request, 'automation.updated', null, ['rule_id' => $id]);

        return response()->json(['success' => true]);
    }

    public function deleteAutomationRule(Request $request, int $id)
    {
        $query = DB::table('notification_automation_rules')->where('id', $id);
        $this->applyTenantResourceScope($query, $request->user());
        $deleted = $query->delete();
        abort_unless($deleted, 404, 'Automation rule not found.');
        $this->audit($request, 'automation.deleted', null, ['rule_id' => $id]);

        return response()->json(['success' => true]);
    }

    private function validateAutomationRule(Request $request, bool $partial = false): array
    {
        $rules = [
            'event' => [$partial ? 'sometimes' : 'required', 'in:invoice.created,invoice.paid,payment.received,invoice.overdue,customer.created,purchase.created,expense.created,expense.approved,expense.rejected'],
            'label' => ['sometimes', 'nullable', 'string', 'max:150'],
            'channels' => [$partial ? 'sometimes' : 'required', 'array', 'min:1'],
            'channels.*' => ['in:in_app,email,whatsapp,sms,push'],
            'priority' => ['sometimes', 'in:critical,high,normal,low'],
            'enabled' => ['sometimes', 'boolean'],
            'template_id' => ['sometimes', 'nullable', 'exists:notification_templates,id'],
        ];
        return $request->validate($rules);
    }

    private function automationValues(array $values, User $user): array
    {
        return [
            'created_by' => $user->id,
            'company_id' => $user->company_id,
            'branch_id' => $user->branch_id,
            'event' => $values['event'] ?? 'system.alert',
            'label' => $values['label'] ?? null,
            'channels' => json_encode($values['channels'] ?? ['in_app']),
            'recipients' => json_encode([]),
            'priority' => $values['priority'] ?? 'normal',
            'template_id' => $values['template_id'] ?? null,
            'enabled' => $values['enabled'] ?? true,
            'created_at' => now(),
            'updated_at' => now(),
        ];
    }

    public function scheduledNotifications(Request $request)
    {
        $schedules = DB::table('scheduled_notifications')->where('created_by', $request->user()->id)->orderBy('next_run_at')->get()->map(fn ($schedule) => [
            'id' => $schedule->id,
            'title' => $schedule->title,
            'message' => $schedule->message,
            'recipients' => array_map(function (array $recipient): string {
                $type = $recipient['type'] ?? '';
                $prefix = match ($type) {
                    User::class => 'user:',
                    Customer::class => 'customer:',
                    Supplier::class => 'supplier:',
                    Employee::class => 'employee:',
                    default => '',
                };

                return $prefix !== ''
                    ? $prefix . ($recipient['id'] ?? '')
                    : (string) ($recipient['address'] ?? '');
            }, json_decode((string) $schedule->recipients, true) ?: []),
            'channel' => $schedule->channel,
            'priority' => $schedule->priority,
            'schedule_type' => $schedule->schedule_type,
            'run_at' => $schedule->run_at,
            'timezone' => $schedule->timezone,
            'enabled' => (bool) $schedule->enabled,
            'last_run_at' => $schedule->last_run_at,
            'next_run_at' => $schedule->next_run_at,
        ]);

        return response()->json(['success' => true, 'data' => $schedules]);
    }

    public function storeScheduledNotification(Request $request)
    {
        $values = $this->validateSchedule($request);
        $actor = $request->user();
        $this->requireWhatsAppSendPermission($actor, $values['channel']);
        $timezone = $values['timezone'] ?? config('app.timezone');
        $runAt = Carbon::parse($values['run_at'], $timezone);
        $companyId = $values['company_id'] ?? ($actor->company_id ?: null);
        $branchId = $values['branch_id'] ?? ($actor->branch_id ?: null);
        if (! $actor->hasAnyRole(['Admin', 'Super Admin'])
            && (($companyId && (int) $companyId !== (int) $actor->company_id)
                || ($branchId && (int) $branchId !== (int) $actor->branch_id))) {
            abort(403, 'You do not have access to schedule for that company or branch.');
        }
        $recipientTokens = $values['recipients'] ?? [];
        $targets = $this->resolveRecipients($recipientTokens, $actor, $companyId, $branchId, $values['channel']);
        if ($companyId || $branchId) {
            $targets = array_values(array_filter($targets, function ($target) use ($companyId, $branchId) {
                if (! $target['user']) return true;
                if ($companyId && (int) $target['user']->company_id !== (int) $companyId) return false;
                return ! $branchId || (int) $target['user']->branch_id === (int) $branchId;
            }));
        }
        if ($recipientTokens !== [] && $targets === []) throw ValidationException::withMessages(['recipients' => ['No matching recipients are assigned to the selected company or branch.']]);
        if (in_array($values['channel'], ['in_app', 'push'], true) && collect($targets)->contains(fn ($target) => ! $target['user'])) {
            throw ValidationException::withMessages(['recipients' => ['Push and In-App schedules require ERP user recipients.']]);
        }
        if ($targets === []) $targets = [['type' => User::class, 'id' => $actor->id, 'user' => $actor, 'address' => $this->addressForUser($actor, $values['channel'])]];
        $this->validateTargetsForChannel($targets, $values['channel']);
        if ($values['channel'] === 'whatsapp' && count($targets) !== 1) {
            throw ValidationException::withMessages(['recipients' => ['Schedule WhatsApp notifications for one recipient per schedule.']]);
        }
        $id = DB::table('scheduled_notifications')->insertGetId([
            'created_by' => $actor->id,
            'company_id' => $companyId,
            'branch_id' => $branchId,
            'title' => $values['title'],
            'message' => $values['message'] ?? $values['title'],
            'channel' => $values['channel'],
            'priority' => $values['priority'] ?? 'normal',
            'recipients' => json_encode(array_map(fn ($target) => ['type' => $target['type'], 'id' => $target['id'], 'address' => $target['address']], $targets), JSON_THROW_ON_ERROR),
            'schedule_type' => $values['schedule_type'],
            'run_at' => $runAt->toDateTimeString(),
            'timezone' => $timezone,
            'enabled' => $values['enabled'] ?? true,
            'next_run_at' => $runAt->utc()->toDateTimeString(),
            'idempotency_key' => (string) Str::uuid(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $this->audit($request, 'schedule.created', null, ['schedule_id' => $id]);

        return response()->json(['success' => true, 'data' => ['id' => $id]], 201);
    }

    public function updateScheduledNotification(Request $request, int $id)
    {
        $values = $this->validateSchedule($request, true);
        $actor = $request->user();
        $existing = DB::table('scheduled_notifications')->where('id', $id)->where('created_by', $actor->id)->first();
        abort_unless((bool) $existing, 404, 'Scheduled notification not found.');
        $this->requireWhatsAppSendPermission($actor, $values['channel'] ?? $existing->channel);
        $timezone = $values['timezone'] ?? $existing->timezone ?? config('app.timezone');
        $companyId = $values['company_id'] ?? $existing->company_id ?? $actor->company_id;
        $branchId = $values['branch_id'] ?? $existing->branch_id ?? $actor->branch_id;
        if (! $actor->hasAnyRole(['Admin', 'Super Admin'])
            && (($companyId && (int) $companyId !== (int) $actor->company_id)
                || ($branchId && (int) $branchId !== (int) $actor->branch_id))) {
            abort(403, 'You do not have access to that scheduled company or branch.');
        }
        if (isset($values['run_at'])) $values['next_run_at'] = Carbon::parse($values['run_at'], $timezone)->utc()->toDateTimeString();
        $values['timezone'] = $timezone;
        $values['company_id'] = $companyId;
        $values['branch_id'] = $branchId;
        $values['updated_at'] = now();
        if (isset($values['recipients'])) {
            $channel = $values['channel'] ?? $existing->channel;
            $targets = $this->resolveRecipients($values['recipients'], $actor, $companyId, $branchId, $channel);
            if ($values['recipients'] !== [] && $targets === []) throw ValidationException::withMessages(['recipients' => ['No matching recipients are assigned to the selected company or branch.']]);
            if ($companyId || $branchId) {
                $targets = array_values(array_filter($targets, function ($target) use ($companyId, $branchId) {
                    if (! $target['user']) return true;
                    if ($companyId && (int) $target['user']->company_id !== (int) $companyId) return false;
                    return ! $branchId || (int) $target['user']->branch_id === (int) $branchId;
                }));
            }
            if ($targets === []) $targets = [['type' => User::class, 'id' => $actor->id, 'user' => $actor, 'address' => $this->addressForUser($actor, $channel)]];
            $this->validateTargetsForChannel($targets, $channel);
            $values['recipients'] = json_encode(array_map(fn ($target) => ['type' => $target['type'], 'id' => $target['id'], 'address' => $target['address']], $targets), JSON_THROW_ON_ERROR);
        } else {
            unset($values['recipients']);
        }
        if (($values['channel'] ?? $existing->channel) === 'whatsapp') {
            $storedRecipients = isset($values['recipients'])
                ? json_decode($values['recipients'], true)
                : (json_decode((string) $existing->recipients, true) ?: []);
            if (count($storedRecipients) !== 1) {
                throw ValidationException::withMessages(['recipients' => ['Schedule WhatsApp notifications for one recipient per schedule.']]);
            }
        }
        $updated = DB::table('scheduled_notifications')->where('id', $id)->where('created_by', $request->user()->id)->update(array_filter($values, fn ($value) => $value !== null));
        abort_unless($updated, 404, 'Scheduled notification not found.');
        $this->audit($request, 'schedule.updated', null, ['schedule_id' => $id]);

        return response()->json(['success' => true]);
    }

    public function deleteScheduledNotification(Request $request, int $id)
    {
        $deleted = DB::table('scheduled_notifications')->where('id', $id)->where('created_by', $request->user()->id)->delete();
        abort_unless($deleted, 404, 'Scheduled notification not found.');
        $this->audit($request, 'schedule.deleted', null, ['schedule_id' => $id]);

        return response()->json(['success' => true]);
    }

    private function validateSchedule(Request $request, bool $partial = false): array
    {
        return $request->validate([
            'title' => [$partial ? 'sometimes' : 'required', 'string', 'max:200'],
            'message' => ['sometimes', 'string', 'max:10000'],
            'channel' => [$partial ? 'sometimes' : 'required', 'in:in_app,email,whatsapp,sms,push'],
            'priority' => ['sometimes', 'in:critical,high,normal,low'],
            'schedule_type' => [$partial ? 'sometimes' : 'required', 'in:once,daily,weekly,monthly'],
            'run_at' => [$partial ? 'sometimes' : 'required', 'date'],
            'timezone' => ['sometimes', 'timezone'],
            'company_id' => ['sometimes', 'nullable', 'integer', 'exists:companies,id'],
            'branch_id' => ['sometimes', 'nullable', 'integer', 'exists:branches,id'],
            'enabled' => ['sometimes', 'boolean'],
            'recipients' => ['sometimes', 'array', 'max:500'],
            'recipients.*' => ['string', 'max:255'],
        ]);
    }

    public function queueItems(Request $request)
    {
        $user = $request->user();
        $query = DB::table('notification_logs')->where(fn ($query) => $query->where('created_by', $user->id)->orWhere('user_id', $user->id));
        $this->applyDeliveryScope($query, $user);
        $queue = $query
            ->whereIn('status', ['queued', 'sending', 'retrying', 'failed'])
            ->orderByDesc('created_at')->limit(100)->get([
                'id', 'notification_id', 'channel', 'provider', 'recipient', 'status', 'attempt_count', 'error_message', 'created_at', 'sent_at',
            ]);

        return response()->json(['success' => true, 'data' => $queue]);
    }

    private function applyDeliveryScope($query, User $user): void
    {
        if ($user->hasAnyRole(['Admin', 'Super Admin'])) return;
        if ($user->company_id) {
            $query->where('company_id', $user->company_id);
        } else {
            $query->whereNull('company_id');
        }
        if ($user->branch_id) {
            $query->where('branch_id', $user->branch_id);
        }
    }

    public function retryQueueItem(Request $request, int $id)
    {
        $user = $request->user();
        $query = DB::table('notification_logs')->where('id', $id)->where(fn ($query) => $query->where('created_by', $user->id)->orWhere('user_id', $user->id));
        $this->applyDeliveryScope($query, $user);
        $log = $query->first();
        abort_unless($log && in_array($log->status, ['failed', 'retrying'], true), 404, 'Retryable delivery not found.');
        DB::table('notification_logs')->where('id', $id)->update(['status' => 'queued', 'error_message' => null, 'failed_at' => null, 'updated_at' => now()]);
        DeliverNotification::dispatch($id);
        $this->audit($request, 'notification.retried', $log->notification_id ? (int) $log->notification_id : null, ['delivery_id' => $id]);

        return response()->json(['success' => true]);
    }

    public function cancelQueueItem(Request $request, int $id)
    {
        $user = $request->user();
        $query = DB::table('notification_logs')->where('id', $id)->where(fn ($query) => $query->where('created_by', $user->id)->orWhere('user_id', $user->id))->whereIn('status', ['queued', 'retrying']);
        $this->applyDeliveryScope($query, $user);
        $updated = $query->update(['status' => 'cancelled', 'updated_at' => now()]);
        abort_unless($updated, 404, 'Queued delivery not found.');
        $this->audit($request, 'notification.cancelled', null, ['delivery_id' => $id]);

        return response()->json(['success' => true]);
    }

    public function preferences(Request $request)
    {
        $userId = $request->user()->id;
        $rows = DB::table('notification_preferences')->where('user_id', $userId)->get();
        $channels = ['in_app' => true, 'email' => true, 'whatsapp' => false, 'sms' => false, 'push' => true];
        $events = [];
        foreach ($rows as $row) {
            if ($row->event_name === '*') $channels[$row->channel] = (bool) $row->enabled;
            else $events[$row->event_name] = (bool) $row->enabled;
        }
        $quiet = DB::table('notification_user_settings')->where('user_id', $userId)->first();

        return response()->json(['success' => true, 'data' => [
            'channels' => $channels,
            'events' => $events,
            'quiet_hours' => (bool) ($quiet->quiet_hours ?? false),
            'quiet_from' => substr($quiet->quiet_from ?? '22:00:00', 0, 5),
            'quiet_to' => substr($quiet->quiet_to ?? '07:00:00', 0, 5),
            'critical_override' => (bool) ($quiet->critical_override ?? true),
        ]]);
    }

    public function updatePreferences(Request $request)
    {
        $values = $request->validate([
            'channels' => ['sometimes', 'array'],
            'channels.*' => ['boolean'],
            'events' => ['sometimes', 'array'],
            'events.*' => ['boolean'],
            'quiet_hours' => ['sometimes', 'boolean'],
            'quiet_from' => ['sometimes', 'date_format:H:i'],
            'quiet_to' => ['sometimes', 'date_format:H:i'],
            'critical_override' => ['sometimes', 'boolean'],
        ]);
        $userId = $request->user()->id;
        foreach (($values['channels'] ?? []) as $channel => $enabled) {
            if (! in_array($channel, ['in_app', 'email', 'whatsapp', 'sms', 'push'], true)) continue;
            DB::table('notification_preferences')->updateOrInsert(['user_id' => $userId, 'event_name' => '*', 'channel' => $channel], ['enabled' => $enabled, 'updated_at' => now(), 'created_at' => now()]);
        }
        foreach (($values['events'] ?? []) as $event => $enabled) {
            if (! preg_match('/^[a-z0-9_.-]{1,100}$/i', $event)) continue;
            DB::table('notification_preferences')->updateOrInsert(['user_id' => $userId, 'event_name' => $event, 'channel' => '*'], ['enabled' => $enabled, 'updated_at' => now(), 'created_at' => now()]);
        }
        DB::table('notification_user_settings')->updateOrInsert(['user_id' => $userId], [
            'quiet_hours' => $values['quiet_hours'] ?? false,
            'quiet_from' => ($values['quiet_from'] ?? '22:00') . ':00',
            'quiet_to' => ($values['quiet_to'] ?? '07:00') . ':00',
            'critical_override' => $values['critical_override'] ?? true,
            'updated_at' => now(),
            'created_at' => now(),
        ]);
        $this->audit($request, 'preferences.updated');

        return $this->preferences($request);
    }

    public function fallback(Request $request)
    {
        $settings = DB::table('notification_fallback_settings')->where('user_id', $request->user()->id)->first();

        return response()->json(['success' => true, 'data' => [
            'enabled' => (bool) ($settings->enabled ?? false),
            'order' => json_decode($settings->channel_order ?? '[]', true) ?: ['whatsapp', 'email', 'sms', 'push', 'in_app'],
        ]]);
    }

    public function updateFallback(Request $request)
    {
        $values = $request->validate([
            'enabled' => ['required', 'boolean'],
            'order' => ['required', 'array', 'min:1', 'max:5'],
            'order.*' => ['required', 'distinct', 'in:in_app,email,whatsapp,sms,push'],
        ]);
        DB::table('notification_fallback_settings')->updateOrInsert(['user_id' => $request->user()->id], [
            'enabled' => $values['enabled'],
            'channel_order' => json_encode($values['order'], JSON_THROW_ON_ERROR),
            'updated_at' => now(),
            'created_at' => now(),
        ]);
        $this->audit($request, 'fallback.updated');

        return $this->fallback($request);
    }

    private function audit(Request $request, string $action, ?int $notificationId = null, array $context = []): void
    {
        DB::table('notification_audit_logs')->insert([
            'actor_id' => $request->user()?->id,
            'notification_id' => $notificationId,
            'action' => $action,
            'context' => json_encode($context, JSON_THROW_ON_ERROR),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function savePushSubscription(Request $request)
    {
        $validated = $request->validate([
            'endpoint' => ['required', 'url', 'max:2048'],
            'keys.p256dh' => ['required', 'string', 'max:255'],
            'keys.auth' => ['required', 'string', 'max:255'],
        ]);
        $endpoint = $validated['endpoint'];

        DB::table('push_subscriptions')->updateOrInsert(
            ['endpoint_hash' => hash('sha256', $endpoint)],
            [
                'user_id' => $request->user()->id,
                'endpoint' => $endpoint,
                'public_key' => $validated['keys']['p256dh'],
                'auth_token' => $validated['keys']['auth'],
                'content_encoding' => 'aes128gcm',
                'updated_at' => now(),
                'created_at' => now(),
            ],
        );

        return response()->json(['success' => true, 'message' => 'This browser is subscribed to push notifications.']);
    }

    public function uploadAttachment(Request $request)
    {
        $validated = $request->validate([
            'attachment' => ['required', 'file', 'mimes:pdf,png,jpg,jpeg,doc,docx,xls,xlsx', 'max:10240'],
        ]);
        $file = $validated['attachment'];
        $path = $file->store('notifications/attachments/' . $request->user()->id, 'local');

        return response()->json(['success' => true, 'data' => [
            'path' => $path,
            'name' => $file->getClientOriginalName(),
            'mime' => $file->getMimeType(),
            'size' => $file->getSize(),
        ]], 201);
    }

    public function removePushSubscriptions(Request $request)
    {
        $validated = $request->validate(['endpoint' => ['required', 'url', 'max:2048']]);
        DB::table('push_subscriptions')
            ->where('user_id', $request->user()->id)
            ->where('endpoint_hash', hash('sha256', $validated['endpoint']))
            ->delete();

        return response()->json(['success' => true, 'message' => 'Browser push subscriptions removed.']);
    }

    public function dailySummary(Request $request)
    {
        $actor = $request->user();
        $companyId = $request->query('company_id');
        $branchId = $request->query('branch_id');
        if (! $actor->hasAnyRole(['Admin', 'Super Admin'])) {
            $companyId = $companyId ?: $actor->company_id;
            $branchId = $branchId ?: $actor->branch_id;
            if (($companyId && (int) $companyId !== (int) $actor->company_id)
                || ($branchId && (int) $branchId !== (int) $actor->branch_id)) {
                abort(403, 'You do not have access to view that company or branch summary.');
            }
        }

        $summary = $this->dailySummaryService->buildSummary(
            $companyId !== null && $companyId !== '' ? (int) $companyId : null,
            $branchId !== null && $branchId !== '' ? (int) $branchId : null,
            $request->query('date')
        );

        return response()->json([
            'success' => true,
            'data' => $summary,
        ]);
    }
}
