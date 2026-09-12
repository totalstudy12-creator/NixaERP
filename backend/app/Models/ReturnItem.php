<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReturnItem extends Model
{
    use HasFactory;

    protected $table = 'return_items';

    protected $fillable = [
        'sales_return_id',
        'sale_item_id',
        'product_id',
        'variant_id',
        'return_qty',
        'rate',
        'gst_rate',
        'taxable_amount',
        'cgst_amount',
        'sgst_amount',
        'igst_amount',
        'total_amount',
        'condition',
        'restock_status',
        'reason',
    ];

    protected $casts = [
        'return_qty' => 'integer',
        'rate' => 'decimal:2',
        'gst_rate' => 'decimal:2',
        'taxable_amount' => 'decimal:2',
        'cgst_amount' => 'decimal:2',
        'sgst_amount' => 'decimal:2',
        'igst_amount' => 'decimal:2',
        'total_amount' => 'decimal:2',
    ];

    public function salesReturn(): BelongsTo
    {
        return $this->belongsTo(SalesReturn::class, 'sales_return_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function saleItem(): BelongsTo
    {
        return $this->belongsTo(InvoiceItem::class, 'sale_item_id');
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'variant_id');
    }
}