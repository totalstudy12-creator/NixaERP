<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Invoice extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'company_id',
        'customer_id',
        'order_id',
        'invoice_no',
        'total_amount',
        'tax_amount',
        'discount_amount',
        'status',
        'due_date',
        'paid_at',
        'notes',

        // Additional fields from frontend
        'customer_name',
        'customer_address',
        'contact_person',
        'phone_no',
        'gstin',
        'pan',
        'reverse_charge',
        'ship_to',
        'place_of_supply',
        'invoice_type',
        'invoice_date',
        'challan_no',
        'challan_date',
        'po_no',
        'po_date',
        'lr_no',
        'eway_no',
        'delivery_mode',
        'payment_type',
        'payment_received',
        'keep_advance',
        'bank_id',
        'packing_charges',
        'general_discount_percent',
        'general_discount_amount',
        'round_off',
        'terms_title',
        'terms_detail',
        'document_note',
    ];

    protected $casts = [
        'total_amount'              => 'decimal:2',
        'tax_amount'                => 'decimal:2',
        'discount_amount'           => 'decimal:2',
        'payment_received'          => 'decimal:2',
        'packing_charges'           => 'decimal:2',
        'general_discount_percent'  => 'decimal:2',
        'general_discount_amount'   => 'decimal:2',
        'round_off'                 => 'decimal:2',
        'due_date'                  => 'date',
        'invoice_date'              => 'date',
        'challan_date'              => 'date',
        'po_date'                   => 'date',
        'paid_at'                   => 'datetime',
        'reverse_charge'            => 'boolean',
        'keep_advance'              => 'boolean',
    ];

    // ── Relationships ──
    public function company()
    {
        return $this->belongsTo(Company::class);
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function order()
    {
        return $this->belongsTo(Order::class);
    }

    public function items()
    {
        return $this->hasMany(InvoiceItem::class);
    }

    public function payments()
    {
        return $this->hasMany(Payment::class);
    }

    // ── Auto‑generation ──
    /**
     * Generate a unique invoice number like INV-YYYYMMDD-0001
     */
    public static function generateInvoiceNo(): string
    {
        $date = now()->format('Ymd');
        $prefix = "INV-{$date}-";

        $last = self::where('invoice_no', 'like', $prefix . '%')
                    ->orderBy('invoice_no', 'desc')
                    ->first();

        if ($last) {
            $lastNumber = (int) substr($last->invoice_no, -4);
            $newNumber = $lastNumber + 1;
        } else {
            $newNumber = 1;
        }

        return $prefix . str_pad($newNumber, 4, '0', STR_PAD_LEFT);
    }
}