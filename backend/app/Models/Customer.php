<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Customer extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'company_id',
        'branch_id',
        'name',
        'type',
        'company_type',
        'email',
        'phone',
        'contact_person',
        'contact_no',
        'gst_number',
        'registration_type',
        'pan',
        'billing_street',
        'billing_landmark',
        'billing_city',
        'billing_state',
        'billing_country',
        'billing_pincode',
        'shipping_street',
        'shipping_landmark',
        'shipping_city',
        'shipping_state',
        'shipping_country',
        'shipping_pincode',
        'eway_bill_distance',
        'group_id',
        'opening_balance',
        'credit_limit',
        'due_days',
        'outstanding_amount',
        'fax',
        'website',
        'note',
        'license_no',
        'custom_field_1',
        'custom_field_2',
        'status',
        'is_active',
        'parent_id',
        'territory',
        'zone',
        'wallet_balance',
        'commission_rate',
        'kyc_status',
        'approved_at',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'opening_balance' => 'decimal:2',
        'credit_limit' => 'decimal:2',
        'outstanding_amount' => 'decimal:2',
        'wallet_balance' => 'decimal:2',
        'commission_rate' => 'decimal:2',
        'approved_at' => 'datetime',
    ];

    public function company()
    {
        return $this->belongsTo(Company::class);
    }

    public function branch()
    {
        return $this->belongsTo(Branch::class);
    }

    public function group()
    {
        return $this->belongsTo(CustomerGroup::class, 'group_id');
    }
}