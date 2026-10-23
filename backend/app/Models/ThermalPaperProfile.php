<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ThermalPaperProfile extends Model
{
    use HasFactory;

    protected $fillable = [
        'company_id',
        'branch_id',
        'name',
        'roll_type',
        'paper_width_mm',
        'label_width_mm',
        'label_height_mm',
        'gap_mm',
        'margin_top_mm',
        'margin_bottom_mm',
        'margin_left_mm',
        'margin_right_mm',
        'orientation',
        'labels_per_row',
        'is_preset',
        'is_default',
        'created_by',
    ];

    protected $casts = [
        'paper_width_mm' => 'float',
        'label_width_mm' => 'float',
        'label_height_mm' => 'float',
        'gap_mm' => 'float',
        'margin_top_mm' => 'float',
        'margin_bottom_mm' => 'float',
        'margin_left_mm' => 'float',
        'margin_right_mm' => 'float',
        'labels_per_row' => 'integer',
        'is_preset' => 'boolean',
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

    public function templates(): HasMany
    {
        return $this->hasMany(LabelTemplate::class, 'paper_profile_id');
    }
}
