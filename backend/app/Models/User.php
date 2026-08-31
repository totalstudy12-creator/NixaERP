<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    protected $fillable = [
        'name',
        'email',
        'password',
        'phone',
        'location',
        'timezone',
        'bio',
        'avatar_url',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function roles()
    {
        return $this->belongsToMany(Role::class, 'role_user');
    }

    public function hasRole(string|int $role): bool
    {
        return $this->roles->contains(function ($item) use ($role) {
            return $item->id === $role || $item->name === $role;
        });
    }

    public function hasAnyRole(array $roles): bool
    {
        return $this->roles->contains(function ($item) use ($roles) {
            return in_array($item->id, $roles) || in_array($item->name, $roles);
        });
    }

    public function hasAllRoles(array $roles): bool
    {
        foreach ($roles as $role) {
            if (!$this->hasRole($role)) {
                return false;
            }
        }
        return true;
    }

    public function permissions()
    {
        return Permission::whereHas('roles', function ($query) {
            $query->whereIn('roles.id', $this->roles->pluck('id'));
        })->where('active', true)->get();
    }

    public function hasPermission(string|int $permission): bool
    {
        return $this->permissions()->contains(function ($item) use ($permission) {
            return $item->id === $permission || $item->name === $permission;
        });
    }

    public function hasAnyPermission(array $permissions): bool
    {
        return $this->permissions()->contains(function ($item) use ($permissions) {
            return in_array($item->id, $permissions) || in_array($item->name, $permissions);
        });
    }

    public function hasAllPermissions(array $permissions): bool
    {
        foreach ($permissions as $permission) {
            if (!$this->hasPermission($permission)) {
                return false;
            }
        }
        return true;
    }
}