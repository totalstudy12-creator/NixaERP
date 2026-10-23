<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class AllPermissionsSeeder extends Seeder
{
    /**
     * Run the database seeds.
     *
     * Delegates directly to CanonicalPermissionsSeeder to maintain a single source
     * of truth across migrations, tests, and command-line execution.
     */
    public function run(): void
    {
        $this->call(CanonicalPermissionsSeeder::class);
    }
}
