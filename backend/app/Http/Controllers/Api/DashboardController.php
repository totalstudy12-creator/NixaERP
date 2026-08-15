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
}
