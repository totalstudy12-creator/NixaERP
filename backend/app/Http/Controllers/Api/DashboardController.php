<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\Product;
use App\Models\PurchaseInvoice;
use App\Models\Payment;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;

class DashboardController extends Controller
{
    /*
    |--------------------------------------------------------------------------
    | Helpers — Validation / Soft-Delete / Filters
    |--------------------------------------------------------------------------
    */

    /**
     * Validate the common dashboard filters.
     * Returns the validated payload, or ['error' => 'msg'] on failure.
     */
    private function validateCommonFilters(Request $request): array
    {
        $validator = Validator::make($request->all(), [
            'date_from'  => 'nullable|date',
            'date_to'    => 'nullable|date',
            'company_id' => 'nullable|integer|min:1',
            'branch_id'  => 'nullable|integer|min:1',
        ]);

        if ($validator->fails()) {
            return ['error' => $validator->errors()->first()];
        }

        $data = $validator->validated();

        if (!empty($data['date_from']) && !empty($data['date_to'])) {
            $from = strtotime($data['date_from']);
            $to   = strtotime($data['date_to']);
            if ($from !== false && $to !== false && $from > $to) {
                return ['error' => '"date_from" must be less than or equal to "date_to".'];
            }
        }

        return $data;
    }

    /**
     * Safely clamp a `limit` query parameter.
     */
    private function validatedLimit(Request $request, int $default = 5, int $max = 25): int
    {
        $raw = $request->query('limit', $default);
        if (!is_numeric($raw)) {
            return $default;
        }
        return (int) min(max((int) $raw, 1), $max);
    }

    /**
     * Apply `whereNull('deleted_at')` only if the column exists.
     */
    private function excludeDeleted($query, string $table)
    {
        if (Schema::hasColumn($table, 'deleted_at')) {
            $query->whereNull("{$table}.deleted_at");
        }
        return $query;
    }

    /**
     * Apply company / branch filters if the columns exist.
     */
    private function applyCompanyBranch($query, Request $request, string $table): void
    {
        $companyId = $request->query('company_id');
        $branchId  = $request->query('branch_id');

        if ($companyId && Schema::hasColumn($table, 'company_id')) {
            $query->where("{$table}.company_id", (int) $companyId);
        }
        if ($branchId && Schema::hasColumn($table, 'branch_id')) {
            $query->where("{$table}.branch_id", (int) $branchId);
        }
    }

