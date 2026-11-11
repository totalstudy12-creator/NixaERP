<?php

namespace App\Services;

use Carbon\Carbon;
use Illuminate\Support\Facades\Log;

class AiContextService
{
    protected ReportService $reportService;

    public function __construct(?ReportService $reportService = null)
    {
        $this->reportService = $reportService ?? app(ReportService::class);
    }

    public function getSalesSummary()
    {
        try {
            return app()->call('\App\Http\Controllers\Api\SalesController@summary');
        } catch (\Throwable $e) {
            Log::warning('AiContextService.getSalesSummary failed: ' . $e->getMessage());
            return null;
        }
    }

    public function getLowStockProducts($limit = 10)
    {
        try {
            return \App\Models\Product::whereRaw('stock_quantity <= COALESCE(reorder_level, 10)')->limit($limit)->get(['id','name','stock_quantity'])->toArray();
        } catch (\Throwable $e) {
            Log::warning('AiContextService.getLowStockProducts failed: ' . $e->getMessage());
            return [];
        }
    }

    public function getTopProducts($limit = 10)
    {
        try {
            // Best-effort: use InvoiceItem aggregation if available
            if (class_exists('\App\Models\InvoiceItem')) {
                return \App\Models\InvoiceItem::selectRaw('product_id, sum(quantity) as qty')
                    ->groupBy('product_id')->orderByDesc('qty')->limit($limit)->get()->map(function ($r) {
                        $p = \App\Models\Product::find($r->product_id);
                        return ['product_id' => $r->product_id, 'name' => $p?->name, 'sold' => $r->qty];
                    })->toArray();
            }
            return [];
        } catch (\Throwable $e) {
            Log::warning('AiContextService.getTopProducts failed: ' . $e->getMessage());
            return [];
        }
    }

    public function getTopCustomers($limit = 10)
    {
        try {
            if (class_exists('\App\Models\Invoice')) {
                return \App\Models\Invoice::selectRaw('customer_id, sum(total_amount) as total')
                    ->groupBy('customer_id')->orderByDesc('total')->limit($limit)->get()->map(function ($r) {
                        $c = \App\Models\Customer::find($r->customer_id);
                        return ['customer_id' => $r->customer_id, 'name' => $c?->name, 'total' => $r->total];
                    })->toArray();
            }
            return [];
        } catch (\Throwable $e) {
            Log::warning('AiContextService.getTopCustomers failed: ' . $e->getMessage());
            return [];
        }
    }

