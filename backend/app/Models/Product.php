<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Product extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'company_id',
        'branch_id',
        'name',
        'sku',
        'barcode',
        'brand',
        'unit',
        'purchase_price',
        'sale_price',
        'tax_rate',
        'stock_quantity',
        'reorder_level',
        'description',
        'active',
    ];

    protected $casts = [
        'purchase_price' => 'decimal:2',
        'sale_price' => 'decimal:2',
        'tax_rate' => 'decimal:2',
        'stock_quantity' => 'integer',
        'reorder_level' => 'integer',
        'active' => 'boolean',
    ];

    public function company()
    {
        return $this->belongsTo(Company::class);
    }

    public function branch()
    {
        return $this->belongsTo(Branch::class);
    }
    // Inside Product class

    public function warehouseStocks()
    {
        return $this->hasMany(ProductWarehouseStock::class);
    }

    public function stockMovements()
    {
        return $this->hasMany(StockMovement::class);
    }

    public function purchasePriceHistory()
    {
        return $this->hasMany(ProductPurchasePriceHistory::class);
    }
}
