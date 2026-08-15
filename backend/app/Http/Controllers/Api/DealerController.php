<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Dealer;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class DealerController extends Controller
{
    public function index()
    {
        return Dealer::with(['company', 'branch', 'parent'])
            ->orderBy('name')
            ->paginate(15);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'company_id' => 'required|exists:companies,id',
            'branch_id' => 'nullable|exists:branches,id',
            'parent_id' => 'nullable|exists:dealers,id',
            'name' => 'required|string|max:255',
            'code' => 'required|string|max:100|unique:dealers,code',
            'contact_person' => 'nullable|string|max:255',
            'email' => 'nullable|email|max:255',
            'phone' => 'nullable|string|max:50',
            'address' => 'nullable|string',
            'territory' => 'nullable|string|max:255',
            'zone' => 'nullable|string|max:255',
            'status' => 'nullable|string|max:50',
            'credit_limit' => 'nullable|numeric',
            'outstanding_amount' => 'nullable|numeric',
            'wallet_balance' => 'nullable|numeric',
            'commission_rate' => 'nullable|numeric',
            'kyc_status' => 'nullable|string|max:50',
            'approved_at' => 'nullable|date',
            'notes' => 'nullable|string',
        ]);

        $dealer = Dealer::create($data);

        return response()->json($dealer->load(['company', 'branch', 'parent']), Response::HTTP_CREATED);
    }

    public function show(Dealer $dealer)
    {
        return $dealer->load(['company', 'branch', 'parent']);
    }

    public function update(Request $request, Dealer $dealer)
    {
        $data = $request->validate([
            'company_id' => 'required|exists:companies,id',
            'branch_id' => 'nullable|exists:branches,id',
            'parent_id' => 'nullable|exists:dealers,id',
            'name' => 'required|string|max:255',
            'code' => 'required|string|max:100|unique:dealers,code,' . $dealer->id,
            'contact_person' => 'nullable|string|max:255',
            'email' => 'nullable|email|max:255',
            'phone' => 'nullable|string|max:50',
            'address' => 'nullable|string',
            'territory' => 'nullable|string|max:255',
            'zone' => 'nullable|string|max:255',
            'status' => 'nullable|string|max:50',
            'credit_limit' => 'nullable|numeric',
            'outstanding_amount' => 'nullable|numeric',
            'wallet_balance' => 'nullable|numeric',
            'commission_rate' => 'nullable|numeric',
            'kyc_status' => 'nullable|string|max:50',
            'approved_at' => 'nullable|date',
            'notes' => 'nullable|string',
        ]);

        $dealer->update($data);

        return $dealer->load(['company', 'branch', 'parent']);
    }

    public function destroy(Dealer $dealer)
    {
        $dealer->delete();

        return response()->noContent();
    }
}
