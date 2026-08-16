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

    public function paymentSummary()
    {
        $inward = Payment::query()
            ->selectRaw('COALESCE(SUM(amount), 0) as total, COALESCE(SUM(CASE WHEN LOWER(payment_method) IN (\'cash\', \'cash_payment\') THEN amount ELSE 0 END), 0) as cash, COALESCE(SUM(CASE WHEN LOWER(payment_method) NOT IN (\'cash\', \'cash_payment\') THEN amount ELSE 0 END), 0) as online')
            ->first();

        $outward = PurchaseInvoice::query()
            ->selectRaw('COALESCE(SUM(grand_total), 0) as total, COALESCE(SUM(CASE WHEN LOWER(payment_method) IN (\'cash\', \'cash_payment\') THEN grand_total ELSE 0 END), 0) as cash, COALESCE(SUM(CASE WHEN LOWER(payment_method) NOT IN (\'cash\', \'cash_payment\') THEN grand_total ELSE 0 END), 0) as online')
            ->first();

        return response()->json([
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
        ]);
    }

    public function inventorySummary()
    {
        $query = Product::query();

        return response()->json([
            'totalProducts' => (int) $query->count(),
            'totalQuantity' => (int) $query->sum('stock_quantity'),
            'inStock' => (int) $query->where('stock_quantity', '>', 0)->count(),
            'lowStock' => (int) $query->where('stock_quantity', '>', 0)->where('stock_quantity', '<=', DB::raw('COALESCE(reorder_level, 0)'))->count(),
            'zeroStock' => (int) $query->where('stock_quantity', 0)->count(),
            'negativeStock' => (int) $query->where('stock_quantity', '<', 0)->count(),
        ]);
    }

    public function invoiceCountSummary()
    {
        return response()->json([
            'sale' => Invoice::query()->count(),
            'purchase' => PurchaseInvoice::query()->count(),
        ]);
    }

    public function invoiceAmountSummary()
    {
        return response()->json([
            'sale' => (float) Invoice::query()->sum('total_amount'),
            'purchase' => (float) PurchaseInvoice::query()->sum('grand_total'),
        ]);
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

        return response()->json($items->map(fn ($item) => [
            'product_name' => $item->product_name,
            'total_qty' => (int) ($item->total_qty ?? 0),
        ]));
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

        return response()->json($items->map(fn ($item) => [
            'product_name' => $item->product_name,
            'total_qty' => (int) ($item->total_qty ?? 0),
        ]));
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

        return response()->json($items->map(fn ($item) => [
            'product_name' => $item->product_name,
            'qty' => (int) ($item->qty ?? 0),
        ]));
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

        return response()->json($items->map(fn ($item) => [
            'name' => $item->name,
            'amount' => (float) ($item->amount ?? 0),
        ]));
    }

    public function topVendors(Request $request)
    {
        if (!Schema::hasTable('purchase_invoices') || !Schema::hasTable('suppliers')) {
            return response()->json([]);
        }

        $limit = min(max((int) $request->query('limit', 5), 1), 25);

        $items = PurchaseInvoice::query()
            ->join('suppliers', 'purchase_invoices.supplier_id', '=', 'suppliers.id')
            ->select('suppliers.name as name', DB::raw('SUM(purchase_invoices.grand_total) as amount'))
            ->groupBy('suppliers.id', 'suppliers.name')
            ->orderByDesc('amount')
            ->limit($limit)
            ->get();

        return response()->json($items->map(fn ($item) => [
            'name' => $item->name,
            'amount' => (float) ($item->amount ?? 0),
        ]));
    }

    public function purchaseDueInvoices()
    {
        if (!Schema::hasTable('purchase_invoices')) {
            return response()->json([]);
        }

        $items = PurchaseInvoice::query()
            ->with(['supplier', 'company'])
            ->where('status', '!=', 'paid')
            ->orderBy('due_date')
            ->get();

        return response()->json($items->map(function ($invoice) {
            return [
                'invoice_no' => $invoice->invoice_number ?? $invoice->purchase_number ?? $invoice->bill_number ?? 'N/A',
                'company_name' => $invoice->company?->name ?? 'N/A',
                'name' => $invoice->supplier?->name ?? 'N/A',
                'phone' => $invoice->supplier?->phone ?? '',
                'due_date' => $invoice->due_date ? $invoice->due_date->toDateTimeString() : null,
                'due_from' => 'Supplier',
                'remaining_payment' => max(0, (float) ($invoice->grand_total ?? 0) - (float) ($invoice->paid_amount ?? 0)),
            ];
        }));
    }

    public function loginActivity()
    {
        return response()->json([]);
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

        // Sales Health
        if ($salesGrowth === null) {
            $breakdown[] = ['label' => 'Sales Health', 'score' => 0];
        } else {
            $score = (int) max(0, min(100, round(50 + ($salesGrowth / 2))));
            $breakdown[] = ['label' => 'Sales Health', 'score' => $score];
        }

        // Profit Health (approx using sales - purchases if available)
        $purchaseSum = Schema::hasTable('purchase_invoices') ? (float) PurchaseInvoice::query()->whereBetween('created_at', [$periodStart, $periodEnd])->sum('grand_total') : 0.0;
        $profit = max(0, $currentSales - $purchaseSum);
        $profitScore = $currentSales > 0 ? (int) max(0, min(100, round(($profit / max(1, $currentSales)) * 100))) : 0;
        $breakdown[] = ['label' => 'Profit Health', 'score' => $profitScore];

        // Cash Flow
        $cashScore = $paymentsIn30 > 0 ? 80 : 20;
        $breakdown[] = ['label' => 'Cash Flow', 'score' => $cashScore];

        // Inventory
        $inventoryScore = $totalProducts > 0 ? (int) max(0, min(100, round((1 - ($lowStockCount / max(1, $totalProducts))) * 100))) : 0;
        $breakdown[] = ['label' => 'Inventory', 'score' => $inventoryScore];

        // Customer Health (new customers growth)
        $newCustomersCurrent = (int) Customer::query()->whereBetween('created_at', [$periodStart, $periodEnd])->count();
        $newCustomersPrev = (int) Customer::query()->whereBetween('created_at', [$prevStart, $prevEnd])->count();
        $custGrowth = $newCustomersPrev > 0 ? (($newCustomersCurrent - $newCustomersPrev) / $newCustomersPrev) * 100 : ($newCustomersCurrent > 0 ? 100 : 0);
        $custScore = (int) max(0, min(100, round(50 + ($custGrowth / 2))));
        $breakdown[] = ['label' => 'Customer Health', 'score' => $custScore];

        // Receivables
        $receivableScore = $receivable > 0 ? (int) max(0, min(100, round(100 - ($receivable / max(1, $currentSales + $receivable)) * 100))) : 100;
        $breakdown[] = ['label' => 'Receivables', 'score' => $receivableScore];

        // Operations (simple availability of employees)
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
        // Low stock
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

        // Overdue receivables
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
        // Accept optional `state` query parameter to restrict to a specific state (e.g. Bihar)
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
}
