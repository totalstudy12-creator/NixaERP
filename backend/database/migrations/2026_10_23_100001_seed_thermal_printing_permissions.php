<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        $permissions = [
            ['name' => 'printers.view', 'group' => 'Thermal Printing', 'description' => 'View saved thermal and Bluetooth printers', 'active' => true],
            ['name' => 'printers.manage', 'group' => 'Thermal Printing', 'description' => 'Add, update, or remove Bluetooth and thermal printers', 'active' => true],
            ['name' => 'printers.connect', 'group' => 'Thermal Printing', 'description' => 'Connect or disconnect thermal Bluetooth printers', 'active' => true],
            ['name' => 'printing.quick_print', 'group' => 'Thermal Printing', 'description' => 'Execute quick label printing directly from inventory', 'active' => true],
            ['name' => 'printing.print_labels', 'group' => 'Thermal Printing', 'description' => 'Generate and print product & barcode labels', 'active' => true],
            ['name' => 'printing.bulk_print', 'group' => 'Thermal Printing', 'description' => 'Batch and bulk thermal label printing', 'active' => true],
            ['name' => 'printing.manage_templates', 'group' => 'Thermal Printing', 'description' => 'Create, edit, duplicate, and delete label templates', 'active' => true],
            ['name' => 'printing.manage_paper_profiles', 'group' => 'Thermal Printing', 'description' => 'Configure thermal paper roll and label dimension profiles', 'active' => true],
            ['name' => 'printing.view_history', 'group' => 'Thermal Printing', 'description' => 'Inspect thermal print audit logs and job history', 'active' => true],
            ['name' => 'printing.reprint', 'group' => 'Thermal Printing', 'description' => 'Reprint previously queued or completed print jobs', 'active' => true],
            ['name' => 'printing.cancel_jobs', 'group' => 'Thermal Printing', 'description' => 'Cancel pending or queued print jobs', 'active' => true],
            ['name' => 'printing.view_cost_price', 'group' => 'Thermal Printing', 'description' => 'Include purchase cost price on thermal label fields', 'active' => true],
            ['name' => 'printing.manage_defaults', 'group' => 'Thermal Printing', 'description' => 'Assign default printers, paper sizes, and templates', 'active' => true],
        ];

        foreach ($permissions as $permission) {
            DB::table('permissions')->updateOrInsert(
                ['name' => $permission['name']],
                $permission
            );
        }

        // Assign to Admin and Super Admin
        $permissionNames = array_column($permissions, 'name');
        $permissionIds = DB::table('permissions')
            ->whereIn('name', $permissionNames)
            ->pluck('id')
            ->all();

        foreach (['Admin', 'Super Admin', 'Manager'] as $roleName) {
            $roleId = DB::table('roles')->where('name', $roleName)->value('id');
            if (!$roleId) {
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

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $names = [
            'printers.view',
            'printers.manage',
            'printers.connect',
            'printing.quick_print',
            'printing.print_labels',
            'printing.bulk_print',
            'printing.manage_templates',
            'printing.manage_paper_profiles',
            'printing.view_history',
            'printing.reprint',
            'printing.cancel_jobs',
            'printing.view_cost_price',
            'printing.manage_defaults',
        ];

        $permissionIds = DB::table('permissions')->whereIn('name', $names)->pluck('id');
        DB::table('role_permissions')->whereIn('permission_id', $permissionIds)->delete();
        DB::table('permissions')->whereIn('name', $names)->delete();
    }
};
