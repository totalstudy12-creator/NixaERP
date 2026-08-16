<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Role extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'group',
        'description',
        'active',
    ];

    protected $casts = [
        'active' => 'boolean',
    ];

    public function permissions()
    {
        return $this->belongsToMany(Permission::class, 'role_permissions');
    }

    public function users()
    {
        return $this->belongsToMany(User::class, 'role_user');
    }

    public function givePermissionTo(array|string $permissions): void
    {
        $names = is_array($permissions) ? $permissions : [$permissions];
        $permissionIds = Permission::whereIn('name', $names)->pluck('id')->all();
        if (!empty($permissionIds)) {
            $this->permissions()->syncWithoutDetaching($permissionIds);
        }
    }
}
