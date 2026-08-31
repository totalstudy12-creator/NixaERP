<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Message extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'account_id',
        'channel',
        'external_id',
        'sender',
        'body',
        'received_at',
        'is_read',
        'metadata',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'received_at' => 'datetime',
        'is_read' => 'boolean',
        'metadata' => 'array',
    ];

    /**
     * Get the social account associated with the message (optional).
     */
    public function account()
    {
        return $this->belongsTo(SocialAccount::class);
    }
}