<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('companies', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('code')->unique()->nullable();
            $table->string('email')->nullable();
            $table->string('gst_number')->nullable();
            $table->string('pan_number')->nullable();
            $table->string('type')->nullable();
            $table->string('phone')->nullable();
            $table->text('address')->nullable();
            $table->string('website')->nullable();
            $table->boolean('active')->default(true);
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('branches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('code')->nullable();
            $table->text('address')->nullable();
            $table->string('phone')->nullable();
            $table->string('email')->nullable();
            $table->boolean('active')->default(true);
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('warehouses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('code')->nullable();
            $table->text('location')->nullable();
            $table->boolean('active')->default(true);
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('customers', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('parent_id')->nullable();

            // Company / Branch
            $table->foreignId('company_id')
                ->constrained('companies')
                ->cascadeOnDelete();

            $table->foreignId('branch_id')
                ->nullable()
                ->constrained('branches')
                ->nullOnDelete();

            // Basic Information
            $table->string('name')->default('customer');
            $table->string('type')->nullable();
            $table->string('company_type')->nullable();

            $table->string('contact_person')->nullable();
            $table->string('contact_no')->nullable();
            $table->string('email')->nullable();
            $table->string('website')->nullable();
            $table->string('fax')->nullable();

            // GST / Tax
            $table->string('gst_number')->nullable();
            $table->string('pan')->nullable();
            $table->string('registration_type')->nullable();
            $table->string('license_no')->nullable();

            // Billing Address
            $table->string('billing_street')->nullable();
            $table->string('billing_landmark')->nullable();
            $table->string('billing_city')->nullable();
            $table->string('billing_state')->nullable();
            $table->string('billing_pincode')->nullable();
            $table->string('billing_country')->default('India');

            // Shipping Address
            $table->string('shipping_street')->nullable();
            $table->string('shipping_landmark')->nullable();
            $table->string('shipping_city')->nullable();
            $table->string('shipping_state')->nullable();
            $table->string('shipping_pincode')->nullable();
            $table->string('shipping_country')->default('India');

            // Customer Group
            $table->unsignedBigInteger('group_id')->nullable();

            // Credit
            $table->decimal('credit_limit', 15, 2)->nullable();
            $table->unsignedInteger('due_days')->nullable();

            // Balances
            $table->decimal('opening_balance', 15, 2)->default(0);
            $table->decimal('outstanding_amount', 15, 2)->default(0);
            $table->decimal('wallet_balance', 15, 2)->default(0);        // added
            $table->decimal('commission_rate', 8, 2)->default(0);       // added

            // E-Way Bill
            $table->decimal('eway_bill_distance', 10, 2)->nullable();

            // Territory & Zone
            $table->string('territory')->nullable();                    // added
            $table->string('zone')->nullable();                         // added

            // KYC & Status
            $table->string('kyc_status')->nullable();                   // added
            $table->string('status')->default('active');                // added

            // Custom Fields
            $table->string('custom_field_1')->nullable();
            $table->string('custom_field_2')->nullable();

            // Notes (renamed from 'note' to match JSON)
            $table->text('note')->nullable();

            // Active flag (kept for boolean true/false)
            $table->boolean('is_active')->default(true);

            $table->timestamps();
            $table->softDeletes();
        });

        // Add self-referencing foreign key for parent_id
        Schema::table('customers', function (Blueprint $table) {
            $table->foreign('parent_id')
                ->references('id')
                ->on('customers')
                ->nullOnDelete();
        });

        Schema::create('products', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->string('sku')->unique();
            $table->string('barcode')->nullable()->unique();
            $table->string('brand')->nullable();
            $table->string('unit')->nullable();
            $table->decimal('purchase_price', 16, 2)->default(0);
            $table->decimal('sale_price', 16, 2)->default(0);
            $table->decimal('tax_rate', 8, 2)->default(0);
            $table->integer('stock_quantity')->default(0);
            $table->integer('reorder_level')->default(0);
            $table->text('description')->nullable();
            $table->boolean('active')->default(true);
            $table->timestamps();
            $table->softDeletes();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('products');
        Schema::dropIfExists('customers');
        Schema::dropIfExists('warehouses');
        Schema::dropIfExists('branches');
        Schema::dropIfExists('companies');
    }
};