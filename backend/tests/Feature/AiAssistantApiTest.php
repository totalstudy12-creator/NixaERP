<?php

namespace Tests\Feature;

use App\Models\AiProvider;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AiAssistantApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_ai_assistant_insights_return_summary_payload(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/ai/assistant/insights');

        $response->assertOk()
            ->assertJsonStructure([
                'success',
                'data' => [
                    'summary',
                    'low_stock',
                    'recommendations',
                ],
            ])
            ->assertJsonPath('success', true);

        $this->assertIsArray($response->json('data.summary'));
        $this->assertIsArray($response->json('data.low_stock'));
    }

    public function test_ai_assistant_chat_requires_a_message(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/ai/assistant/chat', []);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['message']);
    }

    public function test_ai_assistant_chat_returns_provider_error_when_unconfigured(): void
    {
        $user = User::factory()->create();

        putenv('OPENAI_API_KEY');
        putenv('GEMINI_API_KEY');
        $_ENV['OPENAI_API_KEY'] = null;
        $_ENV['GEMINI_API_KEY'] = null;
        $_SERVER['OPENAI_API_KEY'] = null;
        $_SERVER['GEMINI_API_KEY'] = null;

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/ai/assistant/chat', [
            'message' => 'What were sales today?',
        ]);

        $response->assertStatus(503)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'No AI provider configured. Please configure an AI provider.');
    }

    public function test_ai_provider_list_is_available_to_authenticated_users(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/ai/providers');

        $response->assertOk()
            ->assertJsonStructure([
                'success',
                'data',
            ])
            ->assertJsonPath('success', true);
    }
}
