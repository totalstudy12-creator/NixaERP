<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class HealthCronApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_health_cron_endpoint_returns_scheduler_status(): void
    {
        $user = User::create([
            'name' => 'Cron Tester',
            'email' => 'cron@example.com',
            'password' => bcrypt('password123'),
        ]);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/health/cron');

        $response->assertOk()
            ->assertJsonStructure([
                'success',
                'data' => [
                    'status',
                    'schedulerRunning',
                    'totalTasks',
                    'enabledTasks',
                    'failedTasks',
                    'tasks',
                ],
            ]);

        $this->assertIsArray($response->json('data.tasks'));
    }
}
