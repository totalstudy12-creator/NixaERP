<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BiometricScan extends Model
{
    use HasFactory;

    protected $fillable = [
        'biometric_device_id', 'employee_id', 'scan_time',
        'scan_type', 'finger_index', 'result', 'confidence', 'raw_data',
    ];

    protected $casts = [
        'scan_time' => 'datetime',
    ];

    public function device()
    {
        return $this->belongsTo(BiometricDevice::class, 'biometric_device_id');
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }
}