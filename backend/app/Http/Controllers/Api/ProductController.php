<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\Company;
use App\Models\Branch;
use App\Models\Warehouse;
use App\Models\ProductWarehouseStock;
use App\Models\StockMovement;
use App\Models\ProductPurchasePriceHistory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth;

class ProductController extends Controller
{
    /**
     * Display a listing of products with optional pagination or all.
     */
    public function index(Request $request)
    {
        $perPage = $request->input('per_page', 15);

        // Allow fetching all products for client-side filtering
        if ($perPage === 'all') {
            try {
                return Product::with(['company', 'branch'])
                    ->orderBy('name')
                    ->get();
            } catch (\Exception $e) {
                return Product::orderBy('name')->get();
            }
        }

        try {
            return Product::with(['company', 'branch'])
                ->orderBy('name')
                ->paginate((int)$perPage);
        } catch (\Exception $e) {
            return Product::orderBy('name')->paginate((int)$perPage);
        }
    }

    /**
     * Store a newly created product in storage.
     * Also creates initial stock record if stock_quantity > 0 and warehouse_id provided.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'company_id' => 'required|exists:companies,id',
            'branch_id' => 'nullable|exists:branches,id',
            'name' => 'required|string|max:255',
            'sku' => 'required|string|max:100|unique:products,sku',
            'barcode' => 'nullable|string|max:100|unique:products,barcode',
            'brand' => 'nullable|string|max:255',
            'unit' => 'nullable|string|max:50',
            'purchase_price' => 'nullable|numeric|min:0',
            'sale_price' => 'nullable|numeric|min:0',
            'tax_rate' => 'nullable|numeric|min:0',
            'stock_quantity' => 'nullable|integer|min:0',
            'reorder_level' => 'nullable|integer|min:0',
            'description' => 'nullable|string',
            'active' => 'boolean',
            'warehouse_id' => 'nullable|exists:warehouses,id', // added for initial stock assignment
        ]);

        // Set empty barcode to null (to avoid unique constraint violation)
        if (isset($data['barcode']) && trim($data['barcode']) === '') {
            $data['barcode'] = null;
        }

        // Apply default values
        $data = $this->prepareProductData($data);

        $product = Product::create($data);

        // If stock_quantity > 0 and warehouse provided, create initial stock movement
        if ($product->stock_quantity > 0 && !empty($data['warehouse_id'])) {
            $this->createInitialStock($product, $data['warehouse_id']);
        }

        return $product;
    }

    /**
     * Sanitize a string to UTF-8.
     */
    private function sanitizeString($value)
    {
        if (is_string($value)) {
            $encoding = mb_detect_encoding($value, mb_detect_order(), true);
            if ($encoding !== 'UTF-8') {
                $value = mb_convert_encoding($value, 'UTF-8', $encoding ?: 'auto');
            }
            $value = mb_convert_encoding($value, 'UTF-8', 'UTF-8');
        }
        return $value;
    }

    /**
     * Recursively sanitize an array.
     */
    private function sanitizeArray(array $data): array
    {
        array_walk_recursive($data, function (&$value) {
            $value = $this->sanitizeString($value);
        });
        return $data;
    }

