<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\BiometricDevice;
use App\Models\BiometricScan;
use App\Models\Employee;
use Illuminate\Http\Request;

class BiometricAttendanceController extends Controller
{
    public function store(Request $request)
    {
        $validated = $request->validate([
            'device_uid'   => 'required|string|exists:biometric_devices,device_uid',
            'scan_time'    => 'required|date',
            'employee_id'  => 'required|integer',
        ]);

        $device = BiometricDevice::where('device_uid', $validated['device_uid'])->firstOrFail();
        $employee = Employee::find($validated['employee_id']);

        if (!$employee) {
            // Unknown employee – log as unknown scan safely
            try {
                BiometricScan::create([
                    'biometric_device_id' => $device->id,
                    'employee_id'         => null,
                    'scan_time'           => $validated['scan_time'],
                    'result'              => 'unknown',
                ]);
            } catch (\Exception $e) {
                // Silently fail if table structure differs – still return a valid response
            }
            return response()->json(['match' => false]);
        }

        $today = now()->toDateString();
        $existingAttendance = Attendance::where('employee_id', $employee->id)
            ->where('date', $today)
            ->first();

        if ($existingAttendance && $existingAttendance->check_in) {
            $existingAttendance->update(['check_out' => now()->format('H:i:s')]);
            $punchType = 'OUT';
            $attendance = $existingAttendance;
        } else {
            $attendance = Attendance::updateOrCreate(
                ['employee_id' => $employee->id, 'date' => $today],
                [
                    'check_in' => now()->format('H:i:s'),
                    'status'   => 'present',
                    'device'   => $device->name,
                    'location' => $device->branch?->name ?? 'Office',
                ]
            );
            $punchType = 'IN';
        }

        try {
            BiometricScan::create([
                'biometric_device_id' => $device->id,
                'employee_id'         => $employee->id,
                'scan_time'           => $validated['scan_time'],
                'result'              => 'success',
            ]);
        } catch (\Exception $e) {
            // Log error but don't crash
        }

        return response()->json([
            'match'         => true,
            'punch_type'    => $punchType,
            'employee_name' => $employee->first_name . ' ' . $employee->last_name,
            'attendance_id' => $attendance->id ?? null,
        ]);
    }
}