    public function getDeliveryLogisticsSummary(?int $companyId = null, ?int $branchId = null): array
    {
        try {
            if (!class_exists('\App\Models\DeliveryOrder')) {
                return ['available' => false, 'message' => 'Delivery management module not loaded.'];
            }

            $orderQuery = \App\Models\DeliveryOrder::query();
            $tripQuery = \App\Models\DeliveryTrip::query();
            $vehicleQuery = \App\Models\DeliveryVehicle::query();

            if ($companyId) {
                $orderQuery->where('company_id', $companyId);
                $tripQuery->where('company_id', $companyId);
            }
            if ($branchId) {
                $orderQuery->where('branch_id', $branchId);
                $tripQuery->where('branch_id', $branchId);
            }

            $totalOrders = (clone $orderQuery)->count();
            $pendingOrdersCount = (clone $orderQuery)->whereIn('status', ['pending', 'scheduled'])->count();
            $inTransitCount = (clone $orderQuery)->whereIn('status', ['loaded', 'in_transit'])->count();
            $deliveredToday = (clone $orderQuery)->where('status', 'delivered')
                ->whereDate('updated_at', \Carbon\Carbon::today())
                ->count();

            $pendingOrders = (clone $orderQuery)->whereIn('status', ['pending', 'scheduled'])
                ->orderBy('priority', 'desc')
                ->orderBy('expected_delivery_date', 'asc')
                ->limit(8)
                ->get()
                ->map(function ($o) {
                    return [
                        'order_no' => $o->delivery_order_no,
                        'customer' => $o->recipient_name,
                        'town' => $o->town ?: 'Local Area',
                        'district' => $o->district ?: 'Nawada',
                        'priority' => $o->priority,
                        'expected_date' => $o->expected_delivery_date?->toDateString(),
                        'quantity' => (float) $o->total_quantity,
                        'status' => $o->status,
                    ];
                })
                ->toArray();

            $activeTrips = (clone $tripQuery)->whereIn('status', ['scheduled', 'loading', 'dispatched', 'in_transit'])
                ->with(['vehicle', 'driver'])
                ->orderBy('planned_date', 'asc')
                ->limit(6)
                ->get()
                ->map(function ($t) {
                    return [
                        'trip_code' => $t->trip_code,
                        'status' => $t->status,
                        'vehicle' => $t->vehicle?->registration_number ?: ($t->vehicle?->name ?: 'Unassigned'),
                        'driver' => $t->driver?->name ?: 'Unassigned',
                        'customers_count' => (int) $t->total_customers,
                        'total_quantity' => (float) $t->total_quantity,
                        'planned_date' => $t->planned_date?->toDateString(),
                    ];
                })
                ->toArray();

            $vehicles = $vehicleQuery->get()->map(function ($v) {
                return [
                    'vehicle_number' => $v->registration_number ?? $v->vehicle_code,
                    'type' => $v->type,
                    'status' => $v->status,
                    'capacity_kg' => (float) $v->max_capacity,
                ];
            })->toArray();

            $areas = class_exists('\App\Models\DeliveryArea')
                ? \App\Models\DeliveryArea::where('is_active', true)->pluck('name')->toArray()
                : ['Kashichak', 'Warisaliganj', 'Nalanda', 'Nawada'];

            return [
                'available' => true,
                'total_delivery_orders' => $totalOrders,
                'pending_orders_count' => $pendingOrdersCount,
                'in_transit_count' => $inTransitCount,
                'delivered_today_count' => $deliveredToday,
                'active_trips_count' => count($activeTrips),
                'active_trips' => $activeTrips,
                'pending_orders' => $pendingOrders,
                'fleet_vehicles' => $vehicles,
                'covered_delivery_areas' => $areas,
            ];
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('AiContextService.getDeliveryLogisticsSummary failed: ' . $e->getMessage());
            return ['available' => false, 'error' => $e->getMessage()];
        }
    }

