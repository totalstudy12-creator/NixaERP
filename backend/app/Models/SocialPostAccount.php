<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SocialPostAccount extends Model
{
    protected $fillable = [
        'post_id',
        'account_id',
        'platform',
        'external_post_id',
        'status',
        'error',
        'published_at',
    ];

    protected $casts = [
        'published_at' => 'datetime',
    ];

    public function post()
    {
        return $this->belongsTo(SocialPost::class, 'post_id');
    }
}
