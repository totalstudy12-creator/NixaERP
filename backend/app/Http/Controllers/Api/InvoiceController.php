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
     * Display a listing of invoices (paginated).
     */
    public function index()
    {
        return Invoice::with(['company', 'customer', 'items.product'])
            ->orderBy('created_at', 'desc')
            ->paginate(15);
    }

    /**
     * Store a newly created invoice with items.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'company_id'          => 'required|exists:companies,id',
            'customer_id'         => 'required|exists:customers,id',
            'order_id'            => 'nullable|exists:orders,id',
            'invoice_no'          => 'nullable|string|max:100|unique:invoices,invoice_no',
            'total_amount'        => 'nullable|numeric|min:0',
            'tax_amount'          => 'nullable|numeric|min:0',
            'discount_amount'     => 'nullable|numeric|min:0',
            'status'              => 'nullable|string|max:50',
            'due_date'            => 'nullable|date',
            'notes'               => 'nullable|string',

            // Additional fields from frontend (optional)
            'customer_name'       => 'nullable|string|max:255',
            'customer_address'    => 'nullable|string',
            'contact_person'      => 'nullable|string|max:100',
            'phone_no'            => 'nullable|string|max:20',
            'gstin'               => 'nullable|string|max:50',
            'pan'                 => 'nullable|string|max:50',
            'reverse_charge'      => 'nullable|boolean',
            'ship_to'             => 'nullable|string|max:50',
            'place_of_supply'     => 'nullable|string|max:100',
            'invoice_type'        => 'nullable|string|max:50',
            'invoice_date'        => 'nullable|date',
            'challan_no'          => 'nullable|string|max:100',
            'challan_date'        => 'nullable|date',
            'po_no'               => 'nullable|string|max:100',
            'po_date'             => 'nullable|date',
            'lr_no'               => 'nullable|string|max:100',
            'eway_no'             => 'nullable|string|max:100',
            'delivery_mode'       => 'nullable|string|max:50',
            'payment_type'        => 'nullable|string|max:50',
            'payment_received'    => 'nullable|numeric|min:0',
            'keep_advance'        => 'nullable|boolean',
            'bank_id'             => 'nullable|exists:banks,id',
            'packing_charges'     => 'nullable|numeric|min:0',
            'general_discount_percent' => 'nullable|numeric|min:0',
            'general_discount_amount'  => 'nullable|numeric|min:0',
            'round_off'           => 'nullable|numeric',
            'terms_title'         => 'nullable|string',
            'terms_detail'        => 'nullable|string',
            'document_note'       => 'nullable|string',

            // Items array
            'items'               => 'required|array|min:1',
            'items.*.product_id'  => 'required|exists:products,id',
            'items.*.quantity'    => 'required|integer|min:1',
            'items.*.unit_price'  => 'required|numeric|min:0',
            'items.*.discount_percent' => 'nullable|numeric|min:0',
            'items.*.igst_percent'     => 'nullable|numeric|min:0',
        ]);

        // Auto‑generate invoice number if not provided
        if (empty($data['invoice_no'])) {
            $data['invoice_no'] = Invoice::generateInvoiceNo();
        } else {
            // Ensure uniqueness (optional safety net)
            $exists = Invoice::withTrashed()->where('invoice_no', $data['invoice_no'])->exists();
            if ($exists) {
                $data['invoice_no'] = Invoice::generateInvoiceNo();
            }
        }

        return DB::transaction(function () use ($data) {
            $invoice = Invoice::create($data);

            foreach ($data['items'] as $item) {
                $qty      = $item['quantity'];
                $price    = $item['unit_price'];
                $subtotal = $qty * $price;
                $discount = $subtotal * ($item['discount_percent'] ?? 0) / 100;
                $taxable  = $subtotal - $discount;
                $igst     = $taxable * ($item['igst_percent'] ?? 0) / 100;
                $total    = $taxable + $igst;

                InvoiceItem::create([
                    'invoice_id'       => $invoice->id,
                    'product_id'       => $item['product_id'],
                    'quantity'         => $qty,
                    'unit_price'       => $price,
                    'discount_percent' => $item['discount_percent'] ?? 0,
                    'igst_percent'     => $item['igst_percent'] ?? 0,
                    'tax_rate'         => $item['igst_percent'] ?? 0,  // using IGST as tax_rate
                    'subtotal'         => $subtotal,
                    'total'            => $total,
                ]);
            }

            return $invoice->load(['company', 'customer', 'items.product']);
        });
    }

    /**
     * Display the specified invoice with all relations.
     */
    public function show(Invoice $invoice)
    {
        return $invoice->load(['company', 'customer', 'items.product', 'payments']);
    }

    /**
     * Update the invoice header (does not replace items – for simplicity).
     */
    public function update(Request $request, Invoice $invoice)
    {
        $data = $request->validate([
            'company_id'      => 'required|exists:companies,id',
            'customer_id'     => 'required|exists:customers,id',
            'order_id'        => 'nullable|exists:orders,id',
            'invoice_no'      => 'required|string|max:100|unique:invoices,invoice_no,' . $invoice->id,
            'total_amount'    => 'nullable|numeric|min:0',
            'tax_amount'      => 'nullable|numeric|min:0',
            'status'          => 'nullable|string|max:50',
            'due_date'        => 'nullable|date',
            'notes'           => 'nullable|string',
        ]);

        $invoice->update($data);
        return $invoice->fresh(['company', 'customer', 'items.product']);
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
     * Create an invoice from an existing order and its items.
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
}