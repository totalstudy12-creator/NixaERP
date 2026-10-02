<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $permissionNames = [
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
            'notifications.whatsapp.view',
            'notifications.whatsapp.connect',
            'notifications.whatsapp.send',
            'notifications.whatsapp.logout',
            'notifications.whatsapp.test',
            'daily_summary.view',
            'daily_summary.receive',
            'daily_summary.configure',
            'reports.daily_summary.view',
            'reports.daily_summary.receive',
            'reports.daily_summary.configure',
        ];

        $permissionIds = DB::table('permissions')
            ->whereIn('name', $permissionNames)
            ->pluck('id')
            ->all();

        foreach (['Admin', 'Super Admin'] as $roleName) {
            $roleId = DB::table('roles')->where('name', $roleName)->value('id');
            if (! $roleId) {
                continue;
            }

            $existingPermissionIds = DB::table('role_permissions')
                ->where('role_id', $roleId)
                ->whereIn('permission_id', $permissionIds)
                ->pluck('permission_id')
                ->all();

            foreach (array_diff($permissionIds, $existingPermissionIds) as $permissionId) {
                DB::table('role_permissions')->insertOrIgnore([
                    'role_id' => $roleId,
                    'permission_id' => $permissionId,
                ]);
            }
        }
    }

    public function down(): void
    {
        $permissionNames = [
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
            'notifications.whatsapp.view',
            'notifications.whatsapp.connect',
            'notifications.whatsapp.send',
            'notifications.whatsapp.logout',
            'notifications.whatsapp.test',
            'daily_summary.view',
            'daily_summary.receive',
            'daily_summary.configure',
            'reports.daily_summary.view',
            'reports.daily_summary.receive',
            'reports.daily_summary.configure',
        ];

        $permissionIds = DB::table('permissions')
            ->whereIn('name', $permissionNames)
            ->pluck('id')
            ->all();

        foreach (['Admin', 'Super Admin'] as $roleName) {
            $roleId = DB::table('roles')->where('name', $roleName)->value('id');
            if (! $roleId) {
                continue;
            }

            DB::table('role_permissions')
                ->where('role_id', $roleId)
                ->whereIn('permission_id', $permissionIds)
                ->delete();
        }
    }
};
