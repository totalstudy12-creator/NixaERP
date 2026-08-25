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
            // Optional branch relationship
            if (!Schema::hasColumn('payments', 'branch_id')) {
                $table->foreignId('branch_id')
                      ->nullable()
                      ->after('id') // adjust position as needed
                      ->constrained('branches')
                      ->nullOnDelete();
            }

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
            if (!Schema::hasColumn('payments', 'invoice_id')) {
                $table->foreignId('invoice_id')->nullable()->constrained('invoices')->nullOnDelete()->after('payable_id');
            }
            if (!Schema::hasColumn('payments', 'purchase_invoice_id')) {
                $table->foreignId('purchase_invoice_id')->nullable()->constrained('purchase_invoices')->nullOnDelete()->after('invoice_id');
            }

            // Indexes
            $table->index('branch_id', 'payments_branch_index');
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
            $table->dropIndex('payments_branch_index');

            // Drop foreign keys
            if (Schema::hasColumn('payments', 'purchase_invoice_id')) {
                $table->dropForeign(['purchase_invoice_id']);
                $table->dropColumn('purchase_invoice_id');
            }
            if (Schema::hasColumn('payments', 'invoice_id')) {
                $table->dropForeign(['invoice_id']);
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

            // Drop branch foreign key and column
            if (Schema::hasColumn('payments', 'branch_id')) {
                $table->dropForeign(['branch_id']);
                $table->dropColumn('branch_id');
            }
        });
    }
};