    public function getOutstandingReceivablesSummary(?int $companyId = null, ?int $branchId = null): array
    {
        try {
            if (!class_exists('\App\Models\Invoice')) {
                return ['available' => false, 'message' => 'Invoice module not loaded.'];
            }

            $query = \App\Models\Invoice::whereNotIn('status', ['draft', 'cancelled']);
            if ($companyId) {
                $query->where('company_id', $companyId);
            }
            if ($branchId) {
                $query->where('branch_id', $branchId);
            }

            $totalInvoiced = (float) (clone $query)->sum('total_amount');
            $totalReceived = (float) (clone $query)->sum('paid_amount');

            // Invoices with unpaid balance:
            $receivablesQuery = (clone $query)->where(function ($q) {
                $q->where('payment_status', '!=', 'paid')
                  ->orWhereNull('payment_status')
                  ->orWhereRaw('(total_amount - COALESCE(paid_amount, 0)) > 0.01');
            });

            $totalReceivables = (float) (clone $receivablesQuery)
                ->sum(\Illuminate\Support\Facades\DB::raw('CASE WHEN payment_status = "paid" THEN 0 ELSE (total_amount - COALESCE(paid_amount, 0)) END'));
            
            $unpaidCount = (clone $receivablesQuery)->count();

            $today = \Carbon\Carbon::today()->toDateString();
            $overdueQuery = (clone $receivablesQuery)
                ->whereNotNull('due_date')
                ->whereDate('due_date', '<', $today);

            $totalOverdue = (float) (clone $overdueQuery)
                ->sum(\Illuminate\Support\Facades\DB::raw('CASE WHEN payment_status = "paid" THEN 0 ELSE (total_amount - COALESCE(paid_amount, 0)) END'));
            
            $overdueCount = (clone $overdueQuery)->count();

            // Top Customers with Outstanding Balances
            $topDebtors = (clone $receivablesQuery)
                ->select(
                    'customer_id',
                    'customer_name',
                    \Illuminate\Support\Facades\DB::raw('SUM(CASE WHEN payment_status = "paid" THEN 0 ELSE (total_amount - COALESCE(paid_amount, 0)) END) as pending_balance'),
                    \Illuminate\Support\Facades\DB::raw('COUNT(*) as invoice_count'),
                    \Illuminate\Support\Facades\DB::raw('MIN(due_date) as oldest_due_date')
                )
                ->groupBy('customer_id', 'customer_name')
                ->orderByDesc('pending_balance')
                ->limit(6)
                ->get()
                ->map(function ($r) use ($today) {
                    $isOverdue = $r->oldest_due_date && $r->oldest_due_date < $today;
                    return [
                        'customer' => $r->customer_name ?: 'Customer #' . $r->customer_id,
                        'pending_balance' => (float) $r->pending_balance,
                        'invoice_count' => (int) $r->invoice_count,
                        'oldest_due_date' => $r->oldest_due_date,
                        'has_overdue' => (bool) $isOverdue,
                    ];
                })
                ->toArray();

            // Recent Critical Invoices
            $criticalInvoices = (clone $receivablesQuery)
                ->orderBy('due_date', 'asc')
                ->limit(6)
                ->get()
                ->map(function ($inv) use ($today) {
                    $balance = (float) ($inv->total_amount - ($inv->paid_amount ?? 0));
                    $daysOverdue = ($inv->due_date && $inv->due_date->toDateString() < $today)
                        ? \Carbon\Carbon::parse($inv->due_date)->diffInDays(\Carbon\Carbon::today())
                        : 0;
                    return [
                        'invoice_no' => $inv->invoice_no,
                        'customer' => $inv->customer_name,
                        'due_date' => $inv->due_date?->toDateString(),
                        'balance' => $balance,
                        'days_overdue' => $daysOverdue,
                    ];
                })
                ->toArray();

            return [
                'available' => true,
                'total_invoiced_amount' => $totalInvoiced,
                'total_collected_amount' => $totalReceived,
                'total_outstanding_receivables' => $totalReceivables,
                'total_overdue_amount' => $totalOverdue,
                'unpaid_invoices_count' => $unpaidCount,
                'overdue_invoices_count' => $overdueCount,
                'top_debtors' => $topDebtors,
                'recent_critical_invoices' => $criticalInvoices,
            ];
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('AiContextService.getOutstandingReceivablesSummary failed: ' . $e->getMessage());
            return ['available' => false, 'error' => $e->getMessage()];
        }
    }

    public function getCashAndBankSummary(?int $companyId = null, ?int $branchId = null): array
    {
        try {
            $inwardToday = (float) \App\Models\Payment::where('payment_direction', 'inward')
                ->whereDate('payment_date', \Carbon\Carbon::today())
                ->sum('amount');
            $outwardToday = (float) \App\Models\Payment::where('payment_direction', 'outward')
                ->whereDate('payment_date', \Carbon\Carbon::today())
                ->sum('amount');

            $activeDrawer = null;
            if (class_exists('\App\Models\CashDrawerSession')) {
                $session = \App\Models\CashDrawerSession::where('status', 'open')
                    ->latest()
                    ->first();
                if ($session) {
                    $activeDrawer = [
                        'session_code' => $session->session_code,
                        'opening_balance' => (float) $session->opening_balance,
                        'current_balance' => (float) $session->current_balance,
                        'cash_sales' => (float) $session->total_cash_sales,
                        'opened_at' => $session->opened_at?->toDateTimeString(),
                    ];
                }
            }

            return [
                'available' => true,
                'inward_collected_today' => $inwardToday,
                'outward_paid_today' => $outwardToday,
                'active_cash_drawer' => $activeDrawer,
            ];
        } catch (\Throwable $e) {
            return ['available' => false, 'error' => $e->getMessage()];
        }
    }

