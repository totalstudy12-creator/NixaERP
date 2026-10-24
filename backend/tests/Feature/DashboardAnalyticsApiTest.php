<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\Product;
use App\Models\FinancialEntry;
use App\Models\Payment;
use App\Models\PurchaseInvoice;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DashboardAnalyticsApiTest extends TestCase
{
    use RefreshDatabase;
    use InteractsWithPermissions;

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

        $response = $this->actingAsWithPermissions($user, ['view dashboard analytics'])
            ->getJson('/api/dashboard/analytics');

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

        $response = $this->actingAsWithPermissions($user, ['view dashboard profit'])
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

        $response = $this->actingAsWithPermissions($user, ['view dashboard profit'])
            ->getJson('/api/reports/profit-loss/summary?from=' . now()->startOfMonth()->toDateString() . '&to=' . now()->endOfMonth()->toDateString());

        $response->assertOk();
        $this->assertSame(500.0, round((float) $response->json('data.gross_revenue'), 2));
        $this->assertSame(320.0, round((float) $response->json('data.cogs'), 2));
        $this->assertSame(180.0, round((float) $response->json('data.gross_profit'), 2));
    }
    public function test_dashboard_analytics_calculates_real_expenses_receivables_and_cash_flow(): void
    {
        $user = User::factory()->create();

        $company = Company::create([
            'name' => 'Metrics Co',
            'code' => 'METRICS-CO',
            'email' => 'metrics@example.com',
            'active' => true,
        ]);

        $customer = Customer::create([
            'company_id' => $company->id,
            'name' => 'Acme Corp',
            'email' => 'acme@example.com',
            'status' => 'active',
        ]);

        // 1. Invoice with partial payment (receivable = 1000 - 400 = 600)
        $invoice = Invoice::create([
            'company_id' => $company->id,
            'customer_id' => $customer->id,
            'invoice_no' => 'INV-METRICS-001',
            'total_amount' => 1000.00,
            'payment_received' => 400.00,
            'tax_amount' => 0,
            'status' => 'partial',
            'invoice_date' => now()->toDateString(),
            'due_date' => now()->subDays(5)->toDateString(),
        ]);

        // 2. Financial Entry Expense (250.00)
        FinancialEntry::create([
            'company_id' => $company->id,
            'direction' => 'expense',
            'category' => 'Utilities',
            'amount' => 250.00,
            'entry_date' => now()->toDateString(),
            'payment_method' => 'bank_transfer',
            'status' => 'completed',
        ]);

        // 3. Payments: Inward 400, Outward 150
        Payment::create([
            'company_id' => $company->id,
            'invoice_id' => $invoice->id,
            'amount' => 400.00,
            'payment_method' => 'bank_transfer',
            'payment_direction' => 'inward',
            'status' => 'completed',
            'transaction_date' => now(),
        ]);

        Payment::create([
            'company_id' => $company->id,
            'amount' => 150.00,
            'payment_method' => 'cash',
            'payment_direction' => 'outward',
            'status' => 'completed',
            'transaction_date' => now(),
        ]);

        $response = $this->actingAsWithPermissions($user, ['view dashboard analytics'])
            ->getJson('/api/dashboard/analytics?company_id=' . $company->id);

        $response->assertOk()
            ->assertJsonPath('success', true);

        $this->assertSame(1000.0, round((float) $response->json('data.overview.totalSales'), 2));
        $this->assertSame(250.0, round((float) $response->json('data.overview.totalExpenses'), 2));
        $this->assertSame(600.0, round((float) $response->json('data.overview.receivable'), 2));
        $this->assertSame(600.0, round((float) $response->json('data.overview.overdueReceivable'), 2));
        $this->assertSame(400.0, round((float) $response->json('data.finance.cashInflow'), 2));
        $this->assertSame(150.0, round((float) $response->json('data.finance.cashOutflow'), 2));
        $this->assertSame(250.0, round((float) $response->json('data.finance.netCashFlow'), 2));
        $this->assertNotEmpty($response->json('data.alerts'));
    }

    public function test_dashboard_reports_routes_are_accessible_and_return_real_data(): void
    {
        $user = User::factory()->create();

        $company = Company::create([
            'name' => 'Report Co',
            'code' => 'REP-CO',
            'email' => 'rep@example.com',
            'active' => true,
        ]);

        $this->actingAsWithPermissions($user, [
            'view sales reports',
            'view purchase reports',
            'income_expenses.view_reports',
            'income_expenses.view',
        ]);

        // Test receivables aging
        $response = $this->getJson('/api/reports/receivables-aging?company_id=' . $company->id);
        $response->assertOk()->assertJsonStructure(['data', 'meta']);

        // Test sales purchase trend
        $responseTrend = $this->getJson('/api/reports/sales-purchase-trend?company_id=' . $company->id);
        $responseTrend->assertOk();

        // Test expense report
        $responseExp = $this->getJson('/api/reports/expense-report?company_id=' . $company->id);
        $responseExp->assertOk()->assertJsonStructure(['data', 'summary', 'meta']);
    }

    public function test_customer_profitability_report_returns_real_customer_margins_on_both_routes(): void
    {
        $user = User::factory()->create();

        $company = Company::create([
            'name' => 'Customer Profit Co',
            'code' => 'CPC-01',
            'email' => 'cpc@example.com',
            'active' => true,
        ]);

        $customer = Customer::create([
            'company_id' => $company->id,
            'name' => 'VIP Customer',
            'email' => 'vip@example.com',
            'status' => 'active',
        ]);

        $product = Product::create([
            'company_id' => $company->id,
            'name' => 'Widget Pro',
            'sku' => 'WP-100',
            'sale_price' => 200.00,
            'purchase_price' => 120.00,
            'stock_quantity' => 20,
            'reorder_level' => 5,
            'active' => true,
        ]);

        $invoice = Invoice::create([
            'company_id' => $company->id,
            'customer_id' => $customer->id,
            'invoice_no' => 'INV-VIP-001',
            'total_amount' => 400.00,
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
            'unit_price' => 200.00,
            'discount_amount' => 0,
            'subtotal' => 400.00,
            'total' => 400.00,
        ]);

        $this->actingAsWithPermissions($user, ['view dashboard profit']);

        // Test slashed route
        $res1 = $this->getJson('/api/reports/profit-loss/customers?company_id=' . $company->id);
        $res1->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonStructure(['data' => [['customer', 'invoice_count', 'revenue', 'gross_profit', 'margin_percent']]]);

        $this->assertSame('VIP Customer', $res1->json('data.0.customer'));
        $this->assertSame(1, $res1->json('data.0.invoice_count'));
        $this->assertSame(400.0, round((float) $res1->json('data.0.revenue'), 2));
        $this->assertSame(160.0, round((float) $res1->json('data.0.gross_profit'), 2));
        $this->assertSame(40.0, round((float) $res1->json('data.0.margin_percent'), 2));

        // Test kebab-case route
        $res2 = $this->getJson('/api/reports/profit-loss-customers?company_id=' . $company->id);
        $res2->assertOk()
            ->assertJsonPath('success', true);
        $this->assertSame('VIP Customer', $res2->json('data.0.customer'));
    }
}
