<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\Product;
use App\Models\PurchaseInvoice;
use App\Models\PurchaseInvoiceItem;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class InvoiceProfitabilityReportTest extends TestCase
{
    use RefreshDatabase;

    public function test_invoice_level_profitability_endpoint_returns_real_costed_profit_rows(): void
    {
        $company = Company::create([
            'name' => 'Nixa ERP',
            'code' => 'NIXA',
            'email' => 'hello@nixaerp.com',
            'phone' => '9999999999',
            'active' => true,
        ]);

        $branch = Branch::create([
            'company_id' => $company->id,
            'name' => 'Main Branch',
            'code' => 'MB',
            'active' => true,
        ]);

        $customer = Customer::create([
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'name' => 'Amit Customer',
            'email' => 'amit@example.com',
            'phone' => '9876543210',
            'status' => 'active',
            'is_active' => true,
        ]);

        $supplier = Supplier::create([
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'name' => 'Apex Suppliers',
            'email' => 'sales@apex.test',
            'phone' => '9123456780',
            'status' => 'active',
        ]);

        $product = Product::create([
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'name' => 'Laptop Pro',
            'sku' => 'LP-100',
            'purchase_price' => 350.00,
            'sale_price' => 500.00,
            'tax_rate' => 5,
            'stock_quantity' => 20,
            'reorder_level' => 5,
            'active' => true,
        ]);

        $purchaseInvoice = PurchaseInvoice::create([
            'company_id' => $company->id,
            'supplier_id' => $supplier->id,
            'purchase_number' => 'PO-1001',
            'bill_number' => 'BILL-1001',
            'purchase_date' => '2025-01-10',
            'grand_total' => 700.00,
            'status' => 'paid',
            'payment_status' => 'paid',
            'paid_amount' => 700.00,
        ]);

        PurchaseInvoiceItem::create([
            'purchase_invoice_id' => $purchaseInvoice->id,
            'product_id' => $product->id,
            'product_name' => 'Laptop Pro',
            'sku' => 'LP-100',
            'quantity' => 2,
            'purchase_price' => 350.00,
            'total' => 700.00,
        ]);

        $invoice = Invoice::create([
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'customer_id' => $customer->id,
            'invoice_no' => 'INV-1001',
            'invoice_date' => '2025-01-15',
            'total_amount' => 1000.00,
            'discount_amount' => 50.00,
            'tax_amount' => 50.00,
            'status' => 'paid',
            'subtotal' => 1000.00,
        ]);

        InvoiceItem::create([
            'invoice_id' => $invoice->id,
            'product_id' => $product->id,
            'quantity' => 2,
            'unit_price' => 500.00,
            'discount_amount' => 0,
            'tax_rate' => 5,
            'subtotal' => 1000.00,
            'total' => 1000.00,
        ]);

        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')
            ->getJson('/api/reports/profit-loss/invoices?from=2025-01-01&to=2025-01-31');

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'success',
                'data' => [
                    ['invoice_id', 'invoice_no', 'invoice_date', 'customer_name', 'revenue', 'discount', 'tax', 'cogs', 'gross_profit', 'profit_margin'],
                ],
                'summary',
                'meta',
            ]);

        $this->assertSame(950.0, round((float) $response->json('data.0.revenue'), 2));
        $this->assertSame(700.0, round((float) $response->json('data.0.cogs'), 2));
        $this->assertSame(250.0, round((float) $response->json('data.0.gross_profit'), 2));
    }

    public function test_invoice_api_accepts_decimal_quantity_items_for_imports(): void
    {
        $company = Company::create([
            'name' => 'Nixa ERP',
            'code' => 'NIXA-DEC',
            'email' => 'decimal@nixaerp.com',
            'phone' => '9999999997',
            'active' => true,
        ]);

        $branch = Branch::create([
            'company_id' => $company->id,
            'name' => 'Main Branch',
            'code' => 'MB-DEC',
            'active' => true,
        ]);

        $customer = Customer::create([
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'name' => 'Decimal Import Customer',
            'email' => 'decimal.customer@example.com',
            'phone' => '9876543212',
            'status' => 'active',
            'is_active' => true,
        ]);

        $product = Product::create([
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'name' => 'Imported Item',
            'sku' => 'IMP-DEC-01',
            'purchase_price' => 10.00,
            'sale_price' => 18.50,
            'tax_rate' => 0,
            'stock_quantity' => 2000,
            'reorder_level' => 10,
            'active' => true,
        ]);

        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')
            ->postJson('/api/invoices', [
                'company_id' => $company->id,
                'branch_id' => $branch->id,
                'customer_id' => $customer->id,
                'invoice_no' => 'INV-DEC-001',
                'invoice_date' => '2026-04-25',
                'due_date' => '2026-04-25',
                'total_amount' => 22874.63,
                'tax_amount' => 0,
                'status' => 'pending',
                'items' => [[
                    'product_id' => $product->id,
                    'quantity' => 1020.25,
                    'unit_price' => 18.50,
                    'discount_type' => 'percent',
                    'discount_percent' => 0,
                    'discount_amount' => 0,
                    'gst_slab' => 0,
                    'is_inter_state' => false,
                    'cgst_percent' => 0,
                    'sgst_percent' => 0,
                    'igst_percent' => 0,
                    'cgst_amount' => 0,
                    'sgst_amount' => 0,
                    'igst_amount' => 0,
                    'total' => 18874.63,
                ]],
            ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('invoices', ['invoice_no' => 'INV-DEC-001']);
        $this->assertDatabaseHas('invoice_items', ['product_id' => $product->id, 'quantity' => 1020.25]);
    }

    public function test_purchase_register_vendor_and_ledger_reports_return_real_transaction_rows(): void
    {
        $company = Company::create([
            'name' => 'Nixa ERP',
            'code' => 'NIXA2',
            'email' => 'ops@nixaerp.com',
            'phone' => '9999999998',
            'active' => true,
        ]);

        $branch = Branch::create([
            'company_id' => $company->id,
            'name' => 'Main Branch',
            'code' => 'MB2',
            'active' => true,
        ]);

        $customer = Customer::create([
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'name' => 'Amit Customer',
            'email' => 'amit2@example.com',
            'phone' => '9876543211',
            'status' => 'active',
            'is_active' => true,
        ]);

        $supplier = Supplier::create([
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'name' => 'Apex Suppliers',
            'email' => 'sales2@apex.test',
            'phone' => '9123456781',
            'status' => 'active',
        ]);

        $product = Product::create([
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'name' => 'Keyboard',
            'sku' => 'KB-01',
            'purchase_price' => 60.00,
            'sale_price' => 100.00,
            'tax_rate' => 5,
            'stock_quantity' => 20,
            'reorder_level' => 5,
            'active' => true,
        ]);

        $invoice = Invoice::create([
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'customer_id' => $customer->id,
            'invoice_no' => 'INV-2001',
            'invoice_date' => '2025-02-10',
            'total_amount' => 1000.00,
            'tax_amount' => 50.00,
            'discount_amount' => 0,
            'status' => 'paid',
            'paid_amount' => 1000.00,
            'subtotal' => 1000.00,
        ]);

        InvoiceItem::create([
            'invoice_id' => $invoice->id,
            'product_id' => $product->id,
            'quantity' => 10,
            'unit_price' => 100.00,
            'discount_amount' => 0,
            'tax_rate' => 5,
            'subtotal' => 1000.00,
            'total' => 1000.00,
        ]);

        $purchaseInvoice = PurchaseInvoice::create([
            'company_id' => $company->id,
            'supplier_id' => $supplier->id,
            'purchase_number' => 'PO-2001',
            'purchase_date' => '2025-02-12',
            'grand_total' => 600.00,
            'tax_amount' => 0,
            'order_discount' => 0,
            'status' => 'paid',
            'payment_status' => 'paid',
            'paid_amount' => 600.00,
        ]);

        PurchaseInvoiceItem::create([
            'purchase_invoice_id' => $purchaseInvoice->id,
            'product_id' => $product->id,
            'product_name' => 'Keyboard',
            'sku' => 'KB-01',
            'quantity' => 10,
            'purchase_price' => 60.00,
            'total' => 600.00,
        ]);

        \App\Models\Payment::create([
            'company_id' => $company->id,
            'invoice_id' => $invoice->id,
            'amount' => 1000.00,
            'payment_method' => 'cash',
            'status' => 'paid',
            'payment_direction' => 'inward',
            'transaction_date' => '2025-02-10',
            'reference_no' => 'PAY-INV-2001',
        ]);

        $user = User::factory()->create();

        $purchaseRegister = $this->actingAs($user, 'sanctum')
            ->getJson('/api/reports/purchase-register?from=2025-02-01&to=2025-02-28');
        $purchaseRegister->assertOk()->assertJsonPath('success', true);
        $this->assertNotEmpty($purchaseRegister->json('data'));

        $purchaseVendor = $this->actingAs($user, 'sanctum')
            ->getJson('/api/reports/purchase-by-vendor?from=2025-02-01&to=2025-02-28');
        $purchaseVendor->assertOk()->assertJsonPath('success', true);
        $this->assertNotEmpty($purchaseVendor->json('data'));

        $ledger = $this->actingAs($user, 'sanctum')
            ->getJson('/api/reports/general-ledger?from=2025-02-01&to=2025-02-28');
        $ledger->assertOk()->assertJsonPath('success', true);
        $this->assertNotEmpty($ledger->json('data'));
    }
}
