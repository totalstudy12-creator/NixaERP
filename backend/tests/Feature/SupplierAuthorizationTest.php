<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SupplierAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_supplier_crud_requires_authentication(): void
    {
        $supplier = Supplier::create(['name' => 'Restricted Supplier']);

        $this->getJson('/api/suppliers')->assertUnauthorized();
        $this->getJson('/api/suppliers/' . $supplier->id)->assertUnauthorized();
        $this->postJson('/api/suppliers')->assertUnauthorized();
        $this->putJson('/api/suppliers/' . $supplier->id)->assertUnauthorized();
        $this->deleteJson('/api/suppliers/' . $supplier->id)->assertUnauthorized();
    }

    public function test_supplier_crud_requires_operation_permissions(): void
    {
        $user = User::create([
            'name' => 'Supplier Reader Without Grants',
            'email' => 'supplier-reader@example.test',
            'password' => 'password',
        ]);
        $supplier = Supplier::create(['name' => 'Restricted Supplier']);
        Sanctum::actingAs($user);

        $this->getJson('/api/suppliers')->assertForbidden()->assertJsonMissingPath('required_any');
        $this->getJson('/api/suppliers/' . $supplier->id)->assertForbidden();
        $this->postJson('/api/suppliers')->assertForbidden();
        $this->putJson('/api/suppliers/' . $supplier->id)->assertForbidden();
        $this->deleteJson('/api/suppliers/' . $supplier->id)->assertForbidden();
    }

    public function test_supplier_view_permission_allows_read_access(): void
    {
        $permission = Permission::create(['name' => 'view suppliers']);
        $role = Role::create(['name' => 'Supplier Read Test']);
        $role->permissions()->attach($permission->id);
        $user = User::create([
            'name' => 'Supplier Reader',
            'email' => 'supplier-reader-allowed@example.test',
            'password' => 'password',
        ]);
        $user->roles()->attach($role->id);
        Sanctum::actingAs($user);

        $this->getJson('/api/suppliers')->assertOk();
    }

    public function test_authorized_supplier_requests_keep_404_and_422_semantics(): void
    {
        $role = Role::create(['name' => 'Supplier Validator']);
        $role->permissions()->attach([
            Permission::create(['name' => 'view suppliers'])->id,
            Permission::create(['name' => 'create suppliers'])->id,
        ]);
        $user = User::create([
            'name' => 'Supplier Validator',
            'email' => 'supplier-validator@example.test',
            'password' => 'password',
        ]);
        $user->roles()->attach($role->id);
        Sanctum::actingAs($user);

        $this->getJson('/api/suppliers/999999')->assertNotFound();
        $this->postJson('/api/suppliers', ['name' => 'Incomplete Supplier'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['company_id', 'billing_city']);
    }
}