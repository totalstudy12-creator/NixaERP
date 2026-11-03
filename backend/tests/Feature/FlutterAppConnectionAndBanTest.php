<?php

namespace Tests\Feature;

use App\Models\ConnectedApp;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\CanonicalPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class FlutterAppConnectionAndBanTest extends TestCase
{
    use RefreshDatabase;

    protected Role $adminRole;
    protected Role $warehouseManagerRole;
    protected Role $warehouseStaffRole;
    protected Role $cashierRole;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(CanonicalPermissionsSeeder::class);

        // Fetch or create roles
        $this->adminRole = Role::where('name', 'Admin')->first()
            ?: Role::create(['name' => 'Admin']);
        $this->warehouseManagerRole = Role::where('name', 'Warehouse Manager')->first()
            ?: Role::create(['name' => 'Warehouse Manager']);
        $this->warehouseStaffRole = Role::where('name', 'Warehouse Staff')->first()
            ?: Role::create(['name' => 'Warehouse Staff']);
        $this->cashierRole = Role::where('name', 'Cashier')->first()
            ?: Role::create(['name' => 'Cashier']);

        // Update or configure seeded connected app
        ConnectedApp::updateOrCreate(
            ['app_identifier' => 'nixa_wms'],
            [
                'name' => 'Nixa WMS',
                'description' => 'Warehouse Management Mobile App',
                'category' => 'wms',
                'platform' => 'flutter',
                'current_version' => '1.2.3',
                'min_supported_version' => '1.0.0',
                'force_update' => false,
                'apk_download_url' => 'https://downloads.nixaerp.com/apps/nixa-wms-v1.2.3.apk',
                'release_notes' => 'Flutter release with offline scan cache.',
                'is_active' => true,
                'maintenance_mode' => false,
                'maintenance_message' => 'Under scheduled maintenance.',
                'api_key' => 'nixa_wms_test_api_key_12345678901234567890',
                'allowed_roles' => ['Admin', 'Warehouse Manager', 'Warehouse Staff', 'Super Admin'],
                'settings' => [
                    'scanner_vibration' => true,
                    'continuous_scan' => true,
                ],
                'last_sync_at' => now(),
            ]
        );
    }

    public function test_flutter_app_handshake_returns_app_config_and_version_status(): void
    {
        $response = $this->getJson('/api/v1/apps/nixa_wms/handshake?version=1.2.0');

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('app.identifier', 'nixa_wms')
            ->assertJsonPath('app.name', 'Nixa WMS')
            ->assertJsonPath('version.current_version', '1.2.3')
            ->assertJsonPath('version.is_update_available', true)
            ->assertJsonPath('endpoints.login', '/api/v1/apps/nixa_wms/login')
            ->assertJsonPath('settings.scanner_vibration', true);
    }

    public function test_flutter_app_check_update_endpoint(): void
    {
        $response = $this->getJson('/api/v1/apps/nixa_wms/check-update?version=1.0.0');

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('app_identifier', 'nixa_wms')
            ->assertJsonPath('ota.current_version', '1.2.3')
            ->assertJsonPath('ota.is_update_available', true)
            ->assertJsonPath('ota.apk_download_url', 'https://downloads.nixaerp.com/apps/nixa-wms-v1.2.3.apk');
    }

    public function test_flutter_app_login_authenticates_valid_user_and_creates_sanctum_token(): void
    {
        $user = User::factory()->create([
            'email' => 'warehouse.lead@nixaerp.com',
            'password' => Hash::make('Secret123!'),
            'status' => 'active',
        ]);
        $user->roles()->attach($this->warehouseManagerRole->id);

        $response = $this->postJson('/api/v1/apps/nixa_wms/login', [
            'email' => 'warehouse.lead@nixaerp.com',
            'password' => 'Secret123!',
            'device_name' => 'Honeywell EDA51',
            'platform' => 'android_flutter',
            'app_version' => '1.2.3',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('token_type', 'Bearer')
            ->assertJsonPath('user.email', 'warehouse.lead@nixaerp.com')
            ->assertJsonPath('app.identifier', 'nixa_wms');

        $this->assertNotEmpty($response->json('token'));
        $this->assertDatabaseHas('personal_access_tokens', [
            'tokenable_id' => $user->id,
            'name' => 'flutter_nixa_wms_honeywell-eda51',
        ]);
    }

    public function test_flutter_app_login_rejects_banned_user_with_forbidden(): void
    {
        $user = User::factory()->create([
            'email' => 'banned.staff@nixaerp.com',
            'password' => Hash::make('Secret123!'),
            'status' => 'banned',
            'banned_at' => now(),
            'banned_reason' => 'Inventory discrepancy investigation',
        ]);
        $user->roles()->attach($this->warehouseStaffRole->id);

        $response = $this->postJson('/api/v1/apps/nixa_wms/login', [
            'email' => 'banned.staff@nixaerp.com',
            'password' => 'Secret123!',
        ]);

        $response->assertStatus(403)
            ->assertJsonPath('success', false)
            ->assertJsonPath('error', 'ACCOUNT_BANNED')
            ->assertJsonPath('banned_reason', 'Inventory discrepancy investigation');
    }

    public function test_flutter_app_login_rejects_unauthorized_role(): void
    {
        $user = User::factory()->create([
            'email' => 'cashier.pos@nixaerp.com',
            'password' => Hash::make('Secret123!'),
            'status' => 'active',
        ]);
        $user->roles()->attach($this->cashierRole->id);

        $response = $this->postJson('/api/v1/apps/nixa_wms/login', [
            'email' => 'cashier.pos@nixaerp.com',
            'password' => 'Secret123!',
        ]);

        $response->assertStatus(403)
            ->assertJsonPath('success', false)
            ->assertJsonPath('error', 'ROLE_UNAUTHORIZED');
    }

    public function test_flutter_app_login_enforces_maintenance_mode(): void
    {
        $app = ConnectedApp::where('app_identifier', 'nixa_wms')->first();
        $app->update([
            'maintenance_mode' => true,
            'maintenance_message' => 'Upgrading stock indexing database.',
        ]);

        $user = User::factory()->create([
            'email' => 'worker@nixaerp.com',
            'password' => Hash::make('Secret123!'),
            'status' => 'active',
        ]);
        $user->roles()->attach($this->warehouseStaffRole->id);

        $response = $this->postJson('/api/v1/apps/nixa_wms/login', [
            'email' => 'worker@nixaerp.com',
            'password' => 'Secret123!',
        ]);

        $response->assertStatus(503)
            ->assertJsonPath('success', false)
            ->assertJsonPath('error', 'MAINTENANCE_MODE')
            ->assertJsonPath('message', 'Upgrading stock indexing database.');
    }

    public function test_flutter_app_profile_and_logout(): void
    {
        $user = User::factory()->create([
            'email' => 'active.worker@nixaerp.com',
            'status' => 'active',
        ]);
        $user->roles()->attach($this->warehouseManagerRole->id);

        Sanctum::actingAs($user, ['*']);

        $profileRes = $this->getJson('/api/v1/apps/nixa_wms/profile');
        $profileRes->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('user.email', 'active.worker@nixaerp.com');

        $logoutRes = $this->postJson('/api/v1/apps/nixa_wms/logout');
        $logoutRes->assertStatus(200)
            ->assertJsonPath('success', true);
    }

    public function test_banned_users_listing_and_admin_ban_unban_flow(): void
    {
        $admin = User::factory()->create([
            'email' => 'admin.sec@nixaerp.com',
            'status' => 'active',
        ]);
        $admin->roles()->attach($this->adminRole->id);

        $staff = User::factory()->create([
            'email' => 'staff.target@nixaerp.com',
            'status' => 'active',
        ]);

        Sanctum::actingAs($admin, ['*']);

        // 1. Ban user
        $banRes = $this->postJson("/api/users/{$staff->id}/ban", [
            'action' => 'ban',
            'reason' => 'Suspicious mobile device activity',
            'duration_days' => 7,
        ]);

        $banRes->assertStatus(200);
        $this->assertEquals('banned', $staff->fresh()->status);
        $this->assertEquals('Suspicious mobile device activity', $staff->fresh()->banned_reason);

        // 2. Fetch banned users list
        $listRes = $this->getJson('/api/users/banned');
        $listRes->assertStatus(200)
            ->assertJsonPath('success', true);

        $bannedEmails = collect($listRes->json('data'))->pluck('email')->toArray();
        $this->assertContains('staff.target@nixaerp.com', $bannedEmails);

        // 3. Unban user
        $unbanRes = $this->postJson("/api/users/{$staff->id}/unban", [
            'reason' => 'Security verification passed',
        ]);

        $unbanRes->assertStatus(200);
        $this->assertEquals('active', $staff->fresh()->status);
        $this->assertNull($staff->fresh()->banned_reason);
    }
}
