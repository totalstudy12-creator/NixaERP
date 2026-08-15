<?php
// app/Models/Order.php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Order extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'company_id', 'customer_id', 'quotation_id',
        'order_no', 'discount_amount', 'source', 'reference_no',
        'total_amount', 'tax_amount',
        'payment_amount', 'payment_method', 'is_partial',
        'status', 'delivery_date', 'shipping_address', 'notes',
    ];

    protected $casts = [
        'total_amount'    => 'decimal:2',
        'tax_amount'      => 'decimal:2',
        'discount_amount' => 'decimal:2',
        'payment_amount'  => 'decimal:2',
        'is_partial'      => 'boolean',
        'delivery_date'   => 'datetime',
    ];

    // Computed attributes
    public function getBalanceDueAttribute(): float
    {
        return max(0, (float)$this->total_amount - (float)$this->payment_amount);
    }

    public function getPaymentStatusAttribute(): string
    {
        if ((float)$this->payment_amount <= 0) return 'unpaid';
        if ((float)$this->payment_amount >= (float)$this->total_amount) return 'paid';
        return 'partial';
    }

    // Auto‑generate order number
    public static function generateOrderNo(): string
    {
        $date = now()->format('Ymd');
        $prefix = "ORD-{$date}-";

        $last = self::where('order_no', 'like', $prefix . '%')
            ->orderBy('order_no', 'desc')
            ->first();

        if ($last) {
            $lastNumber = (int) substr($last->order_no, -4);
            $newNumber = $lastNumber + 1;
        } else {
            $newNumber = 1;
        }

        return $prefix . str_pad($newNumber, 4, '0', STR_PAD_LEFT);
    }

    // Relationships
    public function company() { return $this->belongsTo(Company::class); }
    public function customer() { return $this->belongsTo(Customer::class); }
    public function items() { return $this->hasMany(OrderItem::class); }
    public function invoice() { return $this->hasOne(Invoice::class); }
}