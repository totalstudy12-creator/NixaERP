<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DeliveryAttemptItem extends Model
{
    use HasFactory;

    protected $table = 'delivery_attempt_items';

    protected $fillable = [
        'delivery_attempt_id',
        'delivery_order_item_id',
        'product_id',
        'loaded_quantity',
        'delivered_quantity',
        'returned_quantity',
        'return_to_warehouse_id',
        'remarks',
    ];

    protected $casts = [
        'loaded_quantity' => 'decimal:2',
        'delivered_quantity' => 'decimal:2',
        'returned_quantity' => 'decimal:2',
    ];

    public function attempt(): BelongsTo
    {
        return $this->belongsTo(DeliveryAttempt::class, 'delivery_attempt_id');
    }

    public function orderItem(): BelongsTo
    {
        return $this->belongsTo(DeliveryOrderItem::class, 'delivery_order_item_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'product_id');
    }

    public function returnWarehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class, 'return_to_warehouse_id');
    }
}
