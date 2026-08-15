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
        Schema::table('payrolls', function (Blueprint $table) {
    if (!Schema::hasColumn('payrolls', 'present')) {
        $table->integer('present')->default(0);
    }
    if (!Schema::hasColumn('payrolls', 'absent')) {
        $table->integer('absent')->default(0);
    }
    if (!Schema::hasColumn('payrolls', 'leave')) {
        $table->integer('leave')->default(0);
    }
    if (!Schema::hasColumn('payrolls', 'holiday')) {
        $table->integer('holiday')->default(0);
    }
    if (!Schema::hasColumn('payrolls', 'late')) {
        $table->integer('late')->default(0);
    }
    if (!Schema::hasColumn('payrolls', 'half_day')) {
        $table->integer('half_day')->default(0);
    }
    if (!Schema::hasColumn('payrolls', 'festival_bonus')) {
        $table->decimal('festival_bonus', 12, 2)->default(0);
    }
    if (!Schema::hasColumn('payrolls', 'performance_bonus')) {
        $table->decimal('performance_bonus', 12, 2)->default(0);
    }
    if (!Schema::hasColumn('payrolls', 'other_bonus')) {
        $table->decimal('other_bonus', 12, 2)->default(0);
    }
    if (!Schema::hasColumn('payrolls', 'loan_balance')) {
        $table->decimal('loan_balance', 12, 2)->default(0);
    }
    if (!Schema::hasColumn('payrolls', 'loan_installment')) {
        $table->decimal('loan_installment', 12, 2)->default(0);
    }
    if (!Schema::hasColumn('payrolls', 'advance')) {
        $table->decimal('advance', 12, 2)->default(0);
    }
    if (!Schema::hasColumn('payrolls', 'overtime_details')) {
        $table->json('overtime_details')->nullable();
    }
});
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('payrolls', function (Blueprint $table) {
            //
        });
    }
};
