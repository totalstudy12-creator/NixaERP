<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\Product;
use App\Models\ProductWarehouseStock;
use App\Models\StockMovement;
use App\Models\Warehouse;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;

class InvoiceController extends Controller
{
    /**
     * Display a listing of invoices with production-grade server-side
     * filtering, searching, sorting and pagination.
     *
     * Each row also exposes `received_amount` and `outstanding_amount`
     * (computed in a single correlated sub-select — no N+1 queries).
     */
    public function index(Request $request)
    {
        $perPage = min(
            max((int) $request->input('per_page', 15), 1),
            100
        );

        $receivedSubquery = DB::table('payments')
            ->selectRaw('COALESCE(SUM(payments.amount), 0)')
            ->whereColumn('payments.invoice_id', 'invoices.id')
            ->where('payments.payment_direction', 'inward')
            ->whereNull('payments.deleted_at');

        $query = $this->filteredQuery($request)
            ->select('invoices.*')
            ->selectSub($receivedSubquery, 'received_amount')
            ->with([
                'company',
                'branch',
                'customer',
                'items.product',
            ]);

        $sortBy = $request->input('sort_by', 'created_at');
        $sortDir = strtolower($request->input('sort_dir', 'desc')) === 'asc'
            ? 'asc'
            : 'desc';

        $allowedSorts = [
            'id',
            'invoice_no',
            'invoice_date',
            'due_date',
            'total_amount',
            'tax_amount',
            'discount_amount',
            'status',
            'created_at',
            'updated_at',
        ];

        if (! in_array($sortBy, $allowedSorts, true)) {
            $sortBy = 'created_at';
        }

        $query->orderBy($sortBy, $sortDir);

        if ($sortBy !== 'id') {
            $query->orderBy('id', 'desc');
        }

        $paginator = $query->paginate(
            $perPage,
            ['*'],
            'page',
            max((int) $request->input('page', 1), 1)
        );

        $paginator->through(function (Invoice $invoice) {
            $received = (float) ($invoice->received_amount ?? 0);
            $total    = (float) ($invoice->total_amount ?? 0);

            $invoice->received_amount    = round($received, 2);
            $invoice->outstanding_amount = round(
                max(0, $total - $received),
                2
            );

            return $invoice;
        });

        $paginator->appends(
            $request->except('page')
        );

        return response()->json($paginator);
    }

    /**
     * Return real invoice statistics for the current filter scope.
     */
    public function summary(Request $request)
    {
        $query = $this->filteredQuery($request);

        $receivedSubquery = DB::table('payments')
            ->selectRaw('COALESCE(SUM(payments.amount), 0)')
            ->whereColumn('payments.invoice_id', 'invoices.id')
            ->where('payments.payment_direction', 'inward')
            ->whereNull('payments.deleted_at');

        $invoiceRows = (clone $query)
            ->select([
                'invoices.id',
                'invoices.total_amount',
                'invoices.tax_amount',
                'invoices.status',
                'invoices.due_date',
            ])
            ->selectSub(
                $receivedSubquery,
                'received_amount'
            );

        $invoiceRows = DB::query()
            ->fromSub(
                $invoiceRows->toBase(),
                'invoice_rows'
            )
            ->selectRaw('
                COUNT(*) AS total_invoices,

                COALESCE(SUM(total_amount), 0) AS total_amount,

                COALESCE(SUM(tax_amount), 0) AS tax_amount,

                COALESCE(SUM(received_amount), 0) AS received_amount,

                COALESCE(
                    SUM(
                        CASE
                            WHEN total_amount - received_amount > 0
                                THEN total_amount - received_amount
                            ELSE 0
                        END
                    ),
                    0
                ) AS outstanding_amount,

                SUM(
                    CASE
                        WHEN status = "paid" THEN 1
                        ELSE 0
                    END
                ) AS paid_count,

                SUM(
                    CASE
                        WHEN status = "partial" THEN 1
                        ELSE 0
                    END
                ) AS partial_count,

                SUM(
                    CASE
                        WHEN status IN ("unpaid", "issued", "pending")
                        THEN 1
                        ELSE 0
                    END
                ) AS unpaid_count,

                SUM(
                    CASE
                        WHEN status = "draft" THEN 1
                        ELSE 0
                    END
                ) AS draft_count,

                SUM(
                    CASE
                        WHEN due_date IS NOT NULL
                             AND due_date < CURRENT_DATE
                             AND total_amount - received_amount > 0
                        THEN 1
                        ELSE 0
                    END
                ) AS overdue_count
            ')
            ->first();

        $todayRequest = clone $request;

        $todayRequest->request->remove('date_from');
        $todayRequest->request->remove('date_to');
        $todayRequest->request->remove('due_from');
        $todayRequest->request->remove('due_to');

        $todayQuery = $this->filteredQuery($todayRequest)
            ->whereDate(
                DB::raw('COALESCE(invoices.invoice_date, invoices.created_at)'),
                now()->toDateString()
            );

        $todaySummary = $todayQuery
            ->selectRaw('
                COUNT(*) AS invoice_count,
                COALESCE(SUM(invoices.total_amount), 0) AS sales_amount
            ')
            ->first();

        return response()->json([
            'success' => true,
            'data' => [
                'total_invoices' => (int) ($invoiceRows->total_invoices ?? 0),

                'total_amount' => round(
                    (float) ($invoiceRows->total_amount ?? 0),
                    2
                ),

                'tax_amount' => round(
                    (float) ($invoiceRows->tax_amount ?? 0),
                    2
                ),

                'received_amount' => round(
                    (float) ($invoiceRows->received_amount ?? 0),
                    2
                ),

                'outstanding_amount' => round(
                    (float) ($invoiceRows->outstanding_amount ?? 0),
                    2
                ),

                'paid_count' => (int) ($invoiceRows->paid_count ?? 0),

                'partial_count' => (int) ($invoiceRows->partial_count ?? 0),

                'unpaid_count' => (int) ($invoiceRows->unpaid_count ?? 0),

                'draft_count' => (int) ($invoiceRows->draft_count ?? 0),

                'overdue_count' => (int) ($invoiceRows->overdue_count ?? 0),

                'today_count' => (int) ($todaySummary->invoice_count ?? 0),

                'today_amount' => round(
                    (float) ($todaySummary->sales_amount ?? 0),
                    2
                ),
            ],

            'filters' => [
                'search' => $request->input('search'),
                'company_id' => $request->input('company_id'),
                'branch_id' => $request->input('branch_id'),
                'customer_id' => $request->input('customer_id'),
                'status' => $request->input('status'),
                'payment_state' => $request->input('payment_state'),
                'date_from' => $request->input('date_from'),
                'date_to' => $request->input('date_to'),
                'due_from' => $request->input('due_from'),
                'due_to' => $request->input('due_to'),
            ],
        ]);
    }

    /**
     * Build the common invoice query used by index() and summary().
     */
    private function filteredQuery(Request $request): Builder
    {
        $query = Invoice::query();

        if ($request->filled('company_id')) {
            $query->where(
                'invoices.company_id',
                (int) $request->input('company_id')
            );
        }

        if ($request->filled('branch_id')) {
            $query->where(
                'invoices.branch_id',
                (int) $request->input('branch_id')
            );
        }

        if ($request->filled('customer_id')) {
            $query->where(
                'invoices.customer_id',
                (int) $request->input('customer_id')
            );
        }

        if ($request->filled('status')) {
            $status = trim((string) $request->input('status'));

            if ($status === 'overdue') {
                $query->whereNotNull('invoices.due_date')
                    ->whereDate(
                        'invoices.due_date',
                        '<',
                        now()->toDateString()
                    )
                    ->whereRaw(
                        '(invoices.total_amount - COALESCE((
                            SELECT SUM(p.amount)
                            FROM payments p
                            WHERE p.invoice_id = invoices.id
                              AND p.payment_direction = ?
                              AND p.deleted_at IS NULL
                        ), 0)) > 0',
                        ['inward']
                    );
            } else {
                $query->where(
                    'invoices.status',
                    $status
                );
            }
        }

