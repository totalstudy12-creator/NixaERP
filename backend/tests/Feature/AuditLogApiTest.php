<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AuditLogApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_unauthenticated_clients_cannot_read_or_write_audit_logs(): void
    {
        $this->getJson('/api/audit-logs')->assertUnauthorized();
        $this->postJson('/api/audit-logs', [
            'module' => 'Invoices',
            'action' => 'Create',
            'status' => 'success',
            'message' => 'Created invoice',
        ])->assertUnauthorized();
    }

    public function test_events_from_multiple_devices_are_shared_and_actor_is_server_derived(): void
    {
        $firstActor = $this->user('device-one@example.test');
        $secondActor = $this->user('device-two@example.test');

        $this->withHeaders(['User-Agent' => 'NexaERP Desktop Device'])
            ->actingAs($firstActor, 'sanctum')
            ->postJson('/api/audit-logs', [
                'module' => 'Invoices',
                'action' => 'Create',
                'status' => 'success',
                'message' => 'Created from desktop',
                'user_id' => $secondActor->id,
                'user_name' => 'Forged Actor',
                'user_email' => 'forged@example.test',
            ])
            ->assertCreated()
            ->assertJsonPath('user.id', $firstActor->id)
            ->assertJsonPath('user.name', $firstActor->name)
            ->assertJsonPath('user_email', $firstActor->email)
            ->assertJsonPath('user_agent', 'NexaERP Desktop Device');

        $this->withHeaders(['User-Agent' => 'NexaERP Mobile Device'])
            ->actingAs($secondActor, 'sanctum')
            ->postJson('/api/audit-logs', [
                'module' => 'Payments',
                'action' => 'Create',
                'status' => 'success',
                'message' => 'Created from mobile',
            ])
            ->assertCreated()
            ->assertJsonPath('user.id', $secondActor->id)
            ->assertJsonPath('user_agent', 'NexaERP Mobile Device');

        $reader = $this->userWithPermission('audit-reader@example.test', 'view users');
        $response = $this->actingAs($reader, 'sanctum')
            ->getJson('/api/audit-logs?limit=1000&user_id=' . $firstActor->id);

        $response->assertOk()->assertJsonCount(0);

        $firstActorLogs = $this->actingAs($firstActor, 'sanctum')
            ->getJson('/api/audit-logs?limit=1000&user_id=' . $secondActor->id);
        $firstActorLogs->assertOk()
            ->assertJsonCount(1)
            ->assertJsonFragment(['message' => 'Created from desktop'])
            ->assertJsonFragment(['user_agent' => 'NexaERP Desktop Device']);

        $adminRole = Role::create(['name' => 'Admin']);
        $administrator = $this->user('audit-global-reader@example.test');
        $administrator->roles()->attach($adminRole->id);
        $allLogs = $this->actingAs($administrator, 'sanctum')->getJson('/api/audit-logs?limit=1000');
        $allLogs->assertOk()
            ->assertJsonCount(2)
            ->assertJsonFragment(['message' => 'Created from desktop'])
            ->assertJsonFragment(['message' => 'Created from mobile']);

        $this->assertDatabaseCount('audit_logs', 2);
        $this->assertDatabaseHas('audit_logs', [
            'user_id' => $firstActor->id,
            'user_name' => $firstActor->name,
            'user_email' => $firstActor->email,
        ]);
        $this->assertDatabaseMissing('audit_logs', ['user_name' => 'Forged Actor']);
    }

    public function test_only_system_admin_can_clear_database_audit_logs(): void
    {
        $adminRole = Role::create(['name' => 'Admin']);
        $admin = $this->user('audit-admin@example.test');
        $admin->roles()->attach($adminRole->id);
        AuditLog::create([
            'user_id' => $admin->id,
            'user_name' => $admin->name,
            'user_email' => $admin->email,
            'module' => 'Settings',
            'action' => 'Update',
            'status' => 'success',
            'message' => 'Updated setting',
        ]);

        $manager = $this->user('audit-manager@example.test');
        Sanctum::actingAs($manager);
        $this->deleteJson('/api/audit-logs')->assertForbidden();
        $this->assertDatabaseCount('audit_logs', 1);

        Sanctum::actingAs($admin);
        $this->deleteJson('/api/audit-logs')->assertOk();
        $this->assertDatabaseCount('audit_logs', 0);
    }

    private function user(string $email): User
    {
        return User::create([
            'name' => ucfirst(strtok($email, '@')),
            'email' => $email,
            'password' => 'password',
        ]);
    }

    private function userWithPermission(string $email, string $permission): User
    {
        $role = Role::create(['name' => 'Audit Reader']);
        $permissionRecord = \App\Models\Permission::create(['name' => $permission]);
        $role->permissions()->attach($permissionRecord->id);
        $user = $this->user($email);
        $user->roles()->attach($role->id);

        return $user;
    }
}