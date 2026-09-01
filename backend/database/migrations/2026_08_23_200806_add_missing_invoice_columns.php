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
        // ---------- INVOICES TABLE ----------
        Schema::table('invoices', function (Blueprint $table) {

            // Company & Branch
            if (!Schema::hasColumn('invoices', 'company_id')) {
                $table->foreignId('company_id')
                    ->constrained('companies')
                    ->cascadeOnDelete();
            }

            if (!Schema::hasColumn('invoices', 'branch_id')) {
                $table->foreignId('branch_id')
                    ->nullable()
                    ->constrained('branches')
                    ->nullOnDelete();
            }

            // Customer
            if (!Schema::hasColumn('invoices', 'customer_id')) {
                $table->foreignId('customer_id')
                    ->nullable()
                    ->constrained('customers')
                    ->nullOnDelete();
            }

            if (!Schema::hasColumn('invoices', 'customer_name')) {
                $table->string('customer_name')->nullable();
            }

            // Contact Person
            if (!Schema::hasColumn('invoices', 'contact_person')) {
                $table->string('contact_person')->nullable();
            }

            if (!Schema::hasColumn('invoices', 'contact_no')) {
                $table->string('contact_no')->nullable();
            }

            // GST / PAN
            if (!Schema::hasColumn('invoices', 'gstin')) {
                $table->string('gstin')->nullable();
            }

            if (!Schema::hasColumn('invoices', 'pan')) {
                $table->string('pan')->nullable();
            }

            // Invoice Details
            if (!Schema::hasColumn('invoices', 'invoice_type')) {
                $table->string('invoice_type')->default('tax_invoice');
            }

            if (!Schema::hasColumn('invoices', 'invoice_no')) {
                $table->string('invoice_no')->nullable();
            }

            if (!Schema::hasColumn('invoices', 'invoice_date')) {
                $table->date('invoice_date')->nullable();
            }

            // Challan Details
            if (!Schema::hasColumn('invoices', 'challan_no')) {
                $table->string('challan_no')->nullable();
            }

            if (!Schema::hasColumn('invoices', 'challan_date')) {
                $table->date('challan_date')->nullable();
            }

            // Purchase Order
            if (!Schema::hasColumn('invoices', 'po_no')) {
                $table->string('po_no')->nullable();
            }

            if (!Schema::hasColumn('invoices', 'po_date')) {
                $table->date('po_date')->nullable();
            }

            // Logistics
            if (!Schema::hasColumn('invoices', 'lr_no')) {
                $table->string('lr_no')->nullable();
            }

            if (!Schema::hasColumn('invoices', 'eway_no')) {
                $table->string('eway_no')->nullable();
            }

            if (!Schema::hasColumn('invoices', 'delivery_mode')) {
                $table->string('delivery_mode')->nullable();
            }

            // Billing Address
            if (!Schema::hasColumn('invoices', 'billing_street')) {
                $table->string('billing_street')->nullable();
            }

            if (!Schema::hasColumn('invoices', 'billing_city')) {
                $table->string('billing_city')->nullable();
            }

            if (!Schema::hasColumn('invoices', 'billing_state')) {
                $table->string('billing_state')->nullable();
            }

            if (!Schema::hasColumn('invoices', 'billing_country')) {
                $table->string('billing_country')->default('India');
            }

            if (!Schema::hasColumn('invoices', 'billing_pincode')) {
                $table->string('billing_pincode')->nullable();
            }

            // Shipping Address
            if (!Schema::hasColumn('invoices', 'shipping_street')) {
                $table->string('shipping_street')->nullable();
            }

            if (!Schema::hasColumn('invoices', 'shipping_city')) {
                $table->string('shipping_city')->nullable();
            }

            if (!Schema::hasColumn('invoices', 'shipping_state')) {
                $table->string('shipping_state')->nullable();
            }

            if (!Schema::hasColumn('invoices', 'shipping_country')) {
                $table->string('shipping_country')->default('India');
            }

            if (!Schema::hasColumn('invoices', 'shipping_pincode')) {
                $table->string('shipping_pincode')->nullable();
            }

            // Payment Terms
            if (!Schema::hasColumn('invoices', 'payment_term')) {
                $table->string('payment_term')->nullable();
            }

            if (!Schema::hasColumn('invoices', 'bank_id')) {
                $table->unsignedBigInteger('bank_id')->nullable();
            }

            // Charges & Discounts
            if (!Schema::hasColumn('invoices', 'packing_charges')) {
                $table->decimal('packing_charges', 10, 2)->default(0);
            }

            if (!Schema::hasColumn('invoices', 'general_discount_percent')) {
                $table->decimal('general_discount_percent', 8, 2)->default(0);
            }

            if (!Schema::hasColumn('invoices', 'general_discount_amount')) {
                $table->decimal('general_discount_amount', 10, 2)->default(0);
            }

            // Total invoice-level discount amount
            if (!Schema::hasColumn('invoices', 'discount_amount')) {
                $table->integer('discount_amount')->default(0);
            }

            if (!Schema::hasColumn('invoices', 'tcs_percent')) {
                $table->decimal('tcs_percent', 8, 2)->default(0);
            }

            if (!Schema::hasColumn('invoices', 'tcs_amount')) {
                $table->decimal('tcs_amount', 10, 2)->default(0);
            }

            if (!Schema::hasColumn('invoices', 'additional_charges')) {
                $table->json('additional_charges')->nullable();
            }

            // Terms & Notes
            if (!Schema::hasColumn('invoices', 'terms_title')) {
                $table->string('terms_title')->nullable();
            }

            if (!Schema::hasColumn('invoices', 'terms_detail')) {
                $table->text('terms_detail')->nullable();
            }

            if (!Schema::hasColumn('invoices', 'document_note')) {
                $table->text('document_note')->nullable();
            }

            if (!Schema::hasColumn('invoices', 'internal_note')) {
                $table->text('internal_note')->nullable();
            }

            // Totals
            if (!Schema::hasColumn('invoices', 'subtotal')) {
                $table->decimal('subtotal', 10, 2)->default(0);
            }

            if (!Schema::hasColumn('invoices', 'total_amount')) {
                $table->decimal('total_amount', 10, 2)->default(0);
            }

            if (!Schema::hasColumn('invoices', 'round_off')) {
                $table->decimal('round_off', 10, 2)->default(0);
            }

            if (!Schema::hasColumn('invoices', 'grand_total')) {
                $table->decimal('grand_total', 10, 2)->default(0);
            }

            if (!Schema::hasColumn('invoices', 'paid_amount')) {
                $table->decimal('paid_amount', 10, 2)->default(0);
            }

            if (!Schema::hasColumn('invoices', 'balance_amount')) {
                $table->decimal('balance_amount', 10, 2)->default(0);
            }

            // Status
            if (!Schema::hasColumn('invoices', 'status')) {
                $table->string('status')->default('draft');
            }

            if (!Schema::hasColumn('invoices', 'payment_status')) {
                $table->string('payment_status')->default('unpaid');
            }
        });


        // ---------- INVOICE_ITEMS TABLE ----------
        Schema::table('invoice_items', function (Blueprint $table) {

            // Invoice
            if (!Schema::hasColumn('invoice_items', 'invoice_id')) {
                $table->foreignId('invoice_id')
                    ->constrained('invoices')
                    ->cascadeOnDelete();
            }

            // Product Information
            if (!Schema::hasColumn('invoice_items', 'product_id')) {
                $table->foreignId('product_id')
                    ->nullable()
                    ->constrained('products')
                    ->nullOnDelete();
            }

            if (!Schema::hasColumn('invoice_items', 'product_name')) {
                $table->string('product_name')->nullable();
            }

            if (!Schema::hasColumn('invoice_items', 'hsn_sac_code')) {
                $table->string('hsn_sac_code')->nullable();
            }

            // Quantity & Pricing
            if (!Schema::hasColumn('invoice_items', 'quantity')) {
                $table->integer('quantity')->default(1);
            }

            if (!Schema::hasColumn('invoice_items', 'uom')) {
                $table->string('uom')->default('NOS');
            }

            if (!Schema::hasColumn('invoice_items', 'unit_price')) {
                $table->decimal('unit_price', 10, 2)->default(0);
            }

            // Item Discounts
            if (!Schema::hasColumn('invoice_items', 'discount_type')) {
                $table->string('discount_type')->default('percent');
            }

            if (!Schema::hasColumn('invoice_items', 'discount_percent')) {
                $table->decimal('discount_percent', 8, 2)->default(0);
            }

            if (!Schema::hasColumn('invoice_items', 'discount_amount')) {
                $table->decimal('discount_amount', 10, 2)->default(0);
            }

            // GST
            if (!Schema::hasColumn('invoice_items', 'gst_slab')) {
                $table->decimal('gst_slab', 8, 2)->default(0);
            }

            if (!Schema::hasColumn('invoice_items', 'is_inter_state')) {
                $table->boolean('is_inter_state')->default(false);
            }

            if (!Schema::hasColumn('invoice_items', 'cgst_percent')) {
                $table->decimal('cgst_percent', 8, 2)->default(0);
            }

            if (!Schema::hasColumn('invoice_items', 'sgst_percent')) {
                $table->decimal('sgst_percent', 8, 2)->default(0);
            }

            if (!Schema::hasColumn('invoice_items', 'igst_percent')) {
                $table->decimal('igst_percent', 8, 2)->default(0);
            }

            if (!Schema::hasColumn('invoice_items', 'cgst_amount')) {
                $table->decimal('cgst_amount', 10, 2)->default(0);
            }

            if (!Schema::hasColumn('invoice_items', 'sgst_amount')) {
                $table->decimal('sgst_amount', 10, 2)->default(0);
            }

            if (!Schema::hasColumn('invoice_items', 'igst_amount')) {
                $table->decimal('igst_amount', 10, 2)->default(0);
            }

            // Total
            if (!Schema::hasColumn('invoice_items', 'total')) {
                $table->decimal('total', 10, 2)->default(0);
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $columns = [
                'company_id',
                'branch_id',
                'customer_id',
                'customer_name',
                'contact_person',
                'contact_no',
                'gstin',
                'pan',
                'invoice_type',
                'invoice_no',
                'invoice_date',
                'challan_no',
                'challan_date',
                'po_no',
                'po_date',
                'lr_no',
                'eway_no',
                'delivery_mode',
                'billing_street',
                'billing_city',
                'billing_state',
                'billing_country',
                'billing_pincode',
                'shipping_street',
                'shipping_city',
                'shipping_state',
                'shipping_country',
                'shipping_pincode',
                'payment_term',
                'bank_id',
                'packing_charges',
                'general_discount_percent',
                'general_discount_amount',
                'discount_amount',
                'tcs_percent',
                'tcs_amount',
                'additional_charges',
                'terms_title',
                'terms_detail',
                'document_note',
                'internal_note',
                'subtotal',
                'total_amount',
                'round_off',
                'grand_total',
                'paid_amount',
                'balance_amount',
                'status',
                'payment_status',
            ];

            foreach ($columns as $column) {
                if (Schema::hasColumn('invoices', $column)) {
                    $table->dropColumn($column);
                }
            }
        });


        Schema::table('invoice_items', function (Blueprint $table) {
            $columns = [
                'invoice_id',
                'product_id',
                'product_name',
                'hsn_sac_code',
                'quantity',
                'uom',
                'unit_price',
                'discount_type',
                'discount_percent',
                'discount_amount',
                'gst_slab',
                'is_inter_state',
                'cgst_percent',
                'sgst_percent',
                'igst_percent',
                'cgst_amount',
                'sgst_amount',
                'igst_amount',
                'total',
            ];

            foreach ($columns as $column) {
                if (Schema::hasColumn('invoice_items', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};