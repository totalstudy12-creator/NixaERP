<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Dealer extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'company_id',
        'branch_id',
        'parent_id',
        'name',
        'code',
        'contact_person',
        'email',
        'phone',
        'address',
        'territory',
        'zone',
        'status',
        'credit_limit',
        'outstanding_amount',
        'wallet_balance',
        'commission_rate',
        'kyc_status',
        'approved_at',
        'notes',
    ];

    protected $casts = [
        'credit_limit' => 'decimal:2',
        'outstanding_amount' => 'decimal:2',
        'wallet_balance' => 'decimal:2',
        'commission_rate' => 'decimal:2',
        'approved_at' => 'datetime',
    ];

    public function company()
    {
        return $this->belongsTo(Company::class);
    }

    public function branch()
    {
        return $this->belongsTo(Branch::class);
    }

    public function parent()
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children()
    {
        return $this->hasMany(self::class, 'parent_id');
    }
}
