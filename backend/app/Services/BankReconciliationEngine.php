<?php

namespace App\Services;

use App\Models\BankAccount;
use App\Models\BankAccountTransaction;
use App\Models\BankReconciliation;
use App\Models\BankReconciliationRule;
use App\Models\BankStatement;
use App\Models\BankStatementTransaction;
use App\Models\FinancialEntry;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\PurchaseInvoice;
use App\Models\ReconciliationMatch;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class BankReconciliationEngine
{
    /**
     * Compute automated match suggestions for unmatched statement transactions against ERP payments.
     */
    public function generateSuggestions(int $bankAccountId, ?int $statementId = null): array
    {
        $account = BankAccount::findOrFail($bankAccountId);

        // Fetch unmatched / reviewable statement rows
        $stmtQuery = BankStatementTransaction::where('bank_account_id', $bankAccountId)
            ->whereIn('reconciliation_status', [
                'unmatched',
                'suggested',
                'expense_draft_created',
                'needs_review',
                'unmatched_income',
                'transfer_pending',
                'duplicate'
            ])
            ->orderBy('transaction_date');

        if ($statementId) {
            $stmtQuery->where('statement_id', $statementId);
        }

        $unmatchedStmtRows = $stmtQuery->get();

        if ($unmatchedStmtRows->isEmpty()) {
            return [];
        }

        // Fetch unreconciled ERP payments for this company
        $payments = Payment::where('company_id', $account->company_id)
            ->whereIn('status', ['pending', 'completed'])
            ->whereNull('deleted_at')
            ->where(function ($q) use ($bankAccountId) {
                $q->whereNull('bank_account_id')
                  ->orWhere('bank_account_id', $bankAccountId);
            })
            ->with(['invoice', 'company', 'branch'])
            ->get();

        // Fetch active learned rules for this company
        $learnedRules = BankReconciliationRule::forCompany($account->company_id)
            ->active()
            ->orderByDesc('confidence_score')
            ->get();

        // Fetch own accounts for transfer detection
        $ownAccounts = BankAccount::where('company_id', $account->company_id)
            ->where('id', '!=', $bankAccountId)
            ->get();

        $results = [];

        foreach ($unmatchedStmtRows as $st) {
            $eval = $this->evaluateStatementRow($st, $account, $payments, $learnedRules, $ownAccounts);

            $matchRule = $eval['match_type'] ?? 'unmatched';
            $results[] = [
                'statement_transaction' => $st,
                'suggested_payment'     => $eval['best_match'],
                'suggested_match'       => $eval['best_match'],
                'confidence'            => $eval['confidence'],
                'confidence_score'      => $eval['confidence'],
                'match_type'            => $matchRule,
                'match_rule'            => $matchRule,
                'reason'                => $eval['reason'],
                'reasoning'             => $eval['reason'],
                'status'                => $eval['final_status'],
                'suggested_category'    => $eval['suggested_category'],
                'is_internal_transfer'  => $eval['is_internal_transfer'],
                'is_duplicate'          => $eval['is_duplicate'],
                'expense_draft'         => $st->expenseDraft,
                'alternative_candidates'=> array_slice($eval['alternatives'], 0, 3),
                'candidate_payments'    => array_slice($eval['alternatives'], 0, 3),
            ];
        }

        return $results;
    }

    /**
     * Process EVERY transaction in a statement from beginning to end without stopping.
     * Evaluates exact, deterministic, learned, internal transfer, duplicate, and missing expenses.
     */
    public function processFullReconciliation(int $statementId, ?int $userId = null, bool $autoApproveHighConfidence = false): array
    {
        return DB::transaction(function () use ($statementId, $userId, $autoApproveHighConfidence) {
            $stmt = BankStatement::lockForUpdate()->findOrFail($statementId);
            $account = BankAccount::lockForUpdate()->findOrFail($stmt->bank_account_id);

            $stmtRows = BankStatementTransaction::where('statement_id', $stmt->id)
                ->orderBy('transaction_date')
                ->orderBy('id')
                ->get();

            if ($stmtRows->isEmpty()) {
                return [
                    'success' => true,
                    'message' => 'Statement has no transactions to process.',
                    'summary' => $this->getReconciliationSummary($statementId),
                ];
            }

            // Fetch candidate payments
            $payments = Payment::where('company_id', $account->company_id)
                ->whereIn('status', ['pending', 'completed'])
                ->whereNull('deleted_at')
                ->where(function ($q) use ($account) {
                    $q->whereNull('bank_account_id')
                      ->orWhere('bank_account_id', $account->id);
                })
                ->with(['invoice', 'company', 'branch'])
                ->get();

            // Fetch active learned rules
            $learnedRules = BankReconciliationRule::forCompany($account->company_id)
                ->active()
                ->orderByDesc('confidence_score')
                ->get();

            // Fetch other accounts belonging to company to detect inter-account transfers
            $ownAccounts = BankAccount::where('company_id', $account->company_id)
                ->where('id', '!=', $account->id)
                ->get();

            $processedCount = 0;
            $autoMatchedCount = 0;
            $draftsCreatedCount = 0;

            foreach ($stmtRows as $st) {
                // Skip already confirmed matches unless resetting
                if ($st->reconciliation_status === 'matched') {
                    $processedCount++;
                    continue;
                }

                $eval = $this->evaluateStatementRow($st, $account, $payments, $learnedRules, $ownAccounts);

                // If high confidence exact match and auto-approve enabled
                if ($autoApproveHighConfidence && $eval['confidence'] >= 95 && $eval['best_match']) {
                    $this->confirmMatch(
                        $st->id,
                        $eval['best_match']->id,
                        null,
                        $eval['match_type'] ?: 'exact_auto',
                        $userId
                    );
                    $autoMatchedCount++;
                } else {
                    // Apply evaluated status and create expense draft if missing expense detected
                    $updateData = [
                        'reconciliation_status' => $eval['final_status'],
                        'match_confidence'      => $eval['confidence'],
                        'match_type'            => $eval['match_type'],
                        'match_notes'           => $eval['reason'],
                        'matched_payment_id'    => $eval['best_match']?->id,
                    ];

                    // If missing expense draft should be created
                    if ($eval['final_status'] === 'expense_draft_created' && empty($st->expense_draft_id)) {
                        $draft = $this->createExpenseDraftRecord($st, $account, $eval, $userId);
                        $updateData['expense_draft_id'] = $draft->id;
                        $draftsCreatedCount++;
                    }

                    if (!empty($eval['applied_rule_id'])) {
                        $updateData['learned_rule_id'] = $eval['applied_rule_id'];
                    }

                    $st->update($updateData);
                }

                $processedCount++;
            }

            // Recalculate statement counters and status
            $summary = $this->getReconciliationSummary($statementId);
            $isFullyReconciled = $summary['unmatched_rows'] === 0 &&
                                 $summary['needs_review_count'] === 0 &&
                                 $summary['expense_drafts_count'] === 0 &&
                                 $summary['transfer_pending_count'] === 0 &&
                                 $summary['total_rows'] === $summary['matched_rows'];

            $stmt->update([
                'reconciled_transactions' => $summary['matched_rows'],
                'status' => $isFullyReconciled ? 'reconciled' : ($summary['matched_rows'] > 0 ? 'partially_reconciled' : 'parsed'),
            ]);

            return [
                'success' => true,
                'total_processed' => $processedCount,
                'auto_matched' => $autoMatchedCount,
                'drafts_created' => $draftsCreatedCount,
                'summary' => $summary,
                'is_fully_reconciled' => $isFullyReconciled,
            ];
        });
    }

    /**
     * Core 4-Layer evaluation for a single statement row.
     */
    protected function evaluateStatementRow(
        BankStatementTransaction $st,
        BankAccount $account,
        $payments,
        $learnedRules,
        $ownAccounts
    ): array {
        $isCredit = $st->credit > 0;
        $amount = (float) ($isCredit ? $st->credit : $st->debit);
        $direction = $isCredit ? 'inward' : 'outward';
        $stDate = Carbon::parse($st->transaction_date);
        $desc = strtolower($st->description ?? '');
        $stRef = trim((string) ($st->reference_no ?? ''));

        // 0. Check for DUPLICATE statement transaction
        $duplicateQuery = BankStatementTransaction::where('bank_account_id', $account->id)
            ->where('id', '!=', $st->id)
            ->where('transaction_date', $st->transaction_date)
            ->where('debit', $st->debit)
            ->where('credit', $st->credit);

        if (!empty($stRef)) {
            $duplicateQuery->where('reference_no', $stRef);
        }

        if ($duplicateQuery->exists()) {
            return [
                'final_status' => 'duplicate',
                'confidence' => 0,
                'best_match' => null,
                'match_type' => 'duplicate_risk',
                'reason' => 'Identical transaction detected on statement for this account and date.',
                'suggested_category' => null,
                'is_internal_transfer' => false,
                'is_duplicate' => true,
                'applied_rule_id' => null,
                'alternatives' => [],
            ];
        }

        // 1. Check for INTERNAL TRANSFERS between company's own accounts
        $isInternalTransfer = false;
        foreach ($ownAccounts as $otherAcc) {
            $accNum = substr((string) $otherAcc->account_number, -4);
            $accName = strtolower($otherAcc->account_name);
            if ((!empty($accNum) && str_contains($desc, $accNum)) || (!empty($accName) && str_contains($desc, $accName))) {
                $isInternalTransfer = true;
                break;
            }
        }
        if (preg_match('/(own account transfer|transfer to own|transfer from own|self transfer)/i', $desc)) {
            $isInternalTransfer = true;
        }

        if ($isInternalTransfer) {
            return [
                'final_status' => 'transfer_pending',
                'confidence' => 90,
                'best_match' => null,
                'match_type' => 'internal_transfer',
                'reason' => 'Inter-account transfer detected between company accounts. Not an expense.',
                'suggested_category' => 'Internal Transfer',
                'is_internal_transfer' => true,
                'is_duplicate' => false,
                'applied_rule_id' => null,
                'alternatives' => [],
            ];
        }

        // Level 1: EXACT MATCHES (UTR / Reference / Cheque)
        $bestMatch = null;
        $bestConfidence = 0;
        $matchType = null;
        $reason = '';
        $alternatives = [];

        foreach ($payments as $p) {
            if ($p->payment_direction !== $direction) {
                continue;
            }

            $pAmount = (float) $p->amount;
            $pDate = Carbon::parse($p->transaction_date ?: $p->created_at);
            $daysDiff = abs($stDate->diffInDays($pDate));
            $pRef = trim((string) $p->reference_no);

            // Exact UTR / Cheque / Reference
            if (!empty($stRef) && !empty($pRef) && (strcasecmp($stRef, $pRef) === 0 || str_contains($desc, strtolower($pRef)))) {
                if (abs($amount - $pAmount) < 0.01) {
                    $bestMatch = $p;
                    $bestConfidence = 100;
                    $matchType = 'exact_utr';
                    $reason = "Exact UTR / Reference match ({$pRef}) with matching amount ₹" . number_format($amount, 2);
                    break;
                }
            }

            // Level 2: Deterministic Match (Exact amount + date within 4 days)
            if (abs($amount - $pAmount) < 0.01 && $daysDiff <= 4) {
                $conf = 95 - ($daysDiff * 3);
                if ($conf > $bestConfidence) {
                    $bestMatch = $p;
                    $bestConfidence = $conf;
                    $matchType = 'exact_amount_date';
                    $reason = "Exact amount ₹" . number_format($amount, 2) . " within {$daysDiff} day(s) of payment date (" . $pDate->format('d M Y') . ")";
                }
                continue;
            }

            // Level 2b: Invoice number cited in bank narration
            $invNo = $p->invoice?->invoice_no;
            if ($invNo && str_contains($desc, strtolower($invNo))) {
                if (abs($amount - $pAmount) < 0.01) {
                    $bestMatch = $p;
                    $bestConfidence = 92;
                    $matchType = 'invoice_ref';
                    $reason = "Invoice {$invNo} referenced in bank description with exact amount";
                    break;
                }
            }

            if (abs($amount - $pAmount) < 0.01 && $daysDiff <= 15) {
                $alternatives[] = $p;
            }
        }

        if ($bestMatch) {
            return [
                'final_status' => $bestConfidence >= 95 ? 'suggested' : 'needs_review',
                'confidence' => $bestConfidence,
                'best_match' => $bestMatch,
                'match_type' => $matchType,
                'reason' => $reason,
                'suggested_category' => null,
                'is_internal_transfer' => false,
                'is_duplicate' => false,
                'applied_rule_id' => null,
                'alternatives' => $alternatives,
            ];
        }

        // Level 3: LEARNED RULES MATCHING
        $appliedRule = null;
        foreach ($learnedRules as $rule) {
            if ($rule->matches($st->description, $st->reference_no)) {
                $appliedRule = $rule;
                break;
            }
        }

        if ($appliedRule) {
            $cat = $appliedRule->category ?? 'General Expense';
            return [
                'final_status' => $isCredit ? 'unmatched_income' : 'expense_draft_created',
                'confidence' => $appliedRule->confidence_score,
                'best_match' => null,
                'match_type' => 'learned_rule',
                'reason' => "Applied learned rule: '{$appliedRule->rule_name}' matching '{$appliedRule->pattern_value}' -> {$cat}",
                'suggested_category' => $cat,
                'is_internal_transfer' => false,
                'is_duplicate' => false,
                'applied_rule_id' => $appliedRule->id,
                'alternatives' => [],
            ];
        }

        // Level 4: RULE HEURISTICS & CATEGORY DETECTION FOR MISSING EXPENSES
        if (!$isCredit) {
            // Debit transaction with no existing payment
            $detectedCategory = $this->detectExpenseCategory($desc);

            if ($detectedCategory) {
                return [
                    'final_status' => 'expense_draft_created',
                    'confidence' => $detectedCategory['confidence'],
                    'best_match' => null,
                    'match_type' => 'rule_heuristic',
                    'reason' => $detectedCategory['reason'],
                    'suggested_category' => $detectedCategory['category'],
                    'is_internal_transfer' => false,
                    'is_duplicate' => false,
                    'applied_rule_id' => null,
                    'alternatives' => [],
                ];
            }

            // Ambiguous debit or unknown UPI
            return [
                'final_status' => 'needs_review',
                'confidence' => 50,
                'best_match' => null,
                'match_type' => 'unidentified_debit',
                'reason' => 'Unidentified debit without matching ERP payment or purchase bill. Needs manual review.',
                'suggested_category' => 'Uncategorized Expense',
                'is_internal_transfer' => false,
                'is_duplicate' => false,
                'applied_rule_id' => null,
                'alternatives' => [],
            ];
        }

        // Credit transaction with no matching payment -> Unmatched Income
        return [
            'final_status' => 'unmatched_income',
            'confidence' => 45,
            'best_match' => null,
            'match_type' => 'unmatched_deposit',
            'reason' => 'Bank deposit without matching customer payment receipt in ERP.',
            'suggested_category' => 'Direct Income',
            'is_internal_transfer' => false,
            'is_duplicate' => false,
            'applied_rule_id' => null,
            'alternatives' => [],
        ];
    }

    /**
     * Detect likely expense category based on Indian bank transaction keywords.
     */
    protected function detectExpenseCategory(string $desc): ?array
    {
        // 1. Bank Charges
        if (preg_match('/(chrg|charge|sms charge|annual fee|amc|gst charge|service tax|min bal|atm fee)/i', $desc)) {
            return [
                'category' => 'Bank Charges',
                'confidence' => 95,
                'reason' => 'Bank service charge / fee identified in statement narration.',
            ];
        }

        // 2. Electricity Expense
        if (preg_match('/(electricity|power|bescom|tneb|mseb|dhbvn|torrent power|bses|uppcl)/i', $desc)) {
            return [
                'category' => 'Electricity Expense',
                'confidence' => 90,
                'reason' => 'Electricity utility provider detected in bank narration.',
            ];
        }

        // 3. Rent Expense
        if (preg_match('/(rent|lease|office rent|shop rent|godown rent|warehouse rent)/i', $desc)) {
            return [
                'category' => 'Rent Expense',
                'confidence' => 88,
                'reason' => 'Rent payment keyword identified in transaction description.',
            ];
        }

        // 4. Telephone / Internet Expense
        if (preg_match('/(airtel|jio|vodafone|vi |bsnl|act fibernet|broadband|wifi|internet|mobile recharge)/i', $desc)) {
            return [
                'category' => 'Telephone & Internet Expense',
                'confidence' => 88,
                'reason' => 'Telecom / Internet service provider identified in narration.',
            ];
        }

        // 5. Fuel & Travel Expense
        if (preg_match('/(fuel|petrol|diesel|iocl|bpcl|hpcl|cng|toll|fastag)/i', $desc)) {
            return [
                'category' => 'Fuel & Travel Expense',
                'confidence' => 85,
                'reason' => 'Fuel station or toll FASTag debit detected.',
            ];
        }

        // 6. Software & IT Subscriptions
        if (preg_match('/(google|aws|amazon web|microsoft|github|slack|zoom|domain|hosting)/i', $desc)) {
            return [
                'category' => 'Software & Subscriptions',
                'confidence' => 85,
                'reason' => 'IT software or cloud service subscription detected.',
            ];
        }

        return null;
    }

    /**
     * Create an unposted FinancialEntry draft record linked to a statement transaction.
     */
    protected function createExpenseDraftRecord(
        BankStatementTransaction $st,
        BankAccount $account,
        array $eval,
        ?int $userId
    ): FinancialEntry {
        $category = $eval['suggested_category'] ?? 'General Expense';
        $amount = (float) ($st->debit > 0 ? $st->debit : 0);

        return FinancialEntry::create([
            'company_id'      => $account->company_id,
            'branch_id'       => $account->branch_id,
            'direction'       => 'expense',
            'category'        => $category,
            'counterparty'    => $st->reference_no ? 'Ref: ' . $st->reference_no : 'Bank Debit',
            'amount'          => $amount,
            'tax_amount'      => 0.00,
            'total_amount'    => $amount,
            'entry_date'      => $st->transaction_date,
            'payment_method'  => str_contains(strtolower($st->description), 'upi') ? 'upi' : 'bank_transfer',
            'reference_no'    => $st->reference_no ?: 'EXP-DRAFT-' . $st->id,
            'description'     => $st->description,
            'notes'           => "Auto-generated draft from bank reconciliation statement #{$st->statement_id}. Reason: {$eval['reason']}",
            'status'          => 'draft',
            'account_id'      => $account->id,
            'created_by'      => $userId,
        ]);
    }

    /**
     * Approve and post an expense draft into the accounting ledger.
     */
    public function approveExpenseDraft(int $statementTxnId, ?int $userId = null, bool $saveLearnedRule = false): array
    {
        return DB::transaction(function () use ($statementTxnId, $userId, $saveLearnedRule) {
            $st = BankStatementTransaction::lockForUpdate()->findOrFail($statementTxnId);
            $account = BankAccount::lockForUpdate()->findOrFail($st->bank_account_id);

            if (!$st->expense_draft_id) {
                throw new \InvalidArgumentException("Statement transaction #{$st->id} has no linked expense draft.");
            }

            $draft = FinancialEntry::lockForUpdate()->findOrFail($st->expense_draft_id);

            // 1. Post FinancialEntry
            $draft->update([
                'status' => 'completed',
                'updated_by' => $userId,
            ]);

            // 2. Deduct from book balance and post BankAccountTransaction
            $amount = (float) $draft->amount;
            $account->current_balance -= $amount;
            $account->save();

            $accountTxn = BankAccountTransaction::create([
                'company_id'               => $account->company_id,
                'branch_id'                => $account->branch_id,
                'bank_account_id'          => $account->id,
                'transaction_type'         => 'payment_out',
                'amount'                   => $amount,
                'running_balance'          => $account->current_balance,
                'transaction_date'         => $st->transaction_date,
                'reference_no'             => $draft->reference_no ?: $st->reference_no,
                'description'              => $draft->description ?: $st->description,
                'counterparty'             => $draft->category,
                'status'                   => 'reconciled',
                'reconciled_at'            => now(),
                'statement_transaction_id' => $st->id,
                'created_by'               => $userId,
            ]);

            // 3. Mark statement transaction as reconciled
            $st->update([
                'reconciliation_status'    => 'matched',
                'matched_transaction_id'   => $accountTxn->id,
                'match_confidence'         => 100,
                'match_type'               => 'expense_draft_approved',
                'match_notes'              => "Expense draft #{$draft->id} approved and posted to ledger.",
                'reconciled_at'            => now(),
                'reconciled_by'            => $userId,
            ]);

            // 4. Create ReconciliationMatch audit record
            ReconciliationMatch::updateOrCreate(
                [
                    'bank_statement_transaction_id' => $st->id,
                ],
                [
                    'financial_entry_id'        => $draft->id,
                    'bank_account_transaction_id' => $accountTxn->id,
                    'allocated_amount'          => $amount,
                    'match_rule'                => 'expense_draft_approved',
                    'confidence_score'          => 100,
                    'status'                    => 'confirmed',
                    'created_by'                => $userId,
                ]
            );

            // 5. Optionally learn reusable rule
            $learnedRule = null;
            if ($saveLearnedRule) {
                $learnedRule = $this->learnRuleFromMatch($st, $draft->category, $draft->counterparty, $userId);
            }

            return [
                'success' => true,
                'statement_transaction' => $st->fresh(),
                'expense' => $draft->fresh(),
                'account' => $account->fresh(),
                'learned_rule' => $learnedRule,
            ];
        });
    }

    /**
     * Edit an unposted expense draft.
     */
    public function editExpenseDraft(int $statementTxnId, array $data, ?int $userId = null): array
    {
        $st = BankStatementTransaction::findOrFail($statementTxnId);
        if (!$st->expense_draft_id) {
            throw new \InvalidArgumentException("Statement transaction #{$st->id} has no linked expense draft.");
        }

        $draft = FinancialEntry::findOrFail($st->expense_draft_id);
        $draft->update(array_filter([
            'category'     => $data['category'] ?? $draft->category,
            'counterparty' => $data['counterparty'] ?? $draft->counterparty,
            'amount'       => isset($data['amount']) ? (float) $data['amount'] : $draft->amount,
            'total_amount' => isset($data['amount']) ? (float) $data['amount'] : $draft->total_amount,
            'description'  => $data['description'] ?? $draft->description,
            'notes'        => $data['notes'] ?? $draft->notes,
            'updated_by'   => $userId,
        ]));

        return [
            'success' => true,
            'expense_draft' => $draft->fresh(),
            'statement_transaction' => $st->fresh(),
        ];
    }

    /**
     * Reject an expense draft and reset statement row to review.
     */
    public function rejectExpenseDraft(int $statementTxnId, ?int $userId = null): array
    {
        return DB::transaction(function () use ($statementTxnId, $userId) {
            $st = BankStatementTransaction::lockForUpdate()->findOrFail($statementTxnId);

            if ($st->expense_draft_id) {
                FinancialEntry::where('id', $st->expense_draft_id)->update(['status' => 'cancelled']);
            }

            $st->update([
                'expense_draft_id'      => null,
                'reconciliation_status' => 'needs_review',
                'match_notes'           => 'Expense draft rejected by user. Pending manual review.',
                'match_confidence'      => 0,
            ]);

            return [
                'success' => true,
                'statement_transaction' => $st->fresh(),
            ];
        });
    }

    /**
     * Learn a reusable rule from a confirmed user decision.
     */
    public function learnRuleFromMatch(
        BankStatementTransaction $st,
        string $category,
        ?string $vendorName = null,
        ?int $userId = null
    ): BankReconciliationRule {
        $desc = trim($st->description ?? '');
        $patternValue = '';
        $patternType = 'contains';

        // Extract UPI VPA if present (e.g., merchant@icici or UPI/123456789012/MERCHANT)
        if (preg_match('/([a-zA-Z0-9.\-_]+@[a-zA-Z0-9]+)/', $desc, $m)) {
            $patternValue = $m[1];
            $patternType = 'upi_vpa';
        } elseif (preg_match('/upi\/[0-9]+\/([^\/]+)/i', $desc, $m)) {
            $patternValue = trim($m[1]);
            $patternType = 'contains';
        } else {
            // Extract the most distinctive words
            $cleanWords = preg_replace('/[^a-zA-Z0-9\s]/', ' ', $desc);
            $words = array_values(array_filter(explode(' ', $cleanWords), function ($w) {
                return strlen($w) >= 4 && !preg_match('/^[0-9]+$/', $w) && !in_array(strtolower($w), ['transfer', 'payment', 'inward', 'outward', 'debit', 'credit', 'bank', 'neft', 'imps', 'rtgs']);
            }));
            $patternValue = !empty($words) ? implode(' ', array_slice($words, 0, 2)) : substr($desc, 0, 30);
        }

        $rule = BankReconciliationRule::firstOrNew([
            'company_id'    => $st->company_id,
            'pattern_value' => $patternValue,
        ]);

        $rule->rule_name = "Auto-Learned: {$patternValue} -> {$category}";
        $rule->pattern_type = $patternType;
        $rule->action = 'create_expense_draft';
        $rule->category = $category;
        $rule->vendor_name = $vendorName;
        $rule->confidence_score = 92;
        $rule->times_used = ($rule->times_used ?? 0) + 1;
        $rule->last_matched_at = now();
        $rule->is_active = true;
        $rule->source = 'learned';
        $rule->learned_from_transaction_id = $st->id;
        $rule->created_by = $userId;
        $rule->save();

        return $rule->fresh();
    }

    /**
     * Mark statement transaction as ignored with explicit reason.
     */
    public function ignoreStatementTransaction(int $statementTxnId, string $reason, ?int $userId = null): array
    {
        $st = BankStatementTransaction::findOrFail($statementTxnId);
        $st->update([
            'reconciliation_status' => 'ignored',
            'match_notes'           => "Ignored by user. Reason: {$reason}",
            'reconciled_by'         => $userId,
            'reconciled_at'         => now(),
        ]);

        return [
            'success' => true,
            'statement_transaction' => $st->fresh(),
        ];
    }

    /**
     * Unignore a statement transaction.
     */
    public function unignoreStatementTransaction(int $statementTxnId): array
    {
        $st = BankStatementTransaction::findOrFail($statementTxnId);
        $st->update([
            'reconciliation_status' => 'unmatched',
            'match_notes'           => null,
            'reconciled_by'         => null,
            'reconciled_at'         => null,
        ]);

        return [
            'success' => true,
            'statement_transaction' => $st->fresh(),
        ];
    }

    /**
     * Get statement row breakdown across all 8 statuses.
     */
    public function getReconciliationSummary(int $statementId): array
    {
        $query = BankStatementTransaction::where('statement_id', $statementId);

        $total = (clone $query)->count();
        $matched = (clone $query)->where('reconciliation_status', 'matched')->count();
        $partiallyMatched = (clone $query)->where('reconciliation_status', 'partially_matched')->count();
        $drafts = (clone $query)->where('reconciliation_status', 'expense_draft_created')->count();
        $needsReview = (clone $query)->where('reconciliation_status', 'needs_review')->count();
        $unmatchedIncome = (clone $query)->where('reconciliation_status', 'unmatched_income')->count();
        $duplicates = (clone $query)->where('reconciliation_status', 'duplicate')->count();
        $transfers = (clone $query)->where('reconciliation_status', 'transfer_pending')->count();
        $ignored = (clone $query)->where('reconciliation_status', 'ignored')->count();
        $unmatched = (clone $query)->whereIn('reconciliation_status', ['unmatched', 'suggested'])->count();

        $totalDebits = (float) (clone $query)->sum('debit');
        $totalCredits = (float) (clone $query)->sum('credit');
        $matchedAmount = (float) (clone $query)->where('reconciliation_status', 'matched')->selectRaw('SUM(debit + credit) as total')->value('total') ?? 0.0;

        return [
            'total_rows'               => $total,
            'matched_rows'             => $matched,
            'partially_matched_rows'   => $partiallyMatched,
            'expense_drafts_count'     => $drafts,
            'needs_review_count'       => $needsReview,
            'unmatched_income_count'   => $unmatchedIncome,
            'duplicates_count'         => $duplicates,
            'transfer_pending_count'   => $transfers,
            'ignored_count'            => $ignored,
            'unmatched_rows'           => $unmatched,
            'total_debits'             => round($totalDebits, 2),
            'total_credits'            => round($totalCredits, 2),
            'matched_amount'           => round($matchedAmount, 2),
            'reconciled_percentage'    => $total > 0 ? round(($matched / $total) * 100, 1) : 100.0,
        ];
    }

    /**
     * Confirm a match between a bank statement transaction and an ERP payment.
     */
    public function confirmMatch(int $statementTxnId, int $paymentId, ?float $amount = null, string $matchType = 'manual', ?int $userId = null): array
    {
        return DB::transaction(function () use ($statementTxnId, $paymentId, $amount, $matchType, $userId) {
            $st = BankStatementTransaction::lockForUpdate()->findOrFail($statementTxnId);
            $payment = Payment::lockForUpdate()->findOrFail($paymentId);
            $account = BankAccount::lockForUpdate()->findOrFail($st->bank_account_id);

            $matchAmount = $amount ?? ($st->credit > 0 ? (float) $st->credit : (float) $st->debit);

            // 1. Update Payment
            $payment->update([
                'status' => 'reconciled',
                'bank_account_id' => $account->id,
            ]);

            // 2. Ensure an associated BankAccountTransaction ledger record exists
            $accountTxn = BankAccountTransaction::where('payment_id', $payment->id)->first();
            if (!$accountTxn) {
                $accountTxn = BankAccountTransaction::create([
                    'company_id'               => $account->company_id,
                    'branch_id'                => $account->branch_id,
                    'bank_account_id'          => $account->id,
                    'transaction_type'         => $payment->payment_direction === 'inward' ? 'payment_in' : 'payment_out',
                    'amount'                   => $matchAmount,
                    'running_balance'          => $account->current_balance,
                    'transaction_date'         => $st->transaction_date,
                    'reference_no'             => $st->reference_no ?: $payment->reference_no,
                    'description'              => $st->description,
                    'payment_id'               => $payment->id,
                    'counterparty'             => $payment->customer_name ?: $payment->bank_name,
                    'status'                   => 'reconciled',
                    'reconciled_at'            => now(),
                    'statement_transaction_id' => $st->id,
                    'created_by'               => $userId,
                ]);
            } else {
                $accountTxn->update([
                    'status' => 'reconciled',
                    'reconciled_at' => now(),
                    'statement_transaction_id' => $st->id,
                ]);
            }

            // 3. Update statement transaction
            $st->update([
                'reconciliation_status'    => 'matched',
                'matched_payment_id'       => $payment->id,
                'matched_transaction_id'   => $accountTxn->id,
                'match_confidence'         => 100,
                'match_type'               => $matchType,
                'match_notes'              => "Reconciled with payment #{$payment->id} ({$payment->reference_no})",
                'reconciled_at'            => now(),
                'reconciled_by'            => $userId,
            ]);

            // 4. Record in ReconciliationMatch table
            ReconciliationMatch::updateOrCreate(
                [
                    'bank_statement_transaction_id' => $st->id,
                    'payment_id'                    => $payment->id,
                ],
                [
                    'bank_account_transaction_id'   => $accountTxn->id,
                    'allocated_amount'              => $matchAmount,
                    'match_rule'                    => $matchType,
                    'confidence_score'              => 100,
                    'status'                        => 'confirmed',
                    'created_by'                    => $userId,
                ]
            );

            // 5. Update statement reconciled counter
            if ($st->statement_id) {
                $stmt = BankStatement::find($st->statement_id);
                if ($stmt) {
                    $reconciledCount = BankStatementTransaction::where('statement_id', $stmt->id)
                        ->where('reconciliation_status', 'matched')
                        ->count();
                    $stmt->update([
                        'reconciled_transactions' => $reconciledCount,
                        'status' => $reconciledCount >= $stmt->total_transactions ? 'reconciled' : 'partially_reconciled',
                    ]);
                }
            }

            return [
                'success' => true,
                'statement_transaction' => $st->fresh(),
                'payment' => $payment->fresh(),
                'account_transaction' => $accountTxn->fresh(),
            ];
        });
    }

    /**
     * Unmatch a previously reconciled statement transaction safely.
     */
    public function unmatch(int $statementTxnId): array
    {
        return DB::transaction(function () use ($statementTxnId) {
            $st = BankStatementTransaction::lockForUpdate()->findOrFail($statementTxnId);

            if ($st->matched_payment_id) {
                Payment::where('id', $st->matched_payment_id)->update(['status' => 'completed']);
            }

            if ($st->matched_transaction_id) {
                BankAccountTransaction::where('id', $st->matched_transaction_id)->update([
                    'status' => 'cleared',
                    'reconciled_at' => null,
                    'statement_transaction_id' => null,
                ]);
            }

            ReconciliationMatch::where('bank_statement_transaction_id', $st->id)->delete();

            $st->update([
                'reconciliation_status'    => 'unmatched',
                'matched_payment_id'       => null,
                'matched_transaction_id'   => null,
                'match_confidence'         => 0,
                'match_type'               => null,
                'match_notes'              => null,
                'reconciled_at'            => null,
                'reconciled_by'            => null,
            ]);

            if ($st->statement_id) {
                $stmt = BankStatement::find($st->statement_id);
                if ($stmt) {
                    $reconciledCount = BankStatementTransaction::where('statement_id', $stmt->id)
                        ->where('reconciliation_status', 'matched')
                        ->count();
                    $stmt->update([
                        'reconciled_transactions' => $reconciledCount,
                        'status' => $reconciledCount > 0 ? 'partially_reconciled' : 'parsed',
                    ]);
                }
            }

            return ['success' => true, 'statement_transaction' => $st->fresh()];
        });
    }

    /**
     * Automatically reconcile high-confidence matches (>= threshold, default 95%).
     */
    public function autoReconcile(int $bankAccountId, int $threshold = 95, ?int $userId = null): array
    {
        $suggestions = $this->generateSuggestions($bankAccountId);
        $reconciled = [];

        foreach ($suggestions as $s) {
            if ($s['confidence'] >= $threshold && $s['suggested_payment']) {
                try {
                    $res = $this->confirmMatch(
                        $s['statement_transaction']->id,
                        $s['suggested_payment']->id,
                        null,
                        $s['match_type'] ?: 'auto',
                        $userId
                    );
                    $reconciled[] = $res;
                } catch (\Throwable $e) {
                    Log::warning("Auto-reconcile failed for statement row #{$s['statement_transaction']->id}: " . $e->getMessage());
                }
            }
        }

        return [
            'success' => true,
            'total_evaluated' => count($suggestions),
            'reconciled_count' => count($reconciled),
            'items' => $reconciled,
        ];
    }

    /**
     * Create an adjustment transaction from an unmatched statement row.
     */
    public function createAdjustment(int $statementTxnId, array $data, ?int $userId = null): array
    {
        return DB::transaction(function () use ($statementTxnId, $data, $userId) {
            $st = BankStatementTransaction::lockForUpdate()->findOrFail($statementTxnId);
            $account = BankAccount::lockForUpdate()->findOrFail($st->bank_account_id);

            $type = $data['transaction_type'] ?? ($st->debit > 0 ? 'bank_charges' : 'interest');
            $amount = (float) ($data['amount'] ?? ($st->debit > 0 ? $st->debit : $st->credit));
            $isExpense = in_array($type, ['bank_charges', 'withdrawal', 'adjustment', 'payment_out'], true);

            // Update Account Balance
            if ($isExpense) {
                $account->current_balance -= $amount;
            } else {
                $account->current_balance += $amount;
            }
            $account->save();

            // Create Ledger Transaction
            $txn = BankAccountTransaction::create([
                'company_id'               => $account->company_id,
                'branch_id'                => $account->branch_id,
                'bank_account_id'          => $account->id,
                'transaction_type'         => $type,
                'amount'                   => $amount,
                'running_balance'          => $account->current_balance,
                'transaction_date'         => $st->transaction_date,
                'reference_no'             => $st->reference_no ?: 'ADJ-' . time(),
                'description'              => $data['description'] ?? $st->description,
                'counterparty'             => $data['category'] ?? ($isExpense ? 'Bank Charges / Fees' : 'Bank Interest'),
                'status'                   => 'reconciled',
                'reconciled_at'            => now(),
                'statement_transaction_id' => $st->id,
                'created_by'               => $userId,
            ]);

            // Update statement row
            $st->update([
                'reconciliation_status'    => 'matched',
                'matched_transaction_id'   => $txn->id,
                'match_confidence'         => 100,
                'match_type'               => 'adjustment',
                'match_notes'              => "Adjustment created: {$type} for ₹" . number_format($amount, 2),
                'reconciled_at'            => now(),
                'reconciled_by'            => $userId,
            ]);

            return [
                'success' => true,
                'account' => $account->fresh(),
                'transaction' => $txn,
                'statement_transaction' => $st->fresh(),
            ];
        });
    }

    /**
     * Compute comprehensive reconciliation KPI metrics & equation.
     */
    public function getDashboardMetrics(int $companyId, ?int $branchId = null, ?int $accountId = null): array
    {
        $accQuery = BankAccount::where('company_id', $companyId)->where('is_active', true);
        if ($branchId) $accQuery->where('branch_id', $branchId);
        if ($accountId) $accQuery->where('id', $accountId);
        $accounts = $accQuery->get();

        $accountIds = $accounts->pluck('id')->toArray();

        $bankAccounts = $accounts->where('account_type', 'bank');
        $cashAccounts = $accounts->whereIn('account_type', ['cash_drawer', 'petty_cash', 'vault']);

        $totalBankBookBalance = (float) $bankAccounts->sum('current_balance');
        $totalCashBalance = (float) $cashAccounts->sum('current_balance');

        // Statement Totals
        $latestStatement = BankStatement::whereIn('bank_account_id', $accountIds)->latest()->first();
        $statementEndingBalance = (float) ($latestStatement?->closing_balance ?? $totalBankBookBalance);

        // Deposits in transit
        $unreconciledDeposits = (float) Payment::where('company_id', $companyId)
            ->where('payment_direction', 'inward')
            ->where('status', 'completed')
            ->sum('amount');

        // Outstanding payments
        $unreconciledPayments = (float) Payment::where('company_id', $companyId)
            ->where('payment_direction', 'outward')
            ->where('status', 'completed')
            ->sum('amount');

        // Unmatched Statement items
        $unmatchedStmtRows = BankStatementTransaction::whereIn('bank_account_id', $accountIds)
            ->whereIn('reconciliation_status', ['unmatched', 'suggested', 'expense_draft_created', 'needs_review', 'unmatched_income', 'transfer_pending'])
            ->get();

        $unmatchedCredits = (float) $unmatchedStmtRows->sum('credit');
        $unmatchedDebits = (float) $unmatchedStmtRows->sum('debit');

        $totalStmtTxns = BankStatementTransaction::whereIn('bank_account_id', $accountIds)->count();
        $matchedStmtTxns = BankStatementTransaction::whereIn('bank_account_id', $accountIds)
            ->where('reconciliation_status', 'matched')
            ->count();

        $pendingExpenseDraftsCount = BankStatementTransaction::whereIn('bank_account_id', $accountIds)
            ->where('reconciliation_status', 'expense_draft_created')
            ->count();

        $pendingExpenseDraftsAmount = (float) BankStatementTransaction::whereIn('bank_account_id', $accountIds)
            ->where('reconciliation_status', 'expense_draft_created')
            ->sum('debit');

        $reconciledPct = $totalStmtTxns > 0 ? round(($matchedStmtTxns / $totalStmtTxns) * 100, 1) : 100.0;

        // Reconciliation Equation:
        // Adjusted Book Balance = Book Balance + Unmatched Credits - Unmatched Debits
        // Difference = Statement Ending Balance - Adjusted Book Balance
        $adjustedBookBalance = $totalBankBookBalance + $unmatchedCredits - $unmatchedDebits;
        $reconciliationDifference = round($statementEndingBalance - $adjustedBookBalance, 2);

        return [
            'total_bank_balance'           => round($totalBankBookBalance, 2),
            'total_cash_balance'           => round($totalCashBalance, 2),
            'total_liquid_funds'           => round($totalBankBookBalance + $totalCashBalance, 2),
            'book_balance'                 => round($totalBankBookBalance, 2),
            'statement_balance'            => round($statementEndingBalance, 2),
            'adjusted_book_balance'        => round($adjustedBookBalance, 2),
            'difference'                   => $reconciliationDifference,
            'is_reconciled'                => abs($reconciliationDifference) < 0.01 && $unmatchedStmtRows->isEmpty(),
            'unreconciled_deposits'        => round($unreconciledDeposits, 2),
            'unreconciled_payments'        => round($unreconciledPayments, 2),
            'unmatched_credits'            => round($unmatchedCredits, 2),
            'unmatched_debits'             => round($unmatchedDebits, 2),
            'unmatched_count'              => $unmatchedStmtRows->count(),
            'pending_drafts_count'         => $pendingExpenseDraftsCount,
            'pending_drafts_amount'        => round($pendingExpenseDraftsAmount, 2),
            'reconciled_percentage'        => $reconciledPct,
            'accounts_count'               => $accounts->count(),
            'bank_accounts_count'          => $bankAccounts->count(),
            'cash_accounts_count'          => $cashAccounts->count(),
        ];
    }
}
