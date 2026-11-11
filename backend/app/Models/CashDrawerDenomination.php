<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CashDrawerDenomination extends Model
{
    use HasFactory;

    protected $table = 'cash_drawer_denominations';

    protected $fillable = [
        'company_id',
        'currency',
        'label',
        'value',
        'sort_order',
        'is_active',
    ];

    protected $casts = [
        'value' => 'decimal:2',
        'sort_order' => 'integer',
        'is_active' => 'boolean',
    ];

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }
}
