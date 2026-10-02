<?php

namespace Tests\Feature;

use App\Models\Message;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
use Twilio\Security\RequestValidator;

class WhatsAppWebhookAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_webhook_rejects_missing_or_invalid_signatures_before_persisting(): void
    {
        config(['services.twilio.auth_token' => 'webhook-test-secret']);

        $this->postJson('/api/webhooks/whatsapp', [
            'From' => 'whatsapp:+15555550123',
            'Body' => 'Forged message',
            'MessageSid' => 'SM-forged',
        ])->assertForbidden();

        $this->assertDatabaseCount('messages', 0);
    }

    public function test_webhook_accepts_only_a_valid_twilio_signature(): void
    {
        $authToken = 'webhook-test-secret';
        $webhookUrl = 'https://nexa.example.test/api/webhooks/whatsapp';
        $payload = [
            'From' => 'whatsapp:+15555550123',
            'Body' => 'Authenticated message',
            'MessageSid' => 'SM-authenticated',
        ];
        config([
            'services.twilio.auth_token' => $authToken,
            'services.twilio.webhook_url' => $webhookUrl,
        ]);
        $signature = (new RequestValidator($authToken))->computeSignature($webhookUrl, $payload);

        $this->call('POST', '/api/webhooks/whatsapp', $payload, [], [], [
            'HTTP_X_TWILIO_SIGNATURE' => $signature,
        ])->assertOk();

        $this->assertDatabaseHas('messages', [
            'channel' => 'whatsapp',
            'external_id' => 'SM-authenticated',
            'sender' => 'whatsapp:+15555550123',
        ]);
    }
}