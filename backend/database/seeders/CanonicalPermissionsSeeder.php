<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\PermissionCanonicalizer;

class CanonicalPermissionsSeeder extends Seeder
{
    /**
     * Run the database seeds.
     *
     * Idempotent & Production-Ready.
     * Seeds all canonical permissions and their legacy aliases, then maps
     * appropriate permission grants across all system roles.
     */
    public function run(): void
    {
        // 1. Seed all canonical permissions from catalog
        foreach (PermissionCanonicalizer::CATALOG as $key => $meta) {
            Permission::updateOrCreate(
                ['name' => $key],
                [
                    'group'       => $meta['group'],
                    'description' => $meta['description'],
                    'active'      => true,
                ]
            );
        }

        // 2. Seed all legacy aliases so backward compatibility is 100% preserved
        $reflection = new \ReflectionClass(PermissionCanonicalizer::class);
        $aliasMapProp = $reflection->getProperty('aliasMap');
        $aliasMapProp->setAccessible(true);
        $aliasMap = $aliasMapProp->getValue();

        foreach ($aliasMap as $alias => $canonicalKey) {
            if ($alias === $canonicalKey) {
                continue;
            }

            $meta = PermissionCanonicalizer::CATALOG[$canonicalKey] ?? null;
            $group = $meta['group'] ?? 'General';
            $description = $meta['description'] ?? "Alias for {$canonicalKey}";

            Permission::firstOrCreate(
                ['name' => $alias],
                [
                    'group'       => $group,
                    'description' => $description,
                    'active'      => true,
                ]
            );
        }

        // 3. Define role permission blueprints (canonical keys)
        $roleBlueprints = $this->getRoleBlueprints();

        // 4. Assign permissions to roles
        $allPermissions = Permission::where('active', true)->pluck('name')->all();

        // Admin and Super Admin get every permission in the system
        foreach (['Admin', 'Super Admin'] as $adminRoleName) {
            $role = Role::firstOrCreate(['name' => $adminRoleName]);
            $role->givePermissionTo($allPermissions);
        }

        foreach ($roleBlueprints as $roleName => $canonicalKeys) {
            $role = Role::firstOrCreate(['name' => $roleName]);

            // Expand canonical keys with aliases so all route and frontend checks resolve
            $expanded = PermissionCanonicalizer::expandWithAliases($canonicalKeys);
            $role->givePermissionTo($expanded);
        }

        // 5. Ensure all existing users' permission caches are refreshed
        User::query()->each(function (User $user) {
            $user->flushPermissionCache();
        });
    }

