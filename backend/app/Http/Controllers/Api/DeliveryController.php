<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DeliveryArea;
use App\Models\DeliveryCostAllocation;
use App\Models\DeliveryDriver;
use App\Models\DeliveryLoadingItem;
use App\Models\DeliveryOrder;
use App\Models\DeliveryStatusHistory;
use App\Models\DeliveryTrip;
use App\Models\DeliveryTripStop;
use App\Models\DeliveryVehicle;
use App\Models\Invoice;
use App\Services\DeliveryCostService;
use App\Services\DeliveryService;
use Carbon\Carbon;
use Exception;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;

class DeliveryController extends Controller
{
    protected DeliveryService $deliveryService;
    protected DeliveryCostService $costService;

    public function __construct(DeliveryService $deliveryService, DeliveryCostService $costService)
    {
        $this->deliveryService = $deliveryService;
        $this->costService = $costService;
    }

    /**
     * Logistics Dashboard with operational metrics and filters.
     */
    public function dashboard(Request $request): JsonResponse
    {
        $today = now()->toDateString();
        $companyId = $request->input('company_id');
        $branchId = $request->input('branch_id');

        $orderQuery = DeliveryOrder::query();
        $tripQuery = DeliveryTrip::query();
        $vehicleQuery = DeliveryVehicle::query();

        if ($companyId) {
            $orderQuery->where('company_id', $companyId);
            $tripQuery->where('company_id', $companyId);
            $vehicleQuery->where('company_id', $companyId);
        }
        if ($branchId) {
            $orderQuery->where('branch_id', $branchId);
            $tripQuery->where('branch_id', $branchId);
            $vehicleQuery->where('branch_id', $branchId);
        }

        // Metrics
        $scheduledToday = (clone $orderQuery)->whereDate('expected_delivery_date', $today)->count();
        $pendingDeliveries = (clone $orderQuery)->whereIn('status', ['delivery_pending', 'scheduled', 'vehicle_assigned'])->count();
        $overdueDeliveries = (clone $orderQuery)->where('expected_delivery_date', '<', $today)->whereNotIn('status', ['delivered', 'cancelled'])->count();
        
        $activeTrips = (clone $tripQuery)->whereIn('status', ['vehicle_assigned', 'loading_in_progress', 'ready_for_dispatch', 'dispatched', 'in_transit'])->count();
        $dispatchedTrips = (clone $tripQuery)->whereIn('status', ['dispatched', 'in_transit'])->count();
        $completedToday = (clone $orderQuery)->whereDate('delivery_completed_at', $today)->where('status', 'delivered')->count();
        $failedDeliveries = (clone $orderQuery)->where('status', 'delivery_failed')->count();
        $partialDeliveries = (clone $orderQuery)->where('status', 'partially_delivered')->count();

        // Vehicle stats
        $totalVehicles = (clone $vehicleQuery)->where('is_active', true)->count();
        $availableVehicles = (clone $vehicleQuery)->where('is_active', true)->where('status', 'available')->count();
        $onTripVehicles = (clone $vehicleQuery)->where('status', 'on_trip')->count();
        $maintenanceVehicles = (clone $vehicleQuery)->where('status', 'under_maintenance')->count();

        // Transportation expenditure
        $totalTransportExpenditure = (float) (clone $tripQuery)->sum('transport_cost');
        $totalAllocatedCost = (float) DeliveryCostAllocation::when($companyId, function ($q) use ($companyId) {
            $q->whereHas('trip', fn($sub) => $sub->where('company_id', $companyId));
        })->sum('final_allocated_amount');

        // Recent trips
        $recentTrips = (clone $tripQuery)
            ->with(['vehicle:id,name,registration_number,type', 'driver:id,name,contact_number'])
            ->orderByDesc('id')
            ->limit(5)
            ->get();

        // Pending area breakdown
        $areaBreakdown = (clone $orderQuery)
            ->whereIn('status', ['delivery_pending', 'scheduled', 'vehicle_assigned'])
            ->select('town', 'district', DB::raw('count(*) as count'), DB::raw('sum(total_quantity) as total_qty'))
            ->groupBy('town', 'district')
            ->orderByDesc('count')
            ->limit(8)
            ->get();

        return response()->json([
            'status' => 'success',
            'data' => [
                'metrics' => [
                    'scheduled_today' => $scheduledToday,
                    'pending_deliveries' => $pendingDeliveries,
                    'overdue_deliveries' => $overdueDeliveries,
                    'active_trips' => $activeTrips,
                    'dispatched_trips' => $dispatchedTrips,
                    'completed_today' => $completedToday,
                    'failed_deliveries' => $failedDeliveries,
                    'partial_deliveries' => $partialDeliveries,
                    'total_vehicles' => $totalVehicles,
                    'available_vehicles' => $availableVehicles,
                    'on_trip_vehicles' => $onTripVehicles,
                    'under_maintenance_vehicles' => $maintenanceVehicles,
                    'total_transport_expenditure' => $totalTransportExpenditure,
                    'total_allocated_cost' => $totalAllocatedCost,
                ],
                'recent_trips' => $recentTrips,
                'area_breakdown' => $areaBreakdown,
            ],
        ]);
    }

