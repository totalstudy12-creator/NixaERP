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

class DashboardController extends Controller
{
    public function analytics(Request $request)
    {
        $dateFrom = $request->query('date_from');
        $dateTo = $request->query('date_to');

        $salesQuery = Invoice::query();
        $purchaseQuery = Schema::hasTable('purchase_invoices') ? PurchaseInvoice::query() : null;
        $customerQuery = Customer::query();
        $productQuery = Product::query();

        $salesDateColumn = Schema::hasColumn('invoices', 'invoice_date') ? 'invoice_date' : 'created_at';
        $purchaseDateColumn = Schema::hasTable('purchase_invoices') && Schema::hasColumn('purchase_invoices', 'purchase_date') ? 'purchase_date' : 'created_at';

        if ($dateFrom) {
            $salesQuery->whereDate($salesDateColumn, '>=', $dateFrom);
            if ($purchaseQuery) {
                $purchaseQuery->whereDate($purchaseDateColumn, '>=', $dateFrom);
            }
        }
        if ($dateTo) {
            $salesQuery->whereDate($salesDateColumn, '<=', $dateTo);
            if ($purchaseQuery) {
                $purchaseQuery->whereDate($purchaseDateColumn, '<=', $dateTo);
            }
        }

        $totalSales = (float) $salesQuery->sum('total_amount');
        $totalPurchase = $purchaseQuery ? (float) $purchaseQuery->sum('grand_total') : 0.0;
        $totalCustomers = (int) $customerQuery->count();
        $totalProducts = (int) $productQuery->count();
        $totalOrders = (int) Invoice::query()->count();
        $stockQuantity = (int) Product::query()->sum('stock_quantity');
        $lowStock = (int) Product::query()->where('stock_quantity', '<=', DB::raw('COALESCE(reorder_level, 0)'))->count();
        $grossProfit = max(0, $totalSales - $totalPurchase);
        $netProfit = max(0, $grossProfit);
        $profitMargin = $totalSales > 0 ? ($netProfit / $totalSales) * 100 : 0;

        return response()->json([
            'success' => true,
            'data' => [
                'overview' => [
                    'totalSales' => $totalSales,
                    'totalPurchase' => $totalPurchase,
                    'grossProfit' => $grossProfit,
                    'netProfit' => $netProfit,
                    'profitMargin' => $profitMargin,
                    'totalExpenses' => 0,
                    'cashBalance' => 0,
                    'bankBalance' => 0,
                    'receivable' => 0,
                    'payable' => 0,
                    'stockValue' => 0,
                    'totalOrders' => $totalOrders,
                    'totalCustomers' => $totalCustomers,
                    'totalEmployees' => 0,
                    'businessGrowth' => 0,
                ],
                'sales' => [
                    'today' => 0,
                    'monthly' => $totalSales,
                    'growth' => 0,
                    'target' => 0,
                    'achievement' => 0,
                    'byBranch' => [],
                    'byEmployee' => [],
                    'byProduct' => [],
                    'byCategory' => [],
                    'topProducts' => [],
                    'topCustomers' => [],
                    'averageOrderValue' => $totalOrders > 0 ? ($totalSales / $totalOrders) : 0,
                    'salesReturn' => 0,
                    'discount' => 0,
                    'profit' => $netProfit,
                ],
                'inventory' => [
                    'totalStock' => $stockQuantity,
                    'stockValue' => 0,
                    'lowStock' => $lowStock,
                    'outOfStock' => (int) Product::query()->where('stock_quantity', 0)->count(),
                    'overstock' => 0,
                    'reservedStock' => 0,
                    'damagedStock' => 0,
                    'fastMovingStock' => 0,
                    'slowMovingStock' => 0,
                    'deadStock' => 0,
                    'stockTurnover' => 0,
                    'stockAging' => 0,
                    'warehouseWise' => [],
                ],
                'finance' => [
                    'cashInflow' => 0,
                    'cashOutflow' => 0,
                    'netCashFlow' => 0,
                    'cashBalance' => 0,
                    'bankBalance' => 0,
                    'receivable' => 0,
                    'payable' => 0,
                    'overdueReceivable' => 0,
                    'overduePayable' => 0,
                    'expense' => 0,
                    'expenseByCategory' => [],
                    'profitAndLoss' => [
                        'revenue' => $totalSales,
                        'expenses' => 0,
                        'net' => $netProfit,
                    ],
                ],
                'customers' => [
                    'totalCustomers' => $totalCustomers,
                    'newCustomers' => 0,
                    'activeCustomers' => 0,
                    'inactiveCustomers' => 0,
                    'returningCustomers' => 0,
                    'customerGrowth' => 0,
                    'purchaseTrend' => [],
                    'topCustomers' => [],
                    'outstanding' => 0,
                    'lifetimeValue' => 'Insufficient data',
                ],
                'products' => [
                    'totalProducts' => $totalProducts,
                    'bestSellingProducts' => [],
                    'slowMovingProducts' => [],
                    'nonMovingProducts' => [],
                    'highestProfitProducts' => [],
                    'lowestProfitProducts' => [],
                    'productSales' => [],
                    'productProfit' => [],
                    'productMargin' => [],
                    'productReturnRate' => [],
                ],
                'alerts' => [],
                'ai' => [
                    'status' => 'AI insights not configured',
                    'insights' => [],
                ],
            ],
        ]);
    }

