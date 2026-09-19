<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\TwoFactorChallengeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;

class AuthController extends Controller
{
    /**
     * Precomputed bcrypt hash (cost 12) used purely to equalize response time
     * when the submitted email does not exist, mitigating user enumeration
     * via timing side-channels.
     *
     * Regenerate with:
     *   php artisan tinker --execute="echo Illuminate\Support\Facades\Hash::make(Str::random(40));"
     */
    private const DUMMY_HASH = '$2y$12$abcdefghijklmnopqrstuvabcdefghijklmnopqrstuvwxyz01234';

    public function __construct(
        private readonly TwoFactorChallengeService $challenges,
    ) {
    }

    public function login(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'email' => ['required', 'email', 'max:254'],
            'password' => ['required', 'string', 'max:128'],
        ]);

        if ($validator->fails()) {
            return response()->json(
                ['errors' => $validator->errors()],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $user = User::where('email', $request->email)->first();

        // Always run a bcrypt check to flatten timing between
        // "unknown email" and "wrong password".
        $passwordValid = Hash::check(
            $request->password,
            $user?->password ?? self::DUMMY_HASH,
        );

        if ($user === null || ! $passwordValid) {
            return response()->json(
                ['message' => 'Invalid credentials'],
                Response::HTTP_UNAUTHORIZED,
            );
        }

        // Branch: 2FA-enabled accounts must complete a second step.
        if ($user->hasTwoFactorEnabled()) {
            $challengeToken = $this->challenges->issue($user, $request);

            return response()->json([
                'two_factor_required' => true,
                'challenge_token' => $challengeToken,
                'expires_in' => TwoFactorChallengeService::TTL_SECONDS,
            ]);
        }

        return response()->json($this->issueAccessToken($user));
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()?->currentAccessToken()?->delete();

        return response()->json(['message' => 'Logged out successfully']);
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user()->load('roles');

        return response()->json([
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'location' => $user->location,
            'timezone' => $user->timezone,
            'bio' => $user->bio,
            'avatar_url' => $user->avatar_url,
            'two_factor_enabled' => $user->hasTwoFactorEnabled(),
            'roles' => $user->roles->map(function ($role) {
                return ['id' => $role->id, 'name' => $role->name];
            }),
            'created_at' => $user->created_at,
            'updated_at' => $user->updated_at,
        ]);
    }

    public function profile(Request $request): JsonResponse
    {
        return $this->me($request);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $user = $request->user();

        $validator = Validator::make($request->all(), [
            'name' => ['sometimes', 'string', 'max:255'],
            'email' => ['sometimes', 'email', 'max:255', 'unique:users,email,'.$user->id],
            'phone' => ['sometimes', 'nullable', 'string', 'max:50'],
            'location' => ['sometimes', 'nullable', 'string', 'max:255'],
            'timezone' => ['sometimes', 'nullable', 'string', 'max:64'],
            'bio' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'avatar_url' => ['sometimes', 'nullable', 'url', 'max:2048'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $user->fill($request->only([
            'name',
            'email',
            'phone',
            'location',
            'timezone',
            'bio',
            'avatar_url',
        ]));
        $user->save();

        return response()->json([
            'success' => true,
            'message' => 'Profile updated successfully',
            'data' => $this->me($request)->getData(true),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function issueAccessToken(User $user): array
    {
        $expiresAt = now()->addDays(7);

        // Named ability scope keeps room for future granular tokens.
        $token = $user->createToken('auth-token', ['*'], $expiresAt);

        return [
            'access_token' => $token->plainTextToken,
            'token_type' => 'bearer',
            'expires_at' => $expiresAt->toIso8601String(),
        ];
    }
}