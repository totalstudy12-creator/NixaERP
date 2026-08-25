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
            // 1. Add payment_direction column
            if (!Schema::hasColumn('payments', 'payment_direction')) {
                $table->enum('payment_direction', ['inward', 'outward'])
                      ->default('inward')
                      ->after('transaction_date');
            }

            // 2. (Optional) Add branch_id column and index
            if (!Schema::hasColumn('payments', 'branch_id')) {
                $table->unsignedBigInteger('branch_id')
                      ->nullable()
                      ->after('id');

                // Foreign key constraint (if branches table exists)
                $table->foreign('branch_id')
                      ->references('id')
                      ->on('branches')
                      ->nullOnDelete();
            }

            // Add index for branch_id only if it doesn't exist
            if (!Schema::hasIndex('payments', 'payments_branch_index')) {
                $table->index('branch_id', 'payments_branch_index');
            }

            // 3. IMPORTANT: Do NOT re-add indexes that already exist:
            //    - payments_payable_index
            //    - payments_invoice_index
            //    - payments_purchase_invoice_index
            //    These were already created in the previous migration.
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            // Drop payment_direction
            if (Schema::hasColumn('payments', 'payment_direction')) {
                $table->dropColumn('payment_direction');
            }

            // Drop branch index and column
            if (Schema::hasIndex('payments', 'payments_branch_index')) {
                $table->dropIndex('payments_branch_index');
            }

            if (Schema::hasColumn('payments', 'branch_id')) {
                $table->dropForeign(['branch_id']);
                $table->dropColumn('branch_id');
            }
        });
    }
};