<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\Company;
use App\Models\ConnectedApp;
use App\Models\IpAccessRule;
use App\Models\LoginAttempt;
use App\Models\User;
use App\Models\UserSession;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AdminControlCenterController extends Controller
{
    /**
     * Comprehensive Super Admin System Dashboard metrics.
     * GET /api/admin/overview
     */
    public function overview(Request $request): JsonResponse
    {
        $since24h = now()->subHours(24);

        $totalUsers = User::count();
        $activeUsers = User::where('status', 'active')->count();
        $suspendedUsers = User::where('status', 'suspended')->count();
        $bannedUsers = User::where('status', 'banned')->count();

        $activeSessions = UserSession::where('is_active', true)->count();
        $failedLogins24h = LoginAttempt::where('status', 'failed')
            ->where('created_at', '>=', $since24h)
            ->count();
        $blockedAttempts24h = LoginAttempt::where('status', 'blocked')
            ->where('created_at', '>=', $since24h)
            ->count();

        $blockedIps = IpAccessRule::where('type', 'block')
            ->where('is_active', true)
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->count();

        $totalCompanies = Company::count();
        $totalBranches = Branch::count();

        $enabledApps = ConnectedApp::where('is_active', true)->count();
        $totalApps = ConnectedApp::count();

        $recentAudits = AuditLog::orderByDesc('created_at')
            ->limit(10)
            ->get(['id', 'event_id', 'module', 'action', 'status', 'user_name', 'ip_address', 'message', 'created_at']);

        $recentSecurityAlerts = LoginAttempt::whereIn('status', ['blocked', 'locked_out'])
            ->orderByDesc('created_at')
            ->limit(8)
            ->get();

        // System Health
        $dbOk = true;
        try {
            DB::connection()->getPdo();
        } catch (\Throwable $e) {
            $dbOk = false;
        }

        return response()->json([
            'success' => true,
            'data'    => [
                'users' => [
                    'total'     => $totalUsers,
                    'active'    => $activeUsers,
                    'suspended' => $suspendedUsers,
                    'banned'    => $bannedUsers,
                ],
                'security' => [
                    'active_sessions'      => $activeSessions,
                    'failed_logins_24h'    => $failedLogins24h,
                    'blocked_attempts_24h' => $blockedAttempts24h,
                    'blocked_ips_count'    => $blockedIps,
                    'recent_alerts'        => $recentSecurityAlerts,
                ],
                'organization' => [
                    'companies_count' => $totalCompanies,
                    'branches_count'  => $totalBranches,
                ],
                'apps' => [
                    'enabled_count' => $enabledApps,
                    'total_count'   => $totalApps,
                ],
                'audit' => [
                    'recent_logs' => $recentAudits,
                ],
                'system_health' => [
                    'database'       => $dbOk ? 'healthy' : 'disconnected',
                    'php_version'    => PHP_VERSION,
                    'laravel_version'=> app()->version(),
                    'app_env'        => config('app.env'),
                    'server_time'    => now()->toIso8601String(),
                ],
            ],
        ]);
    }
}
