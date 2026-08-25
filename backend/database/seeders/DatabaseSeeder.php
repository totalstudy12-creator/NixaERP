<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     *
     * @return void
     */
    // database/seeders/DatabaseSeeder.php
    public function run()
    {
        $this->call([
            RoleSeeder::class,
            UserSeeder::class,
            AllPermissionsSeeder::class,
        ]);
    }
}
