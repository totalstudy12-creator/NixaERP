<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AutomationWorkflow extends Model
{
    protected $fillable = [
        'company_id',
        'branch_id',
        'name',
        'description',
        'category',
        'status',
        'trigger_type',
        'trigger_event',
        'schedule',
        'requires_approval',
        'retry_limit',
        'conditions',
        'actions',
        'last_run_at',
        'next_run_at',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'requires_approval' => 'boolean',
        'retry_limit' => 'integer',
        'conditions' => 'array',
        'actions' => 'array',
        'last_run_at' => 'datetime',
        'next_run_at' => 'datetime',
    ];

    protected $appends = [
        'runs_count',
        'successful_runs',
        'failed_runs',
    ];

    public function runs(): HasMany
    {
        return $this->hasMany(
            AutomationRun::class,
            'automation_workflow_id',
        );
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function getRunsCountAttribute(): int
    {
        return (int) ($this->attributes['runs_count'] ?? 0);
    }

    public function getSuccessfulRunsAttribute(): int
    {
        return (int) ($this->attributes['successful_runs'] ?? 0);
    }

    public function getFailedRunsAttribute(): int
    {
        return (int) ($this->attributes['failed_runs'] ?? 0);
    }
}