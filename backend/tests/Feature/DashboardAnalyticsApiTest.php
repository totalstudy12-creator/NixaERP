<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Customer;
use App\Models\Invoice;
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
}
