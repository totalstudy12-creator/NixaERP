<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BankAccount;
use App\Models\BankAccountTransaction;
use App\Models\Payment;
use App\Models\Invoice;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;
use Throwable;

class PaymentController extends Controller
{
    /* ==================================================================
     |  INDEX  —  returns ALL payments by default
     | ================================================================== */

    /**
     * Display a listing of payments.
     *
     * The React app filters, computes KPI totals, and exports client-side,
     * so we return the full list by default. Pass ?per_page=N to opt into
     * pagination.
     */
    public function index(Request $request)
    {
        $query = Payment::with(['company', 'invoice', 'branch', 'bankAccount']);

        /* ---------- Customer scoping ---------- */
        if ($request->filled('customer_id')) {
            $customerId = (int) $request->input('customer_id');
            $this->applyCustomerFilter($query, $customerId);
        }

        /* ---------- Company / branch / invoice / direction ---------- */
        $companyId = $request->input('company_id');
        if ($companyId && $companyId !== 'all') {
            $query->where('company_id', (int) $companyId);
        }

        $branchId = $request->input('branch_id');
        if ($branchId && $branchId !== 'all') {
            $query->where('branch_id', (int) $branchId);
        }

        if ($request->filled('bank_account_id') && $request->input('bank_account_id') !== 'all') {
            $query->where('bank_account_id', (int) $request->input('bank_account_id'));
        }

        if ($request->filled('invoice_id')) {
            $query->where('invoice_id', (int) $request->input('invoice_id'));
        }

        $direction = $request->input('payment_direction');
        if ($direction && $direction !== 'all') {
            $query->where('payment_direction', $direction);
        }

        /* ---------- Deterministic ordering ---------- */
        $query
            ->orderByDesc('created_at')
            ->orderByDesc('transaction_date')
            ->orderByDesc('id');

        $perPage = (int) $request->input('per_page', 0);
        if ($perPage > 0) {
            return $query->paginate($perPage);
        }

        return $query->get();
    }

    /* ==================================================================
     |  STORE
     | ================================================================== */

