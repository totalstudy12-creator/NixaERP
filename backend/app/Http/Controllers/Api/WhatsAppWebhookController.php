<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Message;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Twilio\Security\RequestValidator;

class WhatsAppWebhookController extends Controller
{
    public function handle(Request $request)
    {
        $authToken = config('services.twilio.auth_token');
        if (! is_string($authToken) || $authToken === '') {
            Log::error('WhatsApp webhook rejected because signature validation is not configured.');
            return response()->json(['message' => 'Webhook is not configured.'], 503);
        }

        $signature = (string) $request->header('X-Twilio-Signature', '');
        $webhookUrl = config('services.twilio.webhook_url') ?: $request->fullUrl();
        $validator = new RequestValidator($authToken);

        if ($signature === '' || ! $validator->validate($signature, $webhookUrl, $request->all())) {
            Log::warning('Rejected WhatsApp webhook with an invalid signature.', ['ip' => $request->ip()]);
            return response()->json(['message' => 'Invalid webhook signature.'], 403);
        }

        $validated = $request->validate([
            'From' => ['required', 'string', 'max:64'],
            'Body' => ['required', 'string', 'max:65535'],
            'MessageSid' => ['required', 'string', 'max:64'],
        ]);

        Message::create([
            'channel' => 'whatsapp',
            'external_id' => $validated['MessageSid'],
            'sender' => $validated['From'],
            'body' => $validated['Body'],
            'received_at' => now(),
            'metadata' => ['message_sid' => $validated['MessageSid']],
        ]);

        return response()->json(['status' => 'ok']);
    }
}