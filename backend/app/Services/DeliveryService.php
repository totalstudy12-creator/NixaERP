<?php

namespace App\Services;

use App\Models\DeliveryArea;
use App\Models\DeliveryAttempt;
use App\Models\DeliveryAttemptItem;
use App\Models\DeliveryDriver;
use App\Models\DeliveryLoadingItem;
use App\Models\DeliveryOrder;
use App\Models\DeliveryOrderItem;
use App\Models\DeliveryStatusHistory;
use App\Models\DeliveryTrip;
use App\Models\DeliveryTripStop;
use App\Models\DeliveryVehicle;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\User;
use App\Models\Warehouse;
use Carbon\Carbon;
use Exception;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use RuntimeException;

class DeliveryService
{
    /**
     * Create or update a delivery order for an existing sales invoice.
     */
    public function createOrUpdateDeliveryOrder(Invoice $invoice, array $data, ?User $user = null): DeliveryOrder
    {
        return DB::transaction(function () use ($invoice, $data, $user) {
            $invoice->loadMissing(['customer', 'items.product']);

            $existing = DeliveryOrder::where('invoice_id', $invoice->id)->first();
            $orderNo = $existing ? $existing->delivery_order_no : $this->generateDeliveryOrderNo();

            // Calculate totals from invoice items
            $totalItemsCount = $invoice->items->count();
            $totalQuantity = (float) $invoice->items->sum('quantity');

            // Snapshot delivery address
            $recipientName = !empty($data['recipient_name']) ? $data['recipient_name'] : ($invoice->customer_name ?? ($invoice->customer ? $invoice->customer->name : 'Customer'));
            $recipientPhone = !empty($data['recipient_phone']) ? $data['recipient_phone'] : ($invoice->contact_no ?? $invoice->phone_no ?? ($invoice->customer ? $invoice->customer->phone : '0000000000'));
            
            $addressParts = array_filter([
                $data['delivery_address'] ?? null,
                $invoice->shipping_street ?: $invoice->customer_address,
                $invoice->shipping_city ?: $invoice->billing_city,
                $invoice->shipping_state ?: $invoice->billing_state,
                $invoice->shipping_pincode ?: $invoice->billing_pincode,
            ]);
            $deliveryAddress = !empty($data['delivery_address']) ? $data['delivery_address'] : (!empty($addressParts) ? implode(', ', $addressParts) : 'Store / Local delivery');

            $orderData = [
                'company_id' => $invoice->company_id,
                'branch_id' => $invoice->branch_id,
                'invoice_id' => $invoice->id,
                'customer_id' => $invoice->customer_id,
                'delivery_order_no' => $orderNo,
                'delivery_area_id' => $data['delivery_area_id'] ?? null,
                'delivery_type' => $data['delivery_type'] ?? 'nearby_town',
                'priority' => $data['priority'] ?? 'normal',
                'expected_delivery_date' => $data['expected_delivery_date'] ?? now()->addDay()->toDateString(),
                'expected_delivery_time' => $data['expected_delivery_time'] ?? '10:00 AM - 02:00 PM',
                'recipient_name' => $recipientName,
                'recipient_phone' => $recipientPhone,
                'delivery_address' => $deliveryAddress,
                'district' => $data['district'] ?? 'Nawada',
                'town' => $data['town'] ?? 'Kashichak',
                'landmark' => $data['landmark'] ?? null,
                'latitude' => $data['latitude'] ?? null,
                'longitude' => $data['longitude'] ?? null,
                'delivery_instructions' => $data['delivery_instructions'] ?? null,
                'delivery_charge' => (float) ($data['delivery_charge'] ?? 0),
                'total_items_count' => $totalItemsCount,
                'total_quantity' => $totalQuantity,
                'status' => $existing ? $existing->status : 'delivery_pending',
                'created_by' => $user ? $user->id : $invoice->created_by,
            ];

            if ($existing) {
                $prevStatus = $existing->status;
                $existing->update($orderData);
                $deliveryOrder = $existing->fresh();
            } else {
                $deliveryOrder = DeliveryOrder::create($orderData);
                $this->recordStatusHistory('order', $deliveryOrder->id, null, 'delivery_pending', $user, 'Delivery order registered against Invoice #' . $invoice->invoice_no);
            }

            // Sync delivery order items with invoice items
            $existingItemIds = [];
            foreach ($invoice->items as $invItem) {
                $item = DeliveryOrderItem::updateOrCreate(
                    [
                        'delivery_order_id' => $deliveryOrder->id,
                        'invoice_item_id' => $invItem->id,
                    ],
                    [
                        'product_id' => $invItem->product_id,
                        'product_name' => $invItem->product ? $invItem->product->name : ($invItem->description ?: 'Product #' . $invItem->product_id),
                        'unit' => $invItem->product ? ($invItem->product->unit ?? 'pcs') : 'pcs',
                        'requested_quantity' => (float) $invItem->quantity,
                        'pending_quantity' => (float) $invItem->quantity,
                        'source_warehouse_id' => $data['source_warehouse_id'] ?? null,
                    ]
                );
                $existingItemIds[] = $item->id;
            }

            // Remove orphaned items if any
            DeliveryOrderItem::where('delivery_order_id', $deliveryOrder->id)
                ->whereNotIn('id', $existingItemIds)
                ->delete();

            return $deliveryOrder->load(['items', 'customer', 'invoice', 'area']);
        });
    }

