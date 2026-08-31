<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class InvoiceController extends Controller
{
    /**
     * Display a listing of invoices.
     */
    public function index()
    {
        return Invoice::with(['company', 'branch', 'customer', 'items.product'])
            ->orderBy('created_at', 'desc')
            ->paginate(15);
    }

    /**
     * Get the next invoice number.
     */
    public function nextNumber()
    {
        $year = date('Y');
        
        // Get the latest invoice for the current year
        $lastInvoice = Invoice::whereYear('created_at', $year)
            ->orderBy('id', 'desc')
            ->first();
        
        if ($lastInvoice && $lastInvoice->invoice_no) {
            // Try to extract the numeric part
            // Format examples: INV-2025-000001, INV-2025-000123
            if (preg_match('/(\d+)$/', $lastInvoice->invoice_no, $matches)) {
                $lastNumber = intval($matches[1]);
            } else {
                $lastNumber = $lastInvoice->id;
            }
            $nextNumber = $lastNumber + 1;
        } else {
            $nextNumber = 1;
        }
        
        $invoiceNo = sprintf('INV-%s-%06d', $year, $nextNumber);
        
        return response()->json([
            'success' => true,
            'next_invoice_no' => $invoiceNo,
        ]);
    }

    /**
     * Store a newly created invoice with items.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'company_id'          => 'required|exists:companies,id',
            'branch_id'           => 'nullable|exists:branches,id',
            'customer_id'         => 'required|exists:customers,id',
            'customer_name'       => 'nullable|string|max:255',
            'billing_street'      => 'nullable|string',
            'billing_city'        => 'nullable|string',
            'billing_state'       => 'nullable|string',
            'billing_country'     => 'nullable|string',
            'billing_pincode'     => 'nullable|string',
            'shipping_street'     => 'nullable|string',
            'shipping_city'       => 'nullable|string',
            'shipping_state'      => 'nullable|string',
            'shipping_country'    => 'nullable|string',
            'shipping_pincode'    => 'nullable|string',
            'contact_person'      => 'nullable|string|max:100',
            'contact_no'          => 'nullable|string|max:20',
            'gstin'               => 'nullable|string|max:50',
            'pan'                 => 'nullable|string|max:50',
            'invoice_type'        => 'nullable|string|max:50',
            'invoice_no'          => 'nullable|string|max:100|unique:invoices,invoice_no',
            'invoice_date'        => 'nullable|date',
            'challan_no'          => 'nullable|string|max:100',
            'challan_date'        => 'nullable|date',
            'po_no'               => 'nullable|string|max:100',
            'po_date'             => 'nullable|date',
            'lr_no'               => 'nullable|string|max:100',
            'eway_no'             => 'nullable|string|max:100',
            'delivery_mode'       => 'nullable|string|max:50',
            'payment_term'        => 'nullable|string|max:100',
            'bank_id'             => 'nullable|exists:banks,id',
            'packing_charges'     => 'nullable|numeric|min:0',
            'general_discount_percent' => 'nullable|numeric|min:0',
            'general_discount_amount'  => 'nullable|numeric|min:0',
            'tcs_percent'         => 'nullable|numeric|min:0',
            'terms_title'         => 'nullable|string',
            'terms_detail'        => 'nullable|string',
            'document_note'       => 'nullable|string',
            'internal_note'       => 'nullable|string',
            'additional_charges'  => 'nullable|array',
            'additional_charges.*.label'  => 'nullable|string',
            'additional_charges.*.amount' => 'nullable|numeric|min:0',
            'status'              => 'nullable|string|max:50',

            // Items array
            'items'               => 'required|array|min:1',
            'items.*.product_id'  => 'required|exists:products,id',
            'items.*.quantity'    => 'required|integer|min:1',
            'items.*.unit_price'  => 'required|numeric|min:0',
            'items.*.discount_type' => 'nullable|string|in:percent,amount',
            'items.*.discount_percent' => 'nullable|numeric|min:0',
            'items.*.discount_amount'  => 'nullable|numeric|min:0',
            'items.*.gst_slab'    => 'nullable|numeric|min:0',
            'items.*.is_inter_state' => 'nullable|boolean',
            'items.*.cgst_percent' => 'nullable|numeric|min:0',
            'items.*.sgst_percent' => 'nullable|numeric|min:0',
            'items.*.igst_percent' => 'nullable|numeric|min:0',
            'items.*.cgst_amount' => 'nullable|numeric|min:0',
            'items.*.sgst_amount' => 'nullable|numeric|min:0',
            'items.*.igst_amount' => 'nullable|numeric|min:0',
            'items.*.total'       => 'nullable|numeric|min:0',
        ]);

        // Auto-generate invoice number if not provided
        if (empty($data['invoice_no'])) {
            $data['invoice_no'] = $this->generateInvoiceNo();
        } else {
            $exists = Invoice::withTrashed()->where('invoice_no', $data['invoice_no'])->exists();
            if ($exists) {
                $data['invoice_no'] = $this->generateInvoiceNo();
            }
        }

        if (empty($data['invoice_date'])) {
            $data['invoice_date'] = now()->toDateString();
        }

        if (empty($data['status'])) {
            $data['status'] = 'issued';
        }

        return DB::transaction(function () use ($data) {
            // Create invoice header
            $invoice = Invoice::create($data);

            $subtotal = 0;
            $totalDiscount = 0;
            $totalTax = 0;

            foreach ($data['items'] as $item) {
                $qty = $item['quantity'];
                $price = $item['unit_price'];
                $itemSubtotal = $qty * $price;

                $discountType = $item['discount_type'] ?? 'percent';
                $discountAmount = $discountType === 'amount'
                    ? ($item['discount_amount'] ?? 0)
                    : $itemSubtotal * ($item['discount_percent'] ?? 0) / 100;

                $afterDiscount = max(0, $itemSubtotal - $discountAmount);
                $gstSlab = $item['gst_slab'] ?? 0;
                $isInterState = $item['is_inter_state'] ?? false;

                $cgstAmount = 0;
                $sgstAmount = 0;
                $igstAmount = 0;

                if ($gstSlab > 0) {
                    if ($isInterState) {
                        $igstAmount = $afterDiscount * ($gstSlab / 100);
                    } else {
                        $half = $gstSlab / 2;
                        $cgstAmount = $afterDiscount * ($half / 100);
                        $sgstAmount = $cgstAmount;
                    }
                }

                $itemTotal = $afterDiscount + $cgstAmount + $sgstAmount + $igstAmount;

                $subtotal += $itemSubtotal;
                $totalDiscount += $discountAmount;
                $totalTax += $cgstAmount + $sgstAmount + $igstAmount;

                InvoiceItem::create([
                    'invoice_id'       => $invoice->id,
                    'product_id'       => $item['product_id'],
                    'quantity'         => $qty,
                    'unit_price'       => $price,
                    'discount_type'    => $discountType,
                    'discount_percent' => $item['discount_percent'] ?? 0,
                    'discount_amount'  => $discountAmount,
                    'gst_slab'         => $gstSlab,
                    'is_inter_state'   => $isInterState,
                    'cgst_percent'     => $isInterState ? 0 : ($gstSlab / 2),
                    'sgst_percent'     => $isInterState ? 0 : ($gstSlab / 2),
                    'igst_percent'     => $isInterState ? $gstSlab : 0,
                    'cgst_amount'      => $cgstAmount,
                    'sgst_amount'      => $sgstAmount,
                    'igst_amount'      => $igstAmount,
                    'tax_rate'         => $gstSlab,
                    'subtotal'         => $itemSubtotal,
                    'total'            => $itemTotal,
                ]);
            }

            // General discount
            $generalDiscount = 0;
            if (!empty($data['general_discount_percent']) && $data['general_discount_percent'] > 0) {
                $generalDiscount = ($subtotal - $totalDiscount) * $data['general_discount_percent'] / 100;
            } elseif (!empty($data['general_discount_amount'])) {
                $generalDiscount = $data['general_discount_amount'];
            }

            $packing = $data['packing_charges'] ?? 0;
            $additionalCharges = collect($data['additional_charges'] ?? [])->sum('amount');

            $totalBeforeTcs = ($subtotal - $totalDiscount) - $generalDiscount + $totalTax + $packing + $additionalCharges;
            $tcsAmount = $totalBeforeTcs * ($data['tcs_percent'] ?? 0) / 100;
            $grandTotal = round($totalBeforeTcs + $tcsAmount);
            $roundOff = $grandTotal - ($totalBeforeTcs + $tcsAmount);

            // Update invoice with calculated totals
            $invoice->update([
                'discount_amount' => $totalDiscount + $generalDiscount,
                'tax_amount'      => $totalTax,
                'tcs_amount'      => $tcsAmount,
                'round_off'       => $roundOff,
                'total_amount'    => $grandTotal,
            ]);

            return $invoice->load(['company', 'branch', 'customer', 'items.product']);
        });
    }

    /**
     * Display the specified invoice with all relations.
     */
    public function show(Invoice $invoice)
    {
        return $invoice->load(['company', 'branch', 'customer', 'items.product', 'payments']);
    }

    /**
     * Update the invoice header.
     */
    public function update(Request $request, Invoice $invoice)
    {
        $data = $request->validate([
            'company_id'      => 'required|exists:companies,id',
            'branch_id'       => 'nullable|exists:branches,id',
            'customer_id'     => 'required|exists:customers,id',
            'invoice_no'      => 'required|string|max:100|unique:invoices,invoice_no,' . $invoice->id,
            'total_amount'    => 'nullable|numeric|min:0',
            'tax_amount'      => 'nullable|numeric|min:0',
            'discount_amount' => 'nullable|numeric|min:0',
            'status'          => 'nullable|string|max:50',
            'due_date'        => 'nullable|date',
            'notes'           => 'nullable|string',
        ]);

        $invoice->update($data);

        return $invoice->fresh(['company', 'branch', 'customer', 'items.product']);
    }

    /**
     * Remove the specified invoice (soft delete).
     */
    public function destroy(Invoice $invoice)
    {
        $invoice->delete();

        return response()->noContent();
    }

    /**
     * Create an invoice from an existing order.
     */
    public function fromOrder(Request $request)
    {
        $data = $request->validate([
            'order_id'   => 'required|exists:orders,id',
            'invoice_no' => 'required|string|max:100|unique:invoices,invoice_no',
            'due_date'   => 'nullable|date',
            'notes'      => 'nullable|string',
        ]);

        $order = \App\Models\Order::with('items.product')->findOrFail($data['order_id']);

        $invoice = Invoice::create([
            'company_id'   => $order->company_id,
            'customer_id'  => $order->customer_id,
            'order_id'     => $order->id,
            'invoice_no'   => $data['invoice_no'],
            'total_amount' => $order->total_amount,
            'tax_amount'   => $order->tax_amount ?? 0,
            'status'       => 'unpaid',
            'due_date'     => $data['due_date'] ?? null,
            'notes'        => $data['notes'] ?? null,
        ]);

        foreach ($order->items as $it) {
            $invoice->items()->create([
                'product_id' => $it->product_id,
                'quantity'   => $it->quantity ?? 1,
                'unit_price' => $it->unit_price ?? ($it->product->price ?? 0),
                'tax_rate'   => $it->tax_rate ?? 0,
                'subtotal'   => ($it->quantity ?? 1) * ($it->unit_price ?? ($it->product->price ?? 0)),
                'total'      => ($it->quantity ?? 1) * ($it->unit_price ?? ($it->product->price ?? 0)),
            ]);
        }

        return $invoice->load(['company', 'customer', 'items.product']);
    }

    /**
     * Generate the next invoice number.
     * Format: INV-YYYY-XXXXXX (e.g., INV-2025-000001)
     */
    private function generateInvoiceNo(): string
    {
        $year = date('Y');
        
        // Get the latest invoice for the current year
        $lastInvoice = Invoice::withTrashed()
            ->whereYear('created_at', $year)
            ->orderBy('id', 'desc')
            ->first();
        
        if ($lastInvoice && $lastInvoice->invoice_no) {
            // Try to extract the numeric part
            if (preg_match('/(\d+)$/', $lastInvoice->invoice_no, $matches)) {
                $lastNumber = intval($matches[1]);
            } else {
                $lastNumber = $lastInvoice->id;
            }
            $nextNumber = $lastNumber + 1;
        } else {
            $nextNumber = 1;
        }
        
        return sprintf('INV-%s-%06d', $year, $nextNumber);
    }
}