    /**
     * Get net profit summary: total + monthly for current year.
     */
    public function profitSummary()
    {
        $totalProfit = DB::table('invoice_items as ii')
            ->join('products as p', 'p.id', '=', 'ii.product_id')
            ->join('invoices as i', 'i.id', '=', 'ii.invoice_id')
            ->whereNull('i.deleted_at')
            ->whereNull('p.deleted_at')
            ->where('i.status', '!=', 'draft')
            ->sum(DB::raw('(ii.unit_price - COALESCE(p.purchase_price, 0)) * ii.quantity'));

        $monthlyRaw = DB::table('invoice_items as ii')
            ->join('products as p', 'p.id', '=', 'ii.product_id')
            ->join('invoices as i', 'i.id', '=', 'ii.invoice_id')
            ->whereNull('i.deleted_at')
            ->whereNull('p.deleted_at')
            ->where('i.status', '!=', 'draft')
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
        $monthlyProfit = collect($allMonths)->map(function ($month) use ($monthlyProfitMap) {
            return [
                'month' => $month,
                'profit' => (float) ($monthlyProfitMap[$month] ?? 0),
            ];
        })->values()->all();

        return response()->json([
            'success' => true,
            'data' => [
                'total_profit' => (float) $totalProfit,
                'monthly_profit' => $monthlyProfit,
            ],
        ]);
    }

    /**
     * Get profit summary (alias for profitSummary).
     */
    public function profit()
    {
        return $this->profitSummary();
    }

