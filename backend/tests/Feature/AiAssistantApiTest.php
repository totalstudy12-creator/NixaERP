<?php

namespace Tests\Feature;

use App\Models\AiProvider;
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

class AiAssistantApiTest extends TestCase
{
    use RefreshDatabase;
    use InteractsWithPermissions;

    public function test_ai_assistant_insights_return_summary_payload(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAsWithPermissions($user, ['view ai assistant insights'])
            ->getJson('/api/ai/assistant/insights');

        $response->assertOk()
            ->assertJsonStructure([
                'success',
                'data' => [
                    'summary',
                    'low_stock',
                    'recommendations',
                ],
            ])
            ->assertJsonPath('success', true);

        $this->assertIsArray($response->json('data.summary'));
        $this->assertIsArray($response->json('data.low_stock'));
    }

    public function test_ai_profit_loss_context_uses_the_canonical_erp_report_service(): void
    {
        $company = Company::create([
            'name' => 'Nexa ERP',
            'code' => 'NEXA',
            'email' => 'hello@nexaerp.com',
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

        $service = new \App\Services\AiContextService();
        $context = $service->getProfitLossContext($company->id, $branch->id, '2025-01-01', '2025-01-31');

        $this->assertSame('Nexa ERP Profit & Loss', $context['source']);
        $this->assertSame(950.0, round((float) $context['net_revenue'], 2));
        $this->assertSame(700.0, round((float) $context['cogs'], 2));
        $this->assertSame(250.0, round((float) $context['gross_profit'], 2));
        $this->assertSame(250.0, round((float) $context['net_profit'], 2));
    }

    public function test_ai_assistant_chat_requires_a_message(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAsWithPermissions($user, ['chat with ai assistant'])
            ->postJson('/api/ai/assistant/chat', []);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['message']);
    }

    public function test_ai_assistant_chat_returns_provider_error_when_unconfigured(): void
    {
        $user = User::factory()->create();

        putenv('OPENAI_API_KEY');
        putenv('GEMINI_API_KEY');
        $_ENV['OPENAI_API_KEY'] = null;
        $_ENV['GEMINI_API_KEY'] = null;
        $_SERVER['OPENAI_API_KEY'] = null;
        $_SERVER['GEMINI_API_KEY'] = null;

        $response = $this->actingAsWithPermissions($user, ['chat with ai assistant'])
            ->postJson('/api/ai/assistant/chat', [
            'message' => 'What were sales today?',
        ]);

        $response->assertStatus(503)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'No AI provider configured. Please configure an AI provider.');
    }

    public function test_ai_provider_list_is_available_to_authenticated_users(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAsWithPermissions($user, ['view ai providers'])
            ->getJson('/api/ai/providers');

        $response->assertOk()
            ->assertJsonStructure([
                'success',
                'data',
            ])
            ->assertJsonPath('success', true);
    }
}
