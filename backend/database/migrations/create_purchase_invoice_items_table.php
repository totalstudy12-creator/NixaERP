<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('purchase_invoice_items')) {
            Schema::create('purchase_invoice_items', function (Blueprint $table) {
                $table->id();

                $table->unsignedBigInteger('purchase_invoice_id');
                $table->index('purchase_invoice_id');

                $table->unsignedBigInteger('product_id')->nullable();
                $table->index('product_id');

                $table->string('product_name')->nullable();
                $table->string('hsn_sac_code')->nullable();
                $table->string('sku')->nullable();
                $table->string('unit')->nullable();

                $table->decimal('quantity', 15, 2)->default(0);
                $table->decimal('free_quantity', 15, 2)->default(0);
                $table->decimal('purchase_price', 15, 2)->default(0);

                $table->string('discount_type')->nullable();
                $table->decimal('discount_percent', 8, 2)->default(0);
                $table->decimal('discount_amount', 15, 2)->default(0);

                $table->string('gst_slab')->nullable();
                $table->boolean('is_inter_state')->default(false);

                $table->decimal('cgst_percent', 8, 2)->default(0);
                $table->decimal('sgst_percent', 8, 2)->default(0);
                $table->decimal('igst_percent', 8, 2)->default(0);

                $table->decimal('cgst_amount', 15, 2)->default(0);
                $table->decimal('sgst_amount', 15, 2)->default(0);
                $table->decimal('igst_amount', 15, 2)->default(0);

                $table->decimal('total', 15, 2)->default(0);

                $table->timestamps();

                $table->index(['purchase_invoice_id', 'product_id']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('purchase_invoice_items');
    }
};