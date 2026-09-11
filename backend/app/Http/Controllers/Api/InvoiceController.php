<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class InvoiceController extends Controller
{
    /**
     * Display a listing of invoices with production-grade server-side
     * filtering, searching, sorting and pagination.
     *
     * Supported query parameters:
     *
     * search
     * company_id
     * branch_id
     * customer_id
     * status
     * payment_state = paid|partial|unpaid|overdue
     * date_from
     * date_to
     * due_from
     * due_to
     * sort_by
     * sort_dir = asc|desc
     * per_page = 15|25|50|100
     */
    public function index(Request $request)
    {
        $perPage = min(
            max((int) $request->input('per_page', 15), 1),
            100
        );

        $query = $this->filteredQuery($request)
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

        /*
         * Stable secondary ordering prevents rows from jumping between
         * pages when multiple invoices have the same primary sort value.
         */
        if ($sortBy !== 'id') {
            $query->orderBy('id', 'desc');
        }

        $paginator = $query->paginate(
            $perPage,
            ['*'],
            'page',
            max((int) $request->input('page', 1), 1)
        );

        /*
         * Preserve query string while paginating.
         */
        $paginator->appends(
            $request->except('page')
        );

        return response()->json($paginator);
    }

    /**
     * Return real invoice statistics for the current filter scope.
     *
     * Payment received is calculated from actual inward payments instead
     * of trusting a potentially stale invoice.payment_received value.
     */
    public function summary(Request $request)
    {
        $query = $this->filteredQuery($request);

        $receivedSubquery = DB::table('payments')
            ->selectRaw('COALESCE(SUM(payments.amount), 0)')
            ->whereColumn('payments.invoice_id', 'invoices.id')
            ->where('payments.payment_direction', 'inward')
            ->whereNull('payments.deleted_at');

        /*
         * Build one row per invoice so outstanding is calculated per invoice:
         *
         * outstanding = max(total_amount - received_amount, 0)
         *
         * This avoids incorrectly offsetting an overpaid invoice against
         * another outstanding invoice.
         */
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

        /*
         * Today metrics use the same company/branch/customer/status/search
         * scope but deliberately ignore the user's date range.
         */
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

        /*
         * ---------------------------------------------------------------
         * Company
         * ---------------------------------------------------------------
         */
        if ($request->filled('company_id')) {
            $query->where(
                'invoices.company_id',
                (int) $request->input('company_id')
            );
        }

        /*
         * ---------------------------------------------------------------
         * Branch
         * ---------------------------------------------------------------
         */
        if ($request->filled('branch_id')) {
            $query->where(
                'invoices.branch_id',
                (int) $request->input('branch_id')
            );
        }

        /*
         * ---------------------------------------------------------------
         * Customer
         * ---------------------------------------------------------------
         */
        if ($request->filled('customer_id')) {
            $query->where(
                'invoices.customer_id',
                (int) $request->input('customer_id')
            );
        }

        /*
         * ---------------------------------------------------------------
         * Status
         *
         * Supports:
         *   paid
         *   partial
         *   unpaid
         *   issued
         *   pending
         *   overdue
         *   draft
         *
         * Overdue is handled separately because it is a derived state
         * based on due_date + actual received amount.
         * ---------------------------------------------------------------
         */
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

        /*
         * ---------------------------------------------------------------
         * Payment state
         *
         * This is independent of stored invoice.status and is based on
         * actual payment records.
         * ---------------------------------------------------------------
         */
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

        /*
         * ---------------------------------------------------------------
         * Invoice date range
         * ---------------------------------------------------------------
         */
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

        /*
         * ---------------------------------------------------------------
         * Due date range
         * ---------------------------------------------------------------
         */
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

        /*
         * ---------------------------------------------------------------
         * Global search
         *
         * Search fields use actual NixaERP relations/columns:
         * invoice_no
         * GSTIN
         * PAN
         * PO
         * challan
         * LR
         * E-way
         * customer name/email/phone/GST
         * company name/GST
         * branch name/code
         * ---------------------------------------------------------------
         */
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

            /*
             * Items
             */
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

        return DB::transaction(function () use ($data) {
            /*
             * Create invoice header.
             */
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

                /*
                 * Never allow discount to exceed line subtotal.
                 */
                $discountAmount = min(
                    max($discountAmount, 0),
                    $itemSubtotal
                );

                $afterDiscount = max(
                    0,
                    $itemSubtotal - $discountAmount
                );

                $gstSlab = (float) ($item['gst_slab'] ?? 0);

                $isInterState = (bool) ($item['is_inter_state'] ?? false);

                $cgstAmount = 0;
                $sgstAmount = 0;
                $igstAmount = 0;

                if ($gstSlab > 0) {
                    if ($isInterState) {
                        $igstAmount = $afterDiscount
                            * ($gstSlab / 100);
                    } else {
                        $half = $gstSlab / 2;

                        $cgstAmount = $afterDiscount
                            * ($half / 100);

                        $sgstAmount = $cgstAmount;
                    }
                }

                $itemTotal =
                    $afterDiscount
                    + $cgstAmount
                    + $sgstAmount
                    + $igstAmount;

                $subtotal += $itemSubtotal;

                $totalDiscount += $discountAmount;

                $totalTax +=
                    $cgstAmount
                    + $sgstAmount
                    + $igstAmount;

                InvoiceItem::create([
                    'invoice_id' => $invoice->id,

                    'product_id' => $item['product_id'],

                    'quantity' => $qty,

                    'unit_price' => $price,

                    'discount_type' => $discountType,

                    'discount_percent' => $item['discount_percent'] ?? 0,

                    'discount_amount' => round(
                        $discountAmount,
                        2
                    ),

                    'gst_slab' => $gstSlab,

                    'is_inter_state' => $isInterState,

                    'cgst_percent' => $isInterState
                        ? 0
                        : ($gstSlab / 2),

                    'sgst_percent' => $isInterState
                        ? 0
                        : ($gstSlab / 2),

                    'igst_percent' => $isInterState
                        ? $gstSlab
                        : 0,

                    'cgst_amount' => round(
                        $cgstAmount,
                        2
                    ),

                    'sgst_amount' => round(
                        $sgstAmount,
                        2
                    ),

                    'igst_amount' => round(
                        $igstAmount,
                        2
                    ),

                    'tax_rate' => $gstSlab,

                    'subtotal' => round(
                        $itemSubtotal,
                        2
                    ),

                    'total' => round(
                        $itemTotal,
                        2
                    ),
                ]);
            }

            /*
             * General discount.
             */
            $generalDiscount = 0;

            if (
                ! empty($data['general_discount_percent'])
                && (float) $data['general_discount_percent'] > 0
            ) {
                $generalDiscount =
                    ($subtotal - $totalDiscount)
                    * ((float) $data['general_discount_percent'] / 100);

            } elseif (
                ! empty($data['general_discount_amount'])
            ) {
                $generalDiscount =
                    (float) $data['general_discount_amount'];
            }

            $generalDiscount = min(
                max($generalDiscount, 0),
                max($subtotal - $totalDiscount, 0)
            );

            $packing = (float) (
                $data['packing_charges'] ?? 0
            );

            $additionalCharges = collect(
                $data['additional_charges'] ?? []
            )->sum(
                fn ($charge) => (float) ($charge['amount'] ?? 0)
            );

            $netBeforeTaxDiscount =
                ($subtotal - $totalDiscount)
                - $generalDiscount;

            $totalBeforeTcs =
                $netBeforeTaxDiscount
                + $totalTax
                + $packing
                + $additionalCharges;

            $tcsPercent = (float) (
                $data['tcs_percent'] ?? 0
            );

            $tcsAmount =
                $totalBeforeTcs
                * ($tcsPercent / 100);

            $rawGrandTotal =
                $totalBeforeTcs
                + $tcsAmount;

            $grandTotal = round(
                $rawGrandTotal
            );

            $roundOff =
                $grandTotal
                - $rawGrandTotal;

            /*
             * Store calculated totals.
             *
             * Note:
             * payment_received is not touched here because actual
             * received amounts are maintained by PaymentController.
             */
            $invoice->update([
                'subtotal' => round(
                    $subtotal,
                    2
                ),

                'discount_amount' => round(
                    $totalDiscount + $generalDiscount,
                    2
                ),

                'tax_amount' => round(
                    $totalTax,
                    2
                ),

                'tcs_amount' => round(
                    $tcsAmount,
                    2
                ),

                'round_off' => round(
                    $roundOff,
                    2
                ),

                'total_amount' => round(
                    $grandTotal,
                    2
                ),
            ]);

            \Log::info(
                'Invoice created via API',
                [
                    'invoice_id' => $invoice->id,
                    'invoice_no' => $invoice->invoice_no,
                    'company_id' => $invoice->company_id,
                    'branch_id' => $invoice->branch_id,
                    'customer_id' => $invoice->customer_id,
                    'total_amount' => $invoice->total_amount,
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
     * Update the invoice header.
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

            'invoice_no' => [
                'required',
                'string',
                'max:100',
                'unique:invoices,invoice_no,' . $invoice->id,
            ],

            'total_amount' => 'nullable|numeric|min:0',

            'tax_amount' => 'nullable|numeric|min:0',

            'discount_amount' => 'nullable|numeric|min:0',

            'status' => 'nullable|string|max:50',

            'due_date' => 'nullable|date',

            'notes' => 'nullable|string',
        ]);

        $invoice->update($data);

        return response()->json(
            $invoice->fresh([
                'company',
                'branch',
                'customer',
                'items.product',
            ])
        );
    }

    /**
     * Soft delete the specified invoice.
     */
    public function destroy(Invoice $invoice)
    {
        $invoice->delete();

        return response()->noContent();
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
                ->whereIn(
                    'id',
                    $data['ids']
                )
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
     * POST /api/invoices/bulk-delete
     */
    public function bulkDelete(Request $request)
    {
        $data = $request->validate([
            'ids' => 'required|array|min:1|max:500',

            'ids.*' => 'integer|distinct|exists:invoices,id',
        ]);

        $deleted = 0;

        DB::transaction(function () use (
            $data,
            &$deleted
        ) {
            $deleted = Invoice::query()
                ->whereIn(
                    'id',
                    $data['ids']
                )
                ->delete();
        });

        return response()->json([
            'success' => true,
            'deleted_count' => $deleted,
            'message' => "{$deleted} invoice(s) deleted successfully.",
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

            $unitPrice =
                $item->unit_price
                ?? ($item->product->price ?? 0);

            $subtotal =
                $quantity
                * $unitPrice;

            $taxRate =
                $item->tax_rate ?? 0;

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

        return response()->json(
            $invoice->load([
                'company',
                'branch',
                'customer',
                'items.product',
            ]),
            201
        );
    }

    /**
     * Resolve an invoice number, auto-generating one when missing
     * or already taken.
     *
     * Format:
     * INV-YYYY-XXXXXX
     *
     * Example:
     * INV-2026-000001
     */
    private function resolveInvoiceNumber(
        ?string $invoiceNo = null
    ): string {
        $invoiceNo = trim(
            (string) ($invoiceNo ?? '')
        );

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
            ->whereYear(
                'created_at',
                $year
            )
            ->orderBy(
                'id',
                'desc'
            )
            ->first();

        if (
            $lastInvoice
            && $lastInvoice->invoice_no
        ) {
            if (
                preg_match(
                    '/(\d+)$/',
                    $lastInvoice->invoice_no,
                    $matches
                )
            ) {
                $lastNumber =
                    (int) $matches[1];
            } else {
                $lastNumber =
                    (int) $lastInvoice->id;
            }

            $nextNumber =
                $lastNumber + 1;
        } else {
            $nextNumber = 1;
        }

        $generated = sprintf(
            'INV-%s-%06d',
            $year,
            $nextNumber
        );

        while (
            Invoice::withTrashed()
                ->where(
                    'invoice_no',
                    $generated
                )
                ->exists()
        ) {
            $nextNumber++;

            $generated = sprintf(
                'INV-%s-%06d',
                $year,
                $nextNumber
            );
        }

        return $generated;
    }
}