<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class LoanRecord extends Model
{
    use HasFactory;

    protected $table = 'loan_records';

    protected $fillable = [
        'employee_id',
        'amount',
        'installment_amount',
        'installments',
        'status',
        'notes',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'installment_amount' => 'decimal:2',
    ];

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }
}
