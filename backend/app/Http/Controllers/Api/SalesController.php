<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SalesController extends Controller
{
    public function summary()
    {
        return [
            'total_sales' => 1325000,
            'pending_orders' => 18,
            'delivered_today' => 9,
            'outstanding' => 240000,
        ];
    }

    public function orders()
    {
        return [
            ['id' => 1, 'order_no' => 'SO-1001', 'customer' => 'Alpha Traders', 'amount' => 125000, 'status' => 'pending'],
            ['id' => 2, 'order_no' => 'SO-1002', 'customer' => 'Blue Retail', 'amount' => 74000, 'status' => 'packed'],
        ];
    }

    public function storeOrder(Request $request)
    {
        $data = $request->validate([
            'order_no' => 'required|string|max:100',
            'customer' => 'required|string|max:255',
            'amount' => 'required|numeric',
            'status' => 'nullable|string|max:50',
        ]);

        return response()->json(['created' => true, 'data' => $data], 201);
    }

    public function quotations()
    {
        return [
            ['id' => 1, 'quote_no' => 'QT-2001', 'customer' => 'North Supply', 'amount' => 85000, 'valid_until' => '2026-08-10'],
        ];
    }

    public function storeQuotation(Request $request)
    {
        $data = $request->validate([
            'quote_no' => 'required|string|max:100',
            'customer' => 'required|string|max:255',
            'amount' => 'required|numeric',
        ]);

        return response()->json(['created' => true, 'data' => $data], 201);
    }

    public function proformas()
    {
        return [
            ['id' => 1, 'proforma_no' => 'PF-3001', 'customer' => 'Green Mart', 'amount' => 52000],
        ];
    }

    public function storeProforma(Request $request)
    {
        $data = $request->validate([
            'proforma_no' => 'required|string|max:100',
            'customer' => 'required|string|max:255',
            'amount' => 'required|numeric',
        ]);

        return response()->json(['created' => true, 'data' => $data], 201);
    }

    public function deliveryChallans()
    {
        return [
            ['id' => 1, 'challan_no' => 'DC-4001', 'customer' => 'Metro Stores', 'status' => 'delivered'],
        ];
    }

    public function storeDeliveryChallan(Request $request)
    {
        $data = $request->validate([
            'challan_no' => 'required|string|max:100',
            'customer' => 'required|string|max:255',
            'status' => 'nullable|string|max:50',
        ]);

        return response()->json(['created' => true, 'data' => $data], 201);
    }

    public function returns()
    {
        return [
            ['id' => 1, 'return_no' => 'SR-5001', 'customer' => 'Bright Retail', 'amount' => 12000],
        ];
    }

    public function storeReturn(Request $request)
    {
        $data = $request->validate([
            'return_no' => 'required|string|max:100',
            'customer' => 'required|string|max:255',
            'amount' => 'required|numeric',
        ]);

        return response()->json(['created' => true, 'data' => $data], 201);
    }

    public function reports()
    {
        return [
            'sales' => 1325000,
            'tax' => 132500,
            'discount' => 25000,
        ];
    }

    public function purchaseSummary()
    {
        return [
            'total_purchases' => 780000,
            'pending_bills' => 6,
            'grn_pending' => 4,
            'payables' => 180000,
        ];
    }

    public function purchaseOrders()
    {
        return [
            ['id' => 1, 'po_no' => 'PO-7001', 'supplier' => 'Prime Supplies', 'amount' => 65000, 'status' => 'open'],
        ];
    }

    public function storePurchaseOrder(Request $request)
    {
        $data = $request->validate([
            'po_no' => 'required|string|max:100',
            'supplier' => 'required|string|max:255',
            'amount' => 'required|numeric',
            'status' => 'nullable|string|max:50',
        ]);

        return response()->json(['created' => true, 'data' => $data], 201);
    }

    public function purchaseBills()
    {
        return [
            ['id' => 1, 'bill_no' => 'PB-8001', 'supplier' => 'Prime Supplies', 'amount' => 65000, 'status' => 'pending'],
        ];
    }

    public function storePurchaseBill(Request $request)
    {
        $data = $request->validate([
            'bill_no' => 'required|string|max:100',
            'supplier' => 'required|string|max:255',
            'amount' => 'required|numeric',
            'status' => 'nullable|string|max:50',
        ]);

        return response()->json(['created' => true, 'data' => $data], 201);
    }

    public function grn()
    {
        return [
            ['id' => 1, 'grn_no' => 'GRN-9001', 'supplier' => 'Prime Supplies', 'status' => 'received'],
        ];
    }

    public function purchaseReturns()
    {
        return [
            ['id' => 1, 'return_no' => 'PR-10001', 'supplier' => 'Prime Supplies', 'amount' => 8000],
        ];
    }

    public function purchaseReports()
    {
        return [
            'purchases' => 780000,
            'tax' => 78000,
            'discount' => 10000,
        ];
    }
}
