<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\TwoFactorChallengeService;
use App\Services\TwoFactorService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class TwoFactorController extends Controller
{
    public function __construct(
        private readonly TwoFactorService $twoFactor,
        private readonly TwoFactorChallengeService $challenges,
    ) {
    }

    /**
     * Step 2 of login. No auth middleware — the challenge token is the credential.
     */
    public function verify(Request $request): JsonResponse
    {
        $data = $request->validate([
            'challenge_token' => ['required', 'string', 'size:64'],
            'code' => ['required', 'string', 'max:32'],
        ]);

        $challenge = $this->challenges->resolve($data['challenge_token']);

        if ($challenge === null || $challenge->isConsumed() || $challenge->isExpired()) {
            return response()->json(
                ['message' => 'Challenge expired or invalid. Please sign in again.'],
                Response::HTTP_UNAUTHORIZED,
            );
        }

        if ($challenge->attempts >= TwoFactorChallengeService::MAX_ATTEMPTS) {
            $challenge->forceFill(['consumed_at' => now()])->save();

            return response()->json(
                ['message' => 'Too many attempts. Please sign in again.'],
                Response::HTTP_TOO_MANY_REQUESTS,
            );
        }

        $challenge->increment('attempts');

        $user = $challenge->user;
        $code = preg_replace('/\s+/', '', $data['code']) ?? '';
        $usedRecoveryCode = false;
        $verified = false;

        if (preg_match('/^\d{6}$/', $code) === 1) {
            $verified = $this->twoFactor->verifyCode($user->two_factor_secret, $code);
        } else {
            $verified = $this->twoFactor->consumeRecoveryCode($user, $code);
            $usedRecoveryCode = $verified;
        }

        if (! $verified) {
            return response()->json(
                ['message' => 'Invalid verification code.'],
                Response::HTTP_UNAUTHORIZED,
            );
        }

        $challenge->forceFill(['consumed_at' => now()])->save();

        $expiresAt = now()->addDays(7);
        $token = $user->createToken('auth-token', ['*'], $expiresAt);

        return response()->json([
            'access_token' => $token->plainTextToken,
            'token_type' => 'bearer',
            'expires_at' => $expiresAt->toIso8601String(),
            'recovery_code_used' => $usedRecoveryCode,
        ]);
    }

    public function status(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'enabled' => $user->hasTwoFactorEnabled(),
            'pending' => $user->hasPendingTwoFactorSetup(),
            'confirmed_at' => $user->two_factor_confirmed_at,
            'recovery_codes_remaining' => $user->hasTwoFactorEnabled()
                ? $user->twoFactorRecoveryCodes()->whereNull('used_at')->count()
                : 0,
        ]);
    }

    public function enable(Request $request): JsonResponse
    {
        $request->validate(['password' => ['required', 'string']]);
        $user = $request->user();

        if (! Hash::check($request->password, $user->password)) {
            return response()->json(['message' => 'Password is incorrect.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        if ($user->hasTwoFactorEnabled()) {
            return response()->json(['message' => 'Two-factor authentication is already enabled.'], Response::HTTP_CONFLICT);
        }

        $secret = $this->twoFactor->generateSecret();

        $user->forceFill([
            'two_factor_secret' => $secret,
            'two_factor_confirmed_at' => null,
        ])->save();

        return response()->json([
            'secret' => $secret,
            'otpauth_url' => $this->twoFactor->otpauthUrl($user, $secret),
        ]);
    }

    public function confirm(Request $request): JsonResponse
    {
        $request->validate(['code' => ['required', 'string', 'max:16']]);
        $user = $request->user();

        if (! $user->hasPendingTwoFactorSetup()) {
            return response()->json(['message' => 'No pending two-factor setup.'], Response::HTTP_CONFLICT);
        }

        $code = preg_replace('/\s+/', '', $request->code) ?? '';

        if (! $this->twoFactor->verifyCode($user->two_factor_secret, $code)) {
            return response()->json(['message' => 'Invalid verification code.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $user->forceFill(['two_factor_confirmed_at' => now()])->save();
        $recoveryCodes = $this->twoFactor->generateRecoveryCodes($user);

        return response()->json([
            'message' => 'Two-factor authentication enabled.',
            'recovery_codes' => $recoveryCodes,
        ]);
    }

    public function disable(Request $request): JsonResponse
    {
        $request->validate([
            'password' => ['required', 'string'],
            'code' => ['required', 'string', 'max:32'],
        ]);

        $user = $request->user();

        if (! Hash::check($request->password, $user->password)) {
            return response()->json(['message' => 'Password is incorrect.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        if (! $user->hasTwoFactorEnabled()) {
            return response()->json(['message' => 'Two-factor authentication is not enabled.'], Response::HTTP_CONFLICT);
        }

        $code = preg_replace('/\s+/', '', $request->code) ?? '';

        $verified = preg_match('/^\d{6}$/', $code) === 1
            ? $this->twoFactor->verifyCode($user->two_factor_secret, $code)
            : $this->twoFactor->consumeRecoveryCode($user, $code);

        if (! $verified) {
            return response()->json(['message' => 'Invalid verification code.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        DB::transaction(function () use ($user) {
            $user->twoFactorRecoveryCodes()->delete();
            $user->forceFill([
                'two_factor_secret' => null,
                'two_factor_confirmed_at' => null,
            ])->save();

            // Revoke all sessions: a disabled 2FA should not keep old tokens alive.
            $user->tokens()->delete();
        });

        return response()->json(['message' => 'Two-factor authentication disabled.']);
    }

    public function regenerateRecoveryCodes(Request $request): JsonResponse
    {
        $request->validate(['password' => ['required', 'string']]);
        $user = $request->user();

        if (! Hash::check($request->password, $user->password)) {
            return response()->json(['message' => 'Password is incorrect.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        if (! $user->hasTwoFactorEnabled()) {
            return response()->json(['message' => 'Two-factor authentication is not enabled.'], Response::HTTP_CONFLICT);
        }

        return response()->json([
            'recovery_codes' => $this->twoFactor->generateRecoveryCodes($user),
        ]);
    }
}