<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PurchaseInvoiceItem extends Model
{
    protected $fillable = [
        'purchase_invoice_id', 'product_id', 'product_name', 'hsn_sac_code',
        'sku', 'unit', 'quantity', 'free_quantity', 'purchase_price',
        'discount_type', 'discount_percent', 'discount_amount', 'gst_slab',
        'is_inter_state', 'cgst_percent', 'sgst_percent', 'igst_percent',
        'cgst_amount', 'sgst_amount', 'igst_amount', 'total',
    ];

    public function purchaseInvoice()
    {
        return $this->belongsTo(PurchaseInvoice::class);
    }

    public function product()
    {
        return $this->belongsTo(Product::class);
    }
}