<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_purchase_price_history', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('product_id');
            $table->unsignedBigInteger('supplier_id')->nullable();
            $table->unsignedBigInteger('purchase_id')->nullable();
            $table->string('bill_number')->nullable();
            $table->integer('quantity');
            $table->decimal('unit_price', 15, 2);
            $table->timestamp('purchase_date')->useCurrent();
            $table->timestamps();

            $table->index('product_id');
            $table->index('supplier_id');
            $table->index('purchase_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_purchase_price_history');
    }
};