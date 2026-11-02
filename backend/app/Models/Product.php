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
        'qr_code',
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
        'stock_quantity' => 'decimal:3',
        'reorder_level' => 'decimal:3',
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

    public function invoiceItems()
    {
        return $this->hasMany(InvoiceItem::class);
    }

    public function saleItems()
    {
        return $this->invoiceItems();
    }

    public function purchaseInvoiceItems()
    {
        return $this->hasMany(PurchaseInvoiceItem::class);
    }

    public function purchaseItems()
    {
        return $this->purchaseInvoiceItems();
    }

    protected static function booted(): void
    {
        static::creating(function (Product $product) {
            if (empty($product->barcode)) {
                $product->barcode = static::generateUniqueBarcode();
            }
            if (empty($product->qr_code)) {
                $product->qr_code = static::generateUniqueQrCode($product->sku ?? 'ITEM', $product->company_id);
            }
        });
    }

    public static function generateUniqueSku(?string $name = null, ?string $prefix = 'PRD'): string
    {
        $cleanPrefix = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $prefix ?: 'PRD'));
        if ($name) {
            $words = preg_split('/\s+/', trim($name));
            $initials = '';
            foreach (array_slice($words, 0, 3) as $w) {
                $sub = substr(preg_replace('/[^A-Za-z0-9]/', '', $w), 0, 3);
                if ($sub) $initials .= strtoupper($sub);
            }
            if ($initials) {
                $cleanPrefix .= '-' . $initials;
            }
        }

        do {
            $randomNum = str_pad((string) random_int(1, 9999), 4, '0', STR_PAD_LEFT);
            $sku = "{$cleanPrefix}-{$randomNum}";
        } while (static::where('sku', $sku)->exists());

        return $sku;
    }

    public static function generateUniqueBarcode(?string $prefix = '890'): string
    {
        do {
            $digits = $prefix . str_pad((string) random_int(100000000, 999999999), 9, '0', STR_PAD_LEFT);
            $sum = 0;
            for ($i = 0; $i < 12; $i++) {
                $sum += ((int) $digits[$i]) * ($i % 2 === 0 ? 1 : 3);
            }
            $checksum = (10 - ($sum % 10)) % 10;
            $barcode = $digits . $checksum;
        } while (static::where('barcode', $barcode)->exists());

        return $barcode;
    }

    public static function generateUniqueQrCode(string $sku, ?int $companyId = null): string
    {
        $cleanSku = preg_replace('/[^A-Za-z0-9_-]/', '', $sku);
        $cid = $companyId ?: '0';
        return "NIXA-PRD-{$cid}-{$cleanSku}";
    }
}
