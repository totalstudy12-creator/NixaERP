<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InvoiceItem extends Model
{
    protected $fillable = [
        'invoice_id',
        'product_id',
        'quantity',
        'unit_price',
        'discount_type',
        'discount_percent',
        'discount_amount',
        'gst_slab',
        'is_inter_state',
        'cgst_percent',
        'sgst_percent',
        'igst_percent',
        'cgst_amount',
        'sgst_amount',
        'igst_amount',
        'tax_rate',
        'subtotal',
        'total',
    ];

    protected $casts = [
        'unit_price'       => 'decimal:2',
        'discount_percent' => 'decimal:2',
        'discount_amount'  => 'decimal:2',
        'gst_slab'         => 'decimal:2',
        'cgst_percent'     => 'decimal:2',
        'sgst_percent'     => 'decimal:2',
        'igst_percent'     => 'decimal:2',
        'cgst_amount'      => 'decimal:2',
        'sgst_amount'      => 'decimal:2',
        'igst_amount'      => 'decimal:2',
        'tax_rate'         => 'decimal:2',
        'subtotal'         => 'decimal:2',
        'total'            => 'decimal:2',
        'is_inter_state'   => 'boolean',
    ];

    public function invoice()
    {
        return $this->belongsTo(Invoice::class);
    }

    public function product()
    {
        return $this->belongsTo(Product::class);
    }
}