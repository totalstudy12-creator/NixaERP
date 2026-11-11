<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CashDrawerTransaction extends Model
{
    use HasFactory;

    protected $table = 'cash_drawer_transactions';

    protected $fillable = [
        'company_id',
        'branch_id',
        'cash_drawer_id',
        'cash_drawer_session_id',
        'transaction_number',
        'transaction_type',
        'category',
        'amount',
        'balance_before',
        'balance_after',
        'transaction_date',
        'reference_no',
        'received_from_or_paid_to',
        'description',
        'source_type',
        'source_id',
        'idempotency_key',
        'is_reversal',
        'reversed_transaction_id',
        'created_by',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'balance_before' => 'decimal:2',
        'balance_after' => 'decimal:2',
        'transaction_date' => 'datetime',
        'is_reversal' => 'boolean',
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

    public function session(): BelongsTo
    {
        return $this->belongsTo(CashDrawerSession::class, 'cash_drawer_session_id');
    }

    public function reversedTransaction(): BelongsTo
    {
        return $this->belongsTo(CashDrawerTransaction::class, 'reversed_transaction_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
