<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockMovement extends Model
{
    use HasFactory;

    protected $fillable = [
        'product_id',
        'warehouse_id',
        'company_id',
        'branch_id',
        'transaction_type',
        'reference_type',
        'reference_id',
        'quantity',
        'unit_price',
        'stock_before',
        'stock_after',
        'remark',
        'transaction_date',
        'created_by',
    ];

    protected $casts = [
        'transaction_date' => 'datetime',
        'quantity'         => 'decimal:3',
        'stock_before'     => 'decimal:3',
        'stock_after'      => 'decimal:3',
        'unit_price'       => 'decimal:2',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}