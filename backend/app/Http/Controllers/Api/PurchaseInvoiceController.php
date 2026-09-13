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
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class PurchaseInvoiceController extends Controller
{
    /** Cached optional-column map (per request). */
    private ?array $existingColumnsCache = null;

    private function existingPurchaseInvoiceColumns(): array
    {
        if ($this->existingColumnsCache !== null) {
            return $this->existingColumnsCache;
        }

        $optionalColumns = [
            'warehouse_id',
            'branch_id',
            'packing_apply_type',
            'general_discount_type',
            'general_discount_percent',
            'general_discount_amount',
            'general_discount_apply_type',
            'tcs_percent',
        ];

        $map = [];
        foreach ($optionalColumns as $col) {
            $map[$col] = Schema::hasColumn('purchase_invoices', $col);
        }

        $this->existingColumnsCache = $map;
        return $map;
    }

    /**
     * Returns true when the given purchase_number is already used by a LIVE
     * (non-soft-deleted) purchase invoice.
     *
     * Eloquent's SoftDeletes global scope automatically excludes trashed rows
     * (assuming the PurchaseInvoice model uses the SoftDeletes trait), so
     * deleted rows never block a re-use from the app layer.
     */
    private function purchaseNumberIsTaken(string $purchaseNumber, ?int $excludeId = null): bool
    {
        $query = PurchaseInvoice::query()->where('purchase_number', $purchaseNumber);

        if ($excludeId !== null) {
            $query->where('id', '!=', $excludeId);
        }

        return $query->exists();
    }

    /**
     * Validation rule for FK columns that live in tables that may have a
     * `deleted_at` column. Prevents attaching soft-deleted rows.
     */
    private function existsLive(string $table, string $column = 'id'): Rule
    {
        $rule = Rule::exists($table, $column);

        if (Schema::hasColumn($table, 'deleted_at')) {
            $rule->whereNull('deleted_at');
        }

        return $rule;
    }

    /**
     * Convert a duplicate-key QueryException into a ValidationException so
     * the API returns 422 instead of 500. This is essential when the DB has a
     * plain UNIQUE index on purchase_number but the row is soft-deleted — the
     * app-level check passes, but the DB-level insert still fails.
     */
    private function convertDuplicateKeyException(
        QueryException $e,
        string $field,
        string $message
    ): void {
        $sqlState = (string) $e->getCode();
        $msg      = $e->getMessage();

        $isDuplicate =
            $sqlState === '23000' ||
            str_contains($msg, 'Duplicate entry') ||
            str_contains($msg, 'UNIQUE constraint failed') ||
            str_contains($msg, 'duplicate key value');

        if ($isDuplicate) {
            throw ValidationException::withMessages([
                $field => $message,
            ]);
        }

        // Not a duplicate-key error → re-throw the original
        throw $e;
    }

    public function index(Request $request)
    {
        $query = PurchaseInvoice::with(['supplier', 'items', 'payments'])
            ->orderByDesc('created_at');

        if ($request->filled('company_id')) {
            $query->where('company_id', $request->integer('company_id'));
        }

        if ($request->filled('branch_id')) {
            $query->where('branch_id', $request->integer('branch_id'));
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
            'data'    => $purchases->items(),
            'meta'    => [
                'current_page' => $purchases->currentPage(),
                'last_page'    => $purchases->lastPage(),
                'total'        => $purchases->total(),
                'per_page'     => $purchases->perPage(),
            ],
        ]);
    }

    public function store(Request $request)
    {
        Log::debug('Purchase invoice create request received', [
            'user_id'         => Auth::id(),
            'ip'              => $request->ip(),
            'path'            => $request->path(),
            'method'          => $request->method(),
            'content_type'    => $request->header('Content-Type'),
            'purchase_number' => $request->input('purchase_number'),
        ]);

        $validated = $request->validate([
            'company_id'  => ['required', 'integer', $this->existsLive('companies')],
            'supplier_id' => ['required', 'integer', $this->existsLive('suppliers')],

            // SoftDeletes-aware uniqueness (deleted numbers can be reused).
            'purchase_number' => [
                'required', 'string', 'max:100',
                function ($attribute, $value, $fail) {
                    if ($this->purchaseNumberIsTaken((string) $value)) {
                        $fail('The purchase number has already been taken.');
                    }
                },
            ],

            'purchase_date' => ['required', 'date'],
            'due_date'      => ['nullable', 'date', 'after_or_equal:purchase_date'],

            'bill_number'      => ['nullable', 'string', 'max:100'],
            'reference_number' => ['nullable', 'string', 'max:100'],

            'warehouse_id' => ['nullable', 'integer', $this->existsLive('warehouses')],
            'warehouse'    => ['nullable', 'string', 'max:150'],
            'branch'       => ['nullable', 'string', 'max:150'],

            'notes'            => ['nullable', 'string'],
            'internal_remarks' => ['nullable', 'string'],

            'status' => ['sometimes', 'in:draft,ordered,received,partially_received'],

            'general_discount_type'       => ['nullable', 'in:percent,amount'],
            'general_discount_apply_type' => ['nullable', 'in:before_tax,after_tax'],
            'general_discount_percent'    => ['nullable', 'numeric', 'min:0', 'max:100'],
            'general_discount_amount'     => ['nullable', 'numeric', 'min:0'],

            'packing_charges'    => ['nullable', 'numeric', 'min:0'],
            'packing_apply_type' => ['nullable', 'in:before_tax,after_tax'],

            'tcs_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],

            'order_discount'   => ['nullable', 'numeric', 'min:0'],
            'shipping_charges' => ['nullable', 'numeric', 'min:0'],
            'other_charges'    => ['nullable', 'numeric', 'min:0'],
            'round_off'        => ['nullable', 'numeric', 'min:-100000', 'max:100000'],

            'additional_charges'          => ['nullable', 'array'],
            'additional_charges.*.label'  => ['nullable', 'string', 'max:150'],
            'additional_charges.*.amount' => ['nullable', 'numeric', 'min:0'],

            'items'                    => ['required', 'array', 'min:1'],
            'items.*.product_id'       => ['nullable', 'integer', $this->existsLive('products')],
            'items.*.product_name'     => ['required', 'string', 'max:255'],
            'items.*.hsn_sac_code'     => ['nullable', 'string', 'max:50'],
            'items.*.unit'             => ['required', 'string', 'max:50'],
            'items.*.quantity'         => ['required', 'numeric', 'min:0.01'],
            'items.*.purchase_price'   => ['required', 'numeric', 'min:0'],
            'items.*.discount_type'    => ['nullable', 'in:percent,amount'],
            'items.*.discount_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'items.*.discount_amount'  => ['nullable', 'numeric', 'min:0'],
            'items.*.gst_slab'         => ['nullable', 'numeric', 'min:0', 'max:100'],
            'items.*.is_inter_state'   => ['nullable', 'boolean'],
            'items.*.cgst_percent'     => ['nullable', 'numeric', 'min:0', 'max:100'],
            'items.*.sgst_percent'     => ['nullable', 'numeric', 'min:0', 'max:100'],
            'items.*.igst_percent'     => ['nullable', 'numeric', 'min:0', 'max:100'],

            'payments'                     => ['nullable', 'array'],
            'payments.*.amount'            => ['required', 'numeric', 'min:0.01'],
            'payments.*.payment_method'    => ['required', 'string', 'max:50'],
            'payments.*.transaction_date'  => ['required', 'date'],
            'payments.*.reference_no'      => ['nullable', 'string', 'max:150'],
            'payments.*.payment_direction' => ['nullable', 'in:inward,outward'],
            'payments.*.bank_name'         => ['nullable', 'string', 'max:150'],
            'payments.*.account_number'    => ['nullable', 'string', 'max:100'],
            'payments.*.remarks'           => ['nullable', 'string'],
        ]);

        $branch = $this->resolveBranch(
            $validated['company_id'],
            $validated['branch'] ?? 'Main Branch'
        );

        $warehouse = $this->resolveWarehouse(
            $validated['company_id'],
            $branch->id,
            $validated['warehouse_id'] ?? null,
            $validated['warehouse'] ?? 'Main Warehouse'
        );

        $generalDiscountType       = $validated['general_discount_type'] ?? 'percent';
        $generalDiscountApplyType  = $validated['general_discount_apply_type'] ?? 'before_tax';
        $packingApplyType          = $validated['packing_apply_type'] ?? 'after_tax';
        $generalDiscountPercent    = (float) ($validated['general_discount_percent'] ?? 0);
        $generalDiscountEnteredAmt = (float) ($validated['general_discount_amount'] ?? 0);
        $packingCharges            = (float) ($validated['packing_charges'] ?? 0);
        $tcsPercent                = (float) ($validated['tcs_percent'] ?? 0);
        $shippingCharges           = (float) ($validated['shipping_charges'] ?? 0);
        $roundOff                  = (float) ($validated['round_off'] ?? 0);

        $subtotal           = 0.0;
        $itemDiscountAmount = 0.0;
        $itemTaxAmount      = 0.0;
        $processedItems     = [];

        foreach ($validated['items'] as $item) {
            $qty        = (float) $item['quantity'];
            $price      = (float) $item['purchase_price'];
            $baseAmount = round($qty * $price, 2);

            $discountType          = $item['discount_type'] ?? 'percent';
            $discountPercent       = (float) ($item['discount_percent'] ?? 0);
            $enteredDiscountAmount = (float) ($item['discount_amount'] ?? 0);

            if ($discountType === 'amount') {
                $discountAmount = min(max($enteredDiscountAmount, 0), $baseAmount);
            } else {
                $discountPercent = min(max($discountPercent, 0), 100);
                $discountAmount  = round($baseAmount * ($discountPercent / 100), 2);
            }

            $taxableAmount = max(round($baseAmount - $discountAmount, 2), 0);
            $gstSlab       = min(max((float) ($item['gst_slab'] ?? 0), 0), 100);
            $isInterState  = (bool) ($item['is_inter_state'] ?? true);

            $cgstPercent = 0.0; $sgstPercent = 0.0; $igstPercent = 0.0;
            $cgstAmount  = 0.0; $sgstAmount  = 0.0; $igstAmount  = 0.0;

            if ($gstSlab > 0) {
                if ($isInterState) {
                    $igstPercent = $gstSlab;
                    $igstAmount  = round($taxableAmount * ($igstPercent / 100), 2);
                } else {
                    $cgstPercent = $gstSlab / 2;
                    $sgstPercent = $gstSlab / 2;
                    $cgstAmount  = round($taxableAmount * ($cgstPercent / 100), 2);
                    $sgstAmount  = round($taxableAmount * ($sgstPercent / 100), 2);
                }
            }

            $lineTaxAmount = round($cgstAmount + $sgstAmount + $igstAmount, 2);
            $lineTotal     = round($taxableAmount + $lineTaxAmount, 2);

            $subtotal           += $baseAmount;
            $itemDiscountAmount += $discountAmount;
            $itemTaxAmount      += $lineTaxAmount;

            $processedItems[] = [
                'product_id'       => !empty($item['product_id']) ? (int) $item['product_id'] : null,
                'product_name'     => $item['product_name'],
                'hsn_sac_code'     => $item['hsn_sac_code'] ?? '',
                'unit'             => $item['unit'],
                'quantity'         => $qty,
                'purchase_price'   => $price,
                'discount_type'    => $discountType,
                'discount_percent' => $discountType === 'percent' ? $discountPercent : 0,
                'discount_amount'  => $discountAmount,
                'gst_slab'         => $gstSlab,
                'is_inter_state'   => $isInterState,
                'cgst_percent'     => $cgstPercent,
                'sgst_percent'     => $sgstPercent,
                'igst_percent'     => $igstPercent,
                'cgst_amount'      => $cgstAmount,
                'sgst_amount'      => $sgstAmount,
                'igst_amount'      => $igstAmount,
                'total'            => $lineTotal,
            ];
        }

        $subtotal           = round($subtotal, 2);
        $itemDiscountAmount = round($itemDiscountAmount, 2);
        $itemTaxAmount      = round($itemTaxAmount, 2);
        $itemTaxableTotal   = max(round($subtotal - $itemDiscountAmount, 2), 0);

        if ($generalDiscountType === 'amount') {
            $billDiscount = min(max($generalDiscountEnteredAmt, 0), $itemTaxableTotal);
        } else {
            $billDiscount = round($itemTaxableTotal * ($generalDiscountPercent / 100), 2);
            $billDiscount = min(max($billDiscount, 0), $itemTaxableTotal);
        }

        if ($generalDiscountApplyType === 'before_tax') {
            $discountedTaxable = max(round($itemTaxableTotal - $billDiscount, 2), 0);
            $taxFactor         = $itemTaxableTotal > 0 ? $discountedTaxable / $itemTaxableTotal : 0;
            $taxAfterBillDiscount = round($itemTaxAmount * $taxFactor, 2);
        } else {
            $discountedTaxable    = $itemTaxableTotal;
            $taxAfterBillDiscount = $itemTaxAmount;
        }

        $effectiveTaxRate = $itemTaxableTotal > 0 ? $itemTaxAmount / $itemTaxableTotal : 0;
        $packingTax       = 0.0;
        if ($packingApplyType === 'before_tax' && $packingCharges > 0) {
            $packingTax = round($packingCharges * $effectiveTaxRate, 2);
        }

        $totalTaxWithPacking = round($taxAfterBillDiscount + $packingTax, 2);

        $additionalCharges      = $validated['additional_charges'] ?? [];
        $additionalChargesTotal = 0.0;
        foreach ($additionalCharges as $charge) {
            $additionalChargesTotal += max((float) ($charge['amount'] ?? 0), 0);
        }
        $additionalChargesTotal = round($additionalChargesTotal, 2);

        $existingOtherCharges = max((float) ($validated['other_charges'] ?? 0), 0);
        $otherChargesTotal    = round($existingOtherCharges + $additionalChargesTotal, 2);

        if ($generalDiscountApplyType === 'before_tax') {
            $totalBeforeTcs = $discountedTaxable
                + $totalTaxWithPacking
                + $packingCharges
                + $shippingCharges
                + $otherChargesTotal;
        } else {
            $totalBeforeTcs = $itemTaxableTotal
                + $totalTaxWithPacking
                + $packingCharges
                + $shippingCharges
                + $otherChargesTotal
                - $billDiscount;
        }
        $totalBeforeTcs = max(round($totalBeforeTcs, 2), 0);

        $tcsAmount           = round($totalBeforeTcs * ($tcsPercent / 100), 2);
        $totalBeforeRoundOff = round($totalBeforeTcs + $tcsAmount, 2);
        $grandTotal          = max(round($totalBeforeRoundOff + $roundOff, 2), 0);

        $validatedPayments = $validated['payments'] ?? [];
        $totalOutward      = 0.0;
        $totalInward       = 0.0;

        foreach ($validatedPayments as $payment) {
            $amount = max((float) $payment['amount'], 0);
            if (($payment['payment_direction'] ?? 'outward') === 'inward') {
                $totalInward += $amount;
            } else {
                $totalOutward += $amount;
            }
        }

        $totalOutward  = round($totalOutward, 2);
        $totalInward   = round($totalInward, 2);
        $netPaidAmount = round($totalOutward - $totalInward, 2);

        $existingColumns = $this->existingPurchaseInvoiceColumns();

        try {
            $purchase = DB::transaction(function () use (
                $validated,
                $branch,
                $warehouse,
                $subtotal,
                $billDiscount,
                $totalTaxWithPacking,
                $shippingCharges,
                $packingCharges,
                $otherChargesTotal,
                $roundOff,
                $grandTotal,
                $processedItems,
                $validatedPayments,
                $netPaidAmount,
                $generalDiscountType,
                $generalDiscountPercent,
                $generalDiscountEnteredAmt,
                $generalDiscountApplyType,
                $packingApplyType,
                $tcsPercent,
                $existingColumns
            ) {
                $attributes = [
                    'company_id'        => $validated['company_id'],
                    'supplier_id'       => $validated['supplier_id'],
                    'purchase_number'   => $validated['purchase_number'],
                    'bill_number'       => $validated['bill_number'] ?? null,
                    'purchase_date'     => $validated['purchase_date'],
                    'due_date'          => $validated['due_date'] ?? null,
                    'reference_number'  => $validated['reference_number'] ?? null,
                    'warehouse'         => $warehouse->name,
                    'notes'             => $validated['notes'] ?? null,
                    'internal_remarks'  => $validated['internal_remarks'] ?? null,
                    'subtotal'          => $subtotal,
                    'order_discount'    => $billDiscount,
                    'tax_amount'        => $totalTaxWithPacking,
                    'shipping_charges'  => $shippingCharges,
                    'packing_charges'   => $packingCharges,
                    'other_charges'     => $otherChargesTotal,
                    'round_off'         => $roundOff,
                    'grand_total'       => $grandTotal,
                    'status'            => $validated['status'] ?? 'ordered',
                    'payment_status'    => $netPaidAmount >= $grandTotal ? 'Paid' : ($netPaidAmount > 0 ? 'Partial' : 'Unpaid'),
                    'paid_amount'       => $netPaidAmount,
                ];

                foreach ([
                    'warehouse_id'                => $warehouse->id,
                    'branch_id'                   => $branch->id,
                    'packing_apply_type'          => $packingApplyType,
                    'general_discount_type'       => $generalDiscountType,
                    'general_discount_percent'    => $generalDiscountType === 'percent' ? $generalDiscountPercent : 0,
                    'general_discount_amount'     => $generalDiscountType === 'amount' ? $generalDiscountEnteredAmt : 0,
                    'general_discount_apply_type' => $generalDiscountApplyType,
                    'tcs_percent'                 => $tcsPercent,
                ] as $col => $val) {
                    if (!empty($existingColumns[$col])) {
                        $attributes[$col] = $val;
                    }
                }

                $purchase = PurchaseInvoice::create($attributes);

                $purchase->items()->createMany($processedItems);

                foreach ($processedItems as $item) {
                    if (empty($item['product_id'])) continue;

                    $product = Product::lockForUpdate()->find($item['product_id']);
                    if (!$product) continue;

                    $quantity      = (float) $item['quantity'];
                    $purchasePrice = (float) $item['purchase_price'];
                    $stockBefore   = (float) ($product->stock_quantity ?? 0);
                    $stockAfter    = $stockBefore + $quantity;

                    $product->stock_quantity = $stockAfter;
                    $product->purchase_price = $purchasePrice;
                    $product->save();

                    StockMovement::create([
                        'product_id'       => $product->id,
                        'warehouse_id'     => $warehouse->id,
                        'company_id'       => $validated['company_id'],
                        'branch_id'        => $branch->id,
                        'transaction_type' => 'IN',
                        'reference_type'   => 'purchase',
                        'reference_id'     => $purchase->id,
                        'quantity'         => $quantity,
                        'unit_price'       => $purchasePrice,
                        'stock_before'     => $stockBefore,
                        'stock_after'      => $stockAfter,
                        'remark'           => 'Purchase invoice #' . $purchase->purchase_number,
                        'transaction_date' => $purchase->purchase_date,
                        'created_by'       => Auth::id(),
                    ]);

                    $warehouseStock = ProductWarehouseStock::firstOrNew([
                        'product_id'   => $product->id,
                        'warehouse_id' => $warehouse->id,
                        'company_id'   => $validated['company_id'],
                        'branch_id'    => $branch->id,
                    ]);
                    $warehouseStock->quantity            = (float) ($warehouseStock->quantity ?? 0) + $quantity;
                    $warehouseStock->available_quantity  = (float) ($warehouseStock->available_quantity ?? 0) + $quantity;
                    $warehouseStock->last_purchase_price = $purchasePrice;
                    $warehouseStock->save();

                    ProductPurchasePriceHistory::create([
                        'product_id'    => $product->id,
                        'supplier_id'   => $purchase->supplier_id,
                        'purchase_id'   => $purchase->id,
                        'bill_number'   => $purchase->bill_number ?: $purchase->purchase_number,
                        'quantity'      => $quantity,
                        'unit_price'    => $purchasePrice,
                        'purchase_date' => $purchase->purchase_date,
                    ]);
                }

                foreach ($validatedPayments as $payment) {
                    $purchase->payments()->create([
                        'company_id'        => $purchase->company_id,
                        'amount'            => (float) $payment['amount'],
                        'payment_method'    => $payment['payment_method'],
                        'transaction_date'  => $payment['transaction_date'],
                        'reference_no'      => $payment['reference_no'] ?? null,
                        'bank_name'         => $payment['bank_name'] ?? null,
                        'account_number'    => $payment['account_number'] ?? null,
                        'remarks'           => $payment['remarks'] ?? null,
                        'status'            => 'completed',
                        'payment_direction' => $payment['payment_direction'] ?? 'outward',
                    ]);
                }

                Log::info('Purchase invoice created successfully', [
                    'purchase_id'     => $purchase->id,
                    'purchase_number' => $purchase->purchase_number,
                    'supplier_id'     => $purchase->supplier_id,
                    'grand_total'     => $purchase->grand_total,
                    'paid_amount'     => $purchase->paid_amount,
                ]);

                return $purchase;
            });
        } catch (QueryException $e) {
            // Convert DB-level duplicate errors (e.g. plain UNIQUE index that
            // also covers soft-deleted rows) into friendly validation errors.
            $this->convertDuplicateKeyException(
                $e,
                'purchase_number',
                'The purchase number has already been taken.'
            );
        }

        $purchase->load(['supplier', 'items.product', 'payments']);

        return response()->json([
            'success'     => true,
            'id'          => $purchase->id,
            'purchase_id' => $purchase->id,
            'data'        => $purchase,
            'message'     => 'Purchase invoice created successfully',
        ], 201);
    }

    public function show($id)
    {
        $purchase = PurchaseInvoice::with([
            'supplier',
            'items.product',
            'payments',
        ])->findOrFail($id);

        return response()->json([
            'success' => true,
            'data'    => $purchase,
            'message' => 'Purchase invoice retrieved successfully',
        ]);
    }

    public function update(Request $request, $id)
    {
        $purchase = PurchaseInvoice::with(['items', 'payments'])->findOrFail($id);

        Log::debug('Purchase invoice update request', [
            'user_id'     => Auth::id(),
            'purchase_id' => $purchase->id,
        ]);

        $validated = $request->validate([
            'company_id'  => ['required', 'integer', $this->existsLive('companies')],
            'supplier_id' => ['required', 'integer', $this->existsLive('suppliers')],

            'purchase_number' => [
                'required', 'string', 'max:100',
                function ($attribute, $value, $fail) use ($purchase) {
                    if ($this->purchaseNumberIsTaken((string) $value, (int) $purchase->id)) {
                        $fail('The purchase number has already been taken.');
                    }
                },
            ],

            'purchase_date' => ['required', 'date'],
            'due_date'      => ['nullable', 'date', 'after_or_equal:purchase_date'],

            'bill_number'      => ['nullable', 'string', 'max:100'],
            'reference_number' => ['nullable', 'string', 'max:100'],

            'warehouse_id' => ['nullable', 'integer', $this->existsLive('warehouses')],
            'warehouse'    => ['nullable', 'string', 'max:150'],
            'branch'       => ['nullable', 'string', 'max:150'],

            'notes'            => ['nullable', 'string'],
            'internal_remarks' => ['nullable', 'string'],

            'status' => ['sometimes', 'in:draft,ordered,received,partially_received'],

            'general_discount_type'       => ['nullable', 'in:percent,amount'],
            'general_discount_apply_type' => ['nullable', 'in:before_tax,after_tax'],
            'general_discount_percent'    => ['nullable', 'numeric', 'min:0', 'max:100'],
            'general_discount_amount'     => ['nullable', 'numeric', 'min:0'],

            'packing_charges'    => ['nullable', 'numeric', 'min:0'],
            'packing_apply_type' => ['nullable', 'in:before_tax,after_tax'],

            'tcs_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],

            'shipping_charges' => ['nullable', 'numeric', 'min:0'],
            'other_charges'    => ['nullable', 'numeric', 'min:0'],
            'round_off'        => ['nullable', 'numeric', 'min:-100000', 'max:100000'],

            'additional_charges'          => ['nullable', 'array'],
            'additional_charges.*.label'  => ['nullable', 'string', 'max:150'],
            'additional_charges.*.amount' => ['nullable', 'numeric', 'min:0'],

            'items'                    => ['required', 'array', 'min:1'],
            'items.*.product_id'       => ['nullable', 'integer', $this->existsLive('products')],
            'items.*.product_name'     => ['required', 'string', 'max:255'],
            'items.*.hsn_sac_code'     => ['nullable', 'string', 'max:50'],
            'items.*.unit'             => ['required', 'string', 'max:50'],
            'items.*.quantity'         => ['required', 'numeric', 'min:0.01'],
            'items.*.purchase_price'   => ['required', 'numeric', 'min:0'],
            'items.*.discount_type'    => ['nullable', 'in:percent,amount'],
            'items.*.discount_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'items.*.discount_amount'  => ['nullable', 'numeric', 'min:0'],
            'items.*.gst_slab'         => ['nullable', 'numeric', 'min:0', 'max:100'],
            'items.*.is_inter_state'   => ['nullable', 'boolean'],

            'payments'                     => ['nullable', 'array'],
            'payments.*.amount'            => ['required', 'numeric', 'min:0.01'],
            'payments.*.payment_method'    => ['required', 'string', 'max:50'],
            'payments.*.transaction_date'  => ['required', 'date'],
            'payments.*.reference_no'      => ['nullable', 'string', 'max:150'],
            'payments.*.payment_direction' => ['nullable', 'in:inward,outward'],
            'payments.*.bank_name'         => ['nullable', 'string', 'max:150'],
            'payments.*.account_number'    => ['nullable', 'string', 'max:100'],
            'payments.*.remarks'           => ['nullable', 'string'],
        ]);

        $branch = $this->resolveBranch(
            $validated['company_id'],
            $validated['branch'] ?? 'Main Branch'
        );

        $warehouse = $this->resolveWarehouse(
            $validated['company_id'],
            $branch->id,
            $validated['warehouse_id'] ?? null,
            $validated['warehouse'] ?? 'Main Warehouse'
        );

        $generalDiscountType       = $validated['general_discount_type'] ?? 'percent';
        $generalDiscountApplyType  = $validated['general_discount_apply_type'] ?? 'before_tax';
        $packingApplyType          = $validated['packing_apply_type'] ?? 'after_tax';
        $generalDiscountPercent    = (float) ($validated['general_discount_percent'] ?? 0);
        $generalDiscountEnteredAmt = (float) ($validated['general_discount_amount'] ?? 0);
        $packingCharges            = (float) ($validated['packing_charges'] ?? 0);
        $tcsPercent                = (float) ($validated['tcs_percent'] ?? 0);
        $shippingCharges           = (float) ($validated['shipping_charges'] ?? 0);
        $roundOff                  = (float) ($validated['round_off'] ?? 0);

        $subtotal           = 0.0;
        $itemDiscountAmount = 0.0;
        $itemTaxAmount      = 0.0;
        $processedItems     = [];

        foreach ($validated['items'] as $item) {
            $qty        = (float) $item['quantity'];
            $price      = (float) $item['purchase_price'];
            $baseAmount = round($qty * $price, 2);

            $discountType          = $item['discount_type'] ?? 'percent';
            $discountPercent       = (float) ($item['discount_percent'] ?? 0);
            $enteredDiscountAmount = (float) ($item['discount_amount'] ?? 0);

            if ($discountType === 'amount') {
                $discountAmount = min(max($enteredDiscountAmount, 0), $baseAmount);
            } else {
                $discountPercent = min(max($discountPercent, 0), 100);
                $discountAmount  = round($baseAmount * ($discountPercent / 100), 2);
            }

            $taxableAmount = max(round($baseAmount - $discountAmount, 2), 0);
            $gstSlab       = min(max((float) ($item['gst_slab'] ?? 0), 0), 100);
            $isInterState  = (bool) ($item['is_inter_state'] ?? true);

            $cgstPercent = 0.0; $sgstPercent = 0.0; $igstPercent = 0.0;
            $cgstAmount  = 0.0; $sgstAmount  = 0.0; $igstAmount  = 0.0;

            if ($gstSlab > 0) {
                if ($isInterState) {
                    $igstPercent = $gstSlab;
                    $igstAmount  = round($taxableAmount * ($igstPercent / 100), 2);
                } else {
                    $cgstPercent = $gstSlab / 2;
                    $sgstPercent = $gstSlab / 2;
                    $cgstAmount  = round($taxableAmount * ($cgstPercent / 100), 2);
                    $sgstAmount  = round($taxableAmount * ($sgstPercent / 100), 2);
                }
            }

            $lineTaxAmount = round($cgstAmount + $sgstAmount + $igstAmount, 2);
            $lineTotal     = round($taxableAmount + $lineTaxAmount, 2);

            $subtotal           += $baseAmount;
            $itemDiscountAmount += $discountAmount;
            $itemTaxAmount      += $lineTaxAmount;

            $processedItems[] = [
                'product_id'       => !empty($item['product_id']) ? (int) $item['product_id'] : null,
                'product_name'     => $item['product_name'],
                'hsn_sac_code'     => $item['hsn_sac_code'] ?? '',
                'unit'             => $item['unit'],
                'quantity'         => $qty,
                'purchase_price'   => $price,
                'discount_type'    => $discountType,
                'discount_percent' => $discountType === 'percent' ? $discountPercent : 0,
                'discount_amount'  => $discountAmount,
                'gst_slab'         => $gstSlab,
                'is_inter_state'   => $isInterState,
                'cgst_percent'     => $cgstPercent,
                'sgst_percent'     => $sgstPercent,
                'igst_percent'     => $igstPercent,
                'cgst_amount'      => $cgstAmount,
                'sgst_amount'      => $sgstAmount,
                'igst_amount'      => $igstAmount,
                'total'            => $lineTotal,
            ];
        }

        $subtotal           = round($subtotal, 2);
        $itemDiscountAmount = round($itemDiscountAmount, 2);
        $itemTaxAmount      = round($itemTaxAmount, 2);
        $itemTaxableTotal   = max(round($subtotal - $itemDiscountAmount, 2), 0);

        if ($generalDiscountType === 'amount') {
            $billDiscount = min(max($generalDiscountEnteredAmt, 0), $itemTaxableTotal);
        } else {
            $billDiscount = round($itemTaxableTotal * ($generalDiscountPercent / 100), 2);
            $billDiscount = min(max($billDiscount, 0), $itemTaxableTotal);
        }

        if ($generalDiscountApplyType === 'before_tax') {
            $discountedTaxable = max(round($itemTaxableTotal - $billDiscount, 2), 0);
            $taxFactor         = $itemTaxableTotal > 0 ? $discountedTaxable / $itemTaxableTotal : 0;
            $taxAfterBillDiscount = round($itemTaxAmount * $taxFactor, 2);
        } else {
            $discountedTaxable    = $itemTaxableTotal;
            $taxAfterBillDiscount = $itemTaxAmount;
        }

        $effectiveTaxRate = $itemTaxableTotal > 0 ? $itemTaxAmount / $itemTaxableTotal : 0;
        $packingTax       = 0.0;
        if ($packingApplyType === 'before_tax' && $packingCharges > 0) {
            $packingTax = round($packingCharges * $effectiveTaxRate, 2);
        }

        $totalTaxWithPacking = round($taxAfterBillDiscount + $packingTax, 2);

        $additionalCharges      = $validated['additional_charges'] ?? [];
        $additionalChargesTotal = 0.0;
        foreach ($additionalCharges as $charge) {
            $additionalChargesTotal += max((float) ($charge['amount'] ?? 0), 0);
        }
        $additionalChargesTotal = round($additionalChargesTotal, 2);

        $existingOtherCharges = max((float) ($validated['other_charges'] ?? 0), 0);
        $otherChargesTotal    = round($existingOtherCharges + $additionalChargesTotal, 2);

        if ($generalDiscountApplyType === 'before_tax') {
            $totalBeforeTcs = $discountedTaxable
                + $totalTaxWithPacking
                + $packingCharges
                + $shippingCharges
                + $otherChargesTotal;
        } else {
            $totalBeforeTcs = $itemTaxableTotal
                + $totalTaxWithPacking
                + $packingCharges
                + $shippingCharges
                + $otherChargesTotal
                - $billDiscount;
        }
        $totalBeforeTcs = max(round($totalBeforeTcs, 2), 0);

        $tcsAmount           = round($totalBeforeTcs * ($tcsPercent / 100), 2);
        $totalBeforeRoundOff = round($totalBeforeTcs + $tcsAmount, 2);
        $grandTotal          = max(round($totalBeforeRoundOff + $roundOff, 2), 0);

        $validatedPayments = $validated['payments'] ?? [];

        $existingOutward = (float) $purchase->payments()->where('payment_direction', 'outward')->sum('amount');
        $existingInward  = (float) $purchase->payments()->where('payment_direction', 'inward')->sum('amount');

        $newOutward = 0.0;
        $newInward  = 0.0;
        foreach ($validatedPayments as $payment) {
            $amount = max((float) $payment['amount'], 0);
            if (($payment['payment_direction'] ?? 'outward') === 'inward') {
                $newInward += $amount;
            } else {
                $newOutward += $amount;
            }
        }

        $netPaidAmount = round(($existingOutward + $newOutward) - ($existingInward + $newInward), 2);
        $paymentStatus = $netPaidAmount >= $grandTotal
            ? 'Paid'
            : ($netPaidAmount > 0 ? 'Partial' : 'Unpaid');

        $existingColumns = $this->existingPurchaseInvoiceColumns();

        try {
            DB::transaction(function () use (
                $purchase,
                $validated,
                $branch,
                $warehouse,
                $subtotal,
                $billDiscount,
                $totalTaxWithPacking,
                $shippingCharges,
                $packingCharges,
                $otherChargesTotal,
                $roundOff,
                $grandTotal,
                $processedItems,
                $validatedPayments,
                $netPaidAmount,
                $paymentStatus,
                $generalDiscountType,
                $generalDiscountPercent,
                $generalDiscountEnteredAmt,
                $generalDiscountApplyType,
                $packingApplyType,
                $tcsPercent,
                $existingColumns
            ) {
                // Reversal of previously applied stock
                foreach ($purchase->items as $oldItem) {
                    if (empty($oldItem->product_id)) continue;

                    $product = Product::lockForUpdate()->find($oldItem->product_id);
                    if (!$product) continue;

                    $qty         = (float) $oldItem->quantity;
                    $stockBefore = (float) ($product->stock_quantity ?? 0);
                    $stockAfter  = $stockBefore - $qty;

                    $product->stock_quantity = $stockAfter;
                    $product->save();

                    StockMovement::create([
                        'product_id'       => $product->id,
                        'warehouse_id'     => $warehouse->id,
                        'company_id'       => $validated['company_id'],
                        'branch_id'        => $branch->id,
                        'transaction_type' => 'OUT',
                        'reference_type'   => 'purchase',
                        'reference_id'     => $purchase->id,
                        'quantity'         => $qty,
                        'unit_price'       => (float) $oldItem->purchase_price,
                        'stock_before'     => $stockBefore,
                        'stock_after'      => $stockAfter,
                        'remark'           => 'Reversal for purchase update #' . $purchase->purchase_number,
                        'transaction_date' => now()->toDateString(),
                        'created_by'       => Auth::id(),
                    ]);

                    $whStock = ProductWarehouseStock::where([
                        'product_id'   => $product->id,
                        'warehouse_id' => $warehouse->id,
                        'company_id'   => $validated['company_id'],
                        'branch_id'    => $branch->id,
                    ])->first();

                    if ($whStock) {
                        $whStock->quantity           = max(0, (float) $whStock->quantity - $qty);
                        $whStock->available_quantity = max(0, (float) $whStock->available_quantity - $qty);
                        $whStock->save();
                    }
                }

                $purchase->items()->delete();
                $purchase->items()->createMany($processedItems);

                // Re-apply stock for new items
                foreach ($processedItems as $item) {
                    if (empty($item['product_id'])) continue;

                    $product = Product::lockForUpdate()->find($item['product_id']);
                    if (!$product) continue;

                    $qty         = (float) $item['quantity'];
                    $price       = (float) $item['purchase_price'];
                    $stockBefore = (float) ($product->stock_quantity ?? 0);
                    $stockAfter  = $stockBefore + $qty;

                    $product->stock_quantity = $stockAfter;
                    $product->purchase_price = $price;
                    $product->save();

                    StockMovement::create([
                        'product_id'       => $product->id,
                        'warehouse_id'     => $warehouse->id,
                        'company_id'       => $validated['company_id'],
                        'branch_id'        => $branch->id,
                        'transaction_type' => 'IN',
                        'reference_type'   => 'purchase',
                        'reference_id'     => $purchase->id,
                        'quantity'         => $qty,
                        'unit_price'       => $price,
                        'stock_before'     => $stockBefore,
                        'stock_after'      => $stockAfter,
                        'remark'           => 'Reapplied purchase #' . $purchase->purchase_number,
                        'transaction_date' => $purchase->purchase_date,
                        'created_by'       => Auth::id(),
                    ]);

                    $whStock = ProductWarehouseStock::firstOrNew([
                        'product_id'   => $product->id,
                        'warehouse_id' => $warehouse->id,
                        'company_id'   => $validated['company_id'],
                        'branch_id'    => $branch->id,
                    ]);
                    $whStock->quantity            = (float) ($whStock->quantity ?? 0) + $qty;
                    $whStock->available_quantity  = (float) ($whStock->available_quantity ?? 0) + $qty;
                    $whStock->last_purchase_price = $price;
                    $whStock->save();

                    ProductPurchasePriceHistory::create([
                        'product_id'    => $product->id,
                        'supplier_id'   => $purchase->supplier_id,
                        'purchase_id'   => $purchase->id,
                        'bill_number'   => $purchase->bill_number ?: $purchase->purchase_number,
                        'quantity'      => $qty,
                        'unit_price'    => $price,
                        'purchase_date' => $purchase->purchase_date,
                    ]);
                }

                $updateAttrs = [
                    'company_id'        => $validated['company_id'],
                    'supplier_id'       => $validated['supplier_id'],
                    'purchase_number'   => $validated['purchase_number'],
                    'bill_number'       => $validated['bill_number'] ?? null,
                    'purchase_date'     => $validated['purchase_date'],
                    'due_date'          => $validated['due_date'] ?? null,
                    'reference_number'  => $validated['reference_number'] ?? null,
                    'warehouse'         => $warehouse->name,
                    'notes'             => $validated['notes'] ?? null,
                    'internal_remarks'  => $validated['internal_remarks'] ?? null,
                    'subtotal'          => $subtotal,
                    'order_discount'    => $billDiscount,
                    'tax_amount'        => $totalTaxWithPacking,
                    'shipping_charges'  => $shippingCharges,
                    'packing_charges'   => $packingCharges,
                    'other_charges'     => $otherChargesTotal,
                    'round_off'         => $roundOff,
                    'grand_total'       => $grandTotal,
                    'status'            => $validated['status'] ?? $purchase->status,
                    'paid_amount'       => $netPaidAmount,
                    'payment_status'    => $paymentStatus,
                ];

                foreach ([
                    'warehouse_id'                => $warehouse->id,
                    'branch_id'                   => $branch->id,
                    'packing_apply_type'          => $packingApplyType,
                    'general_discount_type'       => $generalDiscountType,
                    'general_discount_percent'    => $generalDiscountType === 'percent' ? $generalDiscountPercent : 0,
                    'general_discount_amount'     => $generalDiscountType === 'amount' ? $generalDiscountEnteredAmt : 0,
                    'general_discount_apply_type' => $generalDiscountApplyType,
                    'tcs_percent'                 => $tcsPercent,
                ] as $col => $val) {
                    if (!empty($existingColumns[$col])) {
                        $updateAttrs[$col] = $val;
                    }
                }

                $purchase->update($updateAttrs);

                foreach ($validatedPayments as $payment) {
                    $purchase->payments()->create([
                        'company_id'        => $purchase->company_id,
                        'amount'            => (float) $payment['amount'],
                        'payment_method'    => $payment['payment_method'],
                        'transaction_date'  => $payment['transaction_date'],
                        'reference_no'      => $payment['reference_no'] ?? null,
                        'bank_name'         => $payment['bank_name'] ?? null,
                        'account_number'    => $payment['account_number'] ?? null,
                        'remarks'           => $payment['remarks'] ?? null,
                        'status'            => 'completed',
                        'payment_direction' => $payment['payment_direction'] ?? 'outward',
                    ]);
                }

                Log::info('Purchase invoice updated successfully', [
                    'purchase_id'     => $purchase->id,
                    'purchase_number' => $purchase->purchase_number,
                    'grand_total'     => $purchase->grand_total,
                    'paid_amount'     => $purchase->paid_amount,
                ]);
            });
        } catch (QueryException $e) {
            $this->convertDuplicateKeyException(
                $e,
                'purchase_number',
                'The purchase number has already been taken.'
            );
        }

        $updated = $purchase->fresh(['supplier', 'items.product', 'payments']);

        return response()->json([
            'success' => true,
            'data'    => $updated,
            'message' => 'Purchase invoice updated successfully',
        ]);
    }

    /**
     * Delete a purchase invoice AND reverse all stock/warehouse/price-history
     * effects that were applied when it was created.
     *
     * Mirrors the reversal logic used in `update()` so stock_quantity stays
     * consistent regardless of whether the invoice is edited or deleted.
     */
    public function destroy($id)
    {
        $purchase = PurchaseInvoice::with(['items', 'payments'])->findOrFail($id);

        Log::debug('Purchase invoice delete request', [
            'user_id'         => Auth::id(),
            'purchase_id'     => $purchase->id,
            'purchase_number' => $purchase->purchase_number,
        ]);

        DB::transaction(function () use ($purchase) {
            $companyId   = (int) $purchase->company_id;
            $branchId    = (int) ($purchase->branch_id ?? 0) ?: null;
            $warehouseId = (int) ($purchase->warehouse_id ?? 0) ?: null;

            if (!$warehouseId) {
                $warehouseQuery = Warehouse::query()->where('company_id', $companyId);
                if ($branchId) {
                    $warehouseQuery->where('branch_id', $branchId);
                }
                if (!empty($purchase->warehouse)) {
                    $warehouseQuery->where('name', $purchase->warehouse);
                }
                $wh = $warehouseQuery->first();
                $warehouseId = $wh ? (int) $wh->id : null;
            }

            if (!$warehouseId && $branchId) {
                $wh = Warehouse::where('company_id', $companyId)
                    ->where('branch_id', $branchId)
                    ->first();
                $warehouseId = $wh ? (int) $wh->id : null;
            }

            // ── Reverse stock for every line item ─────────────────────────────
            foreach ($purchase->items as $item) {
                if (empty($item->product_id)) continue;

                $product = Product::lockForUpdate()->find($item->product_id);
                if (!$product) continue;

                $qty         = (float) $item->quantity;
                $stockBefore = (float) ($product->stock_quantity ?? 0);
                $stockAfter  = $stockBefore - $qty;

                $product->stock_quantity = $stockAfter;
                $product->save();

                StockMovement::create([
                    'product_id'       => $product->id,
                    'warehouse_id'     => $warehouseId,
                    'company_id'       => $companyId,
                    'branch_id'        => $branchId,
                    'transaction_type' => 'OUT',
                    'reference_type'   => 'purchase',
                    'reference_id'     => $purchase->id,
                    'quantity'         => $qty,
                    'unit_price'       => (float) $item->purchase_price,
                    'stock_before'     => $stockBefore,
                    'stock_after'      => $stockAfter,
                    'remark'           => 'Reversal for deleted purchase #' . $purchase->purchase_number,
                    'transaction_date' => now()->toDateString(),
                    'created_by'       => Auth::id(),
                ]);

                if ($warehouseId) {
                    $whStock = ProductWarehouseStock::where([
                        'product_id'   => $product->id,
                        'warehouse_id' => $warehouseId,
                        'company_id'   => $companyId,
                    ])->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
                      ->first();

                    if ($whStock) {
                        $whStock->quantity           = max(0, (float) $whStock->quantity - $qty);
                        $whStock->available_quantity = max(0, (float) $whStock->available_quantity - $qty);
                        $whStock->save();
                    }
                }
            }

            // ── Remove purchase price history tied to this invoice ────────────
            ProductPurchasePriceHistory::where('purchase_id', $purchase->id)->delete();

            // ── Delete child rows then the invoice itself ─────────────────────
            // (items/payments must go before the parent to satisfy FKs.)
            $purchase->items()->delete();
            $purchase->payments()->delete();

            $purchase->delete();

            Log::info('Purchase invoice deleted successfully with stock reversal', [
                'purchase_id'     => $purchase->id,
                'purchase_number' => $purchase->purchase_number,
                'company_id'      => $companyId,
                'branch_id'       => $branchId,
                'warehouse_id'    => $warehouseId,
            ]);
        });

        return response()->json([
            'success' => true,
            'message' => 'Purchase invoice deleted successfully and stock reversed',
        ]);
    }

    public function addPayment(Request $request, $id)
    {
        $validated = $request->validate([
            'amount'         => ['required', 'numeric', 'min:0.01'],
            'payment_method' => ['required', 'string', 'max:50'],
            'payment_date'   => ['required', 'date'],
            'reference'      => ['nullable', 'string', 'max:150'],
            'notes'          => ['nullable', 'string'],
            'bank_name'      => ['nullable', 'string', 'max:150'],
            'account_number' => ['nullable', 'string', 'max:100'],
        ]);

        $result = DB::transaction(function () use ($validated, $id) {
            $purchase = PurchaseInvoice::lockForUpdate()->findOrFail($id);

            $payment = $purchase->payments()->create([
                'company_id'        => $purchase->company_id,
                'amount'            => $validated['amount'],
                'payment_method'    => $validated['payment_method'],
                'transaction_date'  => $validated['payment_date'],
                'reference_no'      => $validated['reference'] ?? null,
                'bank_name'         => $validated['bank_name'] ?? null,
                'account_number'    => $validated['account_number'] ?? null,
                'remarks'           => $validated['notes'] ?? null,
                'status'            => 'completed',
                'payment_direction' => 'outward',
            ]);

            $outward   = (float) $purchase->payments()->where('payment_direction', 'outward')->sum('amount');
            $inward    = (float) $purchase->payments()->where('payment_direction', 'inward')->sum('amount');
            $totalPaid = round($outward - $inward, 2);

            $paymentStatus = $totalPaid >= (float) $purchase->grand_total
                ? 'Paid'
                : ($totalPaid > 0 ? 'Partial' : 'Unpaid');

            $purchase->update([
                'paid_amount'    => $totalPaid,
                'payment_status' => $paymentStatus,
            ]);

            return [
                'purchase' => $purchase->fresh(['supplier', 'items.product', 'payments']),
                'payment'  => $payment,
            ];
        });

        return response()->json([
            'success' => true,
            'data'    => $result['purchase'],
            'payment' => $result['payment'],
            'message' => 'Payment added successfully',
        ], 201);
    }

    private function resolveBranch(int $companyId, string $branchName = 'Main Branch'): Branch
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
                    'warehouse_id' => 'Selected warehouse does not belong to the selected company and branch.',
                ]);
            }

            return $warehouse;
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