    public function getProfitLossContext(?int $companyId = null, ?int $branchId = null, ?string $from = null, ?string $to = null): array
    {
        $fromDate = $from ?: Carbon::now()->startOfMonth()->toDateString();
        $toDate = $to ?: Carbon::now()->toDateString();

        try {
            $report = $this->reportService->getProfitLossSummary($companyId, $branchId, $fromDate, $toDate);

            return [
                'source' => 'Nexa ERP Profit & Loss',
                'calculation_source' => 'canonical_financial_report_service',
                'company_id' => $companyId,
                'branch_id' => $branchId,
                'period' => [
                    'from' => $fromDate,
                    'to' => $toDate,
                ],
                'gross_revenue' => (float) ($report['gross_revenue'] ?? 0),
                'net_revenue' => (float) ($report['net_revenue'] ?? 0),
                'sales_returns' => (float) ($report['sales_returns'] ?? 0),
                'sales_discounts' => (float) ($report['sales_discounts'] ?? 0),
                'cogs' => (float) ($report['cogs'] ?? 0),
                'gross_profit' => (float) ($report['gross_profit'] ?? 0),
                'operating_expenses' => (float) ($report['operating_expenses'] ?? 0),
                'other_income' => (float) ($report['other_income'] ?? 0),
                'other_expenses' => (float) ($report['other_expenses'] ?? 0),
                'net_profit' => (float) ($report['net_profit'] ?? 0),
                'invoice_count' => (int) ($report['invoice_count'] ?? 0),
                'missing_cost_lines' => (int) ($report['missing_cost_lines'] ?? 0),
                'expense_source' => $report['expense_source'] ?? 'unknown',
                'currency' => 'INR',
            ];
        } catch (\Throwable $e) {
            Log::warning('AiContextService.getProfitLossContext failed: ' . $e->getMessage());
            return [
                'source' => 'error',
                'calculation_source' => 'canonical_financial_report_service',
                'error' => 'Unable to fetch the authoritative ERP Profit & Loss report.'
            ];
        }
    }

    public function getFinancialContextForQuery(string $query, ?int $companyId = null, ?int $branchId = null): array
    {
        [$fromDate, $toDate] = $this->resolveDateRangeFromQuery($query);
        return $this->getProfitLossContext($companyId, $branchId, $fromDate, $toDate);
    }

    protected function resolveDateRangeFromQuery(string $query): array
    {
        $queryLower = strtolower(trim($query ?? ''));

        if ($queryLower === '') {
            return [Carbon::now()->startOfMonth()->toDateString(), Carbon::now()->toDateString()];
        }

        if (preg_match('/today|todays/', $queryLower)) {
            return [Carbon::now()->toDateString(), Carbon::now()->toDateString()];
        }

        if (preg_match('/this month|current month|month/', $queryLower)) {
            return [Carbon::now()->startOfMonth()->toDateString(), Carbon::now()->toDateString()];
        }

        if (preg_match('/this year|current year|year/', $queryLower)) {
            return [Carbon::now()->startOfYear()->toDateString(), Carbon::now()->toDateString()];
        }

        if (preg_match('/(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|september|oct|october|nov|november|dec|december)/', $queryLower)) {
            $monthMatch = null;
            foreach (['jan' => 1, 'january' => 1, 'feb' => 2, 'february' => 2, 'mar' => 3, 'march' => 3, 'apr' => 4, 'april' => 4, 'may' => 5, 'jun' => 6, 'june' => 6, 'jul' => 7, 'july' => 7, 'aug' => 8, 'august' => 8, 'sep' => 9, 'september' => 9, 'oct' => 10, 'october' => 10, 'nov' => 11, 'november' => 11, 'dec' => 12, 'december' => 12] as $label => $month) {
                if (str_contains($queryLower, $label)) {
                    $monthMatch = $month;
                    break;
                }
            }

            if ($monthMatch !== null) {
                $year = Carbon::now()->year;
                if (preg_match('/\b(\d{4})\b/', $queryLower, $yearMatches)) {
                    $year = (int) $yearMatches[1];
                }

                return [Carbon::create($year, $monthMatch, 1)->toDateString(), Carbon::create($year, $monthMatch, 1)->endOfMonth()->toDateString()];
            }
        }

        if (preg_match('/\b(\d{4}-\d{2}-\d{2})\b/', $queryLower, $dateMatches)) {
            $date = Carbon::parse($dateMatches[1]);
            return [$date->toDateString(), $date->toDateString()];
        }

        if (preg_match('/\b(\d{4}-\d{2})\b/', $queryLower, $monthMatches)) {
            $date = Carbon::parse($monthMatches[1] . '-01');
            return [$date->startOfMonth()->toDateString(), $date->endOfMonth()->toDateString()];
        }

        return [Carbon::now()->startOfMonth()->toDateString(), Carbon::now()->toDateString()];
    }
}
