<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class PurchaseInvoice extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'company_id', 'supplier_id', 'purchase_number', 'bill_number',
        'purchase_date', 'due_date', 'expected_delivery_date', 'reference_number',
        'invoice_number', 'invoice_date', 'warehouse', 'currency', 'notes',
        'internal_remarks', 'subtotal', 'order_discount', 'tax_amount',
        'shipping_charges', 'packing_charges', 'other_charges', 'round_off',
        'grand_total', 'status', 'payment_status', 'payment_method',
        'paid_amount', 'payment_date', 'payment_reference', 'payment_notes',
    ];

    public function company()
    {
        return $this->belongsTo(Company::class);
    }

    public function supplier()
    {
        return $this->belongsTo(Supplier::class);
    }

    public function items()
    {
        return $this->hasMany(PurchaseInvoiceItem::class);
    }

    public function payments()
    {
        return $this->morphMany(Payment::class, 'payable');
    }
}