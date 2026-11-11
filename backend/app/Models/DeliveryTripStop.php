<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DeliveryTripStop extends Model
{
    use HasFactory;

    protected $table = 'delivery_trip_stops';

    protected $fillable = [
        'delivery_trip_id',
        'delivery_order_id',
        'invoice_id',
        'stop_sequence',
        'customer_name',
        'delivery_area',
        'delivery_address',
        'latitude',
        'longitude',
        'status',
        'estimated_arrival',
        'actual_arrival',
        'notes',
    ];

    protected $casts = [
        'stop_sequence' => 'integer',
        'latitude' => 'decimal:7',
        'longitude' => 'decimal:7',
        'estimated_arrival' => 'datetime',
        'actual_arrival' => 'datetime',
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
}
