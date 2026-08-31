<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PurchaseInvoice;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PurchaseInvoiceController extends Controller
{
    public function index()
    {
        return PurchaseInvoice::with(['supplier', 'items', 'payments'])
            ->orderBy('created_at', 'desc')
            ->paginate(15);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'company_id'              => 'required|exists:companies,id',
            'supplier_id'             => 'required|exists:suppliers,id',
            'purchase_number'         => 'required|string|unique:purchase_invoices,purchase_number',
            'purchase_date'           => 'required|date',
            'due_date'                => 'nullable|date',
            'bill_number'             => 'nullable|string',
            'reference_number'        => 'nullable|string',
            'warehouse'               => 'nullable|string',
            'notes'                   => 'nullable|string',
            'internal_remarks'        => 'nullable|string',
            'branch'                  => 'nullable|string',
            'items'                   => 'required|array|min:1',
            'items.*.product_id'      => 'nullable|exists:products,id',
            'items.*.product_name'    => 'required|string',
            'items.*.unit'            => 'required|string',
            'items.*.quantity'        => 'required|numeric|min:0.01',
            'items.*.purchase_price'  => 'required|numeric|min:0',
            'items.*.discount_type'   => 'nullable|in:percent,amount',
            'items.*.discount_percent'=> 'nullable|numeric|min:0|max:100',
            'items.*.discount_amount' => 'nullable|numeric|min:0',
            'items.*.gst_slab'        => 'nullable|numeric|min:0',
            'items.*.is_inter_state'  => 'nullable|boolean',
            'items.*.cgst_percent'    => 'nullable|numeric|min:0',
            'items.*.sgst_percent'    => 'nullable|numeric|min:0',
            'items.*.igst_percent'    => 'nullable|numeric|min:0',
            'additional_charges'      => 'sometimes|array',
            'additional_charges.*.label' => 'nullable|string',
            'additional_charges.*.amount'=> 'nullable|numeric',
            'order_discount'          => 'nullable|numeric',
            'shipping_charges'        => 'nullable|numeric',
            'packing_charges'         => 'nullable|numeric',
            'other_charges'           => 'nullable|numeric',
            'round_off'               => 'nullable|numeric',
            'payment_amount'          => 'nullable|numeric|min:0',
            'payment_method'          => 'required_with:payment_amount|string',
            'payment_date'            => 'required_with:payment_amount|date',
            'payment_reference'       => 'nullable|string',
        ]);

        $subtotal = 0;
        $discountAmount = 0;
        $taxAmount = 0;

        foreach ($validated['items'] as &$item) {
            $base = $item['quantity'] * $item['purchase_price'];
            $disc = $item['discount_type'] === 'percent'
                ? $base * ($item['discount_percent'] / 100)
                : ($item['discount_amount'] ?? 0);
            $afterDiscount = $base - $disc;
            $slab = $item['gst_slab'] ?? 0;

            if ($item['is_inter_state'] ?? true) {
                $igst = $afterDiscount * ($slab / 100);
                $item['igst_amount'] = $igst;
                $item['cgst_amount'] = 0;
                $item['sgst_amount'] = 0;
            } else {
                $half = $slab / 2;
                $cgst = $afterDiscount * ($half / 100);
                $sgst = $afterDiscount * ($half / 100);
                $item['cgst_amount'] = $cgst;
                $item['sgst_amount'] = $sgst;
                $item['igst_amount'] = 0;
            }

            $item['total'] = $afterDiscount
                + ($item['cgst_amount'] ?? 0)
                + ($item['sgst_amount'] ?? 0)
                + ($item['igst_amount'] ?? 0);

            $subtotal += $base;
            $discountAmount += $disc;
            $taxAmount += ($item['cgst_amount'] ?? 0)
                + ($item['sgst_amount'] ?? 0)
                + ($item['igst_amount'] ?? 0);
        }

        $orderDiscount = $validated['order_discount'] ?? 0;
        $grandTotal = $subtotal - $discountAmount + $taxAmount - $orderDiscount
                    + ($validated['shipping_charges'] ?? 0)
                    + ($validated['packing_charges'] ?? 0)
                    + ($validated['other_charges'] ?? 0)
                    + ($validated['round_off'] ?? 0);

        $purchase = DB::transaction(function () use ($validated, $subtotal, $discountAmount, $taxAmount, $orderDiscount, $grandTotal) {
            $purchase = PurchaseInvoice::create([
                'company_id'             => $validated['company_id'],
                'supplier_id'            => $validated['supplier_id'],
                'purchase_number'        => $validated['purchase_number'],
                'bill_number'            => $validated['bill_number'] ?? null,
                'purchase_date'          => $validated['purchase_date'],
                'due_date'               => $validated['due_date'] ?? null,
                'reference_number'       => $validated['reference_number'] ?? null,
                'warehouse'              => $validated['warehouse'] ?? 'Main Warehouse',
                'notes'                  => $validated['notes'] ?? null,
                'internal_remarks'       => $validated['internal_remarks'] ?? null,
                'subtotal'               => $subtotal,
                'order_discount'         => $orderDiscount,
                'tax_amount'             => $taxAmount,
                'shipping_charges'       => $validated['shipping_charges'] ?? 0,
                'packing_charges'        => $validated['packing_charges'] ?? 0,
                'other_charges'          => $validated['other_charges'] ?? 0,
                'round_off'              => $validated['round_off'] ?? 0,
                'grand_total'            => $grandTotal,
                'status'                 => $validated['status'] ?? 'Draft',
                'payment_status'         => 'Unpaid',
                'paid_amount'            => 0,
            ]);

            $purchase->items()->createMany($validated['items']);

            // Update stock and product purchase_price
            foreach ($validated['items'] as $item) {
                if (!empty($item['product_id'])) {
                    $product = Product::find($item['product_id']);
                    if ($product) {
                        $product->increment('stock_quantity', $item['quantity']);
                        // Update product's purchase price to the price used in this purchase
                        $product->update(['purchase_price' => $item['purchase_price']]);
                    }
                }
            }
 
            // Record payment if amount > 0
            if (!empty($validated['payment_amount']) && $validated['payment_amount'] > 0) {
                $purchase->payments()->create([
                    'company_id'       => $purchase->company_id,
                    'amount'           => $validated['payment_amount'],
                    'payment_method'   => $validated['payment_method'],
                    'transaction_date' => $validated['payment_date'] ?? now(),
                    'reference_no'     => $validated['payment_reference'] ?? 'Purchase',   // ← saved here
                    'status'           => 'completed',
                    'payment_direction'=> 'outward',
                ]);
                $totalPaid = $purchase->payments()->sum('amount');
                $purchase->update([
                    'paid_amount'    => $totalPaid,
                    'payment_status' => $totalPaid >= $purchase->grand_total ? 'Paid' : 'Partial',
                ]);
            }

            return $purchase;
        });

        return response()->json($purchase->load(['supplier', 'items', 'payments']), 201);
    }

    public function show($id)
    {
        return PurchaseInvoice::with(['supplier', 'items.product', 'payments'])->findOrFail($id);
    }

    public function update(Request $request, $id)
    {
        // Similar pattern – omitted for brevity
    }

    public function destroy($id)
    {
        $purchase = PurchaseInvoice::findOrFail($id);
        $purchase->delete();
        return response()->noContent();
    }

    public function addPayment(Request $request, $id)
    {
        $validated = $request->validate([
            'amount'          => 'required|numeric|min:0.01',
            'payment_method'  => 'required|string',
            'payment_date'    => 'required|date',
            'reference'       => 'nullable|string',
            'notes'           => 'nullable|string',
        ]);

        $purchase = PurchaseInvoice::findOrFail($id);
        $payment = $purchase->payments()->create([
            'company_id'       => $purchase->company_id,
            'amount'           => $validated['amount'],
            'payment_method'   => $validated['payment_method'],
            'transaction_date' => $validated['payment_date'],
            'reference_no'     => $validated['reference'] ?? null,
            'status'           => 'completed',
        ]);
        $totalPaid = $purchase->payments()->sum('amount');
        $purchase->update([
            'paid_amount'    => $totalPaid,
            'payment_status' => $totalPaid >= $purchase->grand_total ? 'Paid' : 'Partial',
        ]);
        return response()->json($payment, 201);
    }
} 