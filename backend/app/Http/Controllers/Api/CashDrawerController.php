<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\CashDrawer\CashInRequest;
use App\Http\Requests\CashDrawer\CashOutRequest;
use App\Http\Requests\CashDrawer\CloseSessionRequest;
use App\Http\Requests\CashDrawer\OpenSessionRequest;
use App\Http\Requests\CashDrawer\StoreCashDrawerRequest;
use App\Http\Requests\CashDrawer\TransferRequest;
use App\Models\Branch;
use App\Models\CashDrawer;
use App\Models\CashDrawerAuditLog;
use App\Models\CashDrawerSession;
use App\Models\CashDrawerTransaction;
use App\Models\CashDrawerTransfer;
use App\Models\User;
use App\Services\CashDrawerService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;

class CashDrawerController extends Controller
{
    protected CashDrawerService $cashDrawerService;

    public function __construct(CashDrawerService $cashDrawerService)
    {
        $this->cashDrawerService = $cashDrawerService;
    }

    /**
     * Authorize that the authenticated user can access the target company and branch.
     */
    private function validateTenantScope(?int $targetCompanyId, ?int $targetBranchId = null): array
    {
        $user = Auth::user();
        $isAdmin = $user && ($user->hasRole('Admin') || $user->hasRole('Super Admin'));

        $companyId = $targetCompanyId ?: ($user?->company_id ?: 1);

        if (!$isAdmin && $user?->company_id && (int) $user->company_id !== (int) $companyId) {
            abort(403, 'Unauthorized company access.');
        }

        $branchId = $targetBranchId;
        if (!$isAdmin && $user?->branch_id) {
            if ($branchId && (int) $branchId !== (int) $user->branch_id) {
                abort(403, 'Unauthorized branch access.');
            }
            $branchId = (int) $user->branch_id;
        }

        return [$companyId, $branchId];
    }

    /**
     * Verify user has access to a specific cash drawer.
     */
    private function authorizeDrawer(CashDrawer $drawer): void
    {
        $this->validateTenantScope($drawer->company_id, $drawer->branch_id);
    }

    /* ==================================================================
     |  1. CASH DRAWERS LIST & CRUD
     | ================================================================== */

    public function index(Request $request): JsonResponse
    {
        [$companyId, $userBranchId] = $this->validateTenantScope(
            $request->filled('company_id') ? (int) $request->input('company_id') : null,
            $request->filled('branch_id') && $request->input('branch_id') !== 'all' ? (int) $request->input('branch_id') : null
        );

        $query = CashDrawer::where('company_id', $companyId)
            ->with(['branch', 'bankAccount', 'activeSession.cashier'])
            ->orderByDesc('is_default')
            ->orderBy('name');

        if ($userBranchId) {
            $query->where('branch_id', $userBranchId);
        }

        if ($request->filled('status') && $request->input('status') !== 'all') {
            $query->where('status', $request->input('status'));
        }

        if ($request->filled('search')) {
            $s = trim($request->input('search'));
            $query->where(function ($q) use ($s) {
                $q->where('name', 'like', "%{$s}%")
                    ->orWhere('code', 'like', "%{$s}%");
            });
        }

        $drawers = $query->get()->map(function ($d) {
            $data = $d->toArray();
            $data['is_open'] = $d->activeSession !== null;
            $data['suggested_opening_cash'] = $this->cashDrawerService->getPreviousClosingCash($d);
            return $data;
        });

        return response()->json([
            'success' => true,
            'data' => $drawers,
        ]);
    }

    public function store(StoreCashDrawerRequest $request): JsonResponse
    {
        $user = Auth::user();
        $data = $request->validated();

        [$companyId, $branchId] = $this->validateTenantScope(
            $data['company_id'] ?? $user?->company_id ?? 1,
            $data['branch_id']
        );

        $data['company_id'] = $companyId;
        $data['branch_id'] = $branchId;
        $data['created_by'] = $user?->id;
        $data['current_balance'] = $data['starting_balance'] ?? 0.00;

        $drawer = DB::transaction(function () use ($data, $user) {
            if (!empty($data['is_default'])) {
                CashDrawer::where('company_id', $data['company_id'])
                    ->where('branch_id', $data['branch_id'])
                    ->update(['is_default' => false]);
            }

            return CashDrawer::create($data);
        });

        return response()->json([
            'success' => true,
            'message' => "Cash drawer '{$drawer->name}' created successfully.",
            'data' => $drawer->fresh(['branch', 'bankAccount']),
        ], 201);
    }

