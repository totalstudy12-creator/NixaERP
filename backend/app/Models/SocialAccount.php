<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SocialAccount extends Model
{
    protected $fillable = [
        'platform',
        'account_name',
        'username',
        'external_account_id',
        'status',
        'access_token_ref',
        'token_expires_at',
        'connected_at',
        'last_sync_at',
        'metadata',
        'created_by',
    ];

    protected $casts = [
        'token_expires_at' => 'datetime',
        'connected_at' => 'datetime',
        'last_sync_at' => 'datetime',
        'metadata' => 'array',
    ];
}
