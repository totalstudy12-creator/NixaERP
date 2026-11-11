<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Company;
use App\Models\Customer;
use App\Models\DeliveryArea;
use App\Models\DeliveryCostAllocation;
use App\Models\DeliveryDriver;
use App\Models\DeliveryOrder;
use App\Models\DeliveryTrip;
use App\Models\DeliveryVehicle;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\Product;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\DeliveryCostService;
use App\Services\DeliveryService;
use Database\Seeders\CanonicalPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DeliveryManagementTest extends TestCase
{
    use RefreshDatabase;
    use InteractsWithPermissions;

    protected User $adminUser;
    protected Company $company;
    protected Branch $branch;
    protected Warehouse $warehouse;
    protected Customer $customerA;
    protected Customer $customerB;
    protected Product $productChair;
    protected Product $productTable;
    protected Invoice $invoiceA;
    protected Invoice $invoiceB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(CanonicalPermissionsSeeder::class);

        // Setup base fixtures
        $this->company = Company::create([
            'name' => 'Nixa Logistics Tent & Event Wholesale',
            'code' => 'NIXA-LOG',
            'active' => true,
        ]);

        $this->branch = Branch::create([
            'company_id' => $this->company->id,
            'name' => 'Kashichak Central Godown',
            'code' => 'BR-KCK',
            'active' => true,
        ]);

        $this->warehouse = Warehouse::create([
            'company_id' => $this->company->id,
            'branch_id' => $this->branch->id,
            'name' => 'Main Godown 1',
            'code' => 'GDN-01',
            'active' => true,
        ]);

        $this->customerA = Customer::create([
            'company_id' => $this->company->id,
            'branch_id' => $this->branch->id,
            'name' => 'Ramesh Tent House Kashichak',
            'phone' => '9876543210',
            'billing_city' => 'Kashichak',
        ]);

        $this->customerB = Customer::create([
            'company_id' => $this->company->id,
            'branch_id' => $this->branch->id,
            'name' => 'Verma Decorators Warisaliganj',
            'phone' => '9876543211',
            'billing_city' => 'Warisaliganj',
        ]);

        $this->productChair = Product::create([
            'company_id' => $this->company->id,
            'branch_id' => $this->branch->id,
            'sku' => 'CHAIR-FIBER-01',
            'name' => 'Fiber Armless Banquet Chair',
            'unit' => 'pcs',
            'sale_price' => 450,
            'stock_quantity' => 1000,
        ]);

        $this->productTable = Product::create([
            'company_id' => $this->company->id,
            'branch_id' => $this->branch->id,
            'sku' => 'TABLE-ROUND-01',
            'name' => 'Round Catering Table 5ft',
            'unit' => 'pcs',
            'sale_price' => 1800,
            'stock_quantity' => 200,
        ]);

        // Invoices
        $this->invoiceA = Invoice::create([
            'company_id' => $this->company->id,
            'branch_id' => $this->branch->id,
            'customer_id' => $this->customerA->id,
            'invoice_no' => 'INV-TEST-DEL-001',
            'customer_name' => $this->customerA->name,
            'billing_city' => 'Kashichak',
            'shipping_city' => 'Kashichak',
            'contact_no' => $this->customerA->phone,
            'total_amount' => 22500,
            'status' => 'pending',
            'invoice_date' => now()->toDateString(),
            'due_date' => now()->addDays(7)->toDateString(),
        ]);

        InvoiceItem::create([
            'invoice_id' => $this->invoiceA->id,
            'product_id' => $this->productChair->id,
            'quantity' => 50,
            'unit_price' => 450,
            'subtotal' => 22500,
            'total' => 22500,
        ]);

        $this->invoiceB = Invoice::create([
            'company_id' => $this->company->id,
            'branch_id' => $this->branch->id,
            'customer_id' => $this->customerB->id,
            'invoice_no' => 'INV-TEST-DEL-002',
            'customer_name' => $this->customerB->name,
            'billing_city' => 'Warisaliganj',
            'shipping_city' => 'Warisaliganj',
            'contact_no' => $this->customerB->phone,
            'total_amount' => 18000,
            'status' => 'pending',
            'invoice_date' => now()->toDateString(),
            'due_date' => now()->addDays(7)->toDateString(),
        ]);

        InvoiceItem::create([
            'invoice_id' => $this->invoiceB->id,
            'product_id' => $this->productTable->id,
            'quantity' => 10,
            'unit_price' => 1800,
            'subtotal' => 18000,
            'total' => 18000,
        ]);

        $this->adminUser = User::create([
            'name' => 'Logistics Manager',
            'email' => 'admin-logistics@example.com',
            'password' => bcrypt('password'),
            'company_id' => $this->company->id,
            'branch_id' => $this->branch->id,
        ]);
    }

    public function test_create_delivery_order_from_sales_invoice(): void
    {
        $service = app(DeliveryService::class);

        $order = $service->createOrUpdateDeliveryOrder($this->invoiceA, [
            'delivery_type' => 'nearby_town',
            'district' => 'Nawada',
            'town' => 'Kashichak',
            'delivery_address' => 'Station Road, Near High School, Kashichak',
            'expected_delivery_date' => now()->addDay()->toDateString(),
        ], $this->adminUser);

        $this->assertInstanceOf(DeliveryOrder::class, $order);
        $this->assertEquals($this->invoiceA->id, $order->invoice_id);
        $this->assertEquals($this->customerA->id, $order->customer_id);
        $this->assertEquals(50, $order->total_quantity);
        $this->assertEquals('delivery_pending', $order->status);
        $this->assertCount(1, $order->items);
        $this->assertEquals(50, $order->items->first()->requested_quantity);
    }

    public function test_delivery_address_update_does_not_mutate_customer_master(): void
    {
        $service = app(DeliveryService::class);

        $order = $service->createOrUpdateDeliveryOrder($this->invoiceA, [
            'delivery_address' => 'Temporary Event Ground, Ward 4, Kashichak',
            'town' => 'Kashichak',
        ], $this->adminUser);

        $this->assertEquals('Temporary Event Ground, Ward 4, Kashichak', $order->delivery_address);

        // Customer master address remains pristine
        $this->customerA->refresh();
        $this->assertNotEquals('Temporary Event Ground, Ward 4, Kashichak', $this->customerA->address);
    }

    public function test_create_trip_combining_multiple_customer_invoices(): void
    {
        $service = app(DeliveryService::class);

        $orderA = $service->createOrUpdateDeliveryOrder($this->invoiceA, [
            'town' => 'Kashichak',
            'expected_delivery_date' => now()->addDay()->toDateString(),
        ], $this->adminUser);

        $orderB = $service->createOrUpdateDeliveryOrder($this->invoiceB, [
            'town' => 'Warisaliganj',
            'expected_delivery_date' => now()->addDay()->toDateString(),
        ], $this->adminUser);

        $vehicle = DeliveryVehicle::create([
            'company_id' => $this->company->id,
            'branch_id' => $this->branch->id,
            'vehicle_code' => 'TOTO-01',
            'registration_number' => 'BR-27-E-1001',
            'name' => 'Electric Carrier TOTO 1',
            'type' => 'toto',
            'max_capacity' => 1000,
            'capacity_unit' => 'pieces',
        ]);

        $driver = DeliveryDriver::create([
            'company_id' => $this->company->id,
            'name' => 'Sunil Kumar Driver',
            'contact_number' => '9988776655',
        ]);

        $trip = $service->createTrip([
            'delivery_order_ids' => [$orderA->id, $orderB->id],
            'vehicle_id' => $vehicle->id,
            'driver_id' => $driver->id,
            'planned_date' => now()->addDay()->toDateString(),
            'transport_cost' => 1500,
        ], $this->adminUser);

        $this->assertInstanceOf(DeliveryTrip::class, $trip);
        $this->assertEquals(2, $trip->total_customers);
        $this->assertEquals(60, $trip->total_quantity); // 50 chairs + 10 tables
        $this->assertEquals('vehicle_assigned', $trip->status);
        $this->assertCount(2, $trip->stops);

        // Check vehicle status transitioned to assigned
        $vehicle->refresh();
        $this->assertEquals('assigned', $vehicle->status);

        // Check loading items generated
        $this->assertCount(2, $trip->loadingItems);
    }

    public function test_prevent_vehicle_overlapping_trip_conflicts(): void
    {
        $service = app(DeliveryService::class);

        $orderA = $service->createOrUpdateDeliveryOrder($this->invoiceA, [], $this->adminUser);
        $orderB = $service->createOrUpdateDeliveryOrder($this->invoiceB, [], $this->adminUser);

        $vehicle = DeliveryVehicle::create([
            'company_id' => $this->company->id,
            'vehicle_code' => '4W-01',
            'registration_number' => 'BR-21-G-4001',
            'name' => 'Mahindra Bolero Maxi Truck',
            'type' => 'four_wheeler',
            'max_capacity' => 2000,
            'capacity_unit' => 'kg',
        ]);

        $driver = DeliveryDriver::create([
            'company_id' => $this->company->id,
            'name' => 'Manoj Driver',
            'contact_number' => '9888877777',
        ]);

        $tomorrow = now()->addDay()->toDateString();

        // Create first trip
        $service->createTrip([
            'delivery_order_ids' => [$orderA->id],
            'vehicle_id' => $vehicle->id,
            'driver_id' => $driver->id,
            'planned_date' => $tomorrow,
            'planned_departure' => "{$tomorrow} 09:00:00",
            'expected_return' => "{$tomorrow} 15:00:00",
        ], $this->adminUser);

        // Second trip overlapping time window must throw conflict exception
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessageMatches('/Vehicle assignment conflict/i');

        $service->createTrip([
            'delivery_order_ids' => [$orderB->id],
            'vehicle_id' => $vehicle->id,
            'planned_date' => $tomorrow,
            'planned_departure' => "{$tomorrow} 12:00:00",
            'expected_return' => "{$tomorrow} 18:00:00",
        ], $this->adminUser);
    }

    public function test_transport_cost_allocation_equal_and_deterministic_rounding(): void
    {
        $deliveryService = app(DeliveryService::class);
        $costService = app(DeliveryCostService::class);

        $orderA = $deliveryService->createOrUpdateDeliveryOrder($this->invoiceA, [], $this->adminUser);
        $orderB = $deliveryService->createOrUpdateDeliveryOrder($this->invoiceB, [], $this->adminUser);

        $trip = $deliveryService->createTrip([
            'delivery_order_ids' => [$orderA->id, $orderB->id],
            'planned_date' => now()->addDay()->toDateString(),
        ], $this->adminUser);

        // Total cost: 1500.50 INR across 2 customers => 750.25 each
        $allocations = $costService->calculateAndAllocate($trip, 1500.50, 'equal', null, $this->adminUser);

        $this->assertCount(2, $allocations);
        $sum = array_sum(array_column($allocations, 'final_allocated_amount'));
        $this->assertEquals(1500.50, $sum);

        // Test with 3 customers and non-divisible amount e.g. 1000 INR
        // 1000 / 3 = 333.34, 333.33, 333.33 => sum = 1000.00
        $inv1 = Invoice::create([
            'company_id' => $this->company->id,
            'branch_id' => $this->branch->id,
            'customer_id' => $this->customerA->id,
            'invoice_no' => 'INV-TRIP3-01',
            'total_amount' => 5000,
            'invoice_date' => now()->toDateString(),
            'due_date' => now()->toDateString(),
        ]);
        InvoiceItem::create([
            'invoice_id' => $inv1->id,
            'product_id' => $this->productChair->id,
            'quantity' => 10,
            'unit_price' => 500,
            'subtotal' => 5000,
            'total' => 5000,
        ]);
        $inv2 = Invoice::create([
            'company_id' => $this->company->id,
            'branch_id' => $this->branch->id,
            'customer_id' => $this->customerB->id,
            'invoice_no' => 'INV-TRIP3-02',
            'total_amount' => 5000,
            'invoice_date' => now()->toDateString(),
            'due_date' => now()->toDateString(),
        ]);
        InvoiceItem::create([
            'invoice_id' => $inv2->id,
            'product_id' => $this->productChair->id,
            'quantity' => 10,
            'unit_price' => 500,
            'subtotal' => 5000,
            'total' => 5000,
        ]);
        $inv3 = Invoice::create([
            'company_id' => $this->company->id,
            'branch_id' => $this->branch->id,
            'customer_id' => $this->customerA->id,
            'invoice_no' => 'INV-TRIP3-03',
            'total_amount' => 5000,
            'invoice_date' => now()->toDateString(),
            'due_date' => now()->toDateString(),
        ]);
        InvoiceItem::create([
            'invoice_id' => $inv3->id,
            'product_id' => $this->productChair->id,
            'quantity' => 10,
            'unit_price' => 500,
            'subtotal' => 5000,
            'total' => 5000,
        ]);

        $ord1 = $deliveryService->createOrUpdateDeliveryOrder($inv1, [], $this->adminUser);
        $ord2 = $deliveryService->createOrUpdateDeliveryOrder($inv2, [], $this->adminUser);
        $ord3 = $deliveryService->createOrUpdateDeliveryOrder($inv3, [], $this->adminUser);

        $trip3 = $deliveryService->createTrip([
            'delivery_order_ids' => [$ord1->id, $ord2->id, $ord3->id],
            'planned_date' => now()->addDays(2)->toDateString(),
        ], $this->adminUser);

        $alloc3 = $costService->calculateAndAllocate($trip3, 1000.00, 'equal', null, $this->adminUser);
        $this->assertCount(3, $alloc3);
        $sum3 = array_sum(array_column($alloc3, 'final_allocated_amount'));
        $this->assertEquals(1000.00, $sum3); // Exact to the paisa

        // Check sales invoices total amounts were NOT modified
        $this->invoiceA->refresh();
        $this->invoiceB->refresh();
        $this->assertEquals(22500, (float) $this->invoiceA->total_amount);
        $this->assertEquals(18000, (float) $this->invoiceB->total_amount);
    }

    public function test_partial_delivery_and_independent_invoice_status(): void
    {
        $deliveryService = app(DeliveryService::class);

        $orderA = $deliveryService->createOrUpdateDeliveryOrder($this->invoiceA, [], $this->adminUser);
        $orderB = $deliveryService->createOrUpdateDeliveryOrder($this->invoiceB, [], $this->adminUser);

        $vehicle = DeliveryVehicle::create([
            'company_id' => $this->company->id,
            'vehicle_code' => 'TOTO-02',
            'registration_number' => 'BR-27-E-2002',
            'name' => 'Carrier TOTO 2',
            'type' => 'toto',
            'max_capacity' => 1000,
            'capacity_unit' => 'pieces',
        ]);
        $driver = DeliveryDriver::create([
            'company_id' => $this->company->id,
            'name' => 'Ajay Driver',
            'contact_number' => '9777766666',
        ]);

        $trip = $deliveryService->createTrip([
            'delivery_order_ids' => [$orderA->id, $orderB->id],
            'vehicle_id' => $vehicle->id,
            'driver_id' => $driver->id,
            'planned_date' => now()->addDay()->toDateString(),
        ], $this->adminUser);

        // Confirm loading
        foreach ($trip->loadingItems as $li) {
            $deliveryService->updateLoadingItem($li, (float) $li->planned_quantity, $this->adminUser);
        }
        $deliveryService->confirmLoading($trip, $this->adminUser);

        // Dispatch
        $deliveryService->dispatchTrip($trip, ['odometer_start' => 12450], $this->adminUser);

        // Customer A: Partial delivery (30 chairs delivered out of 50 requested)
        $chairItem = $orderA->items->first();
        $deliveryService->confirmDelivery($orderA, [
            'status' => 'partially_delivered',
            'receiver_name' => 'Ramesh Ji',
            'items' => [
                $chairItem->id => [
                    'delivered_quantity' => 30,
                    'returned_quantity' => 20,
                ],
            ],
            'remarks' => 'Remaining 20 chairs refused due to venue space constraint',
        ], $this->adminUser);

        $orderA->refresh();
        $this->assertEquals('partially_delivered', $orderA->status);
        $chairItem->refresh();
        $this->assertEquals(30, (float) $chairItem->delivered_quantity);
        $this->assertEquals(20, (float) $chairItem->pending_quantity);

        // Customer B: Full delivery (10 tables delivered)
        $deliveryService->confirmDelivery($orderB, [
            'status' => 'delivered',
            'receiver_name' => 'Verma Ji',
        ], $this->adminUser);

        $orderB->refresh();
        $this->assertEquals('delivered', $orderB->status);

        // Customer A's partial delivery did NOT affect Customer B's successful delivery
        $this->assertEquals('delivered', $orderB->status);
        $this->assertEquals('partially_delivered', $orderA->status);

        // Close trip
        $deliveryService->closeTrip($trip, ['odometer_end' => 12485], $this->adminUser);
        $trip->refresh();
        $this->assertEquals('closed', $trip->status);

        // Vehicle and driver released to available
        $vehicle->refresh();
        $driver->refresh();
        $this->assertEquals('available', $vehicle->status);
        $this->assertEquals('available', $driver->status);
    }

    public function test_api_deliveries_endpoints_with_permissions(): void
    {
        $response = $this->actingAsWithPermissions($this->adminUser, ['delivery.orders.view'])
            ->getJson('/api/deliveries/dashboard');

        $response->assertStatus(200)
            ->assertJsonFragment(['status' => 'success']);

        $responseAreas = $this->actingAsWithPermissions($this->adminUser, ['delivery.orders.view'])
            ->getJson('/api/deliveries/areas');

        $responseAreas->assertStatus(200)
            ->assertJsonFragment(['name' => 'Kashichak']);
    }

    public function test_capacity_validation_and_authorized_override(): void
    {
        $deliveryService = app(DeliveryService::class);

        // Small carrier with max capacity 10 pcs
        $smallToto = DeliveryVehicle::create([
            'company_id' => $this->company->id,
            'vehicle_code' => 'TOTO-MINI-01',
            'registration_number' => 'BR-27-E-9999',
            'name' => 'Mini Electric Toto',
            'type' => 'toto',
            'max_capacity' => 10,
            'capacity_unit' => 'pieces',
        ]);

        $order = $deliveryService->createOrUpdateDeliveryOrder($this->invoiceA, [], $this->adminUser); // 50 chairs

        // Attempting to assign 50 chairs to 10 pcs vehicle without override must fail
        try {
            $deliveryService->createTrip([
                'delivery_order_ids' => [$order->id],
                'vehicle_id' => $smallToto->id,
                'planned_date' => now()->addDay()->toDateString(),
            ], $this->adminUser);
            $this->fail('Expected capacity exception was not thrown');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('Load exceeds vehicle maximum piece capacity', $e->getMessage());
        }

        // With authorized override and reason, trip creation succeeds
        $tripWithOverride = $deliveryService->createTrip([
            'delivery_order_ids' => [$order->fresh()->id],
            'vehicle_id' => $smallToto->id,
            'planned_date' => now()->addDay()->toDateString(),
            'capacity_override' => true,
            'capacity_override_reason' => 'Lightweight fiber chairs stacked safely within physical body frame',
        ], $this->adminUser);

        $this->assertTrue($tripWithOverride->capacity_override);
        $this->assertEquals('Lightweight fiber chairs stacked safely within physical body frame', $tripWithOverride->capacity_override_reason);
    }

    public function test_reorder_trip_stops_sequence(): void
    {
        $deliveryService = app(DeliveryService::class);

        $orderA = $deliveryService->createOrUpdateDeliveryOrder($this->invoiceA, [], $this->adminUser);
        $orderB = $deliveryService->createOrUpdateDeliveryOrder($this->invoiceB, [], $this->adminUser);

        $trip = $deliveryService->createTrip([
            'delivery_order_ids' => [$orderA->id, $orderB->id],
            'planned_date' => now()->addDay()->toDateString(),
        ], $this->adminUser);

        $stops = $trip->stops;
        $this->assertEquals(1, $stops[0]->stop_sequence);
        $this->assertEquals(2, $stops[1]->stop_sequence);

        // Reverse stop order (Customer B before Customer A)
        $deliveryService->reorderTripStops($trip, [$stops[1]->id, $stops[0]->id], $this->adminUser);

        $reordered = $trip->fresh(['stops'])->stops;
        $this->assertEquals($stops[1]->id, $reordered[0]->id);
        $this->assertEquals(1, $reordered[0]->stop_sequence);
        $this->assertEquals($stops[0]->id, $reordered[1]->id);
        $this->assertEquals(2, $reordered[1]->stop_sequence);
    }

    public function test_csv_report_export_with_formula_injection_defense(): void
    {
        // Create an order with formula characters
        $service = app(DeliveryService::class);
        $invSpecial = Invoice::create([
            'company_id' => $this->company->id,
            'branch_id' => $this->branch->id,
            'customer_id' => $this->customerA->id,
            'invoice_no' => '=cmd|/c calc!A0',
            'customer_name' => '@Malicious Formula',
            'total_amount' => 100,
            'invoice_date' => now()->toDateString(),
            'due_date' => now()->toDateString(),
        ]);
        InvoiceItem::create([
            'invoice_id' => $invSpecial->id,
            'product_id' => $this->productChair->id,
            'quantity' => 1,
            'unit_price' => 100,
            'subtotal' => 100,
            'total' => 100,
        ]);
        $service->createOrUpdateDeliveryOrder($invSpecial, [
            'recipient_name' => '+447000000000',
            'town' => '-MinusTown',
        ], $this->adminUser);

        $response = $this->actingAsWithPermissions($this->adminUser, ['delivery.reports.export'])
            ->get('/api/deliveries/reports/export?type=daily');

        $response->assertStatus(200);
        $this->assertStringContainsString('text/csv', strtolower((string) $response->headers->get('content-type')));

        // Capture streamed content
        ob_start();
        $response->sendContent();
        $csvContent = ob_get_clean();

        // Formula characters must be sanitized with single quote prefix
        $this->assertStringContainsString("'+447000000000", $csvContent);
        $this->assertStringContainsString("'-MinusTown", $csvContent);
        $this->assertStringContainsString("'=cmd|/c calc!A0", $csvContent);
    }
}
