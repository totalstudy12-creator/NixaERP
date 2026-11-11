<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CashDrawerSession extends Model
{
    use HasFactory;

    protected $table = 'cash_drawer_sessions';

    protected $fillable = [
        'company_id',
        'branch_id',
        'cash_drawer_id',
        'user_id',
        'session_number',
        'status',
        'opened_at',
        'closed_at',
        'opening_balance',
        'suggested_opening_balance',
        'opening_difference',
        'opening_difference_reason',
        'opening_notes',
        'opening_denominations',
        'total_cash_in',
        'total_cash_out',
        'expected_closing_cash',
        'actual_closing_cash',
        'closing_difference',
        'closing_notes',
        'discrepancy_reason',
        'closing_denominations',
        'closed_by',
        'discrepancy_status',
        'approved_by',
        'approved_at',
        'approval_notes',
    ];

    protected $casts = [
        'opened_at' => 'datetime',
        'closed_at' => 'datetime',
        'approved_at' => 'datetime',
        'opening_balance' => 'decimal:2',
        'suggested_opening_balance' => 'decimal:2',
        'opening_difference' => 'decimal:2',
        'opening_denominations' => 'array',
        'total_cash_in' => 'decimal:2',
        'total_cash_out' => 'decimal:2',
        'expected_closing_cash' => 'decimal:2',
        'actual_closing_cash' => 'decimal:2',
        'closing_difference' => 'decimal:2',
        'closing_denominations' => 'array',
    ];

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function cashDrawer(): BelongsTo
    {
        return $this->belongsTo(CashDrawer::class);
    }

    public function cashier(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function closer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'closed_by');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(CashDrawerTransaction::class)->orderByDesc('id');
    }

    public function isOpen(): bool
    {
        return $this->status === 'open';
    }

    public function isClosed(): bool
    {
        return $this->status === 'closed';
    }

    public function hasDiscrepancy(): bool
    {
        return $this->closing_difference !== null && abs((float) $this->closing_difference) > 0.009;
    }
}