    /**
     * Schedule or update delivery schedule.
     */
    public function scheduleDelivery(DeliveryOrder $order, array $data, ?User $user = null): DeliveryOrder
    {
        return DB::transaction(function () use ($order, $data, $user) {
            $prevStatus = $order->status;
            $newStatus = in_array($order->status, ['delivery_pending', 'rescheduled']) ? 'scheduled' : $order->status;

            $order->update([
                'expected_delivery_date' => $data['expected_delivery_date'] ?? $order->expected_delivery_date,
                'expected_delivery_time' => $data['expected_delivery_time'] ?? $order->expected_delivery_time,
                'priority' => $data['priority'] ?? $order->priority,
                'delivery_instructions' => $data['delivery_instructions'] ?? $order->delivery_instructions,
                'status' => $newStatus,
            ]);

            if ($prevStatus !== $newStatus) {
                $this->recordStatusHistory('order', $order->id, $prevStatus, $newStatus, $user, $data['remarks'] ?? 'Delivery scheduled for ' . $order->expected_delivery_date);
            }

            return $order->fresh(['items', 'customer', 'invoice', 'area', 'currentTrip']);
        });
    }

    /**
     * Reschedule delivery.
     */
    public function rescheduleDelivery(DeliveryOrder $order, array $data, ?User $user = null): DeliveryOrder
    {
        return DB::transaction(function () use ($order, $data, $user) {
            $prevStatus = $order->status;
            $order->update([
                'expected_delivery_date' => $data['expected_delivery_date'],
                'expected_delivery_time' => $data['expected_delivery_time'] ?? $order->expected_delivery_time,
                'status' => 'rescheduled',
            ]);

            $this->recordStatusHistory('order', $order->id, $prevStatus, 'rescheduled', $user, $data['remarks'] ?? 'Delivery rescheduled to ' . $data['expected_delivery_date']);

            return $order->fresh(['items', 'customer', 'invoice', 'area']);
        });
    }

    /**
     * Cancel delivery.
     */
    public function cancelDelivery(DeliveryOrder $order, string $reason, ?User $user = null): DeliveryOrder
    {
        return DB::transaction(function () use ($order, $reason, $user) {
            if (in_array($order->status, ['dispatched', 'delivered'])) {
                throw new RuntimeException("Cannot cancel delivery that is already {$order->status}.");
            }

            $prevStatus = $order->status;
            $order->update([
                'status' => 'cancelled',
                'current_trip_id' => null,
            ]);

            $this->recordStatusHistory('order', $order->id, $prevStatus, 'cancelled', $user, $reason);

            return $order->fresh();
        });
    }

