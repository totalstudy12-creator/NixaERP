<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $permissions = [
            ['name' => 'notifications.view', 'group' => 'Notifications', 'description' => 'View in-app notifications', 'active' => true],
            ['name' => 'notifications.manage', 'group' => 'Notifications', 'description' => 'Manage notification center', 'active' => true],
            ['name' => 'notifications.send', 'group' => 'Notifications', 'description' => 'Send notifications', 'active' => true],
            ['name' => 'notifications.templates', 'group' => 'Notifications', 'description' => 'Manage notification templates', 'active' => true],
            ['name' => 'notifications.automation', 'group' => 'Notifications', 'description' => 'Manage notification automation', 'active' => true],
            ['name' => 'notifications.schedule', 'group' => 'Notifications', 'description' => 'Manage scheduled notifications', 'active' => true],
            ['name' => 'notifications.queue', 'group' => 'Notifications', 'description' => 'Manage notification queue', 'active' => true],
            ['name' => 'notifications.delivery', 'group' => 'Notifications', 'description' => 'View notification delivery history', 'active' => true],
            ['name' => 'notifications.providers', 'group' => 'Notifications', 'description' => 'View notification provider status', 'active' => true],
            ['name' => 'notifications.preferences', 'group' => 'Notifications', 'description' => 'Manage personal notification preferences', 'active' => true],
            ['name' => 'daily_summary.view', 'group' => 'Notifications', 'description' => 'View daily summary report', 'active' => true],
            ['name' => 'daily_summary.receive', 'group' => 'Notifications', 'description' => 'Receive daily summary notifications', 'active' => true],
            ['name' => 'daily_summary.configure', 'group' => 'Notifications', 'description' => 'Configure daily summary settings', 'active' => true],
            ['name' => 'reports.daily_summary.view', 'group' => 'Reports', 'description' => 'View daily summary report', 'active' => true],
            ['name' => 'reports.daily_summary.receive', 'group' => 'Reports', 'description' => 'Receive daily summary notifications', 'active' => true],
            ['name' => 'reports.daily_summary.configure', 'group' => 'Reports', 'description' => 'Configure daily summary settings', 'active' => true],
        ];

        foreach ($permissions as $permission) {
            DB::table('permissions')->updateOrInsert(['name' => $permission['name']], $permission);
        }
    }

    public function down(): void
    {
        DB::table('permissions')->whereIn('name', [
            'notifications.view',
            'notifications.manage',
            'notifications.send',
            'notifications.templates',
            'notifications.automation',
            'notifications.schedule',
            'notifications.queue',
            'notifications.delivery',
            'notifications.providers',
            'notifications.preferences',
            'daily_summary.view',
            'daily_summary.receive',
            'daily_summary.configure',
            'reports.daily_summary.view',
            'reports.daily_summary.receive',
            'reports.daily_summary.configure',
        ])->delete();
    }
};
