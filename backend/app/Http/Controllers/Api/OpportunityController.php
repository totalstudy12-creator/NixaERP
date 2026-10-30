<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Opportunity;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class OpportunityController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Opportunity::query()
            ->with(['company:id,name', 'customer:id,name', 'lead:id,name', 'assignee:id,name']);

        if ($search = trim((string) $request->input('search', ''))) {
            $query->where('title', 'like', "%{$search}%");
        }
        if ($stage = $request->input('stage')) {
            $query->where('stage', $stage);
        }
        if ($companyId = $request->input('company_id')) {
            $query->where('company_id', $companyId);
        }

        $perPage = max(1, min((int) $request->input('per_page', 25), 100));
        return response()->json($query->orderBy('id', 'desc')->paginate($perPage));
    }

    public function summary(Request $request): JsonResponse
    {
        $query = Opportunity::query();
        if ($companyId = $request->input('company_id')) {
            $query->where('company_id', $companyId);
        }

        $totalValue = (float) (clone $query)->sum('deal_value');
        $wonValue   = (float) (clone $query)->where('stage', 'won')->sum('deal_value');
        $totalDeals = (clone $query)->count();
        $wonDeals   = (clone $query)->where('stage', 'won')->count();

        return response()->json([
            'pipeline_value' => round($totalValue, 2),
            'won_value'      => round($wonValue, 2),
            'total_deals'    => $totalDeals,
            'win_rate'       => $totalDeals > 0 ? round(($wonDeals / $totalDeals) * 100, 1) : 0,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'company_id'          => 'required|exists:companies,id',
            'branch_id'           => 'nullable|exists:branches,id',
            'title'               => 'required|string|max:255',
            'customer_id'         => 'nullable|exists:customers,id',
            'lead_id'             => 'nullable|exists:leads,id',
            'deal_value'          => 'required|numeric|min:0',
            'stage'               => 'nullable|string|in:discovery,proposal,negotiation,won,lost',
            'probability'         => 'nullable|integer|min:0|max:100',
            'expected_close_date' => 'nullable|date',
            'assigned_to'         => 'nullable|exists:users,id',
            'notes'               => 'nullable|string',
        ]);

        $validated['created_by'] = Auth::id();
        $opportunity = Opportunity::create($validated);

        return response()->json([
            'success' => true,
            'data'    => $opportunity->load(['customer', 'assignee']),
        ], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $opportunity = Opportunity::findOrFail($id);
        $validated = $request->validate([
            'title'               => 'required|string|max:255',
            'customer_id'         => 'nullable|exists:customers,id',
            'deal_value'          => 'required|numeric|min:0',
            'stage'               => 'nullable|string|in:discovery,proposal,negotiation,won,lost',
            'probability'         => 'nullable|integer|min:0|max:100',
            'expected_close_date' => 'nullable|date',
            'assigned_to'         => 'nullable|exists:users,id',
            'notes'               => 'nullable|string',
        ]);

        $opportunity->update($validated);
        return response()->json(['success' => true, 'data' => $opportunity->load(['customer', 'assignee'])]);
    }

    public function destroy(int $id): JsonResponse
    {
        $opportunity = Opportunity::findOrFail($id);
        $opportunity->delete();
        return response()->json(['success' => true, 'message' => 'Opportunity deleted']);
    }
}
