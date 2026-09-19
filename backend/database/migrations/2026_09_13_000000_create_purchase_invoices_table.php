<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('purchase_invoices')) {
            Schema::create('purchase_invoices', function (Blueprint $table) {
                $table->id();

                $table->unsignedBigInteger('company_id')->nullable();
                $table->index('company_id');

                $table->unsignedBigInteger('supplier_id')->nullable();
                $table->index('supplier_id');

                $table->string('purchase_number')->nullable();
                $table->string('bill_number')->nullable();
                $table->string('reference_number')->nullable();
                $table->string('invoice_number')->nullable();

                $table->date('purchase_date')->nullable();
                $table->date('due_date')->nullable();
                $table->date('expected_delivery_date')->nullable();
                $table->date('invoice_date')->nullable();

                $table->string('warehouse')->nullable();
                $table->string('currency', 3)->default('INR');

                $table->text('notes')->nullable();
                $table->text('internal_remarks')->nullable();

                $table->decimal('subtotal', 15, 2)->default(0);
                $table->decimal('order_discount', 15, 2)->default(0);
                $table->decimal('tax_amount', 15, 2)->default(0);
                $table->decimal('shipping_charges', 15, 2)->default(0);
                $table->decimal('packing_charges', 15, 2)->default(0);
                $table->decimal('other_charges', 15, 2)->default(0);
                $table->decimal('round_off', 15, 2)->default(0);
                $table->decimal('grand_total', 15, 2)->default(0);

                $table->string('status')->default('draft');
                $table->string('payment_status')->default('unpaid');
                $table->string('payment_method')->nullable();

                $table->decimal('paid_amount', 15, 2)->default(0);
                $table->date('payment_date')->nullable();
                $table->string('payment_reference')->nullable();
                $table->text('payment_notes')->nullable();

                $table->timestamps();
                $table->softDeletes();

                $table->index(['company_id', 'supplier_id', 'status']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('purchase_invoices');
    }
};