    /**
     * Create a vehicle trip combining multiple customer delivery orders.
     */
    public function createTrip(array $data, ?User $user = null): DeliveryTrip
    {
        return DB::transaction(function () use ($data, $user) {
            $orderIds = $data['delivery_order_ids'] ?? [];
            if (empty($orderIds)) {
                throw new InvalidArgumentException('At least one delivery order must be selected for the trip.');
            }

            $orders = DeliveryOrder::with(['items', 'invoice', 'customer'])
                ->whereIn('id', $orderIds)
                ->lockForUpdate()
                ->get();

            if ($orders->count() !== count($orderIds)) {
                throw new RuntimeException('One or more selected delivery orders could not be found.');
            }

            // Company isolation verification
            $companyId = $orders->first()->company_id;
            $branchId = $data['branch_id'] ?? $orders->first()->branch_id;

            foreach ($orders as $order) {
                if ($order->company_id !== $companyId) {
                    throw new RuntimeException('Safety invariant: Cannot combine deliveries belonging to different companies.');
                }
                if ($order->current_trip_id && in_array($order->status, ['vehicle_assigned', 'loading_in_progress', 'ready_for_dispatch', 'dispatched'])) {
                    throw new RuntimeException("Delivery order #{$order->delivery_order_no} is already assigned to active Trip #{$order->current_trip_id}.");
                }
            }

            // Validate Vehicle & Driver Availability
            $vehicleId = $data['vehicle_id'] ?? null;
            $driverId = $data['driver_id'] ?? null;
            $plannedDate = $data['planned_date'] ?? now()->toDateString();
            $plannedDeparture = !empty($data['planned_departure']) ? Carbon::parse($data['planned_departure']) : Carbon::parse("{$plannedDate} 09:00:00");
            $expectedReturn = !empty($data['expected_return']) ? Carbon::parse($data['expected_return']) : Carbon::parse("{$plannedDate} 18:00:00");

            $vehicle = null;
            if ($vehicleId) {
                $vehicle = DeliveryVehicle::lockForUpdate()->findOrFail($vehicleId);
                if (!$vehicle->is_active || $vehicle->status === 'under_maintenance') {
                    throw new RuntimeException("Vehicle {$vehicle->registration_number} is currently {$vehicle->status} and cannot be assigned.");
                }

                // Check overlapping trip assignments
                $overlappingTrip = DeliveryTrip::where('vehicle_id', $vehicleId)
                    ->whereNotIn('status', ['completed', 'cancelled', 'closed'])
                    ->where(function ($q) use ($plannedDeparture, $expectedReturn) {
                        $q->whereBetween('planned_departure', [$plannedDeparture, $expectedReturn])
                          ->orWhereBetween('expected_return', [$plannedDeparture, $expectedReturn])
                          ->orWhere(function ($sub) use ($plannedDeparture, $expectedReturn) {
                              $sub->where('planned_departure', '<=', $plannedDeparture)
                                  ->where('expected_return', '>=', $expectedReturn);
                          });
                    })
                    ->first();

                if ($overlappingTrip) {
                    throw new RuntimeException("Vehicle assignment conflict: {$vehicle->registration_number} is already scheduled on Trip {$overlappingTrip->trip_code} during this time window.");
                }

                if (!$driverId && $vehicle->default_driver_id) {
                    $driverId = $vehicle->default_driver_id;
                }
            }

            if ($driverId) {
                $driver = DeliveryDriver::lockForUpdate()->findOrFail($driverId);
                if (!$driver->is_active || in_array($driver->status, ['on_leave', 'inactive'])) {
                    throw new RuntimeException("Driver {$driver->name} is currently {$driver->status} and cannot be assigned.");
                }

                // Check driver conflict
                $overlappingDriverTrip = DeliveryTrip::where('driver_id', $driverId)
                    ->whereNotIn('status', ['completed', 'cancelled', 'closed'])
                    ->where(function ($q) use ($plannedDeparture, $expectedReturn) {
                        $q->whereBetween('planned_departure', [$plannedDeparture, $expectedReturn])
                          ->orWhereBetween('expected_return', [$plannedDeparture, $expectedReturn])
                          ->orWhere(function ($sub) use ($plannedDeparture, $expectedReturn) {
                              $sub->where('planned_departure', '<=', $plannedDeparture)
                                  ->where('expected_return', '>=', $expectedReturn);
                          });
                    })
                    ->first();

                if ($overlappingDriverTrip) {
                    throw new RuntimeException("Driver assignment conflict: {$driver->name} is already assigned to Trip {$overlappingDriverTrip->trip_code} during this time window.");
                }
            }

            // Calculate aggregated load
            $totalCustomers = $orders->count();
            $totalItemsCount = 0;
            $totalQuantity = 0;
            $totalWeightKg = 0;
            $totalVolumeCft = 0;

            foreach ($orders as $order) {
                $totalItemsCount += $order->items->count();
                $totalQuantity += (float) $order->items->sum('requested_quantity');
                foreach ($order->items as $item) {
                    $totalWeightKg += (float) ($item->unit_weight_kg ?? 0) * (float) $item->requested_quantity;
                    $totalVolumeCft += (float) ($item->unit_volume_cft ?? 0) * (float) $item->requested_quantity;
                }
            }

            // Capacity validation
            $capacityOverride = !empty($data['capacity_override']);
            $capacityOverrideReason = $data['capacity_override_reason'] ?? null;
            $capacityOverrideBy = $capacityOverride && $user ? $user->id : null;

            if ($vehicle && !$capacityOverride) {
                if ($vehicle->capacity_unit === 'kg' && $totalWeightKg > 0 && $totalWeightKg > (float) $vehicle->max_capacity) {
                    throw new RuntimeException("Load exceeds vehicle maximum capacity ({$totalWeightKg} kg > {$vehicle->max_capacity} kg). Authorized capacity override required.");
                }
                if ($vehicle->capacity_unit === 'pieces' && $totalQuantity > (float) $vehicle->max_capacity) {
                    throw new RuntimeException("Load exceeds vehicle maximum piece capacity ({$totalQuantity} pcs > {$vehicle->max_capacity} pcs). Authorized capacity override required.");
                }
            }

            $tripCode = $this->generateTripCode();
            $tripStatus = $vehicleId ? 'vehicle_assigned' : 'planned';

            $trip = DeliveryTrip::create([
                'company_id' => $companyId,
                'branch_id' => $branchId,
                'trip_code' => $tripCode,
                'vehicle_id' => $vehicleId,
                'driver_id' => $driverId,
                'source_warehouse_id' => $data['source_warehouse_id'] ?? null,
                'planned_date' => $plannedDate,
                'planned_departure' => $plannedDeparture,
                'expected_return' => $expectedReturn,
                'status' => $tripStatus,
                'total_customers' => $totalCustomers,
                'total_items_count' => $totalItemsCount,
                'total_quantity' => $totalQuantity,
                'total_weight_kg' => $totalWeightKg,
                'total_volume_cft' => $totalVolumeCft,
                'capacity_override' => $capacityOverride,
                'capacity_override_reason' => $capacityOverrideReason,
                'capacity_override_by' => $capacityOverrideBy,
                'transport_cost' => (float) ($data['transport_cost'] ?? 0),
                'cost_allocation_status' => 'draft',
                'notes' => $data['notes'] ?? null,
                'created_by' => $user ? $user->id : null,
            ]);

            $this->recordStatusHistory('trip', $trip->id, null, $tripStatus, $user, 'Trip created with ' . $totalCustomers . ' delivery customer orders.');

            // Create stops in route sequence
            $seq = 1;
            foreach ($orders as $order) {
                DeliveryTripStop::create([
                    'delivery_trip_id' => $trip->id,
                    'delivery_order_id' => $order->id,
                    'invoice_id' => $order->invoice_id,
                    'stop_sequence' => $seq++,
                    'customer_name' => $order->recipient_name,
                    'delivery_area' => $order->town ?: ($order->area ? $order->area->name : 'Local'),
                    'delivery_address' => $order->delivery_address,
                    'latitude' => $order->latitude,
                    'longitude' => $order->longitude,
                    'status' => 'scheduled',
                ]);

                // Update order status
                $order->update([
                    'current_trip_id' => $trip->id,
                    'status' => 'vehicle_assigned',
                ]);

                $this->recordStatusHistory('order', $order->id, 'scheduled', 'vehicle_assigned', $user, "Assigned to Trip {$trip->trip_code}");

                // Generate loading checklist items per warehouse
                foreach ($order->items as $item) {
                    $warehouseId = $item->source_warehouse_id ?? $trip->source_warehouse_id ?? $this->getDefaultWarehouseId($branchId);
                    DeliveryLoadingItem::create([
                        'delivery_trip_id' => $trip->id,
                        'delivery_order_id' => $order->id,
                        'delivery_order_item_id' => $item->id,
                        'product_id' => $item->product_id,
                        'warehouse_id' => $warehouseId,
                        'planned_quantity' => $item->requested_quantity,
                        'picked_quantity' => 0,
                        'is_loaded' => false,
                    ]);
                }
            }

            // Update vehicle & driver status
            if ($vehicle) {
                $vehicle->update(['status' => 'assigned']);
            }
            if ($driverId) {
                DeliveryDriver::where('id', $driverId)->update(['status' => 'assigned']);
            }

            // If transport cost is provided upfront, auto-allocate equally
            if (!empty($data['transport_cost']) && (float) $data['transport_cost'] > 0) {
                app(DeliveryCostService::class)->calculateAndAllocate($trip, (float) $data['transport_cost'], 'equal', null, $user);
            }

            return $trip->fresh(['stops.order', 'stops.invoice', 'vehicle', 'driver', 'loadingItems.warehouse', 'loadingItems.product', 'costAllocations']);
        });
    }

