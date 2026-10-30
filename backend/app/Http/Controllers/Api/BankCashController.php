<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BankAccount;
use App\Models\BankAccountTransaction;
use App\Models\CashClosing;
use App\Models\BankStatement;
use App\Models\BankStatementTransaction;
use App\Models\ReconciliationMatch;
use App\Models\Payment;
use App\Models\BankReconciliationRule;
use App\Models\FinancialEntry;
use App\Services\BankReconciliationAiService;
use App\Services\BankReconciliationEngine;
use App\Services\BankStatementParserService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class BankCashController extends Controller
{
    protected BankStatementParserService $parserService;
    protected BankReconciliationEngine $reconEngine;
    protected BankReconciliationAiService $aiService;

    public function __construct(
        BankStatementParserService $parserService,
        BankReconciliationEngine $reconEngine,
        BankReconciliationAiService $aiService
    ) {
        $this->parserService = $parserService;
        $this->reconEngine = $reconEngine;
        $this->aiService = $aiService;
    }

    /* ==================================================================
     |  1. BANK & CASH ACCOUNTS
     | ================================================================== */

    public function indexAccounts(Request $request)
    {
        $user = Auth::user();
        $companyId = $request->input('company_id', $user?->company_id ?: 1);

        $query = BankAccount::where('company_id', $companyId)
            ->with(['branch', 'warehouse'])
            ->orderByDesc('is_default')
            ->orderBy('account_name');

        if ($request->filled('branch_id') && $request->input('branch_id') !== 'all') {
            $query->where('branch_id', (int) $request->input('branch_id'));
        }

        if ($request->filled('account_type') && $request->input('account_type') !== 'all') {
            $query->where('account_type', $request->input('account_type'));
        }

        if ($request->has('is_active')) {
            $query->where('is_active', filter_var($request->input('is_active'), FILTER_VALIDATE_BOOLEAN));
        }

        $accounts = $query->get()->map(function ($acc) {
            $data = $acc->toArray();
            $data['masked_account_number'] = $acc->masked_account_number;
            return $data;
        });

        return response()->json([
            'success' => true,
            'data' => $accounts,
        ]);
    }

    public function storeAccount(Request $request)
    {
        $user = Auth::user();
        $data = $request->validate([
            'company_id'       => 'nullable|integer',
            'branch_id'        => 'nullable|integer',
            'warehouse_id'     => 'nullable|integer',
            'account_name'     => 'required|string|max:191',
            'account_type'     => 'required|in:bank,cash,cash_drawer,petty_cash,vault,digital_wallet,credit_card',
            'bank_name'        => 'nullable|string|max:191',
            'account_number'   => 'nullable|string|max:100',
            'ifsc_code'        => 'nullable|string|max:30',
            'branch_name'      => 'nullable|string|max:191',
            'swift_code'       => 'nullable|string|max:50',
            'upi_id'           => 'nullable|string|max:100',
            'currency'         => 'nullable|string|max:10',
            'opening_balance'  => 'nullable|numeric',
            'is_active'        => 'nullable|boolean',
            'is_default'       => 'nullable|boolean',
            'notes'            => 'nullable|string',
        ]);

        $data['company_id'] = $data['company_id'] ?? $user?->company_id ?? 1;
        $data['branch_id'] = $data['branch_id'] ?? $user?->branch_id;
        $data['currency'] = $data['currency'] ?? 'INR';
        $data['opening_balance'] = (float) ($data['opening_balance'] ?? 0.00);
        $data['current_balance'] = $data['opening_balance'];
        $data['created_by'] = $user?->id;

        return DB::transaction(function () use ($data, $user) {
            if (!empty($data['is_default'])) {
                BankAccount::where('company_id', $data['company_id'])
                    ->where('account_type', $data['account_type'])
                    ->update(['is_default' => false]);
            }

            $account = BankAccount::create($data);

            // Record initial opening balance ledger entry if non-zero
            if (abs($account->opening_balance) > 0.0001) {
                BankAccountTransaction::create([
                    'company_id' => $account->company_id,
                    'branch_id' => $account->branch_id,
                    'bank_account_id' => $account->id,
                    'transaction_type' => 'deposit',
                    'amount' => $account->opening_balance,
                    'running_balance' => $account->opening_balance,
                    'transaction_date' => now()->toDateString(),
                    'reference_no' => 'OPENING-' . $account->id,
                    'description' => 'Opening balance initialization',
                    'counterparty' => 'System Opening Balance',
                    'status' => 'cleared',
                    'created_by' => $user?->id,
                ]);
            }

            return response()->json([
                'success' => true,
                'message' => 'Account created successfully',
                'data' => $account->load(['branch', 'warehouse']),
            ], 201);
        });
    }

    public function showAccount($id)
    {
        $account = BankAccount::with(['branch', 'warehouse', 'statements' => function ($q) {
            $q->latest()->limit(5);
        }])->findOrFail($id);

        $data = $account->toArray();
        $data['masked_account_number'] = $account->masked_account_number;

        return response()->json([
            'success' => true,
            'data' => $data,
        ]);
    }

    public function updateAccount(Request $request, $id)
    {
        $account = BankAccount::findOrFail($id);

        $data = $request->validate([
            'branch_id'        => 'nullable|integer',
            'warehouse_id'     => 'nullable|integer',
            'account_name'     => 'required|string|max:191',
            'account_type'     => 'sometimes|required|in:bank,cash,cash_drawer,petty_cash,vault,digital_wallet,credit_card',
            'bank_name'        => 'nullable|string|max:191',
            'account_number'   => 'nullable|string|max:100',
            'ifsc_code'        => 'nullable|string|max:30',
            'branch_name'      => 'nullable|string|max:191',
            'swift_code'       => 'nullable|string|max:50',
            'upi_id'           => 'nullable|string|max:100',
            'is_active'        => 'nullable|boolean',
            'is_default'       => 'nullable|boolean',
            'notes'            => 'nullable|string',
        ]);

        $data['updated_by'] = Auth::id();

        if (!empty($data['is_default'])) {
            BankAccount::where('company_id', $account->company_id)
                ->where('account_type', $account->account_type)
                ->where('id', '!=', $account->id)
                ->update(['is_default' => false]);
        }

        $account->update($data);

        return response()->json([
            'success' => true,
            'message' => 'Account updated successfully',
            'data' => $account->fresh(['branch', 'warehouse']),
        ]);
    }

    public function destroyAccount($id)
    {
        $account = BankAccount::findOrFail($id);

        // Check if there are active reconciled transactions
        $reconciledCount = BankAccountTransaction::where('bank_account_id', $id)
            ->where('status', 'reconciled')
            ->count();

        if ($reconciledCount > 0) {
            return response()->json([
                'success' => false,
                'message' => "Cannot delete account with {$reconciledCount} reconciled transactions. Deactivate the account instead.",
            ], 422);
        }

        $account->delete();

        return response()->json([
            'success' => true,
            'message' => 'Account deleted successfully',
        ]);
    }

    /* ==================================================================
     |  2. ACCOUNT TRANSACTIONS & TRANSFERS
     | ================================================================== */

    public function indexAllTransactions(Request $request)
    {
        return $this->indexTransactions($request, 'all');
    }

    public function indexTransactions(Request $request, $accountId)
    {
        $user = Auth::user();
        $account = null;

        $query = BankAccountTransaction::with(['payment', 'bankAccount'])
            ->orderByDesc('transaction_date')
            ->orderByDesc('id');

        if ($accountId !== 'all' && (int)$accountId > 0) {
            $account = BankAccount::findOrFail($accountId);
            $query->where('bank_account_id', $accountId);
        } else {
            if ($request->filled('company_id')) {
                $query->whereHas('bankAccount', function ($q) use ($request) {
                    $q->where('company_id', $request->input('company_id'));
                });
            } elseif ($user && $user->company_id) {
                $query->whereHas('bankAccount', function ($q) use ($user) {
                    $q->where('company_id', $user->company_id);
                });
            }
            if ($request->filled('branch_id')) {
                $query->whereHas('bankAccount', function ($q) use ($request) {
                    $q->where('branch_id', $request->input('branch_id'));
                });
            }
        }

        if ($request->filled('financial_year') && $request->input('financial_year') !== 'all') {
            $fyRange = $this->getFinancialYearRange($request->input('financial_year'));
            $query->whereBetween('transaction_date', [$fyRange['start_date'], $fyRange['end_date']]);
        }

        $startDate = $request->input('start_date') ?: $request->input('from');
        $endDate = $request->input('end_date') ?: $request->input('to');
        if ($startDate) {
            $query->whereDate('transaction_date', '>=', $startDate);
        }
        if ($endDate) {
            $query->whereDate('transaction_date', '<=', $endDate);
        }
        if ($request->filled('transaction_type') && $request->input('transaction_type') !== 'all') {
            $query->where('transaction_type', $request->input('transaction_type'));
        }
        if ($request->filled('direction') && $request->input('direction') !== 'all') {
            $dir = strtolower($request->input('direction'));
            if ($dir === 'inflow' || $dir === 'credit' || $dir === 'inward') {
                $query->whereIn('transaction_type', ['deposit', 'transfer_in', 'interest']);
            } elseif ($dir === 'outflow' || $dir === 'debit' || $dir === 'outward') {
                $query->whereIn('transaction_type', ['withdrawal', 'transfer_out', 'bank_charges', 'adjustment']);
            }
        }
        if ($request->filled('min_amount')) {
            $query->where('amount', '>=', (float) $request->input('min_amount'));
        }
        if ($request->filled('max_amount')) {
            $query->where('amount', '<=', (float) $request->input('max_amount'));
        }
        if ($request->filled('payment_method') && $request->input('payment_method') !== 'all') {
            $method = strtolower($request->input('payment_method'));
            $query->where(function ($q) use ($method) {
                $q->where('reference_no', 'like', "%{$method}%")
                  ->orWhere('description', 'like', "%{$method}%")
                  ->orWhereHas('payment', function ($pq) use ($method) {
                      $pq->where('payment_method', $method);
                  });
            });
        }
        if ($request->filled('status') && $request->input('status') !== 'all') {
            $query->where('status', $request->input('status'));
        }
        if ($request->filled('search')) {
            $s = trim($request->input('search'));
            $query->where(function ($q) use ($s) {
                $q->where('reference_no', 'like', "%{$s}%")
                  ->orWhere('description', 'like', "%{$s}%")
                  ->orWhere('counterparty', 'like', "%{$s}%");
            });
        }

        // Filtered summary totals
        $cloneForSummary = clone $query;
        $allMatching = $cloneForSummary->get(['id', 'transaction_type', 'amount']);
        $totalInflow = 0.0;
        $totalOutflow = 0.0;
        foreach ($allMatching as $row) {
            $amt = (float) $row->amount;
            if (in_array($row->transaction_type, ['deposit', 'transfer_in', 'interest'], true)) {
                $totalInflow += $amt;
            } else {
                $totalOutflow += $amt;
            }
        }
        $summary = [
            'total_count' => $allMatching->count(),
            'total_inflow' => round($totalInflow, 2),
            'total_outflow' => round($totalOutflow, 2),
            'net_flow' => round($totalInflow - $totalOutflow, 2),
        ];

        $perPage = (int) $request->input('per_page', 50);
        $transactions = $perPage > 0 ? $query->paginate($perPage) : $query->get();

        return response()->json([
            'success' => true,
            'account' => $account,
            'summary' => $summary,
            'data' => $transactions,
        ]);
    }

    public function storeTransfer(Request $request)
    {
        $user = Auth::user();
        $data = $request->validate([
            'source_account_id'      => 'required|exists:bank_accounts,id',
            'destination_account_id' => 'required|exists:bank_accounts,id|different:source_account_id',
            'amount'                 => 'required|numeric|min:0.01',
            'transaction_date'       => 'nullable|date',
            'reference_no'           => 'nullable|string|max:100',
            'description'            => 'nullable|string|max:500',
        ]);

        $amount = (float) $data['amount'];
        $date = $data['transaction_date'] ?? now()->toDateString();
        $ref = $data['reference_no'] ?: 'TRF-' . time();
        $desc = $data['description'] ?: 'Internal account transfer';

        return DB::transaction(function () use ($data, $amount, $date, $ref, $desc, $user) {
            $source = BankAccount::lockForUpdate()->findOrFail($data['source_account_id']);
            $dest = BankAccount::lockForUpdate()->findOrFail($data['destination_account_id']);

            $transferId = (int) (now()->timestamp . rand(100, 999));

            // Debit Source Account
            $source->current_balance -= $amount;
            $source->save();

            $txnOut = BankAccountTransaction::create([
                'company_id' => $source->company_id,
                'branch_id' => $source->branch_id,
                'bank_account_id' => $source->id,
                'transaction_type' => 'transfer_out',
                'amount' => $amount,
                'running_balance' => $source->current_balance,
                'transaction_date' => $date,
                'reference_no' => $ref,
                'description' => "Transfer to {$dest->account_name}: {$desc}",
                'transfer_id' => $transferId,
                'counterparty' => $dest->account_name,
                'status' => 'cleared',
                'created_by' => $user?->id,
            ]);

            // Credit Destination Account
            $dest->current_balance += $amount;
            $dest->save();

            $txnIn = BankAccountTransaction::create([
                'company_id' => $dest->company_id,
                'branch_id' => $dest->branch_id,
                'bank_account_id' => $dest->id,
                'transaction_type' => 'transfer_in',
                'amount' => $amount,
                'running_balance' => $dest->current_balance,
                'transaction_date' => $date,
                'reference_no' => $ref,
                'description' => "Transfer from {$source->account_name}: {$desc}",
                'transfer_id' => $transferId,
                'counterparty' => $source->account_name,
                'status' => 'cleared',
                'created_by' => $user?->id,
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Internal transfer processed successfully',
                'data' => [
                    'transfer_id' => $transferId,
                    'source_account' => $source->fresh(),
                    'destination_account' => $dest->fresh(),
                    'transaction_out' => $txnOut,
                    'transaction_in' => $txnIn,
                ],
            ], 201);
        });
    }

    public function storeAdjustment(Request $request)
    {
        $user = Auth::user();
        $data = $request->validate([
            'bank_account_id'  => 'required|exists:bank_accounts,id',
            'transaction_type' => 'required|in:deposit,withdrawal,adjustment,bank_charges,interest',
            'amount'           => 'required|numeric|min:0.01',
            'transaction_date' => 'nullable|date',
            'reference_no'     => 'nullable|string|max:100',
            'description'      => 'required|string|max:500',
        ]);

        $amount = (float) $data['amount'];
        $date = $data['transaction_date'] ?? now()->toDateString();
        $ref = $data['reference_no'] ?: 'ADJ-' . time();
        $isDeduction = in_array($data['transaction_type'], ['withdrawal', 'bank_charges', 'adjustment'], true);

        return DB::transaction(function () use ($data, $amount, $date, $ref, $isDeduction, $user) {
            $account = BankAccount::lockForUpdate()->findOrFail($data['bank_account_id']);

            if ($isDeduction) {
                $account->current_balance -= $amount;
            } else {
                $account->current_balance += $amount;
            }
            $account->save();

            $txn = BankAccountTransaction::create([
                'company_id' => $account->company_id,
                'branch_id' => $account->branch_id,
                'bank_account_id' => $account->id,
                'transaction_type' => $data['transaction_type'],
                'amount' => $amount,
                'running_balance' => $account->current_balance,
                'transaction_date' => $date,
                'reference_no' => $ref,
                'description' => $data['description'],
                'counterparty' => 'Manual Adjustment',
                'status' => 'cleared',
                'created_by' => $user?->id,
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Adjustment transaction recorded',
                'data' => [
                    'account' => $account->fresh(),
                    'transaction' => $txn,
                ],
            ], 201);
        });
    }

    /* ==================================================================
     |  3. DAILY CASH CLOSINGS
     | ================================================================== */

    public function indexCashClosings(Request $request)
    {
        $user = Auth::user();
        $companyId = $request->input('company_id', $user?->company_id ?: 1);

        $query = CashClosing::where('company_id', $companyId)
            ->with(['cashAccount', 'branch', 'approver', 'creator'])
            ->orderByDesc('closing_date')
            ->orderByDesc('id');

        if ($request->filled('cash_account_id')) {
            $query->where('cash_account_id', $request->input('cash_account_id'));
        }
        if ($request->filled('status') && $request->input('status') !== 'all') {
            $query->where('status', $request->input('status'));
        }

        $startDate = $request->input('start_date') ?: $request->input('from');
        $endDate = $request->input('end_date') ?: $request->input('to');
        if ($startDate) {
            $query->whereDate('closing_date', '>=', $startDate);
        }
        if ($endDate) {
            $query->whereDate('closing_date', '<=', $endDate);
        }

        $perPage = (int) $request->input('per_page', 20);

        return response()->json([
            'success' => true,
            'data' => $query->paginate($perPage > 0 ? $perPage : 20),
        ]);
    }

    public function storeCashClosing(Request $request)
    {
        $user = Auth::user();
        $data = $request->validate([
            'cash_account_id'        => 'required|exists:bank_accounts,id',
            'closing_date'           => 'required|date',
            'physical_cash_counted'  => 'required|numeric|min:0',
            'denomination_breakdown' => 'nullable|array',
            'remarks'                => 'nullable|string',
        ]);

        $account = BankAccount::findOrFail($data['cash_account_id']);
        $closingDate = $data['closing_date'];

        // Compute Opening Cash: previous day closing balance or account opening
        $openingCash = (float) $account->current_balance;

        // Cash received & paid today from Payments and Ledger
        $cashReceived = (float) Payment::where('company_id', $account->company_id)
            ->where('payment_method', 'cash')
            ->where('payment_direction', 'inward')
            ->whereDate('transaction_date', $closingDate)
            ->where('status', '!=', 'failed')
            ->sum('amount');

        $cashPaid = (float) Payment::where('company_id', $account->company_id)
            ->where('payment_method', 'cash')
            ->where('payment_direction', 'outward')
            ->whereDate('transaction_date', $closingDate)
            ->where('status', '!=', 'failed')
            ->sum('amount');

        $expectedCash = round($openingCash + $cashReceived - $cashPaid, 2);
        $physicalCounted = (float) $data['physical_cash_counted'];
        $diff = round($physicalCounted - $expectedCash, 2);

        $status = abs($diff) < 0.01 ? 'approved' : 'pending_approval';

        $closing = CashClosing::create([
            'company_id' => $account->company_id,
            'branch_id' => $account->branch_id,
            'warehouse_id' => $account->warehouse_id,
            'cash_account_id' => $account->id,
            'closing_date' => $closingDate,
            'opening_cash' => $openingCash,
            'cash_received' => $cashReceived,
            'cash_paid' => $cashPaid,
            'expected_closing_cash' => $expectedCash,
            'physical_cash_counted' => $physicalCounted,
            'difference' => $diff,
            'denomination_breakdown' => $data['denomination_breakdown'] ?? null,
            'status' => $status,
            'approved_by' => abs($diff) < 0.01 ? $user?->id : null,
            'approved_at' => abs($diff) < 0.01 ? now() : null,
            'remarks' => $data['remarks'] ?? null,
            'created_by' => $user?->id,
        ]);

        return response()->json([
            'success' => true,
            'message' => abs($diff) < 0.01 ? 'Cash register reconciled & closed' : 'Cash closing submitted with variance for approval',
            'data' => $closing->load(['cashAccount', 'creator']),
        ], 201);
    }

    public function approveCashClosing(Request $request, $id)
    {
        $user = Auth::user();
        $closing = CashClosing::findOrFail($id);

        $closing->update([
            'status' => 'approved',
            'approved_by' => $user?->id,
            'approved_at' => now(),
            'remarks' => $closing->remarks . ($request->filled('note') ? " | Approval: " . $request->input('note') : ""),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Cash variance approved and registered',
            'data' => $closing->fresh(['cashAccount', 'approver']),
        ]);
    }

    public function rejectCashClosing(Request $request, $id)
    {
        $closing = CashClosing::findOrFail($id);
        $closing->update([
            'status' => 'rejected',
            'remarks' => $closing->remarks . " | Rejected: " . $request->input('reason', 'Verification rejected'),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Cash closing marked as rejected',
            'data' => $closing->fresh(),
        ]);
    }

    /* ==================================================================
     |  4. BANK STATEMENT UPLOAD & RECONCILIATION
     | ================================================================== */

    public function uploadStatement(Request $request)
    {
        $request->validate([
            'bank_account_id' => 'required|exists:bank_accounts,id',
            'statement_file'  => 'nullable|file|max:15360',
            'raw_text'        => 'nullable|string',
            'password'        => 'nullable|string|max:128',
            'bank_format'     => 'nullable|string|in:generic,hdfc,sbi,icici,axis,pnb',
            'preview_only'    => 'nullable|boolean',
        ]);

        if (!$request->hasFile('statement_file') && empty(trim($request->input('raw_text', '')))) {
            return response()->json([
                'success' => false,
                'message' => 'Please provide a bank statement file (PDF, CSV, Excel) or paste statement text.',
                'errors' => ['statement_file' => ['Either a statement file or raw text is required.']],
            ], 422);
        }

        $account = BankAccount::findOrFail($request->input('bank_account_id'));
        $format = $request->input('bank_format', 'generic');
        $password = $request->input('password') ?? $request->input('pdf_password');
        $previewOnly = filter_var($request->input('preview_only', false), FILTER_VALIDATE_BOOLEAN);

        $file = $request->file('statement_file');
        $rawText = $request->input('raw_text');

        if ($file) {
            $ext = strtolower($file->getClientOriginalExtension());
            if (!in_array($ext, ['csv', 'txt', 'xlsx', 'xls', 'pdf'])) {
                return response()->json([
                    'success' => false,
                    'message' => "Unsupported file format: .{$ext}. Please upload a CSV, XLSX, or PDF bank statement.",
                    'errors' => ["Unsupported file format .{$ext}"],
                ], 422);
            }
            $parsed = $this->parserService->parse($file, $format, $password);
            $fileName = $file->getClientOriginalName();
            $fileExtension = $ext;
        } else {
            $parsed = $this->parserService->parseTextContent($rawText, $format);
            $fileName = 'Pasted_Statement_' . date('Ymd_His') . '.txt';
            $fileExtension = 'txt';
        }

        if (!empty($parsed['is_encrypted'])) {
            return response()->json([
                'success' => false,
                'is_encrypted' => true,
                'message' => 'This PDF statement is password-protected. Please enter the PDF password (e.g., PAN, Date of Birth DDMMYYYY, or Account Number) and try again.',
                'errors' => ['PDF is password protected.'],
            ], 422);
        }

        if (!$parsed['success'] || count($parsed['transactions']) === 0) {
            return response()->json([
                'success' => false,
                'message' => !empty($parsed['errors']) ? implode(', ', $parsed['errors']) : 'Failed to extract transactions from statement.',
                'errors' => $parsed['errors'],
            ], 422);
        }

        // Duplicate Statement Check
        $existing = BankStatement::where('company_id', $account->company_id)
            ->where('file_hash', $parsed['file_hash'])
            ->first();

        if ($existing && !$previewOnly) {
            return response()->json([
                'success' => false,
                'message' => "This exact bank statement was already imported on {$existing->created_at->format('d M Y')}.",
                'duplicate' => true,
                'statement_id' => $existing->id,
            ], 409);
        }

        if ($previewOnly) {
            return response()->json([
                'success' => true,
                'preview' => true,
                'summary' => [
                    'file_name' => $fileName,
                    'total_rows' => count($parsed['transactions']),
                    'from_date' => $parsed['from_date'],
                    'to_date' => $parsed['to_date'],
                    'opening_balance' => $parsed['opening_balance'],
                    'closing_balance' => $parsed['closing_balance'],
                    'is_duplicate' => (bool) $existing,
                ],
                'sample_transactions' => array_slice($parsed['transactions'], 0, 15),
            ]);
        }

        // Commit to Database
        return DB::transaction(function () use ($account, $file, $rawText, $fileName, $fileExtension, $format, $parsed) {
            if ($file) {
                $path = $file->store('statements', 'local');
            } else {
                $path = 'statements/' . uniqid('raw_') . '.txt';
                Storage::disk('local')->put($path, $rawText);
            }

            $statement = BankStatement::create([
                'company_id' => $account->company_id,
                'branch_id' => $account->branch_id,
                'bank_account_id' => $account->id,
                'file_name' => $fileName,
                'file_path' => $path,
                'file_hash' => $parsed['file_hash'],
                'format' => $fileExtension,
                'bank_format' => $format,
                'statement_from_date' => $parsed['from_date'],
                'statement_to_date' => $parsed['to_date'],
                'opening_balance' => $parsed['opening_balance'],
                'closing_balance' => $parsed['closing_balance'],
                'total_transactions' => count($parsed['transactions']),
                'reconciled_transactions' => 0,
                'status' => 'parsed',
                'uploaded_by' => Auth::id(),
            ]);

            $insertedCount = 0;
            foreach ($parsed['transactions'] as $t) {
                BankStatementTransaction::create([
                    'statement_id' => $statement->id,
                    'bank_account_id' => $account->id,
                    'company_id' => $account->company_id,
                    'transaction_date' => $t['date'],
                    'value_date' => $t['value_date'],
                    'description' => $t['description'],
                    'reference_no' => $t['reference_no'],
                    'debit' => $t['debit'],
                    'credit' => $t['credit'],
                    'balance' => $t['balance'],
                    'fingerprint' => $t['fingerprint'],
                    'reconciliation_status' => 'unmatched',
                ]);
                $insertedCount++;
            }

            return response()->json([
                'success' => true,
                'message' => "Successfully imported {$insertedCount} transactions from {$fileName}",
                'statement' => $statement->fresh(),
            ], 201);
        });
    }

    public function indexStatements(Request $request)
    {
        $user = Auth::user();
        $companyId = $request->input('company_id', $user?->company_id ?: 1);

        $query = BankStatement::where('company_id', $companyId)
            ->with(['bankAccount', 'uploader'])
            ->orderByDesc('id');

        if ($request->filled('bank_account_id')) {
            $query->where('bank_account_id', $request->input('bank_account_id'));
        }

        return response()->json([
            'success' => true,
            'data' => $query->paginate(15),
        ]);
    }

    public function destroyStatement($id)
    {
        $statement = BankStatement::findOrFail($id);

        $matchedCount = BankStatementTransaction::where('statement_id', $statement->id)
            ->where('reconciliation_status', 'matched')
            ->count();

        if ($matchedCount > 0) {
            return response()->json([
                'success' => false,
                'message' => "Cannot delete statement with {$matchedCount} reconciled transactions. Unmatch all items before deleting.",
            ], 422);
        }

        DB::transaction(function () use ($statement) {
            BankStatementTransaction::where('statement_id', $statement->id)->delete();
            $statement->delete();
        });

        return response()->json([
            'success' => true,
            'message' => 'Statement and unposted entries removed successfully',
        ]);
    }

    public function reconciliationDashboard(Request $request)
    {
        $user = Auth::user();
        $companyId = (int) $request->input('company_id', $user?->company_id ?: 1);
        $branchId = $request->filled('branch_id') && $request->input('branch_id') !== 'all' ? (int) $request->input('branch_id') : null;
        $accountId = $request->filled('bank_account_id') ? (int) $request->input('bank_account_id') : null;
        $fy = $request->input('financial_year');

        $metrics = $this->reconEngine->getDashboardMetrics($companyId, $branchId, $accountId);
        $fyRange = $this->getFinancialYearRange($fy);

        // Compute Today's Daily Cash In & Out
        $today = now()->toDateString();
        $dailyCashIn = (float) Payment::where('company_id', $companyId)
            ->where('payment_method', 'cash')
            ->where('payment_direction', 'inward')
            ->whereDate('transaction_date', $today)
            ->where('status', '!=', 'failed')
            ->sum('amount');

        $dailyCashOut = (float) Payment::where('company_id', $companyId)
            ->where('payment_method', 'cash')
            ->where('payment_direction', 'outward')
            ->whereDate('transaction_date', $today)
            ->where('status', '!=', 'failed')
            ->sum('amount');

        // FY Cash In & Out
        $fyCashIn = (float) Payment::where('company_id', $companyId)
            ->where('payment_method', 'cash')
            ->where('payment_direction', 'inward')
            ->whereBetween('transaction_date', [$fyRange['start_date'], $fyRange['end_date']])
            ->where('status', '!=', 'failed')
            ->sum('amount');

        $fyCashOut = (float) Payment::where('company_id', $companyId)
            ->where('payment_method', 'cash')
            ->where('payment_direction', 'outward')
            ->whereBetween('transaction_date', [$fyRange['start_date'], $fyRange['end_date']])
            ->where('status', '!=', 'failed')
            ->sum('amount');

        $metrics['daily_cash_in'] = $dailyCashIn;
        $metrics['daily_cash_out'] = $dailyCashOut;
        $metrics['daily_net_cash'] = round($dailyCashIn - $dailyCashOut, 2);
        $metrics['financial_year'] = $fyRange['label'];
        $metrics['financial_year_start'] = $fyRange['start_date'];
        $metrics['financial_year_end'] = $fyRange['end_date'];
        $metrics['fy_cash_in'] = $fyCashIn;
        $metrics['fy_cash_out'] = $fyCashOut;
        $metrics['fy_net_cash'] = round($fyCashIn - $fyCashOut, 2);
        $metrics['available_financial_years'] = $this->getAvailableFinancialYears();

        return response()->json([
            'success' => true,
            'data' => $metrics,
        ]);
    }

    public function reconciliationWorkspace(Request $request, $accountId)
    {
        $account = BankAccount::findOrFail($accountId);
        $statementId = $request->filled('statement_id') ? (int) $request->input('statement_id') : null;

        // 1. Unmatched Statement Rows with automated suggestions
        $suggestions = $this->reconEngine->generateSuggestions($accountId, $statementId);

        // 2. Unreconciled ERP Payments
        $unreconciledPayments = Payment::where('company_id', $account->company_id)
            ->whereIn('status', ['pending', 'completed'])
            ->where(function ($q) use ($accountId) {
                $q->whereNull('bank_account_id')
                  ->orWhere('bank_account_id', $accountId);
            })
            ->with(['invoice', 'company', 'branch'])
            ->orderByDesc('transaction_date')
            ->limit(100)
            ->get();

        // 3. Recently Reconciled Items
        $recentReconciled = BankStatementTransaction::where('bank_account_id', $accountId)
            ->where('reconciliation_status', 'matched')
            ->with(['matchedPayment'])
            ->latest('reconciled_at')
            ->limit(20)
            ->get();

        // 4. Pending Expense Drafts
        $expenseDrafts = FinancialEntry::where('company_id', $account->company_id)
            ->where('direction', 'expense')
            ->where('status', 'draft')
            ->latest('entry_date')
            ->limit(50)
            ->get();

        // 5. Active Learned Rules
        $rules = BankReconciliationRule::forCompany($account->company_id)
            ->active()
            ->orderByDesc('times_used')
            ->limit(50)
            ->get();

        $summary = $statementId ? $this->reconEngine->getReconciliationSummary($statementId) : null;

        return response()->json([
            'success' => true,
            'account' => $account,
            'unmatched_statement_count' => count($suggestions),
            'suggestions' => $suggestions,
            'unreconciled_payments' => $unreconciledPayments,
            'recent_reconciled' => $recentReconciled,
            'expense_drafts' => $expenseDrafts,
            'learned_rules' => $rules,
            'statement_summary' => $summary,
        ]);
    }

    public function confirmMatch(Request $request)
    {
        $request->validate([
            'statement_transaction_id' => 'required|exists:bank_statement_transactions,id',
            'payment_id'               => 'required|exists:payments,id',
            'allocated_amount'         => 'nullable|numeric|min:0.01',
            'match_type'               => 'nullable|string',
        ]);

        $res = $this->reconEngine->confirmMatch(
            (int) $request->input('statement_transaction_id'),
            (int) $request->input('payment_id'),
            $request->filled('allocated_amount') ? (float) $request->input('allocated_amount') : null,
            $request->input('match_type', 'manual'),
            Auth::id()
        );

        return response()->json([
            'success' => true,
            'message' => 'Transaction matched and reconciled successfully',
            'data' => $res,
        ]);
    }

    public function unmatch(Request $request)
    {
        $request->validate([
            'statement_transaction_id' => 'required|exists:bank_statement_transactions,id',
        ]);

        $res = $this->reconEngine->unmatch((int) $request->input('statement_transaction_id'));

        return response()->json([
            'success' => true,
            'message' => 'Match reversed and returned to unmatched queue',
            'data' => $res,
        ]);
    }

    public function autoMatch(Request $request)
    {
        $request->validate([
            'bank_account_id' => 'required|exists:bank_accounts,id',
            'confidence_threshold' => 'nullable|integer|min:70|max:100',
        ]);

        $threshold = (int) $request->input('confidence_threshold', 95);
        $res = $this->reconEngine->autoReconcile((int) $request->input('bank_account_id'), $threshold, Auth::id());

        return response()->json([
            'success' => true,
            'message' => "Automated matching complete: {$res['reconciled_count']} items reconciled",
            'data' => $res,
        ]);
    }

    public function aiSuggest(Request $request)
    {
        $request->validate([
            'statement_transaction_id' => 'required|exists:bank_statement_transactions,id',
        ]);

        $st = BankStatementTransaction::findOrFail($request->input('statement_transaction_id'));
        $analysis = $this->aiService->analyzeTransaction($st);

        return response()->json([
            'success' => true,
            'data' => $analysis,
        ]);
    }

    public function createReconciliationAdjustment(Request $request)
    {
        $data = $request->validate([
            'statement_transaction_id' => 'required|exists:bank_statement_transactions,id',
            'transaction_type'         => 'required|in:bank_charges,interest,withdrawal,deposit,adjustment',
            'amount'                   => 'nullable|numeric|min:0.01',
            'description'              => 'nullable|string|max:500',
            'category'                 => 'nullable|string|max:191',
        ]);

        $res = $this->reconEngine->createAdjustment(
            (int) $data['statement_transaction_id'],
            $data,
            Auth::id()
        );

        return response()->json([
            'success' => true,
            'message' => 'Adjustment created and reconciled with bank statement row',
            'data' => $res,
        ]);
    }

    public function processFullReconciliation(Request $request, $statementId)
    {
        $autoApprove = $request->boolean('auto_approve', false);
        $res = $this->reconEngine->processFullReconciliation((int) $statementId, Auth::id(), $autoApprove);

        return response()->json([
            'success' => true,
            'message' => 'Full statement reconciliation completed across all transactions.',
            'summary' => $res['summary'] ?? null,
            'data'    => $res,
        ]);
    }

    public function approveExpenseDraft(Request $request, $statementTxnId)
    {
        $saveRule = $request->boolean('save_learned_rule', true);
        $res = $this->reconEngine->approveExpenseDraft((int) $statementTxnId, Auth::id(), $saveRule);

        return response()->json([
            'success' => true,
            'message' => 'Expense draft approved, posted to accounting ledger, and reconciled.',
            'entry'   => $res['entry'] ?? $res['expense'] ?? null,
            'data'    => $res,
        ]);
    }

    public function editExpenseDraft(Request $request, $statementTxnId)
    {
        $data = $request->validate([
            'category'     => 'nullable|string|max:100',
            'counterparty' => 'nullable|string|max:191',
            'amount'       => 'nullable|numeric|min:0.01',
            'description'  => 'nullable|string|max:500',
            'notes'        => 'nullable|string|max:500',
        ]);

        $res = $this->reconEngine->editExpenseDraft((int) $statementTxnId, $data, Auth::id());

        return response()->json([
            'success' => true,
            'message' => 'Expense draft updated successfully.',
            'draft'   => $res['expense_draft'] ?? $res['draft'] ?? null,
            'data'    => $res,
        ]);
    }

    public function rejectExpenseDraft(Request $request, $statementTxnId)
    {
        $res = $this->reconEngine->rejectExpenseDraft((int) $statementTxnId, Auth::id());

        return response()->json([
            'success' => true,
            'message' => 'Expense draft rejected and reset to review queue.',
            'data'    => $res,
        ]);
    }

    public function ignoreStatementTransaction(Request $request, $statementTxnId)
    {
        $reason = $request->input('reason', 'Ignored by user');
        $res = $this->reconEngine->ignoreStatementTransaction((int) $statementTxnId, $reason, Auth::id());

        return response()->json([
            'success' => true,
            'message' => 'Transaction ignored with reason.',
            'data'    => $res,
        ]);
    }

    public function unignoreStatementTransaction(Request $request, $statementTxnId)
    {
        $res = $this->reconEngine->unignoreStatementTransaction((int) $statementTxnId);

        return response()->json([
            'success' => true,
            'message' => 'Transaction un-ignored and returned to queue.',
            'data'    => $res,
        ]);
    }

    public function statementSummary(Request $request, $statementId)
    {
        $summary = $this->reconEngine->getReconciliationSummary((int) $statementId);

        return response()->json([
            'success' => true,
            'data'    => $summary,
        ]);
    }

    /* ==================================================================
     |  LEARNED RECONCILIATION RULES MANAGEMENT
     | ================================================================== */

    public function indexRules(Request $request)
    {
        $user = Auth::user();
        $companyId = (int) $request->input('company_id', $user?->company_id ?: 1);
        $query = BankReconciliationRule::forCompany($companyId)->with(['creator', 'branch']);

        if ($request->filled('search')) {
            $s = trim($request->input('search'));
            $query->where(function ($q) use ($s) {
                $q->where('rule_name', 'like', "%{$s}%")
                  ->orWhere('pattern_value', 'like', "%{$s}%")
                  ->orWhere('category', 'like', "%{$s}%")
                  ->orWhere('vendor_name', 'like', "%{$s}%");
            });
        }

        if ($request->has('is_active') && $request->input('is_active') !== 'all') {
            $query->where('is_active', filter_var($request->input('is_active'), FILTER_VALIDATE_BOOLEAN));
        }

        return response()->json([
            'success' => true,
            'data' => $query->orderByDesc('times_used')->paginate(50),
        ]);
    }

    public function storeRule(Request $request)
    {
        $user = Auth::user();
        $data = $request->validate([
            'rule_name'        => 'required|string|max:191',
            'pattern_type'     => 'required|in:contains,regex,upi_vpa,exact,starts_with',
            'pattern_value'    => 'required|string|max:191',
            'action'           => 'required|in:create_expense_draft,categorize_expense,match_vendor,match_transfer,ignore',
            'category'         => 'nullable|string|max:100',
            'vendor_name'      => 'nullable|string|max:191',
            'confidence_score' => 'nullable|integer|min:1|max:100',
            'notes'            => 'nullable|string|max:500',
        ]);

        $rule = BankReconciliationRule::create([
            'company_id'       => $user?->company_id ?: 1,
            'branch_id'        => $user?->branch_id,
            'rule_name'        => $data['rule_name'],
            'pattern_type'     => $data['pattern_type'],
            'pattern_value'    => $data['pattern_value'],
            'action'           => $data['action'],
            'category'         => $data['category'] ?? null,
            'vendor_name'      => $data['vendor_name'] ?? null,
            'confidence_score' => $data['confidence_score'] ?? 90,
            'notes'            => $data['notes'] ?? null,
            'source'           => 'manual',
            'is_active'        => true,
            'created_by'       => $user?->id,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Reconciliation rule created successfully.',
            'rule'    => $rule,
            'data'    => $rule,
        ], 201);
    }

    public function updateRule(Request $request, $id)
    {
        $user = Auth::user();
        $rule = BankReconciliationRule::where('company_id', $user?->company_id ?: 1)->findOrFail($id);

        $data = $request->validate([
            'rule_name'        => 'sometimes|required|string|max:191',
            'pattern_type'     => 'sometimes|required|in:contains,regex,upi_vpa,exact,starts_with',
            'pattern_value'    => 'sometimes|required|string|max:191',
            'action'           => 'sometimes|required|in:create_expense_draft,categorize_expense,match_vendor,match_transfer,ignore',
            'category'         => 'nullable|string|max:100',
            'vendor_name'      => 'nullable|string|max:191',
            'confidence_score' => 'nullable|integer|min:1|max:100',
            'is_active'        => 'sometimes|boolean',
            'notes'            => 'nullable|string|max:500',
        ]);

        $data['updated_by'] = $user?->id;
        $rule->update($data);

        return response()->json([
            'success' => true,
            'message' => 'Rule updated successfully.',
            'rule'    => $rule->fresh(),
            'data'    => $rule->fresh(),
        ]);
    }

    public function deleteRule(Request $request, $id)
    {
        $user = Auth::user();
        $rule = BankReconciliationRule::where('company_id', $user?->company_id ?: 1)->findOrFail($id);
        $rule->delete();

        return response()->json([
            'success' => true,
            'message' => 'Rule deleted successfully.',
        ]);
    }

    public function toggleRule(Request $request, $id)
    {
        $user = Auth::user();
        $rule = BankReconciliationRule::where('company_id', $user?->company_id ?: 1)->findOrFail($id);
        $rule->update(['is_active' => !$rule->is_active]);

        return response()->json([
            'success' => true,
            'message' => $rule->is_active ? 'Rule activated.' : 'Rule deactivated.',
            'rule'    => $rule->fresh(),
            'data'    => $rule->fresh(),
        ]);
    }

    /* ==================================================================
     |  6. FINANCIAL YEAR (FY) & DAILY CASH IN/OUT SUMMARY
     | ================================================================== */

    public function dailyCashSummary(Request $request)
    {
        $user = Auth::user();
        $companyId = (int) $request->input('company_id', $user?->company_id ?: 1);
        $date = $request->input('date', now()->toDateString());
        $fyParam = $request->input('financial_year') ?: $request->input('fy');

        $fyRange = $this->getFinancialYearRange($fyParam, Carbon::parse($date));
        $fyStart = $fyRange['start_date'];
        $fyEnd = $fyRange['end_date'];

        // Daily Cash In/Out
        $dailyCashIn = (float) Payment::where('company_id', $companyId)
            ->where('payment_method', 'cash')
            ->where('payment_direction', 'inward')
            ->whereDate('transaction_date', $date)
            ->where('status', '!=', 'failed')
            ->sum('amount');

        $dailyCashOut = (float) Payment::where('company_id', $companyId)
            ->where('payment_method', 'cash')
            ->where('payment_direction', 'outward')
            ->whereDate('transaction_date', $date)
            ->where('status', '!=', 'failed')
            ->sum('amount');

        // Daily UPI In/Out
        $dailyUpiIn = (float) Payment::where('company_id', $companyId)
            ->where('payment_method', 'upi')
            ->where('payment_direction', 'inward')
            ->whereDate('transaction_date', $date)
            ->where('status', '!=', 'failed')
            ->sum('amount');

        $dailyUpiOut = (float) Payment::where('company_id', $companyId)
            ->where('payment_method', 'upi')
            ->where('payment_direction', 'outward')
            ->whereDate('transaction_date', $date)
            ->where('status', '!=', 'failed')
            ->sum('amount');

        // Daily Bank Transfer In/Out
        $dailyBankIn = (float) Payment::where('company_id', $companyId)
            ->whereIn('payment_method', ['bank_transfer', 'neft', 'rtgs', 'imps', 'cheque'])
            ->where('payment_direction', 'inward')
            ->whereDate('transaction_date', $date)
            ->where('status', '!=', 'failed')
            ->sum('amount');

        $dailyBankOut = (float) Payment::where('company_id', $companyId)
            ->whereIn('payment_method', ['bank_transfer', 'neft', 'rtgs', 'imps', 'cheque'])
            ->where('payment_direction', 'outward')
            ->whereDate('transaction_date', $date)
            ->where('status', '!=', 'failed')
            ->sum('amount');

        // FY Totals
        $fyCashIn = (float) Payment::where('company_id', $companyId)
            ->where('payment_method', 'cash')
            ->where('payment_direction', 'inward')
            ->whereBetween('transaction_date', [$fyStart, $fyEnd])
            ->where('status', '!=', 'failed')
            ->sum('amount');

        $fyCashOut = (float) Payment::where('company_id', $companyId)
            ->where('payment_method', 'cash')
            ->where('payment_direction', 'outward')
            ->whereBetween('transaction_date', [$fyStart, $fyEnd])
            ->where('status', '!=', 'failed')
            ->sum('amount');

        $fyUpiIn = (float) Payment::where('company_id', $companyId)
            ->where('payment_method', 'upi')
            ->where('payment_direction', 'inward')
            ->whereBetween('transaction_date', [$fyStart, $fyEnd])
            ->where('status', '!=', 'failed')
            ->sum('amount');

        $fyUpiOut = (float) Payment::where('company_id', $companyId)
            ->where('payment_method', 'upi')
            ->where('payment_direction', 'outward')
            ->whereBetween('transaction_date', [$fyStart, $fyEnd])
            ->where('status', '!=', 'failed')
            ->sum('amount');

        $fyBankIn = (float) Payment::where('company_id', $companyId)
            ->whereIn('payment_method', ['bank_transfer', 'neft', 'rtgs', 'imps', 'cheque'])
            ->where('payment_direction', 'inward')
            ->whereBetween('transaction_date', [$fyStart, $fyEnd])
            ->where('status', '!=', 'failed')
            ->sum('amount');

        $fyBankOut = (float) Payment::where('company_id', $companyId)
            ->whereIn('payment_method', ['bank_transfer', 'neft', 'rtgs', 'imps', 'cheque'])
            ->where('payment_direction', 'outward')
            ->whereBetween('transaction_date', [$fyStart, $fyEnd])
            ->where('status', '!=', 'failed')
            ->sum('amount');

        // Monthly Breakdown for all 12 FY months (Apr -> Mar)
        $monthlyBreakdown = [];
        $currentMonth = Carbon::parse($fyStart)->startOfMonth();
        $endMonth = Carbon::parse($fyEnd)->startOfMonth();

        while ($currentMonth->lte($endMonth)) {
            $mStart = $currentMonth->copy()->startOfMonth()->toDateString();
            $mEnd = $currentMonth->copy()->endOfMonth()->toDateString();
            $mLabel = $currentMonth->format('M Y');

            $mIn = (float) Payment::where('company_id', $companyId)
                ->where('payment_method', 'cash')
                ->where('payment_direction', 'inward')
                ->whereBetween('transaction_date', [$mStart, $mEnd])
                ->where('status', '!=', 'failed')
                ->sum('amount');

            $mOut = (float) Payment::where('company_id', $companyId)
                ->where('payment_method', 'cash')
                ->where('payment_direction', 'outward')
                ->whereBetween('transaction_date', [$mStart, $mEnd])
                ->where('status', '!=', 'failed')
                ->sum('amount');

            $monthlyBreakdown[] = [
                'month' => $mLabel,
                'start_date' => $mStart,
                'end_date' => $mEnd,
                'cash_in' => $mIn,
                'cash_out' => $mOut,
                'net_cash' => round($mIn - $mOut, 2),
            ];

            $currentMonth->addMonth();
        }

        return response()->json([
            'success' => true,
            'data' => [
                'date' => $date,
                'financial_year' => $fyRange['label'],
                'financial_year_start' => $fyStart,
                'financial_year_end' => $fyEnd,
                'available_financial_years' => $this->getAvailableFinancialYears(),
                'daily' => [
                    'cash_in' => $dailyCashIn,
                    'cash_out' => $dailyCashOut,
                    'net_cash' => round($dailyCashIn - $dailyCashOut, 2),
                    'upi_in' => $dailyUpiIn,
                    'upi_out' => $dailyUpiOut,
                    'bank_in' => $dailyBankIn,
                    'bank_out' => $dailyBankOut,
                    'total_in' => round($dailyCashIn + $dailyUpiIn + $dailyBankIn, 2),
                    'total_out' => round($dailyCashOut + $dailyUpiOut + $dailyBankOut, 2),
                ],
                'financial_year_totals' => [
                    'cash_in' => $fyCashIn,
                    'cash_out' => $fyCashOut,
                    'net_cash' => round($fyCashIn - $fyCashOut, 2),
                    'upi_in' => $fyUpiIn,
                    'upi_out' => $fyUpiOut,
                    'bank_in' => $fyBankIn,
                    'bank_out' => $fyBankOut,
                    'total_in' => round($fyCashIn + $fyUpiIn + $fyBankIn, 2),
                    'total_out' => round($fyCashOut + $fyUpiOut + $fyBankOut, 2),
                ],
                'monthly_breakdown' => $monthlyBreakdown,
            ],
        ]);
    }

    /**
     * Quick create and reconcile a payment directly from an unmatched statement row (UPI / Bank Transfer).
     */
    public function quickCreatePaymentAndMatch(Request $request)
    {
        $user = Auth::user();
        $data = $request->validate([
            'statement_transaction_id' => 'required|exists:bank_statement_transactions,id',
            'payment_direction'        => 'required|in:inward,outward',
            'payment_method'           => 'required|string',
            'transaction_date'         => 'nullable|date',
            'reference_no'             => 'nullable|string|max:191',
            'customer_name'            => 'nullable|string|max:191',
            'remarks'                  => 'nullable|string|max:500',
            'invoice_id'               => 'nullable|exists:invoices,id',
        ]);

        $st = BankStatementTransaction::findOrFail($data['statement_transaction_id']);
        $account = BankAccount::findOrFail($st->bank_account_id);
        $amount = (float) ($data['payment_direction'] === 'inward' ? $st->credit : $st->debit);
        if ($amount <= 0) {
            $amount = (float) ($st->credit > 0 ? $st->credit : $st->debit);
        }

        // Determine transaction date: request transaction_date > statement transaction_date > today
        $txnDate = !empty($data['transaction_date'])
            ? Carbon::parse($data['transaction_date'])->toDateString()
            : ($st->transaction_date ?: now()->toDateString());

        return DB::transaction(function () use ($st, $account, $data, $amount, $txnDate, $user) {
            $reference = !empty($data['reference_no']) ? $data['reference_no'] : ($st->reference_no ?: 'REF-' . strtoupper(Str::random(8)));
            $partyName = !empty($data['customer_name']) ? trim($data['customer_name']) : '';
            $remarksText = $data['remarks'] ?: "Reconciled from statement: {$st->description}";
            if ($partyName && !str_contains($remarksText, $partyName)) {
                $remarksText = "Party: {$partyName}. " . $remarksText;
            }

            // 1. Create Payment record
            $payment = Payment::create([
                'company_id'        => $account->company_id,
                'branch_id'         => $account->branch_id,
                'bank_account_id'   => $account->id,
                'invoice_id'        => $data['invoice_id'] ?? null,
                'amount'            => $amount,
                'payment_method'    => $data['payment_method'],
                'payment_direction' => $data['payment_direction'],
                'reference_no'      => $reference,
                'bank_name'         => $partyName ?: ($account->bank_name ?: $account->account_name),
                'account_number'    => $account->account_number,
                'status'            => 'reconciled',
                'transaction_date'  => $txnDate,
                'remarks'           => $remarksText,
                'created_by'        => $user?->id,
            ]);

            // 2. Mark statement transaction matched
            $st->update([
                'reconciliation_status' => 'matched',
                'matched_payment_id'    => $payment->id,
                'matched_at'            => now(),
                'matched_by'            => $user?->id,
            ]);

            // 3. Record Match
            ReconciliationMatch::create([
                'bank_statement_transaction_id' => $st->id,
                'payment_id'                    => $payment->id,
                'allocated_amount'              => $amount,
                'confidence_score'              => 100,
                'match_rule'                    => 'quick_record',
                'status'                        => 'confirmed',
                'created_by'                    => $user?->id,
            ]);

            // 4. Update ledger
            $isCredit = $data['payment_direction'] === 'inward';
            $txnType = $isCredit ? 'deposit' : 'withdrawal';
            $newBalance = $isCredit
                ? (float) $account->current_balance + $amount
                : (float) $account->current_balance - $amount;

            $account->update(['current_balance' => $newBalance]);

            BankAccountTransaction::create([
                'company_id'       => $account->company_id,
                'branch_id'        => $account->branch_id,
                'bank_account_id'  => $account->id,
                'transaction_date' => $txnDate,
                'transaction_type' => $txnType,
                'amount'           => $amount,
                'running_balance'  => $newBalance,
                'payment_id'       => $payment->id,
                'reference_no'     => $reference,
                'description'      => "Statement reconciliation: {$st->description}",
                'counterparty'     => $partyName ?: ($isCredit ? 'Customer' : 'Vendor'),
                'status'           => 'reconciled',
                'created_by'       => $user?->id,
            ]);

            return response()->json([
                'success' => true,
                'message' => "Payment ({$data['payment_direction']} ₹" . number_format($amount, 2) . " via {$data['payment_method']}) recorded and reconciled",
                'data' => [
                    'payment' => $payment,
                    'statement_transaction' => $st->fresh(),
                    'account' => $account->fresh(),
                ],
            ], 201);
        });
    }

    /**
     * Compute Indian Financial Year (April 1 to March 31).
     */
    public function getFinancialYearRange(?string $fy = null, ?Carbon $referenceDate = null): array
    {
        if ($fy && preg_match('/^FY\s*(\d{4})[-–](\d{2,4})$/i', trim($fy), $m)) {
            $startYear = (int) $m[1];
            $endYear = strlen($m[2]) === 2 ? ((int) substr((string)$startYear, 0, 2) * 100 + (int) $m[2]) : (int) $m[2];
        } elseif ($fy && preg_match('/^(\d{4})[-–](\d{2,4})$/', trim($fy), $m)) {
            $startYear = (int) $m[1];
            $endYear = strlen($m[2]) === 2 ? ((int) substr((string)$startYear, 0, 2) * 100 + (int) $m[2]) : (int) $m[2];
        } else {
            $ref = $referenceDate ?: now();
            $year = (int) $ref->year;
            if ((int) $ref->month >= 4) {
                $startYear = $year;
                $endYear = $year + 1;
            } else {
                $startYear = $year - 1;
                $endYear = $year;
            }
        }

        $shortEnd = substr((string) $endYear, -2);
        return [
            0 => "{$startYear}-04-01",
            1 => "{$endYear}-03-31",
            'label' => "FY {$startYear}-{$shortEnd}",
            'start_date' => "{$startYear}-04-01",
            'end_date' => "{$endYear}-03-31",
            'start_year' => $startYear,
            'end_year' => $endYear,
        ];
    }

    /**
     * Get list of recent Indian Financial Years.
     */
    public function getAvailableFinancialYears(): array
    {
        $curYear = (int) now()->year;
        if ((int) now()->month < 4) $curYear--;
        $list = [];
        for ($i = 0; $i < 5; $i++) {
            $y = $curYear - $i;
            $short = substr((string)($y + 1), -2);
            $list[] = "FY {$y}-{$short}";
        }
        return $list;
    }
}
