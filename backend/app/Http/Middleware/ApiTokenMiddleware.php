<?php
// app/Http/Middleware/ApiTokenMiddleware.php

namespace App\Http\Middleware;

use App\Models\ApiToken;
use Closure;
use Illuminate\Http\Request;

class ApiTokenMiddleware
{
    public function handle(Request $request, Closure $next)
    {
        $token = $request->bearerToken();

        if (!$token) {
            return response()->json([
                'success' => false,
                'message' => 'API token required. Please provide a valid Bearer token.',
            ], 401);
        }

        $apiToken = ApiToken::where('token', $token)->first();

        if (!$apiToken) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid API token.',
            ], 401);
        }

        if ($apiToken->expires_at && $apiToken->expires_at->isPast()) {
            return response()->json([
                'success' => false,
                'message' => 'API token has expired.',
            ], 401);
        }

        $apiToken->update(['last_used_at' => now()]);

        // Attach token to request for later use
        $request->merge(['api_token_abilities' => $apiToken->abilities]);

        return $next($request);
    }
}