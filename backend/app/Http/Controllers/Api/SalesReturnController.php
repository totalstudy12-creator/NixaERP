<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Product;
use App\Models\ReturnItem;
use App\Models\SalesReturn;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;
use Throwable;

class SalesReturnController extends Controller
{
    private const STATUSES = [
        'draft',
        'confirmed',
        'stock_updated',
        'refund_pending',
        'completed',
        'cancelled',
    ];

    /**
     * List sales returns.
     */
    public function index(Request $request): JsonResponse
    {
        $perPage = min(max((int) $request->input('per_page', 15), 1), 1000);

        $query = SalesReturn::query()
            ->with(['customer', 'warehouse', 'items.product'])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')->toString()))
            ->when($request->filled('customer_id'), fn ($q) => $q->where('customer_id', (int) $request->customer_id))
            ->when($request->filled('warehouse_id'), fn ($q) => $q->where('warehouse_id', (int) $request->warehouse_id))
            ->when($request->filled('return_number'), fn ($q) => $q->where('return_number', 'like', '%' . $request->return_number . '%'))
            ->when(
                $request->filled('from_date') && $request->filled('to_date'),
                fn ($q) => $q->whereBetween('return_date', [$request->from_date, $request->to_date])
            );

        if ($request->filled('search')) {
            $search = trim((string) $request->search);
            $query->where(function ($q) use ($search) {
                $q->where('return_number', 'like', "%{$search}%")
                    ->orWhere('original_invoice_no', 'like', "%{$search}%")
                    ->orWhere('reason', 'like', "%{$search}%")
                    ->orWhereHas('customer', fn ($cq) => $cq->where('name', 'like', "%{$search}%"))
                    ->orWhereHas('items.product', fn ($pq) => $pq->where('name', 'like', "%{$search}%"));
            });
        }

        return response()->json($query->latest('created_at')->paginate($perPage));
    }

    /**
     * Search active products.
     */
    public function searchProducts(Request $request): JsonResponse
    {
        $query = trim((string) $request->input('query', ''));
        $perPage = min(max((int) $request->input('per_page', 20), 1), 100);

        $products = Product::query()
            ->when($query !== '', function ($q) use ($query) {
                $q->where(function ($inner) use ($query) {
                    $inner->where('name', 'like', "%{$query}%")
                        ->orWhere('sku', 'like', "%{$query}%")
                        ->orWhere('barcode', 'like', "%{$query}%");
                });
            })
            ->when(Schema::hasColumn('products', 'is_active'), fn ($q) => $q->where('is_active', true))
            ->orderBy('name')
            ->paginate($perPage);

        return response()->json($products);
    }

    /**
     * Search sales invoices that are eligible to be returned.
     */
    public function searchInvoices(Request $request): JsonResponse
    {
        $query = trim((string) $request->input('query', ''));
        $customerId = $request->filled('customer_id') ? (int) $request->customer_id : null;
        $perPage = min(max((int) $request->input('per_page', 20), 1), 100);

        $columns = Schema::getColumnListing('invoices');
        $numberColumn = collect(['invoice_number', 'invoice_no', 'number', 'bill_no'])
            ->first(fn ($column) => in_array($column, $columns, true));

        $invoiceQuery = Invoice::query()
            ->with('customer')
            ->when($customerId, fn ($q) => $q->where('customer_id', $customerId));

        if (in_array('type', $columns, true)) {
            $invoiceQuery->where('type', 'sales');
        }

        if ($query !== '') {
            $invoiceQuery->where(function ($q) use ($query, $numberColumn) {
                if ($numberColumn) {
                    $q->where($numberColumn, 'like', "%{$query}%");
                } elseif (ctype_digit($query)) {
                    $q->whereKey((int) $query);
                }
            });
        }

        $invoices = $invoiceQuery
            ->latest('created_at')
            ->paginate($perPage);

        $invoices->getCollection()->transform(function ($invoice) use ($numberColumn) {
            return [
                'id' => (int) $invoice->id,
                'invoice_number' => $numberColumn ? ($invoice->{$numberColumn} ?? null) : null,
                'customer_id' => (int) $invoice->customer_id,
                'customer' => $invoice->customer,
                'created_at' => $invoice->created_at,
            ];
        });

        return response()->json($invoices);
    }

