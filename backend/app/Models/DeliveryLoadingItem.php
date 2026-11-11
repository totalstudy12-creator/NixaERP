<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DeliveryLoadingItem extends Model
{
    use HasFactory;

    protected $table = 'delivery_loading_items';

    protected $fillable = [
        'delivery_trip_id',
        'delivery_order_id',
        'delivery_order_item_id',
        'product_id',
        'warehouse_id',
        'planned_quantity',
        'picked_quantity',
        'is_loaded',
        'loaded_at',
        'loaded_by',
        'notes',
    ];

    protected $casts = [
        'planned_quantity' => 'decimal:2',
        'picked_quantity' => 'decimal:2',
        'is_loaded' => 'boolean',
        'loaded_at' => 'datetime',
    ];

    public function trip(): BelongsTo
    {
        return $this->belongsTo(DeliveryTrip::class, 'delivery_trip_id');
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(DeliveryOrder::class, 'delivery_order_id');
    }

    public function orderItem(): BelongsTo
    {
        return $this->belongsTo(DeliveryOrderItem::class, 'delivery_order_item_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'product_id');
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class, 'warehouse_id');
    }

    public function loader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'loaded_by');
    }
}
