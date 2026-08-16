<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\User;
use App\Models\Role;
use Faker\Factory as Faker;

class UserSeeder extends Seeder
{
    /**
     * Run the database seeds.
     *
     * @return void
     */
    public function run()
    {
        $faker = Faker::create('en_IN');

        // Create Admin User
        $admin = User::firstOrCreate(
            ['email' => 'test@example.com'],
            [
                'name' => 'Admin User',
                'password' => bcrypt('password'),
            ]
        );
        $adminRole = Role::where('name', 'Admin')->first();
        if ($adminRole) {
            $admin->roles()->attach($adminRole->id);
        }

        // Create Regular Users
        for ($i = 0; $i < 5; $i++) {
            $user = User::create([
                'name' => $faker->name,
                'email' => $faker->unique()->safeEmail,
                'password' => bcrypt('password'),
            ]);
            $userRole = Role::where('name', 'User')->first();
            if ($userRole) {
                $user->roles()->attach($userRole->id);
            }
        }
    }
}
