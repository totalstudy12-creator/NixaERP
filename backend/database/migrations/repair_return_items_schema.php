<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Repair/complete the live sales-return schema without dropping data.
     *
     * This migration is intentionally idempotent so it is safe to run on
     * databases where some return columns already exist.
     */
    public function up(): void
    {
        if (!Schema::hasTable('return_items')) {
            return;
        }

        Schema::table('return_items', function (Blueprint $table) {
            if (!Schema::hasColumn('return_items', 'sale_item_id')) {
                $table->foreignId('sale_item_id')
                    ->nullable()
                    ->after('sales_return_id')
                    ->constrained('invoice_items')
                    ->nullOnDelete();
            }

            if (!Schema::hasColumn('return_items', 'return_qty')) {
                $table->unsignedInteger('return_qty')
                    ->default(0)
                    ->after('sale_item_id');
            }

            if (!Schema::hasColumn('return_items', 'rate')) {
                $table->decimal('rate', 15, 2)
                    ->default(0)
                    ->after('return_qty');
            }

            if (!Schema::hasColumn('return_items', 'gst_rate')) {
                $table->decimal('gst_rate', 8, 2)
                    ->default(0)
                    ->after('rate');
            }

            if (!Schema::hasColumn('return_items', 'taxable_amount')) {
                $table->decimal('taxable_amount', 15, 2)->default(0);
            }

            if (!Schema::hasColumn('return_items', 'cgst_amount')) {
                $table->decimal('cgst_amount', 15, 2)->default(0);
            }

            if (!Schema::hasColumn('return_items', 'sgst_amount')) {
                $table->decimal('sgst_amount', 15, 2)->default(0);
            }

            if (!Schema::hasColumn('return_items', 'igst_amount')) {
                $table->decimal('igst_amount', 15, 2)->default(0);
            }

            if (!Schema::hasColumn('return_items', 'total_amount')) {
                $table->decimal('total_amount', 15, 2)->default(0);
            }

            if (!Schema::hasColumn('return_items', 'condition')) {
                $table->string('condition', 20)->default('good');
            }

            if (!Schema::hasColumn('return_items', 'restock_status')) {
                $table->string('restock_status', 20)->default('restock');
            }

            if (!Schema::hasColumn('return_items', 'reason')) {
                $table->string('reason', 255)->nullable();
            }

            // Legacy compatibility for older return-item implementations.
            if (!Schema::hasColumn('return_items', 'quantity')) {
                $table->unsignedInteger('quantity')->nullable();
            }

            if (!Schema::hasColumn('return_items', 'unit_price')) {
                $table->decimal('unit_price', 15, 2)->nullable();
            }

            if (!Schema::hasColumn('return_items', 'total_price')) {
                $table->decimal('total_price', 15, 2)->nullable();
            }
        });

        // Copy legacy quantity into return_qty only where the new value is
        // still zero. This preserves existing live data without overwriting
        // already-correct return quantities.
        if (
            Schema::hasColumn('return_items', 'return_qty') &&
            Schema::hasColumn('return_items', 'quantity')
        ) {
            \DB::table('return_items')
                ->where('return_qty', 0)
                ->whereNotNull('quantity')
                ->update([
                    'return_qty' => \DB::raw('quantity'),
                ]);
        }
    }

    public function down(): void
    {
        // Intentionally non-destructive. These columns are part of the live
        // sales-return accounting workflow and must not be dropped on rollback.
    }
};