    /**
     * Reorder route stop sequence for a trip.
     */
    public function reorderTripStops(DeliveryTrip $trip, array $stopIdsInOrder, ?User $user = null): DeliveryTrip
    {
        return DB::transaction(function () use ($trip, $stopIdsInOrder, $user) {
            $seq = 1;
            foreach ($stopIdsInOrder as $stopId) {
                DeliveryTripStop::where('id', $stopId)
                    ->where('delivery_trip_id', $trip->id)
                    ->update(['stop_sequence' => $seq++]);
            }

            $this->recordStatusHistory('trip', $trip->id, $trip->status, $trip->status, $user, 'Route stop order updated manually.');

            return $trip->fresh(['stops']);
        });
    }

    /**
     * Update picked quantity on a loading checklist item.
     */
    public function updateLoadingItem(DeliveryLoadingItem $loadingItem, float $pickedQty, ?User $user = null): DeliveryLoadingItem
    {
        return DB::transaction(function () use ($loadingItem, $pickedQty, $user) {
            if ($pickedQty > (float) $loadingItem->planned_quantity) {
                throw new InvalidArgumentException("Picked quantity ({$pickedQty}) cannot exceed planned invoice quantity ({$loadingItem->planned_quantity}).");
            }

            $isLoaded = $pickedQty >= (float) $loadingItem->planned_quantity;

            $loadingItem->update([
                'picked_quantity' => $pickedQty,
                'is_loaded' => $isLoaded,
                'loaded_at' => $isLoaded ? now() : null,
                'loaded_by' => $user ? $user->id : null,
            ]);

            // Sync with delivery order item
            $orderItem = $loadingItem->orderItem;
            if ($orderItem) {
                $orderItem->update([
                    'loaded_quantity' => $pickedQty,
                ]);
            }

            return $loadingItem->fresh();
        });
    }

