<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class DeliveryVehicle extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'delivery_vehicles';

    protected $fillable = [
        'company_id',
        'branch_id',
        'vehicle_code',
        'registration_number',
        'name',
        'type',
        'category',
        'max_capacity',
        'capacity_unit',
        'default_driver_id',
        'backup_driver_id',
        'ownership_type',
        'status',
        'maintenance_status',
        'notes',
        'is_active',
    ];

    protected $casts = [
        'max_capacity' => 'decimal:2',
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

    public function defaultDriver(): BelongsTo
    {
        return $this->belongsTo(DeliveryDriver::class, 'default_driver_id');
    }

    public function backupDriver(): BelongsTo
    {
        return $this->belongsTo(DeliveryDriver::class, 'backup_driver_id');
    }

    public function trips(): HasMany
    {
        return $this->hasMany(DeliveryTrip::class, 'vehicle_id');
    }
}
