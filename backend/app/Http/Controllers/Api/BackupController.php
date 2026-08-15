<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Backup;
use App\Services\BackupService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Storage;

class BackupController extends Controller
{
    public function __construct(protected BackupService $service)
    {
    }

    public function index()
    {
        $data = $this->service->getHealthSummary();
        return response()->json($data);
    }

    public function store(Request $request)
    {
        $request->validate([
            'type' => 'nullable|string|in:manual,schedule',
        ]);

        $backup = $this->service->createBackup($request->input('type', 'manual'));

        return response()->json([
            'success' => true,
            'message' => 'Backup created successfully',
            'data' => [
                'backupId' => $backup->id,
                'path' => $backup->path,
                'status' => $backup->status,
            ],
        ], 201);
    }

    public function restore(Request $request)
    {
        $request->validate([
            'backup_id' => 'required|integer|exists:backups,id',
        ]);

        $backup = Backup::findOrFail($request->input('backup_id'));
        $restored = $this->service->restoreBackup($backup);

        return response()->json([
            'success' => true,
            'message' => 'Backup restore completed successfully',
            'data' => [
                'backupId' => $restored->id,
                'status' => $restored->status,
                'details' => $restored->details,
            ],
        ]);
    }

    public function download(Backup $backup)
    {
        if (!Storage::disk($backup->disk)->exists($backup->path)) {
            return response()->json(['success' => false, 'message' => 'Backup file not found'], 404);
        }

        return Storage::disk($backup->disk)->download($backup->path, $backup->name);
    }
}
