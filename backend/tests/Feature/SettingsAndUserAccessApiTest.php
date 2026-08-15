<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SettingsAndUserAccessApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_roles_permissions_users_and_settings_are_available_via_api(): void
    {
        $role = Role::create([
            'name' => 'admin',
            'group' => 'management',
            'description' => 'Administrator',
            'active' => true,
        ]);

        $permission = Permission::create([
            'name' => 'manage_settings',
            'group' => 'settings',
            'description' => 'Manage settings',
            'active' => true,
        ]);

        $role->permissions()->attach($permission->id);

        $user = User::create([
            'name' => 'Demo Admin',
            'email' => 'demo-admin@example.com',
            'password' => bcrypt('password123'),
        ]);

        Setting::create([
            'key' => 'app_name',
            'value' => 'Raptor ERP',
            'group' => 'general',
            'description' => 'Application name',
            'is_public' => true,
        ]);

        $this->withoutMiddleware();

        $this->getJson('/api/roles')
            ->assertOk()
            ->assertJsonStructure(['success', 'data' => [['id', 'name']]]);

        $this->getJson('/api/permissions')
            ->assertOk()
            ->assertJsonStructure(['success', 'data' => [['id', 'name']]]);

        $this->postJson('/api/users/' . $user->id . '/roles', ['role_ids' => [$role->id]])
            ->assertOk();

        $this->getJson('/api/settings')
            ->assertOk()
            ->assertJsonStructure(['success', 'data' => [['key', 'value']]]);
    }

    public function test_roles_can_be_created_updated_and_deleted_via_api(): void
    {
        $this->withoutMiddleware();

        $createResponse = $this->postJson('/api/roles', [
            'name' => 'finance',
            'group' => 'finance',
            'description' => 'Finance operations',
            'active' => true,
            'permission_ids' => [],
        ]);

        $createResponse->assertCreated()
            ->assertJsonPath('data.name', 'finance');

        $role = Role::where('name', 'finance')->firstOrFail();

        $this->putJson('/api/roles/' . $role->id, [
            'name' => 'finance_manager',
            'group' => 'finance',
            'description' => 'Finance manager',
            'active' => true,
            'permission_ids' => [],
        ])->assertOk();

        $this->deleteJson('/api/roles/' . $role->id)->assertOk();

        $this->assertDatabaseMissing('roles', ['id' => $role->id]);
    }
}
