<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('warehouse_id')->constrained()->cascadeOnDelete();
            $table->foreignId('company_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $table->enum('transaction_type', ['IN', 'OUT']);
            $table->enum('reference_type', ['purchase', 'sale', 'return', 'adjustment', 'transfer', 'opening_stock', 'manual', 'other'])->default('manual');
            $table->unsignedBigInteger('reference_id')->nullable();
            $table->integer('quantity');
            $table->decimal('unit_price', 15, 2)->default(0);
            $table->integer('stock_before');
            $table->integer('stock_after');
            $table->text('remark')->nullable();
            $table->timestamp('transaction_date')->useCurrent();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['product_id', 'warehouse_id']);
            $table->index(['reference_type', 'reference_id']);
            $table->index('transaction_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_movements');
    }
};