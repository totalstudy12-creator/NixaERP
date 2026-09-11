<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AutomationRun extends Model
{
    protected $fillable = [
        'automation_workflow_id',
        'company_id',
        'branch_id',
        'status',
        'trigger_source',
        'idempotency_key',
        'started_at',
        'finished_at',
        'duration_ms',
        'input',
        'output',
        'message',
        'error',
        'started_by',
    ];

    protected $casts = [
        'started_at' => 'datetime',
        'finished_at' => 'datetime',
        'input' => 'array',
        'output' => 'array',
        'duration_ms' => 'integer',
    ];

    public function workflow(): BelongsTo
    {
        return $this->belongsTo(
            AutomationWorkflow::class,
            'automation_workflow_id',
        );
    }
}