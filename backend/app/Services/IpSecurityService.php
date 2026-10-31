<?php

namespace App\Services;

use App\Models\IpAccessRule;
use App\Models\LoginAttempt;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class IpSecurityService
{
    /**
     * Check if the given client IP is currently blocked by firewall rules.
     */
    public function isIpBlocked(string $ip): bool
    {
        // 1. Check if IP is in the allowlist (allowlist always takes precedence)
        if ($this->matchesRuleType($ip, 'allow')) {
            return false;
        }

        // 2. Check if IP matches any active block rule
        return $this->matchesRuleType($ip, 'block');
    }

    /**
     * Check if an IP matches active rules of a given type ('block' or 'allow').
     */
    public function matchesRuleType(string $ip, string $type): bool
    {
        $cacheKey = "ip_rules_{$type}";
        
        $rules = Cache::remember($cacheKey, 60, function () use ($type) {
            return IpAccessRule::query()
                ->where('type', $type)
                ->where('is_active', true)
                ->where(function ($query) {
                    $query->whereNull('expires_at')
                          ->orWhere('expires_at', '>', now());
                })
                ->get(['id', 'ip_address', 'expires_at']);
        });

        foreach ($rules as $rule) {
            if ($this->ipMatchesPattern($ip, $rule->ip_address)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Determine whether an IP address matches a pattern (single IP or CIDR block).
     */
    public function ipMatchesPattern(string $ip, string $pattern): bool
    {
        $pattern = trim($pattern);
        $ip = trim($ip);

        if ($ip === $pattern) {
            return true;
        }

        // Check if pattern contains CIDR mask
        if (str_contains($pattern, '/')) {
            [$subnet, $mask] = explode('/', $pattern, 2);
            $mask = (int) $mask;

            // IPv4 CIDR check
            if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) &&
                filter_var($subnet, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
                if ($mask < 0 || $mask > 32) return false;
                $ipLong = ip2long($ip);
                $subnetLong = ip2long($subnet);
                if ($ipLong === false || $subnetLong === false) return false;
                $netMask = $mask === 0 ? 0 : (~0 << (32 - $mask));
                return ($ipLong & $netMask) === ($subnetLong & $netMask);
            }

            // IPv6 CIDR check
            if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) &&
                filter_var($subnet, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
                if ($mask < 0 || $mask > 128) return false;
                $ipBin = inet_pton($ip);
                $subnetBin = inet_pton($subnet);
                if ($ipBin === false || $subnetBin === false) return false;

                $bytes = (int) ($mask / 8);
                $bits = $mask % 8;

                if (strncmp($ipBin, $subnetBin, $bytes) !== 0) {
                    return false;
                }

                if ($bits > 0) {
                    $ipByte = ord($ipBin[$bytes]);
                    $subByte = ord($subnetBin[$bytes]);
                    $subMask = ~(0xFF >> $bits) & 0xFF;
                    return ($ipByte & $subMask) === ($subByte & $subMask);
                }

                return true;
            }
        }

        return false;
    }

    /**
     * Extract client IP safely respecting trusted proxies.
     */
    public function getClientIp(Request $request): string
    {
        return $request->ip() ?: '127.0.0.1';
    }

    /**
     * Record a login attempt and evaluate brute force / abuse thresholds.
     */
    public function recordLoginAttempt(
        string $ip,
        string $email,
        string $status,
        ?string $failureReason = null,
        ?User $user = null,
        ?Request $request = null
    ): LoginAttempt {
        $userAgent = $request ? (string) $request->userAgent() : null;
        $deviceInfo = $this->parseUserAgent($userAgent);

        $attempt = LoginAttempt::create([
            'user_id' => $user?->id,
            'email' => $email,
            'ip_address' => $ip,
            'user_agent' => $userAgent ? mb_substr($userAgent, 0, 1000) : null,
            'device_type' => $deviceInfo['device_type'],
            'browser' => $deviceInfo['browser'],
            'platform' => $deviceInfo['platform'],
            'location' => $user?->location,
            'status' => $status,
            'failure_reason' => $failureReason,
            'company_id' => $user?->company_id,
            'branch_id' => $user?->branch_id,
        ]);

        if ($status === 'failed') {
            $this->handleFailedAttempt($ip, $email, $user);
        } elseif ($status === 'success' && $user) {
            $this->handleSuccessfulLogin($ip, $user);
        }

        return $attempt;
    }

    /**
     * Increment failure counters and check for temporary lockout or auto-blocking.
     */
    protected function handleFailedAttempt(string $ip, string $email, ?User $user): void
    {
        // 1. User-level lockout tracking
        if ($user) {
            $user->increment('failed_login_count');
            $user->last_failed_login_at = now();

            // Configurable thresholds: default 5 failed attempts -> 15 mins lockout
            $maxUserAttempts = (int) (Setting::where('key', 'security.max_login_attempts')->value('value') ?: 5);
            $lockoutMinutes = (int) (Setting::where('key', 'security.lockout_minutes')->value('value') ?: 15);

            if ($user->failed_login_count >= $maxUserAttempts) {
                // Emergency check: never lock out super admin permanently; temporary lock only
                $user->lockout_until = now()->addMinutes($lockoutMinutes);
            }
            $user->save();
        }

        // 2. IP-level brute force protection
        // Count failed attempts from this IP in last 15 minutes
        $recentFailedCount = LoginAttempt::query()
            ->where('ip_address', $ip)
            ->where('status', 'failed')
            ->where('created_at', '>=', now()->subMinutes(15))
            ->count();

        $ipAbuseThreshold = (int) (Setting::where('key', 'security.ip_abuse_threshold')->value('value') ?: 15);
        $autoBlockEnabled = filter_var(Setting::where('key', 'security.auto_block_abusive_ip')->value('value') ?? true, FILTER_VALIDATE_BOOLEAN);

        if ($autoBlockEnabled && $recentFailedCount >= $ipAbuseThreshold && !$this->matchesRuleType($ip, 'allow')) {
            // Automatically block IP for 2 hours
            $this->blockIp(
                $ip,
                "Automatic block: {$recentFailedCount} failed login attempts in 15 minutes.",
                2,
                null
            );
        }
    }

    /**
     * Reset failure counters on successful login.
     */
    protected function handleSuccessfulLogin(string $ip, User $user): void
    {
        $user->failed_login_count = 0;
        $user->lockout_until = null;
        $user->last_login_at = now();
        $user->last_login_ip = $ip;
        $user->save();
    }

    /**
     * Block an IP address or CIDR range.
     */
    public function blockIp(string $ip, ?string $reason = null, ?int $durationHours = null, ?int $userId = null): IpAccessRule
    {
        $expiresAt = $durationHours ? now()->addHours($durationHours) : null;

        $rule = IpAccessRule::updateOrCreate(
            ['ip_address' => $ip, 'type' => 'block'],
            [
                'reason' => $reason ?? 'Administrative IP block',
                'is_active' => true,
                'expires_at' => $expiresAt,
                'created_by' => $userId,
            ]
        );

        $this->flushCache();
        return $rule;
    }

    /**
     * Unblock an IP address or CIDR range.
     */
    public function unblockIp(string $ip): bool
    {
        $affected = IpAccessRule::where('ip_address', $ip)
            ->where('type', 'block')
            ->delete();

        $this->flushCache();
        return $affected > 0;
    }

    /**
     * Add an IP to the allowlist.
     */
    public function allowlistIp(string $ip, ?string $reason = null, ?int $userId = null): IpAccessRule
    {
        $rule = IpAccessRule::updateOrCreate(
            ['ip_address' => $ip, 'type' => 'allow'],
            [
                'reason' => $reason ?? 'Administrative IP allowlist',
                'is_active' => true,
                'expires_at' => null,
                'created_by' => $userId,
            ]
        );

        $this->flushCache();
        return $rule;
    }

    public function flushCache(): void
    {
        Cache::forget('ip_rules_block');
        Cache::forget('ip_rules_allow');
    }

    /**
     * Simple, fast user-agent parser for device, browser, and platform.
     */
    public function parseUserAgent(?string $ua): array
    {
        if (empty($ua)) {
            return [
                'device_type' => 'Unknown',
                'browser'     => 'Unknown',
                'platform'    => 'Unknown',
            ];
        }

        // Platform
        $platform = 'Unknown';
        if (preg_match('/windows nt/i', $ua)) $platform = 'Windows';
        elseif (preg_match('/macintosh|mac os x/i', $ua)) $platform = 'macOS';
        elseif (preg_match('/android/i', $ua)) $platform = 'Android';
        elseif (preg_match('/iphone|ipad|ipod/i', $ua)) $platform = 'iOS';
        elseif (preg_match('/linux/i', $ua)) $platform = 'Linux';

        // Device Type
        $deviceType = 'Desktop';
        if (preg_match('/mobile/i', $ua)) $deviceType = 'Mobile';
        elseif (preg_match('/tablet|ipad/i', $ua)) $deviceType = 'Tablet';
        elseif (preg_match('/bot|crawl|slurp|spider/i', $ua)) $deviceType = 'Bot';

        // Browser
        $browser = 'Unknown';
        if (preg_match('/edg/i', $ua)) $browser = 'Edge';
        elseif (preg_match('/chrome|crios/i', $ua)) $browser = 'Chrome';
        elseif (preg_match('/firefox|fxios/i', $ua)) $browser = 'Firefox';
        elseif (preg_match('/safari/i', $ua) && !preg_match('/chrome/i', $ua)) $browser = 'Safari';
        elseif (preg_match('/opera|opr/i', $ua)) $browser = 'Opera';

        return [
            'device_type' => $deviceType,
            'browser'     => $browser,
            'platform'    => $platform,
        ];
    }
}
