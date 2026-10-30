<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class BankAccount extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'bank_accounts';

    protected $fillable = [
        'company_id',
        'branch_id',
        'warehouse_id',
        'account_name',
        'account_type',
        'bank_name',
        'account_number',
        'ifsc_code',
        'branch_name',
        'swift_code',
        'upi_id',
        'currency',
        'opening_balance',
        'current_balance',
        'is_active',
        'is_default',
        'notes',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'opening_balance' => 'decimal:2',
        'current_balance' => 'decimal:2',
        'is_active' => 'boolean',
        'is_default' => 'boolean',
    ];

    public function company()
    {
        return $this->belongsTo(Company::class);
    }

    public function branch()
    {
        return $this->belongsTo(Branch::class);
    }

    public function warehouse()
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function transactions()
    {
        return $this->hasMany(BankAccountTransaction::class, 'bank_account_id');
    }

    public function statements()
    {
        return $this->hasMany(BankStatement::class, 'bank_account_id');
    }

    public function cashClosings()
    {
        return $this->hasMany(CashClosing::class, 'cash_account_id');
    }

    public function reconciliations()
    {
        return $this->hasMany(BankReconciliation::class, 'bank_account_id');
    }

    /**
     * Return masked account number for safe display in UI/logs.
     */
    public function getMaskedAccountNumberAttribute(): string
    {
        if (empty($this->account_number)) {
            return $this->account_type === 'cash_drawer' ? 'CASH-DRAWER' : 'N/A';
        }

        $clean = preg_replace('/\s+/', '', (string) $this->account_number);
        $len = strlen($clean);
        if ($len <= 4) {
            return '•••• ' . $clean;
        }

        return '•••• •••• ' . substr($clean, -4);
    }
}
