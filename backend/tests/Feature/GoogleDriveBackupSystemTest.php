<?php

namespace Tests\Feature;

use App\Models\BackupArtifact;
use App\Models\BackupConnection;
use App\Models\BackupRun;
use App\Models\BackupSetting;
use App\Models\User;
use App\Services\BackupEncryptionService;
use App\Services\BackupRetentionService;
use App\Services\GoogleDriveService;
use Database\Seeders\CanonicalPermissionsSeeder;
use Exception;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use Tests\TestCase;

class GoogleDriveBackupSystemTest extends TestCase
{
    use RefreshDatabase;
    use InteractsWithPermissions;

    protected User $adminUser;
    protected User $regularUser;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(CanonicalPermissionsSeeder::class);

        $this->adminUser = User::factory()->create();
        $this->regularUser = User::factory()->create();
    }

    public function test_unauthenticated_request_is_rejected(): void
    {
        $response = $this->getJson('/api/backup-system/status');
        $response->assertStatus(401);
    }

    public function test_user_without_permission_is_forbidden(): void
    {
        $response = $this->actingAs($this->regularUser, 'sanctum')
            ->getJson('/api/backup-system/status');

        $response->assertStatus(403);
    }

    public function test_authorized_user_can_view_backup_status(): void
    {
        $response = $this->actingAsWithPermissions($this->adminUser, ['system.backups.view'])
            ->getJson('/api/backup-system/status');

        $response->assertStatus(200)
            ->assertJsonStructure([
                'status',
                'data' => [
                    'has_active_connection',
                    'metrics' => [
                        'total_runs',
                        'successful_runs',
                        'failed_runs',
                        'total_backup_bytes',
                    ],
                    'scheduler',
                ],
            ]);
    }

    public function test_oauth_redirect_generates_valid_google_url_with_state(): void
    {
        $response = $this->actingAsWithPermissions($this->adminUser, ['system.backups.settings'])
            ->getJson('/api/backup-system/oauth/redirect');

        $response->assertStatus(200);
        $url = $response->json('data.auth_url');

        $this->assertStringContainsString('accounts.google.com/o/oauth2/v2/auth', $url);
        $this->assertStringContainsString('access_type=offline', $url);
        $this->assertStringContainsString('prompt=consent', $url);
        $this->assertStringContainsString('state=', $url);
    }

    public function test_aes_256_gcm_encryption_and_tamper_detection(): void
    {
        $service = app(BackupEncryptionService::class);

        $originalPlaintext = "NixaERP-Sensitive-Production-Database-Dump-" . time();
        $encrypted = $service->encryptString($originalPlaintext);

        $this->assertNotEquals($originalPlaintext, $encrypted);

        $decrypted = $service->decryptString($encrypted);
        $this->assertEquals($originalPlaintext, $decrypted);

        // Tamper test: Alter payload ciphertext
        $tampered = $encrypted;
        $decoded = base64_decode($tampered['ciphertext']);
        $tampered['ciphertext'] = base64_encode(substr($decoded, 0, -1) . chr(ord(substr($decoded, -1)) ^ 0xFF));

        $this->expectException(Exception::class);
        $service->decryptString($tampered);
    }

    public function test_retention_service_strictly_preserves_newest_and_only_backup(): void
    {
        // Create an active connection
        $connection = BackupConnection::create([
            'account_email' => 'backup@example.com',
            'access_token' => 'mock_token',
            'refresh_token' => 'mock_refresh',
            'status' => 'connected',
        ]);

        // Create only 1 completed backup
        $run = BackupRun::create([
            'backup_connection_id' => $connection->id,
            'run_code' => 'BKP-TEST-0001',
            'type' => 'daily',
            'status' => 'completed',
            'completed_at' => now()->subDays(60), // Older than 30d
        ]);

        $mockDrive = Mockery::mock(GoogleDriveService::class);
        $retentionService = new BackupRetentionService($mockDrive, app(\App\Services\BackupAuditService::class));

        $result = $retentionService->applyRetention();

        // Must prune 0 backups because count <= min_keep and it is the only backup
        $this->assertEquals(0, $result['pruned_count']);
        $this->assertDatabaseHas('backup_runs', [
            'id' => $run->id,
            'status' => 'completed',
        ]);
    }

    public function test_restore_fails_without_exact_confirmation_phrase(): void
    {
        $connection = BackupConnection::create([
            'account_email' => 'backup@example.com',
            'access_token' => 'mock_token',
            'status' => 'connected',
        ]);

        $run = BackupRun::create([
            'backup_connection_id' => $connection->id,
            'run_code' => 'BKP-CONFIRM-TEST',
            'type' => 'manual',
            'status' => 'completed',
            'completed_at' => now(),
        ]);

        $response = $this->actingAsWithPermissions($this->adminUser, ['system.backups.restore'])
            ->postJson("/api/backup-system/runs/{$run->id}/restore", [
                'confirmation_phrase' => 'RESTORE WRONG_CODE',
            ]);

        $response->assertStatus(422)
            ->assertJsonFragment(['status' => 'error']);
    }

    public function test_cannot_delete_only_existing_backup(): void
    {
        $connection = BackupConnection::create([
            'account_email' => 'backup@example.com',
            'access_token' => 'mock_token',
            'status' => 'connected',
        ]);

        $run = BackupRun::create([
            'backup_connection_id' => $connection->id,
            'run_code' => 'BKP-ONLY-ONE',
            'type' => 'daily',
            'status' => 'completed',
            'completed_at' => now(),
        ]);

        $response = $this->actingAsWithPermissions($this->adminUser, ['system.backups.delete'])
            ->deleteJson("/api/backup-system/runs/{$run->id}");

        $response->assertStatus(422)
            ->assertJsonFragment([
                'status' => 'error',
                'message' => 'Action rejected: Safety invariant prevents deleting the only existing backup point.',
            ]);
    }

    public function test_audit_logs_endpoint_eager_loads_run_code(): void
    {
        $connection = BackupConnection::create([
            'account_email' => 'backup@example.com',
            'access_token' => 'mock_token',
            'status' => 'connected',
        ]);

        $run = BackupRun::create([
            'backup_connection_id' => $connection->id,
            'run_code' => 'BKP-AUDIT-TEST-001',
            'type' => 'manual',
            'status' => 'completed',
            'completed_at' => now(),
        ]);

        \App\Models\BackupAuditLog::create([
            'backup_run_id' => $run->id,
            'action' => 'backup_completed',
            'user_id' => $this->adminUser->id,
            'status' => 'success',
            'details' => ['test' => true],
        ]);

        $response = $this->actingAsWithPermissions($this->adminUser, ['system.backups.view'])
            ->getJson('/api/backup-system/audit-logs');

        $response->assertStatus(200)
            ->assertJsonFragment(['status' => 'success']);

        $logsData = $response->json('data.data');
        $this->assertNotEmpty($logsData);
        $this->assertEquals('BKP-AUDIT-TEST-001', $logsData[0]['backup_run']['run_code']);
    }

    public function test_backup_encryption_service_get_current_key_version(): void
    {
        $service = app(\App\Services\BackupEncryptionService::class);
        $this->assertTrue(method_exists($service, 'getCurrentKeyVersion'));
        $version = $service->getCurrentKeyVersion();
        $this->assertNotEmpty($version);
        $this->assertIsString($version);
    }
}