    public function show(int $id): JsonResponse
    {
        $drawer = CashDrawer::with(['branch', 'bankAccount', 'activeSession.cashier', 'activeSession.transactions.creator'])
            ->findOrFail($id);

        $this->authorizeDrawer($drawer);

        $data = $drawer->toArray();
        $data['is_open'] = $drawer->activeSession !== null;
        $data['suggested_opening_cash'] = $this->cashDrawerService->getPreviousClosingCash($drawer);

        return response()->json([
            'success' => true,
            'data' => $data,
        ]);
    }

    public function update(StoreCashDrawerRequest $request, int $id): JsonResponse
    {
        $drawer = CashDrawer::findOrFail($id);
        $this->authorizeDrawer($drawer);

        $user = Auth::user();
        $data = $request->validated();

        $drawer = DB::transaction(function () use ($drawer, $data, $user) {
            if (!empty($data['is_default'])) {
                CashDrawer::where('company_id', $drawer->company_id)
                    ->where('branch_id', $drawer->branch_id)
                    ->where('id', '!=', $drawer->id)
                    ->update(['is_default' => false]);
            }

            $data['updated_by'] = $user?->id;
            $drawer->update($data);

            return $drawer->fresh(['branch', 'bankAccount']);
        });

        return response()->json([
            'success' => true,
            'message' => "Cash drawer updated successfully.",
            'data' => $drawer,
        ]);
    }

    /* ==================================================================
     |  2. CASH SESSIONS (OPEN & CLOSE)
     | ================================================================== */

    public function getActiveSession(int $drawerId): JsonResponse
    {
        $drawer = CashDrawer::findOrFail($drawerId);
        $this->authorizeDrawer($drawer);

        $session = CashDrawerSession::where('cash_drawer_id', $drawer->id)
            ->where('status', 'open')
            ->with(['cashier', 'transactions.creator'])
            ->first();

        return response()->json([
            'success' => true,
            'is_open' => $session !== null,
            'data' => $session,
            'suggested_opening_cash' => $this->cashDrawerService->getPreviousClosingCash($drawer),
        ]);
    }

    public function openSession(OpenSessionRequest $request, int $drawerId): JsonResponse
    {
        $drawer = CashDrawer::findOrFail($drawerId);
        $this->authorizeDrawer($drawer);

        $user = Auth::user();
        $session = $this->cashDrawerService->openSession($drawer, $user, $request->validated());

        return response()->json([
            'success' => true,
            'message' => "Cash drawer session #{$session->session_number} opened successfully.",
            'data' => $session,
        ], 201);
    }

    public function closeSession(CloseSessionRequest $request, int $drawerId): JsonResponse
    {
        $drawer = CashDrawer::findOrFail($drawerId);
        $this->authorizeDrawer($drawer);

        $activeSession = CashDrawerSession::where('cash_drawer_id', $drawer->id)
            ->where('status', 'open')
            ->firstOrFail();

        $user = Auth::user();
        $session = $this->cashDrawerService->closeSession($activeSession, $user, $request->validated());

        $hasDiff = abs((float) $session->closing_difference) > 0.009;
        $msg = $hasDiff
            ? "Session closed with discrepancy of ₹" . abs((float) $session->closing_difference) . " (" . ($session->closing_difference < 0 ? 'Shortage' : 'Excess') . "). Pending manager review."
            : "Session closed and reconciled successfully with zero discrepancy.";

        return response()->json([
            'success' => true,
            'message' => $msg,
            'data' => $session,
        ]);
    }

    public function reviewDiscrepancy(Request $request, int $sessionId): JsonResponse
    {
        $request->validate([
            'action' => 'required|in:approve,reject',
            'notes'  => 'nullable|string|max:1000',
        ]);

        $session = CashDrawerSession::with('cashDrawer')->findOrFail($sessionId);
        $this->authorizeDrawer($session->cashDrawer);

        $user = Auth::user();
        $approve = $request->input('action') === 'approve';
        $session = $this->cashDrawerService->reviewDiscrepancy($session, $user, $approve, $request->input('notes'));

        return response()->json([
            'success' => true,
            'message' => "Closing discrepancy " . ($approve ? "approved" : "rejected") . " successfully.",
            'data' => $session,
        ]);
    }

