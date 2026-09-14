<?php

namespace App\Services\Mcp;

use App\Services\ReportService;
use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Throwable;

/**
 * Builds the read-only business context that MCP clients consume.
 *
 * Sections are grouped into:
 *   - CORE_SECTIONS   → always built unless `sections` explicitly provided
 *   - REPORT_SECTIONS → opt-in report sections powered by ReportService
 *
 * Every section is wrapped in try/catch. One failure degrades only that
 * section. Columns are whitelisted. Aggregates use safe column resolution.
 */
class McpContextService
{
    public const DEFAULT_LIMIT = 50;
    public const MAX_LIMIT     = 200;
    public const RECENT_LIMIT  = 20;

    /**
     * Always-run sections.
     */
    public const CORE_SECTIONS = [
        'company',
        'branches',
        'warehouses',
        'customers',
        'suppliers',
        'dealers',
        'products',
        'sales',
        'purchases',
        'payments',
        'employees',
        'attendance',
        'accounting',
        'reports',       // compact P&L + GST summary block
    ];

    /**
     * Report sections — powered by ReportService, opt-in via ?sections=...
     */
    public const REPORT_SECTIONS = [
        'profit_loss',
        'profit_loss_products',
        'profit_loss_customers',
        'profit_loss_branches',
        'profit_loss_monthly',
        'profit_loss_comparison',
        'invoice_profitability',
        'gst_summary',
        'gst_rate_wise',
        'receivables_aging',
        'payables_aging',
        'outstanding_sales',
        'outstanding_purchases',
        'sales_by_customer',
        'sales_by_product',
        'sales_by_user',
        'purchase_by_vendor',
        'payment_mode_summary',
        'stock_summary',
        'low_stock',
        'expense_report',
        'cash_flow',
        'balance_sheet',
        'trial_balance',
        'top_products',
        'top_customers',
    ];

    public const SECTIONS = [
        ...self::CORE_SECTIONS,
        ...self::REPORT_SECTIONS,
    ];

    public function __construct(
        private readonly ReportService $reportService
    ) {}

    /**
     * Build the full (or filtered) context.
     *
     * @param  array{
     *     sections?: array<int,string>|null,
     *     from?: string|null,
     *     to?: string|null,
     *     limit?: int|null,
     *     company_id?: int|null,
     *     branch_id?: int|null,
     * }  $options
     */
    public function build(array $options = []): array
    {
        $limit     = $this->clampLimit($options['limit'] ?? self::DEFAULT_LIMIT);
        $from      = $this->parseDate($options['from'] ?? null);
        $to        = $this->parseDate($options['to'] ?? null);
        $companyId = isset($options['company_id']) ? (int) $options['company_id'] : null;
        $branchId  = isset($options['branch_id'])  ? (int) $options['branch_id']  : null;

        $registry = [
            // -------- Core sections --------
            'company'    => fn () => $this->company($companyId),
            'branches'   => fn () => $this->branches($companyId, $limit),
            'warehouses' => fn () => $this->warehouses($branchId, $limit),
            'customers'  => fn () => $this->customers($companyId, $limit),
            'suppliers'  => fn () => $this->suppliers($limit),
            'dealers'    => fn () => $this->dealers($limit),
            'products'   => fn () => $this->products($companyId, $limit),
            'sales'      => fn () => $this->sales($from, $to, $companyId, $branchId, $limit),
            'purchases'  => fn () => $this->purchases($from, $to, $companyId, $branchId, $limit),
            'payments'   => fn () => $this->payments($from, $to, $limit),
            'employees'  => fn () => $this->employees($limit),
            'attendance' => fn () => $this->attendance(),
            'accounting' => fn () => $this->accounting($from, $to),
            'reports'    => fn () => $this->reports($from, $to, $companyId, $branchId),

            // -------- Report sections (opt-in) --------
            'profit_loss'            => fn () => $this->reportProfitLoss($from, $to, $companyId, $branchId),
            'profit_loss_products'   => fn () => $this->reportProfitLossProducts($from, $to, $companyId, $branchId, $limit),
            'profit_loss_customers'  => fn () => $this->reportProfitLossCustomers($from, $to, $companyId, $branchId, $limit),
            'profit_loss_branches'   => fn () => $this->reportProfitLossBranches($from, $to, $companyId, $branchId, $limit),
            'profit_loss_monthly'    => fn () => $this->reportProfitLossMonthly($from, $to, $companyId, $branchId),
            'profit_loss_comparison' => fn () => $this->reportProfitLossComparison($from, $to, $companyId, $branchId),
            'invoice_profitability'  => fn () => $this->reportInvoiceProfitability($from, $to, $companyId, $branchId, $limit),
            'gst_summary'            => fn () => $this->reportGstSummary($from, $to, $companyId, $branchId),
            'gst_rate_wise'          => fn () => $this->reportGstRateWise($from, $to, $companyId, $branchId),
            'receivables_aging'      => fn () => $this->reportReceivablesAging($to, $companyId, $branchId, $limit),
            'payables_aging'         => fn () => $this->reportPayablesAging($to, $companyId, $branchId, $limit),
            'outstanding_sales'      => fn () => $this->reportOutstandingSales($from, $to, $companyId, $branchId, $limit),
            'outstanding_purchases'  => fn () => $this->reportOutstandingPurchases($from, $to, $companyId, $branchId, $limit),
            'sales_by_customer'      => fn () => $this->reportSalesByCustomer($from, $to, $companyId, $branchId, $limit),
            'sales_by_product'       => fn () => $this->reportSalesByProduct($from, $to, $companyId, $branchId, $limit),
            'sales_by_user'          => fn () => $this->reportSalesByUser($from, $to, $companyId, $branchId, $limit),
            'purchase_by_vendor'     => fn () => $this->reportPurchaseByVendor($from, $to, $companyId, $branchId, $limit),
            'payment_mode_summary'   => fn () => $this->reportPaymentModeSummary($from, $to, $companyId, $branchId),
            'stock_summary'          => fn () => $this->reportStockSummary($companyId, $branchId, $limit),
            'low_stock'              => fn () => $this->reportLowStock($companyId, $branchId, $limit),
            'expense_report'         => fn () => $this->reportExpense($from, $to, $companyId, $branchId, $limit),
            'cash_flow'              => fn () => $this->reportCashFlow($from, $to, $companyId, $branchId),
            'balance_sheet'          => fn () => $this->reportBalanceSheet($from, $to, $companyId, $branchId),
            'trial_balance'          => fn () => $this->reportTrialBalance($from, $to, $companyId, $branchId),
            'top_products'           => fn () => $this->reportTopProducts($from, $to, $companyId, $branchId, $limit),
            'top_customers'          => fn () => $this->reportTopCustomers($from, $to, $companyId, $branchId, $limit),
        ];

        $requested = $options['sections'] ?? null;

        if (is_array($requested) && $requested !== []) {
            // Special value: "all" expands to every section.
            if (in_array('all', $requested, true)) {
                $requested = array_keys($registry);
            } else {
                $requested = array_values(array_intersect($requested, array_keys($registry)));
            }

            if ($requested === []) {
                return [];
            }

            $registry = array_intersect_key($registry, array_flip($requested));
        } else {
            // Default behavior: only core sections.
            $registry = array_intersect_key($registry, array_flip(self::CORE_SECTIONS));
        }

        $out = [];
        foreach ($registry as $key => $builder) {
            $out[$key] = $this->safe($key, $builder);
        }

        return $out;
    }

