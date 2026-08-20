<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Validator;

class SettingsController extends Controller
{
    // Cache key for all settings
    private const CACHE_KEY = 'app_settings_all';

    /**
     * Display a listing of the settings.
     * Supports filtering by group, search term, and public only.
     */
    public function index(Request $request)
    {
        $cacheKey = self::CACHE_KEY . ':' . md5(serialize($request->only(['group', 'search', 'public_only'])));

        $settings = Cache::remember($cacheKey, now()->addMinutes(30), function () use ($request) {
            $query = Setting::query();

            if ($request->filled('group')) {
                $query->where('group', $request->group);
            }

            if ($request->filled('search')) {
                $search = $request->search;
                $query->where(function ($q) use ($search) {
                    $q->where('key', 'like', "%{$search}%")
                      ->orWhere('description', 'like', "%{$search}%")
                      ->orWhere('value', 'like', "%{$search}%");
                });
            }

            if ($request->boolean('public_only')) {
                $query->where('is_public', true);
            }

            return $query->orderBy('group')->orderBy('key')->get();
        });

        return response()->json([
            'success' => true,
            'data' => $settings,
        ]);
    }

    /**
     * Display the specified setting by key.
     */
    public function show($key)
    {
        $setting = $this->findSetting($key);

        if (!$setting) {
            return response()->json(['success' => false, 'message' => 'Setting not found'], 404);
        }

        return response()->json(['success' => true, 'data' => $setting]);
    }

