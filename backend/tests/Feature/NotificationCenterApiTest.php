<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Services\WhatsAppService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class NotificationCenterApiTest extends TestCase
{
    use RefreshDatabase;

    protected function makeUserWithPermission(string $permissionName): User
    {
        $role = Role::firstOrCreate(
            ['name' => 'notification-role'],
            [
                'group' => 'notifications',
                'description' => 'Notification access',
                'active' => true,
            ]
        );

        $permission = Permission::firstOrCreate(
            ['name' => $permissionName],
            [
                'group' => 'notifications',
                'description' => 'Notification permission',
                'active' => true,
            ]
        );

        $role->permissions()->syncWithoutDetaching([$permission->id]);

        $user = User::firstOrCreate(
            ['email' => 'notification-admin-' . md5($permissionName) . '@example.com'],
            [
                'name' => 'Notification Admin',
                'password' => bcrypt('password123'),
            ]
        );

        $user->roles()->syncWithoutDetaching([$role->id]);
        $user->flushPermissionCache();

        return $user;
    }

    public function test_admin_role_includes_notification_and_daily_summary_permissions(): void
    {
        $permissions = [
            'notifications.view',
            'notifications.manage',
            'notifications.send',
            'notifications.whatsapp.send',
            'daily_summary.configure',
            'reports.daily_summary.configure',
        ];

        foreach ($permissions as $permissionName) {
            Permission::firstOrCreate(
                ['name' => $permissionName],
                ['group' => 'notifications', 'description' => 'System permission', 'active' => true]
            );
        }

        $adminRole = Role::firstOrCreate(
            ['name' => 'Admin'],
            ['group' => 'system', 'description' => 'System administrator', 'active' => true]
        );

        $adminRole->givePermissionTo($permissions);

        $user = User::factory()->create([
            'email' => 'admin-role-check@example.com',
            'name' => 'Admin Role Check',
        ]);
        $user->roles()->syncWithoutDetaching([$adminRole->id]);
        $user->flushPermissionCache();

        foreach ($permissions as $permissionName) {
            $this->assertTrue($user->hasPermission($permissionName));
        }
    }

    public function test_authenticated_user_can_list_only_their_notifications(): void
    {
        $user = $this->makeUserWithPermission('notifications.view');
        $otherUser = User::factory()->create();

        DB::table('notifications')->insert([
            ['id' => 1, 'type' => 'App\\Notifications\\Test', 'notifiable_type' => User::class, 'notifiable_id' => $user->id, 'data' => json_encode(['title' => 'Own message', 'message' => 'Visible']), 'read_at' => null, 'created_at' => now(), 'updated_at' => now()],
            ['id' => 2, 'type' => 'App\\Notifications\\Test', 'notifiable_type' => User::class, 'notifiable_id' => $otherUser->id, 'data' => json_encode(['title' => 'Other message', 'message' => 'Hidden']), 'read_at' => null, 'created_at' => now()->subMinute(), 'updated_at' => now()->subMinute()],
        ]);

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/notifications')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(1, 'data');
    }

    public function test_inbox_filters_and_returns_real_pagination_metadata(): void
    {
        $user = $this->makeUserWithPermission('notifications.view');
        foreach (['invoice.created', 'invoice.created', 'payment.received'] as $index => $event) {
            DB::table('notifications')->insert([
                'type' => 'App\\Notifications\\Test',
                'notifiable_type' => User::class,
                'notifiable_id' => $user->id,
                'data' => json_encode(['title' => 'Record ' . $index, 'message' => 'Filtered data']),
                'event' => $event,
                'category' => explode('.', $event)[0],
                'priority' => 'normal',
                'channel' => 'in_app',
                'read_at' => null,
                'created_at' => now()->subSeconds($index),
                'updated_at' => now(),
            ]);
        }

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/notifications?event=invoice.created&per_page=1&page=2')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('current_page', 2)
            ->assertJsonPath('last_page', 2)
            ->assertJsonPath('total', 2);
    }

    public function test_inbox_and_mutations_are_limited_to_users_company_and_branch(): void
    {
        $user = $this->makeUserWithPermission('notifications.view');
        $user->forceFill(['company_id' => 11, 'branch_id' => 7])->save();
        $ownId = DB::table('notifications')->insertGetId([
            'type' => 'App\\Notifications\\Test',
            'notifiable_type' => User::class,
            'notifiable_id' => $user->id,
            'data' => json_encode(['title' => 'Scoped', 'message' => 'Own branch']),
            'company_id' => 11,
            'branch_id' => 7,
            'event' => 'invoice.created',
            'category' => 'invoice',
            'priority' => 'normal',
            'channel' => 'in_app',
            'read_at' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $foreignId = DB::table('notifications')->insertGetId([
            'type' => 'App\\Notifications\\Test',
            'notifiable_type' => User::class,
            'notifiable_id' => $user->id,
            'data' => json_encode(['title' => 'Other scope', 'message' => 'Not visible']),
            'company_id' => 12,
            'branch_id' => 8,
            'event' => 'invoice.created',
            'category' => 'invoice',
            'priority' => 'normal',
            'channel' => 'in_app',
            'read_at' => null,
            'created_at' => now()->subMinute(),
            'updated_at' => now(),
        ]);

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/notifications')
            ->assertOk()
            ->assertJsonCount(1, 'data');

        $this->actingAs($user, 'sanctum')->postJson('/api/notifications/' . $foreignId . '/read')->assertNotFound();
        $this->actingAs($user, 'sanctum')->postJson('/api/notifications/' . $ownId . '/read')->assertOk();
    }

    public function test_user_can_mark_own_notification_read_but_not_another_users(): void
    {
        $user = $this->makeUserWithPermission('notifications.view');
        $otherUser = User::factory()->create();

        $ownId = DB::table('notifications')->insertGetId([
            'type' => 'App\\Notifications\\Test',
            'notifiable_type' => User::class,
            'notifiable_id' => $user->id,
            'data' => json_encode(['title' => 'Mine', 'message' => 'Visible']),
            'read_at' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $otherId = DB::table('notifications')->insertGetId([
            'type' => 'App\\Notifications\\Test',
            'notifiable_type' => User::class,
            'notifiable_id' => $otherUser->id,
            'data' => json_encode(['title' => 'Theirs', 'message' => 'Hidden']),
            'read_at' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/notifications/' . $ownId . '/read')
            ->assertOk();

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/notifications/' . $otherId . '/read')
            ->assertStatus(404);
    }

    public function test_user_can_mark_all_own_notifications_read(): void
    {
        $user = $this->makeUserWithPermission('notifications.view');

        DB::table('notifications')->insert([
            ['type' => 'App\\Notifications\\Test', 'notifiable_type' => User::class, 'notifiable_id' => $user->id, 'data' => json_encode(['title' => 'A', 'message' => 'One']), 'read_at' => null, 'created_at' => now(), 'updated_at' => now()],
            ['type' => 'App\\Notifications\\Test', 'notifiable_type' => User::class, 'notifiable_id' => $user->id, 'data' => json_encode(['title' => 'B', 'message' => 'Two']), 'read_at' => null, 'created_at' => now(), 'updated_at' => now()],
        ]);

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/notifications/read-all')
            ->assertOk();

        $this->assertSame(0, DB::table('notifications')->where('notifiable_id', $user->id)->whereNull('read_at')->count());
    }

    public function test_archived_notifications_are_excluded_from_unread_count_and_mark_all_read(): void
    {
        $user = $this->makeUserWithPermission('notifications.view');
        $activeId = DB::table('notifications')->insertGetId([
            'type' => 'App\\Notifications\\Test',
            'notifiable_type' => User::class,
            'notifiable_id' => $user->id,
            'data' => json_encode(['title' => 'Active', 'message' => 'Unread']),
            'read_at' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $archivedId = DB::table('notifications')->insertGetId([
            'type' => 'App\\Notifications\\Test',
            'notifiable_type' => User::class,
            'notifiable_id' => $user->id,
            'data' => json_encode(['title' => 'Archived', 'message' => 'Do not count']),
            'read_at' => null,
            'archived_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/notifications/unread-count')
            ->assertOk()
            ->assertJsonPath('data.count', 1);

        $this->actingAs($user, 'sanctum')->postJson('/api/notifications/read-all')->assertOk();

        $this->assertNotNull(DB::table('notifications')->where('id', $activeId)->value('read_at'));
        $this->assertNull(DB::table('notifications')->where('id', $archivedId)->value('read_at'));
    }

    public function test_in_app_test_notification_is_delivered_immediately(): void
    {
        $user = $this->makeUserWithPermission('notifications.send');

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/notifications/test', [
                'title' => 'Test alert',
                'message' => 'Visible in the ERP inbox.',
                'channel' => 'in_app',
            ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'sent');

        $this->assertDatabaseHas('notifications', [
            'notifiable_id' => $user->id,
        ]);
        $this->assertDatabaseHas('notification_logs', [
            'user_id' => $user->id,
            'channel' => 'in_app',
            'status' => 'sent',
        ]);
    }

    public function test_email_test_notification_is_queued_only_when_provider_is_ready(): void
    {
        Queue::fake();
        config(['mail.default' => 'smtp', 'mail.from.address' => 'notifications@raptor.test']);
        $user = $this->makeUserWithPermission('notifications.send');

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/notifications/test', [
                'title' => 'Email test',
                'message' => 'Send through SMTP.',
                'channel' => 'email',
            ])
            ->assertStatus(202)
            ->assertJsonPath('data.status', 'queued');

        Queue::assertPushed(\App\Jobs\DeliverNotification::class);
        $this->assertDatabaseHas('notification_logs', [
            'user_id' => $user->id,
            'channel' => 'email',
            'status' => 'queued',
        ]);
    }

    public function test_test_notification_rejects_unconfigured_external_channels(): void
    {
        config(['services.twilio.sid' => null, 'services.twilio.auth_token' => null]);
        $user = $this->makeUserWithPermission('notifications.send');

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/notifications/test', [
                'title' => 'SMS test',
                'message' => 'Should not be falsely queued.',
                'channel' => 'sms',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('channel');

        $this->assertDatabaseCount('notification_logs', 0);
    }

    public function test_browser_push_subscription_is_saved_and_can_be_removed_by_its_owner(): void
    {
        config([
            'services.webpush.public_key' => 'public-vapid-key',
            'services.webpush.private_key' => 'private-vapid-key',
        ]);
        $user = $this->makeUserWithPermission('notifications.view');
        $subscription = [
            'endpoint' => 'https://push.example.test/subscription/user-device',
            'keys' => ['p256dh' => 'browser-public-key', 'auth' => 'browser-auth-token'],
        ];

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/notifications/push-subscriptions', $subscription)
            ->assertOk();

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/notifications/providers')
            ->assertOk()
            ->assertJsonPath('data.push.ready', true)
            ->assertJsonPath('data.push.subscriptions', 1);

        $this->actingAs($user, 'sanctum')
            ->deleteJson('/api/notifications/push-subscriptions', ['endpoint' => $subscription['endpoint']])
            ->assertOk();

        $this->assertDatabaseCount('push_subscriptions', 0);
    }

    public function test_explicit_unknown_recipient_is_rejected_instead_of_falling_back_to_sender(): void
    {
        $user = $this->makeUserWithPermission('notifications.send');

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/notifications/send', [
                'title' => 'Should not send',
                'message' => 'Unknown target.',
                'channel' => 'in_app',
                'recipients' => ['user:999999'],
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('recipients');

        $this->assertDatabaseCount('notifications', 0);
        $this->assertDatabaseCount('notification_logs', 0);
    }

    public function test_send_persists_the_actor_company_and_branch_scope(): void
    {
        $user = $this->makeUserWithPermission('notifications.send');
        $user->forceFill(['company_id' => 11, 'branch_id' => 7])->save();

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/notifications/send', [
                'title' => 'Scoped alert',
                'message' => 'Keep this alert in the selected tenant.',
                'channel' => 'in_app',
            ])
            ->assertStatus(202)
            ->assertJsonPath('data.recipient_count', 1);

        $this->assertDatabaseHas('notifications', [
            'notifiable_id' => $user->id,
            'company_id' => 11,
            'branch_id' => 7,
        ]);
        $this->assertDatabaseHas('notification_logs', [
            'user_id' => $user->id,
            'company_id' => 11,
            'branch_id' => 7,
        ]);
    }

    public function test_whatsapp_notification_send_requires_whatsapp_send_permission(): void
    {
        $user = $this->makeUserWithPermission('notifications.send');

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/notifications/send', [
                'title' => 'WhatsApp alert',
                'message' => 'A specific permission is required.',
                'channel' => 'whatsapp',
            ])
            ->assertForbidden();

        $this->assertDatabaseCount('notifications', 0);
        $this->assertDatabaseCount('notification_logs', 0);
    }

    public function test_configured_whatsapp_send_queues_while_session_is_not_ready(): void
    {
        Queue::fake();
        config([
            'services.whatsapp_web_js.enabled' => true,
            'services.whatsapp_web_js.service_url' => 'http://127.0.0.1:3010',
            'services.whatsapp_web_js.service_token' => 'worker-test-token',
        ]);
        Http::fake(['*' => Http::response([
            'success' => true,
            'data' => ['status' => 'qr_required', 'ready' => false, 'connected' => false, 'authenticated' => false],
        ])]);

        $user = $this->makeUserWithPermission('notifications.send');
        $user->roles()->first()->givePermissionTo('notifications.whatsapp.send');
        $user->forceFill(['phone' => '+919999999999'])->save();
        $user->flushPermissionCache();

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/notifications/send', [
                'title' => 'WhatsApp alert',
                'message' => 'Queue until the WhatsApp session is ready.',
                'channel' => 'whatsapp',
            ])
            ->assertStatus(202);

        $this->assertDatabaseHas('notification_logs', [
            'user_id' => $user->id,
            'channel' => 'whatsapp',
            'provider' => 'whatsapp_web_js',
            'recipient' => '+919999999999',
            'status' => 'queued',
        ]);
        Queue::assertPushed(\App\Jobs\DeliverNotification::class);
    }

    public function test_whatsapp_manual_send_rejects_multiple_recipients(): void
    {
        $user = $this->makeUserWithPermission('notifications.send');
        Permission::firstOrCreate(['name' => 'notifications.whatsapp.send'], ['active' => true]);
        Permission::firstOrCreate(['name' => 'notifications.manage'], ['active' => true]);
        $user->roles()->first()->givePermissionTo(['notifications.whatsapp.send', 'notifications.manage']);
        $user->flushPermissionCache();

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/notifications/send', [
                'title' => 'WhatsApp alert',
                'message' => 'This must stay an individual delivery.',
                'channel' => 'whatsapp',
                'recipients' => ['+919999999991', '+919999999992'],
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('recipients');

        $this->assertDatabaseCount('notifications', 0);
        $this->assertDatabaseCount('notification_logs', 0);
    }

    public function test_whatsapp_send_accepts_user_phone_numbers_in_common_formats(): void
    {
        Queue::fake();
        config([
            'services.whatsapp_web_js.enabled' => true,
            'services.whatsapp_web_js.service_url' => 'http://127.0.0.1:3010',
            'services.whatsapp_web_js.service_token' => 'worker-test-token',
        ]);
        Http::fake(['*' => Http::response([
            'success' => true,
            'data' => ['status' => 'ready', 'ready' => true, 'connected' => true, 'authenticated' => true],
        ])]);

        $user = $this->makeUserWithPermission('notifications.send');
        $user->roles()->first()->givePermissionTo('notifications.whatsapp.send');
        $user->forceFill(['phone' => '+91 98765 43210'])->save();
        $user->flushPermissionCache();

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/notifications/send', [
                'title' => 'WhatsApp alert',
                'message' => 'This user phone should be accepted and queued.',
                'channel' => 'whatsapp',
            ])
            ->assertStatus(202)
            ->assertJsonPath('data.status', 'queued');

        $this->assertDatabaseHas('notification_logs', [
            'user_id' => $user->id,
            'channel' => 'whatsapp',
            'recipient' => '+919876543210',
            'status' => 'queued',
        ]);
        Queue::assertPushed(\App\Jobs\DeliverNotification::class);
    }

    public function test_scheduled_whatsapp_delivery_queues_until_session_is_ready(): void
    {
        Queue::fake();
        config([
            'services.whatsapp_web_js.enabled' => true,
            'services.whatsapp_web_js.service_url' => 'http://127.0.0.1:3010',
            'services.whatsapp_web_js.service_token' => 'worker-test-token',
        ]);
        Http::fake(['*' => Http::response([
            'success' => true,
            'data' => ['status' => 'qr_required', 'ready' => false, 'connected' => false, 'authenticated' => false],
        ])]);
        $user = $this->makeUserWithPermission('notifications.schedule');
        $user->roles()->first()->givePermissionTo('notifications.whatsapp.send');
        $user->forceFill(['phone' => '+919999999999'])->save();
        $user->flushPermissionCache();
        DB::table('scheduled_notifications')->insert([
            'created_by' => $user->id,
            'title' => 'Scheduled WhatsApp alert',
            'message' => 'Queue until reconnect.',
            'channel' => 'whatsapp',
            'priority' => 'normal',
            'recipients' => json_encode([['type' => User::class, 'id' => $user->id, 'address' => '+919999999999']]),
            'schedule_type' => 'once',
            'run_at' => now()->subMinute(),
            'timezone' => 'Asia/Kolkata',
            'enabled' => true,
            'next_run_at' => now()->subMinute(),
            'idempotency_key' => 'whatsapp-schedule-test-' . $user->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->assertSame(1, app(\App\Services\NotificationScheduleService::class)->runDueSchedules());
        $this->assertDatabaseHas('notification_logs', [
            'user_id' => $user->id,
            'channel' => 'whatsapp',
            'provider' => 'whatsapp_web_js',
            'recipient' => '+919999999999',
            'status' => 'queued',
        ]);
        Queue::assertPushed(\App\Jobs\DeliverNotification::class);
    }

    public function test_send_rejects_missing_template_variables_and_replaces_supplied_values(): void
    {
        $user = $this->makeUserWithPermission('notifications.send');
        $templateId = DB::table('notification_templates')->insertGetId([
            'name' => 'Payment for {{customer_name}}',
            'event_name' => 'system.alert',
            'channel' => 'in_app',
            'language' => 'en',
            'body' => 'Invoice {{invoice_number}} paid {{amount}}.',
            'variables' => json_encode(['customer_name', 'invoice_number', 'amount']),
            'active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $payload = [
            'title' => 'Template title',
            'message' => 'Template message',
            'channel' => 'in_app',
            'template_id' => $templateId,
        ];

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/notifications/send', $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('variables');

        $this->assertDatabaseCount('notifications', 0);
        $this->actingAs($user, 'sanctum')
            ->postJson('/api/notifications/send', $payload + [
                'variables' => [
                    'customer_name' => 'Acme Ltd',
                    'invoice_number' => 'INV-1042',
                    'amount' => '850.00',
                ],
            ])
            ->assertStatus(202);

        $notification = DB::table('notifications')->where('notifiable_id', $user->id)->first();
        $data = json_decode($notification->data, true);
        $this->assertSame('Payment for Acme Ltd', $data['title']);
        $this->assertSame('Invoice INV-1042 paid 850.00.', $data['message']);
    }

    public function test_due_one_time_schedule_delivers_once_and_is_idempotent(): void
    {
        $user = $this->makeUserWithPermission('notifications.schedule');
        $scheduleId = DB::table('scheduled_notifications')->insertGetId([
            'created_by' => $user->id,
            'title' => 'Scheduled alert',
            'message' => 'Run once.',
            'channel' => 'in_app',
            'priority' => 'normal',
            'recipients' => json_encode([['type' => User::class, 'id' => $user->id, 'address' => 'internal']]),
            'schedule_type' => 'once',
            'run_at' => now()->subMinute(),
            'timezone' => 'Asia/Kolkata',
            'enabled' => true,
            'next_run_at' => now()->subMinute(),
            'idempotency_key' => 'schedule-test-' . $user->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/notifications/scheduled')
            ->assertOk()
            ->assertJsonPath('data.0.message', 'Run once.')
            ->assertJsonPath('data.0.recipients.0', 'user:' . $user->id);

        $scheduler = app(\App\Services\NotificationScheduleService::class);
        $this->assertSame(1, $scheduler->runDueSchedules());
        $this->assertSame(0, $scheduler->runDueSchedules());

        $this->assertDatabaseHas('notifications', [
            'notifiable_type' => User::class,
            'notifiable_id' => $user->id,
            'event' => 'scheduled.notification',
        ]);
        $this->assertDatabaseHas('scheduled_notifications', [
            'id' => $scheduleId,
            'enabled' => 0,
            'last_run_at' => now()->toDateTimeString(),
        ]);
    }

    public function test_automation_toggle_preserves_existing_rule_configuration(): void
    {
        $user = $this->makeUserWithPermission('notifications.automation');
        $this->actingAs($user, 'sanctum')
            ->postJson('/api/notifications/automation', [
                'event' => 'invoice.created',
                'label' => 'Invoice notice',
                'channels' => ['email', 'in_app'],
                'priority' => 'high',
                'enabled' => true,
            ])
            ->assertCreated();
        $rule = DB::table('notification_automation_rules')->first();

        $this->actingAs($user, 'sanctum')
            ->putJson('/api/notifications/automation/' . $rule->id, ['enabled' => false])
            ->assertOk();

        $updated = DB::table('notification_automation_rules')->find($rule->id);
        $this->assertSame('invoice.created', $updated->event);
        $this->assertSame('Invoice notice', $updated->label);
        $this->assertSame(['email', 'in_app'], json_decode($updated->channels, true));
        $this->assertSame('high', $updated->priority);
        $this->assertFalse((bool) $updated->enabled);
    }

    public function test_whatsapp_automation_rule_requires_whatsapp_send_permission(): void
    {
        $user = $this->makeUserWithPermission('notifications.automation');

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/notifications/automation', [
                'event' => 'invoice.created',
                'label' => 'WhatsApp invoice alert',
                'channels' => ['whatsapp'],
                'priority' => 'normal',
                'enabled' => true,
            ])
            ->assertForbidden();

        $this->assertDatabaseCount('notification_automation_rules', 0);

        $authorizedUser = $this->makeUserWithPermission('notifications.automation');
        $authorizedUser->roles()->first()->givePermissionTo('notifications.whatsapp.send');
        $authorizedUser->flushPermissionCache();
        $response = $this->actingAs($authorizedUser, 'sanctum')
            ->postJson('/api/notifications/automation', [
                'event' => 'invoice.created',
                'label' => 'Authorized WhatsApp alert',
                'channels' => ['whatsapp'],
                'priority' => 'normal',
                'enabled' => true,
            ])
            ->assertCreated();

        $this->assertDatabaseHas('notification_automation_rules', [
            'id' => $response->json('data.id'),
            'channels' => json_encode(['whatsapp']),
        ]);
    }

    public function test_transient_failure_queues_configured_fallback_channel(): void
    {
        Queue::fake();
        config([
            'services.twilio.sid' => 'AC-test',
            'services.twilio.auth_token' => 'test-auth',
            'services.twilio.sms_from' => '+15550001111',
        ]);
        $user = $this->makeUserWithPermission('notifications.view');
        $user->phone = '+15550002222';
        $user->save();
        DB::table('notification_fallback_settings')->insert([
            'user_id' => $user->id,
            'enabled' => true,
            'channel_order' => json_encode(['email', 'sms']),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $notificationId = DB::table('notifications')->insertGetId([
            'type' => 'App\\Notifications\\SystemAlert',
            'notifiable_type' => User::class,
            'notifiable_id' => $user->id,
            'data' => json_encode(['title' => 'Fallback', 'message' => 'Retry through SMS.']),
            'read_at' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $failedDeliveryId = DB::table('notification_logs')->insertGetId([
            'user_id' => $user->id,
            'created_by' => $user->id,
            'notification_id' => $notificationId,
            'channel' => 'email',
            'provider' => 'smtp',
            'recipient' => $user->email,
            'status' => 'failed',
            'attempt_count' => 3,
            'error_message' => 'Temporary SMTP outage',
            'failed_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $fallbackId = app(\App\Services\NotificationFallbackService::class)->attemptAfterTransientFailure($failedDeliveryId);

        $this->assertNotNull($fallbackId);
        $this->assertDatabaseHas('notification_logs', [
            'id' => $fallbackId,
            'channel' => 'sms',
            'status' => 'queued',
            'fallback_from_delivery_id' => $failedDeliveryId,
        ]);
        Queue::assertPushed(\App\Jobs\DeliverNotification::class);
    }

    public function test_whatsapp_provider_status_endpoint_requires_permission_and_uses_secure_contract(): void
    {
        $allowedUser = $this->makeUserWithPermission('notifications.providers');
        $blockedUser = User::factory()->create();

        $this->actingAs($allowedUser, 'sanctum')
            ->getJson('/api/notifications/providers/whatsapp/status')
            ->assertOk()
            ->assertJsonStructure([
                'success',
                'data' => [
                    'provider',
                    'status',
                    'configured',
                    'connected',
                    'ready',
                    'authenticated',
                    'qr_available',
                    'last_connected_at',
                    'last_error',
                ],
            ]);

        $this->actingAs($blockedUser, 'sanctum')
            ->getJson('/api/notifications/providers/whatsapp/status')
            ->assertStatus(403);
    }

    public function test_whatsapp_qr_endpoint_requires_permission_and_prevents_caching(): void
    {
        $user = $this->makeUserWithPermission('notifications.whatsapp.view');
        $service = \Mockery::mock(WhatsAppService::class);
        $service->shouldReceive('qr')->once()->andReturn('data:image/png;base64,test-qr');
        $this->app->instance(WhatsAppService::class, $service);

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/notifications/providers/whatsapp/qr')
            ->assertOk()
            ->assertJsonPath('data.qr', 'data:image/png;base64,test-qr')
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertHeader('Pragma', 'no-cache');

        $this->actingAs(User::factory()->create(), 'sanctum')
            ->getJson('/api/notifications/providers/whatsapp/qr')
            ->assertForbidden();
    }

    public function test_user_with_whatsapp_connect_permission_can_connect_provider(): void
    {
        $user = $this->makeUserWithPermission('notifications.whatsapp.connect');
        $service = \Mockery::mock(WhatsAppService::class);
        $service->shouldReceive('connect')->once()->andReturn([
            'provider' => 'whatsapp_web_js',
            'status' => 'starting',
            'configured' => true,
            'connected' => false,
            'ready' => false,
            'authenticated' => false,
            'qr_available' => false,
            'last_connected_at' => null,
            'last_error' => null,
        ]);
        $this->app->instance(WhatsAppService::class, $service);

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/notifications/providers/whatsapp/connect')
            ->assertOk()
            ->assertJsonPath('data.status', 'starting');
    }

    public function test_daily_summary_configuration_requires_permission_and_persists_settings(): void
    {
        $userWithoutPermission = User::factory()->create();
        $this->actingAs($userWithoutPermission, 'sanctum')
            ->getJson('/api/daily-summary/settings')
            ->assertStatus(403);

        $user = $this->makeUserWithPermission('reports.daily_summary.configure');
        $user->roles()->first()->givePermissionTo('notifications.whatsapp.send');
        $user->flushPermissionCache();
        $this->actingAs($user, 'sanctum')
            ->putJson('/api/daily-summary/settings', [
                'enabled' => true,
                'send_time' => '21:00',
                'timezone' => 'Asia/Kolkata',
                'channels' => ['email', 'whatsapp'],
            ])
            ->assertOk()
            ->assertJsonPath('data.enabled', true)
            ->assertJsonPath('data.send_time', '21:00');

        $this->assertDatabaseHas('settings', ['key' => 'daily_summary_enabled', 'value' => '1']);
    }

    public function test_daily_summary_rejects_company_and_branch_outside_user_scope(): void
    {
        $user = $this->makeUserWithPermission('reports.daily_summary.view');
        $this->actingAs($user, 'sanctum')
            ->getJson('/api/daily-summary?company_id=1&branch_id=2')
            ->assertForbidden();
    }

    public function test_daily_summary_scheduler_is_idempotent_and_excludes_branch_only_users(): void
    {
        $companyRecipient = $this->makeUserWithPermission('daily_summary.receive');
        $branchRecipient = $this->makeUserWithPermission('view dashboard profit');
        $companyRecipient->forceFill(['company_id' => 22, 'branch_id' => null])->save();
        $branchRecipient->forceFill(['company_id' => 22, 'branch_id' => 9])->save();

        $service = app(\App\Services\DailySummaryService::class);
        $service->saveSettings([
            'enabled' => true,
            'send_time' => now('Asia/Kolkata')->format('H:i'),
            'timezone' => 'Asia/Kolkata',
            'company_id' => 22,
            'branch_id' => 0,
            'channels' => ['in_app'],
            'recipients' => [],
        ]);

        $this->assertSame(1, $service->dispatchDueSummary());
        $this->assertSame(0, $service->dispatchDueSummary());
        $this->assertDatabaseHas('notifications', [
            'notifiable_id' => $companyRecipient->id,
            'event' => 'daily.summary',
            'company_id' => 22,
        ]);
        $this->assertDatabaseMissing('notifications', [
            'notifiable_id' => $branchRecipient->id,
            'event' => 'daily.summary',
        ]);
    }

    public function test_daily_summary_report_requires_report_and_profit_permissions(): void
    {
        $user = $this->makeUserWithPermission('reports.daily_summary.view');

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/daily-summary')
            ->assertStatus(403);

        $userWithProfit = $this->makeUserWithPermission('view dashboard profit');
        $userWithProfit->roles()->syncWithoutDetaching([$user->roles()->first()->id]);
        $userWithProfit->flushPermissionCache();

        $this->actingAs($userWithProfit, 'sanctum')
            ->getJson('/api/daily-summary')
            ->assertOk();
    }
}
