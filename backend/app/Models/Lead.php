<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Lead extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'company_id',
        'branch_id',
        'name',
        'company_name',
        'email',
        'phone',
        'whatsapp',
        'source', // website, referral, walk_in, social_media, campaign, cold_call, partner, other
        'stage', // new, contacted, qualified, quotation_sent, negotiation, won, lost
        'priority', // low, medium, high, urgent
        'expected_value',
        'assigned_to',
        'city',
        'state',
        'address',
        'notes',
        'lost_reason',
        'next_follow_up',
        'converted_customer_id',
        'converted_contact_id',
        'converted_at',
        'created_by',
    ];

    protected $casts = [
        'expected_value' => 'decimal:2',
        'next_follow_up' => 'date',
        'converted_at'   => 'datetime',
    ];

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function convertedCustomer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'converted_customer_id');
    }

    public function convertedContact(): BelongsTo
    {
        return $this->belongsTo(Contact::class, 'converted_contact_id');
    }

    public function activities(): HasMany
    {
        return $this->hasMany(LeadActivity::class)->orderBy('activity_date', 'desc');
    }

    public function opportunities(): HasMany
    {
        return $this->hasMany(Opportunity::class);
    }
}
