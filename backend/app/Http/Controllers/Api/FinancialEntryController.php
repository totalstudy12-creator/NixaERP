<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\Company;
use App\Models\FinancialEntry;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class FinancialEntryController extends Controller
{
    private function validated(Request $request): array
    {
        $data = $request->validate([
            'company_id' => ['required', 'integer', Rule::exists('companies', 'id')->where('active', true)->whereNull('deleted_at')],
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'direction' => ['required', Rule::in(['income', 'expense'])],
            'category' => ['required', 'string', 'max:100'],
            'counterparty' => ['nullable', 'string', 'max:190'],
            'amount' => ['required', 'numeric', 'gt:0', 'max:9999999999999.99'],
            'entry_date' => ['required', 'date_format:Y-m-d', 'before_or_equal:today'],
            'payment_method' => ['required', Rule::in(['cash', 'bank_transfer', 'card', 'upi', 'cheque', 'other'])],
            'reference_no' => ['nullable', 'string', 'max:100'],
            'description' => ['nullable', 'string', 'max:2000'],
        ]);
        if (!empty($data['branch_id']) && !Branch::whereKey($data['branch_id'])->where('company_id', $data['company_id'])->where('active', true)->exists()) {
            throw ValidationException::withMessages(['branch_id' => ['The selected branch must be active and belong to the selected company.']]);
        }
        return $data;
    }

    private function scopedQuery(Request $request)
    {
        $data = $request->validate([
            'direction' => ['nullable', Rule::in(['income', 'expense'])],
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
            'search' => ['nullable', 'string', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);
        $userCompanyId = $request->user()?->company_id;
        $direction = $data['direction'] ?? $request->route('direction');
        $companyId = $userCompanyId ?: ($data['company_id'] ?? null);
        if (!empty($data['branch_id']) && !Branch::whereKey($data['branch_id'])->when($companyId, fn ($q) => $q->where('company_id', $companyId))->exists()) {
            throw ValidationException::withMessages(['branch_id' => ['The selected branch is outside the selected company.']]);
        }
        $query = FinancialEntry::query()->with(['company:id,name', 'branch:id,name'])->when($companyId, fn ($q) => $q->where('company_id', $companyId))->when(!$companyId && $userCompanyId, fn ($q) => $q->whereRaw('1 = 0'))
            ->when($direction, fn ($q) => $q->where('direction', $direction))
            ->when(isset($data['branch_id']), fn ($q) => $q->where('branch_id', $data['branch_id']))
            ->when(isset($data['from']), fn ($q) => $q->whereDate('entry_date', '>=', $data['from']))
            ->when(isset($data['to']), fn ($q) => $q->whereDate('entry_date', '<=', $data['to']))
            ->when(isset($data['search']), fn ($q) => $q->where(fn ($sub) => $sub->where('reference_no', 'like', '%' . $data['search'] . '%')->orWhere('category', 'like', '%' . $data['search'] . '%')->orWhere('counterparty', 'like', '%' . $data['search'] . '%')->orWhere('description', 'like', '%' . $data['search'] . '%')));
        return [$query, $data];
    }

    public function index(Request $request)
    {
        [$query, $filters] = $this->scopedQuery($request);
        $aggregate = (clone $query)->selectRaw('COUNT(*) as count, COALESCE(SUM(amount), 0) as total')->first();
        $entries = $query->orderByDesc('entry_date')->orderByDesc('id')->paginate($filters['per_page'] ?? 25);
        return response()->json([
            'data' => $entries->items(),
            'meta' => ['current_page' => $entries->currentPage(), 'last_page' => $entries->lastPage(), 'per_page' => $entries->perPage(), 'total' => $entries->total()],
            'summary' => ['count' => (int) $aggregate->count, 'total' => (float) $aggregate->total],
        ]);
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        $companyId = $request->user()?->company_id;
        if ($companyId && (int) $data['company_id'] !== (int) $companyId) {
            throw ValidationException::withMessages(['company_id' => ['You cannot create a record for another company.']]);
        }
        $entry = DB::transaction(fn () => FinancialEntry::create([...$data, 'status' => 'completed', 'created_by' => $request->user()->id]));
        return response()->json(['data' => $entry->load(['company:id,name', 'branch:id,name'])], 201);
    }

    public function update(Request $request, FinancialEntry $financialEntry)
    {
        $this->authorizeEntry($request, $financialEntry);
        $data = $this->validated($request);
        if ((int) $data['company_id'] !== (int) $financialEntry->company_id) {
            throw ValidationException::withMessages(['company_id' => ['A financial entry cannot be moved to another company.']]);
        }
        DB::transaction(fn () => $financialEntry->update([...$data, 'updated_by' => $request->user()->id]));
        return response()->json(['data' => $financialEntry->fresh()->load(['company:id,name', 'branch:id,name'])]);
    }

    public function destroy(Request $request, FinancialEntry $financialEntry)
    {
        $this->authorizeEntry($request, $financialEntry);
        $financialEntry->delete();
        return response()->noContent();
    }

    private function authorizeEntry(Request $request, FinancialEntry $entry): void
    {
        $companyId = $request->user()?->company_id;
        abort_if($companyId && (int) $companyId !== (int) $entry->company_id, 404);
    }
}
