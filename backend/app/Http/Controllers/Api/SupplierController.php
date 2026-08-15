<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Supplier;
use Illuminate\Http\Request;

class SupplierController extends Controller
{
    public function index()
    {
        return Supplier::with(['company', 'branch', 'group', 'parent'])
            ->orderBy('name')
            ->paginate(1000);   // fetch all for frontend filtering
    }

    public function store(Request $request)
    {
        $data = $request->validate($this->rules());
        $supplier = Supplier::create($data);
        return response()->json($supplier->load(['company', 'branch', 'group', 'parent']), 201);
    }

    public function show(Supplier $supplier)
    {
        return $supplier->load(['company', 'branch', 'group', 'parent']);
    }

    public function update(Request $request, Supplier $supplier)
    {
        $data = $request->validate($this->rules());
        $supplier->update($data);
        return $supplier->fresh(['company', 'branch', 'group', 'parent']);
    }

    public function destroy(Supplier $supplier)
    {
        $supplier->delete();
        return response()->noContent();
    }

    private function rules()
    {
        return [
            'company_id'         => 'required|exists:companies,id',
            'branch_id'          => 'nullable|exists:branches,id',
            'parent_id'          => 'nullable|exists:suppliers,id',
            'group_id'           => 'nullable|exists:supplier_groups,id',
            'name'               => 'required|string|max:255',
            'type'               => 'nullable|string|max:255',
            'company_type'       => 'nullable|string|max:255',
            'contact_person'     => 'nullable|string|max:255',
            'contact_no'         => 'nullable|string|max:50',
            'email'              => 'nullable|email|max:255',
            'phone'              => 'nullable|string|max:50',
            'gst_number'         => 'nullable|string|max:50',
            'registration_type'  => 'nullable|string|max:50',
            'pan'                => 'nullable|string|max:20',
            'billing_street'     => 'nullable|string|max:255',
            'billing_landmark'   => 'nullable|string|max:255',
            'billing_city'       => 'required|string|max:255',
            'billing_state'      => 'nullable|string|max:255',
            'billing_country'    => 'nullable|string|max:255',
            'billing_pincode'    => 'nullable|string|max:20',
            'shipping_street'    => 'nullable|string|max:255',
            'shipping_landmark'  => 'nullable|string|max:255',
            'shipping_city'      => 'nullable|string|max:255',
            'shipping_state'     => 'nullable|string|max:255',
            'shipping_country'   => 'nullable|string|max:255',
            'shipping_pincode'   => 'nullable|string|max:20',
            'eway_bill_distance' => 'nullable|integer|min:0',
            'territory'          => 'nullable|string|max:255',
            'zone'               => 'nullable|string|max:255',
            'status'             => 'nullable|string|max:50',
            'credit_limit'       => 'nullable|numeric',
            'outstanding_amount' => 'nullable|numeric',
            'wallet_balance'     => 'nullable|numeric',
            'commission_rate'    => 'nullable|numeric',
            'kyc_status'         => 'nullable|string|max:50',
            'approved_at'        => 'nullable|date',
            'opening_balance'    => 'nullable|numeric',
            'due_days'           => 'nullable|integer',
            'fax'                => 'nullable|string|max:255',
            'website'            => 'nullable|string|max:255',
            'note'               => 'nullable|string',
            'license_no'         => 'nullable|string|max:255',
            'custom_field_1'     => 'nullable|string|max:255',
            'custom_field_2'     => 'nullable|string|max:255',
            'is_active'          => 'nullable|boolean',
            'notes'              => 'nullable|string',
        ];
    }
}