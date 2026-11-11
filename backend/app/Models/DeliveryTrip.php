<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class DeliveryTrip extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'delivery_trips';

    protected $fillable = [
        'company_id',
        'branch_id',
        'trip_code',
        'vehicle_id',
        'driver_id',
        'source_warehouse_id',
        'planned_date',
        'planned_departure',
        'expected_return',
        'actual_departure',
        'actual_return',
        'status',
        'total_customers',
        'total_items_count',
        'total_quantity',
        'total_weight_kg',
        'total_volume_cft',
        'capacity_override',
        'capacity_override_reason',
        'capacity_override_by',
        'transport_cost',
        'cost_allocation_status',
        'cost_allocation_method',
        'dispatched_by',
        'closed_by',
        'odometer_start',
        'odometer_end',
        'notes',
        'created_by',
    ];

    protected $casts = [
        'planned_date' => 'date',
        'planned_departure' => 'datetime',
        'expected_return' => 'datetime',
        'actual_departure' => 'datetime',
        'actual_return' => 'datetime',
        'total_quantity' => 'decimal:2',
        'total_weight_kg' => 'decimal:2',
        'total_volume_cft' => 'decimal:2',
        'transport_cost' => 'decimal:2',
        'capacity_override' => 'boolean',
        'odometer_start' => 'decimal:2',
        'odometer_end' => 'decimal:2',
    ];

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(DeliveryVehicle::class, 'vehicle_id');
    }

    public function driver(): BelongsTo
    {
        return $this->belongsTo(DeliveryDriver::class, 'driver_id');
    }

    public function sourceWarehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class, 'source_warehouse_id');
    }

    public function stops(): HasMany
    {
        return $this->hasMany(DeliveryTripStop::class, 'delivery_trip_id')->orderBy('stop_sequence');
    }

    public function loadingItems(): HasMany
    {
        return $this->hasMany(DeliveryLoadingItem::class, 'delivery_trip_id');
    }

    public function costAllocations(): HasMany
    {
        return $this->hasMany(DeliveryCostAllocation::class, 'delivery_trip_id');
    }
    public function statusHistories(): HasMany
    {
        return $this->hasMany(DeliveryStatusHistory::class, 'model_id')
            ->where('model_type', 'trip')
            ->orderBy('created_at', 'desc');
    }


    public function orders(): HasMany
    {
        return $this->hasMany(DeliveryOrder::class, 'current_trip_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function dispatcher(): BelongsTo
    {
        return $this->belongsTo(User::class, 'dispatched_by');
    }

    public function closer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'closed_by');
    }
}
