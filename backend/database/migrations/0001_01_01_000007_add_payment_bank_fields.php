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
        Schema::table('payments', function (Blueprint $table) {
            // Bank payment details
            if (!Schema::hasColumn('payments', 'bank_name')) {
                $table->string('bank_name')->nullable()->after('transaction_date');
            }
            if (!Schema::hasColumn('payments', 'account_number')) {
                $table->string('account_number')->nullable()->after('bank_name');
            }
            if (!Schema::hasColumn('payments', 'ledger_reference')) {
                $table->string('ledger_reference')->nullable()->after('account_number');
            }

            // Polymorphic relationship for payable
            if (!Schema::hasColumn('payments', 'payable_type')) {
                $table->string('payable_type')->nullable()->after('ledger_reference');
            }
            if (!Schema::hasColumn('payments', 'payable_id')) {
                $table->unsignedBigInteger('payable_id')->nullable()->after('payable_type');
            }

            // Direct invoice references (optional - useful for quick queries)
            // Use unsignedBigInteger without foreign constraints to avoid compatibility issues
            if (!Schema::hasColumn('payments', 'invoice_id')) {
                $table->unsignedBigInteger('invoice_id')->nullable()->after('payable_id');
            }
            if (!Schema::hasColumn('payments', 'purchase_invoice_id')) {
                $table->unsignedBigInteger('purchase_invoice_id')->nullable()->after('invoice_id');
            }

            // Indexes for polymorphic relationship
            $table->index(['payable_id', 'payable_type'], 'payments_payable_index');
            $table->index('invoice_id', 'payments_invoice_index');
            $table->index('purchase_invoice_id', 'payments_purchase_invoice_index');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            // Drop indexes first
            $table->dropIndex('payments_purchase_invoice_index');
            $table->dropIndex('payments_invoice_index');
            $table->dropIndex('payments_payable_index');

            // Drop columns (no foreign keys were added)
            if (Schema::hasColumn('payments', 'purchase_invoice_id')) {
                $table->dropColumn('purchase_invoice_id');
            }
            if (Schema::hasColumn('payments', 'invoice_id')) {
                $table->dropColumn('invoice_id');
            }

            // Drop polymorphic columns
            if (Schema::hasColumn('payments', 'payable_id')) {
                $table->dropColumn('payable_id');
            }
            if (Schema::hasColumn('payments', 'payable_type')) {
                $table->dropColumn('payable_type');
            }

            // Drop bank details
            if (Schema::hasColumn('payments', 'ledger_reference')) {
                $table->dropColumn('ledger_reference');
            }
            if (Schema::hasColumn('payments', 'account_number')) {
                $table->dropColumn('account_number');
            }
            if (Schema::hasColumn('payments', 'bank_name')) {
                $table->dropColumn('bank_name');
            }
        });
    }
};