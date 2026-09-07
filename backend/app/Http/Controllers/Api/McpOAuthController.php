<?php

namespace App\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class McpOAuthController extends Controller
{
    /**
     * Create a short-lived, one-time MCP authorization assertion
     * for the currently authenticated NixaERP user.
     *
     * IMPORTANT:
     * This endpoint is intentionally protected by auth:sanctum.
     * The MCP server must never receive the user's password.
     */
    public function authorize(Request $request): JsonResponse
    {
        $user = $request->user();

        if (!$user) {
            return response()->json([
                'success' => false,
                'message' => 'Authentication required.',
            ], 401);
        }

        /*
         * Only users with MCP read permission should be allowed.
         */
        if (!$user->tokenCan('mcp:read')) {
            return response()->json([
                'success' => false,
                'message' => 'MCP access is not permitted.',
            ], 403);
        }

        /*
         * Never return a reusable Laravel token here.
         *
         * This value will be used as a one-time assertion
         * by the MCP authorization server.
         */
        $assertion = Str::random(64);

        /*
         * For the first development implementation we return
         * a minimal user context. We will move the assertion
         * into a short-lived server-side store in the next step.
         */
        return response()->json([
            'success' => true,
            'data' => [
                'assertion' => $assertion,

                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                ],

                'scope' => [
                    'mcp:read',
                ],

                'expires_in' => 60,
            ],
        ]);
    }
}