<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // 1. Add missing columns to quotations
        if (Schema::hasTable('quotations')) {
            Schema::table('quotations', function (Blueprint $table) {
                if (!Schema::hasColumn('quotations', 'quotation_number')) {
                    $table->string('quotation_number')->nullable()->unique()->after('id');
                }
                if (!Schema::hasColumn('quotations', 'branch_id')) {
                    $table->foreignId('branch_id')->nullable()->after('company_id')->constrained('branches')->nullOnDelete();
                }
                if (!Schema::hasColumn('quotations', 'customer_name')) {
                    $table->string('customer_name')->nullable()->after('customer_id');
                }
                if (!Schema::hasColumn('quotations', 'customer_email')) {
                    $table->string('customer_email')->nullable()->after('customer_name');
                }
                if (!Schema::hasColumn('quotations', 'customer_phone')) {
                    $table->string('customer_phone')->nullable()->after('customer_email');
                }
                if (!Schema::hasColumn('quotations', 'billing_address')) {
                    $table->text('billing_address')->nullable()->after('customer_phone');
                }
                if (!Schema::hasColumn('quotations', 'shipping_address')) {
                    $table->text('shipping_address')->nullable()->after('billing_address');
                }
                if (!Schema::hasColumn('quotations', 'gstin')) {
                    $table->string('gstin', 20)->nullable()->after('shipping_address');
                }
                if (!Schema::hasColumn('quotations', 'pan')) {
                    $table->string('pan', 20)->nullable()->after('gstin');
                }
                if (!Schema::hasColumn('quotations', 'quotation_date')) {
                    $table->date('quotation_date')->nullable()->after('pan');
                }
                if (!Schema::hasColumn('quotations', 'valid_until')) {
                    $table->date('valid_until')->nullable()->after('quotation_date');
                }
                if (!Schema::hasColumn('quotations', 'rejection_reason')) {
                    $table->text('rejection_reason')->nullable()->after('status');
                }
                if (!Schema::hasColumn('quotations', 'follow_up_date')) {
                    $table->date('follow_up_date')->nullable()->after('rejection_reason');
                }
                if (!Schema::hasColumn('quotations', 'subtotal')) {
                    $table->decimal('subtotal', 15, 2)->default(0)->after('follow_up_date');
                }
                if (!Schema::hasColumn('quotations', 'discount_amount')) {
                    $table->decimal('discount_amount', 15, 2)->default(0)->after('subtotal');
                }
                if (!Schema::hasColumn('quotations', 'taxable_amount')) {
                    $table->decimal('taxable_amount', 15, 2)->default(0)->after('discount_amount');
                }
                if (!Schema::hasColumn('quotations', 'cgst_amount')) {
                    $table->decimal('cgst_amount', 15, 2)->default(0)->after('tax_amount');
                }
                if (!Schema::hasColumn('quotations', 'sgst_amount')) {
                    $table->decimal('sgst_amount', 15, 2)->default(0)->after('cgst_amount');
                }
                if (!Schema::hasColumn('quotations', 'igst_amount')) {
                    $table->decimal('igst_amount', 15, 2)->default(0)->after('sgst_amount');
                }
                if (!Schema::hasColumn('quotations', 'shipping_charges')) {
                    $table->decimal('shipping_charges', 15, 2)->default(0)->after('igst_amount');
                }
                if (!Schema::hasColumn('quotations', 'other_charges')) {
                    $table->decimal('other_charges', 15, 2)->default(0)->after('shipping_charges');
                }
                if (!Schema::hasColumn('quotations', 'round_off')) {
                    $table->decimal('round_off', 10, 2)->default(0)->after('other_charges');
                }
                if (!Schema::hasColumn('quotations', 'terms_and_conditions')) {
                    $table->text('terms_and_conditions')->nullable()->after('notes');
                }
                if (!Schema::hasColumn('quotations', 'converted_invoice_id')) {
                    $table->foreignId('converted_invoice_id')->nullable()->after('terms_and_conditions')->constrained('invoices')->nullOnDelete();
                }
                if (!Schema::hasColumn('quotations', 'converted_at')) {
                    $table->timestamp('converted_at')->nullable()->after('converted_invoice_id');
                }
                if (!Schema::hasColumn('quotations', 'created_by')) {
                    $table->foreignId('created_by')->nullable()->after('converted_at')->constrained('users')->nullOnDelete();
                }
                if (!Schema::hasColumn('quotations', 'assigned_to')) {
                    $table->foreignId('assigned_to')->nullable()->after('created_by')->constrained('users')->nullOnDelete();
                }
            });

            // Backfill data for existing quotations in MySQL
            if (DB::getDriverName() === 'mysql') {
                DB::statement("UPDATE quotations SET quotation_number = reference_no WHERE quotation_number IS NULL AND reference_no IS NOT NULL");
                DB::statement("UPDATE quotations SET quotation_date = DATE(created_at) WHERE quotation_date IS NULL AND created_at IS NOT NULL");
                if (Schema::hasColumn('quotations', 'valid_till')) {
                    DB::statement("UPDATE quotations SET valid_until = DATE(valid_till) WHERE valid_until IS NULL AND valid_till IS NOT NULL");
                }
                DB::statement("UPDATE quotations q JOIN customers c ON q.customer_id = c.id SET q.customer_name = c.name, q.customer_phone = c.phone, q.customer_email = c.email WHERE q.customer_name IS NULL");
            }
        }

        // 2. Add missing columns to quotation_items
        if (Schema::hasTable('quotation_items')) {
            Schema::table('quotation_items', function (Blueprint $table) {
                if (!Schema::hasColumn('quotation_items', 'item_name')) {
                    $table->string('item_name')->nullable()->after('product_id');
                }
                if (!Schema::hasColumn('quotation_items', 'description')) {
                    $table->text('description')->nullable()->after('item_name');
                }
                if (!Schema::hasColumn('quotation_items', 'hsn_code')) {
                    $table->string('hsn_code', 20)->nullable()->after('description');
                }
                if (!Schema::hasColumn('quotation_items', 'discount_percent')) {
                    $table->decimal('discount_percent', 6, 2)->default(0)->after('unit_price');
                }
                if (!Schema::hasColumn('quotation_items', 'discount_amount')) {
                    $table->decimal('discount_amount', 15, 2)->default(0)->after('discount_percent');
                }
                if (!Schema::hasColumn('quotation_items', 'gst_slab')) {
                    $table->decimal('gst_slab', 6, 2)->default(0)->after('discount_amount');
                }
                if (!Schema::hasColumn('quotation_items', 'is_inter_state')) {
                    $table->boolean('is_inter_state')->default(false)->after('gst_slab');
                }
                if (!Schema::hasColumn('quotation_items', 'cgst_percent')) {
                    $table->decimal('cgst_percent', 6, 2)->default(0)->after('is_inter_state');
                }
                if (!Schema::hasColumn('quotation_items', 'sgst_percent')) {
                    $table->decimal('sgst_percent', 6, 2)->default(0)->after('cgst_percent');
                }
                if (!Schema::hasColumn('quotation_items', 'igst_percent')) {
                    $table->decimal('igst_percent', 6, 2)->default(0)->after('sgst_percent');
                }
                if (!Schema::hasColumn('quotation_items', 'cgst_amount')) {
                    $table->decimal('cgst_amount', 15, 2)->default(0)->after('igst_percent');
                }
                if (!Schema::hasColumn('quotation_items', 'sgst_amount')) {
                    $table->decimal('sgst_amount', 15, 2)->default(0)->after('cgst_amount');
                }
                if (!Schema::hasColumn('quotation_items', 'igst_amount')) {
                    $table->decimal('igst_amount', 15, 2)->default(0)->after('sgst_amount');
                }
                if (!Schema::hasColumn('quotation_items', 'tax_amount')) {
                    $table->decimal('tax_amount', 15, 2)->default(0)->after('tax_rate');
                }
                if (!Schema::hasColumn('quotation_items', 'total')) {
                    $table->decimal('total', 15, 2)->default(0)->after('subtotal');
                }
            });

            // Backfill items in MySQL
            if (DB::getDriverName() === 'mysql') {
                DB::statement("UPDATE quotation_items qi JOIN products p ON qi.product_id = p.id SET qi.item_name = p.name WHERE qi.item_name IS NULL");
                DB::statement("UPDATE quotation_items SET total = subtotal WHERE total = 0 AND subtotal > 0");
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Keep columns safe in production
    }
};