    /**
     * List delivery orders with full server-side filtering, searching, and pagination.
     */
    public function orders(Request $request): JsonResponse
    {
        $query = DeliveryOrder::with([
            'customer:id,name,phone,email',
            'invoice:id,invoice_no,total_amount,status,due_date',
            'area:id,name,district',
            'currentTrip:id,trip_code,status,vehicle_id,driver_id',
            'currentTrip.vehicle:id,name,registration_number,type',
            'currentTrip.driver:id,name,contact_number',
            'items',
        ])->orderByDesc('id');

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }
        if ($request->filled('priority')) {
            $query->where('priority', $request->input('priority'));
        }
        if ($request->filled('delivery_type')) {
            $query->where('delivery_type', $request->input('delivery_type'));
        }
        if ($request->filled('town')) {
            $query->where('town', $request->input('town'));
        }
        if ($request->filled('district')) {
            $query->where('district', $request->input('district'));
        }
        if ($request->filled('expected_date')) {
            $query->whereDate('expected_delivery_date', $request->input('expected_date'));
        }
        if ($request->filled('date_from') && $request->filled('date_to')) {
            $query->whereBetween('expected_delivery_date', [$request->input('date_from'), $request->input('date_to')]);
        }
        if ($request->filled('company_id')) {
            $query->where('company_id', $request->input('company_id'));
        }
        if ($request->filled('branch_id')) {
            $query->where('branch_id', $request->input('branch_id'));
        }
        if ($request->filled('search')) {
            $search = '%' . $request->input('search') . '%';
            $query->where(function ($q) use ($search) {
                $q->where('delivery_order_no', 'like', $search)
                  ->orWhere('recipient_name', 'like', $search)
                  ->orWhere('recipient_phone', 'like', $search)
                  ->orWhere('delivery_address', 'like', $search)
                  ->orWhereHas('invoice', fn($sub) => $sub->where('invoice_no', 'like', $search))
                  ->orWhereHas('customer', fn($sub) => $sub->where('name', 'like', $search));
            });
        }

        $perPage = min((int) $request->input('per_page', 20), 100);
        $orders = $query->paginate($perPage);

