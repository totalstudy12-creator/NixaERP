<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;

class AiContextService
{
    public function getSalesSummary()
    {
        try {
            return app()->call('\App\Http\Controllers\Api\SalesController@summary');
        } catch (\Throwable $e) {
            Log::warning('AiContextService.getSalesSummary failed: ' . $e->getMessage());
            return null;
        }
    }

    public function getLowStockProducts($limit = 10)
    {
        try {
            return \App\Models\Product::whereRaw('stock_quantity <= minimum_stock')->limit($limit)->get(['id','name','stock_quantity'])->toArray();
        } catch (\Throwable $e) {
            Log::warning('AiContextService.getLowStockProducts failed: ' . $e->getMessage());
            return [];
        }
    }

    public function getTopProducts($limit = 10)
    {
        try {
            // Best-effort: use InvoiceItem aggregation if available
            if (class_exists('\App\Models\InvoiceItem')) {
                return \App\Models\InvoiceItem::selectRaw('product_id, sum(quantity) as qty')
                    ->groupBy('product_id')->orderByDesc('qty')->limit($limit)->get()->map(function ($r) {
                        $p = \App\Models\Product::find($r->product_id);
                        return ['product_id' => $r->product_id, 'name' => $p?->name, 'sold' => $r->qty];
                    })->toArray();
            }
            return [];
        } catch (\Throwable $e) {
            Log::warning('AiContextService.getTopProducts failed: ' . $e->getMessage());
            return [];
        }
    }

    public function getTopCustomers($limit = 10)
    {
        try {
            if (class_exists('\App\Models\Invoice')) {
                return \App\Models\Invoice::selectRaw('customer_id, sum(total_amount) as total')
                    ->groupBy('customer_id')->orderByDesc('total')->limit($limit)->get()->map(function ($r) {
                        $c = \App\Models\Customer::find($r->customer_id);
                        return ['customer_id' => $r->customer_id, 'name' => $c?->name, 'total' => $r->total];
                    })->toArray();
            }
            return [];
        } catch (\Throwable $e) {
            Log::warning('AiContextService.getTopCustomers failed: ' . $e->getMessage());
            return [];
        }
    }
}
