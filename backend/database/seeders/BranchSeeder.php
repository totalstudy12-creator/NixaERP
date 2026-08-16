<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Branch;
use App\Models\Company;

class BranchSeeder extends Seeder
{
    public function run(): void
    {
        $company = Company::first();
        if (! $company) {
            $company = Company::factory()->create();
        }

        Branch::firstOrCreate([
            'company_id' => $company->id,
            'name' => 'Main Branch',
        ], [
            'code' => 'MAIN',
            'address' => 'Head Office',
            'phone' => '',
            'email' => '',
            'active' => true,
        ]);
    }
}
