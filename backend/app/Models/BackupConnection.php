<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BackupConnection extends Model
{
    use HasFactory;

    protected $table = 'backup_connections';

    protected $fillable = [
        'provider',
        'account_email',
        'account_name',
        'folder_id',
        'folder_name',
        'access_token',
        'refresh_token',
        'token_expires_at',
        'status',
        'is_active',
        'last_authorized_at',
        'last_error',
        'scopes',
    ];

    /**
     * Tokens are encrypted at rest and never serialized into JSON responses.
     */
    protected $hidden = [
        'access_token',
        'refresh_token',
    ];

    protected $casts = [
        'access_token' => 'encrypted',
        'refresh_token' => 'encrypted',
        'token_expires_at' => 'datetime',
        'last_authorized_at' => 'datetime',
        'is_active' => 'boolean',
        'scopes' => 'array',
    ];

    protected static function booted()
    {
        static::saving(function ($conn) {
            if (!empty($conn->status)) {
                $conn->is_active = ($conn->status === 'connected');
            } elseif (isset($conn->is_active)) {
                $conn->status = $conn->is_active ? 'connected' : 'disconnected';
            } else {
                $conn->status = 'disconnected';
                $conn->is_active = false;
            }
        });
    }

    public function isExpired(): bool
    {
        if (!$this->token_expires_at) {
            return true;
        }

        return now()->greaterThanOrEqualTo($this->token_expires_at);
    }
}
