<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AuditLog extends Model
{
    protected $fillable = [
        'user_id',
        'user_name',
        'user_email',
        'module',
        'action',
        'status',
        'message',
        'ip_address',
        'user_agent',
    ];
}