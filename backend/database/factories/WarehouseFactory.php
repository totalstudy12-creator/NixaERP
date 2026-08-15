<?php

namespace Database\Factories;

use App\Models\Warehouse;
use App\Models\Branch;
use Illuminate\Database\Eloquent\Factories\Factory;

class WarehouseFactory extends Factory
{
    protected $model = Warehouse::class;

    public function definition(): array
    {
        return [
            'company_id' => Branch::factory()->create()->company_id,
            'branch_id' => Branch::factory(),
            'name' => $this->faker->company() . ' Warehouse',
            'code' => strtoupper($this->faker->bothify('WH-####')),
            'location' => $this->faker->address(),
            'active' => true,
        ];
    }
}
