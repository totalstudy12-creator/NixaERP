<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AccountingController extends Controller
{
    public function index()
    {
        return DB::table('accounting_accounts')->orderBy('name')->get();
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:255',
            'code' => 'required|string|max:50|unique:accounting_accounts,code',
            'type' => 'required|string|max:50',
            'normal_balance' => 'nullable|string|max:20',
            'active' => 'nullable|boolean',
        ]);

        $id = DB::table('accounting_accounts')->insertGetId([...$data, 'active' => $data['active'] ?? true]);

        return response()->json(['id' => $id, ...$data], 201);
    }

    public function show($id)
    {
        return DB::table('accounting_accounts')->where('id', $id)->first();
    }

    public function update(Request $request, $id)
    {
        $data = $request->validate([
            'name' => 'required|string|max:255',
            'code' => 'required|string|max:50|unique:accounting_accounts,code,' . $id,
            'type' => 'required|string|max:50',
            'normal_balance' => 'nullable|string|max:20',
            'active' => 'nullable|boolean',
        ]);

        DB::table('accounting_accounts')->where('id', $id)->update($data);

        return response()->json(['id' => $id, ...$data]);
    }

    public function destroy($id)
    {
        DB::table('accounting_accounts')->where('id', $id)->delete();
        return response()->noContent();
    }

    public function journals()
    {
        return DB::table('accounting_journals')->orderByDesc('created_at')->get();
    }

    public function storeJournal(Request $request)
    {
        $data = $request->validate([
            'reference' => 'required|string|max:100',
            'description' => 'nullable|string',
            'amount' => 'required|numeric',
            'entry_type' => 'required|string|max:20',
        ]);

        $id = DB::table('accounting_journals')->insertGetId([...$data, 'created_at' => now(), 'updated_at' => now()]);

        return response()->json(['id' => $id, ...$data], 201);
    }

    public function statements()
    {
        $revenue = (float) \App\Models\Invoice::whereNotIn('status', ['draft', 'cancelled'])->sum('total_amount');
        $expenses = (float) \App\Models\PurchaseInvoice::whereNotIn('status', ['draft', 'cancelled'])->sum('grand_total');
        return [
            'profit_loss' => ['revenue' => $revenue, 'expenses' => $expenses, 'net' => $revenue - $expenses],
            'balance_sheet' => null,
        ];
    }

    public function summary()
    {
        $inward = (float) \App\Models\Payment::where('payment_direction', 'inward')->whereNotIn('status', ['cancelled', 'failed', 'rejected'])->sum('amount');
        $outward = (float) \App\Models\Payment::where('payment_direction', 'outward')->whereNotIn('status', ['cancelled', 'failed', 'rejected'])->sum('amount');
        $receivables = (float) \App\Models\Invoice::whereNotIn('status', ['draft', 'cancelled'])->selectRaw('COALESCE(SUM(total_amount - paid_amount), 0) as outstanding')->value('outstanding');
        $payables = (float) \App\Models\PurchaseInvoice::selectRaw('COALESCE(SUM(grand_total - paid_amount), 0) as outstanding')->value('outstanding');
        $revenue = (float) \App\Models\Invoice::whereNotIn('status', ['draft', 'cancelled'])->sum('total_amount');
        $purchases = (float) \App\Models\PurchaseInvoice::whereNotIn('status', ['draft', 'cancelled'])->sum('grand_total');
        return [
            'receivables' => $receivables,
            'payables' => $payables,
            'cash' => $inward - $outward,
            'profit' => $revenue - $purchases,
        ];
    }
}
