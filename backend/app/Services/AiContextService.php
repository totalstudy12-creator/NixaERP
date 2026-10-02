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
            return \App\Models\Product::whereRaw('stock_quantity <= minimum_stock')->limit($limit)->get(['id','name','stock_quantity'])->toArray();
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