    /**
     * Store a newly created payment and update invoice status & bank ledger.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'company_id'        => ['nullable', $this->activeExists('companies')],
            'branch_id'         => ['nullable', $this->activeExistsForCompany($request)],
            'customer_id'       => 'nullable|integer',
            'bank_account_id'   => 'nullable|exists:bank_accounts,id',
            'invoice_id'        => ['nullable', $this->activeExists('invoices')],
            'reference_no'      => 'nullable|string|max:255',
            'amount'            => 'required|numeric|min:0.01',
            'payment_method'    => 'required|string|max:100',
            'status'            => 'required|string|max:100',
            'payment_direction' => 'required|in:inward,outward',
            'transaction_date'  => 'nullable|date',
            'bank_name'         => 'nullable|string|max:255',
            'account_number'    => 'nullable|string|max:255',
            'ledger_reference'  => 'nullable|string|max:255',
            'remarks'           => 'nullable|string',
        ]);

        // Inherit branch_id and customer_id from the invoice when not provided.
        if (! empty($data['invoice_id'])) {
            $inv = Invoice::find($data['invoice_id']);
            if ($inv) {
                if (empty($data['branch_id'])) {
                    $data['branch_id'] = $inv->branch_id;
                }
                if (empty($data['customer_id']) && Schema::hasColumn('payments', 'customer_id')) {
                    $data['customer_id'] = $inv->customer_id;
                }
            }
        }

        $data['transaction_date'] = $data['transaction_date'] ?? now()->toDateString();

        // Generate fallback reference if not provided.
        if (empty($data['reference_no'])) {
            $data['reference_no'] = 'PAY-'
                . ($data['invoice_id'] ?? 'GEN')
                . '-' . now()->timestamp;
        }

        return DB::transaction(function () use ($data) {
            // Auto-resolve default bank or cash account if not explicitly specified
            if (empty($data['bank_account_id']) && Schema::hasTable('bank_accounts')) {
                $targetType = ($data['payment_method'] ?? '') === 'cash' ? 'cash_drawer' : 'bank';
                $defaultAcc = BankAccount::where('company_id', $data['company_id'] ?? 1)
                    ->where('account_type', $targetType)
                    ->where('is_active', true)
                    ->orderByDesc('is_default')
                    ->first();
                if ($defaultAcc) {
                    $data['bank_account_id'] = $defaultAcc->id;
                }
            }

            $payment = Payment::create($data);

            if ($payment->invoice_id) {
                $this->updateInvoiceStatus((int) $payment->invoice_id);
            }

            // Sync with Bank Account & Ledger
            if (!empty($payment->bank_account_id) && Schema::hasTable('bank_accounts')) {
                $account = BankAccount::lockForUpdate()->find($payment->bank_account_id);
                if ($account) {
                    $amount = (float) $payment->amount;
                    if ($payment->payment_direction === 'inward') {
                        $account->current_balance += $amount;
                    } else {
                        $account->current_balance -= $amount;
                    }
                    $account->save();

                    BankAccountTransaction::create([
                        'company_id' => $account->company_id,
                        'branch_id' => $payment->branch_id ?: $account->branch_id,
                        'bank_account_id' => $account->id,
                        'transaction_type' => $payment->payment_direction === 'inward' ? 'payment_in' : 'payment_out',
                        'amount' => $amount,
                        'running_balance' => $account->current_balance,
                        'transaction_date' => $payment->transaction_date ?: now()->toDateString(),
                        'reference_no' => $payment->reference_no,
                        'description' => "Payment #{$payment->id} ({$payment->payment_method}): " . ($payment->remarks ?: 'Invoice payment'),
                        'payment_id' => $payment->id,
                        'counterparty' => $payment->bank_name ?: 'Customer/Supplier',
                        'status' => $payment->status === 'reconciled' ? 'reconciled' : 'cleared',
                        'created_by' => auth()->id(),
                    ]);
                }
            }

            return $payment->load(['company', 'invoice', 'branch', 'bankAccount']);
        });
    }

    /* ==================================================================
     |  SHOW
     | ================================================================== */

    public function show(Payment $payment)
    {
        return $payment->load(['company', 'invoice', 'branch', 'bankAccount']);
    }

    /* ==================================================================
     |  UPDATE
     | ================================================================== */

