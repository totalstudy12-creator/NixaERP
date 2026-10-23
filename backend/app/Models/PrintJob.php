<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PrintJob extends Model
{
    use HasFactory;

    protected $fillable = [
        'job_number',
        'company_id',
        'branch_id',
        'user_id',
        'printer_profile_id',
        'printer_name',
        'template_id',
        'template_name',
        'total_labels',
        'printed_labels',
        'status',
        'error_message',
        'ip_address',
        'user_agent',
    ];

    protected $casts = [
        'total_labels' => 'integer',
        'printed_labels' => 'integer',
    ];

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function printerProfile(): BelongsTo
    {
        return $this->belongsTo(PrinterProfile::class);
    }

    public function template(): BelongsTo
    {
        return $this->belongsTo(LabelTemplate::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(PrintJobItem::class);
    }
}
