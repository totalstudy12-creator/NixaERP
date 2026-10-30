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
        if (Schema::hasTable('payments') && !Schema::hasColumn('payments', 'bank_account_id')) {
            Schema::table('payments', function (Blueprint $table) {
                $table->unsignedBigInteger('bank_account_id')->nullable()->after('branch_id');
                $table->index('bank_account_id');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('payments') && Schema::hasColumn('payments', 'bank_account_id')) {
            Schema::table('payments', function (Blueprint $table) {
                $table->dropIndex(['bank_account_id']);
                $table->dropColumn('bank_account_id');
            });
        }
    }
};
