<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $permissions = [
            ['name' => 'notifications.whatsapp.view', 'group' => 'Notifications', 'description' => 'View WhatsApp provider status', 'active' => true],
            ['name' => 'notifications.whatsapp.connect', 'group' => 'Notifications', 'description' => 'Connect the WhatsApp provider', 'active' => true],
            ['name' => 'notifications.whatsapp.send', 'group' => 'Notifications', 'description' => 'Send WhatsApp notifications', 'active' => true],
            ['name' => 'notifications.whatsapp.test', 'group' => 'Notifications', 'description' => 'Send a WhatsApp test message', 'active' => true],
            ['name' => 'notifications.whatsapp.logout', 'group' => 'Notifications', 'description' => 'Disconnect the WhatsApp provider', 'active' => true],
        ];

        foreach ($permissions as $permission) {
            DB::table('permissions')->updateOrInsert(['name' => $permission['name']], $permission);
        }
    }

    public function down(): void
    {
        DB::table('permissions')->whereIn('name', [
            'notifications.whatsapp.view',
            'notifications.whatsapp.connect',
            'notifications.whatsapp.send',
            'notifications.whatsapp.test',
            'notifications.whatsapp.logout',
        ])->delete();
    }
};
