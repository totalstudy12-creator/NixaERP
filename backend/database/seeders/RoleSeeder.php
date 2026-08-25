<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Role;

class RoleSeeder extends Seeder
{
    /**
     * Run the database seeds.
     *
     * @return void
     */
    public function run()
    {
        $roles = [
            // Core roles
            'Admin',
            'User',

            // Management
            'Manager',
            'Senior Manager',
            'Area Manager',
            'Regional Manager',
            'General Manager',
            'Director',
            'CEO',
            'CFO',
            'COO',

            // Human Resources
            'HR',
            'HR Manager',
            'HR Executive',

            // Finance & Accounts
            'CA',              // Chartered Accountant
            'Accountant',
            'Finance Manager',
            'Accounts Executive',
            'Auditor',

            // Sales & Marketing
            'Sales',
            'Sales Manager',
            'Sales Executive',
            'Marketing',
            'Marketing Manager',
            'Marketing Executive',

            // Operations & Logistics
            'Operations Manager',
            'Warehouse Manager',
            'Warehouse Staff',
            'Procurement Manager',
            'Purchase Manager',
            'Inventory Manager',

            // General Staff
            'Employee',
            'Staff',
            'Supervisor',
            'Team Lead',

            // IT & Support
            'IT Manager',
            'IT Support',
            'Customer Support',
            'Technical Support',

            // Other
            'Consultant',
            'Contractor',
            'Intern',
            'Trainee',
        ];

        foreach ($roles as $roleName) {
            Role::firstOrCreate(['name' => $roleName]);
        }
    }
}