    /**
     * Confirm loading for a trip and mark ready for dispatch.
     */
    public function confirmLoading(DeliveryTrip $trip, ?User $user = null): DeliveryTrip
    {
        return DB::transaction(function () use ($trip, $user) {
            $loadingItems = $trip->loadingItems;
            if ($loadingItems->isEmpty()) {
                throw new RuntimeException('No loading items exist for this trip.');
            }

            $allLoaded = $loadingItems->every(fn($item) => $item->is_loaded);
            $prevStatus = $trip->status;

            $trip->update([
                'status' => 'ready_for_dispatch',
            ]);

            DeliveryOrder::where('current_trip_id', $trip->id)->update([
                'status' => 'ready_for_dispatch',
            ]);

            // Sync linked invoices and line items to packed
            $orders = DeliveryOrder::where('current_trip_id', $trip->id)->with(['invoice.items', 'items'])->get();
            foreach ($orders as $ord) {
                if ($ord->invoice) {
                    $ord->invoice->update([
                        'delivery_status' => 'packed',
                        'packed_at' => $ord->invoice->packed_at ?? now(),
                    ]);
                    foreach ($ord->items as $oItem) {
                        if ($oItem->invoice_item_id) {
                            $invItem = InvoiceItem::find($oItem->invoice_item_id);
                            if ($invItem) {
                                $invItem->update([
                                    'delivery_status' => 'packed',
                                    'packed_quantity' => $oItem->loaded_quantity > 0 ? $oItem->loaded_quantity : $oItem->requested_quantity,
                                ]);
                            }
                        }
                    }
                }
            }

            $this->recordStatusHistory('trip', $trip->id, $prevStatus, 'ready_for_dispatch', $user, 'Godown loading confirmed. Ready for dispatch.');

            return $trip->fresh(['loadingItems', 'stops', 'vehicle', 'driver']);
        });
    }

    /**
     * Dispatch trip and vehicle onto the road.
     */
    public function dispatchTrip(DeliveryTrip $trip, array $data, ?User $user = null): DeliveryTrip
    {
        return DB::transaction(function () use ($trip, $data, $user) {
            if (in_array($trip->status, ['dispatched', 'in_transit', 'completed', 'closed', 'cancelled'])) {
                throw new RuntimeException("Trip #{$trip->trip_code} is already {$trip->status}.");
            }

            if (!$trip->vehicle_id) {
                throw new RuntimeException('Cannot dispatch trip: No vehicle assigned.');
            }
            if (!$trip->driver_id) {
                throw new RuntimeException('Cannot dispatch trip: No driver assigned.');
            }

            $departureTime = !empty($data['actual_departure']) ? Carbon::parse($data['actual_departure']) : now();
            $odometerStart = !empty($data['odometer_start']) ? (float) $data['odometer_start'] : null;

            $prevStatus = $trip->status;
            $trip->update([
                'status' => 'in_transit',
                'actual_departure' => $departureTime,
                'dispatched_by' => $user ? $user->id : null,
                'odometer_start' => $odometerStart,
                'notes' => $data['remarks'] ?? $trip->notes,
            ]);

            // Update Vehicle and Driver
            DeliveryVehicle::where('id', $trip->vehicle_id)->update(['status' => 'on_trip']);
            DeliveryDriver::where('id', $trip->driver_id)->update(['status' => 'on_trip']);

            // Update orders and stops
            DeliveryOrder::where('current_trip_id', $trip->id)->update(['status' => 'dispatched']);
            DeliveryTripStop::where('delivery_trip_id', $trip->id)->update(['status' => 'in_transit']);

            // Sync linked invoices and line items to sent
            $orders = DeliveryOrder::where('current_trip_id', $trip->id)->with(['invoice.items', 'items'])->get();
            foreach ($orders as $ord) {
                if ($ord->invoice) {
                    $ord->invoice->update([
                        'delivery_status' => 'sent',
                        'dispatched_at' => $ord->invoice->dispatched_at ?? $departureTime,
                    ]);
                    foreach ($ord->items as $oItem) {
                        if ($oItem->invoice_item_id) {
                            $invItem = InvoiceItem::find($oItem->invoice_item_id);
                            if ($invItem && $invItem->delivery_status !== 'delivered') {
                                $invItem->update([
                                    'delivery_status' => 'sent',
                                    'packed_quantity' => max((float)$invItem->packed_quantity, (float)($oItem->loaded_quantity ?: $oItem->requested_quantity)),
                                ]);
                            }
                        }
                    }
                }
            }

            $this->recordStatusHistory('trip', $trip->id, $prevStatus, 'in_transit', $user, $data['remarks'] ?? 'Trip dispatched with vehicle ' . ($trip->vehicle ? $trip->vehicle->registration_number : ''));

            return $trip->fresh(['stops', 'vehicle', 'driver']);
        });
    }