    public function section(string $name, array $options = []): array
    {
        if (!in_array($name, self::SECTIONS, true)) {
            return [
                'ok'      => false,
                'error'   => 'UNKNOWN_SECTION',
                'message' => "Section '{$name}' is not available. Try one of: "
                    . implode(', ', self::SECTIONS) . '.',
            ];
        }

        $sections = $this->build(['sections' => [$name]] + $options);

        return $sections[$name] ?? [
            'ok'      => false,
            'error'   => 'SECTION_UNAVAILABLE',
            'message' => "Section '{$name}' could not be loaded.",
        ];
    }

    // =================================================================
    // Core: company
    // =================================================================

    private function company(?int $companyId): array
    {
        if (!$this->tableExists('companies')) {
            return ['data' => null, 'reason' => 'table_missing'];
        }

        $cols = $this->existingColumns('companies', [
            'id', 'name', 'legal_name', 'email', 'phone', 'gstin',
            'pan', 'address', 'city', 'state', 'pincode', 'country',
            'currency', 'created_at',
        ]);

        $q = DB::table('companies')->select($cols);
        if ($companyId) {
            $q->where('id', $companyId);
        }
        $row = $q->orderBy('id')->first();

        return ['data' => $row ? (array) $row : null];
    }

    // =================================================================
    // Core: branches / warehouses
    // =================================================================

    private function branches(?int $companyId, int $limit): array
    {
        return $this->listTable('branches', [
            'id', 'name', 'code', 'address', 'city', 'state',
            'phone', 'email', 'is_active',
        ], $limit, function ($q) use ($companyId) {
            $this->applyCompanyScope($q, 'branches', $companyId);
            $q->orderBy('id');
        });
    }

    private function warehouses(?int $branchId, int $limit): array
    {
        return $this->listTable('warehouses', [
            'id', 'name', 'code', 'address', 'branch_id', 'is_active',
        ], $limit, function ($q) use ($branchId) {
            $this->applyBranchScope($q, 'warehouses', $branchId);
            $q->orderBy('id');
        });
    }

    // =================================================================
    // Core: customers / suppliers / dealers
    // =================================================================

    private function customers(?int $companyId, int $limit): array
    {
        return $this->listTable('customers', [
            'id', 'name', 'email', 'phone', 'gstin', 'city', 'state',
            'address', 'credit_limit', 'opening_balance', 'is_active',
            'created_at',
        ], $limit, function ($q) use ($companyId) {
            $this->applyCompanyScope($q, 'customers', $companyId);
            $q->orderByDesc('id');
        });
    }

    private function suppliers(int $limit): array
    {
        return $this->listTable('suppliers', [
            'id', 'name', 'email', 'phone', 'gstin', 'city', 'state',
            'address', 'is_active', 'created_at',
        ], $limit, fn ($q) => $q->orderByDesc('id'));
    }

    private function dealers(int $limit): array
    {
        return $this->listTable('dealers', [
            'id', 'name', 'email', 'phone', 'city', 'state',
            'commission_rate', 'is_active', 'created_at',
        ], $limit, fn ($q) => $q->orderByDesc('id'));
    }

    // =================================================================
    // Core: products
    // =================================================================

