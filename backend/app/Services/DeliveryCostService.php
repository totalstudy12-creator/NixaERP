<?php

namespace App\Services;

use App\Models\DeliveryCostAllocation;
use App\Models\DeliveryTrip;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class DeliveryCostService
{
    /**
     * Calculate and allocate transportation costs across trip delivery orders.
     *
     * @param DeliveryTrip $trip
     * @param float $totalCost Total transportation cost in INR
     * @param string $method equal|quantity|weight|volume|percentage|manual
     * @param array|null $customData Optional custom percentages or amounts by order_id
     * @param User|null $user
     * @return array
     */
    public function calculateAndAllocate(
        DeliveryTrip $trip,
        float $totalCost,
        string $method = 'equal',
        ?array $customData = null,
        ?User $user = null
    ): array {
        if ($totalCost < 0) {
            throw new InvalidArgumentException('Total transportation cost cannot be negative.');
        }

        $trip->loadMissing(['stops.order.items', 'stops.invoice']);
        $stops = $trip->stops;

        if ($stops->isEmpty()) {
            throw new InvalidArgumentException('Cannot allocate transport costs on a trip with zero stops.');
        }

        $count = $stops->count();
        $allocations = [];
        $totalCostCents = (int) round($totalCost * 100);

        if ($totalCostCents === 0) {
            // Free or zero cost
            foreach ($stops as $stop) {
                $allocations[$stop->delivery_order_id] = [
                    'order_id' => $stop->delivery_order_id,
                    'invoice_id' => $stop->invoice_id,
                    'method' => $method,
                    'basis_value' => 0,
                    'percentage' => round(100 / $count, 4),
                    'amount' => 0.00,
                ];
            }
        } elseif ($method === 'equal') {
            $baseCents = intdiv($totalCostCents, $count);
            $remainderCents = $totalCostCents % $count;

            $i = 0;
            foreach ($stops as $stop) {
                $lineCents = $baseCents + ($i < $remainderCents ? 1 : 0);
                $allocations[$stop->delivery_order_id] = [
                    'order_id' => $stop->delivery_order_id,
                    'invoice_id' => $stop->invoice_id,
                    'method' => 'equal',
                    'basis_value' => 1,
                    'percentage' => round((($lineCents / $totalCostCents) * 100), 4),
                    'amount' => round($lineCents / 100, 2),
                ];
                $i++;
            }
        } elseif ($method === 'quantity') {
            $totalQty = 0;
            $orderQtys = [];
            foreach ($stops as $stop) {
                $qty = (float) ($stop->order->total_quantity ?? 0);
                if ($qty <= 0) {
                    $qty = (float) $stop->order->items->sum('requested_quantity');
                }
                $qty = max($qty, 0.01); // Prevent zero division
                $orderQtys[$stop->delivery_order_id] = $qty;
                $totalQty += $qty;
            }

            $allocatedCentsSum = 0;
            $rawLines = [];
            foreach ($stops as $stop) {
                $qty = $orderQtys[$stop->delivery_order_id];
                $ratio = $qty / $totalQty;
                $cents = (int) round($ratio * $totalCostCents);
                $allocatedCentsSum += $cents;
                $rawLines[$stop->delivery_order_id] = [
                    'order_id' => $stop->delivery_order_id,
                    'invoice_id' => $stop->invoice_id,
                    'method' => 'quantity',
                    'basis_value' => $qty,
                    'percentage' => round($ratio * 100, 4),
                    'cents' => $cents,
                ];
            }

            // Distribute rounding difference
            $diffCents = $totalCostCents - $allocatedCentsSum;
            if ($diffCents !== 0) {
                // Find stop with largest quantity
                $maxOrderId = array_keys($orderQtys, max($orderQtys))[0];
                $rawLines[$maxOrderId]['cents'] += $diffCents;
            }

            foreach ($rawLines as $orderId => $line) {
                $allocations[$orderId] = [
                    'order_id' => $line['order_id'],
                    'invoice_id' => $line['invoice_id'],
                    'method' => $line['method'],
                    'basis_value' => $line['basis_value'],
                    'percentage' => $line['percentage'],
                    'amount' => round($line['cents'] / 100, 2),
                ];
            }
        } elseif ($method === 'weight') {
            $totalWeight = 0;
            $orderWeights = [];
            foreach ($stops as $stop) {
                $weight = 0;
                foreach ($stop->order->items as $item) {
                    $weight += (float) ($item->unit_weight_kg ?? 0) * (float) $item->requested_quantity;
                }
                if ($weight <= 0) {
                    $weight = (float) ($stop->order->total_quantity ?? 1);
                }
                $orderWeights[$stop->delivery_order_id] = $weight;
                $totalWeight += $weight;
            }

            $allocatedCentsSum = 0;
            $rawLines = [];
            foreach ($stops as $stop) {
                $w = $orderWeights[$stop->delivery_order_id];
                $ratio = $w / $totalWeight;
                $cents = (int) round($ratio * $totalCostCents);
                $allocatedCentsSum += $cents;
                $rawLines[$stop->delivery_order_id] = [
                    'order_id' => $stop->delivery_order_id,
                    'invoice_id' => $stop->invoice_id,
                    'method' => 'weight',
                    'basis_value' => $w,
                    'percentage' => round($ratio * 100, 4),
                    'cents' => $cents,
                ];
            }

            $diffCents = $totalCostCents - $allocatedCentsSum;
            if ($diffCents !== 0) {
                $maxOrderId = array_keys($orderWeights, max($orderWeights))[0];
                $rawLines[$maxOrderId]['cents'] += $diffCents;
            }

            foreach ($rawLines as $orderId => $line) {
                $allocations[$orderId] = [
                    'order_id' => $line['order_id'],
                    'invoice_id' => $line['invoice_id'],
                    'method' => $line['method'],
                    'basis_value' => $line['basis_value'],
                    'percentage' => $line['percentage'],
                    'amount' => round($line['cents'] / 100, 2),
                ];
            }
        } elseif ($method === 'manual' && !empty($customData)) {
            $allocatedCentsSum = 0;
            foreach ($stops as $stop) {
                $val = (float) ($customData[$stop->delivery_order_id] ?? 0);
                $cents = (int) round($val * 100);
                $allocatedCentsSum += $cents;
                $allocations[$stop->delivery_order_id] = [
                    'order_id' => $stop->delivery_order_id,
                    'invoice_id' => $stop->invoice_id,
                    'method' => 'manual',
                    'basis_value' => $val,
                    'percentage' => $totalCostCents > 0 ? round(($cents / $totalCostCents) * 100, 4) : 0,
                    'amount' => round($cents / 100, 2),
                ];
            }

            $diffCents = $totalCostCents - $allocatedCentsSum;
            if ($diffCents !== 0) {
                $firstOrderId = $stops->first()->delivery_order_id;
                $allocations[$firstOrderId]['amount'] = round(($allocations[$firstOrderId]['amount'] * 100 + $diffCents) / 100, 2);
            }
        } else {
            // Default fallback to equal distribution
            return $this->calculateAndAllocate($trip, $totalCost, 'equal', null, $user);
        }

        // Persist records inside a transaction
        return DB::transaction(function () use ($trip, $totalCost, $method, $allocations, $user) {
            $trip->update([
                'transport_cost' => $totalCost,
                'cost_allocation_method' => $method,
                'cost_allocation_status' => 'allocated',
            ]);

            // Clear old allocations for this trip
            DeliveryCostAllocation::where('delivery_trip_id', $trip->id)->delete();

            $records = [];
            foreach ($allocations as $alloc) {
                $records[] = DeliveryCostAllocation::create([
                    'delivery_trip_id' => $trip->id,
                    'delivery_order_id' => $alloc['order_id'],
                    'invoice_id' => $alloc['invoice_id'],
                    'allocation_method' => $alloc['method'],
                    'allocation_basis_value' => $alloc['basis_value'],
                    'allocation_percentage' => $alloc['percentage'],
                    'calculated_amount' => $alloc['amount'],
                    'adjustment_amount' => 0,
                    'final_allocated_amount' => $alloc['amount'],
                    'is_approved' => false,
                ]);
            }

            return $records;
        });
    }

    /**
     * Manually adjust an individual delivery cost allocation with mandatory reason and audit.
     */
    public function adjustAllocation(
        DeliveryCostAllocation $allocation,
        float $newAmount,
        string $reason,
        User $user
    ): DeliveryCostAllocation {
        if ($newAmount < 0) {
            throw new InvalidArgumentException('Adjusted allocated amount cannot be negative.');
        }

        $trip = $allocation->trip;
        $diff = round($newAmount - (float) $allocation->calculated_amount, 2);

        return DB::transaction(function () use ($allocation, $newAmount, $diff, $reason, $user) {
            $allocation->update([
                'adjustment_amount' => $diff,
                'final_allocated_amount' => $newAmount,
                'adjustment_reason' => $reason,
                'adjusted_by' => $user->id,
            ]);

            return $allocation->fresh();
        });
    }

    /**
     * Approve cost allocations for a trip.
     */
    public function approveAllocations(DeliveryTrip $trip, User $user): bool
    {
        return DB::transaction(function () use ($trip, $user) {
            DeliveryCostAllocation::where('delivery_trip_id', $trip->id)->update([
                'is_approved' => true,
                'approved_by' => $user->id,
                'approved_at' => now(),
            ]);

            $trip->update([
                'cost_allocation_status' => 'approved',
            ]);

            return true;
        });
    }
}
