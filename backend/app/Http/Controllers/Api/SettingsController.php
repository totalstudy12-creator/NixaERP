<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class SettingsController extends Controller
{
    public function index(Request $request)
    {
        $query = Setting::query();

        if ($request->filled('group')) {
            $query->where('group', $request->group);
        }

        if ($request->boolean('public_only')) {
            $query->where('is_public', true);
        }

        return response()->json([
            'success' => true,
            'data' => $query->orderBy('group')->orderBy('key')->get(),
        ]);
    }

    public function show($key)
    {
        $setting = Setting::where('key', $key)->first();

        if (!$setting) {
            return response()->json(['success' => false, 'message' => 'Setting not found'], 404);
        }

        return response()->json(['success' => true, 'data' => $setting]);
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'key' => 'required|string|unique:settings,key',
            'value' => 'nullable|string',
            'group' => 'nullable|string',
            'description' => 'nullable|string',
            'is_public' => 'nullable|boolean',
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'message' => 'Validation failed', 'errors' => $validator->errors()], 422);
        }

        $setting = Setting::create($request->all());

        return response()->json(['success' => true, 'message' => 'Setting created', 'data' => $setting], 201);
    }

    public function update(Request $request, $key)
    {
        $setting = Setting::where('key', $key)->first();

        if (!$setting) {
            $validator = Validator::make($request->all(), [
                'key' => 'required|string',
                'value' => 'nullable|string',
                'group' => 'nullable|string',
                'description' => 'nullable|string',
                'is_public' => 'nullable|boolean',
            ]);

            if ($validator->fails()) {
                return response()->json(['success' => false, 'message' => 'Validation failed', 'errors' => $validator->errors()], 422);
            }

            $setting = Setting::create([
                'key' => $key,
                'value' => $request->input('value'),
                'group' => $request->input('group', 'general'),
                'description' => $request->input('description'),
                'is_public' => $request->boolean('is_public', false),
            ]);

            return response()->json(['success' => true, 'message' => 'Setting created', 'data' => $setting]);
        }

        $validator = Validator::make($request->all(), [
            'value' => 'nullable|string',
            'group' => 'nullable|string',
            'description' => 'nullable|string',
            'is_public' => 'nullable|boolean',
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'message' => 'Validation failed', 'errors' => $validator->errors()], 422);
        }

        $setting->fill($request->all());
        $setting->save();

        return response()->json(['success' => true, 'message' => 'Setting updated', 'data' => $setting]);
    }

    /**
     * Quickstart info for operators: cron commands, example URLs, and role/permission steps.
     */
    public function quickstart(Request $request)
    {
        $appUrl = config('app.url') ?: request()->getSchemeAndHttpHost();

        $cronLinux = '* * * * * cd ' . base_path() . " && php artisan schedule:run >> /dev/null 2>&1";
        $cronWindows = "C:\\xampp\\php\\php.exe " . base_path() . "\\artisan schedule:run";

        $examples = [
            'permissions_create' => [
                'method' => 'POST',
                'url' => $appUrl . '/api/permissions',
                'body' => ['name' => 'view payroll','group' => 'Payroll','description' => 'Can view payroll lists'],
            ],
            'roles_create' => [
                'method' => 'POST',
                'url' => $appUrl . '/api/roles',
                'body' => ['name' => 'Payroll Admin','permission_ids' => [1,2]],
            ],
            'user_create' => [
                'method' => 'POST',
                'url' => $appUrl . '/api/users',
                'body' => ['name' => 'Local Admin','email' => 'localadmin@example.test','password' => 'password','role_ids' => [1]],
            ],
            'login' => [
                'method' => 'POST',
                'url' => $appUrl . '/api/login',
                'body' => ['email' => 'localadmin@example.test','password' => 'password'],
            ],
        ];

        $steps = [
            '1' => 'Run the Laravel scheduler every minute on the server using the cron command (Linux) or Task Scheduler (Windows).',
            '2' => 'Create necessary permissions via POST /api/permissions.',
            '3' => 'Create a role and attach permissions via POST /api/roles.',
            '4' => 'Create a user and assign the role via POST /api/users, then log in.',
            '5' => 'Open the frontend dashboard and verify API calls; use browser devtools to inspect network requests.',
        ];

        return response()->json([
            'success' => true,
            'data' => [
                'cron' => ['linux' => $cronLinux, 'windows_example' => $cronWindows],
                'examples' => $examples,
                'steps' => $steps,
                'app_url' => $appUrl,
            ],
        ]);
    }
}
