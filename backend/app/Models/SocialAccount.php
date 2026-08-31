<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SocialAccount extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'platform',
        'account_name',
        'username',
        'external_account_id',
        'status',
        'connected_at',
        'last_sync_at',
        'metadata',
        'access_token',
        'refresh_token',
        'token_expires_at',
        'platform_user_id',
        'platform_username',
        'scopes',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'connected_at' => 'datetime',
        'last_sync_at' => 'datetime',
        'token_expires_at' => 'datetime',
        'metadata' => 'array',
        'scopes' => 'array',
    ];
}