    public function update(Request $request, Payment $payment)
    {
        $data = $request->validate([
            'company_id'        => ['nullable', $this->activeExists('companies')],
            'branch_id'         => ['nullable', $this->activeExistsForCompany($request)],
            'customer_id'       => 'nullable|integer',
            'bank_account_id'   => 'nullable|exists:bank_accounts,id',
            'invoice_id'        => ['nullable', $this->activeExists('invoices')],
            'reference_no'      => 'nullable|string|max:255',
            'amount'            => 'required|numeric|min:0.01',
            'payment_method'    => 'required|string|max:100',
            'status'            => 'required|string|max:100',
            'payment_direction' => 'required|in:inward,outward',
            'transaction_date'  => 'nullable|date',
            'bank_name'         => 'nullable|string|max:255',
            'account_number'    => 'nullable|string|max:255',
            'ledger_reference'  => 'nullable|string|max:255',
            'remarks'           => 'nullable|string',
        ]);

        if (! empty($data['invoice_id'])) {
            $inv = Invoice::find($data['invoice_id']);
            if ($inv) {
                if (empty($data['branch_id'])) {
                    $data['branch_id'] = $inv->branch_id;
                }
                if (empty($data['customer_id']) && Schema::hasColumn('payments', 'customer_id')) {
                    $data['customer_id'] = $inv->customer_id;
                }
            }
        }

        $data['transaction_date'] = $data['transaction_date'] ?? now()->toDateString();

        if (empty($data['reference_no'])) {
            $data['reference_no'] = 'PAY-'
                . ($data['invoice_id'] ?? $payment->id)
                . '-' . now()->timestamp;
        }

        return DB::transaction(function () use ($data, $payment) {
            $previousInvoiceId = $payment->invoice_id;
            $oldAccountId = $payment->bank_account_id;
            $oldAmount = (float) $payment->amount;
            $oldDirection = $payment->payment_direction;

            // Revert old account balance if present
            if ($oldAccountId && Schema::hasTable('bank_accounts')) {
                $oldAcc = BankAccount::lockForUpdate()->find($oldAccountId);
                if ($oldAcc) {
                    if ($oldDirection === 'inward') {
                        $oldAcc->current_balance -= $oldAmount;
                    } else {
                        $oldAcc->current_balance += $oldAmount;
                    }
                    $oldAcc->save();
                }
            }

            $payment->update($data);

            // Apply new account balance
            if (!empty($payment->bank_account_id) && Schema::hasTable('bank_accounts')) {
                $newAcc = BankAccount::lockForUpdate()->find($payment->bank_account_id);
                if ($newAcc) {
                    $newAmount = (float) $payment->amount;
                    if ($payment->payment_direction === 'inward') {
                        $newAcc->current_balance += $newAmount;
                    } else {
                        $newAcc->current_balance -= $newAmount;
                    }
                    $newAcc->save();

                    // Update or create ledger entry
                    BankAccountTransaction::updateOrCreate(
                        ['payment_id' => $payment->id],
                        [
                            'company_id' => $newAcc->company_id,
                            'branch_id' => $payment->branch_id ?: $newAcc->branch_id,
                            'bank_account_id' => $newAcc->id,
                            'transaction_type' => $payment->payment_direction === 'inward' ? 'payment_in' : 'payment_out',
                            'amount' => $newAmount,
                            'running_balance' => $newAcc->current_balance,
                            'transaction_date' => $payment->transaction_date ?: now()->toDateString(),
                            'reference_no' => $payment->reference_no,
                            'description' => "Payment #{$payment->id} ({$payment->payment_method}): " . ($payment->remarks ?: 'Invoice payment'),
                            'counterparty' => $payment->bank_name ?: 'Customer/Supplier',
                            'status' => $payment->status === 'reconciled' ? 'reconciled' : 'cleared',
                        ]
                    );
                }
            }

            // Recalculate invoices
            if ($previousInvoiceId) {
                $this->updateInvoiceStatus((int) $previousInvoiceId);
            }
            if ($payment->invoice_id) {
                $this->updateInvoiceStatus((int) $payment->invoice_id);
            }

            return $payment->fresh(['company', 'invoice', 'branch', 'bankAccount']);
        });
    }

    /* ==================================================================
     |  DESTROY
     | ================================================================== */

    public function destroy(Payment $payment)
    {
        return DB::transaction(function () use ($payment) {
            $invoiceId = $payment->invoice_id;

            // Revert account balance
            if ($payment->bank_account_id && Schema::hasTable('bank_accounts')) {
                $acc = BankAccount::lockForUpdate()->find($payment->bank_account_id);
                if ($acc) {
                    $amount = (float) $payment->amount;
                    if ($payment->payment_direction === 'inward') {
                        $acc->current_balance -= $amount;
                    } else {
                        $acc->current_balance += $amount;
                    }
                    $acc->save();
                }
                BankAccountTransaction::where('payment_id', $payment->id)->delete();
            }

            $payment->delete();

            if ($invoiceId) {
                $this->updateInvoiceStatus((int) $invoiceId);
            }

            return response()->noContent();
        });
    }

    /* ==================================================================
     |  INVOICE STATUS
     | ================================================================== */

