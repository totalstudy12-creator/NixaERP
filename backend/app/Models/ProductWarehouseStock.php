<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductWarehouseStock extends Model
{
    use HasFactory;

    protected $fillable = [
        'product_id',
        'warehouse_id',
        'company_id',
        'branch_id',
        'quantity',
        'reserved_quantity',
        'available_quantity',
        'average_cost',
        'last_purchase_price',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    /**
     * Retrieve or instantiate the unique warehouse stock record for a product and warehouse.
     * Guaranteed never to violate the (product_id, warehouse_id) unique constraint.
     */
    public static function getOrCreateStock(
        int $productId,
        int $warehouseId,
        ?int $companyId = null,
        ?int $branchId = null
    ): self {
        $stock = static::firstOrNew(
            [
                'product_id'   => $productId,
                'warehouse_id' => $warehouseId,
            ],
            [
                'company_id'         => $companyId,
                'branch_id'          => $branchId,
                'quantity'           => 0,
                'reserved_quantity'  => 0,
                'available_quantity' => 0,
            ]
        );

        if (! $stock->company_id && $companyId) {
            $stock->company_id = $companyId;
        }
        if (! $stock->branch_id && $branchId) {
            $stock->branch_id = $branchId;
        }

        return $stock;
    }
}