    /**
     * Record delivery confirmation (Full, partial, or failed attempt) for an individual delivery order.
     */
    public function confirmDelivery(DeliveryOrder $order, array $data, ?User $user = null): DeliveryAttempt
    {
        return DB::transaction(function () use ($order, $data, $user) {
            $order->refresh();
            $order->load(['items', 'currentTrip']);
            $resultStatus = $data['status'] ?? 'delivered'; // delivered, partially_delivered, failed
            $failureReason = $data['failure_reason'] ?? null;
            $failureRemarks = $data['failure_remarks'] ?? null;
            $itemsData = $data['items'] ?? [];

            // Attempt sequence
            $lastAttemptNo = (int) DeliveryAttempt::where('delivery_order_id', $order->id)->max('attempt_number');
            $attemptNo = $lastAttemptNo + 1;

            $attempt = DeliveryAttempt::create([
                'delivery_order_id' => $order->id,
                'delivery_trip_id' => $order->current_trip_id,
                'delivery_trip_stop_id' => $data['delivery_trip_stop_id'] ?? null,
                'attempt_number' => $attemptNo,
                'attempt_date' => !empty($data['delivery_time']) ? Carbon::parse($data['delivery_time']) : now(),
                'status' => $resultStatus,
                'failure_reason' => $failureReason,
                'failure_remarks' => $failureRemarks,
                'receiver_name' => $data['receiver_name'] ?? $order->recipient_name,
                'receiver_phone' => $data['receiver_phone'] ?? $order->recipient_phone,
                'receiver_relationship' => $data['receiver_relationship'] ?? 'Customer',
                'signature_url' => $data['signature_url'] ?? null,
                'photo_proof_url' => $data['photo_proof_url'] ?? null,
                'latitude' => $data['latitude'] ?? null,
                'longitude' => $data['longitude'] ?? null,
                'performed_by' => $user ? $user->id : null,
            ]);

            $totalRequested = 0;
            $totalDelivered = 0;

            foreach ($order->items as $item) {
                $totalRequested += (float) $item->requested_quantity;
                $lineDelivered = 0;
                $lineReturned = 0;

                if ($resultStatus === 'delivered') {
                    $lineDelivered = (float) $item->requested_quantity;
                } elseif ($resultStatus === 'failed') {
                    $lineDelivered = 0;
                    $lineReturned = (float) $item->loaded_quantity;
                } elseif (!empty($itemsData[$item->id])) {
                    $lineDelivered = (float) ($itemsData[$item->id]['delivered_quantity'] ?? 0);
                    $lineReturned = (float) ($itemsData[$item->id]['returned_quantity'] ?? 0);
                } else {
                    $lineDelivered = (float) $item->loaded_quantity;
                }

                // Prevent exceeding requested quantity
                if ($lineDelivered > (float) $item->requested_quantity) {
                    $lineDelivered = (float) $item->requested_quantity;
                }

                $totalDelivered += $lineDelivered;
                $pendingQty = max(0, (float) $item->requested_quantity - $lineDelivered);

                $item->update([
                    'delivered_quantity' => $lineDelivered,
                    'pending_quantity' => $pendingQty,
                ]);

                DeliveryAttemptItem::create([
                    'delivery_attempt_id' => $attempt->id,
                    'delivery_order_item_id' => $item->id,
                    'product_id' => $item->product_id,
                    'loaded_quantity' => (float) $item->loaded_quantity,
                    'delivered_quantity' => $lineDelivered,
                    'returned_quantity' => $lineReturned,
                    'return_to_warehouse_id' => $data['return_to_warehouse_id'] ?? null,
                    'remarks' => $data['remarks'] ?? null,
                ]);
            }

            // Determine final order status
            $prevOrderStatus = $order->status;
            $finalOrderStatus = 'delivered';

            if ($resultStatus === 'failed') {
                $finalOrderStatus = 'delivery_failed';
            } elseif ($totalDelivered < $totalRequested) {
                $finalOrderStatus = 'partially_delivered';
            }

            $order->update([
                'status' => $finalOrderStatus,
                'delivery_completed_at' => in_array($finalOrderStatus, ['delivered', 'partially_delivered']) ? now() : null,
            ]);

            // Sync linked invoice and line items
            if ($order->invoice_id) {
                $invoice = Invoice::with('items')->find($order->invoice_id);
                if ($invoice) {
                    $allDelivered = true;
                    foreach ($order->items as $oItem) {
                        if ($oItem->invoice_item_id) {
                            $invItem = InvoiceItem::find($oItem->invoice_item_id);
                            if ($invItem) {
                                $lineDelivered = (float) $oItem->delivered_quantity;
                                $reqQty = (float) $invItem->quantity;
                                $itemStatus = 'pending';

                                if ($finalOrderStatus === 'delivered' || ($reqQty > 0 && $lineDelivered >= $reqQty)) {
                                    $itemStatus = 'delivered';
                                    $lineDelivered = $reqQty;
                                } elseif ($lineDelivered > 0) {
                                    $itemStatus = 'sent';
                                    $allDelivered = false;
                                } else {
                                    $allDelivered = false;
                                    $itemStatus = $finalOrderStatus === 'delivery_failed' ? 'pending' : 'sent';
                                }

                                $invItem->update([
                                    'delivery_status' => $itemStatus,
                                    'delivered_quantity' => $lineDelivered,
                                    'packed_quantity' => max($lineDelivered, (float)$invItem->packed_quantity),
                                ]);
                            }
                        }
                    }

                    if ($finalOrderStatus === 'delivered' || $allDelivered) {
                        $invoice->update([
                            'delivery_status' => 'delivered',
                            'delivered_at' => now(),
                        ]);
                    } else {
                        $invoice->syncDeliveryStatusFromItems();
                    }
                }
            }

            // Update trip stop status
            if ($order->current_trip_id) {
                DeliveryTripStop::where('delivery_trip_id', $order->current_trip_id)
                    ->where('delivery_order_id', $order->id)
                    ->update([
                        'status' => $finalOrderStatus,
                        'actual_arrival' => now(),
                    ]);
            }

            $this->recordStatusHistory('order', $order->id, $prevOrderStatus, $finalOrderStatus, $user, "Attempt #{$attemptNo}: {$resultStatus}. " . ($failureRemarks ?: ''));

            return $attempt->load(['items', 'order']);
        });
    }

