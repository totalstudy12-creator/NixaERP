<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class PurchaseInvoice extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'company_id',
        'branch_id',
        'warehouse_id',
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
        'branch',
        'currency',

        'notes',
        'internal_remarks',

        'subtotal',
        'order_discount',
        'tax_amount',
        'shipping_charges',
        'packing_charges',
        'packing_apply_type',
        'other_charges',
        'round_off',
        'grand_total',

        'general_discount_type',
        'general_discount_percent',
        'general_discount_amount',
        'general_discount_apply_type',

        'tcs_percent',

        'status',

        'payment_status',
        'payment_method',
        'paid_amount',
        'payment_date',
        'payment_reference',
        'payment_notes',
    ];

    protected $casts = [
        'company_id'   => 'integer',
        'branch_id'    => 'integer',
        'warehouse_id' => 'integer',
        'supplier_id'  => 'integer',

        'purchase_date'          => 'date',
        'due_date'               => 'date',
        'expected_delivery_date' => 'date',
        'invoice_date'           => 'date',
        'payment_date'           => 'date',

        'subtotal'                 => 'decimal:2',
        'order_discount'           => 'decimal:2',
        'tax_amount'               => 'decimal:2',
        'shipping_charges'         => 'decimal:2',
        'packing_charges'          => 'decimal:2',
        'other_charges'            => 'decimal:2',
        'round_off'                => 'decimal:2',
        'grand_total'              => 'decimal:2',
        'paid_amount'              => 'decimal:2',
        'general_discount_percent' => 'decimal:2',
        'general_discount_amount'  => 'decimal:2',
        'tcs_percent'              => 'decimal:2',
    ];

    public function company()
    {
        return $this->belongsTo(Company::class);
    }

    public function branch()
    {
        return $this->belongsTo(Branch::class);
    }

    public function warehouseRelation()
    {
        return $this->belongsTo(Warehouse::class, 'warehouse_id');
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
     */
    public function payments()
    {
        return $this->morphMany(
            Payment::class,
            'payable'
        );
    }
}