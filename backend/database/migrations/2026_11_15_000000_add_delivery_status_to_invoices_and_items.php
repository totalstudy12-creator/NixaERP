<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // 1. Add delivery tracking columns to invoices
        Schema::table('invoices', function (Blueprint $table) {
            if (!Schema::hasColumn('invoices', 'delivery_status')) {
                $table->string('delivery_status', 30)->default('pending')->index()->after('status');
            }
            if (!Schema::hasColumn('invoices', 'packed_at')) {
                $table->dateTime('packed_at')->nullable()->after('delivery_status');
            }
            if (!Schema::hasColumn('invoices', 'dispatched_at')) {
                $table->dateTime('dispatched_at')->nullable()->after('packed_at');
            }
            if (!Schema::hasColumn('invoices', 'delivered_at')) {
                $table->dateTime('delivered_at')->nullable()->after('dispatched_at');
            }
        });

        // 2. Add delivery tracking columns to invoice_items
        Schema::table('invoice_items', function (Blueprint $table) {
            if (!Schema::hasColumn('invoice_items', 'delivery_status')) {
                $table->string('delivery_status', 30)->default('pending')->index()->after('total');
            }
            if (!Schema::hasColumn('invoice_items', 'packed_quantity')) {
                $table->decimal('packed_quantity', 12, 2)->default(0)->after('delivery_status');
            }
            if (!Schema::hasColumn('invoice_items', 'delivered_quantity')) {
                $table->decimal('delivered_quantity', 12, 2)->default(0)->after('packed_quantity');
            }
        });

        // 3. Synchronize any existing delivery orders if delivery_orders table exists
        if (Schema::hasTable('delivery_orders')) {
            // Delivered orders
            $deliveredOrders = DB::table('delivery_orders')
                ->whereIn('status', ['delivered', 'completed'])
                ->get();

            foreach ($deliveredOrders as $order) {
                DB::table('invoices')->where('id', $order->invoice_id)->update([
                    'delivery_status' => 'delivered',
                    'delivered_at' => $order->delivery_completed_at ?? $order->updated_at ?? now(),
                ]);

                // Update items
                $items = DB::table('invoice_items')->where('invoice_id', $order->invoice_id)->get();
                foreach ($items as $item) {
                    DB::table('invoice_items')->where('id', $item->id)->update([
                        'delivery_status' => 'delivered',
                        'delivered_quantity' => $item->quantity,
                        'packed_quantity' => $item->quantity,
                    ]);
                }
            }

            // Dispatched / In-transit orders
            $dispatchedOrders = DB::table('delivery_orders')
                ->whereIn('status', ['dispatched', 'in_transit'])
                ->get();

            foreach ($dispatchedOrders as $order) {
                DB::table('invoices')->where('id', $order->invoice_id)->where('delivery_status', 'pending')->update([
                    'delivery_status' => 'sent',
                    'dispatched_at' => $order->updated_at ?? now(),
                ]);

                $items = DB::table('invoice_items')->where('invoice_id', $order->invoice_id)->get();
                foreach ($items as $item) {
                    DB::table('invoice_items')->where('id', $item->id)->where('delivery_status', 'pending')->update([
                        'delivery_status' => 'sent',
                        'packed_quantity' => $item->quantity,
                    ]);
                }
            }

            // Packed / Ready for dispatch orders
            $packedOrders = DB::table('delivery_orders')
                ->whereIn('status', ['ready_for_dispatch', 'loading_in_progress', 'vehicle_assigned'])
                ->get();

            foreach ($packedOrders as $order) {
                DB::table('invoices')->where('id', $order->invoice_id)->where('delivery_status', 'pending')->update([
                    'delivery_status' => 'packed',
                    'packed_at' => $order->updated_at ?? now(),
                ]);

                $items = DB::table('invoice_items')->where('invoice_id', $order->invoice_id)->where('delivery_status', 'pending')->update([
                    'delivery_status' => 'packed',
                ]);
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $cols = ['delivery_status', 'packed_at', 'dispatched_at', 'delivered_at'];
            foreach ($cols as $col) {
                if (Schema::hasColumn('invoices', $col)) {
                    $table->dropColumn($col);
                }
            }
        });

        Schema::table('invoice_items', function (Blueprint $table) {
            $cols = ['delivery_status', 'packed_quantity', 'delivered_quantity'];
            foreach ($cols as $col) {
                if (Schema::hasColumn('invoice_items', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
