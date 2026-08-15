<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Invoice;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class OrderController extends Controller
{
    /**
     * Display a listing of orders (paginated with relations).
     */
    public function index()
    {
        return Order::with(['company', 'customer', 'items.product'])
            ->orderBy('created_at', 'desc')
            ->paginate(15);
    }

    /**
     * Store a newly created order.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'company_id'         => 'required|exists:companies,id',
            'customer_id'        => 'required|exists:customers,id',
            'quotation_id'       => 'nullable|exists:quotations,id',
            'order_no'           => 'nullable|string|max:100|unique:orders,order_no',
            'discount_amount'    => 'nullable|numeric|min:0',
            'source'             => 'nullable|string|max:50',
            'reference_no'       => 'nullable|string|max:100',
            'total_amount'       => 'required|numeric|min:0',
            'tax_amount'         => 'nullable|numeric|min:0',
            'payment_amount'     => 'nullable|numeric|min:0',
            'payment_method'     => 'nullable|string|max:50',
            'is_partial'         => 'nullable|boolean',
            'status'             => 'nullable|string|max:50',
            'delivery_date'      => 'nullable|date',
            'shipping_address'   => 'nullable|string',
            'notes'              => 'nullable|string',
            'items'              => 'required|array|min:1',
            'items.*.product_id' => 'required|exists:products,id',
            'items.*.qty'        => 'required|integer|min:1',
            'items.*.price'      => 'required|numeric|min:0',
            'items.*.tax_rate'   => 'nullable|numeric|min:0',
        ]);

        // Auto‑generate order_no if not provided or duplicate
        if (empty($data['order_no'])) {
            $data['order_no'] = Order::generateOrderNo();
        } else {
            $exists = Order::withTrashed()->where('order_no', $data['order_no'])->exists();
            if ($exists) {
                $data['order_no'] = Order::generateOrderNo();
            }
        }

        // Default payment_amount to total if not explicitly set
        if (!isset($data['payment_amount']) || $data['payment_amount'] === null || $data['payment_amount'] === '') {
            $data['payment_amount'] = $data['total_amount'];
        }

        return DB::transaction(function () use ($data) {
            $order = Order::create($data);

            foreach ($data['items'] as $item) {
                OrderItem::create([
                    'order_id'   => $order->id,
                    'product_id' => $item['product_id'],
                    'quantity'   => $item['qty'],
                    'unit_price' => $item['price'],
                    'tax_rate'   => $item['tax_rate'] ?? 0,
                    'subtotal'   => $item['qty'] * $item['price'],
                ]);
            }

            return $order->load(['company', 'customer', 'items.product']);
        });
    }

    /**
     * Display the specified order.
     */
    public function show(Order $order)
    {
        return $order->load(['company', 'customer', 'items.product']);
    }

    /**
     * Update the specified order.
     */
    public function update(Request $request, Order $order)
    {
        $data = $request->validate([
            'company_id'         => 'required|exists:companies,id',
            'customer_id'        => 'required|exists:customers,id',
            'quotation_id'       => 'nullable|exists:quotations,id',
            'order_no'           => 'required|string|max:100|unique:orders,order_no,' . $order->id,
            'discount_amount'    => 'nullable|numeric|min:0',
            'source'             => 'nullable|string|max:50',
            'reference_no'       => 'nullable|string|max:100',
            'total_amount'       => 'required|numeric|min:0',
            'tax_amount'         => 'nullable|numeric|min:0',
            'payment_amount'     => 'nullable|numeric|min:0',
            'payment_method'     => 'nullable|string|max:50',
            'is_partial'         => 'nullable|boolean',
            'status'             => 'nullable|string|max:50',
            'delivery_date'      => 'nullable|date',
            'shipping_address'   => 'nullable|string',
            'notes'              => 'nullable|string',
            'items'              => 'sometimes|array|min:1',
            'items.*.product_id' => 'required|exists:products,id',
            'items.*.qty'        => 'required|integer|min:1',
            'items.*.price'      => 'required|numeric|min:0',
            'items.*.tax_rate'   => 'nullable|numeric|min:0',
        ]);

        // Default payment_amount to total if not explicitly set
        if (!isset($data['payment_amount']) || $data['payment_amount'] === null || $data['payment_amount'] === '') {
            $data['payment_amount'] = $data['total_amount'];
        }

        return DB::transaction(function () use ($data, $order) {
            $order->update($data);

            if (isset($data['items'])) {
                $order->items()->delete();
                foreach ($data['items'] as $item) {
                    OrderItem::create([
                        'order_id'   => $order->id,
                        'product_id' => $item['product_id'],
                        'quantity'   => $item['qty'],
                        'unit_price' => $item['price'],
                        'tax_rate'   => $item['tax_rate'] ?? 0,
                        'subtotal'   => $item['qty'] * $item['price'],
                    ]);
                }
            }

            return $order->load(['company', 'customer', 'items.product']);
        });
    }

    /**
     * Remove the specified order (soft delete).
     */
    public function destroy(Order $order)
    {
        $order->delete();
        return response()->noContent();
    }

    /**
     * Create an invoice from the given order.
     */
    public function createInvoice(Request $request, Order $order)
    {
        $request->validate([
            'invoice_no' => 'required|string|max:100|unique:invoices,invoice_no',
        ]);

        if ($order->invoice) {
            return response()->json(['message' => 'Invoice already exists for this order.'], 422);
        }

        $invoice = Invoice::create([
            'order_id'     => $order->id,
            'invoice_no'   => $request->invoice_no,
            'total_amount' => $order->total_amount,
            'status'       => 'draft',
        ]);

        return response()->json($invoice, 201);
    }
}