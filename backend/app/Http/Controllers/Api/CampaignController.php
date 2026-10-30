<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Campaign;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class CampaignController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Campaign::query()->with('company:id,name');

        if ($search = trim((string) $request->input('search', ''))) {
            $query->where('name', 'like', "%{$search}%");
        }
        if ($channel = $request->input('channel')) {
            $query->where('channel', $channel);
        }
        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        $perPage = max(1, min((int) $request->input('per_page', 25), 100));
        return response()->json($query->orderBy('id', 'desc')->paginate($perPage));
    }

    public function summary(Request $request): JsonResponse
    {
        $query = Campaign::query();
        if ($companyId = $request->input('company_id')) {
            $query->where('company_id', $companyId);
        }

        $total       = (clone $query)->count();
        $active      = (clone $query)->where('status', 'active')->count();
        $totalBudget = (float) (clone $query)->sum('budget');
        $totalCost   = (float) (clone $query)->sum('actual_cost');

        return response()->json([
            'total_campaigns' => $total,
            'active_campaigns' => $active,
            'total_budget'    => round($totalBudget, 2),
            'total_cost'      => round($totalCost, 2),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'company_id'      => 'required|exists:companies,id',
            'name'            => 'required|string|max:255',
            'channel'         => 'nullable|string|in:email,whatsapp,sms,social,other',
            'target_audience' => 'nullable|string|max:255',
            'status'          => 'nullable|string|in:draft,scheduled,active,completed,cancelled',
            'start_date'      => 'nullable|date',
            'end_date'        => 'nullable|date',
            'budget'          => 'nullable|numeric|min:0',
            'actual_cost'     => 'nullable|numeric|min:0',
            'notes'           => 'nullable|string',
        ]);

        $validated['created_by'] = Auth::id();
        $campaign = Campaign::create($validated);

        return response()->json(['success' => true, 'data' => $campaign], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $campaign = Campaign::findOrFail($id);
        $validated = $request->validate([
            'name'            => 'required|string|max:255',
            'channel'         => 'nullable|string|in:email,whatsapp,sms,social,other',
            'target_audience' => 'nullable|string|max:255',
            'status'          => 'nullable|string|in:draft,scheduled,active,completed,cancelled',
            'start_date'      => 'nullable|date',
            'end_date'        => 'nullable|date',
            'budget'          => 'nullable|numeric|min:0',
            'actual_cost'     => 'nullable|numeric|min:0',
            'notes'           => 'nullable|string',
        ]);

        $campaign->update($validated);
        return response()->json(['success' => true, 'data' => $campaign]);
    }

    public function destroy(int $id): JsonResponse
    {
        $campaign = Campaign::findOrFail($id);
        $campaign->delete();
        return response()->json(['success' => true, 'message' => 'Campaign deleted']);
    }
}
