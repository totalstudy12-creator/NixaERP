<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\AllPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SystemRoleAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_manager_cannot_create_assign_or_modify_system_administrator_access(): void
    {
        $adminRole = Role::create(['name' => 'Admin']);
        $managerRole = Role::create(['name' => 'Manager']);
        $this->grant($managerRole, [
            'create roles', 'edit roles', 'delete roles', 'create users',
            'edit users', 'delete users', 'assign roles to user',
        ]);
        $manager = $this->userWithRole($managerRole, 'manager@example.test');
        $target = User::create([
            'name' => 'Regular User',
            'email' => 'regular@example.test',
            'password' => 'password',
        ]);
        Sanctum::actingAs($manager);

        $this->postJson('/api/roles', ['name' => 'Super Admin'])->assertForbidden();
        $this->putJson('/api/roles/' . $adminRole->id, [
            'name' => 'Renamed Admin',
            'permission_ids' => [],
        ])->assertForbidden();
        $this->deleteJson('/api/roles/' . $adminRole->id)->assertForbidden();
        $this->postJson('/api/users/' . $target->id . '/roles', [
            'role_ids' => [$adminRole->id],
        ])->assertForbidden();
        $this->postJson('/api/users', [
            'name' => 'Escalated User',
            'email' => 'escalated@example.test',
            'password' => 'password123',
            'role_ids' => [$adminRole->id],
        ])->assertForbidden();
        $this->putJson('/api/users/' . $target->id, [
            'role_ids' => [$adminRole->id],
        ])->assertForbidden();
    }

    public function test_last_system_administrator_cannot_be_demoted(): void
    {
        $adminRole = Role::create(['name' => 'Admin']);
        $this->grant($adminRole, ['edit users']);
        $admin = $this->userWithRole($adminRole, 'only-admin@example.test');
        Sanctum::actingAs($admin);

        $this->putJson('/api/users/' . $admin->id, ['role_ids' => []])
            ->assertConflict()
            ->assertJsonPath('message', 'At least one system administrator must retain access.');
    }

    public function test_system_admin_can_manage_role_grants_and_provision_admin_users(): void
    {
        $adminRole = Role::create(['name' => 'Admin']);
        $this->grant($adminRole, [
            'edit roles', 'delete roles', 'create roles', 'create users', 'assign roles to user',
        ]);
        $admin = $this->userWithRole($adminRole, 'system-admin@example.test');
        Sanctum::actingAs($admin);

        $editPermission = Permission::where('name', 'edit roles')->firstOrFail();
        $this->putJson('/api/roles/' . $adminRole->id, [
            'name' => 'Admin',
            'group' => 'system',
            'description' => 'System administrator role',
            'active' => true,
            'permission_ids' => [$editPermission->id],
        ])->assertOk();

        $this->postJson('/api/roles', [
            'name' => 'Finance Operator',
            'group' => 'finance',
            'permission_ids' => [$editPermission->id],
            'active' => true,
        ])->assertCreated();

        $createdUser = $this->postJson('/api/users', [
            'name' => 'New Administrator',
            'email' => 'new-system-admin@example.test',
            'password' => 'password123',
            'role_ids' => [$adminRole->id],
        ])->assertCreated()->json('data');

        $this->postJson('/api/users/' . $createdUser['id'] . '/roles', [
            'role_ids' => [$adminRole->id],
        ])->assertOk();

        $this->putJson('/api/roles/' . $adminRole->id, [
            'name' => 'Renamed Admin',
            'permission_ids' => [$editPermission->id],
        ])->assertConflict();
        $this->deleteJson('/api/roles/' . $adminRole->id)->assertConflict();
    }

    public function test_permission_edit_and_delete_require_their_own_permissions(): void
    {
        $role = Role::create(['name' => 'Permission Creator']);
        $this->grant($role, ['create permissions']);
        $user = $this->userWithRole($role, 'permission-creator@example.test');
        $permission = Permission::create(['name' => 'sample permission']);
        Sanctum::actingAs($user);

        $this->putJson('/api/permissions/' . $permission->id, [
            'name' => 'renamed permission',
        ])->assertForbidden();
        $this->deleteJson('/api/permissions/' . $permission->id)->assertForbidden();
    }

    public function test_manager_receives_only_implemented_income_expense_capabilities(): void
    {
        $managerRole = Role::create(['name' => 'Manager']);

        app(AllPermissionsSeeder::class)->run();

        $managerRole->refresh();
        foreach ([
            'income_expenses.view',
            'income_expenses.create',
            'income_expenses.edit',
            'income_expenses.delete',
            'income_expenses.export',
            'income_expenses.manage_categories',
            'income_expenses.manage_accounts',
            'income_expenses.view_reports',
        ] as $permission) {
            $this->assertTrue($managerRole->hasPermission($permission));
        }

        foreach ([
            'income_expenses.approve',
            'income_expenses.reject',
            'income_expenses.reverse',
            'income_expenses.manage_recurring',
            'edit permissions',
            'delete permissions',
        ] as $permission) {
            $this->assertFalse($managerRole->hasPermission($permission));
        }
    }

    private function grant(Role $role, array $permissionNames): void
    {
        foreach ($permissionNames as $name) {
            $permission = Permission::create(['name' => $name]);
            $role->permissions()->attach($permission->id);
        }
    }

    private function userWithRole(Role $role, string $email): User
    {
        $user = User::create([
            'name' => 'Test User',
            'email' => $email,
            'password' => 'password',
        ]);
        $user->roles()->attach($role->id);

        return $user;
    }
}