<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // 1. invoice_items: add description & support decimal quantity
        if (Schema::hasTable('invoice_items')) {
            Schema::table('invoice_items', function (Blueprint $table) {
                if (!Schema::hasColumn('invoice_items', 'description')) {
                    $table->text('description')->nullable();
                }
                if (Schema::hasColumn('invoice_items', 'quantity')) {
                    $table->decimal('quantity', 14, 3)->default(1)->change();
                }
            });
        }

        // 2. products: add qr_code & support decimal stock_quantity and reorder_level
        if (Schema::hasTable('products')) {
            Schema::table('products', function (Blueprint $table) {
                if (!Schema::hasColumn('products', 'qr_code')) {
                    $table->string('qr_code', 255)->nullable()->after('barcode');
                }
                if (Schema::hasColumn('products', 'stock_quantity')) {
                    $table->decimal('stock_quantity', 14, 3)->default(0)->change();
                }
                if (Schema::hasColumn('products', 'reorder_level')) {
                    $table->decimal('reorder_level', 14, 3)->default(0)->change();
                }
            });
        }

        // 3. product_warehouse_stocks: decimal quantities
        if (Schema::hasTable('product_warehouse_stocks')) {
            Schema::table('product_warehouse_stocks', function (Blueprint $table) {
                if (Schema::hasColumn('product_warehouse_stocks', 'quantity')) {
                    $table->decimal('quantity', 14, 3)->default(0)->change();
                }
                if (Schema::hasColumn('product_warehouse_stocks', 'reserved_quantity')) {
                    $table->decimal('reserved_quantity', 14, 3)->default(0)->change();
                }
                if (Schema::hasColumn('product_warehouse_stocks', 'available_quantity')) {
                    $table->decimal('available_quantity', 14, 3)->default(0)->change();
                }
            });
        }

        // 4. stock_movements: decimal quantity, stock_before, stock_after
        if (Schema::hasTable('stock_movements')) {
            Schema::table('stock_movements', function (Blueprint $table) {
                if (Schema::hasColumn('stock_movements', 'quantity')) {
                    $table->decimal('quantity', 14, 3)->default(0)->change();
                }
                if (Schema::hasColumn('stock_movements', 'stock_before')) {
                    $table->decimal('stock_before', 14, 3)->default(0)->change();
                }
                if (Schema::hasColumn('stock_movements', 'stock_after')) {
                    $table->decimal('stock_after', 14, 3)->default(0)->change();
                }
            });
        }

        // 5. product_purchase_price_history: decimal quantity
        if (Schema::hasTable('product_purchase_price_history')) {
            Schema::table('product_purchase_price_history', function (Blueprint $table) {
                if (Schema::hasColumn('product_purchase_price_history', 'quantity')) {
                    $table->decimal('quantity', 14, 3)->default(0)->change();
                }
            });
        }

        // 6. quotation_items: decimal quantity
        if (Schema::hasTable('quotation_items')) {
            Schema::table('quotation_items', function (Blueprint $table) {
                if (Schema::hasColumn('quotation_items', 'quantity')) {
                    $table->decimal('quantity', 14, 3)->default(1)->change();
                }
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('invoice_items') && Schema::hasColumn('invoice_items', 'description')) {
            Schema::table('invoice_items', function (Blueprint $table) {
                $table->dropColumn('description');
            });
        }

        if (Schema::hasTable('products') && Schema::hasColumn('products', 'qr_code')) {
            Schema::table('products', function (Blueprint $table) {
                $table->dropColumn('qr_code');
            });
        }
    }
};
