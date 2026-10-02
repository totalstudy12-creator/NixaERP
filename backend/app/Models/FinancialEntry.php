<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class FinancialEntry extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'company_id', 'branch_id', 'direction', 'category', 'counterparty',
        'amount', 'tax_amount', 'total_amount', 'entry_date', 'payment_method',
        'reference_no', 'description', 'notes', 'status', 'account_id',
        'project_id', 'created_by', 'updated_by',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'tax_amount' => 'decimal:2',
        'total_amount' => 'decimal:2',
        'entry_date' => 'date:Y-m-d',
    ];

    public function company() { return $this->belongsTo(Company::class); }
    public function branch() { return $this->belongsTo(Branch::class); }
}
