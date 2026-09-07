<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class PurchaseInvoice extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'company_id',
        'supplier_id',

        'purchase_number',
        'bill_number',

        'purchase_date',
        'due_date',
        'expected_delivery_date',

        'reference_number',

        'invoice_number',
        'invoice_date',

        'warehouse',
        'currency',

        'notes',
        'internal_remarks',

        'subtotal',
        'order_discount',
        'tax_amount',
        'shipping_charges',
        'packing_charges',
        'other_charges',
        'round_off',
        'grand_total',

        'status',

        'payment_status',
        'payment_method',
        'paid_amount',
        'payment_date',
        'payment_reference',
        'payment_notes',
    ];

    protected $casts = [
        'company_id' => 'integer',
        'supplier_id' => 'integer',

        'purchase_date' => 'date',
        'due_date' => 'date',
        'expected_delivery_date' => 'date',
        'invoice_date' => 'date',
        'payment_date' => 'date',

        'subtotal' => 'decimal:2',
        'order_discount' => 'decimal:2',
        'tax_amount' => 'decimal:2',
        'shipping_charges' => 'decimal:2',
        'packing_charges' => 'decimal:2',
        'other_charges' => 'decimal:2',
        'round_off' => 'decimal:2',
        'grand_total' => 'decimal:2',
        'paid_amount' => 'decimal:2',
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
        return $this->hasMany(
            PurchaseInvoiceItem::class,
            'purchase_invoice_id'
        );
    }

    /**
     * Payments belonging to this purchase invoice.
     *
     * Payment table must contain:
     * payable_id
     * payable_type
     */
    public function payments()
    {
        return $this->morphMany(
            Payment::class,
            'payable'
        );
    }
}