    /**
     * Map canonical permissions for all business roles.
     *
     * @return array<string, array<int, string>>
     */
    private function getRoleBlueprints(): array
    {
        // Common building blocks
        $baseStaff = [
            'profile.view',
            'profile.edit',
            'attendance.view',
            'attendance.create',
            'dashboard.view',
        ];

        $salesCommon = [
            'invoices.view',
            'invoices.create',
            'invoices.print',
            'sales.returns.view',
            'pos.view',
            'pos.create_sale',
            'customers.view',
            'customers.create',
            'customers.update',
            'products.view',
            'view orders',
            'create orders',
        ];

        $salesManager = array_merge($salesCommon, [
            'invoices.update',
            'invoices.delete',
            'invoices.export',
            'sales.returns.create',
            'sales.returns.update',
            'sales.returns.delete',
            'sales.returns.export',
            'customers.delete',
            'customers.export',
            'customers.import',
            'customers.ledger.view',
            'products.export',
            'reports.sales.view',
            'reports.export',
            'reports.print',
            'edit orders',
            'delete orders',
        ]);

        $purchaseCommon = [
            'purchases.view',
            'purchases.create',
            'purchases.update',
            'purchases.export',
            'suppliers.view',
            'suppliers.create',
            'suppliers.update',
            'suppliers.export',
            'products.view',
            'products.purchase_price.view',
            'products.purchase_price.edit',
            'wms.inventory.view',
            'wms.inventory.view_cost',
            'wms.stock.receive',
            'reports.purchases.view',
            'reports.inventory.view',
        ];

        $wmsStaff = [
            'wms.warehouses.view',
            'wms.locations.view',
            'wms.inventory.view',
            'wms.stock.receive',
            'wms.stock.issue',
            'wms.transfers.view',
            'wms.transfers.update',
            'wms.stock.count.create',
            'wms.stock.count.count',
            'products.view',
        ];

        $wmsManager = [
            'wms.dashboard.view',
            'wms.settings.view',
            'wms.warehouses.view',
            'wms.warehouses.create',
            'wms.warehouses.update',
            'wms.warehouses.assign_users',
            'wms.locations.view',
            'wms.locations.manage',
            'wms.inventory.view',
            'wms.inventory.view_cost',
            'wms.stock.receive',
            'wms.stock.issue',
            'wms.stock.adjustment.create',
            'wms.stock.adjustment.approve',
            'wms.transfers.view',
            'wms.transfers.create',
            'wms.transfers.update',
            'wms.transfers.approve',
            'wms.transfers.ship',
            'wms.transfers.receive',
            'wms.stock.count.create',
            'wms.stock.count.count',
            'wms.stock.count.approve',
            'wms.reports.view',
            'wms.reports.export',
            'wms.documents.download',
            'products.view',
            'products.create',
            'products.update',
            'products.export',
            'products.import',
            'products.purchase_price.view',
            'products.purchase_price.edit',
        ];

        $financeCommon = [
            'income_expenses.view',
            'income_expenses.create',
            'income_expenses.edit',
            'income_expenses.delete',
            'income_expenses.export',
            'accounting.view',
            'accounting.manage',
            'invoices.view',
            'invoices.export',
            'invoices.print',
            'purchases.view',
            'purchases.export',
            'payments.view',
            'payments.create',
            'payments.edit',
            'payments.delete',
            'customers.view',
            'customers.ledger.view',
            'customers.export',
            'suppliers.view',
            'suppliers.export',
            'products.view',
            'products.purchase_price.view',
            'wms.inventory.view_cost',
            'reports.view',
            'reports.accounts.view',
            'reports.gst.view',
            'reports.expenses.view',
            'reports.sales.view',
            'reports.purchases.view',
            'reports.export',
            'reports.print',
        ];

        $hrCommon = [
            'employees.view',
            'employees.create',
            'employees.update',
            'employees.delete',
            'employees.export',
            'attendance.view',
            'attendance.create',
            'attendance.update',
            'attendance.delete',
            'payroll.view',
            'payroll.create',
            'payroll.approve',
            'payroll.export',
        ];

        $marketingCommon = [
            'marketing.view',
            'marketing.manage',
            'customers.view',
            'customers.export',
            'products.view',
            'dashboard.view',
        ];

        $itSupportCommon = [
            'settings.view',
            'settings.update',
            'audit.logs.view',
            'backup.view',
            'backup.create',
            'backup.restore',
            'backup.download',
            'ai.providers.manage',
        ];

        $executiveLeadership = array_unique(array_merge(
            $baseStaff,
            $salesManager,
            $purchaseCommon,
            $wmsManager,
            $financeCommon,
            $hrCommon,
            $marketingCommon,
            [
                'dashboard.view',
                'ai.assistant.view',
                'notifications.view',
                'notifications.manage',
            ]
        ));

        $managerPermissions = array_diff(
            array_unique(array_merge(
                $baseStaff,
                $salesCommon,
                $purchaseCommon,
                $wmsStaff,
                [
                    'income_expenses.view',
                    'income_expenses.create',
                    'income_expenses.edit',
                    'income_expenses.delete',
                    'income_expenses.export',
                    'income_expenses.manage_categories',
                    'income_expenses.manage_accounts',
                    'income_expenses.view_reports',
                    'dashboard.view',
                    'reports.sales.view',
                    'reports.purchases.view',
                    'reports.inventory.view',
                    'reports.export',
                ]
            )),
            [
                'income_expenses.approve',
                'income_expenses.reject',
                'income_expenses.reverse',
                'income_expenses.manage_recurring',
                'edit permissions',
                'delete permissions',
                'permissions.update',
                'permissions.delete',
            ]
        );

        return [
            // Management & Executives
            'CEO'                  => $executiveLeadership,
            'COO'                  => $executiveLeadership,
            'Director'             => $executiveLeadership,
            'General Manager'      => $executiveLeadership,
            'Regional Manager'     => $executiveLeadership,
            'Area Manager'         => $executiveLeadership,
            'Senior Manager'       => $executiveLeadership,
            'Manager'              => $managerPermissions,

            // Finance & Accounts
            'CFO'                  => array_unique(array_merge($executiveLeadership, $financeCommon)),
            'CA'                   => $financeCommon,
            'Finance Manager'      => $financeCommon,
            'Accountant'           => $financeCommon,
            'Accounts Executive'   => array_diff($financeCommon, ['income_expenses.delete', 'accounting.manage']),
            'Auditor'              => [
                'income_expenses.view',
                'income_expenses.export',
                'accounting.view',
                'invoices.view',
                'invoices.export',
                'invoices.print',
                'purchases.view',
                'purchases.export',
                'payments.view',
                'customers.view',
                'customers.ledger.view',
                'customers.export',
                'suppliers.view',
                'suppliers.export',
                'products.view',
                'products.purchase_price.view',
                'wms.inventory.view_cost',
                'reports.view',
                'reports.accounts.view',
                'reports.gst.view',
                'reports.expenses.view',
                'reports.sales.view',
                'reports.purchases.view',
                'reports.export',
                'reports.print',
                'audit.logs.view',
            ],

            // Operations & Warehouses
            'Operations Manager'   => array_unique(array_merge($wmsManager, $purchaseCommon)),
            'Warehouse Manager'    => $wmsManager,
            'Inventory Manager'    => $wmsManager,
            'Procurement Manager'  => $purchaseCommon,
            'Purchase Manager'     => $purchaseCommon,
            'Warehouse Staff'      => array_merge($baseStaff, $wmsStaff),
            'Warehouse Operator'   => array_merge($baseStaff, $wmsStaff),

            // Sales & Marketing
            'Sales Manager'        => array_merge($baseStaff, $salesManager),
            'Sales'                => array_merge($baseStaff, $salesCommon),
            'Sales Executive'      => array_merge($baseStaff, $salesCommon),
            'Marketing Manager'    => array_merge($baseStaff, $marketingCommon),
            'Marketing'            => array_merge($baseStaff, $marketingCommon),
            'Marketing Executive'  => array_merge($baseStaff, $marketingCommon),

            // Human Resources
            'HR'                   => array_merge($baseStaff, $hrCommon),
            'HR Manager'           => array_merge($baseStaff, $hrCommon),
            'HR Executive'         => array_merge($baseStaff, $hrCommon),

            // IT & Support
            'IT Manager'           => array_unique(array_merge($baseStaff, $itSupportCommon)),
            'IT Support'           => array_merge($baseStaff, $itSupportCommon),
            'Technical Support'    => array_merge($baseStaff, $itSupportCommon),
            'Customer Support'     => array_merge($baseStaff, [
                'customers.view',
                'customers.ledger.view',
                'invoices.view',
                'invoices.print',
                'products.view',
                'view orders',
                'notifications.view',
            ]),

            // General Staff & Employees
            'User'                 => $baseStaff,
            'Employee'             => $baseStaff,
            'Staff'                => $baseStaff,
            'Supervisor'           => array_merge($baseStaff, ['products.view', 'wms.inventory.view']),
            'Team Lead'            => array_merge($baseStaff, ['products.view', 'wms.inventory.view']),
            'Consultant'           => $baseStaff,
            'Contractor'           => $baseStaff,
            'Intern'               => $baseStaff,
            'Trainee'              => $baseStaff,
        ];
    }
}