    /**
     * Search customers.
     */
    public function searchCustomers(Request $request): JsonResponse
    {
        $query = trim((string) $request->input('query', ''));
        $perPage = min(max((int) $request->input('per_page', 20), 1), 100);

        $customerQuery = Customer::query()
            ->when($query !== '', function ($q) use ($query) {
                $q->where(function ($inner) use ($query) {
                    $inner->where('name', 'like', "%{$query}%")
                        ->orWhere('phone', 'like', "%{$query}%")
                        ->orWhere('email', 'like', "%{$query}%");
                });
            })
            ->when(Schema::hasColumn('customers', 'is_active'), fn ($q) => $q->where('is_active', true))
            ->orderBy('name');

        return response()->json($customerQuery->paginate($perPage));
    }

    /**
     * Return all invoices for a customer.
     */
    public function getCustomerInvoices(int $customerId): JsonResponse
    {
        $this->ensureCustomerExists($customerId);

        $query = Invoice::query()->where('customer_id', $customerId);
        if (Schema::hasColumn('invoices', 'type')) {
            $query->where('type', 'sales');
        }

        return response()->json(
            $query->with(['items.product', 'customer'])->latest('created_at')->get()
        );
    }

    /**
     * Load and normalize a sales invoice for creating a return.
     * This intentionally returns {data: ...} so the frontend can consume one stable shape.
     */
    public function getInvoiceDetails(int $invoiceId): JsonResponse
    {
        $invoice = Invoice::query()
            ->with(['items.product', 'customer'])
            ->find($invoiceId);

        if (!$invoice) {
            return response()->json([
                'message' => 'Sales invoice not found.',
                'code' => 'INVOICE_NOT_FOUND',
            ], 404);
        }

        if (Schema::hasColumn('invoices', 'type') && $invoice->type !== 'sales') {
            return response()->json([
                'message' => 'Only sales invoices can be returned.',
                'code' => 'NOT_A_SALES_INVOICE',
            ], 422);
        }

        $items = $invoice->items->map(function ($item) use ($invoice) {
            $soldQty = $this->itemQuantity($item);
            $rate = $this->itemRate($item);
            $gstRate = $this->itemGstRate($item);

            $alreadyReturned = (float) ReturnItem::query()
                ->where('sale_item_id', $item->id)
                ->whereHas('salesReturn', fn ($q) => $q->where('original_sale_id', $invoice->id))
                ->sum('return_qty');

            $returnableQty = max(0, $soldQty - $alreadyReturned);

            return [
                'id' => (int) $item->id,
                'product_id' => (int) $item->product_id,
                'product' => $item->product,
                'quantity' => $soldQty,
                'sold_qty' => $soldQty,
                'already_returned_qty' => $alreadyReturned,
                'returnable_qty' => $returnableQty,
                'rate' => $rate,
                'gst_rate' => $gstRate,
                'original_cgst_amount' => (float) ($item->cgst_amount ?? 0),
                'original_sgst_amount' => (float) ($item->sgst_amount ?? 0),
                'original_igst_amount' => (float) ($item->igst_amount ?? 0),
            ];
        })->values();

        if ($items->isEmpty()) {
            return response()->json([
                'message' => 'Invoice details were found, but this invoice has no line items.',
                'code' => 'INVOICE_HAS_NO_ITEMS',
            ], 422);
        }

        $invoiceNumber = null;
        foreach (['invoice_number', 'invoice_no', 'number', 'bill_no'] as $candidate) {
            if (Schema::hasColumn('invoices', $candidate)) {
                $invoiceNumber = $invoice->{$candidate};
                break;
            }
        }

        $payload = [
            'id' => (int) $invoice->id,
            'invoice_number' => $invoiceNumber ?: 'INV-' . $invoice->id,
            'invoice_no' => $invoiceNumber ?: 'INV-' . $invoice->id,
            'customer_id' => (int) $invoice->customer_id,
            'customer' => $invoice->customer,
            'company_id' => $this->safeAttribute($invoice, 'company_id'),
            'branch_id' => $this->safeAttribute($invoice, 'branch_id'),
            'warehouse_id' => $this->safeAttribute($invoice, 'warehouse_id'),
            'returnable_items' => $items->filter(fn ($item) => $item['returnable_qty'] > 0)->values(),
            'items' => $items,
        ];

        return response()->json(['data' => $payload]);
    }

