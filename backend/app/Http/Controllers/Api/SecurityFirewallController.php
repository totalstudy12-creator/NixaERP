<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\IpAccessRule;
use App\Models\LoginAttempt;
use App\Models\User;
use App\Models\UserSession;
use App\Services\AuditLogger;
use App\Services\IpSecurityService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Validator;

class SecurityFirewallController extends Controller
{
    public function __construct(
        private readonly IpSecurityService $ipSecurity,
    ) {}

    /**
     * List IP firewall rules with filtering and pagination.
     * GET /api/security/ip-rules
     */
    public function index(Request $request): JsonResponse
    {
        $query = IpAccessRule::with('creator:id,name,email');

        if ($request->filled('type') && in_array($request->type, ['block', 'allow'], true)) {
            $query->where('type', $request->type);
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('ip_address', 'like', "%{$search}%")
                  ->orWhere('reason', 'like', "%{$search}%")
                  ->orWhere('notes', 'like', "%{$search}%");
            });
        }

        if ($request->has('active')) {
            $query->where('is_active', $request->boolean('active'));
        }

        $rules = $query->orderByDesc('created_at')->paginate($request->integer('per_page', 25));

        return response()->json([
            'success' => true,
            'data'    => $rules->items(),
            'meta'    => [
                'current_page' => $rules->currentPage(),
                'last_page'    => $rules->lastPage(),
                'per_page'     => $rules->perPage(),
                'total'        => $rules->total(),
            ],
        ]);
    }

    /**
     * Store a new IP firewall rule (IPv4, IPv6, or CIDR).
     * POST /api/security/ip-rules
     */
    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'ip_address'     => ['required', 'string', 'max:64', function ($attribute, $value, $fail) {
                $ipOrCidr = trim($value);
                if (str_contains($ipOrCidr, '/')) {
                    [$subnet, $mask] = explode('/', $ipOrCidr, 2);
                    $mask = (int) $mask;
                    if (filter_var($subnet, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
                        if ($mask < 0 || $mask > 32) {
                            $fail('The IPv4 CIDR prefix length must be between 0 and 32.');
                        }
                    } elseif (filter_var($subnet, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
                        if ($mask < 0 || $mask > 128) {
                            $fail('The IPv6 CIDR prefix length must be between 0 and 128.');
                        }
                    } else {
                        $fail('The IP or subnet pattern is not a valid IPv4 or IPv6 address.');
                    }
                } else {
                    if (!filter_var($ipOrCidr, FILTER_VALIDATE_IP)) {
                        $fail('The IP address must be a valid IPv4 or IPv6 address.');
                    }
                }
            }],
            'type'           => ['required', 'in:block,allow'],
            'reason'         => ['required', 'string', 'max:255'],
            'notes'          => ['nullable', 'string', 'max:1000'],
            'duration_hours' => ['nullable', 'integer', 'min:1', 'max:8760'], // up to 1 year
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors'  => $validator->errors(),
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $user = $request->user();
        $ip = trim($request->input('ip_address'));
        $type = $request->input('type');
        $expiresAt = $request->filled('duration_hours')
            ? now()->addHours($request->integer('duration_hours'))
            : null;

        // Emergency protection: prevent blocking admin's current IP address!
        $currentIp = $this->ipSecurity->getClientIp($request);
        if ($type === 'block' && $this->ipSecurity->ipMatchesPattern($currentIp, $ip)) {
            return response()->json([
                'success' => false,
                'message' => "Emergency protection: You cannot block your own current administrative IP address ({$currentIp}).",
            ], Response::HTTP_CONFLICT);
        }

        $rule = IpAccessRule::updateOrCreate(
            ['ip_address' => $ip, 'type' => $type],
            [
                'reason'     => $request->input('reason'),
                'notes'      => $request->input('notes'),
                'created_by' => $user?->id,
                'is_active'  => true,
                'expires_at' => $expiresAt,
            ]
        );

        $this->ipSecurity->flushCache();

        AuditLogger::log(
            'Security',
            "Firewall {$type} rule added",
            'success',
            "IP firewall {$type} rule created for {$ip}",
            'IpAccessRule',
            $rule->id,
            null,
            $rule->toArray(),
            $request->input('reason'),
            $user,
            $request
        );

        return response()->json([
            'success' => true,
            'message' => "IP rule for {$ip} saved successfully.",
            'data'    => $rule->load('creator:id,name,email'),
        ], Response::HTTP_CREATED);
    }

    /**
     * Delete an IP firewall rule.
     * DELETE /api/security/ip-rules/{id}
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $rule = IpAccessRule::findOrFail($id);
        $ip = $rule->ip_address;
        $type = $rule->type;
        $rule->delete();

        $this->ipSecurity->flushCache();

        AuditLogger::log(
            'Security',
            "Firewall rule deleted",
            'info',
            "IP {$type} rule for {$ip} was deleted",
            'IpAccessRule',
            $id,
            null,
            null,
            null,
            $request->user(),
            $request
        );

        return response()->json([
            'success' => true,
            'message' => "Rule for {$ip} removed successfully.",
        ]);
    }

    /**
     * List recorded login attempts.
     * GET /api/security/login-attempts
     */
    public function loginAttempts(Request $request): JsonResponse
    {
        $query = LoginAttempt::with('user:id,name,email');

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('ip_address')) {
            $query->where('ip_address', 'like', "%{$request->ip_address}%");
        }

        if ($request->filled('email')) {
            $query->where('email', 'like', "%{$request->email}%");
        }

        if ($request->filled('from')) {
            $query->whereDate('created_at', '>=', $request->from);
        }

        if ($request->filled('to')) {
            $query->whereDate('created_at', '<=', $request->to);
        }

        $attempts = $query->orderByDesc('created_at')->paginate($request->integer('per_page', 30));

        return response()->json([
            'success' => true,
            'data'    => $attempts->items(),
            'meta'    => [
                'current_page' => $attempts->currentPage(),
                'last_page'    => $attempts->lastPage(),
                'per_page'     => $attempts->perPage(),
                'total'        => $attempts->total(),
            ],
        ]);
    }

    /**
     * List all active sessions across users (Admin).
     * GET /api/security/active-sessions
     */
    public function activeSessions(Request $request): JsonResponse
    {
        $query = UserSession::with('user:id,name,email')
            ->where('is_active', true);

        if ($request->filled('user_id')) {
            $query->where('user_id', $request->integer('user_id'));
        }

        if ($request->filled('ip_address')) {
            $query->where('ip_address', 'like', "%{$request->ip_address}%");
        }

        $sessions = $query->orderByDesc('last_activity_at')->paginate($request->integer('per_page', 30));

        return response()->json([
            'success' => true,
            'data'    => $sessions->items(),
            'meta'    => [
                'current_page' => $sessions->currentPage(),
                'last_page'    => $sessions->lastPage(),
                'per_page'     => $sessions->perPage(),
                'total'        => $sessions->total(),
            ],
        ]);
    }

    /**
     * Force terminate a specific user session (Admin).
     * DELETE /api/security/sessions/{id}
     */
    public function terminateAdminSession(Request $request, int $id): JsonResponse
    {
        $session = UserSession::with('user')->findOrFail($id);
        $user = $session->user;

        $session->revoke("Force terminated by administrator {$request->user()->name}");

        AuditLogger::log(
            'Security',
            'Administrative Session Termination',
            'warning',
            "Administrator {$request->user()->email} terminated session #{$id} for user {$user?->email}",
            'UserSession',
            $id,
            null,
            null,
            'Administrator force logout',
            $request->user(),
            $request
        );

        return response()->json([
            'success' => true,
            'message' => 'Session terminated successfully.',
        ]);
    }

    /**
     * Overview metrics for Security & Firewall Dashboard.
     * GET /api/security/dashboard
     */
    public function dashboard(Request $request): JsonResponse
    {
        $today = now()->startOfDay();

        $activeBlockedCount = IpAccessRule::where('type', 'block')
            ->where('is_active', true)
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->count();

        $activeAllowCount = IpAccessRule::where('type', 'allow')
            ->where('is_active', true)
            ->count();

        $activeSessionsCount = UserSession::where('is_active', true)->count();

        $failedLoginsToday = LoginAttempt::where('status', 'failed')
            ->where('created_at', '>=', $today)
            ->count();

        $blockedLoginsToday = LoginAttempt::where('status', 'blocked')
            ->where('created_at', '>=', $today)
            ->count();

        $bannedUsersCount = User::whereIn('status', ['banned', 'suspended'])->count();

        $recentSuspicious = LoginAttempt::whereIn('status', ['blocked', 'locked_out'])
            ->orderByDesc('created_at')
            ->limit(10)
            ->get();

        return response()->json([
            'success' => true,
            'data'    => [
                'blocked_ips_count'     => $activeBlockedCount,
                'allowlisted_ips_count' => $activeAllowCount,
                'active_sessions_count' => $activeSessionsCount,
                'failed_logins_today'   => $failedLoginsToday,
                'blocked_logins_today'  => $blockedLoginsToday,
                'banned_users_count'    => $bannedUsersCount,
                'recent_suspicious'     => $recentSuspicious,
            ],
        ]);
    }
}
