<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class BankStatement extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'bank_statements';

    protected $fillable = [
        'company_id',
        'branch_id',
        'bank_account_id',
        'file_name',
        'file_path',
        'file_hash',
        'format',
        'bank_format',
        'statement_from_date',
        'statement_to_date',
        'opening_balance',
        'closing_balance',
        'total_transactions',
        'reconciled_transactions',
        'status',
        'uploaded_by',
    ];

    protected $casts = [
        'statement_from_date' => 'date',
        'statement_to_date' => 'date',
        'opening_balance' => 'decimal:2',
        'closing_balance' => 'decimal:2',
        'total_transactions' => 'integer',
        'reconciled_transactions' => 'integer',
    ];

    public function bankAccount()
    {
        return $this->belongsTo(BankAccount::class, 'bank_account_id');
    }

    public function transactions()
    {
        return $this->hasMany(BankStatementTransaction::class, 'statement_id');
    }

    public function uploader()
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    public function company()
    {
        return $this->belongsTo(Company::class);
    }
}
