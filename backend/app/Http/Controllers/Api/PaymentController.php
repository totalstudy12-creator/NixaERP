<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Payment;
use App\Models\Invoice;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PaymentController extends Controller
{
    /**
     * Display a listing of payments.
     */
    public function index()
    {
        return Payment::with(['company', 'invoice'])
            ->orderBy('created_at', 'desc')
            ->paginate(15);
    }

    /**
     * Store a newly created payment and update invoice status.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'company_id'       => 'nullable|exists:companies,id',
            'invoice_id'       => 'nullable|exists:invoices,id',
            'reference_no'     => 'required|string|max:255',
            'amount'           => 'required|numeric|min:0.01',
            'payment_method'   => 'required|string|max:100',
            'status'           => 'required|string|max:100',
            'transaction_date' => 'nullable|date',
            'bank_name'        => 'nullable|string|max:255',
            'account_number'   => 'nullable|string|max:255',
            'ledger_reference' => 'nullable|string|max:255',
            'remarks'          => 'nullable|string',
        ]);

        $data['transaction_date'] = $data['transaction_date'] ?? now();

        return DB::transaction(function () use ($data) {
            $payment = Payment::create($data);

            // Update invoice status if linked
            if ($payment->invoice_id) {
                $this->updateInvoiceStatus($payment->invoice_id);
            }

            return $payment->load(['company', 'invoice']);
        });
    }

    /**
     * Display the specified payment.
     */
    public function show(Payment $payment)
    {
        return $payment->load(['company', 'invoice']);
    }

    /**
     * Update the specified payment and adjust invoice status if needed.
     */
    public function update(Request $request, Payment $payment)
    {
        $data = $request->validate([
            'company_id'       => 'nullable|exists:companies,id',
            'invoice_id'       => 'nullable|exists:invoices,id',
            'reference_no'     => 'required|string|max:255',
            'amount'           => 'required|numeric|min:0.01',
            'payment_method'   => 'required|string|max:100',
            'status'           => 'required|string|max:100',
            'transaction_date' => 'nullable|date',
            'bank_name'        => 'nullable|string|max:255',
            'account_number'   => 'nullable|string|max:255',
            'ledger_reference' => 'nullable|string|max:255',
            'remarks'          => 'nullable|string',
        ]);
 
        $data['transaction_date'] = $data['transaction_date'] ?? now();

        return DB::transaction(function () use ($data, $payment) {
            $previousInvoiceId = $payment->invoice_id;
            $payment->update($data);

            // If invoice changed or amount updated, recalc both old and new invoices
            if ($previousInvoiceId) {
                $this->updateInvoiceStatus($previousInvoiceId);
            }
            if ($payment->invoice_id && $payment->invoice_id !== $previousInvoiceId) {
                $this->updateInvoiceStatus($payment->invoice_id);
            } elseif ($payment->invoice_id) {
                // Same invoice – just recalc
                $this->updateInvoiceStatus($payment->invoice_id);
            }

            return $payment->fresh(['company', 'invoice']);
        });
    }

    /**
     * Remove the specified payment (soft delete) and update invoice status.
     */
    public function destroy(Payment $payment)
    {
        return DB::transaction(function () use ($payment) {
            $invoiceId = $payment->invoice_id;
            $payment->delete();

            if ($invoiceId) {
                $this->updateInvoiceStatus($invoiceId);
            }

            return response()->noContent();
        });
    }

    /**
     * Recalculate invoice status based on total paid amount.
     */
    private function updateInvoiceStatus(int $invoiceId)
    {
        $invoice = Invoice::find($invoiceId);
        if (!$invoice) return;

        $totalPaid = $invoice->payments()->sum('amount');
        $totalAmount = $invoice->total_amount;

        if ($totalPaid <= 0) {
            $status = 'unpaid';
        } elseif ($totalPaid >= $totalAmount) {
            $status = 'paid';
        } else {
            $status = 'partial';
        }

        $invoice->update(['status' => $status]);
    }
}