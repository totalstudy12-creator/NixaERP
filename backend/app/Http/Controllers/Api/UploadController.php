<?php

namespace App\Http\Controllers\Api;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Routing\Controller;

class UploadController extends Controller
{
    public function index()
    {
        $files = [];
        $all = Storage::disk('public')->files('uploads');
        foreach ($all as $path) {
            if (basename($path) === '.keep') {
                continue;
            }

            $files[] = [
                'path' => $path,
                'name' => basename($path),
                'folder' => dirname($path) === 'uploads' ? '' : str_replace('uploads/', '', dirname($path)),
                'url' => Storage::disk('public')->url($path),
                'size' => Storage::disk('public')->size($path),
            ];
        }

        return response()->json($files);
    }

    public function store(Request $request)
    {
        $request->validate([
            'file' => 'required|file|max:10240',
            'folder' => 'nullable|string|max:128',
        ]);

        $file = $request->file('file');
        $folder = trim($request->input('folder', ''));
        $folder = trim(preg_replace('/[^A-Za-z0-9\-_\/]/', '_', $folder), '/');
        $destination = 'uploads' . ($folder !== '' ? '/' . $folder : '');

        $name = Str::random(8) . '_' . $file->getClientOriginalName();
        $path = $file->storeAs($destination, $name, 'public');

        return response()->json([
            'name' => basename($path),
            'path' => $path,
            'folder' => $folder,
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
        $path = 'uploads/' . $folder;

        Storage::disk('public')->makeDirectory($path);
        Storage::disk('public')->put($path . '/.keep', '');

        return response()->json([
            'success' => true,
            'folder' => $folder,
            'path' => $path,
        ]);
    }

    public function destroy(Request $request)
    {
        $request->validate([
            'path' => 'required|string',
        ]);

        $path = $request->input('path');
        if (!Storage::disk('public')->exists($path)) {
            return response()->json(['success' => false, 'message' => 'File not found'], 404);
        }

        Storage::disk('public')->delete($path);

        return response()->json(['success' => true, 'message' => 'File deleted']);
    }
}