        return response()->json([
            'status' => 'success',
            'data' => $orders,
        ]);
    }

    /**
     * Create delivery order for an existing sales invoice.
     */
    public function createOrder(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'invoice_id' => 'required|exists:invoices,id',
            'delivery_area_id' => 'nullable|exists:delivery_areas,id',
            'delivery_type' => 'nullable|string|in:local,nearby_town,district,special,customer_pickup,other',
            'priority' => 'nullable|string|in:normal,high,urgent',
            'expected_delivery_date' => 'required|date',
            'expected_delivery_time' => 'nullable|string|max:50',
            'recipient_name' => 'nullable|string|max:150',
            'recipient_phone' => 'nullable|string|max:30',
            'delivery_address' => 'nullable|string',
            'district' => 'nullable|string|max:100',
            'town' => 'nullable|string|max:100',
            'landmark' => 'nullable|string|max:150',
            'latitude' => 'nullable|numeric',
            'longitude' => 'nullable|numeric',
            'delivery_instructions' => 'nullable|string',
            'delivery_charge' => 'nullable|numeric|min:0',
            'source_warehouse_id' => 'nullable|exists:warehouses,id',
        ]);

        $invoice = Invoice::findOrFail($validated['invoice_id']);

        try {
            $order = $this->deliveryService->createOrUpdateDeliveryOrder($invoice, $validated, Auth::user());
            return response()->json([
                'status' => 'success',
                'message' => "Delivery order #{$order->delivery_order_no} created successfully.",
                'data' => $order,
            ], 201);
        } catch (Exception $e) {
            return response()->json([
                'status' => 'error',
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Show delivery order details.
     */
    public function showOrder(DeliveryOrder $order): JsonResponse
    {
        $order->load([
            'customer',
            'invoice.items',
            'area',
            'items.product',
            'items.sourceWarehouse',
            'currentTrip.vehicle',
            'currentTrip.driver',
            'attempts.items.product',
        ]);

        return response()->json([
            'status' => 'success',
            'data' => $order,
        ]);
    }

    /**
     * Update delivery order address or details.
     */
    public function updateOrder(Request $request, DeliveryOrder $order): JsonResponse
    {
        $validated = $request->validate([
            'delivery_area_id' => 'nullable|exists:delivery_areas,id',
            'delivery_type' => 'nullable|string',
            'priority' => 'nullable|string|in:normal,high,urgent',
            'recipient_name' => 'nullable|string|max:150',
            'recipient_phone' => 'nullable|string|max:30',
            'delivery_address' => 'nullable|string',
            'district' => 'nullable|string|max:100',
            'town' => 'nullable|string|max:100',
            'landmark' => 'nullable|string|max:150',
            'latitude' => 'nullable|numeric',
            'longitude' => 'nullable|numeric',
            'delivery_instructions' => 'nullable|string',
            'delivery_charge' => 'nullable|numeric|min:0',
        ]);

        $order->update($validated);

        return response()->json([
            'status' => 'success',
            'message' => 'Delivery order updated successfully.',
            'data' => $order->fresh(),
        ]);
    }

    /**
     * Schedule or reschedule delivery date/time.
     */
    public function scheduleOrder(Request $request, DeliveryOrder $order): JsonResponse
    {
        $validated = $request->validate([
            'expected_delivery_date' => 'required|date',
            'expected_delivery_time' => 'nullable|string|max:50',
            'priority' => 'nullable|string|in:normal,high,urgent',
            'delivery_instructions' => 'nullable|string',
            'remarks' => 'nullable|string',
        ]);

        try {
            $updated = $this->deliveryService->scheduleDelivery($order, $validated, Auth::user());
            return response()->json([
                'status' => 'success',
                'message' => 'Delivery successfully scheduled.',
                'data' => $updated,
            ]);
        } catch (Exception $e) {
            return response()->json([
                'status' => 'error',
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Cancel delivery order.
     */
    public function cancelOrder(Request $request, DeliveryOrder $order): JsonResponse
    {
        $validated = $request->validate([
            'reason' => 'required|string|max:255',
        ]);

        try {
            $cancelled = $this->deliveryService->cancelDelivery($order, $validated['reason'], Auth::user());
            return response()->json([
                'status' => 'success',
                'message' => 'Delivery order cancelled.',
                'data' => $cancelled,
            ]);
        } catch (Exception $e) {
            return response()->json([
                'status' => 'error',
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Confirm delivery (full, partial, or failed attempt with receiver proof).
     */
    public function confirmOrder(Request $request, DeliveryOrder $order): JsonResponse
    {
        $validated = $request->validate([
            'status' => 'required|string|in:delivered,partially_delivered,failed',
            'failure_reason' => 'nullable|required_if:status,failed|string|in:customer_unavailable,address_not_found,customer_refused,vehicle_breakdown,damaged_goods,payment_issue,rescheduled_by_customer,other',
            'failure_remarks' => 'nullable|string',
            'receiver_name' => 'nullable|string|max:150',
            'receiver_phone' => 'nullable|string|max:30',
            'receiver_relationship' => 'nullable|string|max:60',
            'signature_url' => 'nullable|string',
            'photo_proof_url' => 'nullable|string',
            'latitude' => 'nullable|numeric',
            'longitude' => 'nullable|numeric',
            'delivery_time' => 'nullable|date',
            'items' => 'nullable|array',
            'items.*.delivered_quantity' => 'nullable|numeric|min:0',
            'items.*.returned_quantity' => 'nullable|numeric|min:0',
            'return_to_warehouse_id' => 'nullable|exists:warehouses,id',
            'remarks' => 'nullable|string',
        ]);

        try {
            $attempt = $this->deliveryService->confirmDelivery($order, $validated, Auth::user());
            return response()->json([
                'status' => 'success',
                'message' => "Delivery confirmation recorded (Result: {$validated['status']}).",
                'data' => $attempt,
            ]);
        } catch (Exception $e) {
            return response()->json([
                'status' => 'error',
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * List carrier vehicles.
     */
    public function vehicles(Request $request): JsonResponse
    {
        $query = DeliveryVehicle::with(['defaultDriver', 'backupDriver'])->orderBy('name');

        if ($request->filled('type')) {
            $query->where('type', $request->input('type'));
        }
        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }
        if ($request->filled('ownership_type')) {
            $query->where('ownership_type', $request->input('ownership_type'));
        }
        if ($request->filled('company_id')) {
            $query->where('company_id', $request->input('company_id'));
        }
        if ($request->filled('search')) {
            $search = '%' . $request->input('search') . '%';
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', $search)
                  ->orWhere('registration_number', 'like', $search)
                  ->orWhere('vehicle_code', 'like', $search)
                  ->orWhere('notes', 'like', $search)
                  ->orWhereHas('defaultDriver', fn($sub) => $sub->where('name', 'like', $search)->orWhere('contact_number', 'like', $search));
            });
        }

        $vehicles = $query->get();

        return response()->json([
            'status' => 'success',
            'data' => $vehicles,
        ]);
    }

    /**
     * Create delivery vehicle.
     */
    public function createVehicle(Request $request): JsonResponse
    {
        if (!$request->filled('company_id')) {
            $request->merge(['company_id' => Auth::user()?->company_id ?? 1]);
        }

        $validated = $request->validate([
            'company_id' => 'required|exists:companies,id',
            'branch_id' => 'nullable|exists:branches,id',
            'vehicle_code' => 'required|string|max:50|unique:delivery_vehicles,vehicle_code',
            'registration_number' => 'required|string|max:50',
            'name' => 'required|string|max:150',
            'type' => 'required|string|in:toto,four_wheeler,carrier,other',
            'category' => 'nullable|string|max:100',
            'max_capacity' => 'required|numeric|min:1',
            'capacity_unit' => 'required|string|in:kg,pieces,cubic_feet,cubic_meters',
            'default_driver_id' => 'nullable|exists:delivery_drivers,id',
            'backup_driver_id' => 'nullable|exists:delivery_drivers,id',
            'ownership_type' => 'nullable|string|in:owned,leased,rented',
            'is_driver_owner' => 'nullable|boolean',
            'notes' => 'nullable|string',
        ]);

        if (!empty($validated['is_driver_owner']) && !empty($validated['default_driver_id'])) {
            $validated['ownership_type'] = 'owned';
            $driver = DeliveryDriver::find($validated['default_driver_id']);
            if ($driver) {
                $ownerNote = "Vehicle Owner & Driver: {$driver->name} ({$driver->contact_number})";
                $validated['notes'] = trim(($validated['notes'] ? $validated['notes'] . "\n" : '') . $ownerNote);
            }
        }
        unset($validated['is_driver_owner']);

        $vehicle = DeliveryVehicle::create($validated);

        return response()->json([
            'status' => 'success',
            'message' => "Vehicle {$vehicle->registration_number} registered successfully.",
            'data' => $vehicle->load(['defaultDriver']),
        ], 201);
    }

    /**
     * Update delivery vehicle.
     */
    public function updateVehicle(Request $request, DeliveryVehicle $vehicle): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:150',
            'registration_number' => 'sometimes|required|string|max:50',
            'type' => 'sometimes|required|string|in:toto,four_wheeler,carrier,other',
            'category' => 'nullable|string|max:100',
            'max_capacity' => 'sometimes|required|numeric|min:1',
            'capacity_unit' => 'sometimes|required|string|in:kg,pieces,cubic_feet,cubic_meters',
            'default_driver_id' => 'nullable|exists:delivery_drivers,id',
            'backup_driver_id' => 'nullable|exists:delivery_drivers,id',
            'ownership_type' => 'nullable|string|in:owned,leased,rented',
            'is_driver_owner' => 'nullable|boolean',
            'status' => 'sometimes|required|string|in:available,assigned,on_trip,under_maintenance,inactive',
            'maintenance_status' => 'nullable|string|in:good,due_soon,under_service',
            'notes' => 'nullable|string',
            'is_active' => 'boolean',
        ]);

        if (!empty($validated['is_driver_owner']) && !empty($validated['default_driver_id'])) {
            $validated['ownership_type'] = 'owned';
            $driver = DeliveryDriver::find($validated['default_driver_id']);
            if ($driver) {
                $ownerNote = "Vehicle Owner & Driver: {$driver->name} ({$driver->contact_number})";
                $existingNotes = $validated['notes'] ?? $vehicle->notes ?? '';
                if (!str_contains($existingNotes, $driver->name)) {
                    $validated['notes'] = trim(($existingNotes ? $existingNotes . "\n" : '') . $ownerNote);
                }
            }
        }
        unset($validated['is_driver_owner']);

        $vehicle->update($validated);

        return response()->json([
            'status' => 'success',
            'message' => 'Vehicle updated successfully.',
            'data' => $vehicle->fresh(['defaultDriver']),
        ]);
    }

    /**
     * List drivers.
     */
    public function drivers(Request $request): JsonResponse
    {
        $query = DeliveryDriver::with([
            'employee:id,name,phone,email',
            'vehicles:id,name,registration_number,type,ownership_type,default_driver_id,max_capacity,capacity_unit',
        ])->orderBy('name');

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }
        if ($request->filled('company_id')) {
            $query->where('company_id', $request->input('company_id'));
        }

        return response()->json([
            'status' => 'success',
            'data' => $query->get(),
        ]);
    }

    /**
     * Create driver.
     */
    public function createDriver(Request $request): JsonResponse
    {
        if (!$request->filled('company_id')) {
            $request->merge(['company_id' => Auth::user()?->company_id ?? 1]);
        }

        $validated = $request->validate([
            'company_id' => 'required|exists:companies,id',
            'branch_id' => 'nullable|exists:branches,id',
            'employee_id' => 'nullable|exists:employees,id',
            'name' => 'required|string|max:150',
            'contact_number' => 'required|string|max:30',
            'alternate_contact' => 'nullable|string|max:30',
            'license_number' => 'nullable|string|max:50',
            'license_validity' => 'nullable|date',
            'address' => 'nullable|string',
            'status' => 'nullable|string|in:available,assigned,on_trip,on_leave,inactive',
            'notes' => 'nullable|string',
            'is_active' => 'nullable|boolean',
            'assigned_vehicle_id' => 'nullable|exists:delivery_vehicles,id',
            'is_vehicle_owner' => 'nullable|boolean',
        ]);

        $driverData = collect($validated)->except(['assigned_vehicle_id', 'is_vehicle_owner'])->toArray();
        $driver = DeliveryDriver::create($driverData);

        if (!empty($validated['assigned_vehicle_id'])) {
            $vehicle = DeliveryVehicle::find($validated['assigned_vehicle_id']);
            if ($vehicle) {
                $vehUpdates = ['default_driver_id' => $driver->id];
                if (!empty($validated['is_vehicle_owner'])) {
                    $vehUpdates['ownership_type'] = 'owned';
                    $ownerNote = "Owner-Driver: {$driver->name} ({$driver->contact_number})";
                    $vehUpdates['notes'] = trim(($vehicle->notes ? $vehicle->notes . "\n" : '') . $ownerNote);
                }
                $vehicle->update($vehUpdates);
            }
        }

        return response()->json([
            'status' => 'success',
            'message' => "Driver {$driver->name} registered successfully.",
            'data' => $driver->load(['vehicles']),
        ], 201);
    }

    /**
     * Update driver.
     */
    public function updateDriver(Request $request, DeliveryDriver $driver): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:150',
            'contact_number' => 'sometimes|required|string|max:30',
            'alternate_contact' => 'nullable|string|max:30',
            'license_number' => 'nullable|string|max:50',
            'license_validity' => 'nullable|date',
            'status' => 'sometimes|required|string|in:available,assigned,on_trip,on_leave,inactive',
            'address' => 'nullable|string',
            'notes' => 'nullable|string',
            'is_active' => 'boolean',
            'assigned_vehicle_id' => 'nullable|exists:delivery_vehicles,id',
            'is_vehicle_owner' => 'nullable|boolean',
        ]);

        $driverData = collect($validated)->except(['assigned_vehicle_id', 'is_vehicle_owner'])->toArray();
        $driver->update($driverData);

        if (array_key_exists('assigned_vehicle_id', $validated)) {
            if ($validated['assigned_vehicle_id']) {
                DeliveryVehicle::where('default_driver_id', $driver->id)
                    ->where('id', '!=', $validated['assigned_vehicle_id'])
                    ->update(['default_driver_id' => null]);

                $vehicle = DeliveryVehicle::find($validated['assigned_vehicle_id']);
                if ($vehicle) {
                    $vehUpdates = ['default_driver_id' => $driver->id];
                    if (!empty($validated['is_vehicle_owner'])) {
                        $vehUpdates['ownership_type'] = 'owned';
                        $ownerNote = "Owner-Driver: {$driver->name} ({$driver->contact_number})";
                        $existingNotes = $vehicle->notes ?? '';
                        if (!str_contains($existingNotes, $driver->name)) {
                            $vehUpdates['notes'] = trim(($existingNotes ? $existingNotes . "\n" : '') . $ownerNote);
                        }
                    }
                    $vehicle->update($vehUpdates);
                }
            } else {
                DeliveryVehicle::where('default_driver_id', $driver->id)
                    ->update(['default_driver_id' => null]);
            }
        }

        return response()->json([
            'status' => 'success',
            'message' => 'Driver details updated successfully.',
            'data' => $driver->fresh(['vehicles']),
        ]);
    }

    /**
     * List delivery trips.
     */
    public function trips(Request $request): JsonResponse
    {
        $query = DeliveryTrip::with([
            'vehicle:id,name,registration_number,type,max_capacity,capacity_unit',
            'driver:id,name,contact_number',
            'sourceWarehouse:id,name,code',
            'company:id,name,code,address,phone,email,gst_number,pan_number',
            'branch:id,name,code,address,phone,email',
            'stops.order:id,delivery_order_no,recipient_name,recipient_phone,status,town,delivery_address',
            'stops.invoice:id,invoice_no,total_amount',
        ])->orderByDesc('id');

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }
        if ($request->filled('planned_date')) {
            $query->whereDate('planned_date', $request->input('planned_date'));
        }
        if ($request->filled('vehicle_id')) {
            $query->where('vehicle_id', $request->input('vehicle_id'));
        }
        if ($request->filled('driver_id')) {
            $query->where('driver_id', $request->input('driver_id'));
        }
        if ($request->filled('company_id')) {
            $query->where('company_id', $request->input('company_id'));
        }
        if ($request->filled('branch_id')) {
            $query->where('branch_id', $request->input('branch_id'));
        }
        if ($request->filled('date_from') && $request->filled('date_to')) {
            $query->whereBetween('planned_date', [$request->input('date_from'), $request->input('date_to')]);
        }
        if ($request->filled('search')) {
            $search = '%' . $request->input('search') . '%';
            $query->where(function ($q) use ($search) {
                $q->where('trip_code', 'like', $search)
                  ->orWhere('notes', 'like', $search)
                  ->orWhereHas('vehicle', fn($sub) => $sub->where('name', 'like', $search)->orWhere('registration_number', 'like', $search))
                  ->orWhereHas('driver', fn($sub) => $sub->where('name', 'like', $search)->orWhere('contact_number', 'like', $search))
                  ->orWhereHas('stops', fn($sub) => $sub->where('customer_name', 'like', $search)->orWhere('delivery_area', 'like', $search));
            });
        }

        $perPage = min((int) $request->input('per_page', 20), 100);
        $trips = $query->paginate($perPage);

        return response()->json([
            'status' => 'success',
            'data' => $trips,
        ]);
    }

    /**
     * Create a vehicle trip combining multiple customer orders.
     */
    public function createTrip(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'delivery_order_ids' => 'required|array|min:1',
            'delivery_order_ids.*' => 'exists:delivery_orders,id',
            'vehicle_id' => 'nullable|exists:delivery_vehicles,id',
            'driver_id' => 'nullable|exists:delivery_drivers,id',
            'source_warehouse_id' => 'nullable|exists:warehouses,id',
            'planned_date' => 'required|date',
            'planned_departure' => 'nullable|date',
            'expected_return' => 'nullable|date',
            'capacity_override' => 'nullable|boolean',
            'capacity_override_reason' => 'nullable|required_if:capacity_override,true|string|max:255',
            'transport_cost' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string',
        ]);

        try {
            $trip = $this->deliveryService->createTrip($validated, Auth::user());
            return response()->json([
                'status' => 'success',
                'message' => "Trip #{$trip->trip_code} successfully created with {$trip->total_customers} customer orders.",
                'data' => $trip,
            ], 201);
        } catch (Exception $e) {
            return response()->json([
                'status' => 'error',
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Show delivery trip details.
     */
    public function showTrip(DeliveryTrip $trip): JsonResponse
    {
        $trip->load([
            'vehicle',
            'driver',
            'sourceWarehouse',
            'company',
            'branch',
            'stops.order.items.product',
            'stops.invoice',
            'loadingItems.product',
            'loadingItems.warehouse',
            'costAllocations.order',
            'costAllocations.invoice',
        ]);

        if (!$trip->company && $trip->company_id) {
            $trip->setRelation('company', \App\Models\Company::find($trip->company_id));
        }
        if (!$trip->company) {
            $trip->setRelation('company', \App\Models\Company::first());
        }
        if (!$trip->branch && $trip->branch_id) {
            $trip->setRelation('branch', \App\Models\Branch::find($trip->branch_id));
        }
        if (!$trip->branch && $trip->company) {
            $trip->setRelation('branch', \App\Models\Branch::where('company_id', $trip->company->id)->first());
        }

        return response()->json([
            'status' => 'success',
            'data' => $trip,
        ]);
    }

    /**
     * Reorder route stops sequence for a trip.
     */
    public function reorderStops(Request $request, DeliveryTrip $trip): JsonResponse
    {
        $validated = $request->validate([
            'stop_ids' => 'required|array|min:1',
            'stop_ids.*' => 'exists:delivery_trip_stops,id',
        ]);

        try {
            $updated = $this->deliveryService->reorderTripStops($trip, $validated['stop_ids'], Auth::user());
            return response()->json([
                'status' => 'success',
                'message' => 'Stop sequence updated successfully.',
                'data' => $updated,
            ]);
        } catch (Exception $e) {
            return response()->json([
                'status' => 'error',
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Update picked quantity on a loading checklist item.
     */
    public function updateLoadingItem(Request $request, DeliveryLoadingItem $loadingItem): JsonResponse
    {
        $validated = $request->validate([
            'picked_quantity' => 'required|numeric|min:0',
        ]);

        try {
            $updated = $this->deliveryService->updateLoadingItem($loadingItem, (float) $validated['picked_quantity'], Auth::user());
            return response()->json([
                'status' => 'success',
                'message' => 'Picking quantity updated.',
                'data' => $updated,
            ]);
        } catch (Exception $e) {
            return response()->json([
                'status' => 'error',
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Confirm godown loading for a trip and mark ready for dispatch.
     */
    public function confirmLoading(Request $request, DeliveryTrip $trip): JsonResponse
    {
        try {
            $updated = $this->deliveryService->confirmLoading($trip, Auth::user());
            return response()->json([
                'status' => 'success',
                'message' => "Loading confirmed for Trip #{$trip->trip_code}. Ready for dispatch.",
                'data' => $updated,
            ]);
        } catch (Exception $e) {
            return response()->json([
                'status' => 'error',
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Dispatch trip onto the road.
     */
    public function dispatchTrip(Request $request, DeliveryTrip $trip): JsonResponse
    {
        $validated = $request->validate([
            'actual_departure' => 'nullable|date',
            'odometer_start' => 'nullable|numeric|min:0',
            'remarks' => 'nullable|string',
        ]);

        try {
            $dispatched = $this->deliveryService->dispatchTrip($trip, $validated, Auth::user());
            return response()->json([
                'status' => 'success',
                'message' => "Trip #{$trip->trip_code} successfully dispatched on road.",
                'data' => $dispatched,
            ]);
        } catch (Exception $e) {
            return response()->json([
                'status' => 'error',
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Close completed delivery trip.
     */
    public function closeTrip(Request $request, DeliveryTrip $trip): JsonResponse
    {
        $validated = $request->validate([
            'actual_return' => 'nullable|date',
            'odometer_end' => 'nullable|numeric|min:0',
            'force_close' => 'nullable|boolean',
            'remarks' => 'nullable|string',
        ]);

        try {
            $closed = $this->deliveryService->closeTrip($trip, $validated, Auth::user());
            return response()->json([
                'status' => 'success',
                'message' => "Trip #{$trip->trip_code} successfully closed. Vehicle and driver released.",
                'data' => $closed,
            ]);
        } catch (Exception $e) {
            return response()->json([
                'status' => 'error',
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Calculate and allocate transportation costs for a trip across customer invoices.
     */
    public function allocateCost(Request $request, DeliveryTrip $trip): JsonResponse
    {
        $validated = $request->validate([
            'transport_cost' => 'required|numeric|min:0',
            'method' => 'required|string|in:equal,quantity,weight,volume,manual',
            'custom_data' => 'nullable|array',
        ]);

        try {
            $allocations = $this->costService->calculateAndAllocate(
                $trip,
                (float) $validated['transport_cost'],
                $validated['method'],
                $validated['custom_data'] ?? null,
                Auth::user()
            );

            return response()->json([
                'status' => 'success',
                'message' => "Transportation cost (₹{$validated['transport_cost']}) allocated across orders.",
                'data' => $allocations,
            ]);
        } catch (Exception $e) {
            return response()->json([
                'status' => 'error',
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Manually adjust an individual delivery cost allocation line.
     */
    public function adjustAllocation(Request $request, DeliveryCostAllocation $allocation): JsonResponse
    {
        $validated = $request->validate([
            'new_amount' => 'required|numeric|min:0',
            'reason' => 'required|string|max:255',
        ]);

        try {
            $updated = $this->costService->adjustAllocation(
                $allocation,
                (float) $validated['new_amount'],
                $validated['reason'],
                Auth::user()
            );

            return response()->json([
                'status' => 'success',
                'message' => 'Allocation adjustment saved.',
                'data' => $updated,
            ]);
        } catch (Exception $e) {
            return response()->json([
                'status' => 'error',
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Approve cost allocations for a trip.
     */
    public function approveCost(Request $request, DeliveryTrip $trip): JsonResponse
    {
        try {
            $this->costService->approveAllocations($trip, Auth::user());
            return response()->json([
                'status' => 'success',
                'message' => "Transportation cost allocations approved for Trip #{$trip->trip_code}.",
            ]);
        } catch (Exception $e) {
            return response()->json([
                'status' => 'error',
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Delivery calendar events (day, week, month).
     */
    public function calendar(Request $request): JsonResponse
    {
        $start = $request->filled('start')
            ? \Carbon\Carbon::parse($request->input('start'))->toDateString()
            : now()->startOfMonth()->toDateString();
        $end = $request->filled('end')
            ? \Carbon\Carbon::parse($request->input('end'))->toDateString()
            : now()->endOfMonth()->toDateString();

        $ordersQuery = DeliveryOrder::with([
            'customer:id,name,phone,email',
            'invoice:id,invoice_no,total_amount,status,payment_status',
            'items:id,delivery_order_id,product_name,requested_quantity,unit',
            'currentTrip:id,trip_code,status,vehicle_id,driver_id',
            'currentTrip.vehicle:id,name,registration_number,type',
            'currentTrip.driver:id,name,contact_number'
        ])->whereBetween('expected_delivery_date', [$start, $end]);

        $tripsQuery = DeliveryTrip::with([
            'vehicle:id,name,registration_number,type,max_capacity,capacity_unit',
            'driver:id,name,contact_number',
            'stops.order:id,delivery_order_no,recipient_name,recipient_phone,town,district,status,priority',
            'stops.invoice:id,invoice_no'
        ])->whereBetween('planned_date', [$start, $end]);

        if ($request->filled('company_id')) {
            $ordersQuery->where('company_id', $request->input('company_id'));
            $tripsQuery->where('company_id', $request->input('company_id'));
        }
        if ($request->filled('status')) {
            $ordersQuery->where('status', $request->input('status'));
        }
        if ($request->filled('vehicle_id')) {
            $tripsQuery->where('vehicle_id', $request->input('vehicle_id'));
        }
        if ($request->filled('driver_id')) {
            $tripsQuery->where('driver_id', $request->input('driver_id'));
        }

        $invoicesDue = \App\Models\Invoice::select([
            'id', 'invoice_no', 'customer_id', 'total_amount', 'paid_amount',
            'status', 'payment_status', 'due_date', 'invoice_date'
        ])
        ->with(['customer:id,name,phone'])
        ->whereBetween('due_date', [$start, $end])
        ->where('payment_status', '!=', 'paid')
        ->where('status', '!=', 'cancelled')
        ->get();

        return response()->json([
            'status' => 'success',
            'data' => [
                'start' => $start,
                'end' => $end,
                'orders' => $ordersQuery->get(),
                'trips' => $tripsQuery->get(),
                'invoices_due' => $invoicesDue,
            ],
        ]);
    }

    /**
     * List registered delivery areas (Kashichak, Warisaliganj, Pawapuri, Nalanda, Nawada, etc.).
     */
    public function areas(Request $request): JsonResponse
    {
        $areas = DeliveryArea::where('is_active', true)->orderBy('name')->get();

        // Seed default Bihar wholesale regions if table is empty
        if ($areas->isEmpty()) {
            $defaultAreas = [
                ['name' => 'Kashichak', 'district' => 'Nawada', 'state' => 'Bihar', 'postal_code' => '805106', 'latitude' => 25.0212, 'longitude' => 85.7654],
                ['name' => 'Warisaliganj', 'district' => 'Nawada', 'state' => 'Bihar', 'postal_code' => '805130', 'latitude' => 25.0089, 'longitude' => 85.6421],
                ['name' => 'Pawapuri', 'district' => 'Nalanda', 'state' => 'Bihar', 'postal_code' => '803115', 'latitude' => 25.0924, 'longitude' => 85.5256],
                ['name' => 'Nalanda', 'district' => 'Nalanda', 'state' => 'Bihar', 'postal_code' => '803111', 'latitude' => 25.1357, 'longitude' => 85.4439],
                ['name' => 'Nawada Sadar', 'district' => 'Nawada', 'state' => 'Bihar', 'postal_code' => '805110', 'latitude' => 24.8872, 'longitude' => 85.5414],
                ['name' => 'Pakribarawan', 'district' => 'Nawada', 'state' => 'Bihar', 'postal_code' => '805124', 'latitude' => 24.9542, 'longitude' => 85.7321],
                ['name' => 'Rajauli', 'district' => 'Nawada', 'state' => 'Bihar', 'postal_code' => '805125', 'latitude' => 24.6548, 'longitude' => 85.4982],
                ['name' => 'Hisua', 'district' => 'Nawada', 'state' => 'Bihar', 'postal_code' => '805103', 'latitude' => 24.8321, 'longitude' => 85.4189],
                ['name' => 'Bihar Sharif', 'district' => 'Nalanda', 'state' => 'Bihar', 'postal_code' => '803101', 'latitude' => 25.1982, 'longitude' => 85.5187],
                ['name' => 'Rajgir', 'district' => 'Nalanda', 'state' => 'Bihar', 'postal_code' => '803116', 'latitude' => 25.0289, 'longitude' => 85.4215],
            ];

            foreach ($defaultAreas as $item) {
                DeliveryArea::create(array_merge($item, ['is_active' => true]));
            }
            $areas = DeliveryArea::where('is_active', true)->orderBy('name')->get();
        }

        return response()->json([
            'status' => 'success',
            'data' => $areas,
        ]);
    }

    /**
     * Create delivery area.
     */
    public function createArea(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'district' => 'required|string|max:100',
            'state' => 'nullable|string|max:100',
            'postal_code' => 'nullable|string|max:20',
            'latitude' => 'nullable|numeric',
            'longitude' => 'nullable|numeric',
            'description' => 'nullable|string',
        ]);

        $area = DeliveryArea::create($validated);

        return response()->json([
            'status' => 'success',
            'message' => "Delivery area {$area->name} added successfully.",
            'data' => $area,
        ], 201);
    }

    /**
     * Logistics & Delivery Reports.
     */
    public function reports(Request $request): JsonResponse
    {
        $reportType = $request->input('type', 'daily');
        $date = $request->input('date', now()->toDateString());
        $startDate = $request->input('start_date', now()->startOfMonth()->toDateString());
        $endDate = $request->input('end_date', now()->endOfMonth()->toDateString());

        $data = [];

        switch ($reportType) {
            case 'daily':
                $data = DeliveryOrder::with(['customer:id,name', 'invoice:id,invoice_no', 'currentTrip.vehicle', 'currentTrip.driver'])
                    ->whereDate('expected_delivery_date', $date)
                    ->get();
                break;
            case 'pending':
                $data = DeliveryOrder::with(['customer:id,name,phone', 'invoice:id,invoice_no,total_amount', 'area'])
                    ->whereIn('status', ['delivery_pending', 'scheduled', 'vehicle_assigned'])
                    ->orderBy('expected_delivery_date')
                    ->get();
                break;
            case 'overdue':
                $data = DeliveryOrder::with(['customer:id,name,phone', 'invoice:id,invoice_no,total_amount'])
                    ->where('expected_delivery_date', '<', now()->toDateString())
                    ->whereNotIn('status', ['delivered', 'cancelled'])
                    ->orderBy('expected_delivery_date')
                    ->get();
                break;
            case 'trips':
                $data = DeliveryTrip::with(['vehicle', 'driver', 'stops.order'])
                    ->whereBetween('planned_date', [$startDate, $endDate])
                    ->get();
                break;
            case 'vehicle_utilization':
                $data = DeliveryVehicle::withCount([
                    'trips as total_trips' => fn($q) => $q->whereBetween('planned_date', [$startDate, $endDate]),
                    'trips as completed_trips' => fn($q) => $q->where('status', 'closed')->whereBetween('planned_date', [$startDate, $endDate]),
                ])->get();
                break;
            case 'transport_costs':
                $data = DeliveryTrip::with(['costAllocations.order', 'costAllocations.invoice', 'vehicle'])
                    ->where('transport_cost', '>', 0)
                    ->whereBetween('planned_date', [$startDate, $endDate])
                    ->get();
                break;
            case 'area_wise':
                $data = DeliveryOrder::select('town', 'district', DB::raw('count(*) as order_count'), DB::raw('sum(total_quantity) as total_qty'), DB::raw('sum(delivery_charge) as total_charges'))
                    ->groupBy('town', 'district')
                    ->get();
                break;
            default:
                $data = DeliveryOrder::with(['customer:id,name', 'invoice:id,invoice_no'])->limit(50)->get();
                break;
        }

        return response()->json([
            'status' => 'success',
            'report_type' => $reportType,
            'data' => $data,
        ]);
    }

    /**
     * Export reports to CSV with formula injection defense.
     */
    public function exportReport(Request $request): StreamedResponse
    {
        $reportType = $request->input('type', 'daily');
        $fileName = "delivery-report-{$reportType}-" . date('Y-m-d') . ".csv";

        return response()->streamDownload(function () use ($reportType, $request) {
            $handle = fopen('php://output', 'w');

            // Sanitize function to prevent CSV Formula Injection
            $sanitize = function ($val) {
                $str = (string) $val;
                if (isset($str[0]) && in_array($str[0], ['=', '+', '-', '@'])) {
                    return "'" . $str;
                }
                return $str;
            };

            if ($reportType === 'daily' || $reportType === 'pending' || $reportType === 'overdue') {
                fputcsv($handle, ['Order No', 'Invoice No', 'Customer', 'Phone', 'Town', 'District', 'Status', 'Date', 'Total Qty']);
                $orders = DeliveryOrder::with(['customer', 'invoice'])->orderByDesc('id')->get();
                foreach ($orders as $o) {
                    fputcsv($handle, [
                        $sanitize($o->delivery_order_no),
                        $sanitize($o->invoice ? $o->invoice->invoice_no : ''),
                        $sanitize($o->recipient_name),
                        $sanitize($o->recipient_phone),
                        $sanitize($o->town),
                        $sanitize($o->district),
                        $sanitize($o->status),
                        $sanitize($o->expected_delivery_date ? $o->expected_delivery_date->format('Y-m-d') : ''),
                        $sanitize($o->total_quantity),
                    ]);
                }
            } elseif ($reportType === 'transport_costs') {
                fputcsv($handle, ['Trip Code', 'Vehicle', 'Planned Date', 'Total Cost', 'Customer', 'Invoice No', 'Method', 'Allocated Amount', 'Approved']);
                $allocations = DeliveryCostAllocation::with(['trip.vehicle', 'order', 'invoice'])->get();
                foreach ($allocations as $a) {
                    fputcsv($handle, [
                        $sanitize($a->trip ? $a->trip->trip_code : ''),
                        $sanitize($a->trip && $a->trip->vehicle ? $a->trip->vehicle->registration_number : ''),
                        $sanitize($a->trip ? $a->trip->planned_date : ''),
                        $sanitize($a->trip ? $a->trip->transport_cost : 0),
                        $sanitize($a->order ? $a->order->recipient_name : ''),
                        $sanitize($a->invoice ? $a->invoice->invoice_no : ''),
                        $sanitize($a->allocation_method),
                        $sanitize($a->final_allocated_amount),
                        $sanitize($a->is_approved ? 'Yes' : 'No'),
                    ]);
                }
            } else {
                fputcsv($handle, ['Trip Code', 'Vehicle', 'Driver', 'Planned Date', 'Status', 'Customers', 'Total Qty', 'Transport Cost']);
                $trips = DeliveryTrip::with(['vehicle', 'driver'])->orderByDesc('id')->get();
                foreach ($trips as $t) {
                    fputcsv($handle, [
                        $sanitize($t->trip_code),
                        $sanitize($t->vehicle ? $t->vehicle->registration_number : ''),
                        $sanitize($t->driver ? $t->driver->name : ''),
                        $sanitize($t->planned_date),
                        $sanitize($t->status),
                        $sanitize($t->total_customers),
                        $sanitize($t->total_quantity),
                        $sanitize($t->transport_cost),
                    ]);
                }
            }

            fclose($handle);
        }, $fileName, [
            'Content-Type' => 'text/csv',
            'Content-Disposition' => "attachment; filename=\"{$fileName}\"",
        ]);
    }
}
