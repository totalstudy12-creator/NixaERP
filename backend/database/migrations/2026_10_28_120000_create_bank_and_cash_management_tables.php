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
        // 1. Bank & Cash Accounts
        if (!Schema::hasTable('bank_accounts')) {
            Schema::create('bank_accounts', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('company_id');
                $table->unsignedBigInteger('branch_id')->nullable();
                $table->unsignedBigInteger('warehouse_id')->nullable();
                $table->string('account_name', 191);
                $table->string('account_type', 50)->default('bank'); // bank, cash_drawer, petty_cash, vault, digital_wallet, credit_card
                $table->string('bank_name', 191)->nullable();
                $table->string('account_number', 100)->nullable();
                $table->string('ifsc_code', 30)->nullable();
                $table->string('branch_name', 191)->nullable();
                $table->string('swift_code', 50)->nullable();
                $table->string('upi_id', 100)->nullable();
                $table->string('currency', 10)->default('INR');
                $table->decimal('opening_balance', 15, 2)->default(0.00);
                $table->decimal('current_balance', 15, 2)->default(0.00);
                $table->boolean('is_active')->default(true);
                $table->boolean('is_default')->default(false);
                $table->text('notes')->nullable();
                $table->unsignedBigInteger('created_by')->nullable();
                $table->unsignedBigInteger('updated_by')->nullable();
                $table->timestamps();
                $table->softDeletes();

                $table->index(['company_id', 'is_active'], 'ba_company_active_idx');
                $table->index(['company_id', 'branch_id'], 'ba_company_branch_idx');
                $table->index(['account_type', 'is_active'], 'ba_type_active_idx');
            });
        }

        // 2. Bank Account Transactions (Ledger & Running Balance)
        if (!Schema::hasTable('bank_account_transactions')) {
            Schema::create('bank_account_transactions', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('company_id');
                $table->unsignedBigInteger('branch_id')->nullable();
                $table->unsignedBigInteger('bank_account_id');
                $table->string('transaction_type', 50); // deposit, withdrawal, transfer_in, transfer_out, payment_in, payment_out, bank_charges, interest, adjustment, cash_deposit, cash_withdrawal
                $table->decimal('amount', 15, 2);
                $table->decimal('running_balance', 15, 2)->default(0.00);
                $table->date('transaction_date');
                $table->date('value_date')->nullable();
                $table->string('reference_no', 191)->nullable();
                $table->text('description')->nullable();
                $table->unsignedBigInteger('payment_id')->nullable();
                $table->unsignedBigInteger('transfer_id')->nullable(); // links paired transfer_in and transfer_out
                $table->string('counterparty', 191)->nullable();
                $table->string('status', 30)->default('cleared'); // pending, cleared, reconciled, reversed
                $table->dateTime('reconciled_at')->nullable();
                $table->unsignedBigInteger('statement_transaction_id')->nullable();
                $table->unsignedBigInteger('created_by')->nullable();
                $table->timestamps();
                $table->softDeletes();

                $table->index(['bank_account_id', 'transaction_date'], 'bat_account_date_idx');
                $table->index(['company_id', 'transaction_type'], 'bat_company_type_idx');
                $table->index('reference_no', 'bat_ref_idx');
                $table->index('transfer_id', 'bat_transfer_idx');
                $table->index('payment_id', 'bat_payment_idx');
                $table->index('status', 'bat_status_idx');
            });
        }

        // 3. Daily Cash Closings
        if (!Schema::hasTable('cash_closings')) {
            Schema::create('cash_closings', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('company_id');
                $table->unsignedBigInteger('branch_id')->nullable();
                $table->unsignedBigInteger('warehouse_id')->nullable();
                $table->unsignedBigInteger('cash_account_id');
                $table->date('closing_date');
                $table->decimal('opening_cash', 15, 2)->default(0.00);
                $table->decimal('cash_received', 15, 2)->default(0.00);
                $table->decimal('cash_paid', 15, 2)->default(0.00);
                $table->decimal('expected_closing_cash', 15, 2)->default(0.00);
                $table->decimal('physical_cash_counted', 15, 2)->default(0.00);
                $table->decimal('difference', 15, 2)->default(0.00); // physical - expected
                $table->json('denomination_breakdown')->nullable();
                $table->string('status', 30)->default('draft'); // draft, pending_approval, approved, rejected
                $table->unsignedBigInteger('approved_by')->nullable();
                $table->dateTime('approved_at')->nullable();
                $table->text('remarks')->nullable();
                $table->unsignedBigInteger('created_by')->nullable();
                $table->timestamps();

                $table->index(['cash_account_id', 'closing_date'], 'cc_account_date_idx');
                $table->index(['company_id', 'status'], 'cc_company_status_idx');
            });
        }

        // 4. Bank Statements (Uploaded Files & Batches)
        if (!Schema::hasTable('bank_statements')) {
            Schema::create('bank_statements', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('company_id');
                $table->unsignedBigInteger('branch_id')->nullable();
                $table->unsignedBigInteger('bank_account_id');
                $table->string('file_name', 255);
                $table->string('file_path', 500)->nullable();
                $table->string('file_hash', 64)->nullable(); // SHA-256 for duplicate upload guard
                $table->string('format', 20)->default('csv'); // csv, xlsx, xls, pdf
                $table->string('bank_format', 50)->default('generic'); // hdfc, sbi, icici, axis, pnb, bob, generic
                $table->date('statement_from_date')->nullable();
                $table->date('statement_to_date')->nullable();
                $table->decimal('opening_balance', 15, 2)->nullable();
                $table->decimal('closing_balance', 15, 2)->nullable();
                $table->unsignedInteger('total_transactions')->default(0);
                $table->unsignedInteger('reconciled_transactions')->default(0);
                $table->string('status', 30)->default('parsed'); // uploaded, parsed, partially_reconciled, reconciled, failed
                $table->unsignedBigInteger('uploaded_by')->nullable();
                $table->timestamps();
                $table->softDeletes();

                $table->index(['bank_account_id', 'created_at'], 'bs_account_created_idx');
                $table->index(['company_id', 'file_hash'], 'bs_company_hash_idx');
            });
        }

        // 5. Bank Statement Transactions (Individual Rows from Statement)
        if (!Schema::hasTable('bank_statement_transactions')) {
            Schema::create('bank_statement_transactions', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('statement_id');
                $table->unsignedBigInteger('bank_account_id');
                $table->unsignedBigInteger('company_id');
                $table->date('transaction_date');
                $table->date('value_date')->nullable();
                $table->text('description');
                $table->string('reference_no', 191)->nullable(); // UTR, RRN, Cheque
                $table->decimal('debit', 15, 2)->default(0.00);  // Withdrawal from bank
                $table->decimal('credit', 15, 2)->default(0.00); // Deposit into bank
                $table->decimal('balance', 15, 2)->nullable();   // Running balance on statement
                $table->string('fingerprint', 64)->nullable();   // Hash of date+ref+debit+credit+balance
                $table->string('reconciliation_status', 30)->default('unmatched'); // unmatched, suggested, matched, manually_matched, ignored, adjustment_created
                $table->unsignedBigInteger('matched_payment_id')->nullable();
                $table->unsignedBigInteger('matched_transaction_id')->nullable();
                $table->unsignedSmallInteger('match_confidence')->default(0); // 0 - 100
                $table->string('match_type', 50)->nullable(); // exact_utr, exact_amount_date, invoice_ref, description_ai, manual
                $table->text('match_notes')->nullable();
                $table->dateTime('reconciled_at')->nullable();
                $table->unsignedBigInteger('reconciled_by')->nullable();
                $table->timestamps();

                $table->index(['statement_id', 'reconciliation_status'], 'bst_stmt_status_idx');
                $table->index(['bank_account_id', 'transaction_date'], 'bst_account_date_idx');
                $table->index('reference_no', 'bst_ref_idx');
                $table->index('fingerprint', 'bst_fingerprint_idx');
                $table->index('matched_payment_id', 'bst_matched_pay_idx');
            });
        }

        // 6. Reconciliation Sessions / Periods
        if (!Schema::hasTable('bank_reconciliations')) {
            Schema::create('bank_reconciliations', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('company_id');
                $table->unsignedBigInteger('branch_id')->nullable();
                $table->unsignedBigInteger('bank_account_id');
                $table->unsignedBigInteger('statement_id')->nullable();
                $table->date('reconciliation_date');
                $table->date('period_start');
                $table->date('period_end');
                $table->decimal('statement_ending_balance', 15, 2)->default(0.00);
                $table->decimal('book_ending_balance', 15, 2)->default(0.00);
                $table->decimal('unreconciled_deposits', 15, 2)->default(0.00); // Deposits in transit
                $table->decimal('unreconciled_payments', 15, 2)->default(0.00); // Outstanding cheques
                $table->decimal('bank_charges', 15, 2)->default(0.00);
                $table->decimal('bank_interest', 15, 2)->default(0.00);
                $table->decimal('difference', 15, 2)->default(0.00);
                $table->string('status', 30)->default('in_progress'); // in_progress, completed, approved
                $table->unsignedBigInteger('reconciled_by')->nullable();
                $table->unsignedBigInteger('approved_by')->nullable();
                $table->dateTime('approved_at')->nullable();
                $table->timestamps();

                $table->index(['bank_account_id', 'reconciliation_date'], 'br_account_date_idx');
                $table->index(['company_id', 'status'], 'br_company_status_idx');
            });
        }

        // 7. Reconciliation Matches (Supports 1-to-many, many-to-1, split settlements)
        if (!Schema::hasTable('reconciliation_matches')) {
            Schema::create('reconciliation_matches', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('bank_statement_transaction_id');
                $table->unsignedBigInteger('payment_id')->nullable();
                $table->unsignedBigInteger('bank_account_transaction_id')->nullable();
                $table->decimal('allocated_amount', 15, 2);
                $table->string('match_rule', 50); // exact_utr, exact_amount_date, invoice_ref, ai_suggestion, manual
                $table->unsignedSmallInteger('confidence_score')->default(100);
                $table->string('status', 30)->default('confirmed'); // proposed, confirmed, rejected
                $table->unsignedBigInteger('created_by')->nullable();
                $table->timestamps();

                $table->index('bank_statement_transaction_id', 'rm_bst_idx');
                $table->index('payment_id', 'rm_payment_idx');
                $table->index('bank_account_transaction_id', 'rm_bat_idx');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('reconciliation_matches');
        Schema::dropIfExists('bank_reconciliations');
        Schema::dropIfExists('bank_statement_transactions');
        Schema::dropIfExists('bank_statements');
        Schema::dropIfExists('cash_closings');
        Schema::dropIfExists('bank_account_transactions');
        Schema::dropIfExists('bank_accounts');
    }
};
