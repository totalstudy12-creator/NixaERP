<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PurchaseInvoice;
use App\Models\Product;
use App\Models\StockMovement;
use App\Models\ProductWarehouseStock;
use App\Models\ProductPurchasePriceHistory;
use App\Models\Warehouse;
use App\Models\Branch;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth;

class PurchaseInvoiceController extends Controller
{
    /**
     * Display a listing of purchase invoices.
     * Returns a structure suitable for frontend DataTables:
     * {
     *   data: [...],
     *   meta: { current_page, last_page, total }
     * }
     */
    public function index()
    {
        $purchases = PurchaseInvoice::with(['supplier', 'items', 'payments'])
            ->orderBy('created_at', 'desc')
            ->paginate(15);

        return response()->json([
            'data' => $purchases->items(),
            'meta' => [
                'current_page' => $purchases->currentPage(),
                'last_page'    => $purchases->lastPage(),
                'total'        => $purchases->total(),
            ],
        ]);
    }

    /**
     * Store a newly created purchase invoice.
     */
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
            'warehouse_id'            => 'nullable|exists:warehouses,id',
            'warehouse'               => 'nullable|string',
            'notes'                   => 'nullable|string',
            'internal_remarks'        => 'nullable|string',
            'branch'                  => 'nullable|string',
            'status'                  => 'sometimes|in:draft,ordered,received,partially_received',
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
            'payments'                => 'sometimes|array',
            'payments.*.amount'       => 'required|numeric|min:0.01',
            'payments.*.payment_method' => 'required|string',
            'payments.*.transaction_date' => 'required|date',
            'payments.*.reference_no'   => 'nullable|string',
            'payments.*.payment_direction' => 'nullable|in:inward,outward',
            'payments.*.bank_name'      => 'nullable|string',
            'payments.*.account_number' => 'nullable|string',
            'payments.*.remarks'        => 'nullable|string',
        ]);

        // Resolve or create branch
        $branch = $this->resolveBranch($validated['company_id'], $validated['branch'] ?? 'Main Branch');

        // Resolve or create warehouse
        $warehouse = $this->resolveWarehouse(
            $validated['company_id'],
            $branch->id,
            $validated['warehouse_id'] ?? null,
            $validated['warehouse'] ?? 'Main Warehouse'
        );

        $subtotal = 0;
        $discountAmount = 0;
        $taxAmount = 0;
        $processedItems = [];

        foreach ($validated['items'] as $item) {
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

            $processedItems[] = $item;
        }

        $orderDiscount = $validated['order_discount'] ?? 0;
        $grandTotal = $subtotal - $discountAmount + $taxAmount - $orderDiscount
                    + ($validated['shipping_charges'] ?? 0)
                    + ($validated['packing_charges'] ?? 0)
                    + ($validated['other_charges'] ?? 0)
                    + ($validated['round_off'] ?? 0);

        $purchase = DB::transaction(function () use (
            $validated, $subtotal, $discountAmount, $taxAmount, $orderDiscount, $grandTotal, $processedItems, $warehouse, $branch
        ) {
            $purchase = PurchaseInvoice::create([
                'company_id'             => $validated['company_id'],
                'supplier_id'            => $validated['supplier_id'],
                'purchase_number'        => $validated['purchase_number'],
                'bill_number'            => $validated['bill_number'] ?? null,
                'purchase_date'          => $validated['purchase_date'],
                'due_date'               => $validated['due_date'] ?? null,
                'reference_number'       => $validated['reference_number'] ?? null,
                'warehouse_id'           => $warehouse->id,
                'warehouse'              => $warehouse->name,
                'branch_id'              => $branch->id,
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
                'status'                 => $validated['status'] ?? 'ordered',
                'payment_status'         => 'Unpaid',
                'paid_amount'            => 0,
            ]);

            // Create invoice items
            $purchase->items()->createMany($processedItems);

            // Process stock updates, stock movements, and purchase price history
            foreach ($processedItems as $item) {
                if (!empty($item['product_id'])) {
                    $product = Product::find($item['product_id']);
                    if ($product) {
                        $stockBefore = $product->stock_quantity;
                        $product->increment('stock_quantity', $item['quantity']);
                        $stockAfter = $stockBefore + $item['quantity'];

                        // Update purchase price on product
                        $product->update(['purchase_price' => $item['purchase_price']]);

                        // Create stock movement
                        StockMovement::create([
                            'product_id'       => $product->id,
                            'warehouse_id'     => $warehouse->id,
                            'company_id'       => $validated['company_id'],
                            'branch_id'        => $branch->id,
                            'transaction_type' => 'IN',
                            'reference_type'   => 'purchase',
                            'reference_id'     => $purchase->id,
                            'quantity'         => $item['quantity'],
                            'unit_price'       => $item['purchase_price'],
                            'stock_before'     => $stockBefore,
                            'stock_after'      => $stockAfter,
                            'remark'           => 'Purchase invoice #' . $purchase->purchase_number,
                            'transaction_date' => $purchase->purchase_date,
                            'created_by'       => Auth::id(),
                        ]);

                        // Update or create product warehouse stock
                        $warehouseStock = ProductWarehouseStock::firstOrNew([
                            'product_id'   => $product->id,
                            'warehouse_id' => $warehouse->id,
                            'company_id'   => $validated['company_id'],
                            'branch_id'    => $branch->id,
                        ]);
                        $warehouseStock->quantity = ($warehouseStock->quantity ?? 0) + $item['quantity'];
                        $warehouseStock->available_quantity = ($warehouseStock->available_quantity ?? 0) + $item['quantity'];
                        $warehouseStock->last_purchase_price = $item['purchase_price'];
                        $warehouseStock->save();

                        // Record purchase price history
                        ProductPurchasePriceHistory::create([
                            'product_id'    => $product->id,
                            'supplier_id'   => $purchase->supplier_id,
                            'purchase_id'   => $purchase->id,
                            'bill_number'   => $purchase->bill_number ?? $purchase->purchase_number,
                            'quantity'      => $item['quantity'],
                            'unit_price'    => $item['purchase_price'],
                            'purchase_date' => $purchase->purchase_date,
                        ]);
                    }
                }
            }

            // Process payments
            $totalPaid = 0;
            if (!empty($validated['payments'])) {
                foreach ($validated['payments'] as $payment) {
                    $purchase->payments()->create([
                        'company_id'        => $purchase->company_id,
                        'amount'            => $payment['amount'],
                        'payment_method'    => $payment['payment_method'],
                        'transaction_date'  => $payment['transaction_date'],
                        'reference_no'      => $payment['reference_no'] ?? null,
                        'bank_name'         => $payment['bank_name'] ?? null,
                        'account_number'    => $payment['account_number'] ?? null,
                        'remarks'           => $payment['remarks'] ?? null,
                        'status'            => 'completed',
                        'payment_direction' => $payment['payment_direction'] ?? 'outward',
                    ]);
                    $totalPaid += $payment['amount'];
                }
            }

            $purchase->update([
                'paid_amount'    => $totalPaid,
                'payment_status' => $totalPaid >= $purchase->grand_total ? 'Paid' : ($totalPaid > 0 ? 'Partial' : 'Unpaid'),
            ]);

            return $purchase;
        });

        return response()->json($purchase->load(['supplier', 'items', 'payments']), 201);
    }

    /**
     * Display the specified purchase invoice.
     */
    public function show($id)
    {
        return PurchaseInvoice::with(['supplier', 'items.product', 'payments'])->findOrFail($id);
    }

    /**
     * Update the specified purchase invoice (simplified).
     */
    public function update(Request $request, $id)
    {
        $purchase = PurchaseInvoice::findOrFail($id);

        $validated = $request->validate([
            'supplier_id'             => 'sometimes|exists:suppliers,id',
            'purchase_date'           => 'sometimes|date',
            'due_date'                => 'nullable|date',
            'warehouse_id'            => 'nullable|exists:warehouses,id',
            'notes'                   => 'nullable|string',
            'internal_remarks'        => 'nullable|string',
            'status'                  => 'sometimes|in:draft,ordered,received,partially_received',
            'items'                   => 'sometimes|array|min:1',
            // Include full item validations if updating items as well.
        ]);

        $purchase->update($validated);

        return response()->json($purchase->fresh(['supplier', 'items', 'payments']));
    }

    /**
     * Remove the specified purchase invoice.
     */
    public function destroy($id)
    {
        $purchase = PurchaseInvoice::findOrFail($id);
        $purchase->delete();
        return response()->noContent();
    }

    /**
     * Add a payment to a purchase invoice.
     */
    public function addPayment(Request $request, $id)
    {
        $validated = $request->validate([
            'amount'          => 'required|numeric|min:0.01',
            'payment_method'  => 'required|string',
            'payment_date'    => 'required|date',
            'reference'       => 'nullable|string',
            'notes'           => 'nullable|string',
            'bank_name'       => 'nullable|string',
            'account_number'  => 'nullable|string',
        ]);

        $purchase = PurchaseInvoice::findOrFail($id);
        $payment = $purchase->payments()->create([
            'company_id'       => $purchase->company_id,
            'amount'           => $validated['amount'],
            'payment_method'   => $validated['payment_method'],
            'transaction_date' => $validated['payment_date'],
            'reference_no'     => $validated['reference'] ?? null,
            'bank_name'        => $validated['bank_name'] ?? null,
            'account_number'   => $validated['account_number'] ?? null,
            'remarks'          => $validated['notes'] ?? null,
            'status'           => 'completed',
            'payment_direction'=> 'outward',
        ]);
        $totalPaid = $purchase->payments()->sum('amount');
        $purchase->update([
            'paid_amount'    => $totalPaid,
            'payment_status' => $totalPaid >= $purchase->grand_total ? 'Paid' : 'Partial',
        ]);
        return response()->json($payment, 201);
    }

    /**
     * Resolve or create a branch for the given company.
     */
    private function resolveBranch($companyId, $branchName = 'Main Branch')
    {
        $branch = Branch::where('company_id', $companyId)
            ->where('name', $branchName)
            ->first();

        if (!$branch) {
            $branch = Branch::create([
                'company_id' => $companyId,
                'name'       => $branchName,
                'is_active'  => true,
            ]);
        }

        return $branch;
    }

    /**
     * Resolve warehouse by ID, name, or create a default with branch.
     */
    private function resolveWarehouse($companyId, $branchId, $warehouseId = null, $warehouseName = 'Main Warehouse')
    {
        if ($warehouseId) {
            return Warehouse::findOrFail($warehouseId);
        }

        $warehouse = Warehouse::where('company_id', $companyId)
            ->where('branch_id', $branchId)
            ->where('name', $warehouseName)
            ->first();

        if (!$warehouse) {
            $warehouse = Warehouse::create([
                'company_id' => $companyId,
                'branch_id'  => $branchId,
                'name'       => $warehouseName,
                'is_active'  => true,
            ]);
        }

        return $warehouse;
    }
}