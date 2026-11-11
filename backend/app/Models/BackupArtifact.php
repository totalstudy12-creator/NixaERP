<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BackupArtifact extends Model
{
    use HasFactory;

    protected $table = 'backup_artifacts';

    protected $fillable = [
        'backup_run_id',
        'artifact_type',
        'type',
        'file_name',
        'file_size_bytes',
        'raw_size_bytes',
        'encrypted_size_bytes',
        'mime_type',
        'sha256_checksum',
        'raw_sha256',
        'encrypted_sha256',
        'google_drive_file_id',
        'drive_file_id',
        'drive_folder_id',
        'google_drive_md5',
        'encryption_iv',
        'encryption_tag',
        'encryption_algorithm',
        'key_version',
        'metadata',
        'local_temp_path',
        'upload_status',
        'is_uploaded',
        'is_verified',
        'uploaded_at',
        'verified_at',
        'verification_notes',
        'resumable_session_url',
        'bytes_uploaded',
    ];

    /**
     * Do not leak raw session URLs or internal local temp paths.
     */
    protected $hidden = [
        'resumable_session_url',
        'local_temp_path',
    ];

    protected $casts = [
        'file_size_bytes' => 'integer',
        'raw_size_bytes' => 'integer',
        'encrypted_size_bytes' => 'integer',
        'bytes_uploaded' => 'integer',
        'is_uploaded' => 'boolean',
        'is_verified' => 'boolean',
        'uploaded_at' => 'datetime',
        'verified_at' => 'datetime',
        'metadata' => 'array',
    ];

    protected static function booted()
    {
        static::saving(function ($artifact) {
            // Keep aliases synchronized
            if (!empty($artifact->type) && empty($artifact->artifact_type)) {
                $artifact->artifact_type = $artifact->type;
            } elseif (!empty($artifact->artifact_type) && empty($artifact->type)) {
                $artifact->type = $artifact->artifact_type;
            }

            if (!empty($artifact->raw_size_bytes) && empty($artifact->file_size_bytes)) {
                $artifact->file_size_bytes = $artifact->raw_size_bytes;
            }

            if (!empty($artifact->drive_file_id) && empty($artifact->google_drive_file_id)) {
                $artifact->google_drive_file_id = $artifact->drive_file_id;
            } elseif (!empty($artifact->google_drive_file_id) && empty($artifact->drive_file_id)) {
                $artifact->drive_file_id = $artifact->google_drive_file_id;
            }

            if (!empty($artifact->raw_sha256) && empty($artifact->sha256_checksum)) {
                $artifact->sha256_checksum = $artifact->raw_sha256;
            }
        });
    }

    public function run(): BelongsTo
    {
        return $this->belongsTo(BackupRun::class, 'backup_run_id');
    }
}
