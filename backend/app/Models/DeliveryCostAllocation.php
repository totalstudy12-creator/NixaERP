<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DeliveryCostAllocation extends Model
{
    use HasFactory;

    protected $table = 'delivery_cost_allocations';

    protected $fillable = [
        'delivery_trip_id',
        'delivery_order_id',
        'invoice_id',
        'allocation_method',
        'allocation_basis_value',
        'allocation_percentage',
        'calculated_amount',
        'adjustment_amount',
        'final_allocated_amount',
        'adjustment_reason',
        'adjusted_by',
        'is_approved',
        'approved_by',
        'approved_at',
    ];

    protected $casts = [
        'allocation_basis_value' => 'decimal:4',
        'allocation_percentage' => 'decimal:4',
        'calculated_amount' => 'decimal:2',
        'adjustment_amount' => 'decimal:2',
        'final_allocated_amount' => 'decimal:2',
        'is_approved' => 'boolean',
        'approved_at' => 'datetime',
    ];

    public function trip(): BelongsTo
    {
        return $this->belongsTo(DeliveryTrip::class, 'delivery_trip_id');
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(DeliveryOrder::class, 'delivery_order_id');
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class, 'invoice_id');
    }

    public function adjustedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'adjusted_by');
    }

    public function approvedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }
}
