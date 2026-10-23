<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PrinterProfile extends Model
{
    use HasFactory;

    protected $fillable = [
        'company_id',
        'branch_id',
        'name',
        'bluetooth_mac',
        'protocol',
        'connection_type',
        'paper_width_mm',
        'dpi',
        'density',
        'print_speed',
        'purpose',
        'is_default',
        'status',
        'created_by',
    ];

    protected $casts = [
        'paper_width_mm' => 'integer',
        'dpi' => 'integer',
        'density' => 'integer',
        'print_speed' => 'float',
        'is_default' => 'boolean',
    ];

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function printJobs(): HasMany
    {
        return $this->hasMany(PrintJob::class);
    }
}