    private function updateInvoiceStatus(int $invoiceId): void
    {
        $invoice = Invoice::find($invoiceId);
        if (! $invoice) {
            return;
        }

        $purchaseTypes = ['purchase_invoice', 'purchase_bill'];
        if (in_array($invoice->type, $purchaseTypes, true)) {
            return;
        }

        $paymentsQuery = $invoice->payments()
            ->where('payment_direction', 'inward');

        try {
            if (Schema::hasColumn('payments', 'deleted_at')) {
                $paymentsQuery->whereNull('payments.deleted_at');
            }
        } catch (Throwable $e) {
            // noop
        }

        $totalPaid   = (float) $paymentsQuery->sum('amount');
        $totalAmount = (float) ($invoice->grand_total > 0 ? $invoice->grand_total : $invoice->total_amount);

        if ($totalPaid <= 0) {
            $status = 'unpaid';
            $paymentStatus = 'unpaid';
        } elseif ($totalPaid >= ($totalAmount - 0.01)) {
            $status = 'paid';
            $paymentStatus = 'paid';
        } else {
            $status = 'partial';
            $paymentStatus = 'partial';
        }

        $updates = ['status' => $status];
        if (Schema::hasColumn('invoices', 'payment_status')) {
            $updates['payment_status'] = $paymentStatus;
        }
        if (Schema::hasColumn('invoices', 'paid_amount')) {
            $updates['paid_amount'] = $totalPaid;
        }
        if (Schema::hasColumn('invoices', 'balance_amount')) {
            $updates['balance_amount'] = max(0, $totalAmount - $totalPaid);
        }
        if ($paymentStatus === 'paid' && Schema::hasColumn('invoices', 'paid_at') && empty($invoice->paid_at)) {
            $updates['paid_at'] = now();
        }

        $invoice->update($updates);
    }

    /* ==================================================================
     |  CUSTOMER SCOPING HELPERS
     | ================================================================== */

    private function applyCustomerFilter($query, int $customerId): void
    {
        try {
            $columns = Schema::getColumnListing('payments');
        } catch (Throwable $e) {
            Log::warning('Payment index: unable to inspect payments table', [
                'error' => $e->getMessage(),
            ]);
            return;
        }

        $directFkCandidates = [
            'customer_id',
            'party_id',
            'dealer_id',
            'distributor_id',
            'client_id',
            'contact_id',
        ];

        foreach ($directFkCandidates as $col) {
            if (in_array($col, $columns, true)) {
                $query->where($col, $customerId);
                return;
            }
        }

        if (in_array('invoice_id', $columns, true)) {
            try {
                if (Schema::hasTable('invoices')
                    && Schema::hasColumn('invoices', 'customer_id')) {

                    $invoiceIds = DB::table('invoices')
                        ->where('customer_id', $customerId);

                    if (Schema::hasColumn('invoices', 'deleted_at')) {
                        $invoiceIds->whereNull('invoices.deleted_at');
                    }

                    $query->whereIn('invoice_id', $invoiceIds->select('id'));
                    return;
                }
            } catch (Throwable $e) {
                Log::warning('Payment index: unable to filter via invoices', [
                    'customer_id' => $customerId,
                    'error'       => $e->getMessage(),
                ]);
            }
        }

        Log::warning('Payment index: no customer column found on payments', [
            'customer_id' => $customerId,
            'columns'     => $columns,
        ]);
    }

    /* ==================================================================
     |  VALIDATION HELPERS
     | ================================================================== */

    private function activeExists(string $table, string $column = 'id'): Exists
    {
        return Rule::exists($table, $column)
            ->where(function ($q) use ($table) {
                try {
                    if (Schema::hasColumn($table, 'deleted_at')) {
                        $q->whereNull('deleted_at');
                    }
                } catch (Throwable $e) {
                    // noop
                }
            });
    }

    private function activeExistsForCompany(Request $request): Exists
    {
        return Rule::exists('branches', 'id')
            ->where(function ($q) use ($request) {
                try {
                    if (Schema::hasColumn('branches', 'deleted_at')) {
                        $q->whereNull('deleted_at');
                    }
                } catch (Throwable $e) {
                    // noop
                }

                if ($request->filled('company_id')) {
                    $q->where('company_id', $request->input('company_id'));
                }
            });
    }
}