        if ($request->filled('payment_state')) {
            $paymentState = trim(
                strtolower((string) $request->input('payment_state'))
            );

            $receivedSql = 'COALESCE((
                SELECT SUM(p.amount)
                FROM payments p
                WHERE p.invoice_id = invoices.id
                  AND p.payment_direction = ?
                  AND p.deleted_at IS NULL
            ), 0)';

            switch ($paymentState) {
                case 'paid':
                    $query->whereRaw(
                        "($receivedSql) >= invoices.total_amount",
                        ['inward']
                    );
                    break;

                case 'partial':
                    $query->whereRaw(
                        "($receivedSql) > 0",
                        ['inward']
                    )->whereRaw(
                        "($receivedSql) < invoices.total_amount",
                        ['inward']
                    );
                    break;

                case 'unpaid':
                    $query->whereRaw(
                        "($receivedSql) <= 0",
                        ['inward']
                    );
                    break;

                case 'overdue':
                    $query->whereNotNull('invoices.due_date')
                        ->whereDate(
                            'invoices.due_date',
                            '<',
                            now()->toDateString()
                        )
                        ->whereRaw(
                            "(invoices.total_amount - ($receivedSql)) > 0",
                            ['inward']
                        );
                    break;
            }
        }

        if ($request->filled('date_from')) {
            $query->whereDate(
                DB::raw('COALESCE(invoices.invoice_date, invoices.created_at)'),
                '>=',
                $request->input('date_from')
            );
        }

        if ($request->filled('date_to')) {
            $query->whereDate(
                DB::raw('COALESCE(invoices.invoice_date, invoices.created_at)'),
                '<=',
                $request->input('date_to')
            );
        }

        if ($request->filled('due_from')) {
            $query->whereDate(
                'invoices.due_date',
                '>=',
                $request->input('due_from')
            );
        }

        if ($request->filled('due_to')) {
            $query->whereDate(
                'invoices.due_date',
                '<=',
                $request->input('due_to')
            );
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));

            if ($search !== '') {
                $like = '%' . $search . '%';

                $query->where(function (Builder $searchQuery) use ($like) {
                    $searchQuery
                        ->where('invoices.invoice_no', 'like', $like)
                        ->orWhere('invoices.gstin', 'like', $like)
                        ->orWhere('invoices.pan', 'like', $like)
                        ->orWhere('invoices.po_no', 'like', $like)
                        ->orWhere('invoices.challan_no', 'like', $like)
                        ->orWhere('invoices.lr_no', 'like', $like)
                        ->orWhere('invoices.eway_no', 'like', $like)
                        ->orWhere('invoices.contact_no', 'like', $like)
                        ->orWhere('invoices.customer_name', 'like', $like)

                        ->orWhereHas(
                            'customer',
                            function (Builder $customerQuery) use ($like) {
                                $customerQuery
                                    ->where('name', 'like', $like)
                                    ->orWhere('email', 'like', $like)
                                    ->orWhere('phone', 'like', $like)
                                    ->orWhere('contact_person', 'like', $like)
                                    ->orWhere('gst_number', 'like', $like)
                                    ->orWhere('pan', 'like', $like);
                            }
                        )

                        ->orWhereHas(
                            'company',
                            function (Builder $companyQuery) use ($like) {
                                $companyQuery
                                    ->where('name', 'like', $like)
                                    ->orWhere('code', 'like', $like)
                                    ->orWhere('gst_number', 'like', $like);
                            }
                        )

                        ->orWhereHas(
                            'branch',
                            function (Builder $branchQuery) use ($like) {
                                $branchQuery
                                    ->where('name', 'like', $like)
                                    ->orWhere('code', 'like', $like);
                            }
                        );
                });
            }
        }

        return $query;
    }

    /**
     * Get the next invoice number.
     */
    public function nextNumber()
    {
        return response()->json([
            'success' => true,
            'next_invoice_no' => $this->resolveInvoiceNumber(),
        ]);
    }

    /**
     * Store a newly created invoice with items.
     *
     * Runs in a single transaction:
     *   1. Create invoice header
     *   2. Create line items
     *   3. Recalculate totals and persist
     *   4. Deduct stock (OUT) for every line item, dated to invoice_date
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'company_id' => [
                'required',
                'exists:companies,id',
            ],

            'branch_id' => [
                'nullable',
                Rule::exists('branches', 'id')
                    ->where(
                        fn ($query) => $query->where(
                            'company_id',
                            $request->input('company_id')
                        )
                    ),
            ],

            'customer_id' => [
                'required',
                Rule::exists('customers', 'id')
                    ->where(
                        fn ($query) => $query->where(
                            'company_id',
                            $request->input('company_id')
                        )
                    ),
            ],

            'customer_name' => 'nullable|string|max:255',

            'billing_street' => 'nullable|string',
            'billing_city' => 'nullable|string',
            'billing_state' => 'nullable|string',
            'billing_country' => 'nullable|string',
            'billing_pincode' => 'nullable|string',

            'shipping_street' => 'nullable|string',
            'shipping_city' => 'nullable|string',
            'shipping_state' => 'nullable|string',
            'shipping_country' => 'nullable|string',
            'shipping_pincode' => 'nullable|string',

            'contact_person' => 'nullable|string|max:100',
            'contact_no' => 'nullable|string|max:20',
            'gstin' => 'nullable|string|max:50',
            'pan' => 'nullable|string|max:50',
            'invoice_type' => 'nullable|string|max:50',

            'invoice_no' => 'nullable|string|max:100|unique:invoices,invoice_no',

            'invoice_date' => 'nullable|date',

            'challan_no' => 'nullable|string|max:100',
            'challan_date' => 'nullable|date',

            'po_no' => 'nullable|string|max:100',
            'po_date' => 'nullable|date',

            'lr_no' => 'nullable|string|max:100',
            'eway_no' => 'nullable|string|max:100',

            'delivery_mode' => 'nullable|string|max:50',
            'payment_term' => 'nullable|string|max:100',

            'bank_id' => 'nullable|exists:banks,id',

            'packing_charges' => 'nullable|numeric|min:0',

            'general_discount_percent' => 'nullable|numeric|min:0',

            'general_discount_amount' => 'nullable|numeric|min:0',

            'tcs_percent' => 'nullable|numeric|min:0',

            'terms_title' => 'nullable|string',
            'terms_detail' => 'nullable|string',
            'document_note' => 'nullable|string',
            'internal_note' => 'nullable|string',

            'additional_charges' => 'nullable|array',

            'additional_charges.*.label' => 'nullable|string',

            'additional_charges.*.amount' => 'nullable|numeric|min:0',

            'status' => 'nullable|string|max:50',

            'items' => 'required|array|min:1',

            'items.*.product_id' => 'required|exists:products,id',

            'items.*.quantity' => 'required|numeric|min:0.01',

            'items.*.unit_price' => 'required|numeric|min:0',

            'items.*.discount_type' => 'nullable|string|in:percent,amount',

            'items.*.discount_percent' => 'nullable|numeric|min:0',

            'items.*.discount_amount' => 'nullable|numeric|min:0',

            'items.*.gst_slab' => 'nullable|numeric|min:0',

            'items.*.is_inter_state' => 'nullable|boolean',

            'items.*.cgst_percent' => 'nullable|numeric|min:0',

            'items.*.sgst_percent' => 'nullable|numeric|min:0',

            'items.*.igst_percent' => 'nullable|numeric|min:0',

            'items.*.cgst_amount' => 'nullable|numeric|min:0',

            'items.*.sgst_amount' => 'nullable|numeric|min:0',

            'items.*.igst_amount' => 'nullable|numeric|min:0',

            'items.*.total' => 'nullable|numeric|min:0',
        ]);

        $data['invoice_no'] = $this->resolveInvoiceNumber(
            $data['invoice_no'] ?? null
        );

        if (empty($data['invoice_date'])) {
            $data['invoice_date'] = now()->toDateString();
        }

        if (empty($data['status'])) {
            $data['status'] = 'issued';
        }

        $actorId    = Auth::id();
        $actorUser  = Auth::user();
        $actorName  = $actorUser?->name;
        $actorEmail = $actorUser?->email;

        return DB::transaction(function () use (
            $data,
            $actorId,
            $actorName,
            $actorEmail
        ) {
            $invoice = Invoice::create($data);

            $subtotal = 0;
            $totalDiscount = 0;
            $totalTax = 0;

            foreach ($data['items'] as $item) {
                $qty = (float) $item['quantity'];
                $price = (float) $item['unit_price'];
                $itemSubtotal = $qty * $price;

                $discountType = $item['discount_type'] ?? 'percent';

                $discountAmount = $discountType === 'amount'
                    ? (float) ($item['discount_amount'] ?? 0)
                    : $itemSubtotal
                        * ((float) ($item['discount_percent'] ?? 0) / 100);

                $discountAmount = min(
                    max($discountAmount, 0),
                    $itemSubtotal
                );

                $afterDiscount = max(0, $itemSubtotal - $discountAmount);
                $gstSlab = (float) ($item['gst_slab'] ?? 0);
                $isInterState = (bool) ($item['is_inter_state'] ?? false);

                $cgstAmount = 0;
                $sgstAmount = 0;
                $igstAmount = 0;

                if ($gstSlab > 0) {
                    if ($isInterState) {
                        $igstAmount = $afterDiscount * ($gstSlab / 100);
                    } else {
                        $half = $gstSlab / 2;
                        $cgstAmount = $afterDiscount * ($half / 100);
                        $sgstAmount = $cgstAmount;
                    }
                }

                $itemTotal = $afterDiscount
                    + $cgstAmount
                    + $sgstAmount
                    + $igstAmount;

                $subtotal += $itemSubtotal;
                $totalDiscount += $discountAmount;
                $totalTax += $cgstAmount + $sgstAmount + $igstAmount;

                InvoiceItem::create([
                    'invoice_id' => $invoice->id,
                    'product_id' => $item['product_id'],
                    'quantity' => $qty,
                    'unit_price' => $price,
                    'discount_type' => $discountType,
                    'discount_percent' => $item['discount_percent'] ?? 0,
                    'discount_amount' => round($discountAmount, 2),
                    'gst_slab' => $gstSlab,
                    'is_inter_state' => $isInterState,
                    'cgst_percent' => $isInterState ? 0 : ($gstSlab / 2),
                    'sgst_percent' => $isInterState ? 0 : ($gstSlab / 2),
                    'igst_percent' => $isInterState ? $gstSlab : 0,
                    'cgst_amount' => round($cgstAmount, 2),
                    'sgst_amount' => round($sgstAmount, 2),
                    'igst_amount' => round($igstAmount, 2),
                    'tax_rate' => $gstSlab,
                    'subtotal' => round($itemSubtotal, 2),
                    'total' => round($itemTotal, 2),
                ]);
            }

            $generalDiscount = 0;

            if (
                ! empty($data['general_discount_percent'])
                && (float) $data['general_discount_percent'] > 0
            ) {
                $generalDiscount =
                    ($subtotal - $totalDiscount)
                    * ((float) $data['general_discount_percent'] / 100);
            } elseif (! empty($data['general_discount_amount'])) {
                $generalDiscount = (float) $data['general_discount_amount'];
            }

            $generalDiscount = min(
                max($generalDiscount, 0),
                max($subtotal - $totalDiscount, 0)
            );

            $packing = (float) ($data['packing_charges'] ?? 0);

            $additionalCharges = collect($data['additional_charges'] ?? [])
                ->sum(fn ($charge) => (float) ($charge['amount'] ?? 0));

            $netBeforeTaxDiscount =
                ($subtotal - $totalDiscount) - $generalDiscount;

            $totalBeforeTcs =
                $netBeforeTaxDiscount
                + $totalTax
                + $packing
                + $additionalCharges;

            $tcsPercent = (float) ($data['tcs_percent'] ?? 0);
            $tcsAmount = $totalBeforeTcs * ($tcsPercent / 100);

            $rawGrandTotal = $totalBeforeTcs + $tcsAmount;
            $grandTotal = round($rawGrandTotal);
            $roundOff = $grandTotal - $rawGrandTotal;

            $invoice->update([
                'subtotal' => round($subtotal, 2),
                'discount_amount' => round($totalDiscount + $generalDiscount, 2),
                'tax_amount' => round($totalTax, 2),
                'tcs_amount' => round($tcsAmount, 2),
                'round_off' => round($roundOff, 2),
                'total_amount' => round($grandTotal, 2),
            ]);

            if (! in_array($invoice->status, ['draft', 'cancelled'], true)) {
                $invoice->load('items');
                $this->deductInvoiceStock($invoice);
            }

            Log::info(
                'Invoice created via API',
                [
                    'invoice_id'       => $invoice->id,
                    'invoice_no'       => $invoice->invoice_no,
                    'company_id'       => $invoice->company_id,
                    'branch_id'        => $invoice->branch_id,
                    'customer_id'      => $invoice->customer_id,
                    'total_amount'     => $invoice->total_amount,
                    'created_by'       => $actorId,
                    'created_by_name'  => $actorName,
                    'created_by_email' => $actorEmail,
                ]
            );

            return $invoice->load([
                'company',
                'branch',
                'customer',
                'items.product',
            ]);
        });
    }

    /**
     * Display the specified invoice with all relations.
     */
    public function show(Invoice $invoice)
    {
        return response()->json(
            $invoice->load([
                'company',
                'branch',
                'customer',
                'items.product',
                'payments',
            ])
        );
    }

    /**
     * Update the invoice header AND its line items.
     *
     * Side effects (all inside a single DB transaction):
     *   1. Recompute every item's tax/total using the same math as `store()`.
     *   2. Sync line items:
     *        • items with an `id` that belongs to this invoice → UPDATE
     *        • items without an `id` (or with an id that doesn't belong) → CREATE
     *        • items present in the DB but absent from the payload → DELETE
     *   3. Recalculate the invoice header totals.
     *   4. Reconcile stock for any line-item delta.
     *   5. Log who performed the update.
     */
    public function update(
        Request $request,
        Invoice $invoice
    ) {
        $data = $request->validate([
            'company_id' => [
                'required',
                'exists:companies,id',
            ],

            'branch_id' => [
                'nullable',
                Rule::exists('branches', 'id')
                    ->where(
                        fn ($query) => $query->where(
                            'company_id',
                            $request->input('company_id')
                        )
                    ),
            ],

            'customer_id' => [
                'required',
                Rule::exists('customers', 'id')
                    ->where(
                        fn ($query) => $query->where(
                            'company_id',
                            $request->input('company_id')
                        )
                    ),
            ],

            'customer_name' => 'nullable|string|max:255',

            'billing_street' => 'nullable|string',
            'billing_city' => 'nullable|string',
            'billing_state' => 'nullable|string',
            'billing_country' => 'nullable|string',
            'billing_pincode' => 'nullable|string',

            'shipping_street' => 'nullable|string',
            'shipping_city' => 'nullable|string',
            'shipping_state' => 'nullable|string',
            'shipping_country' => 'nullable|string',
            'shipping_pincode' => 'nullable|string',

            'contact_person' => 'nullable|string|max:100',
            'contact_no' => 'nullable|string|max:20',
            'gstin' => 'nullable|string|max:50',
            'pan' => 'nullable|string|max:50',
            'invoice_type' => 'nullable|string|max:50',

            'invoice_no' => [
                'required',
                'string',
                'max:100',
                'unique:invoices,invoice_no,' . $invoice->id,
            ],

            'invoice_date' => 'nullable|date',

            'challan_no' => 'nullable|string|max:100',
            'challan_date' => 'nullable|date',

            'po_no' => 'nullable|string|max:100',
            'po_date' => 'nullable|date',

            'lr_no' => 'nullable|string|max:100',
            'eway_no' => 'nullable|string|max:100',

            'delivery_mode' => 'nullable|string|max:50',
            'payment_term' => 'nullable|string|max:100',

            'bank_id' => 'nullable|exists:banks,id',

            'packing_charges' => 'nullable|numeric|min:0',

            'general_discount_percent' => 'nullable|numeric|min:0',

            'general_discount_amount' => 'nullable|numeric|min:0',

            'tcs_percent' => 'nullable|numeric|min:0',

            'terms_title' => 'nullable|string',
            'terms_detail' => 'nullable|string',
            'document_note' => 'nullable|string',
            'internal_note' => 'nullable|string',

            'additional_charges' => 'nullable|array',

            'additional_charges.*.label' => 'nullable|string',

            'additional_charges.*.amount' => 'nullable|numeric|min:0',

            'status' => 'nullable|string|max:50',

            'due_date' => 'nullable|date',

            'notes' => 'nullable|string',

            'items' => 'required|array|min:1',

            'items.*.id' => 'nullable|integer',

            'items.*.product_id' => 'required|exists:products,id',

            'items.*.quantity' => 'required|numeric|min:0.01',

            'items.*.unit_price' => 'required|numeric|min:0',

            'items.*.discount_type' => 'nullable|string|in:percent,amount',

            'items.*.discount_percent' => 'nullable|numeric|min:0',

            'items.*.discount_amount' => 'nullable|numeric|min:0',

            'items.*.gst_slab' => 'nullable|numeric|min:0',

            'items.*.is_inter_state' => 'nullable|boolean',

            'items.*.cgst_percent' => 'nullable|numeric|min:0',

            'items.*.sgst_percent' => 'nullable|numeric|min:0',

            'items.*.igst_percent' => 'nullable|numeric|min:0',

            'items.*.cgst_amount' => 'nullable|numeric|min:0',

            'items.*.sgst_amount' => 'nullable|numeric|min:0',

            'items.*.igst_amount' => 'nullable|numeric|min:0',

            'items.*.total' => 'nullable|numeric|min:0',
        ]);

        $actorId    = Auth::id();
        $actorUser  = Auth::user();
        $actorName  = $actorUser?->name;
        $actorEmail = $actorUser?->email;

        return DB::transaction(function () use (
            $invoice,
            $data,
            $actorId,
            $actorName,
            $actorEmail
        ) {
            // Snapshot original items BEFORE any mutation.
            $invoice->loadMissing('items');
            $originalItems = $invoice->items->map(function (InvoiceItem $item) {
                return [
                    'id'          => (int) $item->id,
                    'product_id'  => (int) $item->product_id,
                    'quantity'    => (float) $item->quantity,
                    'unit_price'  => (float) $item->unit_price,
                ];
            })->all();

            // ── 1. Persist header fields only ──
            $headerKeys = [
                'company_id', 'branch_id', 'customer_id', 'customer_name',
                'billing_street', 'billing_city', 'billing_state',
                'billing_country', 'billing_pincode',
                'shipping_street', 'shipping_city', 'shipping_state',
                'shipping_country', 'shipping_pincode',
                'contact_person', 'contact_no', 'gstin', 'pan',
                'invoice_type', 'invoice_no', 'invoice_date',
                'challan_no', 'challan_date', 'po_no', 'po_date',
                'lr_no', 'eway_no', 'delivery_mode', 'payment_term',
                'bank_id', 'packing_charges', 'general_discount_percent',
                'general_discount_amount', 'tcs_percent',
                'terms_title', 'terms_detail', 'document_note',
                'internal_note', 'additional_charges', 'status',
                'due_date', 'notes',
            ];

            $header = [];
            foreach ($headerKeys as $key) {
                if (array_key_exists($key, $data)) {
                    $header[$key] = $data[$key];
                }
            }

            if (! empty($header)) {
                $invoice->update($header);
            }

            // ── 2. Recompute & persist line items ──
            $subtotal = 0.0;
            $totalDiscount = 0.0;
            $totalTax = 0.0;
            $keptItemIds = [];

            foreach ($data['items'] as $row) {
                $qty = (float) $row['quantity'];
                $price = (float) $row['unit_price'];
                $itemSubtotal = $qty * $price;

                $discountType = $row['discount_type'] ?? 'percent';

                $discountAmount = $discountType === 'amount'
                    ? (float) ($row['discount_amount'] ?? 0)
                    : $itemSubtotal
                        * ((float) ($row['discount_percent'] ?? 0) / 100);

                $discountAmount = min(max($discountAmount, 0), $itemSubtotal);
                $afterDiscount = max(0, $itemSubtotal - $discountAmount);

                $gstSlab = (float) ($row['gst_slab'] ?? 0);
                $isInterState = (bool) ($row['is_inter_state'] ?? false);

                $cgstAmount = 0.0;
                $sgstAmount = 0.0;
                $igstAmount = 0.0;

                if ($gstSlab > 0) {
                    if ($isInterState) {
                        $igstAmount = $afterDiscount * ($gstSlab / 100);
                    } else {
                        $half = $gstSlab / 2;
                        $cgstAmount = $afterDiscount * ($half / 100);
                        $sgstAmount = $cgstAmount;
                    }
                }

                $itemTotal = $afterDiscount + $cgstAmount + $sgstAmount + $igstAmount;

                $subtotal += $itemSubtotal;
                $totalDiscount += $discountAmount;
                $totalTax += $cgstAmount + $sgstAmount + $igstAmount;

                $itemPayload = [
                    'product_id' => (int) $row['product_id'],
                    'quantity' => $qty,
                    'unit_price' => $price,
                    'discount_type' => $discountType,
                    'discount_percent' => $row['discount_percent'] ?? 0,
                    'discount_amount' => round($discountAmount, 2),
                    'gst_slab' => $gstSlab,
                    'is_inter_state' => $isInterState,
                    'cgst_percent' => $isInterState ? 0 : ($gstSlab / 2),
                    'sgst_percent' => $isInterState ? 0 : ($gstSlab / 2),
                    'igst_percent' => $isInterState ? $gstSlab : 0,
                    'cgst_amount' => round($cgstAmount, 2),
                    'sgst_amount' => round($sgstAmount, 2),
                    'igst_amount' => round($igstAmount, 2),
                    'tax_rate' => $gstSlab,
                    'subtotal' => round($itemSubtotal, 2),
                    'total' => round($itemTotal, 2),
                ];

                $incomingId = isset($row['id']) && $row['id'] ? (int) $row['id'] : null;

                if ($incomingId) {
                    $existing = InvoiceItem::query()
                        ->where('invoice_id', $invoice->id)
                        ->where('id', $incomingId)
                        ->first();

                    if ($existing) {
                        $existing->update($itemPayload);
                        $keptItemIds[] = $existing->id;
                        continue;
                    }
                }

                $matched = InvoiceItem::query()
                    ->where('invoice_id', $invoice->id)
                    ->where('product_id', $itemPayload['product_id'])
                    ->first();

                if ($matched && ! in_array($matched->id, $keptItemIds, true)) {
                    $matched->update($itemPayload);
                    $keptItemIds[] = $matched->id;
                    continue;
                }

                $created = InvoiceItem::create(
                    array_merge($itemPayload, ['invoice_id' => $invoice->id])
                );
                $keptItemIds[] = $created->id;
            }

            InvoiceItem::query()
                ->where('invoice_id', $invoice->id)
                ->whereNotIn('id', $keptItemIds)
                ->delete();

            // ── 3. Recompute header totals ──
            $generalDiscount = 0.0;

            if (
                ! empty($data['general_discount_percent'])
                && (float) $data['general_discount_percent'] > 0
            ) {
                $generalDiscount =
                    ($subtotal - $totalDiscount)
                    * ((float) $data['general_discount_percent'] / 100);
            } elseif (! empty($data['general_discount_amount'])) {
                $generalDiscount = (float) $data['general_discount_amount'];
            }

            $generalDiscount = min(
                max($generalDiscount, 0),
                max($subtotal - $totalDiscount, 0)
            );

            $packing = (float) ($data['packing_charges'] ?? 0);

            $additionalCharges = collect($data['additional_charges'] ?? [])
                ->sum(fn ($charge) => (float) ($charge['amount'] ?? 0));

            $netBeforeTaxDiscount =
                ($subtotal - $totalDiscount) - $generalDiscount;

            $totalBeforeTcs =
                $netBeforeTaxDiscount + $totalTax + $packing + $additionalCharges;

            $tcsPercent = (float) ($data['tcs_percent'] ?? 0);
            $tcsAmount = $totalBeforeTcs * ($tcsPercent / 100);

            $rawGrandTotal = $totalBeforeTcs + $tcsAmount;
            $grandTotal = round($rawGrandTotal);
            $roundOff = $grandTotal - $rawGrandTotal;

            $invoice->update([
                'subtotal' => round($subtotal, 2),
                'discount_amount' => round($totalDiscount + $generalDiscount, 2),
                'tax_amount' => round($totalTax, 2),
                'tcs_amount' => round($tcsAmount, 2),
                'round_off' => round($roundOff, 2),
                'total_amount' => round($grandTotal, 2),
            ]);

            // ── 4. Reconcile stock delta ──
            $invoice->refresh()->loadMissing('items');

            $stockRelevant = ! in_array(
                $invoice->status,
                ['draft', 'cancelled'],
                true
            );

            if ($stockRelevant) {
                $this->reconcileInvoiceStockDelta($invoice, $originalItems);
            }

            // ── 5. Log ──
            Log::info('Invoice updated via API', [
                'invoice_id'       => $invoice->id,
                'invoice_no'       => $invoice->invoice_no,
                'company_id'       => $invoice->company_id,
                'branch_id'        => $invoice->branch_id,
                'customer_id'      => $invoice->customer_id,
                'total_amount'     => $invoice->total_amount,
                'items_original'   => count($originalItems),
                'items_final'      => $invoice->items->count(),
                'updated_by'       => $actorId,
                'updated_by_name'  => $actorName,
                'updated_by_email' => $actorEmail,
            ]);

            return response()->json(
                $invoice->fresh([
                    'company',
                    'branch',
                    'customer',
                    'items.product',
                    'payments',
                ])
            );
        });
    }

    /**
     * Soft delete the specified invoice.
     *
     * Cascade (all in ONE transaction):
     *   1. Soft-delete every related payment (payments.invoice_id = invoice.id)
     *   2. Restore stock for every line item — only if the invoice was
     *      actually shipped (skip draft / cancelled, which never deducted).
     *   3. Soft-delete the invoice itself.
     *
     * Timeline rule:
     *   - The OUT movement used the invoice's business date.
     *   - The IN (reversal) movement is stamped with TODAY — the reversal
     *     is a real event happening now, not a backdated correction.
     */
    public function destroy(Invoice $invoice)
    {
        $actorId    = Auth::id();
        $actorName  = Auth::user()?->name;
        $actorEmail = Auth::user()?->email;

        Log::debug('Invoice delete request', [
            'user_id'    => $actorId,
            'invoice_id' => $invoice->id,
            'invoice_no' => $invoice->invoice_no,
        ]);

        return DB::transaction(function () use (
            $invoice,
            $actorId,
            $actorName,
            $actorEmail
        ) {
            $invoice->loadMissing(['items', 'payments']);

            $statusWasShipped = ! in_array(
                $invoice->status,
                ['draft', 'cancelled'],
                true
            );

            // ── 1. Cascade: soft-delete related payments ──
            $paymentsDeleted = $this->softDeleteInvoicePayments($invoice->id);

            // ── 2. Restore stock only for shipped invoices ──
            $stockRestored = false;
            if ($statusWasShipped) {
                $this->restoreInvoiceStock($invoice);
                $stockRestored = true;
            }

            // ── 3. Soft-delete the invoice ──
            $invoice->delete();

            Log::info('Invoice deleted (with cascade)', [
                'invoice_id'         => $invoice->id,
                'invoice_no'         => $invoice->invoice_no,
                'status'             => $invoice->status,
                'payments_deleted'   => $paymentsDeleted,
                'stock_restored'     => $stockRestored,
                'items_count'        => $invoice->items->count(),
                'deleted_by'         => $actorId,
                'deleted_by_name'    => $actorName,
                'deleted_by_email'   => $actorEmail,
            ]);

            return response()->noContent();
        });
    }

    /**
     * Bulk update invoice status.
     *
     * POST /api/invoices/bulk-status
     */
    public function bulkStatus(Request $request)
    {
        $data = $request->validate([
            'ids' => 'required|array|min:1|max:500',

            'ids.*' => 'integer|distinct|exists:invoices,id',

            'status' => 'required|string|max:50',
        ]);

        $updated = 0;

        DB::transaction(function () use (
            $data,
            &$updated
        ) {
            $updated = Invoice::query()
                ->whereIn('id', $data['ids'])
                ->update([
                    'status' => $data['status'],
                    'updated_at' => now(),
                ]);
        });

        return response()->json([
            'success' => true,
            'updated_count' => $updated,
            'message' => "{$updated} invoice(s) updated successfully.",
        ]);
    }

    /**
     * Bulk soft-delete invoices.
     *
     * For each invoice:
     *   • Soft-delete all its related payments
     *   • Restore stock (skipped for draft / cancelled)
     *   • Soft-delete the invoice
     *
     * POST /api/invoices/bulk-delete
     */
    public function bulkDelete(Request $request)
    {
        $data = $request->validate([
            'ids' => 'required|array|min:1|max:500',

            'ids.*' => 'integer|distinct|exists:invoices,id',
        ]);

        $actorId    = Auth::id();
        $actorName  = Auth::user()?->name;
        $actorEmail = Auth::user()?->email;

        $deleted = 0;
        $totalPaymentsDeleted = 0;

        DB::transaction(function () use (
            $data,
            $actorId,
            $actorName,
            $actorEmail,
            &$deleted,
            &$totalPaymentsDeleted
        ) {
            $invoices = Invoice::with(['items', 'payments'])
                ->whereIn('id', $data['ids'])
                ->get();

            foreach ($invoices as $invoice) {
                $statusWasShipped = ! in_array(
                    $invoice->status,
                    ['draft', 'cancelled'],
                    true
                );

                // Cascade payments
                $paymentsDeleted = $this->softDeleteInvoicePayments($invoice->id);
                $totalPaymentsDeleted += $paymentsDeleted;

                // Restore stock (skip for draft/cancelled)
                if ($statusWasShipped) {
                    $this->restoreInvoiceStock($invoice);
                }

                $invoice->delete();
                $deleted++;
            }

            Log::info('Invoices bulk-deleted (with cascade)', [
                'invoice_ids'             => $data['ids'],
                'deleted_count'           => $deleted,
                'payments_deleted_total'  => $totalPaymentsDeleted,
                'deleted_by'              => $actorId,
                'deleted_by_name'         => $actorName,
                'deleted_by_email'        => $actorEmail,
            ]);
        });

        return response()->json([
            'success' => true,
            'deleted_count' => $deleted,
            'payments_deleted' => $totalPaymentsDeleted,
            'message' => "{$deleted} invoice(s) deleted successfully and stock restored.",
        ]);
    }

    /**
     * Create an invoice from an existing order.
     */
    public function fromOrder(Request $request)
    {
        $data = $request->validate([
            'order_id' => 'required|exists:orders,id',

            'invoice_no' => 'required|string|max:100|unique:invoices,invoice_no',

            'due_date' => 'nullable|date',

            'notes' => 'nullable|string',
        ]);

        $actorId    = Auth::id();
        $actorUser  = Auth::user();
        $actorName  = $actorUser?->name;
        $actorEmail = $actorUser?->email;

        return DB::transaction(function () use (
            $data,
            $actorId,
            $actorName,
            $actorEmail
        ) {
            $order = \App\Models\Order::with(
                'items.product'
            )->findOrFail(
                $data['order_id']
            );

            $invoice = Invoice::create([
                'company_id' => $order->company_id,
                'branch_id' => $order->branch_id ?? null,
                'customer_id' => $order->customer_id,
                'order_id' => $order->id,
                'invoice_no' => $data['invoice_no'],
                'total_amount' => $order->total_amount,
                'tax_amount' => $order->tax_amount ?? 0,
                'status' => 'unpaid',
                'due_date' => $data['due_date'] ?? null,
                'notes' => $data['notes'] ?? null,
                'invoice_date' => now()->toDateString(),
            ]);

            foreach ($order->items as $item) {
                $quantity = $item->quantity ?? 1;
                $unitPrice = $item->unit_price ?? ($item->product->price ?? 0);
                $subtotal = $quantity * $unitPrice;
                $taxRate = $item->tax_rate ?? 0;

                $invoice->items()->create([
                    'product_id' => $item->product_id,
                    'quantity' => $quantity,
                    'unit_price' => $unitPrice,
                    'tax_rate' => $taxRate,
                    'subtotal' => $subtotal,
                    'total' => $subtotal,
                    'discount_type' => 'percent',
                    'discount_percent' => 0,
                    'discount_amount' => 0,
                    'gst_slab' => $taxRate,
                ]);
            }

            $invoice->load('items');
            $this->deductInvoiceStock($invoice);

            Log::info('Invoice created from order', [
                'invoice_id'       => $invoice->id,
                'invoice_no'       => $invoice->invoice_no,
                'order_id'         => $order->id,
                'company_id'       => $invoice->company_id,
                'branch_id'        => $invoice->branch_id,
                'customer_id'      => $invoice->customer_id,
                'total_amount'     => $invoice->total_amount,
                'created_by'       => $actorId,
                'created_by_name'  => $actorName,
                'created_by_email' => $actorEmail,
            ]);

            return response()->json(
                $invoice->load([
                    'company',
                    'branch',
                    'customer',
                    'items.product',
                ]),
                201
            );
        });
    }

    /* ======================================================================
     |  CASCADE: PAYMENTS
     ====================================================================== */

    /**
     * Soft-delete every payment tied to an invoice.
     *
     * Works whether the payments table uses soft deletes or not — checks
     * the schema first and falls back to a hard delete only if the table
     * has no `deleted_at` column.
     *
     * NOTE: caller must wrap this in a DB::transaction().
     */
    private function softDeleteInvoicePayments(int $invoiceId): int
    {
        if ($invoiceId <= 0) {
            return 0;
        }

        $hasSoftDeletes = \Illuminate\Support\Facades\Schema::hasColumn(
            'payments',
            'deleted_at'
        );

        $query = DB::table('payments')
            ->where('invoice_id', $invoiceId);

        if ($hasSoftDeletes) {
            $query->whereNull('deleted_at');

            $affected = $query->update([
                'deleted_at' => now(),
                'updated_at' => now(),
            ]);

            if ($affected > 0) {
                Log::info('Cascade delete: payments soft-deleted', [
                    'invoice_id'      => $invoiceId,
                    'payments_count'  => $affected,
                ]);
            }

            return (int) $affected;
        }

        // No soft deletes on payments → hard delete the children.
        $affected = $query->delete();

        if ($affected > 0) {
            Log::info('Cascade delete: payments hard-deleted', [
                'invoice_id'     => $invoiceId,
                'payments_count' => $affected,
            ]);
        }

        return (int) $affected;
    }

    /* ======================================================================
     |  STOCK / INVENTORY
     ====================================================================== */

    /**
     * Resolve the warehouse to use for a given invoice.
     *
     * Priority:
     *   1. invoices.warehouse_id (if populated)
     *   2. First warehouse for the invoice's branch + company
     *   3. First warehouse for the invoice's company
     *   4. null
     */
    private function resolveWarehouseId(Invoice $invoice): ?int
    {
        $companyId = (int) $invoice->company_id;
        $branchId  = $invoice->branch_id
            ? (int) $invoice->branch_id
            : null;

        if (! empty($invoice->warehouse_id)) {
            return (int) $invoice->warehouse_id;
        }

        $whQuery = Warehouse::query()
            ->where('company_id', $companyId);

        if ($branchId) {
            $whQuery->where('branch_id', $branchId);
        }

        $wh = $whQuery->orderBy('id')->first();

        return $wh ? (int) $wh->id : null;
    }

    /**
     * Resolve the business date to stamp on a stock movement.
     */
    private function invoiceBusinessDate(Invoice $invoice): string
    {
        $date = $invoice->invoice_date
            ?? $invoice->created_at
            ?? null;

        if (! $date) {
            return now()->toDateString();
        }

        try {
            return \Illuminate\Support\Carbon::parse($date)->toDateString();
        } catch (\Throwable $e) {
            return now()->toDateString();
        }
    }

    /**
     * Deduct stock (OUT) for every line item of an invoice.
     *
     * IMPORTANT — Timeline:
     *   `transaction_date` is stamped with the invoice's **business date**
     *   (invoice_date), NOT `now()`, so a backdated invoice creates a
     *   backdated OUT movement.
     *
     * NOTE: The caller MUST wrap this in a DB::transaction().
     */
    private function deductInvoiceStock(Invoice $invoice): void
    {
        $invoice->loadMissing('items');

        if ($invoice->items->isEmpty()) {
            return;
        }

        $companyId     = (int) $invoice->company_id;
        $branchId      = $invoice->branch_id ? (int) $invoice->branch_id : null;
        $warehouseId   = $this->resolveWarehouseId($invoice);
        $businessDate  = $this->invoiceBusinessDate($invoice);

        foreach ($invoice->items as $item) {
            if (empty($item->product_id)) {
                continue;
            }

            $product = Product::lockForUpdate()->find($item->product_id);

            if (! $product) {
                continue;
            }

            $qty = (float) $item->quantity;

            if ($qty <= 0) {
                continue;
            }

            $stockBefore = (float) ($product->stock_quantity ?? 0);
            $stockAfter  = $stockBefore - $qty;

            $product->stock_quantity = $stockAfter;
            $product->save();

            StockMovement::create([
                'product_id'       => $product->id,
                'warehouse_id'     => $warehouseId,
                'company_id'       => $companyId,
                'branch_id'        => $branchId,
                'transaction_type' => 'OUT',
                'reference_type'   => 'sale',
                'reference_id'     => $invoice->id,
                'quantity'         => $qty,
                'unit_price'       => (float) $item->unit_price,
                'stock_before'     => $stockBefore,
                'stock_after'      => $stockAfter,
                'remark'           => 'Invoice #' . $invoice->invoice_no,
                'transaction_date' => $businessDate,
                'created_by'       => Auth::id(),
            ]);

            if ($warehouseId) {
                $whStock = ProductWarehouseStock::where([
                    'product_id'   => $product->id,
                    'warehouse_id' => $warehouseId,
                    'company_id'   => $companyId,
                ])
                    ->when(
                        $branchId,
                        fn ($q) => $q->where('branch_id', $branchId)
                    )
                    ->first();

                if ($whStock) {
                    $whStock->quantity = max(
                        0,
                        (float) $whStock->quantity - $qty
                    );
                    $whStock->available_quantity = max(
                        0,
                        (float) $whStock->available_quantity - $qty
                    );
                    $whStock->save();
                }
            }
        }
    }

    /**
     * Reverse the stock impact of an invoice.
     *
     * IMPORTANT — Timeline:
     *   `transaction_date` is stamped with **today**, because the reversal
     *   is a real event happening now (not a backdated correction).
     *
     * Guards:
     *   - Skips if the invoice was never shipped (draft / cancelled).
     *     `deductInvoiceStock()` also skips those, so the ledger stays
     *     balanced.
     *
     * NOTE: The caller MUST wrap this in a DB::transaction().
     */
    private function restoreInvoiceStock(Invoice $invoice): void
    {
        // ── Guard: never shipped → nothing to reverse ──
        if (in_array($invoice->status, ['draft', 'cancelled'], true)) {
            Log::debug('restoreInvoiceStock skipped (draft/cancelled)', [
                'invoice_id' => $invoice->id,
                'status'     => $invoice->status,
            ]);
            return;
        }

        $invoice->loadMissing('items');

        if ($invoice->items->isEmpty()) {
            return;
        }

        $companyId   = (int) $invoice->company_id;
        $branchId    = $invoice->branch_id ? (int) $invoice->branch_id : null;
        $warehouseId = $this->resolveWarehouseId($invoice);

        // Reversal posts on TODAY's date — the event is happening now.
        $reversalDate = now()->toDateString();

        foreach ($invoice->items as $item) {
            if (empty($item->product_id)) {
                continue;
            }

            $product = Product::lockForUpdate()->find($item->product_id);

            if (! $product) {
                continue;
            }

            $qty = (float) $item->quantity;

            if ($qty <= 0) {
                continue;
            }

            $stockBefore = (float) ($product->stock_quantity ?? 0);
            $stockAfter  = $stockBefore + $qty;

            $product->stock_quantity = $stockAfter;
            $product->save();

            StockMovement::create([
                'product_id'       => $product->id,
                'warehouse_id'     => $warehouseId,
                'company_id'       => $companyId,
                'branch_id'        => $branchId,
                'transaction_type' => 'IN',
                'reference_type'   => 'sale',
                'reference_id'     => $invoice->id,
                'quantity'         => $qty,
                'unit_price'       => (float) $item->unit_price,
                'stock_before'     => $stockBefore,
                'stock_after'      => $stockAfter,
                'remark'           => 'Reversal for deleted invoice #' . $invoice->invoice_no,
                // ── Timeline: reversal posts on TODAY's date ──
                'transaction_date' => $reversalDate,
                'created_by'       => Auth::id(),
            ]);

            if ($warehouseId) {
                $whStock = ProductWarehouseStock::firstOrNew([
                    'product_id'   => $product->id,
                    'warehouse_id' => $warehouseId,
                    'company_id'   => $companyId,
                    'branch_id'    => $branchId,
                ]);

                $whStock->quantity = (float) ($whStock->quantity ?? 0) + $qty;
                $whStock->available_quantity = (float) ($whStock->available_quantity ?? 0) + $qty;
                $whStock->save();
            }
        }
    }

    /**
     * Reconcile stock for an edited invoice.
     *
     * Compares the pre-update item snapshot with the post-update items and
     * applies only the *delta* per product:
     *
     *   • Same product, qty increased   → stock-out (new − old)
     *   • Same product, qty decreased   → stock-in  (old − new)
     *   • Same product, qty unchanged   → no movement
     *   • Removed entirely              → stock-in  (old qty)
     *   • Brand-new product             → stock-out (new qty)
     *
     * The OUT movement is dated to the invoice's business date; the IN
     * reversal is dated to today.
     *
     * NOTE: The caller MUST wrap this in a DB::transaction().
     *
     * @param  array<int, array{id:int, product_id:int, quantity:float, unit_price:float}>  $originalItems
     */
    private function reconcileInvoiceStockDelta(
        Invoice $invoice,
        array $originalItems
    ): void {
        $invoice->loadMissing('items');

        $companyId    = (int) $invoice->company_id;
        $branchId     = $invoice->branch_id ? (int) $invoice->branch_id : null;
        $warehouseId  = $this->resolveWarehouseId($invoice);
        $businessDate = $this->invoiceBusinessDate($invoice);
        $reversalDate = now()->toDateString();

        $originalByProduct = [];
        foreach ($originalItems as $row) {
            $originalByProduct[(int) $row['product_id']] = $row;
        }

        $currentByProduct = [];
        foreach ($invoice->items as $item) {
            if (empty($item->product_id)) {
                continue;
            }
            $currentByProduct[(int) $item->product_id] = [
                'product_id' => (int) $item->product_id,
                'quantity'   => (float) $item->quantity,
                'unit_price' => (float) $item->unit_price,
            ];
        }

        $deduct = function (int $productId, float $qty, float $unitPrice) use (
            $invoice, $companyId, $branchId, $warehouseId, $businessDate
        ): void {
            if ($qty <= 0) {
                return;
            }

            $product = Product::lockForUpdate()->find($productId);
            if (! $product) {
                return;
            }

            $stockBefore = (float) ($product->stock_quantity ?? 0);
            $stockAfter  = $stockBefore - $qty;

            $product->stock_quantity = $stockAfter;
            $product->save();

            StockMovement::create([
                'product_id'       => $product->id,
                'warehouse_id'     => $warehouseId,
                'company_id'       => $companyId,
                'branch_id'        => $branchId,
                'transaction_type' => 'OUT',
                'reference_type'   => 'sale',
                'reference_id'     => $invoice->id,
                'quantity'         => $qty,
                'unit_price'       => $unitPrice,
                'stock_before'     => $stockBefore,
                'stock_after'      => $stockAfter,
                'remark'           => 'Invoice update (delta) #' . $invoice->invoice_no,
                'transaction_date' => $businessDate,
                'created_by'       => Auth::id(),
            ]);

            if ($warehouseId) {
                $whStock = ProductWarehouseStock::where([
                    'product_id'   => $product->id,
                    'warehouse_id' => $warehouseId,
                    'company_id'   => $companyId,
                ])
                    ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
                    ->first();

                if ($whStock) {
                    $whStock->quantity = max(0, (float) $whStock->quantity - $qty);
                    $whStock->available_quantity = max(0, (float) $whStock->available_quantity - $qty);
                    $whStock->save();
                }
            }
        };

        $restore = function (int $productId, float $qty, float $unitPrice) use (
            $invoice, $companyId, $branchId, $warehouseId, $reversalDate
        ): void {
            if ($qty <= 0) {
                return;
            }

            $product = Product::lockForUpdate()->find($productId);
            if (! $product) {
                return;
            }

            $stockBefore = (float) ($product->stock_quantity ?? 0);
            $stockAfter  = $stockBefore + $qty;

            $product->stock_quantity = $stockAfter;
            $product->save();

            StockMovement::create([
                'product_id'       => $product->id,
                'warehouse_id'     => $warehouseId,
                'company_id'       => $companyId,
                'branch_id'        => $branchId,
                'transaction_type' => 'IN',
                'reference_type'   => 'sale',
                'reference_id'     => $invoice->id,
                'quantity'         => $qty,
                'unit_price'       => $unitPrice,
                'stock_before'     => $stockBefore,
                'stock_after'      => $stockAfter,
                'remark'           => 'Invoice update reversal (delta) #' . $invoice->invoice_no,
                'transaction_date' => $reversalDate,
                'created_by'       => Auth::id(),
            ]);

            if ($warehouseId) {
                $whStock = ProductWarehouseStock::firstOrNew([
                    'product_id'   => $product->id,
                    'warehouse_id' => $warehouseId,
                    'company_id'   => $companyId,
                    'branch_id'    => $branchId,
                ]);

                $whStock->quantity = (float) ($whStock->quantity ?? 0) + $qty;
                $whStock->available_quantity = (float) ($whStock->available_quantity ?? 0) + $qty;
                $whStock->save();
            }
        };

        // Products present in BOTH snapshots — apply the delta.
        foreach ($originalByProduct as $productId => $orig) {
            $current = $currentByProduct[$productId] ?? null;

            if (! $current) {
                $restore(
                    (int) $productId,
                    (float) $orig['quantity'],
                    (float) $orig['unit_price']
                );
                continue;
            }

            $delta = (float) $current['quantity'] - (float) $orig['quantity'];

            if (abs($delta) < 1e-9) {
                continue;
            }

            if ($delta > 0) {
                $deduct((int) $productId, $delta, (float) $current['unit_price']);
            } else {
                $restore((int) $productId, abs($delta), (float) $orig['unit_price']);
            }
        }

        // Brand-new products (not in original snapshot) — deduct full qty.
        foreach ($currentByProduct as $productId => $current) {
            if (isset($originalByProduct[$productId])) {
                continue;
            }

            $deduct(
                (int) $productId,
                (float) $current['quantity'],
                (float) $current['unit_price']
            );
        }
    }

    /**
     * Resolve an invoice number, auto-generating one when missing
     * or already taken.
     */
    private function resolveInvoiceNumber(
        ?string $invoiceNo = null
    ): string {
        $invoiceNo = trim((string) ($invoiceNo ?? ''));

        if (
            $invoiceNo !== ''
            && ! Invoice::withTrashed()
                ->where('invoice_no', $invoiceNo)
                ->exists()
        ) {
            return $invoiceNo;
        }

        $year = date('Y');

        $lastInvoice = Invoice::withTrashed()
            ->whereYear('created_at', $year)
            ->orderBy('id', 'desc')
            ->first();

        if ($lastInvoice && $lastInvoice->invoice_no) {
            if (preg_match('/(\d+)$/', $lastInvoice->invoice_no, $matches)) {
                $lastNumber = (int) $matches[1];
            } else {
                $lastNumber = (int) $lastInvoice->id;
            }

            $nextNumber = $lastNumber + 1;
        } else {
            $nextNumber = 1;
        }

        $generated = sprintf('INV-%s-%06d', $year, $nextNumber);

        while (
            Invoice::withTrashed()
                ->where('invoice_no', $generated)
                ->exists()
        ) {
            $nextNumber++;
            $generated = sprintf('INV-%s-%06d', $year, $nextNumber);
        }

        return $generated;
    }
}