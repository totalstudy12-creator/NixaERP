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
        // 1. Quotations Table
        if (!Schema::hasTable('quotations')) {
            Schema::create('quotations', function (Blueprint $table) {
                $table->id();
                $table->string('quotation_number')->nullable()->unique();
                $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete();
                $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
                $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
                $table->string('customer_name')->nullable();
                $table->string('customer_email')->nullable();
                $table->string('customer_phone')->nullable();
                $table->text('billing_address')->nullable();
                $table->text('shipping_address')->nullable();
                $table->string('gstin', 20)->nullable();
                $table->string('pan', 20)->nullable();
                $table->date('quotation_date')->nullable();
                $table->date('valid_until')->nullable();
                $table->string('status', 30)->default('draft');
                $table->text('rejection_reason')->nullable();
                $table->date('follow_up_date')->nullable();
                $table->decimal('subtotal', 15, 2)->default(0);
                $table->decimal('discount_amount', 15, 2)->default(0);
                $table->decimal('taxable_amount', 15, 2)->default(0);
                $table->decimal('tax_amount', 15, 2)->default(0);
                $table->decimal('cgst_amount', 15, 2)->default(0);
                $table->decimal('sgst_amount', 15, 2)->default(0);
                $table->decimal('igst_amount', 15, 2)->default(0);
                $table->decimal('shipping_charges', 15, 2)->default(0);
                $table->decimal('other_charges', 15, 2)->default(0);
                $table->decimal('round_off', 10, 2)->default(0);
                $table->decimal('total_amount', 15, 2)->default(0);
                $table->text('notes')->nullable();
                $table->text('terms_and_conditions')->nullable();
                $table->foreignId('converted_invoice_id')->nullable()->constrained('invoices')->nullOnDelete();
                $table->timestamp('converted_at')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
                $table->softDeletes();
            });
        } else {
            Schema::table('quotations', function (Blueprint $table) {
                if (!Schema::hasColumn('quotations', 'quotation_number')) {
                    $table->string('quotation_number')->nullable()->unique();
                }
                if (!Schema::hasColumn('quotations', 'branch_id')) {
                    $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
                }
                if (!Schema::hasColumn('quotations', 'customer_name')) {
                    $table->string('customer_name')->nullable();
                }
                if (!Schema::hasColumn('quotations', 'customer_email')) {
                    $table->string('customer_email')->nullable();
                }
                if (!Schema::hasColumn('quotations', 'customer_phone')) {
                    $table->string('customer_phone')->nullable();
                }
                if (!Schema::hasColumn('quotations', 'billing_address')) {
                    $table->text('billing_address')->nullable();
                }
                if (!Schema::hasColumn('quotations', 'shipping_address')) {
                    $table->text('shipping_address')->nullable();
                }
                if (!Schema::hasColumn('quotations', 'gstin')) {
                    $table->string('gstin', 20)->nullable();
                }
                if (!Schema::hasColumn('quotations', 'pan')) {
                    $table->string('pan', 20)->nullable();
                }
                if (!Schema::hasColumn('quotations', 'quotation_date')) {
                    $table->date('quotation_date')->nullable();
                }
                if (!Schema::hasColumn('quotations', 'valid_until')) {
                    $table->date('valid_until')->nullable();
                }
                if (!Schema::hasColumn('quotations', 'rejection_reason')) {
                    $table->text('rejection_reason')->nullable();
                }
                if (!Schema::hasColumn('quotations', 'follow_up_date')) {
                    $table->date('follow_up_date')->nullable();
                }
                if (!Schema::hasColumn('quotations', 'subtotal')) {
                    $table->decimal('subtotal', 15, 2)->default(0);
                }
                if (!Schema::hasColumn('quotations', 'discount_amount')) {
                    $table->decimal('discount_amount', 15, 2)->default(0);
                }
                if (!Schema::hasColumn('quotations', 'taxable_amount')) {
                    $table->decimal('taxable_amount', 15, 2)->default(0);
                }
                if (!Schema::hasColumn('quotations', 'cgst_amount')) {
                    $table->decimal('cgst_amount', 15, 2)->default(0);
                }
                if (!Schema::hasColumn('quotations', 'sgst_amount')) {
                    $table->decimal('sgst_amount', 15, 2)->default(0);
                }
                if (!Schema::hasColumn('quotations', 'igst_amount')) {
                    $table->decimal('igst_amount', 15, 2)->default(0);
                }
                if (!Schema::hasColumn('quotations', 'shipping_charges')) {
                    $table->decimal('shipping_charges', 15, 2)->default(0);
                }
                if (!Schema::hasColumn('quotations', 'other_charges')) {
                    $table->decimal('other_charges', 15, 2)->default(0);
                }
                if (!Schema::hasColumn('quotations', 'round_off')) {
                    $table->decimal('round_off', 10, 2)->default(0);
                }
                if (!Schema::hasColumn('quotations', 'terms_and_conditions')) {
                    $table->text('terms_and_conditions')->nullable();
                }
                if (!Schema::hasColumn('quotations', 'converted_invoice_id')) {
                    $table->foreignId('converted_invoice_id')->nullable()->constrained('invoices')->nullOnDelete();
                }
                if (!Schema::hasColumn('quotations', 'converted_at')) {
                    $table->timestamp('converted_at')->nullable();
                }
                if (!Schema::hasColumn('quotations', 'created_by')) {
                    $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                }
                if (!Schema::hasColumn('quotations', 'assigned_to')) {
                    $table->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
                }
            });
        }

        // 2. Quotation Items Table
        if (!Schema::hasTable('quotation_items')) {
            Schema::create('quotation_items', function (Blueprint $table) {
                $table->id();
                $table->foreignId('quotation_id')->constrained('quotations')->cascadeOnDelete();
                $table->foreignId('product_id')->nullable()->constrained('products')->nullOnDelete();
                $table->string('item_name')->nullable();
                $table->text('description')->nullable();
                $table->string('hsn_code', 20)->nullable();
                $table->decimal('quantity', 12, 2)->default(1);
                $table->decimal('unit_price', 15, 2)->default(0);
                $table->decimal('discount_percent', 6, 2)->default(0);
                $table->decimal('discount_amount', 15, 2)->default(0);
                $table->decimal('gst_slab', 6, 2)->default(0);
                $table->boolean('is_inter_state')->default(false);
                $table->decimal('cgst_percent', 6, 2)->default(0);
                $table->decimal('sgst_percent', 6, 2)->default(0);
                $table->decimal('igst_percent', 6, 2)->default(0);
                $table->decimal('cgst_amount', 15, 2)->default(0);
                $table->decimal('sgst_amount', 15, 2)->default(0);
                $table->decimal('igst_amount', 15, 2)->default(0);
                $table->decimal('tax_rate', 6, 2)->default(0);
                $table->decimal('tax_amount', 15, 2)->default(0);
                $table->decimal('subtotal', 15, 2)->default(0);
                $table->decimal('total', 15, 2)->default(0);
                $table->timestamps();
            });
        } else {
            Schema::table('quotation_items', function (Blueprint $table) {
                if (!Schema::hasColumn('quotation_items', 'item_name')) {
                    $table->string('item_name')->nullable();
                }
                if (!Schema::hasColumn('quotation_items', 'description')) {
                    $table->text('description')->nullable();
                }
                if (!Schema::hasColumn('quotation_items', 'hsn_code')) {
                    $table->string('hsn_code', 20)->nullable();
                }
                if (!Schema::hasColumn('quotation_items', 'discount_percent')) {
                    $table->decimal('discount_percent', 6, 2)->default(0);
                }
                if (!Schema::hasColumn('quotation_items', 'discount_amount')) {
                    $table->decimal('discount_amount', 15, 2)->default(0);
                }
                if (!Schema::hasColumn('quotation_items', 'gst_slab')) {
                    $table->decimal('gst_slab', 6, 2)->default(0);
                }
                if (!Schema::hasColumn('quotation_items', 'is_inter_state')) {
                    $table->boolean('is_inter_state')->default(false);
                }
                if (!Schema::hasColumn('quotation_items', 'cgst_percent')) {
                    $table->decimal('cgst_percent', 6, 2)->default(0);
                }
                if (!Schema::hasColumn('quotation_items', 'sgst_percent')) {
                    $table->decimal('sgst_percent', 6, 2)->default(0);
                }
                if (!Schema::hasColumn('quotation_items', 'igst_percent')) {
                    $table->decimal('igst_percent', 6, 2)->default(0);
                }
                if (!Schema::hasColumn('quotation_items', 'cgst_amount')) {
                    $table->decimal('cgst_amount', 15, 2)->default(0);
                }
                if (!Schema::hasColumn('quotation_items', 'sgst_amount')) {
                    $table->decimal('sgst_amount', 15, 2)->default(0);
                }
                if (!Schema::hasColumn('quotation_items', 'igst_amount')) {
                    $table->decimal('igst_amount', 15, 2)->default(0);
                }
                if (!Schema::hasColumn('quotation_items', 'tax_amount')) {
                    $table->decimal('tax_amount', 15, 2)->default(0);
                }
                if (!Schema::hasColumn('quotation_items', 'total')) {
                    $table->decimal('total', 15, 2)->default(0);
                }
            });
        }

        // 3. Add quotation_id to invoices if missing
        if (Schema::hasTable('invoices') && !Schema::hasColumn('invoices', 'quotation_id')) {
            Schema::table('invoices', function (Blueprint $table) {
                $table->foreignId('quotation_id')->nullable()->after('order_id')->constrained('quotations')->nullOnDelete();
            });
        }

        // 4. Contacts Table
        if (!Schema::hasTable('contacts')) {
            Schema::create('contacts', function (Blueprint $table) {
                $table->id();
                $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete();
                $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
                $table->string('name');
                $table->string('company_name')->nullable();
                $table->string('designation')->nullable();
                $table->string('email')->nullable();
                $table->string('phone')->nullable();
                $table->string('alt_phone')->nullable();
                $table->string('contact_type', 30)->default('customer');
                $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
                $table->foreignId('supplier_id')->nullable()->constrained('suppliers')->nullOnDelete();
                $table->foreignId('dealer_id')->nullable()->constrained('dealers')->nullOnDelete();
                $table->string('gstin', 20)->nullable();
                $table->string('pan', 20)->nullable();
                $table->text('billing_address')->nullable();
                $table->text('shipping_address')->nullable();
                $table->string('city', 100)->nullable();
                $table->string('state', 100)->nullable();
                $table->string('pincode', 20)->nullable();
                $table->text('notes')->nullable();
                $table->boolean('is_active')->default(true);
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
                $table->softDeletes();
            });
        }

        // 5. Leads Table
        if (!Schema::hasTable('leads')) {
            Schema::create('leads', function (Blueprint $table) {
                $table->id();
                $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete();
                $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
                $table->string('name');
                $table->string('company_name')->nullable();
                $table->string('email')->nullable();
                $table->string('phone')->nullable();
                $table->string('whatsapp')->nullable();
                $table->string('source', 50)->default('website');
                $table->string('stage', 40)->default('new');
                $table->string('priority', 20)->default('medium');
                $table->decimal('expected_value', 15, 2)->default(0);
                $table->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
                $table->string('city', 100)->nullable();
                $table->string('state', 100)->nullable();
                $table->text('address')->nullable();
                $table->text('notes')->nullable();
                $table->text('lost_reason')->nullable();
                $table->date('next_follow_up')->nullable();
                $table->foreignId('converted_customer_id')->nullable()->constrained('customers')->nullOnDelete();
                $table->foreignId('converted_contact_id')->nullable()->constrained('contacts')->nullOnDelete();
                $table->timestamp('converted_at')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
                $table->softDeletes();
            });
        }

        // 6. Lead Activities Table
        if (!Schema::hasTable('lead_activities')) {
            Schema::create('lead_activities', function (Blueprint $table) {
                $table->id();
                $table->foreignId('lead_id')->constrained('leads')->cascadeOnDelete();
                $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->string('activity_type', 40);
                $table->string('title');
                $table->text('description')->nullable();
                $table->dateTime('activity_date');
                $table->date('follow_up_date')->nullable();
                $table->json('metadata')->nullable();
                $table->timestamps();
            });
        }

        // 7. Opportunities Table
        if (!Schema::hasTable('opportunities')) {
            Schema::create('opportunities', function (Blueprint $table) {
                $table->id();
                $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete();
                $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
                $table->string('title');
                $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
                $table->foreignId('lead_id')->nullable()->constrained('leads')->nullOnDelete();
                $table->decimal('deal_value', 15, 2)->default(0);
                $table->string('stage', 40)->default('discovery');
                $table->integer('probability')->default(20);
                $table->date('expected_close_date')->nullable();
                $table->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
                $table->text('notes')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
                $table->softDeletes();
            });
        }

        // 8. Campaigns Table
        if (!Schema::hasTable('campaigns')) {
            Schema::create('campaigns', function (Blueprint $table) {
                $table->id();
                $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete();
                $table->string('name');
                $table->string('channel', 40)->default('email');
                $table->string('target_audience')->nullable();
                $table->string('status', 30)->default('draft');
                $table->date('start_date')->nullable();
                $table->date('end_date')->nullable();
                $table->decimal('budget', 15, 2)->default(0);
                $table->decimal('actual_cost', 15, 2)->default(0);
                $table->json('metrics')->nullable();
                $table->text('notes')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
                $table->softDeletes();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('campaigns');
        Schema::dropIfExists('opportunities');
        Schema::dropIfExists('lead_activities');
        Schema::dropIfExists('leads');
        Schema::dropIfExists('contacts');
        Schema::dropIfExists('quotation_items');
        Schema::dropIfExists('quotations');
    }
};
