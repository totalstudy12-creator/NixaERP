<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AiProvider;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;

class AiProviderController extends Controller
{
    public function index()
    {
        $providers = AiProvider::orderBy('name')->get();
        return response()->json(['success' => true, 'data' => $providers]);
    }

    public function store(Request $request)
    {
        $this->validate($request, [
            'name' => 'required|string',
            'key' => 'nullable|string',
            'config' => 'nullable|array',
            'enabled' => 'nullable|boolean',
        ]);

        $p = AiProvider::create([
            'name' => $request->input('name'),
            'key' => $request->input('key'),
            'config' => $request->input('config'),
            'enabled' => $request->has('enabled') ? $request->boolean('enabled') : true,
        ]);

        return response()->json(['success' => true, 'data' => $p], 201);
    }

    public function update(Request $request, AiProvider $provider)
    {
        $this->validate($request, [
            'name' => 'required|string',
            'key' => 'nullable|string',
            'config' => 'nullable|array',
            'enabled' => 'nullable|boolean',
        ]);

        $provider->fill([
            'name' => $request->input('name'),
            'key' => $request->input('key'),
            'config' => $request->input('config'),
            'enabled' => $request->has('enabled') ? $request->boolean('enabled') : $provider->enabled,
        ]);
        $provider->save();

        return response()->json(['success' => true, 'data' => $provider]);
    }
}
