<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Backup extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'disk',
        'path',
        'type',
        'status',
        'size',
        'duration',
        'details',
        'started_at',
        'completed_at',
    ];

    protected $casts = [
        'size' => 'integer',
        'details' => 'array',
        'started_at' => 'datetime',
        'completed_at' => 'datetime',
    ];
}