    public function listSessions(Request $request, int $drawerId): JsonResponse
    {
        $drawer = CashDrawer::findOrFail($drawerId);
        $this->authorizeDrawer($drawer);

        $query = CashDrawerSession::where('cash_drawer_id', $drawer->id)
            ->with(['cashier', 'closer', 'approver'])
            ->orderByDesc('opened_at')
            ->orderByDesc('id');

        if ($request->filled('status') && $request->input('status') !== 'all') {
            $query->where('status', $request->input('status'));
        }

        if ($request->filled('date_from')) {
            $query->whereDate('opened_at', '>=', $request->input('date_from'));
        }
        if ($request->filled('date_to')) {
            $query->whereDate('opened_at', '<=', $request->input('date_to'));
        }

        $sessions = $query->paginate($request->input('per_page', 20));

        return response()->json([
            'success' => true,
            'data' => $sessions->items(),
            'meta' => [
                'current_page' => $sessions->currentPage(),
                'last_page' => $sessions->lastPage(),
                'total' => $sessions->total(),
            ],
        ]);
    }

    /* ==================================================================
     |  3. CASH IN & CASH OUT TRANSACTIONS
     | ================================================================== */

    public function cashIn(CashInRequest $request, int $drawerId): JsonResponse
    {
        $drawer = CashDrawer::findOrFail($drawerId);
        $this->authorizeDrawer($drawer);

        $user = Auth::user();
        $txn = $this->cashDrawerService->recordCashIn($drawer, $user, $request->validated());

        return response()->json([
            'success' => true,
            'message' => "Cash in of ₹{$txn->amount} recorded successfully.",
            'data' => $txn->load('creator'),
        ], 201);
    }

    public function cashOut(CashOutRequest $request, int $drawerId): JsonResponse
    {
        $drawer = CashDrawer::findOrFail($drawerId);
        $this->authorizeDrawer($drawer);

        $user = Auth::user();
        $txn = $this->cashDrawerService->recordCashOut($drawer, $user, $request->validated());

        return response()->json([
            'success' => true,
            'message' => "Cash out of ₹{$txn->amount} recorded successfully.",
            'data' => $txn->load('creator'),
        ], 201);
    }

    public function listTransactions(Request $request, ?int $drawerId = null): JsonResponse
    {
        [$companyId, $userBranchId] = $this->validateTenantScope(
            $request->filled('company_id') ? (int) $request->input('company_id') : null,
            $request->filled('branch_id') && $request->input('branch_id') !== 'all' ? (int) $request->input('branch_id') : null
        );

        $query = CashDrawerTransaction::where('company_id', $companyId)
            ->with(['cashDrawer', 'session', 'creator', 'branch'])
            ->orderByDesc('transaction_date')
            ->orderByDesc('id');

        if ($drawerId) {
            $drawer = CashDrawer::findOrFail($drawerId);
            $this->authorizeDrawer($drawer);
            $query->where('cash_drawer_id', $drawerId);
        } elseif ($request->filled('cash_drawer_id')) {
            $query->where('cash_drawer_id', (int) $request->input('cash_drawer_id'));
        }

        if ($userBranchId) {
            $query->where('branch_id', $userBranchId);
        }

        if ($request->filled('transaction_type') && $request->input('transaction_type') !== 'all') {
            $query->where('transaction_type', $request->input('transaction_type'));
        }

        if ($request->filled('category') && $request->input('category') !== 'all') {
            $query->where('category', $request->input('category'));
        }

        if ($request->filled('date_from')) {
            $query->whereDate('transaction_date', '>=', $request->input('date_from'));
        }
        if ($request->filled('date_to')) {
            $query->whereDate('transaction_date', '<=', $request->input('date_to'));
        }

        if ($request->filled('search')) {
            $s = trim($request->input('search'));
            $query->where(function ($q) use ($s) {
                $q->where('transaction_number', 'like', "%{$s}%")
                    ->orWhere('reference_no', 'like', "%{$s}%")
                    ->orWhere('received_from_or_paid_to', 'like', "%{$s}%")
                    ->orWhere('description', 'like', "%{$s}%");
            });
        }

        $perPage = min(100, max(5, (int) $request->input('per_page', 25)));
        $paginator = $query->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => $paginator->items(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    /* ==================================================================
     |  4. CASH TRANSFERS (MULTI-STEP WORKFLOW)
     | ================================================================== */

    public function initiateTransfer(TransferRequest $request): JsonResponse
    {
        $user = Auth::user();
        $sourceDrawer = CashDrawer::findOrFail($request->input('source_drawer_id'));
        $destDrawer = CashDrawer::findOrFail($request->input('destination_drawer_id'));

        $this->authorizeDrawer($sourceDrawer);

        $transfer = $this->cashDrawerService->initiateTransfer(
            $sourceDrawer,
            $destDrawer,
            $user,
            (float) $request->input('amount'),
            $request->input('notes')
        );

        return response()->json([
            'success' => true,
            'message' => "Transfer #{$transfer->transfer_number} initiated. Cash dispatched.",
            'data' => $transfer,
        ], 201);
    }

    public function receiveTransfer(Request $request, int $id): JsonResponse
    {
        $user = Auth::user();
        $transfer = CashDrawerTransfer::with('destinationDrawer')->findOrFail($id);
        $this->authorizeDrawer($transfer->destinationDrawer);

        $transfer = $this->cashDrawerService->receiveTransfer(
            $transfer,
            $user,
            $request->input('notes')
        );

        return response()->json([
            'success' => true,
            'message' => "Transfer #{$transfer->transfer_number} received and confirmed.",
            'data' => $transfer,
        ]);
    }

    public function rejectTransfer(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'reason' => 'required|string|max:500',
        ]);

        $user = Auth::user();
        $transfer = CashDrawerTransfer::with(['sourceDrawer', 'destinationDrawer'])->findOrFail($id);
        $this->authorizeDrawer($transfer->destinationDrawer);

        $transfer = $this->cashDrawerService->rejectTransfer(
            $transfer,
            $user,
            $request->input('reason')
        );

        return response()->json([
            'success' => true,
            'message' => "Transfer #{$transfer->transfer_number} rejected. Dispatched funds refunded to source drawer.",
            'data' => $transfer,
        ]);
    }

