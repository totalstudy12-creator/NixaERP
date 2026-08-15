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
       Schema::table('employees', function (Blueprint $table) {
    $table->time('shift_start_time')->nullable();
    $table->time('shift_end_time')->nullable();
    $table->integer('grace_period_minutes')->default(10);   // allowed late minutes
    $table->decimal('hourly_rate', 10, 2)->nullable();
    $table->decimal('overtime_rate', 10, 2)->nullable();
    $table->decimal('daily_rate', 10, 2)->nullable();
});
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            //
        });
    }
};
