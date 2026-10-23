<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\ThermalPaperProfile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ThermalPaperProfileController extends Controller
{
    /**
     * Display a listing of thermal paper profiles.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = ThermalPaperProfile::query();

        if ($user && $user->company_id) {
            $query->where(function ($q) use ($user) {
                $q->where('company_id', $user->company_id)
                  ->orWhere('is_preset', true)
                  ->orWhereNull('company_id');
            });
        }

        $profiles = $query->orderByDesc('is_default')
            ->orderByDesc('is_preset')
            ->orderBy('name')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $profiles,
        ]);
    }

    /**
     * Store a newly created paper profile.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:150',
            'roll_type' => 'required|string|in:continuous,gap_labels,black_mark',
            'paper_width_mm' => 'required|numeric|min:20|max:150',
            'label_width_mm' => 'required|numeric|min:10|max:150',
            'label_height_mm' => 'required|numeric|min:10|max:300',
            'gap_mm' => 'nullable|numeric|min:0|max:30',
            'margin_top_mm' => 'nullable|numeric|min:0|max:30',
            'margin_bottom_mm' => 'nullable|numeric|min:0|max:30',
            'margin_left_mm' => 'nullable|numeric|min:0|max:30',
            'margin_right_mm' => 'nullable|numeric|min:0|max:30',
            'orientation' => 'nullable|string|in:portrait,landscape',
            'labels_per_row' => 'nullable|integer|min:1|max:4',
            'is_default' => 'nullable|boolean',
        ]);

        $user = $request->user();

        if (!empty($validated['is_default'])) {
            ThermalPaperProfile::where('company_id', $user?->company_id)
                ->update(['is_default' => false]);
        }

        $validated['company_id'] = $user?->company_id;
        $validated['branch_id'] = $user?->branch_id;
        $validated['created_by'] = $user?->id;
        $validated['is_preset'] = false;

        $profile = ThermalPaperProfile::create($validated);

        AuditLog::create([
            'user_id' => $user?->id,
            'user_name' => $user?->name ?? 'System',
            'user_email' => $user?->email ?? 'operator@nixaerp.in',
            'module' => 'Thermal Printing',
            'action' => 'Create Paper Profile',
            'status' => 'success',
            'message' => "Created paper profile '{$profile->name}' ({$profile->label_width_mm}×{$profile->label_height_mm}mm)",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Thermal paper profile created successfully',
            'data' => $profile,
        ], 201);
    }

    /**
     * Display the specified paper profile.
     */
    public function show(ThermalPaperProfile $paperProfile): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $paperProfile,
        ]);
    }

    /**
     * Update the specified paper profile.
     */
    public function update(Request $request, ThermalPaperProfile $paperProfile): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'sometimes|string|max:150',
            'roll_type' => 'sometimes|string|in:continuous,gap_labels,black_mark',
            'paper_width_mm' => 'sometimes|numeric|min:20|max:150',
            'label_width_mm' => 'sometimes|numeric|min:10|max:150',
            'label_height_mm' => 'sometimes|numeric|min:10|max:300',
            'gap_mm' => 'nullable|numeric|min:0|max:30',
            'margin_top_mm' => 'nullable|numeric|min:0|max:30',
            'margin_bottom_mm' => 'nullable|numeric|min:0|max:30',
            'margin_left_mm' => 'nullable|numeric|min:0|max:30',
            'margin_right_mm' => 'nullable|numeric|min:0|max:30',
            'orientation' => 'sometimes|string|in:portrait,landscape',
            'labels_per_row' => 'sometimes|integer|min:1|max:4',
            'is_default' => 'sometimes|boolean',
        ]);

        $user = $request->user();

        if (!empty($validated['is_default'])) {
            ThermalPaperProfile::where('company_id', $paperProfile->company_id)
                ->where('id', '!=', $paperProfile->id)
                ->update(['is_default' => false]);
        }

        $paperProfile->update($validated);

        return response()->json([
            'success' => true,
            'message' => 'Thermal paper profile updated successfully',
            'data' => $paperProfile->fresh(),
        ]);
    }

    /**
     * Remove the specified paper profile.
     */
    public function destroy(Request $request, ThermalPaperProfile $paperProfile): JsonResponse
    {
        if ($paperProfile->is_preset) {
            return response()->json([
                'success' => false,
                'message' => 'System factory preset paper profiles cannot be deleted',
            ], 422);
        }

        $paperProfile->delete();

        return response()->json([
            'success' => true,
            'message' => 'Thermal paper profile deleted successfully',
        ]);
    }

    /**
     * Set paper profile as default.
     */
    public function setDefault(Request $request, ThermalPaperProfile $paperProfile): JsonResponse
    {
        ThermalPaperProfile::where('company_id', $paperProfile->company_id)
            ->update(['is_default' => false]);

        $paperProfile->update(['is_default' => true]);

        return response()->json([
            'success' => true,
            'message' => "'{$paperProfile->name}' set as default paper profile",
            'data' => $paperProfile,
        ]);
    }
}
