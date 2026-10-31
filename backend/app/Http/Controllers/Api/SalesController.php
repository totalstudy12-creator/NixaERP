<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\Quotation;
use App\Models\SalesReturn;
use App\Models\PurchaseInvoice;
use App\Models\Payment;
use App\Models\Customer;
use App\Models\Supplier;

class SalesController extends Controller
{
    /**
     * Real Sales Summary from Database.
     */
    public function summary()
    {
        $user = auth()->user();
        $companyId = $user?->company_id;

        $invoicesQuery = Invoice::query()->when($companyId, fn($q) => $q->where('company_id', $companyId));
        $ordersQuery = Order::query()->when($companyId, fn($q) => $q->where('company_id', $companyId));

        $totalSales = (float) (clone $invoicesQuery)->sum('total_amount');
        if ($totalSales === 0.0) {
            $totalSales = (float) (clone $ordersQuery)->sum('total_amount');
        }

        $pendingOrders = (int) (clone $ordersQuery)->where('status', 'pending')->count();
        $deliveredToday = (int) (clone $ordersQuery)->where('status', 'delivered')->whereDate('updated_at', today())->count();

        $totalPaid = (float) Payment::query()
            ->when($companyId, fn($q) => $q->where('company_id', $companyId))
            ->where('type', 'in')
            ->sum('amount');

        $outstanding = max(0, $totalSales - $totalPaid);

        return response()->json([
            'total_sales'     => round($totalSales, 2),
            'pending_orders'  => $pendingOrders,
            'delivered_today' => $deliveredToday,
            'outstanding'     => round($outstanding, 2),
        ]);
    }

    /**
     * Real Sales Orders.
     */
    public function orders(Request $request)
    {
        $user = auth()->user();
        $companyId = $user?->company_id;

        $orders = Order::with('customer')
            ->when($companyId, fn($q) => $q->where('company_id', $companyId))
            ->orderByDesc('id')
            ->limit(100)
            ->get()
            ->map(function ($o) {
                return [
                    'id'         => $o->id,
                    'order_no'   => $o->order_no ?? ('SO-' . $o->id),
                    'customer'   => $o->customer?->name ?? ('Customer #' . $o->customer_id),
                    'amount'     => (float) $o->total_amount,
                    'status'     => $o->status ?? 'pending',
                    'created_at' => $o->created_at?->format('Y-m-d H:i'),
                ];
            });

        return response()->json($orders);
    }

    /**
     * Store Real Sales Order.
     */
    public function storeOrder(Request $request)
    {
        $data = $request->validate([
            'order_no'    => 'nullable|string|max:100',
            'customer_id' => 'nullable|exists:customers,id',
            'customer'    => 'nullable|string|max:255',
            'amount'      => 'required|numeric|min:0',
            'status'      => 'nullable|string|max:50',
            'notes'       => 'nullable|string',
        ]);

        $user = auth()->user();
        $companyId = $user?->company_id ?? 1;

        $customerId = $data['customer_id'] ?? null;
        if (!$customerId && !empty($data['customer'])) {
            $cust = Customer::firstOrCreate(
                ['company_id' => $companyId, 'name' => $data['customer']],
                ['status' => 'active']
            );
            $customerId = $cust->id;
        }

        if (!$customerId) {
            $customerId = Customer::where('company_id', $companyId)->value('id') ?? 1;
        }

        $orderNo = $data['order_no'] ?? ('SO-' . strtoupper(uniqid()));

        $order = Order::create([
            'company_id'   => $companyId,
            'customer_id'  => $customerId,
            'order_no'     => $orderNo,
            'total_amount' => $data['amount'],
            'status'       => $data['status'] ?? 'pending',
            'notes'        => $data['notes'] ?? null,
        ]);

        return response()->json(['created' => true, 'data' => $order], 201);
    }

