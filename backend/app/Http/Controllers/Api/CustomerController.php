<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class CustomerController extends Controller
{
    public function index()
    {
        return Customer::with(['company', 'branch', 'group'])
            ->orderBy('name')
            ->paginate(15);
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), $this->rules());

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $customer = Customer::create($validator->validated());

        return response()->json($customer->load(['company', 'branch', 'group']), 201);
    }

    public function show(Customer $customer)
    {
        return $customer->load(['company', 'branch', 'group']);
    }

    public function update(Request $request, Customer $customer)
    {
        $validator = Validator::make($request->all(), $this->rules());

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $customer->update($validator->validated());

        return $customer->fresh(['company', 'branch', 'group']);
    }

    public function destroy(Customer $customer)
    {
        $customer->delete();

        return response()->noContent();
    }

    private function rules()
    {
        return [
            'company_id' => 'required|exists:companies,id',
            'branch_id' => 'nullable|exists:branches,id',
            'name' => 'required|string|max:255',
            'type' => 'nullable|string|max:255',
            'company_type' => 'nullable|string|max:255',
            'email' => 'nullable|email|max:255',
            
            'contact_person' => 'nullable|string|max:255',
            'contact_no' => 'nullable|string|max:50',
            'gst_number' => 'nullable|string|max:50',
            'registration_type' => 'nullable|string|max:50',
            'pan' => 'nullable|string|max:20',
            'billing_street' => 'nullable|string|max:255',
            'billing_landmark' => 'nullable|string|max:255',
            'billing_city' => 'required|string|max:255',
            'billing_state' => 'nullable|string|max:255',
            'billing_country' => 'nullable|string|max:255',
            'billing_pincode' => 'nullable|string|max:20',
            'shipping_street' => 'nullable|string|max:255',
            'shipping_landmark' => 'nullable|string|max:255',
            'shipping_city' => 'nullable|string|max:255',
            'shipping_state' => 'nullable|string|max:255',
            'shipping_country' => 'nullable|string|max:255',
            'shipping_pincode' => 'nullable|string|max:20',
            'eway_bill_distance' => 'nullable|integer|min:0',
            'group_id' => 'nullable|exists:customer_groups,id',
            'opening_balance' => 'nullable|numeric',
            'credit_limit' => 'nullable|numeric|min:0',
            'due_days' => 'nullable|integer|min:0',
            'fax' => 'nullable|string|max:255',
            'website' => 'nullable|string|max:255',
            'note' => 'nullable|string',
            'license_no' => 'nullable|string|max:255',
            'custom_field_1' => 'nullable|string|max:255',
            'custom_field_2' => 'nullable|string|max:255',
            'status' => 'nullable|string|max:50',
            'is_active' => 'nullable|boolean',
            'parent_id' => 'nullable|exists:customers,id',
            'territory' => 'nullable|string|max:255',
            'zone' => 'nullable|string|max:255',
            'outstanding_amount' => 'nullable|numeric',
            'wallet_balance' => 'nullable|numeric',
            'commission_rate' => 'nullable|numeric',
            'kyc_status' => 'nullable|string|max:50',
            'approved_at' => 'nullable|date',
        ];
    }
}