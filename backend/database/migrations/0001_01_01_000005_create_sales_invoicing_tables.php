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
        Schema::create('quotations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->string('reference_no')->unique();
            $table->decimal('total_amount', 16, 2)->default(0);
            $table->decimal('tax_amount', 16, 2)->default(0);
            $table->string('status')->default('draft');
            $table->timestamp('valid_till')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('quotation_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('quotation_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->integer('quantity');
            $table->decimal('unit_price', 16, 2);
            $table->decimal('tax_rate', 8, 2)->default(0);
            $table->decimal('subtotal', 16, 2);
            $table->timestamps();
        });

        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('quotation_id')->nullable();

            $table->string('order_no', 100)->unique();
            $table->decimal('discount_amount', 10, 2)->default(0);
            $table->string('source', 50)->default('whatsapp');   // whatsapp|manual|phone|email
            $table->string('reference_no', 100)->nullable();

            // Financials
            $table->decimal('total_amount', 10, 2)->default(0);
            $table->decimal('tax_amount', 10, 2)->default(0);
            $table->decimal('payment_amount', 10, 2)->default(0); // total paid so far
            $table->string('payment_method', 50)->nullable();     // qr|bank_transfer|cash|card
            $table->boolean('is_partial')->default(false);

            // Status & delivery
            $table->string('status', 50)->default('pending');     // pending|confirmed|shipped|delivered
            $table->dateTime('delivery_date')->nullable();
            $table->text('shipping_address')->nullable();

            $table->text('notes')->nullable();
            $table->softDeletes();
            $table->timestamps();
        });

         Schema::create('order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->integer('quantity');
            $table->integer('delivered')->default(0);          // delivered qty
            $table->decimal('unit_price', 10, 2);
            $table->decimal('tax_rate', 5, 2)->default(0);    // percentage
            $table->decimal('subtotal', 10, 2)->storedAs('quantity * unit_price'); // optional: DB computed
            $table->timestamps();
        });

        Schema::create('invoices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
            $table->string('invoice_no')->unique();
            $table->decimal('total_amount', 16, 2)->default(0);
            $table->decimal('tax_amount', 16, 2)->default(0);
            $table->string('status')->default('pending');
            $table->timestamp('due_date')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('invoice_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('invoice_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->integer('quantity');
            $table->decimal('unit_price', 16, 2);
            $table->decimal('tax_rate', 8, 2)->default(0);
            $table->decimal('subtotal', 16, 2);
            $table->timestamps();
        });

        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('invoice_id')->nullable()->constrained()->nullOnDelete();
            $table->string('payment_method');
            $table->string('reference_no')->nullable();
            $table->decimal('amount', 16, 2);
            $table->string('status')->default('pending');
            $table->timestamp('transaction_date');
            $table->string('bank_name')->nullable();
            $table->string('account_number')->nullable();
            $table->string('ledger_reference')->nullable();
            $table->text('remarks')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('payments');
        Schema::dropIfExists('invoice_items');
        Schema::dropIfExists('invoices');
        Schema::dropIfExists('order_items');
        Schema::dropIfExists('orders');
        Schema::dropIfExists('quotation_items');
        Schema::dropIfExists('quotations');
    }
};
