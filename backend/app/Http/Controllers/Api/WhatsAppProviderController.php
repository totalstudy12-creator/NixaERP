<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\WhatsAppService;
use Illuminate\Http\Request;

class WhatsAppProviderController extends Controller
{
    public function __construct(private readonly WhatsAppService $whatsAppService)
    {
    }

    public function status(Request $request)
    {
        abort_unless($request->user()->hasAnyPermission(['notifications.providers', 'notifications.whatsapp.view']), 403, 'You are not allowed to view WhatsApp provider status.');

        return response()->json([
            'success' => true,
            'data' => $this->whatsAppService->status(),
        ]);
    }

    public function qr(Request $request)
    {
        abort_unless($request->user()->hasAnyPermission(['notifications.providers', 'notifications.whatsapp.view']), 403, 'You are not allowed to view the WhatsApp QR code.');

        $qr = $this->whatsAppService->qr();

        return response()->json([
            'success' => true,
            'data' => ['qr' => $qr],
        ])->header('Cache-Control', 'private, no-store')->header('Pragma', 'no-cache');
    }

    public function connect(Request $request)
    {
        abort_unless($request->user()->hasAnyPermission(['notifications.whatsapp.connect', 'notifications.providers']), 403, 'You are not allowed to connect the WhatsApp provider.');

        return response()->json([
            'success' => true,
            'data' => $this->whatsAppService->connect(),
        ]);
    }

    public function logout(Request $request)
    {
        abort_unless($request->user()->hasAnyPermission(['notifications.whatsapp.logout', 'notifications.providers']), 403, 'You are not allowed to disconnect the WhatsApp provider.');

        return response()->json([
            'success' => true,
            'data' => $this->whatsAppService->logout(),
        ]);
    }

    public function test(Request $request)
    {
        abort_unless($request->user()->hasAnyPermission(['notifications.whatsapp.test', 'notifications.send']), 403, 'You are not allowed to send a WhatsApp test message.');

        $validated = $request->validate([
            'to' => ['required', 'string', 'max:32'],
            'message' => ['required', 'string', 'max:2000'],
        ]);

        $result = $this->whatsAppService->test($validated['to'], $validated['message']);

        if (! $result['success']) {
            return response()->json([
                'success' => false,
                'message' => $result['error'] ?? 'WhatsApp test request failed.',
                'data' => $result,
            ], 422);
        }

        return response()->json([
            'success' => $result['success'],
            'data' => $result,
        ], 200);
    }
}
