<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Invoice extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'company_id',
        'branch_id',
        'customer_id',
        'order_id',
        'invoice_no',
        'public_token',
        'total_amount',
        'tax_amount',
        'discount_amount',
        'status',
        'due_date',
        'paid_at',
        'notes',

        'customer_name',
        'customer_address',
        'billing_street',
        'billing_city',
        'billing_state',
        'billing_country',
        'billing_pincode',
        'shipping_street',
        'shipping_city',
        'shipping_state',
        'shipping_country',
        'shipping_pincode',
        'contact_person',
        'contact_no',
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
        'payment_term',
        'bank_id',
        'packing_charges',
        'general_discount_percent',
        'general_discount_amount',
        'tcs_percent',
        'tcs_amount',
        'round_off',
        'terms_title',
        'terms_detail',
        'document_note',
        'internal_note',
        'additional_charges',
        'subtotal',
        'quotation_id',
        'delivery_status',
        'packed_at',
        'dispatched_at',
        'delivered_at',
    ];

    protected $casts = [
        'total_amount'              => 'decimal:2',
        'tax_amount'                => 'decimal:2',
        'discount_amount'           => 'decimal:2',
        'payment_received'          => 'decimal:2',
        'packing_charges'           => 'decimal:2',
        'general_discount_percent'  => 'decimal:2',
        'general_discount_amount'   => 'decimal:2',
        'tcs_percent'               => 'decimal:2',
        'tcs_amount'                => 'decimal:2',
        'round_off'                 => 'decimal:2',
        'subtotal'                  => 'decimal:2',
        'due_date'                  => 'date:Y-m-d',
        'invoice_date'              => 'date:Y-m-d',
        'challan_date'              => 'date:Y-m-d',
        'po_date'                   => 'date:Y-m-d',
        'paid_at'                   => 'datetime',
        'reverse_charge'            => 'boolean',
        'keep_advance'              => 'boolean',
        'additional_charges'        => 'array',
        'packed_at'                 => 'datetime',
        'dispatched_at'             => 'datetime',
        'delivered_at'              => 'datetime',
    ];

    public function company()
    {
        return $this->belongsTo(Company::class);
    }

    public function branch()
    {
        return $this->belongsTo(Branch::class);
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function quotation()
    {
        return $this->belongsTo(Quotation::class);
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

    public function deliveryOrder()
    {
        return $this->hasOne(DeliveryOrder::class);
    }

    public function deliveryOrders()
    {
        return $this->hasMany(DeliveryOrder::class);
    }

    /**
     * Recalculate and synchronize delivery_status from individual line items.
     */
    public function syncDeliveryStatusFromItems(): self
    {
        $this->loadMissing('items');

        if ($this->items->isEmpty()) {
            return $this;
        }

        $statuses = $this->items->pluck('delivery_status')->map(fn($s) => strtolower(trim((string)$s)))->all();
        $unique = array_values(array_unique($statuses));

        if (count($unique) === 1 && $unique[0] === 'delivered') {
            $this->delivery_status = 'delivered';
            if (!$this->delivered_at) {
                $this->delivered_at = now();
            }
        } elseif (count($unique) === 1 && $unique[0] === 'packed') {
            $this->delivery_status = 'packed';
            if (!$this->packed_at) {
                $this->packed_at = now();
            }
        } elseif (count($unique) === 1 && $unique[0] === 'pending') {
            $this->delivery_status = 'pending';
        } elseif (in_array('delivered', $statuses) || in_array('sent', $statuses)) {
            $this->delivery_status = 'sent';
            if (!$this->dispatched_at) {
                $this->dispatched_at = now();
            }
        } elseif (in_array('packed', $statuses)) {
            $this->delivery_status = 'packed';
            if (!$this->packed_at) {
                $this->packed_at = now();
            }
        }

        $this->saveQuietly();

        return $this;
    }

    public function getPaymentReceivedAttribute()
    {
        return $this->attributes['paid_amount']
            ?? $this->attributes['payment_amount']
            ?? $this->attributes['payment_received']
            ?? 0;
    }

    public function setPaymentReceivedAttribute($value)
    {
        if (\Illuminate\Support\Facades\Schema::hasColumn('invoices', 'paid_amount')) {
            $this->attributes['paid_amount'] = $value;
        } elseif (\Illuminate\Support\Facades\Schema::hasColumn('invoices', 'payment_amount')) {
            $this->attributes['payment_amount'] = $value;
        } elseif (\Illuminate\Support\Facades\Schema::hasColumn('invoices', 'payment_received')) {
            $this->attributes['payment_received'] = $value;
        } else {
            $this->attributes['paid_amount'] = $value;
        }
    }

    protected static function booted(): void
    {
        static::creating(function (Invoice $invoice) {
            if (empty($invoice->public_token)) {
                $token = bin2hex(random_bytes(16));
                while (static::where('public_token', $token)->exists()) {
                    $token = bin2hex(random_bytes(16));
                }
                $invoice->public_token = $token;
            }
        });
    }

    public function getPublicUrlAttribute(): string
    {
        return url("/public/invoice/{$this->public_token}");
    }

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