<?php
// app/Models/OrderItem.php
namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class OrderItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'order_id', 'product_id', 'quantity', 'delivered',
        'unit_price', 'tax_rate', 'subtotal',
    ];

    protected $casts = [
        'unit_price' => 'decimal:2',
        'tax_rate'   => 'decimal:2',
        'subtotal'   => 'decimal:2',
    ];

    public function order()
    {
        return $this->belongsTo(Order::class);
    }

    public function product()
    {
        return $this->belongsTo(Product::class);
    }
}