<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LeadActivity extends Model
{
    use HasFactory;

    protected $fillable = [
        'lead_id',
        'user_id',
        'activity_type', // call, meeting, note, email, whatsapp, status_change, quotation
        'title',
        'description',
        'activity_date',
        'follow_up_date',
        'metadata',
    ];

    protected $casts = [
        'activity_date'  => 'datetime',
        'follow_up_date' => 'date',
        'metadata'       => 'array',
    ];

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