    /**
     * Create a sales return. Drafts only persist the draft; confirmed returns are validated
     * server-side but should be followed by your stock/accounting transaction service.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $this->validatePayload($request, false);

        try {
            $salesReturn = DB::transaction(function () use ($validated) {
                $invoice = Invoice::query()->with('items')->lockForUpdate()->findOrFail($validated['original_sale_id']);

                $this->validateInvoiceOwnership($invoice, (int) $validated['customer_id']);
                $normalizedItems = $this->normalizeAndValidateItems(
                    $invoice,
                    $validated['items'],
                    null
                );

                $totals = $this->calculateTotals($normalizedItems);
                $settlement = $this->validateSettlement($validated, $totals['grand_total']);

                $salesReturn = SalesReturn::create([
                    'return_number' => $this->generateReturnNumber(),
                    'company_id' => $validated['company_id'] ?? null,
                    'branch_id' => $validated['branch_id'] ?? null,
                    'warehouse_id' => $validated['warehouse_id'],
                    'customer_id' => $validated['customer_id'],
                    'original_sale_id' => $validated['original_sale_id'],
                    'return_date' => $validated['return_date'],
                    'status' => $validated['status'],
                    'subtotal' => $totals['subtotal'],
                    'discount_amount' => 0,
                    'taxable_amount' => $totals['taxable_amount'],
                    'cgst_amount' => $totals['cgst'],
                    'sgst_amount' => $totals['sgst'],
                    'igst_amount' => $totals['igst'],
                    'total_tax' => $totals['total_tax'],
                    'grand_total' => $totals['grand_total'],
                    'refund_amount' => $settlement['refund_amount'],
                    'credit_amount' => $settlement['credit_amount'],
                    'refund_status' => $settlement['refund_status'],
                    'reason' => trim($validated['reason']),
                    'remark' => $validated['remark'] ?? null,
                    'created_by' => auth()->id(),
                ]);

                foreach ($normalizedItems as $item) {
                    $salesReturn->items()->create($item);
                }

                return $salesReturn;
            }, 3);

            return response()->json([
                'data' => $salesReturn->load(['customer', 'warehouse', 'items.product']),
            ], 201);
        } catch (ValidationException $e) {
            throw $e;
        } catch (Throwable $e) {
            report($e);
            return response()->json([
                'message' => 'Failed to create sales return.',
                'code' => 'SALES_RETURN_CREATE_FAILED',
            ], 500);
        }
    }

    /**
     * Show one sales return.
     */
    public function show(int $id): JsonResponse
    {
        $salesReturn = SalesReturn::with(['customer', 'warehouse', 'items.product'])->find($id);

        if (!$salesReturn) {
            return response()->json(['message' => 'Sales return not found.'], 404);
        }

        return response()->json(['data' => $salesReturn]);
    }

