<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use Illuminate\Http\Request;

class BranchController extends Controller
{
    public function index(Request $request)
    {
        $request->validate([
            'company_id' => 'nullable|integer|exists:companies,id',
        ]);

        return Branch::with('company')
            ->when($request->filled('company_id'), function ($query) use ($request) {
                $query->where('company_id', $request->input('company_id'));
            })
            ->orderBy('name')
            ->paginate(15)
            ->withQueryString();
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'company_id' => 'required|exists:companies,id',
            'name' => 'required|string|max:255',
            'code' => 'nullable|string|max:100',
            'address' => 'nullable|string',
            'phone' => 'nullable|string|max:50',
            'email' => 'nullable|email|max:255',
            'active' => 'boolean',
        ]);

        $branch = Branch::create($data);
        return $branch->load('company');
    }

    public function show(Branch $branch)
    {
        return $branch->load('company');
    }

    public function update(Request $request, Branch $branch)
    {
        $data = $request->validate([
            'company_id' => 'required|exists:companies,id',
            'name' => 'required|string|max:255',
            'code' => 'nullable|string|max:100',
            'address' => 'nullable|string',
            'phone' => 'nullable|string|max:50',
            'email' => 'nullable|email|max:255',
            'active' => 'boolean',
        ]);

        $branch->update($data);
        return $branch->load('company');
    }

    public function destroy(Branch $branch)
    {
        $branch->delete();

        return response()->noContent();
    }
}