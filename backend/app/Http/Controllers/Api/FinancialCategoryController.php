<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreFinancialCategoryRequest;
use App\Models\FinancialCategory;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class FinancialCategoryController extends Controller
{
    public function index(Request $request)
    {
        $query = FinancialCategory::query()->with('parent')->orderBy('name');

        if ($request->filled('company_id')) {
            $query->where('company_id', (int) $request->company_id);
        }

        if ($request->filled('type')) {
            $query->where('type', $request->type);
        }

        return response()->json(['data' => $query->get()]);
    }

    public function store(StoreFinancialCategoryRequest $request)
    {
        $category = FinancialCategory::create([
            ...$request->validated(),
            'is_active' => $request->boolean('is_active', true),
            'created_by' => $request->user()?->id,
        ]);

        return response()->json(['data' => $category], 201);
    }

    public function update(StoreFinancialCategoryRequest $request, FinancialCategory $financialCategory)
    {
        if ($request->filled('company_id') && (int) $request->company_id !== (int) $financialCategory->company_id) {
            throw ValidationException::withMessages(['company_id' => ['A category cannot be moved to another company.']]);
        }

        $financialCategory->update([
            ...$request->validated(),
            'is_active' => $request->boolean('is_active', $financialCategory->is_active),
            'updated_by' => $request->user()?->id,
        ]);

        return response()->json(['data' => $financialCategory->fresh()]);
    }

    public function destroy(FinancialCategory $financialCategory)
    {
        if ($financialCategory->children()->exists()) {
            throw ValidationException::withMessages(['name' => ['This category has child categories and cannot be deleted.']]);
        }

        $financialCategory->delete();

        return response()->noContent();
    }
}
