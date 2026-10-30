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
        // 1. Bank Reconciliation Learned Rules table
        if (!Schema::hasTable('bank_reconciliation_rules')) {
            Schema::create('bank_reconciliation_rules', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('company_id');
                $table->unsignedBigInteger('branch_id')->nullable();
                $table->string('rule_name', 191);
                $table->string('pattern_type', 50)->default('contains'); // contains, regex, upi_vpa, exact, starts_with
                $table->string('pattern_value', 191);
                $table->string('action', 50)->default('create_expense_draft'); // create_expense_draft, categorize_expense, match_vendor, match_transfer, ignore
                $table->string('category', 100)->nullable(); // e.g. "Electricity Expense", "Rent Expense", "Bank Charges"
                $table->string('vendor_name', 191)->nullable();
                $table->unsignedBigInteger('vendor_id')->nullable();
                $table->unsignedSmallInteger('confidence_score')->default(90);
                $table->unsignedInteger('times_used')->default(0);
                $table->dateTime('last_matched_at')->nullable();
                $table->boolean('is_active')->default(true);
                $table->string('source', 30)->default('learned'); // learned, manual
                $table->unsignedBigInteger('learned_from_transaction_id')->nullable();
                $table->text('notes')->nullable();
                $table->unsignedBigInteger('created_by')->nullable();
                $table->unsignedBigInteger('updated_by')->nullable();
                $table->timestamps();
                $table->softDeletes();

                $table->index(['company_id', 'is_active'], 'brr_comp_active_idx');
                $table->index(['company_id', 'pattern_type'], 'brr_comp_pattern_idx');
            });
        }

        // 2. Link bank_statement_transactions to expense draft
        if (Schema::hasTable('bank_statement_transactions')) {
            Schema::table('bank_statement_transactions', function (Blueprint $table) {
                if (!Schema::hasColumn('bank_statement_transactions', 'expense_draft_id')) {
                    $table->unsignedBigInteger('expense_draft_id')->nullable()->after('matched_transaction_id');
                    $table->index('expense_draft_id', 'bst_exp_draft_idx');
                }
                if (!Schema::hasColumn('bank_statement_transactions', 'learned_rule_id')) {
                    $table->unsignedBigInteger('learned_rule_id')->nullable()->after('expense_draft_id');
                }
            });
        }

        // 3. Link reconciliation_matches to financial_entry_id
        if (Schema::hasTable('reconciliation_matches')) {
            Schema::table('reconciliation_matches', function (Blueprint $table) {
                if (!Schema::hasColumn('reconciliation_matches', 'financial_entry_id')) {
                    $table->unsignedBigInteger('financial_entry_id')->nullable()->after('payment_id');
                    $table->index('financial_entry_id', 'rm_fin_entry_idx');
                }
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('bank_statement_transactions')) {
            Schema::table('bank_statement_transactions', function (Blueprint $table) {
                if (Schema::hasColumn('bank_statement_transactions', 'expense_draft_id')) {
                    $table->dropIndex('bst_exp_draft_idx');
                    $table->dropColumn('expense_draft_id');
                }
                if (Schema::hasColumn('bank_statement_transactions', 'learned_rule_id')) {
                    $table->dropColumn('learned_rule_id');
                }
            });
        }

        if (Schema::hasTable('reconciliation_matches')) {
            Schema::table('reconciliation_matches', function (Blueprint $table) {
                if (Schema::hasColumn('reconciliation_matches', 'financial_entry_id')) {
                    $table->dropIndex('rm_fin_entry_idx');
                    $table->dropColumn('financial_entry_id');
                }
            });
        }

        Schema::dropIfExists('bank_reconciliation_rules');
    }
};
