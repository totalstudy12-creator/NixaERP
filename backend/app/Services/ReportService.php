<?php

namespace App\Services;

use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\PurchaseInvoice;
use App\Models\PurchaseInvoiceItem;
use App\Models\Payment;
use App\Models\Company;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\Supplier;
use App\Models\ProductPurchasePriceHistory;
use App\Models\Product;
use App\Models\SalesReturn;
use App\Models\ReturnItem;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Carbon\Carbon;

class ReportService
{
    /** @var array<string, array{found: bool, unit_cost: float}> */
    protected array $historicalCostCache = [];

    /**
     * Get financial year dates (1 Apr - 31 Mar)
     */
    public function getFinancialYearDates($yearStart): array
    {
        $start = Carbon::parse($yearStart . '-04-01');
        $end = $start->copy()->addYears(1)->subDay();
        return [
            'from' => $start->format('Y-m-d'),
            'to' => $end->format('Y-m-d'),
        ];
    }

    /**
     * Validate and normalize date range
     */
    public function validateDateRange($from, $to): array
    {
        $fromDate = Carbon::parse($from)->startOfDay();
        $toDate = Carbon::parse($to)->endOfDay();

        if ($fromDate->isAfter($toDate)) {
            throw new \InvalidArgumentException('From date cannot be after to date.');
        }

        if ($toDate->isAfter(now())) {
            $toDate = now()->endOfDay();
        }

        return [$fromDate, $toDate];
    }

    /**
     * Build base query for invoices with filters
     */
    private function baseInvoiceQuery(?int $companyId = null, ?int $branchId = null): Builder
    {
        $query = Invoice::query()
            ->with(['company', 'branch', 'customer', 'items.product'])
            ->where('status', '!=', 'cancelled');

        if ($companyId) {
            $query->where('company_id', $companyId);
        }

        if ($branchId) {
            $query->where('branch_id', $branchId);
        }

        return $query;
    }

    /**
     * Build base query for purchase invoices with filters
     */
    private function basePurchaseQuery(?int $companyId = null, ?int $branchId = null): Builder
    {
        $query = PurchaseInvoice::query()
            ->with(['supplier', 'items'])
            ->where('status', '!=', 'cancelled');

        if ($companyId) {
            $query->where('company_id', $companyId);
        }

        if ($branchId) {
            $query->where('branch_id', $branchId);
        }

        return $query;
    }

    /**
     * Return invoice revenue on a GST-exclusive basis.
     * Invoice subtotal is gross taxable value before discounts; invoice
     * discount_amount contains item + general discounts in the current schema.
     */
    protected function calculateInvoiceRevenue(Invoice $invoice): array
    {
        $grossSales = (float) ($invoice->subtotal ?? 0);
        $discount = min(max(0, (float) ($invoice->discount_amount ?? 0)), $grossSales);
        $netSales = max(0, $grossSales - $discount);

        return [
            'gross_sales' => $grossSales,
            'discount' => $discount,
            'net_sales' => $netSales,
            'tax' => (float) ($invoice->tax_amount ?? 0),
        ];
    }

    /**
     * Historical unit cost used for profitability.
     * Policy: latest purchase-price-history entry on/before sale date, then
     * current product.purchase_price only when no historical record exists.
     */
    protected function resolveHistoricalProductCostInfo(int $productId, ?string $invoiceDate = null): array
    {
        if ($productId <= 0) {
            return ['found' => false, 'unit_cost' => 0.0];
        }

        $date = $invoiceDate ? Carbon::parse($invoiceDate)->toDateString() : null;
        $cacheKey = $productId . '|' . ($date ?? 'latest');
        if (array_key_exists($cacheKey, $this->historicalCostCache)) {
            return $this->historicalCostCache[$cacheKey];
        }

        $entry = ProductPurchasePriceHistory::query()
            ->where('product_id', $productId)
            ->when($date, fn ($q) => $q->whereDate('purchase_date', '<=', $date))
            ->where(function ($q) {
                $q->where('quantity', '>', 0)->orWhereNull('quantity');
            })
            ->orderByDesc('purchase_date')
            ->orderByDesc('id')
            ->first();

        if ($entry) {
            $result = [
                'found' => true,
                'unit_cost' => max(0.0, (float) ($entry->unit_price ?? 0)),
            ];
        } else {
            $product = Product::query()->find($productId);
            $purchasePrice = $product ? (float) ($product->purchase_price ?? 0) : 0.0;
            $result = [
                'found' => $purchasePrice > 0,
                'unit_cost' => max(0.0, $purchasePrice),
            ];
        }

        $this->historicalCostCache[$cacheKey] = $result;
        return $result;
    }

    protected function calculateInvoiceCogs(Invoice $invoice): array
    {
        $cogs = 0.0;
        $missingCostLines = 0;
        $items = 0;

        foreach ($invoice->items as $item) {
            $items++;
            $qty = max(0, (float) ($item->quantity ?? 0));
            if ($qty <= 0) {
                continue;
            }

            $costInfo = $this->resolveHistoricalProductCostInfo(
                (int) ($item->product_id ?? 0),
                $invoice->invoice_date ? Carbon::parse($invoice->invoice_date)->toDateString() : null,
            );

            if (!$costInfo['found']) {
                $missingCostLines++;
            }

            $cogs += $qty * (float) $costInfo['unit_cost'];
        }

        return [
            'cogs' => round($cogs, 2),
            'missing_cost_lines' => $missingCostLines,
            'item_count' => $items,
        ];
    }

    /**
     * Sales returns reduce revenue only for non-draft/non-cancelled returns.
     * Returned COGS is reversed only when the goods are marked for restocking.
     */
    protected function getSalesReturnAdjustment(
        ?int $companyId,
        ?int $branchId,
        Carbon $fromDate,
        Carbon $toDate
    ): array {
        $returns = SalesReturn::query()
            ->with(['originalSale', 'items.saleItem'])
            ->whereBetween('return_date', [$fromDate, $toDate])
            ->whereIn('status', ['confirmed', 'stock_updated', 'refund_pending', 'completed'])
            ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->get();

        $salesReturns = 0.0;
        $returnedCogs = 0.0;
        $returnCount = 0;
        $missingCostLines = 0;

        foreach ($returns as $return) {
            $returnCount++;
            $salesReturns += (float) ($return->taxable_amount ?? $return->subtotal ?? 0);

            foreach ($return->items as $returnItem) {
                if (($returnItem->restock_status ?? 'restock') !== 'restock') {
                    continue;
                }

                $qty = max(0, (float) ($returnItem->return_qty ?? $returnItem->quantity ?? 0));
                if ($qty <= 0) continue;

                $saleItem = $returnItem->saleItem;
                $productId = (int) ($returnItem->product_id ?? $saleItem?->product_id ?? 0);
                $saleDate = $return->originalSale?->invoice_date
                    ? Carbon::parse($return->originalSale->invoice_date)->toDateString()
                    : ($return->return_date ? Carbon::parse($return->return_date)->toDateString() : null);

                $costInfo = $this->resolveHistoricalProductCostInfo($productId, $saleDate);
                if (!$costInfo['found']) {
                    $missingCostLines++;
                }
                $returnedCogs += $qty * (float) $costInfo['unit_cost'];
            }
        }

        return [
            'sales_returns' => round(max(0, $salesReturns), 2),
            'returned_cogs' => round(max(0, $returnedCogs), 2),
            'return_count' => $returnCount,
            'missing_cost_lines' => $missingCostLines,
        ];
    }

    /**
     * Read operating expenses only when a real expenses table exists.
     * No fallback/fake expense values are ever introduced.
     */
    protected function getOperatingExpenseSummary(
        ?int $companyId,
        ?int $branchId,
        Carbon $fromDate,
        Carbon $toDate
    ): array {
        if (!Schema::hasTable('expenses')) {
            return [
                'total' => 0.0,
                'rows' => [],
                'source' => 'not_available',
            ];
        }

        $columns = Schema::getColumnListing('expenses');
        $pick = static function (array $candidates) use ($columns): ?string {
            foreach ($candidates as $candidate) {
                if (in_array($candidate, $columns, true)) return $candidate;
            }
            return null;
        };

        $dateColumn = $pick(['expense_date', 'date', 'transaction_date', 'occurred_at', 'created_at']);
        $amountColumn = $pick(['amount', 'total_amount', 'expense_amount', 'value']);
        if (!$dateColumn || !$amountColumn) {
            return [
                'total' => 0.0,
                'rows' => [],
                'source' => 'not_available',
            ];
        }

        $categoryColumn = $pick(['category', 'expense_category', 'expense_type', 'type', 'name']);
        $descriptionColumn = $pick(['description', 'remarks', 'note', 'reason']);
        $vendorColumn = $pick(['vendor', 'vendor_name', 'supplier_name']);

        $query = DB::table('expenses')
            ->whereBetween($dateColumn, [$fromDate, $toDate]);

        if ($companyId && in_array('company_id', $columns, true)) {
            $query->where('company_id', $companyId);
        }
        if ($branchId && in_array('branch_id', $columns, true)) {
            $query->where('branch_id', $branchId);
        }
        if (in_array('status', $columns, true)) {
            $query->where(function ($q) {
                $q->whereNull('status')
                    ->orWhereNotIn('status', ['cancelled', 'void', 'deleted']);
            });
        }

        $select = [DB::raw("$dateColumn as expense_date"), DB::raw("$amountColumn as expense_amount")];
        if ($categoryColumn) $select[] = DB::raw("$categoryColumn as expense_category");
        if ($descriptionColumn) $select[] = DB::raw("$descriptionColumn as expense_description");
        if ($vendorColumn) $select[] = DB::raw("$vendorColumn as expense_vendor");

        $records = $query->select($select)->orderBy($dateColumn, 'asc')->get();
        $grouped = [];
        foreach ($records as $record) {
            $amount = max(0, (float) ($record->expense_amount ?? 0));
            if ($amount <= 0) continue;
            $category = (string) ($record->expense_category ?? 'Operating Expense');
            if (!isset($grouped[$category])) $grouped[$category] = 0.0;
            $grouped[$category] += $amount;
        }

        $rows = [];
        foreach ($grouped as $name => $amount) {
            $rows[] = ['name' => $name, 'amount' => round($amount, 2)];
        }

        return [
            'total' => round(array_sum($grouped), 2),
            'rows' => $rows,
            'source' => 'expenses_table',
        ];
    }

    protected function calculatePnlBase(
        ?int $companyId,
        ?int $branchId,
        Carbon $fromDate,
        Carbon $toDate
    ): array {
        $this->historicalCostCache = [];

        $invoices = $this->baseInvoiceQuery($companyId, $branchId)
            ->whereBetween('invoice_date', [$fromDate, $toDate])
            ->get();

        $grossSales = 0.0;
        $discounts = 0.0;
        $cogs = 0.0;
        $invoiceCount = 0;
        $missingCostLines = 0;

        foreach ($invoices as $invoice) {
            if (($invoice->status ?? null) === 'draft') continue;
            $invoiceCount++;
            $revenue = $this->calculateInvoiceRevenue($invoice);
            $grossSales += $revenue['gross_sales'];
            $discounts += $revenue['discount'];

            $cost = $this->calculateInvoiceCogs($invoice);
            $cogs += $cost['cogs'];
            $missingCostLines += $cost['missing_cost_lines'];
        }

        $returns = $this->getSalesReturnAdjustment($companyId, $branchId, $fromDate, $toDate);
        $netSales = max(0, $grossSales - $discounts - $returns['sales_returns']);
        $netCogs = max(0, $cogs - $returns['returned_cogs']);
        $grossProfit = $netSales - $netCogs;

        return [
            'gross_sales' => round($grossSales, 2),
            'sales_discounts' => round($discounts, 2),
            'sales_returns' => $returns['sales_returns'],
            'net_sales' => round($netSales, 2),
            'cogs_before_returns' => round($cogs, 2),
            'returned_cogs' => $returns['returned_cogs'],
            'cogs' => round($netCogs, 2),
            'gross_profit' => round($grossProfit, 2),
            'invoice_count' => $invoiceCount,
            'sales_return_count' => $returns['return_count'],
            'missing_cost_lines' => $missingCostLines + $returns['missing_cost_lines'],
            'invoices' => $invoices,
            'returns' => $returns,
        ];
    }

