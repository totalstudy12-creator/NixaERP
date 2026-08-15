<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Advance extends Model
{
    protected $fillable = [
    'employee_id', 'advance_no', 'amount', 'request_date', 'payment_date',
    'payment_method', 'transaction_reference', 'status',
    'approved_by', 'reason', 'remarks', 'attachment',
    'created_by', 'updated_by',
];

public function employee() {
    return $this->belongsTo(Employee::class);
}
public function approvedBy() {
    return $this->belongsTo(User::class, 'approved_by');
}
public function createdBy() {
    return $this->belongsTo(User::class, 'created_by');
}
public function updatedBy() {
    return $this->belongsTo(User::class, 'updated_by');
}
}
