<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BiometricDevice extends Model
{
    use HasFactory;

    protected $fillable = [
        'company_id',
        'branch_id',
        'device_uid',
        'name',
        'cpu',
        'memory',
        'flash',
        'temperature',
        'uptime',
        'signal',
        'wifi',
        'power',
        'ip_address',
        'firmware_version',
        'status',
        'last_sync_at',
        'settings',
        'enrollment_status',
        'enrollment_employee_id',
        'restart_count',
        'last_restart_reason',
    ];

    protected $casts = [
        'settings'      => 'array',
        'last_sync_at'  => 'datetime',
        'temperature'   => 'float',
    ];

    public function company()
    {
        return $this->belongsTo(Company::class);
    }

    public function branch()
    {
        return $this->belongsTo(Branch::class);
    }
}