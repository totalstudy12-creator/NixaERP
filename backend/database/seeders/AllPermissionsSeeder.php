<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Permission;
use App\Models\Role;

class AllPermissionsSeeder extends Seeder
{
    /**
     * Run the database seeds.
     *
     * Idempotent — safe to run on every deploy.
     * Creates any missing permissions via firstOrCreate and grants every
     * permission to the Admin role.
     *
     * ════════════════════════════════════════════════════════════════════
     * NOTATION NOTES
     * ════════════════════════════════════════════════════════════════════
     * The codebase uses three permission notations:
     *
     *   • SPACE   "view employees"      → legacy pages (~120 keys)
     *   • COLON   "payroll:view"        → payroll / suppliers / profile pages
     *   • DOT     "settings.view"       → RBAC pages (Settings, Reports,
     *                                     Health, Warehouses, Marketing,
     *                                     POS, Media Library, Security, …)
     *
     * The frontend RBAC helpers normalise all three notations to the same
     * shape before comparing (see `normalisePermission()` in each page).
     * Every notation actually checked by the frontend is seeded here so no
     * permission gate can silently deny access. Once the codebase is
     * standardised on ONE notation, the redundant aliases can be removed
     * with a single SQL migration.
     *
     * ════════════════════════════════════════════════════════════════════
     *
     * @return void
     */
    public function run()
    {
        $permissions = [

            // =====================================================================
            // AUTH & PROFILE
            // =====================================================================
            'view profile',
            'edit profile',
            'profile:view',
            'profile:edit',
            'profile:change_password',

            // =====================================================================
            // COMPANIES
            // =====================================================================
            'view companies',
            'create companies',
            'edit companies',
            'delete companies',

            // =====================================================================
            // BRANCHES
            // =====================================================================
            'view branches',
            'create branches',
            'edit branches',
            'delete branches',

            // =====================================================================
            // WAREHOUSES  (space + dot aliases — WarehousesPage.tsx)
            // =====================================================================
            'view warehouses',
            'create warehouses',
            'edit warehouses',
            'delete warehouses',
            'export warehouses',
            'warehouses.view',
            'warehouses.create',
            'warehouses.update',
            'warehouses.delete',
            'warehouses.export',

            // =====================================================================
            // CUSTOMERS
            // =====================================================================
            'view customers',
            'create customers',
            'edit customers',
            'delete customers',
            'import customers',
            'export customers',
            'download customer template',
            'view customer ledger',
            'print customer ledger',
            'manage customer groups',
            'view customers top',
            'view new vs existing customer sales',

            // =====================================================================
            // PRODUCTS & INVENTORY
            // =====================================================================
            'view products',
            'create products',
            'edit products',
            'delete products',
            'import inventory',
            'export inventory',
            'download inventory template',
            'view low stock products',
            'manage inventory',
            'adjust stock',

            // =====================================================================
            // ORDERS
            // =====================================================================
            'view orders',
            'create orders',
            'edit orders',
            'delete orders',

            // =====================================================================
            // PAYMENTS
            // =====================================================================
            'view payments',
            'create payments',
            'edit payments',
            'delete payments',

            // =====================================================================
            // DEALERS
            // =====================================================================
            'view dealers',
            'create dealers',
            'edit dealers',
            'delete dealers',
            'export dealers',

            // =====================================================================
            // INVOICES
            // =====================================================================
            'view invoices',
            'create invoices',
            'edit invoices',
            'delete invoices',
            'export invoices',
            'print invoices',
            'duplicate invoice',
            'create invoice from order',

            'invoices.view',
            'invoices.create',
            'invoices.update',
            'invoices.delete',
            'invoices.export',
            'invoices.print',

            // =====================================================================
            // PURCHASE INVOICES
            // =====================================================================
            'view purchase invoices',
            'create purchase invoices',
            'edit purchase invoices',
            'delete purchase invoices',
            'add purchase invoice payment',
            'edit purchases',

            // =====================================================================
            // EMPLOYEES
            // =====================================================================
            'view employees',
            'create employees',
            'edit employees',
            'delete employees',
            'export employees',
            'view employee compensation',
            'view employee documents',
            'view sensitive employee data',
            'view attendance settings',

            // =====================================================================
            // SUPPLIERS  (space + colon aliases)
            // =====================================================================
            'view suppliers',
            'create suppliers',
            'edit suppliers',
            'delete suppliers',
            'suppliers:view',
            'suppliers:create',
            'suppliers:edit',
            'suppliers:delete',
            'suppliers:export',
            'suppliers:lookup_gst',
            'suppliers:manage_groups',

            // =====================================================================
            // ACCOUNTING
            // =====================================================================
            'view accounting summary',
            'view accounting accounts',
            'create accounting accounts',
            'edit accounting accounts',
            'delete accounting accounts',
            'view accounting journals',
            'create accounting journals',
            'view accounting statements',

            // =====================================================================
            // SALES
            // =====================================================================
            'view sales summary',
            'view sales orders',
            'create sales orders',
            'view sales quotations',
            'create sales quotations',
            'view sales proformas',
            'create sales proformas',
            'view sales delivery challans',
            'create sales delivery challans',
            'view sales returns',
            'create sales returns',
            'view sales reports',
            'manage sales target',

            // =====================================================================
            // SALES RETURNS  (space + dot aliases — SalesInvoiceReturnPage.tsx)
            // =====================================================================
            'sales.returns.view',
            'sales.returns.create',
            'sales.returns.update',
            'sales.returns.delete',
            'sales.returns.export',
            'sales.returns.confirm',

            // =====================================================================
            // PURCHASES  (legacy + landing gates)
            // =====================================================================
            'view purchase summary',
            'view purchase orders',
            'create purchase orders',
            'view purchase bills',
            'create purchase bills',
            'view purchase grn',
            'view purchase returns',
            'view purchase reports',
            'view purchases',
            'view purchases due',

            // =====================================================================
            // ATTENDANCE
            // =====================================================================
            'view attendance',
            'create attendance',
            'edit attendance',
            'delete attendance',
            'view today attendance summary',
            'view today employees attendance',
            'bulk update attendance',
            'bulk delete attendance',

            // =====================================================================
            // PAYROLL  (space + colon aliases)
            // =====================================================================
            'view payroll',
            'create payroll',
            'edit payroll',
            'delete payroll',
            'run payroll',
            'approve payroll',
            'generate payroll payslip',
            'view payroll advances',
            'create payroll advances',
            'edit payroll advances',
            'delete payroll advances',
            'view payroll leaves',
            'create payroll leaves',
            'edit payroll leaves',
            'delete payroll leaves',
            'view payroll shifts',
            'create payroll shifts',
            'edit payroll shifts',
            'delete payroll shifts',
            'view payroll loans',
            'create payroll loans',
            'edit payroll loans',
            'delete payroll loans',
            'view payroll payslips',
            'create payroll payslips',
            'edit payroll payslips',
            'delete payroll payslips',
            'payroll:view',
            'payroll:approve',
            'payroll:delete',
            'payroll:download',
            'payroll:edit',
            'payroll:generate',
            'payroll:mark_paid',
            'payroll:print',

            // HR & Payroll management page aliases (HrPayrollPage.tsx)
            'view hr',
            'edit shift settings',
            'view advances',
            'create advances',
            'delete advances',
            'approve advances',

            // =====================================================================
            // BIOMETRIC DEVICES
            // =====================================================================
            'view biometric devices',
            'register biometric device',
            'update biometric device',
            'delete biometric device',
            'sync biometric device',
            'update biometric device settings',
            'restart biometric device',
            'start device enrollment',
            'update enrollment status',
            'view pending enrollment',
            'view biometric scans',
            'view biometric offline pending',
            'view unknown fingers',
            'upload fingerprint templates',
            'download fingerprint templates',
            'delete fingerprint templates',

            // =====================================================================
            // FILE UPLOADS / MEDIA LIBRARY
            // (space + colon aliases, plus dot aliases — MediaLibraryPage.tsx)
            // =====================================================================
            'view uploads',
            'create uploads',
            'create upload folder',
            'delete upload',
            'delete uploads',
            'upload files',
            'view files',
            'download files',
            'delete files',

            // Colon aliases
            'files:view',
            'files:upload',
            'files:delete',
            'files:download',
            'files:create_folder',
            'files:copy_url',

            // Dot aliases (MediaLibraryPage.tsx)
            'files.view',
            'files.upload',
            'files.delete',
            'files.download',
            'files.create_folder',
            'files.copy_url',

            // =====================================================================
            // ROLES & PERMISSIONS
            // =====================================================================
            'view roles',
            'create roles',
            'edit roles',
            'delete roles',
            'view permissions',
            'create permissions',
            'edit permissions',
            'delete permissions',

            // =====================================================================
            // NOTIFICATIONS
            // =====================================================================
            'notifications.view',
            'notifications.manage',
            'notifications.send',
            'notifications.templates',
            'notifications.automation',
            'notifications.schedule',
            'notifications.queue',
            'notifications.delivery',
            'notifications.preferences',
            'notifications.providers',
            'notifications.whatsapp.view',
            'notifications.whatsapp.connect',
            'notifications.whatsapp.send',
            'notifications.whatsapp.logout',
            'notifications.whatsapp.test',

            // =====================================================================
            // INCOME & EXPENSES
            // =====================================================================
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

            // =====================================================================
            // USERS
            // =====================================================================
            'view users',
            'create users',
            'edit users',
            'delete users',
            'assign roles to user',

            // =====================================================================
            // SECURITY & CONTROLS (space + dot aliases — SecurityPage.tsx)
            // =====================================================================
            'view security',
            'security.view',
            'view security roles',
            'security.roles.view',
            'view security users',
            'security.users.view',
            'view security 2fa',
            'security.2fa.view',
            'view security logs',
            'security.logs.view',
            'view security sessions',
            'security.sessions.view',
            'view security approvals',
            'security.approvals.view',

            // =====================================================================
            // SETTINGS — space notation
            // =====================================================================
            'view settings',
            'create settings',
            'edit settings',
            'delete settings',
            'bulk update settings',
            'export settings',
            'import settings',
            'clear settings cache',
            'view settings quickstart',

            // Settings sub-panels (space notation)
            'view voice settings',
            'edit voice settings',
            'view printer settings',
            'edit printer settings',
            'view ai settings',
            'edit ai settings',
            'view api settings',
            'manage mcp tokens',
            'view security settings',

            // Settings — dot-notation aliases (SettingsPage.tsx)
            'settings.view',
            'settings.create',
            'settings.update',
            'settings.delete',
            'settings.voice.view',
            'settings.voice.update',
            'settings.printer.view',
            'settings.printer.update',
            'settings.ai.view',
            'settings.ai.update',
            'settings.api.view',
            'settings.mcp.manage',
            'settings.security.view',

            // =====================================================================
            // BACKUPS
            // =====================================================================
            'view backups',
            'create backup',
            'restore backup',
            'download backup',

            // =====================================================================
            // HEALTH MONITORING — space notation
            // =====================================================================
            'view health cron',
            'view health',
            'refresh health',
            'test health',
            'backup health',
            'resolve health alerts',
            'view health logs',
            'view health security',

            // Health Monitoring — dot-notation aliases (HealthMonitoringPage.tsx)
            'health.view',
            'health.refresh',
            'health.test',
            'health.backup',
            'health.alerts.resolve',
            'health.logs.view',
            'health.security.view',

            // =====================================================================
            // MARKETING (space + dot aliases — MarketingPage.tsx)
            // =====================================================================
            'view marketing dashboard',
            'view marketing accounts',
            'view marketing posts',
            'create marketing posts',
            'edit marketing posts',
            'delete marketing posts',
            'view marketing calendar',
            'view marketing analytics',
            'view marketing inbox',

            // Dot aliases
            'marketing.view',
            'marketing.dashboard.view',
            'marketing.posts.view',
            'marketing.posts.create',
            'marketing.posts.edit',
            'marketing.posts.delete',
            'marketing.posts.schedule',
            'marketing.posts.publish',
            'marketing.calendar.view',
            'marketing.inbox.view',
            'marketing.inbox.reply',
            'marketing.analytics.view',
            'marketing.accounts.view',
            'marketing.accounts.connect',
            'marketing.accounts.disconnect',

            // =====================================================================
            // POS / SALES (dot aliases — SalesPOSPage.tsx)
            // =====================================================================
            'pos.view',
            'pos.create_sale',
            'pos.hold_sale',
            'pos.resume_sale',
            'pos.apply_discount',
            'pos.email_receipt',
            'pos.view_history',
            // Space aliases
            'view pos',
            'create pos sale',
            'hold pos sale',
            'resume pos sale',
            'apply pos discount',
            'email pos receipt',
            'view pos history',

            // =====================================================================
            // AI
            // =====================================================================
            'view ai assistant insights',
            'chat with ai assistant',
            'use ai assistant',
            'view dashboard ai business health',
            'view dashboard ai forecast',
            'view dashboard ai generic analysis',
            'ask dashboard ai',
            'view ai providers',
            'create ai providers',
            'edit ai providers',

            // =====================================================================
            // DASHBOARD — top-level landing gates
            // =====================================================================
            'view dashboard',
            'view inventory',
            'view reports',
            'export dashboard',
            'export data',
            'view revenue',
            'view profit',
            'view financial reports',

            // =====================================================================
            // DASHBOARD — sub-permissions
            // =====================================================================
            'view dashboard analytics',
            'view dashboard payment summary',
            'view dashboard inventory summary',
            'view dashboard invoice count summary',
            'view dashboard invoice amount summary',
            'view dashboard business health',
            'view dashboard forecast',
            'view dashboard risks',
            'view dashboard anomalies',
            'view dashboard rankings',
            'view dashboard hero product',
            'view dashboard hero customer',
            'view dashboard district sales',
            'view dashboard profit',
            'view dashboard low stock',
            'view dashboard top customers',
            'view dashboard top vendors',
            'view dashboard purchase due',
            'view dashboard login activity',
            'view admin login activity',
            'view vendors top',

            // =====================================================================
            // REPORTS — space notation
            // =====================================================================
            'view reports top selling products',
            'view reports least selling products',
            'view reports dashboard',
            'view reports sales',
            'view reports purchases',
            'view reports accounts',
            'view reports inventory',
            'view reports gst',
            'view reports expenses',
            'export reports',
            'print reports',

            // Reports — dot-notation aliases (ReportsPage.tsx)
            'reports.view',
            'reports.dashboard.view',
            'reports.sales.view',
            'reports.purchases.view',
            'reports.accounts.view',
            'reports.inventory.view',
            'reports.gst.view',
            'reports.expenses.view',
            'reports.export',
            'reports.print',

            // =====================================================================
            // LOGIN LANDING ROUTE — dot-notation aliases (LoginPage.tsx)
            // =====================================================================
            'dashboard.view',
            'sales.view',
            'inventory.view',
        ];

        // Create permissions if they don't exist (idempotent).
        foreach ($permissions as $permissionName) {
            Permission::firstOrCreate(['name' => $permissionName]);
        }

        // Assign every permission to the Admin role.
        // givePermissionTo() is additive and will not strip existing grants.
        $adminRole = Role::where('name', 'Admin')->first();
        if ($adminRole) {
            $adminRole->givePermissionTo($permissions);
        }

        $managerRole = Role::where('name', 'Manager')->first();
        if ($managerRole) {
            $managerRole->givePermissionTo([
                'income_expenses.view',
                'income_expenses.create',
                'income_expenses.edit',
                'income_expenses.delete',
                'income_expenses.export',
                'income_expenses.manage_categories',
                'income_expenses.manage_accounts',
                'income_expenses.view_reports',
            ]);
        }
    }
}