    /**
     * Close a delivery trip once all customer stops have been resolved.
     */
    public function closeTrip(DeliveryTrip $trip, array $data, ?User $user = null): DeliveryTrip
    {
        return DB::transaction(function () use ($trip, $data, $user) {
            $stops = $trip->stops()->get();
            $unresolvedCount = $stops->whereIn('status', ['scheduled', 'in_transit'])->count();

            if ($unresolvedCount > 0 && empty($data['force_close'])) {
                throw new RuntimeException("Cannot close trip: {$unresolvedCount} customer delivery stop(s) are still unresolved. Use force close with reason if needed.");
            }

            $prevStatus = $trip->status;
            $returnTime = !empty($data['actual_return']) ? Carbon::parse($data['actual_return']) : now();
            $odometerEnd = !empty($data['odometer_end']) ? (float) $data['odometer_end'] : null;

            $trip->update([
                'status' => 'closed',
                'actual_return' => $returnTime,
                'odometer_end' => $odometerEnd,
                'closed_by' => $user ? $user->id : null,
                'notes' => $data['remarks'] ?? $trip->notes,
            ]);

            // Free vehicle & driver back to available
            if ($trip->vehicle_id) {
                DeliveryVehicle::where('id', $trip->vehicle_id)->update(['status' => 'available']);
            }
            if ($trip->driver_id) {
                DeliveryDriver::where('id', $trip->driver_id)->update(['status' => 'available']);
            }

            $this->recordStatusHistory('trip', $trip->id, $prevStatus, 'closed', $user, $data['remarks'] ?? 'Trip closed successfully.');

            return $trip->fresh(['stops', 'vehicle', 'driver']);
        });
    }

    /**
     * Record immutable status history entry.
     */
    public function recordStatusHistory(
        string $modelType,
        int $modelId,
        ?string $prevStatus,
        string $newStatus,
        ?User $user = null,
        ?string $remarks = null,
        ?array $meta = null
    ): DeliveryStatusHistory {
        return DeliveryStatusHistory::create([
            'model_type' => $modelType,
            'model_id' => $modelId,
            'previous_status' => $prevStatus,
            'new_status' => $newStatus,
            'user_id' => $user ? $user->id : null,
            'remarks' => $remarks,
            'metadata' => $meta,
            'created_at' => now(),
        ]);
    }