    /**
     * Sum recorded payments safely against schema variations in the live DB.
     * Some deployments do not have payments.branch_id, so branch filtering is
     * applied only when that column actually exists.
     */
    protected function sumPaymentsByDirection(
        string $direction,
        ?int $companyId,
        ?int $branchId,
        Carbon $fromDate,
        Carbon $toDate
    ): float {
        if (!Schema::hasTable('payments')) {
            return 0.0;
        }

        $columns = Schema::getColumnListing('payments');
        foreach (['payment_direction', 'transaction_date', 'amount'] as $required) {
            if (!in_array($required, $columns, true)) {
                return 0.0;
            }
        }

        $query = Payment::query()
            ->where('payment_direction', $direction)
            ->whereBetween('transaction_date', [$fromDate, $toDate]);

        if ($companyId && in_array('company_id', $columns, true)) {
            $query->where('company_id', $companyId);
        }
        if ($branchId && in_array('branch_id', $columns, true)) {
            $query->where('branch_id', $branchId);
        }
        if (in_array('status', $columns, true)) {
            $query->whereIn('status', ['completed', 'paid', 'success']);
        }

        return (float) $query->sum('amount');
    }

    /**
     * OVERVIEW DASHBOARD SUMMARY
     */
    public function getDashboardSummary(?int $companyId = null, ?int $branchId = null, $from = null, $to = null): array
    {
        if ($from && $to) {
            [$fromDate, $toDate] = $this->validateDateRange($from, $to);
        } else {
            $fromDate = Carbon::now()->startOfYear();
            $toDate = Carbon::now()->endOfDay();
        }

        $pnl = $this->calculatePnlBase($companyId, $branchId, $fromDate, $toDate);

        $purchaseData = $this->basePurchaseQuery($companyId, $branchId)
            ->whereBetween('purchase_date', [$fromDate, $toDate])
            ->selectRaw('COUNT(*) as count, COALESCE(SUM(grand_total), 0) as total, COALESCE(SUM(tax_amount), 0) as tax')
            ->first();

        $paymentsReceived = $this->sumPaymentsByDirection(
            'inward', $companyId, $branchId, $fromDate, $toDate
        );

        $paymentsMade = $this->sumPaymentsByDirection(
            'outward', $companyId, $branchId, $fromDate, $toDate
        );

        $receivables = $this->baseInvoiceQuery($companyId, $branchId)
            ->whereBetween('invoice_date', [$fromDate, $toDate])
            ->whereNotIn('status', ['paid', 'cancelled', 'draft'])
            ->sum(DB::raw('GREATEST(COALESCE(total_amount, 0) - COALESCE(payment_received, paid_amount, 0), 0)'));

        $payables = $this->basePurchaseQuery($companyId, $branchId)
            ->whereBetween('purchase_date', [$fromDate, $toDate])
            ->whereNotIn('status', ['paid', 'cancelled', 'draft'])
            ->sum(DB::raw('GREATEST(COALESCE(grand_total, 0) - COALESCE(paid_amount, 0), 0)'));

        $expense = $this->getOperatingExpenseSummary($companyId, $branchId, $fromDate, $toDate);
        $netProfit = $pnl['gross_profit'] - $expense['total'];

        return [
            'total_sales' => (float) $pnl['net_sales'],
            'gross_sales' => (float) $pnl['gross_sales'],
            'total_purchases' => (float) ($purchaseData->total ?? 0),
            'gross_profit' => (float) $pnl['gross_profit'],
            'net_profit' => (float) $netProfit,
            'operating_expenses' => (float) $expense['total'],
            'receivables' => (float) $receivables,
            'payables' => (float) $payables,
            'payments_received' => (float) $paymentsReceived,
            'payments_made' => (float) $paymentsMade,
            'payments' => (float) $paymentsReceived,
            'outstanding_amount' => (float) $receivables,
            'sales_count' => (int) $pnl['invoice_count'],
            'purchase_count' => (int) ($purchaseData->count ?? 0),
            'invoice_count' => (int) $pnl['invoice_count'],
            'profit_margin' => $pnl['net_sales'] > 0 ? (($pnl['gross_profit'] / $pnl['net_sales']) * 100) : 0.0,
            'net_margin' => $pnl['net_sales'] > 0 ? (($netProfit / $pnl['net_sales']) * 100) : 0.0,
            'missing_cost_lines' => (int) $pnl['missing_cost_lines'],
            'pnl_basis' => 'GST-exclusive revenue less historical purchase-cost COGS less recorded operating expenses',
        ];
    }
    public function getPurchaseRegister(?int $companyId = null, ?int $branchId = null, $from = null, $to = null, int $page = 1, int $perPage = 25, ?string $search = null): array
    {
        [$fromDate, $toDate] = $this->validateDateRange($from, $to);

        $query = PurchaseInvoice::query()
            ->with(['supplier', 'items'])
            ->whereBetween('purchase_date', [$fromDate, $toDate])
            ->where('status', '!=', 'cancelled')
            ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId));

        $total = $query->count();
        $purchases = $query->orderBy('purchase_date', 'desc')
            ->skip(($page - 1) * $perPage)
            ->take($perPage)
            ->get();

        return [
            'data' => $purchases->map(fn ($purchase) => [
                'id' => $purchase->id,
                'purchase_number' => $purchase->purchase_number,
                'purchase_date' => $purchase->purchase_date,
                'supplier' => $purchase->supplier?->name,
                'gstin' => $purchase->supplier?->gst_number,
                'item_count' => $purchase->items->count(),
                'subtotal' => (float) ($purchase->subtotal ?? 0),
                'discount' => (float) ($purchase->order_discount ?? 0),
                'tax' => (float) ($purchase->tax_amount ?? 0),
                'total' => (float) ($purchase->grand_total ?? 0),
                'paid_amount' => (float) ($purchase->paid_amount ?? 0),
                'due_amount' => (float) (($purchase->grand_total ?? 0) - ($purchase->paid_amount ?? 0)),
                'status' => $purchase->status,
            ])->toArray(),
            'meta' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => max(1, (int) ceil($total / $perPage)),
            ],
        ];
    }

    public function getPurchaseByVendor(?int $companyId = null, ?int $branchId = null, $from = null, $to = null, int $page = 1, int $perPage = 25, ?string $search = null): array
    {
        [$fromDate, $toDate] = $this->validateDateRange($from, $to);

        $purchases = PurchaseInvoice::query()
            ->with('supplier')
            ->whereBetween('purchase_date', [$fromDate, $toDate])
            ->where('status', '!=', 'cancelled')
            ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->get();

        $grouped = $purchases->groupBy('supplier_id')->map(function ($vendorPurchases) {
            $supplier = $vendorPurchases->first()->supplier;
            $totalAmount = $vendorPurchases->sum('grand_total');
            $tax = $vendorPurchases->sum('tax_amount');
            $discount = $vendorPurchases->sum('order_discount');
            $paid = $vendorPurchases->sum('paid_amount');

            return [
                'supplier' => $supplier?->name ?? 'Unknown Vendor',
                'purchase_count' => $vendorPurchases->count(),
                'taxable_purchases' => (float) ($vendorPurchases->sum('subtotal') - $discount),
                'gst' => (float) $tax,
                'total_purchases' => (float) $totalAmount,
                'paid' => (float) $paid,
                'outstanding' => (float) ($totalAmount - $paid),
            ];
        })->values()->toArray();

        $total = count($grouped);
        $data = array_slice($grouped, ($page - 1) * $perPage, $perPage);

        return [
            'data' => $data,
            'meta' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => max(1, (int) ceil($total / $perPage)),
            ],
        ];
    }

    private function formatLedgerDate($value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        try {
            return Carbon::parse($value)->format('Y-m-d');
        } catch (\Throwable $e) {
            return null;
        }
    }

    public function getGeneralLedger(?int $companyId = null, ?int $branchId = null, $from = null, $to = null, int $page = 1, int $perPage = 100): array
    {
        [$fromDate, $toDate] = $this->validateDateRange($from, $to);

        $rows = [];

        $invoices = Invoice::query()
            ->with(['customer'])
            ->whereBetween('invoice_date', [$fromDate, $toDate])
            ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->orderBy('invoice_date', 'asc')
            ->get();

        foreach ($invoices as $invoice) {
            $amount = (float) ($invoice->total_amount ?? 0);
            $paid = (float) ($invoice->payment_received ?? 0);
            $balance = $amount - $paid;

            $invoiceDate = $this->formatLedgerDate($invoice->invoice_date);

            $rows[] = [
                'id' => 'inv-' . $invoice->id,
                'date' => $invoiceDate,
                'description' => 'Sales Invoice #' . ($invoice->invoice_no ?? $invoice->id),
                'debit' => 0,
                'credit' => $amount,
                'balance' => $balance,
                'customer' => $invoice->customer?->name,
                'type' => 'invoice',
            ];

            if ($paid > 0) {
                $rows[] = [
                    'id' => 'pay-inv-' . $invoice->id,
                    'date' => $invoiceDate,
                    'description' => 'Payment Received for Invoice #' . ($invoice->invoice_no ?? $invoice->id),
                    'debit' => $paid,
                    'credit' => 0,
                    'balance' => $balance,
                    'customer' => $invoice->customer?->name,
                    'type' => 'payment',
                ];
            }
        }

        $purchases = PurchaseInvoice::query()
            ->with(['supplier'])
            ->whereBetween('purchase_date', [$fromDate, $toDate])
            ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->orderBy('purchase_date', 'asc')
            ->get();

        foreach ($purchases as $purchase) {
            $amount = (float) ($purchase->grand_total ?? 0);
            $paid = (float) ($purchase->paid_amount ?? 0);
            $purchaseDate = $this->formatLedgerDate($purchase->purchase_date);

            $rows[] = [
                'id' => 'pur-' . $purchase->id,
                'date' => $purchaseDate,
                'description' => 'Purchase Bill #' . ($purchase->purchase_number ?? $purchase->id),
                'debit' => $amount,
                'credit' => 0,
                'balance' => $amount,
                'supplier' => $purchase->supplier?->name,
                'type' => 'purchase',
            ];

            if ($paid > 0) {
                $rows[] = [
                    'id' => 'pay-pur-' . $purchase->id,
                    'date' => $purchaseDate,
                    'description' => 'Payment Made for Bill #' . ($purchase->purchase_number ?? $purchase->id),
                    'debit' => 0,
                    'credit' => $paid,
                    'balance' => $amount - $paid,
                    'supplier' => $purchase->supplier?->name,
                    'type' => 'payment',
                ];
            }
        }

        $payments = Payment::query()
            ->whereBetween('transaction_date', [$fromDate, $toDate])
            ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
            ->orderBy('transaction_date', 'asc')
            ->get();

        foreach ($payments as $payment) {
            $paymentDate = $this->formatLedgerDate($payment->transaction_date);

            $rows[] = [
                'id' => 'payment-' . $payment->id,
                'date' => $paymentDate,
                'description' => ($payment->payment_direction === 'inward' ? 'Cash Receipt' : 'Cash Payment') . ' - ' . ($payment->reference_no ?? 'N/A'),
                'debit' => $payment->payment_direction === 'outward' ? (float) ($payment->amount ?? 0) : 0,
                'credit' => $payment->payment_direction === 'inward' ? (float) ($payment->amount ?? 0) : 0,
                'balance' => (float) ($payment->amount ?? 0),
                'type' => 'payment',
            ];
        }

        usort($rows, fn ($a, $b) => ($a['date'] ?? '0000-00-00') <=> ($b['date'] ?? '0000-00-00'));

        $total = count($rows);
        $data = array_slice($rows, ($page - 1) * $perPage, $perPage);

        $runningBalance = 0;
        foreach ($data as &$entry) {
            $runningBalance = $runningBalance + ((float) ($entry['credit'] ?? 0) - (float) ($entry['debit'] ?? 0));
            $entry['balance'] = $runningBalance;
        }

        return [
            'data' => $data,
            'meta' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => max(1, (int) ceil($total / $perPage)),
            ],
        ];
    }

    public function getCustomerLedger(?int $companyId = null, ?int $branchId = null, $customerId = null, $from = null, $to = null, int $page = 1, int $perPage = 100): array
    {
        [$fromDate, $toDate] = $this->validateDateRange($from, $to);

        $query = Invoice::query()
            ->with('customer')
            ->whereBetween('invoice_date', [$fromDate, $toDate])
            ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->when($customerId, fn ($q) => $q->where('customer_id', $customerId));

        $rows = [];
        foreach ($query->orderBy('invoice_date', 'asc')->get() as $invoice) {
            $amount = (float) ($invoice->total_amount ?? 0);
            $paid = (float) ($invoice->payment_received ?? 0);
            $invoiceDate = $this->formatLedgerDate($invoice->invoice_date);

            $rows[] = [
                'id' => 'customer-invoice-' . $invoice->id,
                'date' => $invoiceDate,
                'description' => 'Invoice #' . ($invoice->invoice_no ?? $invoice->id),
                'debit' => 0,
                'credit' => $amount,
                'balance' => $amount - $paid,
                'customer' => $invoice->customer?->name,
                'type' => 'invoice',
            ];

            if ($paid > 0) {
                $rows[] = [
                    'id' => 'customer-payment-' . $invoice->id,
                    'date' => $invoiceDate,
                    'description' => 'Payment received for Invoice #' . ($invoice->invoice_no ?? $invoice->id),
                    'debit' => $paid,
                    'credit' => 0,
                    'balance' => $amount - $paid,
                    'customer' => $invoice->customer?->name,
                    'type' => 'payment',
                ];
            }
        }

        usort($rows, fn ($a, $b) => ($a['date'] ?? '0000-00-00') <=> ($b['date'] ?? '0000-00-00'));

        $total = count($rows);
        $data = array_slice($rows, ($page - 1) * $perPage, $perPage);

        return [
            'data' => $data,
            'meta' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => max(1, (int) ceil($total / $perPage)),
            ],
        ];
    }

    /**
     * SALES SUMMARY REPORT
     */
    public function getSalesSummary(?int $companyId = null, ?int $branchId = null, $from = null, $to = null, int $page = 1, int $perPage = 25, ?string $search = null): array
    {
        [$fromDate, $toDate] = $this->validateDateRange($from, $to);

        $query = $this->baseInvoiceQuery($companyId, $branchId)
            ->whereBetween('invoice_date', [$fromDate, $toDate]);

        $total = $query->count();
        $invoices = $query->orderBy('invoice_date', 'DESC')
            ->skip(($page - 1) * $perPage)
            ->take($perPage)
            ->get();

        $summary = [
            'count' => count($invoices),
            'total_amount' => $invoices->sum('total_amount'),
            'total_tax' => $invoices->sum('tax_amount'),
            'total_discount' => $invoices->sum('discount_amount'),
        ];

        return [
            'data' => $invoices->map(fn($inv) => [
                'id' => $inv->id,
                'invoice_number' => $inv->invoice_no,
                'invoice_date' => $inv->invoice_date,
                'customer' => $inv->customer?->name,
                'gstin' => $inv->gstin,
                'branch' => $inv->branch?->name,
                'subtotal' => (float) $inv->subtotal,
                'discount' => (float) $inv->discount_amount,
                'taxable_amount' => (float) ($inv->subtotal - $inv->discount_amount),
                'tax' => (float) $inv->tax_amount,
                'total' => (float) $inv->total_amount,
                'paid_amount' => (float) ($inv->payment_received ?? 0),
                'due_amount' => (float) ($inv->total_amount - ($inv->payment_received ?? 0)),
                'status' => $inv->status,
            ])->toArray(),
            'summary' => $summary,
            'meta' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => ceil($total / $perPage),
                'from' => $fromDate->format('Y-m-d'),
                'to' => $toDate->format('Y-m-d'),
            ],
        ];
    }

    /**
     * SALES REGISTER - Transaction level
     */
    public function getSalesRegister(?int $companyId = null, ?int $branchId = null, $from = null, $to = null, int $page = 1, int $perPage = 25, ?string $search = null): array
    {
        [$fromDate, $toDate] = $this->validateDateRange($from, $to);

        $query = $this->baseInvoiceQuery($companyId, $branchId)
            ->whereBetween('invoice_date', [$fromDate, $toDate]);

        $total = $query->count();
        $invoices = $query->orderBy('invoice_date', 'DESC')
            ->skip(($page - 1) * $perPage)
            ->take($perPage)
            ->get();

        return [
            'data' => $invoices->map(fn($inv) => [
                'date' => $inv->invoice_date,
                'invoice_number' => $inv->invoice_no,
                'customer' => $inv->customer?->name,
                'gstin' => $inv->gstin,
                'item_count' => $inv->items->count(),
                'taxable_value' => (float) ($inv->subtotal - $inv->discount_amount),
                'gst' => (float) $inv->tax_amount,
                'total' => (float) $inv->total_amount,
                'status' => $inv->status,
            ])->toArray(),
            'meta' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => ceil($total / $perPage),
            ],
        ];
    }

    /**
     * SALES BY CUSTOMER
     */
    public function getSalesByCustomer(?int $companyId = null, ?int $branchId = null, $from = null, $to = null, int $page = 1, int $perPage = 25, ?string $search = null): array
    {
        [$fromDate, $toDate] = $this->validateDateRange($from, $to);

        $invoices = $this->baseInvoiceQuery($companyId, $branchId)
            ->whereBetween('invoice_date', [$fromDate, $toDate])
            ->get();

        // Group by customer
        $grouped = $invoices->groupBy('customer_id')->map(function ($customerInvoices) {
            $customer = $customerInvoices->first()->customer;
            $totalAmount = $customerInvoices->sum('total_amount');
            $totalTax = $customerInvoices->sum('tax_amount');
            $totalDiscount = $customerInvoices->sum('discount_amount');
            $taxableAmount = $customerInvoices->sum(function ($inv) {
                return $inv->subtotal - $inv->discount_amount;
            });
            $paidAmount = $customerInvoices->sum('payment_received') ?? 0;

            return [
                'customer' => $customer?->name,
                'invoice_count' => $customerInvoices->count(),
                'taxable_sales' => (float) $taxableAmount,
                'gst' => (float) $totalTax,
                'total_sales' => (float) $totalAmount,
                'paid' => (float) $paidAmount,
                'outstanding' => (float) ($totalAmount - $paidAmount),
            ];
        })->values()->toArray();

        // Paginate
        $total = count($grouped);
        $data = array_slice($grouped, ($page - 1) * $perPage, $perPage);

        return [
            'data' => $data,
            'meta' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => ceil($total / $perPage),
            ],
        ];
    }

    /**
     * SALES BY PRODUCT
     */
    public function getSalesByProduct(?int $companyId = null, ?int $branchId = null, $from = null, $to = null, int $page = 1, int $perPage = 25, ?string $search = null): array
    {
        [$fromDate, $toDate] = $this->validateDateRange($from, $to);

        $items = InvoiceItem::whereHas('invoice', function ($q) use ($companyId, $branchId, $fromDate, $toDate) {
            $q->where('status', '!=', 'cancelled')
                ->whereBetween('invoice_date', [$fromDate, $toDate]);
            if ($companyId) $q->where('company_id', $companyId);
            if ($branchId) $q->where('branch_id', $branchId);
        })
        ->with('product')
        ->get();

        // Group by product
        $grouped = $items->groupBy('product_id')->map(function ($productItems) {
            $product = $productItems->first()->product;
            $quantity = $productItems->sum('quantity');
            $totalAmount = $productItems->sum('total');
            $taxableAmount = $productItems->sum('subtotal');
            $discountAmount = $productItems->sum('discount_amount');
            $taxAmount = $productItems->sum(function ($item) {
                return ($item->cgst_amount ?? 0) + ($item->sgst_amount ?? 0) + ($item->igst_amount ?? 0);
            });

            return [
                'product' => $product?->name,
                'sku' => $product?->sku,
                'quantity' => (float) $quantity,
                'taxable_sales' => (float) $taxableAmount,
                'discount' => (float) $discountAmount,
                'gst' => (float) $taxAmount,
                'total_sales' => (float) $totalAmount,
                'avg_selling_price' => $quantity > 0 ? ((float) $totalAmount / $quantity) : 0,
            ];
        })->values()->toArray();

        $total = count($grouped);
        $data = array_slice($grouped, ($page - 1) * $perPage, $perPage);

        return [
            'data' => $data,
            'meta' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => ceil($total / $perPage),
            ],
        ];
    }

    /**
     * OUTSTANDING SALES (Unpaid invoices with due date tracking)
     */
    public function getOutstandingSales(?int $companyId = null, ?int $branchId = null, $from = null, $to = null, int $page = 1, int $perPage = 25, ?string $search = null): array
    {
        [$fromDate, $toDate] = $this->validateDateRange($from, $to);
        $today = now()->format('Y-m-d');

        $query = $this->baseInvoiceQuery($companyId, $branchId)
            ->whereBetween('invoice_date', [$fromDate, $toDate])
            ->whereNotIn('status', ['paid', 'cancelled'])
            ->whereRaw('COALESCE(paid_amount, 0) < COALESCE(total_amount, 0)');

        $total = $query->count();
        $invoices = $query->orderBy('due_date', 'ASC')
            ->skip(($page - 1) * $perPage)
            ->take($perPage)
            ->get();

        return [
            'data' => $invoices->map(fn($inv) => [
                'customer' => $inv->customer?->name,
                'invoice' => $inv->invoice_no,
                'invoice_date' => $inv->invoice_date,
                'due_date' => $inv->due_date,
                'invoice_amount' => (float) $inv->total_amount,
                'paid_amount' => (float) ($inv->payment_received ?? $inv->paid_amount ?? 0),
                'outstanding_amount' => (float) ($inv->total_amount - ($inv->payment_received ?? $inv->paid_amount ?? 0)),
                'overdue_days' => $inv->due_date ? max(0, (int) \Carbon\Carbon::parse($inv->due_date)->diffInDays(now())) : 0,
                'status' => $inv->status,
            ])->toArray(),
            'meta' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => ceil($total / $perPage),
            ],
        ];
    }

    /**
     * GST SALES REPORT (GSTR-1 source data)
     */
    public function getGstSalesReport(?int $companyId = null, ?int $branchId = null, $from = null, $to = null, int $page = 1, int $perPage = 25, ?string $search = null): array
    {
        [$fromDate, $toDate] = $this->validateDateRange($from, $to);

        $items = InvoiceItem::whereHas('invoice', function ($q) use ($companyId, $branchId, $fromDate, $toDate) {
            $q->where('status', '!=', 'cancelled')
                ->whereBetween('invoice_date', [$fromDate, $toDate]);
            if ($companyId) $q->where('company_id', $companyId);
            if ($branchId) $q->where('branch_id', $branchId);
        })
        ->with('invoice.customer')
        ->get();

        $total = $items->count();
        $data = $items->skip(($page - 1) * $perPage)->take($perPage);

        return [
            'data' => $data->map(fn($item) => [
                'invoice_no' => $item->invoice?->invoice_no,
                'invoice_date' => $item->invoice?->invoice_date,
                'customer' => $item->invoice?->customer?->name,
                'gstin' => $item->invoice?->gstin,
                'description' => $item->product?->name,
                'quantity' => (float) $item->quantity,
                'unit_price' => (float) $item->unit_price,
                'taxable_value' => (float) $item->subtotal,
                'cgst_percent' => (float) $item->cgst_percent,
                'cgst_amount' => (float) $item->cgst_amount,
                'sgst_percent' => (float) $item->sgst_percent,
                'sgst_amount' => (float) $item->sgst_amount,
                'igst_percent' => (float) $item->igst_percent,
                'igst_amount' => (float) $item->igst_amount,
                'cess' => 0, // Not in current schema
                'total_tax' => (float) (($item->cgst_amount ?? 0) + ($item->sgst_amount ?? 0) + ($item->igst_amount ?? 0)),
                'total_amount' => (float) $item->total,
                'supply_type' => $item->is_inter_state ? 'Interstate' : 'Intrastate',
            ])->toArray(),
            'meta' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => ceil($total / $perPage),
            ],
        ];
    }

    /**
     * PURCHASE SUMMARY REPORT
     */
    public function getPurchaseSummary(?int $companyId = null, ?int $branchId = null, $from = null, $to = null, int $page = 1, int $perPage = 25, ?string $search = null): array
    {
        [$fromDate, $toDate] = $this->validateDateRange($from, $to);

        $query = $this->basePurchaseQuery($companyId, $branchId)
            ->whereBetween('purchase_date', [$fromDate, $toDate]);

        $total = $query->count();
        $purchases = $query->orderBy('purchase_date', 'DESC')
            ->skip(($page - 1) * $perPage)
            ->take($perPage)
            ->get();

        $summary = [
            'count' => count($purchases),
            'total_amount' => $purchases->sum('grand_total'),
            'total_tax' => $purchases->sum('tax_amount'),
            'total_discount' => $purchases->sum('order_discount'),
        ];

        return [
            'data' => $purchases->map(fn($pur) => [
                'id' => $pur->id,
                'purchase_number' => $pur->purchase_number,
                'purchase_date' => $pur->purchase_date,
                'supplier' => $pur->supplier?->name,
                'gstin' => $pur->supplier?->gstin,
                'subtotal' => (float) $pur->subtotal,
                'discount' => (float) $pur->order_discount,
                'taxable_amount' => (float) ($pur->subtotal - $pur->order_discount),
                'tax' => (float) $pur->tax_amount,
                'total' => (float) $pur->grand_total,
                'paid_amount' => (float) ($pur->paid_amount ?? 0),
                'due_amount' => (float) ($pur->grand_total - ($pur->paid_amount ?? 0)),
                'status' => $pur->status,
            ])->toArray(),
            'summary' => $summary,
            'meta' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => ceil($total / $perPage),
            ],
        ];
    }

    /**
     * OUTSTANDING PURCHASES (Unpaid purchases)
     */
    public function getOutstandingPurchases(?int $companyId = null, ?int $branchId = null, $from = null, $to = null, int $page = 1, int $perPage = 25): array
    {
        [$fromDate, $toDate] = $this->validateDateRange($from, $to);
        $today = now()->format('Y-m-d');

        $query = $this->basePurchaseQuery($companyId, $branchId)
            ->whereBetween('purchase_date', [$fromDate, $toDate])
            ->whereNotIn('status', ['paid', 'cancelled'])
            ->where(function ($q) {
                $q->where('paid_amount', '<', \DB::raw('grand_total'))
                    ->orWhereNull('paid_amount');
            });

        $total = $query->count();
        $purchases = $query->orderBy('due_date', 'ASC')
            ->skip(($page - 1) * $perPage)
            ->take($perPage)
            ->get();

        return [
            'data' => $purchases->map(fn($pur) => [
                'supplier' => $pur->supplier?->name,
                'purchase_number' => $pur->purchase_number,
                'purchase_date' => $pur->purchase_date,
                'due_date' => $pur->due_date,
                'purchase_amount' => (float) $pur->grand_total,
                'paid_amount' => (float) ($pur->paid_amount ?? 0),
                'outstanding_amount' => (float) ($pur->grand_total - ($pur->paid_amount ?? 0)),
                'overdue_days' => $pur->due_date ? max(0, (int) \Carbon\Carbon::parse($pur->due_date)->diffInDays(now())) : 0,
                'status' => $pur->status,
            ])->toArray(),
            'meta' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => ceil($total / $perPage),
            ],
        ];
    }

    /**
     * PRODUCT PROFITABILITY REPORT
     */
    public function getProductProfitability(?int $companyId = null, ?int $branchId = null, $from = null, $to = null, int $page = 1, int $perPage = 25, ?string $search = null): array
    {
        [$fromDate, $toDate] = $this->validateDateRange($from, $to);
        $this->historicalCostCache = [];

        $invoices = $this->baseInvoiceQuery($companyId, $branchId)
            ->whereBetween('invoice_date', [$fromDate, $toDate])
            ->get();

        $grouped = [];
        foreach ($invoices as $invoice) {
            if (($invoice->status ?? null) === 'draft') continue;
            $saleDate = $invoice->invoice_date ? Carbon::parse($invoice->invoice_date)->toDateString() : null;
            foreach ($invoice->items as $item) {
                $productId = (int) ($item->product_id ?? 0);
                $key = (string) $productId;
                $qty = max(0, (float) ($item->quantity ?? 0));
                $base = max(0, (float) ($item->subtotal ?? ($qty * (float) ($item->unit_price ?? 0))));
                $discount = min($base, max(0, (float) ($item->discount_amount ?? 0)));
                $net = max(0, $base - $discount);
                $costInfo = $this->resolveHistoricalProductCostInfo($productId, $saleDate);
                $cogs = $qty * $costInfo['unit_cost'];

                if (!isset($grouped[$key])) {
                    $product = $item->product;
                    $grouped[$key] = [
                        'product_id' => $productId,
                        'product_name' => $product?->name ?? 'Unknown Product',
                        'sku' => $product?->sku ?? '-',
                        'quantity_sold' => 0.0,
                        'sales_value' => 0.0,
                        'discount' => 0.0,
                        'net_sales' => 0.0,
                        'cost_value' => 0.0,
                        'gross_profit' => 0.0,
                        'missing_cost_lines' => 0,
                    ];
                }

                $grouped[$key]['quantity_sold'] += $qty;
                $grouped[$key]['sales_value'] += $base;
                $grouped[$key]['discount'] += $discount;
                $grouped[$key]['net_sales'] += $net;
                $grouped[$key]['cost_value'] += $cogs;
                $grouped[$key]['gross_profit'] += ($net - $cogs);
                if (!$costInfo['found']) $grouped[$key]['missing_cost_lines']++;
            }
        }

        $rows = array_values($grouped);
        foreach ($rows as &$row) {
            $row['sales_value'] = round($row['sales_value'], 2);
            $row['discount'] = round($row['discount'], 2);
            $row['net_sales'] = round($row['net_sales'], 2);
            $row['cost_value'] = round($row['cost_value'], 2);
            $row['gross_profit'] = round($row['gross_profit'], 2);
            $row['margin_percent'] = $row['net_sales'] > 0 ? (($row['gross_profit'] / $row['net_sales']) * 100) : 0.0;
        }
        unset($row);

        usort($rows, fn ($a, $b) => $b['gross_profit'] <=> $a['gross_profit']);
        $total = count($rows);
        $data = array_slice($rows, ($page - 1) * $perPage, $perPage);

        return [
            'data' => $data,
            'summary' => [
                'total_products' => $total,
                'total_sales_value' => round(array_sum(array_column($rows, 'sales_value')), 2),
                'total_discount' => round(array_sum(array_column($rows, 'discount')), 2),
                'total_net_sales' => round(array_sum(array_column($rows, 'net_sales')), 2),
                'total_cost_value' => round(array_sum(array_column($rows, 'cost_value')), 2),
                'total_gross_profit' => round(array_sum(array_column($rows, 'gross_profit')), 2),
                'missing_cost_lines' => array_sum(array_column($rows, 'missing_cost_lines')),
            ],
            'meta' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => max(1, (int) ceil($total / $perPage)),
                'from' => $fromDate->format('Y-m-d'),
                'to' => $toDate->format('Y-m-d'),
            ],
        ];
    }
    protected function resolveHistoricalProductCost(int $productId, ?string $invoiceDate = null): float
    {
        $date = $invoiceDate ? Carbon::parse($invoiceDate)->toDateString() : null;

        $historyQuery = ProductPurchasePriceHistory::query()
            ->where('product_id', $productId)
            ->when($date, fn ($query) => $query->where('purchase_date', '<=', $date));

        $historyEntries = $historyQuery
            ->orderBy('purchase_date', 'asc')
            ->get();

        if ($historyEntries->isEmpty()) {
            $product = \App\Models\Product::query()->find($productId);
            return (float) ($product?->purchase_price ?? 0);
        }

        $totalQuantity = 0.0;
        $weightedTotal = 0.0;

        foreach ($historyEntries as $entry) {
            $qty = (float) ($entry->quantity ?? 0);
            if ($qty <= 0) {
                continue;
            }

            $totalQuantity += $qty;
            $weightedTotal += $qty * (float) ($entry->unit_price ?? 0);
        }

        if ($totalQuantity > 0) {
            return $weightedTotal / $totalQuantity;
        }

        $latest = $historyEntries->last();
        return (float) ($latest->unit_price ?? 0);
    }

    public function getInvoiceProfitability(?int $companyId = null, ?int $branchId = null, $from = null, $to = null, int $page = 1, int $perPage = 25, ?string $search = null, ?string $paymentStatus = null): array
    {
        [$fromDate, $toDate] = $this->validateDateRange($from, $to);
        $this->historicalCostCache = [];

        $query = Invoice::query()
            ->with(['customer', 'items.product'])
            ->whereBetween('invoice_date', [$fromDate, $toDate])
            ->whereNotIn('status', ['cancelled', 'draft'])
            ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->when($paymentStatus, fn ($q) => $q->where('status', $paymentStatus))
            ->when($search, function ($q) use ($search) {
                $q->where(function ($inner) use ($search) {
                    $inner->where('invoice_no', 'like', '%' . $search . '%')
                        ->orWhere('customer_name', 'like', '%' . $search . '%')
                        ->orWhereHas('customer', fn ($c) => $c->where('name', 'like', '%' . $search . '%'));
                });
            })
            ->orderByDesc('invoice_date')
            ->orderByDesc('id');

        $allInvoices = $query->get();
        $rows = [];
        $totalRevenue = 0.0;
        $totalCogs = 0.0;
        $totalGrossProfit = 0.0;
        $missingCostLines = 0;

        foreach ($allInvoices as $invoice) {
            $revenue = $this->calculateInvoiceRevenue($invoice);
            $cost = $this->calculateInvoiceCogs($invoice);
            $grossProfit = $revenue['net_sales'] - $cost['cogs'];
            $totalRevenue += $revenue['net_sales'];
            $totalCogs += $cost['cogs'];
            $totalGrossProfit += $grossProfit;
            $missingCostLines += $cost['missing_cost_lines'];

            $rows[] = [
                'invoice_id' => (int) $invoice->id,
                'invoice_no' => $invoice->invoice_no,
                'invoice_date' => $invoice->invoice_date?->format('Y-m-d'),
                'customer_id' => $invoice->customer_id,
                'customer_name' => $invoice->customer?->name ?? $invoice->customer_name ?? 'Walk-in Customer',
                'gross_sales' => $revenue['gross_sales'],
                'discount' => $revenue['discount'],
                'tax' => $revenue['tax'],
                'revenue' => $revenue['net_sales'],
                'cogs' => $cost['cogs'],
                'gross_profit' => $grossProfit,
                'profit_margin' => $revenue['net_sales'] > 0 ? (($grossProfit / $revenue['net_sales']) * 100) : 0.0,
                'status' => $invoice->status,
                'missing_cost_lines' => $cost['missing_cost_lines'],
            ];
        }

        $expense = $this->getOperatingExpenseSummary($companyId, $branchId, $fromDate, $toDate);
        $netProfit = $totalGrossProfit - $expense['total'];
        $total = count($rows);
        $paginated = array_slice($rows, ($page - 1) * $perPage, $perPage);

        return [
            'data' => $paginated,
            'summary' => [
                'total_invoices' => $total,
                'total_revenue' => round($totalRevenue, 2),
                'total_cogs' => round($totalCogs, 2),
                'total_gross_profit' => round($totalGrossProfit, 2),
                'gross_margin' => $totalRevenue > 0 ? (($totalGrossProfit / $totalRevenue) * 100) : 0.0,
                'total_expenses' => (float) $expense['total'],
                'net_profit' => round($netProfit, 2),
                'missing_cost_lines' => $missingCostLines,
            ],
            'meta' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => max(1, (int) ceil($total / $perPage)),
                'from' => $fromDate->format('Y-m-d'),
                'to' => $toDate->format('Y-m-d'),
            ],
        ];
    }
    public function getInvoiceProfitabilityDetail(?int $companyId = null, ?int $branchId = null, $invoiceId = null): array
    {
        $invoice = Invoice::query()
            ->with(['customer', 'items.product'])
            ->when($invoiceId, fn ($query) => $query->where(function ($inner) use ($invoiceId) {
                $inner->where('id', $invoiceId)->orWhere('invoice_no', $invoiceId);
            }))
            ->when($companyId, fn ($query) => $query->where('company_id', $companyId))
            ->when($branchId, fn ($query) => $query->where('branch_id', $branchId))
            ->firstOrFail();

        $revenue = $this->calculateInvoiceRevenue($invoice);
        $cost = $this->calculateInvoiceCogs($invoice);
        $grossProfit = $revenue['net_sales'] - $cost['cogs'];
        $items = [];

        foreach ($invoice->items as $item) {
            $qty = max(0, (float) ($item->quantity ?? 0));
            $base = max(0, (float) ($item->subtotal ?? ($qty * (float) ($item->unit_price ?? 0))));
            $discount = min($base, max(0, (float) ($item->discount_amount ?? 0)));
            $net = max(0, $base - $discount);
            $costInfo = $this->resolveHistoricalProductCostInfo(
                (int) ($item->product_id ?? 0),
                $invoice->invoice_date ? Carbon::parse($invoice->invoice_date)->toDateString() : null,
            );
            $itemCogs = $qty * $costInfo['unit_cost'];
            $itemProfit = $net - $itemCogs;

            $items[] = [
                'product_id' => (int) ($item->product_id ?? 0),
                'product_name' => $item->product?->name ?? 'Unknown Product',
                'sku' => $item->product?->sku ?? '-',
                'quantity' => $qty,
                'unit_price' => (float) ($item->unit_price ?? 0),
                'gross_sales' => $base,
                'discount' => $discount,
                'net_sales' => $net,
                'unit_cost' => $costInfo['unit_cost'],
                'cost_found' => $costInfo['found'],
                'cogs' => $itemCogs,
                'gross_profit' => $itemProfit,
                'margin_percent' => $net > 0 ? (($itemProfit / $net) * 100) : 0.0,
            ];
        }

        return [
            'invoice_id' => (int) $invoice->id,
            'invoice_no' => $invoice->invoice_no,
            'invoice_date' => $invoice->invoice_date?->format('Y-m-d'),
            'customer_id' => $invoice->customer_id,
            'customer_name' => $invoice->customer?->name ?? $invoice->customer_name ?? 'Walk-in Customer',
            'gross_sales' => $revenue['gross_sales'],
            'discount' => $revenue['discount'],
            'tax' => $revenue['tax'],
            'revenue' => $revenue['net_sales'],
            'cogs' => $cost['cogs'],
            'gross_profit' => $grossProfit,
            'profit_margin' => $revenue['net_sales'] > 0 ? (($grossProfit / $revenue['net_sales']) * 100) : 0.0,
            'status' => $invoice->status,
            'missing_cost_lines' => $cost['missing_cost_lines'],
            'items' => $items,
        ];
    }
    public function getProfitLossSummary(?int $companyId = null, ?int $branchId = null, $from = null, $to = null): array
    {
        [$fromDate, $toDate] = $this->validateDateRange($from, $to);
        $pnl = $this->calculatePnlBase($companyId, $branchId, $fromDate, $toDate);
        $expense = $this->getOperatingExpenseSummary($companyId, $branchId, $fromDate, $toDate);

        $grossProfit = $pnl['gross_profit'];
        $operatingProfit = $grossProfit - $expense['total'];
        $otherIncome = 0.0;
        $otherExpenses = 0.0;
        $netProfit = $operatingProfit + $otherIncome - $otherExpenses;

        return [
            'gross_revenue' => $pnl['gross_sales'],
            'net_revenue' => $pnl['net_sales'],
            'sales_returns' => $pnl['sales_returns'],
            'sales_discounts' => $pnl['sales_discounts'],
            'cogs' => $pnl['cogs'],
            'gross_profit' => $grossProfit,
            'gross_margin' => $pnl['net_sales'] > 0 ? (($grossProfit / $pnl['net_sales']) * 100) : 0.0,
            'operating_expenses' => (float) $expense['total'],
            'operating_profit' => $operatingProfit,
            'other_income' => $otherIncome,
            'other_expenses' => $otherExpenses,
            'net_profit' => $netProfit,
            'net_margin' => $pnl['net_sales'] > 0 ? (($netProfit / $pnl['net_sales']) * 100) : 0.0,
            'total_sales' => $pnl['net_sales'],
            'total_purchase_cost' => $pnl['cogs'],
            'invoice_count' => $pnl['invoice_count'],
            'sales_return_count' => $pnl['sales_return_count'],
            'missing_cost_lines' => $pnl['missing_cost_lines'],
            'expense_source' => $expense['source'],
            'cogs_method' => 'perpetual: sold quantity × latest known purchase price on/before sale date',
        ];
    }
    public function getProfitLossProducts(?int $companyId = null, ?int $branchId = null, $from = null, $to = null, int $page = 1, int $perPage = 25): array
    {
        return $this->getProductProfitability($companyId, $branchId, $from, $to, $page, $perPage);
    }

    public function getProfitLossCustomers(?int $companyId = null, ?int $branchId = null, $from = null, $to = null, int $page = 1, int $perPage = 25, ?string $search = null): array
    {
        [$fromDate, $toDate] = $this->validateDateRange($from, $to);
        $this->historicalCostCache = [];
        $invoices = $this->baseInvoiceQuery($companyId, $branchId)->whereBetween('invoice_date', [$fromDate, $toDate])->get();
        $grouped = [];
        foreach ($invoices as $invoice) {
            if (($invoice->status ?? null) === 'draft') continue;
            $key = ($invoice->customer_id ?? 0) . '|' . ($invoice->customer?->name ?? $invoice->customer_name ?? 'Walk-in Customer');
            $revenue = $this->calculateInvoiceRevenue($invoice);
            $cost = $this->calculateInvoiceCogs($invoice);
            if (!isset($grouped[$key])) {
                $grouped[$key] = ['customer' => $invoice->customer?->name ?? $invoice->customer_name ?? 'Walk-in Customer', 'invoice_count' => 0, 'gross_sales' => 0.0, 'net_revenue' => 0.0, 'cogs' => 0.0, 'gross_profit' => 0.0, 'missing_cost_lines' => 0];
            }
            $grouped[$key]['invoice_count']++;
            $grouped[$key]['gross_sales'] += $revenue['gross_sales'];
            $grouped[$key]['net_revenue'] += $revenue['net_sales'];
            $grouped[$key]['cogs'] += $cost['cogs'];
            $grouped[$key]['gross_profit'] += $revenue['net_sales'] - $cost['cogs'];
            $grouped[$key]['missing_cost_lines'] += $cost['missing_cost_lines'];
        }
        $rows = array_values($grouped);
        if ($search) {
            $needle = mb_strtolower($search);
            $rows = array_values(array_filter($rows, fn ($r) => str_contains(mb_strtolower((string) ($r['customer'] ?? '')), $needle)));
        }
        foreach ($rows as &$row) {
            $row['gross_profit'] = round($row['gross_profit'], 2);
            $row['margin_percent'] = $row['net_revenue'] > 0 ? (($row['gross_profit'] / $row['net_revenue']) * 100) : 0.0;
        }
        unset($row);
        usort($rows, fn ($a, $b) => $b['gross_profit'] <=> $a['gross_profit']);
        $total = count($rows);
        return ['data' => array_slice($rows, ($page - 1) * $perPage, $perPage), 'meta' => ['current_page' => $page, 'per_page' => $perPage, 'total' => $total, 'last_page' => max(1, (int) ceil($total / $perPage)), 'from' => $fromDate->format('Y-m-d'), 'to' => $toDate->format('Y-m-d')]];
    }
    public function getProfitLossBranches(?int $companyId = null, ?int $branchId = null, $from = null, $to = null, int $page = 1, int $perPage = 25, ?string $search = null): array
    {
        [$fromDate, $toDate] = $this->validateDateRange($from, $to);
        $this->historicalCostCache = [];
        $invoices = $this->baseInvoiceQuery($companyId, $branchId)->whereBetween('invoice_date', [$fromDate, $toDate])->get();
        $grouped = [];
        foreach ($invoices as $invoice) {
            if (($invoice->status ?? null) === 'draft') continue;
            $key = ($invoice->branch_id ?? 0) . '|' . ($invoice->branch?->name ?? 'Main Branch');
            $revenue = $this->calculateInvoiceRevenue($invoice);
            $cost = $this->calculateInvoiceCogs($invoice);
            if (!isset($grouped[$key])) $grouped[$key] = ['branch' => $invoice->branch?->name ?? 'Main Branch', 'gross_sales' => 0.0, 'net_revenue' => 0.0, 'cogs' => 0.0, 'gross_profit' => 0.0, 'missing_cost_lines' => 0];
            $grouped[$key]['gross_sales'] += $revenue['gross_sales'];
            $grouped[$key]['net_revenue'] += $revenue['net_sales'];
            $grouped[$key]['cogs'] += $cost['cogs'];
            $grouped[$key]['gross_profit'] += $revenue['net_sales'] - $cost['cogs'];
            $grouped[$key]['missing_cost_lines'] += $cost['missing_cost_lines'];
        }
        $rows = array_values($grouped);
        if ($search) {
            $needle = mb_strtolower($search);
            $rows = array_values(array_filter($rows, fn ($r) => str_contains(mb_strtolower((string) ($r['branch'] ?? '')), $needle)));
        }
        foreach ($rows as &$row) $row['margin_percent'] = $row['net_revenue'] > 0 ? (($row['gross_profit'] / $row['net_revenue']) * 100) : 0.0;
        unset($row);
        usort($rows, fn ($a, $b) => $b['gross_profit'] <=> $a['gross_profit']);
        $total = count($rows);
        return ['data' => array_slice($rows, ($page - 1) * $perPage, $perPage), 'meta' => ['current_page' => $page, 'per_page' => $perPage, 'total' => $total, 'last_page' => max(1, (int) ceil($total / $perPage)), 'from' => $fromDate->format('Y-m-d'), 'to' => $toDate->format('Y-m-d')]];
    }
    public function getProfitLossMonthly(?int $companyId = null, ?int $branchId = null, $from = null, $to = null): array
    {
        [$fromDate, $toDate] = $this->validateDateRange($from, $to);
        $this->historicalCostCache = [];
        $invoices = $this->baseInvoiceQuery($companyId, $branchId)->whereBetween('invoice_date', [$fromDate, $toDate])->get();
        $grouped = [];
        foreach ($invoices as $invoice) {
            if (($invoice->status ?? null) === 'draft') continue;
            $month = Carbon::parse($invoice->invoice_date)->format('Y-m');
            $revenue = $this->calculateInvoiceRevenue($invoice);
            $cost = $this->calculateInvoiceCogs($invoice);
            if (!isset($grouped[$month])) $grouped[$month] = ['month' => $month, 'revenue' => 0.0, 'cogs' => 0.0, 'gross_profit' => 0.0, 'margin_percent' => 0.0];
            $grouped[$month]['revenue'] += $revenue['net_sales'];
            $grouped[$month]['cogs'] += $cost['cogs'];
            $grouped[$month]['gross_profit'] += $revenue['net_sales'] - $cost['cogs'];
        }
        $rows = array_values($grouped);
        foreach ($rows as &$row) $row['margin_percent'] = $row['revenue'] > 0 ? (($row['gross_profit'] / $row['revenue']) * 100) : 0.0;
        unset($row);
        usort($rows, fn ($a, $b) => $a['month'] <=> $b['month']);
        return ['data' => $rows, 'meta' => ['from' => $fromDate->format('Y-m-d'), 'to' => $toDate->format('Y-m-d')]];
    }
    public function getProfitLossYearly(?int $companyId = null, ?int $branchId = null, $from = null, $to = null): array
    {
        [$fromDate, $toDate] = $this->validateDateRange($from, $to);
        $this->historicalCostCache = [];
        $invoices = $this->baseInvoiceQuery($companyId, $branchId)->whereBetween('invoice_date', [$fromDate, $toDate])->get();
        $grouped = [];
        foreach ($invoices as $invoice) {
            if (($invoice->status ?? null) === 'draft') continue;
            $year = Carbon::parse($invoice->invoice_date)->format('Y');
            $revenue = $this->calculateInvoiceRevenue($invoice);
            $cost = $this->calculateInvoiceCogs($invoice);
            if (!isset($grouped[$year])) $grouped[$year] = ['year' => $year, 'revenue' => 0.0, 'cogs' => 0.0, 'gross_profit' => 0.0, 'margin_percent' => 0.0];
            $grouped[$year]['revenue'] += $revenue['net_sales'];
            $grouped[$year]['cogs'] += $cost['cogs'];
            $grouped[$year]['gross_profit'] += $revenue['net_sales'] - $cost['cogs'];
        }
        $rows = array_values($grouped);
        foreach ($rows as &$row) $row['margin_percent'] = $row['revenue'] > 0 ? (($row['gross_profit'] / $row['revenue']) * 100) : 0.0;
        unset($row);
        usort($rows, fn ($a, $b) => $a['year'] <=> $b['year']);
        return ['data' => $rows, 'meta' => ['from' => $fromDate->format('Y-m-d'), 'to' => $toDate->format('Y-m-d')]];
    }
    public function getProfitLossComparison(?int $companyId = null, ?int $branchId = null, $from = null, $to = null): array
    {
        [$fromDate, $toDate] = $this->validateDateRange($from, $to);
        $days = max(1, $fromDate->diffInDays($toDate) + 1);
        $previousFrom = $fromDate->copy()->subDays($days);
        $previousTo = $toDate->copy()->subDays($days);

        $current = $this->getProfitLossSummary($companyId, $branchId, $fromDate->format('Y-m-d'), $toDate->format('Y-m-d'));
        $previous = $this->getProfitLossSummary($companyId, $branchId, $previousFrom->format('Y-m-d'), $previousTo->format('Y-m-d'));

        $currentData = $current;
        $previousData = $previous;
        $comparison = [];

        foreach (['gross_revenue', 'net_revenue', 'cogs', 'gross_profit', 'net_profit'] as $metric) {
            $currentValue = (float) ($currentData[$metric] ?? 0);
            $previousValue = (float) ($previousData[$metric] ?? 0);
            $change = $previousValue != 0 ? ((($currentValue - $previousValue) / abs($previousValue)) * 100) : 0;

            $comparison[] = [
                'metric' => $metric,
                'current' => $currentValue,
                'previous' => $previousValue,
                'change_percent' => (float) $change,
            ];
        }

        return [
            'success' => true,
            'data' => $comparison,
            'meta' => [
                'from' => $fromDate->format('Y-m-d'),
                'to' => $toDate->format('Y-m-d'),
                'previous_from' => $previousFrom->format('Y-m-d'),
                'previous_to' => $previousTo->format('Y-m-d'),
            ],
        ];
    }

    /**
     * DETAILED PROFIT & LOSS STATEMENT
     * Proper P&L accounting, not just Sales - Purchases
     */
    public function getDetailedProfitLoss(?int $companyId = null, ?int $branchId = null, $from = null, $to = null): array
    {
        [$fromDate, $toDate] = $this->validateDateRange($from, $to);
        $pnl = $this->calculatePnlBase($companyId, $branchId, $fromDate, $toDate);
        $expense = $this->getOperatingExpenseSummary($companyId, $branchId, $fromDate, $toDate);

        // Purchases are disclosed as a management reference only; they are NOT
        // subtracted directly from profit. COGS comes from goods actually sold.
        $purchaseQuery = $this->basePurchaseQuery($companyId, $branchId)
            ->whereBetween('purchase_date', [$fromDate, $toDate]);
        $purchaseData = $purchaseQuery->selectRaw('
            COALESCE(SUM(subtotal), 0) as subtotal,
            COALESCE(SUM(order_discount), 0) as discount,
            COALESCE(SUM(tax_amount), 0) as tax,
            COALESCE(SUM(grand_total), 0) as grand_total
        ')->first();

        $purchasesGrossTaxable = (float) ($purchaseData->subtotal ?? 0);
        $purchaseDiscounts = min($purchasesGrossTaxable, max(0, (float) ($purchaseData->discount ?? 0)));
        $netPurchases = max(0, $purchasesGrossTaxable - $purchaseDiscounts);

        $grossProfit = $pnl['gross_profit'];
        $operatingProfit = $grossProfit - $expense['total'];
        $otherIncome = 0.0;
        $otherExpenses = 0.0;
        $netProfit = $operatingProfit + $otherIncome - $otherExpenses;

        return [
            'revenue' => [
                'gross_sales' => $pnl['gross_sales'],
                'sales_returns' => $pnl['sales_returns'],
                'sales_discounts' => $pnl['sales_discounts'],
                'net_sales' => $pnl['net_sales'],
                'gst_excluded' => true,
            ],
            'cogs' => [
                'opening_stock' => null,
                'purchases' => $netPurchases,
                'purchase_returns' => 0.0,
                'purchase_discounts' => $purchaseDiscounts,
                'direct_costs' => 0.0,
                'closing_stock' => null,
                'cost_of_goods_sold' => $pnl['cogs'],
                'method' => 'perpetual_historical_purchase_cost',
                'opening_closing_stock_available' => false,
            ],
            'gross_profit' => $grossProfit,
            'gross_margin' => $pnl['net_sales'] > 0 ? (($grossProfit / $pnl['net_sales']) * 100) : 0.0,
            'operating_expenses' => $expense['rows'],
            'total_operating_expenses' => (float) $expense['total'],
            'operating_profit' => $operatingProfit,
            'other_income' => $otherIncome,
            'other_expenses' => $otherExpenses,
            'net_profit' => $netProfit,
            'net_margin' => $pnl['net_sales'] > 0 ? (($netProfit / $pnl['net_sales']) * 100) : 0.0,
            'management_reference' => [
                'purchase_taxable' => $purchasesGrossTaxable,
                'purchase_net_taxable' => $netPurchases,
                'purchase_gst' => (float) ($purchaseData->tax ?? 0),
                'purchase_grand_total' => (float) ($purchaseData->grand_total ?? 0),
            ],
            'data_quality' => [
                'missing_cost_lines' => $pnl['missing_cost_lines'],
                'expense_source' => $expense['source'],
                'note' => $expense['source'] === 'not_available'
                    ? 'No expenses table with a recognized schema was available, so operating expenses are not assumed.'
                    : 'Operating expenses are read from the actual expenses table only.',
            ],
        ];
    }
    public function getSalesByUser(?int $companyId = null, ?int $branchId = null, $from = null, $to = null, int $page = 1, int $perPage = 25, ?string $search = null): array
    {
        [$fromDate, $toDate] = $this->validateDateRange($from, $to);
        $column = Schema::hasColumn('invoices', 'created_by') ? 'created_by' : (Schema::hasColumn('invoices', 'user_id') ? 'user_id' : null);
        $invoices = $this->baseInvoiceQuery($companyId, $branchId)->whereBetween('invoice_date', [$fromDate, $toDate])->get();
        $grouped=[];
        foreach ($invoices as $invoice) {
            if (($invoice->status ?? null)==='draft') continue;
            $userId=$column ? (int) ($invoice->{$column} ?? 0) : 0;
            $name=$userId>0 ? 'User #'.$userId : 'Unassigned';
            $revenue=$this->calculateInvoiceRevenue($invoice);
            $key=$userId.'|'.$name;
            if(!isset($grouped[$key])) $grouped[$key]=['user_id'=>$userId,'user_name'=>$name,'invoice_count'=>0,'net_sales'=>0.0];
            $grouped[$key]['invoice_count']++; $grouped[$key]['net_sales'] += $revenue['net_sales'];
        }
        $rows=array_values($grouped); usort($rows,fn($a,$b)=>$b['net_sales']<=>$a['net_sales']);
        if($search){$needle=mb_strtolower($search);$rows=array_values(array_filter($rows,fn($r)=>str_contains(mb_strtolower($r['user_name']),$needle)||str_contains((string)$r['user_id'],$needle)));}
        $total=count($rows);
        return ['data'=>array_slice($rows,($page-1)*$perPage,$perPage),'meta'=>['current_page'=>$page,'per_page'=>$perPage,'total'=>$total,'last_page'=>max(1,(int)ceil($total/$perPage)),'from'=>$fromDate->format('Y-m-d'),'to'=>$toDate->format('Y-m-d')]];
    }

    public function getPaymentModeSummary(?int $companyId = null, ?int $branchId = null, $from = null, $to = null): array
    {
        [$fromDate,$toDate]=$this->validateDateRange($from,$to);
        $query=Payment::query()->whereBetween('transaction_date',[$fromDate,$toDate])->whereIn('status',['completed','paid','success'])
            ->when($companyId,fn($q)=>$q->where('company_id',$companyId))->when($branchId,fn($q)=>$q->where('branch_id',$branchId));
        $rows=$query->select('payment_method',DB::raw('SUM(amount) as amount'),DB::raw('COUNT(*) as count'))->groupBy('payment_method')->orderByDesc('amount')->get()->map(fn($r)=>['payment_method'=>$r->payment_method ?: 'Unknown','amount'=>(float)$r->amount,'count'=>(int)$r->count])->values()->toArray();
        return ['data'=>$rows,'meta'=>['from'=>$fromDate->format('Y-m-d'),'to'=>$toDate->format('Y-m-d')]];
    }

    public function getTopProducts(?int $companyId = null, ?int $branchId = null, $from = null, $to = null, int $limit = 10): array
    {
        $result=$this->getProductProfitability($companyId,$branchId,$from,$to,1,max(1,$limit));
        return $result['data'];
    }

    public function getTopCustomers(?int $companyId = null, ?int $branchId = null, $from = null, $to = null, int $limit = 10): array
    {
        $result=$this->getProfitLossCustomers($companyId,$branchId,$from,$to,1,max(1,$limit));
        return $result['data'];
    }

    public function getSalesPurchaseTrend(?int $companyId = null, ?int $branchId = null, $from = null, $to = null): array
    {
        [$fromDate,$toDate]=$this->validateDateRange($from,$to);
        $sales=$this->getProfitLossMonthly($companyId,$branchId,$fromDate->format('Y-m-d'),$toDate->format('Y-m-d'))['data'] ?? [];
        $purchases=$this->basePurchaseQuery($companyId,$branchId)->whereBetween('purchase_date',[$fromDate,$toDate])->get()->groupBy(fn($p)=>Carbon::parse($p->purchase_date)->format('Y-m'))->map(fn($rows)=>$rows->sum('grand_total'));
        $months=[];
        foreach($sales as $row){$months[$row['month']]=['month'=>$row['month'],'sales'=>(float)$row['revenue'],'purchases'=>(float)($purchases[$row['month']]??0)];}
        foreach($purchases as $month=>$amount){if(!isset($months[$month]))$months[$month]=['month'=>$month,'sales'=>0.0,'purchases'=>(float)$amount];else $months[$month]['purchases']=(float)$amount;}
        ksort($months); return array_values($months);
    }

    public function getVendorLedger(?int $companyId = null, ?int $branchId = null, $vendorId = null, $from = null, $to = null, int $page = 1, int $perPage = 100): array
    {
        [$fromDate,$toDate]=$this->validateDateRange($from,$to);
        $rows=[];
        $purchases=$this->basePurchaseQuery($companyId,$branchId)->whereBetween('purchase_date',[$fromDate,$toDate])->when($vendorId,fn($q)=>$q->where('supplier_id',$vendorId))->get();
        foreach($purchases as $p){$rows[]=['date'=>$this->formatLedgerDate($p->purchase_date),'type'=>'PURCHASE','reference'=>$p->purchase_number,'debit'=>(float)$p->grand_total,'credit'=>0.0,'balance'=>0.0,'vendor'=>$p->supplier?->name];}
        $payments=Payment::query()->whereBetween('transaction_date',[$fromDate,$toDate])->where('payment_direction','outward')->whereIn('status',['completed','paid','success'])->when($companyId,fn($q)=>$q->where('company_id',$companyId))->when($branchId,fn($q)=>$q->where('branch_id',$branchId))->get();
        foreach($payments as $p){$rows[]=['date'=>$this->formatLedgerDate($p->transaction_date),'type'=>'PAYMENT','reference'=>$p->reference_no,'debit'=>0.0,'credit'=>(float)$p->amount,'balance'=>0.0,'vendor'=>null];}
        usort($rows,fn($a,$b)=>strcmp((string)$a['date'],(string)$b['date'])); $balance=0.0; foreach($rows as &$r){$balance += $r['debit']-$r['credit'];$r['balance']=$balance;} unset($r);
        $total=count($rows); return ['data'=>array_slice($rows,($page-1)*$perPage,$perPage),'meta'=>['current_page'=>$page,'per_page'=>$perPage,'total'=>$total,'last_page'=>max(1,(int)ceil($total/$perPage))]];
    }

    public function getDayBook(?int $companyId = null, ?int $branchId = null, $from = null, $to = null, int $page = 1, int $perPage = 100, ?string $search = null): array
    {
        [$fromDate,$toDate]=$this->validateDateRange($from,$to); $rows=[];
        foreach($this->baseInvoiceQuery($companyId,$branchId)->whereBetween('invoice_date',[$fromDate,$toDate])->get() as $i){if(($i->status??null)==='draft')continue;$rows[]=['date'=>$i->invoice_date?->format('Y-m-d'),'type'=>'SALE','reference'=>$i->invoice_no,'party'=>$i->customer?->name ?? $i->customer_name ?? 'Walk-in','debit'=>0.0,'credit'=>(float)$i->total_amount];}
        foreach($this->basePurchaseQuery($companyId,$branchId)->whereBetween('purchase_date',[$fromDate,$toDate])->get() as $p){$rows[]=['date'=>$p->purchase_date?->format('Y-m-d'),'type'=>'PURCHASE','reference'=>$p->purchase_number,'party'=>$p->supplier?->name ?? '-','debit'=>(float)$p->grand_total,'credit'=>0.0];}
        foreach(Payment::query()->whereBetween('transaction_date',[$fromDate,$toDate])->whereIn('status',['completed','paid','success'])->when($companyId,fn($q)=>$q->where('company_id',$companyId))->when($branchId,fn($q)=>$q->where('branch_id',$branchId))->get() as $p){$rows[]=['date'=>Carbon::parse($p->transaction_date)->format('Y-m-d'),'type'=>strtolower((string)$p->payment_direction)==='outward'?'PAYMENT OUT':'PAYMENT IN','reference'=>$p->reference_no,'party'=>'-','debit'=>strtolower((string)$p->payment_direction)==='outward'?(float)$p->amount:0.0,'credit'=>strtolower((string)$p->payment_direction)==='outward'?0.0:(float)$p->amount];}
        if($search){$needle=mb_strtolower($search);$rows=array_values(array_filter($rows,fn($r)=>str_contains(mb_strtolower(json_encode($r)), $needle)));}
        usort($rows,fn($a,$b)=>strcmp((string)$b['date'],(string)$a['date']));$total=count($rows);return ['data'=>array_slice($rows,($page-1)*$perPage,$perPage),'meta'=>['current_page'=>$page,'per_page'=>$perPage,'total'=>$total,'last_page'=>max(1,(int)ceil($total/$perPage))]];
    }

    public function getExpenseReport(?int $companyId = null, ?int $branchId = null, $from = null, $to = null, int $page = 1, int $perPage = 25, ?string $search = null): array
    {
        [$fromDate,$toDate]=$this->validateDateRange($from,$to); $expense=$this->getOperatingExpenseSummary($companyId,$branchId,$fromDate,$toDate); $rows=$expense['rows'];
        if($search){$needle=mb_strtolower($search);$rows=array_values(array_filter($rows,fn($r)=>str_contains(mb_strtolower((string)$r['name']),$needle)));}
        $total=count($rows);return ['data'=>array_slice($rows,($page-1)*$perPage,$perPage),'summary'=>['total_expenses'=>$expense['total']],'meta'=>['current_page'=>$page,'per_page'=>$perPage,'total'=>$total,'last_page'=>max(1,(int)ceil($total/$perPage)),'from'=>$fromDate->format('Y-m-d'),'to'=>$toDate->format('Y-m-d')]];
    }

    public function getReceivablesAging(?int $companyId = null, ?int $branchId = null, $to = null, int $page = 1, int $perPage = 25): array
    {
        $asOf=Carbon::parse($to ?: now()->toDateString())->endOfDay(); $rows=[];
        foreach($this->baseInvoiceQuery($companyId,$branchId)->whereNotIn('status',['paid','cancelled','draft'])->whereRaw('COALESCE(total_amount,0) > COALESCE(payment_received,paid_amount,0)')->get() as $i){$due= $i->due_date ? Carbon::parse($i->due_date) : Carbon::parse($i->invoice_date);$days=max(0,$due->diffInDays($asOf,false)<0?$asOf->diffInDays($due):0);$amount=max(0,(float)$i->total_amount-(float)($i->payment_received??$i->paid_amount??0));$bucket=$days<=30?'0-30':($days<=60?'31-60':($days<=90?'61-90':'90+'));$rows[]=['customer'=>$i->customer?->name??$i->customer_name??'Walk-in','invoice'=>$i->invoice_no,'due_date'=>$i->due_date,'outstanding_amount'=>$amount,'overdue_days'=>$days,'aging_bucket'=>$bucket];}
        $total=count($rows);return ['data'=>array_slice($rows,($page-1)*$perPage,$perPage),'meta'=>['current_page'=>$page,'per_page'=>$perPage,'total'=>$total,'last_page'=>max(1,(int)ceil($total/$perPage))]];
    }

    public function getPayablesAging(?int $companyId = null, ?int $branchId = null, $to = null, int $page = 1, int $perPage = 25): array
    {
        $asOf=Carbon::parse($to ?: now()->toDateString())->endOfDay();$rows=[];
        foreach($this->basePurchaseQuery($companyId,$branchId)->whereNotIn('status',['paid','cancelled','draft'])->get() as $p){$paid=(float)($p->paid_amount??0);$amount=max(0,(float)$p->grand_total-$paid);if($amount<=0)continue;$due=$p->due_date?Carbon::parse($p->due_date):Carbon::parse($p->purchase_date);$days=max(0,$due->diffInDays($asOf,false)<0?$asOf->diffInDays($due):0);$bucket=$days<=30?'0-30':($days<=60?'31-60':($days<=90?'61-90':'90+'));$rows[]=['supplier'=>$p->supplier?->name,'purchase_number'=>$p->purchase_number,'due_date'=>$p->due_date,'outstanding_amount'=>$amount,'overdue_days'=>$days,'aging_bucket'=>$bucket];}
        $total=count($rows);return ['data'=>array_slice($rows,($page-1)*$perPage,$perPage),'meta'=>['current_page'=>$page,'per_page'=>$perPage,'total'=>$total,'last_page'=>max(1,(int)ceil($total/$perPage))]];
    }

    public function getGstRateWiseSummary(?int $companyId = null, ?int $branchId = null, $from = null, $to = null): array
    {
        [$fromDate,$toDate]=$this->validateDateRange($from,$to);$items=InvoiceItem::with('invoice')->whereHas('invoice',fn($q)=>$q->where('status','!=','cancelled')->whereBetween('invoice_date',[$fromDate,$toDate])->when($companyId,fn($x)=>$x->where('company_id',$companyId))->when($branchId,fn($x)=>$x->where('branch_id',$branchId)))->get();$grouped=[];
        foreach($items as $i){$rate=(float)($i->tax_rate??$i->gst_slab??0);$key=(string)$rate;if(!isset($grouped[$key]))$grouped[$key]=['rate'=>$rate,'taxable_value'=>0.0,'cgst'=>0.0,'sgst'=>0.0,'igst'=>0.0,'total_tax'=>0.0];$tax= (float)$i->cgst_amount+(float)$i->sgst_amount+(float)$i->igst_amount;$grouped[$key]['taxable_value']+=(float)$i->subtotal-(float)$i->discount_amount;$grouped[$key]['cgst']+=(float)$i->cgst_amount;$grouped[$key]['sgst']+=(float)$i->sgst_amount;$grouped[$key]['igst']+=(float)$i->igst_amount;$grouped[$key]['total_tax']+=$tax;}
        return ['data'=>array_values($grouped),'meta'=>['from'=>$fromDate->format('Y-m-d'),'to'=>$toDate->format('Y-m-d')]];
    }

    public function getStockSummary(?int $companyId = null, ?int $branchId = null, int $page = 1, int $perPage = 25, ?string $search = null): array
    {
        $query=Product::query()->when($companyId,fn($q)=>$q->where('company_id',$companyId))->when($branchId && Schema::hasColumn('products','branch_id'),fn($q)=>$q->where('branch_id',$branchId));
        if($search){$query->where(function($q)use($search){$q->where('name','like','%'.$search.'%')->orWhere('sku','like','%'.$search.'%')->orWhere('barcode','like','%'.$search.'%');});}
        $total=(clone $query)->count();$products=$query->orderBy('name')->skip(($page-1)*$perPage)->take($perPage)->get();$data=$products->map(fn($p)=>['product_id'=>(int)$p->id,'product'=>$p->name,'sku'=>$p->sku,'stock_quantity'=>(float)($p->stock_quantity??0),'purchase_price'=>(float)($p->purchase_price??0),'stock_value'=>(float)($p->stock_quantity??0)*(float)($p->purchase_price??0),'reorder_level'=>(float)($p->reorder_level??0)])->toArray();return ['data'=>$data,'meta'=>['current_page'=>$page,'per_page'=>$perPage,'total'=>$total,'last_page'=>max(1,(int)ceil($total/$perPage))]];
    }

    public function getLowStockReport(?int $companyId = null, ?int $branchId = null, int $page = 1, int $perPage = 25, ?string $search = null): array
    {
        $r=$this->getStockSummary($companyId,$branchId,1,100000,$search);$rows=array_values(array_filter($r['data'],fn($x)=>$x['stock_quantity']<=$x['reorder_level']));$total=count($rows);return ['data'=>array_slice($rows,($page-1)*$perPage,$perPage),'meta'=>['current_page'=>$page,'per_page'=>$perPage,'total'=>$total,'last_page'=>max(1,(int)ceil($total/$perPage))]];
    }

    public function getStockMovement(?int $companyId = null, ?int $branchId = null, $productId = null, $from = null, $to = null, int $page = 1, int $perPage = 25): array
    {
        if(!Schema::hasTable('stock_movements')) return ['data'=>[],'meta'=>['current_page'=>$page,'per_page'=>$perPage,'total'=>0,'last_page'=>1,'message'=>'stock_movements table is not available.']];
        [$fromDate,$toDate]=$this->validateDateRange($from,$to);$columns=Schema::getColumnListing('stock_movements');$query=DB::table('stock_movements')->whereBetween($columns&&in_array('transaction_date',$columns,true)?'transaction_date':(in_array('created_at',$columns,true)?'created_at':'transaction_date'),[$fromDate,$toDate]);if($companyId&&in_array('company_id',$columns,true))$query->where('company_id',$companyId);if($branchId&&in_array('branch_id',$columns,true))$query->where('branch_id',$branchId);if($productId&&in_array('product_id',$columns,true))$query->where('product_id',$productId);$total=(clone $query)->count();$rows=$query->orderByDesc(in_array('transaction_date',$columns,true)?'transaction_date':'created_at')->skip(($page-1)*$perPage)->take($perPage)->get();return ['data'=>$rows->map(fn($r)=>(array)$r)->toArray(),'meta'=>['current_page'=>$page,'per_page'=>$perPage,'total'=>$total,'last_page'=>max(1,(int)ceil($total/$perPage))]];
    }

    public function getCashFlowSummary(?int $companyId = null, ?int $branchId = null, $from = null, $to = null): array
    {
        [$fromDate,$toDate]=$this->validateDateRange($from,$to);$query=Payment::query()->whereBetween('transaction_date',[$fromDate,$toDate])->whereIn('status',['completed','paid','success'])->when($companyId,fn($q)=>$q->where('company_id',$companyId))->when($branchId,fn($q)=>$q->where('branch_id',$branchId));$in=(float)(clone $query)->where('payment_direction','inward')->sum('amount');$out=(float)(clone $query)->where('payment_direction','outward')->sum('amount');return ['data'=>['cash_inflow'=>$in,'cash_outflow'=>$out,'net_cash_flow'=>$in-$out],'meta'=>['from'=>$fromDate->format('Y-m-d'),'to'=>$toDate->format('Y-m-d')]];
    }

    public function getTrialBalance(?int $companyId = null, ?int $branchId = null, $from = null, $to = null): array
    {
        return ['data'=>[],'meta'=>['from'=>$from,'to'=>$to,'available'=>false,'message'=>'Trial balance requires configured double-entry accounting ledgers; report data has not been inferred or fabricated.']];
    }

    public function getBalanceSheet(?int $companyId = null, ?int $branchId = null, $from = null, $to = null): array
    {
        [$fromDate,$toDate]=$this->validateDateRange($from,$to);$receivables=(float)$this->baseInvoiceQuery($companyId,$branchId)->whereNotIn('status',['paid','cancelled','draft'])->sum(DB::raw('GREATEST(COALESCE(total_amount,0)-COALESCE(payment_received,paid_amount,0),0)'));$payables=(float)$this->basePurchaseQuery($companyId,$branchId)->whereNotIn('status',['paid','cancelled','draft'])->sum(DB::raw('GREATEST(COALESCE(grand_total,0)-COALESCE(paid_amount,0),0)'));$inventory=(float)Product::query()->when($companyId,fn($q)=>$q->where('company_id',$companyId))->sum(DB::raw('COALESCE(stock_quantity,0)*COALESCE(purchase_price,0)'));return ['data'=>['assets'=>['accounts_receivable'=>$receivables,'inventory'=>$inventory],'liabilities'=>['accounts_payable'=>$payables],'equity'=>[]],'meta'=>['from'=>$fromDate->format('Y-m-d'),'to'=>$toDate->format('Y-m-d'),'partial'=>true,'message'=>'Only directly available balances are shown; opening equity, fixed assets and other ledger balances require accounting masters.']];
    }

    public function getBranchPerformance(?int $companyId = null, $from = null, $to = null): array
    {
        $r=$this->getProfitLossBranches($companyId,null,$from,$to,1,100000);return $r['data'];
    }

    /**
     * GST SUMMARY (GSTR-3B prep)
     */
    /**
     * GST SUMMARY (GSTR-3B prep)
     *
     * GST is reported from the actual invoice/purchase item tax fields.
     * Missing optional tax columns are treated as zero rather than causing a
     * 500 error on older databases.
     */
    public function getGstSummary(?int $companyId = null, ?int $branchId = null, $from = null, $to = null): array
    {
        [$fromDate, $toDate] = $this->validateDateRange($from, $to);

        $invoiceItems = collect();
        if (Schema::hasTable('invoice_items') && Schema::hasTable('invoices')) {
            $invoiceItems = InvoiceItem::query()
                ->whereHas('invoice', function ($q) use ($companyId, $branchId, $fromDate, $toDate) {
                    $q->where('status', '!=', 'cancelled')
                        ->whereBetween('invoice_date', [$fromDate, $toDate]);
                    if ($companyId) $q->where('company_id', $companyId);
                    if ($branchId) $q->where('branch_id', $branchId);
                })
                ->get();
        }

        $outwardTaxableValue = 0.0;
        $outwardCgst = 0.0;
        $outwardSgst = 0.0;
        $outwardIgst = 0.0;
        foreach ($invoiceItems as $item) {
            $outwardTaxableValue += max(0.0, (float) ($item->subtotal ?? 0) - (float) ($item->discount_amount ?? 0));
            $outwardCgst += (float) ($item->cgst_amount ?? 0);
            $outwardSgst += (float) ($item->sgst_amount ?? 0);
            $outwardIgst += (float) ($item->igst_amount ?? 0);
        }

        $purchaseItems = collect();
        if (Schema::hasTable('purchase_invoice_items') && Schema::hasTable('purchase_invoices')) {
            $purchaseItems = PurchaseInvoiceItem::query()
                ->whereHas('purchaseInvoice', function ($q) use ($companyId, $branchId, $fromDate, $toDate) {
                    $q->where('status', '!=', 'cancelled')
                        ->whereBetween('purchase_date', [$fromDate, $toDate]);
                    if ($companyId) $q->where('company_id', $companyId);
                    if ($branchId) $q->where('branch_id', $branchId);
                })
                ->get();
        }

        $inwardTaxableValue = 0.0;
        $inwardCgst = 0.0;
        $inwardSgst = 0.0;
        $inwardIgst = 0.0;
        foreach ($purchaseItems as $item) {
            $inwardTaxableValue += max(0.0, (float) ($item->subtotal ?? 0) - (float) ($item->discount_amount ?? 0));
            $inwardCgst += (float) ($item->cgst_amount ?? 0);
            $inwardSgst += (float) ($item->sgst_amount ?? 0);
            $inwardIgst += (float) ($item->igst_amount ?? 0);
        }

        $netCgst = $outwardCgst - $inwardCgst;
        $netSgst = $outwardSgst - $inwardSgst;
        $netIgst = $outwardIgst - $inwardIgst;
        $netTaxLiability = $netCgst + $netSgst + $netIgst;

        return [
            'outward' => [
                'taxable_value' => round($outwardTaxableValue, 2),
                'cgst' => round($outwardCgst, 2),
                'sgst' => round($outwardSgst, 2),
                'igst' => round($outwardIgst, 2),
                'total_tax' => round($outwardCgst + $outwardSgst + $outwardIgst, 2),
            ],
            'inward' => [
                'taxable_value' => round($inwardTaxableValue, 2),
                'cgst' => round($inwardCgst, 2),
                'sgst' => round($inwardSgst, 2),
                'igst' => round($inwardIgst, 2),
                'total_tax' => round($inwardCgst + $inwardSgst + $inwardIgst, 2),
            ],
            'input_tax_credit' => [
                'cgst_itc' => round($inwardCgst, 2),
                'sgst_itc' => round($inwardSgst, 2),
                'igst_itc' => round($inwardIgst, 2),
                'total_itc' => round($inwardCgst + $inwardSgst + $inwardIgst, 2),
            ],
            'net_liability' => [
                'cgst' => round($netCgst, 2),
                'sgst' => round($netSgst, 2),
                'igst' => round($netIgst, 2),
                'total' => round($netTaxLiability, 2),
            ],
            'meta' => [
                'from' => $fromDate->format('Y-m-d'),
                'to' => $toDate->format('Y-m-d'),
            ],
        ];
    }

}
