<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Employee extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'company_id', 'branch_id', 'department_id', 'designation_id', 'reporting_manager_id',
        'employee_code', 'first_name', 'last_name', 'email', 'phone',
        'gender', 'date_of_birth', 'blood_group', 'marital_status',
        'employment_type', 'work_location',
        'salary_type', 'ctc', 'gross', 'basic', 'hra', 'da', 'allowances',
        'pf', 'esi', 'professional_tax', 'tds', 'bank_details', 'uan', 'esic_number',
        'pending_biometric_scan', 'manual_attendance_approval', 'gps_attendance',
        'mobile_attendance', 'web_attendance', 'shift_attendance', 'late_mark',
        'early_exit', 'half_day', 'overtime', 'missed_punch', 'attendance_correction_request',
        'address', 'emergency_contact', 'family_details', 'references',
        'education', 'experience', 'skills', 'languages',
        'passport', 'driving_license', 'aadhaar', 'pan', 'voter_id',
        'documents', 'document_expiry',
        'joining_date', 'confirmation_date', 'promotion_date', 'transfer_date',
        'increment_date', 'suspension_date', 'exit_date', 'full_final_settlement_date',
        'status','shift_start_time', 'shift_end_time', 'grace_period_minutes',
    'hourly_rate', 'overtime_rate', 'daily_rate',
    ];

    public function company()
    {
        return $this->belongsTo(Company::class);
    }

    public function branch()
    {
        return $this->belongsTo(Branch::class);
    }

    public function department()
    {
        return $this->belongsTo(Department::class);
    }

    public function designation()
    {
        return $this->belongsTo(Designation::class);
    }

    public function reportingManager()
    {
        return $this->belongsTo(Employee::class, 'reporting_manager_id');
    }
}