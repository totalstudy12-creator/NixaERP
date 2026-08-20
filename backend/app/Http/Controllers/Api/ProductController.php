<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\Company;
use App\Models\Branch;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProductController extends Controller
{
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
        ]);

        // Set empty barcode to null (to avoid unique constraint violation with empty strings)
        if (isset($data['barcode']) && trim($data['barcode']) === '') {
            $data['barcode'] = null;
        }

        // Apply default 0 for optional numeric fields to avoid DB NOT NULL errors
        $data['purchase_price'] = $data['purchase_price'] ?? 0;
        $data['tax_rate'] = $data['tax_rate'] ?? 0;
        $data['reorder_level'] = $data['reorder_level'] ?? 0;
        $data['stock_quantity'] = $data['stock_quantity'] ?? 0;

        return Product::create($data);
    }

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

    private function sanitizeArray(array $data): array
    {
        array_walk_recursive($data, function (&$value) {
            $value = $this->sanitizeString($value);
        });
        return $data;
    }

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

            // Convert numeric fields: empty -> 0 (NOT NULL columns require a value)
            $rowData = $row;
            foreach ($numericFields as $field) {
                if (isset($rowData[$field]) && $rowData[$field] !== '') {
                    $rowData[$field] = (float) $rowData[$field];
                } else {
                    $rowData[$field] = 0;
                }
            }

            // Set empty barcode to null to avoid unique constraint violation
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

                // Ensure empty barcode is null before insert/update
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
     * Skips completely blank rows (e.g., trailing newline at end of file).
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

        // Trim header names to avoid accidental spaces
        $headers = array_map('trim', $headers);

        while (($row = fgetcsv($handle)) !== false) {
            // Pad or truncate row to match header count
            if (count($row) < count($headers)) {
                $row = array_pad($row, count($headers), '');
            } elseif (count($row) > count($headers)) {
                $row = array_slice($row, 0, count($headers));
            }

            $assoc = array_combine($headers, $row);

            // Skip row if all values are null or empty after trimming
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

    public function show(Product $product)
    {
        return $product->load(['company', 'branch']);
    }

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

        // Set empty barcode to null
        if (isset($data['barcode']) && trim($data['barcode']) === '') {
            $data['barcode'] = null;
        }

        // Apply default 0 for optional numeric fields
        $data['purchase_price'] = $data['purchase_price'] ?? 0;
        $data['tax_rate'] = $data['tax_rate'] ?? 0;
        $data['reorder_level'] = $data['reorder_level'] ?? 0;
        $data['stock_quantity'] = $data['stock_quantity'] ?? 0;

        $product->update($data);
        return $product;
    }

    public function destroy(Product $product)
    {
        $product->delete();
        return response()->noContent();
    }
}