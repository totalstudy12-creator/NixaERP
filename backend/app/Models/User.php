<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Collection;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    protected $fillable = [
        'name', 'email', 'password', 'phone',
        'location', 'timezone', 'bio', 'avatar_url', 'company_id', 'branch_id',
    ];

    protected $hidden = ['password', 'remember_token', 'two_factor_secret'];

    /** Request-scoped cache for the resolved permission collection. */
    protected ?Collection $cachedResolvedPermissions = null;

    protected function casts(): array
    {
        return [
            'email_verified_at'       => 'datetime',
            'password'                => 'hashed',
            'two_factor_secret'       => 'encrypted',
            'two_factor_confirmed_at' => 'datetime',
            'company_id'              => 'integer',
            'branch_id'               => 'integer',
        ];
    }

    /* ---------------------------- Roles ---------------------------- */

    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'role_user');
    }

    public function hasRole(string|int $role): bool
    {
        return $this->roles->contains(
            fn ($item) => $item->id === $role || $item->name === $role
        );
    }

    public function hasAnyRole(array $roles): bool
    {
        return $this->roles->contains(
            fn ($item) => in_array($item->id, $roles, true)
                       || in_array($item->name, $roles, true)
        );
    }

    public function hasAllRoles(array $roles): bool
    {
        foreach ($roles as $r) { if (! $this->hasRole($r)) return false; }
        return true;
    }

    /* ------------------------ Permissions -------------------------- */
    /* NOTE: the method is intentionally named `resolvePermissions`
     * (not `permissions`) so Laravel's eager loader never mistakes it
     * for a Relation when evaluating nested eager-load paths such as
     * `roles.permissions`.
     */

    public function resolvePermissions(): Collection
    {
        if ($this->cachedResolvedPermissions !== null) {
            return $this->cachedResolvedPermissions;
        }

        // Super-admin bypass — every active permission.
        if ($this->hasRole('Admin') || $this->hasRole('Super Admin')) {
            return $this->cachedResolvedPermissions = Permission::query()
                ->where('active', true)
                ->orderBy('group')
                ->orderBy('name')
                ->get();
        }

        $roleIds = $this->roles->pluck('id')->all();
        if (empty($roleIds)) {
            return $this->cachedResolvedPermissions = new Collection();
        }

        return $this->cachedResolvedPermissions = Permission::query()
            ->where('active', true)
            ->whereHas('roles', fn ($q) => $q->whereIn('roles.id', $roleIds))
            ->orderBy('group')
            ->orderBy('name')
            ->get();
    }

    /** Always hits the database — used right after a role/permission mutation. */
    public function resolvePermissionsFresh(): Collection
    {
        $roleIds = $this->roles()->pluck('roles.id')->all();
        if (empty($roleIds)) return new Collection();

        return Permission::query()
            ->where('active', true)
            ->whereHas('roles', fn ($q) => $q->whereIn('roles.id', $roleIds))
            ->get();
    }

    public function permissionNames(): array
    {
        return $this->resolvePermissions()->pluck('name')->values()->all();
    }

    public function permissionIds(): array
    {
        return $this->resolvePermissions()->pluck('id')->values()->all();
    }

    public function hasPermission(string|int $permission): bool
    {
        return $this->resolvePermissions()->contains(
            fn ($item) => $item->id === $permission || $item->name === $permission
        );
    }

    public function hasAnyPermission(array $permissions): bool
    {
        return $this->resolvePermissions()->contains(
            fn ($item) => in_array($item->id, $permissions, true)
                       || in_array($item->name, $permissions, true)
        );
    }

    public function hasAllPermissions(array $permissions): bool
    {
        foreach ($permissions as $p) { if (! $this->hasPermission($p)) return false; }
        return true;
    }

    /** Call after role/permission mutation so the next check is fresh. */
    public function flushPermissionCache(): void
    {
        $this->cachedResolvedPermissions = null;
        $this->unsetRelation('roles');
    }

    /* ---------------------------- 2FA ------------------------------ */

    public function twoFactorRecoveryCodes()
    {
        return $this->hasMany(TwoFactorRecoveryCode::class);
    }

    public function hasTwoFactorEnabled(): bool
    {
        return $this->two_factor_secret !== null && $this->two_factor_confirmed_at !== null;
    }

    public function hasPendingTwoFactorSetup(): bool
    {
        return $this->two_factor_secret !== null && $this->two_factor_confirmed_at === null;
    }
}