    /**
     * Update draft return only. Once confirmed, it is immutable from this endpoint.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        try {
            $salesReturn = SalesReturn::query()->with('items')->lockForUpdate()->find($id);

            if (!$salesReturn) {
                return response()->json(['message' => 'Sales return not found.'], 404);
            }

            if ($salesReturn->status !== 'draft') {
                return response()->json([
                    'message' => 'Only draft returns can be edited. Confirmed or processed returns are locked.',
                ], 422);
            }

            $validated = $this->validatePayload($request, true);

            $updated = DB::transaction(function () use ($validated, $salesReturn) {
                $invoice = Invoice::query()->with('items')->lockForUpdate()->findOrFail($salesReturn->original_sale_id);
                $normalizedItems = $this->normalizeAndValidateItems(
                    $invoice,
                    $validated['items'],
                    $salesReturn->id
                );

                $totals = $this->calculateTotals($normalizedItems);
                $settlement = $this->validateSettlement($validated, $totals['grand_total']);

                $salesReturn->update([
                    'company_id' => $validated['company_id'] ?? $salesReturn->company_id,
                    'branch_id' => $validated['branch_id'] ?? $salesReturn->branch_id,
                    'warehouse_id' => $validated['warehouse_id'],
                    'return_date' => $validated['return_date'],
                    'status' => $validated['status'],
                    'subtotal' => $totals['subtotal'],
                    'discount_amount' => 0,
                    'taxable_amount' => $totals['taxable_amount'],
                    'cgst_amount' => $totals['cgst'],
                    'sgst_amount' => $totals['sgst'],
                    'igst_amount' => $totals['igst'],
                    'total_tax' => $totals['total_tax'],
                    'grand_total' => $totals['grand_total'],
                    'refund_amount' => $settlement['refund_amount'],
                    'credit_amount' => $settlement['credit_amount'],
                    'refund_status' => $settlement['refund_status'],
                    'reason' => trim($validated['reason']),
                    'remark' => $validated['remark'] ?? null,
                ]);

                $salesReturn->items()->delete();
                foreach ($normalizedItems as $item) {
                    $salesReturn->items()->create($item);
                }

                return $salesReturn;
            }, 3);

            return response()->json([
                'data' => $updated->load(['customer', 'warehouse', 'items.product']),
            ]);
        } catch (ValidationException $e) {
            throw $e;
        } catch (Throwable $e) {
            report($e);
            return response()->json([
                'message' => 'Failed to update sales return.',
                'code' => 'SALES_RETURN_UPDATE_FAILED',
            ], 500);
        }
    }

    /**
     * Delete draft return only.
     */
    public function destroy(int $id): JsonResponse
    {
        try {
            DB::transaction(function () use ($id) {
                $salesReturn = SalesReturn::query()->lockForUpdate()->find($id);

                if (!$salesReturn) {
                    throw ValidationException::withMessages(['id' => 'Sales return not found.']);
                }

                if ($salesReturn->status !== 'draft') {
                    throw ValidationException::withMessages(['status' => 'Only draft returns can be deleted. Processed returns must not be deleted.']);
                }

                $salesReturn->items()->delete();
                $salesReturn->delete();
            }, 3);

            return response()->json(['message' => 'Sales return deleted successfully.']);
        } catch (Throwable $e) {
            report($e);
            return response()->json([
                'message' => 'Failed to delete sales return.',
                'code' => 'SALES_RETURN_DELETE_FAILED',
            ], 500);
        }
    }

    private function validatePayload(Request $request, bool $isUpdate): array
    {
        $rules = [
            'company_id' => 'nullable|integer|exists:companies,id',
            'branch_id' => 'nullable|integer|exists:branches,id',
            'warehouse_id' => 'required|integer|exists:warehouses,id',
            'return_date' => 'required|date',
            'status' => 'required|in:' . implode(',', self::STATUSES),
            'return_type' => 'required|in:full,partial',
            'reason' => 'required|string|max:255',
            'remark' => 'nullable|string|max:5000',
            'refund_method' => 'nullable|in:cash,upi,bank,credit',
            'refund_amount' => 'nullable|numeric|min:0',
            'credit_amount' => 'nullable|numeric|min:0',
            'items' => 'required|array|min:1',
            'items.*.sale_item_id' => 'required|integer|exists:invoice_items,id',
            'items.*.product_id' => 'required|integer|exists:products,id',
            'items.*.return_qty' => 'required|integer|min:1',
            'items.*.rate' => 'required|numeric|min:0',
            'items.*.gst_rate' => 'required|numeric|min:0|max:100',
            'items.*.condition' => 'required|in:good,damaged',
            'items.*.restock_status' => 'required|in:restock,no_restock',
            'items.*.reason' => 'nullable|string|max:255',
        ];

        if (!$isUpdate) {
            $rules['customer_id'] = 'required|integer|exists:customers,id';
            $rules['original_sale_id'] = 'required|integer|exists:invoices,id';
        } else {
            // Existing return owns customer/invoice; do not allow frontend to switch them.
            $rules['customer_id'] = 'prohibited';
            $rules['original_sale_id'] = 'prohibited';
        }

        return $request->validate($rules);
    }

