<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $permissions = [
            ['name' => 'income_expenses.view', 'group' => 'Finance', 'description' => 'View income and expense transactions', 'active' => true],
            ['name' => 'income_expenses.create', 'group' => 'Finance', 'description' => 'Create income and expense transactions', 'active' => true],
            ['name' => 'income_expenses.edit', 'group' => 'Finance', 'description' => 'Edit income and expense transactions', 'active' => true],
            ['name' => 'income_expenses.delete', 'group' => 'Finance', 'description' => 'Delete income and expense transactions', 'active' => true],
            ['name' => 'income_expenses.approve', 'group' => 'Finance', 'description' => 'Approve income and expense transactions', 'active' => true],
            ['name' => 'income_expenses.reject', 'group' => 'Finance', 'description' => 'Reject income and expense transactions', 'active' => true],
            ['name' => 'income_expenses.reverse', 'group' => 'Finance', 'description' => 'Reverse income and expense transactions', 'active' => true],
            ['name' => 'income_expenses.export', 'group' => 'Finance', 'description' => 'Export income and expense data', 'active' => true],
            ['name' => 'income_expenses.manage_categories', 'group' => 'Finance', 'description' => 'Manage income and expense categories', 'active' => true],
            ['name' => 'income_expenses.manage_accounts', 'group' => 'Finance', 'description' => 'Manage income and expense accounts', 'active' => true],
            ['name' => 'income_expenses.manage_recurring', 'group' => 'Finance', 'description' => 'Manage recurring income and expense schedules', 'active' => true],
            ['name' => 'income_expenses.view_reports', 'group' => 'Finance', 'description' => 'View reports for income and expenses', 'active' => true],
        ];

        foreach ($permissions as $permission) {
            DB::table('permissions')->updateOrInsert(
                ['name' => $permission['name']],
                $permission
            );
        }
    }

    public function down(): void
    {
        DB::table('permissions')->whereIn('name', [
            'income_expenses.view',
            'income_expenses.create',
            'income_expenses.edit',
            'income_expenses.delete',
            'income_expenses.approve',
            'income_expenses.reject',
            'income_expenses.reverse',
            'income_expenses.export',
            'income_expenses.manage_categories',
            'income_expenses.manage_accounts',
            'income_expenses.manage_recurring',
            'income_expenses.view_reports',
        ])->delete();
    }
};
