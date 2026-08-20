<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Company;
use App\Models\Branch;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\DB;

class CustomerController extends Controller
{
    public function index()
    {
        return Customer::with(['company', 'branch', 'group'])
            ->orderBy('name')
            ->paginate(15);
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), $this->rules());

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $customer = Customer::create($validator->validated());

        return response()->json($customer->load(['company', 'branch', 'group']), 201);
    }

    public function show(Customer $customer)
    {
        return $customer->load(['company', 'branch', 'group']);
    }

    public function update(Request $request, Customer $customer)
    {
        $validator = Validator::make($request->all(), $this->rules());

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $customer->update($validator->validated());

        return $customer->fresh(['company', 'branch', 'group']);
    }

    public function destroy(Customer $customer)
    {
        $customer->delete();

        return response()->noContent();
    }

    // ---------------- Import ----------------
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

        $expectedHeaders = [
            'company_id', 'branch_id', 'name', 'type', 'company_type', 'email',
            'contact_person', 'contact_no', 'gst_number', 'registration_type',
            'pan', 'billing_street', 'billing_landmark', 'billing_city',
            'billing_state', 'billing_country', 'billing_pincode',
            'shipping_street', 'shipping_landmark', 'shipping_city',
            'shipping_state', 'shipping_country', 'shipping_pincode',
            'eway_bill_distance', 'group_id', 'opening_balance', 'credit_limit',
            'due_days', 'fax', 'website', 'note', 'license_no',
            'custom_field_1', 'custom_field_2', 'is_active'
        ];

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
        $companyIds = array_unique(array_column($rows, 'company_id'));
        $companies = Company::whereIn('id', $companyIds)->pluck('id')->toArray();
        $branches = Branch::whereIn('company_id', $companyIds)->get()->groupBy('company_id')->map->pluck('id')->toArray();

        foreach ($rows as $index => $row) {
            $rowNumber = $index + 1;
            $rowErrors = [];

            if (empty($row['company_id']) || !in_array($row['company_id'], $companies)) {
                $rowErrors['company_id'] = 'Invalid or missing company ID.';
            }
            if (empty($row['name'])) {
                $rowErrors['name'] = 'Name is required.';
            }
            if (empty($row['billing_city'])) {
                $rowErrors['billing_city'] = 'Billing city is required.';
            }

            if (!empty($row['email']) && !filter_var($row['email'], FILTER_VALIDATE_EMAIL)) {
                $rowErrors['email'] = 'Invalid email format.';
            }
            if (!empty($row['branch_id'])) {
                $branchId = $row['branch_id'];
                if (!isset($branches[$row['company_id']]) || !in_array($branchId, $branches[$row['company_id']])) {
                    $rowErrors['branch_id'] = 'Branch does not belong to the given company.';
                }
            }

            $numericFields = ['eway_bill_distance', 'opening_balance', 'credit_limit', 'due_days'];
            foreach ($numericFields as $field) {
                if (isset($row[$field]) && $row[$field] !== '' && !is_numeric($row[$field])) {
                    $rowErrors[$field] = "{$field} must be a number.";
                }
                if (isset($row[$field]) && is_numeric($row[$field]) && $row[$field] < 0) {
                    $rowErrors[$field] = "{$field} cannot be negative.";
                }
            }

            $duplicateFound = null;
            if (!empty($row['email'])) {
                $duplicateFound = Customer::where('email', $row['email'])->first();
            } elseif (!empty($row['contact_no'])) {
                $duplicateFound = Customer::where('contact_no', $row['contact_no'])->first();
            } elseif (!empty($row['name']) && !empty($row['company_id'])) {
                $duplicateFound = Customer::where('name', $row['name'])
                    ->where('company_id', $row['company_id'])
                    ->first();
            }

            if ($duplicateFound) {
                if ($duplicateAction === 'stop') {
                    $rowErrors['duplicate'] = 'Duplicate customer found (stop action).';
                } elseif ($duplicateAction === 'skip') {
                    $row['_duplicate'] = true;
                } elseif ($duplicateAction === 'update') {
                    $row['_existing_id'] = $duplicateFound->id;
                }
            }

            $valid = empty($rowErrors);
            if ($valid) $validCount++;

            $rowData = $row;
            foreach ($numericFields as $field) {
                if (isset($rowData[$field]) && $rowData[$field] !== '') {
                    $rowData[$field] = (float) $rowData[$field];
                } else {
                    $rowData[$field] = null;
                }
            }
            $rowData['is_active'] = isset($rowData['is_active']) && strtolower($rowData['is_active']) === 'false' ? false : true;
            $rowData['company_id'] = (int) $rowData['company_id'];
            $rowData['branch_id'] = !empty($rowData['branch_id']) ? (int) $rowData['branch_id'] : null;
            $rowData['group_id'] = !empty($rowData['group_id']) ? (int) $rowData['group_id'] : null;

            unset($rowData['_duplicate'], $rowData['_existing_id']);

            $previewRows[] = [
                'row' => $rowNumber,
                'data' => $rowData,
                'valid' => $valid,
                'errors' => $rowErrors,
                'name' => $rowData['name'] ?? '',
                'email' => $rowData['email'] ?? '',
            ];

            if (!$valid) {
                $errors[] = [
                    'row' => $rowNumber,
                    'field' => implode(', ', array_keys($rowErrors)),
                    'message' => implode('; ', $rowErrors),
                ];
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

                if (isset($previewRow['data']['_duplicate']) && $previewRow['data']['_duplicate']) {
                    $skipped++;
                    continue;
                }

                if (isset($previewRow['data']['_existing_id'])) {
                    $customer = Customer::find($previewRow['data']['_existing_id']);
                    if ($customer) {
                        $customer->update($data);
                        $updated++;
                        continue;
                    }
                }

                Customer::create($data);
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

    public function template()
    {
        $headers = [
            'company_id', 'branch_id', 'name', 'type', 'company_type', 'email',
            'contact_person', 'contact_no', 'gst_number', 'registration_type',
            'pan', 'billing_street', 'billing_landmark', 'billing_city',
            'billing_state', 'billing_country', 'billing_pincode',
            'shipping_street', 'shipping_landmark', 'shipping_city',
            'shipping_state', 'shipping_country', 'shipping_pincode',
            'eway_bill_distance', 'group_id', 'opening_balance', 'credit_limit',
            'due_days', 'fax', 'website', 'note', 'license_no',
            'custom_field_1', 'custom_field_2', 'is_active'
        ];

        $output = fopen('php://temp', 'r+');
        fputcsv($output, $headers);
        rewind($output);
        $csv = stream_get_contents($output);
        fclose($output);

        return response($csv, 200, [
            'Content-Type' => 'text/csv',
            'Content-Disposition' => "attachment; filename=\"customers_template.csv\"",
        ]);
    }

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
            if ($allEmpty) continue;

            $rows[] = $assoc;
        }
        fclose($handle);
        return $rows;
    }

    private function rules()
    {
        return [
            'company_id' => 'required|exists:companies,id',
            'branch_id' => 'nullable|exists:branches,id',
            'name' => 'required|string|max:255',
            'type' => 'nullable|string|max:255',
            'company_type' => 'nullable|string|max:255',
            'email' => 'nullable|email|max:255',
            'phone' => 'nullable|string|max:50',
            'contact_person' => 'nullable|string|max:255',
            'contact_no' => 'nullable|string|max:50',
            'gst_number' => 'nullable|string|max:50',
            'registration_type' => 'nullable|string|max:50',
            'pan' => 'nullable|string|max:20',
            'billing_street' => 'nullable|string|max:255',
            'billing_landmark' => 'nullable|string|max:255',
            'billing_city' => 'required|string|max:255',
            'billing_state' => 'nullable|string|max:255',
            'billing_country' => 'nullable|string|max:255',
            'billing_pincode' => 'nullable|string|max:20',
            'shipping_street' => 'nullable|string|max:255',
            'shipping_landmark' => 'nullable|string|max:255',
            'shipping_city' => 'nullable|string|max:255',
            'shipping_state' => 'nullable|string|max:255',
            'shipping_country' => 'nullable|string|max:255',
            'shipping_pincode' => 'nullable|string|max:20',
            'eway_bill_distance' => 'nullable|integer|min:0',
            'group_id' => 'nullable|exists:customer_groups,id',
            'opening_balance' => 'nullable|numeric',
            'credit_limit' => 'nullable|numeric|min:0',
            'due_days' => 'nullable|integer|min:0',
            'outstanding_amount' => 'nullable|numeric',
            'fax' => 'nullable|string|max:255',
            'website' => 'nullable|string|max:255',
            'note' => 'nullable|string',
            'license_no' => 'nullable|string|max:255',
            'custom_field_1' => 'nullable|string|max:255',
            'custom_field_2' => 'nullable|string|max:255',
            'status' => 'nullable|string|max:50',
            'is_active' => 'nullable|boolean',
            'parent_id' => 'nullable|exists:customers,id',
            'territory' => 'nullable|string|max:255',
            'zone' => 'nullable|string|max:255',
            'wallet_balance' => 'nullable|numeric',
            'commission_rate' => 'nullable|numeric',
            'kyc_status' => 'nullable|string|max:50',
            'approved_at' => 'nullable|date',
        ];
    }
}