<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BankReconciliation extends Model
{
    use HasFactory;

    protected $table = 'bank_reconciliations';

    protected $fillable = [
        'company_id',
        'branch_id',
        'bank_account_id',
        'statement_id',
        'reconciliation_date',
        'period_start',
        'period_end',
        'statement_ending_balance',
        'book_ending_balance',
        'unreconciled_deposits',
        'unreconciled_payments',
        'bank_charges',
        'bank_interest',
        'difference',
        'status',
        'reconciled_by',
        'approved_by',
        'approved_at',
    ];

    protected $casts = [
        'reconciliation_date' => 'date',
        'period_start' => 'date',
        'period_end' => 'date',
        'statement_ending_balance' => 'decimal:2',
        'book_ending_balance' => 'decimal:2',
        'unreconciled_deposits' => 'decimal:2',
        'unreconciled_payments' => 'decimal:2',
        'bank_charges' => 'decimal:2',
        'bank_interest' => 'decimal:2',
        'difference' => 'decimal:2',
        'approved_at' => 'datetime',
    ];

    public function bankAccount()
    {
        return $this->belongsTo(BankAccount::class, 'bank_account_id');
    }

    public function statement()
    {
        return $this->belongsTo(BankStatement::class, 'statement_id');
    }

    public function reconciler()
    {
        return $this->belongsTo(User::class, 'reconciled_by');
    }

    public function approver()
    {
        return $this->belongsTo(User::class, 'approved_by');
    }
}
