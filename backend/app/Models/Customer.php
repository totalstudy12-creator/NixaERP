<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Customer extends Model
{
    use HasFactory, SoftDeletes;

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
        'outstanding_amount',
        'wallet_balance',
        'commission_rate',
        'kyc_status',
        'approved_at',
    ];

    public function parent()
    {
        return $this->belongsTo(Customer::class, 'parent_id');
    }

    public function children()
    {
        return $this->hasMany(Customer::class, 'parent_id');
    }

    public function company()
    {
        return $this->belongsTo(Company::class);
    }

    public function branch()
    {
        return $this->belongsTo(Branch::class);
    }
    // Add this relationship inside the Customer model
    public function group()
    {
        return $this->belongsTo(CustomerGroup::class);
    }
}
