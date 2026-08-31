<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SocialAccount;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Laravel\Socialite\Facades\Socialite;

class SocialAuthController extends Controller
{
    /**
     * Return the OAuth redirect URL for the given provider.
     * Uses stateless() to avoid session dependency.
     */
    public function redirectUrl($provider)
    {
        $supported = ['facebook', 'twitter', 'instagram', 'linkedin', 'google'];
        if (!in_array($provider, $supported)) {
            return response()->json(['success' => false, 'message' => 'Unsupported platform'], 400);
        }

        try {
            if ($provider === 'google') {
                $url = Socialite::driver('google')
                    ->scopes(['https://www.googleapis.com/auth/business.manage'])
                    ->stateless()
                    ->redirect()
                    ->getTargetUrl();
            } else {
                $url = Socialite::driver($provider)
                    ->stateless()
                    ->redirect()
                    ->getTargetUrl();
            }

            return response()->json(['success' => true, 'url' => $url]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Unable to generate OAuth URL: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Redirect to OAuth provider (kept for completeness, but frontend now uses redirectUrl).
     */
    public function redirect($provider)
    {
        $supported = ['facebook', 'twitter', 'instagram', 'linkedin', 'google'];
        if (!in_array($provider, $supported)) {
            return response()->json(['success' => false, 'message' => 'Unsupported platform'], 400);
        }

        if ($provider === 'google') {
            return Socialite::driver('google')
                ->scopes(['https://www.googleapis.com/auth/business.manage'])
                ->stateless()
                ->redirect();
        }

        return Socialite::driver($provider)->stateless()->redirect();
    }

    /**
     * Handle OAuth callback from provider.
     * Uses stateless() to avoid session dependency.
     * Assumes single-user system; no user_id is stored.
     */
    public function callback($provider)
    {
        $supported = ['facebook', 'twitter', 'instagram', 'linkedin', 'google'];
        if (!in_array($provider, $supported)) {
            return redirect(env('FRONTEND_URL', 'http://localhost:5173') . '/marketing?error=unsupported_platform');
        }

        try {
            if ($provider === 'google') {
                $socialUser = Socialite::driver('google')
                    ->scopes(['https://www.googleapis.com/auth/business.manage'])
                    ->stateless()
                    ->user();
            } else {
                $socialUser = Socialite::driver($provider)
                    ->stateless()
                    ->user();
            }
        } catch (\Exception $e) {
            return redirect(env('FRONTEND_URL', 'http://localhost:5173') . '/marketing?error=oauth_failed');
        }

        // Save or update the social account (single-user: no user_id)
        SocialAccount::updateOrCreate(
            ['platform' => $provider],
            [
                'account_name' => $socialUser->getName() ?? $socialUser->getNickname(),
                'username' => $socialUser->getNickname(),
                'platform_user_id' => $socialUser->getId(),
                'access_token' => Crypt::encryptString($socialUser->token),
                'refresh_token' => $socialUser->refreshToken ? Crypt::encryptString($socialUser->refreshToken) : null,
                'token_expires_at' => $socialUser->expiresIn ? now()->addSeconds($socialUser->expiresIn) : null,
                'scopes' => json_encode($socialUser->approvedScopes ?? []),
                'status' => 'connected',
            ]
        );

        return redirect(env('FRONTEND_URL', 'http://localhost:5173') . '/marketing?connected=' . $provider);
    }

    /**
     * Disconnect a social account.
     * No user_id, just update by platform.
     */
    public function disconnect($provider)
    {
        SocialAccount::where('platform', $provider)
            ->update(['status' => 'disconnected', 'access_token' => null, 'refresh_token' => null]);

        return response()->json(['success' => true, 'message' => 'Account disconnected']);
    }
}