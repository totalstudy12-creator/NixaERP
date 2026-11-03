<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ConnectedApp;
use App\Models\User;
use App\Models\UserSession;
use App\Services\AuditLogger;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;

class ConnectedAppController extends Controller
{
    /**
     * Display a listing of connected applications.
     * GET /api/connected-apps
     */
    public function index(Request $request)
    {
        $query = ConnectedApp::query();

        if ($request->filled('search')) {
            $search = $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('app_identifier', 'like', "%{$search}%")
                  ->orWhere('description', 'like', "%{$search}%");
            });
        }

        if ($request->filled('category') && $request->input('category') !== 'all') {
            $query->where('category', $request->input('category'));
        }

        $apps = $query->orderBy('name')->get();

        return response()->json([
            'success' => true,
            'data' => $apps,
            'total' => $apps->count(),
        ]);
    }

    /**
     * Store a newly created connected application.
     * POST /api/connected-apps
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:120',
            'app_identifier' => 'required|string|max:80|unique:connected_apps,app_identifier|regex:/^[a-z0-9_]+$/',
            'description' => 'nullable|string|max:1000',
            'category' => 'required|string|in:wms,ai_agent,billing,custom',
            'platform' => 'nullable|string|max:50',
            'current_version' => 'required|string|max:30',
            'min_supported_version' => 'required|string|max:30',
            'force_update' => 'boolean',
            'apk_download_url' => 'nullable|url|max:500',
            'release_notes' => 'nullable|string|max:2000',
            'is_active' => 'boolean',
            'maintenance_mode' => 'boolean',
            'maintenance_message' => 'nullable|string|max:500',
            'allowed_roles' => 'nullable|array',
            'allowed_roles.*' => 'string|max:60',
            'settings' => 'nullable|array',
        ]);

        $prefix = preg_replace('/[^a-z0-9]/', '', strtolower($validated['app_identifier']));
        $validated['api_key'] = ConnectedApp::generateApiKey($prefix ?: 'app');
        $validated['last_sync_at'] = now();

        $app = ConnectedApp::create($validated);

        Log::info("ConnectedApp registered: {$app->name} ({$app->app_identifier}) by user " . (auth()->id() ?? 'system'));

        return response()->json([
            'success' => true,
            'message' => 'Application created successfully.',
            'data' => $app,
        ], 201);
    }

    /**
     * Display the specified application.
     * GET /api/connected-apps/{app}
     */
    public function show(ConnectedApp $app)
    {
        return response()->json([
            'success' => true,
            'data' => $app,
        ]);
    }

    /**
     * Update the specified application.
     * PUT /api/connected-apps/{app}
     */
    public function update(Request $request, ConnectedApp $app)
    {
        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:120',
            'app_identifier' => [
                'sometimes',
                'required',
                'string',
                'max:80',
                Rule::unique('connected_apps')->ignore($app->id),
                'regex:/^[a-z0-9_]+$/'
            ],
            'description' => 'nullable|string|max:1000',
            'category' => 'sometimes|required|string|in:wms,ai_agent,billing,custom',
            'platform' => 'nullable|string|max:50',
            'current_version' => 'sometimes|required|string|max:30',
            'min_supported_version' => 'sometimes|required|string|max:30',
            'force_update' => 'boolean',
            'apk_download_url' => 'nullable|url|max:500',
            'release_notes' => 'nullable|string|max:2000',
            'is_active' => 'boolean',
            'maintenance_mode' => 'boolean',
            'maintenance_message' => 'nullable|string|max:500',
            'allowed_roles' => 'nullable|array',
            'allowed_roles.*' => 'string|max:60',
            'settings' => 'nullable|array',
        ]);

        $app->update($validated);

        return response()->json([
            'success' => true,
            'message' => 'Application updated successfully.',
            'data' => $app,
        ]);
    }

    /**
     * Remove the specified application.
     * DELETE /api/connected-apps/{app}
     */
    public function destroy(ConnectedApp $app)
    {
        $name = $app->name;
        $app->delete();

        return response()->json([
            'success' => true,
            'message' => "Application '{$name}' deleted successfully.",
        ]);
    }

    /**
     * Regenerate secure API key for the application.
     * POST /api/connected-apps/{app}/regenerate-token
     */
    public function regenerateToken(ConnectedApp $app)
    {
        $prefix = preg_replace('/[^a-z0-9]/', '', strtolower($app->app_identifier));
        $app->api_key = ConnectedApp::generateApiKey($prefix ?: 'app');
        $app->save();

        Log::info("Regenerated API key for ConnectedApp: {$app->name} ({$app->id})");

        return response()->json([
            'success' => true,
            'message' => 'API Token regenerated successfully.',
            'api_key' => $app->api_key,
            'data' => $app,
        ]);
    }

    /**
     * Flutter App Handshake & Sync Endpoint.
     * GET /api/v1/apps/{identifier}/handshake
     */
    public function handshake(Request $request, string $identifier)
    {
        $app = ConnectedApp::where('app_identifier', $identifier)->first();

        if (!$app) {
            return response()->json([
                'success' => false,
                'error' => 'APP_NOT_REGISTERED',
                'message' => "Application '{$identifier}' is not registered with this RaptorERP server.",
            ], 404);
        }

        if (!$app->is_active) {
            return response()->json([
                'success' => false,
                'error' => 'APP_DISABLED',
                'message' => "Access for {$app->name} has been disabled by the system administrator.",
            ], 403);
        }

        if ($app->maintenance_mode) {
            return response()->json([
                'success' => false,
                'error' => 'MAINTENANCE_MODE',
                'message' => $app->maintenance_message ?: 'This application is currently in maintenance mode.',
                'maintenance' => true,
            ], 503);
        }

        // Check client version if passed
        $clientVersion = $request->header('X-App-Version') ?: $request->query('version', '1.0.0');
        $versionStatus = $app->checkVersion($clientVersion);

        // Update heartbeat
        $app->update(['last_sync_at' => now()]);

        return response()->json([
            'success' => true,
            'app' => [
                'name' => $app->name,
                'identifier' => $app->app_identifier,
                'category' => $app->category,
                'platform' => $app->platform,
            ],
            'version' => $versionStatus,
            'server' => [
                'name' => config('app.name', 'RaptorERP'),
                'version' => '1.2.3',
                'api_version' => 'v1',
                'timestamp' => now()->toIso8601String(),
            ],
            'allowed_roles' => $app->allowed_roles ?: [],
            'settings' => $app->settings ?: (object)[],
            'endpoints' => [
                'handshake' => "/api/v1/apps/{$app->app_identifier}/handshake",
                'check_update' => "/api/v1/apps/{$app->app_identifier}/check-update",
                'login' => "/api/v1/apps/{$app->app_identifier}/login",
                'logout' => "/api/v1/apps/{$app->app_identifier}/logout",
                'profile' => "/api/v1/apps/{$app->app_identifier}/profile",
                'ping' => "/api/v1/apps/{$app->app_identifier}/ping",
            ],
        ]);
    }

    /**
     * Flutter App Heartbeat Ping.
     * POST /api/v1/apps/{identifier}/ping
     */
    public function ping(Request $request, string $identifier)
    {
        $app = ConnectedApp::where('app_identifier', $identifier)->first();

        if (!$app) {
            return response()->json(['success' => false, 'message' => 'App not found'], 404);
        }

        $app->update(['last_sync_at' => now()]);

        return response()->json([
            'success' => true,
            'synced_at' => now()->toIso8601String(),
        ]);
    }

    /**
     * Flutter OTA Version & Update Check Endpoint.
     * GET /api/v1/apps/{identifier}/check-update
     */
    public function checkUpdate(Request $request, string $identifier)
    {
        $app = ConnectedApp::where('app_identifier', $identifier)->first();

        if (!$app) {
            return response()->json([
                'success' => false,
                'error' => 'APP_NOT_REGISTERED',
                'message' => "Application '{$identifier}' is not registered with this RaptorERP server.",
            ], 404);
        }

        if (!$app->is_active) {
            return response()->json([
                'success' => false,
                'error' => 'APP_DISABLED',
                'message' => "Access for {$app->name} has been disabled by the system administrator.",
                'is_active' => false,
            ], 403);
        }

        $clientVersion = $request->header('X-App-Version') ?: $request->query('version', '1.0.0');
        $versionStatus = $app->checkVersion($clientVersion);

        $app->update(['last_sync_at' => now()]);

        return response()->json([
            'success' => true,
            'app_identifier' => $app->app_identifier,
            'app_name' => $app->name,
            'maintenance_mode' => (bool) $app->maintenance_mode,
            'maintenance_message' => $app->maintenance_message,
            'ota' => $versionStatus,
            'timestamp' => now()->toIso8601String(),
        ]);
    }

    /**
     * Dedicated Flutter App Authentication Endpoint.
     * POST /api/v1/apps/{identifier}/login
     */
    public function login(Request $request, string $identifier)
    {
        $app = ConnectedApp::where('app_identifier', $identifier)->first();

        if (!$app) {
            return response()->json([
                'success' => false,
                'error' => 'APP_NOT_REGISTERED',
                'message' => "Application '{$identifier}' is not registered.",
            ], 404);
        }

        if (!$app->is_active) {
            return response()->json([
                'success' => false,
                'error' => 'APP_DISABLED',
                'message' => "Access for {$app->name} has been disabled by the system administrator.",
            ], 403);
        }

        $validated = $request->validate([
            'email' => 'required|string',
            'password' => 'required|string',
            'device_name' => 'nullable|string|max:100',
            'device_id' => 'nullable|string|max:100',
            'platform' => 'nullable|string|max:50',
            'app_version' => 'nullable|string|max:30',
        ]);

        $login = trim($validated['email']);
        $password = $validated['password'];

        $user = User::where('email', $login)
            ->orWhere('phone', $login)
            ->first();

        if (!$user || !Hash::check($password, $user->password)) {
            return response()->json([
                'success' => false,
                'error' => 'INVALID_CREDENTIALS',
                'message' => 'The provided credentials do not match our records.',
            ], 401);
        }

        // Ban & Suspension check
        if ($user->isBanned()) {
            $reason = $user->banned_reason ? ": {$user->banned_reason}" : '';
            return response()->json([
                'success' => false,
                'error' => 'ACCOUNT_BANNED',
                'status' => $user->status,
                'message' => 'Your account has been ' . ($user->status === 'suspended' ? 'suspended' : 'banned') . $reason,
                'banned_at' => $user->banned_at?->toISOString(),
                'banned_until' => $user->banned_until?->toISOString(),
                'banned_reason' => $user->banned_reason,
            ], 403);
        }

        // Lockout check
        if ($user->isLockedOut()) {
            return response()->json([
                'success' => false,
                'error' => 'ACCOUNT_LOCKED',
                'message' => 'Account is temporarily locked due to too many failed attempts.',
                'lockout_until' => $user->lockout_until?->toISOString(),
            ], 423);
        }

        // Maintenance mode check (Super Admin / Admin bypass)
        $isSuperAdmin = $user->hasRole('Admin') || $user->hasRole('Super Admin');
        if ($app->maintenance_mode && !$isSuperAdmin) {
            return response()->json([
                'success' => false,
                'error' => 'MAINTENANCE_MODE',
                'message' => $app->maintenance_message ?: 'This application is currently in maintenance mode.',
                'maintenance' => true,
            ], 503);
        }

        // Check Allowed Roles
        if (!empty($app->allowed_roles) && !$isSuperAdmin) {
            $userRoleNames = $user->roles->pluck('name')->toArray();
            $hasAllowedRole = count(array_intersect($userRoleNames, $app->allowed_roles)) > 0;
            if (!$hasAllowedRole) {
                return response()->json([
                    'success' => false,
                    'error' => 'ROLE_UNAUTHORIZED',
                    'message' => "Your role does not have authorization to access {$app->name}.",
                    'allowed_roles' => $app->allowed_roles,
                ], 403);
            }
        }

        // Check OTA Version if client version passed
        $clientVersion = $validated['app_version'] ?? $request->header('X-App-Version', '1.0.0');
        $versionStatus = $app->checkVersion($clientVersion);
        if ($versionStatus['is_force_update']) {
            return response()->json([
                'success' => false,
                'error' => 'UPGRADE_REQUIRED',
                'message' => "Version {$clientVersion} is outdated. Please update {$app->name} to continue.",
                'ota' => $versionStatus,
            ], 426);
        }

        // Create Sanctum Token
        $deviceName = $validated['device_name'] ?: 'mobile_device';
        $tokenName = 'flutter_' . $app->app_identifier . '_' . Str::slug($deviceName);
        $token = $user->createToken($tokenName)->plainTextToken;

        // Record User Session
        try {
            UserSession::create([
                'user_id' => $user->id,
                'session_id' => Str::random(40),
                'ip_address' => $request->ip() ?: '127.0.0.1',
                'user_agent' => $request->userAgent() ?: 'Flutter/' . $app->app_identifier,
                'device_type' => 'mobile',
                'browser' => 'Flutter Mobile (' . $app->app_identifier . ')',
                'platform' => $validated['platform'] ?: 'flutter',
                'last_activity_at' => now(),
                'is_active' => true,
            ]);
        } catch (\Throwable $e) {
            Log::warning('Could not record mobile user session: ' . $e->getMessage());
        }

        // Update last login
        $user->update([
            'last_login_at' => now(),
            'last_login_ip' => $request->ip(),
            'failed_login_count' => 0,
        ]);

        $app->update(['last_sync_at' => now()]);

        AuditLogger::log(
            'Mobile Auth',
            'Flutter App Login',
            'info',
            "User {$user->email} logged in to Flutter app {$app->name} from device {$deviceName}",
            'User',
            $user->id,
            null,
            ['app' => $app->app_identifier, 'device' => $deviceName],
            null,
            $user,
            $request
        );

        return response()->json([
            'success' => true,
            'message' => "Authenticated successfully with {$app->name}.",
            'token' => $token,
            'token_type' => 'Bearer',
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'phone' => $user->phone,
                'status' => $user->status ?? 'active',
                'roles' => $user->roles->pluck('name'),
                'permissions' => $user->resolvePermissions()->pluck('name'),
                'company_id' => $user->company_id,
                'branch_id' => $user->branch_id,
            ],
            'app' => [
                'name' => $app->name,
                'identifier' => $app->app_identifier,
                'category' => $app->category,
                'platform' => $app->platform,
                'settings' => $app->settings ?: (object)[],
            ],
            'ota' => $versionStatus,
            'server' => [
                'name' => config('app.name', 'RaptorERP'),
                'version' => '1.2.3',
                'timestamp' => now()->toIso8601String(),
            ],
        ]);
    }

    /**
     * Flutter App Authenticated Profile & Live Permissions.
     * GET /api/v1/apps/{identifier}/profile
     */
    public function profile(Request $request, string $identifier)
    {
        $app = ConnectedApp::where('app_identifier', $identifier)->first();
        if (!$app) {
            return response()->json(['success' => false, 'message' => 'App not registered.'], 404);
        }

        $user = $request->user();
        if (!$user) {
            return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);
        }

        if ($user->isBanned()) {
            $user->tokens()->delete();
            return response()->json([
                'success' => false,
                'error' => 'ACCOUNT_BANNED',
                'message' => 'Your account has been banned or suspended.',
            ], 403);
        }

        $app->update(['last_sync_at' => now()]);

        return response()->json([
            'success' => true,
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'phone' => $user->phone,
                'status' => $user->status ?? 'active',
                'roles' => $user->roles->pluck('name'),
                'permissions' => $user->resolvePermissions()->pluck('name'),
                'company_id' => $user->company_id,
                'branch_id' => $user->branch_id,
            ],
            'app_settings' => $app->settings ?: (object)[],
            'app_maintenance' => (bool) $app->maintenance_mode,
        ]);
    }

    /**
     * Flutter App Logout & Revoke Current Device Token.
     * POST /api/v1/apps/{identifier}/logout
     */
    public function logout(Request $request, string $identifier)
    {
        $user = $request->user();
        if ($user && $user->currentAccessToken()) {
            $user->currentAccessToken()->delete();
        }

        return response()->json([
            'success' => true,
            'message' => 'Logged out successfully from Flutter mobile app.',
        ]);
    }

    /**
     * Centralized Nixa App Launcher catalog with permission-aware access resolution.
     * GET /api/apps/launcher
     */
    public function launcher(Request $request)
    {
        $user = $request->user();
        $isSuperAdmin = $user && ($user->hasRole('Admin') || $user->hasRole('Super Admin'));

        $catalog = [
            [
                'id'                  => 'nixa_erp',
                'name'                => 'Nixa ERP',
                'category'            => 'erp',
                'platform'            => 'web',
                'description'         => 'Core Enterprise Business OS — CRM, Customers, Sales Invoicing, Banking, and Accounting.',
                'route'               => '/dashboard',
                'icon'                => 'Layers',
                'version'             => '1.2.3',
                'required_permission' => 'erp.access',
                'color'               => 'indigo',
                'status'              => 'active',
                'is_core'             => true,
            ],
            [
                'id'                  => 'nixa_wms',
                'name'                => 'Nixa WMS',
                'category'            => 'wms',
                'platform'            => 'web_flutter',
                'description'         => 'Warehouse Management System — Multi-warehouse inventory, zones, bins, stock transfers, and physical counts.',
                'route'               => '/warehouses',
                'icon'                => 'Package',
                'version'             => '1.2.3',
                'required_permission' => 'wms.access',
                'color'               => 'emerald',
                'status'              => 'active',
                'is_core'             => false,
            ],
            [
                'id'                  => 'nixa_billing',
                'name'                => 'Nixa Billing',
                'category'            => 'billing',
                'platform'            => 'web_pos',
                'description'         => 'High-Speed POS & Billing — Fast barcode scanning, walk-in sales, cash closing, and 58mm/80mm thermal receipt printing.',
                'route'               => '/sales/pos',
                'icon'                => 'CreditCard',
                'version'             => '1.1.0',
                'required_permission' => 'billing.access',
                'color'               => 'amber',
                'status'              => 'active',
                'is_core'             => false,
            ],
            [
                'id'                  => 'nixa_hr',
                'name'                => 'Nixa HR',
                'category'            => 'hr',
                'platform'            => 'web',
                'description'         => 'Human Resources & Payroll — Employee profiles, shift scheduling, biometric attendance, leaves, and salary payslips.',
                'route'               => '/hr-payroll',
                'icon'                => 'Users',
                'version'             => '1.2.0',
                'required_permission' => 'hr.access',
                'color'               => 'purple',
                'status'              => 'active',
                'is_core'             => false,
            ],
            [
                'id'                  => 'nixa_crm',
                'name'                => 'Nixa CRM',
                'category'            => 'crm',
                'platform'            => 'web',
                'description'         => 'Customer Relationship Management — Lead pipeline, opportunity deals, quotations, and activity follow-ups.',
                'route'               => '/crm/leads',
                'icon'                => 'Activity',
                'version'             => '1.0.5',
                'required_permission' => 'crm.access',
                'color'               => 'rose',
                'status'              => 'active',
                'is_core'             => false,
            ],
            [
                'id'                  => 'nixa_finance',
                'name'                => 'Nixa Finance',
                'category'            => 'finance',
                'platform'            => 'web',
                'description'         => 'Banking & Treasury — Bank accounts, bank statement reconciliation, cash drawer closings, and GL audit trails.',
                'route'               => '/banking',
                'icon'                => 'DollarSign',
                'version'             => '1.2.0',
                'required_permission' => 'finance.view',
                'color'               => 'cyan',
                'status'              => 'active',
                'is_core'             => false,
            ],
        ];

        // Fetch DB-registered connected apps to merge active states
        $dbApps = ConnectedApp::all()->keyBy('app_identifier');

        $resolved = array_map(function ($app) use ($dbApps, $user, $isSuperAdmin) {
            $dbApp = $dbApps->get($app['id']);
            $isEnabled = $dbApp ? (bool) $dbApp->is_active : true;
            $maintenance = $dbApp ? (bool) $dbApp->maintenance_mode : false;

            // Check access permission
            $hasPermission = $isSuperAdmin
                || ($user && $user->hasPermission($app['required_permission']))
                || ($user && !empty($dbApp?->allowed_roles) && $user->hasAnyRole($dbApp->allowed_roles));

            // Legacy fallback: if user has general access to that module
            if (!$hasPermission && $user) {
                if ($app['category'] === 'wms' && $user->hasAnyPermission(['wms.warehouses.view', 'wms.inventory.view', 'view warehouses'])) $hasPermission = true;
                if ($app['category'] === 'billing' && $user->hasAnyPermission(['invoices.create', 'sales.view', 'create sales invoice'])) $hasPermission = true;
                if ($app['category'] === 'hr' && $user->hasAnyPermission(['employees.view', 'payroll.view', 'view employees'])) $hasPermission = true;
                if ($app['category'] === 'crm' && $user->hasAnyPermission(['quotations.view', 'customers.view', 'view customers'])) $hasPermission = true;
                if ($app['category'] === 'finance' && $user->hasAnyPermission(['finance.view', 'view payments'])) $hasPermission = true;
                if ($app['category'] === 'erp') $hasPermission = true; // All authenticated users have basic ERP access
            }

            return [
                ...$app,
                'is_enabled'   => $isEnabled,
                'has_access'   => $hasPermission,
                'maintenance'  => $maintenance,
                'status'       => $maintenance ? 'maintenance' : ($isEnabled ? ($hasPermission ? 'ready' : 'restricted') : 'disabled'),
                'download_url' => $dbApp?->apk_download_url,
            ];
        }, $catalog);

        return response()->json([
            'success' => true,
            'data'    => $resolved,
        ]);
    }
}