    /**
     * Import products from CSV.
     */
    public function import(Request $request)
    {
        $request->validate([
            'file' => 'required|file|mimes:csv,txt|max:10240',
            'duplicate_action' => 'required|in:skip,update,stop',
            'dry_run' => 'boolean',
        ]);

        $file = $request->file('file');
        $duplicateAction = $request->input('duplicate_action');
        $dryRun = $request->boolean('dry_run', false);

        $rows = $this->parseCsv($file);
        if (empty($rows)) {
            return response()->json([
                'success' => false,
                'message' => 'The CSV file is empty or has invalid headers.',
            ], 422);
        }

        $rows = $this->sanitizeArray($rows);

        $expectedHeaders = ['company_id', 'branch_id', 'name', 'sku', 'barcode', 'brand', 'unit',
            'purchase_price', 'sale_price', 'tax_rate', 'stock_quantity',
            'reorder_level', 'description', 'active'];
        $headers = array_keys($rows[0]);
        if (array_diff($expectedHeaders, $headers)) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid CSV headers. Please use the template.',
            ], 422);
        }

        $previewRows = [];
        $errors = [];
        $validCount = 0;
        $allSku = [];

        $companyIds = array_unique(array_column($rows, 'company_id'));
        $companies = Company::whereIn('id', $companyIds)->pluck('id')->toArray();
        $branches = Branch::whereIn('company_id', $companyIds)->get()->groupBy('company_id')->map->pluck('id')->toArray();

        foreach ($rows as $index => $row) {
            $rowNumber = $index + 1;
            $rowErrors = [];

            if (empty($row['company_id']) || !in_array($row['company_id'], $companies)) {
                $rowErrors['company_id'] = 'Invalid or missing company ID.';
            }
            if (empty($row['name'])) $rowErrors['name'] = 'Name is required.';
            if (empty($row['sku'])) $rowErrors['sku'] = 'SKU is required.';
            if (!isset($row['sale_price']) || $row['sale_price'] === '' || !is_numeric($row['sale_price']) || $row['sale_price'] < 0) {
                $rowErrors['sale_price'] = 'Sale price is required and must be non-negative.';
            }
            if (!isset($row['stock_quantity']) || $row['stock_quantity'] === '' || !is_numeric($row['stock_quantity']) || $row['stock_quantity'] < 0) {
                $rowErrors['stock_quantity'] = 'Stock quantity is required and must be non-negative.';
            }

            if (!empty($row['branch_id'])) {
                $branchId = $row['branch_id'];
                if (!isset($branches[$row['company_id']]) || !in_array($branchId, $branches[$row['company_id']])) {
                    $rowErrors['branch_id'] = 'Branch does not belong to the given company.';
                }
            }

            if (!empty($row['sku'])) {
                if (in_array($row['sku'], $allSku)) {
                    $rowErrors['sku'] = 'Duplicate SKU within the file.';
                } else {
                    $allSku[] = $row['sku'];
                    $existing = Product::where('sku', $row['sku'])->first();
                    if ($existing) {
                        if ($duplicateAction === 'stop') {
                            $rowErrors['sku'] = 'SKU already exists in database (stop action).';
                        } elseif ($duplicateAction === 'skip') {
                            $row['_duplicate'] = true;
                        } elseif ($duplicateAction === 'update') {
                            $row['_existing_id'] = $existing->id;
                        }
                    }
                }
            }

            if (!empty($row['barcode'])) {
                $existingBarcode = Product::where('barcode', $row['barcode'])->first();
                if ($existingBarcode) {
                    if (!isset($row['_existing_id']) || $existingBarcode->id !== $row['_existing_id']) {
                        $rowErrors['barcode'] = 'Barcode already exists in database.';
                    }
                }
            }

            $numericFields = ['purchase_price', 'sale_price', 'tax_rate', 'stock_quantity', 'reorder_level'];
            foreach ($numericFields as $field) {
                if (isset($row[$field]) && $row[$field] !== '' && !is_numeric($row[$field])) {
                    $rowErrors[$field] = "{$field} must be a number.";
                }
                if (isset($row[$field]) && is_numeric($row[$field]) && $row[$field] < 0) {
                    $rowErrors[$field] = "{$field} cannot be negative.";
                }
            }

            if (isset($row['active']) && $row['active'] !== '') {
                if (!in_array(strtolower($row['active']), ['1', '0', 'true', 'false', 'yes', 'no', 'active', 'inactive'])) {
                    $rowErrors['active'] = 'Active must be 1/0, true/false, yes/no, or active/inactive.';
                }
            }

            $valid = empty($rowErrors);
            if ($valid) $validCount++;

            // Convert numeric fields: empty -> 0
            $rowData = $row;
            foreach ($numericFields as $field) {
                if (isset($rowData[$field]) && $rowData[$field] !== '') {
                    $rowData[$field] = (float) $rowData[$field];
                } else {
                    $rowData[$field] = 0;
                }
            }

            // Set empty barcode to null
            if (isset($rowData['barcode']) && trim((string)$rowData['barcode']) === '') {
                $rowData['barcode'] = null;
            }

            if (isset($rowData['active']) && $rowData['active'] !== '') {
                $val = strtolower($rowData['active']);
                $rowData['active'] = in_array($val, ['1', 'true', 'yes', 'active']);
            } else {
                $rowData['active'] = true;
            }

            $rowData = $this->sanitizeArray($rowData);

            $previewRows[] = [
                'row' => $rowNumber,
                'data' => $rowData,
                'valid' => $valid,
                'errors' => $rowErrors,
                'sku' => $rowData['sku'] ?? '',
                'name' => $rowData['name'] ?? '',
            ];

            if (!$valid) {
                $errors[] = ['row' => $rowNumber, 'field' => implode(', ', array_keys($rowErrors)), 'message' => implode('; ', $rowErrors)];
            }
        }

        if ($dryRun) {
            return response()->json([
                'preview' => $previewRows,
                'errors' => $errors,
                'total' => count($rows),
                'valid' => $validCount,
                'invalid' => count($rows) - $validCount,
            ]);
        }

        $created = 0;
        $updated = 0;
        $skipped = 0;
        $failed = 0;

        DB::beginTransaction();
        try {
            foreach ($previewRows as $previewRow) {
                if (!$previewRow['valid']) {
                    $failed++;
                    continue;
                }
                $data = $previewRow['data'];
                unset($data['_duplicate'], $data['_existing_id']);

                if (isset($data['barcode']) && trim((string)$data['barcode']) === '') {
                    $data['barcode'] = null;
                }

                if ($duplicateAction === 'skip' && isset($previewRow['data']['_duplicate'])) {
                    $skipped++;
                    continue;
                }

                if ($duplicateAction === 'update' && isset($previewRow['data']['_existing_id'])) {
                    $product = Product::find($previewRow['data']['_existing_id']);
                    if ($product) {
                        $product->fill($data)->save();
                        $updated++;
                        continue;
                    }
                }

                Product::create($data);
                $created++;
            }
            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Import completed successfully.',
                'summary' => [
                    'total' => count($rows),
                    'created' => $created,
                    'updated' => $updated,
                    'skipped' => $skipped,
                    'failed' => $failed,
                ],
                'errors' => $errors,
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Import failed: ' . $e->getMessage(),
                'summary' => [
                    'total' => count($rows),
                    'created' => 0,
                    'updated' => 0,
                    'skipped' => 0,
                    'failed' => count($rows),
                ],
                'errors' => $errors,
            ], 500);
        }
    }

    /**
     * Parse CSV file and return non-empty rows.
     */
    private function parseCsv($file)
    {
        $rows = [];
        $handle = fopen($file->getRealPath(), 'r');
        if (!$handle) return [];

        $headers = fgetcsv($handle);
        if (!$headers) {
            fclose($handle);
            return [];
        }

        $headers = array_map('trim', $headers);

        while (($row = fgetcsv($handle)) !== false) {
            if (count($row) < count($headers)) {
                $row = array_pad($row, count($headers), '');
            } elseif (count($row) > count($headers)) {
                $row = array_slice($row, 0, count($headers));
            }

            $assoc = array_combine($headers, $row);

            $allEmpty = true;
            foreach ($assoc as $value) {
                if ($value !== null && trim((string)$value) !== '') {
                    $allEmpty = false;
                    break;
                }
            }
            if ($allEmpty) {
                continue;
            }

            $rows[] = $assoc;
        }
        fclose($handle);
        return $rows;
    }

    /**
     * Export products as CSV.
     */
    public function export(Request $request)
    {
        $query = Product::query();

        if ($request->filled('company_id')) {
            $query->where('company_id', $request->company_id);
        }
        if ($request->filled('branch_id')) {
            $query->where('branch_id', $request->branch_id);
        }
        if ($request->filled('brand')) {
            $query->where('brand', $request->brand);
        }
        if ($request->filled('status')) {
            $status = $request->status;
            if ($status === 'active') $query->where('active', true);
            elseif ($status === 'inactive') $query->where('active', false);
            elseif ($status === 'in_stock') $query->whereColumn('stock_quantity', '>', 'reorder_level');
            elseif ($status === 'low') $query->where('stock_quantity', '>', 0)->whereColumn('stock_quantity', '<=', 'reorder_level');
            elseif ($status === 'out') $query->where('stock_quantity', '<=', 0);
        }
        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'LIKE', "%{$search}%")
                  ->orWhere('sku', 'LIKE', "%{$search}%")
                  ->orWhere('barcode', 'LIKE', "%{$search}%")
                  ->orWhere('brand', 'LIKE', "%{$search}%")
                  ->orWhere('description', 'LIKE', "%{$search}%");
            });
        }
        if ($request->filled('selected_ids')) {
            $ids = explode(',', $request->selected_ids);
            $query->whereIn('id', $ids);
        }

        $products = $query->with(['company', 'branch'])->get();

        if ($products->isEmpty()) {
            return response()->json(['message' => 'No products to export.'], 404);
        }

        $headers = [
            'ID', 'Company', 'Branch', 'Company ID', 'Branch ID', 'Name', 'SKU', 'Barcode',
            'Brand', 'Unit', 'Purchase Price', 'Sale Price', 'Tax Rate', 'Stock Quantity',
            'Reorder Level', 'Description', 'Status', 'Created At', 'Updated At'
        ];

        $rows = $products->map(function ($product) {
            return [
                $product->id,
                $product->company->name ?? '',
                $product->branch->name ?? '',
                $product->company_id,
                $product->branch_id,
                $product->name,
                $product->sku,
                $product->barcode,
                $product->brand,
                $product->unit,
                number_format($product->purchase_price, 2),
                number_format($product->sale_price, 2),
                number_format($product->tax_rate, 2),
                $product->stock_quantity,
                $product->reorder_level,
                $product->description,
                $product->active ? 'Active' : 'Inactive',
                $product->created_at,
                $product->updated_at,
            ];
        })->toArray();

        $output = fopen('php://temp', 'r+');
        fputcsv($output, $headers);
        foreach ($rows as $row) {
            fputcsv($output, $row);
        }
        rewind($output);
        $csv = stream_get_contents($output);
        fclose($output);

        return response($csv, 200, [
            'Content-Type' => 'text/csv',
            'Content-Disposition' => "attachment; filename=\"inventory-export-".date('Y-m-d').".csv\"",
        ]);
    }

    /**
     * Download CSV template for import.
     */
    public function template()
    {
        $headers = [
            'company_id', 'branch_id', 'name', 'sku', 'barcode', 'brand', 'unit',
            'purchase_price', 'sale_price', 'tax_rate', 'stock_quantity',
            'reorder_level', 'description', 'active'
        ];

        $output = fopen('php://temp', 'r+');
        fputcsv($output, $headers);
        rewind($output);
        $csv = stream_get_contents($output);
        fclose($output);

        return response($csv, 200, [
            'Content-Type' => 'text/csv',
            'Content-Disposition' => "attachment; filename=\"inventory_template.csv\"",
        ]);
    }

    /**
     * Display the specified product.
     */
    public function show(Product $product)
    {
        return $product->load(['company', 'branch']);
    }

    /**
     * Update the specified product in storage.
     * Also tracks stock_quantity changes and creates adjustment movements.
     */
    public function update(Request $request, Product $product)
    {
        $data = $request->validate([
            'company_id' => 'required|exists:companies,id',
            'branch_id' => 'nullable|exists:branches,id',
            'name' => 'required|string|max:255',
            'sku' => 'required|string|max:100|unique:products,sku,' . $product->id,
            'barcode' => 'nullable|string|max:100|unique:products,barcode,' . $product->id,
            'brand' => 'nullable|string|max:255',
            'unit' => 'nullable|string|max:50',
            'purchase_price' => 'nullable|numeric|min:0',
            'sale_price' => 'nullable|numeric|min:0',
            'tax_rate' => 'nullable|numeric|min:0',
            'stock_quantity' => 'nullable|integer|min:0',
            'reorder_level' => 'nullable|integer|min:0',
            'description' => 'nullable|string',
            'active' => 'boolean',
        ]);

        $oldStock = $product->stock_quantity;
        $data = $this->prepareProductData($data);

        $product->update($data);

        // Adjust stock if stock_quantity changed
        if ($oldStock != $product->stock_quantity) {
            $difference = $product->stock_quantity - $oldStock;
            if ($difference > 0) {
                $this->adjustStock($product, $difference, 'IN', 'adjustment', 'Manual stock increase');
            } else {
                $this->adjustStock($product, abs($difference), 'OUT', 'adjustment', 'Manual stock decrease');
            }
        }

        return $product;
    }

    /**
     * Remove the specified product from storage.
     */
    public function destroy(Product $product)
    {
        $product->delete();
        return response()->noContent();
    }

    // ======================= INVENTORY ENDPOINTS =======================

    /**
     * Get inventory summary for a product.
     */
    public function inventorySummary(Product $product)
    {
        // $this->authorize('inventory.view'); // Uncomment if you have policy set

        $totalStock = $product->warehouseStocks()->sum('quantity');
        $reservedStock = $product->warehouseStocks()->sum('reserved_quantity');
        $availableStock = $product->warehouseStocks()->sum('available_quantity');

        $lastPurchase = $product->purchasePriceHistory()
            ->latest('purchase_date')
            ->first();

        $averagePurchase = $product->purchasePriceHistory()
            ->avg('unit_price');

        $lastSale = $product->stockMovements()
            ->where('reference_type', 'sale')
            ->latest('transaction_date')
            ->first();

        return response()->json([
            'success' => true,
            'data' => [
                'total_stock' => $totalStock,
                'reserved_stock' => $reservedStock,
                'available_stock' => $availableStock,
                'last_purchase_price' => $lastPurchase ? $lastPurchase->unit_price : null,
                'average_purchase_price' => $averagePurchase,
                'last_sale_price' => $lastSale ? $lastSale->unit_price : null,
            ]
        ]);
    }

    /**
     * Get warehouse-wise stock for a product.
     */
    public function warehouseStock(Product $product)
    {
        // $this->authorize('inventory.view');

        $stocks = $product->warehouseStocks()
            ->with('warehouse:id,name')
            ->get()
            ->map(function ($stock) {
                return [
                    'warehouse_id' => $stock->warehouse_id,
                    'warehouse_name' => $stock->warehouse->name ?? 'Unknown',
                    'quantity' => $stock->quantity,
                    'reserved_quantity' => $stock->reserved_quantity,
                    'available_quantity' => $stock->available_quantity,
                    'average_cost' => $stock->average_cost,
                    'last_purchase_price' => $stock->last_purchase_price,
                ];
            });

        return response()->json([
            'success' => true,
            'data' => $stocks,
        ]);
    }

    /**
     * Get stock movements for a product with optional filters.
     */
    public function stockMovements(Request $request, Product $product)
    {
        // $this->authorize('inventory.view');

        $query = $product->stockMovements()
            ->with(['warehouse:id,name', 'creator:id,name']);

        if ($request->filled('warehouse_id')) {
            $query->where('warehouse_id', $request->warehouse_id);
        }
        if ($request->filled('transaction_type')) {
            $query->where('transaction_type', $request->transaction_type);
        }
        if ($request->filled('reference_type')) {
            $query->where('reference_type', $request->reference_type);
        }
        if ($request->filled('reference_id')) {
            $query->where('reference_id', $request->reference_id);
        }
        if ($request->filled('user_id')) {
            $query->where('created_by', $request->user_id);
        }
        if ($request->filled('date_from')) {
            $query->whereDate('transaction_date', '>=', $request->date_from);
        }
        if ($request->filled('date_to')) {
            $query->whereDate('transaction_date', '<=', $request->date_to);
        }

        $perPage = $request->input('per_page', 20);
        $movements = $query->orderBy('transaction_date', 'desc')
            ->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => $movements,
        ]);
    }

    /**
     * Get purchase price history for a product.
     */
    public function purchasePriceHistory(Request $request, Product $product)
    {
        // $this->authorize('inventory.price_history');

        $perPage = $request->input('per_page', 20);
        $history = $product->purchasePriceHistory()
            ->with(['supplier:id,name'])
            ->orderBy('purchase_date', 'desc')
            ->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => $history,
        ]);
    }

    /**
     * Get bill-wise transactions (sales/purchases) for a product.
     */
    public function transactions(Request $request, Product $product)
    {
        // $this->authorize('inventory.view');

        // Sales
        $sales = $product->saleItems()
            ->with(['sale.customer:id,name', 'sale' => function($q) {
                $q->select('id', 'customer_id', 'invoice_number', 'sale_date', 'total_amount', 'discount', 'tax');
            }])
            ->get()
            ->map(function ($item) {
                return [
                    'type' => 'sale',
                    'bill_number' => $item->sale->invoice_number ?? 'N/A',
                    'party_name' => $item->sale->customer->name ?? 'Unknown',
                    'date' => $item->sale->sale_date ?? $item->created_at,
                    'unit_price' => $item->unit_price,
                    'price_with_tax' => $item->unit_price * (1 + $item->tax_rate / 100),
                    'quantity' => $item->quantity,
                    'item_discount' => $item->discount_percentage ?? 0,
                    'item_net' => $item->total_price,
                    'item_total' => $item->total_price,
                ];
            });

        // Purchases
        $purchases = $product->purchaseItems()
            ->with(['purchase.supplier:id,name', 'purchase' => function($q) {
                $q->select('id', 'supplier_id', 'bill_number', 'purchase_date', 'total_amount');
            }])
            ->get()
            ->map(function ($item) {
                return [
                    'type' => 'purchase',
                    'bill_number' => $item->purchase->bill_number ?? 'N/A',
                    'party_name' => $item->purchase->supplier->name ?? 'Unknown',
                    'date' => $item->purchase->purchase_date ?? $item->created_at,
                    'unit_price' => $item->unit_price,
                    'price_with_tax' => $item->unit_price,
                    'quantity' => $item->quantity,
                    'item_discount' => 0,
                    'item_net' => $item->total_price,
                    'item_total' => $item->total_price,
                ];
            });

        $all = $sales->concat($purchases)->sortByDesc('date');

        return response()->json([
            'success' => true,
            'data' => $all->values(),
        ]);
    }

    /**
     * Get party-wise transactions for a product.
     */
    public function partyTransactions(Request $request, Product $product)
    {
        // $this->authorize('inventory.view');

        $transactions = $this->transactions($request, $product)->original['data'] ?? [];
        $grouped = collect($transactions)->groupBy('party_name');

        return response()->json([
            'success' => true,
            'data' => $grouped,
        ]);
    }

    /**
     * Get current price list for a product.
     */
    public function priceList(Product $product)
    {
        // $this->authorize('inventory.view');

        return response()->json([
            'success' => true,
            'data' => [
                'purchase_price' => $product->purchase_price,
                'sale_price' => $product->sale_price,
                'mrp' => $product->mrp ?? null,
                'wholesale_price' => $product->wholesale_price ?? null,
                'dealer_price' => $product->dealer_price ?? null,
                'distributor_price' => $product->distributor_price ?? null,
                'tax_rate' => $product->tax_rate,
                'discount' => $product->discount ?? 0,
            ],
        ]);
    }

    /**
     * Manual Stock IN.
     */
    public function stockIn(Request $request, Product $product)
    {
        // $this->authorize('inventory.stock_in');

        $data = $request->validate([
            'warehouse_id' => 'required|exists:warehouses,id',
            'quantity' => 'required|integer|min:1',
            'unit_cost' => 'nullable|numeric|min:0',
            'reference_type' => 'required|in:purchase,return,adjustment,transfer,opening_stock,manual,other',
            'reference_id' => 'nullable|string|max:100',
            'transaction_date' => 'required|date',
            'remark' => 'nullable|string|max:255',
        ]);

        try {
            DB::beginTransaction();

            $stock = ProductWarehouseStock::firstOrCreate(
                [
                    'product_id' => $product->id,
                    'warehouse_id' => $data['warehouse_id'],
                ],
                [
                    'company_id' => $product->company_id,
                    'branch_id' => $product->branch_id,
                    'quantity' => 0,
                    'reserved_quantity' => 0,
                    'available_quantity' => 0,
                    'average_cost' => 0,
                ]
            );
            $stock->lockForUpdate();

            $before = $stock->quantity;
            $after = $before + $data['quantity'];

            $stock->quantity = $after;
            $stock->available_quantity = $after - $stock->reserved_quantity;

            if (!is_null($data['unit_cost'])) {
                $totalCost = ($stock->average_cost * $before) + ($data['unit_cost'] * $data['quantity']);
                $stock->average_cost = $after > 0 ? round($totalCost / $after, 2) : 0;
                $stock->last_purchase_price = $data['unit_cost'];
            }

            $stock->save();

            StockMovement::create([
                'product_id' => $product->id,
                'warehouse_id' => $data['warehouse_id'],
                'company_id' => $product->company_id,
                'branch_id' => $product->branch_id,
                'transaction_type' => 'IN',
                'reference_type' => $data['reference_type'],
                'reference_id' => $data['reference_id'] ?? null,
                'quantity' => $data['quantity'],
                'unit_price' => $data['unit_cost'] ?? 0,
                'stock_before' => $before,
                'stock_after' => $after,
                'remark' => $data['remark'] ?? null,
                'transaction_date' => $data['transaction_date'],
                'created_by' => Auth::id(),
            ]);

            if ($data['reference_type'] === 'purchase') {
                ProductPurchasePriceHistory::create([
                    'product_id' => $product->id,
                    'bill_number' => $data['reference_id'] ?? null,
                    'quantity' => $data['quantity'],
                    'unit_price' => $data['unit_cost'] ?? 0,
                    'purchase_date' => $data['transaction_date'],
                ]);
            }

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Stock IN successful',
                'data' => [
                    'product_id' => $product->id,
                    'warehouse_id' => $data['warehouse_id'],
                    'stock_before' => $before,
                    'quantity' => $data['quantity'],
                    'stock_after' => $after,
                ],
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Stock IN failed: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Manual Stock OUT.
     */
    public function stockOut(Request $request, Product $product)
    {
        // $this->authorize('inventory.stock_out');

        $data = $request->validate([
            'warehouse_id' => 'required|exists:warehouses,id',
            'quantity' => 'required|integer|min:1',
            'unit_price' => 'nullable|numeric|min:0',
            'reference_type' => 'required|in:sale,return,adjustment,transfer,manual,other',
            'reference_id' => 'nullable|string|max:100',
            'transaction_date' => 'required|date',
            'remark' => 'nullable|string|max:255',
        ]);

        try {
            DB::beginTransaction();

            $stock = ProductWarehouseStock::where([
                'product_id' => $product->id,
                'warehouse_id' => $data['warehouse_id'],
            ])->lockForUpdate()->first();

            if (!$stock) {
                return response()->json([
                    'success' => false,
                    'message' => 'No stock record found for this warehouse.',
                ], 404);
            }

            $available = $stock->available_quantity;
            if ($data['quantity'] > $available) {
                DB::rollBack();
                return response()->json([
                    'success' => false,
                    'message' => "Insufficient stock. Available: {$available}, Requested: {$data['quantity']}",
                ], 422);
            }

            $before = $stock->quantity;
            $after = $before - $data['quantity'];

            $stock->quantity = $after;
            $stock->available_quantity = $after - $stock->reserved_quantity;
            $stock->save();

            StockMovement::create([
                'product_id' => $product->id,
                'warehouse_id' => $data['warehouse_id'],
                'company_id' => $product->company_id,
                'branch_id' => $product->branch_id,
                'transaction_type' => 'OUT',
                'reference_type' => $data['reference_type'],
                'reference_id' => $data['reference_id'] ?? null,
                'quantity' => $data['quantity'],
                'unit_price' => $data['unit_price'] ?? 0,
                'stock_before' => $before,
                'stock_after' => $after,
                'remark' => $data['remark'] ?? null,
                'transaction_date' => $data['transaction_date'],
                'created_by' => Auth::id(),
            ]);

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Stock OUT successful',
                'data' => [
                    'product_id' => $product->id,
                    'warehouse_id' => $data['warehouse_id'],
                    'stock_before' => $before,
                    'quantity' => $data['quantity'],
                    'stock_after' => $after,
                ],
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Stock OUT failed: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Warehouse Transfer.
     */
    public function transfer(Request $request, Product $product)
    {
        // $this->authorize('inventory.transfer');

        $data = $request->validate([
            'from_warehouse_id' => 'required|exists:warehouses,id|different:to_warehouse_id',
            'to_warehouse_id' => 'required|exists:warehouses,id',
            'quantity' => 'required|integer|min:1',
            'remark' => 'nullable|string|max:255',
            'transaction_date' => 'required|date',
        ]);

        try {
            DB::beginTransaction();

            $fromStock = ProductWarehouseStock::where([
                'product_id' => $product->id,
                'warehouse_id' => $data['from_warehouse_id'],
            ])->lockForUpdate()->first();

            if (!$fromStock || $fromStock->available_quantity < $data['quantity']) {
                DB::rollBack();
                return response()->json([
                    'success' => false,
                    'message' => 'Insufficient stock in source warehouse.',
                ], 422);
            }

            $fromBefore = $fromStock->quantity;
            $fromAfter = $fromBefore - $data['quantity'];
            $fromStock->quantity = $fromAfter;
            $fromStock->available_quantity = $fromAfter - $fromStock->reserved_quantity;
            $fromStock->save();

            $toStock = ProductWarehouseStock::firstOrCreate(
                [
                    'product_id' => $product->id,
                    'warehouse_id' => $data['to_warehouse_id'],
                ],
                [
                    'company_id' => $product->company_id,
                    'branch_id' => $product->branch_id,
                    'quantity' => 0,
                    'reserved_quantity' => 0,
                    'available_quantity' => 0,
                    'average_cost' => $fromStock->average_cost,
                ]
            );
            $toStock->lockForUpdate();

            $toBefore = $toStock->quantity;
            $toAfter = $toBefore + $data['quantity'];
            $toStock->quantity = $toAfter;
            $toStock->available_quantity = $toAfter - $toStock->reserved_quantity;
            $toStock->average_cost = $fromStock->average_cost;
            $toStock->save();

            $transferRef = 'TRF-' . uniqid();

            StockMovement::create([
                'product_id' => $product->id,
                'warehouse_id' => $data['from_warehouse_id'],
                'company_id' => $product->company_id,
                'branch_id' => $product->branch_id,
                'transaction_type' => 'OUT',
                'reference_type' => 'transfer',
                'reference_id' => $transferRef,
                'quantity' => $data['quantity'],
                'unit_price' => $fromStock->average_cost,
                'stock_before' => $fromBefore,
                'stock_after' => $fromAfter,
                'remark' => $data['remark'] ?? 'Transfer OUT',
                'transaction_date' => $data['transaction_date'],
                'created_by' => Auth::id(),
            ]);

            StockMovement::create([
                'product_id' => $product->id,
                'warehouse_id' => $data['to_warehouse_id'],
                'company_id' => $product->company_id,
                'branch_id' => $product->branch_id,
                'transaction_type' => 'IN',
                'reference_type' => 'transfer',
                'reference_id' => $transferRef,
                'quantity' => $data['quantity'],
                'unit_price' => $fromStock->average_cost,
                'stock_before' => $toBefore,
                'stock_after' => $toAfter,
                'remark' => $data['remark'] ?? 'Transfer IN',
                'transaction_date' => $data['transaction_date'],
                'created_by' => Auth::id(),
            ]);

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Warehouse transfer successful',
                'data' => [
                    'transfer_ref' => $transferRef,
                    'from_warehouse_id' => $data['from_warehouse_id'],
                    'to_warehouse_id' => $data['to_warehouse_id'],
                    'quantity' => $data['quantity'],
                ],
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Transfer failed: ' . $e->getMessage(),
            ], 500);
        }
    }

    // ======================= PRIVATE HELPER METHODS =======================

    /**
     * Create initial stock record when product is first created with stock.
     */
    private function createInitialStock(Product $product, int $warehouseId)
    {
        DB::transaction(function () use ($product, $warehouseId) {
            ProductWarehouseStock::create([
                'product_id' => $product->id,
                'warehouse_id' => $warehouseId,
                'company_id' => $product->company_id,
                'branch_id' => $product->branch_id,
                'quantity' => $product->stock_quantity,
                'reserved_quantity' => 0,
                'available_quantity' => $product->stock_quantity,
                'average_cost' => $product->purchase_price,
                'last_purchase_price' => $product->purchase_price,
            ]);

            StockMovement::create([
                'product_id' => $product->id,
                'warehouse_id' => $warehouseId,
                'company_id' => $product->company_id,
                'branch_id' => $product->branch_id,
                'transaction_type' => 'IN',
                'reference_type' => 'opening_stock',
                'reference_id' => null,
                'quantity' => $product->stock_quantity,
                'unit_price' => $product->purchase_price,
                'stock_before' => 0,
                'stock_after' => $product->stock_quantity,
                'remark' => 'Opening stock',
                'transaction_date' => now(),
                'created_by' => Auth::id(),
            ]);
        });
    }

    /**
     * Adjust stock for a product (used on update when stock_quantity changes).
     */
    private function adjustStock(Product $product, int $qty, string $type, string $refType, string $remark)
    {
        $warehouse = $product->warehouseStocks()->first();
        if (!$warehouse) {
            $defaultWarehouse = Warehouse::first();
            if (!$defaultWarehouse) return;
            $warehouse = ProductWarehouseStock::create([
                'product_id' => $product->id,
                'warehouse_id' => $defaultWarehouse->id,
                'company_id' => $product->company_id,
                'branch_id' => $product->branch_id,
                'quantity' => 0,
                'reserved_quantity' => 0,
                'available_quantity' => 0,
                'average_cost' => 0,
            ]);
        }

        DB::transaction(function () use ($product, $warehouse, $qty, $type, $refType, $remark) {
            $stock = ProductWarehouseStock::where('id', $warehouse->id)->lockForUpdate()->first();
            $before = $stock->quantity;
            $after = $type === 'IN' ? $before + $qty : $before - $qty;
            if ($after < 0) {
                throw new \Exception('Stock cannot be negative');
            }
            $stock->quantity = $after;
            $stock->available_quantity = $after - $stock->reserved_quantity;
            $stock->save();

            StockMovement::create([
                'product_id' => $product->id,
                'warehouse_id' => $stock->warehouse_id,
                'company_id' => $product->company_id,
                'branch_id' => $product->branch_id,
                'transaction_type' => $type,
                'reference_type' => $refType,
                'reference_id' => null,
                'quantity' => $qty,
                'unit_price' => $product->purchase_price,
                'stock_before' => $before,
                'stock_after' => $after,
                'remark' => $remark,
                'transaction_date' => now(),
                'created_by' => Auth::id(),
            ]);
        });
    }

    /**
     * Prepare product data: set empty barcode to null, apply default numeric values.
     */
    private function prepareProductData(array $data): array
    {
        if (isset($data['barcode']) && trim($data['barcode']) === '') {
            $data['barcode'] = null;
        }
        $data['purchase_price'] = $data['purchase_price'] ?? 0;
        $data['tax_rate'] = $data['tax_rate'] ?? 0;
        $data['reorder_level'] = $data['reorder_level'] ?? 0;
        $data['stock_quantity'] = $data['stock_quantity'] ?? 0;
        return $data;
    }
}