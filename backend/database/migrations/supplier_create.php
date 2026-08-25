<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Create supplier_groups first because suppliers.group_id references it
        Schema::create('supplier_groups', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->timestamps();
        });

        // Create suppliers table
        Schema::create('suppliers', function (Blueprint $table) {
            $table->id();

            $table->foreignId('company_id')
                ->nullable()
                ->constrained('companies')
                ->nullOnDelete();

            $table->foreignId('branch_id')
                ->nullable()
                ->constrained('branches')
                ->nullOnDelete();

            $table->unsignedBigInteger('parent_id')->nullable();
            $table->foreignId('group_id')
                ->nullable()
                ->constrained('supplier_groups')
                ->nullOnDelete();

            $table->string('name');
            $table->string('type')->nullable();
            $table->string('company_type')->nullable();
            $table->string('contact_person')->nullable();
            $table->string('contact_no')->nullable();
            $table->string('email')->nullable();
            $table->string('phone')->nullable();

            $table->string('gst_number')->nullable();
            $table->string('registration_type')->nullable();
            $table->string('pan')->nullable();

            // Billing address
            $table->string('billing_street')->nullable();
            $table->string('billing_landmark')->nullable();
            $table->string('billing_city')->nullable();
            $table->string('billing_state')->nullable();
            $table->string('billing_country')->nullable();
            $table->string('billing_pincode')->nullable();

            // Shipping address
            $table->string('shipping_street')->nullable();
            $table->string('shipping_landmark')->nullable();
            $table->string('shipping_city')->nullable();
            $table->string('shipping_state')->nullable();
            $table->string('shipping_country')->nullable();
            $table->string('shipping_pincode')->nullable();

            $table->decimal('eway_bill_distance', 10, 2)->nullable();
            $table->string('territory')->nullable();
            $table->string('zone')->nullable();
            $table->string('status')->default('active');

            // Financial fields
            $table->decimal('credit_limit', 15, 2)->default(0);
            $table->decimal('outstanding_amount', 15, 2)->default(0);
            $table->decimal('wallet_balance', 15, 2)->default(0);
            $table->decimal('commission_rate', 8, 2)->default(0);
            $table->decimal('opening_balance', 15, 2)->default(0);

            $table->string('kyc_status')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->integer('due_days')->nullable();

            $table->string('fax')->nullable();
            $table->string('website')->nullable();
            $table->text('note')->nullable();
            $table->string('license_no')->nullable();

            $table->string('custom_field_1')->nullable();
            $table->string('custom_field_2')->nullable();

            $table->boolean('is_active')->default(true);
            $table->text('notes')->nullable();

            $table->timestamps();
            $table->softDeletes();

            // Indexes for better query performance
            $table->index(['company_id', 'branch_id', 'group_id', 'status']);
        });

        // Add self-referencing foreign key after suppliers table is created
        Schema::table('suppliers', function (Blueprint $table) {
            $table->foreign('parent_id')
                ->references('id')
                ->on('suppliers')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('suppliers');
        Schema::dropIfExists('supplier_groups');
    }
};