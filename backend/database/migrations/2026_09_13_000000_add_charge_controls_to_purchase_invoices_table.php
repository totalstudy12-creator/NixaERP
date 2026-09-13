<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('purchase_invoices', function (Blueprint $table) {

            // ✅ Position AFTER an EXISTING column (packing_charges)
            if (!Schema::hasColumn('purchase_invoices', 'packing_apply_type')) {
                $table->string('packing_apply_type', 20)
                    ->default('after_tax')
                    ->after('packing_charges');
            }

            // ✅ Position AFTER an EXISTING column (order_discount)
            if (!Schema::hasColumn('purchase_invoices', 'general_discount_type')) {
                $table->string('general_discount_type', 20)
                    ->default('percent')
                    ->after('order_discount');
            }

            if (!Schema::hasColumn('purchase_invoices', 'general_discount_percent')) {
                $table->decimal('general_discount_percent', 8, 2)
                    ->default(0)
                    ->after('general_discount_type');
            }

            if (!Schema::hasColumn('purchase_invoices', 'general_discount_amount')) {
                $table->decimal('general_discount_amount', 15, 2)
                    ->default(0)
                    ->after('general_discount_percent');
            }

            if (!Schema::hasColumn('purchase_invoices', 'general_discount_apply_type')) {
                $table->string('general_discount_apply_type', 20)
                    ->default('before_tax')
                    ->after('general_discount_amount');
            }
        });
    }

    public function down(): void
    {
        Schema::table('purchase_invoices', function (Blueprint $table) {
            $table->dropColumn([
                'packing_apply_type',
                'general_discount_type',
                'general_discount_percent',
                'general_discount_amount',
                'general_discount_apply_type',
            ]);
        });
    }
};