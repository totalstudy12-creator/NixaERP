<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Payroll extends Model
{
    use HasFactory;

    protected $fillable = [
        // Employee and period
        'employee_id',
        'pay_period',

        // Earnings
        'basic',
        'hra',
        'da',
        'allowances',
        'incentives',
        'overtime',
        'festival_bonus',
        'performance_bonus',
        'other_bonus',
        'gross',

        // Deductions
        'pf',
        'esi',
        'professional_tax',
        'tds',
        'loan_installment',
        'advance',
        'late_deduction',
        'unpaid_leave_deduction',
        'total_deductions',

        // Net pay
        'net_pay',

        // Attendance counts
        'present',
        'absent',
        'leave',
        'holiday',
        'late',
        'half_day',
        'worked_days',
        'worked_hours',
        'overtime_hours',
        'overtime_rate',
        'hourly_rate',
        'daily_rate',

        // Detailed breakdowns (JSON)
        'attendance_breakdown',
        'overtime_details',

        // Status and payment
        'status',
        'payment_method',
        'bank_details',
        'notes',
    ];

    protected $casts = [
        'overtime_details'      => 'array',
        'attendance_breakdown'  => 'array',
        'pay_period'            => 'string',
        // Numeric fields are automatically cast by decimal columns
    ];

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }
}
