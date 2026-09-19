<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Company;
use App\Models\Branch;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Throwable;

class CustomerController extends Controller
{
    private array $tableColumnsCache = [];

    /* ======================================================================
     |  CUSTOMER CRUD
     ====================================================================== */

    public function index(Request $request)
    {
        try {
            $query = Customer::query();
            $this->applyNotDeletedEloquent($query);

            $query->with([
                'company' => fn ($q) => $this->applyNotDeletedEloquent($q),
                'branch'  => fn ($q) => $this->applyNotDeletedEloquent($q),
                'group'   => fn ($q) => $this->applyNotDeletedEloquent($q),
            ]);

            $search    = trim((string) $request->query('search', ''));
            $companyId = $request->query('company_id');
            $branchId  = $request->query('branch_id');
            $type      = trim((string) $request->query('type', ''));
            $status    = trim((string) $request->query('status', ''));
            $isActive  = $request->query('is_active');

            if ($search !== '') {
                $like = '%' . $search . '%';
                $query->where(function ($q) use ($like) {
                    $q->where('name', 'like', $like)
                      ->orWhere('email', 'like', $like)
                      ->orWhere('contact_no', 'like', $like)
                      ->orWhere('gst_number', 'like', $like)
                      ->orWhere('pan', 'like', $like);
                });
            }
            if ($companyId !== null && $companyId !== '') $query->where('company_id', (int) $companyId);
            if ($branchId !== null && $branchId !== '')   $query->where('branch_id', (int) $branchId);
            if ($type !== '')                              $query->where('type', $type);
            if ($status !== '')                            $query->where('status', $status);
            if ($isActive !== null && $isActive !== '') {
                $query->where('is_active', filter_var($isActive, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE));
            }

            $perPage = max(1, min((int) $request->query('per_page', 1000), 2000));

            $paginator = $query
                ->orderBy('name')
                ->paginate($perPage)
                ->appends($request->query());

            $items = $paginator->items();
            $outstandingMap = $this->computeOutstandingMapForCustomers($items);

            $enriched = array_map(function ($customer) use ($outstandingMap) {
                $arr = $customer->toArray();
                $arr['computed_outstanding'] = $outstandingMap[(int) $customer->id] ?? 0.0;
                return $arr;
            }, $items);

            return response()->json([
                'data'         => $enriched,
                'current_page' => $paginator->currentPage(),
                'last_page'    => $paginator->lastPage(),
                'per_page'     => $paginator->perPage(),
                'total'        => $paginator->total(),
                'from'         => $paginator->firstItem(),
                'to'           => $paginator->lastItem(),
            ]);
        } catch (Throwable $e) {
            Log::error('Customer index failed', ['error' => $e->getMessage()]);
            return response()->json(['message' => 'Unable to load customers.'], 500);
        }
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), $this->rules());
        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $data = $validator->validated();

        $companyBranchError = $this->validateCompanyBranchRelation(
            $data['company_id'] ?? null,
            $data['branch_id'] ?? null
        );
        if ($companyBranchError) {
            return response()->json(['errors' => ['branch_id' => [$companyBranchError]]], 422);
        }

        try {
            $customer = DB::transaction(fn () => Customer::create($data));
            return response()->json($customer->fresh(['company', 'branch', 'group']), 201);
        } catch (Throwable $e) {
            Log::error('Customer create failed', ['error' => $e->getMessage()]);
            return response()->json([
                'message' => 'Unable to create customer.',
                'error'   => config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }
    }

    public function show($customer)
    {
        try {
            $customerModel = $this->findActiveCustomer((int) $customer);
            if (!$customerModel) {
                return response()->json(['message' => 'Customer not found.'], 404);
            }

            $loaded = $customerModel->load(['company', 'branch', 'group']);
            $arr = $loaded->toArray();
            $map = $this->computeOutstandingMapForCustomers([$loaded]);
            $arr['computed_outstanding'] = $map[(int) $loaded->id] ?? 0.0;

            return response()->json($arr);
        } catch (Throwable $e) {
            Log::error('Customer show failed', ['customer_id' => $customer, 'error' => $e->getMessage()]);
            return response()->json(['message' => 'Unable to load customer.'], 500);
        }
    }

    public function update(Request $request, $customer)
    {
        $customerModel = $this->findActiveCustomer((int) $customer);
        if (!$customerModel) {
            return response()->json(['message' => 'Customer not found.'], 404);
        }

        $validator = Validator::make($request->all(), $this->rules());
        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $data = $validator->validated();

        $companyBranchError = $this->validateCompanyBranchRelation(
            $data['company_id'] ?? $customerModel->company_id,
            $data['branch_id'] ?? $customerModel->branch_id
        );
        if ($companyBranchError) {
            return response()->json(['errors' => ['branch_id' => [$companyBranchError]]], 422);
        }

        try {
            DB::transaction(fn () => $customerModel->update($data));
            $fresh = $customerModel->fresh(['company', 'branch', 'group']);
            $arr = $fresh->toArray();
            $map = $this->computeOutstandingMapForCustomers([$fresh]);
            $arr['computed_outstanding'] = $map[(int) $fresh->id] ?? 0.0;

            return response()->json($arr);
        } catch (Throwable $e) {
            Log::error('Customer update failed', ['customer_id' => $customerModel->id, 'error' => $e->getMessage()]);
            return response()->json([
                'message' => 'Unable to update customer.',
                'error'   => config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }
    }

    public function destroy($customer)
    {
        $customerModel = $this->findActiveCustomer((int) $customer);
        if (!$customerModel) {
            return response()->json(['message' => 'Customer not found.'], 404);
        }

        try {
            $customerModel->delete();
            return response()->noContent();
        } catch (Throwable $e) {
            Log::error('Customer delete failed', ['customer_id' => $customerModel->id, 'error' => $e->getMessage()]);
            return response()->json(['message' => 'Unable to delete customer.'], 500);
        }
    }

    /* ======================================================================
     |  OUTSTANDING COMPUTATION
     |
     |  For each customer:
     |      outstanding = opening_balance
     |                  + Σ invoices.total_amount       (excl. draft/cancelled)
     |                  − Σ payments.amount             (inward only)
     |                  − Σ credit_notes.total_amount   (excl. draft/cancelled)
     |                  − Σ sales_returns.total_amount
     |
     |  Payments are subtracted from TWO sources, without double-counting:
     |     (a) rows where payments.customer_id = customer.id
     |     (b) rows where payments.customer_id IS NULL and payments.invoice_id
     |         points at one of the customer's invoices
     | ====================================================================== */

    /**
     * @param  array<int, Customer>  $customers
     * @return array<int, float>
     */
    private function computeOutstandingMapForCustomers(array $customers): array
    {
        if (empty($customers)) {
            return [];
        }

        $ids = [];
        $map = [];
        foreach ($customers as $c) {
            $cid = (int) $c->id;
            $ids[] = $cid;
            $map[$cid] = (float) ($c->opening_balance ?? 0);
        }

        // ── Resolve concrete table names ──
        $invoiceTable = $this->firstExistingTable(['invoices', 'sales_invoices']);
        $paymentTable = $this->firstExistingTable([
            'payments', 'payment_transactions', 'receipts',
            'customer_payments', 'payment_entries',
        ]);
        $creditTable  = $this->firstExistingTable(['credit_notes', 'sales_credit_notes', 'credit_memos']);
        $returnTable  = $this->firstExistingTable(['sales_returns', 'returns', 'sales_return']);

        $partyFkCandidates = [
            'customer_id', 'dealer_id', 'distributor_id',
            'party_id', 'client_id', 'contact_id',
            'bill_to_id', 'sold_to_id', 'buyer_id',
            'billed_to', 'billed_to_id',
        ];

        // ── Invoices (+) ──
        if ($invoiceTable) {
            $this->applyGroupedSum(
                $map, $ids, $invoiceTable,
                $partyFkCandidates,
                ['total_amount', 'grand_total', 'net_amount', 'invoice_total', 'invoice_amount', 'amount', 'total'],
                +1,
                function ($query, array $cols) {
                    if (isset($cols['status'])) {
                        $query->whereNotIn('status', ['draft', 'cancelled']);
                    }
                }
            );
        }

        // ── Payments (−) — two complementary paths ──
        if ($paymentTable) {
            $payCols = $this->tableColumns($paymentTable);
            $payAmountCol = $this->pickAmountColumn($paymentTable, ['amount', 'total_amount', 'paid_amount', 'payment_amount', 'value']);
            $payFkCol = $this->pickColumn($payCols, ['customer_id', 'dealer_id', 'distributor_id', 'party_id', 'client_id', 'contact_id']);
            $hasSoftDelete = isset($payCols['deleted_at']);
            $inwardCol = null;
            foreach (['payment_direction', 'direction'] as $c) {
                if (isset($payCols[$c])) { $inwardCol = $c; break; }
            }

            // (a) payments with a direct customer FK
            if ($payFkCol && $payAmountCol) {
                $query = DB::table($paymentTable)
                    ->whereIn($payFkCol, $ids)
                    ->select($payFkCol, DB::raw("SUM(`{$payAmountCol}`) AS total_sum"))
                    ->groupBy($payFkCol);

                if ($hasSoftDelete) $query->whereNull('deleted_at');
                if ($inwardCol) {
                    $query->where(function ($w) use ($inwardCol) {
                        $w->where($inwardCol, 'inward')
                          ->orWhereNull($inwardCol)
                          ->orWhere($inwardCol, '');
                    });
                }

                foreach ($query->get() as $row) {
                    $cid = (int) $row->{$payFkCol};
                    if (isset($map[$cid])) {
                        $map[$cid] -= (float) $row->total_sum;
                    }
                }
            }

            // (b) orphan payments linked only by invoice_id
            if ($invoiceTable && $payAmountCol && isset($payCols['invoice_id'])) {
                $invCols = $this->tableColumns($invoiceTable);
                $invFkCol = $this->pickColumn($invCols, $partyFkCandidates);

                if ($invFkCol) {
                    // Map invoice_id → customer_id for this batch
                    $invoiceRows = DB::table($invoiceTable)
                        ->whereIn($invFkCol, $ids)
                        ->get(['id', $invFkCol]);

                    $idToCustomer = [];
                    $invoiceIds = [];
                    foreach ($invoiceRows as $inv) {
                        $cid = (int) $inv->{$invFkCol};
                        $iid = (int) $inv->id;
                        $idToCustomer[$iid] = $cid;
                        $invoiceIds[] = $iid;
                    }

                    if (!empty($invoiceIds)) {
                        $query = DB::table($paymentTable)
                            ->whereIn('invoice_id', $invoiceIds)
                            ->select('invoice_id', DB::raw("SUM(`{$payAmountCol}`) AS total_sum"))
                            ->groupBy('invoice_id');

                        // Skip rows already counted in step (a)
                        if ($payFkCol) {
                            $query->where(function ($w) use ($payFkCol) {
                                $w->whereNull($payFkCol)->orWhere($payFkCol, 0);
                            });
                        }

                        if ($hasSoftDelete) $query->whereNull('deleted_at');
                        if ($inwardCol) {
                            $query->where(function ($w) use ($inwardCol) {
                                $w->where($inwardCol, 'inward')
                                  ->orWhereNull($inwardCol)
                                  ->orWhere($inwardCol, '');
                            });
                        }

                        foreach ($query->get() as $row) {
                            $cid = $idToCustomer[(int) $row->invoice_id] ?? 0;
                            if ($cid && isset($map[$cid])) {
                                $map[$cid] -= (float) $row->total_sum;
                            }
                        }
                    }
                }
            }
        }

        // ── Credit notes (−) ──
        if ($creditTable) {
            $this->applyGroupedSum(
                $map, $ids, $creditTable,
                $partyFkCandidates,
                ['total_amount', 'grand_total', 'amount', 'total'],
                -1,
                function ($query, array $cols) {
                    if (isset($cols['status'])) {
                        $query->whereNotIn('status', ['draft', 'cancelled']);
                    }
                }
            );
        }

        // ── Sales returns (−) ──
        if ($returnTable) {
            $this->applyGroupedSum(
                $map, $ids, $returnTable,
                $partyFkCandidates,
                ['total_amount', 'grand_total', 'amount', 'total'],
                -1
            );
        }

        foreach ($map as $cid => $value) {
            $map[$cid] = round($value, 2);
        }

        return $map;
    }

    /**
     * Grouped sum per customer applied to the outstanding map with a sign.
     * No-op if the table or required columns are missing.
     */
    private function applyGroupedSum(
        array &$map,
        array $ids,
        string $table,
        array $fkCandidates,
        array $amountCandidates,
        int $sign,
        ?callable $extraWhere = null
    ): void {
        if (empty($ids)) return;

        try {
            $columns = $this->tableColumns($table);
            $fk = $this->pickColumn($columns, $fkCandidates);
            if (!$fk) return;

            $amountCol = $this->pickAmountColumn($table, $amountCandidates);
            if (!$amountCol) return;

            $query = DB::table($table)
                ->whereIn($fk, $ids)
                ->select($fk, DB::raw("SUM(`{$amountCol}`) AS total_sum"))
                ->groupBy($fk);

            if (isset($columns['deleted_at'])) {
                $query->whereNull('deleted_at');
            }
            if ($extraWhere) {
                $extraWhere($query, $columns);
            }

            foreach ($query->get() as $row) {
                $cid = (int) $row->{$fk};
                if (isset($map[$cid])) {
                    $map[$cid] += $sign * (float) $row->total_sum;
                }
            }
        } catch (Throwable $e) {
            Log::debug('applyGroupedSum skipped', [
                'table' => $table,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /** Pick the first existing column from a candidate list. */
    private function pickColumn(array $columns, array $candidates): ?string
    {
        foreach ($candidates as $col) {
            if (isset($columns[$col])) return $col;
        }
        return null;
    }

    /** Pick an amount column, preferring one that actually holds non-zero data. */
    private function pickAmountColumn(string $table, array $candidates): ?string
    {
        $columns = $this->tableColumns($table);
        $existing = [];
        foreach ($candidates as $col) {
            if (isset($columns[$col])) $existing[] = $col;
        }
        if (empty($existing)) return null;

        foreach ($existing as $col) {
            try {
                if (DB::table($table)->where($col, '>', 0)->limit(1)->exists()) {
                    return $col;
                }
            } catch (Throwable $e) {
                // Column type doesn't support ">", skip.
            }
        }
        return $existing[0];
    }

    /* ======================================================================
     |  CSV IMPORT
     ====================================================================== */

    public function import(Request $request)
    {
        $request->validate([
            'file'             => 'required|file|mimes:csv,txt|max:10240',
            'duplicate_action' => 'required|in:skip,update,stop',
            'dry_run'          => 'boolean',
        ]);

        $file = $request->file('file');
        $duplicateAction = $request->input('duplicate_action');
        $dryRun = $request->boolean('dry_run', false);

        $rows = $this->parseCsv($file);
        if (empty($rows)) {
            return response()->json(['success' => false, 'message' => 'The CSV file is empty or has invalid headers.'], 422);
        }

        $expectedHeaders = $this->customerCsvHeaders();
        $headers = array_keys($rows[0]);
        $missingHeaders = array_values(array_diff($expectedHeaders, $headers));
        if (!empty($missingHeaders)) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid CSV headers. Please use the template.',
                'missing_headers' => $missingHeaders,
            ], 422);
        }

        $previewRows = [];
        $errors = [];
        $validCount = 0;

        $companyIds = array_values(array_unique(array_filter(
            array_map(fn ($id) => (int) $id, array_column($rows, 'company_id')),
            fn ($id) => $id > 0
        )));

        $companies = Company::query()
            ->whereIn('id', $companyIds)
            ->when(Schema::hasColumn('companies', 'deleted_at'), fn ($q) => $q->whereNull('deleted_at'))
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $branches = Branch::query()
            ->whereIn('company_id', $companyIds)
            ->when(Schema::hasColumn('branches', 'deleted_at'), fn ($q) => $q->whereNull('deleted_at'))
            ->get(['id', 'company_id'])
            ->groupBy('company_id')
            ->map(fn ($items) => $items->pluck('id')->map(fn ($id) => (int) $id)->all())
            ->toArray();

        foreach ($rows as $index => $originalRow) {
            $row = $this->cleanCsvRow($originalRow);
            $rowNumber = $index + 2;
            $rowErrors = [];

            $companyId = (int) ($row['company_id'] ?? 0);
            $branchId  = !empty($row['branch_id']) ? (int) $row['branch_id'] : null;

            if ($companyId <= 0 || !in_array($companyId, $companies, true)) $rowErrors['company_id'] = 'Invalid or missing company ID.';
            if (empty($row['name']))            $rowErrors['name'] = 'Name is required.';
            if (empty($row['billing_city']))    $rowErrors['billing_city'] = 'Billing city is required.';

            if (!empty($row['email']) && !filter_var($row['email'], FILTER_VALIDATE_EMAIL)) {
                $rowErrors['email'] = 'Invalid email format.';
            }

            if ($branchId !== null) {
                if (!isset($branches[$companyId]) || !in_array($branchId, $branches[$companyId], true)) {
                    $rowErrors['branch_id'] = 'Branch does not belong to the given company.';
                }
            }

            foreach (['eway_bill_distance', 'opening_balance', 'credit_limit', 'due_days'] as $field) {
                $value = $row[$field] ?? null;
                if ($value !== null && $value !== '' && !is_numeric($value)) {
                    $rowErrors[$field] = "{$field} must be a number.";
                    continue;
                }
                if ($value !== null && $value !== '' && is_numeric($value) && (float) $value < 0
                    && in_array($field, ['eway_bill_distance', 'credit_limit', 'due_days'], true)) {
                    $rowErrors[$field] = "{$field} cannot be negative.";
                }
            }

            $duplicate = $this->findImportDuplicate($row);
            $rowAction = 'create';
            $existingId = null;

            if ($duplicate) {
                if ($duplicateAction === 'stop') {
                    $rowErrors['duplicate'] = 'Duplicate customer found (stop action).';
                } elseif ($duplicateAction === 'skip') {
                    $rowAction = 'skip'; $existingId = (int) $duplicate->id;
                } elseif ($duplicateAction === 'update') {
                    $rowAction = 'update'; $existingId = (int) $duplicate->id;
                }
            }

            $valid = empty($rowErrors);
            if ($valid) $validCount++;

            $rowData = $this->normalizeCustomerImportData($row);
            $previewRows[] = [
                'row'         => $rowNumber,
                'data'        => $rowData,
                'action'      => $rowAction,
                'existing_id' => $existingId,
                'valid'       => $valid,
                'errors'      => $rowErrors,
                'name'        => $rowData['name'] ?? '',
                'email'       => $rowData['email'] ?? '',
            ];

            if (!$valid) {
                $errors[] = [
                    'row'     => $rowNumber,
                    'field'   => implode(', ', array_keys($rowErrors)),
                    'message' => implode('; ', $rowErrors),
                ];
            }
        }

        if ($dryRun) {
            $summary = [
                'created' => collect($previewRows)->where('valid', true)->where('action', 'create')->count(),
                'updated' => collect($previewRows)->where('valid', true)->where('action', 'update')->count(),
                'skipped' => collect($previewRows)->where('valid', true)->where('action', 'skip')->count(),
                'failed'  => count($rows) - $validCount,
            ];

            return response()->json([
                'preview' => $previewRows,
                'errors'  => $errors,
                'total'   => count($rows),
                'valid'   => $validCount,
                'invalid' => count($rows) - $validCount,
                'summary' => $summary,
            ]);
        }

        $created = 0; $updated = 0; $skipped = 0; $failed = 0;
        DB::beginTransaction();

        try {
            foreach ($previewRows as $previewRow) {
                if (!$previewRow['valid']) { $failed++; continue; }

                $data = $previewRow['data'];
                $action = $previewRow['action'];
                $existingId = $previewRow['existing_id'];

                if ($action === 'skip') { $skipped++; continue; }

                if ($action === 'update' && $existingId) {
                    $existingCustomer = $this->findActiveCustomer((int) $existingId);
                    if (!$existingCustomer) { Customer::create($data); $created++; }
                    else { $existingCustomer->update($data); $updated++; }
                    continue;
                }

                Customer::create($data);
                $created++;
            }

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Import completed successfully.',
                'summary' => [
                    'total'   => count($rows),
                    'created' => $created,
                    'updated' => $updated,
                    'skipped' => $skipped,
                    'failed'  => $failed,
                ],
                'errors' => $errors,
            ]);
        } catch (Throwable $e) {
            DB::rollBack();
            Log::error('Customer import failed', ['error' => $e->getMessage()]);

            return response()->json([
                'success' => false,
                'message' => 'Import failed.',
                'error'   => config('app.debug') ? $e->getMessage() : null,
                'summary' => [
                    'total' => count($rows), 'created' => 0, 'updated' => 0,
                    'skipped' => 0, 'failed' => count($rows),
                ],
                'errors' => $errors,
            ], 500);
        }
    }

    public function template()
    {
        $headers = $this->customerCsvHeaders();
        $output = fopen('php://temp', 'r+');
        if (!$output) {
            return response()->json(['message' => 'Unable to create CSV template.'], 500);
        }
        fputcsv($output, $headers);
        rewind($output);
        $csv = stream_get_contents($output);
        fclose($output);

        return response($csv, 200, [
            'Content-Type'        => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="customers_template.csv"',
            'Cache-Control'       => 'no-store, no-cache, must-revalidate',
        ]);
    }

    /* ======================================================================
     |  LEDGER
     ====================================================================== */

    public function ledger(Request $request, $customer)
    {
        return $this->respondWithLedger((int) $customer);
    }

    public function ledgerEntries(Request $request, $customer)
    {
        return $this->respondWithLedger((int) $customer);
    }

    public function ledgerByCustomer(Request $request)
    {
        $customerId = (int) $request->query('customer_id', 0);
        if ($customerId <= 0) {
            return response()->json(['data' => [], 'summary' => $this->emptyLedgerSummary()]);
        }
        return $this->respondWithLedger($customerId);
    }

    private function respondWithLedger(int $customerId)
    {
        try {
            $customer = $this->findActiveCustomer($customerId);
            if (!$customer) {
                return response()->json(['data' => [], 'summary' => $this->emptyLedgerSummary()], 404);
            }

            $entries = [];
            $this->appendInvoiceEntries($entries, $customer);
            $this->appendOrderEntries($entries, $customer);
            $this->appendPaymentEntries($entries, $customer);
            $this->appendCreditNoteEntries($entries, $customer);
            $this->appendReturnEntries($entries, $customer);

            $entries = $this->deduplicateLedgerEntries($entries);

            usort($entries, function ($a, $b) {
                $c = strcmp((string) ($a['date'] ?? ''), (string) ($b['date'] ?? ''));
                return $c !== 0 ? $c : strcmp((string) ($a['id'] ?? ''), (string) ($b['id'] ?? ''));
            });

            $balance = 0.0; $totalDebit = 0.0; $totalCredit = 0.0;
            foreach ($entries as &$entry) {
                $debit  = (float) ($entry['debit'] ?? 0);
                $credit = (float) ($entry['credit'] ?? 0);
                $totalDebit  += $debit;
                $totalCredit += $credit;
                $balance += $debit - $credit;
                $entry['balance'] = round($balance, 2);
                $entry['amount']  = round(max($debit, $credit), 2);
            }
            unset($entry);

            // Include opening balance so the closing balance matches the customer card.
            $opening = (float) ($customer->opening_balance ?? 0);
            $closing = round($opening + $balance, 2);

            $summary = [
                'opening_balance'  => round($opening, 2),
                'total_debit'      => round($totalDebit, 2),
                'total_credit'     => round($totalCredit, 2),
                'balance'          => $closing,
                'invoice_count'    => collect($entries)->where('type', 'invoice')->count(),
                'order_count'      => collect($entries)->where('type', 'order')->count(),
                'payment_count'    => collect($entries)->where('type', 'payment')->count(),
                'credit_note_count'=> collect($entries)->where('type', 'credit_note')->count(),
                'return_count'     => collect($entries)->where('type', 'sales_return')->count(),
            ];

            return response()->json([
                'data'    => $entries,
                'entries' => $entries,
                'customer' => [
                    'id'         => $customer->id,
                    'name'       => $customer->name,
                    'type'       => $customer->type ?? null,
                    'company_id' => $customer->company_id ?? null,
                    'branch_id'  => $customer->branch_id ?? null,
                ],
                'summary' => $summary,
            ]);
        } catch (Throwable $e) {
            Log::error('Customer ledger failed', ['customer_id' => $customerId, 'error' => $e->getMessage()]);
            return response()->json([
                'data' => [], 'entries' => [],
                'summary' => $this->emptyLedgerSummary(),
                'message' => 'Unable to load customer ledger.',
            ], 500);
        }
    }

    private function appendInvoiceEntries(array &$entries, Customer $customer): void
    {
        $table = $this->firstExistingTable(['invoices', 'sales_invoices']);
        if (!$table) return;

        try {
            $columns = $this->tableColumns($table);
            $candidateColumns = ['customer_id','dealer_id','distributor_id','party_id','client_id','contact_id','bill_to_id','sold_to_id','buyer_id','billed_to','billed_to_id'];
            $contactIds = $this->resolveCustomerContactIds((int) $customer->id);

            $query = DB::table($table);
            $this->applyNotDeletedQuery($query, $table);
            if (!$this->applyPartyFilter($query, $columns, $candidateColumns, (int) $customer->id, $contactIds)) return;

            $dateCol = $this->firstExistingColumn($table, ['invoice_date', 'date', 'bill_date', 'created_at']);
            if ($dateCol) $query->orderBy($dateCol);

            $amountCandidates = ['total_amount','grand_total','net_amount','invoice_total','invoice_amount','bill_amount','payable_amount','net_total','gross_amount','gross_total','amount','total'];

            foreach ($query->get() as $invoice) {
                if (isset($columns['deleted_at']) && !empty($invoice->deleted_at)) continue;

                // Skip drafts/cancelled — they aren't billed yet.
                if (isset($columns['status'])) {
                    $st = strtolower(trim((string) ($invoice->status ?? '')));
                    if ($st === 'draft' || $st === 'cancelled') continue;
                }

                $ref = $this->firstValue($invoice, ['invoice_no', 'invoice_number', 'number', 'reference_no']) ?? ('#' . $invoice->id);
                $date = $dateCol ? ($invoice->{$dateCol} ?? null) : ($invoice->created_at ?? null);
                $amount = $this->firstNumericValue($invoice, $amountCandidates);

                $entries[] = [
                    'id'            => 'invoice-' . $invoice->id,
                    'source_id'     => (int) $invoice->id,
                    'source_table'  => $table,
                    'date'          => $this->normalizeDate($date),
                    'type'          => 'invoice',
                    'reference_no'  => (string) $ref,
                    'particulars'   => 'Sales Invoice ' . $ref,
                    'debit'         => round($amount, 2),
                    'credit'        => 0.00,
                    'status'        => $invoice->status ?? null,
                    'payment_state' => $invoice->payment_state ?? null,
                ];
            }
        } catch (Throwable $e) {
            Log::warning('Ledger invoice query failed', ['customer_id' => $customer->id, 'error' => $e->getMessage()]);
        }
    }

    private function appendOrderEntries(array &$entries, Customer $customer): void
    {
        $table = $this->firstExistingTable(['orders', 'sales_orders', 'customer_orders']);
        if (!$table) return;

        try {
            $columns = $this->tableColumns($table);
            $candidateColumns = ['customer_id','dealer_id','distributor_id','party_id','client_id','contact_id','bill_to_id','sold_to_id','buyer_id'];
            $contactIds = $this->resolveCustomerContactIds((int) $customer->id);

            $query = DB::table($table);
            $this->applyNotDeletedQuery($query, $table);
            if (!$this->applyPartyFilter($query, $columns, $candidateColumns, (int) $customer->id, $contactIds)) return;

            $dateCol = $this->firstExistingColumn($table, ['order_date', 'date', 'ordered_at', 'created_at']);
            if ($dateCol) $query->orderBy($dateCol);

            foreach ($query->get() as $order) {
                if (array_key_exists('deleted_at', $columns) && !empty($order->deleted_at)) continue;
                $ref = $this->firstValue($order, ['order_no', 'order_number', 'number', 'reference_no']) ?? ('#' . $order->id);
                $date = $dateCol ? ($order->{$dateCol} ?? null) : ($order->created_at ?? null);
                $orderAmount = $this->firstNumericValue($order, ['total_amount','grand_total','net_amount','order_total','order_amount','amount','total']);

                $entries[] = [
                    'id'           => 'order-' . $order->id,
                    'source_id'    => (int) $order->id,
                    'source_table' => $table,
                    'date'         => $this->normalizeDate($date),
                    'type'         => 'order',
                    'reference_no' => (string) $ref,
                    'particulars'  => 'Sales Order ' . $ref,
                    'debit'        => 0.00,
                    'credit'       => 0.00,
                    'order_amount' => round($orderAmount, 2),
                    'status'       => $order->status ?? null,
                ];
            }
        } catch (Throwable $e) {
            Log::warning('Ledger order query failed', ['customer_id' => $customer->id, 'error' => $e->getMessage()]);
        }
    }

    private function appendPaymentEntries(array &$entries, Customer $customer): void
    {
        $table = $this->firstExistingTable(['payments','payment_transactions','receipts','customer_payments','payment_entries','transactions']);
        if (!$table) return;

        try {
            $columns = $this->tableColumns($table);
            $candidateColumns = ['customer_id','dealer_id','distributor_id','party_id','client_id','contact_id','bill_to_id','sold_to_id'];
            $contactIds = $this->resolveCustomerContactIds((int) $customer->id);
            $customerInvoiceIds = $this->resolveCustomerInvoiceIds($customer);
            $invoiceNumberMap = $this->buildInvoiceNumberMap($customerInvoiceIds);

            $hasInvoiceId   = isset($columns['invoice_id']) && !empty($customerInvoiceIds);
            $hasPaymentable = isset($columns['paymentable_id']) && isset($columns['paymentable_type']) && !empty($customerInvoiceIds);
            $hasAnyDirect   = false;
            foreach ($candidateColumns as $col) if (isset($columns[$col])) { $hasAnyDirect = true; break; }

            if (!$hasAnyDirect && !$hasInvoiceId && !$hasPaymentable && empty($contactIds)) return;

            $query = DB::table($table);
            $this->applyNotDeletedQuery($query, $table);

            $query->where(function ($q) use ($columns, $candidateColumns, $customer, $contactIds, $customerInvoiceIds, $hasInvoiceId, $hasPaymentable) {
                $added = false;
                foreach ($candidateColumns as $column) {
                    if (!isset($columns[$column])) continue;
                    if ($column === 'contact_id') {
                        if (!empty($contactIds)) { $q->orWhereIn($column, $contactIds); $added = true; }
                        continue;
                    }
                    $q->orWhere($column, (int) $customer->id);
                    $added = true;
                }
                if ($hasInvoiceId) { $q->orWhereIn('invoice_id', $customerInvoiceIds); $added = true; }
                if ($hasPaymentable) {
                    $q->orWhere(function ($q2) use ($customerInvoiceIds) {
                        $q2->whereIn('paymentable_type', ['App\\Models\\Invoice','App\\Models\\SalesInvoice','App\\Models\\Invoices','invoice','invoices','Invoice','sales_invoice'])
                           ->whereIn('paymentable_id', $customerInvoiceIds);
                    });
                    $added = true;
                }
                if (!$added) $q->whereRaw('1 = 0');
            });

            $dateCol = $this->firstExistingColumn($table, ['transaction_date', 'payment_date', 'date', 'paid_at', 'created_at']);
            if ($dateCol) $query->orderBy($dateCol);

            $amountCandidates = ['amount','total_amount','paid_amount','payment_amount','value'];

            foreach ($query->get() as $payment) {
                if (array_key_exists('deleted_at', $columns) && !empty($payment->deleted_at)) continue;

                if ($this->hasColumn($columns, 'party_type')) {
                    $pt = strtolower(trim((string) ($payment->party_type ?? '')));
                    if ($pt !== '' && !$this->isAllowedPartyType($pt)) continue;
                }
                if ($this->hasColumn($columns, 'paymentable_type')) {
                    $pt = strtolower(trim((string) ($payment->paymentable_type ?? '')));
                    $isInvoice = str_contains($pt, 'invoice');
                    if (!$isInvoice && $pt !== '' && !$this->isAllowedPartyType($pt)) continue;
                }

                $ref = $this->firstValue($payment, ['reference_no','payment_no','voucher_no','receipt_no','transaction_no']) ?? ('#' . $payment->id);
                $date = $dateCol ? ($payment->{$dateCol} ?? null) : ($payment->created_at ?? null);

                $direction = $this->resolvePaymentDirection($payment, $columns);
                $outward = in_array($direction, ['outward','payment','debit','paid','payout','sent','expense'], true);

                $amount = $this->firstNumericValue($payment, $amountCandidates);
                $method = $this->firstValue($payment, ['payment_method','method','mode']);

                $linkedInvoiceId = null;
                if (isset($columns['invoice_id']) && !empty($payment->invoice_id)) $linkedInvoiceId = (int) $payment->invoice_id;
                elseif (isset($columns['paymentable_id'], $columns['paymentable_type']) && !empty($payment->paymentable_id)) {
                    $pt = strtolower((string) ($payment->paymentable_type ?? ''));
                    if (str_contains($pt, 'invoice')) $linkedInvoiceId = (int) $payment->paymentable_id;
                }
                $invoiceRef = ($linkedInvoiceId && isset($invoiceNumberMap[$linkedInvoiceId])) ? $invoiceNumberMap[$linkedInvoiceId] : null;

                $label = $outward ? 'Payment' : 'Receipt';
                $particulars = $label . ' ' . $ref;
                if ($invoiceRef) $particulars .= ' against ' . $invoiceRef;
                if ($method)     $particulars .= ' (' . $method . ')';

                $entries[] = [
                    'id'             => 'payment-' . $payment->id,
                    'source_id'      => (int) $payment->id,
                    'source_table'   => $table,
                    'date'           => $this->normalizeDate($date),
                    'type'           => 'payment',
                    'reference_no'   => (string) $ref,
                    'particulars'    => $particulars,
                    'debit'          => $outward ? round($amount, 2) : 0.00,
                    'credit'         => $outward ? 0.00 : round($amount, 2),
                    'status'         => $payment->status ?? null,
                    'payment_method' => $method,
                    'direction'      => $outward ? 'outward' : 'inward',
                    'invoice_id'     => $linkedInvoiceId,
                    'invoice_no'     => $invoiceRef,
                ];
            }
        } catch (Throwable $e) {
            Log::warning('Ledger payment query failed', ['customer_id' => $customer->id, 'error' => $e->getMessage()]);
        }
    }

    private function appendCreditNoteEntries(array &$entries, Customer $customer): void
    {
        $table = $this->firstExistingTable(['credit_notes', 'sales_credit_notes', 'credit_memos']);
        if (!$table) return;

        try {
            $columns = $this->tableColumns($table);
            $candidateColumns = ['customer_id','dealer_id','distributor_id','party_id','client_id','contact_id'];
            $contactIds = $this->resolveCustomerContactIds((int) $customer->id);

            $query = DB::table($table);
            $this->applyNotDeletedQuery($query, $table);
            if (!$this->applyPartyFilter($query, $columns, $candidateColumns, (int) $customer->id, $contactIds)) return;

            $dateCol = $this->firstExistingColumn($table, ['credit_note_date', 'date', 'created_at']);
            if ($dateCol) $query->orderBy($dateCol);

            foreach ($query->get() as $creditNote) {
                if (array_key_exists('deleted_at', $columns) && !empty($creditNote->deleted_at)) continue;

                if (isset($columns['status'])) {
                    $st = strtolower(trim((string) ($creditNote->status ?? '')));
                    if ($st === 'draft' || $st === 'cancelled') continue;
                }

                $ref = $this->firstValue($creditNote, ['credit_note_no','credit_note_number','reference_no','number']) ?? ('#' . $creditNote->id);
                $date = $dateCol ? ($creditNote->{$dateCol} ?? null) : ($creditNote->created_at ?? null);
                $amount = $this->firstNumericValue($creditNote, ['total_amount','grand_total','amount','total']);

                $entries[] = [
                    'id'           => 'credit-note-' . $creditNote->id,
                    'source_id'    => (int) $creditNote->id,
                    'source_table' => $table,
                    'date'         => $this->normalizeDate($date),
                    'type'         => 'credit_note',
                    'reference_no' => (string) $ref,
                    'particulars'  => 'Credit Note ' . $ref,
                    'debit'        => 0.00,
                    'credit'       => round($amount, 2),
                    'status'       => $creditNote->status ?? null,
                ];
            }
        } catch (Throwable $e) {
            Log::warning('Ledger credit-note query failed', ['customer_id' => $customer->id, 'error' => $e->getMessage()]);
        }
    }

    private function appendReturnEntries(array &$entries, Customer $customer): void
    {
        $table = $this->firstExistingTable(['sales_returns', 'returns', 'sales_return']);
        if (!$table) return;

        try {
            $columns = $this->tableColumns($table);
            $candidateColumns = ['customer_id','dealer_id','distributor_id','party_id','client_id','contact_id'];
            $contactIds = $this->resolveCustomerContactIds((int) $customer->id);

            $query = DB::table($table);
            $this->applyNotDeletedQuery($query, $table);
            if (!$this->applyPartyFilter($query, $columns, $candidateColumns, (int) $customer->id, $contactIds)) return;

            $dateCol = $this->firstExistingColumn($table, ['return_date', 'date', 'created_at']);
            if ($dateCol) $query->orderBy($dateCol);

            foreach ($query->get() as $return) {
                if (array_key_exists('deleted_at', $columns) && !empty($return->deleted_at)) continue;
                $ref = $this->firstValue($return, ['return_no','return_number','reference_no','number']) ?? ('#' . $return->id);
                $date = $dateCol ? ($return->{$dateCol} ?? null) : ($return->created_at ?? null);
                $amount = $this->firstNumericValue($return, ['total_amount','grand_total','amount','total']);

                $entries[] = [
                    'id'           => 'return-' . $return->id,
                    'source_id'    => (int) $return->id,
                    'source_table' => $table,
                    'date'         => $this->normalizeDate($date),
                    'type'         => 'sales_return',
                    'reference_no' => (string) $ref,
                    'particulars'  => 'Sales Return ' . $ref,
                    'debit'        => 0.00,
                    'credit'       => round($amount, 2),
                    'status'       => $return->status ?? null,
                ];
            }
        } catch (Throwable $e) {
            Log::warning('Ledger sales-return query failed', ['customer_id' => $customer->id, 'error' => $e->getMessage()]);
        }
    }

    /* ======================================================================
     |  PARTY MATCHING / HELPERS
     ====================================================================== */

    private function applyPartyFilter($query, array $columns, array $candidateColumns, int $customerId, array $contactIds = []): bool
    {
        $available = [];
        foreach ($candidateColumns as $column) {
            if (isset($columns[$column])) $available[] = $column;
        }
        if (empty($available) && empty($contactIds)) return false;

        $query->where(function ($q) use ($available, $contactIds, $customerId) {
            foreach ($available as $column) {
                if ($column === 'contact_id' && !empty($contactIds)) {
                    $q->orWhereIn($column, $contactIds);
                    continue;
                }
                $q->orWhere($column, $customerId);
            }
        });
        return true;
    }

    private function resolveCustomerContactIds(int $customerId): array
    {
        try {
            if (!Schema::hasTable('contacts')) return [];
            $columns = $this->tableColumns('contacts');
            $query = DB::table('contacts');
            $this->applyNotDeletedQuery($query, 'contacts');

            if (isset($columns['contactable_id'], $columns['contactable_type'])) {
                $types = [Customer::class, Customer::class . 's', 'customer', 'customers', 'Customer', 'Customers', 'dealer', 'dealers', 'Dealer', 'Dealers'];
                $ids = $query->where('contactable_id', $customerId)->whereIn('contactable_type', $types)
                    ->pluck('id')->map(fn ($id) => (int) $id)->all();
                if (!empty($ids)) return $ids;
            }
            if (isset($columns['customer_id'])) return $query->where('customer_id', $customerId)->pluck('id')->map(fn ($id) => (int) $id)->all();
            if (isset($columns['party_id']))    return $query->where('party_id', $customerId)->pluck('id')->map(fn ($id) => (int) $id)->all();
            return [];
        } catch (Throwable $e) {
            Log::debug('Contact resolution failed', ['customer_id' => $customerId, 'error' => $e->getMessage()]);
            return [];
        }
    }

    private function resolveCustomerInvoiceIds(Customer $customer): array
    {
        $table = $this->firstExistingTable(['invoices', 'sales_invoices']);
        if (!$table) return [];

        try {
            $columns = $this->tableColumns($table);
            $candidateColumns = ['customer_id','dealer_id','distributor_id','party_id','client_id','contact_id','bill_to_id','sold_to_id','buyer_id','billed_to','billed_to_id'];
            $available = [];
            foreach ($candidateColumns as $col) if (isset($columns[$col])) $available[] = $col;

            $contactIds = $this->resolveCustomerContactIds((int) $customer->id);
            if (empty($available) && empty($contactIds)) return [];

            $query = DB::table($table);
            $this->applyNotDeletedQuery($query, $table);
            $query->where(function ($q) use ($available, $contactIds, $customer) {
                foreach ($available as $column) {
                    if ($column === 'contact_id') {
                        if (!empty($contactIds)) $q->orWhereIn($column, $contactIds);
                        continue;
                    }
                    $q->orWhere($column, (int) $customer->id);
                }
            });

            return $query->pluck('id')->map(fn ($id) => (int) $id)->all();
        } catch (Throwable $e) {
            Log::warning('resolveCustomerInvoiceIds failed', ['customer_id' => $customer->id, 'error' => $e->getMessage()]);
            return [];
        }
    }

    private function buildInvoiceNumberMap(array $invoiceIds): array
    {
        if (empty($invoiceIds)) return [];
        $table = $this->firstExistingTable(['invoices', 'sales_invoices']);
        if (!$table) return [];

        try {
            $invNoCol = $this->firstExistingColumn($table, ['invoice_no','invoice_number','number','reference_no']);
            if (!$invNoCol) return [];

            $map = [];
            foreach (DB::table($table)->whereIn('id', $invoiceIds)->get(['id', $invNoCol]) as $row) {
                $map[(int) $row->id] = (string) $row->{$invNoCol};
            }
            return $map;
        } catch (Throwable $e) {
            Log::debug('buildInvoiceNumberMap failed', ['error' => $e->getMessage()]);
            return [];
        }
    }

    private function findActiveCustomer(int $customerId): ?Customer
    {
        if ($customerId <= 0) return null;
        $query = Customer::query()->whereKey($customerId);
        if (Schema::hasColumn('customers', 'deleted_at')) $query->whereNull('deleted_at');
        return $query->first();
    }

    private function applyNotDeletedEloquent($query): void
    {
        try {
            $table = $query->getModel()->getTable();
            if (Schema::hasColumn($table, 'deleted_at')) {
                $query->whereNull($table . '.deleted_at');
            }
        } catch (Throwable $e) {
            // ignore
        }
    }

    private function applyNotDeletedQuery($query, string $table): void
    {
        if ($this->hasColumn($this->tableColumns($table), 'deleted_at')) {
            $query->whereNull($table . '.deleted_at');
        }
    }

    private function tableColumns(string $table): array
    {
        if (isset($this->tableColumnsCache[$table])) return $this->tableColumnsCache[$table];
        try {
            $columns = [];
            foreach (Schema::getColumnListing($table) as $column) $columns[$column] = true;
            return $this->tableColumnsCache[$table] = $columns;
        } catch (Throwable $e) {
            return $this->tableColumnsCache[$table] = [];
        }
    }

    private function hasColumn(array $columns, string $column): bool
    {
        return isset($columns[$column]);
    }

    private function firstExistingTable(array $candidates): ?string
    {
        foreach ($candidates as $table) {
            try { if (Schema::hasTable($table)) return $table; } catch (Throwable $e) { continue; }
        }
        return null;
    }

    private function firstExistingColumn(string $table, array $candidates): ?string
    {
        $columns = $this->tableColumns($table);
        foreach ($candidates as $column) {
            if (isset($columns[$column])) return $column;
        }
        return null;
    }

    private function firstValue(object $row, array $columns): ?string
    {
        foreach ($columns as $column) {
            if (property_exists($row, $column) && $row->{$column} !== null && $row->{$column} !== '') {
                return (string) $row->{$column};
            }
        }
        return null;
    }

    private function firstNumericValue(object $row, array $columns): float
    {
        $first = null;
        foreach ($columns as $column) {
            if (!property_exists($row, $column)) continue;
            $value = $row->{$column};
            if ($value === null || $value === '') continue;

            $numeric = null;
            if (is_numeric($value)) $numeric = (float) $value;
            elseif (is_string($value)) {
                $cleaned = preg_replace('/[^0-9.\-]/', '', $value);
                if ($cleaned !== '' && $cleaned !== '-' && $cleaned !== '.' && is_numeric($cleaned)) {
                    $numeric = (float) $cleaned;
                }
            }
            if ($numeric === null) continue;
            if ($first === null) $first = $numeric;
            if ($numeric > 0) return $numeric;
        }
        return $first ?? 0.0;
    }

    private function resolvePaymentDirection(object $payment, array $columns): string
    {
        foreach (['payment_direction','direction','transaction_type','type'] as $column) {
            if (isset($columns[$column]) && property_exists($payment, $column)
                && $payment->{$column} !== null && $payment->{$column} !== '') {
                return strtolower(trim((string) $payment->{$column}));
            }
        }
        return 'inward';
    }

    private function isAllowedPartyType(string $value): bool
    {
        $n = strtolower(trim($value));
        return str_contains($n, 'customer') || str_contains($n, 'dealer')
            || str_contains($n, 'distributor')
            || str_ends_with($n, '\\customer') || str_ends_with($n, '\\dealer');
    }

    private function normalizeDate($value): ?string
    {
        if (empty($value)) return null;
        if ($value instanceof \DateTimeInterface) return $value->format('Y-m-d');
        $ts = strtotime((string) $value);
        return $ts ? date('Y-m-d', $ts) : null;
    }

    private function deduplicateLedgerEntries(array $entries): array
    {
        $seen = [];
        $result = [];
        foreach ($entries as $entry) {
            $key = (string) ($entry['id'] ?? '');
            if ($key === '') $key = sha1(json_encode($entry));
            if (isset($seen[$key])) continue;
            $seen[$key] = true;
            $result[] = $entry;
        }
        return $result;
    }

    private function emptyLedgerSummary(): array
    {
        return [
            'opening_balance' => 0.00,
            'total_debit' => 0.00, 'total_credit' => 0.00, 'balance' => 0.00,
            'invoice_count' => 0, 'order_count' => 0, 'payment_count' => 0,
            'credit_note_count' => 0, 'return_count' => 0,
        ];
    }

    /* ======================================================================
     |  IMPORT HELPERS
     ====================================================================== */

    private function findImportDuplicate(array $row): ?Customer
    {
        $companyId = (int) ($row['company_id'] ?? 0);
        if ($companyId <= 0) return null;

        $base = Customer::query()->where('company_id', $companyId);
        if (Schema::hasColumn('customers', 'deleted_at')) $base->whereNull('customers.deleted_at');

        if (!empty($row['gst_number'])) {
            $d = (clone $base)->where('gst_number', trim((string) $row['gst_number']))->first();
            if ($d) return $d;
        }
        if (!empty($row['email'])) {
            $d = (clone $base)->where('email', trim((string) $row['email']))->first();
            if ($d) return $d;
        }
        if (!empty($row['contact_no'])) {
            $d = (clone $base)->where('contact_no', trim((string) $row['contact_no']))->first();
            if ($d) return $d;
        }
        if (!empty($row['name'])) {
            return (clone $base)->whereRaw('LOWER(name) = ?', [mb_strtolower(trim((string) $row['name']))])->first();
        }
        return null;
    }

    private function normalizeCustomerImportData(array $row): array
    {
        foreach (['eway_bill_distance','opening_balance','credit_limit','due_days'] as $field) {
            if (isset($row[$field]) && $row[$field] !== '' && is_numeric($row[$field])) {
                $row[$field] = in_array($field, ['eway_bill_distance','due_days'], true)
                    ? (int) $row[$field] : (float) $row[$field];
            } else {
                $row[$field] = null;
            }
        }

        $row['company_id'] = (int) ($row['company_id'] ?? 0);
        $row['branch_id']  = !empty($row['branch_id']) ? (int) $row['branch_id'] : null;
        $row['group_id']   = !empty($row['group_id'])  ? (int) $row['group_id']  : null;
        $row['is_active']  = $this->parseBoolean($row['is_active'] ?? true);

        unset($row['_duplicate'], $row['_existing_id']);
        return $row;
    }

    private function parseBoolean($value): bool
    {
        if (is_bool($value)) return $value;
        $n = strtolower(trim((string) $value));
        return !in_array($n, ['0','false','no','n','off'], true);
    }

    private function cleanCsvRow(array $row): array
    {
        foreach ($row as $key => $value) {
            if (is_string($value)) {
                $row[$key] = trim(preg_replace('/^\xEF\xBB\xBF/', '', $value));
            }
        }
        return $row;
    }

    private function parseCsv($file): array
    {
        $rows = [];
        $handle = fopen($file->getRealPath(), 'r');
        if (!$handle) return [];

        $headers = fgetcsv($handle);
        if (!$headers) { fclose($handle); return []; }

        $headers = array_values(array_unique(array_map(
            fn ($h) => preg_replace('/^\xEF\xBB\xBF/', '', trim((string) $h)),
            $headers
        )));

        while (($row = fgetcsv($handle)) !== false) {
            if (count($row) < count($headers)) $row = array_pad($row, count($headers), '');
            elseif (count($row) > count($headers)) $row = array_slice($row, 0, count($headers));

            $assoc = array_combine($headers, $row);
            if (!$assoc) continue;

            $allEmpty = true;
            foreach ($assoc as $value) {
                if ($value !== null && trim((string) $value) !== '') { $allEmpty = false; break; }
            }
            if ($allEmpty) continue;

            $rows[] = $this->cleanCsvRow($assoc);
        }
        fclose($handle);
        return $rows;
    }

    private function customerCsvHeaders(): array
    {
        return [
            'company_id','branch_id','name','type','company_type','email',
            'contact_person','contact_no','gst_number','registration_type','pan',
            'billing_street','billing_landmark','billing_city','billing_state',
            'billing_country','billing_pincode',
            'shipping_street','shipping_landmark','shipping_city','shipping_state',
            'shipping_country','shipping_pincode',
            'eway_bill_distance','group_id','opening_balance','credit_limit','due_days',
            'fax','website','note','license_no','custom_field_1','custom_field_2','is_active',
        ];
    }

    /* ======================================================================
     |  VALIDATION
     ====================================================================== */

    private function validateCompanyBranchRelation($companyId, $branchId): ?string
    {
        $companyId = (int) $companyId;
        if (!$branchId) return null;

        $q = Branch::query()->whereKey((int) $branchId)->where('company_id', $companyId);
        if (Schema::hasColumn('branches', 'deleted_at')) $q->whereNull('branches.deleted_at');

        return $q->exists() ? null : 'Selected branch does not belong to the selected company.';
    }

    private function rules(): array
    {
        return [
            'company_id' => [
                'required',
                Rule::exists('companies', 'id')->where(function ($query) {
                    if (Schema::hasColumn('companies', 'deleted_at')) $query->whereNull('deleted_at');
                }),
            ],
            'branch_id' => [
                'nullable',
                Rule::exists('branches', 'id')->where(function ($query) {
                    if (Schema::hasColumn('branches', 'deleted_at')) $query->whereNull('deleted_at');
                }),
            ],
            'name'         => 'required|string|max:255',
            'type'         => 'nullable|string|max:255',
            'company_type' => 'nullable|string|max:255',
            'email'        => 'nullable|email|max:255',
            'phone'        => 'nullable|string|max:50',
            'contact_person' => 'nullable|string|max:255',
            'contact_no'   => 'nullable|string|max:50',
            'gst_number'   => 'nullable|string|max:50',
            'registration_type' => 'nullable|string|max:50',
            'pan'          => 'nullable|string|max:20',
            'billing_street'   => 'nullable|string|max:255',
            'billing_landmark' => 'nullable|string|max:255',
            'billing_city'     => 'required|string|max:255',
            'billing_state'    => 'nullable|string|max:255',
            'billing_country'  => 'nullable|string|max:255',
            'billing_pincode'  => 'nullable|string|max:20',
            'shipping_street'   => 'nullable|string|max:255',
            'shipping_landmark' => 'nullable|string|max:255',
            'shipping_city'     => 'nullable|string|max:255',
            'shipping_state'    => 'nullable|string|max:255',
            'shipping_country'  => 'nullable|string|max:255',
            'shipping_pincode'  => 'nullable|string|max:20',
            'eway_bill_distance'=> 'nullable|integer|min:0',
            'group_id' => [
                'nullable',
                Rule::exists('customer_groups', 'id')->where(function ($query) {
                    if (Schema::hasColumn('customer_groups', 'deleted_at')) $query->whereNull('deleted_at');
                }),
            ],
            'opening_balance'   => 'nullable|numeric',
            'credit_limit'      => 'nullable|numeric|min:0',
            'due_days'          => 'nullable|integer|min:0',
            'outstanding_amount'=> 'nullable|numeric',
            'fax'               => 'nullable|string|max:255',
            'website'           => 'nullable|string|max:255',
            'note'              => 'nullable|string',
            'license_no'        => 'nullable|string|max:255',
            'custom_field_1'    => 'nullable|string|max:255',
            'custom_field_2'    => 'nullable|string|max:255',
            'status'            => 'nullable|string|max:50',
            'is_active'         => 'nullable|boolean',
            'parent_id' => [
                'nullable',
                Rule::exists('customers', 'id')->where(function ($query) {
                    if (Schema::hasColumn('customers', 'deleted_at')) $query->whereNull('deleted_at');
                }),
            ],
            'territory'      => 'nullable|string|max:255',
            'zone'           => 'nullable|string|max:255',
            'wallet_balance' => 'nullable|numeric',
            'commission_rate'=> 'nullable|numeric',
            'kyc_status'     => 'nullable|string|max:50',
            'approved_at'    => 'nullable|date',
        ];
    }
}