    /**
     * Real Quotations.
     */
    public function quotations(Request $request)
    {
        $user = auth()->user();
        $companyId = $user?->company_id;

        $quotations = Quotation::with('customer')
            ->when($companyId, fn($q) => $q->where('company_id', $companyId))
            ->orderByDesc('id')
            ->limit(100)
            ->get()
            ->map(function ($q) {
                return [
                    'id'          => $q->id,
                    'quote_no'    => $q->reference_no ?? ('QT-' . $q->id),
                    'customer'    => $q->customer?->name ?? ('Customer #' . $q->customer_id),
                    'amount'      => (float) $q->total_amount,
                    'valid_until' => $q->valid_till ? date('Y-m-d', strtotime($q->valid_till)) : null,
                    'status'      => $q->status ?? 'draft',
                ];
            });

        return response()->json($quotations);
    }

    /**
     * Store Real Quotation.
     */
    public function storeQuotation(Request $request)
    {
        $data = $request->validate([
            'quote_no'    => 'nullable|string|max:100',
            'customer_id' => 'nullable|exists:customers,id',
            'customer'    => 'nullable|string|max:255',
            'amount'      => 'required|numeric|min:0',
            'valid_until' => 'nullable|date',
            'notes'       => 'nullable|string',
        ]);

        $user = auth()->user();
        $companyId = $user?->company_id ?? 1;

        $customerId = $data['customer_id'] ?? null;
        if (!$customerId && !empty($data['customer'])) {
            $cust = Customer::firstOrCreate(
                ['company_id' => $companyId, 'name' => $data['customer']],
                ['status' => 'active']
            );
            $customerId = $cust->id;
        }

        if (!$customerId) {
            $customerId = Customer::where('company_id', $companyId)->value('id') ?? 1;
        }

        $quoteNo = $data['quote_no'] ?? ('QT-' . strtoupper(uniqid()));

        $quote = Quotation::create([
            'company_id'   => $companyId,
            'customer_id'  => $customerId,
            'reference_no' => $quoteNo,
            'total_amount' => $data['amount'],
            'status'       => 'draft',
            'valid_till'   => $data['valid_until'] ?? null,
            'notes'        => $data['notes'] ?? null,
        ]);

        return response()->json(['created' => true, 'data' => $quote], 201);
    }

    /**
     * Real Proforma Invoices.
     */
    public function proformas()
    {
        $user = auth()->user();
        $companyId = $user?->company_id;

        $proformas = Invoice::with('customer')
            ->when($companyId, fn($q) => $q->where('company_id', $companyId))
            ->where(function ($q) {
                $q->where('status', 'proforma')
                  ->orWhere('invoice_no', 'like', 'PF-%');
            })
            ->orderByDesc('id')
            ->limit(100)
            ->get()
            ->map(function ($p) {
                return [
                    'id'          => $p->id,
                    'proforma_no' => $p->invoice_no,
                    'customer'    => $p->customer?->name ?? ('Customer #' . $p->customer_id),
                    'amount'      => (float) $p->total_amount,
                    'created_at'  => $p->created_at?->format('Y-m-d'),
                ];
            });

        return response()->json($proformas);
    }

    /**
     * Store Real Proforma.
     */
    public function storeProforma(Request $request)
    {
        $data = $request->validate([
            'proforma_no' => 'nullable|string|max:100',
            'customer_id' => 'nullable|exists:customers,id',
            'customer'    => 'nullable|string|max:255',
            'amount'      => 'required|numeric|min:0',
        ]);

        $user = auth()->user();
        $companyId = $user?->company_id ?? 1;

        $customerId = $data['customer_id'] ?? null;
        if (!$customerId && !empty($data['customer'])) {
            $cust = Customer::firstOrCreate(
                ['company_id' => $companyId, 'name' => $data['customer']],
                ['status' => 'active']
            );
            $customerId = $cust->id;
        }

        if (!$customerId) {
            $customerId = Customer::where('company_id', $companyId)->value('id') ?? 1;
        }

        $proformaNo = $data['proforma_no'] ?? ('PF-' . strtoupper(uniqid()));

        $proforma = Invoice::create([
            'company_id'   => $companyId,
            'customer_id'  => $customerId,
            'invoice_no'   => $proformaNo,
            'total_amount' => $data['amount'],
            'status'       => 'proforma',
        ]);

        return response()->json(['created' => true, 'data' => $proforma], 201);
    }

