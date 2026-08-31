<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Message;
use Illuminate\Http\Request;
use Twilio\Rest\Client;

class InboxController extends Controller
{
    public function index()
    {
        $messages = Message::orderByDesc('received_at')->paginate(20);
        return response()->json(['success' => true, 'data' => $messages]);
    }

    public function markAsRead(Message $message)
    {
        $message->update(['is_read' => true]);
        return response()->json(['success' => true]);
    }

    public function sendEmail(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'to' => 'required|email',
            'subject' => 'required|string',
            'body' => 'required|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'errors' => $validator->errors()], 422);
        }

        // Use Laravel Mail facade
        \Mail::raw($request->body, function ($message) use ($request) {
            $message->to($request->to)
                ->subject($request->subject);
        });

        return response()->json(['success' => true]);
    }

    public function sendWhatsApp(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'to' => 'required|string', // e.g., whatsapp:+1234567890
            'body' => 'required|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'errors' => $validator->errors()], 422);
        }

        $twilio = new Client(env('TWILIO_SID'), env('TWILIO_AUTH_TOKEN'));
        $twilio->messages->create(
            $request->to,
            [
                'from' => env('TWILIO_WHATSAPP_FROM'),
                'body' => $request->body,
            ]
        );

        return response()->json(['success' => true]);
    }
}