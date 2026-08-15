<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BiometricDevice;
use App\Models\OfflineSyncQueue;
use Illuminate\Http\Request;

class OfflineSyncController extends Controller
{
    public function batchSync(Request $request)
    {
        $validated = $request->validate([
            'device_uid' => 'required|string|exists:biometric_devices,device_uid',
            'scans' => 'required|array|max:500',
            'scans.*.scan_time' => 'required|date',
            'scans.*.scan_type' => 'required|in:fingerprint,face,rfid',
            'scans.*.finger_index' => 'nullable|integer',
            'scans.*.template_data' => 'required|string',
        ]);

        $device = BiometricDevice::where('device_uid', $validated['device_uid'])->first();

        foreach ($validated['scans'] as $scan) {
            OfflineSyncQueue::create([
                'biometric_device_id' => $device->id,
                'payload' => $scan,
                'status' => 'pending',
            ]);
        }

        return response()->json(['message' => 'Scans queued for processing']);
    }
}