<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DeliveryOrderItem extends Model
{
    use HasFactory;

    protected $table = 'delivery_order_items';

    protected $fillable = [
        'delivery_order_id',
        'invoice_item_id',
        'product_id',
        'product_name',
        'unit',
        'requested_quantity',
        'loaded_quantity',
        'delivered_quantity',
        'pending_quantity',
        'source_warehouse_id',
        'unit_weight_kg',
        'unit_volume_cft',
    ];

    protected $casts = [
        'requested_quantity' => 'decimal:2',
        'loaded_quantity' => 'decimal:2',
        'delivered_quantity' => 'decimal:2',
        'pending_quantity' => 'decimal:2',
        'unit_weight_kg' => 'decimal:3',
        'unit_volume_cft' => 'decimal:3',
    ];

    public function deliveryOrder(): BelongsTo
    {
        return $this->belongsTo(DeliveryOrder::class, 'delivery_order_id');
    }

    public function invoiceItem(): BelongsTo
    {
        return $this->belongsTo(InvoiceItem::class, 'invoice_item_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'product_id');
    }

    public function sourceWarehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class, 'source_warehouse_id');
    }

    public function loadingItems(): HasMany
    {
        return $this->hasMany(DeliveryLoadingItem::class, 'delivery_order_item_id');
    }
}
