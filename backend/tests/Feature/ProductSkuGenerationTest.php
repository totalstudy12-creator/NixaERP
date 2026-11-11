<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProductSkuGenerationTest extends TestCase
{
    use RefreshDatabase;
    use InteractsWithPermissions;

    public function test_can_generate_unique_sku_via_api(): void
    {
        $company = Company::create([
            'name'   => 'SKU Test Corp',
            'code'   => 'STC',
            'status' => 'active',
        ]);

        $user = User::factory()->create([
            'company_id' => $company->id,
        ]);

        $response = $this->actingAsWithPermissions($user, ['view products', 'create products'])
            ->getJson('/api/products/generate-sku?name=Laptop Pro');
        $response->assertOk();
        $response->assertJsonStructure(['success', 'sku']);
        $this->assertStringStartsWith('PRD-LAPPRO-', $response->json('sku'));
    }

    public function test_product_store_auto_generates_sku_if_empty(): void
    {
        $company = Company::create([
            'name'   => 'SKU Test Corp 2',
            'code'   => 'STC2',
            'status' => 'active',
        ]);

        $user = User::factory()->create([
            'company_id' => $company->id,
        ]);

        $response = $this->actingAsWithPermissions($user, ['create products', 'view products'])
            ->postJson('/api/products', [
                'company_id'     => $company->id,
                'name'           => 'Wireless Mouse Deluxe',
                'sku'            => '', // blank SKU
                'unit'           => 'Piece',
                'purchase_price' => 500,
                'sale_price'     => 750,
                'tax_rate'       => 18,
                'stock_quantity' => 10,
            ]);

        $response->assertOk();
        $createdSku = $response->json('sku');
        $this->assertNotEmpty($createdSku);
        $this->assertStringStartsWith('PRD-WIRMOUDEL-', $createdSku);
    }
}
