<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BankStatementTransaction extends Model
{
    use HasFactory;

    protected $table = 'bank_statement_transactions';

    protected $fillable = [
        'statement_id',
        'bank_account_id',
        'company_id',
        'transaction_date',
        'value_date',
        'description',
        'reference_no',
        'debit',
        'credit',
        'balance',
        'fingerprint',
        'reconciliation_status',
        'matched_payment_id',
        'matched_transaction_id',
        'expense_draft_id',
        'learned_rule_id',
        'match_confidence',
        'match_type',
        'match_notes',
        'reconciled_at',
        'reconciled_by',
    ];

    protected $casts = [
        'transaction_date' => 'date',
        'value_date' => 'date',
        'debit' => 'decimal:2',
        'credit' => 'decimal:2',
        'balance' => 'decimal:2',
        'match_confidence' => 'integer',
        'reconciled_at' => 'datetime',
    ];

    public function statement()
    {
        return $this->belongsTo(BankStatement::class, 'statement_id');
    }

    public function bankAccount()
    {
        return $this->belongsTo(BankAccount::class, 'bank_account_id');
    }

    public function matchedPayment()
    {
        return $this->belongsTo(Payment::class, 'matched_payment_id');
    }

    public function matchedTransaction()
    {
        return $this->belongsTo(BankAccountTransaction::class, 'matched_transaction_id');
    }

    public function matches()
    {
        return $this->hasMany(ReconciliationMatch::class, 'bank_statement_transaction_id');
    }

    public function reconciler()
    {
        return $this->belongsTo(User::class, 'reconciled_by');
    }

    public function expenseDraft()
    {
        return $this->belongsTo(FinancialEntry::class, 'expense_draft_id');
    }

    public function learnedRule()
    {
        return $this->belongsTo(BankReconciliationRule::class, 'learned_rule_id');
    }
}
