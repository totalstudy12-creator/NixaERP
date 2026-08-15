<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            // Organisation
            $table->unsignedBigInteger('department_id')->nullable()->after('branch_id');
            $table->unsignedBigInteger('designation_id')->nullable()->after('department_id');
            $table->unsignedBigInteger('reporting_manager_id')->nullable()->after('designation_id');
            $table->string('employment_type')->nullable();
            $table->string('work_location')->nullable();

            // Salary details
            $table->string('salary_type')->nullable(); // Monthly, Daily, Hourly
            $table->decimal('ctc', 10, 2)->default(0);
            $table->decimal('gross', 10, 2)->default(0);
            $table->decimal('basic', 10, 2)->default(0);
            $table->decimal('hra', 10, 2)->default(0);
            $table->decimal('da', 10, 2)->default(0);
            $table->decimal('allowances', 10, 2)->default(0);
            $table->decimal('pf', 10, 2)->default(0);
            $table->decimal('esi', 10, 2)->default(0);
            $table->decimal('professional_tax', 10, 2)->default(0);
            $table->decimal('tds', 10, 2)->default(0);
            $table->text('bank_details')->nullable();
            $table->string('uan')->nullable();
            $table->string('esic_number')->nullable();

            // Attendance settings
            $table->boolean('pending_biometric_scan')->default(false);
            $table->boolean('manual_attendance_approval')->default(false);
            $table->boolean('gps_attendance')->default(false);
            $table->boolean('mobile_attendance')->default(false);
            $table->boolean('web_attendance')->default(false);
            $table->boolean('shift_attendance')->default(false);
            $table->boolean('late_mark')->default(false);
            $table->boolean('early_exit')->default(false);
            $table->boolean('half_day')->default(false);
            $table->boolean('overtime')->default(false);
            $table->boolean('missed_punch')->default(false);
            $table->boolean('attendance_correction_request')->default(false);

            // Personal details
            $table->text('emergency_contact')->nullable();
            $table->text('family_details')->nullable();
            $table->text('references')->nullable();
            $table->text('education')->nullable();
            $table->text('experience')->nullable();
            $table->text('skills')->nullable();
            $table->text('languages')->nullable();
            $table->string('blood_group')->nullable();
            $table->string('marital_status')->nullable();

            // Documents / IDs
            $table->string('passport')->nullable();
            $table->string('driving_license')->nullable();
            $table->string('aadhaar')->nullable();
            $table->string('pan')->nullable();
            $table->string('voter_id')->nullable();
            $table->text('documents')->nullable(); // URLs or references
            $table->date('document_expiry')->nullable();

            // Lifecycle dates
            $table->date('joining_date')->nullable();
            $table->date('confirmation_date')->nullable();
            $table->date('promotion_date')->nullable();
            $table->date('transfer_date')->nullable();
            $table->date('increment_date')->nullable();
            $table->date('suspension_date')->nullable();
            $table->date('exit_date')->nullable();
            $table->date('full_final_settlement_date')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->dropColumn([
                'department_id', 'designation_id', 'reporting_manager_id', 'employment_type', 'work_location',
                'salary_type', 'ctc', 'gross', 'basic', 'hra', 'da', 'allowances', 'pf', 'esi',
                'professional_tax', 'tds', 'bank_details', 'uan', 'esic_number',
                'pending_biometric_scan', 'manual_attendance_approval', 'gps_attendance', 'mobile_attendance',
                'web_attendance', 'shift_attendance', 'late_mark', 'early_exit', 'half_day', 'overtime',
                'missed_punch', 'attendance_correction_request',
                'emergency_contact', 'family_details', 'references', 'education', 'experience', 'skills', 'languages',
                'blood_group', 'marital_status',
                'passport', 'driving_license', 'aadhaar', 'pan', 'voter_id', 'documents', 'document_expiry',
                'joining_date', 'confirmation_date', 'promotion_date', 'transfer_date', 'increment_date',
                'suspension_date', 'exit_date', 'full_final_settlement_date',
            ]);
        });
    }
};