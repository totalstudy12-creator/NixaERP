<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\Product;
use App\Models\PurchaseInvoice;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DashboardAnalyticsApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_dashboard_analytics_endpoint_returns_overview_data(): void
    {
        $user = User::factory()->create();

        $company = Company::create([
            'name' => 'Local ERP Co',
            'code' => 'LOCAL-ERP',
            'email' => 'erp@example.com',
            'active' => true,
        ]);

        $companyId = $company->id;

        $customer = Customer::create([
            'company_id' => $companyId,
            'branch_id' => null,
            'name' => 'Alpha Customer',
            'email' => 'alpha@example.com',
            'phone' => '1234567890',
            'status' => 'active',
        ]);

        Product::create([
            'company_id' => $companyId,
            'branch_id' => null,
            'name' => 'Sample Product',
            'sku' => 'SP-001',
            'sale_price' => 150.00,
            'purchase_price' => 90.00,
            'stock_quantity' => 25,
            'reorder_level' => 5,
            'active' => true,
        ]);

        Invoice::create([
            'company_id' => $companyId,
            'customer_id' => $customer->id,
            'invoice_no' => 'INV-20260815-0001',
            'total_amount' => 1200.00,
            'tax_amount' => 0,
            'status' => 'paid',
            'due_date' => now()->addDays(7),
            'paid_at' => now(),
        ]);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/dashboard/analytics');

        $response->assertOk()
            ->assertJsonStructure([
                'success',
                'data' => [
                    'overview',
                    'sales',
                    'inventory',
                    'finance',
                    'customers',
                ],
            ])
            ->assertJsonPath('success', true);

        $this->assertSame(1200.0, round((float) $response->json('data.overview.totalSales'), 2));
        $this->assertSame(0.0, round((float) $response->json('data.overview.totalPurchase'), 2));
        $this->assertSame(1, $response->json('data.customers.totalCustomers'));
    }

    public function test_product_profitability_report_returns_real_profit_data(): void
    {
        $user = User::factory()->create();

        $company = Company::create([
            'name' => 'Profit Co',
            'code' => 'PROFIT-CO',
            'email' => 'profit@example.com',
            'active' => true,
        ]);

        $customer = Customer::create([
            'company_id' => $company->id,
            'branch_id' => null,
            'name' => 'Profit Customer',
            'email' => 'customer@example.com',
            'status' => 'active',
        ]);

        $product = Product::create([
            'company_id' => $company->id,
            'branch_id' => null,
            'name' => 'Wooden Chair',
            'sku' => 'WC-001',
            'sale_price' => 150.00,
            'purchase_price' => 90.00,
            'stock_quantity' => 25,
            'reorder_level' => 5,
            'active' => true,
        ]);

        $invoice = Invoice::create([
            'company_id' => $company->id,
            'customer_id' => $customer->id,
            'invoice_no' => 'INV-20260902-0001',
            'total_amount' => 300.00,
            'tax_amount' => 0,
            'status' => 'paid',
            'invoice_date' => now()->toDateString(),
            'due_date' => now()->addDays(7),
            'paid_at' => now(),
        ]);

        InvoiceItem::create([
            'invoice_id' => $invoice->id,
            'product_id' => $product->id,
            'quantity' => 2,
            'unit_price' => 150.00,
            'discount_amount' => 0,
            'subtotal' => 300.00,
            'total' => 300.00,
        ]);

        $response = $this->actingAs($user, 'sanctum')
            ->getJson('/api/reports/product-profitability?from=' . now()->startOfMonth()->toDateString() . '&to=' . now()->endOfMonth()->toDateString());

        $response->assertOk()
            ->assertJsonStructure([
                'success',
                'data' => [[
                    'product_name',
                    'sku',
                    'quantity_sold',
                    'sales_value',
                    'cost_value',
                    'gross_profit',
                    'margin_percent',
                ]],
                'meta',
            ])
            ->assertJsonPath('success', true);

        $this->assertSame('Wooden Chair', $response->json('data.0.product_name'));
        $this->assertSame(2.0, round((float) $response->json('data.0.quantity_sold'), 2));
        $this->assertSame(300.0, round((float) $response->json('data.0.sales_value'), 2));
        $this->assertSame(180.0, round((float) $response->json('data.0.cost_value'), 2));
        $this->assertSame(120.0, round((float) $response->json('data.0.gross_profit'), 2));
    }

    public function test_profit_loss_summary_uses_real_product_costs_not_hardcoded_assumptions(): void
    {
        $user = User::factory()->create();

        $company = Company::create([
            'name' => 'Profit Co',
            'code' => 'PROFIT-CO-2',
            'email' => 'profit2@example.com',
            'active' => true,
        ]);

        $customer = Customer::create([
            'company_id' => $company->id,
            'branch_id' => null,
            'name' => 'PL Customer',
            'email' => 'pl@example.com',
            'status' => 'active',
        ]);

        $product = Product::create([
            'company_id' => $company->id,
            'branch_id' => null,
            'name' => 'Office Desk',
            'sku' => 'OD-001',
            'sale_price' => 250.00,
            'purchase_price' => 160.00,
            'stock_quantity' => 10,
            'reorder_level' => 2,
            'active' => true,
        ]);

        $invoice = Invoice::create([
            'company_id' => $company->id,
            'customer_id' => $customer->id,
            'invoice_no' => 'INV-20260915-0001',
            'total_amount' => 500.00,
            'tax_amount' => 0,
            'status' => 'paid',
            'invoice_date' => now()->toDateString(),
            'due_date' => now()->addDays(7),
            'paid_at' => now(),
        ]);

        InvoiceItem::create([
            'invoice_id' => $invoice->id,
            'product_id' => $product->id,
            'quantity' => 2,
            'unit_price' => 250.00,
            'discount_amount' => 0,
            'subtotal' => 500.00,
            'total' => 500.00,
        ]);

        $response = $this->actingAs($user, 'sanctum')
            ->getJson('/api/reports/profit-loss/summary?from=' . now()->startOfMonth()->toDateString() . '&to=' . now()->endOfMonth()->toDateString());

        $response->assertOk();
        $this->assertSame(500.0, round((float) $response->json('data.gross_revenue'), 2));
        $this->assertSame(320.0, round((float) $response->json('data.cogs'), 2));
        $this->assertSame(180.0, round((float) $response->json('data.gross_profit'), 2));
    }
}