    protected function generateDeliveryOrderNo(): string
    {
        $year = date('Y');
        $random = strtoupper(substr(bin2hex(random_bytes(3)), 0, 4));
        $count = DeliveryOrder::whereYear('created_at', $year)->count() + 1;
        $seq = str_pad($count, 4, '0', STR_PAD_LEFT);
        return "DEL-{$year}-{$seq}-{$random}";
    }

    protected function generateTripCode(): string
    {
        $year = date('Y');
        $count = DeliveryTrip::whereYear('created_at', $year)->count() + 1;
        $seq = str_pad($count, 4, '0', STR_PAD_LEFT);
        return "TRIP-{$year}-{$seq}";
    }

    protected function getDefaultWarehouseId(int $branchId): int
    {
        $wh = Warehouse::where('branch_id', $branchId)->where('active', true)->first();
        if ($wh) {
            return $wh->id;
        }
        $wh = Warehouse::where('active', true)->first();
        return $wh ? $wh->id : 1;
    }
    /**
     * Synchronize invoice delivery status and its line items from manual invoice actions.
     * Also cascades to linked DeliveryOrder if present.
     */
    public function syncFromInvoiceDeliveryStatus(Invoice $invoice, string $newStatus, array $itemUpdates = [], ?User $user = null): Invoice
    {
        return DB::transaction(function () use ($invoice, $newStatus, $itemUpdates, $user) {
            $invoice->loadMissing(['items', 'deliveryOrder.items']);

            $validStatuses = ['pending', 'packed', 'sent', 'delivered'];
            if (!in_array($newStatus, $validStatuses, true)) {
                throw new InvalidArgumentException("Invalid delivery status: {$newStatus}");
            }

            $updateData = ['delivery_status' => $newStatus];
            if ($newStatus === 'packed' && !$invoice->packed_at) {
                $updateData['packed_at'] = now();
            } elseif ($newStatus === 'sent') {
                $updateData['dispatched_at'] = now();
                if (!$invoice->packed_at) {
                    $updateData['packed_at'] = now();
                }
            } elseif ($newStatus === 'delivered') {
                $updateData['delivered_at'] = now();
                if (!$invoice->packed_at) {
                    $updateData['packed_at'] = now();
                }
                if (!$invoice->dispatched_at) {
                    $updateData['dispatched_at'] = now();
                }
            }

            $invoice->update($updateData);

            // Update items
            $itemUpdatesById = collect($itemUpdates)->keyBy('id')->all();

            foreach ($invoice->items as $invItem) {
                $itemPayload = $itemUpdatesById[$invItem->id] ?? null;
                $itemStatus = $itemPayload['delivery_status'] ?? $newStatus;
                $packedQty = isset($itemPayload['packed_quantity'])
                    ? (float) $itemPayload['packed_quantity']
                    : ($newStatus !== 'pending' ? (float) $invItem->quantity : (float) $invItem->packed_quantity);
                $deliveredQty = isset($itemPayload['delivered_quantity'])
                    ? (float) $itemPayload['delivered_quantity']
                    : ($newStatus === 'delivered' ? (float) $invItem->quantity : (float) $invItem->delivered_quantity);

                $invItem->update([
                    'delivery_status' => $itemStatus,
                    'packed_quantity' => $packedQty,
                    'delivered_quantity' => $deliveredQty,
                ]);
            }

            // Sync with DeliveryOrder if present
            $deliveryOrder = $invoice->deliveryOrder;
            if ($deliveryOrder) {
                $orderStatusMap = [
                    'pending' => 'delivery_pending',
                    'packed' => 'ready_for_dispatch',
                    'sent' => 'dispatched',
                    'delivered' => 'delivered',
                ];
                $newOrderStatus = $orderStatusMap[$newStatus] ?? 'delivery_pending';
                $prevStatus = $deliveryOrder->status;

                $deliveryOrder->update([
                    'status' => $newOrderStatus,
                    'delivery_completed_at' => $newStatus === 'delivered' ? now() : null,
                ]);

                foreach ($deliveryOrder->items as $dItem) {
                    $reqQty = (float) $dItem->requested_quantity;
                    $loadedQty = $newStatus === 'pending' ? 0 : $reqQty;
                    $delivQty = $newStatus === 'delivered' ? $reqQty : 0;

                    $dItem->update([
                        'loaded_quantity' => $loadedQty,
                        'delivered_quantity' => $delivQty,
                        'pending_quantity' => max(0, $reqQty - $delivQty),
                    ]);
                }

                $this->recordStatusHistory(
                    'order',
                    $deliveryOrder->id,
                    $prevStatus,
                    $newOrderStatus,
                    $user,
                    "Status updated to {$newStatus} from Sales Invoice #{$invoice->invoice_no}"
                );
            }

            return $invoice->fresh(['items', 'deliveryOrder']);
        });
    }
}
