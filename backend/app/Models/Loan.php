<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Loan extends Model
{
    protected $fillable = [
        'employee_id', 'amount', 'installment_amount', 'installments', 'status', 'balance',
    ];

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }
}
