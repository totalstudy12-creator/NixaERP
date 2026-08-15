<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payrolls', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained('employees')->cascadeOnDelete();
            $table->string('pay_period'); // YYYY-MM

            // Earnings
            $table->decimal('basic', 12, 2)->default(0);
            $table->decimal('hra', 12, 2)->default(0);
            $table->decimal('da', 12, 2)->default(0);
            $table->decimal('allowances', 12, 2)->default(0);
            $table->decimal('incentives', 12, 2)->default(0);
            $table->decimal('overtime', 12, 2)->default(0);
            $table->decimal('festival_bonus', 12, 2)->default(0);
            $table->decimal('performance_bonus', 12, 2)->default(0);
            $table->decimal('other_bonus', 12, 2)->default(0);
            $table->decimal('gross', 12, 2)->default(0);

            // Deductions
            $table->decimal('pf', 12, 2)->default(0);
            $table->decimal('esi', 12, 2)->default(0);
            $table->decimal('professional_tax', 12, 2)->default(0);
            $table->decimal('tds', 12, 2)->default(0);
            $table->decimal('loan_installment', 12, 2)->default(0);
            $table->decimal('advance', 12, 2)->default(0);
            $table->decimal('late_deduction', 12, 2)->default(0);
            $table->decimal('unpaid_leave_deduction', 12, 2)->default(0);
            $table->decimal('total_deductions', 12, 2)->default(0);

            // Net
            $table->decimal('net_pay', 12, 2)->default(0);

            // Attendance counts
            $table->integer('present')->default(0);
            $table->integer('absent')->default(0);
            $table->integer('leave')->default(0);
            $table->integer('holiday')->default(0);
            $table->integer('late')->default(0);
            $table->integer('half_day')->default(0);
            $table->integer('worked_days')->default(0);
            $table->integer('worked_hours')->default(0);
            $table->integer('overtime_hours')->default(0);
            $table->decimal('overtime_rate', 10, 2)->nullable();
            $table->decimal('hourly_rate', 10, 2)->nullable();
            $table->decimal('daily_rate', 10, 2)->nullable();

            // Detailed breakdown (JSON)
            $table->json('attendance_breakdown')->nullable();
            $table->json('overtime_details')->nullable();

            // Misc
            $table->string('status')->default('draft');
            $table->string('payment_method')->default('bank_transfer');
            $table->string('bank_details')->nullable();
            $table->text('notes')->nullable();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payrolls');
    }
};