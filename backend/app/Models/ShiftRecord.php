<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ShiftRecord extends Model
{
    use HasFactory;

    protected $table = 'shift_records';

    protected $fillable = [
        'employee_id',
        'date',
        'start_time',
        'end_time',
        'hours',
        'status',
    ];

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }
}
