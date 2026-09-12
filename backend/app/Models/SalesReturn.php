<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SalesReturn extends Model
{
    use HasFactory;

    /**
     * All columns the controller actually writes. Missing entries here were
     * silently dropped by mass-assignment protection and caused the original
     * "everything is zero" bug.
     */
    protected $fillable = [
        'return_number',
        'company_id',
        'branch_id',
        'warehouse_id',
        'customer_id',
        'original_sale_id',
        'original_invoice_no',
        'return_date',
        'status',
        'subtotal',
        'discount_amount',
        'taxable_amount',
        'cgst_amount',
        'sgst_amount',
        'igst_amount',
        'total_tax',
        'grand_total',
        'refund_amount',
        'credit_amount',
        'refund_status',
        'reason',
        'remark',
        'created_by',
    ];

    protected $casts = [
        'return_date' => 'date',
        'subtotal' => 'decimal:2',
        'discount_amount' => 'decimal:2',
        'taxable_amount' => 'decimal:2',
        'cgst_amount' => 'decimal:2',
        'sgst_amount' => 'decimal:2',
        'igst_amount' => 'decimal:2',
        'total_tax' => 'decimal:2',
        'grand_total' => 'decimal:2',
        'refund_amount' => 'decimal:2',
        'credit_amount' => 'decimal:2',
    ];

    /* Relationships */

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

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    /**
     * The original sales invoice this return is reversing.
     * Controller property is `original_sale_id` — must be explicit.
     */
    public function originalSale(): BelongsTo
    {
        return $this->belongsTo(Invoice::class, 'original_sale_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function items(): HasMany
    {
        // Explicit FK so we don't depend on Laravel's naming convention.
        return $this->hasMany(ReturnItem::class, 'sales_return_id');
    }
}