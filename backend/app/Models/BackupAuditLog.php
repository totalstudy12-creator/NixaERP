<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BackupAuditLog extends Model
{
    use HasFactory;

    protected $table = 'backup_audit_logs';

    protected $fillable = [
        'backup_run_id',
        'backup_connection_id',
        'action',
        'user_id',
        'ip_address',
        'user_agent',
        'result',
        'status',
        'details',
        'error_message',
        'created_at',
        'updated_at',
    ];

    protected $casts = [
        'details' => 'array',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    protected static function booted()
    {
        static::saving(function ($log) {
            if (!empty($log->status) && empty($log->result)) {
                $log->result = $log->status;
            } elseif (!empty($log->result) && empty($log->status)) {
                $log->status = $log->result;
            }
            if (empty($log->created_at)) {
                $log->created_at = now();
            }
        });
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function run(): BelongsTo
    {
        return $this->belongsTo(BackupRun::class, 'backup_run_id');
    }

    public function backupRun(): BelongsTo
    {
        return $this->belongsTo(BackupRun::class, 'backup_run_id');
    }
}
