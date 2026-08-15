<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BiometricDevice;
use App\Jobs\RestartDevice;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class BiometricDeviceController extends Controller
{
    /**
     * List all devices with branch info.
     */
    public function index()
    {
        return BiometricDevice::with('branch')->get()->map(function ($device) {
            return [
                'id'                     => $device->id,
                'device_uid'             => $device->device_uid,
                'name'                   => $device->name,
                'branch'                 => $device->branch?->name ?? 'N/A',
                'ip_address'             => $device->ip_address,
                'status'                 => $device->status,
                'firmware_version'       => $device->firmware_version,
                'last_sync_at'           => $device->last_sync_at,
                'wifi'                   => $device->wifi ?? 'Disconnected',
                'signal'                 => $device->signal ?? 0,
                'power'                  => $device->power ?? 'External',
                'cpu'                    => $device->cpu ?? 0,
                'memory'                 => $device->memory ?? 0,
                'flash'                  => $device->flash ?? 0,
                'temperature'            => $device->temperature ?? 0,
                'uptime'                 => $device->uptime ?? '—',
                'restartCount'           => $device->restart_count ?? 0,
                'lastRestartReason'      => $device->last_restart_reason ?? '—',
                'ping'                   => 0, // replace with real ping if needed
                'enrollment_status'      => $device->enrollment_status,
                'enrollment_employee_id' => $device->enrollment_employee_id,
            ];
        });
    }

    /**
     * Register a new device (or update existing one).
     */
    public function register(Request $request)
    {
        $validated = $request->validate([
            'device_uid'        => 'required|string|max:100',
            'name'              => 'required|string|max:100',
            'company_id'        => 'required|exists:companies,id',
            'branch_id'         => 'nullable|exists:branches,id',
            'firmware_version'  => 'required|string|max:20',
            'ip_address'        => 'nullable|ip',
        ]);

        $device = BiometricDevice::updateOrCreate(
            ['device_uid' => $validated['device_uid']],
            $validated + ['status' => 'online', 'last_sync_at' => now()]
        );

        return response()->json([
            'device_id' => $device->id,
            'message'   => 'Device registered successfully.'
        ]);
    }

    /**
     * Receive heartbeat data from a device.
     */
    public function heartbeat(Request $request)
    {
        $validated = $request->validate([
            'device_uid'  => 'required|string|exists:biometric_devices,device_uid',
            'cpu'         => 'sometimes|integer|min:0|max:100',
            'memory'      => 'sometimes|integer|min:0|max:100',
            'flash'       => 'sometimes|integer|min:0|max:100',
            'temperature' => 'sometimes|numeric|min:-50|max:100',
            'uptime'      => 'sometimes|string|max:255',
            'wifi_signal' => 'sometimes|integer|min:-100|max:0',
            'power'       => 'sometimes|string|max:255',
            'ip_address'  => 'sometimes|nullable|ip',
        ]);

        $device = BiometricDevice::where('device_uid', $validated['device_uid'])->firstOrFail();

        // Prepare update array
        $updateData = [
            'status'       => 'online',
            'last_sync_at' => now(),
        ];

        // Only update fields that were sent
        foreach (['cpu', 'memory', 'flash', 'temperature', 'uptime', 'power', 'ip_address'] as $field) {
            if (array_key_exists($field, $validated)) {
                $updateData[$field] = $validated[$field];
            }
        }

        // Handle wifi signal separately
        if (array_key_exists('wifi_signal', $validated)) {
            $updateData['signal'] = $validated['wifi_signal'];
            $updateData['wifi']   = $validated['wifi_signal'] > -70 ? 'Connected' : 'Weak';
        }

        $device->update($updateData);

        return response()->json(['status' => 'ok']);
    }

    /**
     * Manually trigger a sync for the device.
     */
    public function sync(BiometricDevice $device)
    {
        $device->update([
            'last_sync_at' => now(),
            'status'       => 'online'
        ]);

        return response()->json([
            'message' => "{$device->name} sync initiated."
        ]);
    }

    /**
     * Update device settings (stored as JSON).
     */
    public function updateSettings(Request $request, BiometricDevice $device)
    {
        $validated = $request->validate([
            'settings' => 'required|array'
        ]);

        $device->update(['settings' => json_encode($validated['settings'])]);

        return response()->json([
            'message' => "{$device->name} settings updated."
        ]);
    }

    /**
     * Restart the device (queued job).
     */
    public function restart(BiometricDevice $device)
    {
        // Mark as restarting immediately
        $device->update([
            'status'              => 'restarting',
            'last_restart_reason' => 'Manual restart from admin',
            'restart_count'       => ($device->restart_count ?? 0) + 1,
        ]);

        // Dispatch job that will set it back to online after a delay
        dispatch(new RestartDevice($device));

        return response()->json([
            'message' => "{$device->name} is restarting."
        ]);
    }

    /**
     * Start enrollment for an employee on the device.
     */
    public function startEnrollment(Request $request, BiometricDevice $device)
    {
        $validated = $request->validate([
            'employee_id' => 'required|exists:employees,id'
        ]);

        $device->update([
            'enrollment_status'      => 'pending',
            'enrollment_employee_id' => $validated['employee_id'],
        ]);

        return response()->json(['message' => 'Enrollment started.']);
    }

    /**
     * Check pending enrollment for a device.
     */
    public function pendingEnrollment(Request $request)
    {
        $request->validate([
            'device_uid' => 'required|string|exists:biometric_devices,device_uid'
        ]);

        $device = BiometricDevice::where('device_uid', $request->input('device_uid'))->first();

        if (!$device || !$device->enrollment_status) {
            return response()->json(['enrollment' => false]);
        }

        return response()->json([
            'enrollment'  => true,
            'employee_id' => $device->enrollment_employee_id,
            'status'      => $device->enrollment_status,
        ]);
    }

    /**
     * Update enrollment status (e.g., completed/failed).
     */
    public function updateEnrollmentStatus(Request $request, BiometricDevice $device)
    {
        $validated = $request->validate([
            'status' => 'required|string|in:pending,completed,failed'
        ]);

        $device->update(['enrollment_status' => $validated['status']]);

        // Reset enrollment fields once done
        if (in_array($validated['status'], ['completed', 'failed'])) {
            $device->update([
                'enrollment_status'      => null,
                'enrollment_employee_id' => null,
            ]);
        }

        return response()->json(['message' => 'Enrollment status updated.']);
    }

    /**
     * Update device details (admin).
     */
    public function update(Request $request, BiometricDevice $device)
    {
        $validated = $request->validate([
            'name'              => 'sometimes|string|max:255',
            'device_uid'        => [
                'sometimes',
                'string',
                'max:100',
                Rule::unique('biometric_devices', 'device_uid')->ignore($device->id),
            ],
            'firmware_version'  => 'sometimes|string|max:20',
            'ip_address'        => 'sometimes|nullable|ip',
            'branch_id'         => 'sometimes|nullable|exists:branches,id',
        ]);

        $device->update($validated);

        return response()->json($device->load('branch'));
    }

    /**
     * Delete a device.
     */
    public function destroy(BiometricDevice $device)
    {
        $device->delete();
        return response()->noContent();
    }
}