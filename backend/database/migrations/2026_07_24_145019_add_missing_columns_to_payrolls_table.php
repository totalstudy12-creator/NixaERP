<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payrolls', function (Blueprint $table) {
            // Earnings
            if (!Schema::hasColumn('payrolls', 'da')) {
                $table->decimal('da', 12, 2)->default(0)->after('hra');
            }
            if (!Schema::hasColumn('payrolls', 'incentives')) {
                $table->decimal('incentives', 12, 2)->default(0)->after('allowances');
            }
            if (!Schema::hasColumn('payrolls', 'festival_bonus')) {
                $table->decimal('festival_bonus', 12, 2)->default(0)->after('overtime');
            }
            if (!Schema::hasColumn('payrolls', 'performance_bonus')) {
                $table->decimal('performance_bonus', 12, 2)->default(0)->after('festival_bonus');
            }
            if (!Schema::hasColumn('payrolls', 'other_bonus')) {
                $table->decimal('other_bonus', 12, 2)->default(0)->after('performance_bonus');
            }
            if (!Schema::hasColumn('payrolls', 'gross')) {
                $table->decimal('gross', 12, 2)->default(0)->after('other_bonus');
            }

            // Deductions
            if (!Schema::hasColumn('payrolls', 'pf')) {
                $table->decimal('pf', 12, 2)->default(0)->after('gross');
            }
            if (!Schema::hasColumn('payrolls', 'esi')) {
                $table->decimal('esi', 12, 2)->default(0)->after('pf');
            }
            if (!Schema::hasColumn('payrolls', 'professional_tax')) {
                $table->decimal('professional_tax', 12, 2)->default(0)->after('esi');
            }
            if (!Schema::hasColumn('payrolls', 'tds')) {
                $table->decimal('tds', 12, 2)->default(0)->after('professional_tax');
            }
            if (!Schema::hasColumn('payrolls', 'loan_installment')) {
                $table->decimal('loan_installment', 12, 2)->default(0)->after('tds');
            }
            if (!Schema::hasColumn('payrolls', 'advance')) {
                $table->decimal('advance', 12, 2)->default(0)->after('loan_installment');
            }
            if (!Schema::hasColumn('payrolls', 'late_deduction')) {
                $table->decimal('late_deduction', 12, 2)->default(0)->after('advance');
            }
            if (!Schema::hasColumn('payrolls', 'unpaid_leave_deduction')) {
                $table->decimal('unpaid_leave_deduction', 12, 2)->default(0)->after('late_deduction');
            }
            if (!Schema::hasColumn('payrolls', 'total_deductions')) {
                $table->decimal('total_deductions', 12, 2)->default(0)->after('unpaid_leave_deduction');
            }

            // Net pay
            if (!Schema::hasColumn('payrolls', 'net_pay')) {
                $table->decimal('net_pay', 12, 2)->default(0)->after('total_deductions');
            }

            // Attendance counts
            if (!Schema::hasColumn('payrolls', 'present')) {
                $table->integer('present')->default(0)->after('net_pay');
            }
            if (!Schema::hasColumn('payrolls', 'absent')) {
                $table->integer('absent')->default(0)->after('present');
            }
            if (!Schema::hasColumn('payrolls', 'leave')) {
                $table->integer('leave')->default(0)->after('absent');
            }
            if (!Schema::hasColumn('payrolls', 'holiday')) {
                $table->integer('holiday')->default(0)->after('leave');
            }
            if (!Schema::hasColumn('payrolls', 'late')) {
                $table->integer('late')->default(0)->after('holiday');
            }
            if (!Schema::hasColumn('payrolls', 'half_day')) {
                $table->integer('half_day')->default(0)->after('late');
            }
            if (!Schema::hasColumn('payrolls', 'worked_days')) {
                $table->integer('worked_days')->default(0)->after('half_day');
            }
            if (!Schema::hasColumn('payrolls', 'worked_hours')) {
                $table->integer('worked_hours')->default(0)->after('worked_days');
            }
            if (!Schema::hasColumn('payrolls', 'overtime_hours')) {
                $table->integer('overtime_hours')->default(0)->after('worked_hours');
            }
            if (!Schema::hasColumn('payrolls', 'overtime_rate')) {
                $table->decimal('overtime_rate', 10, 2)->nullable()->after('overtime_hours');
            }
            if (!Schema::hasColumn('payrolls', 'hourly_rate')) {
                $table->decimal('hourly_rate', 10, 2)->nullable()->after('overtime_rate');
            }
            if (!Schema::hasColumn('payrolls', 'daily_rate')) {
                $table->decimal('daily_rate', 10, 2)->nullable()->after('hourly_rate');
            }

            // JSON fields
            if (!Schema::hasColumn('payrolls', 'attendance_breakdown')) {
                $table->json('attendance_breakdown')->nullable()->after('daily_rate');
            }
            if (!Schema::hasColumn('payrolls', 'overtime_details')) {
                $table->json('overtime_details')->nullable()->after('attendance_breakdown');
            }
        });
    }

    public function down(): void
    {
        Schema::table('payrolls', function (Blueprint $table) {
            $table->dropColumn([
                'da', 'incentives', 'festival_bonus', 'performance_bonus', 'other_bonus', 'gross',
                'pf', 'esi', 'professional_tax', 'tds', 'loan_installment', 'advance',
                'late_deduction', 'unpaid_leave_deduction', 'total_deductions', 'net_pay',
                'present', 'absent', 'leave', 'holiday', 'late', 'half_day',
                'worked_days', 'worked_hours', 'overtime_hours', 'overtime_rate',
                'hourly_rate', 'daily_rate', 'attendance_breakdown', 'overtime_details'
            ]);
        });
    }
};