<?php

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    public function up(): void
    {
        $managerRole = Role::query()->where('name', 'Manager')->first();
        $permission = Permission::query()->where('name', 'income_expenses.view_reports')->first();

        if ($managerRole && $permission) {
            $managerRole->permissions()->syncWithoutDetaching([$permission->id]);
        }
    }

    public function down(): void
    {
    }
};