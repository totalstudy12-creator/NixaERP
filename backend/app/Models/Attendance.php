<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Attendance extends Model
{
    use HasFactory;

    protected $fillable = [
        'employee_id', 'date', 'status', 'check_in', 'check_out',
        'shift', 'overtime', 'notes', 'device', 'location',
    ];

    // ADD THIS CAST – it's required for ->format() to work
    protected $casts = [
        'date' => 'date',
    ];

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }
}