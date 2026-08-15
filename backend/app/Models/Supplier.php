<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Supplier extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'company_id', 'branch_id', 'parent_id', 'group_id',
        'name', 'type', 'company_type', 'contact_person', 'contact_no',
        'email', 'phone', 'gst_number', 'registration_type', 'pan',
        'billing_street', 'billing_landmark', 'billing_city', 'billing_state', 'billing_country', 'billing_pincode',
        'shipping_street', 'shipping_landmark', 'shipping_city', 'shipping_state', 'shipping_country', 'shipping_pincode',
        'eway_bill_distance', 'territory', 'zone', 'status',
        'credit_limit', 'outstanding_amount', 'wallet_balance', 'commission_rate',
        'kyc_status', 'approved_at', 'opening_balance', 'due_days',
        'fax', 'website', 'note', 'license_no', 'custom_field_1', 'custom_field_2',
        'is_active', 'notes',
    ];

    public function company() { return $this->belongsTo(Company::class); }
    public function branch()  { return $this->belongsTo(Branch::class); }
    public function parent()  { return $this->belongsTo(Supplier::class, 'parent_id'); }
    public function group()   { return $this->belongsTo(SupplierGroup::class); }
}