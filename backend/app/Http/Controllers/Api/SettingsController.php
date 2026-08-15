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
}