    public function listTransfers(Request $request): JsonResponse
    {
        [$companyId, $userBranchId] = $this->validateTenantScope(
            $request->filled('company_id') ? (int) $request->input('company_id') : null,
            $request->filled('branch_id') && $request->input('branch_id') !== 'all' ? (int) $request->input('branch_id') : null
        );

        $query = CashDrawerTransfer::where('company_id', $companyId)
            ->with(['sourceDrawer', 'sourceBranch', 'destinationDrawer', 'destinationBranch', 'initiator', 'receiver', 'rejector'])
            ->orderByDesc('initiated_at');

        if ($userBranchId) {
            $query->where(function ($q) use ($userBranchId) {
                $q->where('source_branch_id', $userBranchId)
                    ->orWhere('destination_branch_id', $userBranchId);
            });
        }

        if ($request->filled('status') && $request->input('status') !== 'all') {
            $query->where('status', $request->input('status'));
        }

        $perPage = min(100, max(5, (int) $request->input('per_page', 20)));
        $transfers = $query->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => $transfers->items(),
            'meta' => [
                'current_page' => $transfers->currentPage(),
                'last_page' => $transfers->lastPage(),
                'total' => $transfers->total(),
            ],
        ]);
    }

    /* ==================================================================
     |  5. DASHBOARD & REPORTS
     | ================================================================== */

    public function dashboard(Request $request): JsonResponse
    {
        [$companyId, $userBranchId] = $this->validateTenantScope(
            $request->filled('company_id') ? (int) $request->input('company_id') : null,
            $request->filled('branch_id') && $request->input('branch_id') !== 'all' ? (int) $request->input('branch_id') : null
        );

        $drawerId = $request->filled('cash_drawer_id') && $request->input('cash_drawer_id') !== 'all'
            ? (int) $request->input('cash_drawer_id')
            : null;

        $userId = $request->filled('user_id') && $request->input('user_id') !== 'all'
            ? (int) $request->input('user_id')
            : null;

        $data = $this->cashDrawerService->getDashboardMetrics(
            $companyId,
            $userBranchId,
            $drawerId,
            $userId,
            $request->input('date_from'),
            $request->input('date_to')
        );

        return response()->json([
            'success' => true,
            'data' => $data,
        ]);
    }

    public function getDenominations(Request $request): JsonResponse
    {
        [$companyId] = $this->validateTenantScope(
            $request->filled('company_id') ? (int) $request->input('company_id') : null
        );

        $currency = $request->input('currency', 'INR');
        $denominations = $this->cashDrawerService->getDenominations($companyId, $currency);

        return response()->json([
            'success' => true,
            'data' => $denominations,
        ]);
    }

    public function auditLogs(Request $request): JsonResponse
    {
        [$companyId, $userBranchId] = $this->validateTenantScope(
            $request->filled('company_id') ? (int) $request->input('company_id') : null,
            $request->filled('branch_id') && $request->input('branch_id') !== 'all' ? (int) $request->input('branch_id') : null
        );

        $query = CashDrawerAuditLog::where('company_id', $companyId)
            ->with(['cashDrawer', 'user', 'branch'])
            ->orderByDesc('created_at');

        if ($userBranchId) {
            $query->where('branch_id', $userBranchId);
        }

        if ($request->filled('cash_drawer_id')) {
            $query->where('cash_drawer_id', (int) $request->input('cash_drawer_id'));
        }

        if ($request->filled('action')) {
            $query->where('action', $request->input('action'));
        }

        $perPage = min(100, max(10, (int) $request->input('per_page', 25)));
        $logs = $query->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => $logs->items(),
            'meta' => [
                'current_page' => $logs->currentPage(),
                'last_page' => $logs->lastPage(),
                'total' => $logs->total(),
            ],
        ]);
    }

    /**
     * CSV Export with Formula Injection Defense.
     */
    public function exportCsv(Request $request): StreamedResponse
    {
        [$companyId, $userBranchId] = $this->validateTenantScope(
            $request->filled('company_id') ? (int) $request->input('company_id') : null,
            $request->filled('branch_id') && $request->input('branch_id') !== 'all' ? (int) $request->input('branch_id') : null
        );

        $query = CashDrawerTransaction::where('company_id', $companyId)
            ->with(['cashDrawer', 'branch', 'creator', 'session'])
            ->orderByDesc('transaction_date');

        if ($userBranchId) {
            $query->where('branch_id', $userBranchId);
        }

        if ($request->filled('cash_drawer_id')) {
            $query->where('cash_drawer_id', (int) $request->input('cash_drawer_id'));
        }

        if ($request->filled('date_from')) {
            $query->whereDate('transaction_date', '>=', $request->input('date_from'));
        }
        if ($request->filled('date_to')) {
            $query->whereDate('transaction_date', '<=', $request->input('date_to'));
        }

        $filename = 'cash_drawer_transactions_' . date('Y_m_d_His') . '.csv';

        $headers = [
            'Content-Type' => 'text/csv; charset=utf-8',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ];

        return response()->stream(function () use ($query) {
            $handle = fopen('php://output', 'w');

            // BOM for Excel UTF-8 recognition
            fputs($handle, "\xEF\xBB\xBF");

            fputcsv($handle, [
                'Transaction No',
                'Date',
                'Drawer',
                'Branch',
                'Type',
                'Category',
                'Amount',
                'Balance Before',
                'Balance After',
                'Party / Payer',
                'Reference',
                'Description',
                'Cashier',
            ]);

            // Helper to sanitize formula injection
            $sanitize = function ($value) {
                $str = (string) $value;
                if (in_array(substr($str, 0, 1), ['=', '+', '-', '@'], true)) {
                    return "'" . $str;
                }
                return $str;
            };

            $query->chunk(500, function ($transactions) use ($handle, $sanitize) {
                foreach ($transactions as $t) {
                    fputcsv($handle, [
                        $sanitize($t->transaction_number),
                        $sanitize($t->transaction_date?->format('Y-m-d H:i:s')),
                        $sanitize($t->cashDrawer?->name),
                        $sanitize($t->branch?->name),
                        $sanitize($t->transaction_type),
                        $sanitize($t->category),
                        $sanitize(number_format((float) $t->amount, 2, '.', '')),
                        $sanitize(number_format((float) $t->balance_before, 2, '.', '')),
                        $sanitize(number_format((float) $t->balance_after, 2, '.', '')),
                        $sanitize($t->received_from_or_paid_to),
                        $sanitize($t->reference_no),
                        $sanitize($t->description),
                        $sanitize($t->creator?->name),
                    ]);
                }
            });

            fclose($handle);
        }, 200, $headers);
    }
}
