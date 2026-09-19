<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->registerRateLimiters();
        $this->registerSchedules();
    }

    /**
     * Rate limiters used by routes/api.php.
     *
     *  - login          → POST /auth/login, POST /login
     *  - 2fa-verify     → POST /auth/2fa/verify
     *  - 2fa-sensitive  → POST /auth/2fa/{enable,confirm,disable,recovery-codes}
     */
    private function registerRateLimiters(): void
    {
        /*
         * Password login.
         *
         * Two layered limits:
         *   1. Per-email+IP   → blocks credential stuffing on one account.
         *   2. Per-IP          → blocks a single host spraying many accounts.
         *
         * Keys are normalized (lowercased email) so "Foo@x.com" and "foo@x.com"
         * share the same bucket and cannot bypass the limit by changing case.
         */
        RateLimiter::for('login', function (Request $request) {
            $email = Str::lower((string) $request->input('email'));

            return [
                Limit::perMinute(5)->by($email.'|'.$request->ip()),
                Limit::perMinute(20)->by($request->ip()),
            ];
        });

        /*
         * TOTP / recovery-code verification (second login step).
         *
         * Per-IP limit blocks distributed guessing against the challenge
         * endpoint; per-challenge limit blocks guessing on a single issued
         * challenge token.
         */
        RateLimiter::for('2fa-verify', function (Request $request) {
            return [
                Limit::perMinute(10)->by($request->ip()),
                Limit::perMinute(5)->by((string) $request->input('challenge_token')),
            ];
        });

        /*
         * Authenticated, high-risk 2FA mutations
         * (enable / confirm / disable / regenerate recovery codes).
         *
         * These already require a valid Sanctum token and password
         * re-confirmation, so a modest per-user limit is sufficient.
         */
        RateLimiter::for('2fa-sensitive', function (Request $request) {
            $key = $request->user()?->getAuthIdentifier() ?? $request->ip();

            return Limit::perMinute(6)->by((string) $key);
        });
    }

    /**
     * Scheduled console commands.
     */
    private function registerSchedules(): void
    {
        $schedule = $this->app->make(Schedule::class);

        $schedule
            ->command('attendance:mark-absent')
            ->dailyAt('00:30')
            ->name('mark-absent-attendance')
            ->withoutOverlapping();

        $schedule
            ->command('devices:mark-offline')
            ->everyFifteenMinutes()
            ->name('mark-offline-devices')
            ->withoutOverlapping();
    }
}