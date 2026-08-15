<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Payment extends Model
{
    use HasFactory, SoftDeletes;
 
    protected $fillable = [
        'company_id',
        'invoice_id',
        'payment_method',
        'reference_no',
        'amount',
        'status',
        'transaction_date',
        'bank_name',
        'account_number',
        'ledger_reference',
        'remarks',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'transaction_date' => 'datetime',
    ];

    public function company()
    {
        return $this->belongsTo(Company::class);
    }

    public function invoice()
    {
        return $this->belongsTo(Invoice::class);
    }
}
