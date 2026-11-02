<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\Product;
use Database\Seeders\CanonicalPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PublicInvoiceAccessTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Customer $customer;
    private Invoice $invoice;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(CanonicalPermissionsSeeder::class);

        $this->company = Company::create([
            'name' => 'Apex Retail Ltd',
            'email' => 'billing@apexretail.test',
            'phone' => '9876543210',
            'active' => true,
        ]);

        $this->customer = Customer::create([
            'company_id' => $this->company->id,
            'name' => 'Rahul Sharma',
            'contact_no' => '9876543210',
            'phone' => '9876543210',
            'is_active' => true,
        ]);

        $product = Product::create([
            'company_id' => $this->company->id,
            'name' => 'Wireless Keyboard',
            'sku' => 'KEY-001',
            'sale_price' => 1500.00,
            'purchase_price' => 900.00,
            'stock_quantity' => 50,
            'active' => true,
        ]);

        $this->invoice = Invoice::create([
            'company_id' => $this->company->id,
            'customer_id' => $this->customer->id,
            'invoice_no' => 'INV-2026-9999',
            'customer_name' => 'Rahul Sharma',
            'contact_no' => '9876543210',
            'invoice_date' => '2026-11-01',
            'total_amount' => 1770.00,
            'grand_total' => 1770.00,
            'tax_amount' => 270.00,
            'paid_amount' => 1770.00,
            'balance_amount' => 0.00,
            'status' => 'paid',
            'payment_status' => 'paid',
        ]);

        InvoiceItem::create([
            'invoice_id' => $this->invoice->id,
            'product_id' => $product->id,
            'name' => 'Wireless Keyboard',
            'quantity' => 1,
            'unit_price' => 1500.00,
            'subtotal' => 1500.00,
            'total' => 1770.00,
            'tax_rate' => 18,
            'tax_amount' => 270.00,
        ]);
    }

    public function test_public_metadata_returns_masked_info_without_auth(): void
    {
        $this->assertNotEmpty($this->invoice->public_token);

        $response = $this->getJson("/api/public/invoices/{$this->invoice->public_token}");

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
                'requires_verification' => true,
                'invoice_no' => 'INV-2026-9999',
                'company_name' => 'Apex Retail Ltd',
            ]);

        // Sensitive product details should not be in metadata
        $response->assertJsonMissing(['items']);
    }

    public function test_verify_rejects_incorrect_mobile_number(): void
    {
        $response = $this->postJson("/api/public/invoices/{$this->invoice->public_token}/verify", [
            'mobile' => '9999999999',
        ]);

        $response->assertStatus(403)
            ->assertJson([
                'success' => false,
            ]);
    }

    public function test_verify_unlocks_full_invoice_with_registered_mobile_number(): void
    {
        $response = $this->postJson("/api/public/invoices/{$this->invoice->public_token}/verify", [
            'mobile' => '9876543210',
        ]);

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
                'verified' => true,
            ])
            ->assertJsonPath('data.invoice_no', 'INV-2026-9999')
            ->assertJsonPath('data.items.0.product.name', 'Wireless Keyboard');
    }

    public function test_verify_accepts_phone_with_country_code(): void
    {
        $response = $this->postJson("/api/public/invoices/{$this->invoice->public_token}/verify", [
            'mobile' => '+91 98765-43210',
        ]);

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
                'verified' => true,
            ]);
    }
}