    private function products(?int $companyId, int $limit): array
    {
        if (!$this->tableExists('products')) {
            return ['data' => null, 'reason' => 'table_missing'];
        }

        $cols = $this->existingColumns('products', [
            'id', 'name', 'sku', 'barcode', 'unit', 'category_id',
            'brand_id', 'selling_price', 'purchase_price', 'mrp',
            'tax_rate', 'is_active', 'created_at',
        ]);

        $listQ = DB::table('products')->select($cols);
        $this->applyCompanyScope($listQ, 'products', $companyId);
        $this->applySoftDeleteScope($listQ, 'products');

        $total = (clone $listQ)->count();

        $list = (clone $listQ)
            ->orderByDesc('id')
            ->limit($limit)
            ->get()
            ->map(fn ($r) => (array) $r)
            ->all();

        $lowStock = null;
        if ($this->hasColumn('products', 'stock_quantity')
            && $this->hasColumn('products', 'reorder_level')) {
            $lowCols = $this->existingColumns('products', [
                'id', 'name', 'sku', 'stock_quantity', 'reorder_level',
            ]);
            $lowBase = DB::table('products')
                ->whereColumn('stock_quantity', '<=', 'reorder_level');
            $this->applyCompanyScope($lowBase, 'products', $companyId);
            $this->applySoftDeleteScope($lowBase, 'products');

            $lowStock = [
                'count' => (clone $lowBase)->count(),
                'items' => (clone $lowBase)
                    ->select($lowCols)
                    ->orderBy('stock_quantity')
                    ->limit($limit)
                    ->get()
                    ->map(fn ($r) => (array) $r)
                    ->all(),
            ];
        }

        return [
            'count'     => $total,
            'returned'  => count($list),
            'data'      => $list,
            'low_stock' => $lowStock,
        ];
    }

    // =================================================================
    // Core: sales (fixed for schema drift)
    // =================================================================

    private function sales(
        ?Carbon $from,
        ?Carbon $to,
        ?int $companyId,
        ?int $branchId,
        int $limit
    ): array {
        $table = 'invoices';
        if (!$this->tableExists($table)) {
            return ['data' => null, 'reason' => 'table_missing'];
        }

        $cols = $this->existingColumns($table, [
            'id', 'invoice_number', 'invoice_no', 'customer_id', 'branch_id',
            'company_id', 'invoice_date', 'due_date', 'subtotal', 'tax_amount',
            'discount', 'discount_amount', 'total_amount', 'payment_received',
            'paid_amount', 'due_amount', 'status', 'payment_status', 'created_at',
        ]);

        $dateCol = $this->resolveColumn($table, ['invoice_date', 'date', 'created_at']);

        $base = DB::table($table);
        if ($dateCol) {
            $this->applyDateRange($base, $table, $dateCol, $from, $to);
        }
        $this->applyCompanyScope($base, $table, $companyId);
        $this->applyBranchScope($base, $table, $branchId);
        $this->applySoftDeleteScope($base, $table);

        $aggRow = (clone $base)
            ->selectRaw('COUNT(*) as invoice_count')
            ->selectRaw($this->moneySumSelect($table, [
                'total_amount', 'grand_total', 'net_amount', 'total', 'amount',
            ], 'total_amount'))
            ->selectRaw($this->moneySumSelect($table, [
                'paid_amount', 'payment_received', 'paid', 'amount_paid', 'received_amount',
            ], 'paid_amount'))
            ->selectRaw($this->dueAmountSelect($table))
            ->first();

        $total = (float) ($aggRow->total_amount ?? 0);
        $paid  = (float) ($aggRow->paid_amount  ?? 0);
        $due   = (float) ($aggRow->due_amount   ?? 0);

        if (!$this->hasColumn($table, 'due_amount')
            && !$this->hasColumn($table, 'balance')
            && !$this->hasColumn($table, 'balance_amount')) {
            $due = max($total - $paid, 0);
        }

        $listQ = (clone $base)->select($cols);
        if ($dateCol) {
            $listQ->orderByDesc($dateCol);
        }
        if ($this->hasColumn($table, 'id')) {
            $listQ->orderByDesc('id');
        }
        $recent = $listQ
            ->limit(min($limit, self::RECENT_LIMIT))
            ->get()
            ->map(fn ($r) => (array) $r)
            ->all();

        $topCustomers = [];
        if ($this->hasColumn($table, 'customer_id') && $this->tableExists('customers')) {
            $totalExpr = $this->moneySumSelect($table, [
                'total_amount', 'grand_total', 'net_amount', 'total', 'amount',
            ], 'revenue');
            $rawSum = preg_replace('/ as `[^`]+`$/', '', $totalExpr);

            $topQ = (clone $base)
                ->join('customers', 'customers.id', '=', "{$table}.customer_id")
                ->groupBy('customers.id', 'customers.name')
                ->select([
                    'customers.id',
                    'customers.name',
                    DB::raw("COUNT({$table}.id) as invoice_count"),
                    DB::raw($rawSum . ' as revenue'),
                ])
                ->orderByDesc('revenue')
                ->limit(5);

            $topCustomers = $topQ->get()->map(fn ($r) => (array) $r)->all();
        }

        return [
            'summary' => [
                'invoice_count' => (int)   ($aggRow->invoice_count ?? 0),
                'total_amount'  => $total,
                'paid_amount'   => $paid,
                'due_amount'    => $due,
            ],
            'top_customers'   => $topCustomers,
            'recent_invoices' => $recent,
        ];
    }

    // =================================================================
    // Core: purchases
    // =================================================================

