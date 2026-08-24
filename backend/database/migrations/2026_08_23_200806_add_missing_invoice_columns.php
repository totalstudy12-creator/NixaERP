<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        // ---------- INVOICES TABLE ----------
        Schema::table('invoices', function (Blueprint $table) {
            if (!Schema::hasColumn('invoices', 'branch_id')) {
                $table->foreignId('branch_id')->nullable()->after('company_id')->constrained('branches')->nullOnDelete();
            }
            if (!Schema::hasColumn('invoices', 'billing_street')) {
                $table->string('billing_street')->nullable()->after('customer_name');
            }
            if (!Schema::hasColumn('invoices', 'billing_city')) {
                $table->string('billing_city')->nullable()->after('billing_street');
            }
            if (!Schema::hasColumn('invoices', 'billing_state')) {
                $table->string('billing_state')->nullable()->after('billing_city');
            }
            if (!Schema::hasColumn('invoices', 'billing_country')) {
                $table->string('billing_country')->nullable()->after('billing_state');
            }
            if (!Schema::hasColumn('invoices', 'billing_pincode')) {
                $table->string('billing_pincode')->nullable()->after('billing_country');
            }
            if (!Schema::hasColumn('invoices', 'shipping_street')) {
                $table->string('shipping_street')->nullable()->after('billing_pincode');
            }
            if (!Schema::hasColumn('invoices', 'shipping_city')) {
                $table->string('shipping_city')->nullable()->after('shipping_street');
            }
            if (!Schema::hasColumn('invoices', 'shipping_state')) {
                $table->string('shipping_state')->nullable()->after('shipping_city');
            }
            if (!Schema::hasColumn('invoices', 'shipping_country')) {
                $table->string('shipping_country')->nullable()->after('shipping_state');
            }
            if (!Schema::hasColumn('invoices', 'shipping_pincode')) {
                $table->string('shipping_pincode')->nullable()->after('shipping_country');
            }
            if (!Schema::hasColumn('invoices', 'contact_no')) {
                $table->string('contact_no')->nullable()->after('contact_person');
            }
            if (!Schema::hasColumn('invoices', 'payment_term')) {
                $table->string('payment_term')->nullable()->after('delivery_mode');
            }
            if (!Schema::hasColumn('invoices', 'tcs_percent')) {
                $table->decimal('tcs_percent', 8, 2)->default(0)->after('general_discount_amount');
            }
            if (!Schema::hasColumn('invoices', 'tcs_amount')) {
                $table->decimal('tcs_amount', 10, 2)->default(0)->after('tcs_percent');
            }
            // ✅ Add additional_charges BEFORE subtotal
            if (!Schema::hasColumn('invoices', 'additional_charges')) {
                $table->json('additional_charges')->nullable()->after('tcs_amount');
            }
            // ✅ Now add subtotal after additional_charges
            if (!Schema::hasColumn('invoices', 'subtotal')) {
                $table->decimal('subtotal', 10, 2)->default(0)->after('additional_charges');
            }
            if (!Schema::hasColumn('invoices', 'internal_note')) {
                $table->text('internal_note')->nullable()->after('document_note');
            }
        });

        // ---------- INVOICE_ITEMS TABLE ----------
        Schema::table('invoice_items', function (Blueprint $table) {
            if (!Schema::hasColumn('invoice_items', 'discount_type')) {
                $table->string('discount_type')->default('percent')->after('unit_price');
            }
            if (!Schema::hasColumn('invoice_items', 'discount_amount')) {
                $table->decimal('discount_amount', 10, 2)->default(0)->after('discount_percent');
            }
            if (!Schema::hasColumn('invoice_items', 'gst_slab')) {
                $table->decimal('gst_slab', 8, 2)->default(0)->after('discount_amount');
            }
            if (!Schema::hasColumn('invoice_items', 'is_inter_state')) {
                $table->boolean('is_inter_state')->default(false)->after('gst_slab');
            }
            if (!Schema::hasColumn('invoice_items', 'cgst_percent')) {
                $table->decimal('cgst_percent', 8, 2)->default(0)->after('is_inter_state');
            }
            if (!Schema::hasColumn('invoice_items', 'sgst_percent')) {
                $table->decimal('sgst_percent', 8, 2)->default(0)->after('cgst_percent');
            }
            if (!Schema::hasColumn('invoice_items', 'igst_percent')) {
                $table->decimal('igst_percent', 8, 2)->default(0)->after('sgst_percent');
            }
            if (!Schema::hasColumn('invoice_items', 'cgst_amount')) {
                $table->decimal('cgst_amount', 10, 2)->default(0)->after('igst_percent');
            }
            if (!Schema::hasColumn('invoice_items', 'sgst_amount')) {
                $table->decimal('sgst_amount', 10, 2)->default(0)->after('cgst_amount');
            }
            if (!Schema::hasColumn('invoice_items', 'igst_amount')) {
                $table->decimal('igst_amount', 10, 2)->default(0)->after('sgst_amount');
            }
        });
    }

    public function down()
    {
        // optional: drop columns if needed
    }
};