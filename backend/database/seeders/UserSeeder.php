<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\User;
use App\Models\Role;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    /**
     * Run the database seeds.
     *
     * @return void
     */
    public function run()
    {
        $defaultPassword = env('SEED_USER_PASSWORD', 'ChangeMe123!');

        // Define users per role (name, email)
        $users = [
            'Admin' => [
                ['name' => 'System Administrator', 'email' => env('ADMIN_EMAIL', 'admin@example.com')],
            ],
            'User' => [
                ['name' => 'Default User', 'email' => 'user@example.com'],
            ],
            'Manager' => [
                ['name' => 'General Manager', 'email' => 'manager@example.com'],
            ],
            'Senior Manager' => [
                ['name' => 'Senior Manager', 'email' => 'seniormanager@example.com'],
            ],
            'Area Manager' => [
                ['name' => 'Area Manager', 'email' => 'areamanager@example.com'],
            ],
            'Regional Manager' => [
                ['name' => 'Regional Manager', 'email' => 'regionalmanager@example.com'],
            ],
            'Director' => [
                ['name' => 'Director', 'email' => 'director@example.com'],
            ],
            'CEO' => [
                ['name' => 'Chief Executive Officer', 'email' => 'ceo@example.com'],
            ],
            'CFO' => [
                ['name' => 'Chief Financial Officer', 'email' => 'cfo@example.com'],
            ],
            'COO' => [
                ['name' => 'Chief Operating Officer', 'email' => 'coo@example.com'],
            ],
            'HR' => [
                ['name' => 'Human Resources', 'email' => 'hr@example.com'],
            ],
            'HR Manager' => [
                ['name' => 'HR Manager', 'email' => 'hrmanager@example.com'],
            ],
            'HR Executive' => [
                ['name' => 'HR Executive', 'email' => 'hrexecutive@example.com'],
            ],
            'CA' => [
                ['name' => 'Chartered Accountant', 'email' => 'ca@example.com'],
            ],
            'Accountant' => [
                ['name' => 'Accountant', 'email' => 'accountant@example.com'],
            ],
            'Finance Manager' => [
                ['name' => 'Finance Manager', 'email' => 'financemanager@example.com'],
            ],
            'Accounts Executive' => [
                ['name' => 'Accounts Executive', 'email' => 'accountsexecutive@example.com'],
            ],
            'Auditor' => [
                ['name' => 'Auditor', 'email' => 'auditor@example.com'],
            ],
            'Sales' => [
                ['name' => 'Sales Representative', 'email' => 'sales@example.com'],
            ],
            'Sales Manager' => [
                ['name' => 'Sales Manager', 'email' => 'salesmanager@example.com'],
            ],
            'Sales Executive' => [
                ['name' => 'Sales Executive', 'email' => 'salesexecutive@example.com'],
            ],
            'Marketing' => [
                ['name' => 'Marketing Executive', 'email' => 'marketing@example.com'],
            ],
            'Marketing Manager' => [
                ['name' => 'Marketing Manager', 'email' => 'marketingmanager@example.com'],
            ],
            'Marketing Executive' => [
                ['name' => 'Marketing Executive', 'email' => 'marketingexecutive@example.com'],
            ],
            'Operations Manager' => [
                ['name' => 'Operations Manager', 'email' => 'operationsmanager@example.com'],
            ],
            'Warehouse Manager' => [
                ['name' => 'Warehouse Manager', 'email' => 'warehousemanager@example.com'],
            ],
            'Warehouse Staff' => [
                ['name' => 'Warehouse Staff', 'email' => 'warehousestaff@example.com'],
            ],
            'Procurement Manager' => [
                ['name' => 'Procurement Manager', 'email' => 'procurementmanager@example.com'],
            ],
            'Purchase Manager' => [
                ['name' => 'Purchase Manager', 'email' => 'purchasemanager@example.com'],
            ],
            'Inventory Manager' => [
                ['name' => 'Inventory Manager', 'email' => 'inventorymanager@example.com'],
            ],
            'Employee' => [
                ['name' => 'Regular Employee', 'email' => 'employee@example.com'],
            ],
            'Staff' => [
                ['name' => 'Staff Member', 'email' => 'staff@example.com'],
            ],
            'Supervisor' => [
                ['name' => 'Supervisor', 'email' => 'supervisor@example.com'],
            ],
            'Team Lead' => [
                ['name' => 'Team Lead', 'email' => 'teamlead@example.com'],
            ],
            'IT Manager' => [
                ['name' => 'IT Manager', 'email' => 'itmanager@example.com'],
            ],
            'IT Support' => [
                ['name' => 'IT Support', 'email' => 'itsupport@example.com'],
            ],
            'Customer Support' => [
                ['name' => 'Customer Support', 'email' => 'customersupport@example.com'],
            ],
            'Technical Support' => [
                ['name' => 'Technical Support', 'email' => 'technicalsupport@example.com'],
            ],
            'Consultant' => [
                ['name' => 'Consultant', 'email' => 'consultant@example.com'],
            ],
            'Contractor' => [
                ['name' => 'Contractor', 'email' => 'contractor@example.com'],
            ],
            'Intern' => [
                ['name' => 'Intern', 'email' => 'intern@example.com'],
            ],
            'Trainee' => [
                ['name' => 'Trainee', 'email' => 'trainee@example.com'],
            ],
        ];

        foreach ($users as $roleName => $userList) {
            $role = Role::where('name', $roleName)->first();
            if (!$role) {
                $this->command->warn("Role '{$roleName}' not found. Skipping users.");
                continue;
            }

            foreach ($userList as $userData) {
                $user = User::firstOrCreate(
                    ['email' => $userData['email']],
                    [
                        'name' => $userData['name'],
                        'password' => Hash::make($defaultPassword),
                    ]
                );

                // Attach role if not already attached
                if (!$user->roles()->where('role_id', $role->id)->exists()) {
                    $user->roles()->attach($role->id);
                }
            }
        }

        $this->command->info('Production users seeded successfully.');
        $this->command->info("Default password for all users: {$defaultPassword}");
        $this->command->warn('IMPORTANT: Change these passwords immediately in production!');
    }
}