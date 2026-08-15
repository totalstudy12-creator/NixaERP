<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SocialPost extends Model
{
    protected $fillable = [
        'content',
        'status',
        'scheduled_at',
        'published_at',
        'created_by',
        'media_path',
        'media_type',
        'metadata',
    ];

    protected $casts = [
        'scheduled_at' => 'datetime',
        'published_at' => 'datetime',
        'metadata' => 'array',
    ];

    public function accounts()
    {
        return $this->hasMany(SocialPostAccount::class, 'post_id');
    }
}
