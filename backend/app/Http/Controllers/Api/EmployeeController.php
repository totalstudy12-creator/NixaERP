<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class EmployeeController extends Controller
{
    public function index()
    {
        return Employee::with(['company', 'branch', 'reportingManager'])
            ->orderBy('first_name')
            ->paginate(15);
    }

    public function store(Request $request)
    {
        $data = $request->validate($this->validationRules());

        $employee = Employee::create($data);

        return $employee->load(['company', 'branch', 'reportingManager']);
    }

    public function show(Employee $employee)
    {
        return $employee->load(['company', 'branch', 'reportingManager']);
    }

    public function update(Request $request, Employee $employee)
    {
        $data = $request->validate($this->validationRules($employee->id));

        $employee->update($data);

        return $employee->fresh(['company', 'branch', 'reportingManager']);
    }

    public function destroy(Employee $employee)
    {
        $employee->delete();
        return response()->noContent();
    }

    protected function validationRules($employeeId = null): array
    {
        $uniqueEmployeeCode = Rule::unique('employees', 'employee_code');
        $uniqueEmail = Rule::unique('employees', 'email');

        if ($employeeId) {
            $uniqueEmployeeCode->ignore($employeeId);
            $uniqueEmail->ignore($employeeId);
        }

        return [
            'company_id'            => 'required|exists:companies,id',
            'branch_id'             => 'nullable|exists:branches,id',
            'department_id'         => 'nullable|exists:departments,id',
            'designation_id'        => 'nullable|exists:designations,id',
            'reporting_manager_id'  => 'nullable|exists:employees,id',
            'employee_code'         => ['required', 'string', 'max:100', $uniqueEmployeeCode],
            'first_name'            => 'required|string|max:100',
            'last_name'             => 'required|string|max:100',
            'email'                 => ['required', 'email', 'max:255', $uniqueEmail],
            'phone'                 => 'required|string|max:50',
            'gender'                => 'required|in:Male,Female,Other',
            'date_of_birth'         => 'nullable|date',
            'blood_group'           => 'nullable|in:A+,A-,B+,B-,AB+,AB-,O+,O-',
            'marital_status'        => 'nullable|in:Single,Married,Divorced,Widowed',
            'employment_type'       => 'nullable|string|max:50',
            'work_location'         => 'nullable|string|max:100',
            'salary_type'           => 'nullable|in:Monthly,Daily,Hourly',
            'ctc'                   => 'nullable|numeric|min:0',
            'gross'                 => 'nullable|numeric|min:0',
            'basic'                 => 'nullable|numeric|min:0',
            'hra'                   => 'nullable|numeric|min:0',
            'da'                    => 'nullable|numeric|min:0',
            'allowances'            => 'nullable|numeric|min:0',
            'pf'                    => 'nullable|numeric|min:0',
            'esi'                   => 'nullable|numeric|min:0',
            'professional_tax'      => 'nullable|numeric|min:0',
            'tds'                   => 'nullable|numeric|min:0',
            'bank_details'          => 'nullable|string',
            'uan'                   => 'nullable|string|max:50',
            'esic_number'           => 'nullable|string|max:50',
            'pending_biometric_scan'           => 'boolean',
            'manual_attendance_approval'       => 'boolean',
            'gps_attendance'                   => 'boolean',
            'mobile_attendance'                => 'boolean',
            'web_attendance'                   => 'boolean',
            'shift_attendance'                 => 'boolean',
            'late_mark'                        => 'boolean',
            'early_exit'                       => 'boolean',
            'half_day'                         => 'boolean',
            'overtime'                         => 'boolean',
            'missed_punch'                     => 'boolean',
            'attendance_correction_request'    => 'boolean',
            'address'               => 'nullable|string',
            'emergency_contact'     => 'nullable|string',
            'family_details'        => 'nullable|string',
            'references'            => 'nullable|string',
            'education'             => 'nullable|string',
            'experience'            => 'nullable|string',
            'skills'                => 'nullable|string',
            'languages'             => 'nullable|string',
            'passport'              => 'nullable|string|max:50',
            'driving_license'       => 'nullable|string|max:50',
            'aadhaar'               => 'nullable|string|max:50',
            'pan'                   => 'nullable|string|max:50',
            'voter_id'              => 'nullable|string|max:50',
            'documents'             => 'nullable|string',
            'document_expiry'       => 'nullable|date',
            'joining_date'                      => 'required|date',
            'confirmation_date'                 => 'nullable|date',
            'promotion_date'                    => 'nullable|date',
            'transfer_date'                     => 'nullable|date',
            'increment_date'                    => 'nullable|date',
            'suspension_date'                   => 'nullable|date',
            'exit_date'                         => 'nullable|date',
            'full_final_settlement_date'        => 'nullable|date',
            'status'                => 'required|in:active,inactive,on-leave',
        ];
    }
}