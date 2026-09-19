<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use PragmaRX\Google2FA\Google2FA;

class TwoFactorService
{
    public function __construct(private readonly Google2FA $google2fa)
    {
    }

    public function generateSecret(): string
    {
        // 32 base32 chars = 160 bits of entropy.
        return $this->google2fa->generateSecretKey(32);
    }

    public function verifyCode(string $secret, string $code): bool
    {
        // window = 1 → tolerate ±30s clock drift.
        return (bool) $this->google2fa->verifyKey($secret, $code, 1);
    }

    public function otpauthUrl(User $user, string $secret): string
    {
        return $this->google2fa->getQRCodeUrl(
            config('app.name', 'Business OS'),
            $user->email,
            $secret,
        );
    }

    /**
     * @return array<int, string> Plaintext codes — show once, never persist.
     */
    public function generateRecoveryCodes(User $user, int $count = 8): array
    {
        $plain = [];
        $rows = [];
        $now = now();

        for ($i = 0; $i < $count; $i++) {
            $code = $this->randomRecoveryCode();
            $plain[] = $code;
            $rows[] = [
                'user_id' => $user->id,
                'code_hash' => $this->hashRecoveryCode($code),
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        DB::transaction(function () use ($user, $rows) {
            $user->twoFactorRecoveryCodes()->delete();
            DB::table('two_factor_recovery_codes')->insert($rows);
        });

        return $plain;
    }

    public function consumeRecoveryCode(User $user, string $code): bool
    {
        $hash = $this->hashRecoveryCode($code);

        $row = $user->twoFactorRecoveryCodes()
            ->whereNull('used_at')
            ->where('code_hash', $hash)
            ->first();

        if ($row === null) {
            return false;
        }

        $row->forceFill(['used_at' => now()])->save();

        return true;
    }

    /**
     * 4 groups × 5 chars from a 32-char alphabet = 100 bits.
     */
    private function randomRecoveryCode(): string
    {
        $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        $groups = [];

        for ($g = 0; $g < 4; $g++) {
            $group = '';
            for ($i = 0; $i < 5; $i++) {
                $group .= $alphabet[random_int(0, 31)];
            }
            $groups[] = $group;
        }

        return implode('-', $groups);
    }

    private function hashRecoveryCode(string $code): string
    {
        // High-entropy secret → SHA-256 is sufficient and keeps lookup O(1).
        return hash('sha256', $this->normalizeRecoveryCode($code));
    }

    private function normalizeRecoveryCode(string $code): string
    {
        return preg_replace('/[^A-Z0-9]/', '', strtoupper($code)) ?? '';
    }
}