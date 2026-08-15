<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BiometricScan;
use App\Models\OfflineSyncQueue;

class BiometricScanController extends Controller
{
    public function liveFeed()
    {
        $scans = BiometricScan::with(['device:id,name,device_uid', 'employee:id,first_name,last_name'])
            ->latest('scan_time')
            ->limit(50)
            ->get()
            ->map(function ($scan) {
                return [
                    'id' => (string) $scan->id,
                    'timestamp' => $scan->scan_time->format('H:i:s'),
                    'type' => $scan->scan_type,
                    'employeeName' => $scan->employee ? $scan->employee->first_name . ' ' . $scan->employee->last_name : null,
                    'deviceId' => $scan->device->device_uid ?? '',
                    'status' => $scan->result === 'success' ? 'success' : ($scan->result === 'unknown' ? 'failed' : 'warning'),
                    'confidence' => $scan->confidence,
                    'details' => $scan->result === 'success' ? 'Fingerprint matched' : ($scan->result === 'unknown' ? 'Unknown Finger' : 'Duplicate scan'),
                ];
            });

        return response()->json($scans);
    }

    public function pendingQueue()
    {
        $queue = OfflineSyncQueue::with('device:id,device_uid')
            ->where('status', '!=', 'synced')
            ->latest()
            ->limit(100)
            ->get()
            ->map(function ($item) {
                return [
                    'id' => (string) $item->id,
                    'employeeId' => $item->payload['employee_id'] ?? null,
                    'employeeName' => 'Employee #' . ($item->payload['employee_id'] ?? '?'),
                    'timestamp' => $item->created_at->format('Y-m-d H:i:s'),
                    'status' => $item->status,
                    'deviceId' => $item->device->device_uid ?? '',
                    'retryCount' => $item->retry_count,
                ];
            });

        return response()->json($queue);
    }

    public function unknownFingers()
    {
        $unknownScans = BiometricScan::with('device:id,device_uid')
            ->where('result', 'unknown')
            ->latest('scan_time')
            ->limit(20)
            ->get()
            ->map(function ($scan) {
                return [
                    'id' => (string) $scan->id,
                    'timestamp' => $scan->scan_time->format('Y-m-d H:i:s'),
                    'deviceId' => $scan->device->device_uid ?? '',
                    'status' => 'unassigned',
                ];
            });

        return response()->json($unknownScans);
    }
}