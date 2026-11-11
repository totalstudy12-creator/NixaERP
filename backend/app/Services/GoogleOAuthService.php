<?php

namespace App\Services;

use App\Models\BackupConnection;
use App\Models\BackupAuditLog;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use RuntimeException;

class GoogleOAuthService
{
    private const OAUTH_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
    private const OAUTH_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
    private const OAUTH_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
    private const USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v2/userinfo';

    public const SCOPE_DRIVE_FILE = 'https://www.googleapis.com/auth/drive.file';
    public const SCOPE_USERINFO_EMAIL = 'https://www.googleapis.com/auth/userinfo.email';
    public const SCOPE_USERINFO_PROFILE = 'https://www.googleapis.com/auth/userinfo.profile';

    /**
     * Generate secure authorization URL with cryptographically random state.
     */
    public function getAuthorizationUrl(?int $userId = null): string
    {
        $userId = $userId ?? \Illuminate\Support\Facades\Auth::id() ?? 1;
        $clientId = config('services.google_drive.client_id');
        $redirectUri = config('services.google_drive.redirect_uri');

        if (empty($clientId) || empty(config('services.google_drive.client_secret'))) {
            throw new RuntimeException('Google Drive OAuth credentials are not configured in environment (GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET).');
        }

        // Generate 64-char random state tied to user
        $state = Str::random(64);
        Cache::put("gdrive_oauth_state:{$state}", [
            'user_id' => $userId,
            'created_at' => now()->timestamp,
        ], now()->addMinutes(15));

        $params = [
            'client_id' => $clientId,
            'redirect_uri' => $redirectUri,
            'response_type' => 'code',
            'scope' => implode(' ', [
                self::SCOPE_DRIVE_FILE,
                self::SCOPE_USERINFO_EMAIL,
                self::SCOPE_USERINFO_PROFILE,
            ]),
            'access_type' => 'offline',
            'prompt' => 'consent select_account',
            'include_granted_scopes' => 'true',
            'state' => $state,
        ];

        return self::OAUTH_AUTH_ENDPOINT . '?' . http_build_query($params);
    }

    /**
     * Exchange authorization code for tokens and update BackupConnection.
     */
    public function handleCallback(string $code, string $state): BackupConnection
    {
        $cachedState = Cache::pull("gdrive_oauth_state:{$state}");
        if (!$cachedState || empty($cachedState['user_id'])) {
            throw new RuntimeException('Invalid or expired OAuth state token. Please restart the authorization process.');
        }

        $clientId = config('services.google_drive.client_id');
        $clientSecret = config('services.google_drive.client_secret');
        $redirectUri = config('services.google_drive.redirect_uri');

        $response = Http::asForm()->post(self::OAUTH_TOKEN_ENDPOINT, [
            'code' => $code,
            'client_id' => $clientId,
            'client_secret' => $clientSecret,
            'redirect_uri' => $redirectUri,
            'grant_type' => 'authorization_code',
        ]);

        if (!$response->successful()) {
            $errorMsg = $response->json('error_description') ?? $response->json('error') ?? 'OAuth token exchange failed.';
            Log::error('[GoogleOAuthService] Token exchange failed', ['status' => $response->status(), 'body' => $response->json()]);
            throw new RuntimeException("Google OAuth error: {$errorMsg}");
        }

        $tokenData = $response->json();
        $accessToken = $tokenData['access_token'] ?? null;
        $newRefreshToken = $tokenData['refresh_token'] ?? null;
        $expiresIn = (int) ($tokenData['expires_in'] ?? 3600);
        $expiresAt = now()->addSeconds($expiresIn);

        if (empty($accessToken)) {
            throw new RuntimeException('Google did not return an access token.');
        }

        // Fetch user profile info (email and display name)
        $userResponse = Http::withToken($accessToken)->get(self::USERINFO_ENDPOINT);
        $email = $userResponse->successful() ? $userResponse->json('email') : null;
        $name = $userResponse->successful() ? $userResponse->json('name') : null;

        $connection = BackupConnection::where('provider', 'google_drive')->first();
        if (!$connection) {
            $connection = new BackupConnection();
            $connection->provider = 'google_drive';
        }

        // CRITICAL: Preserve existing refresh token if Google does not return one on re-auth
        $finalRefreshToken = $newRefreshToken ?: $connection->refresh_token;

        $connection->account_email = $email ?: $connection->account_email;
        $connection->account_name = $name ?: $connection->account_name;
        $connection->access_token = $accessToken;
        if ($finalRefreshToken) {
            $connection->refresh_token = $finalRefreshToken;
        }
        $connection->token_expires_at = $expiresAt;
        $connection->is_active = true;
        $connection->last_authorized_at = now();
        $connection->last_error = null;
        $connection->scopes = explode(' ', $tokenData['scope'] ?? '');
        $connection->save();

        // Audit log
        BackupAuditLog::create([
            'action' => 'google_drive_connected',
            'user_id' => $cachedState['user_id'],
            'ip_address' => request()->ip(),
            'user_agent' => request()->userAgent(),
            'result' => 'success',
            'details' => [
                'email' => $connection->account_email,
                'name' => $connection->account_name,
                'has_refresh_token' => !empty($connection->refresh_token),
            ],
            'created_at' => now(),
        ]);

        return $connection;
    }

