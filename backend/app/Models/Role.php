<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Role extends Model
{
    use HasFactory;

    protected $fillable = ['name', 'group', 'description', 'active'];

    protected $casts = ['active' => 'boolean'];

    public function permissions(): BelongsToMany
    {
        return $this->belongsToMany(Permission::class, 'role_permissions');
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'role_user');
    }

    public function givePermissionTo(array|string $permissions): void
    {
        $names = is_array($permissions) ? $permissions : [$permissions];
        $ids = Permission::whereIn('name', $names)->pluck('id')->all();
        if (! empty($ids)) $this->permissions()->syncWithoutDetaching($ids);
    }

    public function revokePermissionTo(array|string $permissions): void
    {
        $names = is_array($permissions) ? $permissions : [$permissions];
        $ids = Permission::whereIn('name', $names)->pluck('id')->all();
        if (! empty($ids)) $this->permissions()->detach($ids);
    }

    public function syncPermissions(array $permissions): void
    {
        $this->permissions()->sync($permissions);
    }

    public function hasPermission(string|int $permission): bool
    {
        return $this->permissions->contains(
            fn ($item) => $item->id === $permission || $item->name === $permission
        );
    }

    public function hasAnyPermission(array $permissions): bool
    {
        return $this->permissions->contains(
            fn ($item) => in_array($item->id, $permissions, true)
                       || in_array($item->name, $permissions, true)
        );
    }

    public function hasAllPermissions(array $permissions): bool
    {
        foreach ($permissions as $p) { if (! $this->hasPermission($p)) return false; }
        return true;
    }
}