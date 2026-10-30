<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Company;
use App\Models\Product;
use App\Models\PurchaseInvoice;
use App\Models\PurchaseInvoiceItem;
use App\Models\Supplier;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PurchaseInvoiceDateAndFilterTest extends TestCase
{
    use RefreshDatabase;
    use InteractsWithPermissions;

    public function test_purchase_invoice_date_serialized_as_exact_ymd_without_timezone_drift(): void
    {
        $company = Company::create([
            'name' => 'Nixa ERP',
            'code' => 'NIXA',
            'email' => 'hello@nixaerp.com',
            'phone' => '9999999999',
            'active' => true,
        ]);

        $supplier = Supplier::create([
            'company_id' => $company->id,
            'name' => 'Alpha Suppliers Pvt Ltd',
            'email' => 'alpha@example.com',
            'phone' => '9888888888',
        ]);

        $purchase = PurchaseInvoice::create([
            'company_id' => $company->id,
            'supplier_id' => $supplier->id,
            'purchase_number' => 'PUR-2026-TEST01',
            'purchase_date' => '2026-10-28',
            'invoice_date' => '2026-10-28',
            'due_date' => '2026-11-15',
            'subtotal' => 1000.00,
            'grand_total' => 1180.00,
            'paid_amount' => 1180.00,
            'status' => 'ordered',
            'payment_status' => 'Paid',
        ]);

        // 1. Eloquent array serialization MUST return YYYY-MM-DD
        $array = $purchase->fresh()->toArray();
        $this->assertSame('2026-10-28', $array['purchase_date']);
        $this->assertSame('2026-10-28', $array['invoice_date']);
        $this->assertSame('2026-11-15', $array['due_date']);

        // 2. API index endpoint returns exact date string
        $user = User::factory()->create([
            'company_id' => $company->id,
            'email' => 'admin_purchase_test@example.com',
        ]);

        $res = $this->actingAsWithPermissions($user, ['view purchase invoices'])
            ->getJson('/api/purchase-invoices');

        $res->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.0.purchase_date', '2026-10-28');
    }

    public function test_purchase_invoices_filters_on_backend(): void
    {
        $company = Company::create([
            'name' => 'Nixa ERP',
            'code' => 'NIXA',
            'email' => 'hello@nixaerp.com',
            'phone' => '9999999999',
            'active' => true,
        ]);

        $supplierA = Supplier::create([
            'company_id' => $company->id,
            'name' => 'Tech Supplies Corp',
            'email' => 'tech@example.com',
        ]);

        $supplierB = Supplier::create([
            'company_id' => $company->id,
            'name' => 'Steel Traders',
            'email' => 'steel@example.com',
        ]);

        PurchaseInvoice::create([
            'company_id' => $company->id,
            'supplier_id' => $supplierA->id,
            'purchase_number' => 'PUR-2026-OCT15',
            'bill_number' => 'BILL-1001',
            'purchase_date' => '2026-10-15',
            'subtotal' => 5000.00,
            'grand_total' => 5900.00,
            'paid_amount' => 5900.00,
            'status' => 'ordered',
            'payment_status' => 'Paid',
        ]);

        PurchaseInvoice::create([
            'company_id' => $company->id,
            'supplier_id' => $supplierB->id,
            'purchase_number' => 'PUR-2026-OCT28',
            'bill_number' => 'BILL-1002',
            'purchase_date' => '2026-10-28',
            'subtotal' => 3000.00,
            'grand_total' => 3540.00,
            'paid_amount' => 0.00,
            'status' => 'draft',
            'payment_status' => 'Unpaid',
        ]);

        $user = User::factory()->create([
            'company_id' => $company->id,
            'email' => 'admin_filter_test@example.com',
        ]);

        // Filter by date range (from 2026-10-20 to 2026-10-31)
        $resDate = $this->actingAsWithPermissions($user, ['view purchase invoices'])
            ->getJson('/api/purchase-invoices?date_from=2026-10-20&date_to=2026-10-31');
        $resDate->assertStatus(200);
        $this->assertCount(1, $resDate->json('data'));
        $this->assertSame('PUR-2026-OCT28', $resDate->json('data.0.purchase_number'));

        // Filter by payment_status Unpaid
        $resUnpaid = $this->actingAsWithPermissions($user, ['view purchase invoices'])
            ->getJson('/api/purchase-invoices?payment_status=Unpaid');
        $resUnpaid->assertStatus(200);
        $this->assertCount(1, $resUnpaid->json('data'));
        $this->assertSame('PUR-2026-OCT28', $resUnpaid->json('data.0.purchase_number'));

        // Filter by search query (supplier name or bill number)
        $resSearch = $this->actingAsWithPermissions($user, ['view purchase invoices'])
            ->getJson('/api/purchase-invoices?search=Tech+Supplies');
        $resSearch->assertStatus(200);
        $this->assertCount(1, $resSearch->json('data'));
        $this->assertSame('PUR-2026-OCT15', $resSearch->json('data.0.purchase_number'));
    }
}
