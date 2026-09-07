<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PurchaseInvoiceItem extends Model
{
    protected $fillable = [
        'purchase_invoice_id',
        'product_id',
        'product_name',
        'hsn_sac_code',
        'sku',
        'unit',

        'quantity',
        'free_quantity',

        'purchase_price',

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

        'total',
    ];

    protected $casts = [
        'purchase_invoice_id' => 'integer',
        'product_id' => 'integer',

        'quantity' => 'decimal:3',
        'free_quantity' => 'decimal:3',

        'purchase_price' => 'decimal:2',

        'discount_percent' => 'decimal:2',
        'discount_amount' => 'decimal:2',

        'gst_slab' => 'decimal:2',

        'is_inter_state' => 'boolean',

        'cgst_percent' => 'decimal:2',
        'sgst_percent' => 'decimal:2',
        'igst_percent' => 'decimal:2',

        'cgst_amount' => 'decimal:2',
        'sgst_amount' => 'decimal:2',
        'igst_amount' => 'decimal:2',

        'total' => 'decimal:2',
    ];

    public function purchaseInvoice()
    {
        return $this->belongsTo(
            PurchaseInvoice::class,
            'purchase_invoice_id'
        );
    }

    public function product()
    {
        return $this->belongsTo(
            Product::class,
            'product_id'
        );
    }
}