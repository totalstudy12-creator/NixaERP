<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Company;
use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use App\Models\Warehouse;
use App\Models\ProductWarehouseStock;
use Database\Seeders\CanonicalPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ProductBulkEditApiTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Company $company;
    private Warehouse $warehouse;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(CanonicalPermissionsSeeder::class);

        $this->company = Company::create([
            'name' => 'Test Corp',
            'email' => 'test@corp.com',
            'active' => true,
        ]);

        $branch = Branch::create([
            'company_id' => $this->company->id,
            'name' => 'Main Branch',
            'active' => true,
        ]);

        $this->warehouse = Warehouse::create([
            'name' => 'Main Warehouse',
            'company_id' => $this->company->id,
            'branch_id' => $branch->id,
            'is_active' => true,
        ]);

        $role = Role::firstOrCreate(['name' => 'Inventory Manager']);
        $role->givePermissionTo(['products.view', 'products.edit', 'products.purchase_price.view', 'products.purchase_price.edit']);

        $this->user = User::factory()->create([
            'company_id' => $this->company->id,
            'branch_id' => $branch->id,
        ]);
        $this->user->roles()->attach($role);
    }

    public function test_bulk_edit_requires_authentication(): void
    {
        $response = $this->postJson('/api/products/bulk-edit', [
            'product_ids' => [1, 2],
        ]);

        $response->assertStatus(401);
    }

    public function test_bulk_edit_updates_sale_prices_and_quantities(): void
    {
        $product1 = Product::create([
            'company_id' => $this->company->id,
            'name' => 'Widget A',
            'sku' => 'WID-A-01',
            'barcode' => '8901111111111',
            'sale_price' => 100.00,
            'purchase_price' => 60.00,
            'stock_quantity' => 10,
            'unit' => 'Piece',
            'active' => true,
        ]);

        $product2 = Product::create([
            'company_id' => $this->company->id,
            'name' => 'Widget B',
            'sku' => 'WID-B-02',
            'barcode' => '8902222222222',
            'sale_price' => 200.00,
            'purchase_price' => 120.00,
            'stock_quantity' => 20,
            'unit' => 'Piece',
            'active' => true,
        ]);

        ProductWarehouseStock::create([
            'product_id' => $product1->id,
            'warehouse_id' => $this->warehouse->id,
            'company_id' => $this->company->id,
            'quantity' => 10,
            'available_quantity' => 10,
            'reserved_quantity' => 0,
        ]);

        ProductWarehouseStock::create([
            'product_id' => $product2->id,
            'warehouse_id' => $this->warehouse->id,
            'company_id' => $this->company->id,
            'quantity' => 20,
            'available_quantity' => 20,
            'reserved_quantity' => 0,
        ]);

        Sanctum::actingAs($this->user);

        // Increase sale price by 10% and add 5 units of stock
        $response = $this->postJson('/api/products/bulk-edit', [
            'product_ids' => [$product1->id, $product2->id],
            'sale_price_action' => 'increase_percent',
            'sale_price_value' => 10,
            'stock_quantity_action' => 'add',
            'stock_quantity_value' => 5,
            'remark' => 'Test bulk adjustment',
        ]);

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
                'updated_count' => 2,
            ]);

        $product1->refresh();
        $product2->refresh();

        // 100 + 10% = 110
        $this->assertEquals(110.00, (float) $product1->sale_price);
        // 200 + 10% = 220
        $this->assertEquals(220.00, (float) $product2->sale_price);

        // 10 + 5 = 15
        $this->assertEquals(15, (float) $product1->stock_quantity);
        // 20 + 5 = 25
        $this->assertEquals(25, (float) $product2->stock_quantity);

        $this->assertDatabaseHas('stock_movements', [
            'product_id' => $product1->id,
            'transaction_type' => 'IN',
            'quantity' => 5,
            'remark' => 'Test bulk adjustment',
        ]);
    }

    public function test_bulk_edit_can_auto_generate_unique_sku_and_barcode(): void
    {
        $product = Product::create([
            'company_id' => $this->company->id,
            'name' => 'Premium Headphone',
            'sku' => 'TEMP-SKU-99',
            'barcode' => '8909999999999',
            'sale_price' => 500,
            'active' => true,
        ]);

        Sanctum::actingAs($this->user);

        $response = $this->postJson('/api/products/bulk-edit', [
            'product_ids' => [$product->id],
            'auto_generate_sku' => true,
            'auto_generate_barcode' => true,
            'auto_generate_qr' => true,
        ]);

        $response->assertStatus(200);

        $product->refresh();
        $this->assertNotEquals('TEMP-SKU-99', $product->sku);
        $this->assertNotEquals('8909999999999', $product->barcode);
        $this->assertStringContainsString('NIXA-PRD-', (string) $product->qr_code);
    }
}
