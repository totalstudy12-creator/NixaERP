<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ReportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class ReportController extends Controller
{
    public function __construct(private readonly ReportService $reportService)
    {
    }

    /* -----------------------------------------------------------------
     |  Helpers
     * ---------------------------------------------------------------- */

    /**
     * Build a consistent, security-aware filter bag for every report.
     *
     *  - company_id : accepted only when the caller has no fixed company
     *                 (super-admin / owner). Otherwise forced to the
     *                 authenticated user's company to prevent cross-tenant
     *                 reads.
     *  - branch_id  : optional scope.
     *  - from / to  : validated date range (to must be >= from).
     *  - page / per_page : bounded pagination.
     *  - search     : 100-char free text.
     *
     *  Soft-deleted rows are always excluded inside the service layer.
     */
    private function filters(Request $request, array $extraRules = []): array
    {
        $rules = array_merge([
            'company_id' => 'nullable|integer|min:1',
            'branch_id'  => 'nullable|integer|min:1',
            'from'       => 'nullable|date',
            'to'         => 'nullable|date|after_or_equal:from',
            'page'       => 'nullable|integer|min:1',
            'per_page'   => 'nullable|integer|min:1|max:200',
            'search'     => 'nullable|string|max:100',
            'limit'      => 'nullable|integer|min:1|max:100',
        ], $extraRules);

        $v = $request->validate($rules);

        $user          = auth()->user();
        $userCompanyId = $user->company_id ?? null;

        // Security: user bound to a company must never read another company.
        if ($userCompanyId !== null) {
            $companyId = (int) $userCompanyId;
        } else {
            $companyId = isset($v['company_id']) ? (int) $v['company_id'] : null;
        }

        $branchId = isset($v['branch_id']) ? (int) $v['branch_id'] : null;
        if ($branchId && $companyId !== null) {
            $branchBelongsToCompany = \Illuminate\Support\Facades\DB::table('branches')
                ->where('id', $branchId)
                ->where('company_id', $companyId)
                ->exists();
            if (!$branchBelongsToCompany) {
                throw ValidationException::withMessages([
                    'branch_id' => ['The selected branch does not belong to the selected company.'],
                ]);
            }
        }

        return [
            'companyId' => $companyId,
            'branchId'  => $branchId,
            'from'      => $v['from'] ?? now()->startOfYear()->format('Y-m-d'),
            'to'        => $v['to'] ?? now()->format('Y-m-d'),
            'page'      => (int) ($v['page'] ?? 1),
            'perPage'   => (int) ($v['per_page'] ?? 25),
            'search'    => $v['search'] ?? null,
            'limit'     => isset($v['limit']) ? (int) $v['limit'] : null,
        ];
    }

    /**
     * Wrap a report closure with consistent error handling.
     */
    private function respond(callable $callback, string $errorMessage, int $status = 500): JsonResponse
    {
        try {
            return response()->json($callback());
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Throwable $e) {
            Log::error($errorMessage, [
                'exception' => $e->getMessage(),
                'file'      => $e->getFile(),
                'line'      => $e->getLine(),
                'trace'     => $e->getTraceAsString(),
                'user_id'   => auth()->id(),
            ]);

            return response()->json([
                'success' => false,
                'message' => $errorMessage,
            ], $status);
        }
    }

    /* -----------------------------------------------------------------
     |  Dashboard
     * ---------------------------------------------------------------- */

    public function summary(Request $request): JsonResponse
    {
        $f = $this->filters($request);

        return $this->respond(function () use ($f) {
            return [
                'success' => true,
                'data'    => $this->reportService->getDashboardSummary(
                    $f['companyId'], $f['branchId'], $f['from'], $f['to']
                ),
            ];
        }, 'Unable to generate dashboard summary.');
    }

    /* -----------------------------------------------------------------
     |  SALES
     * ---------------------------------------------------------------- */

    public function salesSummary(Request $request): JsonResponse
    {
        $f = $this->filters($request);

        return $this->respond(function () use ($f) {
            $data = $this->reportService->getSalesSummary(
                $f['companyId'], $f['branchId'], $f['from'], $f['to'],
                $f['page'], $f['perPage'], $f['search']
            );

            return [
                'success' => true,
                'data'    => $data['data'],
                'summary' => $data['summary'],
                'meta'    => $data['meta'],
            ];
        }, 'Unable to generate sales summary report.');
    }

    public function salesRegister(Request $request): JsonResponse
    {
        $f = $this->filters($request);

        return $this->respond(function () use ($f) {
            return [
                'success' => true,
                ...$this->reportService->getSalesRegister(
                    $f['companyId'], $f['branchId'], $f['from'], $f['to'],
                    $f['page'], $f['perPage'], $f['search']
                ),
            ];
        }, 'Unable to generate sales register.');
    }

    public function salesByCustomer(Request $request): JsonResponse
    {
        $f = $this->filters($request);

        return $this->respond(function () use ($f) {
            return [
                'success' => true,
                ...$this->reportService->getSalesByCustomer(
                    $f['companyId'], $f['branchId'], $f['from'], $f['to'],
                    $f['page'], $f['perPage'], $f['search']
                ),
            ];
        }, 'Unable to generate sales by customer report.');
    }

    public function salesByProduct(Request $request): JsonResponse
    {
        $f = $this->filters($request);

        return $this->respond(function () use ($f) {
            return [
                'success' => true,
                ...$this->reportService->getSalesByProduct(
                    $f['companyId'], $f['branchId'], $f['from'], $f['to'],
                    $f['page'], $f['perPage'], $f['search']
                ),
            ];
        }, 'Unable to generate sales by product report.');
    }

    public function salesByUser(Request $request): JsonResponse
    {
        $f = $this->filters($request);

        return $this->respond(function () use ($f) {
            return [
                'success' => true,
                ...$this->reportService->getSalesByUser(
                    $f['companyId'], $f['branchId'], $f['from'], $f['to'],
                    $f['page'], $f['perPage'], $f['search']
                ),
            ];
        }, 'Unable to generate sales by user report.');
    }

    public function paymentModeSummary(Request $request): JsonResponse
    {
        $f = $this->filters($request);

        return $this->respond(function () use ($f) {
            return [
                'success' => true,
                'data'    => $this->reportService->getPaymentModeSummary(
                    $f['companyId'], $f['branchId'], $f['from'], $f['to']
                ),
            ];
        }, 'Unable to generate payment mode summary.');
    }

    public function topProducts(Request $request): JsonResponse
    {
        $f = $this->filters($request, ['limit' => 'nullable|integer|min:1|max:100']);
        $limit = (int) ($f['limit'] ?? 10);

        return $this->respond(function () use ($f, $limit) {
            return [
                'success' => true,
                'data'    => $this->reportService->getTopProducts(
                    $f['companyId'], $f['branchId'], $f['from'], $f['to'], $limit
                ),
            ];
        }, 'Unable to generate top products report.');
    }

    public function topCustomers(Request $request): JsonResponse
    {
        $f = $this->filters($request, ['limit' => 'nullable|integer|min:1|max:100']);
        $limit = (int) ($f['limit'] ?? 10);

        return $this->respond(function () use ($f, $limit) {
            return [
                'success' => true,
                'data'    => $this->reportService->getTopCustomers(
                    $f['companyId'], $f['branchId'], $f['from'], $f['to'], $limit
                ),
            ];
        }, 'Unable to generate top customers report.');
    }

    public function gstSalesReport(Request $request): JsonResponse
    {
        $f = $this->filters($request);

        return $this->respond(function () use ($f) {
            return [
                'success' => true,
                ...$this->reportService->getGstSalesReport(
                    $f['companyId'], $f['branchId'], $f['from'], $f['to'],
                    $f['page'], $f['perPage'], $f['search']
                ),
            ];
        }, 'Unable to generate GST sales report.');
    }

    public function outstandingSales(Request $request): JsonResponse
    {
        $f = $this->filters($request);

        return $this->respond(function () use ($f) {
            return [
                'success' => true,
                ...$this->reportService->getOutstandingSales(
                    $f['companyId'], $f['branchId'], $f['from'], $f['to'],
                    $f['page'], $f['perPage'], $f['search']
                ),
            ];
        }, 'Unable to generate outstanding sales report.');
    }

    public function salesPurchaseTrend(Request $request): JsonResponse
    {
        $f = $this->filters($request);

        return $this->respond(function () use ($f) {
            return [
                'success' => true,
                'data'    => $this->reportService->getSalesPurchaseTrend(
                    $f['companyId'], $f['branchId'], $f['from'], $f['to']
                ),
            ];
        }, 'Unable to generate sales & purchase trend.');
    }

    /* -----------------------------------------------------------------
     |  PURCHASES
     * ---------------------------------------------------------------- */

    public function purchaseSummary(Request $request): JsonResponse
    {
        $f = $this->filters($request);

        return $this->respond(function () use ($f) {
            $data = $this->reportService->getPurchaseSummary(
                $f['companyId'], $f['branchId'], $f['from'], $f['to'],
                $f['page'], $f['perPage'], $f['search']
            );

            return [
                'success' => true,
                'data'    => $data['data'],
                'summary' => $data['summary'],
                'meta'    => $data['meta'],
            ];
        }, 'Unable to generate purchase summary report.');
    }

    public function purchaseRegister(Request $request): JsonResponse
    {
        $f = $this->filters($request);

        return $this->respond(function () use ($f) {
            return [
                'success' => true,
                ...$this->reportService->getPurchaseRegister(
                    $f['companyId'], $f['branchId'], $f['from'], $f['to'],
                    $f['page'], $f['perPage'], $f['search']
                ),
            ];
        }, 'Unable to generate purchase register report.');
    }

    public function purchaseByVendor(Request $request): JsonResponse
    {
        $f = $this->filters($request);

        return $this->respond(function () use ($f) {
            return [
                'success' => true,
                ...$this->reportService->getPurchaseByVendor(
                    $f['companyId'], $f['branchId'], $f['from'], $f['to'],
                    $f['page'], $f['perPage'], $f['search']
                ),
            ];
        }, 'Unable to generate purchase by vendor report.');
    }

    public function outstandingPurchases(Request $request): JsonResponse
    {
        $f = $this->filters($request);

        return $this->respond(function () use ($f) {
            return [
                'success' => true,
                ...$this->reportService->getOutstandingPurchases(
                    $f['companyId'], $f['branchId'], $f['from'], $f['to'],
                    $f['page'], $f['perPage'], $f['search']
                ),
            ];
        }, 'Unable to generate outstanding purchases report.');
    }

    /* -----------------------------------------------------------------
     |  LEDGERS
     * ---------------------------------------------------------------- */

    public function generalLedger(Request $request): JsonResponse
    {
        $f = $this->filters($request, ['account_id' => 'nullable|integer']);

        return $this->respond(function () use ($f, $request) {
            return [
                'success' => true,
                ...$this->reportService->getGeneralLedger(
                    $f['companyId'], $f['branchId'], $f['from'], $f['to'],
                    $f['page'], $f['perPage'],
                    $request->query('account_id') ? (int) $request->query('account_id') : null,
                    $f['search']
                ),
            ];
        }, 'Unable to generate general ledger report.');
    }

    public function customerLedger(Request $request): JsonResponse
    {
        $f = $this->filters($request, ['customer_id' => 'nullable|integer']);

        return $this->respond(function () use ($f, $request) {
            return [
                'success' => true,
                ...$this->reportService->getCustomerLedger(
                    $f['companyId'], $f['branchId'],
                    $request->query('customer_id') ? (int) $request->query('customer_id') : null,
                    $f['from'], $f['to'], $f['page'], $f['perPage']
                ),
            ];
        }, 'Unable to generate customer ledger report.');
    }

    public function vendorLedger(Request $request): JsonResponse
    {
        $f = $this->filters($request, ['vendor_id' => 'nullable|integer']);

        return $this->respond(function () use ($f, $request) {
            return [
                'success' => true,
                ...$this->reportService->getVendorLedger(
                    $f['companyId'], $f['branchId'],
                    $request->query('vendor_id') ? (int) $request->query('vendor_id') : null,
                    $f['from'], $f['to'], $f['page'], $f['perPage']
                ),
            ];
        }, 'Unable to generate vendor ledger report.');
    }

    public function dayBook(Request $request): JsonResponse
    {
        $f = $this->filters($request);

        return $this->respond(function () use ($f) {
            return [
                'success' => true,
                ...$this->reportService->getDayBook(
                    $f['companyId'], $f['branchId'], $f['from'], $f['to'],
                    $f['page'], $f['perPage'], $f['search']
                ),
            ];
        }, 'Unable to generate day book.');
    }

    /* -----------------------------------------------------------------
     |  ACCOUNTING
     * ---------------------------------------------------------------- */

    public function profitLoss(Request $request): JsonResponse
    {
        $f = $this->filters($request);

        return $this->respond(function () use ($f) {
            return [
                'success' => true,
                'data'    => $this->reportService->getDetailedProfitLoss(
                    $f['companyId'], $f['branchId'], $f['from'], $f['to']
                ),
            ];
        }, 'Unable to generate profit & loss report.');
    }

    public function profitLossSummary(Request $request): JsonResponse
    {
        $f = $this->filters($request);

        return $this->respond(function () use ($f) {
            return [
                'success' => true,
                'data'    => $this->reportService->getProfitLossSummary(
                    $f['companyId'], $f['branchId'], $f['from'], $f['to']
                ),
            ];
        }, 'Unable to generate profit summary report.');
    }

    /**
     * Bill-wise profitability.
     *
     * Authoritative backend calculation:
     *   GP  = Σ [(invoice_item.unit_price − purchase_cost) × qty − discount]
     *   COGS = Σ [purchase_cost × qty]
     *   Net Profit = Gross Profit − Recorded Expenses (period-level)
     *
     * Cost source priority: latest purchase-item unit price → product.purchase_price.
     * When neither exists the line is flagged cost_missing — never assumed as zero.
     */
    public function invoiceProfitability(Request $request): JsonResponse
    {
        $f = $this->filters($request, [
            'payment_status' => 'nullable|string|max:30',
        ]);

        return $this->respond(function () use ($f, $request) {
            $result = $this->reportService->getInvoiceProfitability(
                $f['companyId'],
                $f['branchId'],
                $f['from'],
                $f['to'],
                $f['page'],
                $f['perPage'],
                $f['search'],
                $request->query('payment_status')
            );

            return [
                'success' => true,
                'data'    => $result['data'],
                'summary' => $result['summary'],
                'meta'    => $result['meta'],
            ];
        }, 'Unable to generate invoice profitability report.');
    }

    public function invoiceProfitabilityDetail(Request $request, $invoice): JsonResponse
    {
        $f = $this->filters($request);

        return $this->respond(function () use ($f, $invoice) {
            return [
                'success' => true,
                'data'    => $this->reportService->getInvoiceProfitabilityDetail(
                    $f['companyId'], $f['branchId'], $invoice
                ),
            ];
        }, 'Unable to generate invoice profitability detail.', 404);
    }

    public function productProfitability(Request $request): JsonResponse
    {
        $f = $this->filters($request);

        return $this->respond(function () use ($f) {
            return [
                'success' => true,
                ...$this->reportService->getProductProfitability(
                    $f['companyId'], $f['branchId'], $f['from'], $f['to'],
                    $f['page'], $f['perPage'], $f['search']
                ),
            ];
        }, 'Unable to generate product profitability report.');
    }

    public function profitLossProducts(Request $request): JsonResponse
    {
        $f = $this->filters($request);

        return $this->respond(function () use ($f) {
            return [
                'success' => true,
                ...$this->reportService->getProfitLossProducts(
                    $f['companyId'], $f['branchId'], $f['from'], $f['to'],
                    $f['page'], $f['perPage']
                ),
            ];
        }, 'Unable to generate product profit report.');
    }

    public function profitLossCustomers(Request $request): JsonResponse
    {
        $f = $this->filters($request);

        return $this->respond(function () use ($f) {
            return [
                'success' => true,
                ...$this->reportService->getProfitLossCustomers(
                    $f['companyId'], $f['branchId'], $f['from'], $f['to'],
                    $f['page'], $f['perPage'], $f['search']
                ),
            ];
        }, 'Unable to generate customer profit report.');
    }

    public function profitLossBranches(Request $request): JsonResponse
    {
        $f = $this->filters($request);

        return $this->respond(function () use ($f) {
            return [
                'success' => true,
                ...$this->reportService->getProfitLossBranches(
                    $f['companyId'], $f['branchId'], $f['from'], $f['to'],
                    $f['page'], $f['perPage'], $f['search']
                ),
            ];
        }, 'Unable to generate branch profit report.');
    }

    public function profitLossMonthly(Request $request): JsonResponse
    {
        $f = $this->filters($request);

        return $this->respond(function () use ($f) {
            return [
                'success' => true,
                'data'    => $this->reportService->getProfitLossMonthly(
                    $f['companyId'], $f['branchId'], $f['from'], $f['to']
                ),
            ];
        }, 'Unable to generate monthly profit report.');
    }

    public function profitLossYearly(Request $request): JsonResponse
    {
        $f = $this->filters($request);

        return $this->respond(function () use ($f) {
            return [
                'success' => true,
                'data'    => $this->reportService->getProfitLossYearly(
                    $f['companyId'], $f['branchId'], $f['from'], $f['to']
                ),
            ];
        }, 'Unable to generate yearly profit report.');
    }

    public function profitLossComparison(Request $request): JsonResponse
    {
        $f = $this->filters($request);

        return $this->respond(function () use ($f) {
            return [
                'success' => true,
                'data'    => $this->reportService->getProfitLossComparison(
                    $f['companyId'], $f['branchId'], $f['from'], $f['to']
                ),
            ];
        }, 'Unable to generate profit comparison report.');
    }

    public function trialBalance(Request $request): JsonResponse
    {
        $f = $this->filters($request);

        return $this->respond(function () use ($f) {
            return [
                'success' => true,
                'data'    => $this->reportService->getTrialBalance(
                    $f['companyId'], $f['branchId'], $f['from'], $f['to']
                ),
            ];
        }, 'Unable to generate trial balance.');
    }

    public function balanceSheet(Request $request): JsonResponse
    {
        $f = $this->filters($request);

        return $this->respond(function () use ($f) {
            return [
                'success' => true,
                'data'    => $this->reportService->getBalanceSheet(
                    $f['companyId'], $f['branchId'], $f['from'], $f['to']
                ),
            ];
        }, 'Unable to generate balance sheet.');
    }

    public function cashFlow(Request $request): JsonResponse
    {
        $f = $this->filters($request);

        return $this->respond(function () use ($f) {
            return [
                'success' => true,
                'data'    => $this->reportService->getCashFlowSummary(
                    $f['companyId'], $f['branchId'], $f['from'], $f['to']
                ),
            ];
        }, 'Unable to generate cash flow summary.');
    }

    public function expenseReport(Request $request): JsonResponse
    {
        $f = $this->filters($request);

        return $this->respond(function () use ($f) {
            return [
                'success' => true,
                ...$this->reportService->getExpenseReport(
                    $f['companyId'], $f['branchId'], $f['from'], $f['to'],
                    $f['page'], $f['perPage'], $f['search']
                ),
            ];
        }, 'Unable to generate expense report.');
    }

    public function receivablesAging(Request $request): JsonResponse
    {
        $f = $this->filters($request);

        return $this->respond(function () use ($f) {
            return [
                'success' => true,
                ...$this->reportService->getReceivablesAging(
                    $f['companyId'], $f['branchId'], $f['to'], $f['page'], $f['perPage']
                ),
            ];
        }, 'Unable to generate receivables aging report.');
    }

    public function payablesAging(Request $request): JsonResponse
    {
        $f = $this->filters($request);

        return $this->respond(function () use ($f) {
            return [
                'success' => true,
                ...$this->reportService->getPayablesAging(
                    $f['companyId'], $f['branchId'], $f['to'], $f['page'], $f['perPage']
                ),
            ];
        }, 'Unable to generate payables aging report.');
    }

    /* -----------------------------------------------------------------
     |  GST
     * ---------------------------------------------------------------- */

    public function gstSummary(Request $request): JsonResponse
    {
        $f = $this->filters($request);

        return $this->respond(function () use ($f) {
            return [
                'success' => true,
                'data'    => $this->reportService->getGstSummary(
                    $f['companyId'], $f['branchId'], $f['from'], $f['to']
                ),
            ];
        }, 'Unable to generate GST summary.');
    }

    public function gstRateWiseSummary(Request $request): JsonResponse
    {
        $f = $this->filters($request);

        return $this->respond(function () use ($f) {
            return [
                'success' => true,
                'data'    => $this->reportService->getGstRateWiseSummary(
                    $f['companyId'], $f['branchId'], $f['from'], $f['to']
                ),
            ];
        }, 'Unable to generate GST rate-wise summary.');
    }

    /* -----------------------------------------------------------------
     |  INVENTORY / STOCK
     * ---------------------------------------------------------------- */

    public function stockSummary(Request $request): JsonResponse
    {
        $f = $this->filters($request);

        return $this->respond(function () use ($f) {
            return [
                'success' => true,
                ...$this->reportService->getStockSummary(
                    $f['companyId'], $f['branchId'], $f['page'], $f['perPage'], $f['search']
                ),
            ];
        }, 'Unable to generate stock summary.');
    }

    public function lowStock(Request $request): JsonResponse
    {
        $f = $this->filters($request);

        return $this->respond(function () use ($f) {
            return [
                'success' => true,
                ...$this->reportService->getLowStockReport(
                    $f['companyId'], $f['branchId'], $f['page'], $f['perPage'], $f['search']
                ),
            ];
        }, 'Unable to generate low stock report.');
    }

    public function stockMovement(Request $request): JsonResponse
    {
        $f = $this->filters($request, ['product_id' => 'nullable|integer']);

        return $this->respond(function () use ($f, $request) {
            return [
                'success' => true,
                ...$this->reportService->getStockMovement(
                    $f['companyId'], $f['branchId'],
                    $request->query('product_id') ? (int) $request->query('product_id') : null,
                    $f['from'], $f['to'], $f['page'], $f['perPage']
                ),
            ];
        }, 'Unable to generate stock movement report.');
    }

    /* -----------------------------------------------------------------
     |  BRANCH
     * ---------------------------------------------------------------- */

    public function branchPerformance(Request $request): JsonResponse
    {
        $f = $this->filters($request);

        return $this->respond(function () use ($f) {
            return [
                'success' => true,
                'data'    => $this->reportService->getBranchPerformance(
                    $f['companyId'], $f['from'], $f['to']
                ),
            ];
        }, 'Unable to generate branch performance report.');
    }
}