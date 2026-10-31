<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\UserSession;
use App\Services\AuditLogger;
use App\Services\IpSecurityService;
use App\Services\TwoFactorChallengeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

class AuthController extends Controller
{
    private const DUMMY_HASH = '$2y$12$abcdefghijklmnopqrstuvabcdefghijklmnopqrstuvwxyz01234';

    public function __construct(
        private readonly TwoFactorChallengeService $challenges,
        private readonly IpSecurityService $ipSecurity,
    ) {}

    public function login(Request $request): JsonResponse
    {
        $ip = $this->ipSecurity->getClientIp($request);

        // 1. IP Firewall check
        if ($this->ipSecurity->isIpBlocked($ip)) {
            $this->ipSecurity->recordLoginAttempt(
                $ip,
                (string) $request->input('email', 'unknown'),
                'blocked',
                'IP address blocked by firewall',
                null,
                $request
            );

            AuditLogger::log(
                'Authentication',
                'Blocked IP Login Attempt',
                'error',
                "Login blocked from firewalled IP {$ip}",
                'IP',
                $ip,
                null,
                null,
                'Firewall block rule',
                null,
                $request
            );

            return response()->json([
                'message' => 'Access denied. Your IP address is blocked by security firewall rules.',
            ], Response::HTTP_FORBIDDEN);
        }

        $validator = Validator::make($request->all(), [
            'email'    => ['required', 'email', 'max:254'],
            'password' => ['required', 'string', 'max:128'],
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $user = User::where('email', $request->email)->first();

        // 2. Account Ban & Suspension check
        if ($user && $user->isBanned()) {
            $this->ipSecurity->recordLoginAttempt(
                $ip,
                $request->email,
                'blocked',
                'User account is banned or suspended',
                $user,
                $request
            );

            AuditLogger::log(
                'Authentication',
                'Banned User Login Attempt',
                'warning',
                "Banned user {$user->email} attempted login from {$ip}",
                'User',
                $user->id,
                null,
                null,
                $user->banned_reason,
                $user,
                $request
            );

            $reason = $user->banned_reason ? ": {$user->banned_reason}" : '';
            return response()->json([
                'message' => 'Your account has been ' . ($user->status === 'suspended' ? 'suspended' : 'banned') . $reason,
            ], Response::HTTP_FORBIDDEN);
        }

        // 3. Account Brute-Force Lockout check
        if ($user && $user->isLockedOut()) {
            $remaining = now()->diffInMinutes($user->lockout_until);
            $this->ipSecurity->recordLoginAttempt(
                $ip,
                $request->email,
                'locked_out',
                "Account locked out for {$remaining} more minutes",
                $user,
                $request
            );

            return response()->json([
                'message' => "Account is temporarily locked due to multiple failed login attempts. Please try again in {$remaining} minutes.",
            ], Response::HTTP_TOO_MANY_REQUESTS);
        }

        $passwordValid = Hash::check(
            $request->password,
            $user?->password ?? self::DUMMY_HASH,
        );

        if ($user === null || ! $passwordValid) {
            $this->ipSecurity->recordLoginAttempt(
                $ip,
                $request->email,
                'failed',
                'Invalid credentials',
                $user,
                $request
            );

            AuditLogger::log(
                'Authentication',
                'Failed Login',
                'error',
                "Failed login attempt for {$request->email} from IP {$ip}",
                'User',
                $user?->id,
                null,
                null,
                'Invalid credentials',
                $user,
                $request
            );

            return response()->json(['message' => 'Invalid credentials'], Response::HTTP_UNAUTHORIZED);
        }

        if ($user->hasTwoFactorEnabled()) {
            $challengeToken = $this->challenges->issue($user, $request);

            AuditLogger::log(
                'Authentication',
                '2FA Challenge Issued',
                'info',
                "Two-factor challenge issued for {$user->email}",
                'User',
                $user->id,
                null,
                null,
                null,
                $user,
                $request
            );

            return response()->json([
                'two_factor_required' => true,
                'challenge_token'     => $challengeToken,
                'expires_in'          => TwoFactorChallengeService::TTL_SECONDS,
            ]);
        }

        // Eager-load roles (permissions are resolved on demand).
        $user->load('roles');

        $expiresAt = now()->addDays(7);
        $token = $user->createToken('auth-token', ['*'], $expiresAt);

        // Record User Session
        $deviceInfo = $this->ipSecurity->parseUserAgent($request->userAgent());
        $session = UserSession::create([
            'user_id'          => $user->id,
            'sanctum_token_id' => $token->accessToken->id,
            'session_id'       => Str::random(40),
            'ip_address'       => $ip,
            'user_agent'       => mb_substr((string) $request->userAgent(), 0, 1000),
            'device_name'      => $deviceInfo['platform'] . ' (' . $deviceInfo['browser'] . ')',
            'device_type'      => $deviceInfo['device_type'],
            'browser'          => $deviceInfo['browser'],
            'platform'         => $deviceInfo['platform'],
            'location'         => $user->location,
            'last_activity_at' => now(),
            'expires_at'       => $expiresAt,
            'is_active'        => true,
        ]);

        // Record successful login attempt and reset counters
        $this->ipSecurity->recordLoginAttempt(
            $ip,
            $user->email,
            'success',
            null,
            $user,
            $request
        );

        AuditLogger::log(
            'Authentication',
            'Successful Login',
            'success',
            "User {$user->email} successfully authenticated from {$ip}",
            'User',
            $user->id,
            null,
            null,
            null,
            $user,
            $request
        );

        return response()->json([
            'access_token' => $token->plainTextToken,
            'token_type'   => 'bearer',
            'expires_at'   => $expiresAt->toIso8601String(),
            'session_id'   => $session->session_id,
            'user'         => $this->serializeUser($user),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $user = $request->user();
        $tokenId = $user?->currentAccessToken()?->id;

        if ($tokenId) {
            UserSession::where('sanctum_token_id', $tokenId)->update([
                'is_active'         => false,
                'revoked_at'        => now(),
                'revocation_reason' => 'User logged out',
            ]);
        }

        if ($user) {
            AuditLogger::log(
                'Authentication',
                'User Logout',
                'info',
                "User {$user->email} logged out",
                'User',
                $user->id,
                null,
                null,
                null,
                $user,
                $request
            );
        }

        $user?->currentAccessToken()?->delete();
        return response()->json(['message' => 'Logged out successfully']);
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user()->load('roles');
        return response()->json($this->serializeUser($user));
    }

    public function profile(Request $request): JsonResponse
    {
        return $this->me($request);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $user = $request->user();

        $validator = Validator::make($request->all(), [
            'name'       => ['sometimes', 'string', 'max:255'],
            'email'      => ['sometimes', 'email', 'max:255', 'unique:users,email,' . $user->id],
            'phone'      => ['sometimes', 'nullable', 'string', 'max:50'],
            'location'   => ['sometimes', 'nullable', 'string', 'max:255'],
            'timezone'   => ['sometimes', 'nullable', 'string', 'max:64'],
            'bio'        => ['sometimes', 'nullable', 'string', 'max:1000'],
            'avatar_url' => ['sometimes', 'nullable', 'url', 'max:2048'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors'  => $validator->errors(),
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $prev = $user->only(['name', 'email', 'phone', 'location', 'timezone', 'bio', 'avatar_url']);

        $user->fill($request->only([
            'name', 'email', 'phone', 'location', 'timezone', 'bio', 'avatar_url',
        ]));
        $user->save();

        AuditLogger::log(
            'User Management',
            'Update Profile',
            'success',
            "User {$user->name} updated their profile",
            'User',
            $user->id,
            $prev,
            $user->only(['name', 'email', 'phone', 'location', 'timezone', 'bio', 'avatar_url']),
            null,
            $user,
            $request
        );

        return response()->json([
            'success' => true,
            'message' => 'Profile updated successfully',
            'data'    => $this->serializeUser($user->load('roles')),
        ]);
    }

    /* --------------------------------------------------------------------------
     * Password Management
     * -------------------------------------------------------------------------- */

    public function changePassword(Request $request): JsonResponse
    {
        $user = $request->user();

        $validator = Validator::make($request->all(), [
            'current_password' => ['required', 'string'],
            'password'         => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors'  => $validator->errors(),
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        if (!Hash::check($request->current_password, $user->password)) {
            return response()->json([
                'success' => false,
                'message' => 'The provided current password does not match our records.',
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $user->password = Hash::make($request->password);
        $user->save();

        AuditLogger::log(
            'Authentication',
            'Password Change',
            'success',
            "Password changed successfully for user {$user->email}",
            'User',
            $user->id,
            null,
            null,
            null,
            $user,
            $request
        );

        return response()->json([
            'success' => true,
            'message' => 'Password has been updated successfully.',
        ]);
    }

    /* --------------------------------------------------------------------------
     * User Sessions & Connected Device Management
     * -------------------------------------------------------------------------- */

    public function sessions(Request $request): JsonResponse
    {
        $user = $request->user();
        $currentTokenId = $user->currentAccessToken()?->id;

        $sessions = UserSession::where('user_id', $user->id)
            ->orderByDesc('is_active')
            ->orderByDesc('last_activity_at')
            ->limit(30)
            ->get()
            ->map(fn (UserSession $s) => [
                'id'               => $s->id,
                'ip_address'       => $s->ip_address,
                'device_name'      => $s->device_name ?: 'Unknown Device',
                'device_type'      => $s->device_type ?: 'Desktop',
                'browser'          => $s->browser ?: 'Browser',
                'platform'         => $s->platform ?: 'OS',
                'location'         => $s->location,
                'last_activity_at' => $s->last_activity_at?->toISOString(),
                'expires_at'       => $s->expires_at?->toISOString(),
                'is_active'        => $s->is_active,
                'is_current'       => ($currentTokenId && $s->sanctum_token_id === $currentTokenId),
            ]);

        return response()->json([
            'success' => true,
            'data'    => $sessions,
        ]);
    }

    public function terminateSession(Request $request, int $sessionId): JsonResponse
    {
        $user = $request->user();
        $session = UserSession::where('user_id', $user->id)->findOrFail($sessionId);

        $isCurrent = ($user->currentAccessToken()?->id === $session->sanctum_token_id);
        $session->revoke('Terminated by user from active sessions manager');

        AuditLogger::log(
            'Authentication',
            'Session Terminated',
            'info',
            "Session #{$sessionId} terminated by user {$user->email}",
            'UserSession',
            $sessionId,
            null,
            null,
            'User terminated device session',
            $user,
            $request
        );

        return response()->json([
            'success'    => true,
            'message'    => 'Session terminated successfully.',
            'is_current' => $isCurrent,
        ]);
    }

    public function terminateOtherSessions(Request $request): JsonResponse
    {
        $user = $request->user();
        $currentTokenId = $user->currentAccessToken()?->id;

        $otherSessions = UserSession::where('user_id', $user->id)
            ->where('is_active', true)
            ->when($currentTokenId, fn ($q) => $q->where('sanctum_token_id', '!=', $currentTokenId))
            ->get();

        foreach ($otherSessions as $s) {
            $s->revoke('Terminated by user (terminate others)');
        }

        AuditLogger::log(
            'Authentication',
            'Other Sessions Terminated',
            'info',
            "All other sessions terminated for user {$user->email}",
            'User',
            $user->id,
            null,
            null,
            'Terminated all other active sessions',
            $user,
            $request
        );

        return response()->json([
            'success' => true,
            'message' => 'All other sessions have been terminated.',
            'count'   => $otherSessions->count(),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeUser(User $user): array
    {
        // Uses the renamed resolver — NOT `permissions()`.
        $permissions = $user->resolvePermissions();

        return [
            'id'                 => $user->id,
            'name'               => $user->name,
            'email'              => $user->email,
            'phone'              => $user->phone,
            'location'           => $user->location,
            'timezone'           => $user->timezone,
            'bio'                => $user->bio,
            'avatar_url'         => $user->avatar_url,
            'status'             => $user->status ?? 'active',
            'company_id'         => $user->company_id,
            'branch_id'          => $user->branch_id,
            'last_login_at'      => $user->last_login_at?->toISOString(),
            'last_login_ip'      => $user->last_login_ip,
            'two_factor_enabled' => $user->hasTwoFactorEnabled(),

            'roles' => $user->roles->map(fn ($r) => [
                'id'    => $r->id,
                'name'  => $r->name,
                'group' => $r->group,
            ])->values(),

            'permissions' => $permissions->map(fn ($p) => [
                'id'    => $p->id,
                'name'  => $p->name,
                'group' => $p->group,
            ])->values(),

            'role_names'       => $user->roles->pluck('name')->values(),
            'permission_names' => $permissions->pluck('name')->values(),
            'permission_ids'   => $permissions->pluck('id')->values(),

            'created_at' => $user->created_at,
            'updated_at' => $user->updated_at,
        ];
    }
}