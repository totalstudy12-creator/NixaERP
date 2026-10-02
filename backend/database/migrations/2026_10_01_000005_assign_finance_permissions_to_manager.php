<?php

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    private const MANAGER_PERMISSIONS = [
        'income_expenses.view',
        'income_expenses.create',
        'income_expenses.edit',
        'income_expenses.delete',
        'income_expenses.export',
        'income_expenses.manage_categories',
        'income_expenses.manage_accounts',
    ];

    public function up(): void
    {
        $managerRole = Role::query()->where('name', 'Manager')->first();
        if (! $managerRole) {
            return;
        }

        $permissionIds = Permission::query()
            ->whereIn('name', self::MANAGER_PERMISSIONS)
            ->pluck('id')
            ->all();

        $managerRole->permissions()->syncWithoutDetaching($permissionIds);
    }

    public function down(): void
    {
    }
};