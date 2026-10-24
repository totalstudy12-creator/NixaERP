<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;

trait InteractsWithPermissions
{
    protected function actingAsWithPermissions(User $user, array $permissionNames): static
    {
        $role = Role::firstOrCreate(['name' => 'Test Permission Role']);
        $permissionIds = collect($permissionNames)
            ->map(fn (string $name) => Permission::firstOrCreate(['name' => $name])->id)
            ->all();

        $role->permissions()->sync($permissionIds);
        $user->roles()->syncWithoutDetaching([$role->id]);

        return $this->actingAs($user, 'sanctum');
    }
}
