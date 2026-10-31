<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AuditLog extends Model
{
    use HasFactory;

    protected $table = 'audit_logs';

    protected $fillable = [
        'event_id',
        'user_id',
        'user_name',
        'user_email',
        'company_id',
        'branch_id',
        'module',
        'action',
        'resource_type',
        'resource_id',
        'status',
        'message',
        'previous_values',
        'changed_values',
        'ip_address',
        'user_agent',
        'request_id',
        'reason',
    ];

    protected $casts = [
        'previous_values' => 'array',
        'changed_values'  => 'array',
        'company_id'      => 'integer',
        'branch_id'       => 'integer',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }
}