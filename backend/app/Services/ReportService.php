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
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Carbon\Carbon;

class ReportService
{
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
     * OVERVIEW DASHBOARD SUMMARY
     */
    public function getDashboardSummary(?int $companyId = null, ?int $branchId = null, $from = null, $to = null): array
    {
        if ($from && $to) {
            [$fromDate, $toDate] = $this->validateDateRange($from, $to);
        } else {
            $fromDate = Carbon::parse('2026-04-01');
            $toDate = now();
        }

        // Sales
        $salesData = $this->baseInvoiceQuery($companyId, $branchId)
            ->whereBetween('invoice_date', [$fromDate, $toDate])
            ->selectRaw('
                COUNT(*) as count,
                COALESCE(SUM(total_amount), 0) as total,
                COALESCE(SUM(tax_amount), 0) as tax,
                COALESCE(SUM(discount_amount), 0) as discount
            ')
            ->first();

        $salesCount = $salesData->count ?? 0;
        $totalSales = $salesData->total ?? 0;

        // Purchases
        $purchaseData = $this->basePurchaseQuery($companyId, $branchId)
            ->whereBetween('purchase_date', [$fromDate, $toDate])
            ->selectRaw('
                COUNT(*) as count,
                COALESCE(SUM(grand_total), 0) as total,
                COALESCE(SUM(tax_amount), 0) as tax
            ')
            ->first();

        $purchaseCount = $purchaseData->count ?? 0;
        $totalPurchases = $purchaseData->total ?? 0;

        // Payments Received (sales) & Payments Made (purchases)
        $paymentsReceived = Payment::where('payment_direction', 'inward')
            ->whereBetween('transaction_date', [$fromDate, $toDate])
            ->when($companyId, fn($q) => $q->where('company_id', $companyId))
            ->sum('amount') ?? 0;

        $paymentsMade = Payment::where('payment_direction', 'outward')
            ->whereBetween('transaction_date', [$fromDate, $toDate])
            ->when($companyId, fn($q) => $q->where('company_id', $companyId))
            ->sum('amount') ?? 0;

        // Receivables (unpaid invoices)
        $receivables = $this->baseInvoiceQuery($companyId, $branchId)
            ->whereBetween('invoice_date', [$fromDate, $toDate])
            ->whereNotIn('status', ['paid', 'cancelled'])
            ->sum('total_amount') ?? 0;

        // Payables (unpaid purchases)
        $payables = $this->basePurchaseQuery($companyId, $branchId)
            ->whereBetween('purchase_date', [$fromDate, $toDate])
            ->whereNotIn('status', ['paid', 'cancelled'])
            ->sum('grand_total') ?? 0;

        $grossProfit = $totalSales - $totalPurchases;

        return [
            'total_sales' => (float) $totalSales,
            'total_purchases' => (float) $totalPurchases,
            'gross_profit' => (float) $grossProfit,
            'receivables' => (float) $receivables,
            'payables' => (float) $payables,
            'payments_received' => (float) $paymentsReceived,
            'payments_made' => (float) $paymentsMade,
            'outstanding_amount' => (float) ($receivables - $paymentsReceived),
            'sales_count' => (int) $salesCount,
            'purchase_count' => (int) $purchaseCount,
            'invoice_count' => (int) $salesCount,
            'profit_margin' => $totalSales > 0 ? (($grossProfit / $totalSales) * 100) : 0,
        ];
    }

    public function getPurchaseRegister(?int $companyId = null, ?int $branchId = null, $from = null, $to = null, int $page = 1, int $perPage = 25): array
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

    public function getPurchaseByVendor(?int $companyId = null, ?int $branchId = null, $from = null, $to = null, int $page = 1, int $perPage = 25): array
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
    public function getSalesSummary(?int $companyId = null, ?int $branchId = null, $from = null, $to = null, int $page = 1, int $perPage = 25): array
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
    public function getSalesRegister(?int $companyId = null, ?int $branchId = null, $from = null, $to = null, int $page = 1, int $perPage = 25): array
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
    public function getSalesByCustomer(?int $companyId = null, ?int $branchId = null, $from = null, $to = null, int $page = 1, int $perPage = 25): array
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
    public function getSalesByProduct(?int $companyId = null, ?int $branchId = null, $from = null, $to = null, int $page = 1, int $perPage = 25): array
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
    public function getOutstandingSales(?int $companyId = null, ?int $branchId = null, $from = null, $to = null, int $page = 1, int $perPage = 25): array
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
    public function getGstSalesReport(?int $companyId = null, ?int $branchId = null, $from = null, $to = null, int $page = 1, int $perPage = 25): array
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
    public function getPurchaseSummary(?int $companyId = null, ?int $branchId = null, $from = null, $to = null, int $page = 1, int $perPage = 25): array
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
    public function getProductProfitability(?int $companyId = null, ?int $branchId = null, $from = null, $to = null, int $page = 1, int $perPage = 25): array
    {
        [$fromDate, $toDate] = $this->validateDateRange($from, $to);

        $query = InvoiceItem::query()
            ->join('invoices', 'invoice_items.invoice_id', '=', 'invoices.id')
            ->leftJoin('products', 'invoice_items.product_id', '=', 'products.id')
            ->where('invoices.status', '!=', 'cancelled')
            ->whereBetween('invoices.invoice_date', [$fromDate, $toDate]);

        if ($companyId) {
            $query->where('invoices.company_id', $companyId);
        }

        if ($branchId) {
            $query->where('invoices.branch_id', $branchId);
        }

        $baseQuery = $query->select([
            'invoice_items.product_id',
            'products.name as product_name',
            'products.sku',
            \DB::raw('SUM(invoice_items.quantity) as quantity_sold'),
            \DB::raw('SUM(invoice_items.subtotal) as sales_value'),
            \DB::raw('SUM(invoice_items.quantity * COALESCE(products.purchase_price, 0)) as cost_value'),
        ])->groupBy('invoice_items.product_id', 'products.name', 'products.sku');

        $total = (clone $baseQuery)->count();
        $items = $baseQuery
            ->orderByDesc('sales_value')
            ->skip(($page - 1) * $perPage)
            ->take($perPage)
            ->get();

        $rows = $items->map(function ($row) {
            $salesValue = (float) ($row->sales_value ?? 0);
            $costValue = (float) ($row->cost_value ?? 0);
            $grossProfit = $salesValue - $costValue;
            $marginPercent = $salesValue > 0 ? (($grossProfit / $salesValue) * 100) : 0;

            return [
                'product_id' => (int) ($row->product_id ?? 0),
                'product_name' => $row->product_name ?? 'Unknown Product',
                'sku' => $row->sku ?? '-',
                'quantity_sold' => (float) ($row->quantity_sold ?? 0),
                'sales_value' => $salesValue,
                'cost_value' => $costValue,
                'gross_profit' => $grossProfit,
                'margin_percent' => (float) $marginPercent,
            ];
        })->toArray();

        return [
            'success' => true,
            'data' => $rows,
            'summary' => [
                'total_products' => count($rows),
                'total_sales_value' => array_sum(array_column($rows, 'sales_value')),
                'total_cost_value' => array_sum(array_column($rows, 'cost_value')),
                'total_gross_profit' => array_sum(array_column($rows, 'gross_profit')),
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

    public function getInvoiceProfitability(?int $companyId = null, ?int $branchId = null, $from = null, $to = null, int $page = 1, int $perPage = 25): array
    {
        [$fromDate, $toDate] = $this->validateDateRange($from, $to);

        $query = Invoice::query()
            ->with(['customer', 'items.product.purchasePriceHistory'])
            ->whereBetween('invoice_date', [$fromDate, $toDate])
            ->where('status', '!=', 'cancelled')
            ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->orderBy('invoice_date', 'desc');

        $allInvoices = $query->get();

        $rows = [];
        foreach ($allInvoices as $invoice) {
            $grossSales = (float) ($invoice->total_amount ?? 0);
            $discount = (float) ($invoice->discount_amount ?? 0);
            $tax = (float) ($invoice->tax_amount ?? 0);
            $revenue = max(0, $grossSales - $discount);
            $cogs = 0.0;
            $items = [];

            foreach ($invoice->items as $item) {
                $quantity = (float) ($item->quantity ?? 0);
                $unitPrice = (float) ($item->unit_price ?? 0);
                $itemRevenue = (float) ($item->subtotal ?? ($quantity * $unitPrice));
                $itemDiscount = (float) ($item->discount_amount ?? 0);
                $itemNetRevenue = max(0, $itemRevenue - $itemDiscount);
                $unitCost = $this->resolveHistoricalProductCost((int) ($item->product_id ?? 0), $invoice->invoice_date ? $invoice->invoice_date->format('Y-m-d') : null);
                $itemCost = $quantity * $unitCost;
                $cogs += $itemCost;

                $items[] = [
                    'product_id' => (int) ($item->product_id ?? 0),
                    'product_name' => $item->product?->name ?? $item->product_name ?? 'Unknown Product',
                    'sku' => $item->product?->sku ?? '-',
                    'quantity' => $quantity,
                    'unit_price' => $unitPrice,
                    'gross_sales' => $itemRevenue,
                    'discount' => $itemDiscount,
                    'net_sales' => $itemNetRevenue,
                    'unit_cost' => $unitCost,
                    'cogs' => $itemCost,
                    'gross_profit' => $itemNetRevenue - $itemCost,
                    'margin_percent' => $itemNetRevenue > 0 ? ((($itemNetRevenue - $itemCost) / $itemNetRevenue) * 100) : 0,
                ];
            }

            $grossProfit = $revenue - $cogs;
            $marginPercent = $revenue > 0 ? (($grossProfit / $revenue) * 100) : 0;

            $rows[] = [
                'invoice_id' => (int) $invoice->id,
                'invoice_no' => $invoice->invoice_no,
                'invoice_date' => $invoice->invoice_date ? $invoice->invoice_date->format('Y-m-d') : null,
                'customer_id' => $invoice->customer_id,
                'customer_name' => $invoice->customer?->name ?? $invoice->customer_name ?? 'Walk-in Customer',
                'gross_sales' => $grossSales,
                'discount' => $discount,
                'tax' => $tax,
                'revenue' => $revenue,
                'cogs' => $cogs,
                'gross_profit' => $grossProfit,
                'profit_margin' => $marginPercent,
                'status' => $invoice->status,
                'items' => $items,
            ];
        }

        $total = count($rows);
        $paginated = array_slice($rows, ($page - 1) * $perPage, $perPage);

        $summary = [
            'total_invoices' => $total,
            'total_revenue' => array_sum(array_column($paginated, 'revenue')),
            'total_cogs' => array_sum(array_column($paginated, 'cogs')),
            'total_gross_profit' => array_sum(array_column($paginated, 'gross_profit')),
            'average_margin_percent' => $total > 0 ? (array_sum(array_column($rows, 'profit_margin')) / $total) : 0,
        ];

        return [
            'success' => true,
            'data' => $paginated,
            'summary' => $summary,
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
            ->with(['customer', 'items.product.purchasePriceHistory'])
            ->when($invoiceId, fn ($query) => $query->where(function ($inner) use ($invoiceId) {
                $inner->where('id', $invoiceId)->orWhere('invoice_no', $invoiceId);
            }))
            ->when($companyId, fn ($query) => $query->where('company_id', $companyId))
            ->when($branchId, fn ($query) => $query->where('branch_id', $branchId))
            ->firstOrFail();

        $grossSales = (float) ($invoice->total_amount ?? 0);
        $discount = (float) ($invoice->discount_amount ?? 0);
        $tax = (float) ($invoice->tax_amount ?? 0);
        $revenue = max(0, $grossSales - $discount);
        $cogs = 0.0;
        $items = [];

        foreach ($invoice->items as $item) {
            $quantity = (float) ($item->quantity ?? 0);
            $unitPrice = (float) ($item->unit_price ?? 0);
            $itemRevenue = (float) ($item->subtotal ?? ($quantity * $unitPrice));
            $itemDiscount = (float) ($item->discount_amount ?? 0);
            $itemNetRevenue = max(0, $itemRevenue - $itemDiscount);
            $unitCost = $this->resolveHistoricalProductCost((int) ($item->product_id ?? 0), $invoice->invoice_date ? $invoice->invoice_date->format('Y-m-d') : null);
            $itemCost = $quantity * $unitCost;
            $cogs += $itemCost;

            $items[] = [
                'product_id' => (int) ($item->product_id ?? 0),
                'product_name' => $item->product?->name ?? $item->product_name ?? 'Unknown Product',
                'sku' => $item->product?->sku ?? '-',
                'quantity' => $quantity,
                'unit_price' => $unitPrice,
                'gross_sales' => $itemRevenue,
                'discount' => $itemDiscount,
                'net_sales' => $itemNetRevenue,
                'unit_cost' => $unitCost,
                'cogs' => $itemCost,
                'gross_profit' => $itemNetRevenue - $itemCost,
                'margin_percent' => $itemNetRevenue > 0 ? ((($itemNetRevenue - $itemCost) / $itemNetRevenue) * 100) : 0,
            ];
        }

        $grossProfit = $revenue - $cogs;
        $marginPercent = $revenue > 0 ? (($grossProfit / $revenue) * 100) : 0;

        return [
            'success' => true,
            'data' => [
                'invoice_id' => (int) $invoice->id,
                'invoice_no' => $invoice->invoice_no,
                'invoice_date' => $invoice->invoice_date ? $invoice->invoice_date->format('Y-m-d') : null,
                'customer_id' => $invoice->customer_id,
                'customer_name' => $invoice->customer?->name ?? $invoice->customer_name ?? 'Walk-in Customer',
                'gross_sales' => $grossSales,
                'discount' => $discount,
                'tax' => $tax,
                'revenue' => $revenue,
                'cogs' => $cogs,
                'gross_profit' => $grossProfit,
                'profit_margin' => $marginPercent,
                'status' => $invoice->status,
                'items' => $items,
            ],
            'meta' => [
                'invoice_id' => (int) $invoice->id,
                'invoice_no' => $invoice->invoice_no,
            ],
        ];
    }

    public function getProfitLossSummary(?int $companyId = null, ?int $branchId = null, $from = null, $to = null): array
    {
        [$fromDate, $toDate] = $this->validateDateRange($from, $to);

        $invoiceQuery = $this->baseInvoiceQuery($companyId, $branchId)
            ->whereBetween('invoice_date', [$fromDate, $toDate]);

        $grossSales = (float) $invoiceQuery->sum('total_amount');
        $salesDiscounts = (float) $invoiceQuery->sum('discount_amount');
        $salesReturns = 0.0;
        $netRevenue = max(0, $grossSales - $salesReturns - $salesDiscounts);

        $costQuery = InvoiceItem::query()
            ->join('invoices', 'invoice_items.invoice_id', '=', 'invoices.id')
            ->leftJoin('products', 'invoice_items.product_id', '=', 'products.id')
            ->whereBetween('invoices.invoice_date', [$fromDate, $toDate])
            ->where('invoices.status', '!=', 'cancelled');

        if ($companyId) {
            $costQuery->where('invoices.company_id', $companyId);
        }

        if ($branchId) {
            $costQuery->where('invoices.branch_id', $branchId);
        }

        $productCost = (float) $costQuery->sum(
            \DB::raw('invoice_items.quantity * COALESCE(products.purchase_price, invoice_items.unit_price, 0)')
        );
        $cogs = max(0, $productCost);
        $grossProfit = $netRevenue - $cogs;
        $grossMargin = $netRevenue > 0 ? (($grossProfit / $netRevenue) * 100) : 0;

        $operatingExpenses = 0.0;
        $operatingProfit = $grossProfit - $operatingExpenses;
        $otherIncome = 0.0;
        $otherExpenses = 0.0;
        $netProfit = $operatingProfit + $otherIncome - $otherExpenses;
        $netMargin = $netRevenue > 0 ? (($netProfit / $netRevenue) * 100) : 0;
        $contributionMargin = $netRevenue - $cogs;
        $contributionMarginPercent = $netRevenue > 0 ? (($contributionMargin / $netRevenue) * 100) : 0;

        return [
            'success' => true,
            'data' => [
                'gross_revenue' => (float) $grossSales,
                'net_revenue' => (float) $netRevenue,
                'cogs' => (float) $cogs,
                'gross_profit' => (float) $grossProfit,
                'gross_margin' => (float) $grossMargin,
                'operating_expenses' => (float) $operatingExpenses,
                'operating_profit' => (float) $operatingProfit,
                'net_profit' => (float) $netProfit,
                'net_margin' => (float) $netMargin,
                'contribution_margin' => (float) $contributionMargin,
                'contribution_margin_percent' => (float) $contributionMarginPercent,
                'total_sales' => (float) $grossSales,
                'total_sales_returns' => (float) $salesReturns,
                'total_discounts' => (float) $salesDiscounts,
                'total_purchase_cost' => (float) $productCost,
            ],
            'meta' => [
                'from' => $fromDate->format('Y-m-d'),
                'to' => $toDate->format('Y-m-d'),
            ],
        ];
    }

    public function getProfitLossProducts(?int $companyId = null, ?int $branchId = null, $from = null, $to = null, int $page = 1, int $perPage = 25): array
    {
        return $this->getProductProfitability($companyId, $branchId, $from, $to, $page, $perPage);
    }

    public function getProfitLossCustomers(?int $companyId = null, ?int $branchId = null, $from = null, $to = null, int $page = 1, int $perPage = 25): array
    {
        [$fromDate, $toDate] = $this->validateDateRange($from, $to);

        $invoices = Invoice::query()
            ->with('customer')
            ->whereBetween('invoice_date', [$fromDate, $toDate])
            ->where('status', '!=', 'cancelled')
            ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->get();

        $grouped = [];

        foreach ($invoices as $invoice) {
            $customerName = $invoice->customer?->name ?? 'Walk-in Customer';
            $key = $customerName . '|' . ($invoice->customer_id ?? 0);

            if (!isset($grouped[$key])) {
                $grouped[$key] = [
                    'customer' => $customerName,
                    'invoice_count' => 0,
                    'gross_sales' => 0,
                    'net_revenue' => 0,
                    'cogs' => 0,
                    'gross_profit' => 0,
                    'margin_percent' => 0,
                ];
            }

            $amount = (float) $invoice->total_amount;
            $discount = (float) $invoice->discount_amount;
            $net = max(0, $amount - $discount);
            $cogs = 0.0;

            foreach ($invoice->items as $item) {
                $costPerUnit = $item->product?->purchase_price ?? $item->unit_price ?? 0;
                $cogs += (float) ($item->quantity * $costPerUnit);
            }

            $profit = $net - $cogs;

            $grouped[$key]['invoice_count'] += 1;
            $grouped[$key]['gross_sales'] += $amount;
            $grouped[$key]['net_revenue'] += $net;
            $grouped[$key]['cogs'] += $cogs;
            $grouped[$key]['gross_profit'] += $profit;
        }

        $rows = array_values($grouped);
        foreach ($rows as &$row) {
            $row['margin_percent'] = $row['net_revenue'] > 0 ? (($row['gross_profit'] / $row['net_revenue']) * 100) : 0;
        }

        usort($rows, fn ($a, $b) => $b['gross_profit'] <=> $a['gross_profit']);

        $paged = array_slice($rows, ($page - 1) * $perPage, $perPage);

        return [
            'success' => true,
            'data' => $paged,
            'meta' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => count($rows),
                'last_page' => max(1, (int) ceil(count($rows) / $perPage)),
                'from' => $fromDate->format('Y-m-d'),
                'to' => $toDate->format('Y-m-d'),
            ],
        ];
    }

    public function getProfitLossBranches(?int $companyId = null, ?int $branchId = null, $from = null, $to = null, int $page = 1, int $perPage = 25): array
    {
        [$fromDate, $toDate] = $this->validateDateRange($from, $to);

        $invoices = Invoice::query()
            ->with('branch')
            ->whereBetween('invoice_date', [$fromDate, $toDate])
            ->where('status', '!=', 'cancelled')
            ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->get();

        $grouped = [];

        foreach ($invoices as $invoice) {
            $branchName = $invoice->branch?->name ?? 'Main Branch';
            $key = $branchName . '|' . ($invoice->branch_id ?? 0);

            if (!isset($grouped[$key])) {
                $grouped[$key] = [
                    'branch' => $branchName,
                    'gross_sales' => 0,
                    'net_revenue' => 0,
                    'cogs' => 0,
                    'gross_profit' => 0,
                    'margin_percent' => 0,
                ];
            }

            $amount = (float) $invoice->total_amount;
            $discount = (float) $invoice->discount_amount;
            $net = max(0, $amount - $discount);
            $cogs = 0.0;

            foreach ($invoice->items as $item) {
                $costPerUnit = $item->product?->purchase_price ?? $item->unit_price ?? 0;
                $cogs += (float) ($item->quantity * $costPerUnit);
            }

            $profit = $net - $cogs;

            $grouped[$key]['gross_sales'] += $amount;
            $grouped[$key]['net_revenue'] += $net;
            $grouped[$key]['cogs'] += $cogs;
            $grouped[$key]['gross_profit'] += $profit;
        }

        $rows = array_values($grouped);
        foreach ($rows as &$row) {
            $row['margin_percent'] = $row['net_revenue'] > 0 ? (($row['gross_profit'] / $row['net_revenue']) * 100) : 0;
        }

        usort($rows, fn ($a, $b) => $b['gross_profit'] <=> $a['gross_profit']);
        $paged = array_slice($rows, ($page - 1) * $perPage, $perPage);

        return [
            'success' => true,
            'data' => $paged,
            'meta' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => count($rows),
                'last_page' => max(1, (int) ceil(count($rows) / $perPage)),
                'from' => $fromDate->format('Y-m-d'),
                'to' => $toDate->format('Y-m-d'),
            ],
        ];
    }

    public function getProfitLossMonthly(?int $companyId = null, ?int $branchId = null, $from = null, $to = null): array
    {
        [$fromDate, $toDate] = $this->validateDateRange($from, $to);

        $invoices = Invoice::query()
            ->whereBetween('invoice_date', [$fromDate, $toDate])
            ->where('status', '!=', 'cancelled')
            ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->get();

        $grouped = [];

        foreach ($invoices as $invoice) {
            $month = $invoice->invoice_date ? Carbon::parse($invoice->invoice_date)->format('Y-m') : 'unknown';
            $amount = (float) $invoice->total_amount;
            $discount = (float) $invoice->discount_amount;
            $net = max(0, $amount - $discount);
            $cogs = 0.0;

            foreach ($invoice->items as $item) {
                $costPerUnit = $item->product?->purchase_price ?? $item->unit_price ?? 0;
                $cogs += (float) ($item->quantity * $costPerUnit);
            }

            $profit = $net - $cogs;

            if (!isset($grouped[$month])) {
                $grouped[$month] = [
                    'month' => $month,
                    'revenue' => 0,
                    'cogs' => 0,
                    'gross_profit' => 0,
                    'margin_percent' => 0,
                ];
            }

            $grouped[$month]['revenue'] += $net;
            $grouped[$month]['cogs'] += $cogs;
            $grouped[$month]['gross_profit'] += $profit;
        }

        $rows = array_values($grouped);
        foreach ($rows as &$row) {
            $row['margin_percent'] = $row['revenue'] > 0 ? (($row['gross_profit'] / $row['revenue']) * 100) : 0;
        }

        usort($rows, fn ($a, $b) => $a['month'] <=> $b['month']);

        return [
            'success' => true,
            'data' => $rows,
            'meta' => [
                'from' => $fromDate->format('Y-m-d'),
                'to' => $toDate->format('Y-m-d'),
            ],
        ];
    }

    public function getProfitLossYearly(?int $companyId = null, ?int $branchId = null, $from = null, $to = null): array
    {
        [$fromDate, $toDate] = $this->validateDateRange($from, $to);

        $invoices = Invoice::query()
            ->whereBetween('invoice_date', [$fromDate, $toDate])
            ->where('status', '!=', 'cancelled')
            ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->get();

        $grouped = [];

        foreach ($invoices as $invoice) {
            $year = $invoice->invoice_date ? Carbon::parse($invoice->invoice_date)->format('Y') : 'unknown';
            $amount = (float) $invoice->total_amount;
            $discount = (float) $invoice->discount_amount;
            $net = max(0, $amount - $discount);
            $cogs = 0.0;

            foreach ($invoice->items as $item) {
                $costPerUnit = $item->product?->purchase_price ?? $item->unit_price ?? 0;
                $cogs += (float) ($item->quantity * $costPerUnit);
            }

            $profit = $net - $cogs;

            if (!isset($grouped[$year])) {
                $grouped[$year] = [
                    'year' => $year,
                    'revenue' => 0,
                    'cogs' => 0,
                    'gross_profit' => 0,
                    'margin_percent' => 0,
                ];
            }

            $grouped[$year]['revenue'] += $net;
            $grouped[$year]['cogs'] += $cogs;
            $grouped[$year]['gross_profit'] += $profit;
        }

        $rows = array_values($grouped);
        foreach ($rows as &$row) {
            $row['margin_percent'] = $row['revenue'] > 0 ? (($row['gross_profit'] / $row['revenue']) * 100) : 0;
        }

        usort($rows, fn ($a, $b) => $a['year'] <=> $b['year']);

        return [
            'success' => true,
            'data' => $rows,
            'meta' => [
                'from' => $fromDate->format('Y-m-d'),
                'to' => $toDate->format('Y-m-d'),
            ],
        ];
    }

    public function getProfitLossComparison(?int $companyId = null, ?int $branchId = null, $from = null, $to = null): array
    {
        [$fromDate, $toDate] = $this->validateDateRange($from, $to);
        $days = max(1, $fromDate->diffInDays($toDate) + 1);
        $previousFrom = $fromDate->copy()->subDays($days);
        $previousTo = $toDate->copy()->subDays($days);

        $current = $this->getProfitLossSummary($companyId, $branchId, $fromDate->format('Y-m-d'), $toDate->format('Y-m-d'));
        $previous = $this->getProfitLossSummary($companyId, $branchId, $previousFrom->format('Y-m-d'), $previousTo->format('Y-m-d'));

        $currentData = $current['data'] ?? [];
        $previousData = $previous['data'] ?? [];
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

        // ===== REVENUE SECTION =====
        $invoiceQuery = $this->baseInvoiceQuery($companyId, $branchId)
            ->whereBetween('invoice_date', [$fromDate, $toDate]);

        $grossSalesData = $invoiceQuery->selectRaw('
            COALESCE(SUM(total_amount), 0) as total,
            COALESCE(SUM(discount_amount), 0) as discount
        ')->first();

        $grossSales = $grossSalesData->total ?? 0;
        $salesDiscounts = $grossSalesData->discount ?? 0;

        // For now, sales returns = 0 (would need separate returns table)
        $salesReturns = 0;
        $netSales = $grossSales - $salesReturns - $salesDiscounts;

        // ===== COGS SECTION =====
        // For now: COGS = Purchases (would need inventory valuation for proper COGS)
        $purchaseQuery = $this->basePurchaseQuery($companyId, $branchId)
            ->whereBetween('purchase_date', [$fromDate, $toDate]);

        $purchaseData = $purchaseQuery->selectRaw('
            COALESCE(SUM(grand_total), 0) as total,
            COALESCE(SUM(order_discount), 0) as discount
        ')->first();

        $purchases = $purchaseData->total ?? 0;
        $purchaseDiscounts = $purchaseData->discount ?? 0;

        $openingStock = 0; // Would need warehouse stock tracking
        $closingStock = 0;
        $cogs = $openingStock + $purchases - $purchaseDiscounts - $closingStock;

        // ===== GROSS PROFIT =====
        $grossProfit = $netSales - $cogs;
        $grossMargin = $netSales > 0 ? (($grossProfit / $netSales) * 100) : 0;

        // ===== OPERATING EXPENSES =====
        // For now, expenses would come from accounting entries or separate expense table
        $totalOperatingExpenses = 0;
        $operatingExpenses = [];

        // ===== OPERATING PROFIT =====
        $operatingProfit = $grossProfit - $totalOperatingExpenses;

        // ===== OTHER INCOME & EXPENSES =====
        $otherIncome = 0;
        $otherExpenses = 0;

        // ===== NET PROFIT =====
        $netProfit = $operatingProfit + $otherIncome - $otherExpenses;
        $netMargin = $netSales > 0 ? (($netProfit / $netSales) * 100) : 0;

        return [
            'success' => true,
            'data' => [
                'revenue' => [
                    'gross_sales' => (float) $grossSales,
                    'sales_returns' => (float) $salesReturns,
                    'sales_discounts' => (float) $salesDiscounts,
                    'net_sales' => (float) $netSales,
                ],
                'cogs' => [
                    'opening_stock' => (float) $openingStock,
                    'purchases' => (float) $purchases,
                    'purchase_returns' => 0,
                    'purchase_discounts' => (float) $purchaseDiscounts,
                    'direct_costs' => 0,
                    'closing_stock' => (float) $closingStock,
                    'cost_of_goods_sold' => (float) $cogs,
                ],
                'gross_profit' => (float) $grossProfit,
                'gross_margin' => (float) $grossMargin,
                'operating_expenses' => $operatingExpenses,
                'total_operating_expenses' => (float) $totalOperatingExpenses,
                'operating_profit' => (float) $operatingProfit,
                'other_income' => (float) $otherIncome,
                'other_expenses' => (float) $otherExpenses,
                'net_profit' => (float) $netProfit,
                'net_margin' => (float) $netMargin,
            ],
            'meta' => [
                'from' => $fromDate->format('Y-m-d'),
                'to' => $toDate->format('Y-m-d'),
            ],
        ];
    }

    /**
     * GST SUMMARY (GSTR-3B prep)
     */
    public function getGstSummary(?int $companyId = null, $from = null, $to = null): array
    {
        [$fromDate, $toDate] = $this->validateDateRange($from, $to);

        // Outward supplies (Sales)
        $outwardItems = InvoiceItem::whereHas('invoice', function ($q) use ($companyId, $fromDate, $toDate) {
            $q->where('status', '!=', 'cancelled')
                ->whereBetween('invoice_date', [$fromDate, $toDate]);
            if ($companyId) $q->where('company_id', $companyId);
        })->get();

        $outwardTaxableValue = $outwardItems->sum('subtotal') ?? 0;
        $outwardCgst = $outwardItems->sum('cgst_amount') ?? 0;
        $outwardSgst = $outwardItems->sum('sgst_amount') ?? 0;
        $outwardIgst = $outwardItems->sum('igst_amount') ?? 0;

        // Inward supplies (Purchases)
        $inwardItems = PurchaseInvoiceItem::whereHas('purchaseInvoice', function ($q) use ($companyId, $fromDate, $toDate) {
            $q->where('status', '!=', 'cancelled')
                ->whereBetween('purchase_date', [$fromDate, $toDate]);
            if ($companyId) $q->where('company_id', $companyId);
        })->get();

        $inwardTaxableValue = $inwardItems->sum('subtotal') ?? 0;
        $inwardCgst = $inwardItems->sum('cgst_amount') ?? 0;
        $inwardSgst = $inwardItems->sum('sgst_amount') ?? 0;
        $inwardIgst = $inwardItems->sum('igst_amount') ?? 0;

        $netCgst = $outwardCgst - $inwardCgst;
        $netSgst = $outwardSgst - $inwardSgst;
        $netIgst = $outwardIgst - $inwardIgst;
        $netTaxLiability = $netCgst + $netSgst + $netIgst;

        return [
            'success' => true,
            'data' => [
                'outward' => [
                    'taxable_value' => (float) $outwardTaxableValue,
                    'cgst' => (float) $outwardCgst,
                    'sgst' => (float) $outwardSgst,
                    'igst' => (float) $outwardIgst,
                    'total_tax' => (float) ($outwardCgst + $outwardSgst + $outwardIgst),
                ],
                'inward' => [
                    'taxable_value' => (float) $inwardTaxableValue,
                    'cgst' => (float) $inwardCgst,
                    'sgst' => (float) $inwardSgst,
                    'igst' => (float) $inwardIgst,
                    'total_tax' => (float) ($inwardCgst + $inwardSgst + $inwardIgst),
                ],
                'input_tax_credit' => [
                    'cgst_itc' => (float) $inwardCgst,
                    'sgst_itc' => (float) $inwardSgst,
                    'igst_itc' => (float) $inwardIgst,
                    'total_itc' => (float) ($inwardCgst + $inwardSgst + $inwardIgst),
                ],
                'net_liability' => [
                    'cgst' => (float) $netCgst,
                    'sgst' => (float) $netSgst,
                    'igst' => (float) $netIgst,
                    'total' => (float) $netTaxLiability,
                ],
            ],
            'meta' => [
                'from' => $fromDate->format('Y-m-d'),
                'to' => $toDate->format('Y-m-d'),
            ],
        ];
    }
}