    /**
     * Get new vs existing customer sales.
     */
    public function newVsExistingCustomers(Request $request)
    {
        try {
            $companyId = $request->query('company_id');
            $branchId = $request->query('branch_id');

            // Define new customer threshold (30 days)
            $newCustomerThreshold = now()->subDays(30);

            // Get all invoices with customer info
            $invoiceQuery = Invoice::query()
                ->join('customers', 'invoices.customer_id', '=', 'customers.id')
                ->select(
                    'invoices.id',
                    'invoices.customer_id',
                    'invoices.total_amount',
                    'invoices.invoice_date',
                    'invoices.created_at',
                    'customers.name as customer_name',
                    'customers.created_at as customer_created_at'
                )
                ->where('invoices.status', '!=', 'draft')
                ->whereNull('invoices.deleted_at');

            if ($companyId) {
                $invoiceQuery->where('invoices.company_id', $companyId);
            }

            if ($branchId) {
                $invoiceQuery->where('invoices.branch_id', $branchId);
            }

            $invoices = $invoiceQuery->get();

            $newCustomers = [];
            $existingCustomers = [];

            foreach ($invoices as $invoice) {
                $isNewCustomer = $invoice->customer_created_at && $invoice->customer_created_at >= $newCustomerThreshold;
                
                $customerData = [
                    'customer_id' => $invoice->customer_id,
                    'customer_name' => $invoice->customer_name,
                    'total_sales' => 0,
                    'invoice_count' => 0,
                ];

                if ($isNewCustomer) {
                    $key = 'new_' . $invoice->customer_id;
                    if (!isset($newCustomers[$key])) {
                        $newCustomers[$key] = $customerData;
                    }
                    $newCustomers[$key]['total_sales'] += (float) $invoice->total_amount;
                    $newCustomers[$key]['invoice_count']++;
                } else {
                    $key = 'existing_' . $invoice->customer_id;
                    if (!isset($existingCustomers[$key])) {
                        $existingCustomers[$key] = $customerData;
                    }
                    $existingCustomers[$key]['total_sales'] += (float) $invoice->total_amount;
                    $existingCustomers[$key]['invoice_count']++;
                }
            }

            $newCustomerTotal = array_sum(array_column($newCustomers, 'total_sales'));
            $existingCustomerTotal = array_sum(array_column($existingCustomers, 'total_sales'));
            $totalSales = $newCustomerTotal + $existingCustomerTotal;

            $newCustomerCount = count($newCustomers);
            $existingCustomerCount = count($existingCustomers);
            $totalCustomers = $newCustomerCount + $existingCustomerCount;

            // Sort by total sales descending
            usort($newCustomers, fn($a, $b) => $b['total_sales'] <=> $a['total_sales']);
            usort($existingCustomers, fn($a, $b) => $b['total_sales'] <=> $a['total_sales']);

            return response()->json([
                'success' => true,
                'data' => [
                    'new_customers' => [
                        'count' => $newCustomerCount,
                        'total_sales' => $newCustomerTotal,
                        'percentage' => $totalCustomers > 0 ? round(($newCustomerCount / $totalCustomers) * 100, 2) : 0,
                        'sales_percentage' => $totalSales > 0 ? round(($newCustomerTotal / $totalSales) * 100, 2) : 0,
                        'customers' => array_values($newCustomers),
                    ],
                    'existing_customers' => [
                        'count' => $existingCustomerCount,
                        'total_sales' => $existingCustomerTotal,
                        'percentage' => $totalCustomers > 0 ? round(($existingCustomerCount / $totalCustomers) * 100, 2) : 0,
                        'sales_percentage' => $totalSales > 0 ? round(($existingCustomerTotal / $totalSales) * 100, 2) : 0,
                        'customers' => array_values($existingCustomers),
                    ],
                    'summary' => [
                        'total_customers' => $totalCustomers,
                        'total_sales' => $totalSales,
                        'new_customer_sales' => $newCustomerTotal,
                        'existing_customer_sales' => $existingCustomerTotal,
                    ],
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch new vs existing customer data',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function paymentSummary()
    {
        try {
            $inward = Payment::query()
                ->selectRaw('COALESCE(SUM(amount), 0) as total, COALESCE(SUM(CASE WHEN LOWER(payment_method) IN (\'cash\', \'cash_payment\') THEN amount ELSE 0 END), 0) as cash, COALESCE(SUM(CASE WHEN LOWER(payment_method) NOT IN (\'cash\', \'cash_payment\') THEN amount ELSE 0 END), 0) as online')
                ->first();

            $outward = PurchaseInvoice::query()
                ->selectRaw('COALESCE(SUM(grand_total), 0) as total, COALESCE(SUM(CASE WHEN LOWER(payment_method) IN (\'cash\', \'cash_payment\') THEN grand_total ELSE 0 END), 0) as cash, COALESCE(SUM(CASE WHEN LOWER(payment_method) NOT IN (\'cash\', \'cash_payment\') THEN grand_total ELSE 0 END), 0) as online')
                ->first();

            return response()->json([
                'success' => true,
                'data' => [
                    'inward' => [
                        'total' => (float) ($inward->total ?? 0),
                        'online' => (float) ($inward->online ?? 0),
                        'cash' => (float) ($inward->cash ?? 0),
                    ],
                    'outward' => [
                        'total' => (float) ($outward->total ?? 0),
                        'online' => (float) ($outward->online ?? 0),
                        'cash' => (float) ($outward->cash ?? 0),
                    ],
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch payment summary',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function inventorySummary()
    {
        try {
            $query = Product::query();

            return response()->json([
                'success' => true,
                'data' => [
                    'totalProducts' => (int) $query->count(),
                    'totalQuantity' => (int) $query->sum('stock_quantity'),
                    'inStock' => (int) $query->where('stock_quantity', '>', 0)->count(),
                    'lowStock' => (int) $query->where('stock_quantity', '>', 0)->where('stock_quantity', '<=', DB::raw('COALESCE(reorder_level, 0)'))->count(),
                    'zeroStock' => (int) $query->where('stock_quantity', 0)->count(),
                    'negativeStock' => (int) $query->where('stock_quantity', '<', 0)->count(),
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch inventory summary',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function invoiceCountSummary()
    {
        try {
            return response()->json([
                'success' => true,
                'data' => [
                    'sale' => Invoice::query()->count(),
                    'purchase' => PurchaseInvoice::query()->count(),
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch invoice count summary',
            ], 500);
        }
    }

    public function invoiceAmountSummary()
    {
        try {
            return response()->json([
                'success' => true,
                'data' => [
                    'sale' => (float) Invoice::query()->sum('total_amount'),
                    'purchase' => (float) PurchaseInvoice::query()->sum('grand_total'),
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch invoice amount summary',
            ], 500);
        }
    }

    public function topSellingProducts(Request $request)
    {
        $limit = min(max((int) $request->query('limit', 5), 1), 25);

        $items = InvoiceItem::query()
            ->join('products', 'invoice_items.product_id', '=', 'products.id')
            ->select('products.name as product_name', DB::raw('SUM(invoice_items.quantity) as total_qty'))
            ->groupBy('products.id', 'products.name')
            ->orderByDesc('total_qty')
            ->limit($limit)
            ->get();

        return response()->json([
            'success' => true,
            'data' => $items->map(fn ($item) => [
                'product_name' => $item->product_name,
                'total_qty' => (int) ($item->total_qty ?? 0),
            ]),
        ]);
    }

    public function leastSellingProducts(Request $request)
    {
        $limit = min(max((int) $request->query('limit', 5), 1), 25);

        $items = InvoiceItem::query()
            ->join('products', 'invoice_items.product_id', '=', 'products.id')
            ->select('products.name as product_name', DB::raw('SUM(invoice_items.quantity) as total_qty'))
            ->groupBy('products.id', 'products.name')
            ->orderBy('total_qty', 'asc')
            ->limit($limit)
            ->get();

        return response()->json([
            'success' => true,
            'data' => $items->map(fn ($item) => [
                'product_name' => $item->product_name,
                'total_qty' => (int) ($item->total_qty ?? 0),
            ]),
        ]);
    }

    public function lowStockProducts(Request $request)
    {
        $limit = min(max((int) $request->query('limit', 10), 1), 50);

        $items = Product::query()
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
                'qty' => (int) ($item->qty ?? 0),
            ]),
        ]);
    }

    public function topCustomers(Request $request)
    {
        $limit = min(max((int) $request->query('limit', 5), 1), 25);

        $items = Invoice::query()
            ->join('customers', 'invoices.customer_id', '=', 'customers.id')
            ->select('customers.name as name', DB::raw('SUM(invoices.total_amount) as amount'))
            ->groupBy('customers.id', 'customers.name')
            ->orderByDesc('amount')
            ->limit($limit)
            ->get();

        return response()->json([
            'success' => true,
            'data' => $items->map(fn ($item) => [
                'name' => $item->name,
                'amount' => (float) ($item->amount ?? 0),
            ]),
        ]);
    }

    public function topVendors(Request $request)
    {
        if (!Schema::hasTable('purchase_invoices') || !Schema::hasTable('suppliers')) {
            return response()->json(['success' => true, 'data' => []]);
        }

        $limit = min(max((int) $request->query('limit', 5), 1), 25);

        $items = PurchaseInvoice::query()
            ->join('suppliers', 'purchase_invoices.supplier_id', '=', 'suppliers.id')
            ->select('suppliers.name as name', DB::raw('SUM(purchase_invoices.grand_total) as amount'))
            ->groupBy('suppliers.id', 'suppliers.name')
            ->orderByDesc('amount')
            ->limit($limit)
            ->get();

        return response()->json([
            'success' => true,
            'data' => $items->map(fn ($item) => [
                'name' => $item->name,
                'amount' => (float) ($item->amount ?? 0),
            ]),
        ]);
    }

    public function purchaseDueInvoices()
    {
        if (!Schema::hasTable('purchase_invoices')) {
            return response()->json(['success' => true, 'data' => []]);
        }

        $items = PurchaseInvoice::query()
            ->with(['supplier', 'company'])
            ->where('status', '!=', 'paid')
            ->orderBy('due_date')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $items->map(function ($invoice) {
                return [
                    'invoice_no' => $invoice->invoice_number ?? $invoice->purchase_number ?? $invoice->bill_number ?? 'N/A',
                    'company_name' => $invoice->company?->name ?? 'N/A',
                    'name' => $invoice->supplier?->name ?? 'N/A',
                    'phone' => $invoice->supplier?->phone ?? '',
                    'due_date' => $invoice->due_date ? $invoice->due_date->toDateTimeString() : null,
                    'due_from' => 'Supplier',
                    'remaining_payment' => max(0, (float) ($invoice->grand_total ?? 0) - (float) ($invoice->paid_amount ?? 0)),
                ];
            }),
        ]);
    }

    public function loginActivity()
    {
        return response()->json(['success' => true, 'data' => []]);
    }

    public function businessHealth()
    {
        $now = now();
        $periodEnd = $now;
        $periodStart = $now->copy()->subDays(30);
        $prevStart = $now->copy()->subDays(60);
        $prevEnd = $now->copy()->subDays(31);

        $currentSales = (float) Invoice::query()->whereBetween('created_at', [$periodStart, $periodEnd])->sum('total_amount');
        $previousSales = (float) Invoice::query()->whereBetween('created_at', [$prevStart, $prevEnd])->sum('total_amount');

        $salesGrowth = null;
        if ($previousSales > 0) {
            $salesGrowth = (($currentSales - $previousSales) / $previousSales) * 100;
        } elseif ($currentSales > 0) {
            $salesGrowth = 100.0;
        }

        $lowStockCount = (int) Product::query()->where('stock_quantity', '<=', DB::raw('COALESCE(reorder_level, 0)'))->count();
        $totalProducts = (int) Product::query()->count();

        $receivable = (float) Invoice::query()->where('status', '!=', 'paid')->sum('total_amount');
        $outstandingCount = (int) Invoice::query()->where('status', '!=', 'paid')->count();

        $paymentsIn30 = (float) Payment::query()->whereBetween('transaction_date', [$periodStart, $periodEnd])->sum('amount');

        $breakdown = [];

        if ($salesGrowth === null) {
            $breakdown[] = ['label' => 'Sales Health', 'score' => 0];
        } else {
            $score = (int) max(0, min(100, round(50 + ($salesGrowth / 2))));
            $breakdown[] = ['label' => 'Sales Health', 'score' => $score];
        }

        $purchaseSum = Schema::hasTable('purchase_invoices') ? (float) PurchaseInvoice::query()->whereBetween('created_at', [$periodStart, $periodEnd])->sum('grand_total') : 0.0;
        $profit = max(0, $currentSales - $purchaseSum);
        $profitScore = $currentSales > 0 ? (int) max(0, min(100, round(($profit / max(1, $currentSales)) * 100))) : 0;
        $breakdown[] = ['label' => 'Profit Health', 'score' => $profitScore];

        $cashScore = $paymentsIn30 > 0 ? 80 : 20;
        $breakdown[] = ['label' => 'Cash Flow', 'score' => $cashScore];

        $inventoryScore = $totalProducts > 0 ? (int) max(0, min(100, round((1 - ($lowStockCount / max(1, $totalProducts))) * 100))) : 0;
        $breakdown[] = ['label' => 'Inventory', 'score' => $inventoryScore];

        $newCustomersCurrent = (int) Customer::query()->whereBetween('created_at', [$periodStart, $periodEnd])->count();
        $newCustomersPrev = (int) Customer::query()->whereBetween('created_at', [$prevStart, $prevEnd])->count();
        $custGrowth = $newCustomersPrev > 0 ? (($newCustomersCurrent - $newCustomersPrev) / $newCustomersPrev) * 100 : ($newCustomersCurrent > 0 ? 100 : 0);
        $custScore = (int) max(0, min(100, round(50 + ($custGrowth / 2))));
        $breakdown[] = ['label' => 'Customer Health', 'score' => $custScore];

        $receivableScore = $receivable > 0 ? (int) max(0, min(100, round(100 - ($receivable / max(1, $currentSales + $receivable)) * 100))) : 100;
        $breakdown[] = ['label' => 'Receivables', 'score' => $receivableScore];

        $employees = Schema::hasTable('employees') ? DB::table('employees')->count() : 0;
        $opsScore = $employees > 0 ? 100 : 0;
        $breakdown[] = ['label' => 'Operations', 'score' => $opsScore];

        $scores = array_filter(array_map(fn($b) => is_numeric($b['score']) ? $b['score'] : null, $breakdown));
        $overall = count($scores) ? round(array_sum($scores) / count($scores)) : 0;

        return response()->json(['success' => true, 'data' => ['overall' => (int) $overall, 'breakdown' => $breakdown]]);
    }

    public function forecast()
    {
        $now = now();
        $ranges = [
            'today' => [$now->copy()->startOfDay(), $now->copy()->endOfDay()],
            'sevenDays' => [$now->copy()->subDays(6)->startOfDay(), $now->copy()->endOfDay()],
            'thirtyDays' => [$now->copy()->subDays(29)->startOfDay(), $now->copy()->endOfDay()],
            'ninetyDays' => [$now->copy()->subDays(89)->startOfDay(), $now->copy()->endOfDay()],
        ];

        $build = function ($model, $field) use ($ranges) {
            $out = [];
            foreach ($ranges as $key => $range) {
                $out[$key] = (float) $model::query()->whereBetween('created_at', $range)->sum($field);
            }
            return $out;
        };

        $sales = $build(Invoice::class, 'total_amount');
        $purchase = Schema::hasTable('purchase_invoices') ? $build(PurchaseInvoice::class, 'grand_total') : ['today'=>0,'sevenDays'=>0,'thirtyDays'=>0,'ninetyDays'=>0];
        $profit = [
            'today' => $sales['today'] - ($purchase['today'] ?? 0),
            'sevenDays' => $sales['sevenDays'] - ($purchase['sevenDays'] ?? 0),
            'thirtyDays' => $sales['thirtyDays'] - ($purchase['thirtyDays'] ?? 0),
            'ninetyDays' => $sales['ninetyDays'] - ($purchase['ninetyDays'] ?? 0),
        ];
        $cashFlow = (function () use ($ranges) {
            $out = [];
            foreach ($ranges as $k => $rng) {
                $out[$k] = (float) Payment::query()->whereBetween('transaction_date', $rng)->sum('amount');
            }
            return $out;
        })();

        $stockDemand = (function () use ($ranges) {
            $out = [];
            foreach ($ranges as $k => $rng) {
                $out[$k] = (int) InvoiceItem::query()->whereBetween('created_at', $rng)->sum('quantity');
            }
            return $out;
        })();

        return response()->json(['success' => true, 'data' => [
            'sales' => ['label' => 'Sales', 'today' => $sales['today'], 'sevenDays' => $sales['sevenDays'], 'thirtyDays' => $sales['thirtyDays'], 'ninetyDays' => $sales['ninetyDays']],
            'purchase' => ['label' => 'Purchase', 'today' => $purchase['today'] ?? 0, 'sevenDays' => $purchase['sevenDays'] ?? 0, 'thirtyDays' => $purchase['thirtyDays'] ?? 0, 'ninetyDays' => $purchase['ninetyDays'] ?? 0],
            'profit' => ['label' => 'Profit', 'today' => $profit['today'], 'sevenDays' => $profit['sevenDays'], 'thirtyDays' => $profit['thirtyDays'], 'ninetyDays' => $profit['ninetyDays']],
            'cashFlow' => ['label' => 'Cash Flow', 'today' => $cashFlow['today'], 'sevenDays' => $cashFlow['sevenDays'], 'thirtyDays' => $cashFlow['thirtyDays'], 'ninetyDays' => $cashFlow['ninetyDays']],
            'stockDemand' => ['label' => 'Stock Demand', 'today' => $stockDemand['today'], 'sevenDays' => $stockDemand['sevenDays'], 'thirtyDays' => $stockDemand['thirtyDays'], 'ninetyDays' => $stockDemand['ninetyDays']],
        ]]);
    }

    public function risks()
    {
        $risks = [];
        $lowStock = Product::query()->where('stock_quantity', '<=', DB::raw('COALESCE(reorder_level, 0)'))->count();
        if ($lowStock > 0) {
            $risks[] = [
                'id' => 1,
                'riskLevel' => 'High',
                'title' => 'Low stock items',
                'impact' => 'Potential stockouts and lost sales',
                'reason' => "{$lowStock} products at or below reorder level",
                'affectedModule' => 'Inventory',
                'recommendedAction' => 'Reorder affected SKUs',
            ];
        }

        $overdue = Invoice::query()->where('status', '!=', 'paid')->whereDate('created_at', '<=', now()->subDays(30))->sum('total_amount');
        if ($overdue > 0) {
            $risks[] = [
                'id' => 2,
                'riskLevel' => 'Medium',
                'title' => 'Overdue receivables',
                'impact' => 'Cash flow pressure',
                'reason' => "Receivables overdue more than 30 days: {$overdue}",
                'affectedModule' => 'Finance',
                'recommendedAction' => 'Follow up with customers / send reminders',
            ];
        }

        return response()->json(['success' => true, 'data' => $risks]);
    }

    public function anomalies()
    {
        $days = 90;
        $start = now()->subDays($days);
        $daily = DB::table('invoices')
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
                $anomalies[] = ['id' => strtotime($d->day), 'type' => 'sales_spike', 'description' => "High sales on {$d->day}", 'severity' => 'Medium', 'detectedAt' => $d->day];
            }
        }

        return response()->json(['success' => true, 'data' => $anomalies]);
    }

    public function rankings()
    {
        $topProduct = InvoiceItem::query()
            ->join('products', 'invoice_items.product_id', '=', 'products.id')
            ->select('products.name as name', DB::raw('SUM(invoice_items.quantity) as total_qty'))
            ->groupBy('products.id', 'products.name')
            ->orderByDesc('total_qty')
            ->first();

        $topCustomer = Invoice::query()
            ->join('customers', 'invoices.customer_id', '=', 'customers.id')
            ->select('customers.name as name', DB::raw('SUM(invoices.total_amount) as amount'))
            ->groupBy('customers.id', 'customers.name')
            ->orderByDesc('amount')
            ->first();

        $rankings = [];
        if ($topProduct) {
            $rankings[] = ['id' => 1, 'category' => 'Product', 'name' => $topProduct->name, 'value' => (int) $topProduct->total_qty, 'metric' => 'units_sold'];
        }
        if ($topCustomer) {
            $rankings[] = ['id' => 2, 'category' => 'Customer', 'name' => $topCustomer->name, 'value' => (float) $topCustomer->amount, 'metric' => 'amount'];
        }

        return response()->json(['success' => true, 'data' => $rankings]);
    }

    public function heroProduct()
    {
        $item = InvoiceItem::query()
            ->join('products', 'invoice_items.product_id', '=', 'products.id')
            ->select('products.name as name', DB::raw('SUM(invoice_items.subtotal) as sales'), DB::raw('SUM(invoice_items.quantity) as qty'), DB::raw('AVG(products.purchase_price) as avg_purchase'))
            ->groupBy('products.id', 'products.name')
            ->orderByDesc('sales')
            ->first();

        if (!$item) return response()->json(['success' => true, 'data' => null]);

        $totalSales = (float) $item->sales;
        $estimatedCost = (float) $item->avg_purchase * (float) $item->qty;
        $totalProfit = $totalSales - $estimatedCost;

        return response()->json(['success' => true, 'data' => [
            'name' => $item->name,
            'total_sales' => $totalSales,
            'total_profit' => $totalProfit,
            'trend' => 0,
        ]]);
    }

    public function heroCustomer()
    {
        $cust = Invoice::query()
            ->join('customers', 'invoices.customer_id', '=', 'customers.id')
            ->select('customers.name as name', DB::raw('SUM(invoices.total_amount) as total'))
            ->groupBy('customers.id', 'customers.name')
            ->orderByDesc('total')
            ->first();

        if (!$cust) return response()->json(['success' => true, 'data' => null]);

        $last = Invoice::query()->where('customer_id', DB::raw("(SELECT id FROM customers WHERE name = '{$cust->name}' LIMIT 1)"))->orderByDesc('created_at')->first();

        return response()->json(['success' => true, 'data' => [
            'name' => $cust->name,
            'total_purchases' => (float) $cust->total,
            'total_amount' => (float) $cust->total,
            'last_purchase' => $last?->created_at?->toDateTimeString() ?? null,
        ]]);
    }

    public function districtSales()
    {
        $state = request()->query('state');

        $query = Invoice::query()
            ->join('customers', 'invoices.customer_id', '=', 'customers.id')
            ->select(DB::raw("COALESCE(customers.billing_city, customers.shipping_city, '') as district"), DB::raw('SUM(invoices.total_amount) as sales'), DB::raw('COUNT(invoices.id) as orders'))
            ->groupBy('district')
            ->havingRaw("district != ''")
            ->orderByDesc('sales')
            ->limit(50);

        if ($state) {
            $query->where(function ($q) use ($state) {
                $q->where('customers.billing_state', $state)
                  ->orWhere('customers.shipping_state', $state);
            });
        }

        $items = $query->get();

        return response()->json(['success' => true, 'data' => $items->map(fn($it) => ['district' => $it->district, 'sales' => (float) $it->sales, 'orders' => (int) $it->orders])]);
    }
    /**
     * Get all reports as JSON format.
     * This is a comprehensive report endpoint that returns all dashboard data.
     */
    public function allReports(Request $request)
    {
        try {
            $dateFrom = $request->query('date_from');
            $dateTo = $request->query('date_to');
            $companyId = $request->query('company_id');
            $branchId = $request->query('branch_id');

            // ─── Sales Report ───
            $salesQuery = Invoice::query()->where('status', '!=', 'draft');
            if ($dateFrom) $salesQuery->whereDate('invoice_date', '>=', $dateFrom);
            if ($dateTo) $salesQuery->whereDate('invoice_date', '<=', $dateTo);
            if ($companyId) $salesQuery->where('company_id', $companyId);
            if ($branchId) $salesQuery->where('branch_id', $branchId);
            
            $totalSales = (float) $salesQuery->sum('total_amount');
            $totalSaleInvoices = (int) $salesQuery->count();
            $paidInvoices = (int) Invoice::where('status', 'paid')->count();
            $unpaidInvoices = (int) Invoice::where('status', '!=', 'paid')->where('status', '!=', 'draft')->count();
            $overdueInvoices = (int) Invoice::where('status', 'overdue')->count();

            // ─── Purchase Report ───
            $purchaseQuery = PurchaseInvoice::query();
            if ($dateFrom) $purchaseQuery->whereDate('purchase_date', '>=', $dateFrom);
            if ($dateTo) $purchaseQuery->whereDate('purchase_date', '<=', $dateTo);
            if ($companyId) $purchaseQuery->where('company_id', $companyId);
            
            $totalPurchases = (float) $purchaseQuery->sum('grand_total');
            $totalPurchaseInvoices = (int) $purchaseQuery->count();
            $paidPurchases = (int) PurchaseInvoice::where('status', 'paid')->count();
            $unpaidPurchases = (int) PurchaseInvoice::where('status', '!=', 'paid')->count();

            // ─── Customer Report ───
            $customerQuery = Customer::query();
            if ($dateFrom) $customerQuery->whereDate('created_at', '>=', $dateFrom);
            if ($dateTo) $customerQuery->whereDate('created_at', '<=', $dateTo);
            
            $totalCustomers = (int) $customerQuery->count();
            $activeCustomers = (int) Customer::where('is_active', true)->count();
            $inactiveCustomers = (int) Customer::where('is_active', false)->count();
            $newCustomers30Days = (int) Customer::where('created_at', '>=', now()->subDays(30))->count();
            $newCustomers7Days = (int) Customer::where('created_at', '>=', now()->subDays(7))->count();

            // ─── Product/Inventory Report ───
            $totalProducts = (int) Product::count();
            $totalStockQty = (int) Product::sum('stock_quantity');
            $lowStockProducts = (int) Product::where('stock_quantity', '<=', DB::raw('COALESCE(reorder_level, 0)'))->count();
            $outOfStockProducts = (int) Product::where('stock_quantity', 0)->count();
            $inStockProducts = (int) Product::where('stock_quantity', '>', 0)->count();
            $stockValue = (float) Product::sum(DB::raw('COALESCE(purchase_price, 0) * COALESCE(stock_quantity, 0)'));

            // ─── Payment Report ───
            $paymentQuery = Payment::query();
            if ($dateFrom) $paymentQuery->whereDate('transaction_date', '>=', $dateFrom);
            if ($dateTo) $paymentQuery->whereDate('transaction_date', '<=', $dateTo);
            
            $totalInwardPayments = (float) $paymentQuery->where('payment_direction', 'inward')->sum('amount');
            $totalOutwardPayments = (float) $paymentQuery->where('payment_direction', 'outward')->sum('amount');
            
            $inwardCash = (float) Payment::where('payment_direction', 'inward')->where('payment_method', 'cash')->sum('amount');
            $inwardOnline = (float) Payment::where('payment_direction', 'inward')->where('payment_method', '!=', 'cash')->sum('amount');

            // ─── Monthly Data ───
            $monthlySales = DB::table('invoices')
                ->select(DB::raw("DATE_FORMAT(invoice_date, '%Y-%m') as month"), DB::raw('SUM(total_amount) as total'))
                ->where('status', '!=', 'draft')
                ->whereYear('invoice_date', now()->year)
                ->groupBy('month')
                ->orderBy('month')
                ->get();

            $monthlyPurchases = DB::table('purchase_invoices')
                ->select(DB::raw("DATE_FORMAT(purchase_date, '%Y-%m') as month"), DB::raw('SUM(grand_total) as total'))
                ->whereYear('purchase_date', now()->year)
                ->groupBy('month')
                ->orderBy('month')
                ->get();

            // ─── Top Products ───
            $topProducts = InvoiceItem::query()
                ->join('products', 'invoice_items.product_id', '=', 'products.id')
                ->select('products.name', 'products.sku', DB::raw('SUM(invoice_items.quantity) as total_qty'), DB::raw('SUM(invoice_items.total) as total_amount'))
                ->groupBy('products.id', 'products.name', 'products.sku')
                ->orderByDesc('total_qty')
                ->limit(10)
                ->get();

            // ─── Top Customers ───
            $topCustomers = Invoice::query()
                ->join('customers', 'invoices.customer_id', '=', 'customers.id')
                ->select('customers.name', 'customers.email', DB::raw('SUM(invoices.total_amount) as total_amount'), DB::raw('COUNT(invoices.id) as invoice_count'))
                ->where('invoices.status', '!=', 'draft')
                ->groupBy('customers.id', 'customers.name', 'customers.email')
                ->orderByDesc('total_amount')
                ->limit(10)
                ->get();

            // ─── Employee Report ───
            $totalEmployees = Schema::hasTable('employees') ? (int) DB::table('employees')->count() : 0;
            $activeEmployees = Schema::hasTable('employees') ? (int) DB::table('employees')->where('status', 'active')->count() : 0;
            $inactiveEmployees = Schema::hasTable('employees') ? (int) DB::table('employees')->where('status', '!=', 'active')->count() : 0;

            // ─── Attendance Report ───
            $todayAttendance = Schema::hasTable('attendance') ? (int) DB::table('attendance')->whereDate('created_at', now()->toDateString())->count() : 0;
            $presentToday = Schema::hasTable('attendance') ? (int) DB::table('attendance')->whereDate('created_at', now()->toDateString())->where('status', 'present')->count() : 0;
            $absentToday = Schema::hasTable('attendance') ? (int) DB::table('attendance')->whereDate('created_at', now()->toDateString())->where('status', 'absent')->count() : 0;

            // ─── Profit Report ───
            $totalProfit = DB::table('invoice_items as ii')
                ->join('products as p', 'p.id', '=', 'ii.product_id')
                ->join('invoices as i', 'i.id', '=', 'ii.invoice_id')
                ->whereNull('i.deleted_at')
                ->where('i.status', '!=', 'draft')
                ->sum(DB::raw('(ii.unit_price - COALESCE(p.purchase_price, 0)) * ii.quantity'));

            $grossProfit = $totalSales - $totalPurchases;
            $netProfit = $totalProfit;
            $profitMargin = $totalSales > 0 ? ($netProfit / $totalSales) * 100 : 0;

            // ─── Branch Report ───
            $branchSales = Invoice::query()
                ->join('branches', 'invoices.branch_id', '=', 'branches.id')
                ->select('branches.name', DB::raw('SUM(invoices.total_amount) as total_amount'), DB::raw('COUNT(invoices.id) as invoice_count'))
                ->where('invoices.status', '!=', 'draft')
                ->groupBy('branches.id', 'branches.name')
                ->orderByDesc('total_amount')
                ->get();

            // ─── Company Report ───
            $companySales = Invoice::query()
                ->join('companies', 'invoices.company_id', '=', 'companies.id')
                ->select('companies.name', DB::raw('SUM(invoices.total_amount) as total_amount'), DB::raw('COUNT(invoices.id) as invoice_count'))
                ->where('invoices.status', '!=', 'draft')
                ->groupBy('companies.id', 'companies.name')
                ->orderByDesc('total_amount')
                ->get();

            // ─── District Sales ───
            $districtSales = Invoice::query()
                ->join('customers', 'invoices.customer_id', '=', 'customers.id')
                ->select(DB::raw("COALESCE(customers.billing_city, customers.shipping_city, '') as district"), DB::raw('SUM(invoices.total_amount) as sales'), DB::raw('COUNT(invoices.id) as orders'))
                ->groupBy('district')
                ->havingRaw("district != ''")
                ->orderByDesc('sales')
                ->limit(50)
                ->get();

            // ─── Build Response ───
            return response()->json([
                'success' => true,
                'data' => [
                    'generated_at' => now()->toDateTimeString(),
                    'filters' => [
                        'date_from' => $dateFrom,
                        'date_to' => $dateTo,
                        'company_id' => $companyId,
                        'branch_id' => $branchId,
                    ],
                    'sales_report' => [
                        'total_sales' => $totalSales,
                        'total_invoices' => $totalSaleInvoices,
                        'paid_invoices' => $paidInvoices,
                        'unpaid_invoices' => $unpaidInvoices,
                        'overdue_invoices' => $overdueInvoices,
                        'monthly' => $monthlySales->map(fn($m) => ['month' => $m->month, 'total' => (float) $m->total]),
                        'by_branch' => $branchSales->map(fn($b) => ['branch' => $b->name, 'total_amount' => (float) $b->total_amount, 'invoice_count' => (int) $b->invoice_count]),
                        'by_company' => $companySales->map(fn($c) => ['company' => $c->name, 'total_amount' => (float) $c->total_amount, 'invoice_count' => (int) $c->invoice_count]),
                        'by_district' => $districtSales->map(fn($d) => ['district' => $d->district, 'sales' => (float) $d->sales, 'orders' => (int) $d->orders]),
                    ],
                    'purchase_report' => [
                        'total_purchases' => $totalPurchases,
                        'total_invoices' => $totalPurchaseInvoices,
                        'paid_invoices' => $paidPurchases,
                        'unpaid_invoices' => $unpaidPurchases,
                        'monthly' => $monthlyPurchases->map(fn($m) => ['month' => $m->month, 'total' => (float) $m->total]),
                    ],
                    'customer_report' => [
                        'total_customers' => $totalCustomers,
                        'active_customers' => $activeCustomers,
                        'inactive_customers' => $inactiveCustomers,
                        'new_customers_30_days' => $newCustomers30Days,
                        'new_customers_7_days' => $newCustomers7Days,
                        'top_customers' => $topCustomers->map(fn($c) => [
                            'name' => $c->name,
                            'email' => $c->email,
                            'total_amount' => (float) $c->total_amount,
                            'invoice_count' => (int) $c->invoice_count,
                        ]),
                    ],
                    'product_report' => [
                        'total_products' => $totalProducts,
                        'total_stock_qty' => $totalStockQty,
                        'stock_value' => $stockValue,
                        'low_stock_products' => $lowStockProducts,
                        'out_of_stock_products' => $outOfStockProducts,
                        'in_stock_products' => $inStockProducts,
                        'top_products' => $topProducts->map(fn($p) => [
                            'name' => $p->name,
                            'sku' => $p->sku,
                            'total_qty' => (int) $p->total_qty,
                            'total_amount' => (float) $p->total_amount,
                        ]),
                    ],
                    'payment_report' => [
                        'total_inward' => $totalInwardPayments,
                        'total_outward' => $totalOutwardPayments,
                        'inward_cash' => $inwardCash,
                        'inward_online' => $inwardOnline,
                        'net_cash_flow' => $totalInwardPayments - $totalOutwardPayments,
                    ],
                    'profit_report' => [
                        'total_sales' => $totalSales,
                        'total_purchases' => $totalPurchases,
                        'gross_profit' => $grossProfit,
                        'net_profit' => $netProfit,
                        'profit_margin' => round($profitMargin, 2),
                    ],
                    'employee_report' => [
                        'total_employees' => $totalEmployees,
                        'active_employees' => $activeEmployees,
                        'inactive_employees' => $inactiveEmployees,
                    ],
                    'attendance_report' => [
                        'today_total' => $todayAttendance,
                        'today_present' => $presentToday,
                        'today_absent' => $absentToday,
                    ],
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to generate all reports',
                'error' => $e->getMessage(),
            ], 500);
        }
    }
}