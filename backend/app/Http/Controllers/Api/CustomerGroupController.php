<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CustomerGroup;
use Illuminate\Http\Request;

class CustomerGroupController extends Controller
{
    public function index()
    {
        return CustomerGroup::orderBy('name')->get();
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:255|unique:customer_groups,name',
        ]);

        $group = CustomerGroup::create($data);
        return response()->json($group, 201);
    }
}