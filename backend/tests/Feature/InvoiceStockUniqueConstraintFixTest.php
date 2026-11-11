<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\Payment;
use App\Models\Product;
use App\Models\ProductWarehouseStock;
use App\Models\PurchaseInvoice;
use App\Models\PurchaseInvoiceItem;
use App\Models\Supplier;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class InvoiceStockUniqueConstraintFixTest extends TestCase
{
    use RefreshDatabase;
    use InteractsWithPermissions;

    public function test_invoice_delete_does_not_fail_with_duplicate_entry_when_stock_record_exists_with_different_branch(): void
    {
        $company = Company::create([
            'name'   => 'Test Corp',
            'code'   => 'TC',
            'email'  => 'corp@test.com',
            'phone'  => '9999999999',
            'active' => true,
        ]);

        $branch4 = Branch::create([
            'company_id' => $company->id,
            'name'       => 'Branch 4',
            'code'       => 'B4',
            'active'     => true,
        ]);

        $warehouse = Warehouse::create([
            'company_id' => $company->id,
            'branch_id'  => $branch4->id,
            'name'       => 'Main Warehouse',
            'code'       => 'MWH',
            'active'     => true,
        ]);

        $product = Product::create([
            'company_id'     => $company->id,
            'branch_id'      => $branch4->id,
            'name'           => 'Product 238',
            'sku'            => 'SKU-238',
            'purchase_price' => 100.00,
            'sale_price'     => 150.00,
            'stock_quantity' => 10,
            'active'         => true,
        ]);

        // Pre-existing product warehouse stock with null branch_id in DB (reproducing production state)
        ProductWarehouseStock::create([
            'product_id'         => $product->id,
            'warehouse_id'       => $warehouse->id,
            'company_id'         => $company->id,
            'branch_id'          => null, // branch is null in DB
            'quantity'           => 10,
            'reserved_quantity'  => 0,
            'available_quantity' => 10,
            'average_cost'       => 100.00,
        ]);

        $customer = Customer::create([
            'company_id' => $company->id,
            'branch_id'  => $branch4->id,
            'name'       => 'Test Customer',
            'phone'      => '1234567890',
            'status'     => 'active',
        ]);

        // Invoice created with branch 4
        $invoice = Invoice::create([
            'company_id'      => $company->id,
            'branch_id'       => $branch4->id,
            'customer_id'     => $customer->id,
            'invoice_no'      => 'INV-2026-3008',
            'invoice_date'    => '2026-11-04',
            'total_amount'    => 7500.00,
            'status'          => 'paid',
            'payment_status'  => 'paid',
            'paid_amount'     => 7500.00,
        ]);

        InvoiceItem::create([
            'invoice_id' => $invoice->id,
            'product_id' => $product->id,
            'quantity'   => 50,
            'unit_price' => 150.00,
            'subtotal'   => 7500.00,
            'total'      => 7500.00,
        ]);

        Payment::create([
            'company_id'       => $company->id,
            'branch_id'        => $branch4->id,
            'invoice_id'       => $invoice->id,
            'amount'           => 7500.00,
            'transaction_date' => '2026-11-04',
            'payment_method'   => 'cash',
        ]);

        $user = User::factory()->create([
            'company_id' => $company->id,
            'branch_id'  => $branch4->id,
        ]);

        // Soft delete the invoice — this used to crash with SQLSTATE[23000]: 1062 Duplicate entry
        $response = $this->actingAsWithPermissions($user, ['delete invoices', 'view invoices'])
            ->deleteJson("/api/invoices/{$invoice->id}");

        $response->assertNoContent();

        // Verify stock was restored to the existing record without duplicate key error
        $updatedStock = ProductWarehouseStock::where('product_id', $product->id)
            ->where('warehouse_id', $warehouse->id)
            ->first();

        $this->assertNotNull($updatedStock);
        $this->assertEquals(60, (float) $updatedStock->quantity);
        $this->assertEquals(60, (float) $updatedStock->available_quantity);
    }

    public function test_invoice_update_reconcile_delta_does_not_fail_with_duplicate_entry(): void
    {
        $company = Company::create([
            'name'   => 'Test Corp 2',
            'code'   => 'TC2',
            'email'  => 'corp2@test.com',
            'phone'  => '9999999998',
            'active' => true,
        ]);

        $branch4 = Branch::create([
            'company_id' => $company->id,
            'name'       => 'Branch 4',
            'code'       => 'B42',
            'active'     => true,
        ]);

        $warehouse = Warehouse::create([
            'company_id' => $company->id,
            'branch_id'  => $branch4->id,
            'name'       => 'Main Warehouse 2',
            'code'       => 'MWH2',
            'active'     => true,
        ]);

        $product = Product::create([
            'company_id'     => $company->id,
            'branch_id'      => $branch4->id,
            'name'           => 'Product 239',
            'sku'            => 'SKU-239',
            'purchase_price' => 100.00,
            'sale_price'     => 150.00,
            'stock_quantity' => 100,
            'active'         => true,
        ]);

        // Stock record exists with branch_id = null
        ProductWarehouseStock::create([
            'product_id'         => $product->id,
            'warehouse_id'       => $warehouse->id,
            'company_id'         => $company->id,
            'branch_id'          => null,
            'quantity'           => 100,
            'reserved_quantity'  => 0,
            'available_quantity' => 100,
            'average_cost'       => 100.00,
        ]);

        $customer = Customer::create([
            'company_id' => $company->id,
            'branch_id'  => $branch4->id,
            'name'       => 'Test Customer 2',
            'phone'      => '1234567891',
            'status'     => 'active',
        ]);

        $invoice = Invoice::create([
            'company_id'      => $company->id,
            'branch_id'       => $branch4->id,
            'customer_id'     => $customer->id,
            'invoice_no'      => 'INV-2026-3009',
            'invoice_date'    => '2026-11-04',
            'total_amount'    => 7500.00,
            'status'          => 'sent',
            'payment_status'  => 'unpaid',
            'paid_amount'     => 0,
        ]);

        InvoiceItem::create([
            'invoice_id' => $invoice->id,
            'product_id' => $product->id,
            'quantity'   => 50,
            'unit_price' => 150.00,
            'subtotal'   => 7500.00,
            'total'      => 7500.00,
        ]);

        $user = User::factory()->create([
            'company_id' => $company->id,
            'branch_id'  => $branch4->id,
        ]);

        // Update invoice reducing quantity from 50 to 30 (triggers restore delta of 20)
        $response = $this->actingAsWithPermissions($user, ['edit invoices', 'view invoices'])
            ->putJson("/api/invoices/{$invoice->id}", [
                'company_id'   => $company->id,
                'branch_id'    => $branch4->id,
                'customer_id'  => $customer->id,
                'invoice_no'   => 'INV-2026-3009',
                'invoice_date' => '2026-11-04',
                'status'       => 'sent',
                'items'        => [
                    [
                        'product_id' => $product->id,
                        'quantity'   => 30,
                        'unit_price' => 150.00,
                    ],
                ],
            ]);

        $response->assertOk()
            ->assertJsonPath('invoice_no', 'INV-2026-3009');

        // 100 + 20 delta returned = 120
        $updatedStock = ProductWarehouseStock::where('product_id', $product->id)
            ->where('warehouse_id', $warehouse->id)
            ->first();

        $this->assertNotNull($updatedStock);
        $this->assertEquals(120, (float) $updatedStock->quantity);
    }

    public function test_purchase_invoice_delete_and_update_with_stock(): void
    {
        $company = Company::create([
            'name'   => 'Test Corp 3',
            'code'   => 'TC3',
            'email'  => 'corp3@test.com',
            'phone'  => '9999999997',
            'active' => true,
        ]);

        $branch = Branch::create([
            'company_id' => $company->id,
            'name'       => 'Branch 3',
            'code'       => 'B3',
            'active'     => true,
        ]);

        $warehouse = Warehouse::create([
            'company_id' => $company->id,
            'branch_id'  => $branch->id,
            'name'       => 'Warehouse 3',
            'code'       => 'WH3',
            'active'     => true,
        ]);

        $supplier = Supplier::create([
            'company_id' => $company->id,
            'branch_id'  => $branch->id,
            'name'       => 'Supplier 1',
            'status'     => 'active',
        ]);

        $product = Product::create([
            'company_id'     => $company->id,
            'branch_id'      => $branch->id,
            'name'           => 'Product Purchase',
            'sku'            => 'SKU-PUR',
            'purchase_price' => 50.00,
            'sale_price'     => 80.00,
            'stock_quantity' => 100,
            'active'         => true,
        ]);

        ProductWarehouseStock::create([
            'product_id'         => $product->id,
            'warehouse_id'       => $warehouse->id,
            'company_id'         => $company->id,
            'branch_id'          => null,
            'quantity'           => 100,
            'reserved_quantity'  => 0,
            'available_quantity' => 100,
            'average_cost'       => 50.00,
        ]);

        $purchase = PurchaseInvoice::create([
            'company_id'      => $company->id,
            'branch_id'       => $branch->id,
            'warehouse_id'    => $warehouse->id,
            'supplier_id'     => $supplier->id,
            'purchase_number' => 'PO-TEST-1',
            'purchase_date'   => '2026-11-04',
            'grand_total'     => 1000.00,
            'status'          => 'received',
            'payment_status'  => 'unpaid',
            'paid_amount'     => 0,
        ]);

        PurchaseInvoiceItem::create([
            'purchase_invoice_id' => $purchase->id,
            'product_id'          => $product->id,
            'quantity'            => 20,
            'purchase_price'      => 50.00,
            'total'               => 1000.00,
        ]);

        $user = User::factory()->create([
            'company_id' => $company->id,
            'branch_id'  => $branch->id,
        ]);

        // Delete purchase invoice
        $response = $this->actingAsWithPermissions($user, ['delete purchase invoices', 'view purchase invoices'])
            ->deleteJson("/api/purchase-invoices/{$purchase->id}");

        $response->assertOk()
            ->assertJsonPath('success', true);

        $updatedStock = ProductWarehouseStock::where('product_id', $product->id)
            ->where('warehouse_id', $warehouse->id)
            ->first();

        $this->assertNotNull($updatedStock);
        $this->assertEquals(80, (float) $updatedStock->quantity);
    }
}
