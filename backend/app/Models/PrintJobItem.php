<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PrintJobItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'print_job_id',
        'product_id',
        'product_name',
        'sku',
        'barcode',
        'sale_price',
        'quantity',
        'extra_data',
    ];

    protected $casts = [
        'sale_price' => 'float',
        'quantity' => 'integer',
        'extra_data' => 'array',
    ];

    public function printJob(): BelongsTo
    {
        return $this->belongsTo(PrintJob::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
