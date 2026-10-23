<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\Permission;
use App\Models\Product;
use App\Models\ProductWarehouseStock;
use App\Models\ProductPurchasePriceHistory;
use App\Models\PurchaseInvoice;
use App\Models\PurchaseInvoiceItem;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use App\Models\Warehouse;
use Database\Seeders\CanonicalPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PurchasePricePermissionTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Branch $branch;
    private Warehouse $warehouse;
    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(CanonicalPermissionsSeeder::class);

        $this->company = Company::create(['name' => 'Acme Corp', 'active' => true]);
        $this->branch = Branch::create(['company_id' => $this->company->id, 'name' => 'HQ', 'active' => true]);
        $this->warehouse = Warehouse::create([
            'company_id' => $this->company->id,
            'branch_id' => $this->branch->id,
            'name' => 'Main Warehouse',
            'code' => 'WH-01',
            'active' => true,
        ]);

        $this->product = Product::create([
            'company_id' => $this->company->id,
            'branch_id' => $this->branch->id,
            'name' => 'Industrial Widget',
            'sku' => 'WIDGET-001',
            'purchase_price' => 250.75,
            'sale_price' => 450.00,
            'stock_quantity' => 100,
            'active' => true,
        ]);

        ProductWarehouseStock::create([
            'product_id' => $this->product->id,
            'warehouse_id' => $this->warehouse->id,
            'quantity' => 100,
            'reserved_quantity' => 10,
            'available_quantity' => 90,
            'average_cost' => 245.50,
            'last_purchase_price' => 250.75,
        ]);

        $supplier = Supplier::create([
            'name' => 'Global Supplier',
            'email' => 'supplier@example.test',
            'active' => true,
        ]);

        ProductPurchasePriceHistory::create([
            'product_id' => $this->product->id,
            'supplier_id' => $supplier->id,
            'quantity' => 10,
            'unit_price' => 250.75,
            'purchase_date' => now()->toDateString(),
        ]);
    }

    public function test_user_without_purchase_price_permission_receives_null_purchase_price_in_list_and_details(): void
    {
        $role = Role::create(['name' => 'Catalog Viewer']);
        $role->givePermissionTo(['products.view']);

        $user = User::create([
            'name' => 'Restricted Staff',
            'email' => 'staff@example.test',
            'password' => 'password',
        ]);
        $user->roles()->attach($role->id);

        Sanctum::actingAs($user);

        // 1. List
        $response = $this->getJson('/api/products');
        $response->assertOk();
        $this->assertNull($response->json('data.0.purchase_price'));

        // 2. Details
        $detailRes = $this->getJson("/api/products/{$this->product->id}");
        $detailRes->assertOk();
        $this->assertNull($detailRes->json('purchase_price'));

        // 3. Price List
        $priceListRes = $this->getJson("/api/products/{$this->product->id}/price-list");
        $priceListRes->assertOk();
        $this->assertNull($priceListRes->json('data.purchase_price'));
        $this->assertEquals(450.00, (float) $priceListRes->json('data.sale_price'));
    }

    public function test_user_with_purchase_price_permission_receives_real_purchase_price(): void
    {
        $role = Role::create(['name' => 'Procurement Officer']);
        $role->givePermissionTo(['products.view', 'products.purchase_price.view']);

        $user = User::create([
            'name' => 'Authorized Buyer',
            'email' => 'buyer@example.test',
            'password' => 'password',
        ]);
        $user->roles()->attach($role->id);

        Sanctum::actingAs($user);

        // 1. List
        $response = $this->getJson('/api/products');
        $response->assertOk();
        $this->assertEquals(250.75, (float) $response->json('data.0.purchase_price'));

        // 2. Details
        $detailRes = $this->getJson("/api/products/{$this->product->id}");
        $detailRes->assertOk();
        $this->assertEquals(250.75, (float) $detailRes->json('purchase_price'));

        // 3. Price List
        $priceListRes = $this->getJson("/api/products/{$this->product->id}/price-list");
        $priceListRes->assertOk();
        $this->assertEquals(250.75, (float) $priceListRes->json('data.purchase_price'));
    }

    public function test_legacy_alias_grants_access_to_purchase_price(): void
    {
        $role = Role::create(['name' => 'Legacy Viewer']);
        // Grant legacy space alias
        $role->givePermissionTo(['view products', 'view purchase price']);

        $user = User::create([
            'name' => 'Legacy User',
            'email' => 'legacy@example.test',
            'password' => 'password',
        ]);
        $user->roles()->attach($role->id);

        Sanctum::actingAs($user);

        $detailRes = $this->getJson("/api/products/{$this->product->id}");
        $detailRes->assertOk();
        $this->assertEquals(250.75, (float) $detailRes->json('purchase_price'));
    }

    public function test_warehouse_stock_and_inventory_summary_hide_cost_without_permission(): void
    {
        $role = Role::create(['name' => 'Warehouse Worker']);
        $role->givePermissionTo(['products.view']);

        $user = User::create([
            'name' => 'Warehouse Worker',
            'email' => 'worker@example.test',
            'password' => 'password',
        ]);
        $user->roles()->attach($role->id);

        Sanctum::actingAs($user);

        // Warehouse Stock endpoint
        $whRes = $this->getJson("/api/products/{$this->product->id}/warehouse-stock");
        $whRes->assertOk();
        $this->assertEquals(100, $whRes->json('data.0.quantity'));
        $this->assertNull($whRes->json('data.0.average_cost'));
        $this->assertNull($whRes->json('data.0.last_purchase_price'));

        // Inventory Summary endpoint
        $summaryRes = $this->getJson("/api/products/{$this->product->id}/inventory-summary");
        $summaryRes->assertOk();
        $this->assertEquals(100, $summaryRes->json('data.total_stock'));
        $this->assertNull($summaryRes->json('data.last_purchase_price'));
        $this->assertNull($summaryRes->json('data.average_purchase_price'));
    }

    public function test_purchase_price_history_endpoint_forbidden_without_permission(): void
    {
        $role = Role::create(['name' => 'Regular Viewer']);
        $role->givePermissionTo(['products.view']);

        $user = User::create([
            'name' => 'Unprivileged User',
            'email' => 'unprivileged@example.test',
            'password' => 'password',
        ]);
        $user->roles()->attach($role->id);

        Sanctum::actingAs($user);

        $this->getJson("/api/products/{$this->product->id}/purchase-price-history")->assertForbidden();

        // Grant permission and retry
        $role->givePermissionTo(['products.purchase_price.view']);
        $user->flushPermissionCache();

        $this->getJson("/api/products/{$this->product->id}/purchase-price-history")->assertOk();
    }

    public function test_export_masks_purchase_price_without_permission(): void
    {
        $role = Role::create(['name' => 'Sales Person']);
        $role->givePermissionTo(['products.view', 'export inventory']);

        $user = User::create([
            'name' => 'Sales Person',
            'email' => 'sales@example.test',
            'password' => 'password',
        ]);
        $user->roles()->attach($role->id);

        Sanctum::actingAs($user);

        $response = $this->get("/api/inventory/export");
        $response->assertOk();
        $csvContent = $response->getContent();

        $this->assertStringContainsString('***', $csvContent);
        $this->assertStringNotContainsString('250.75', $csvContent);

        // Now with permission
        $role->givePermissionTo(['products.purchase_price.view']);
        $user->flushPermissionCache();

        $authorizedResponse = $this->get("/api/inventory/export");
        $authorizedResponse->assertOk();
        $this->assertStringContainsString('250.75', $authorizedResponse->getContent());
    }

    public function test_canonical_permissions_seeder_executes_idempotently_and_assigns_roles(): void
    {
        $purchaseManagerRole = Role::where('name', 'Purchase Manager')->firstOrFail();
        $this->assertTrue($purchaseManagerRole->hasPermission('products.purchase_price.view'));
        $this->assertTrue($purchaseManagerRole->hasPermission('purchases.view'));

        $salesRole = Role::where('name', 'Sales Executive')->firstOrFail();
        $this->assertTrue($salesRole->hasPermission('products.view'));
        $this->assertFalse($salesRole->hasPermission('products.purchase_price.view'));

        $adminRole = Role::where('name', 'Admin')->firstOrFail();
        $this->assertTrue($adminRole->hasPermission('products.purchase_price.view'));
    }

    public function test_product_transactions_shows_sales_and_masks_purchase_without_permission(): void
    {
        $customer = Customer::create([
            'company_id' => $this->company->id,
            'name' => 'Acme Buyer',
            'phone' => '9876543210',
        ]);
        $supplier = Supplier::create([
            'company_id' => $this->company->id,
            'name' => 'Global Supplier',
            'email' => 'sup@example.test',
        ]);

        $invoice = Invoice::create([
            'company_id' => $this->company->id,
            'branch_id' => $this->branch->id,
            'customer_id' => $customer->id,
            'invoice_no' => 'INV-2026-0001',
            'invoice_date' => now()->format('Y-m-d'),
            'total_amount' => 900.00,
        ]);
        InvoiceItem::create([
            'invoice_id' => $invoice->id,
            'product_id' => $this->product->id,
            'quantity' => 2,
            'unit_price' => 450.00,
            'tax_rate' => 0,
            'subtotal' => 900.00,
            'total' => 900.00,
        ]);

        $purchaseInvoice = PurchaseInvoice::create([
            'company_id' => $this->company->id,
            'branch_id' => $this->branch->id,
            'supplier_id' => $supplier->id,
            'bill_number' => 'BILL-2026-0099',
            'purchase_date' => now()->format('Y-m-d'),
            'subtotal' => 500.00,
            'grand_total' => 500.00,
        ]);
        PurchaseInvoiceItem::create([
            'purchase_invoice_id' => $purchaseInvoice->id,
            'product_id' => $this->product->id,
            'quantity' => 2,
            'purchase_price' => 250.00,
            'total' => 500.00,
        ]);

        $role = Role::create(['name' => 'Sales Clerk']);
        $role->givePermissionTo(['products.view']);

        $user = User::create([
            'name' => 'Sales Clerk',
            'email' => 'clerk@example.test',
            'password' => 'password',
        ]);
        $user->roles()->attach($role->id);

        Sanctum::actingAs($user);

        // Fetch transactions without purchase price permission
        $res = $this->getJson("/api/products/{$this->product->id}/transactions");
        $res->assertOk();
        $data = $res->json('data');
        $this->assertCount(2, $data);

        $saleTx = collect($data)->firstWhere('type', 'sale');
        $purchaseTx = collect($data)->firstWhere('type', 'purchase');

        $this->assertNotNull($saleTx);
        $this->assertEquals('INV-2026-0001', $saleTx['bill_number']);
        $this->assertEquals('Acme Buyer', $saleTx['party_name']);
        $this->assertEquals(450.00, $saleTx['unit_price']);
        $this->assertEquals(900.00, $saleTx['item_total']);

        $this->assertNotNull($purchaseTx);
        $this->assertEquals('BILL-2026-0099', $purchaseTx['bill_number']);
        $this->assertEquals('Global Supplier', $purchaseTx['party_name']);
        $this->assertNull($purchaseTx['unit_price']);
        $this->assertNull($purchaseTx['price_with_tax']);
        $this->assertNull($purchaseTx['item_net']);
        $this->assertNull($purchaseTx['item_total']);

        // Now grant purchase price permission
        $role->givePermissionTo(['products.purchase_price.view']);
        $user->flushPermissionCache();

        $authRes = $this->getJson("/api/products/{$this->product->id}/transactions");
        $authRes->assertOk();
        $authData = $authRes->json('data');
        $authPurchaseTx = collect($authData)->firstWhere('type', 'purchase');

        $this->assertEquals(250.00, $authPurchaseTx['unit_price']);
        $this->assertEquals(500.00, $authPurchaseTx['item_total']);

        // Test party-transactions grouping
        $partyRes = $this->getJson("/api/products/{$this->product->id}/party-transactions");
        $partyRes->assertOk();
        $partyData = $partyRes->json('data');
        $this->assertArrayHasKey('Acme Buyer', $partyData);
        $this->assertArrayHasKey('Global Supplier', $partyData);
    }
}
