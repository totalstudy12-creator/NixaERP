<?php

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

        // Dual-lookup: support modern SHA-256 hashed tokens and legacy plain tokens
        $hashed = hash('sha256', $token);
        $apiToken = ApiToken::where('token', $hashed)->orWhere('token', $token)->first();

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

        // Attach token abilities to request for authorization gates
        $request->merge(['api_token_abilities' => $apiToken->abilities]);

        return $next($request);
    }
}
