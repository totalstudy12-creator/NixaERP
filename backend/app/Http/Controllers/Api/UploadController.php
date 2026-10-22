<?php

namespace App\Http\Controllers\Api;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Routing\Controller;

class UploadController extends Controller
{
    /**
     * Allowed file extensions for uploads.
     */
    protected const ALLOWED_EXTENSIONS = [
        'jpg', 'jpeg', 'png', 'webp', 'gif', 'svg',
        'pdf', 'csv', 'xlsx', 'xls', 'docx', 'doc', 'txt', 'zip'
    ];

    public function index()
    {
        $files = [];
        $all = Storage::disk('public')->allFiles('uploads');
        foreach ($all as $path) {
            if (basename($path) === '.keep') {
                continue;
            }

            $folder = dirname($path);
            $cleanFolder = ($folder === 'uploads' || $folder === '.') ? '' : str_replace('uploads/', '', str_replace('\\', '/', $folder));

            $files[] = [
                'path' => $path,
                'name' => basename($path),
                'folder' => $cleanFolder,
                'url' => Storage::disk('public')->url($path),
                'size' => Storage::disk('public')->size($path),
            ];
        }

        return response()->json($files);
    }

    public function store(Request $request)
    {
        $request->validate([
            'file' => [
                'required',
                'file',
                'max:10240', // 10MB
                'mimes:jpg,jpeg,png,webp,gif,svg,pdf,csv,xlsx,xls,docx,doc,txt,zip',
            ],
            'folder' => 'nullable|string|max:128',
        ]);

        $file = $request->file('file');
        $rawExt = strtolower($file->getClientOriginalExtension());

        if (!in_array($rawExt, self::ALLOWED_EXTENSIONS, true)) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid file extension. Only approved document and media files may be uploaded.',
            ], 422);
        }

        // Additional SVG sanity check to prevent stored XSS
        if ($rawExt === 'svg') {
            $svgContent = file_get_contents($file->getRealPath());
            if ($svgContent && preg_match('/<script|javascript:|onload=|onerror=/i', $svgContent)) {
                return response()->json([
                    'success' => false,
                    'message' => 'SVG file contains disallowed active script elements.',
                ], 422);
            }
        }

        $folder = trim($request->input('folder', ''));
        $folder = trim(preg_replace('/[^A-Za-z0-9\-_\/]/', '_', $folder), '/');
        // Prevent path traversal in folder
        $folderParts = array_filter(explode('/', $folder), fn ($part) => $part !== '' && $part !== '.' && $part !== '..');
        $cleanFolder = implode('/', $folderParts);

        $destination = 'uploads' . ($cleanFolder !== '' ? '/' . $cleanFolder : '');

        $safeOriginalName = preg_replace('/[^A-Za-z0-9\-_\.]/', '_', pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME));
        $name = Str::random(12) . '_' . substr($safeOriginalName, 0, 40) . '.' . $rawExt;
        $path = $file->storeAs($destination, $name, 'public');

        return response()->json([
            'name' => basename($path),
            'path' => $path,
            'folder' => $cleanFolder,
            'url' => Storage::disk('public')->url($path),
            'size' => Storage::disk('public')->size($path),
        ]);
    }

    public function createFolder(Request $request)
    {
        $request->validate([
            'folder' => 'required|string|max:128',
        ]);

        $folder = trim($request->input('folder'));
        $folder = trim(preg_replace('/[^A-Za-z0-9\-_\/]/', '_', $folder), '/');
        $folderParts = array_filter(explode('/', $folder), fn ($part) => $part !== '' && $part !== '.' && $part !== '..');
        $cleanFolder = implode('/', $folderParts);

        if ($cleanFolder === '') {
            return response()->json(['success' => false, 'message' => 'Invalid folder name.'], 422);
        }

        $path = 'uploads/' . $cleanFolder;

        Storage::disk('public')->makeDirectory($path);
        Storage::disk('public')->put($path . '/.keep', '');

        return response()->json([
            'success' => true,
            'folder' => $cleanFolder,
            'path' => $path,
        ]);
    }

    public function destroy(Request $request)
    {
        $request->validate([
            'path' => 'required|string',
        ]);

        $rawPath = str_replace('\\', '/', trim($request->input('path')));

        // Prevent path traversal: Must start with uploads/ and contain no ..
        if (!str_starts_with($rawPath, 'uploads/') || str_contains($rawPath, '..')) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid file path. Path traversal is rejected.',
            ], 422);
        }

        if (!Storage::disk('public')->exists($rawPath)) {
            return response()->json(['success' => false, 'message' => 'File not found'], 404);
        }

        Storage::disk('public')->delete($rawPath);

        return response()->json(['success' => true, 'message' => 'File deleted']);
    }
}
