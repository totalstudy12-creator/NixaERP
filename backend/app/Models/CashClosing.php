<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CashClosing extends Model
{
    use HasFactory;

    protected $table = 'cash_closings';

    protected $fillable = [
        'company_id',
        'branch_id',
        'warehouse_id',
        'cash_account_id',
        'closing_date',
        'opening_cash',
        'cash_received',
        'cash_paid',
        'expected_closing_cash',
        'physical_cash_counted',
        'difference',
        'denomination_breakdown',
        'status',
        'approved_by',
        'approved_at',
        'remarks',
        'created_by',
    ];

    protected $casts = [
        'closing_date' => 'date',
        'opening_cash' => 'decimal:2',
        'cash_received' => 'decimal:2',
        'cash_paid' => 'decimal:2',
        'expected_closing_cash' => 'decimal:2',
        'physical_cash_counted' => 'decimal:2',
        'difference' => 'decimal:2',
        'denomination_breakdown' => 'array',
        'approved_at' => 'datetime',
    ];

    public function cashAccount()
    {
        return $this->belongsTo(BankAccount::class, 'cash_account_id');
    }

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

    public function approver()
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
