<?php

namespace App\Services;

use App\Models\TwoFactorChallenge;
use App\Models\User;
use Illuminate\Http\Request;

class TwoFactorChallengeService
{
    public const TTL_SECONDS = 300;
    public const MAX_ATTEMPTS = 5;

    public function issue(User $user, Request $request): string
    {
        // Any outstanding challenge for this user becomes unusable.
        TwoFactorChallenge::query()
            ->where('user_id', $user->id)
            ->whereNull('consumed_at')
            ->update(['consumed_at' => now()]);

        $plain = bin2hex(random_bytes(32)); // 256 bits

        TwoFactorChallenge::create([
            'user_id' => $user->id,
            'token_hash' => hash('sha256', $plain),
            'ip_address' => $request->ip(),
            'user_agent' => mb_substr((string) $request->userAgent(), 0, 512),
            'expires_at' => now()->addSeconds(self::TTL_SECONDS),
        ]);

        return $plain;
    }

    public function resolve(string $plainToken): ?TwoFactorChallenge
    {
        return TwoFactorChallenge::query()
            ->where('token_hash', hash('sha256', $plainToken))
            ->first();
    }
}