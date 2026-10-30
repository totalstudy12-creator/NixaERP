<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class BankAccountTransaction extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'bank_account_transactions';

    protected $fillable = [
        'company_id',
        'branch_id',
        'bank_account_id',
        'transaction_type',
        'amount',
        'running_balance',
        'transaction_date',
        'value_date',
        'reference_no',
        'description',
        'payment_id',
        'transfer_id',
        'counterparty',
        'status',
        'reconciled_at',
        'statement_transaction_id',
        'created_by',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'running_balance' => 'decimal:2',
        'transaction_date' => 'date',
        'value_date' => 'date',
        'reconciled_at' => 'datetime',
    ];

    public function bankAccount()
    {
        return $this->belongsTo(BankAccount::class, 'bank_account_id');
    }

    public function payment()
    {
        return $this->belongsTo(Payment::class, 'payment_id');
    }

    public function statementTransaction()
    {
        return $this->belongsTo(BankStatementTransaction::class, 'statement_transaction_id');
    }

    public function company()
    {
        return $this->belongsTo(Company::class);
    }

    public function branch()
    {
        return $this->belongsTo(Branch::class);
    }
}
