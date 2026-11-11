<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class DeliveryDriver extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'delivery_drivers';

    protected $fillable = [
        'company_id',
        'branch_id',
        'employee_id',
        'name',
        'contact_number',
        'alternate_contact',
        'license_number',
        'license_validity',
        'address',
        'status',
        'notes',
        'is_active',
    ];

    protected $casts = [
        'license_validity' => 'date',
        'is_active' => 'boolean',
    ];

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function vehicles(): HasMany
    {
        return $this->hasMany(DeliveryVehicle::class, 'default_driver_id');
    }

    public function trips(): HasMany
    {
        return $this->hasMany(DeliveryTrip::class, 'driver_id');
    }
}