    private function purchases(
        ?Carbon $from,
        ?Carbon $to,
        ?int $companyId,
        ?int $branchId,
        int $limit
    ): array {
        $table = $this->firstExisting(['purchase_invoices', 'purchases']);
        if (!$table) {
            return ['data' => null, 'reason' => 'table_missing'];
        }

        $cols = $this->existingColumns($table, [
            'id', 'purchase_number', 'bill_number', 'invoice_number',
            'supplier_id', 'branch_id', 'company_id', 'purchase_date', 'date',
            'due_date', 'subtotal', 'tax_amount', 'discount', 'order_discount',
            'total_amount', 'grand_total', 'net_amount', 'total', 'paid_amount',
            'due_amount', 'status', 'payment_status', 'created_at',
        ]);

        $dateCol = $this->resolveColumn($table, ['purchase_date', 'bill_date', 'date', 'created_at']);

        $base = DB::table($table);
        if ($dateCol) {
            $this->applyDateRange($base, $table, $dateCol, $from, $to);
        }
        $this->applyCompanyScope($base, $table, $companyId);
        $this->applyBranchScope($base, $table, $branchId);
        $this->applySoftDeleteScope($base, $table);

        $aggRow = (clone $base)
            ->selectRaw('COUNT(*) as purchase_count')
            ->selectRaw($this->moneySumSelect($table, [
                'total_amount', 'grand_total', 'net_amount', 'total', 'amount',
            ], 'total_amount'))
            ->selectRaw($this->moneySumSelect($table, [
                'paid_amount', 'paid', 'amount_paid',
            ], 'paid_amount'))
            ->selectRaw($this->dueAmountSelect($table))
            ->first();

        $total = (float) ($aggRow->total_amount ?? 0);
        $paid  = (float) ($aggRow->paid_amount  ?? 0);
        $due   = (float) ($aggRow->due_amount   ?? 0);

        if (!$this->hasColumn($table, 'due_amount')
            && !$this->hasColumn($table, 'balance')
            && !$this->hasColumn($table, 'balance_amount')) {
            $due = max($total - $paid, 0);
        }

        $listQ = (clone $base)->select($cols);
        if ($dateCol) {
            $listQ->orderByDesc($dateCol);
        }
        if ($this->hasColumn($table, 'id')) {
            $listQ->orderByDesc('id');
        }
        $recent = $listQ
            ->limit(min($limit, self::RECENT_LIMIT))
            ->get()
            ->map(fn ($r) => (array) $r)
            ->all();

        $topVendors = [];
        if ($this->hasColumn($table, 'supplier_id') && $this->tableExists('suppliers')) {
            $totalExpr = $this->moneySumSelect($table, [
                'total_amount', 'grand_total', 'net_amount', 'total', 'amount',
            ], 'total_amount');
            $rawSum = preg_replace('/ as `[^`]+`$/', '', $totalExpr);

            $topQ = (clone $base)
                ->join('suppliers', 'suppliers.id', '=', "{$table}.supplier_id")
                ->groupBy('suppliers.id', 'suppliers.name')
                ->select([
                    'suppliers.id',
                    'suppliers.name',
                    DB::raw("COUNT({$table}.id) as purchase_count"),
                    DB::raw($rawSum . ' as total_amount'),
                ])
                ->orderByDesc('total_amount')
                ->limit(5);

            $topVendors = $topQ->get()->map(fn ($r) => (array) $r)->all();
        }

        return [
            'summary' => [
                'purchase_count' => (int)   ($aggRow->purchase_count ?? 0),
                'total_amount'   => $total,
                'paid_amount'    => $paid,
                'due_amount'     => $due,
            ],
            'top_vendors'      => $topVendors,
            'recent_purchases' => $recent,
        ];
    }

    // =================================================================
    // Core: payments
    // =================================================================

    private function payments(?Carbon $from, ?Carbon $to, int $limit): array
    {
        $table = 'payments';
        if (!$this->tableExists($table)) {
            return ['data' => null, 'reason' => 'table_missing'];
        }

        $cols = $this->existingColumns($table, [
            'id', 'payment_number', 'reference_no', 'amount',
            'transaction_date', 'payment_date', 'date', 'payment_method',
            'method', 'payment_direction', 'customer_id', 'supplier_id',
            'invoice_id', 'purchase_invoice_id', 'status', 'notes', 'created_at',
        ]);

        $dateCol = $this->resolveColumn($table, ['transaction_date', 'payment_date', 'date', 'created_at']);

        $base = DB::table($table);
        if ($dateCol) {
            $this->applyDateRange($base, $table, $dateCol, $from, $to);
        }
        $this->applySoftDeleteScope($base, $table);

        $aggRow = (clone $base)
            ->selectRaw('COUNT(*) as payment_count')
            ->selectRaw($this->moneySumSelect($table, [
                'amount', 'payment_amount', 'value', 'total',
            ], 'total_amount'))
            ->first();

        // Breakdown by direction, when the column exists.
        $byDirection = null;
        if ($this->hasColumn($table, 'payment_direction')) {
            $rows = (clone $base)
                ->select(
                    'payment_direction',
                    DB::raw('COUNT(*) as count'),
                    DB::raw('COALESCE(SUM(amount),0) as amount')
                )
                ->groupBy('payment_direction')
                ->get();
            $byDirection = $rows->map(fn ($r) => (array) $r)->all();
        }

        $listQ = (clone $base)->select($cols);
        if ($dateCol) {
            $listQ->orderByDesc($dateCol);
        }
        if ($this->hasColumn($table, 'id')) {
            $listQ->orderByDesc('id');
        }
        $recent = $listQ
            ->limit(min($limit, self::RECENT_LIMIT))
            ->get()
            ->map(fn ($r) => (array) $r)
            ->all();

        return [
            'summary' => [
                'payment_count' => (int)   ($aggRow->payment_count ?? 0),
                'total_amount'  => (float) ($aggRow->total_amount  ?? 0),
            ],
            'by_direction'    => $byDirection,
            'recent_payments' => $recent,
        ];
    }

    // =================================================================
    // Core: employees
    // =================================================================