    /**
     * Real Delivery Challans.
     */
    public function deliveryChallans()
    {
        $user = auth()->user();
        $companyId = $user?->company_id;

        $challans = Order::with('customer')
            ->when($companyId, fn($q) => $q->where('company_id', $companyId))
            ->whereIn('status', ['shipped', 'delivered', 'dispatched'])
            ->orderByDesc('id')
            ->limit(100)
            ->get()
            ->map(function ($o) {
                return [
                    'id'         => $o->id,
                    'challan_no' => 'DC-' . ($o->order_no ?: $o->id),
                    'customer'   => $o->customer?->name ?? ('Customer #' . $o->customer_id),
                    'status'     => $o->status,
                    'date'       => $o->delivery_date ?? $o->updated_at?->format('Y-m-d'),
                ];
            });

        return response()->json($challans);
    }

    /**
     * Store Delivery Challan.
     */
    public function storeDeliveryChallan(Request $request)
    {
        $data = $request->validate([
            'challan_no'  => 'nullable|string|max:100',
            'customer'    => 'required|string|max:255',
            'order_id'    => 'nullable|exists:orders,id',
            'status'      => 'nullable|string|max:50',
        ]);

        $user = auth()->user();
        $companyId = $user?->company_id ?? 1;

        if (!empty($data['order_id'])) {
            $order = Order::find($data['order_id']);
            if ($order) {
                $order->update(['status' => $data['status'] ?? 'delivered']);
                return response()->json(['created' => true, 'data' => $order], 201);
            }
        }

        $cust = Customer::firstOrCreate(
            ['company_id' => $companyId, 'name' => $data['customer']],
            ['status' => 'active']
        );

        $order = Order::create([
            'company_id'   => $companyId,
            'customer_id'  => $cust->id,
            'order_no'     => $data['challan_no'] ?? ('DC-' . strtoupper(uniqid())),
            'total_amount' => 0,
            'status'       => $data['status'] ?? 'delivered',
        ]);

        return response()->json(['created' => true, 'data' => $order], 201);
    }

    /**
     * Real Sales Returns.
     */
    public function returns()
    {
        $user = auth()->user();
        $companyId = $user?->company_id;

        $returns = SalesReturn::with('customer')
            ->when($companyId, fn($q) => $q->where('company_id', $companyId))
            ->orderByDesc('id')
            ->limit(100)
            ->get()
            ->map(function ($r) {
                return [
                    'id'        => $r->id,
                    'return_no' => $r->return_number ?? ('SR-' . $r->id),
                    'customer'  => $r->customer?->name ?? ('Customer #' . $r->customer_id),
                    'amount'    => (float) $r->total_amount,
                    'status'    => $r->status ?? 'pending',
                ];
            });

        return response()->json($returns);
    }

    /**
     * Store Real Sales Return.
     */
    public function storeReturn(Request $request)
    {
        $data = $request->validate([
            'return_no'   => 'nullable|string|max:100',
            'customer_id' => 'nullable|exists:customers,id',
            'customer'    => 'nullable|string|max:255',
            'amount'      => 'required|numeric|min:0',
        ]);

        $user = auth()->user();
        $companyId = $user?->company_id ?? 1;

        $customerId = $data['customer_id'] ?? null;
        if (!$customerId && !empty($data['customer'])) {
            $cust = Customer::firstOrCreate(
                ['company_id' => $companyId, 'name' => $data['customer']],
                ['status' => 'active']
            );
            $customerId = $cust->id;
        }

        if (!$customerId) {
            $customerId = Customer::where('company_id', $companyId)->value('id') ?? 1;
        }

        $returnNo = $data['return_no'] ?? ('SR-' . strtoupper(uniqid()));

        $return = SalesReturn::create([
            'company_id'    => $companyId,
            'customer_id'   => $customerId,
            'return_number' => $returnNo,
            'total_amount'  => $data['amount'],
            'status'        => 'pending',
        ]);

        return response()->json(['created' => true, 'data' => $return], 201);
    }

