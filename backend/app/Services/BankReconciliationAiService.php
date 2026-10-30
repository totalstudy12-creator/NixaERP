<?php

namespace App\Services;

use App\Models\BankStatementTransaction;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\PurchaseInvoice;
use App\Models\Supplier;
use Illuminate\Support\Facades\Log;

class BankReconciliationAiService
{
    protected AiManager $aiManager;

    public function __construct(AiManager $aiManager)
    {
        $this->aiManager = $aiManager;
    }

    /**
     * Analyze a bank statement transaction using Gemini AI with fallback to rule heuristics.
     *
     * @param BankStatementTransaction $st
     * @return array{
     *   success: bool,
     *   provider: string,
     *   counterparty_name: ?string,
     *   extracted_utr: ?string,
     *   suggested_category: string,
     *   suggested_payment_id: ?int,
     *   suggested_invoice_id: ?int,
     *   confidence: int,
     *   explanation: string,
     *   recommended_action: string
     * }
     */
    public function analyzeTransaction(BankStatementTransaction $st): array
    {
        $narration = $st->description;
        $amount = (float) ($st->credit > 0 ? $st->credit : $st->debit);
        $isCredit = $st->credit > 0;
        $companyId = $st->company_id;

        // Fetch candidate ERP records for context
        $customers = Customer::where('company_id', $companyId)->limit(15)->pluck('name', 'id')->toArray();
        $suppliers = Supplier::where('company_id', $companyId)->limit(15)->pluck('name', 'id')->toArray();
        $recentInvoices = Invoice::where('company_id', $companyId)
            ->whereNotIn('status', ['paid', 'draft'])
            ->limit(10)
            ->get(['id', 'invoice_no', 'customer_id', 'total_amount'])
            ->toArray();

        // 1. Attempt Gemini AI interpretation
        try {
            $provider = $this->aiManager->getPrimaryProvider();
            if ($provider) {
                $instance = $this->aiManager->makeProviderInstance($provider);

                $prompt = <<<PROMPT
You are an expert Indian ERP Bank Reconciliation Specialist.
Analyze the following Indian bank transaction narration and find the most likely match or category.

Bank Narration: "{$narration}"
Amount: ₹{$amount}
Direction: {$st->debit} (Debit/Withdrawal) / {$st->credit} (Credit/Deposit)
Transaction Date: {$st->transaction_date}

Known Customers: {$this->encodeJson($customers)}
Known Suppliers: {$this->encodeJson($suppliers)}
Recent Outstanding Invoices: {$this->encodeJson($recentInvoices)}

Extract and respond strictly with a valid JSON object matching this schema:
{
  "counterparty_name": string or null,
  "extracted_utr": string or null,
  "suggested_category": "customer_receipt" | "supplier_payment" | "bank_charges" | "interest" | "tax_payment" | "internal_transfer" | "other",
  "suggested_invoice_id": number or null,
  "confidence": number between 0 and 100,
  "explanation": "concise explanation of reasoning",
  "recommended_action": "confirm" | "create_expense" | "manual_review"
}
PROMPT;

                $messages = [
                    ['role' => 'system', 'content' => 'You are an enterprise accounting reconciliation AI. Output ONLY raw JSON.'],
                    ['role' => 'user', 'content' => $prompt],
                ];

                $response = $instance->chat($messages);
                $reply = $response['reply'] ?? '';

                $cleanJson = preg_replace('/```(?:json)?\s*([\s\S]*?)\s*```/', '$1', trim($reply));
                $parsed = json_decode($cleanJson, true);

                if (is_array($parsed) && isset($parsed['confidence'])) {
                    return $this->formatResult([
                        'success' => true,
                        'provider' => 'gemini',
                        'counterparty_name' => $parsed['counterparty_name'] ?? null,
                        'extracted_utr' => $parsed['extracted_utr'] ?? $st->reference_no,
                        'suggested_category' => $parsed['suggested_category'] ?? ($isCredit ? 'customer_receipt' : 'supplier_payment'),
                        'suggested_payment_id' => null,
                        'suggested_invoice_id' => $parsed['suggested_invoice_id'] ?? null,
                        'confidence' => (int) $parsed['confidence'],
                        'explanation' => $parsed['explanation'] ?? 'AI analyzed narration.',
                        'recommended_action' => $parsed['recommended_action'] ?? 'manual_review',
                    ], $st);
                }
            }
        } catch (\Throwable $e) {
            Log::info('Reconciliation AI fallback to heuristic: ' . $e->getMessage());
        }

        // 2. Deterministic Rule-Based Fallback
        return $this->formatResult($this->heuristicAnalysis($st, $customers, $suppliers, $recentInvoices), $st);
    }

