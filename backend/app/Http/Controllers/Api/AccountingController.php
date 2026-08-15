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
        return [
            'profit_loss' => ['revenue' => 125000, 'expenses' => 95000, 'net' => 30000],
            'balance_sheet' => ['assets' => 220000, 'liabilities' => 90000, 'equity' => 130000],
        ];
    }

    public function summary()
    {
        return [
            'receivables' => 48000,
            'payables' => 22000,
            'cash' => 176000,
            'profit' => 30000,
        ];
    }
}