    /**
     * Real Sales Reports.
     */
    public function reports()
    {
        $user = auth()->user();
        $companyId = $user?->company_id;

        $invoices = Invoice::query()->when($companyId, fn($q) => $q->where('company_id', $companyId));

        $sales = (float) (clone $invoices)->sum('total_amount');
        $tax = (float) (clone $invoices)->sum('tax_amount');
        $discount = (float) Order::query()
            ->when($companyId, fn($q) => $q->where('company_id', $companyId))
            ->sum('discount_amount');

        return response()->json([
            'sales'    => round($sales, 2),
            'tax'      => round($tax, 2),
            'discount' => round($discount, 2),
        ]);
    }

    /**
     * Real Purchase Summary.
     */
    public function purchaseSummary()
    {
        $user = auth()->user();
        $companyId = $user?->company_id;

        $purchasesQuery = PurchaseInvoice::query()
            ->when($companyId, fn($q) => $q->where('company_id', $companyId));

        $totalPurchases = (float) (clone $purchasesQuery)->sum('total_amount');
        $pendingBills = (int) (clone $purchasesQuery)->where('status', 'pending')->count();
        $grnPending = (int) (clone $purchasesQuery)->whereNull('received_at')->count();

        $paidPurchases = (float) Payment::query()
            ->when($companyId, fn($q) => $q->where('company_id', $companyId))
            ->where('type', 'out')
            ->sum('amount');

        $payables = max(0, $totalPurchases - $paidPurchases);

        return response()->json([
            'total_purchases' => round($totalPurchases, 2),
            'pending_bills'   => $pendingBills,
            'grn_pending'     => $grnPending,
            'payables'        => round($payables, 2),
        ]);
    }

    /**
     * Real Purchase Orders.
     */
    public function purchaseOrders()
    {
        $user = auth()->user();
        $companyId = $user?->company_id;

        $pos = PurchaseInvoice::with('supplier')
            ->when($companyId, fn($q) => $q->where('company_id', $companyId))
            ->whereIn('status', ['draft', 'open', 'ordered'])
            ->orderByDesc('id')
            ->limit(100)
            ->get()
            ->map(function ($p) {
                return [
                    'id'       => $p->id,
                    'po_no'    => $p->invoice_no ?? ('PO-' . $p->id),
                    'supplier' => $p->supplier?->name ?? ('Supplier #' . $p->supplier_id),
                    'amount'   => (float) $p->total_amount,
                    'status'   => $p->status,
                ];
            });

        return response()->json($pos);
    }

    /**
     * Store Purchase Order.
     */
    public function storePurchaseOrder(Request $request)
    {
        $data = $request->validate([
            'po_no'       => 'nullable|string|max:100',
            'supplier_id' => 'nullable|exists:suppliers,id',
            'supplier'    => 'nullable|string|max:255',
            'amount'      => 'required|numeric|min:0',
            'status'      => 'nullable|string|max:50',
        ]);

        $user = auth()->user();
        $companyId = $user?->company_id ?? 1;

        $supplierId = $data['supplier_id'] ?? null;
        if (!$supplierId && !empty($data['supplier'])) {
            $sup = Supplier::firstOrCreate(
                ['company_id' => $companyId, 'name' => $data['supplier']],
                ['status' => 'active']
            );
            $supplierId = $sup->id;
        }

        if (!$supplierId) {
            $supplierId = Supplier::where('company_id', $companyId)->value('id') ?? 1;
        }

        $poNo = $data['po_no'] ?? ('PO-' . strtoupper(uniqid()));

        $po = PurchaseInvoice::create([
            'company_id'   => $companyId,
            'supplier_id'  => $supplierId,
            'invoice_no'   => $poNo,
            'total_amount' => $data['amount'],
            'status'       => $data['status'] ?? 'open',
            'invoice_date' => now()->toDateString(),
        ]);

        return response()->json(['created' => true, 'data' => $po], 201);
    }

