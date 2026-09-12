<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_movements', function (Blueprint $table) {
            // Match the validation rule: string|max:100
            $table->string('reference_id', 100)->nullable()->change();
        });

        // Also widen the related history table for consistency
        if (Schema::hasTable('product_purchase_price_history')) {
            Schema::table('product_purchase_price_history', function (Blueprint $table) {
                $table->string('bill_number', 100)->nullable()->change();
            });
        }
    }

    public function down(): void
    {
        Schema::table('stock_movements', function (Blueprint $table) {
            $table->string('reference_id', 20)->nullable()->change();
        });

        if (Schema::hasTable('product_purchase_price_history')) {
            Schema::table('product_purchase_price_history', function (Blueprint $table) {
                $table->string('bill_number', 20)->nullable()->change();
            });
        }
    }
};