    private function employees(int $limit): array
    {
        if (!$this->tableExists('employees')) {
            return ['data' => null, 'reason' => 'table_missing'];
        }

        $cols = $this->existingColumns('employees', [
            'id', 'employee_code', 'name', 'email', 'phone',
            'department', 'designation', 'joining_date', 'status', 'is_active',
        ]);

        $base = DB::table('employees');
        $this->applySoftDeleteScope($base, 'employees');

        $total = (clone $base)->count();

        $list = (clone $base)
            ->select($cols)
            ->orderByDesc('id')
            ->limit($limit)
            ->get()
            ->map(fn ($r) => (array) $r)
            ->all();

        $byDepartment = [];
        if ($this->hasColumn('employees', 'department')) {
            $byDepartment = DB::table('employees')
                ->select('department', DB::raw('COUNT(*) as count'))
                ->whereNotNull('department')
                ->groupBy('department')
                ->orderByDesc('count')
                ->limit(20)
                ->get()
                ->map(fn ($r) => (array) $r)
                ->all();
        }

        return [
            'count'         => $total,
            'returned'      => count($list),
            'by_department' => $byDepartment,
            'data'          => $list,
        ];
    }

    // =================================================================
    // Core: attendance (today)
    // =================================================================

    private function attendance(): array
    {
        $table = $this->firstExisting(['attendances', 'attendance']);
        if (!$table) {
            return ['data' => null, 'reason' => 'table_missing'];
        }

        $dateCol   = $this->resolveColumn($table, ['date', 'attendance_date', 'created_at']);
        $statusCol = $this->resolveColumn($table, ['status', 'attendance_status']);

        if (!$dateCol) {
            return ['data' => null, 'reason' => 'no_date_column'];
        }

        $today = Carbon::today()->toDateString();
        $q = DB::table($table)->whereDate($dateCol, $today);

        if ($statusCol) {
            $summary = (clone $q)
                ->selectRaw('COUNT(*) as total')
                ->selectRaw("SUM(CASE WHEN {$statusCol} = 'present' THEN 1 ELSE 0 END) as present")
                ->selectRaw("SUM(CASE WHEN {$statusCol} = 'absent'  THEN 1 ELSE 0 END) as absent")
                ->selectRaw("SUM(CASE WHEN {$statusCol} = 'late'    THEN 1 ELSE 0 END) as late")
                ->selectRaw("SUM(CASE WHEN {$statusCol} IN ('leave','on_leave','leave_request') THEN 1 ELSE 0 END) as leave_count")
                ->first();
        } else {
            $summary = (clone $q)->selectRaw('COUNT(*) as total')->first();
        }

        return [
            'date'    => $today,
            'summary' => [
                'total'    => (int) ($summary->total       ?? 0),
                'present'  => (int) ($summary->present     ?? 0),
                'absent'   => (int) ($summary->absent      ?? 0),
                'late'     => (int) ($summary->late        ?? 0),
                'on_leave' => (int) ($summary->leave_count ?? 0),
            ],
        ];
    }

    // =================================================================
    // Core: accounting
    // =================================================================

    private function accounting(?Carbon $from, ?Carbon $to): array
    {
        $out = ['accounts' => null, 'journals' => null];

        $accountTable = $this->firstExisting(['accounts', 'chart_of_accounts']);
        if ($accountTable) {
            $cols = $this->existingColumns($accountTable, [
                'id', 'code', 'name', 'type', 'group', 'parent_id',
                'opening_balance', 'current_balance', 'is_active',
            ]);

            $out['accounts'] = [
                'count' => DB::table($accountTable)->count(),
                'data'  => DB::table($accountTable)
                    ->select($cols)
                    ->orderBy('id')
                    ->limit(self::DEFAULT_LIMIT)
                    ->get()
                    ->map(fn ($r) => (array) $r)
                    ->all(),
            ];
        }

        $journalTable = $this->firstExisting(['journal_entries', 'journals']);
        if ($journalTable) {
            $cols    = $this->existingColumns($journalTable, [
                'id', 'date', 'entry_date', 'reference_no', 'description',
                'debit', 'credit', 'amount', 'narration', 'created_at',
            ]);
            $dateCol = $this->resolveColumn($journalTable, ['date', 'entry_date', 'created_at']);

            $base = DB::table($journalTable);
            if ($dateCol) {
                $this->applyDateRange($base, $journalTable, $dateCol, $from, $to);
            }

            $listQ = (clone $base)->select($cols);
            if ($this->hasColumn($journalTable, 'id')) {
                $listQ->orderByDesc('id');
            }

            $out['journals'] = [
                'count' => (clone $base)->count(),
                'data'  => $listQ
                    ->limit(self::RECENT_LIMIT)
                    ->get()
                    ->map(fn ($r) => (array) $r)
                    ->all(),
            ];
        }

        return $out;
    }

    // =================================================================
    // Core: reports (compact summary block — powered by ReportService)
    // =================================================================

