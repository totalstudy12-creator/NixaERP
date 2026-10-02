<?php

use App\Models\Permission;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    public function up(): void
    {
        Permission::firstOrCreate(
            ['name' => 'edit permissions'],
            ['group' => 'permissions', 'description' => 'Edit permission definitions', 'active' => true]
        );
        Permission::firstOrCreate(
            ['name' => 'delete permissions'],
            ['group' => 'permissions', 'description' => 'Delete permission definitions', 'active' => true]
        );
    }

    public function down(): void
    {
        Permission::query()
            ->whereIn('name', ['edit permissions', 'delete permissions'])
            ->whereDoesntHave('roles')
            ->delete();
    }
};