<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\Attendance;
use App\Models\BiometricDevice;
use App\Models\BiometricScan;
use App\Models\FingerprintTemplate;
use Illuminate\Http\Request;
use App\Http\Controllers\Controller;

class AttendanceScanController extends Controller
{
    public function store(Request $request)
    {
        $validated = $request->validate([
            'device_uid' => 'required|string',
            'scan_time' => 'required|date',
            'scan_type' => 'required|in:fingerprint,face,rfid',
            'finger_index' => 'nullable|integer',
            'template_data' => 'required|string', // base64 scanned template
        ]);

        $device = BiometricDevice::where('device_uid', $validated['device_uid'])->firstOrFail();

        // In production, use a matching library; here we simulate confidence
        $candidates = FingerprintTemplate::with('employee')->get();
        $bestMatch = null;
        $bestConfidence = 0;

        foreach ($candidates as $tpl) {
            // Simulate matching
            $confidence = random_int(70, 100);
            if ($confidence > $bestConfidence) {
                $bestConfidence = $confidence;
                $bestMatch = $tpl;
            }
        }

        $scanData = [
            'biometric_device_id' => $device->id,
            'scan_time' => $validated['scan_time'],
            'scan_type' => $validated['scan_type'],
            'finger_index' => $validated['finger_index'],
        ];

        if ($bestMatch && $bestConfidence >= 80) {
            // Record attendance
            $employee = $bestMatch->employee;
            $attendance = Attendance::updateOrCreate(
                ['employee_id' => $employee->id, 'date' => now()->toDateString()],
                [
                    'status' => 'present',
                    'check_in' => now()->format('H:i:s'), // logic for check-in/out can be added
                    'device' => $device->name,
                    'location' => $device->branch?->name ?? 'Office',
                ]
            );

            $scanData['employee_id'] = $employee->id;
            $scanData['result'] = 'success';
            $scanData['confidence'] = $bestConfidence;
            BiometricScan::create($scanData);

            return response()->json([
                'match' => true,
                'employee_name' => $employee->first_name . ' ' . $employee->last_name,
                'attendance_id' => $attendance->id,
            ]);
        }

        // Unknown fingerprint
        $scanData['employee_id'] = null;
        $scanData['result'] = 'unknown';
        $scanData['confidence'] = 0;
        BiometricScan::create($scanData);

        return response()->json(['match' => false]);
    }
}