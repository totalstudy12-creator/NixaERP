<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Company;
use App\Models\Customer;
use App\Models\DeliveryDriver;
use App\Models\DeliveryVehicle;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\Product;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\DeliveryService;
use Database\Seeders\CanonicalPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class InvoiceDeliveryStatusSyncTest extends TestCase
{
    use RefreshDatabase;
    use InteractsWithPermissions;

    private User $admin;
    private Company $company;
    private Branch $branch;
    private Warehouse $warehouse;
    private Customer $customer;
    private Product $product1;
    private Product $product2;
    private DeliveryVehicle $vehicle;
    private DeliveryDriver $driver;
    private DeliveryService $deliveryService;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(CanonicalPermissionsSeeder::class);

        $this->deliveryService = app(DeliveryService::class);

        $this->company = Company::create([
            'name' => 'Sync Delivery Corp',
            'code' => 'SYNC-CORP',
            'email' => 'sync-test@raptorerp.local',
            'phone' => '9988776655',
        ]);

        $this->branch = Branch::create([
            'company_id' => $this->company->id,
            'name' => 'Main Depot',
            'code' => 'DEPOT-1',
            'address' => 'Station Road, Nawada',
            'phone' => '9988776655',
        ]);

        $this->warehouse = Warehouse::create([
            'company_id' => $this->company->id,
            'branch_id' => $this->branch->id,
            'name' => 'Central Godown',
            'code' => 'WH-SYNC-01',
            'active' => true,
        ]);

        $this->admin = User::create([
            'name' => 'Admin Sync Tester',
            'email' => 'admin-sync@raptorerp.local',
            'password' => bcrypt('password123'),
            'company_id' => $this->company->id,
            'branch_id' => $this->branch->id,
        ]);

        $this->customer = Customer::create([
            'company_id' => $this->company->id,
            'name' => 'Kashichak Retailer',
            'phone' => '9123456789',
            'billing_city' => 'Kashichak',
            'shipping_city' => 'Kashichak',
        ]);

        $this->product1 = Product::create([
            'company_id' => $this->company->id,
            'name' => 'Electric Motor 1HP',
            'sku' => 'SKU-SYNC-1',
            'price' => 5000,
            'unit' => 'pcs',
        ]);

        $this->product2 = Product::create([
            'company_id' => $this->company->id,
            'name' => 'Submersible Cable 50m',
            'sku' => 'SKU-SYNC-2',
            'price' => 1500,
            'unit' => 'pcs',
        ]);

        $this->vehicle = DeliveryVehicle::create([
            'company_id' => $this->company->id,
            'branch_id' => $this->branch->id,
            'vehicle_code' => 'SYNC-VEH-1',
            'name' => 'E-Loader 01',
            'registration_number' => 'BR-21-SYNC-01',
            'type' => 'toto',
            'max_capacity' => 1000,
            'capacity_unit' => 'kg',
            'status' => 'available',
        ]);

        $this->driver = DeliveryDriver::create([
            'company_id' => $this->company->id,
            'branch_id' => $this->branch->id,
            'name' => 'Ramesh Driver',
            'contact_number' => '9876543210',
            'status' => 'available',
        ]);
    }

    private function createSampleInvoice(): Invoice
    {
        $invoice = Invoice::create([
            'company_id' => $this->company->id,
            'branch_id' => $this->branch->id,
            'customer_id' => $this->customer->id,
            'invoice_no' => 'INV-TEST-' . uniqid(),
            'total_amount' => 11500,
            'subtotal' => 11500,
            'tax_amount' => 0,
            'status' => 'approved',
            'delivery_status' => 'pending',
            'invoice_date' => now()->toDateString(),
            'due_date' => now()->addDays(7)->toDateString(),
        ]);

        InvoiceItem::create([
            'invoice_id' => $invoice->id,
            'product_id' => $this->product1->id,
            'quantity' => 2,
            'unit_price' => 5000,
            'subtotal' => 10000,
            'total' => 10000,
            'delivery_status' => 'pending',
            'packed_quantity' => 0,
            'delivered_quantity' => 0,
        ]);

        InvoiceItem::create([
            'invoice_id' => $invoice->id,
            'product_id' => $this->product2->id,
            'quantity' => 1,
            'unit_price' => 1500,
            'subtotal' => 1500,
            'total' => 1500,
            'delivery_status' => 'pending',
            'packed_quantity' => 0,
            'delivered_quantity' => 0,
        ]);

        return $invoice;
    }

    public function test_logistics_delivery_lifecycle_updates_invoice_and_item_statuses(): void
    {
        $invoice = $this->createSampleInvoice();
        $this->assertEquals('pending', $invoice->delivery_status);
        $this->assertEquals('pending', $invoice->items->first()->delivery_status);

        // 1. Create delivery order for invoice
        $deliveryOrder = $this->deliveryService->createOrUpdateDeliveryOrder($invoice, [
            'town' => 'Kashichak',
            'delivery_address' => 'Station Road Shop #4',
        ], $this->admin);

        $this->assertEquals('delivery_pending', $deliveryOrder->status);

        // 2. Schedule Trip
        $trip = $this->deliveryService->createTrip([
            'delivery_order_ids' => [$deliveryOrder->id],
            'vehicle_id' => $this->vehicle->id,
            'driver_id' => $this->driver->id,
            'source_warehouse_id' => $this->warehouse->id,
            'planned_date' => now()->toDateString(),
        ], $this->admin);

        // 3. Confirm Godown Loading -> Should transition invoice and items to 'packed'
        $trip = $this->deliveryService->confirmLoading($trip, $this->admin);
        $invoice->refresh();
        $invoice->load('items');

        $this->assertEquals('packed', $invoice->delivery_status);
        $this->assertNotNull($invoice->packed_at);
        $this->assertEquals('packed', $invoice->items[0]->delivery_status);
        $this->assertEquals('packed', $invoice->items[1]->delivery_status);

        // 4. Dispatch Vehicle -> Should transition invoice and items to 'sent'
        $trip = $this->deliveryService->dispatchTrip($trip, [
            'odometer_start' => 1250,
        ], $this->admin);

        $invoice->refresh();
        $invoice->load('items');
        $this->assertEquals('sent', $invoice->delivery_status);
        $this->assertNotNull($invoice->dispatched_at);
        $this->assertEquals('sent', $invoice->items[0]->delivery_status);
        $this->assertEquals('sent', $invoice->items[1]->delivery_status);

        // 5. Confirm Delivery -> Should transition invoice and items to 'delivered'
        $attempt = $this->deliveryService->confirmDelivery($deliveryOrder, [
            'status' => 'delivered',
            'receiver_name' => 'Kashichak Retailer Owner',
            'receiver_phone' => '9123456789',
        ], $this->admin);

        $invoice->refresh();
        $invoice->load('items');
        $this->assertEquals('delivered', $invoice->delivery_status);
        $this->assertNotNull($invoice->delivered_at);
        $this->assertEquals('delivered', $invoice->items[0]->delivery_status);
        $this->assertEquals(2, (float)$invoice->items[0]->delivered_quantity);
        $this->assertEquals('delivered', $invoice->items[1]->delivery_status);
        $this->assertEquals(1, (float)$invoice->items[1]->delivered_quantity);
    }

    public function test_invoice_api_update_delivery_status_endpoint(): void
    {
        $invoice = $this->createSampleInvoice();

        $response = $this->actingAsWithPermissions($this->admin, ['edit invoices', 'invoices.update'])
            ->patchJson("/api/invoices/{$invoice->id}/delivery-status", [
                'delivery_status' => 'delivered',
            ]);

        $response->assertStatus(200);
        $response->assertJson([
            'status' => 'success',
        ]);

        $invoice->refresh();
        $invoice->load('items');
        $this->assertEquals('delivered', $invoice->delivery_status);
        $this->assertEquals('delivered', $invoice->items[0]->delivery_status);
        $this->assertEquals('delivered', $invoice->items[1]->delivery_status);
    }

    public function test_individual_item_delivery_status_update(): void
    {
        $invoice = $this->createSampleInvoice();
        $item1 = $invoice->items[0];

        $response = $this->actingAsWithPermissions($this->admin, ['edit invoices', 'invoices.update'])
            ->patchJson("/api/invoices/{$invoice->id}/items/{$item1->id}/delivery-status", [
                'delivery_status' => 'packed',
                'packed_quantity' => 2,
            ]);

        $response->assertStatus(200);
        $item1->refresh();
        $this->assertEquals('packed', $item1->delivery_status);
        $this->assertEquals(2, (float)$item1->packed_quantity);

        $invoice->refresh();
        $this->assertEquals('packed', $invoice->delivery_status);
    }
}
