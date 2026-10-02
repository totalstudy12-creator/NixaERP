<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreIncomeExpenseRequest;
use App\Http\Requests\UpdateIncomeExpenseRequest;
use App\Models\Company;
use App\Models\FinancialEntry;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class IncomeExpenseController extends Controller
{
    private function buildBaseQuery(Request $request)
    {
        $query = FinancialEntry::query()->with(['company:id,name', 'branch:id,name']);

        if ($request->filled('company_id')) {
            $query->where('company_id', (int) $request->company_id);
        }

        if ($request->filled('branch_id')) {
            $query->where('branch_id', (int) $request->branch_id);
        }

        if ($request->filled('direction')) {
            $query->where('direction', $request->direction);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('search')) {
            $term = trim($request->search);
            $query->where(function ($sub) use ($term) {
                $sub->where('reference_no', 'like', "%{$term}%")
                    ->orWhere('category', 'like', "%{$term}%")
                    ->orWhere('counterparty', 'like', "%{$term}%")
                    ->orWhere('description', 'like', "%{$term}%");
            });
        }

        if ($request->filled('from')) {
            $query->whereDate('entry_date', '>=', $request->from);
        }

        if ($request->filled('to')) {
            $query->whereDate('entry_date', '<=', $request->to);
        }

        return $query;
    }

    public function index(Request $request)
    {
        $query = $this->buildBaseQuery($request);
        $query->orderByDesc('entry_date')->orderByDesc('id');

        $perPage = (int) ($request->input('per_page', 25) ?: 25);
        $perPage = max(1, min($perPage, 100));

        $paginator = $query->paginate($perPage);

        return response()->json([
            'data' => $paginator->items(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    public function show(FinancialEntry $financialEntry)
    {
        return response()->json(['data' => $financialEntry->load(['company:id,name', 'branch:id,name'])]);
    }

    public function store(StoreIncomeExpenseRequest $request)
    {
        $data = $request->validated();

        if (! empty($data['branch_id']) && Company::whereKey($data['company_id'])->whereHas('branches', fn ($query) => $query->whereKey($data['branch_id']))->doesntExist()) {
            throw ValidationException::withMessages(['branch_id' => ['The selected branch is not valid for the selected company.']]);
        }

        $data['status'] = $data['status'] ?? 'completed';
        $data['reference_no'] = $data['reference_no'] ?? 'FIN-' . now()->format('YmdHis') . '-' . random_int(1000, 9999);
        $data['total_amount'] = $data['total_amount'] ?? ($data['amount'] + ($data['tax_amount'] ?? 0));
        $data['created_by'] = $request->user()?->id;

        $entry = DB::transaction(function () use ($data) {
            return FinancialEntry::create($data);
        });

        return response()->json(['data' => $entry->fresh()->load(['company:id,name', 'branch:id,name'])], 201);
    }

    public function update(UpdateIncomeExpenseRequest $request, FinancialEntry $financialEntry)
    {
        $data = $request->validated();

        if (! empty($data['branch_id']) && Company::whereKey($data['company_id'] ?? $financialEntry->company_id)->whereHas('branches', fn ($query) => $query->whereKey($data['branch_id']))->doesntExist()) {
            throw ValidationException::withMessages(['branch_id' => ['The selected branch is not valid for the selected company.']]);
        }

        $data['updated_by'] = $request->user()?->id;
        $data['status'] = $data['status'] ?? $financialEntry->status;
        $data['reference_no'] = $data['reference_no'] ?? $financialEntry->reference_no;
        $data['total_amount'] = $data['total_amount'] ?? (($data['amount'] ?? $financialEntry->amount) + (($data['tax_amount'] ?? $financialEntry->tax_amount ?? 0)));

        $entry = DB::transaction(function () use ($financialEntry, $data) {
            $financialEntry->update($data);

            return $financialEntry->fresh();
        });

        return response()->json(['data' => $entry->load(['company:id,name', 'branch:id,name'])]);
    }

    public function destroy(FinancialEntry $financialEntry)
    {
        $financialEntry->delete();

        return response()->noContent();
    }

    public function dashboard(Request $request)
    {
        $from = $request->input('from', now()->startOfMonth()->toDateString());
        $to = $request->input('to', now()->endOfMonth()->toDateString());
        $query = FinancialEntry::query()
            ->when($request->filled('company_id'), fn ($q) => $q->where('company_id', (int) $request->company_id))
            ->when($request->filled('branch_id'), fn ($q) => $q->where('branch_id', (int) $request->branch_id))
            ->whereBetween('entry_date', [$from, $to]);

        $income = (clone $query)->where('direction', 'income');
        $expense = (clone $query)->where('direction', 'expense');

        $totalIncome = (float) $income->sum('amount');
        $totalExpenses = (float) $expense->sum('amount');

        $pendingIncome = (float) (clone $income)->whereIn('status', ['pending', 'draft'])->sum('amount');
        $pendingExpenses = (float) (clone $expense)->whereIn('status', ['pending', 'draft'])->sum('amount');

        $monthStart = now()->startOfMonth()->toDateString();
        $yearStart = now()->startOfYear()->toDateString();
        $currentMonthIncome = (float) FinancialEntry::query()->where('direction', 'income')->whereBetween('entry_date', [$monthStart, now()->toDateString()])->when($request->filled('company_id'), fn ($q) => $q->where('company_id', (int) $request->company_id))->when($request->filled('branch_id'), fn ($q) => $q->where('branch_id', (int) $request->branch_id))->sum('amount');
        $currentYearIncome = (float) FinancialEntry::query()->where('direction', 'income')->whereBetween('entry_date', [$yearStart, now()->toDateString()])->when($request->filled('company_id'), fn ($q) => $q->where('company_id', (int) $request->company_id))->when($request->filled('branch_id'), fn ($q) => $q->where('branch_id', (int) $request->branch_id))->sum('amount');

        $priorPeriodIncome = (float) FinancialEntry::query()->where('direction', 'income')->whereBetween('entry_date', [now()->subMonth()->startOfMonth()->toDateString(), now()->subMonth()->endOfMonth()->toDateString()])->when($request->filled('company_id'), fn ($q) => $q->where('company_id', (int) $request->company_id))->when($request->filled('branch_id'), fn ($q) => $q->where('branch_id', (int) $request->branch_id))->sum('amount');
        $priorPeriodExpense = (float) FinancialEntry::query()->where('direction', 'expense')->whereBetween('entry_date', [now()->subMonth()->startOfMonth()->toDateString(), now()->subMonth()->endOfMonth()->toDateString()])->when($request->filled('company_id'), fn ($q) => $q->where('company_id', (int) $request->company_id))->when($request->filled('branch_id'), fn ($q) => $q->where('branch_id', (int) $request->branch_id))->sum('amount');

        $incomeGrowth = $priorPeriodIncome > 0 ? (($currentMonthIncome - $priorPeriodIncome) / $priorPeriodIncome) * 100 : 0;
        $expenseGrowth = $priorPeriodExpense > 0 ? (($totalExpenses - $priorPeriodExpense) / $priorPeriodExpense) * 100 : 0;
        $netMargin = $totalIncome > 0 ? (($totalIncome - $totalExpenses) / $totalIncome) * 100 : 0;

        return response()->json([
            'kpis' => [
                'total_income' => round($totalIncome, 2),
                'total_expenses' => round($totalExpenses, 2),
                'net_cash_flow' => round($totalIncome - $totalExpenses, 2),
                'pending_expenses' => round($pendingExpenses, 2),
                'pending_income' => round($pendingIncome, 2),
                'this_month' => round($currentMonthIncome, 2),
                'this_year' => round($currentYearIncome, 2),
                'income_growth_pct' => round($incomeGrowth, 2),
                'expense_growth_pct' => round($expenseGrowth, 2),
                'net_margin_pct' => round($netMargin, 2),
                'transaction_count' => (int) $query->count(),
                'average_transaction_value' => $query->count() > 0 ? round((float) $query->sum('amount') / $query->count(), 2) : 0,
            ],
            'records' => $query->orderByDesc('entry_date')->orderByDesc('id')->limit(10)->get()->map(fn ($entry) => $entry->toArray()),
        ]);
    }

    public function export(Request $request)
    {
        $query = $this->buildBaseQuery($request)->orderByDesc('entry_date');
        $csv = fopen('php://temp', 'w+');
        fputcsv($csv, ['id', 'direction', 'category', 'counterparty', 'amount', 'tax_amount', 'total_amount', 'payment_method', 'status', 'entry_date', 'reference_no', 'description']);

        foreach ($query->cursor() as $item) {
            fputcsv($csv, [
                $item->id,
                $item->direction,
                $item->category,
                $item->counterparty,
                $item->amount,
                $item->tax_amount,
                $item->total_amount,
                $item->payment_method,
                $item->status,
                $item->entry_date,
                $item->reference_no,
                $item->description,
            ]);
        }

        rewind($csv);
        $content = stream_get_contents($csv);
        fclose($csv);

        return response($content)
            ->header('Content-Type', 'text/csv; charset=UTF-8')
            ->header('Content-Disposition', 'attachment; filename="income-expenses-export.csv"');
    }
}
