<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class DeliveryOrder extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'delivery_orders';

    protected $fillable = [
        'company_id',
        'branch_id',
        'invoice_id',
        'customer_id',
        'delivery_order_no',
        'delivery_area_id',
        'delivery_type',
        'priority',
        'expected_delivery_date',
        'expected_delivery_time',
        'recipient_name',
        'recipient_phone',
        'delivery_address',
        'district',
        'town',
        'landmark',
        'latitude',
        'longitude',
        'delivery_instructions',
        'delivery_charge',
        'total_items_count',
        'total_quantity',
        'status',
        'current_trip_id',
        'delivery_completed_at',
        'created_by',
    ];

    protected $casts = [
        'expected_delivery_date' => 'date',
        'delivery_completed_at' => 'datetime',
        'delivery_charge' => 'decimal:2',
        'total_quantity' => 'decimal:2',
        'latitude' => 'decimal:7',
        'longitude' => 'decimal:7',
    ];

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function area(): BelongsTo
    {
        return $this->belongsTo(DeliveryArea::class, 'delivery_area_id');
    }

    public function currentTrip(): BelongsTo
    {
        return $this->belongsTo(DeliveryTrip::class, 'current_trip_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(DeliveryOrderItem::class, 'delivery_order_id');
    }

    public function attempts(): HasMany
    {
        return $this->hasMany(DeliveryAttempt::class, 'delivery_order_id')->orderBy('attempt_number');
    }

    public function tripStops(): HasMany
    {
        return $this->hasMany(DeliveryTripStop::class, 'delivery_order_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
    public function statusHistories(): HasMany
    {
        return $this->hasMany(DeliveryStatusHistory::class, 'model_id')
            ->where('model_type', 'order')
            ->orderBy('created_at', 'desc');
    }

}
