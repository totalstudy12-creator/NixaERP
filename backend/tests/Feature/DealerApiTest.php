<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DealerApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_create_a_dealer(): void
    {
        $user = User::factory()->create();
        $company = Company::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/dealers', [
            'company_id' => $company->id,
            'name' => 'ABC Traders',
            'code' => 'ABC001',
            'contact_person' => 'John Doe',
            'email' => 'dealer@example.com',
            'phone' => '1234567890',
            'territory' => 'North',
            'zone' => 'Zone A',
            'credit_limit' => 25000.50,
            'commission_rate' => 5.5,
        ]);

        $response->assertCreated();
        $response->assertJsonPath('name', 'ABC Traders');
        $this->assertDatabaseHas('dealers', ['code' => 'ABC001']);
    }
}
