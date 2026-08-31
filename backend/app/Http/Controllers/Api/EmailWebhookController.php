<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

class EmailWebhookController extends Controller
{
    /**
     * Handle incoming email webhook.
     */
    public function handle(Request $request)
    {
        try {
            // Process email webhook
            $payload = $request->all();
            
            // Log the webhook for debugging
            \Log::info('Email webhook received', $payload);
            
            return response()->json([
                'success' => true,
                'message' => 'Email webhook processed successfully',
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to process email webhook',
                'error' => $e->getMessage(),
            ], 500);
        }
    }
}