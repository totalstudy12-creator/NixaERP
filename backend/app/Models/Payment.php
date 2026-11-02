<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Payment extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'company_id',
        'branch_id',
        'bank_account_id',
        'invoice_id',
        'purchase_invoice_id',
        'payment_method',
        'reference_no',
        'amount',
        'status',
        'transaction_date',
        'payment_direction',
        'bank_name',
        'account_number',
        'ledger_reference',
        'payable_type',
        'payable_id',
        'remarks',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
    ];

    protected $appends = [
        'payment_date',
    ];

    public function getTransactionDateAttribute($value): ?string
    {
        return $value ? substr((string) $value, 0, 10) : null;
    }

    public function getPaymentDateAttribute(): ?string
    {
        return $this->transaction_date;
    }

    public function setTransactionDateAttribute($value): void
    {
        $this->attributes['transaction_date'] = !empty($value)
            ? (strlen((string) $value) === 10 ? $value . ' 00:00:00' : (string) $value)
            : now()->format('Y-m-d H:i:s');
    }

    public function company()
    {
        return $this->belongsTo(Company::class);
    }

    public function invoice()
    {
        return $this->belongsTo(Invoice::class);
    }

    public function purchaseInvoice()
    {
        return $this->belongsTo(PurchaseInvoice::class);
    }

    public function branch()
    {
        return $this->belongsTo(Branch::class);
    }

    public function bankAccount()
    {
        return $this->belongsTo(BankAccount::class, 'bank_account_id');
    }

    public function accountTransactions()
    {
        return $this->hasMany(BankAccountTransaction::class, 'payment_id');
    }
}
