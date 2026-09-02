<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ReportService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class ReportController extends Controller
{
    private ReportService $reportService;

    public function __construct(ReportService $reportService)
    {
        $this->reportService = $reportService;
    }

    /**
     * Dashboard summary (Overview)
     */
    public function summary(Request $request): JsonResponse
    {
        try {
            $companyId = auth()->user()->company_id ?? null;
            $branchId = $request->query('branch_id');
            $from = $request->query('from', date('Y-04-01'));
            $to = $request->query('to', date('Y-m-d'));

            $data = $this->reportService->getDashboardSummary($companyId, $branchId, $from, $to);

            return response()->json([
                'success' => true,
                'data' => $data,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Unable to generate dashboard summary.',
            ], 500);
        }
    }

    /**
     * SALES REPORTS
     */

    public function salesSummary(Request $request): JsonResponse
    {
        try {
            $companyId = auth()->user()->company_id ?? null;
            $branchId = $request->query('branch_id');
            $from = $request->query('from');
            $to = $request->query('to');
            $page = $request->query('page', 1);
            $perPage = $request->query('per_page', 25);

            $data = $this->reportService->getSalesSummary($companyId, $branchId, $from, $to, $page, $perPage);

            return response()->json([
                'success' => true,
                'data' => $data['data'],
                'summary' => $data['summary'],
                'meta' => $data['meta'],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Unable to generate sales summary report.',
            ], 500);
        }
    }

    public function salesRegister(Request $request): JsonResponse
    {
        try {
            $companyId = auth()->user()->company_id ?? null;
            $branchId = $request->query('branch_id');
            $from = $request->query('from');
            $to = $request->query('to');
            $page = $request->query('page', 1);
            $perPage = $request->query('per_page', 25);

            $data = $this->reportService->getSalesRegister($companyId, $branchId, $from, $to, $page, $perPage);

            return response()->json([
                'success' => true,
                ...$data,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Unable to generate sales register.',
            ], 500);
        }
    }

    public function salesByCustomer(Request $request): JsonResponse
    {
        try {
            $companyId = auth()->user()->company_id ?? null;
            $branchId = $request->query('branch_id');
            $from = $request->query('from');
            $to = $request->query('to');
            $page = $request->query('page', 1);
            $perPage = $request->query('per_page', 25);

            $data = $this->reportService->getSalesByCustomer($companyId, $branchId, $from, $to, $page, $perPage);

            return response()->json([
                'success' => true,
                ...$data,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Unable to generate sales by customer report.',
            ], 500);
        }
    }

    public function salesByProduct(Request $request): JsonResponse
    {
        try {
            $companyId = auth()->user()->company_id ?? null;
            $branchId = $request->query('branch_id');
            $from = $request->query('from');
            $to = $request->query('to');
            $page = $request->query('page', 1);
            $perPage = $request->query('per_page', 25);

            $data = $this->reportService->getSalesByProduct($companyId, $branchId, $from, $to, $page, $perPage);

            return response()->json([
                'success' => true,
                ...$data,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Unable to generate sales by product report.',
            ], 500);
        }
    }

    public function gstSalesReport(Request $request): JsonResponse
    {
        try {
            $companyId = auth()->user()->company_id ?? null;
            $branchId = $request->query('branch_id');
            $from = $request->query('from');
            $to = $request->query('to');
            $page = $request->query('page', 1);
            $perPage = $request->query('per_page', 25);

            $data = $this->reportService->getGstSalesReport($companyId, $branchId, $from, $to, $page, $perPage);

            return response()->json([
                'success' => true,
                ...$data,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Unable to generate GST sales report.',
            ], 500);
        }
    }

    public function outstandingSales(Request $request): JsonResponse
    {
        try {
            $companyId = auth()->user()->company_id ?? null;
            $branchId = $request->query('branch_id');
            $from = $request->query('from');
            $to = $request->query('to');
            $page = $request->query('page', 1);
            $perPage = $request->query('per_page', 25);

            $data = $this->reportService->getOutstandingSales($companyId, $branchId, $from, $to, $page, $perPage);

            return response()->json([
                'success' => true,
                ...$data,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Unable to generate outstanding sales report.',
            ], 500);
        }
    }

    /**
     * PURCHASE REPORTS
     */

    public function purchaseSummary(Request $request): JsonResponse
    {
        try {
            $companyId = auth()->user()->company_id ?? null;
            $branchId = $request->query('branch_id');
            $from = $request->query('from');
            $to = $request->query('to');
            $page = $request->query('page', 1);
            $perPage = $request->query('per_page', 25);

            $data = $this->reportService->getPurchaseSummary($companyId, $branchId, $from, $to, $page, $perPage);

            return response()->json([
                'success' => true,
                'data' => $data['data'],
                'summary' => $data['summary'],
                'meta' => $data['meta'],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Unable to generate purchase summary report.',
            ], 500);
        }
    }

    public function purchaseRegister(Request $request): JsonResponse
    {
        try {
            $companyId = auth()->user()->company_id ?? null;
            $branchId = $request->query('branch_id');
            $from = $request->query('from');
            $to = $request->query('to');
            $page = (int) $request->query('page', 1);
            $perPage = (int) $request->query('per_page', 25);

            $data = $this->reportService->getPurchaseRegister($companyId, $branchId, $from, $to, $page, $perPage);

            return response()->json([
                'success' => true,
                ...$data,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Unable to generate purchase register report.',
            ], 500);
        }
    }

    public function purchaseByVendor(Request $request): JsonResponse
    {
        try {
            $companyId = auth()->user()->company_id ?? null;
            $branchId = $request->query('branch_id');
            $from = $request->query('from');
            $to = $request->query('to');
            $page = (int) $request->query('page', 1);
            $perPage = (int) $request->query('per_page', 25);

            $data = $this->reportService->getPurchaseByVendor($companyId, $branchId, $from, $to, $page, $perPage);

            return response()->json([
                'success' => true,
                ...$data,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Unable to generate purchase by vendor report.',
            ], 500);
        }
    }

    public function outstandingPurchases(Request $request): JsonResponse
    {
        try {
            $companyId = auth()->user()->company_id ?? null;
            $branchId = $request->query('branch_id');
            $from = $request->query('from');
            $to = $request->query('to');
            $page = $request->query('page', 1);
            $perPage = $request->query('per_page', 25);

            $data = $this->reportService->getOutstandingPurchases($companyId, $branchId, $from, $to, $page, $perPage);

            return response()->json([
                'success' => true,
                ...$data,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Unable to generate outstanding purchases report.',
            ], 500);
        }
    }

    public function generalLedger(Request $request): JsonResponse
    {
        try {
            $companyId = auth()->user()->company_id ?? null;
            $branchId = $request->query('branch_id');
            $from = $request->query('from');
            $to = $request->query('to');
            $page = (int) $request->query('page', 1);
            $perPage = (int) $request->query('per_page', 100);

            $data = $this->reportService->getGeneralLedger($companyId, $branchId, $from, $to, $page, $perPage);

            return response()->json([
                'success' => true,
                ...$data,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Unable to generate general ledger report.',
            ], 500);
        }
    }

    public function customerLedger(Request $request): JsonResponse
    {
        try {
            $companyId = auth()->user()->company_id ?? null;
            $branchId = $request->query('branch_id');
            $customerId = $request->query('customer_id');
            $from = $request->query('from');
            $to = $request->query('to');
            $page = (int) $request->query('page', 1);
            $perPage = (int) $request->query('per_page', 100);

            $data = $this->reportService->getCustomerLedger($companyId, $branchId, $customerId, $from, $to, $page, $perPage);

            return response()->json([
                'success' => true,
                ...$data,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Unable to generate customer ledger report.',
            ], 500);
        }
    }

    /**
     * ACCOUNTING REPORTS
     */

    public function profitLoss(Request $request): JsonResponse
    {
        try {
            $companyId = auth()->user()->company_id ?? null;
            $branchId = $request->query('branch_id');
            $from = $request->query('from');
            $to = $request->query('to');

            $data = $this->reportService->getDetailedProfitLoss($companyId, $branchId, $from, $to);

            return response()->json($data);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Unable to generate profit & loss report.',
            ], 500);
        }
    }

    public function invoiceProfitability(Request $request): JsonResponse
    {
        try {
            $companyId = auth()->user()->company_id ?? null;
            $branchId = $request->query('branch_id');
            $from = $request->query('from');
            $to = $request->query('to');
            $page = (int) $request->query('page', 1);
            $perPage = (int) $request->query('per_page', 25);

            $data = $this->reportService->getInvoiceProfitability($companyId, $branchId, $from, $to, $page, $perPage);

            return response()->json($data);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Unable to generate invoice profitability report.',
            ], 500);
        }
    }

    public function invoiceProfitabilityDetail(Request $request, $invoice): JsonResponse
    {
        try {
            $companyId = auth()->user()->company_id ?? null;
            $branchId = $request->query('branch_id');

            $data = $this->reportService->getInvoiceProfitabilityDetail($companyId, $branchId, $invoice);

            return response()->json($data);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Unable to generate invoice profitability detail.',
            ], 404);
        }
    }

    public function productProfitability(Request $request): JsonResponse
    {
        try {
            $companyId = auth()->user()->company_id ?? null;
            $branchId = $request->query('branch_id');
            $from = $request->query('from');
            $to = $request->query('to');
            $page = (int) $request->query('page', 1);
            $perPage = (int) $request->query('per_page', 25);

            $data = $this->reportService->getProductProfitability($companyId, $branchId, $from, $to, $page, $perPage);

            return response()->json($data);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Unable to generate product profitability report.',
            ], 500);
        }
    }

    public function profitLossSummary(Request $request): JsonResponse
    {
        try {
            $companyId = auth()->user()->company_id ?? null;
            $branchId = $request->query('branch_id');
            $from = $request->query('from');
            $to = $request->query('to');

            return response()->json($this->reportService->getProfitLossSummary($companyId, $branchId, $from, $to));
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Unable to generate profit summary report.',
            ], 500);
        }
    }

    public function profitLossProducts(Request $request): JsonResponse
    {
        try {
            $companyId = auth()->user()->company_id ?? null;
            $branchId = $request->query('branch_id');
            $from = $request->query('from');
            $to = $request->query('to');
            $page = (int) $request->query('page', 1);
            $perPage = (int) $request->query('per_page', 25);

            return response()->json($this->reportService->getProfitLossProducts($companyId, $branchId, $from, $to, $page, $perPage));
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Unable to generate product profit report.',
            ], 500);
        }
    }

    public function profitLossCustomers(Request $request): JsonResponse
    {
        try {
            $companyId = auth()->user()->company_id ?? null;
            $branchId = $request->query('branch_id');
            $from = $request->query('from');
            $to = $request->query('to');
            $page = (int) $request->query('page', 1);
            $perPage = (int) $request->query('per_page', 25);

            return response()->json($this->reportService->getProfitLossCustomers($companyId, $branchId, $from, $to, $page, $perPage));
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Unable to generate customer profit report.',
            ], 500);
        }
    }

    public function profitLossBranches(Request $request): JsonResponse
    {
        try {
            $companyId = auth()->user()->company_id ?? null;
            $branchId = $request->query('branch_id');
            $from = $request->query('from');
            $to = $request->query('to');
            $page = (int) $request->query('page', 1);
            $perPage = (int) $request->query('per_page', 25);

            return response()->json($this->reportService->getProfitLossBranches($companyId, $branchId, $from, $to, $page, $perPage));
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Unable to generate branch profit report.',
            ], 500);
        }
    }

    public function profitLossMonthly(Request $request): JsonResponse
    {
        try {
            $companyId = auth()->user()->company_id ?? null;
            $branchId = $request->query('branch_id');
            $from = $request->query('from');
            $to = $request->query('to');

            return response()->json($this->reportService->getProfitLossMonthly($companyId, $branchId, $from, $to));
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Unable to generate monthly profit report.',
            ], 500);
        }
    }

    public function profitLossYearly(Request $request): JsonResponse
    {
        try {
            $companyId = auth()->user()->company_id ?? null;
            $branchId = $request->query('branch_id');
            $from = $request->query('from');
            $to = $request->query('to');

            return response()->json($this->reportService->getProfitLossYearly($companyId, $branchId, $from, $to));
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Unable to generate yearly profit report.',
            ], 500);
        }
    }

    public function profitLossComparison(Request $request): JsonResponse
    {
        try {
            $companyId = auth()->user()->company_id ?? null;
            $branchId = $request->query('branch_id');
            $from = $request->query('from');
            $to = $request->query('to');

            return response()->json($this->reportService->getProfitLossComparison($companyId, $branchId, $from, $to));
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Unable to generate profit comparison report.',
            ], 500);
        }
    }

    /**
     * GST REPORTS
     */

    public function gstSummary(Request $request): JsonResponse
    {
        try {
            $companyId = auth()->user()->company_id ?? null;
            $from = $request->query('from');
            $to = $request->query('to');

            $data = $this->reportService->getGstSummary($companyId, $from, $to);

            return response()->json($data);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Unable to generate GST summary.',
            ], 500);
        }
    }
}
