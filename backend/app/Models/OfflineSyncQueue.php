<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class OfflineSyncQueue extends Model
{
    use HasFactory;

    protected $table = 'offline_sync_queue';   // table name from migration

    protected $fillable = [
        'biometric_device_id',
        'payload',
        'retry_count',
        'status',
    ];

    protected $casts = [
        'payload' => 'array',
    ];

    public function device()
    {
        return $this->belongsTo(BiometricDevice::class, 'biometric_device_id');
    }
}