    /**
     * Real Purchase Bills.
     */
    public function purchaseBills()
    {
        $user = auth()->user();
        $companyId = $user?->company_id;

        $bills = PurchaseInvoice::with('supplier')
            ->when($companyId, fn($q) => $q->where('company_id', $companyId))
            ->orderByDesc('id')
            ->limit(100)
            ->get()
            ->map(function ($b) {
                return [
                    'id'       => $b->id,
                    'bill_no'  => $b->invoice_no ?? ('PB-' . $b->id),
                    'supplier' => $b->supplier?->name ?? ('Supplier #' . $b->supplier_id),
                    'amount'   => (float) $b->total_amount,
                    'status'   => $b->status,
                ];
            });

        return response()->json($bills);
    }

    /**
     * Store Purchase Bill.
     */
    public function storePurchaseBill(Request $request)
    {
        $data = $request->validate([
            'bill_no'     => 'nullable|string|max:100',
            'supplier_id' => 'nullable|exists:suppliers,id',
            'supplier'    => 'nullable|string|max:255',
            'amount'      => 'required|numeric|min:0',
            'status'      => 'nullable|string|max:50',
        ]);

        $user = auth()->user();
        $companyId = $user?->company_id ?? 1;

        $supplierId = $data['supplier_id'] ?? null;
        if (!$supplierId && !empty($data['supplier'])) {
            $sup = Supplier::firstOrCreate(
                ['company_id' => $companyId, 'name' => $data['supplier']],
                ['status' => 'active']
            );
            $supplierId = $sup->id;
        }

        if (!$supplierId) {
            $supplierId = Supplier::where('company_id', $companyId)->value('id') ?? 1;
        }

        $billNo = $data['bill_no'] ?? ('PB-' . strtoupper(uniqid()));

        $bill = PurchaseInvoice::create([
            'company_id'   => $companyId,
            'supplier_id'  => $supplierId,
            'invoice_no'   => $billNo,
            'total_amount' => $data['amount'],
            'status'       => $data['status'] ?? 'pending',
            'invoice_date' => now()->toDateString(),
        ]);

        return response()->json(['created' => true, 'data' => $bill], 201);
    }

    /**
     * Real GRN (Goods Received Notes).
     */
    public function grn()
    {
        $user = auth()->user();
        $companyId = $user?->company_id;

        $grns = PurchaseInvoice::with('supplier')
            ->when($companyId, fn($q) => $q->where('company_id', $companyId))
            ->whereNotNull('received_at')
            ->orWhere('status', 'received')
            ->orderByDesc('id')
            ->limit(100)
            ->get()
            ->map(function ($g) {
                return [
                    'id'       => $g->id,
                    'grn_no'   => 'GRN-' . ($g->invoice_no ?: $g->id),
                    'supplier' => $g->supplier?->name ?? ('Supplier #' . $g->supplier_id),
                    'status'   => 'received',
                ];
            });

        return response()->json($grns);
    }

    /**
     * Real Purchase Returns.
     */
    public function purchaseReturns()
    {
        $user = auth()->user();
        $companyId = $user?->company_id;

        $returns = PurchaseInvoice::with('supplier')
            ->when($companyId, fn($q) => $q->where('company_id', $companyId))
            ->where('status', 'returned')
            ->orderByDesc('id')
            ->limit(100)
            ->get()
            ->map(function ($r) {
                return [
                    'id'        => $r->id,
                    'return_no' => 'PR-' . ($r->invoice_no ?: $r->id),
                    'supplier'  => $r->supplier?->name ?? ('Supplier #' . $r->supplier_id),
                    'amount'    => (float) $r->total_amount,
                ];
            });

        return response()->json($returns);
    }

    /**
     * Real Purchase Reports.
     */
    public function purchaseReports()
    {
        $user = auth()->user();
        $companyId = $user?->company_id;

        $query = PurchaseInvoice::query()
            ->when($companyId, fn($q) => $q->where('company_id', $companyId));

        $purchases = (float) (clone $query)->sum('total_amount');
        $tax = (float) (clone $query)->sum('tax_amount');
        $discount = (float) (clone $query)->sum('discount_amount');

        return response()->json([
            'purchases' => round($purchases, 2),
            'tax'       => round($tax, 2),
            'discount'  => round($discount, 2),
        ]);
    }
}
