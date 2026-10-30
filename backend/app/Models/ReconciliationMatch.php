<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ReconciliationMatch extends Model
{
    use HasFactory;

    protected $table = 'reconciliation_matches';

    protected $fillable = [
        'bank_statement_transaction_id',
        'payment_id',
        'financial_entry_id',
        'bank_account_transaction_id',
        'allocated_amount',
        'match_rule',
        'confidence_score',
        'status',
        'created_by',
    ];

    protected $casts = [
        'allocated_amount' => 'decimal:2',
        'confidence_score' => 'integer',
    ];

    public function statementTransaction()
    {
        return $this->belongsTo(BankStatementTransaction::class, 'bank_statement_transaction_id');
    }

    public function payment()
    {
        return $this->belongsTo(Payment::class, 'payment_id');
    }

    public function financialEntry()
    {
        return $this->belongsTo(FinancialEntry::class, 'financial_entry_id');
    }

    public function accountTransaction()
    {
        return $this->belongsTo(BankAccountTransaction::class, 'bank_account_transaction_id');
    }
}
