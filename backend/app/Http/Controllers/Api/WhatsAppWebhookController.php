<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Message;
use Illuminate\Http\Request;

class WhatsAppWebhookController extends Controller
{
    public function handle(Request $request)
    {
        // Validate Twilio signature (optional but recommended)
        $from = $request->input('From'); // e.g., whatsapp:+1234567890
        $body = $request->input('Body');

        Message::create([
            'channel' => 'whatsapp',
            'sender' => $from,
            'body' => $body,
            'received_at' => now(),
            'metadata' => ['message_sid' => $request->input('MessageSid')],
        ]);

        return response()->json(['status' => 'ok']);
    }
}