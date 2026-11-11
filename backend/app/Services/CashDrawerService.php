<?php

namespace App\Services;

use App\Models\Branch;
use App\Models\CashDrawer;
use App\Models\CashDrawerAuditLog;
use App\Models\CashDrawerDenomination;
use App\Models\CashDrawerSession;
use App\Models\CashDrawerTransaction;
use App\Models\CashDrawerTransfer;
use App\Models\Payment;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class CashDrawerService
{
    /**
     * Standard currency denominations fallback
     */
    public const DEFAULT_INR_DENOMINATIONS = [
        ['label' => '₹500', 'value' => 500.00, 'sort_order' => 1],
        ['label' => '₹200', 'value' => 200.00, 'sort_order' => 2],
        ['label' => '₹100', 'value' => 100.00, 'sort_order' => 3],
        ['label' => '₹50',  'value' => 50.00,  'sort_order' => 4],
        ['label' => '₹20',  'value' => 20.00,  'sort_order' => 5],
        ['label' => '₹10',  'value' => 10.00,  'sort_order' => 6],
        ['label' => '₹5',   'value' => 5.00,   'sort_order' => 7],
        ['label' => '₹2',   'value' => 2.00,   'sort_order' => 8],
        ['label' => '₹1',   'value' => 1.00,   'sort_order' => 9],
        ['label' => 'Coins (Total)', 'value' => 1.00, 'sort_order' => 10],
    ];

    /**
     * Retrieve active denominations for company / currency.
     */
    public function getDenominations(?int $companyId = null, string $currency = 'INR')
    {
        $query = CashDrawerDenomination::where('is_active', true)
            ->where('currency', $currency);

        if ($companyId) {
            $query->where(function ($q) use ($companyId) {
                $q->where('company_id', $companyId)->orWhereNull('company_id');
            });
        }

        $items = $query->orderBy('sort_order')->get();

        if ($items->isEmpty()) {
            return collect(self::DEFAULT_INR_DENOMINATIONS)->map(function ($item) use ($currency) {
                return (object) [
                    'label' => $item['label'],
                    'value' => $item['value'],
                    'sort_order' => $item['sort_order'],
                    'currency' => $currency,
                    'is_active' => true,
                ];
            });
        }

        return $items;
    }

    /**
     * Retrieve suggested opening cash from previous session's actual closing cash.
     */
    public function getPreviousClosingCash(CashDrawer $drawer): float
    {
        $lastClosedSession = CashDrawerSession::where('cash_drawer_id', $drawer->id)
            ->where('status', 'closed')
            ->orderByDesc('closed_at')
            ->orderByDesc('id')
            ->first();

        if ($lastClosedSession && $lastClosedSession->actual_closing_cash !== null) {
            return (float) $lastClosedSession->actual_closing_cash;
        }

        return (float) $drawer->current_balance;
    }

    /**
     * Open a daily session for a cash drawer.
     */
    public function openSession(CashDrawer $drawer, User $user, array $data): CashDrawerSession
    {
        return DB::transaction(function () use ($drawer, $user, $data) {
            $lockedDrawer = CashDrawer::where('id', $drawer->id)->lockForUpdate()->firstOrFail();

            if ($lockedDrawer->status !== 'active') {
                throw ValidationException::withMessages([
                    'cash_drawer' => ["Cash drawer '{$lockedDrawer->name}' is {$lockedDrawer->status} and cannot be opened."],
                ]);
            }

            // Ensure no active open session exists for this drawer
            $activeSession = CashDrawerSession::where('cash_drawer_id', $lockedDrawer->id)
                ->where('status', 'open')
                ->lockForUpdate()
                ->first();

            if ($activeSession) {
                throw ValidationException::withMessages([
                    'session' => ["An active session (#{$activeSession->session_number}) is already open for this cash drawer."],
                ]);
            }

            $suggestedOpening = $this->getPreviousClosingCash($lockedDrawer);
            $openingBalance = isset($data['opening_balance'])
                ? round((float) $data['opening_balance'], 2)
                : $suggestedOpening;

            $difference = round($openingBalance - $suggestedOpening, 2);

            // If opening balance deviates from carry-forward, require explanation
            if (abs($difference) > 0.009 && empty($data['opening_difference_reason'])) {
                throw ValidationException::withMessages([
                    'opening_difference_reason' => [
                        "Opening cash (₹{$openingBalance}) differs from carried-forward balance (₹{$suggestedOpening}). A mandatory reason is required.",
                    ],
                ]);
            }

            $sessionNumber = 'CDS-' . date('Ymd') . '-' . strtoupper(Str::random(6));

            $session = CashDrawerSession::create([
                'company_id' => $lockedDrawer->company_id,
                'branch_id' => $lockedDrawer->branch_id,
                'cash_drawer_id' => $lockedDrawer->id,
                'user_id' => $user->id,
                'session_number' => $sessionNumber,
                'status' => 'open',
                'opened_at' => !empty($data['opened_at']) ? Carbon::parse($data['opened_at']) : now(),
                'opening_balance' => $openingBalance,
                'suggested_opening_balance' => $suggestedOpening,
                'opening_difference' => $difference,
                'opening_difference_reason' => $data['opening_difference_reason'] ?? null,
                'opening_notes' => $data['opening_notes'] ?? null,
                'opening_denominations' => $data['opening_denominations'] ?? null,
                'total_cash_in' => 0.00,
                'total_cash_out' => 0.00,
                'expected_closing_cash' => $openingBalance,
                'actual_closing_cash' => null,
                'closing_difference' => null,
                'discrepancy_status' => 'none',
            ]);

            // Update drawer balance to match the verified opening balance
            $oldBalance = (float) $lockedDrawer->current_balance;
            $lockedDrawer->current_balance = $openingBalance;
            $lockedDrawer->updated_by = $user->id;
            $lockedDrawer->save();

            // Record opening float transaction for complete audit history
            $this->createTransaction([
                'company_id' => $lockedDrawer->company_id,
                'branch_id' => $lockedDrawer->branch_id,
                'cash_drawer_id' => $lockedDrawer->id,
                'cash_drawer_session_id' => $session->id,
                'transaction_type' => 'opening_float',
                'category' => 'opening_float',
                'amount' => $openingBalance,
                'balance_before' => $oldBalance,
                'balance_after' => $openingBalance,
                'transaction_date' => $session->opened_at,
                'reference_no' => $session->session_number,
                'received_from_or_paid_to' => $user->name,
                'description' => "Opening float for session #{$session->session_number}" . ($difference != 0 ? " (Difference: ₹{$difference})" : ""),
                'source_type' => 'opening',
                'source_id' => $session->id,
                'idempotency_key' => "opening_session_{$session->id}",
                'created_by' => $user->id,
            ]);

            $this->logAudit([
                'company_id' => $lockedDrawer->company_id,
                'branch_id' => $lockedDrawer->branch_id,
                'cash_drawer_id' => $lockedDrawer->id,
                'cash_drawer_session_id' => $session->id,
                'action' => 'session_opened',
                'user_id' => $user->id,
                'old_values' => ['current_balance' => $oldBalance],
                'new_values' => [
                    'session_id' => $session->id,
                    'opening_balance' => $openingBalance,
                    'difference' => $difference,
                ],
                'notes' => "Session opened with ₹{$openingBalance}",
            ]);

            return $session->load(['cashDrawer', 'cashier']);
        });
    }

    /**
     * Record a cash-in transaction into the active drawer session.
     */
    public function recordCashIn(CashDrawer $drawer, User $user, array $data): CashDrawerTransaction
    {
        return DB::transaction(function () use ($drawer, $user, $data) {
            $lockedDrawer = CashDrawer::where('id', $drawer->id)->lockForUpdate()->firstOrFail();

            $activeSession = CashDrawerSession::where('cash_drawer_id', $lockedDrawer->id)
                ->where('status', 'open')
                ->lockForUpdate()
                ->first();

            if (!$activeSession) {
                throw ValidationException::withMessages([
                    'session' => ["Cash drawer '{$lockedDrawer->name}' does not have an active open session. Please open the drawer first."],
                ]);
            }

            $amount = round((float) $data['amount'], 2);
            if ($amount <= 0) {
                throw ValidationException::withMessages([
                    'amount' => ['Cash in amount must be greater than zero.'],
                ]);
            }

            $idempotencyKey = $data['idempotency_key'] ?? null;
            if ($idempotencyKey) {
                $existing = CashDrawerTransaction::where('company_id', $lockedDrawer->company_id)
                    ->where('idempotency_key', $idempotencyKey)
                    ->first();
                if ($existing) {
                    return $existing;
                }
            }

            $balanceBefore = (float) $lockedDrawer->current_balance;
            $balanceAfter = round($balanceBefore + $amount, 2);

            $lockedDrawer->current_balance = $balanceAfter;
            $lockedDrawer->updated_by = $user->id;
            $lockedDrawer->save();

            $activeSession->total_cash_in = round((float) $activeSession->total_cash_in + $amount, 2);
            $activeSession->expected_closing_cash = round(
                (float) $activeSession->opening_balance + (float) $activeSession->total_cash_in - (float) $activeSession->total_cash_out,
                2
            );
            $activeSession->save();

            $txnDate = !empty($data['transaction_date']) ? Carbon::parse($data['transaction_date']) : now();

            $txn = $this->createTransaction([
                'company_id' => $lockedDrawer->company_id,
                'branch_id' => $lockedDrawer->branch_id,
                'cash_drawer_id' => $lockedDrawer->id,
                'cash_drawer_session_id' => $activeSession->id,
                'transaction_type' => 'cash_in',
                'category' => $data['category'] ?? 'other_receipt',
                'amount' => $amount,
                'balance_before' => $balanceBefore,
                'balance_after' => $balanceAfter,
                'transaction_date' => $txnDate,
                'reference_no' => $data['reference_no'] ?? null,
                'received_from_or_paid_to' => $data['received_from'] ?? $data['received_from_or_paid_to'] ?? null,
                'description' => $data['description'] ?? $data['notes'] ?? null,
                'source_type' => $data['source_type'] ?? 'manual',
                'source_id' => $data['source_id'] ?? null,
                'idempotency_key' => $idempotencyKey,
                'created_by' => $user->id,
            ]);

            $this->logAudit([
                'company_id' => $lockedDrawer->company_id,
                'branch_id' => $lockedDrawer->branch_id,
                'cash_drawer_id' => $lockedDrawer->id,
                'cash_drawer_session_id' => $activeSession->id,
                'action' => 'cash_in',
                'user_id' => $user->id,
                'old_values' => ['current_balance' => $balanceBefore],
                'new_values' => ['current_balance' => $balanceAfter, 'amount' => $amount, 'category' => $txn->category],
                'notes' => "Cash In: ₹{$amount} ({$txn->category})",
            ]);

            return $txn;
        });
    }

    /**
     * Record a cash-out transaction from the active drawer session.
     */
    public function recordCashOut(CashDrawer $drawer, User $user, array $data): CashDrawerTransaction
    {
        return DB::transaction(function () use ($drawer, $user, $data) {
            $lockedDrawer = CashDrawer::where('id', $drawer->id)->lockForUpdate()->firstOrFail();

            $activeSession = CashDrawerSession::where('cash_drawer_id', $lockedDrawer->id)
                ->where('status', 'open')
                ->lockForUpdate()
                ->first();

            if (!$activeSession) {
                throw ValidationException::withMessages([
                    'session' => ["Cash drawer '{$lockedDrawer->name}' does not have an active open session. Please open the drawer first."],
                ]);
            }

            $amount = round((float) $data['amount'], 2);
            if ($amount <= 0) {
                throw ValidationException::withMessages([
                    'amount' => ['Cash out amount must be greater than zero.'],
                ]);
            }

            $idempotencyKey = $data['idempotency_key'] ?? null;
            if ($idempotencyKey) {
                $existing = CashDrawerTransaction::where('company_id', $lockedDrawer->company_id)
                    ->where('idempotency_key', $idempotencyKey)
                    ->first();
                if ($existing) {
                    return $existing;
                }
            }

            $balanceBefore = (float) $lockedDrawer->current_balance;
            $overdraftAllowed = (bool) $lockedDrawer->allow_overdraft;
            $overdraftLimit = (float) $lockedDrawer->overdraft_limit;

            if ($balanceBefore < $amount && !$overdraftAllowed) {
                throw ValidationException::withMessages([
                    'amount' => ["Insufficient cash in drawer '{$lockedDrawer->name}'. Current balance is ₹{$balanceBefore}, requested payout is ₹{$amount}."],
                ]);
            }

            if ($balanceBefore < $amount && $overdraftAllowed) {
                $maxAllowed = $balanceBefore + $overdraftLimit;
                if ($amount > $maxAllowed) {
                    throw ValidationException::withMessages([
                        'amount' => ["Payout exceeds authorized overdraft limit. Max allowed is ₹{$maxAllowed}, requested payout is ₹{$amount}."],
                    ]);
                }
            }

            $balanceAfter = round($balanceBefore - $amount, 2);

            $lockedDrawer->current_balance = $balanceAfter;
            $lockedDrawer->updated_by = $user->id;
            $lockedDrawer->save();

            $activeSession->total_cash_out = round((float) $activeSession->total_cash_out + $amount, 2);
            $activeSession->expected_closing_cash = round(
                (float) $activeSession->opening_balance + (float) $activeSession->total_cash_in - (float) $activeSession->total_cash_out,
                2
            );
            $activeSession->save();

            $txnDate = !empty($data['transaction_date']) ? Carbon::parse($data['transaction_date']) : now();

            $txn = $this->createTransaction([
                'company_id' => $lockedDrawer->company_id,
                'branch_id' => $lockedDrawer->branch_id,
                'cash_drawer_id' => $lockedDrawer->id,
                'cash_drawer_session_id' => $activeSession->id,
                'transaction_type' => 'cash_out',
                'category' => $data['category'] ?? 'other_expense',
                'amount' => $amount,
                'balance_before' => $balanceBefore,
                'balance_after' => $balanceAfter,
                'transaction_date' => $txnDate,
                'reference_no' => $data['reference_no'] ?? null,
                'received_from_or_paid_to' => $data['paid_to'] ?? $data['received_from_or_paid_to'] ?? null,
                'description' => $data['description'] ?? $data['notes'] ?? null,
                'source_type' => $data['source_type'] ?? 'manual',
                'source_id' => $data['source_id'] ?? null,
                'idempotency_key' => $idempotencyKey,
                'created_by' => $user->id,
            ]);

            $this->logAudit([
                'company_id' => $lockedDrawer->company_id,
                'branch_id' => $lockedDrawer->branch_id,
                'cash_drawer_id' => $lockedDrawer->id,
                'cash_drawer_session_id' => $activeSession->id,
                'action' => 'cash_out',
                'user_id' => $user->id,
                'old_values' => ['current_balance' => $balanceBefore],
                'new_values' => ['current_balance' => $balanceAfter, 'amount' => $amount, 'category' => $txn->category],
                'notes' => "Cash Out: ₹{$amount} ({$txn->category}) to {$txn->received_from_or_paid_to}",
            ]);

            return $txn;
        });
    }

    /**
     * Close a cash drawer session, perform reconciliation, and record discrepancies.
     */
    public function closeSession(CashDrawerSession $session, User $user, array $data): CashDrawerSession
    {
        return DB::transaction(function () use ($session, $user, $data) {
            $lockedSession = CashDrawerSession::where('id', $session->id)->lockForUpdate()->firstOrFail();

            if ($lockedSession->status !== 'open') {
                throw ValidationException::withMessages([
                    'session' => ["Session #{$lockedSession->session_number} is already closed."],
                ]);
            }

            $lockedDrawer = CashDrawer::where('id', $lockedSession->cash_drawer_id)->lockForUpdate()->firstOrFail();

            // Calculate expected closing balance
            $expectedCash = round(
                (float) $lockedSession->opening_balance + (float) $lockedSession->total_cash_in - (float) $lockedSession->total_cash_out,
                2
            );

            // Calculate actual physical cash
            $actualCash = isset($data['actual_closing_cash'])
                ? round((float) $data['actual_closing_cash'], 2)
                : $expectedCash;

            $difference = round($actualCash - $expectedCash, 2);
            $hasDiscrepancy = abs($difference) > 0.009;

            if ($hasDiscrepancy && empty($data['discrepancy_reason'])) {
                $label = $difference < 0 ? 'Shortage' : 'Excess';
                $diffAbs = abs($difference);
                throw ValidationException::withMessages([
                    'discrepancy_reason' => [
                        "Physical cash (₹{$actualCash}) does not match expected closing cash (₹{$expectedCash}). {$label} of ₹{$diffAbs} requires a mandatory explanation.",
                    ],
                ]);
            }

            $closingTime = !empty($data['closed_at']) ? Carbon::parse($data['closed_at']) : now();

            $discrepancyStatus = $hasDiscrepancy ? 'pending_approval' : 'none';

            $lockedSession->status = 'closed';
            $lockedSession->closed_at = $closingTime;
            $lockedSession->closed_by = $user->id;
            $lockedSession->expected_closing_cash = $expectedCash;
            $lockedSession->actual_closing_cash = $actualCash;
            $lockedSession->closing_difference = $difference;
            $lockedSession->closing_notes = $data['closing_notes'] ?? null;
            $lockedSession->discrepancy_reason = $data['discrepancy_reason'] ?? null;
            $lockedSession->closing_denominations = $data['closing_denominations'] ?? null;
            $lockedSession->discrepancy_status = $discrepancyStatus;
            $lockedSession->save();

            // Carry forward the actual physical cash counted into the drawer current balance
            $oldDrawerBalance = (float) $lockedDrawer->current_balance;
            $lockedDrawer->current_balance = $actualCash;
            $lockedDrawer->updated_by = $user->id;
            $lockedDrawer->save();

            // If there's an adjustment/discrepancy, post an internal adjusting transaction
            if ($hasDiscrepancy) {
                $adjCategory = $difference < 0 ? 'shortage_adjustment' : 'excess_adjustment';
                $adjType = $difference < 0 ? 'adjustment' : 'adjustment';

                $this->createTransaction([
                    'company_id' => $lockedDrawer->company_id,
                    'branch_id' => $lockedDrawer->branch_id,
                    'cash_drawer_id' => $lockedDrawer->id,
                    'cash_drawer_session_id' => $lockedSession->id,
                    'transaction_type' => $adjType,
                    'category' => $adjCategory,
                    'amount' => abs($difference),
                    'balance_before' => $expectedCash,
                    'balance_after' => $actualCash,
                    'transaction_date' => $closingTime,
                    'reference_no' => "DIFF-{$lockedSession->session_number}",
                    'received_from_or_paid_to' => $user->name,
                    'description' => "Closing discrepancy: " . ($difference < 0 ? "Shortage" : "Excess") . " of ₹" . abs($difference) . " | Reason: " . ($data['discrepancy_reason'] ?? 'None'),
                    'source_type' => 'adjustment',
                    'source_id' => $lockedSession->id,
                    'idempotency_key' => "closing_diff_{$lockedSession->id}",
                    'created_by' => $user->id,
                ]);
            }

            $this->logAudit([
                'company_id' => $lockedDrawer->company_id,
                'branch_id' => $lockedDrawer->branch_id,
                'cash_drawer_id' => $lockedDrawer->id,
                'cash_drawer_session_id' => $lockedSession->id,
                'action' => 'session_closed',
                'user_id' => $user->id,
                'old_values' => ['current_balance' => $oldDrawerBalance, 'expected' => $expectedCash],
                'new_values' => [
                    'actual_closing_cash' => $actualCash,
                    'closing_difference' => $difference,
                    'discrepancy_status' => $discrepancyStatus,
                ],
                'notes' => "Session closed with ₹{$actualCash} (Diff: ₹{$difference})",
            ]);

            return $lockedSession->fresh(['cashDrawer', 'cashier', 'closer']);
        });
    }

    /**
     * Approve or reject a closing session cash discrepancy.
     */
    public function reviewDiscrepancy(CashDrawerSession $session, User $approver, bool $approve, ?string $notes = null): CashDrawerSession
    {
        return DB::transaction(function () use ($session, $approver, $approve, $notes) {
            $lockedSession = CashDrawerSession::where('id', $session->id)->lockForUpdate()->firstOrFail();

            if ($lockedSession->status !== 'closed') {
                throw ValidationException::withMessages([
                    'session' => ['Only closed sessions can have discrepancies reviewed.'],
                ]);
            }

            $lockedSession->discrepancy_status = $approve ? 'approved' : 'rejected';
            $lockedSession->approved_by = $approver->id;
            $lockedSession->approved_at = now();
            $lockedSession->approval_notes = $notes;
            $lockedSession->save();

            $this->logAudit([
                'company_id' => $lockedSession->company_id,
                'branch_id' => $lockedSession->branch_id,
                'cash_drawer_id' => $lockedSession->cash_drawer_id,
                'cash_drawer_session_id' => $lockedSession->id,
                'action' => $approve ? 'discrepancy_approved' : 'discrepancy_rejected',
                'user_id' => $approver->id,
                'new_values' => [
                    'discrepancy_status' => $lockedSession->discrepancy_status,
                    'notes' => $notes,
                ],
                'notes' => "Discrepancy " . ($approve ? 'Approved' : 'Rejected') . " by {$approver->name}",
            ]);

            return $lockedSession->fresh(['cashDrawer', 'approver']);
        });
    }

    /**
     * Initiate an inter-drawer or cross-branch cash transfer.
     */
    public function initiateTransfer(CashDrawer $sourceDrawer, CashDrawer $destinationDrawer, User $user, float $amount, ?string $notes = null): CashDrawerTransfer
    {
        return DB::transaction(function () use ($sourceDrawer, $destinationDrawer, $user, $amount, $notes) {
            if ($sourceDrawer->company_id !== $destinationDrawer->company_id) {
                throw ValidationException::withMessages([
                    'destination_drawer_id' => ['Cross-company transfers are not permitted.'],
                ]);
            }

            if ($sourceDrawer->id === $destinationDrawer->id) {
                throw ValidationException::withMessages([
                    'destination_drawer_id' => ['Source and destination cash drawer cannot be the same.'],
                ]);
            }

            $amount = round($amount, 2);
            if ($amount <= 0) {
                throw ValidationException::withMessages([
                    'amount' => ['Transfer amount must be greater than zero.'],
                ]);
            }

            $lockedSource = CashDrawer::where('id', $sourceDrawer->id)->lockForUpdate()->firstOrFail();
            $sourceSession = CashDrawerSession::where('cash_drawer_id', $lockedSource->id)
                ->where('status', 'open')
                ->lockForUpdate()
                ->first();

            if (!$sourceSession) {
                throw ValidationException::withMessages([
                    'source_drawer' => ["Source drawer '{$lockedSource->name}' must have an open session to dispatch cash."],
                ]);
            }

            $balanceBefore = (float) $lockedSource->current_balance;
            if ($balanceBefore < $amount && !$lockedSource->allow_overdraft) {
                throw ValidationException::withMessages([
                    'amount' => ["Insufficient cash in source drawer. Current balance: ₹{$balanceBefore}, transfer amount: ₹{$amount}."],
                ]);
            }

            $balanceAfter = round($balanceBefore - $amount, 2);
            $lockedSource->current_balance = $balanceAfter;
            $lockedSource->updated_by = $user->id;
            $lockedSource->save();

            $sourceSession->total_cash_out = round((float) $sourceSession->total_cash_out + $amount, 2);
            $sourceSession->expected_closing_cash = round(
                (float) $sourceSession->opening_balance + (float) $sourceSession->total_cash_in - (float) $sourceSession->total_cash_out,
                2
            );
            $sourceSession->save();

            $transferNumber = 'CDTR-' . date('Ymd') . '-' . strtoupper(Str::random(6));

            $sourceTxn = $this->createTransaction([
                'company_id' => $lockedSource->company_id,
                'branch_id' => $lockedSource->branch_id,
                'cash_drawer_id' => $lockedSource->id,
                'cash_drawer_session_id' => $sourceSession->id,
                'transaction_type' => 'transfer_out',
                'category' => 'transfer_out',
                'amount' => $amount,
                'balance_before' => $balanceBefore,
                'balance_after' => $balanceAfter,
                'transaction_date' => now(),
                'reference_no' => $transferNumber,
                'received_from_or_paid_to' => "Transfer to {$destinationDrawer->name}",
                'description' => "Cash transfer dispatched to {$destinationDrawer->name} (#{$transferNumber})",
                'source_type' => 'cash_transfer',
                'idempotency_key' => "transfer_out_{$transferNumber}",
                'created_by' => $user->id,
            ]);

            $transfer = CashDrawerTransfer::create([
                'company_id' => $lockedSource->company_id,
                'transfer_number' => $transferNumber,
                'source_drawer_id' => $lockedSource->id,
                'source_branch_id' => $lockedSource->branch_id,
                'source_session_id' => $sourceSession->id,
                'destination_drawer_id' => $destinationDrawer->id,
                'destination_branch_id' => $destinationDrawer->branch_id,
                'amount' => $amount,
                'status' => 'in_transit',
                'initiated_by' => $user->id,
                'initiated_at' => now(),
                'source_transaction_id' => $sourceTxn->id,
                'notes' => $notes,
            ]);

            $sourceTxn->source_id = $transfer->id;
            $sourceTxn->save();

            $this->logAudit([
                'company_id' => $lockedSource->company_id,
                'branch_id' => $lockedSource->branch_id,
                'cash_drawer_id' => $lockedSource->id,
                'cash_drawer_session_id' => $sourceSession->id,
                'action' => 'transfer_initiated',
                'user_id' => $user->id,
                'old_values' => ['current_balance' => $balanceBefore],
                'new_values' => ['current_balance' => $balanceAfter, 'amount' => $amount, 'transfer_id' => $transfer->id],
                'notes' => "Transfer #{$transferNumber} of ₹{$amount} dispatched to {$destinationDrawer->name}",
            ]);

            return $transfer->load(['sourceDrawer', 'destinationDrawer', 'initiator']);
        });
    }

    /**
     * Receive and confirm cash at destination drawer.
     */
    public function receiveTransfer(CashDrawerTransfer $transfer, User $user, ?string $notes = null): CashDrawerTransfer
    {
        return DB::transaction(function () use ($transfer, $user, $notes) {
            $lockedTransfer = CashDrawerTransfer::where('id', $transfer->id)->lockForUpdate()->firstOrFail();

            if (!in_array($lockedTransfer->status, ['initiated', 'in_transit'], true)) {
                throw ValidationException::withMessages([
                    'transfer' => ["Transfer #{$lockedTransfer->transfer_number} is already {$lockedTransfer->status}."],
                ]);
            }

            $lockedDest = CashDrawer::where('id', $lockedTransfer->destination_drawer_id)->lockForUpdate()->firstOrFail();
            $destSession = CashDrawerSession::where('cash_drawer_id', $lockedDest->id)
                ->where('status', 'open')
                ->lockForUpdate()
                ->first();

            if (!$destSession) {
                throw ValidationException::withMessages([
                    'destination_drawer' => ["Destination cash drawer '{$lockedDest->name}' does not have an active open session. Please open the drawer before receiving cash."],
                ]);
            }

            $amount = (float) $lockedTransfer->amount;
            $balanceBefore = (float) $lockedDest->current_balance;
            $balanceAfter = round($balanceBefore + $amount, 2);

            $lockedDest->current_balance = $balanceAfter;
            $lockedDest->updated_by = $user->id;
            $lockedDest->save();

            $destSession->total_cash_in = round((float) $destSession->total_cash_in + $amount, 2);
            $destSession->expected_closing_cash = round(
                (float) $destSession->opening_balance + (float) $destSession->total_cash_in - (float) $destSession->total_cash_out,
                2
            );
            $destSession->save();

            $destTxn = $this->createTransaction([
                'company_id' => $lockedDest->company_id,
                'branch_id' => $lockedDest->branch_id,
                'cash_drawer_id' => $lockedDest->id,
                'cash_drawer_session_id' => $destSession->id,
                'transaction_type' => 'transfer_in',
                'category' => 'transfer_in',
                'amount' => $amount,
                'balance_before' => $balanceBefore,
                'balance_after' => $balanceAfter,
                'transaction_date' => now(),
                'reference_no' => $lockedTransfer->transfer_number,
                'received_from_or_paid_to' => "Transfer from {$lockedTransfer->sourceDrawer->name}",
                'description' => "Cash transfer received from {$lockedTransfer->sourceDrawer->name} (#{$lockedTransfer->transfer_number})" . ($notes ? " | Note: {$notes}" : ""),
                'source_type' => 'cash_transfer',
                'source_id' => $lockedTransfer->id,
                'idempotency_key' => "transfer_in_{$lockedTransfer->transfer_number}",
                'created_by' => $user->id,
            ]);

            $lockedTransfer->status = 'received';
            $lockedTransfer->received_by = $user->id;
            $lockedTransfer->received_at = now();
            $lockedTransfer->destination_session_id = $destSession->id;
            $lockedTransfer->destination_transaction_id = $destTxn->id;
            if ($notes) {
                $lockedTransfer->notes = $lockedTransfer->notes ? "{$lockedTransfer->notes} | Receipt: {$notes}" : $notes;
            }
            $lockedTransfer->save();

            $this->logAudit([
                'company_id' => $lockedDest->company_id,
                'branch_id' => $lockedDest->branch_id,
                'cash_drawer_id' => $lockedDest->id,
                'cash_drawer_session_id' => $destSession->id,
                'action' => 'transfer_received',
                'user_id' => $user->id,
                'old_values' => ['current_balance' => $balanceBefore],
                'new_values' => ['current_balance' => $balanceAfter, 'amount' => $amount, 'transfer_id' => $lockedTransfer->id],
                'notes' => "Transfer #{$lockedTransfer->transfer_number} received into {$lockedDest->name}",
            ]);

            return $lockedTransfer->fresh(['sourceDrawer', 'destinationDrawer', 'receiver']);
        });
    }

    /**
     * Reject a pending cash transfer and refund the source drawer.
     */
    public function rejectTransfer(CashDrawerTransfer $transfer, User $user, string $reason): CashDrawerTransfer
    {
        return DB::transaction(function () use ($transfer, $user, $reason) {
            $lockedTransfer = CashDrawerTransfer::where('id', $transfer->id)->lockForUpdate()->firstOrFail();

            if (!in_array($lockedTransfer->status, ['initiated', 'in_transit'], true)) {
                throw ValidationException::withMessages([
                    'transfer' => ["Transfer #{$lockedTransfer->transfer_number} is already {$lockedTransfer->status} and cannot be rejected."],
                ]);
            }

            $amount = (float) $lockedTransfer->amount;
            $lockedSource = CashDrawer::where('id', $lockedTransfer->source_drawer_id)->lockForUpdate()->firstOrFail();
            $sourceSession = CashDrawerSession::where('cash_drawer_id', $lockedSource->id)
                ->where('status', 'open')
                ->lockForUpdate()
                ->first();

            $balanceBefore = (float) $lockedSource->current_balance;
            $balanceAfter = round($balanceBefore + $amount, 2);

            $lockedSource->current_balance = $balanceAfter;
            $lockedSource->updated_by = $user->id;
            $lockedSource->save();

            if ($sourceSession) {
                $sourceSession->total_cash_in = round((float) $sourceSession->total_cash_in + $amount, 2);
                $sourceSession->expected_closing_cash = round(
                    (float) $sourceSession->opening_balance + (float) $sourceSession->total_cash_in - (float) $sourceSession->total_cash_out,
                    2
                );
                $sourceSession->save();
            }

            $this->createTransaction([
                'company_id' => $lockedSource->company_id,
                'branch_id' => $lockedSource->branch_id,
                'cash_drawer_id' => $lockedSource->id,
                'cash_drawer_session_id' => $sourceSession ? $sourceSession->id : ($lockedTransfer->source_session_id ?: 0),
                'transaction_type' => 'reversal',
                'category' => 'refund',
                'amount' => $amount,
                'balance_before' => $balanceBefore,
                'balance_after' => $balanceAfter,
                'transaction_date' => now(),
                'reference_no' => "REJ-{$lockedTransfer->transfer_number}",
                'received_from_or_paid_to' => "Transfer Rejection Refund",
                'description' => "Refund for rejected transfer #{$lockedTransfer->transfer_number} | Reason: {$reason}",
                'source_type' => 'cash_transfer',
                'source_id' => $lockedTransfer->id,
                'is_reversal' => true,
                'reversed_transaction_id' => $lockedTransfer->source_transaction_id,
                'idempotency_key' => "transfer_reject_{$lockedTransfer->transfer_number}",
                'created_by' => $user->id,
            ]);

            $lockedTransfer->status = 'rejected';
            $lockedTransfer->rejected_by = $user->id;
            $lockedTransfer->rejected_at = now();
            $lockedTransfer->rejection_reason = $reason;
            $lockedTransfer->save();

            $this->logAudit([
                'company_id' => $lockedSource->company_id,
                'branch_id' => $lockedSource->branch_id,
                'cash_drawer_id' => $lockedSource->id,
                'action' => 'transfer_rejected',
                'user_id' => $user->id,
                'old_values' => ['current_balance' => $balanceBefore],
                'new_values' => ['current_balance' => $balanceAfter, 'amount' => $amount, 'reason' => $reason],
                'notes' => "Transfer #{$lockedTransfer->transfer_number} rejected. Cash refunded to source drawer.",
            ]);

            return $lockedTransfer->fresh(['sourceDrawer', 'destinationDrawer', 'rejector']);
        });
    }

    /**
     * Automatic integration: Sync a Payment with the appropriate Cash Drawer.
     */
    public function syncPayment(Payment $payment, ?int $explicitDrawerId = null, bool $isReversal = false): ?CashDrawerTransaction
    {
        // Only physical cash payments enter or leave the physical cash drawer
        if (strtolower((string) $payment->payment_method) !== 'cash') {
            return null;
        }

        $idempotencyKey = $isReversal
            ? "payment_reversal_{$payment->id}"
            : "payment_posted_{$payment->id}";

        // Idempotency check: Never record the same payment or reversal twice
        $existing = CashDrawerTransaction::where('company_id', $payment->company_id)
            ->where('idempotency_key', $idempotencyKey)
            ->first();

        if ($existing) {
            return $existing;
        }

        $drawer = null;
        if ($explicitDrawerId) {
            $drawer = CashDrawer::where('company_id', $payment->company_id)
                ->where('id', $explicitDrawerId)
                ->first();
        }

        if (!$drawer) {
            // Find active drawer for the branch, or default drawer
            $drawerQuery = CashDrawer::where('company_id', $payment->company_id)
                ->where('status', 'active');

            if ($payment->branch_id) {
                $drawerQuery->where('branch_id', $payment->branch_id);
            }

            $drawer = $drawerQuery->orderByDesc('is_default')->first();
        }

        if (!$drawer) {
            // If no cash drawer exists for the branch/company, return null without crashing
            return null;
        }

        $activeSession = CashDrawerSession::where('cash_drawer_id', $drawer->id)
            ->where('status', 'open')
            ->first();

        // If no open session is available, we do not silently invent transactions
        if (!$activeSession) {
            return null;
        }

        $amount = (float) $payment->amount;
        $systemUser = auth()->user() ?: User::find($payment->created_by) ?: $activeSession->cashier;

        // Inward payment = Cash In; Outward payment = Cash Out; Reversal flips direction
        $isInward = $payment->payment_direction === 'inward';
        if ($isReversal) {
            $isInward = !$isInward;
        }

        if ($isInward) {
            return $this->recordCashIn($drawer, $systemUser, [
                'amount' => $amount,
                'category' => $payment->invoice_id ? 'customer_payment' : 'other_receipt',
                'received_from' => $payment->counterparty ?: ($payment->invoice?->customer?->name ?? 'Customer'),
                'reference_no' => $payment->reference_no,
                'description' => "Cash payment for " . ($payment->invoice_id ? "Invoice #{$payment->invoice_id}" : "Payment #{$payment->id}"),
                'source_type' => 'payment',
                'source_id' => $payment->id,
                'transaction_date' => $payment->transaction_date ?: now(),
                'idempotency_key' => $idempotencyKey,
            ]);
        } else {
            return $this->recordCashOut($drawer, $systemUser, [
                'amount' => $amount,
                'category' => $payment->purchase_invoice_id ? 'supplier_payment' : ($isReversal ? 'refund' : 'shop_expenses'),
                'paid_to' => $payment->counterparty ?: ($payment->purchaseInvoice?->supplier?->name ?? 'Supplier/Payee'),
                'reference_no' => $payment->reference_no,
                'description' => ($isReversal ? "Refund/Reversal: " : "Cash payout for ") . ($payment->purchase_invoice_id ? "Purchase #{$payment->purchase_invoice_id}" : "Payment #{$payment->id}"),
                'source_type' => 'payment',
                'source_id' => $payment->id,
                'transaction_date' => $payment->transaction_date ?: now(),
                'idempotency_key' => $idempotencyKey,
            ]);
        }
    }

    /**
     * Dashboard KPI Aggregates
     */
    public function getDashboardMetrics(int $companyId, ?int $branchId = null, ?int $drawerId = null, ?int $userId = null, ?string $dateFrom = null, ?string $dateTo = null): array
    {
        $today = Carbon::today()->toDateString();
        $from = $dateFrom ?: $today;
        $to = $dateTo ? Carbon::parse($dateTo)->endOfDay()->toDateTimeString() : Carbon::today()->endOfDay()->toDateTimeString();

        $drawerQuery = CashDrawer::where('company_id', $companyId);
        if ($branchId) {
            $drawerQuery->where('branch_id', $branchId);
        }
        if ($drawerId) {
            $drawerQuery->where('id', $drawerId);
        }

        $allDrawers = $drawerQuery->with(['activeSession.cashier', 'branch'])->get();

        $activeDrawersCount = $allDrawers->where('status', 'active')->count();
        $openDrawersCount = $allDrawers->filter(fn ($d) => $d->activeSession !== null)->count();
        $totalCurrentCash = $allDrawers->sum('current_balance');

        // Sessions within range
        $sessionQuery = CashDrawerSession::where('company_id', $companyId)
            ->whereBetween('opened_at', [$from, $to]);

        if ($branchId) {
            $sessionQuery->where('branch_id', $branchId);
        }
        if ($drawerId) {
            $sessionQuery->where('cash_drawer_id', $drawerId);
        }
        if ($userId) {
            $sessionQuery->where('user_id', $userId);
        }

        $sessions = $sessionQuery->get();
        $totalOpeningCash = $sessions->sum('opening_balance');
        $totalExpectedClosing = $sessions->sum('expected_closing_cash');
        $totalActualClosing = $sessions->whereNotNull('actual_closing_cash')->sum('actual_closing_cash');
        $totalClosingDifference = $sessions->whereNotNull('closing_difference')->sum('closing_difference');

        // Transactions breakdown within date range
        $txnQuery = CashDrawerTransaction::where('company_id', $companyId)
            ->whereBetween('transaction_date', [$from, $to]);

        if ($branchId) {
            $txnQuery->where('branch_id', $branchId);
        }
        if ($drawerId) {
            $txnQuery->where('cash_drawer_id', $drawerId);
        }
        if ($userId) {
            $txnQuery->where('created_by', $userId);
        }

        $txns = $txnQuery->get();

        $totalCashIn = $txns->whereIn('transaction_type', ['cash_in', 'transfer_in'])->sum('amount');
        $totalCashOut = $txns->whereIn('transaction_type', ['cash_out', 'transfer_out'])->sum('amount');

        $cashSales = $txns->where('category', 'cash_sales')->sum('amount');
        $customerPayments = $txns->where('category', 'customer_payment')->sum('amount');
        $cashExpenses = $txns->whereIn('category', ['shop_expenses', 'staff_expenses', 'staff_advance', 'other_expense'])->sum('amount');
        $supplierPayments = $txns->whereIn('category', ['supplier_payment', 'purchase_payment'])->sum('amount');
        $transfersIn = $txns->where('category', 'transfer_in')->sum('amount');
        $transfersOut = $txns->where('category', 'transfer_out')->sum('amount');

        // Branch-wise cash breakdown
        $branchBreakdown = [];
        if (!$branchId) {
            $branches = Branch::where('company_id', $companyId)->get();
            foreach ($branches as $branch) {
                $bDrawers = $allDrawers->where('branch_id', $branch->id);
                $branchBreakdown[] = [
                    'branch_id' => $branch->id,
                    'branch_name' => $branch->name,
                    'total_drawers' => $bDrawers->count(),
                    'open_drawers' => $bDrawers->filter(fn ($d) => $d->activeSession !== null)->count(),
                    'total_balance' => (float) $bDrawers->sum('current_balance'),
                ];
            }
        }

        return [
            'total_drawers' => $allDrawers->count(),
            'active_drawers' => $activeDrawersCount,
            'open_drawers' => $openDrawersCount,
            'total_current_cash' => (float) $totalCurrentCash,
            'opening_cash_balance' => (float) $totalOpeningCash,
            'total_cash_in' => (float) $totalCashIn,
            'total_cash_out' => (float) $totalCashOut,
            'cash_sales_received' => (float) $cashSales,
            'customer_cash_payments' => (float) $customerPayments,
            'cash_expenses' => (float) $cashExpenses,
            'supplier_cash_payments' => (float) $supplierPayments,
            'transfers_in' => (float) $transfersIn,
            'transfers_out' => (float) $transfersOut,
            'expected_closing_cash' => (float) $totalExpectedClosing,
            'actual_closing_cash' => (float) $totalActualClosing,
            'cash_difference' => (float) $totalClosingDifference,
            'branch_breakdown' => $branchBreakdown,
            'drawers' => $allDrawers->map(function ($d) {
                return [
                    'id' => $d->id,
                    'name' => $d->name,
                    'code' => $d->code,
                    'branch_id' => $d->branch_id,
                    'branch_name' => $d->branch?->name,
                    'status' => $d->status,
                    'current_balance' => (float) $d->current_balance,
                    'is_open' => $d->activeSession !== null,
                    'active_session' => $d->activeSession ? [
                        'id' => $d->activeSession->id,
                        'session_number' => $d->activeSession->session_number,
                        'cashier_name' => $d->activeSession->cashier?->name,
                        'opened_at' => $d->activeSession->opened_at?->toIso8601String(),
                        'opening_balance' => (float) $d->activeSession->opening_balance,
                        'total_cash_in' => (float) $d->activeSession->total_cash_in,
                        'total_cash_out' => (float) $d->activeSession->total_cash_out,
                        'expected_closing_cash' => (float) $d->activeSession->expected_closing_cash,
                    ] : null,
                ];
            }),
        ];
    }

    /* ------------------------------------------------------------------
     | Internal Helpers
     | ------------------------------------------------------------------ */

    private function createTransaction(array $attributes): CashDrawerTransaction
    {
        $attributes['transaction_number'] = 'CDT-' . date('Ymd') . '-' . strtoupper(Str::random(7));
        return CashDrawerTransaction::create($attributes);
    }

    private function logAudit(array $data): void
    {
        try {
            CashDrawerAuditLog::create([
                'company_id' => $data['company_id'],
                'branch_id' => $data['branch_id'] ?? null,
                'cash_drawer_id' => $data['cash_drawer_id'] ?? null,
                'cash_drawer_session_id' => $data['cash_drawer_session_id'] ?? null,
                'action' => $data['action'],
                'user_id' => $data['user_id'] ?? auth()->id(),
                'old_values' => $data['old_values'] ?? null,
                'new_values' => $data['new_values'] ?? null,
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
                'notes' => $data['notes'] ?? null,
                'created_at' => now(),
            ]);
        } catch (\Throwable $e) {
            // Non-blocking audit logger
        }
    }
}
