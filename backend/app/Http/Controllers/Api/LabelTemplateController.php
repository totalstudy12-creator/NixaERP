<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\LabelTemplate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LabelTemplateController extends Controller
{
    /**
     * Display a listing of label templates.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = LabelTemplate::with('paperProfile');

        if ($user && $user->company_id) {
            $query->where(function ($q) use ($user) {
                $q->where('company_id', $user->company_id)
                  ->orWhereNull('company_id');
            });
        }

        $templates = $query->orderByDesc('is_default')
            ->orderBy('name')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $templates,
        ]);
    }

    /**
     * Store a newly created label template.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:150',
            'paper_profile_id' => 'nullable|exists:thermal_paper_profiles,id',
            'width_mm' => 'required|numeric|min:20|max:150',
            'height_mm' => 'required|numeric|min:10|max:300',
            'dpi' => 'nullable|integer|in:203,300,600',
            'barcode_format' => 'nullable|string|max:50',
            'barcode_height_mm' => 'nullable|numeric|min:5|max:100',
            'thermal_heat' => 'nullable|integer|min:1|max:30',
            'print_speed_ips' => 'nullable|numeric|min:1.0|max:10.0',
            'elements_config' => 'nullable|array',
            'company_name_override' => 'nullable|string|max:100',
            'facility_name_override' => 'nullable|string|max:100',
            'custom_note' => 'nullable|string|max:500',
            'is_default' => 'nullable|boolean',
        ]);

        $user = $request->user();

        if (!empty($validated['is_default'])) {
            LabelTemplate::where('company_id', $user?->company_id)
                ->update(['is_default' => false]);
        }

        $validated['company_id'] = $user?->company_id;
        $validated['branch_id'] = $user?->branch_id;
        $validated['created_by'] = $user?->id;

        $template = LabelTemplate::create($validated);

        AuditLog::create([
            'user_id' => $user?->id,
            'user_name' => $user?->name ?? 'System',
            'user_email' => $user?->email ?? 'operator@nixaerp.in',
            'module' => 'Thermal Printing',
            'action' => 'Create Label Template',
            'status' => 'success',
            'message' => "Designed label template '{$template->name}' ({$template->width_mm}×{$template->height_mm}mm)",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Label template created successfully',
            'data' => $template->load('paperProfile'),
        ], 201);
    }

    /**
     * Display the specified template.
     */
    public function show(LabelTemplate $template): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $template->load('paperProfile'),
        ]);
    }

    /**
     * Update the specified template.
     */
    public function update(Request $request, LabelTemplate $template): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'sometimes|string|max:150',
            'paper_profile_id' => 'nullable|exists:thermal_paper_profiles,id',
            'width_mm' => 'sometimes|numeric|min:20|max:150',
            'height_mm' => 'sometimes|numeric|min:10|max:300',
            'dpi' => 'sometimes|integer|in:203,300,600',
            'barcode_format' => 'sometimes|string|max:50',
            'barcode_height_mm' => 'sometimes|numeric|min:5|max:100',
            'thermal_heat' => 'sometimes|integer|min:1|max:30',
            'print_speed_ips' => 'sometimes|numeric|min:1.0|max:10.0',
            'elements_config' => 'sometimes|array',
            'company_name_override' => 'nullable|string|max:100',
            'facility_name_override' => 'nullable|string|max:100',
            'custom_note' => 'nullable|string|max:500',
            'is_default' => 'sometimes|boolean',
        ]);

        $user = $request->user();

        if (!empty($validated['is_default'])) {
            LabelTemplate::where('company_id', $template->company_id)
                ->where('id', '!=', $template->id)
                ->update(['is_default' => false]);
        }

        $template->update($validated);

        AuditLog::create([
            'user_id' => $user?->id,
            'user_name' => $user?->name ?? 'System',
            'user_email' => $user?->email ?? 'operator@nixaerp.in',
            'module' => 'Thermal Printing',
            'action' => 'Update Label Template',
            'status' => 'success',
            'message' => "Updated layout configuration for '{$template->name}'",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Label template updated successfully',
            'data' => $template->fresh()->load('paperProfile'),
        ]);
    }

    /**
     * Remove the specified template.
     */
    public function destroy(Request $request, LabelTemplate $template): JsonResponse
    {
        $user = $request->user();
        $name = $template->name;
        $template->delete();

        AuditLog::create([
            'user_id' => $user?->id,
            'user_name' => $user?->name ?? 'System',
            'user_email' => $user?->email ?? 'operator@nixaerp.in',
            'module' => 'Thermal Printing',
            'action' => 'Delete Label Template',
            'status' => 'success',
            'message' => "Deleted label template '{$name}'",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Label template deleted successfully',
        ]);
    }

    /**
     * Duplicate an existing template.
     */
    public function duplicate(Request $request, LabelTemplate $template): JsonResponse
    {
        $user = $request->user();
        $cloneData = $template->toArray();
        unset($cloneData['id'], $cloneData['created_at'], $cloneData['updated_at']);

        $cloneData['name'] = $template->name . ' (Copy)';
        $cloneData['is_default'] = false;
        $cloneData['created_by'] = $user?->id;

        $newTemplate = LabelTemplate::create($cloneData);

        return response()->json([
            'success' => true,
            'message' => "Duplicated template to '{$newTemplate->name}'",
            'data' => $newTemplate->load('paperProfile'),
        ], 201);
    }

    /**
     * Set template as default.
     */
    public function setDefault(Request $request, LabelTemplate $template): JsonResponse
    {
        LabelTemplate::where('company_id', $template->company_id)
            ->update(['is_default' => false]);

        $template->update(['is_default' => true]);

        return response()->json([
            'success' => true,
            'message' => "'{$template->name}' set as default label template",
            'data' => $template,
        ]);
    }
}
