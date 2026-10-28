<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ConnectedApp;
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
}
