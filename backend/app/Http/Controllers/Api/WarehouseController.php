<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Warehouse;
use Illuminate\Http\Request;

class WarehouseController extends Controller
{
    public function index()
    {
        return Warehouse::with(['company', 'branch'])->orderBy('name')->paginate(15);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'company_id' => 'required|exists:companies,id',
            'branch_id' => 'required|exists:branches,id',
            'name' => 'required|string|max:255',
            'code' => 'nullable|string|max:100',
            'location' => 'nullable|string',
            'active' => 'boolean',
        ]);

        return Warehouse::create($data);
    }

    public function show(Warehouse $warehouse)
    {
        return $warehouse->load(['company', 'branch']);
    }

    public function update(Request $request, Warehouse $warehouse)
    {
        $data = $request->validate([
            'company_id' => 'required|exists:companies,id',
            'branch_id' => 'required|exists:branches,id',
            'name' => 'required|string|max:255',
            'code' => 'nullable|string|max:100',
            'location' => 'nullable|string',
            'active' => 'boolean',
        ]);

        $warehouse->update($data);

        return $warehouse;
    }

    public function destroy(Warehouse $warehouse)
    {
        $warehouse->delete();

        return response()->noContent();
    }
}
