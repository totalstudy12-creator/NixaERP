<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class CashDrawer extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'cash_drawers';

    protected $fillable = [
        'company_id',
        'branch_id',
        'name',
        'code',
        'status',
        'is_default',
        'starting_balance',
        'current_balance',
        'allow_overdraft',
        'overdraft_limit',
        'account_id',
        'notes',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'is_default' => 'boolean',
        'allow_overdraft' => 'boolean',
        'starting_balance' => 'decimal:2',
        'current_balance' => 'decimal:2',
        'overdraft_limit' => 'decimal:2',
    ];

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function bankAccount(): BelongsTo
    {
        return $this->belongsTo(BankAccount::class, 'account_id');
    }

    public function sessions(): HasMany
    {
        return $this->hasMany(CashDrawerSession::class)->orderByDesc('id');
    }

    public function activeSession(): HasOne
    {
        return $this->hasOne(CashDrawerSession::class)->where('status', 'open')->latestOfMany();
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(CashDrawerTransaction::class)->orderByDesc('id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public function isOpen(): bool
    {
        return $this->activeSession()->exists();
    }

    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }

    public function scopeForCompany($query, int $companyId)
    {
        return $query->where('company_id', $companyId);
    }

    public function scopeForBranch($query, int $branchId)
    {
        return $query->where('branch_id', $branchId);
    }
}
