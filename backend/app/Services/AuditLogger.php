<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class AuditLogger
{
    private const SENSITIVE_KEYS = [
        'password',
        'password_confirmation',
        'current_password',
        'token',
        'access_token',
        'plainTextToken',
        'api_key',
        'secret',
        'two_factor_secret',
        'otp',
        'recovery_code',
        'card_number',
        'cvv',
        'pin',
    ];

    /**
     * Record an audit event with sanitized values and request context.
     */
    public static function log(
        string $module,
        string $action,
        string $status = 'success',
        string $message = '',
        ?string $resourceType = null,
        string|int|null $resourceId = null,
        ?array $previousValues = null,
        ?array $changedValues = null,
        ?string $reason = null,
        ?User $actor = null,
        ?Request $request = null
    ): AuditLog {
        $req = $request ?? (app()->bound('request') ? request() : null);
        $user = $actor ?? ($req?->user() instanceof User ? $req->user() : null);

        $ipAddress = $req?->ip() ?? '127.0.0.1';
        $userAgent = $req ? (string) $req->userAgent() : null;
        $requestId = $req?->header('X-Request-Id') ?? (string) Str::uuid();

        return AuditLog::create([
            'event_id'        => (string) Str::uuid(),
            'user_id'         => $user?->id,
            'user_name'       => $user?->name,
            'user_email'      => $user?->email,
            'company_id'      => $user?->company_id,
            'branch_id'       => $user?->branch_id,
            'module'          => $module,
            'action'          => $action,
            'status'          => $status,
            'message'         => $message ?: "{$action} in {$module}",
            'resource_type'   => $resourceType,
            'resource_id'     => $resourceId !== null ? (string) $resourceId : null,
            'previous_values' => $previousValues ? self::maskSensitiveData($previousValues) : null,
            'changed_values'  => $changedValues ? self::maskSensitiveData($changedValues) : null,
            'ip_address'      => $ipAddress,
            'user_agent'      => $userAgent ? mb_substr($userAgent, 0, 1000) : null,
            'request_id'      => $requestId,
            'reason'          => $reason,
        ]);
    }

    /**
     * Recursively mask sensitive fields (passwords, tokens, keys) in data arrays.
     */
    public static function maskSensitiveData(array $data): array
    {
        $sanitized = [];

        foreach ($data as $key => $value) {
            $lowerKey = strtolower((string) $key);
            $isSensitive = false;

            foreach (self::SENSITIVE_KEYS as $sensitive) {
                if (str_contains($lowerKey, $sensitive)) {
                    $isSensitive = true;
                    break;
                }
            }

            if ($isSensitive) {
                $sanitized[$key] = '********';
            } elseif (is_array($value)) {
                $sanitized[$key] = self::maskSensitiveData($value);
            } else {
                $sanitized[$key] = $value;
            }
        }

        return $sanitized;
    }
}
