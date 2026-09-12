<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
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
     *
     * Supported query params:
     *   - customer_id       (int)  — filters to a single customer
     *   - company_id        (int|"all")
     *   - branch_id         (int|"all")
     *   - invoice_id        (int)
     *   - payment_direction ("inward" | "outward" | "all")
     *   - per_page          (int) — opt-in pagination; 0 / omitted = full list
     */
    public function index(Request $request)
    {
        $query = Payment::with(['company', 'invoice', 'branch']);

        /* ---------- Customer scoping (the important fix) ---------- */
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

        if ($request->filled('invoice_id')) {
            $query->where('invoice_id', (int) $request->input('invoice_id'));
        }

        $direction = $request->input('payment_direction');
        if ($direction && $direction !== 'all') {
            $query->where('payment_direction', $direction);
        }

        /* ---------- Deterministic ordering ---------- */
        // created_at desc, then transaction_date desc, then id desc
        // as the ultimate tie-breaker.
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
     * Store a newly created payment and update invoice status.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'company_id' => ['nullable', $this->activeExists('companies')],
            'branch_id'  => ['nullable', $this->activeExistsForCompany($request)],
            'invoice_id' => ['nullable', $this->activeExists('invoices')],
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

        // Inherit branch_id from the invoice when not provided.
        if (empty($data['branch_id']) && ! empty($data['invoice_id'])) {
            $data['branch_id'] = Invoice::whereKey($data['invoice_id'])->value('branch_id');
        }

        $data['transaction_date'] = $data['transaction_date'] ?? now()->toDateString();

        // Generate fallback reference if not provided.
        if (empty($data['reference_no'])) {
            $data['reference_no'] = 'PAY-'
                . ($data['invoice_id'] ?? 'GEN')
                . '-' . now()->timestamp;
        }

        return DB::transaction(function () use ($data) {
            $payment = Payment::create($data);

            if ($payment->invoice_id) {
                $this->updateInvoiceStatus((int) $payment->invoice_id);
            }

            return $payment->load(['company', 'invoice', 'branch']);
        });
    }

    /* ==================================================================
     |  SHOW
     | ================================================================== */

    /**
     * Display the specified payment.
     */
    public function show(Payment $payment)
    {
        return $payment->load(['company', 'invoice', 'branch']);
    }

    /* ==================================================================
     |  UPDATE
     | ================================================================== */

    /**
     * Update the specified payment and adjust invoice status if needed.
     */
    public function update(Request $request, Payment $payment)
    {
        $data = $request->validate([
            'company_id' => ['nullable', $this->activeExists('companies')],
            'branch_id'  => ['nullable', $this->activeExistsForCompany($request)],
            'invoice_id' => ['nullable', $this->activeExists('invoices')],
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

        // Inherit branch_id from the (new) invoice when not provided.
        if (empty($data['branch_id']) && ! empty($data['invoice_id'])) {
            $data['branch_id'] = Invoice::whereKey($data['invoice_id'])->value('branch_id');
        }

        $data['transaction_date'] = $data['transaction_date'] ?? now()->toDateString();

        if (empty($data['reference_no'])) {
            $data['reference_no'] = 'PAY-'
                . ($data['invoice_id'] ?? $payment->id)
                . '-' . now()->timestamp;
        }

        return DB::transaction(function () use ($data, $payment) {
            $previousInvoiceId = $payment->invoice_id;

            $payment->update($data);

            // Recalculate the old invoice (if it changed).
            if ($previousInvoiceId) {
                $this->updateInvoiceStatus((int) $previousInvoiceId);
            }

            // Recalculate the new invoice.
            if ($payment->invoice_id) {
                $this->updateInvoiceStatus((int) $payment->invoice_id);
            }

            return $payment->fresh(['company', 'invoice', 'branch']);
        });
    }

    /* ==================================================================
     |  DESTROY
     | ================================================================== */

    /**
     * Remove the specified payment (soft delete) and update invoice status.
     */
    public function destroy(Payment $payment)
    {
        return DB::transaction(function () use ($payment) {
            $invoiceId = $payment->invoice_id;

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

    /**
     * Recalculate invoice status based on total paid amount.
     *
     * - Uses Invoice::find() so a soft-deleted invoice is never re-touched.
     * - Excludes soft-deleted payments from the sum, even if the Payment
     *   model does not use the SoftDeletes trait.
     */
    private function updateInvoiceStatus(int $invoiceId): void
    {
        $invoice = Invoice::find($invoiceId);
        if (! $invoice) {
            return;
        }

        // Skip status update for purchase invoices / bills.
        $purchaseTypes = ['purchase_invoice', 'purchase_bill'];
        if (in_array($invoice->type, $purchaseTypes, true)) {
            return;
        }

        $paymentsQuery = $invoice->payments()
            ->where('payment_direction', 'inward');

        // Defensive: exclude soft-deleted payments whether or not the
        // Payment model uses the SoftDeletes trait.
        try {
            if (Schema::hasColumn('payments', 'deleted_at')) {
                $paymentsQuery->whereNull('payments.deleted_at');
            }
        } catch (Throwable $e) {
            // noop
        }

        $totalPaid   = (float) $paymentsQuery->sum('amount');
        $totalAmount = (float) $invoice->total_amount;

        if ($totalPaid <= 0) {
            $status = 'unpaid';
        } elseif ($totalPaid >= $totalAmount) {
            $status = 'paid';
        } else {
            $status = 'partial';
        }

        $invoice->update(['status' => $status]);
    }

    /* ==================================================================
     |  CUSTOMER SCOPING HELPERS
     | ================================================================== */

    /**
     * Scope a Payment query to a single customer.
     *
     * Three schemas are supported, in this order:
     *   1. `payments.customer_id`                (direct FK)
     *   2. `payments.party_id` / `dealer_id` /   (aliased FK)
     *      `client_id` / `contact_id`
     *   3. `payments.invoice_id` → `invoices.customer_id` (indirect)
     *
     * Anything else is a schema we don't know how to scope safely. In
     * that case we log a warning and leave the query unfiltered; the
     * client-side ownership guard in CustomersPage will drop the
     * stray rows and log its own warning.
     */
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

        // 1) Direct FK aliases on payments.
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

        // 2) Indirect via invoices.
        if (in_array('invoice_id', $columns, true)) {
            try {
                if (Schema::hasTable('invoices')
                    && Schema::hasColumn('invoices', 'customer_id')) {

                    $invoiceIds = DB::table('invoices')
                        ->where('customer_id', $customerId);

                    // Respect soft-deletes on invoices if present.
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

        // 3) Unknown schema — do not scope, but log loudly.
        Log::warning('Payment index: no customer column found on payments', [
            'customer_id' => $customerId,
            'columns'     => $columns,
        ]);
    }

    /* ==================================================================
     |  VALIDATION HELPERS — soft-delete aware
     | ================================================================== */

    /**
     * Build a Rule::exists that excludes soft-deleted rows when the
     * target table has a `deleted_at` column.
     */
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

    /**
     * Branch rule that:
     *   - excludes soft-deleted branches
     *   - constrains the branch to the supplied company_id
     */
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