<?php

namespace Tests\Feature;

use App\Models\BiometricDevice;
use App\Models\Company;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BiometricDeviceAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_device_ingress_requires_a_valid_token_bound_to_that_device(): void
    {
        $token = 'test-device-token';
        $device = BiometricDevice::factory()->create([
            'api_token_hash' => hash('sha256', $token),
        ]);

        $this->postJson('/api/biometric/device/heartbeat', [
            'device_uid' => $device->device_uid,
        ])->assertUnauthorized();

        $this->withToken($token)->postJson('/api/biometric/device/heartbeat', [
            'device_uid' => 'another-device',
        ])->assertForbidden();

        $this->withToken($token)->postJson('/api/biometric/device/heartbeat', [
            'device_uid' => $device->device_uid,
        ])->assertOk();
    }

    public function test_device_registration_requires_its_existing_permission_and_returns_a_one_time_token(): void
    {
        $payload = [
            'device_uid' => 'ESP32-ABC123',
            'name' => 'Main Gate',
            'company_id' => Company::factory()->create()->id,
            'firmware_version' => 'v1.0.0',
        ];

        $this->postJson('/api/biometric/device/register', $payload)->assertUnauthorized();

        $role = Role::create(['name' => 'Device Provisioner Test']);
        $permission = Permission::create(['name' => 'register biometric device']);
        $role->permissions()->attach($permission->id);
        $user = User::create([
            'name' => 'Device Provisioner',
            'email' => 'device-provisioner@example.test',
            'password' => 'password',
        ]);
        $user->roles()->attach($role->id);
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/biometric/device/register', $payload);
        $response->assertOk()->assertJsonStructure(['device_id', 'device_token', 'message']);

        $device = BiometricDevice::where('device_uid', $payload['device_uid'])->firstOrFail();
        $this->assertSame(hash('sha256', $response->json('device_token')), $device->api_token_hash);
        $this->assertStringNotContainsString($device->api_token_hash, $response->getContent());
    }
}