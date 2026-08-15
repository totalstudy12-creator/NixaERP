<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SupplierGroup;
use Illuminate\Http\Request;

class SupplierGroupController extends Controller
{
    public function index()
    {
        return SupplierGroup::orderBy('name')->get();
    }

    public function store(Request $request)
    {
        $data = $request->validate(['name' => 'required|string|max:255|unique:supplier_groups,name']);
        $group = SupplierGroup::create($data);
        return response()->json($group, 201);
    }
}