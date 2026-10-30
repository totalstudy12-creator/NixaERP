<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Company;
use App\Models\Contact;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Lead;
use App\Models\Product;
use App\Models\Quotation;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class QuotationLeadContactTest extends TestCase
{
    use RefreshDatabase;
    use InteractsWithPermissions;

    protected Company $company;
    protected User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create([
            'name'   => 'Nixa Tech Pvt Ltd',
            'code'   => 'NIXA',
            'email'  => 'info@nixaerp.in',
            'phone'  => '9876543210',
            'active' => true,
        ]);

        $this->user = User::factory()->create([
            'company_id' => $this->company->id,
            'name'       => 'Test Manager',
            'email'      => 'manager@nixaerp.in',
        ]);
    }

    public function test_quotation_crud_and_tax_calculations(): void
    {
        $customer = Customer::create([
            'company_id'     => $this->company->id,
            'name'           => 'Blue Retail Stores',
            'email'          => 'blue@retail.in',
            'phone'          => '9811122233',
            'gst_number'     => '27AAAAA0000A1Z5',
            'billing_street' => '12 MG Road, Mumbai',
        ]);

        $product = Product::create([
            'company_id' => $this->company->id,
            'name'       => 'Laser Barcode Scanner',
            'sku'        => 'SCAN-001',
            'price'      => 2500.00,
            'cost_price' => 1800.00,
            'stock_quantity' => 50,
        ]);

        $payload = [
            'company_id'       => $this->company->id,
            'customer_id'      => $customer->id,
            'customer_name'    => $customer->name,
            'customer_email'   => $customer->email,
            'customer_phone'   => $customer->phone,
            'quotation_date'   => '2026-10-29',
            'valid_until'      => '2026-11-28',
            'status'           => 'draft',
            'shipping_charges' => 150.00,
            'items'            => [
                [
                    'product_id'       => $product->id,
                    'item_name'        => $product->name,
                    'quantity'         => 2,
                    'unit_price'       => 2500.00, // gross: 5000
                    'discount_percent' => 10,      // discount: 500, taxable: 4500
                    'gst_slab'         => 18,      // 18% GST intra-state: CGST 9% (405) + SGST 9% (405) = 810
                    'is_inter_state'   => false,
                ],
            ],
        ];

        // 1. Create Quotation
        $res = $this->actingAsWithPermissions($this->user, ['create sales quotations'])
            ->postJson('/api/quotations', $payload);

        $res->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.customer_name', 'Blue Retail Stores')
            ->assertJsonPath('data.subtotal', '5000.00')
            ->assertJsonPath('data.discount_amount', '500.00')
            ->assertJsonPath('data.taxable_amount', '4500.00')
            ->assertJsonPath('data.tax_amount', '810.00')
            ->assertJsonPath('data.cgst_amount', '405.00')
            ->assertJsonPath('data.sgst_amount', '405.00')
            ->assertJsonPath('data.total_amount', '5460.00'); // 4500 + 810 + 150 shipping = 5460.00

        $quoteId = $res->json('data.id');

        // 2. Fetch Quotations list
        $listRes = $this->actingAsWithPermissions($this->user, ['view sales quotations'])
            ->getJson('/api/quotations');

        $listRes->assertStatus(200)
            ->assertJsonPath('total', 1);

        // 3. Update Quotation Status
        $statusRes = $this->actingAsWithPermissions($this->user, ['edit sales quotations'])
            ->patchJson("/api/quotations/{$quoteId}/status", [
                'status' => 'sent',
            ]);

        $statusRes->assertStatus(200)
            ->assertJsonPath('data.status', 'sent');

        // 4. Duplicate Quotation
        $dupRes = $this->actingAsWithPermissions($this->user, ['create sales quotations'])
            ->postJson("/api/quotations/{$quoteId}/duplicate");

        $dupRes->assertStatus(200)
            ->assertJsonPath('success', true);
        $this->assertNotEquals($quoteId, $dupRes->json('data.id'));
    }

    public function test_quotation_conversion_to_invoice_workflow(): void
    {
        $branch = Branch::create([
            'company_id' => $this->company->id,
            'name'       => 'Headquarters',
            'code'       => 'HQ',
        ]);

        $warehouse = Warehouse::create([
            'company_id' => $this->company->id,
            'branch_id'  => $branch->id,
            'name'       => 'Main Central Depot',
            'code'       => 'MAIN',
        ]);

        $customer = Customer::create([
            'company_id' => $this->company->id,
            'name'       => 'Apex Solutions',
            'phone'      => '9988776655',
        ]);

        $product = Product::create([
            'company_id'  => $this->company->id,
            'name'        => 'Thermal Receipt Printer',
            'sku'         => 'PRN-80',
            'price'       => 4500.00,
            'stock_quantity' => 20,
            'track_stock' => true,
        ]);

        $quotation = Quotation::create([
            'company_id'       => $this->company->id,
            'quotation_number' => 'QT-2026-9999',
            'reference_no'     => 'QT-2026-9999',
            'customer_id'      => $customer->id,
            'customer_name'    => $customer->name,
            'quotation_date'   => '2026-10-29',
            'status'           => 'accepted',
            'subtotal'         => 9000.00,
            'total_amount'     => 9000.00,
        ]);

        $quotation->items()->create([
            'product_id' => $product->id,
            'item_name'  => $product->name,
            'quantity'   => 2,
            'unit_price' => 4500.00,
            'subtotal'   => 9000.00,
            'total'      => 9000.00,
        ]);

        // Convert quotation to invoice
        $convertRes = $this->actingAsWithPermissions($this->user, ['quotations.convert'])
            ->postJson("/api/quotations/{$quotation->id}/convert", [
                'warehouse_id'      => $warehouse->id,
                'auto_deduct_stock' => true,
            ]);

        $convertRes->assertStatus(200)
            ->assertJsonPath('success', true);

        $invoiceId = $convertRes->json('invoice.id');
        $invoice = Invoice::find($invoiceId);
        $this->assertNotNull($invoice);
        $this->assertEquals($quotation->id, $invoice->quotation_id);
        $this->assertEquals('Apex Solutions', $invoice->customer_name);
        $this->assertEquals(9000.00, (float) $invoice->total_amount);

        // Verify stock deducted
        $this->assertEquals(18, (float) $product->fresh()->stock_quantity);

        // Verify quotation status updated
        $this->assertEquals('converted', $quotation->fresh()->status);
        $this->assertEquals($invoice->id, $quotation->fresh()->converted_invoice_id);

        // Second conversion attempt must be rejected (idempotency & duplicate protection)
        $reConvertRes = $this->actingAsWithPermissions($this->user, ['quotations.convert'])
            ->postJson("/api/quotations/{$quotation->id}/convert");

        $reConvertRes->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    public function test_crm_leads_lifecycle_and_conversion(): void
    {
        // 1. Create Lead
        $createRes = $this->actingAsWithPermissions($this->user, ['create leads'])
            ->postJson('/api/leads', [
                'company_id'     => $this->company->id,
                'name'           => 'Rohan Varma',
                'company_name'   => 'Varma Logistics',
                'email'          => 'rohan@varmalogistics.com',
                'phone'          => '9123456780',
                'source'         => 'website',
                'stage'          => 'new',
                'priority'       => 'high',
                'expected_value' => 75000.00,
            ]);

        $createRes->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.name', 'Rohan Varma');

        $leadId = $createRes->json('data.id');

        // 2. Move stage through pipeline
        $stageRes = $this->actingAsWithPermissions($this->user, ['edit leads'])
            ->patchJson("/api/leads/{$leadId}/stage", [
                'stage' => 'qualified',
                'note'  => 'Client confirmed budget and requirements during discovery call.',
            ]);

        $stageRes->assertStatus(200)
            ->assertJsonPath('data.stage', 'qualified');

        // 3. Log an activity
        $actRes = $this->actingAsWithPermissions($this->user, ['edit leads'])
            ->postJson("/api/leads/{$leadId}/activities", [
                'activity_type'  => 'call',
                'title'          => 'Product Demo Call',
                'description'    => 'Demonstrated multi-warehouse inventory and GST billing.',
                'follow_up_date' => '2026-11-05',
            ]);

        $actRes->assertStatus(201)
            ->assertJsonPath('success', true);

        // Verify next_follow_up date updated
        $lead = Lead::find($leadId);
        $this->assertEquals('2026-11-05', $lead->next_follow_up->toDateString());

        // 4. Convert Lead to Customer and Contact
        $convertRes = $this->actingAsWithPermissions($this->user, ['leads.convert'])
            ->postJson("/api/leads/{$leadId}/convert", [
                'create_customer' => true,
                'create_contact'  => true,
            ]);

        $convertRes->assertStatus(200)
            ->assertJsonPath('success', true);

        $leadFresh = $lead->fresh();
        $this->assertEquals('won', $leadFresh->stage);
        $this->assertNotNull($leadFresh->converted_customer_id);
        $this->assertNotNull($leadFresh->converted_contact_id);

        $customer = Customer::find($leadFresh->converted_customer_id);
        $this->assertEquals('Varma Logistics', $customer->name);
        $this->assertEquals('9123456780', $customer->phone);
    }

    public function test_contacts_directory_crud_and_duplicate_check(): void
    {
        // 1. Create Contact
        $createRes = $this->actingAsWithPermissions($this->user, ['create contacts'])
            ->postJson('/api/contacts', [
                'company_id'   => $this->company->id,
                'name'         => 'Sunita Rao',
                'company_name' => 'Solar Enterprises',
                'email'        => 'sunita@solarent.in',
                'phone'        => '9876500112',
                'contact_type' => 'customer',
                'city'         => 'Pune',
                'state'        => 'Maharashtra',
            ]);

        $createRes->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.name', 'Sunita Rao');

        // 2. Duplicate Detection
        $dupRes = $this->actingAsWithPermissions($this->user, ['view contacts'])
            ->getJson('/api/contacts/check-duplicate?phone=9876500112');

        $dupRes->assertStatus(200)
            ->assertJsonPath('is_duplicate', true)
            ->assertJsonPath('matches.0.name', 'Sunita Rao');

        // 3. Contacts Summary
        $sumRes = $this->actingAsWithPermissions($this->user, ['view contacts'])
            ->getJson('/api/contacts/summary');

        $sumRes->assertStatus(200)
            ->assertJsonPath('total_contacts', 1)
            ->assertJsonPath('customers', 1);
    }
}