    /**
     * Store a newly created setting.
     */
    public function store(Request $request)
    {
        $validator = $this->validateSetting($request, true);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'message' => 'Validation failed', 'errors' => $validator->errors()], 422);
        }

        $setting = Setting::create($validator->validated());

        $this->clearSettingsCache();

        return response()->json(['success' => true, 'message' => 'Setting created', 'data' => $setting], 201);
    }

    /**
     * Update the specified setting by key, or create if it doesn't exist.
     */
    public function update(Request $request, $key)
    {
        $setting = $this->findSetting($key);

        if (!$setting) {
            // Create new setting with the given key
            $request->merge(['key' => $key]);
            return $this->store($request);
        }

        $validator = $this->validateSetting($request, false);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'message' => 'Validation failed', 'errors' => $validator->errors()], 422);
        }

        $setting->fill($validator->validated());
        $setting->save();

        $this->clearSettingsCache();

        return response()->json(['success' => true, 'message' => 'Setting updated', 'data' => $setting]);
    }

    /**
     * Remove the specified setting.
     */
    public function destroy($key)
    {
        $setting = $this->findSetting($key);

        if (!$setting) {
            return response()->json(['success' => false, 'message' => 'Setting not found'], 404);
        }

        $setting->delete();
        $this->clearSettingsCache();

        return response()->json(['success' => true, 'message' => 'Setting deleted']);
    }

    /**
     * Bulk update or create multiple settings.
     * Request body: { "settings": [ {"key": "...", "value": "...", ...}, ... ] }
     */
    public function bulkUpdate(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'settings' => 'required|array|min:1',
            'settings.*.key' => 'required|string',
            'settings.*.value' => 'nullable|string',
            'settings.*.group' => 'nullable|string',
            'settings.*.description' => 'nullable|string',
            'settings.*.is_public' => 'nullable|boolean',
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'message' => 'Validation failed', 'errors' => $validator->errors()], 422);
        }

        $updated = 0;
        $created = 0;

        foreach ($validator->validated()['settings'] as $data) {
            $setting = Setting::where('key', $data['key'])->first();

            if ($setting) {
                $setting->fill($data)->save();
                $updated++;
            } else {
                Setting::create($data);
                $created++;
            }
        }

        $this->clearSettingsCache();

        return response()->json([
            'success' => true,
            'message' => "Bulk update completed. Updated: {$updated}, Created: {$created}",
            'data' => [
                'updated' => $updated,
                'created' => $created,
            ],
        ]);
    }

    /**
     * Export all settings as JSON.
     */
    public function export()
    {
        $settings = Setting::orderBy('group')->orderBy('key')->get();

        $filename = 'settings-' . date('Y-m-d-His') . '.json';
        $content = $settings->toJson(JSON_PRETTY_PRINT);

        return response()->streamDownload(function () use ($content) {
            echo $content;
        }, $filename, ['Content-Type' => 'application/json']);
    }

    /**
     * Import settings from a JSON file.
     */
    public function import(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'file' => 'required|file|mimes:json,txt',
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'message' => 'Validation failed', 'errors' => $validator->errors()], 422);
        }

        $file = $request->file('file');
        $json = file_get_contents($file->getRealPath());
        $settingsData = json_decode($json, true);

        if (!is_array($settingsData)) {
            return response()->json(['success' => false, 'message' => 'Invalid JSON file'], 422);
        }

        $imported = 0;
        foreach ($settingsData as $item) {
            if (isset($item['key'])) {
                Setting::updateOrCreate(['key' => $item['key']], [
                    'value' => $item['value'] ?? null,
                    'group' => $item['group'] ?? 'general',
                    'description' => $item['description'] ?? null,
                    'is_public' => $item['is_public'] ?? false,
                ]);
                $imported++;
            }
        }

        $this->clearSettingsCache();

        return response()->json([
            'success' => true,
            'message' => "Imported {$imported} settings",
            'data' => ['imported' => $imported],
        ]);
    }

    /**
     * Clear settings cache manually.
     */
    public function clearCache()
    {
        $this->clearSettingsCache();
        return response()->json(['success' => true, 'message' => 'Settings cache cleared']);
    }

    /**
     * Quickstart info for operators.
     */
    public function quickstart(Request $request)
    {
        // (Keep existing quickstart implementation or enhance as needed)
        $appUrl = config('app.url') ?: request()->getSchemeAndHttpHost();
        $cronLinux = '* * * * * cd ' . base_path() . " && php artisan schedule:run >> /dev/null 2>&1";
        $cronWindows = "C:\\xampp\\php\\php.exe " . base_path() . "\\artisan schedule:run";

        return response()->json([
            'success' => true,
            'data' => [
                'app_url' => $appUrl,
                'cron' => [
                    'linux' => $cronLinux,
                    'windows_example' => $cronWindows,
                ],
                'examples' => [
                    'login' => [
                        'method' => 'POST',
                        'url' => $appUrl . '/api/login',
                        'body' => ['email' => 'admin@example.com', 'password' => 'password'],
                    ],
                ],
                'steps' => [
                    '1' => 'Run scheduler cron.',
                    '2' => 'Create permissions, roles, and users.',
                    '3' => 'Use the API endpoints documented in the code.',
                ],
            ],
        ]);
    }

    // ─── Helper Methods ──────────────────────────────────────────────

    /**
     * Find a setting by key (case-insensitive).
     */
    private function findSetting($key)
    {
        return Setting::where('key', $key)->first();
    }

    /**
     * Clear all cached settings.
     */
    private function clearSettingsCache()
    {
        Cache::forget(self::CACHE_KEY);
        // Also forget any filtered cache entries (simple approach)
        // In production, consider using tags or a prefix.
        $keys = Cache::get('settings_cache_keys', []);
        foreach ($keys as $cacheKey) {
            Cache::forget($cacheKey);
        }
        Cache::forget('settings_cache_keys');
    }

    /**
     * Validate a setting request.
     * If $isNew is true, key is required and must be unique.
     */
    private function validateSetting(Request $request, bool $isNew)
    {
        $rules = [
            'value' => 'nullable|string',
            'group' => 'nullable|string|max:100',
            'description' => 'nullable|string|max:255',
            'is_public' => 'nullable|boolean',
        ];

        if ($isNew) {
            $rules['key'] = 'required|string|max:100|unique:settings,key';
        } else {
            // For update, key is not required (already in URL)
        }

        return Validator::make($request->all(), $rules);
    }
}