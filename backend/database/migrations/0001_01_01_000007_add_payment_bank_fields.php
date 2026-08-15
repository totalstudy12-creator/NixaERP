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
            if (!Schema::hasColumn('payments', 'bank_name')) {
                $table->string('bank_name')->nullable()->after('transaction_date');
            }
            if (!Schema::hasColumn('payments', 'account_number')) {
                $table->string('account_number')->nullable()->after('bank_name');
            }
            if (!Schema::hasColumn('payments', 'ledger_reference')) {
                $table->string('ledger_reference')->nullable()->after('account_number');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table) {
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