    /**
     * Retrieve a valid access token, automatically refreshing if expired.
     */
    public function getValidAccessToken(BackupConnection $connection): string
    {
        if (!$connection->is_active) {
            throw new RuntimeException('Google Drive backup connection is inactive or disconnected.');
        }

        if (!$connection->isExpired() && !empty($connection->access_token)) {
            return $connection->access_token;
        }

        return $this->refreshAccessToken($connection);
    }

    /**
     * Refresh access token using refresh_token.
     */
    public function refreshAccessToken(BackupConnection $connection): string
    {
        if (empty($connection->refresh_token)) {
            $connection->is_active = false;
            $connection->last_error = 'No refresh token available. Reconnection required.';
            $connection->save();
            throw new RuntimeException('Google Drive connection requires re-authorization (refresh token missing).');
        }

        $clientId = config('services.google_drive.client_id');
        $clientSecret = config('services.google_drive.client_secret');

        $response = Http::asForm()->post(self::OAUTH_TOKEN_ENDPOINT, [
            'refresh_token' => $connection->refresh_token,
            'client_id' => $clientId,
            'client_secret' => $clientSecret,
            'grant_type' => 'refresh_token',
        ]);

        if (!$response->successful()) {
            $error = $response->json('error') ?? 'Token refresh failed';
            $errorDesc = $response->json('error_description') ?? '';

            if (in_array($error, ['invalid_grant', 'unauthorized_client'], true)) {
                $connection->is_active = false;
                $connection->last_error = "Authorization revoked by user or expired ({$error}): {$errorDesc}";
                $connection->save();
            }

            Log::error('[GoogleOAuthService] Token refresh failed', ['status' => $response->status(), 'response' => $response->json()]);
            throw new RuntimeException("Failed to refresh Google Drive access token: {$error} {$errorDesc}");
        }

        $data = $response->json();
        $accessToken = $data['access_token'];
        $expiresIn = (int) ($data['expires_in'] ?? 3600);

        $connection->access_token = $accessToken;
        $connection->token_expires_at = now()->addSeconds($expiresIn);
        // Sometimes Google returns an updated refresh token
        if (!empty($data['refresh_token'])) {
            $connection->refresh_token = $data['refresh_token'];
        }
        $connection->last_error = null;
        $connection->save();

        return $accessToken;
    }

    /**
     * Disconnect Google Drive. Revokes token with Google and deactivates connection.
     * Note: Existing backups are never deleted on disconnect.
     */
    public function disconnect(?int $userId = null): void
    {
        $connection = BackupConnection::where('provider', 'google_drive')->first();
        if (!$connection) {
            return;
        }

        $tokenToRevoke = $connection->refresh_token ?: $connection->access_token;
        if ($tokenToRevoke) {
            try {
                Http::asForm()->post(self::OAUTH_REVOKE_ENDPOINT, [
                    'token' => $tokenToRevoke,
                ]);
            } catch (\Throwable $e) {
                Log::warning('[GoogleOAuthService] Token revocation failed during disconnect', ['error' => $e->getMessage()]);
            }
        }

        $connection->is_active = false;
        $connection->access_token = null;
        $connection->refresh_token = null;
        $connection->token_expires_at = null;
        $connection->last_error = 'Disconnected by administrator.';
        $connection->save();

        BackupAuditLog::create([
            'action' => 'google_drive_disconnected',
            'user_id' => $userId,
            'ip_address' => request()->ip(),
            'user_agent' => request()->userAgent(),
            'result' => 'success',
            'details' => ['email' => $connection->account_email],
            'created_at' => now(),
        ]);
    }
}
