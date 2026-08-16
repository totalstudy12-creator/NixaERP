<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Company;
use App\Models\Branch;

class CompanySeeder extends Seeder
{
    public function run(): void
    {
        $company = Company::factory()->create();

        // Create a default branch for the company
        Branch::factory()->create([
            'company_id' => $company->id,
        ]);
    }
}