    private function reports(
        ?Carbon $from,
        ?Carbon $to,
        ?int $companyId,
        ?int $branchId
    ): array {
        [$fromDate, $toDate] = $this->effectiveRange($from, $to);
        $fromStr = $fromDate->toDateString();
        $toStr   = $toDate->toDateString();

        $pnl = $this->reportService->getProfitLossSummary($companyId, $branchId, $fromStr, $toStr);
        $gst = $this->reportService->getGstSummary($companyId, $branchId, $fromStr, $toStr);

        return [
            'range' => ['from' => $fromStr, 'to' => $toStr],
            'profit_loss' => [
                'gross_revenue'      => (float) ($pnl['gross_revenue']      ?? 0),
                'net_revenue'        => (float) ($pnl['net_revenue']        ?? 0),
                'sales_returns'      => (float) ($pnl['sales_returns']      ?? 0),
                'sales_discounts'    => (float) ($pnl['sales_discounts']    ?? 0),
                'cogs'               => (float) ($pnl['cogs']               ?? 0),
                'gross_profit'       => (float) ($pnl['gross_profit']       ?? 0),
                'gross_margin'       => (float) ($pnl['gross_margin']       ?? 0),
                'operating_expenses' => (float) ($pnl['operating_expenses'] ?? 0),
                'operating_profit'   => (float) ($pnl['operating_profit']   ?? 0),
                'net_profit'         => (float) ($pnl['net_profit']         ?? 0),
                'net_margin'         => (float) ($pnl['net_margin']         ?? 0),
                'invoice_count'      => (int)   ($pnl['invoice_count']      ?? 0),
                'missing_cost_lines' => (int)   ($pnl['missing_cost_lines'] ?? 0),
                'expense_source'     => (string) ($pnl['expense_source']    ?? 'unknown'),
            ],
            'gst' => $gst,
            'available_report_sections' => self::REPORT_SECTIONS,
        ];
    }

    // =================================================================
    // Report sections (powered by ReportService)
    // =================================================================

    private function reportProfitLoss(?Carbon $from, ?Carbon $to, ?int $companyId, ?int $branchId): array
    {
        [$f, $t] = $this->effectiveRange($from, $to);
        return $this->reportService->getDetailedProfitLoss(
            $companyId, $branchId, $f->toDateString(), $t->toDateString()
        );
    }

    private function reportProfitLossProducts(?Carbon $from, ?Carbon $to, ?int $companyId, ?int $branchId, int $limit): array
    {
        [$f, $t] = $this->effectiveRange($from, $to);
        return $this->reportService->getProductProfitability(
            $companyId, $branchId, $f->toDateString(), $t->toDateString(), 1, $limit
        );
    }

    private function reportProfitLossCustomers(?Carbon $from, ?Carbon $to, ?int $companyId, ?int $branchId, int $limit): array
    {
        [$f, $t] = $this->effectiveRange($from, $to);
        return $this->reportService->getProfitLossCustomers(
            $companyId, $branchId, $f->toDateString(), $t->toDateString(), 1, $limit
        );
    }

    private function reportProfitLossBranches(?Carbon $from, ?Carbon $to, ?int $companyId, ?int $branchId, int $limit): array
    {
        [$f, $t] = $this->effectiveRange($from, $to);
        return $this->reportService->getProfitLossBranches(
            $companyId, $branchId, $f->toDateString(), $t->toDateString(), 1, $limit
        );
    }

    private function reportProfitLossMonthly(?Carbon $from, ?Carbon $to, ?int $companyId, ?int $branchId): array
    {
        [$f, $t] = $this->effectiveRange($from, $to);
        return $this->reportService->getProfitLossMonthly(
            $companyId, $branchId, $f->toDateString(), $t->toDateString()
        );
    }

    private function reportProfitLossComparison(?Carbon $from, ?Carbon $to, ?int $companyId, ?int $branchId): array
    {
        [$f, $t] = $this->effectiveRange($from, $to);
        return $this->reportService->getProfitLossComparison(
            $companyId, $branchId, $f->toDateString(), $t->toDateString()
        );
    }

    private function reportInvoiceProfitability(?Carbon $from, ?Carbon $to, ?int $companyId, ?int $branchId, int $limit): array
    {
        [$f, $t] = $this->effectiveRange($from, $to);
        return $this->reportService->getInvoiceProfitability(
            $companyId, $branchId, $f->toDateString(), $t->toDateString(), 1, $limit
        );
    }

    private function reportGstSummary(?Carbon $from, ?Carbon $to, ?int $companyId, ?int $branchId): array
    {
        [$f, $t] = $this->effectiveRange($from, $to);
        return $this->reportService->getGstSummary(
            $companyId, $branchId, $f->toDateString(), $t->toDateString()
        );
    }

    private function reportGstRateWise(?Carbon $from, ?Carbon $to, ?int $companyId, ?int $branchId): array
    {
        [$f, $t] = $this->effectiveRange($from, $to);
        return $this->reportService->getGstRateWiseSummary(
            $companyId, $branchId, $f->toDateString(), $t->toDateString()
        );
    }

    private function reportReceivablesAging(?Carbon $to, ?int $companyId, ?int $branchId, int $limit): array
    {
        $asOf = $to ? $to->toDateString() : Carbon::now()->toDateString();
        return $this->reportService->getReceivablesAging(
            $companyId, $branchId, $asOf, 1, $limit
        );
    }

    private function reportPayablesAging(?Carbon $to, ?int $companyId, ?int $branchId, int $limit): array
    {
        $asOf = $to ? $to->toDateString() : Carbon::now()->toDateString();
        return $this->reportService->getPayablesAging(
            $companyId, $branchId, $asOf, 1, $limit
        );
    }

    private function reportOutstandingSales(?Carbon $from, ?Carbon $to, ?int $companyId, ?int $branchId, int $limit): array
    {
        [$f, $t] = $this->effectiveRange($from, $to);
        return $this->reportService->getOutstandingSales(
            $companyId, $branchId, $f->toDateString(), $t->toDateString(), 1, $limit
        );
    }

    private function reportOutstandingPurchases(?Carbon $from, ?Carbon $to, ?int $companyId, ?int $branchId, int $limit): array
    {
        [$f, $t] = $this->effectiveRange($from, $to);
        return $this->reportService->getOutstandingPurchases(
            $companyId, $branchId, $f->toDateString(), $t->toDateString(), 1, $limit
        );
    }

