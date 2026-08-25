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
     * @return void
     */
    public function run()
    {
        $permissions = [
            // ===================== AUTH & PROFILE =====================
            'view profile',
            'edit profile',

            // ===================== COMPANIES =====================
            'view companies',
            'create companies',
            'edit companies',
            'delete companies',

            // ===================== BRANCHES =====================
            'view branches',
            'create branches',
            'edit branches',
            'delete branches',

            // ===================== WAREHOUSES =====================
            'view warehouses',
            'create warehouses',
            'edit warehouses',
            'delete warehouses',

            // ===================== CUSTOMERS =====================
            'view customers',
            'create customers',
            'edit customers',
            'delete customers',
            'import customers',
            'download customer template',

            // ===================== PRODUCTS =====================
            'view products',
            'create products',
            'edit products',
            'delete products',
            'import inventory',
            'export inventory',
            'download inventory template',
            'view low stock products',

            // ===================== ORDERS =====================
            'view orders',
            'create orders',
            'edit orders',
            'delete orders',

            // ===================== PAYMENTS =====================
            'view payments',
            'create payments',
            'edit payments',
            'delete payments',

            // ===================== DEALERS =====================
            'view dealers',
            'create dealers',
            'edit dealers',
            'delete dealers',

            // ===================== INVOICES =====================
            'view invoices',
            'create invoices',
            'edit invoices',
            'delete invoices',
            'duplicate invoice',
            'create invoice from order',

            // ===================== PURCHASE INVOICES =====================
            'view purchase invoices',
            'create purchase invoices',
            'edit purchase invoices',
            'delete purchase invoices',
            'add purchase invoice payment',

            // ===================== EMPLOYEES =====================
            'view employees',
            'create employees',
            'edit employees',
            'delete employees',

            // ===================== SUPPLIERS =====================
            'view suppliers',
            'create suppliers',
            'edit suppliers',
            'delete suppliers',

            // ===================== ACCOUNTING =====================
            'view accounting summary',
            'view accounting accounts',
            'create accounting accounts',
            'edit accounting accounts',
            'delete accounting accounts',
            'view accounting journals',
            'create accounting journals',
            'view accounting statements',

            // ===================== SALES =====================
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

            // ===================== PURCHASES (LEGACY) =====================
            'view purchase summary',
            'view purchase orders',
            'create purchase orders',
            'view purchase bills',
            'create purchase bills',
            'view purchase grn',
            'view purchase returns',
            'view purchase reports',

            // ===================== ATTENDANCE =====================
            'view attendance',
            'create attendance',
            'edit attendance',
            'delete attendance',
            'view today attendance summary',
            'view today employees attendance',
            'bulk update attendance',
            'bulk delete attendance',

            // ===================== PAYROLL =====================
            'view payroll',
            'create payroll',
            'edit payroll',
            'delete payroll',
            'run payroll',
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

            // ===================== BIOMETRIC DEVICES =====================
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

            // ===================== FILE UPLOADS =====================
            'view uploads',
            'create uploads',
            'create upload folder',
            'delete upload',

            // ===================== ROLES & PERMISSIONS =====================
            'view roles',
            'create roles',
            'edit roles',
            'delete roles',
            'view permissions',
            'create permissions',

            // ===================== USERS =====================
            'view users',
            'create users',
            'edit users',
            'delete users',
            'assign roles to user',

            // ===================== SETTINGS =====================
            'view settings',
            'create settings',
            'edit settings',
            'delete settings',
            'bulk update settings',
            'export settings',
            'import settings',
            'clear settings cache',
            'view settings quickstart',

            // ===================== BACKUPS & HEALTH =====================
            'view health cron',
            'view backups',
            'create backup',
            'restore backup',
            'download backup',

            // ===================== MARKETING =====================
            'view marketing dashboard',
            'view marketing accounts',
            'view marketing posts',
            'create marketing posts',
            'edit marketing posts',
            'delete marketing posts',
            'view marketing calendar',
            'view marketing analytics',
            'view marketing inbox',

            // ===================== AI =====================
            'view ai assistant insights',
            'chat with ai assistant',
            'view dashboard ai business health',
            'view dashboard ai forecast',
            'view dashboard ai generic analysis',
            'ask dashboard ai',
            'view ai providers',
            'create ai providers',
            'edit ai providers',

            // ===================== DASHBOARD & REPORTS =====================
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
            'view reports top selling products',
            'view reports least selling products',
            'view dashboard low stock',
            'view dashboard top customers',
            'view customers top',
            'view dashboard top vendors',
            'view vendors top',
            'view dashboard purchase due',
            'view purchases due',
            'view dashboard login activity',
            'view admin login activity',
            'view new vs existing customer sales',
        ];

        // Create permissions if they don't exist
        foreach ($permissions as $permissionName) {
            Permission::firstOrCreate(['name' => $permissionName]);
        }

        // Assign all permissions to the Admin role
        $adminRole = Role::where('name', 'Admin')->first();
        if ($adminRole) {
            $adminRole->givePermissionTo($permissions);
        }
    }
}