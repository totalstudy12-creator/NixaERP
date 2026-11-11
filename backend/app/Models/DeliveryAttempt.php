<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DeliveryAttempt extends Model
{
    use HasFactory;

    protected $table = 'delivery_attempts';

    protected $fillable = [
        'delivery_order_id',
        'delivery_trip_id',
        'delivery_trip_stop_id',
        'attempt_number',
        'attempt_date',
        'status',
        'failure_reason',
        'failure_remarks',
        'receiver_name',
        'receiver_phone',
        'receiver_relationship',
        'signature_url',
        'photo_proof_url',
        'latitude',
        'longitude',
        'performed_by',
    ];

    protected $casts = [
        'attempt_number' => 'integer',
        'attempt_date' => 'datetime',
        'latitude' => 'decimal:7',
        'longitude' => 'decimal:7',
    ];

    public function order(): BelongsTo
    {
        return $this->belongsTo(DeliveryOrder::class, 'delivery_order_id');
    }

    public function trip(): BelongsTo
    {
        return $this->belongsTo(DeliveryTrip::class, 'delivery_trip_id');
    }

    public function stop(): BelongsTo
    {
        return $this->belongsTo(DeliveryTripStop::class, 'delivery_trip_stop_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(DeliveryAttemptItem::class, 'delivery_attempt_id');
    }

    public function performer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'performed_by');
    }
}
