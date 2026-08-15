<?php

namespace Database\Factories;

use App\Models\Customer;
use App\Models\Company;
use Illuminate\Database\Eloquent\Factories\Factory;

class CustomerFactory extends Factory
{
    protected $model = Customer::class;

    public function definition(): array
    {
        return [
            'company_id' => Company::factory(),
            'branch_id' => null,
            'name' => $this->faker->name(),
            'email' => $this->faker->unique()->safeEmail(),
            'phone' => $this->faker->phoneNumber(),
            'gst_number' => strtoupper($this->faker->bothify('??##########?')),
            'billing_address' => $this->faker->address(),
            'shipping_address' => $this->faker->address(),
            'status' => 'active',
        ];
    }
}
