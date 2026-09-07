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
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class PurchaseInvoiceController extends Controller
{
    /**
     * List purchase invoices.
     */
    public function index(Request $request)
    {
        $query = PurchaseInvoice::with(['supplier', 'items', 'payments'])
            ->orderByDesc('created_at');

        if ($request->filled('company_id')) {
            $query->where('company_id', $request->integer('company_id'));
        }

        if ($request->filled('supplier_id')) {
            $query->where('supplier_id', $request->integer('supplier_id'));
        }

        if ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }

        $purchases = $query->paginate(
            min(max((int) $request->input('per_page', 15), 1), 100)
        );

        return response()->json([
            'success' => true,
            'data' => $purchases->items(),
            'meta' => [
                'current_page' => $purchases->currentPage(),
                'last_page' => $purchases->lastPage(),
                'total' => $purchases->total(),
                'per_page' => $purchases->perPage(),
            ],
        ]);
    }

    /**
     * Create purchase invoice.
     *
     * IMPORTANT:
     * - Calculates item discounts
     * - Calculates CGST/SGST/IGST
     * - Supports bill discount by percentage OR amount
     * - Supports bill discount before OR after tax
     * - Supports packing before OR after tax
     * - Supports additional charges
     * - Supports TCS
     * - Supports round off
     * - Saves payments inside the same DB transaction
     */
    public function store(Request $request)
    {
        Log::debug('Purchase invoice create request received', [
            'user_id' => Auth::id(),
            'ip' => $request->ip(),
            'path' => $request->path(),
            'method' => $request->method(),
            'content_type' => $request->header('Content-Type'),
            'purchase_number' => $request->input('purchase_number'),
        ]);

        $validated = $request->validate([
            'company_id' => [
                'required',
                'integer',
                'exists:companies,id',
            ],

            'supplier_id' => [
                'required',
                'integer',
                'exists:suppliers,id',
            ],

            'purchase_number' => [
                'required',
                'string',
                'max:100',
                'unique:purchase_invoices,purchase_number',
            ],

            'purchase_date' => [
                'required',
                'date',
            ],

            'due_date' => [
                'nullable',
                'date',
            ],

            'bill_number' => [
                'nullable',
                'string',
                'max:100',
            ],

            'reference_number' => [
                'nullable',
                'string',
                'max:100',
            ],

            'warehouse_id' => [
                'nullable',
                'integer',
                'exists:warehouses,id',
            ],

            'warehouse' => [
                'nullable',
                'string',
                'max:150',
            ],

            'branch' => [
                'nullable',
                'string',
                'max:150',
            ],

            'notes' => [
                'nullable',
                'string',
            ],

            'internal_remarks' => [
                'nullable',
                'string',
            ],

            'status' => [
                'sometimes',
                'in:draft,ordered,received,partially_received',
            ],

            /*
             * Bill discount
             */
            'general_discount_type' => [
                'nullable',
                'in:percent,amount',
            ],

            'general_discount_apply_type' => [
                'nullable',
                'in:before_tax,after_tax',
            ],

            'general_discount_percent' => [
                'nullable',
                'numeric',
                'min:0',
                'max:100',
            ],

            'general_discount_amount' => [
                'nullable',
                'numeric',
                'min:0',
            ],

            /*
             * Packing
             */
            'packing_charges' => [
                'nullable',
                'numeric',
                'min:0',
            ],

            'packing_apply_type' => [
                'nullable',
                'in:before_tax,after_tax',
            ],

            /*
             * TCS
             */
            'tcs_percent' => [
                'nullable',
                'numeric',
                'min:0',
                'max:100',
            ],

            /*
             * Existing compatible fields
             */
            'order_discount' => [
                'nullable',
                'numeric',
                'min:0',
            ],

            'shipping_charges' => [
                'nullable',
                'numeric',
                'min:0',
            ],

            'other_charges' => [
                'nullable',
                'numeric',
                'min:0',
            ],

            'round_off' => [
                'nullable',
                'numeric',
                'min:-100000',
                'max:100000',
            ],

            /*
             * Additional charges
             */
            'additional_charges' => [
                'nullable',
                'array',
            ],

            'additional_charges.*.label' => [
                'nullable',
                'string',
                'max:150',
            ],

            'additional_charges.*.amount' => [
                'nullable',
                'numeric',
                'min:0',
            ],

            /*
             * Items
             */
            'items' => [
                'required',
                'array',
                'min:1',
            ],

            'items.*.product_id' => [
                'nullable',
                'integer',
                'exists:products,id',
            ],

            'items.*.product_name' => [
                'required',
                'string',
                'max:255',
            ],

            'items.*.hsn_sac_code' => [
                'nullable',
                'string',
                'max:50',
            ],

            'items.*.unit' => [
                'required',
                'string',
                'max:50',
            ],

            'items.*.quantity' => [
                'required',
                'numeric',
                'min:0.01',
            ],

            'items.*.purchase_price' => [
                'required',
                'numeric',
                'min:0',
            ],

            'items.*.discount_type' => [
                'nullable',
                'in:percent,amount',
            ],

            'items.*.discount_percent' => [
                'nullable',
                'numeric',
                'min:0',
                'max:100',
            ],

            'items.*.discount_amount' => [
                'nullable',
                'numeric',
                'min:0',
            ],

            'items.*.gst_slab' => [
                'nullable',
                'numeric',
                'min:0',
                'max:100',
            ],

            'items.*.is_inter_state' => [
                'nullable',
                'boolean',
            ],

            'items.*.cgst_percent' => [
                'nullable',
                'numeric',
                'min:0',
                'max:100',
            ],

            'items.*.sgst_percent' => [
                'nullable',
                'numeric',
                'min:0',
                'max:100',
            ],

            'items.*.igst_percent' => [
                'nullable',
                'numeric',
                'min:0',
                'max:100',
            ],

            /*
             * Payments are now included in the invoice request.
             * This removes the separate /payments call from frontend.
             */
            'payments' => [
                'nullable',
                'array',
            ],

            'payments.*.amount' => [
                'required',
                'numeric',
                'min:0.01',
            ],

            'payments.*.payment_method' => [
                'required',
                'string',
                'max:50',
            ],

            'payments.*.transaction_date' => [
                'required',
                'date',
            ],

            'payments.*.reference_no' => [
                'nullable',
                'string',
                'max:150',
            ],

            'payments.*.payment_direction' => [
                'nullable',
                'in:inward,outward',
            ],

            'payments.*.bank_name' => [
                'nullable',
                'string',
                'max:150',
            ],

            'payments.*.account_number' => [
                'nullable',
                'string',
                'max:100',
            ],

            'payments.*.remarks' => [
                'nullable',
                'string',
            ],
        ]);

        /*
         * ---------------------------------------------------------
         * Resolve company branch
         * ---------------------------------------------------------
         */
        $branch = $this->resolveBranch(
            $validated['company_id'],
            $validated['branch'] ?? 'Main Branch'
        );

        /*
         * ---------------------------------------------------------
         * Resolve warehouse
         * ---------------------------------------------------------
         */
        $warehouse = $this->resolveWarehouse(
            $validated['company_id'],
            $branch->id,
            $validated['warehouse_id'] ?? null,
            $validated['warehouse'] ?? 'Main Warehouse'
        );

        /*
         * ---------------------------------------------------------
         * Prepare bill-level settings
         * ---------------------------------------------------------
         */
        $generalDiscountType = $validated['general_discount_type'] ?? 'percent';

        $generalDiscountApplyType =
            $validated['general_discount_apply_type'] ?? 'before_tax';

        $packingApplyType =
            $validated['packing_apply_type'] ?? 'after_tax';

        $generalDiscountPercent =
            (float) ($validated['general_discount_percent'] ?? 0);

        $generalDiscountEnteredAmount =
            (float) ($validated['general_discount_amount'] ?? 0);

        $packingCharges =
            (float) ($validated['packing_charges'] ?? 0);

        $tcsPercent =
            (float) ($validated['tcs_percent'] ?? 0);

        $shippingCharges =
            (float) ($validated['shipping_charges'] ?? 0);

        $roundOff =
            (float) ($validated['round_off'] ?? 0);

        /*
         * ---------------------------------------------------------
         * Process items
         * ---------------------------------------------------------
         */
        $subtotal = 0.0;
        $itemDiscountAmount = 0.0;
        $itemTaxAmount = 0.0;

        $itemCgstAmount = 0.0;
        $itemSgstAmount = 0.0;
        $itemIgstAmount = 0.0;

        $processedItems = [];

        foreach ($validated['items'] as $item) {
            $qty = (float) $item['quantity'];
            $price = (float) $item['purchase_price'];

            $baseAmount = round($qty * $price, 2);

            $discountType = $item['discount_type'] ?? 'percent';

            $discountPercent =
                (float) ($item['discount_percent'] ?? 0);

            $enteredDiscountAmount =
                (float) ($item['discount_amount'] ?? 0);

            if ($discountType === 'amount') {
                $discountAmount = min(
                    max($enteredDiscountAmount, 0),
                    $baseAmount
                );
            } else {
                $discountPercent = min(max($discountPercent, 0), 100);

                $discountAmount = round(
                    $baseAmount * ($discountPercent / 100),
                    2
                );
            }

            $taxableAmount = max(
                round($baseAmount - $discountAmount, 2),
                0
            );

            $gstSlab = min(
                max((float) ($item['gst_slab'] ?? 0), 0),
                100
            );

            $isInterState =
                (bool) ($item['is_inter_state'] ?? true);

            $cgstPercent = 0.0;
            $sgstPercent = 0.0;
            $igstPercent = 0.0;

            $cgstAmount = 0.0;
            $sgstAmount = 0.0;
            $igstAmount = 0.0;

            if ($gstSlab > 0) {
                if ($isInterState) {
                    $igstPercent = $gstSlab;

                    $igstAmount = round(
                        $taxableAmount * ($igstPercent / 100),
                        2
                    );
                } else {
                    $cgstPercent = $gstSlab / 2;
                    $sgstPercent = $gstSlab / 2;

                    $cgstAmount = round(
                        $taxableAmount * ($cgstPercent / 100),
                        2
                    );

                    $sgstAmount = round(
                        $taxableAmount * ($sgstPercent / 100),
                        2
                    );
                }
            }

            $lineTaxAmount = round(
                $cgstAmount + $sgstAmount + $igstAmount,
                2
            );

            $lineTotal = round(
                $taxableAmount + $lineTaxAmount,
                2
            );

            $subtotal += $baseAmount;
            $itemDiscountAmount += $discountAmount;
            $itemTaxAmount += $lineTaxAmount;

            $itemCgstAmount += $cgstAmount;
            $itemSgstAmount += $sgstAmount;
            $itemIgstAmount += $igstAmount;

            $processedItems[] = [
                'product_id' => !empty($item['product_id'])
                    ? (int) $item['product_id']
                    : null,

                'product_name' => $item['product_name'],

                'hsn_sac_code' =>
                    $item['hsn_sac_code'] ?? '',

                'unit' => $item['unit'],

                'quantity' => $qty,

                'purchase_price' => $price,

                'discount_type' => $discountType,

                'discount_percent' =>
                    $discountType === 'percent'
                        ? $discountPercent
                        : 0,

                'discount_amount' =>
                    $discountAmount,

                'gst_slab' => $gstSlab,

                'is_inter_state' => $isInterState,

                'cgst_percent' => $cgstPercent,

                'sgst_percent' => $sgstPercent,

                'igst_percent' => $igstPercent,

                'cgst_amount' => $cgstAmount,

                'sgst_amount' => $sgstAmount,

                'igst_amount' => $igstAmount,

                'total' => $lineTotal,
            ];
        }

        $subtotal = round($subtotal, 2);
        $itemDiscountAmount = round($itemDiscountAmount, 2);
        $itemTaxAmount = round($itemTaxAmount, 2);

        $itemTaxableTotal = max(
            round($subtotal - $itemDiscountAmount, 2),
            0
        );

        /*
         * ---------------------------------------------------------
         * Bill discount
         * ---------------------------------------------------------
         */
        if ($generalDiscountType === 'amount') {
            $billDiscount = min(
                max($generalDiscountEnteredAmount, 0),
                $itemTaxableTotal
            );
        } else {
            $billDiscount = round(
                $itemTaxableTotal * ($generalDiscountPercent / 100),
                2
            );

            $billDiscount = min(
                max($billDiscount, 0),
                $itemTaxableTotal
            );
        }

        /*
         * ---------------------------------------------------------
         * Tax after bill discount
         *
         * We proportionally reduce existing item tax. This matches
         * the frontend's effective-tax-rate calculation.
         * ---------------------------------------------------------
         */
        if ($generalDiscountApplyType === 'before_tax') {
            $discountedTaxable = max(
                round($itemTaxableTotal - $billDiscount, 2),
                0
            );

            if ($itemTaxableTotal > 0) {
                $taxFactor =
                    $discountedTaxable / $itemTaxableTotal;
            } else {
                $taxFactor = 0;
            }

            $taxAfterBillDiscount = round(
                $itemTaxAmount * $taxFactor,
                2
            );
        } else {
            $discountedTaxable = $itemTaxableTotal;
            $taxAfterBillDiscount = $itemTaxAmount;
        }

        /*
         * ---------------------------------------------------------
         * Packing tax
         * ---------------------------------------------------------
         */
        $effectiveTaxRate = 0.0;

        if ($itemTaxableTotal > 0) {
            $effectiveTaxRate =
                $itemTaxAmount / $itemTaxableTotal;
        }

        $packingTax = 0.0;

        if ($packingApplyType === 'before_tax' && $packingCharges > 0) {
            $packingTax = round(
                $packingCharges * $effectiveTaxRate,
                2
            );
        }

        $totalTaxWithPacking = round(
            $taxAfterBillDiscount + $packingTax,
            2
        );

        /*
         * ---------------------------------------------------------
         * Additional charges
         * ---------------------------------------------------------
         */
        $additionalCharges = $validated['additional_charges'] ?? [];

        $additionalChargesTotal = 0.0;

        foreach ($additionalCharges as $charge) {
            $additionalChargesTotal += max(
                (float) ($charge['amount'] ?? 0),
                0
            );
        }

        $additionalChargesTotal =
            round($additionalChargesTotal, 2);

        /*
         * ---------------------------------------------------------
         * Existing other charges from API, if supplied
         * ---------------------------------------------------------
         */
        $existingOtherCharges = max(
            (float) ($validated['other_charges'] ?? 0),
            0
        );

        $otherChargesTotal = round(
            $existingOtherCharges + $additionalChargesTotal,
            2
        );

        /*
         * ---------------------------------------------------------
         * Bill total
         * ---------------------------------------------------------
         *
         * Before-tax discount:
         *
         * taxable after bill discount
         * + tax
         * + packing
         * + shipping
         * + other/additional
         *
         * After-tax discount:
         *
         * original taxable
         * + tax
         * + packing
         * + shipping
         * + other/additional
         * - bill discount
         */
        $totalBeforeTcs = 0.0;

        $packingForTotal =
            $packingCharges;

        if ($generalDiscountApplyType === 'before_tax') {
            $totalBeforeTcs =
                $discountedTaxable
                + $totalTaxWithPacking
                + $packingForTotal
                + $shippingCharges
                + $otherChargesTotal;
        } else {
            $totalBeforeTcs =
                $itemTaxableTotal
                + $totalTaxWithPacking
                + $packingForTotal
                + $shippingCharges
                + $otherChargesTotal
                - $billDiscount;
        }

        $totalBeforeTcs = max(
            round($totalBeforeTcs, 2),
            0
        );

        /*
         * ---------------------------------------------------------
         * TCS
         * ---------------------------------------------------------
         */
        $tcsAmount = round(
            $totalBeforeTcs * ($tcsPercent / 100),
            2
        );

        /*
         * ---------------------------------------------------------
         * Grand total
         * ---------------------------------------------------------
         */
        $totalBeforeRoundOff = round(
            $totalBeforeTcs + $tcsAmount,
            2
        );

        $grandTotal = round(
            $totalBeforeRoundOff + $roundOff,
            2
        );

        $grandTotal = max($grandTotal, 0);

        /*
         * ---------------------------------------------------------
         * Payment total
         *
         * outward = paid to supplier
         * inward  = refund received from supplier
         *
         * net paid = outward - inward
         * ---------------------------------------------------------
         */
        $validatedPayments = $validated['payments'] ?? [];

        $totalOutward = 0.0;
        $totalInward = 0.0;

        foreach ($validatedPayments as $payment) {
            $amount = max(
                (float) $payment['amount'],
                0
            );

            if (($payment['payment_direction'] ?? 'outward') === 'inward') {
                $totalInward += $amount;
            } else {
                $totalOutward += $amount;
            }
        }

        $totalOutward = round($totalOutward, 2);
        $totalInward = round($totalInward, 2);

        $netPaidAmount = round(
            $totalOutward - $totalInward,
            2
        );

        /*
         * ---------------------------------------------------------
         * Database transaction
         * ---------------------------------------------------------
         */
        $purchase = DB::transaction(function () use (
            $validated,
            $branch,
            $warehouse,
            $subtotal,
            $itemDiscountAmount,
            $billDiscount,
            $totalTaxWithPacking,
            $shippingCharges,
            $packingCharges,
            $otherChargesTotal,
            $roundOff,
            $tcsAmount,
            $grandTotal,
            $processedItems,
            $validatedPayments,
            $netPaidAmount
        ) {
            $purchase = PurchaseInvoice::create([
                'company_id' => $validated['company_id'],
                'supplier_id' => $validated['supplier_id'],

                'purchase_number' =>
                    $validated['purchase_number'],

                /*
                 * bill_number was previously validated but your
                 * frontend currently sends purchase_number/invoice_no.
                 */
                'bill_number' =>
                    $validated['bill_number'] ?? null,

                'purchase_date' =>
                    $validated['purchase_date'],

                'due_date' =>
                    $validated['due_date'] ?? null,

                'reference_number' =>
                    $validated['reference_number'] ?? null,

                'warehouse_id' =>
                    $warehouse->id,

                'warehouse' =>
                    $warehouse->name,

                'branch_id' =>
                    $branch->id,

                'notes' =>
                    $validated['notes'] ?? null,

                'internal_remarks' =>
                    $validated['internal_remarks'] ?? null,

                'subtotal' =>
                    $subtotal,

                /*
                 * Save effective bill discount in the existing
                 * order_discount database field.
                 */
                'order_discount' =>
                    $billDiscount,

                'tax_amount' =>
                    $totalTaxWithPacking,

                'shipping_charges' =>
                    $shippingCharges,

                'packing_charges' =>
                    $packingCharges,

                /*
                 * Store additional charges in existing field.
                 * This avoids requiring an unknown DB column.
                 */
                'other_charges' =>
                    $otherChargesTotal,

                'round_off' =>
                    $roundOff,

                'grand_total' =>
                    $grandTotal,

                'status' =>
                    $validated['status'] ?? 'ordered',

                'payment_status' =>
                    $netPaidAmount >= $grandTotal
                        ? 'Paid'
                        : (
                            $netPaidAmount > 0
                                ? 'Partial'
                                : 'Unpaid'
                        ),

                'paid_amount' =>
                    $netPaidAmount,
            ]);

            /*
             * Save invoice items.
             */
            $purchase->items()->createMany(
                $processedItems
            );

            /*
             * -----------------------------------------------------
             * Stock processing
             * -----------------------------------------------------
             */
            foreach ($processedItems as $item) {
                if (empty($item['product_id'])) {
                    continue;
                }

                $product = Product::lockForUpdate()
                    ->find($item['product_id']);

                if (!$product) {
                    continue;
                }

                $quantity =
                    (float) $item['quantity'];

                $purchasePrice =
                    (float) $item['purchase_price'];

                $stockBefore =
                    (float) ($product->stock_quantity ?? 0);

                $stockAfter =
                    $stockBefore + $quantity;

                /*
                 * Update product stock.
                 */
                $product->stock_quantity =
                    $stockAfter;

                /*
                 * Update latest purchase price.
                 */
                $product->purchase_price =
                    $purchasePrice;

                $product->save();

                /*
                 * Stock movement.
                 */
                StockMovement::create([
                    'product_id' =>
                        $product->id,

                    'warehouse_id' =>
                        $warehouse->id,

                    'company_id' =>
                        $validated['company_id'],

                    'branch_id' =>
                        $branch->id,

                    'transaction_type' =>
                        'IN',

                    'reference_type' =>
                        'purchase',

                    'reference_id' =>
                        $purchase->id,

                    'quantity' =>
                        $quantity,

                    'unit_price' =>
                        $purchasePrice,

                    'stock_before' =>
                        $stockBefore,

                    'stock_after' =>
                        $stockAfter,

                    'remark' =>
                        'Purchase invoice #'
                        . $purchase->purchase_number,

                    'transaction_date' =>
                        $purchase->purchase_date,

                    'created_by' =>
                        Auth::id(),
                ]);

                /*
                 * Warehouse stock.
                 */
                $warehouseStock =
                    ProductWarehouseStock::firstOrNew([
                        'product_id' =>
                            $product->id,

                        'warehouse_id' =>
                            $warehouse->id,

                        'company_id' =>
                            $validated['company_id'],

                        'branch_id' =>
                            $branch->id,
                    ]);

                $warehouseStock->quantity =
                    (float) ($warehouseStock->quantity ?? 0)
                    + $quantity;

                $warehouseStock->available_quantity =
                    (float) ($warehouseStock->available_quantity ?? 0)
                    + $quantity;

                $warehouseStock->last_purchase_price =
                    $purchasePrice;

                $warehouseStock->save();

                /*
                 * Purchase price history.
                 */
                ProductPurchasePriceHistory::create([
                    'product_id' =>
                        $product->id,

                    'supplier_id' =>
                        $purchase->supplier_id,

                    'purchase_id' =>
                        $purchase->id,

                    'bill_number' =>
                        $purchase->bill_number
                        ?: $purchase->purchase_number,

                    'quantity' =>
                        $quantity,

                    'unit_price' =>
                        $purchasePrice,

                    'purchase_date' =>
                        $purchase->purchase_date,
                ]);
            }

            /*
             * -----------------------------------------------------
             * Payments
             *
             * IMPORTANT:
             * Payments are created inside the same transaction.
             * There is no second /payments request required.
             * -----------------------------------------------------
             */
            foreach ($validatedPayments as $payment) {
                $paymentAmount =
                    (float) $payment['amount'];

                $direction =
                    $payment['payment_direction'] ?? 'outward';

                $reference =
                    $payment['reference_no'] ?? null;

                $purchase->payments()->create([
                    'company_id' =>
                        $purchase->company_id,

                    'amount' =>
                        $paymentAmount,

                    'payment_method' =>
                        $payment['payment_method'],

                    'transaction_date' =>
                        $payment['transaction_date'],

                    'reference_no' =>
                        $reference,

                    'bank_name' =>
                        $payment['bank_name'] ?? null,

                    'account_number' =>
                        $payment['account_number'] ?? null,

                    'remarks' =>
                        $payment['remarks'] ?? null,

                    'status' =>
                        'completed',

                    'payment_direction' =>
                        $direction,
                ]);
            }

            /*
             * Log.
             */
            Log::info(
                'Purchase invoice created successfully',
                [
                    'purchase_id' =>
                        $purchase->id,

                    'purchase_number' =>
                        $purchase->purchase_number,

                    'supplier_id' =>
                        $purchase->supplier_id,

                    'grand_total' =>
                        $purchase->grand_total,

                    'paid_amount' =>
                        $purchase->paid_amount,
                ]
            );

            return $purchase;
        });

        $purchase->load([
            'supplier',
            'items.product',
            'payments',
        ]);

        return response()->json([
            'success' => true,
            'id' => $purchase->id,
            'purchase_id' => $purchase->id,
            'data' => $purchase,
            'message' =>
                'Purchase invoice created successfully',
        ], 201);
    }

    /**
     * Show purchase invoice.
     */
    public function show($id)
    {
        $purchase = PurchaseInvoice::with([
            'supplier',
            'items.product',
            'payments',
        ])->findOrFail($id);

        return response()->json([
            'success' => true,
            'data' => $purchase,
            'message' =>
                'Purchase invoice retrieved successfully',
        ]);
    }

    /**
     * Update purchase invoice.
     *
     * Kept conservative. Do not modify stock from this endpoint unless
     * a dedicated reverse/rebuild stock workflow is implemented.
     */
    public function update(Request $request, $id)
    {
        $purchase = PurchaseInvoice::findOrFail($id);

        $validated = $request->validate([
            'supplier_id' => [
                'sometimes',
                'exists:suppliers,id',
            ],

            'purchase_date' => [
                'sometimes',
                'date',
            ],

            'due_date' => [
                'nullable',
                'date',
            ],

            'warehouse_id' => [
                'nullable',
                'exists:warehouses,id',
            ],

            'notes' => [
                'nullable',
                'string',
            ],

            'internal_remarks' => [
                'nullable',
                'string',
            ],

            'status' => [
                'sometimes',
                'in:draft,ordered,received,partially_received',
            ],
        ]);

        $purchase->update($validated);

        $updated = $purchase->fresh([
            'supplier',
            'items.product',
            'payments',
        ]);

        return response()->json([
            'success' => true,
            'data' => $updated,
            'message' =>
                'Purchase invoice updated successfully',
        ]);
    }

    /**
     * Delete purchase invoice.
     */
    public function destroy($id)
    {
        $purchase = PurchaseInvoice::findOrFail($id);

        DB::transaction(function () use ($purchase) {
            /*
             * Do not silently leave stock incorrect.
             * The current endpoint only deletes the document.
             * A proper reversal workflow should be used for
             * production stock accounting.
             */
            $purchase->delete();
        });

        return response()->json([
            'success' => true,
            'message' =>
                'Purchase invoice deleted successfully',
        ]);
    }

    /**
     * Add payment to an existing purchase.
     */
    public function addPayment(Request $request, $id)
    {
        $validated = $request->validate([
            'amount' => [
                'required',
                'numeric',
                'min:0.01',
            ],

            'payment_method' => [
                'required',
                'string',
                'max:50',
            ],

            'payment_date' => [
                'required',
                'date',
            ],

            'reference' => [
                'nullable',
                'string',
                'max:150',
            ],

            'notes' => [
                'nullable',
                'string',
            ],

            'bank_name' => [
                'nullable',
                'string',
                'max:150',
            ],

            'account_number' => [
                'nullable',
                'string',
                'max:100',
            ],
        ]);

        $result = DB::transaction(function () use (
            $validated,
            $id
        ) {
            $purchase = PurchaseInvoice::lockForUpdate()
                ->findOrFail($id);

            $payment =
                $purchase->payments()->create([
                    'company_id' =>
                        $purchase->company_id,

                    'amount' =>
                        $validated['amount'],

                    'payment_method' =>
                        $validated['payment_method'],

                    'transaction_date' =>
                        $validated['payment_date'],

                    'reference_no' =>
                        $validated['reference'] ?? null,

                    'bank_name' =>
                        $validated['bank_name'] ?? null,

                    'account_number' =>
                        $validated['account_number'] ?? null,

                    'remarks' =>
                        $validated['notes'] ?? null,

                    'status' =>
                        'completed',

                    'payment_direction' =>
                        'outward',
                ]);

            $outward =
                (float) $purchase->payments()
                    ->where(
                        'payment_direction',
                        'outward'
                    )
                    ->sum('amount');

            $inward =
                (float) $purchase->payments()
                    ->where(
                        'payment_direction',
                        'inward'
                    )
                    ->sum('amount');

            $totalPaid =
                round($outward - $inward, 2);

            $paymentStatus =
                $totalPaid >= (float) $purchase->grand_total
                    ? 'Paid'
                    : (
                        $totalPaid > 0
                            ? 'Partial'
                            : 'Unpaid'
                    );

            $purchase->update([
                'paid_amount' =>
                    $totalPaid,

                'payment_status' =>
                    $paymentStatus,
            ]);

            return [
                'purchase' =>
                    $purchase->fresh([
                        'supplier',
                        'items.product',
                        'payments',
                    ]),

                'payment' =>
                    $payment,
            ];
        });

        return response()->json([
            'success' => true,
            'data' => $result['purchase'],
            'payment' => $result['payment'],
            'message' =>
                'Payment added successfully',
        ], 201);
    }

    /**
     * Resolve/create default branch.
     */
    private function resolveBranch(
        int $companyId,
        string $branchName = 'Main Branch'
    ): Branch {
        $branch = Branch::where(
            'company_id',
            $companyId
        )
            ->where('name', $branchName)
            ->first();

        if (!$branch) {
            $branch = Branch::create([
                'company_id' =>
                    $companyId,

                'name' =>
                    $branchName,

                'is_active' =>
                    true,
            ]);
        }

        return $branch;
    }

    /**
     * Resolve/create default warehouse.
     */
    private function resolveWarehouse(
        int $companyId,
        int $branchId,
        ?int $warehouseId = null,
        string $warehouseName = 'Main Warehouse'
    ): Warehouse {
        if ($warehouseId) {
            $warehouse = Warehouse::where('id', $warehouseId)
                ->where('company_id', $companyId)
                ->where('branch_id', $branchId)
                ->first();

            if (!$warehouse) {
                throw ValidationException::withMessages([
                    'warehouse_id' =>
                        'Selected warehouse does not belong to the selected company and branch.',
                ]);
            }

            return $warehouse;
        }

        $warehouse = Warehouse::where(
            'company_id',
            $companyId
        )
            ->where('branch_id', $branchId)
            ->where('name', $warehouseName)
            ->first();

        if (!$warehouse) {
            $warehouse = Warehouse::create([
                'company_id' =>
                    $companyId,

                'branch_id' =>
                    $branchId,

                'name' =>
                    $warehouseName,

                'is_active' =>
                    true,
            ]);
        }

        return $warehouse;
    }
}