    private function reportSalesByCustomer(?Carbon $from, ?Carbon $to, ?int $companyId, ?int $branchId, int $limit): array
    {
        [$f, $t] = $this->effectiveRange($from, $to);
        return $this->reportService->getSalesByCustomer(
            $companyId, $branchId, $f->toDateString(), $t->toDateString(), 1, $limit
        );
    }

    private function reportSalesByProduct(?Carbon $from, ?Carbon $to, ?int $companyId, ?int $branchId, int $limit): array
    {
        [$f, $t] = $this->effectiveRange($from, $to);
        return $this->reportService->getSalesByProduct(
            $companyId, $branchId, $f->toDateString(), $t->toDateString(), 1, $limit
        );
    }

    private function reportSalesByUser(?Carbon $from, ?Carbon $to, ?int $companyId, ?int $branchId, int $limit): array
    {
        [$f, $t] = $this->effectiveRange($from, $to);
        return $this->reportService->getSalesByUser(
            $companyId, $branchId, $f->toDateString(), $t->toDateString(), 1, $limit
        );
    }

    private function reportPurchaseByVendor(?Carbon $from, ?Carbon $to, ?int $companyId, ?int $branchId, int $limit): array
    {
        [$f, $t] = $this->effectiveRange($from, $to);
        return $this->reportService->getPurchaseByVendor(
            $companyId, $branchId, $f->toDateString(), $t->toDateString(), 1, $limit
        );
    }

    private function reportPaymentModeSummary(?Carbon $from, ?Carbon $to, ?int $companyId, ?int $branchId): array
    {
        [$f, $t] = $this->effectiveRange($from, $to);
        return $this->reportService->getPaymentModeSummary(
            $companyId, $branchId, $f->toDateString(), $t->toDateString()
        );
    }

    private function reportStockSummary(?int $companyId, ?int $branchId, int $limit): array
    {
        return $this->reportService->getStockSummary($companyId, $branchId, 1, $limit);
    }

    private function reportLowStock(?int $companyId, ?int $branchId, int $limit): array
    {
        return $this->reportService->getLowStockReport($companyId, $branchId, 1, $limit);
    }

    private function reportExpense(?Carbon $from, ?Carbon $to, ?int $companyId, ?int $branchId, int $limit): array
    {
        [$f, $t] = $this->effectiveRange($from, $to);
        return $this->reportService->getExpenseReport(
            $companyId, $branchId, $f->toDateString(), $t->toDateString(), 1, $limit
        );
    }

    private function reportCashFlow(?Carbon $from, ?Carbon $to, ?int $companyId, ?int $branchId): array
    {
        [$f, $t] = $this->effectiveRange($from, $to);
        return $this->reportService->getCashFlowSummary(
            $companyId, $branchId, $f->toDateString(), $t->toDateString()
        );
    }

    private function reportBalanceSheet(?Carbon $from, ?Carbon $to, ?int $companyId, ?int $branchId): array
    {
        [$f, $t] = $this->effectiveRange($from, $to);
        return $this->reportService->getBalanceSheet(
            $companyId, $branchId, $f->toDateString(), $t->toDateString()
        );
    }

    private function reportTrialBalance(?Carbon $from, ?Carbon $to, ?int $companyId, ?int $branchId): array
    {
        [$f, $t] = $this->effectiveRange($from, $to);
        return $this->reportService->getTrialBalance(
            $companyId, $branchId, $f->toDateString(), $t->toDateString()
        );
    }

    private function reportTopProducts(?Carbon $from, ?Carbon $to, ?int $companyId, ?int $branchId, int $limit): array
    {
        [$f, $t] = $this->effectiveRange($from, $to);
        return [
            'data' => $this->reportService->getTopProducts(
                $companyId, $branchId, $f->toDateString(), $t->toDateString(), $limit
            ),
        ];
    }

    private function reportTopCustomers(?Carbon $from, ?Carbon $to, ?int $companyId, ?int $branchId, int $limit): array
    {
        [$f, $t] = $this->effectiveRange($from, $to);
        return [
            'data' => $this->reportService->getTopCustomers(
                $companyId, $branchId, $f->toDateString(), $t->toDateString(), $limit
            ),
        ];
    }

    // =================================================================
    // Safe aggregate expression helpers
    // =================================================================

    private function resolveColumn(string $table, array $candidates): ?string
    {
        foreach ($candidates as $col) {
            if ($this->hasColumn($table, $col)) {
                return $col;
            }
        }
        return null;
    }

    private function moneySumSelect(string $table, array $candidates, string $alias): string
    {
        foreach ($candidates as $col) {
            if ($this->hasColumn($table, $col)) {
                return "COALESCE(SUM(`{$col}`),0) as `{$alias}`";
            }
        }
        if ($this->hasColumn($table, 'subtotal') && $this->hasColumn($table, 'tax_amount')) {
            return "COALESCE(SUM(`subtotal` + `tax_amount`),0) as `{$alias}`";
        }
        if ($this->hasColumn($table, 'subtotal')) {
            return "COALESCE(SUM(`subtotal`),0) as `{$alias}`";
        }
        return "0 as `{$alias}`";
    }

