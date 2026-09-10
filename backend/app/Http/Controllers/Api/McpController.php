<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Laravel\Sanctum\TransientToken;
use Throwable;

class McpController extends Controller
{
    private const MCP_VERSION = '1.0.0';

    private const MCP_MODE = 'read_only';

    private const MCP_ABILITY = 'mcp:read';

    /**
     * GET /api/mcp/status
     */
    public function status(Request $request): JsonResponse
    {
        try {
            if (!$request->user()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Unauthenticated.',
                ], 401);
            }

            return response()->json([
                'success' => true,
                'data' => [
                    'enabled' => true,
                    'authenticated' => true,
                    'mode' => self::MCP_MODE,
                    'version' => self::MCP_VERSION,
                ],
            ]);
        } catch (Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Unable to determine MCP status.',
            ], 500);
        }
    }

    /**
     * GET /api/mcp/context
     *
     * Only a dedicated Sanctum MCP token is accepted.
     */
    public function context(Request $request): JsonResponse
    {
        try {
            $user = $request->user();

            if (!$user) {
                return response()->json([
                    'success' => false,
                    'message' => 'Unauthenticated.',
                ], 401);
            }

            $accessToken = $user->currentAccessToken();

            /*
             * A normal first-party SPA/browser session can authenticate
             * through Sanctum, but it does not represent an MCP token.
             *
             * Reject transient/session authentication here.
             */
            if (
                !$accessToken ||
                $accessToken instanceof TransientToken
            ) {
                return response()->json([
                    'success' => false,
                    'message' =>
                        'A dedicated MCP access token is required.',
                    'error' => 'MCP_TOKEN_REQUIRED',
                ], 403);
            }

            /*
             * Defense-in-depth ability check.
             *
             * The ability must come from the authenticated Sanctum token.
             */
            if (!$user->tokenCan(self::MCP_ABILITY)) {
                return response()->json([
                    'success' => false,
                    'message' =>
                        'MCP access is not authorized.',
                    'error' => 'MISSING_MCP_ABILITY',
                ], 403);
            }

            /*
             * Explicit expiration check.
             *
             * This gives us defense-in-depth even when Sanctum
             * configuration changes in the future.
             */
            if (
                $accessToken->expires_at &&
                $accessToken->expires_at->isPast()
            ) {
                return response()->json([
                    'success' => false,
                    'message' => 'MCP token has expired.',
                    'error' => 'MCP_TOKEN_EXPIRED',
                ], 401);
            }

            return response()->json([
                'success' => true,

                'data' => [
                    'user' => [
                        'id' => $user->id,
                        'name' => $user->name,
                        'email' => $user->email,
                    ],

                    'roles' => $this->getUserRoles($user),

                    'abilities' => [
                        self::MCP_ABILITY,
                    ],

                    'token' => [
                        'id' => $accessToken->id,
                        'name' => $accessToken->name,

                        'expires_at' => $accessToken->expires_at
                            ? $accessToken->expires_at->toISOString()
                            : null,

                        'last_used_at' => $accessToken->last_used_at
                            ? $accessToken->last_used_at->toISOString()
                            : null,

                        'created_at' => $accessToken->created_at
                            ? $accessToken->created_at->toISOString()
                            : null,
                    ],

                    'mcp' => [
                        'enabled' => true,
                        'mode' => self::MCP_MODE,
                        'version' => self::MCP_VERSION,
                        'required_ability' => self::MCP_ABILITY,
                    ],
                ],
            ]);
        } catch (Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Unable to load MCP context.',
            ], 500);
        }
    }

    /**
     * Return safe role information only.
     */
    private function getUserRoles($user): array
    {
        return $user->roles()
            ->select([
                'roles.id',
                'roles.name',
            ])
            ->get()
            ->map(
                static function ($role): array {
                    return [
                        'id' => $role->id,
                        'name' => $role->name,
                    ];
                }
            )
            ->values()
            ->all();
    }
}