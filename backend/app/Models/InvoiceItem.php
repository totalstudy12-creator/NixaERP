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
        'discount_percent',
        'igst_percent',
        'tax_rate',
        'subtotal',
        'total',
    ];

    protected $casts = [
        'unit_price'       => 'decimal:2',
        'discount_percent' => 'decimal:2',
        'igst_percent'     => 'decimal:2',
        'tax_rate'         => 'decimal:2',
        'subtotal'         => 'decimal:2',
        'total'            => 'decimal:2',
    ];

    // Relationships
    public function invoice()
    {
        return $this->belongsTo(Invoice::class);
    }

    public function product()
    {
        return $this->belongsTo(Product::class);
    }
}