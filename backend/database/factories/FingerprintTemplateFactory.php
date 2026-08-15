<?php

namespace Database\Factories;

use App\Models\FingerprintTemplate;
use App\Models\Employee;
use Illuminate\Database\Eloquent\Factories\Factory;

class FingerprintTemplateFactory extends Factory
{
    protected $model = FingerprintTemplate::class;

    public function definition(): array
    {
        return [
            'employee_id' => Employee::factory(),
            'finger_index' => $this->faker->numberBetween(0, 9),
            'template_data' => $this->faker->randomHtml(2, 3),
            'template_format' => 'raw',
            'size_bytes' => $this->faker->numberBetween(200, 800),
        ];
    }
}