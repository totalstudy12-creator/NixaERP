<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class LabelTemplate extends Model
{
    use HasFactory;

    protected $fillable = [
        'company_id',
        'branch_id',
        'paper_profile_id',
        'name',
        'width_mm',
        'height_mm',
        'dpi',
        'barcode_format',
        'barcode_height_mm',
        'thermal_heat',
        'print_speed_ips',
        'elements_config',
        'company_name_override',
        'facility_name_override',
        'custom_note',
        'is_default',
        'created_by',
    ];

    protected $casts = [
        'width_mm' => 'float',
        'height_mm' => 'float',
        'dpi' => 'integer',
        'barcode_height_mm' => 'float',
        'thermal_heat' => 'integer',
        'print_speed_ips' => 'float',
        'elements_config' => 'array',
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

    public function paperProfile(): BelongsTo
    {
        return $this->belongsTo(ThermalPaperProfile::class, 'paper_profile_id');
    }

    public function printJobs(): HasMany
    {
        return $this->hasMany(PrintJob::class, 'template_id');
    }
}