    private function dueAmountSelect(string $table, string $alias = 'due_amount'): string
    {
        foreach (['due_amount', 'balance', 'balance_amount', 'outstanding_amount'] as $col) {
            if ($this->hasColumn($table, $col)) {
                return "COALESCE(SUM(`{$col}`),0) as `{$alias}`";
            }
        }

        $totalCol = $this->resolveColumn($table, [
            'total_amount', 'grand_total', 'net_amount', 'total', 'amount',
        ]);
        $paidCol = $this->resolveColumn($table, [
            'paid_amount', 'payment_received', 'paid', 'amount_paid', 'received_amount',
        ]);

        if ($totalCol && $paidCol) {
            return "COALESCE(SUM(GREATEST(`{$totalCol}` - `{$paidCol}`, 0)),0) as `{$alias}`";
        }
        if ($totalCol) {
            return "COALESCE(SUM(`{$totalCol}`),0) as `{$alias}`";
        }
        return "0 as `{$alias}`";
    }

    // =================================================================
    // Generic helpers
    // =================================================================

    private function safe(string $key, callable $fn): array
    {
        try {
            $result = $fn();
            if (!is_array($result)) {
                return ['ok' => true, 'data' => $result];
            }
            return ['ok' => true] + $result;
        } catch (Throwable $e) {
            Log::warning("MCP context section '{$key}' failed", [
                'exception' => get_class($e),
                'message'   => $e->getMessage(),
                'file'      => $e->getFile() . ':' . $e->getLine(),
            ]);

            return [
                'ok'      => false,
                'error'   => 'SECTION_UNAVAILABLE',
                'message' => 'This section could not be loaded. See server logs for details.',
            ];
        }
    }

    private function listTable(
        string $table,
        array $wantedColumns,
        int $limit,
        ?callable $decorate = null
    ): array {
        if (!$this->tableExists($table)) {
            return ['data' => null, 'reason' => 'table_missing'];
        }

        $cols = $this->existingColumns($table, $wantedColumns);

        $base = DB::table($table);
        $this->applySoftDeleteScope($base, $table);

        $total = (clone $base)->count();

        $listQ = (clone $base)->select($cols);

        if ($decorate) {
            $decorate($listQ);
        } elseif ($this->hasColumn($table, 'id')) {
            $listQ->orderByDesc('id');
        }

        $rows = $listQ->limit($limit)->get()->map(fn ($r) => (array) $r)->all();

        return [
            'count'    => $total,
            'returned' => count($rows),
            'data'     => $rows,
        ];
    }

    private function applyCompanyScope($q, string $table, ?int $companyId): void
    {
        if ($companyId && $this->hasColumn($table, 'company_id')) {
            $q->where("{$table}.company_id", $companyId);
        }
    }

    private function applyBranchScope($q, string $table, ?int $branchId): void
    {
        if ($branchId && $this->hasColumn($table, 'branch_id')) {
            $q->where("{$table}.branch_id", $branchId);
        }
    }

    private function applySoftDeleteScope($q, string $table): void
    {
        if ($this->hasColumn($table, 'deleted_at')) {
            $q->whereNull("{$table}.deleted_at");
        }
    }

    private function applyDateRange(
        $q,
        string $table,
        string $primaryColumn,
        ?Carbon $from,
        ?Carbon $to
    ): void {
        $col = $this->hasColumn($table, $primaryColumn) ? $primaryColumn : null;
        if (!$col) {
            return;
        }
        if ($from) {
            $q->whereDate("{$table}.{$col}", '>=', $from->toDateString());
        }
        if ($to) {
            $q->whereDate("{$table}.{$col}", '<=', $to->toDateString());
        }
    }

    /**
     * Effective date range: use provided, otherwise default to FY-to-date.
     */
    private function effectiveRange(?Carbon $from, ?Carbon $to): array
    {
        if (!$from) {
            $now = Carbon::now();
            $y = $now->month >= 4 ? $now->year : $now->year - 1;
            $from = Carbon::parse("{$y}-04-01")->startOfDay();
        }
        if (!$to) {
            $to = Carbon::now()->endOfDay();
        }
        return [$from, $to];
    }

    private function tableExists(string $table): bool
    {
        return Cache::remember("mcp.table.{$table}", 3600, function () use ($table) {
            try {
                return Schema::hasTable($table);
            } catch (Throwable) {
                return false;
            }
        });
    }

    private function hasColumn(string $table, string $column): bool
    {
        return Cache::remember(
            "mcp.col.{$table}.{$column}",
            3600,
            function () use ($table, $column) {
                try {
                    return Schema::hasColumn($table, $column);
                } catch (Throwable) {
                    return false;
                }
            }
        );
    }

    private function existingColumns(string $table, array $wanted): array
    {
        try {
            $present = Cache::remember("mcp.cols.{$table}", 3600, function () use ($table) {
                try {
                    return Schema::getColumnListing($table);
                } catch (Throwable) {
                    return [];
                }
            });
        } catch (Throwable) {
            $present = [];
        }

        if ($present === []) {
            try {
                $row = DB::table($table)->limit(1)->first();
                if ($row) {
                    $present = array_keys((array) $row);
                }
            } catch (Throwable) {
                // Give up.
            }
        }

        if ($present === []) {
            return $wanted;
        }

        return array_values(array_intersect($wanted, $present));
    }

    private function firstExisting(array $tables): ?string
    {
        foreach ($tables as $t) {
            if ($this->tableExists($t)) {
                return $t;
            }
        }
        return null;
    }

    private function clampLimit(?int $limit): int
    {
        $limit = (int) ($limit ?? self::DEFAULT_LIMIT);
        if ($limit < 1) {
            $limit = self::DEFAULT_LIMIT;
        }
        return min($limit, self::MAX_LIMIT);
    }

    private function parseDate(?string $value): ?Carbon
    {
        if (!$value) {
            return null;
        }
        try {
            return Carbon::parse($value)->startOfDay();
        } catch (Throwable) {
            return null;
        }
    }
}