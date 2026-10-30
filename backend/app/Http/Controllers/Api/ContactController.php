<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Contact;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\PurchaseInvoice;
use App\Models\Quotation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class ContactController extends Controller
{
    /**
     * Display a listing of contacts.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Contact::query()
            ->with(['company:id,name', 'branch:id,name', 'customer:id,name,phone,email', 'supplier:id,name,phone,email', 'dealer:id,name,phone,email']);

        if ($search = trim((string) $request->input('search', ''))) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('company_name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%")
                    ->orWhere('gstin', 'like', "%{$search}%");
            });
        }

        if ($type = $request->input('contact_type')) {
            $query->where('contact_type', $type);
        }

        if ($request->has('is_active')) {
            $query->where('is_active', filter_var($request->input('is_active'), FILTER_VALIDATE_BOOLEAN));
        }

        if ($companyId = $request->input('company_id')) {
            $query->where('company_id', $companyId);
        }

        if ($branchId = $request->input('branch_id')) {
            $query->where('branch_id', $branchId);
        }

        $sortBy = $request->input('sort_by', 'created_at');
        $sortDir = strtolower($request->input('sort_dir', 'desc')) === 'asc' ? 'asc' : 'desc';
        $allowedSorts = ['id', 'name', 'company_name', 'contact_type', 'email', 'phone', 'created_at'];

        if (!in_array($sortBy, $allowedSorts, true)) {
            $sortBy = 'created_at';
        }

        $query->orderBy($sortBy, $sortDir)->orderBy('id', 'desc');

        $perPage = max(1, min((int) $request->input('per_page', 25), 100));
        return response()->json($query->paginate($perPage));
    }

    /**
     * Contact directory summary.
     */
    public function summary(Request $request): JsonResponse
    {
        $query = Contact::query();
        if ($companyId = $request->input('company_id')) {
            $query->where('company_id', $companyId);
        }

        if ($branchId = $request->input('branch_id')) {
            $query->where('branch_id', $branchId);
        }

        $total       = (clone $query)->count();
        $customers   = (clone $query)->where('contact_type', 'customer')->count();
        $suppliers   = (clone $query)->where('contact_type', 'supplier')->count();
        $leads       = (clone $query)->where('contact_type', 'lead')->count();
        $dealers     = (clone $query)->where('contact_type', 'dealer')->count();
        $recentAdded = (clone $query)->where('created_at', '>=', now()->subDays(30))->count();

        return response()->json([
            'total_contacts' => $total,
            'customers'      => $customers,
            'suppliers'      => $suppliers,
            'leads'          => $leads,
            'dealers'        => $dealers,
            'recent_added'   => $recentAdded,
        ]);
    }

    /**
     * Check for potential duplicate contacts.
     */
    public function checkDuplicate(Request $request): JsonResponse
    {
        $phone = trim((string) $request->input('phone', ''));
        $email = trim((string) $request->input('email', ''));
        $gstin = trim((string) $request->input('gstin', ''));
        $excludeId = $request->input('exclude_id');

        $query = Contact::query();
        if ($excludeId) {
            $query->where('id', '!=', $excludeId);
        }

        $duplicates = $query->where(function ($q) use ($phone, $email, $gstin) {
            if ($phone !== '') {
                $q->orWhere('phone', $phone)->orWhere('alt_phone', $phone);
            }
            if ($email !== '') {
                $q->orWhere('email', $email);
            }
            if ($gstin !== '') {
                $q->orWhere('gstin', $gstin);
            }
        })->get(['id', 'name', 'company_name', 'email', 'phone', 'contact_type']);

        return response()->json([
            'is_duplicate' => $duplicates->isNotEmpty(),
            'matches'      => $duplicates,
        ]);
    }

    /**
     * Store a new contact.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'company_id'       => 'required|exists:companies,id',
            'branch_id'        => 'nullable|exists:branches,id',
            'name'             => 'required|string|max:255',
            'company_name'     => 'nullable|string|max:255',
            'designation'      => 'nullable|string|max:100',
            'email'            => 'nullable|email|max:255',
            'phone'            => 'nullable|string|max:30',
            'alt_phone'        => 'nullable|string|max:30',
            'contact_type'     => 'nullable|string|in:customer,supplier,lead,dealer,partner,other',
            'customer_id'      => 'nullable|exists:customers,id',
            'supplier_id'      => 'nullable|exists:suppliers,id',
            'dealer_id'        => 'nullable|exists:dealers,id',
            'gstin'            => 'nullable|string|max:25',
            'pan'              => 'nullable|string|max:25',
            'billing_address'  => 'nullable|string',
            'shipping_address' => 'nullable|string',
            'city'             => 'nullable|string|max:100',
            'state'            => 'nullable|string|max:100',
            'pincode'          => 'nullable|string|max:20',
            'notes'            => 'nullable|string',
            'is_active'        => 'nullable|boolean',
        ]);

        $validated['contact_type'] = $validated['contact_type'] ?? 'customer';
        $validated['is_active']    = $validated['is_active'] ?? true;
        $validated['created_by']   = Auth::id();

        $contact = Contact::create($validated);

        return response()->json([
            'success' => true,
            'message' => 'Contact created successfully',
            'data'    => $contact->load(['customer', 'supplier', 'dealer']),
        ], 201);
    }

    /**
     * Show contact details and linked transactions.
     */
    public function show(int $id): JsonResponse
    {
        $contact = Contact::with(['company', 'branch', 'customer', 'supplier', 'dealer'])->findOrFail($id);

        // Fetch linked sales invoices, quotations, or purchases if available
        $linkedInvoices = [];
        $linkedQuotes   = [];
        $linkedPurchases = [];

        if ($contact->customer_id) {
            $linkedInvoices = Invoice::where('customer_id', $contact->customer_id)
                ->latest()
                ->take(10)
                ->get(['id', 'invoice_no', 'invoice_date', 'total_amount', 'status']);

            $linkedQuotes = Quotation::where('customer_id', $contact->customer_id)
                ->latest()
                ->take(10)
                ->get(['id', 'quotation_number', 'quotation_date', 'total_amount', 'status']);
        }

        if ($contact->supplier_id) {
            $linkedPurchases = PurchaseInvoice::where('supplier_id', $contact->supplier_id)
                ->latest()
                ->take(10)
                ->get(['id', 'invoice_number', 'invoice_date', 'total_amount', 'payment_status']);
        }

        return response()->json([
            'success' => true,
            'data'    => array_merge($contact->toArray(), [
                'linked_invoices'   => $linkedInvoices,
                'linked_quotations' => $linkedQuotes,
                'linked_purchases'  => $linkedPurchases,
            ]),
        ]);
    }

    /**
     * Update an existing contact.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $contact = Contact::findOrFail($id);

        $validated = $request->validate([
            'name'             => 'required|string|max:255',
            'company_name'     => 'nullable|string|max:255',
            'designation'      => 'nullable|string|max:100',
            'email'            => 'nullable|email|max:255',
            'phone'            => 'nullable|string|max:30',
            'alt_phone'        => 'nullable|string|max:30',
            'contact_type'     => 'nullable|string|in:customer,supplier,lead,dealer,partner,other',
            'customer_id'      => 'nullable|exists:customers,id',
            'supplier_id'      => 'nullable|exists:suppliers,id',
            'dealer_id'        => 'nullable|exists:dealers,id',
            'gstin'            => 'nullable|string|max:25',
            'pan'              => 'nullable|string|max:25',
            'billing_address'  => 'nullable|string',
            'shipping_address' => 'nullable|string',
            'city'             => 'nullable|string|max:100',
            'state'            => 'nullable|string|max:100',
            'pincode'          => 'nullable|string|max:20',
            'notes'            => 'nullable|string',
            'is_active'        => 'nullable|boolean',
        ]);

        $contact->update($validated);

        return response()->json([
            'success' => true,
            'message' => 'Contact updated successfully',
            'data'    => $contact->load(['customer', 'supplier', 'dealer']),
        ]);
    }

    /**
     * Delete a contact.
     */
    public function destroy(int $id): JsonResponse
    {
        $contact = Contact::findOrFail($id);
        $contact->delete();

        return response()->json([
            'success' => true,
            'message' => 'Contact deleted successfully',
        ]);
    }
}