    /**
     * Normalize analysis results with channel, reasoning, and consistent aliases.
     */
    protected function formatResult(array $data, BankStatementTransaction $st): array
    {
        $desc = strtolower($st->description ?? '');
        $channel = 'bank_transfer';
        if (str_contains($desc, 'upi')) {
            $channel = 'upi';
        } elseif (preg_match('/(neft|imps|rtgs)/i', $desc)) {
            $channel = 'bank_transfer';
        } elseif (preg_match('/(chq|cheque)/i', $desc)) {
            $channel = 'cheque';
        } elseif (preg_match('/(atm|cash)/i', $desc)) {
            $channel = 'cash';
        }

        $explanation = $data['explanation'] ?? $data['ai_reasoning'] ?? 'AI analyzed statement narration.';

        $data['channel'] = $data['channel'] ?? $channel;
        $data['reference_number'] = $data['reference_number'] ?? ($data['extracted_utr'] ?? $st->reference_no);
        $data['ai_reasoning'] = $data['ai_reasoning'] ?? $explanation;
        $data['explanation'] = $explanation;
        $data['counterparty_name'] = $data['counterparty_name'] ?? null;
        $data['suggested_category'] = $data['suggested_category'] ?? ($st->credit > 0 ? 'customer_receipt' : 'supplier_payment');

        return $data;
    }

    /**
     * Rule-based heuristic analysis when AI is offline.
     */
    protected function heuristicAnalysis(BankStatementTransaction $st, array $customers, array $suppliers, array $invoices): array
    {
        $desc = strtolower($st->description);
        $amount = (float) ($st->credit > 0 ? $st->credit : $st->debit);
        $isCredit = $st->credit > 0;

        // Check for Bank Charges / SMS / AMC
        if (preg_match('/(chrg|charge|sms charge|annual fee|amc|gst charge|service tax|min bal)/i', $desc)) {
            return [
                'success' => true,
                'provider' => 'rule_engine',
                'counterparty_name' => 'Bank Service Fee',
                'extracted_utr' => $st->reference_no,
                'suggested_category' => 'bank_charges',
                'suggested_payment_id' => null,
                'suggested_invoice_id' => null,
                'confidence' => 95,
                'explanation' => 'Bank charges or maintenance fee detected in narration keywords.',
                'recommended_action' => 'create_expense',
            ];
        }

        // Check for Bank Interest
        if (preg_match('/(int\.?pd|interest credited|sb interest|int earned)/i', $desc)) {
            return [
                'success' => true,
                'provider' => 'rule_engine',
                'counterparty_name' => 'Bank Interest Earned',
                'extracted_utr' => $st->reference_no,
                'suggested_category' => 'interest',
                'suggested_payment_id' => null,
                'suggested_invoice_id' => null,
                'confidence' => 95,
                'explanation' => 'Interest credit detected from bank statement description.',
                'recommended_action' => 'create_expense',
            ];
        }

        // Match customer by name
        foreach ($customers as $id => $name) {
            if (!empty($name) && str_contains($desc, strtolower($name))) {
                return [
                    'success' => true,
                    'provider' => 'rule_engine',
                    'counterparty_name' => $name,
                    'extracted_utr' => $st->reference_no,
                    'suggested_category' => 'customer_receipt',
                    'suggested_payment_id' => null,
                    'suggested_invoice_id' => null,
                    'confidence' => 88,
                    'explanation' => "Customer '{$name}' identified in transaction narration.",
                    'recommended_action' => 'confirm',
                ];
            }
        }

        // Match supplier by name
        foreach ($suppliers as $id => $name) {
            if (!empty($name) && str_contains($desc, strtolower($name))) {
                return [
                    'success' => true,
                    'provider' => 'rule_engine',
                    'counterparty_name' => $name,
                    'suggested_category' => 'supplier_payment',
                    'extracted_utr' => $st->reference_no,
                    'suggested_payment_id' => null,
                    'suggested_invoice_id' => null,
                    'confidence' => 88,
                    'explanation' => "Supplier '{$name}' identified in transaction narration.",
                    'recommended_action' => 'confirm',
                ];
            }
        }

        // UPI reference match
        if (preg_match('/upi\/([0-9]{12})\/([^\/]+)/i', $st->description, $m)) {
            return [
                'success' => true,
                'provider' => 'rule_engine',
                'counterparty_name' => $m[2] ?? null,
                'extracted_utr' => $m[1] ?? null,
                'suggested_category' => $isCredit ? 'customer_receipt' : 'supplier_payment',
                'suggested_payment_id' => null,
                'suggested_invoice_id' => null,
                'confidence' => 80,
                'explanation' => "Extracted UPI Reference {$m[1]} for party {$m[2]}.",
                'recommended_action' => 'manual_review',
            ];
        }

        return [
            'success' => true,
            'provider' => 'rule_engine',
            'counterparty_name' => null,
            'extracted_utr' => $st->reference_no,
            'suggested_category' => $isCredit ? 'customer_receipt' : 'supplier_payment',
            'suggested_payment_id' => null,
            'suggested_invoice_id' => null,
            'confidence' => 45,
            'explanation' => 'General unclassified bank transaction.',
            'recommended_action' => 'manual_review',
        ];
    }

    protected function encodeJson($data): string
    {
        return json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
}
