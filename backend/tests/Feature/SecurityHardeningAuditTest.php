<?php

namespace Tests\Feature;

use App\Models\ApiToken;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SecurityHardeningAuditTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
    }

    public function test_upload_rejects_disallowed_and_executable_file_extensions(): void
    {
        $user = $this->createAdminUser('uploader@example.test', ['create uploads']);
        Sanctum::actingAs($user);

        // Disallowed PHP script upload
        $phpFile = UploadedFile::fake()->create('malicious.php', 100, 'application/x-php');
        $res = $this->postJson('/api/uploads', ['file' => $phpFile]);
        $res->assertStatus(422);

        // Disallowed executable upload
        $exeFile = UploadedFile::fake()->create('malicious.exe', 100, 'application/x-msdownload');
        $res = $this->postJson('/api/uploads', ['file' => $exeFile]);
        $res->assertStatus(422);

        // Disallowed HTML upload
        $htmlFile = UploadedFile::fake()->create('index.html', 100, 'text/html');
        $res = $this->postJson('/api/uploads', ['file' => $htmlFile]);
        $res->assertStatus(422);
    }

    public function test_upload_rejects_svg_with_embedded_active_scripts(): void
    {
        $user = $this->createAdminUser('svg-tester@example.test', ['create uploads']);
        Sanctum::actingAs($user);

        $xssSvg = UploadedFile::fake()->createWithContent(
            'attack.svg',
            '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
        );

        $res = $this->postJson('/api/uploads', ['file' => $xssSvg]);
        $res->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    public function test_upload_allows_valid_documents_and_images(): void
    {
        $user = $this->createAdminUser('legit-uploader@example.test', ['create uploads']);
        Sanctum::actingAs($user);

        $validPng = UploadedFile::fake()->image('invoice-receipt.png', 200, 200);
        $res = $this->postJson('/api/uploads', ['file' => $validPng]);

        $res->assertOk()
            ->assertJsonPath('folder', '')
            ->assertJsonStructure(['name', 'path', 'url', 'size']);
    }

    public function test_upload_deletion_rejects_path_traversal(): void
    {
        $user = $this->createAdminUser('deleter@example.test', ['delete upload']);
        Sanctum::actingAs($user);

        // Path traversal attempts
        $res = $this->postJson('/api/uploads/delete', ['path' => '../../.env']);
        $res->assertStatus(422);

        $res = $this->postJson('/api/uploads/delete', ['path' => 'uploads/../../../secret.txt']);
        $res->assertStatus(422);

        $res = $this->postJson('/api/uploads/delete', ['path' => 'private/documents/doc.pdf']);
        $res->assertStatus(422);
    }

    public function test_api_token_generation_hashes_token_in_database(): void
    {
        $user = $this->createAdminUser('token-gen@example.test', ['view settings']);
        Sanctum::actingAs($user);

        $res = $this->postJson('/api/api-tokens/generate', [
            'name' => 'ThirdPartyWarehouseService',
            'abilities' => ['inventory:read'],
        ]);

        $res->assertCreated();
        $plainToken = $res->json('data.token');
        $this->assertNotEmpty($plainToken);

        // Database must store the SHA-256 hash, NOT the raw plain text token
        $expectedHash = hash('sha256', $plainToken);
        $this->assertDatabaseHas('api_tokens', [
            'name' => 'ThirdPartyWarehouseService',
            'token' => $expectedHash,
        ]);
        $this->assertDatabaseMissing('api_tokens', [
            'token' => $plainToken,
        ]);
    }

    private function createAdminUser(string $email, array $permissions = []): User
    {
        $role = Role::create(['name' => 'Security Test Role ' . uniqid()]);
        foreach ($permissions as $p) {
            $perm = \App\Models\Permission::firstOrCreate(['name' => $p]);
            $role->permissions()->attach($perm->id);
        }

        $user = User::create([
            'name' => 'Security Tester',
            'email' => $email,
            'password' => 'secret123',
        ]);
        $user->roles()->attach($role->id);

        return $user;
    }
}
