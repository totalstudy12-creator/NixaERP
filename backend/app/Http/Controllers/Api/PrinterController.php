<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\PrinterProfile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PrinterController extends Controller
{
    /**
     * Display a listing of printer profiles.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = PrinterProfile::query();

        if ($user && $user->company_id) {
            $query->where(function ($q) use ($user) {
                $q->where('company_id', $user->company_id)
                  ->orWhereNull('company_id');
            });
        }

        if ($request->filled('purpose')) {
            $query->where(function ($q) use ($request) {
                $q->where('purpose', $request->input('purpose'))
                  ->orWhere('purpose', 'all');
            });
        }

        $printers = $query->orderByDesc('is_default')
            ->orderBy('name')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $printers,
        ]);
    }

    /**
     * Store a newly created printer profile.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:150',
            'bluetooth_mac' => 'nullable|string|max:100',
            'protocol' => 'required|string|in:TSPL,ESCPOS,ZPL,CPCL',
            'connection_type' => 'required|string|in:bluetooth_classic,ble,usb,network',
            'paper_width_mm' => 'nullable|integer|min:20|max:150',
            'dpi' => 'nullable|integer|in:203,300,600',
            'density' => 'nullable|integer|min:1|max:30',
            'print_speed' => 'nullable|numeric|min:1.0|max:10.0',
            'purpose' => 'nullable|string|max:50',
            'is_default' => 'nullable|boolean',
        ]);

        $user = $request->user();

        if (!empty($validated['is_default'])) {
            PrinterProfile::where('company_id', $user?->company_id)
                ->update(['is_default' => false]);
        }

        $validated['company_id'] = $user?->company_id;
        $validated['branch_id'] = $user?->branch_id;
        $validated['created_by'] = $user?->id;
        $validated['status'] = 'saved';

        $printer = PrinterProfile::create($validated);

        // Audit Log
        AuditLog::create([
            'user_id' => $user?->id,
            'user_name' => $user?->name ?? 'System',
            'user_email' => $user?->email ?? 'operator@nixaerp.in',
            'module' => 'Thermal Printing',
            'action' => 'Create Printer Profile',
            'status' => 'success',
            'message' => "Configured printer '{$printer->name}' ({$printer->protocol}, {$printer->paper_width_mm}mm)",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Printer profile saved successfully',
            'data' => $printer,
        ], 201);
    }

    /**
     * Display the specified printer profile.
     */
    public function show(PrinterProfile $printer): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $printer,
        ]);
    }

    /**
     * Update the specified printer profile.
     */
    public function update(Request $request, PrinterProfile $printer): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'sometimes|string|max:150',
            'bluetooth_mac' => 'nullable|string|max:100',
            'protocol' => 'sometimes|string|in:TSPL,ESCPOS,ZPL,CPCL',
            'connection_type' => 'sometimes|string|in:bluetooth_classic,ble,usb,network',
            'paper_width_mm' => 'sometimes|integer|min:20|max:150',
            'dpi' => 'sometimes|integer|in:203,300,600',
            'density' => 'sometimes|integer|min:1|max:30',
            'print_speed' => 'sometimes|numeric|min:1.0|max:10.0',
            'purpose' => 'sometimes|string|max:50',
            'is_default' => 'sometimes|boolean',
            'status' => 'sometimes|string|max:30',
        ]);

        $user = $request->user();

        if (!empty($validated['is_default'])) {
            PrinterProfile::where('company_id', $printer->company_id)
                ->where('id', '!=', $printer->id)
                ->update(['is_default' => false]);
        }

        $printer->update($validated);

        AuditLog::create([
            'user_id' => $user?->id,
            'user_name' => $user?->name ?? 'System',
            'user_email' => $user?->email ?? 'operator@nixaerp.in',
            'module' => 'Thermal Printing',
            'action' => 'Update Printer Profile',
            'status' => 'success',
            'message' => "Updated printer settings for '{$printer->name}'",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Printer profile updated successfully',
            'data' => $printer->fresh(),
        ]);
    }

    /**
     * Remove the specified printer profile.
     */
    public function destroy(Request $request, PrinterProfile $printer): JsonResponse
    {
        $user = $request->user();
        $name = $printer->name;
        $printer->delete();

        AuditLog::create([
            'user_id' => $user?->id,
            'user_name' => $user?->name ?? 'System',
            'user_email' => $user?->email ?? 'operator@nixaerp.in',
            'module' => 'Thermal Printing',
            'action' => 'Delete Printer Profile',
            'status' => 'success',
            'message' => "Removed printer profile '{$name}'",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Printer profile deleted successfully',
        ]);
    }

    /**
     * Mark printer profile as default.
     */
    public function setDefault(Request $request, PrinterProfile $printer): JsonResponse
    {
        $user = $request->user();

        PrinterProfile::where('company_id', $printer->company_id)
            ->update(['is_default' => false]);

        $printer->update(['is_default' => true]);

        return response()->json([
            'success' => true,
            'message' => "'{$printer->name}' set as default printer",
            'data' => $printer,
        ]);
    }

    /**
     * Record printer test connection.
     */
    public function testConnection(Request $request, PrinterProfile $printer): JsonResponse
    {
        $user = $request->user();
        $status = $request->input('status', 'connected');

        $printer->update(['status' => $status]);

        AuditLog::create([
            'user_id' => $user?->id,
            'user_name' => $user?->name ?? 'System',
            'user_email' => $user?->email ?? 'operator@nixaerp.in',
            'module' => 'Thermal Printing',
            'action' => 'Test Printer Connection',
            'status' => $status === 'connected' ? 'success' : 'warning',
            'message' => "Tested connection to '{$printer->name}' ({$printer->bluetooth_mac}): {$status}",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'success' => true,
            'message' => "Printer connection tested: {$status}",
            'data' => $printer,
        ]);
    }
}
