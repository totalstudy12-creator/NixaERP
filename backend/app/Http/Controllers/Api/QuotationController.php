<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\Product;
use App\Models\ProductWarehouseStock;
use App\Models\Quotation;
use App\Models\QuotationItem;
use App\Models\StockMovement;
use App\Models\Warehouse;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class QuotationController extends Controller
{
    /**
     * Display a listing of quotations with filters and search.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Quotation::query()
            ->with(['company:id,name', 'branch:id,name', 'customer:id,name,email,phone,gst_number', 'assignee:id,name,email', 'creator:id,name', 'convertedInvoice:id,invoice_no,total_amount,status']);

        // Search
        if ($search = trim((string) $request->input('search', ''))) {
            $query->where(function ($q) use ($search) {
                $q->where('quotation_number', 'like', "%{$search}%")
                    ->orWhere('customer_name', 'like', "%{$search}%")
                    ->orWhere('customer_email', 'like', "%{$search}%")
                    ->orWhere('customer_phone', 'like', "%{$search}%")
                    ->orWhere('gstin', 'like', "%{$search}%");
            });
        }

        // Status Filter
        if ($status = $request->input('status')) {
            if ($status === 'expired') {
                $query->whereIn('status', ['draft', 'sent'])
                    ->whereNotNull('valid_until')
                    ->where('valid_until', '<', Carbon::today()->toDateString());
            } else {
                $query->where('status', $status);
            }
        }

        // Company / Branch Filter
        if ($companyId = $request->input('company_id')) {
            $query->where('company_id', $companyId);
        }
        if ($branchId = $request->input('branch_id')) {
            $query->where('branch_id', $branchId);
        }

        // Customer Filter
        if ($customerId = $request->input('customer_id')) {
            $query->where('customer_id', $customerId);
        }

        // Date Range
        if ($fromDate = $request->input('from_date')) {
            $query->where('quotation_date', '>=', $fromDate);
        }
        if ($toDate = $request->input('to_date')) {
            $query->where('quotation_date', '<=', $toDate);
        }

        // Sorting
        $sortBy = $request->input('sort_by', 'quotation_date');
        $sortDir = strtolower($request->input('sort_dir', 'desc')) === 'asc' ? 'asc' : 'desc';
        $allowedSorts = ['id', 'quotation_number', 'quotation_date', 'valid_until', 'customer_name', 'total_amount', 'status', 'created_at'];

        if (!in_array($sortBy, $allowedSorts, true)) {
            $sortBy = 'quotation_date';
        }

        $query->orderBy($sortBy, $sortDir)->orderBy('id', 'desc');

        $perPage = max(1, min((int) $request->input('per_page', 15), 100));
        $quotations = $query->paginate($perPage);

        // Append computed is_expired property
        $quotations->getCollection()->transform(function ($quote) {
            $quote->is_expired = $quote->is_expired;
            return $quote;
        });

        return response()->json($quotations);
    }

    /**
     * Get aggregate metrics for quotations.
     */
    public function summary(Request $request): JsonResponse
    {
        $query = Quotation::query();

        if ($companyId = $request->input('company_id')) {
            $query->where('company_id', $companyId);
        }

        $totalCount     = (clone $query)->count();
        $draftCount     = (clone $query)->where('status', 'draft')->count();
        $sentCount      = (clone $query)->where('status', 'sent')->count();
        $acceptedCount  = (clone $query)->where('status', 'accepted')->count();
        $rejectedCount  = (clone $query)->where('status', 'rejected')->count();
        $convertedCount = (clone $query)->where('status', 'converted')->count();
        $expiredCount   = (clone $query)->whereIn('status', ['draft', 'sent'])
            ->whereNotNull('valid_until')
            ->where('valid_until', '<', Carbon::today()->toDateString())
            ->count();

        $totalValue     = (float) (clone $query)->sum('total_amount');
        $convertedValue = (float) (clone $query)->where('status', 'converted')->sum('total_amount');
        $acceptedValue  = (float) (clone $query)->whereIn('status', ['accepted', 'converted'])->sum('total_amount');

        return response()->json([
            'total_count'     => $totalCount,
            'draft_count'     => $draftCount,
            'sent_count'      => $sentCount,
            'accepted_count'  => $acceptedCount,
            'rejected_count'  => $rejectedCount,
            'converted_count' => $convertedCount,
            'expired_count'   => $expiredCount,
            'total_value'     => round($totalValue, 2),
            'converted_value' => round($convertedValue, 2),
            'accepted_value'  => round($acceptedValue, 2),
            'conversion_rate' => $totalCount > 0 ? round(($convertedCount / $totalCount) * 100, 1) : 0,
        ]);
    }

    /**
     * Generate the next sequential quotation number.
     */
    public function nextNumber(): JsonResponse
    {
        return response()->json([
            'success'               => true,
            'next_quotation_number' => $this->resolveQuotationNumber(),
        ]);
    }

    /**
     * Show a single quotation with full details and line items.
     */
    public function show(int $id): JsonResponse
    {
        $quotation = Quotation::with([
            'company',
            'branch',
            'customer',
            'items.product',
            'assignee:id,name,email',
            'creator:id,name,email',
            'convertedInvoice',
        ])->findOrFail($id);

        $quotation->is_expired = $quotation->is_expired;

        return response()->json([
            'success' => true,
            'data'    => $quotation,
        ]);
    }

    /**
     * Create a new quotation.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'company_id'           => 'required|exists:companies,id',
            'branch_id'            => 'nullable|exists:branches,id',
            'customer_id'          => 'nullable|exists:customers,id',
            'customer_name'        => 'required|string|max:255',
            'customer_email'       => 'nullable|email|max:255',
            'customer_phone'       => 'nullable|string|max:30',
            'billing_address'      => 'nullable|string',
            'shipping_address'     => 'nullable|string',
            'gstin'                => 'nullable|string|max:25',
            'pan'                  => 'nullable|string|max:25',
            'quotation_number'     => 'nullable|string|max:100|unique:quotations,quotation_number',
            'quotation_date'       => 'required|date',
            'valid_until'          => 'nullable|date',
            'status'               => 'nullable|string|in:draft,sent,accepted,rejected,converted',
            'shipping_charges'     => 'nullable|numeric|min:0',
            'other_charges'        => 'nullable|numeric|min:0',
            'round_off'            => 'nullable|numeric',
            'notes'                => 'nullable|string',
            'terms_and_conditions' => 'nullable|string',
            'assigned_to'          => 'nullable|exists:users,id',
            'items'                => 'required|array|min:1',
            'items.*.product_id'       => 'nullable|exists:products,id',
            'items.*.item_name'        => 'required|string|max:255',
            'items.*.description'      => 'nullable|string',
            'items.*.hsn_code'         => 'nullable|string|max:30',
            'items.*.quantity'         => 'required|numeric|min:0.01',
            'items.*.unit_price'       => 'required|numeric|min:0',
            'items.*.discount_percent' => 'nullable|numeric|min:0|max:100',
            'items.*.discount_amount'  => 'nullable|numeric|min:0',
            'items.*.gst_slab'         => 'nullable|numeric|min:0',
            'items.*.is_inter_state'   => 'nullable|boolean',
        ]);

        $quotationNumber = $this->resolveQuotationNumber($validated['quotation_number'] ?? null);

        $quotation = DB::transaction(function () use ($validated, $quotationNumber) {
            $subtotal      = 0;
            $discountTotal = 0;
            $taxableTotal  = 0;
            $cgstTotal     = 0;
            $sgstTotal     = 0;
            $igstTotal     = 0;

            $itemsToInsert = [];

            foreach ($validated['items'] as $itemData) {
                $qty       = (float) $itemData['quantity'];
                $unitPrice = (float) $itemData['unit_price'];
                $lineGross = $qty * $unitPrice;

                // Discount calculation
                $discPercent = (float) ($itemData['discount_percent'] ?? 0);
                $discAmount  = (float) ($itemData['discount_amount'] ?? 0);
                if ($discPercent > 0) {
                    $discAmount = round(($lineGross * $discPercent) / 100, 2);
                }
                $discAmount = min($lineGross, $discAmount);
                $lineTaxable = max(0, $lineGross - $discAmount);

                // Tax calculation
                $gstSlab      = (float) ($itemData['gst_slab'] ?? 0);
                $isInterState = (bool) ($itemData['is_inter_state'] ?? false);

                $cgstPercent = 0;
                $sgstPercent = 0;
                $igstPercent = 0;
                $cgstAmount  = 0;
                $sgstAmount  = 0;
                $igstAmount  = 0;

                if ($gstSlab > 0) {
                    if ($isInterState) {
                        $igstPercent = $gstSlab;
                        $igstAmount  = round(($lineTaxable * $igstPercent) / 100, 2);
                    } else {
                        $cgstPercent = $gstSlab / 2;
                        $sgstPercent = $gstSlab / 2;
                        $cgstAmount  = round(($lineTaxable * $cgstPercent) / 100, 2);
                        $sgstAmount  = round(($lineTaxable * $sgstPercent) / 100, 2);
                    }
                }

                $taxAmount = $cgstAmount + $sgstAmount + $igstAmount;
                $lineTotal = round($lineTaxable + $taxAmount, 2);

                $subtotal      += $lineGross;
                $discountTotal += $discAmount;
                $taxableTotal  += $lineTaxable;
                $cgstTotal     += $cgstAmount;
                $sgstTotal     += $sgstAmount;
                $igstTotal     += $igstAmount;

                $itemsToInsert[] = [
                    'product_id'       => $itemData['product_id'] ?? null,
                    'item_name'        => $itemData['item_name'],
                    'description'      => $itemData['description'] ?? null,
                    'hsn_code'         => $itemData['hsn_code'] ?? null,
                    'quantity'         => $qty,
                    'unit_price'       => $unitPrice,
                    'discount_percent' => $discPercent,
                    'discount_amount'  => $discAmount,
                    'gst_slab'         => $gstSlab,
                    'is_inter_state'   => $isInterState,
                    'cgst_percent'     => $cgstPercent,
                    'sgst_percent'     => $sgstPercent,
                    'igst_percent'     => $igstPercent,
                    'cgst_amount'      => $cgstAmount,
                    'sgst_amount'      => $sgstAmount,
                    'igst_amount'      => $igstAmount,
                    'tax_rate'         => $gstSlab,
                    'tax_amount'       => $taxAmount,
                    'subtotal'         => $lineTaxable,
                    'total'            => $lineTotal,
                ];
            }

            $shipping = (float) ($validated['shipping_charges'] ?? 0);
            $other    = (float) ($validated['other_charges'] ?? 0);
            $roundOff = (float) ($validated['round_off'] ?? 0);
            $totalTax = $cgstTotal + $sgstTotal + $igstTotal;
            $grandTotal = round($taxableTotal + $totalTax + $shipping + $other + $roundOff, 2);

            $quotation = Quotation::create([
                'quotation_number'     => $quotationNumber,
                'reference_no'          => $quotationNumber,
                'company_id'           => $validated['company_id'],
                'branch_id'            => $validated['branch_id'] ?? null,
                'customer_id'          => $validated['customer_id'] ?? null,
                'customer_name'        => $validated['customer_name'],
                'customer_email'       => $validated['customer_email'] ?? null,
                'customer_phone'       => $validated['customer_phone'] ?? null,
                'billing_address'      => $validated['billing_address'] ?? null,
                'shipping_address'     => $validated['shipping_address'] ?? null,
                'gstin'                => $validated['gstin'] ?? null,
                'pan'                  => $validated['pan'] ?? null,
                'quotation_date'       => $validated['quotation_date'],
                'valid_until'          => $validated['valid_until'] ?? null,
                'status'               => $validated['status'] ?? 'draft',
                'subtotal'             => round($subtotal, 2),
                'discount_amount'      => round($discountTotal, 2),
                'taxable_amount'       => round($taxableTotal, 2),
                'tax_amount'           => round($totalTax, 2),
                'cgst_amount'          => round($cgstTotal, 2),
                'sgst_amount'          => round($sgstTotal, 2),
                'igst_amount'          => round($igstTotal, 2),
                'shipping_charges'     => round($shipping, 2),
                'other_charges'        => round($other, 2),
                'round_off'            => round($roundOff, 2),
                'total_amount'         => $grandTotal,
                'notes'                => $validated['notes'] ?? null,
                'terms_and_conditions' => $validated['terms_and_conditions'] ?? null,
                'assigned_to'          => $validated['assigned_to'] ?? null,
                'created_by'           => Auth::id(),
            ]);

            foreach ($itemsToInsert as $item) {
                $quotation->items()->create($item);
            }

            return $quotation->load(['items.product', 'customer', 'company', 'branch']);
        });

        return response()->json([
            'success' => true,
            'message' => 'Quotation created successfully',
            'data'    => $quotation,
        ], 201);
    }

    /**
     * Update an existing quotation.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $quotation = Quotation::findOrFail($id);

        if ($quotation->status === 'converted') {
            return response()->json([
                'success' => false,
                'message' => 'Converted quotations cannot be modified.',
            ], 422);
        }

        $validated = $request->validate([
            'customer_id'          => 'nullable|exists:customers,id',
            'customer_name'        => 'required|string|max:255',
            'customer_email'       => 'nullable|email|max:255',
            'customer_phone'       => 'nullable|string|max:30',
            'billing_address'      => 'nullable|string',
            'shipping_address'     => 'nullable|string',
            'gstin'                => 'nullable|string|max:25',
            'pan'                  => 'nullable|string|max:25',
            'quotation_date'       => 'required|date',
            'valid_until'          => 'nullable|date',
            'status'               => 'nullable|string|in:draft,sent,accepted,rejected,converted',
            'shipping_charges'     => 'nullable|numeric|min:0',
            'other_charges'        => 'nullable|numeric|min:0',
            'round_off'            => 'nullable|numeric',
            'notes'                => 'nullable|string',
            'terms_and_conditions' => 'nullable|string',
            'assigned_to'          => 'nullable|exists:users,id',
            'items'                => 'required|array|min:1',
            'items.*.product_id'       => 'nullable|exists:products,id',
            'items.*.item_name'        => 'required|string|max:255',
            'items.*.description'      => 'nullable|string',
            'items.*.hsn_code'         => 'nullable|string|max:30',
            'items.*.quantity'         => 'required|numeric|min:0.01',
            'items.*.unit_price'       => 'required|numeric|min:0',
            'items.*.discount_percent' => 'nullable|numeric|min:0|max:100',
            'items.*.discount_amount'  => 'nullable|numeric|min:0',
            'items.*.gst_slab'         => 'nullable|numeric|min:0',
            'items.*.is_inter_state'   => 'nullable|boolean',
        ]);

        $quotation = DB::transaction(function () use ($quotation, $validated) {
            $subtotal      = 0;
            $discountTotal = 0;
            $taxableTotal  = 0;
            $cgstTotal     = 0;
            $sgstTotal     = 0;
            $igstTotal     = 0;

            $itemsToInsert = [];

            foreach ($validated['items'] as $itemData) {
                $qty       = (float) $itemData['quantity'];
                $unitPrice = (float) $itemData['unit_price'];
                $lineGross = $qty * $unitPrice;

                $discPercent = (float) ($itemData['discount_percent'] ?? 0);
                $discAmount  = (float) ($itemData['discount_amount'] ?? 0);
                if ($discPercent > 0) {
                    $discAmount = round(($lineGross * $discPercent) / 100, 2);
                }
                $discAmount = min($lineGross, $discAmount);
                $lineTaxable = max(0, $lineGross - $discAmount);

                $gstSlab      = (float) ($itemData['gst_slab'] ?? 0);
                $isInterState = (bool) ($itemData['is_inter_state'] ?? false);

                $cgstPercent = 0;
                $sgstPercent = 0;
                $igstPercent = 0;
                $cgstAmount  = 0;
                $sgstAmount  = 0;
                $igstAmount  = 0;

                if ($gstSlab > 0) {
                    if ($isInterState) {
                        $igstPercent = $gstSlab;
                        $igstAmount  = round(($lineTaxable * $igstPercent) / 100, 2);
                    } else {
                        $cgstPercent = $gstSlab / 2;
                        $sgstPercent = $gstSlab / 2;
                        $cgstAmount  = round(($lineTaxable * $cgstPercent) / 100, 2);
                        $sgstAmount  = round(($lineTaxable * $sgstPercent) / 100, 2);
                    }
                }

                $taxAmount = $cgstAmount + $sgstAmount + $igstAmount;
                $lineTotal = round($lineTaxable + $taxAmount, 2);

                $subtotal      += $lineGross;
                $discountTotal += $discAmount;
                $taxableTotal  += $lineTaxable;
                $cgstTotal     += $cgstAmount;
                $sgstTotal     += $sgstAmount;
                $igstTotal     += $igstAmount;

                $itemsToInsert[] = [
                    'product_id'       => $itemData['product_id'] ?? null,
                    'item_name'        => $itemData['item_name'],
                    'description'      => $itemData['description'] ?? null,
                    'hsn_code'         => $itemData['hsn_code'] ?? null,
                    'quantity'         => $qty,
                    'unit_price'       => $unitPrice,
                    'discount_percent' => $discPercent,
                    'discount_amount'  => $discAmount,
                    'gst_slab'         => $gstSlab,
                    'is_inter_state'   => $isInterState,
                    'cgst_percent'     => $cgstPercent,
                    'sgst_percent'     => $sgstPercent,
                    'igst_percent'     => $igstPercent,
                    'cgst_amount'      => $cgstAmount,
                    'sgst_amount'      => $sgstAmount,
                    'igst_amount'      => $igstAmount,
                    'tax_rate'         => $gstSlab,
                    'tax_amount'       => $taxAmount,
                    'subtotal'         => $lineTaxable,
                    'total'            => $lineTotal,
                ];
            }

            $shipping = (float) ($validated['shipping_charges'] ?? 0);
            $other    = (float) ($validated['other_charges'] ?? 0);
            $roundOff = (float) ($validated['round_off'] ?? 0);
            $totalTax = $cgstTotal + $sgstTotal + $igstTotal;
            $grandTotal = round($taxableTotal + $totalTax + $shipping + $other + $roundOff, 2);

            $quotation->update([
                'customer_id'          => $validated['customer_id'] ?? null,
                'customer_name'        => $validated['customer_name'],
                'customer_email'       => $validated['customer_email'] ?? null,
                'customer_phone'       => $validated['customer_phone'] ?? null,
                'billing_address'      => $validated['billing_address'] ?? null,
                'shipping_address'     => $validated['shipping_address'] ?? null,
                'gstin'                => $validated['gstin'] ?? null,
                'pan'                  => $validated['pan'] ?? null,
                'quotation_date'       => $validated['quotation_date'],
                'valid_until'          => $validated['valid_until'] ?? null,
                'status'               => $validated['status'] ?? $quotation->status,
                'subtotal'             => round($subtotal, 2),
                'discount_amount'      => round($discountTotal, 2),
                'taxable_amount'       => round($taxableTotal, 2),
                'tax_amount'           => round($totalTax, 2),
                'cgst_amount'          => round($cgstTotal, 2),
                'sgst_amount'          => round($sgstTotal, 2),
                'igst_amount'          => round($igstTotal, 2),
                'shipping_charges'     => round($shipping, 2),
                'other_charges'        => round($other, 2),
                'round_off'            => round($roundOff, 2),
                'total_amount'         => $grandTotal,
                'notes'                => $validated['notes'] ?? null,
                'terms_and_conditions' => $validated['terms_and_conditions'] ?? null,
                'assigned_to'          => $validated['assigned_to'] ?? null,
            ]);

            // Recreate line items
            $quotation->items()->delete();
            foreach ($itemsToInsert as $item) {
                $quotation->items()->create($item);
            }

            return $quotation->load(['items.product', 'customer', 'company', 'branch']);
        });

        return response()->json([
            'success' => true,
            'message' => 'Quotation updated successfully',
            'data'    => $quotation,
        ]);
    }

    /**
     * Update quotation status (sent, accepted, rejected, etc.).
     */
    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $quotation = Quotation::findOrFail($id);

        if ($quotation->status === 'converted') {
            return response()->json([
                'success' => false,
                'message' => 'Converted quotations cannot change status.',
            ], 422);
        }

        $validated = $request->validate([
            'status'           => 'required|in:draft,sent,accepted,rejected',
            'rejection_reason' => 'nullable|string|max:1000',
            'follow_up_date'   => 'nullable|date',
        ]);

        $quotation->status           = $validated['status'];
        $quotation->rejection_reason = $validated['rejection_reason'] ?? null;
        $quotation->follow_up_date   = $validated['follow_up_date'] ?? null;
        $quotation->save();

        return response()->json([
            'success' => true,
            'message' => "Quotation status updated to {$quotation->status}",
            'data'    => $quotation,
        ]);
    }

    /**
     * Convert an accepted quotation to a Sales Invoice.
     * Enforces atomicity, duplicate prevention, and stock policy.
     */
    public function convert(Request $request, int $id): JsonResponse
    {
        $quotation = Quotation::with(['items', 'customer'])->findOrFail($id);

        if ($quotation->status === 'converted' || $quotation->converted_invoice_id) {
            return response()->json([
                'success' => false,
                'message' => 'This quotation has already been converted to an invoice.',
                'invoice_id' => $quotation->converted_invoice_id,
            ], 422);
        }

        $validated = $request->validate([
            'invoice_date'      => 'nullable|date',
            'due_date'          => 'nullable|date',
            'auto_deduct_stock' => 'nullable|boolean',
            'warehouse_id'      => 'nullable|exists:warehouses,id',
            'payment_term'      => 'nullable|string|max:100',
        ]);

        $invoiceDate     = $validated['invoice_date'] ?? now()->toDateString();
        $dueDate         = $validated['due_date'] ?? now()->addDays(15)->toDateString();
        $autoDeductStock = $validated['auto_deduct_stock'] ?? true;
        $warehouseId     = $validated['warehouse_id'] ?? null;

        $createdInvoice = DB::transaction(function () use ($quotation, $invoiceDate, $dueDate, $autoDeductStock, $warehouseId, $validated) {
            // Lock quotation for update to guarantee no concurrent conversion
            $lockedQuotation = Quotation::where('id', $quotation->id)->lockForUpdate()->first();
            if ($lockedQuotation->status === 'converted' || $lockedQuotation->converted_invoice_id) {
                abort(422, 'Quotation was converted by another process.');
            }

            // Generate unique invoice number
            $year = date('Y');
            $lastInvoice = Invoice::withTrashed()
                ->whereYear('created_at', $year)
                ->orderBy('id', 'desc')
                ->first();

            $lastNumber = 0;
            if ($lastInvoice && $lastInvoice->invoice_no && preg_match('/(\d+)$/', $lastInvoice->invoice_no, $m)) {
                $lastNumber = (int) $m[1];
            }
            $nextInvoiceNo = sprintf('INV-%s-%04d', $year, $lastNumber + 1);

            // Create Invoice
            $invoice = Invoice::create([
                'company_id'       => $quotation->company_id,
                'branch_id'        => $quotation->branch_id,
                'customer_id'      => $quotation->customer_id,
                'quotation_id'     => $quotation->id,
                'invoice_no'       => $nextInvoiceNo,
                'invoice_date'     => $invoiceDate,
                'due_date'         => $dueDate,
                'status'           => 'issued',
                'customer_name'    => $quotation->customer_name,
                'contact_person'   => $quotation->customer_name,
                'contact_no'       => $quotation->customer_phone,
                'gstin'            => $quotation->gstin,
                'pan'              => $quotation->pan,
                'billing_street'   => $quotation->billing_address,
                'shipping_street'  => $quotation->shipping_address,
                'subtotal'         => $quotation->subtotal,
                'discount_amount'  => $quotation->discount_amount,
                'tax_amount'       => $quotation->tax_amount,
                'total_amount'     => $quotation->total_amount,
                'round_off'        => $quotation->round_off,
                'payment_term'     => $validated['payment_term'] ?? 'Net 15',
                'document_note'    => "Converted from Quotation #{$quotation->quotation_number}",
                'terms_detail'     => $quotation->terms_and_conditions,
            ]);

            // Create line items
            foreach ($quotation->items as $item) {
                $invoiceItem = InvoiceItem::create([
                    'invoice_id'       => $invoice->id,
                    'product_id'       => $item->product_id,
                    'quantity'         => $item->quantity,
                    'unit_price'       => $item->unit_price,
                    'discount_percent' => $item->discount_percent,
                    'discount_amount'  => $item->discount_amount,
                    'gst_slab'         => $item->gst_slab,
                    'is_inter_state'   => $item->is_inter_state,
                    'cgst_percent'     => $item->cgst_percent,
                    'sgst_percent'     => $item->sgst_percent,
                    'igst_percent'     => $item->igst_percent,
                    'cgst_amount'      => $item->cgst_amount,
                    'sgst_amount'      => $item->sgst_amount,
                    'igst_amount'      => $item->igst_amount,
                    'tax_rate'         => $item->tax_rate,
                    'subtotal'         => $item->subtotal,
                    'total'            => $item->total,
                ]);

                // Stock deduction if enabled and item has a product
                if ($autoDeductStock && !empty($item->product_id)) {
                    $product = Product::lockForUpdate()->find($item->product_id);
                    if ($product) {
                        $targetWarehouseId = $warehouseId;
                        if (!$targetWarehouseId) {
                            $targetWarehouseId = Warehouse::where('company_id', $quotation->company_id)->value('id');
                        }

                        if ($targetWarehouseId) {
                            $pws = ProductWarehouseStock::firstOrCreate(
                                ['product_id' => $product->id, 'warehouse_id' => $targetWarehouseId],
                                ['quantity' => 0]
                            );
                            $stockBefore = (float) $pws->quantity;
                            $stockAfter  = $stockBefore - (float) $item->quantity;
                            $pws->quantity = $stockAfter;
                            $pws->save();

                            $product->stock_quantity = (float) ($product->stock_quantity ?? 0) - (float) $item->quantity;
                            $product->save();

                            StockMovement::create([
                                'product_id'       => $product->id,
                                'warehouse_id'     => $targetWarehouseId,
                                'company_id'       => $quotation->company_id,
                                'branch_id'        => $quotation->branch_id,
                                'transaction_type' => 'OUT',
                                'reference_type'   => 'sale',
                                'reference_id'     => $invoice->id,
                                'quantity'         => (float) $item->quantity,
                                'unit_price'       => (float) $item->unit_price,
                                'stock_before'     => $stockBefore,
                                'stock_after'      => $stockAfter,
                                'remark'           => "Invoice #{$invoice->invoice_no} (Converted from Quote #{$quotation->quotation_number})",
                                'transaction_date' => $invoiceDate,
                                'created_by'       => Auth::id(),
                            ]);
                        }
                    }
                }
            }

            // Mark quotation as converted
            $lockedQuotation->update([
                'status'               => 'converted',
                'converted_invoice_id' => $invoice->id,
                'converted_at'         => now(),
            ]);

            return $invoice->load(['items.product', 'customer']);
        });

        return response()->json([
            'success'    => true,
            'message'    => "Quotation successfully converted to Invoice #{$createdInvoice->invoice_no}",
            'invoice'    => $createdInvoice,
            'quotation'  => $quotation->fresh(),
        ]);
    }

    /**
     * Duplicate an existing quotation into a new draft copy.
     */
    public function duplicate(int $id): JsonResponse
    {
        $original = Quotation::with('items')->findOrFail($id);

        $newNumber = $this->resolveQuotationNumber();

        $copy = DB::transaction(function () use ($original, $newNumber) {
            $clone = $original->replicate([
                'quotation_number',
                'status',
                'converted_invoice_id',
                'converted_at',
                'rejection_reason',
            ]);

            $clone->quotation_number = $newNumber;
            $clone->reference_no = $newNumber;
            $clone->quotation_date   = now()->toDateString();
            $clone->valid_until      = now()->addDays(30)->toDateString();
            $clone->status           = 'draft';
            $clone->created_by       = Auth::id();
            $clone->save();

            foreach ($original->items as $item) {
                $itemClone = $item->replicate(['quotation_id']);
                $itemClone->quotation_id = $clone->id;
                $itemClone->save();
            }

            return $clone->load('items.product');
        });

        return response()->json([
            'success' => true,
            'message' => "Quotation duplicated as {$copy->quotation_number}",
            'data'    => $copy,
        ]);
    }

    /**
     * Delete a quotation.
     */
    public function destroy(int $id): JsonResponse
    {
        $quotation = Quotation::findOrFail($id);

        if ($quotation->status === 'converted') {
            return response()->json([
                'success' => false,
                'message' => 'Cannot delete a quotation that has already been converted to an invoice.',
            ], 422);
        }

        $quotation->delete();

        return response()->json([
            'success' => true,
            'message' => 'Quotation deleted successfully',
        ]);
    }

    /**
     * Helper to resolve the next unique quotation number.
     */
    private function resolveQuotationNumber(?string $preferred = null): string
    {
        $preferred = trim((string) ($preferred ?? ''));
        if ($preferred !== '' && !Quotation::withTrashed()->where('quotation_number', $preferred)->exists()) {
            return $preferred;
        }

        $year = date('Y');
        $lastQuote = Quotation::withTrashed()
            ->whereYear('created_at', $year)
            ->orderBy('id', 'desc')
            ->first();

        $lastNumber = 0;
        if ($lastQuote && $lastQuote->quotation_number && preg_match('/(\d+)$/', $lastQuote->quotation_number, $matches)) {
            $lastNumber = (int) $matches[1];
        }

        return sprintf('QT-%s-%04d', $year, $lastNumber + 1);
    }
}
