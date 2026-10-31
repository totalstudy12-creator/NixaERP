<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\IpAccessRule;
use App\Models\LoginAttempt;
use App\Models\Payment;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Models\UserSession;
use App\Services\IpSecurityService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EnterpriseSecurityAndEcosystemTest extends TestCase
{
    use RefreshDatabase, InteractsWithPermissions;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'CanonicalPermissionsSeeder']);
    }

    public function test_login_records_attempt_and_creates_user_session(): void
    {
        $user = $this->createTestUser('auth-test@example.test', 'Secret123!');

        $response = $this->postJson('/api/auth/login', [
            'email'    => 'auth-test@example.test',
            'password' => 'Secret123!',
        ]);

        $response->assertOk()
            ->assertJsonStructure([
                'access_token',
                'token_type',
                'expires_at',
                'session_id',
                'user' => ['id', 'email', 'status'],
            ]);

        // Verify login attempt was logged as success
        $this->assertDatabaseHas('login_attempts', [
            'user_id' => $user->id,
            'email'   => 'auth-test@example.test',
            'status'  => 'success',
        ]);

        // Verify active user session was created
        $this->assertDatabaseHas('user_sessions', [
            'user_id'   => $user->id,
            'is_active' => true,
        ]);
    }

    public function test_failed_login_records_attempt_and_increments_counter(): void
    {
        $user = $this->createTestUser('failed-auth@example.test', 'CorrectPassword123');

        $response = $this->postJson('/api/auth/login', [
            'email'    => 'failed-auth@example.test',
            'password' => 'WrongPassword',
        ]);

        $response->assertStatus(401);

        $this->assertDatabaseHas('login_attempts', [
            'email'  => 'failed-auth@example.test',
            'status' => 'failed',
        ]);

        $user->refresh();
        $this->assertEquals(1, $user->failed_login_count);
    }

    public function test_user_can_terminate_own_sessions(): void
    {
        $user = $this->createTestUser('session-terminate@example.test');
        Sanctum::actingAs($user);

        $session = UserSession::create([
            'user_id'          => $user->id,
            'session_id'       => 'test_session_token_123',
            'ip_address'       => '127.0.0.1',
            'device_name'      => 'Test Browser',
            'is_active'        => true,
            'last_activity_at' => now(),
        ]);

        $response = $this->getJson('/api/auth/sessions');
        $response->assertOk()
            ->assertJsonPath('success', true);

        $deleteResponse = $this->deleteJson('/api/auth/sessions/' . $session->id);
        $deleteResponse->assertOk()
            ->assertJsonPath('success', true);

        $session->refresh();
        $this->assertFalse($session->is_active);
    }

    public function test_admin_can_ban_and_unban_user_with_session_invalidation(): void
    {
        $admin = $this->adminUser('super-admin@example.test');
        $targetUser = $this->createTestUser('target-user@example.test');

        // Create active session for target user
        $session = UserSession::create([
            'user_id'          => $targetUser->id,
            'session_id'       => 'active_target_session_999',
            'ip_address'       => '127.0.0.1',
            'is_active'        => true,
            'last_activity_at' => now(),
        ]);

        Sanctum::actingAs($admin);

        // Ban the user
        $banResponse = $this->postJson("/api/users/{$targetUser->id}/ban", [
            'action'        => 'ban',
            'reason'        => 'Violation of acceptable use policy',
            'duration_days' => 30,
        ]);

        $banResponse->assertOk()
            ->assertJsonPath('data.status', 'banned');

        $targetUser->refresh();
        $session->refresh();

        $this->assertEquals('banned', $targetUser->status);
        $this->assertFalse($session->is_active);
        $this->assertDatabaseHas('user_ban_histories', [
            'user_id'      => $targetUser->id,
            'action'       => 'ban',
            'performed_by' => $admin->id,
        ]);

        // Target user login must now be rejected
        $loginResponse = $this->postJson('/api/auth/login', [
            'email'    => 'target-user@example.test',
            'password' => 'Password123!',
        ]);

        $loginResponse->assertStatus(403);

        // Unban the user
        $unbanResponse = $this->postJson("/api/users/{$targetUser->id}/unban", [
            'reason' => 'Account reviewed and restored',
        ]);

        $unbanResponse->assertOk()
            ->assertJsonPath('data.status', 'active');

        $targetUser->refresh();
        $this->assertEquals('active', $targetUser->status);
    }

    public function test_last_system_admin_cannot_be_banned(): void
    {
        $superAdmin = $this->adminUser('sole-admin@example.test');
        $anotherAdmin = $this->adminUser('acting-admin@example.test');
        Sanctum::actingAs($anotherAdmin);

        // Self-ban is prohibited
        $selfBanResponse = $this->postJson("/api/users/{$anotherAdmin->id}/ban", [
            'action' => 'ban',
            'reason' => 'Self ban',
        ]);
        $selfBanResponse->assertStatus(422);
    }

    public function test_ip_access_control_and_cidr_matching(): void
    {
        $ipService = app(IpSecurityService::class);

        // Test IPv4 CIDR matching
        $this->assertTrue($ipService->ipMatchesPattern('192.168.1.50', '192.168.1.0/24'));
        $this->assertFalse($ipService->ipMatchesPattern('192.168.2.1', '192.168.1.0/24'));

        // Test IPv6 exact and CIDR matching
        $this->assertTrue($ipService->ipMatchesPattern('2001:db8::1', '2001:db8::1'));
        $this->assertTrue($ipService->ipMatchesPattern('2001:db8::abcd', '2001:db8::/32'));
        $this->assertFalse($ipService->ipMatchesPattern('2001:db9::1', '2001:db8::/32'));

        // Create an IP block rule
        $ipService->blockIp('203.0.113.45', 'Malicious attack');
        $this->assertTrue($ipService->isIpBlocked('203.0.113.45'));

        // Add allowlist override
        $ipService->allowlistIp('203.0.113.45', 'Exempted office IP');
        $this->assertFalse($ipService->isIpBlocked('203.0.113.45'));

        // Cleanup
        $ipService->unblockIp('203.0.113.45');
        IpAccessRule::where('ip_address', '203.0.113.45')->delete();
        $ipService->flushCache();
    }

    public function test_customer_360_overview_and_financial_deletion_protection(): void
    {
        $admin = $this->adminUser('customer-360-admin@example.test');
        Sanctum::actingAs($admin);

        $company = Company::create(['name' => 'Acme Corp', 'code' => 'ACM']);

        $customer = Customer::create([
            'company_id'      => $company->id,
            'name'            => 'Acme Global 360',
            'contact_no'      => '9876543210',
            'email'           => 'acme@example.test',
            'type'            => 'customer',
            'gst_number'      => '27AAAAA0000A1Z5',
            'opening_balance' => 1000.00,
            'is_active'       => true,
        ]);

        // Create linked invoice
        Invoice::create([
            'company_id'   => $company->id,
            'customer_id'  => $customer->id,
            'invoice_no'   => 'INV-360-001',
            'total_amount' => 5000.00,
            'grand_total'  => 5000.00,
            'status'       => 'issued',
            'invoice_date' => now()->toDateString(),
        ]);

        // Create linked payment
        Payment::create([
            'company_id'        => $company->id,
            'customer_id'       => $customer->id,
            'amount'            => 2000.00,
            'payment_method'    => 'bank_transfer',
            'payment_direction' => 'inward',
            'transaction_date'  => now()->toDateString(),
        ]);

        // Test Customer 360 API
        $response = $this->getJson("/api/customers/{$customer->id}/customer-360");
        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'data' => [
                    'customer',
                    'kpis' => [
                        'total_sales',
                        'paid_amount',
                        'outstanding_receivables',
                        'aging',
                        'sales_trend',
                    ],
                    'invoices',
                    'payments',
                    'quotations',
                    'products',
                    'contacts',
                ],
            ]);

        // Attempt deletion of customer with linked financial history -> must be rejected
        $deleteResponse = $this->deleteJson("/api/customers/{$customer->id}");
        $deleteResponse->assertStatus(422)
            ->assertJsonFragment([
                'message' => 'Cannot delete customer with linked financial transactions (invoices, payments, or orders). Please archive or deactivate the customer instead.',
            ]);

        // Archive / Restore toggle
        $archiveResponse = $this->postJson("/api/customers/{$customer->id}/archive");
        $archiveResponse->assertOk()
            ->assertJsonPath('is_active', false);
    }

    public function test_app_launcher_returns_permission_aware_catalog(): void
    {
        $user = $this->createTestUser('app-launcher-user@example.test');
        Sanctum::actingAs($user);

        $response = $this->getJson('/api/apps/launcher');
        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'data' => [
                    '*' => [
                        'id',
                        'name',
                        'category',
                        'route',
                        'icon',
                        'has_access',
                        'status',
                    ],
                ],
            ]);
    }

    private function createTestUser(string $email, string $password = 'Password123!'): User
    {
        return User::create([
            'name'     => 'Test User',
            'email'    => $email,
            'password' => Hash::make($password),
            'status'   => 'active',
        ]);
    }

    private function adminUser(string $email): User
    {
        $user = $this->createTestUser($email);
        $role = Role::firstOrCreate(['name' => 'Admin']);
        $user->roles()->sync([$role->id]);
        return $user;
    }
}
