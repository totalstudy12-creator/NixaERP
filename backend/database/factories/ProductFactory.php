<?php

namespace Database\Factories;

use App\Models\Product;
use App\Models\Company;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

class ProductFactory extends Factory
{
    protected $model = Product::class;

    public function definition(): array
    {
        $name = $this->faker->word() . ' ' . $this->faker->word();

        return [
            'company_id' => Company::factory(),
            'branch_id' => null,
            'name' => ucfirst($name),
            'sku' => strtoupper(Str::slug($name, '_') . '_' . $this->faker->unique()->numerify('###')),
            'barcode' => $this->faker->unique()->ean13(),
            'brand' => $this->faker->company(),
            'unit' => 'pcs',
            'purchase_price' => $this->faker->randomFloat(2, 10, 500),
            'sale_price' => $this->faker->randomFloat(2, 20, 700),
            'tax_rate' => $this->faker->randomFloat(2, 0, 18),
            'stock_quantity' => $this->faker->numberBetween(0, 200),
            'reorder_level' => $this->faker->numberBetween(0, 50),
            'description' => $this->faker->sentence(),
            'active' => true,
        ];
    }
}