    /**
     * Apply a date range to the given column.
     */
    private function applyDateRange($query, Request $request, string $table, ?string $column = null): void
    {
        $from = $request->query('date_from');
        $to   = $request->query('date_to');
        if (!$from && !$to) {
            return;
        }

        $col = $column;
        if ($col === null) {
            $col = Schema::hasColumn($table, 'invoice_date') ? 'invoice_date' : 'created_at';
        }

        if ($from) {
            $query->whereDate("{$table}.{$col}", '>=', $from);
        }
        if ($to) {
            $query->whereDate("{$table}.{$col}", '<=', $to);
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Analytics (aggregate dashboard)
    |--------------------------------------------------------------------------
    */

    public function analytics(Request $request)
    {
        $validation = $this->validateCommonFilters($request);
        if (isset($validation['error'])) {
            return response()->json(['success' => false, 'message' => $validation['error']], 422);
        }

        $salesQuery = Invoice::query();
        $this->excludeDeleted($salesQuery, 'invoices');
        $this->applyDateRange($salesQuery, $request, 'invoices');
        $this->applyCompanyBranch($salesQuery, $request, 'invoices');

        $purchaseQuery = null;
        if (Schema::hasTable('purchase_invoices')) {
            $purchaseQuery = PurchaseInvoice::query();
            $this->excludeDeleted($purchaseQuery, 'purchase_invoices');
            $this->applyDateRange($purchaseQuery, $request, 'purchase_invoices');
            $this->applyCompanyBranch($purchaseQuery, $request, 'purchase_invoices');
        }

        $totalSales    = (float) $salesQuery->sum('total_amount');
        $totalPurchase = $purchaseQuery ? (float) $purchaseQuery->sum('grand_total') : 0.0;
        $totalOrders   = (int) $salesQuery->count();

        $customerQuery = Customer::query();
        $this->excludeDeleted($customerQuery, 'customers');
        $this->applyCompanyBranch($customerQuery, $request, 'customers');
        $totalCustomers = (int) $customerQuery->count();

        $productQuery = Product::query();
        $this->excludeDeleted($productQuery, 'products');
        $this->applyCompanyBranch($productQuery, $request, 'products');
        $totalProducts = (int) $productQuery->count();

        $stockQ = Product::query();
        $this->excludeDeleted($stockQ, 'products');
        $stockQuantity = (int) $stockQ->sum('stock_quantity');

        $lowStockQ = Product::query();
        $this->excludeDeleted($lowStockQ, 'products');
        $lowStock = (int) $lowStockQ
            ->where('stock_quantity', '<=', DB::raw('COALESCE(reorder_level, 0)'))
            ->count();

        $grossProfit  = max(0, $totalSales - $totalPurchase);
        $netProfit    = max(0, $grossProfit);
        $profitMargin = $totalSales > 0 ? ($netProfit / $totalSales) * 100 : 0;

        return response()->json([
            'success' => true,
            'data' => [
                'overview' => [
                    'totalSales'      => $totalSales,
                    'totalPurchase'   => $totalPurchase,
                    'grossProfit'     => $grossProfit,
                    'netProfit'       => $netProfit,
                    'profitMargin'    => $profitMargin,
                    'totalExpenses'   => 0,
                    'cashBalance'     => 0,
                    'bankBalance'     => 0,
                    'receivable'      => 0,
                    'payable'         => 0,
                    'stockValue'      => 0,
                    'totalOrders'     => $totalOrders,
                    'totalCustomers'  => $totalCustomers,
                    'totalEmployees'  => 0,
                    'businessGrowth'  => 0,
                ],
                'sales' => [
                    'today'             => 0,
                    'monthly'           => $totalSales,
                    'growth'            => 0,
                    'target'            => 0,
                    'achievement'       => 0,
                    'byBranch'          => [],
                    'byEmployee'        => [],
                    'byProduct'         => [],
                    'byCategory'        => [],
                    'topProducts'       => [],
                    'topCustomers'      => [],
                    'averageOrderValue' => $totalOrders > 0 ? ($totalSales / $totalOrders) : 0,
                    'salesReturn'       => 0,
                    'discount'          => 0,
                    'profit'            => $netProfit,
                ],
                'inventory' => [
                    'totalStock'     => $stockQuantity,
                    'stockValue'     => 0,
                    'lowStock'       => $lowStock,
                    'outOfStock'     => (int) Product::query()
                        ->whereNull('deleted_at')
                        ->where('stock_quantity', 0)
                        ->count(),
                    'overstock'      => 0,
                    'reservedStock'  => 0,
                    'damagedStock'   => 0,
                    'fastMovingStock'=> 0,
                    'slowMovingStock'=> 0,
                    'deadStock'      => 0,
                    'stockTurnover'  => 0,
                    'stockAging'     => 0,
                    'warehouseWise'  => [],
                ],
                'finance' => [
                    'cashInflow'        => 0,
                    'cashOutflow'       => 0,
                    'netCashFlow'       => 0,
                    'cashBalance'       => 0,
                    'bankBalance'       => 0,
                    'receivable'        => 0,
                    'payable'           => 0,
                    'overdueReceivable' => 0,
                    'overduePayable'    => 0,
                    'expense'           => 0,
                    'expenseByCategory' => [],
                    'profitAndLoss'     => [
                        'revenue'  => $totalSales,
                        'expenses' => 0,
                        'net'      => $netProfit,
                    ],
                ],
                'customers' => [
                    'totalCustomers'      => $totalCustomers,
                    'newCustomers'        => 0,
                    'activeCustomers'     => 0,
                    'inactiveCustomers'   => 0,
                    'returningCustomers'  => 0,
                    'customerGrowth'      => 0,
                    'purchaseTrend'       => [],
                    'topCustomers'        => [],
                    'outstanding'         => 0,
                    'lifetimeValue'       => 'Insufficient data',
                ],
                'products' => [
                    'totalProducts'         => $totalProducts,
                    'bestSellingProducts'   => [],
                    'slowMovingProducts'    => [],
                    'nonMovingProducts'     => [],
                    'highestProfitProducts' => [],
                    'lowestProfitProducts'  => [],
                    'productSales'          => [],
                    'productProfit'         => [],
                    'productMargin'         => [],
                    'productReturnRate'     => [],
                ],
                'alerts' => [],
                'ai' => [
                    'status'   => 'AI insights not configured',
                    'insights' => [],
                ],
            ],
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | Profit Summary
    |--------------------------------------------------------------------------
    */

    public function profitSummary(Request $request)
    {
        $validation = $this->validateCommonFilters($request);
        if (isset($validation['error'])) {
            return response()->json(['success' => false, 'message' => $validation['error']], 422);
        }

        $base = DB::table('invoice_items as ii')
            ->join('products as p', 'p.id', '=', 'ii.product_id')
            ->join('invoices as i', 'i.id', '=', 'ii.invoice_id')
            ->whereNull('i.deleted_at')
            ->whereNull('p.deleted_at')
            ->where('i.status', '!=', 'draft');

        if ($cid = $request->query('company_id')) {
            if (Schema::hasColumn('invoices', 'company_id')) {
                $base->where('i.company_id', (int) $cid);
            }
        }
        if ($bid = $request->query('branch_id')) {
            if (Schema::hasColumn('invoices', 'branch_id')) {
                $base->where('i.branch_id', (int) $bid);
            }
        }
        if ($from = $request->query('date_from')) {
            $base->whereDate('i.invoice_date', '>=', $from);
        }
        if ($to = $request->query('date_to')) {
            $base->whereDate('i.invoice_date', '<=', $to);
        }

        $totalProfit = (clone $base)
            ->sum(DB::raw('(ii.unit_price - COALESCE(p.purchase_price, 0)) * ii.quantity'));

        $monthlyRaw = (clone $base)
            ->whereYear('i.invoice_date', now()->year)
            ->select(
                DB::raw("DATE_FORMAT(i.invoice_date, '%b') as month"),
                DB::raw('SUM((ii.unit_price - COALESCE(p.purchase_price, 0)) * ii.quantity) as profit')
            )
            ->groupBy(DB::raw("YEAR(i.invoice_date), MONTH(i.invoice_date), DATE_FORMAT(i.invoice_date, '%b')"))
            ->orderBy(DB::raw("YEAR(i.invoice_date), MONTH(i.invoice_date)"))
            ->get();

        $monthlyProfitMap = $monthlyRaw->pluck('profit', 'month')->toArray();
        $allMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        $monthlyProfit = collect($allMonths)->map(fn ($month) => [
            'month'  => $month,
            'profit' => (float) ($monthlyProfitMap[$month] ?? 0),
        ])->values()->all();

        return response()->json([
            'success' => true,
            'data' => [
                'total_profit'   => (float) $totalProfit,
                'monthly_profit' => $monthlyProfit,
            ],
        ]);
    }

    public function profit(Request $request)
    {
        return $this->profitSummary($request);
    }

    /*
    |--------------------------------------------------------------------------
    | New vs Existing Customers
    |--------------------------------------------------------------------------
    */

    public function newVsExistingCustomers(Request $request)
    {
        $validation = $this->validateCommonFilters($request);
        if (isset($validation['error'])) {
            return response()->json(['success' => false, 'message' => $validation['error']], 422);
        }

        try {
            $newCustomerThreshold = now()->subDays(30);

            $base = DB::table('invoices as i')
                ->join('customers as c', 'i.customer_id', '=', 'c.id')
                ->whereNull('i.deleted_at')
                ->whereNull('c.deleted_at')
                ->where('i.status', '!=', 'draft');

            if ($cid = $request->query('company_id')) {
                if (Schema::hasColumn('invoices', 'company_id')) {
                    $base->where('i.company_id', (int) $cid);
                }
            }
            if ($bid = $request->query('branch_id')) {
                if (Schema::hasColumn('invoices', 'branch_id')) {
                    $base->where('i.branch_id', (int) $bid);
                }
            }

            // Aggregate per customer in DB
            $rows = (clone $base)
                ->select(
                    'c.id as customer_id',
                    'c.name as customer_name',
                    'c.created_at as customer_created_at',
                    DB::raw('SUM(i.total_amount) as total_sales'),
                    DB::raw('COUNT(i.id) as invoice_count')
                )
                ->groupBy('c.id', 'c.name', 'c.created_at')
                ->get();

            $newCustomers      = [];
            $existingCustomers = [];

            foreach ($rows as $row) {
                $isNew = $row->customer_created_at && strtotime($row->customer_created_at) >= $newCustomerThreshold->timestamp;
                $item  = [
                    'customer_id'   => (int) $row->customer_id,
                    'customer_name' => $row->customer_name,
                    'total_sales'   => (float) $row->total_sales,
                    'invoice_count' => (int) $row->invoice_count,
                ];
                if ($isNew) $newCustomers[] = $item;
                else        $existingCustomers[] = $item;
            }

            $newTotal      = array_sum(array_column($newCustomers, 'total_sales'));
            $existingTotal = array_sum(array_column($existingCustomers, 'total_sales'));
            $totalSales    = $newTotal + $existingTotal;

            $newCount      = count($newCustomers);
            $existingCount = count($existingCustomers);
            $totalCount    = $newCount + $existingCount;

            usort($newCustomers,      fn ($a, $b) => $b['total_sales'] <=> $a['total_sales']);
            usort($existingCustomers, fn ($a, $b) => $b['total_sales'] <=> $a['total_sales']);

            return response()->json([
                'success' => true,
                'data' => [
                    'new_customers' => [
                        'count'            => $newCount,
                        'total_sales'      => $newTotal,
                        'percentage'       => $totalCount > 0 ? round(($newCount / $totalCount) * 100, 2) : 0,
                        'sales_percentage' => $totalSales > 0 ? round(($newTotal / $totalSales) * 100, 2) : 0,
                        'customers'        => $newCustomers,
                    ],
                    'existing_customers' => [
                        'count'            => $existingCount,
                        'total_sales'      => $existingTotal,
                        'percentage'       => $totalCount > 0 ? round(($existingCount / $totalCount) * 100, 2) : 0,
                        'sales_percentage' => $totalSales > 0 ? round(($existingTotal / $totalSales) * 100, 2) : 0,
                        'customers'        => $existingCustomers,
                    ],
                    'summary' => [
                        'total_customers'        => $totalCount,
                        'total_sales'            => $totalSales,
                        'new_customer_sales'     => $newTotal,
                        'existing_customer_sales'=> $existingTotal,
                    ],
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch new vs existing customer data',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Payment Summary — FIXED: outward now uses payments table
    |--------------------------------------------------------------------------
    */

    public function paymentSummary(Request $request)
    {
        $validation = $this->validateCommonFilters($request);
        if (isset($validation['error'])) {
            return response()->json(['success' => false, 'message' => $validation['error']], 422);
        }

        try {
            if (!Schema::hasTable('payments')) {
                return response()->json([
                    'success' => true,
                    'data' => [
                        'inward'  => ['total' => 0, 'online' => 0, 'cash' => 0],
                        'outward' => ['total' => 0, 'online' => 0, 'cash' => 0],
                    ],
                ]);
            }

            $hasDirection = Schema::hasColumn('payments', 'payment_direction');
            $hasMethod    = Schema::hasColumn('payments', 'payment_method');

            $build = function (string $direction) use ($request, $hasDirection, $hasMethod) {
                if (!$hasDirection && $direction === 'outward') {
                    // Without a direction column we cannot reliably classify outward
                    return ['total' => 0.0, 'online' => 0.0, 'cash' => 0.0];
                }

                $q = Payment::query();
                $this->excludeDeleted($q, 'payments');

                if ($hasDirection) {
                    $q->where('payment_direction', $direction);
                }

                if (Schema::hasColumn('payments', 'transaction_date')) {
                    if ($from = $request->query('date_from')) {
                        $q->whereDate('transaction_date', '>=', $from);
                    }
                    if ($to = $request->query('date_to')) {
                        $q->whereDate('transaction_date', '<=', $to);
                    }
                }

                $this->applyCompanyBranch($q, $request, 'payments');

                $cashExpr = $hasMethod
                    ? "COALESCE(SUM(CASE WHEN LOWER(payment_method) IN ('cash','cash_payment') THEN amount ELSE 0 END),0)"
                    : "0";
                $onlineExpr = $hasMethod
                    ? "COALESCE(SUM(CASE WHEN LOWER(payment_method) NOT IN ('cash','cash_payment') THEN amount ELSE 0 END),0)"
                    : "COALESCE(SUM(amount),0)";

                $row = $q->selectRaw(
                    "COALESCE(SUM(amount),0) as total, {$cashExpr} as cash, {$onlineExpr} as online"
                )->first();

                return [
                    'total'  => (float) ($row->total ?? 0),
                    'online' => (float) ($row->online ?? 0),
                    'cash'   => (float) ($row->cash ?? 0),
                ];
            };

            return response()->json([
                'success' => true,
                'data' => [
                    'inward'  => $build('inward'),
                    'outward' => $build('outward'),
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch payment summary',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Inventory Summary — FIXED: query-builder mutation bug
    |--------------------------------------------------------------------------
    */

    public function inventorySummary(Request $request)
    {
        $validation = $this->validateCommonFilters($request);
        if (isset($validation['error'])) {
            return response()->json(['success' => false, 'message' => $validation['error']], 422);
        }

        try {
            $base = Product::query();
            $this->excludeDeleted($base, 'products');
            $this->applyCompanyBranch($base, $request, 'products');

            $totalProducts = (int) (clone $base)->count();
            $totalQuantity = (int) (clone $base)->sum('stock_quantity');
            $inStock       = (int) (clone $base)->where('stock_quantity', '>', 0)->count();
            $lowStock      = (int) (clone $base)
                ->where('stock_quantity', '>', 0)
                ->where('stock_quantity', '<=', DB::raw('COALESCE(reorder_level, 0)'))
                ->count();
            $zeroStock     = (int) (clone $base)->where('stock_quantity', 0)->count();
            $negativeStock = (int) (clone $base)->where('stock_quantity', '<', 0)->count();

            return response()->json([
                'success' => true,
                'data' => [
                    'totalProducts' => $totalProducts,
                    'totalQuantity' => $totalQuantity,
                    'inStock'       => $inStock,
                    'lowStock'      => $lowStock,
                    'zeroStock'     => $zeroStock,
                    'negativeStock' => $negativeStock,
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch inventory summary',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Invoice Count / Amount Summary
    |--------------------------------------------------------------------------
    */

    public function invoiceCountSummary(Request $request)
    {
        $validation = $this->validateCommonFilters($request);
        if (isset($validation['error'])) {
            return response()->json(['success' => false, 'message' => $validation['error']], 422);
        }

        try {
            $q = Invoice::query();
            $this->excludeDeleted($q, 'invoices');
            $this->applyCompanyBranch($q, $request, 'invoices');

            $sale = (int) $q->count();

            $purchase = 0;
            if (Schema::hasTable('purchase_invoices')) {
                $p = PurchaseInvoice::query();
                $this->excludeDeleted($p, 'purchase_invoices');
                $this->applyCompanyBranch($p, $request, 'purchase_invoices');
                $purchase = (int) $p->count();
            }

            return response()->json([
                'success' => true,
                'data' => ['sale' => $sale, 'purchase' => $purchase],
            ]);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => 'Failed to fetch invoice count summary'], 500);
        }
    }

    public function invoiceAmountSummary(Request $request)
    {
        $validation = $this->validateCommonFilters($request);
        if (isset($validation['error'])) {
            return response()->json(['success' => false, 'message' => $validation['error']], 422);
        }

        try {
            $q = Invoice::query();
            $this->excludeDeleted($q, 'invoices');
            $this->applyCompanyBranch($q, $request, 'invoices');
            $sale = (float) $q->sum('total_amount');

            $purchase = 0.0;
            if (Schema::hasTable('purchase_invoices')) {
                $p = PurchaseInvoice::query();
                $this->excludeDeleted($p, 'purchase_invoices');
                $this->applyCompanyBranch($p, $request, 'purchase_invoices');
                $purchase = (float) $p->sum('grand_total');
            }

            return response()->json([
                'success' => true,
                'data' => ['sale' => $sale, 'purchase' => $purchase],
            ]);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => 'Failed to fetch invoice amount summary'], 500);
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Products
    |--------------------------------------------------------------------------
    */

    public function topSellingProducts(Request $request)
    {
        $validation = $this->validateCommonFilters($request);
        if (isset($validation['error'])) {
            return response()->json(['success' => false, 'message' => $validation['error']], 422);
        }

        $limit = $this->validatedLimit($request, 5, 25);

        $q = InvoiceItem::query()
            ->join('products', 'invoice_items.product_id', '=', 'products.id')
            ->join('invoices', 'invoice_items.invoice_id', '=', 'invoices.id')
            ->whereNull('products.deleted_at')
            ->whereNull('invoices.deleted_at')
            ->where('invoices.status', '!=', 'draft')
            ->select('products.name as product_name', DB::raw('SUM(invoice_items.quantity) as total_qty'))
            ->groupBy('products.id', 'products.name')
            ->orderByDesc('total_qty')
            ->limit($limit);

        $this->applyCompanyBranch($q, $request, 'invoices');
        $this->applyDateRange($q, $request, 'invoices');

        $items = $q->get();

        return response()->json([
            'success' => true,
            'data' => $items->map(fn ($item) => [
                'product_name' => $item->product_name,
                'total_qty'    => (int) ($item->total_qty ?? 0),
            ]),
        ]);
    }

    public function leastSellingProducts(Request $request)
    {
        $validation = $this->validateCommonFilters($request);
        if (isset($validation['error'])) {
            return response()->json(['success' => false, 'message' => $validation['error']], 422);
        }

        $limit = $this->validatedLimit($request, 5, 25);

        $q = InvoiceItem::query()
            ->join('products', 'invoice_items.product_id', '=', 'products.id')
            ->join('invoices', 'invoice_items.invoice_id', '=', 'invoices.id')
            ->whereNull('products.deleted_at')
            ->whereNull('invoices.deleted_at')
            ->where('invoices.status', '!=', 'draft')
            ->select('products.name as product_name', DB::raw('SUM(invoice_items.quantity) as total_qty'))
            ->groupBy('products.id', 'products.name')
            ->orderBy('total_qty', 'asc')
            ->limit($limit);

        $this->applyCompanyBranch($q, $request, 'invoices');

        $items = $q->get();

        return response()->json([
            'success' => true,
            'data' => $items->map(fn ($item) => [
                'product_name' => $item->product_name,
                'total_qty'    => (int) ($item->total_qty ?? 0),
            ]),
        ]);
    }

    public function lowStockProducts(Request $request)
    {
        $validation = $this->validateCommonFilters($request);
        if (isset($validation['error'])) {
            return response()->json(['success' => false, 'message' => $validation['error']], 422);
        }

        $limit = $this->validatedLimit($request, 10, 50);

        $q = Product::query();
        $this->excludeDeleted($q, 'products');
        $this->applyCompanyBranch($q, $request, 'products');

        $items = $q
            ->select('name as product_name', 'stock_quantity as qty')
            ->where(function ($query) {
                $query->where('stock_quantity', '<=', DB::raw('COALESCE(reorder_level, 0)'))
                      ->orWhere('stock_quantity', '<=', 10);
            })
            ->orderBy('stock_quantity', 'asc')
            ->limit($limit)
            ->get();

        return response()->json([
            'success' => true,
            'data' => $items->map(fn ($item) => [
                'product_name' => $item->product_name,
                'qty'          => (int) ($item->qty ?? 0),
            ]),
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | Top Customers / Vendors
    |--------------------------------------------------------------------------
    */

    public function topCustomers(Request $request)
    {
        $validation = $this->validateCommonFilters($request);
        if (isset($validation['error'])) {
            return response()->json(['success' => false, 'message' => $validation['error']], 422);
        }

        $limit = $this->validatedLimit($request, 5, 25);

        $q = Invoice::query()
            ->join('customers', 'invoices.customer_id', '=', 'customers.id')
            ->whereNull('invoices.deleted_at')
            ->whereNull('customers.deleted_at')
            ->where('invoices.status', '!=', 'draft')
            ->select('customers.name as name', DB::raw('SUM(invoices.total_amount) as amount'))
            ->groupBy('customers.id', 'customers.name')
            ->orderByDesc('amount')
            ->limit($limit);

        $this->applyCompanyBranch($q, $request, 'invoices');
        $this->applyDateRange($q, $request, 'invoices');

        $items = $q->get();

        return response()->json([
            'success' => true,
            'data' => $items->map(fn ($item) => [
                'name'   => $item->name,
                'amount' => (float) ($item->amount ?? 0),
            ]),
        ]);
    }

    public function topVendors(Request $request)
    {
        $validation = $this->validateCommonFilters($request);
        if (isset($validation['error'])) {
            return response()->json(['success' => false, 'message' => $validation['error']], 422);
        }

        if (!Schema::hasTable('purchase_invoices') || !Schema::hasTable('suppliers')) {
            return response()->json(['success' => true, 'data' => []]);
        }

        $limit = $this->validatedLimit($request, 5, 25);

        $q = PurchaseInvoice::query()
            ->join('suppliers', 'purchase_invoices.supplier_id', '=', 'suppliers.id')
            ->whereNull('purchase_invoices.deleted_at')
            ->whereNull('suppliers.deleted_at')
            ->select('suppliers.name as name', DB::raw('SUM(purchase_invoices.grand_total) as amount'))
            ->groupBy('suppliers.id', 'suppliers.name')
            ->orderByDesc('amount')
            ->limit($limit);

        $this->applyCompanyBranch($q, $request, 'purchase_invoices');
        $this->applyDateRange($q, $request, 'purchase_invoices');

        $items = $q->get();

        return response()->json([
            'success' => true,
            'data' => $items->map(fn ($item) => [
                'name'   => $item->name,
                'amount' => (float) ($item->amount ?? 0),
            ]),
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | Purchase Due Invoices
    |--------------------------------------------------------------------------
    */

    public function purchaseDueInvoices(Request $request)
    {
        $validation = $this->validateCommonFilters($request);
        if (isset($validation['error'])) {
            return response()->json(['success' => false, 'message' => $validation['error']], 422);
        }

        if (!Schema::hasTable('purchase_invoices')) {
            return response()->json(['success' => true, 'data' => []]);
        }

        $q = PurchaseInvoice::query()
            ->with(['supplier', 'company'])
            ->whereNull('deleted_at')
            ->where('status', '!=', 'paid')
            ->orderBy('due_date');

        $this->applyCompanyBranch($q, $request, 'purchase_invoices');

        $items = $q->get();

        return response()->json([
            'success' => true,
            'data' => $items->map(function ($invoice) {
                return [
                    'invoice_no'        => $invoice->invoice_number ?? $invoice->purchase_number ?? $invoice->bill_number ?? 'N/A',
                    'company_name'      => $invoice->company?->name ?? 'N/A',
                    'name'              => $invoice->supplier?->name ?? 'N/A',
                    'phone'             => $invoice->supplier?->phone ?? '',
                    'due_date'          => $invoice->due_date ? $invoice->due_date->toDateTimeString() : null,
                    'due_from'          => 'Supplier',
                    'remaining_payment' => max(0, (float) ($invoice->grand_total ?? 0) - (float) ($invoice->paid_amount ?? 0)),
                ];
            }),
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | Login Activity (stub)
    |--------------------------------------------------------------------------
    */

    public function loginActivity()
    {
        return response()->json(['success' => true, 'data' => []]);
    }

    /*
    |--------------------------------------------------------------------------
    | Business Health
    |--------------------------------------------------------------------------
    */

    public function businessHealth(Request $request)
    {
        $now = now();
        $periodEnd   = $now->copy();
        $periodStart = $now->copy()->subDays(30);
        $prevStart   = $now->copy()->subDays(60);
        $prevEnd     = $now->copy()->subDays(31);

        $currentSales = (float) Invoice::query()
            ->whereNull('deleted_at')
            ->whereBetween('created_at', [$periodStart, $periodEnd])
            ->sum('total_amount');

        $previousSales = (float) Invoice::query()
            ->whereNull('deleted_at')
            ->whereBetween('created_at', [$prevStart, $prevEnd])
            ->sum('total_amount');

        $salesGrowth = null;
        if ($previousSales > 0) {
            $salesGrowth = (($currentSales - $previousSales) / $previousSales) * 100;
        } elseif ($currentSales > 0) {
            $salesGrowth = 100.0;
        }

        $lowStockCount = (int) Product::query()
            ->whereNull('deleted_at')
            ->where('stock_quantity', '<=', DB::raw('COALESCE(reorder_level, 0)'))
            ->count();

        $totalProducts = (int) Product::query()->whereNull('deleted_at')->count();

        $receivable = (float) Invoice::query()
            ->whereNull('deleted_at')
            ->where('status', '!=', 'paid')
            ->sum('total_amount');

        $paymentsIn30 = 0.0;
        if (Schema::hasTable('payments') && Schema::hasColumn('payments', 'transaction_date')) {
            $payQ = Payment::query()->whereBetween('transaction_date', [$periodStart, $periodEnd]);
            $this->excludeDeleted($payQ, 'payments');
            $paymentsIn30 = (float) $payQ->sum('amount');
        }

        $breakdown = [];

        if ($salesGrowth === null) {
            $breakdown[] = ['label' => 'Sales Health', 'score' => 0];
        } else {
            $breakdown[] = ['label' => 'Sales Health', 'score' => (int) max(0, min(100, round(50 + ($salesGrowth / 2))))];
        }

        $purchaseSum = 0.0;
        if (Schema::hasTable('purchase_invoices')) {
            $pq = PurchaseInvoice::query()
                ->whereNull('deleted_at')
                ->whereBetween('created_at', [$periodStart, $periodEnd]);
            $purchaseSum = (float) $pq->sum('grand_total');
        }

        $profit = max(0, $currentSales - $purchaseSum);
        $profitScore = $currentSales > 0
            ? (int) max(0, min(100, round(($profit / max(1, $currentSales)) * 100)))
            : 0;
        $breakdown[] = ['label' => 'Profit Health', 'score' => $profitScore];

        $breakdown[] = ['label' => 'Cash Flow', 'score' => $paymentsIn30 > 0 ? 80 : 20];

        $inventoryScore = $totalProducts > 0
            ? (int) max(0, min(100, round((1 - ($lowStockCount / max(1, $totalProducts))) * 100)))
            : 0;
        $breakdown[] = ['label' => 'Inventory', 'score' => $inventoryScore];

        $newCustomersCurrent = (int) Customer::query()
            ->whereNull('deleted_at')
            ->whereBetween('created_at', [$periodStart, $periodEnd])
            ->count();
        $newCustomersPrev = (int) Customer::query()
            ->whereNull('deleted_at')
            ->whereBetween('created_at', [$prevStart, $prevEnd])
            ->count();

        $custGrowth = $newCustomersPrev > 0
            ? (($newCustomersCurrent - $newCustomersPrev) / $newCustomersPrev) * 100
            : ($newCustomersCurrent > 0 ? 100 : 0);
        $breakdown[] = ['label' => 'Customer Health', 'score' => (int) max(0, min(100, round(50 + ($custGrowth / 2))))];

        $receivableScore = $receivable > 0
            ? (int) max(0, min(100, round(100 - ($receivable / max(1, $currentSales + $receivable)) * 100)))
            : 100;
        $breakdown[] = ['label' => 'Receivables', 'score' => $receivableScore];

        $employees = 0;
        if (Schema::hasTable('employees')) {
            $eq = DB::table('employees');
            if (Schema::hasColumn('employees', 'deleted_at')) {
                $eq->whereNull('deleted_at');
            }
            $employees = (int) $eq->count();
        }
        $breakdown[] = ['label' => 'Operations', 'score' => $employees > 0 ? 100 : 0];

        $scores  = array_filter(array_map(fn ($b) => is_numeric($b['score']) ? $b['score'] : null, $breakdown));
        $overall = count($scores) ? round(array_sum($scores) / count($scores)) : 0;

        return response()->json([
            'success' => true,
            'data' => ['overall' => (int) $overall, 'breakdown' => $breakdown],
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | Forecast
    |--------------------------------------------------------------------------
    */

    public function forecast(Request $request)
    {
        $now = now();
        $ranges = [
            'today'      => [$now->copy()->startOfDay(), $now->copy()->endOfDay()],
            'sevenDays'  => [$now->copy()->subDays(6)->startOfDay(), $now->copy()->endOfDay()],
            'thirtyDays' => [$now->copy()->subDays(29)->startOfDay(), $now->copy()->endOfDay()],
            'ninetyDays' => [$now->copy()->subDays(89)->startOfDay(), $now->copy()->endOfDay()],
        ];

        $build = function (string $model, string $field, string $table) use ($ranges) {
            $out = [];
            foreach ($ranges as $key => $range) {
                $q = $model::query()->whereBetween('created_at', $range);
                $this->excludeDeleted($q, $table);
                $out[$key] = (float) $q->sum($field);
            }
            return $out;
        };

        $sales = $build(Invoice::class, 'total_amount', 'invoices');
        $purchase = Schema::hasTable('purchase_invoices')
            ? $build(PurchaseInvoice::class, 'grand_total', 'purchase_invoices')
            : ['today' => 0, 'sevenDays' => 0, 'thirtyDays' => 0, 'ninetyDays' => 0];

        $profit = [
            'today'      => $sales['today'] - ($purchase['today'] ?? 0),
            'sevenDays'  => $sales['sevenDays'] - ($purchase['sevenDays'] ?? 0),
            'thirtyDays' => $sales['thirtyDays'] - ($purchase['thirtyDays'] ?? 0),
            'ninetyDays' => $sales['ninetyDays'] - ($purchase['ninetyDays'] ?? 0),
        ];

        $cashFlow = [];
        foreach ($ranges as $k => $rng) {
            $q = Payment::query()->whereBetween('transaction_date', $rng);
            $this->excludeDeleted($q, 'payments');
            $cashFlow[$k] = (float) $q->sum('amount');
        }

        $stockDemand = [];
        foreach ($ranges as $k => $rng) {
            $q = InvoiceItem::query()->whereBetween('created_at', $rng);
            $stockDemand[$k] = (int) $q->sum('quantity');
        }

        return response()->json([
            'success' => true,
            'data' => [
                'sales'       => ['label' => 'Sales', 'today' => $sales['today'], 'sevenDays' => $sales['sevenDays'], 'thirtyDays' => $sales['thirtyDays'], 'ninetyDays' => $sales['ninetyDays']],
                'purchase'    => ['label' => 'Purchase', 'today' => $purchase['today'] ?? 0, 'sevenDays' => $purchase['sevenDays'] ?? 0, 'thirtyDays' => $purchase['thirtyDays'] ?? 0, 'ninetyDays' => $purchase['ninetyDays'] ?? 0],
                'profit'      => ['label' => 'Profit', 'today' => $profit['today'], 'sevenDays' => $profit['sevenDays'], 'thirtyDays' => $profit['thirtyDays'], 'ninetyDays' => $profit['ninetyDays']],
                'cashFlow'    => ['label' => 'Cash Flow', 'today' => $cashFlow['today'], 'sevenDays' => $cashFlow['sevenDays'], 'thirtyDays' => $cashFlow['thirtyDays'], 'ninetyDays' => $cashFlow['ninetyDays']],
                'stockDemand' => ['label' => 'Stock Demand', 'today' => $stockDemand['today'], 'sevenDays' => $stockDemand['sevenDays'], 'thirtyDays' => $stockDemand['thirtyDays'], 'ninetyDays' => $stockDemand['ninetyDays']],
            ],
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | Risks
    |--------------------------------------------------------------------------
    */

    public function risks()
    {
        $risks = [];

        $lowStock = (int) Product::query()
            ->whereNull('deleted_at')
            ->where('stock_quantity', '<=', DB::raw('COALESCE(reorder_level, 0)'))
            ->count();

        if ($lowStock > 0) {
            $risks[] = [
                'id'                => 1,
                'riskLevel'         => 'High',
                'title'             => 'Low stock items',
                'impact'            => 'Potential stockouts and lost sales',
                'reason'            => "{$lowStock} products at or below reorder level",
                'affectedModule'    => 'Inventory',
                'recommendedAction' => 'Reorder affected SKUs',
            ];
        }

        $overdue = (float) Invoice::query()
            ->whereNull('deleted_at')
            ->where('status', '!=', 'paid')
            ->whereDate('created_at', '<=', now()->subDays(30))
            ->sum('total_amount');

        if ($overdue > 0) {
            $risks[] = [
                'id'                => 2,
                'riskLevel'         => 'Medium',
                'title'             => 'Overdue receivables',
                'impact'            => 'Cash flow pressure',
                'reason'            => "Receivables overdue more than 30 days: {$overdue}",
                'affectedModule'    => 'Finance',
                'recommendedAction' => 'Follow up with customers / send reminders',
            ];
        }

        return response()->json(['success' => true, 'data' => $risks]);
    }

    /*
    |--------------------------------------------------------------------------
    | Anomalies
    |--------------------------------------------------------------------------
    */

    public function anomalies()
    {
        $start = now()->subDays(90);

        $q = DB::table('invoices');
        if (Schema::hasColumn('invoices', 'deleted_at')) {
            $q->whereNull('deleted_at');
        }

        $daily = $q
            ->selectRaw("date(created_at) as day, COALESCE(SUM(total_amount),0) as total")
            ->where('created_at', '>=', $start)
            ->groupByRaw('date(created_at)')
            ->orderBy('day')
            ->get();

        $values = $daily->pluck('total')->toArray();
        $avg = count($values) ? array_sum($values) / count($values) : 0;

        $anomalies = [];
        foreach ($daily as $d) {
            if ($avg > 0 && $d->total > $avg * 3) {
                $anomalies[] = [
                    'id'          => strtotime($d->day),
                    'type'        => 'sales_spike',
                    'description' => "High sales on {$d->day}",
                    'severity'    => 'Medium',
                    'detectedAt'  => $d->day,
                ];
            }
        }

        return response()->json(['success' => true, 'data' => $anomalies]);
    }

    /*
    |--------------------------------------------------------------------------
    | Rankings
    |--------------------------------------------------------------------------
    */

    public function rankings()
    {
        $topProduct = InvoiceItem::query()
            ->join('products', 'invoice_items.product_id', '=', 'products.id')
            ->whereNull('products.deleted_at')
            ->select('products.name as name', DB::raw('SUM(invoice_items.quantity) as total_qty'))
            ->groupBy('products.id', 'products.name')
            ->orderByDesc('total_qty')
            ->first();

        $topCustomer = Invoice::query()
            ->join('customers', 'invoices.customer_id', '=', 'customers.id')
            ->whereNull('invoices.deleted_at')
            ->whereNull('customers.deleted_at')
            ->select('customers.name as name', DB::raw('SUM(invoices.total_amount) as amount'))
            ->groupBy('customers.id', 'customers.name')
            ->orderByDesc('amount')
            ->first();

        $rankings = [];
        if ($topProduct) {
            $rankings[] = [
                'id'       => 1,
                'category' => 'Product',
                'name'     => $topProduct->name,
                'value'    => (int) $topProduct->total_qty,
                'metric'   => 'units_sold',
            ];
        }
        if ($topCustomer) {
            $rankings[] = [
                'id'       => 2,
                'category' => 'Customer',
                'name'     => $topCustomer->name,
                'value'    => (float) $topCustomer->amount,
                'metric'   => 'amount',
            ];
        }

        return response()->json(['success' => true, 'data' => $rankings]);
    }

    /*
    |--------------------------------------------------------------------------
    | Hero Product / Customer
    |--------------------------------------------------------------------------
    */

    public function heroProduct()
    {
        $item = InvoiceItem::query()
            ->join('products', 'invoice_items.product_id', '=', 'products.id')
            ->whereNull('products.deleted_at')
            ->select(
                'products.name as name',
                DB::raw('SUM(invoice_items.subtotal) as sales'),
                DB::raw('SUM(invoice_items.quantity) as qty'),
                DB::raw('AVG(products.purchase_price) as avg_purchase')
            )
            ->groupBy('products.id', 'products.name')
            ->orderByDesc('sales')
            ->first();

        if (!$item) {
            return response()->json(['success' => true, 'data' => null]);
        }

        $totalSales     = (float) $item->sales;
        $estimatedCost  = (float) $item->avg_purchase * (float) $item->qty;
        $totalProfit    = $totalSales - $estimatedCost;

        return response()->json([
            'success' => true,
            'data' => [
                'name'          => $item->name,
                'total_sales'   => $totalSales,
                'total_profit'  => $totalProfit,
                'trend'         => 0,
            ],
        ]);
    }

    /**
     * FIXED: no more raw SQL interpolation.
     */
    public function heroCustomer()
    {
        $cust = Invoice::query()
            ->join('customers', 'invoices.customer_id', '=', 'customers.id')
            ->whereNull('invoices.deleted_at')
            ->whereNull('customers.deleted_at')
            ->select(
                'customers.id as id',
                'customers.name as name',
                DB::raw('SUM(invoices.total_amount) as total')
            )
            ->groupBy('customers.id', 'customers.name')
            ->orderByDesc('total')
            ->first();

        if (!$cust) {
            return response()->json(['success' => true, 'data' => null]);
        }

        $last = Invoice::query()
            ->where('customer_id', $cust->id)
            ->whereNull('deleted_at')
            ->orderByDesc('created_at')
            ->first();

        return response()->json([
            'success' => true,
            'data' => [
                'name'            => $cust->name,
                'total_purchases' => (float) $cust->total,
                'total_amount'    => (float) $cust->total,
                'last_purchase'   => $last?->created_at?->toDateTimeString() ?? null,
            ],
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | District Sales
    |--------------------------------------------------------------------------
    */

    public function districtSales(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'state' => 'nullable|string|max:100',
        ]);
        if ($validator->fails()) {
            return response()->json(['success' => false, 'message' => $validator->errors()->first()], 422);
        }

        $state = $request->query('state');

        $q = Invoice::query()
            ->join('customers', 'invoices.customer_id', '=', 'customers.id')
            ->whereNull('invoices.deleted_at')
            ->whereNull('customers.deleted_at')
            ->where('invoices.status', '!=', 'draft')
            ->select(
                DB::raw("COALESCE(customers.billing_city, customers.shipping_city, '') as district"),
                DB::raw('SUM(invoices.total_amount) as sales'),
                DB::raw('COUNT(invoices.id) as orders')
            )
            ->groupBy('district')
            ->havingRaw("district != ''")
            ->orderByDesc('sales')
            ->limit(50);

        if ($state) {
            $q->where(function ($sub) use ($state) {
                $sub->where('customers.billing_state', $state)
                    ->orWhere('customers.shipping_state', $state);
            });
        }

        $items = $q->get();

        return response()->json([
            'success' => true,
            'data' => $items->map(fn ($it) => [
                'district' => $it->district,
                'sales'    => (float) $it->sales,
                'orders'   => (int) $it->orders,
            ]),
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | All Reports
    |--------------------------------------------------------------------------
    */

    public function allReports(Request $request)
    {
        $validation = $this->validateCommonFilters($request);
        if (isset($validation['error'])) {
            return response()->json(['success' => false, 'message' => $validation['error']], 422);
        }

        try {
            $dateFrom  = $request->query('date_from');
            $dateTo    = $request->query('date_to');
            $companyId = $request->query('company_id');
            $branchId  = $request->query('branch_id');

            // ─── Sales Report ───
            $salesQuery = Invoice::query()->whereNull('deleted_at')->where('status', '!=', 'draft');
            if ($dateFrom) $salesQuery->whereDate('invoice_date', '>=', $dateFrom);
            if ($dateTo)   $salesQuery->whereDate('invoice_date', '<=', $dateTo);
            if ($companyId) $salesQuery->where('company_id', $companyId);
            if ($branchId)  $salesQuery->where('branch_id', $branchId);

            $totalSales        = (float) (clone $salesQuery)->sum('total_amount');
            $totalSaleInvoices = (int)   (clone $salesQuery)->count();

            $paidInvoices    = (int) Invoice::whereNull('deleted_at')->where('status', 'paid')->count();
            $unpaidInvoices  = (int) Invoice::whereNull('deleted_at')->whereNotIn('status', ['paid', 'draft'])->count();
            $overdueInvoices = (int) Invoice::whereNull('deleted_at')->where('status', 'overdue')->count();

            // ─── Purchase Report ───
            $totalPurchases        = 0.0;
            $totalPurchaseInvoices = 0;
            $paidPurchases         = 0;
            $unpaidPurchases       = 0;
            $monthlyPurchases      = collect();

            if (Schema::hasTable('purchase_invoices')) {
                $pq = PurchaseInvoice::query()->whereNull('deleted_at');
                if ($dateFrom) $pq->whereDate('purchase_date', '>=', $dateFrom);
                if ($dateTo)   $pq->whereDate('purchase_date', '<=', $dateTo);
                if ($companyId) $pq->where('company_id', $companyId);

                $totalPurchases        = (float) (clone $pq)->sum('grand_total');
                $totalPurchaseInvoices = (int)   (clone $pq)->count();

                $paidPurchases   = (int) PurchaseInvoice::whereNull('deleted_at')->where('status', 'paid')->count();
                $unpaidPurchases = (int) PurchaseInvoice::whereNull('deleted_at')->where('status', '!=', 'paid')->count();

                $monthlyPurchases = DB::table('purchase_invoices')
                    ->whereNull('deleted_at')
                    ->select(DB::raw("DATE_FORMAT(purchase_date, '%Y-%m') as month"), DB::raw('SUM(grand_total) as total'))
                    ->whereYear('purchase_date', now()->year)
                    ->groupBy('month')
                    ->orderBy('month')
                    ->get();
            }

            // ─── Customer Report ───
            $cq = Customer::query()->whereNull('deleted_at');
            if ($dateFrom) $cq->whereDate('created_at', '>=', $dateFrom);
            if ($dateTo)   $cq->whereDate('created_at', '<=', $dateTo);

            $totalCustomers    = (int) (clone $cq)->count();
            $activeCustomers   = (int) Customer::whereNull('deleted_at')->where('is_active', true)->count();
            $inactiveCustomers = (int) Customer::whereNull('deleted_at')->where('is_active', false)->count();
            $newCustomers30Days= (int) Customer::whereNull('deleted_at')->where('created_at', '>=', now()->subDays(30))->count();
            $newCustomers7Days = (int) Customer::whereNull('deleted_at')->where('created_at', '>=', now()->subDays(7))->count();

            // ─── Product / Inventory Report ───
            $totalProducts       = (int) Product::whereNull('deleted_at')->count();
            $totalStockQty       = (int) Product::whereNull('deleted_at')->sum('stock_quantity');
            $lowStockProducts    = (int) Product::whereNull('deleted_at')->where('stock_quantity', '<=', DB::raw('COALESCE(reorder_level, 0)'))->count();
            $outOfStockProducts  = (int) Product::whereNull('deleted_at')->where('stock_quantity', 0)->count();
            $inStockProducts     = (int) Product::whereNull('deleted_at')->where('stock_quantity', '>', 0)->count();
            $stockValue          = (float) Product::whereNull('deleted_at')
                ->sum(DB::raw('COALESCE(purchase_price, 0) * COALESCE(stock_quantity, 0)'));

            // ─── Payment Report ───
            $totalInwardPayments = 0.0;
            $totalOutwardPayments= 0.0;
            $inwardCash          = 0.0;
            $inwardOnline        = 0.0;

            if (Schema::hasTable('payments')) {
                $baseP = Payment::query()->whereNull('deleted_at');
                if ($dateFrom && Schema::hasColumn('payments', 'transaction_date')) {
                    $baseP->whereDate('transaction_date', '>=', $dateFrom);
                }
                if ($dateTo && Schema::hasColumn('payments', 'transaction_date')) {
                    $baseP->whereDate('transaction_date', '<=', $dateTo);
                }

                if (Schema::hasColumn('payments', 'payment_direction')) {
                    $totalInwardPayments  = (float) (clone $baseP)->where('payment_direction', 'inward')->sum('amount');
                    $totalOutwardPayments = (float) (clone $baseP)->where('payment_direction', 'outward')->sum('amount');

                    if (Schema::hasColumn('payments', 'payment_method')) {
                        $inwardCash   = (float) (clone $baseP)->where('payment_direction', 'inward')->where('payment_method', 'cash')->sum('amount');
                        $inwardOnline = (float) (clone $baseP)->where('payment_direction', 'inward')->where('payment_method', '!=', 'cash')->sum('amount');
                    }
                } else {
                    $totalInwardPayments = (float) (clone $baseP)->sum('amount');
                }
            }

            // ─── Monthly Sales ───
            $monthlySales = DB::table('invoices')
                ->whereNull('deleted_at')
                ->where('status', '!=', 'draft')
                ->select(DB::raw("DATE_FORMAT(invoice_date, '%Y-%m') as month"), DB::raw('SUM(total_amount) as total'))
                ->whereYear('invoice_date', now()->year)
                ->groupBy('month')
                ->orderBy('month')
                ->get();

            // ─── Top Products ───
            $topProducts = InvoiceItem::query()
                ->join('products', 'invoice_items.product_id', '=', 'products.id')
                ->whereNull('products.deleted_at')
                ->select('products.name', 'products.sku', DB::raw('SUM(invoice_items.quantity) as total_qty'), DB::raw('SUM(invoice_items.total) as total_amount'))
                ->groupBy('products.id', 'products.name', 'products.sku')
                ->orderByDesc('total_qty')
                ->limit(10)
                ->get();

            // ─── Top Customers ───
            $topCustomers = Invoice::query()
                ->join('customers', 'invoices.customer_id', '=', 'customers.id')
                ->whereNull('invoices.deleted_at')
                ->whereNull('customers.deleted_at')
                ->where('invoices.status', '!=', 'draft')
                ->select('customers.name', 'customers.email', DB::raw('SUM(invoices.total_amount) as total_amount'), DB::raw('COUNT(invoices.id) as invoice_count'))
                ->groupBy('customers.id', 'customers.name', 'customers.email')
                ->orderByDesc('total_amount')
                ->limit(10)
                ->get();

            // ─── Employee Report ───
            $totalEmployees    = Schema::hasTable('employees') ? (int) DB::table('employees')->count() : 0;
            $activeEmployees   = Schema::hasTable('employees') ? (int) DB::table('employees')->where('status', 'active')->count() : 0;
            $inactiveEmployees = Schema::hasTable('employees') ? (int) DB::table('employees')->where('status', '!=', 'active')->count() : 0;

            // ─── Attendance Report ───
            $todayAttendance = 0;
            $presentToday    = 0;
            $absentToday     = 0;
            if (Schema::hasTable('attendance')) {
                $todayAttendance = (int) DB::table('attendance')->whereDate('created_at', now()->toDateString())->count();
                $presentToday    = (int) DB::table('attendance')->whereDate('created_at', now()->toDateString())->where('status', 'present')->count();
                $absentToday     = (int) DB::table('attendance')->whereDate('created_at', now()->toDateString())->where('status', 'absent')->count();
            }

            // ─── Profit Report ───
            $totalProfit = DB::table('invoice_items as ii')
                ->join('products as p', 'p.id', '=', 'ii.product_id')
                ->join('invoices as i', 'i.id', '=', 'ii.invoice_id')
                ->whereNull('i.deleted_at')
                ->whereNull('p.deleted_at')
                ->where('i.status', '!=', 'draft')
                ->sum(DB::raw('(ii.unit_price - COALESCE(p.purchase_price, 0)) * ii.quantity'));

            $grossProfit  = $totalSales - $totalPurchases;
            $netProfit    = $totalProfit;
            $profitMargin = $totalSales > 0 ? ($netProfit / $totalSales) * 100 : 0;

            // ─── Branch Report ───
            $branchSales = Invoice::query()
                ->join('branches', 'invoices.branch_id', '=', 'branches.id')
                ->whereNull('invoices.deleted_at')
                ->where('invoices.status', '!=', 'draft')
                ->select('branches.name', DB::raw('SUM(invoices.total_amount) as total_amount'), DB::raw('COUNT(invoices.id) as invoice_count'))
                ->groupBy('branches.id', 'branches.name')
                ->orderByDesc('total_amount')
                ->get();

            // ─── Company Report ───
            $companySales = Invoice::query()
                ->join('companies', 'invoices.company_id', '=', 'companies.id')
                ->whereNull('invoices.deleted_at')
                ->where('invoices.status', '!=', 'draft')
                ->select('companies.name', DB::raw('SUM(invoices.total_amount) as total_amount'), DB::raw('COUNT(invoices.id) as invoice_count'))
                ->groupBy('companies.id', 'companies.name')
                ->orderByDesc('total_amount')
                ->get();

            // ─── District Sales ───
            $districtSales = Invoice::query()
                ->join('customers', 'invoices.customer_id', '=', 'customers.id')
                ->whereNull('invoices.deleted_at')
                ->whereNull('customers.deleted_at')
                ->select(DB::raw("COALESCE(customers.billing_city, customers.shipping_city, '') as district"), DB::raw('SUM(invoices.total_amount) as sales'), DB::raw('COUNT(invoices.id) as orders'))
                ->groupBy('district')
                ->havingRaw("district != ''")
                ->orderByDesc('sales')
                ->limit(50)
                ->get();

            return response()->json([
                'success' => true,
                'data' => [
                    'generated_at' => now()->toDateTimeString(),
                    'filters' => [
                        'date_from'  => $dateFrom,
                        'date_to'    => $dateTo,
                        'company_id' => $companyId,
                        'branch_id'  => $branchId,
                    ],
                    'sales_report' => [
                        'total_sales'      => $totalSales,
                        'total_invoices'   => $totalSaleInvoices,
                        'paid_invoices'    => $paidInvoices,
                        'unpaid_invoices'  => $unpaidInvoices,
                        'overdue_invoices' => $overdueInvoices,
                        'monthly'          => $monthlySales->map(fn ($m) => ['month' => $m->month, 'total' => (float) $m->total]),
                        'by_branch'        => $branchSales->map(fn ($b) => ['branch' => $b->name, 'total_amount' => (float) $b->total_amount, 'invoice_count' => (int) $b->invoice_count]),
                        'by_company'       => $companySales->map(fn ($c) => ['company' => $c->name, 'total_amount' => (float) $c->total_amount, 'invoice_count' => (int) $c->invoice_count]),
                        'by_district'      => $districtSales->map(fn ($d) => ['district' => $d->district, 'sales' => (float) $d->sales, 'orders' => (int) $d->orders]),
                    ],
                    'purchase_report' => [
                        'total_purchases' => $totalPurchases,
                        'total_invoices'  => $totalPurchaseInvoices,
                        'paid_invoices'   => $paidPurchases,
                        'unpaid_invoices' => $unpaidPurchases,
                        'monthly'         => $monthlyPurchases->map(fn ($m) => ['month' => $m->month, 'total' => (float) $m->total]),
                    ],
                    'customer_report' => [
                        'total_customers'       => $totalCustomers,
                        'active_customers'      => $activeCustomers,
                        'inactive_customers'    => $inactiveCustomers,
                        'new_customers_30_days' => $newCustomers30Days,
                        'new_customers_7_days'  => $newCustomers7Days,
                        'top_customers'         => $topCustomers->map(fn ($c) => [
                            'name'          => $c->name,
                            'email'         => $c->email,
                            'total_amount'  => (float) $c->total_amount,
                            'invoice_count' => (int) $c->invoice_count,
                        ]),
                    ],
                    'product_report' => [
                        'total_products'        => $totalProducts,
                        'total_stock_qty'       => $totalStockQty,
                        'stock_value'           => $stockValue,
                        'low_stock_products'    => $lowStockProducts,
                        'out_of_stock_products' => $outOfStockProducts,
                        'in_stock_products'     => $inStockProducts,
                        'top_products'          => $topProducts->map(fn ($p) => [
                            'name'         => $p->name,
                            'sku'          => $p->sku,
                            'total_qty'    => (int) $p->total_qty,
                            'total_amount' => (float) $p->total_amount,
                        ]),
                    ],
                    'payment_report' => [
                        'total_inward'   => $totalInwardPayments,
                        'total_outward'  => $totalOutwardPayments,
                        'inward_cash'    => $inwardCash,
                        'inward_online'  => $inwardOnline,
                        'net_cash_flow'  => $totalInwardPayments - $totalOutwardPayments,
                    ],
                    'profit_report' => [
                        'total_sales'     => $totalSales,
                        'total_purchases' => $totalPurchases,
                        'gross_profit'    => $grossProfit,
                        'net_profit'      => $netProfit,
                        'profit_margin'   => round($profitMargin, 2),
                    ],
                    'employee_report' => [
                        'total_employees'    => $totalEmployees,
                        'active_employees'   => $activeEmployees,
                        'inactive_employees' => $inactiveEmployees,
                    ],
                    'attendance_report' => [
                        'today_total'   => $todayAttendance,
                        'today_present' => $presentToday,
                        'today_absent'  => $absentToday,
                    ],
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to generate all reports',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }
}