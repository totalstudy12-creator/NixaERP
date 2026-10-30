<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Quotation extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'quotation_number',
        'reference_no',
        'company_id',
        'branch_id',
        'customer_id',
        'customer_name',
        'customer_email',
        'customer_phone',
        'billing_address',
        'shipping_address',
        'gstin',
        'pan',
        'quotation_date',
        'valid_until',
        'status', // draft, sent, accepted, rejected, expired, converted
        'rejection_reason',
        'follow_up_date',
        'subtotal',
        'discount_amount',
        'taxable_amount',
        'tax_amount',
        'cgst_amount',
        'sgst_amount',
        'igst_amount',
        'shipping_charges',
        'other_charges',
        'round_off',
        'total_amount',
        'notes',
        'terms_and_conditions',
        'converted_invoice_id',
        'converted_at',
        'created_by',
        'assigned_to',
    ];

    protected $casts = [
        'quotation_date'   => 'date',
        'valid_until'      => 'date',
        'follow_up_date'   => 'date',
        'converted_at'     => 'datetime',
        'subtotal'         => 'decimal:2',
        'discount_amount'  => 'decimal:2',
        'taxable_amount'   => 'decimal:2',
        'tax_amount'       => 'decimal:2',
        'cgst_amount'      => 'decimal:2',
        'sgst_amount'      => 'decimal:2',
        'igst_amount'      => 'decimal:2',
        'shipping_charges' => 'decimal:2',
        'other_charges'    => 'decimal:2',
        'round_off'        => 'decimal:2',
        'total_amount'     => 'decimal:2',
    ];

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function convertedInvoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class, 'converted_invoice_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(QuotationItem::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    /**
     * Check if quotation is expired based on valid_until date
     */
    public function getIsExpiredAttribute(): bool
    {
        if ($this->status === 'converted' || $this->status === 'accepted') {
            return false;
        }

        if (!$this->valid_until) {
            return false;
        }

        return $this->valid_until->isPast() && !$this->valid_until->isToday();
    }
}
