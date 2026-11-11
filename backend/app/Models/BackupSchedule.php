<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BackupSchedule extends Model
{
    use HasFactory;

    protected $table = 'backup_schedules';

    protected $fillable = [
        'frequency',
        'time_of_day',
        'day_of_week',
        'day_of_month',
        'timezone',
        'is_active',
        'last_run_at',
        'next_run_at',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'day_of_week' => 'integer',
        'day_of_month' => 'integer',
        'last_run_at' => 'datetime',
        'next_run_at' => 'datetime',
    ];
}
