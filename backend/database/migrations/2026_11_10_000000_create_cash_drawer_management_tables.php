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
        // 1. Cash Drawers Master
        if (!Schema::hasTable('cash_drawers')) {
            Schema::create('cash_drawers', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('company_id');
                $table->unsignedBigInteger('branch_id');
                $table->string('name', 191);
                $table->string('code', 50);
                $table->string('status', 30)->default('active'); // active, inactive, maintenance
                $table->boolean('is_default')->default(false);
                $table->decimal('starting_balance', 15, 2)->default(0.00);
                $table->decimal('current_balance', 15, 2)->default(0.00);
                $table->boolean('allow_overdraft')->default(false);
                $table->decimal('overdraft_limit', 15, 2)->default(0.00);
                $table->unsignedBigInteger('account_id')->nullable(); // optional link to bank_accounts
                $table->text('notes')->nullable();
                $table->unsignedBigInteger('created_by')->nullable();
                $table->unsignedBigInteger('updated_by')->nullable();
                $table->timestamps();
                $table->softDeletes();

                $table->unique(['company_id', 'code'], 'cd_company_code_unique');
                $table->index(['company_id', 'branch_id'], 'cd_company_branch_idx');
                $table->index(['company_id', 'status'], 'cd_company_status_idx');
            });
        }

        // 2. Cash Drawer Sessions (Daily Opening / Closing Sessions)
        if (!Schema::hasTable('cash_drawer_sessions')) {
            Schema::create('cash_drawer_sessions', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('company_id');
                $table->unsignedBigInteger('branch_id');
                $table->unsignedBigInteger('cash_drawer_id');
                $table->unsignedBigInteger('user_id'); // Cashier who opened
                $table->string('session_number', 50);
                $table->string('status', 30)->default('open'); // open, closed
                $table->dateTime('opened_at');
                $table->dateTime('closed_at')->nullable();
                $table->decimal('opening_balance', 15, 2)->default(0.00);
                $table->decimal('suggested_opening_balance', 15, 2)->default(0.00);
                $table->decimal('opening_difference', 15, 2)->default(0.00);
                $table->text('opening_difference_reason')->nullable();
                $table->text('opening_notes')->nullable();
                $table->json('opening_denominations')->nullable();
                $table->decimal('total_cash_in', 15, 2)->default(0.00);
                $table->decimal('total_cash_out', 15, 2)->default(0.00);
                $table->decimal('expected_closing_cash', 15, 2)->default(0.00);
                $table->decimal('actual_closing_cash', 15, 2)->nullable();
                $table->decimal('closing_difference', 15, 2)->nullable();
                $table->text('closing_notes')->nullable();
                $table->text('discrepancy_reason')->nullable();
                $table->json('closing_denominations')->nullable();
                $table->unsignedBigInteger('closed_by')->nullable();
                $table->string('discrepancy_status', 30)->default('none'); // none, pending_approval, approved, rejected
                $table->unsignedBigInteger('approved_by')->nullable();
                $table->dateTime('approved_at')->nullable();
                $table->text('approval_notes')->nullable();
                $table->timestamps();

                $table->unique(['company_id', 'session_number'], 'cds_company_session_unique');
                $table->index(['cash_drawer_id', 'status'], 'cds_drawer_status_idx');
                $table->index(['company_id', 'branch_id'], 'cds_company_branch_idx');
                $table->index(['user_id', 'status'], 'cds_user_status_idx');
            });
        }

        // 3. Cash Drawer Transactions (All cash movements)
        if (!Schema::hasTable('cash_drawer_transactions')) {
            Schema::create('cash_drawer_transactions', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('company_id');
                $table->unsignedBigInteger('branch_id');
                $table->unsignedBigInteger('cash_drawer_id');
                $table->unsignedBigInteger('cash_drawer_session_id');
                $table->string('transaction_number', 50);
                $table->string('transaction_type', 30); // cash_in, cash_out, opening_float, transfer_in, transfer_out, adjustment, reversal
                $table->string('category', 50); // customer_payment, cash_sales, opening_float, owner_contribution, transfer_in, bank_withdrawal, other_receipt, shop_expenses, staff_expenses, staff_advance, supplier_payment, purchase_payment, bank_deposit, transfer_out, safe_deposit, shortage_adjustment, excess_adjustment, other_expense, refund
                $table->decimal('amount', 15, 2);
                $table->decimal('balance_before', 15, 2)->default(0.00);
                $table->decimal('balance_after', 15, 2)->default(0.00);
                $table->dateTime('transaction_date');
                $table->string('reference_no', 191)->nullable();
                $table->string('received_from_or_paid_to', 191)->nullable();
                $table->text('description')->nullable();
                $table->string('source_type', 50)->nullable(); // payment, invoice, purchase_invoice, financial_entry, cash_transfer, manual, opening, adjustment
                $table->unsignedBigInteger('source_id')->nullable();
                $table->string('idempotency_key', 191)->nullable();
                $table->boolean('is_reversal')->default(false);
                $table->unsignedBigInteger('reversed_transaction_id')->nullable();
                $table->unsignedBigInteger('created_by')->nullable();
                $table->timestamps();

                $table->unique(['company_id', 'transaction_number'], 'cdt_company_txn_unique');
                $table->index(['company_id', 'idempotency_key'], 'cdt_idempotency_idx');
                $table->index(['cash_drawer_id', 'transaction_date'], 'cdt_drawer_date_idx');
                $table->index('cash_drawer_session_id', 'cdt_session_idx');
                $table->index(['company_id', 'branch_id'], 'cdt_company_branch_idx');
                $table->index(['source_type', 'source_id'], 'cdt_source_idx');
            });
        }

        // 4. Cash Drawer Transfers (Inter-drawer, Safe, Cross-branch)
        if (!Schema::hasTable('cash_drawer_transfers')) {
            Schema::create('cash_drawer_transfers', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('company_id');
                $table->string('transfer_number', 50);
                $table->unsignedBigInteger('source_drawer_id');
                $table->unsignedBigInteger('source_branch_id');
                $table->unsignedBigInteger('source_session_id')->nullable();
                $table->unsignedBigInteger('destination_drawer_id');
                $table->unsignedBigInteger('destination_branch_id');
                $table->unsignedBigInteger('destination_session_id')->nullable();
                $table->decimal('amount', 15, 2);
                $table->string('status', 30)->default('initiated'); // initiated, in_transit, received, rejected, cancelled
                $table->unsignedBigInteger('initiated_by');
                $table->dateTime('initiated_at');
                $table->unsignedBigInteger('received_by')->nullable();
                $table->dateTime('received_at')->nullable();
                $table->unsignedBigInteger('rejected_by')->nullable();
                $table->dateTime('rejected_at')->nullable();
                $table->unsignedBigInteger('source_transaction_id')->nullable();
                $table->unsignedBigInteger('destination_transaction_id')->nullable();
                $table->text('notes')->nullable();
                $table->text('rejection_reason')->nullable();
                $table->timestamps();

                $table->unique(['company_id', 'transfer_number'], 'cdtr_company_num_unique');
                $table->index(['company_id', 'status'], 'cdtr_company_status_idx');
                $table->index('source_drawer_id', 'cdtr_source_drawer_idx');
                $table->index('destination_drawer_id', 'cdtr_dest_drawer_idx');
            });
        }

        // 5. Configurable Denominations
        if (!Schema::hasTable('cash_drawer_denominations')) {
            Schema::create('cash_drawer_denominations', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('company_id')->nullable(); // null = system default
                $table->string('currency', 10)->default('INR');
                $table->string('label', 50);
                $table->decimal('value', 10, 2);
                $table->integer('sort_order')->default(0);
                $table->boolean('is_active')->default(true);
                $table->timestamps();

                $table->index(['currency', 'is_active', 'sort_order'], 'cdd_curr_active_sort_idx');
            });
        }

        // 6. Cash Drawer Audit Logs
        if (!Schema::hasTable('cash_drawer_audit_logs')) {
            Schema::create('cash_drawer_audit_logs', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('company_id');
                $table->unsignedBigInteger('branch_id')->nullable();
                $table->unsignedBigInteger('cash_drawer_id')->nullable();
                $table->unsignedBigInteger('cash_drawer_session_id')->nullable();
                $table->string('action', 50); // session_opened, session_closed, cash_in, cash_out, transfer_initiated, transfer_received, transfer_rejected, discrepancy_approved, balance_adjusted
                $table->unsignedBigInteger('user_id')->nullable();
                $table->json('old_values')->nullable();
                $table->json('new_values')->nullable();
                $table->string('ip_address', 45)->nullable();
                $table->text('user_agent')->nullable();
                $table->text('notes')->nullable();
                $table->timestamp('created_at')->useCurrent();

                $table->index(['cash_drawer_id', 'created_at'], 'cdal_drawer_created_idx');
                $table->index(['company_id', 'action'], 'cdal_company_action_idx');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('cash_drawer_audit_logs');
        Schema::dropIfExists('cash_drawer_denominations');
        Schema::dropIfExists('cash_drawer_transfers');
        Schema::dropIfExists('cash_drawer_transactions');
        Schema::dropIfExists('cash_drawer_sessions');
        Schema::dropIfExists('cash_drawers');
    }
};