    private function normalizeAndValidateItems(Invoice $invoice, array $requestedItems, ?int $currentReturnId): array
    {
        $invoiceItems = $invoice->items->keyBy('id');
        $seen = [];
        $normalized = [];

        foreach ($requestedItems as $input) {
            $saleItemId = (int) $input['sale_item_id'];

            if (isset($seen[$saleItemId])) {
                throw ValidationException::withMessages(['items' => "Duplicate invoice item {$saleItemId} in return."]);
            }
            $seen[$saleItemId] = true;

            $saleItem = $invoiceItems->get($saleItemId);
            if (!$saleItem) {
                throw ValidationException::withMessages(['items' => "Invoice item {$saleItemId} does not belong to invoice {$invoice->id}."]);
            }

            if ((int) $saleItem->product_id !== (int) $input['product_id']) {
                throw ValidationException::withMessages(['items' => 'Product does not match the selected invoice item.']);
            }

            $soldQty = $this->itemQuantity($saleItem);
            $alreadyReturnedQuery = ReturnItem::query()
                ->where('sale_item_id', $saleItemId)
                ->whereHas('salesReturn', fn ($q) => $q->where('original_sale_id', $invoice->id));

            if ($currentReturnId) {
                $alreadyReturnedQuery->where('sales_return_id', '!=', $currentReturnId);
            }

            $alreadyReturned = (float) $alreadyReturnedQuery->sum('return_qty');
            $maxReturnable = max(0, $soldQty - $alreadyReturned);
            $returnQty = (int) $input['return_qty'];

            if ($returnQty > $maxReturnable) {
                throw ValidationException::withMessages(['items.'.$saleItemId.'.return_qty' => "Return quantity exceeds the returnable quantity of {$maxReturnable}."]);
            }

            $rate = round((float) $input['rate'], 2);
            $gstRate = (float) $input['gst_rate'];

            // Never trust frontend tax/rate calculations. Server calculates all financial fields.
            $taxable = round($returnQty * $rate, 2);
            $gst = round(($taxable * $gstRate) / 100, 2);

            $originalCgst = (float) ($saleItem->cgst_amount ?? 0);
            $originalSgst = (float) ($saleItem->sgst_amount ?? 0);
            $originalIgst = (float) ($saleItem->igst_amount ?? 0);

            $cgst = 0.0;
            $sgst = 0.0;
            $igst = 0.0;

            $originalSoldTaxBase = $soldQty > 0 ? $soldQty * max(0, $this->itemRate($saleItem)) : 0;
            if ($originalIgst > 0 && $originalCgst == 0 && $originalSgst == 0) {
                $igst = $this->proRataTax($originalIgst, $returnQty, $soldQty);
            } elseif ($originalCgst > 0 || $originalSgst > 0) {
                $cgst = $this->proRataTax($originalCgst, $returnQty, $soldQty);
                $sgst = $this->proRataTax($originalSgst, $returnQty, $soldQty);
            } else {
                // Fallback for older invoices where tax components were not stored per line.
                $cgst = round($gst / 2, 2);
                $sgst = round($gst - $cgst, 2);
            }

            $componentTax = round($cgst + $sgst + $igst, 2);
            if ($componentTax !== $gst) {
                // Keep the tax total mathematically consistent after rounding.
                if ($igst > 0) {
                    $igst = $gst;
                    $cgst = 0;
                    $sgst = 0;
                } else {
                    $cgst = round($gst / 2, 2);
                    $sgst = round($gst - $cgst, 2);
                    $igst = 0;
                }
            }

            $normalized[] = [
                'sale_item_id' => $saleItemId,
                'product_id' => (int) $input['product_id'],
                'return_qty' => $returnQty,
                'rate' => $rate,
                'gst_rate' => $gstRate,
                'taxable_amount' => $taxable,
                'cgst_amount' => $cgst,
                'sgst_amount' => $sgst,
                'igst_amount' => $igst,
                'total_amount' => round($taxable + $gst, 2),
                'condition' => $input['condition'],
                'restock_status' => $input['restock_status'],
                'reason' => $input['reason'] ?? null,
            ];
        }

        return $normalized;
    }

