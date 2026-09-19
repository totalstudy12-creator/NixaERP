<?php

namespace App\Models\Concerns;

use App\Models\TwoFactorRecoveryCode;
use Illuminate\Database\Eloquent\Relations\HasMany;

trait HasTwoFactorAuthentication
{
    public function twoFactorRecoveryCodes(): HasMany
    {
        return $this->hasMany(TwoFactorRecoveryCode::class);
    }

    public function hasTwoFactorEnabled(): bool
    {
        return $this->two_factor_secret !== null
            && $this->two_factor_confirmed_at !== null;
    }

    public function hasPendingTwoFactorSetup(): bool
    {
        return $this->two_factor_secret !== null
            && $this->two_factor_confirmed_at === null;
    }
}