<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class BackupRun extends Model
{
    use HasFactory;

    protected $table = 'backup_runs';

    protected $fillable = [
        'uuid',
        'run_code',
        'backup_connection_id',
        'installation_id',
        'type',
        'status',
        'current_step',
        'progress_percent',
        'started_at',
        'completed_at',
        'duration_seconds',
        'database_size_bytes',
        'files_size_bytes',
        'total_size_bytes',
        'database_records_count',
        'files_count',
        'checksum_sha256',
        'encryption_algo',
        'encryption_key_version',
        'is_verified',
        'verified_at',
        'verification_notes',
        'is_protected',
        'manifest_data',
        'error_message',
        'created_by',
    ];

    protected $casts = [
        'started_at' => 'datetime',
        'completed_at' => 'datetime',
        'verified_at' => 'datetime',
        'is_verified' => 'boolean',
        'is_protected' => 'boolean',
        'progress_percent' => 'integer',
        'duration_seconds' => 'integer',
        'database_size_bytes' => 'integer',
        'files_size_bytes' => 'integer',
        'total_size_bytes' => 'integer',
        'database_records_count' => 'integer',
        'files_count' => 'integer',
        'manifest_data' => 'array',
    ];

    protected $appends = [
        'run_code',
    ];

    protected static function booted()
    {
        static::creating(function ($run) {
            if (empty($run->uuid)) {
                $run->uuid = (string) Str::uuid();
            }
            if (empty($run->installation_id)) {
                $run->installation_id = config('backup.installation_id', 'nixaerp-prod');
            }
            if (empty($run->run_code)) {
                $dateStr = date('Ymd');
                $shortId = strtoupper(substr(str_replace('-', '', $run->uuid), 0, 8));
                $run->run_code = "BKP-{$dateStr}-{$shortId}";
            }
        });
    }

    public function getRunCodeAttribute(): string
    {
        if (!empty($this->attributes['run_code'])) {
            return $this->attributes['run_code'];
        }

        $dateStr = $this->created_at ? $this->created_at->format('Ymd') : date('Ymd');
        $shortId = strtoupper(substr(str_replace('-', '', $this->uuid ?: (string) $this->id), 0, 8));
        return "BKP-{$dateStr}-{$shortId}";
    }

    public function artifacts(): HasMany
    {
        return $this->hasMany(BackupArtifact::class, 'backup_run_id');
    }

    public function connection(): BelongsTo
    {
        return $this->belongsTo(BackupConnection::class, 'backup_connection_id')
            ->withDefault(function () {
                return BackupConnection::where('status', 'connected')->first();
            });
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function auditLogs(): HasMany
    {
        return $this->hasMany(BackupAuditLog::class, 'backup_run_id');
    }

    public function databaseArtifact(): ?BackupArtifact
    {
        return $this->artifacts()->where('artifact_type', 'database')->first();
    }

    public function filesArtifact(): ?BackupArtifact
    {
        return $this->artifacts()->where('artifact_type', 'files')->first();
    }

    public function manifestArtifact(): ?BackupArtifact
    {
        return $this->artifacts()->where('artifact_type', 'manifest')->first();
    }
}