    private function calculateTotals(array $items): array
    {
        $subtotal = 0.0;
        $cgst = 0.0;
        $sgst = 0.0;
        $igst = 0.0;

        foreach ($items as $item) {
            $subtotal += (float) $item['taxable_amount'];
            $cgst += (float) $item['cgst_amount'];
            $sgst += (float) $item['sgst_amount'];
            $igst += (float) $item['igst_amount'];
        }

        $subtotal = round($subtotal, 2);
        $cgst = round($cgst, 2);
        $sgst = round($sgst, 2);
        $igst = round($igst, 2);
        $totalTax = round($cgst + $sgst + $igst, 2);

        return [
            'subtotal' => $subtotal,
            'taxable_amount' => $subtotal,
            'cgst' => $cgst,
            'sgst' => $sgst,
            'igst' => $igst,
            'total_tax' => $totalTax,
            'grand_total' => round($subtotal + $totalTax, 2),
        ];
    }

    private function validateSettlement(array $data, float $grandTotal): array
    {
        $refund = round((float) ($data['refund_amount'] ?? 0), 2);
        $credit = round((float) ($data['credit_amount'] ?? 0), 2);
        $settlement = round($refund + $credit, 2);
        $status = $data['status'];

        if ($refund > 0 && ($data['refund_method'] ?? null) === 'credit') {
            throw ValidationException::withMessages(['refund_method' => 'Credit Note cannot be used with a cash/UPI/bank refund amount.']);
        }

        if ($credit > 0 && ($data['refund_method'] ?? null) && $data['refund_method'] !== 'credit') {
            throw ValidationException::withMessages(['refund_method' => 'Credit amount requires Credit Note as the refund method.']);
        }

        if ($settlement > $grandTotal) {
            throw ValidationException::withMessages(['refund_amount' => 'Refund plus credit cannot exceed the return grand total.']);
        }

        if ($status !== 'draft' && $settlement <= 0) {
            throw ValidationException::withMessages(['refund_amount' => 'A confirmed return must have a refund or credit settlement.']);
        }

        if ($status !== 'draft' && abs($settlement - $grandTotal) > 0.01) {
            throw ValidationException::withMessages(['refund_amount' => 'Confirmed return settlement must equal the return grand total.']);
        }

        return [
            'refund_amount' => $refund,
            'credit_amount' => $credit,
            'refund_status' => $refund > 0 && $credit > 0
                ? 'partial'
                : ($refund > 0 ? 'refunded' : ($credit > 0 ? 'credited' : 'pending')),
        ];
    }

    private function validateInvoiceOwnership(Invoice $invoice, int $customerId): void
    {
        if ((int) $invoice->customer_id !== $customerId) {
            throw ValidationException::withMessages(['customer_id' => 'The selected invoice does not belong to the selected customer.']);
        }
    }

    private function ensureCustomerExists(int $customerId): void
    {
        if (!Customer::query()->whereKey($customerId)->exists()) {
            throw ValidationException::withMessages(['customer_id' => 'Customer not found.']);
        }
    }

    private function itemQuantity($item): float
    {
        foreach (['quantity', 'qty', 'sold_qty'] as $column) {
            $value = $item->{$column} ?? null;
            if ($value !== null) {
                return (float) $value;
            }
        }
        return 0.0;
    }

    private function itemRate($item): float
    {
        foreach (['rate', 'unit_price', 'selling_price', 'price'] as $column) {
            $value = $item->{$column} ?? null;
            if ($value !== null) {
                return (float) $value;
            }
        }
        return 0.0;
    }

    private function itemGstRate($item): float
    {
        foreach (['gst_rate', 'tax_rate'] as $column) {
            $value = $item->{$column} ?? null;
            if ($value !== null) {
                return (float) $value;
            }
        }
        return 0.0;
    }

    private function safeAttribute($model, string $attribute)
    {
        return array_key_exists($attribute, $model->getAttributes()) ? $model->{$attribute} : null;
    }

    private function proRataTax(float $originalTax, int $returnQty, float $soldQty): float
    {
        if ($originalTax <= 0 || $soldQty <= 0) {
            return 0.0;
        }

        return round($originalTax * ($returnQty / $soldQty), 2);
    }

    private function generateReturnNumber(): string
    {
        $year = now()->format('Y');
        $prefix = "SR-{$year}-";

        // Unique DB constraint should exist on sales_returns.return_number.
        $last = SalesReturn::query()
            ->where('return_number', 'like', $prefix . '%')
            ->lockForUpdate()
            ->orderByDesc('return_number')
            ->value('return_number');

        $next = $last ? ((int) substr($last, -4)) + 1 : 1;

        return sprintf('%s%04d', $prefix, $next);
    }
}
