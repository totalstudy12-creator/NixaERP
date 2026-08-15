<?php

namespace Database\Factories;

use App\Models\Company;
use App\Models\Branch;
use App\Models\Department;
use App\Models\Designation;
use App\Models\Employee;
use Illuminate\Database\Eloquent\Factories\Factory;

class EmployeeFactory extends Factory
{
    protected $model = Employee::class;

    public function definition(): array
    {
        $salary = $this->faker->numberBetween(30000, 120000);
        $basic = round($salary * 0.4);
        $hra = round($salary * 0.2);
        return [
            'company_id' => Company::factory(),
            'branch_id' => null,
            'department_id' => null,
            'designation_id' => null,
            'reporting_manager_id' => null,
            'employee_code' => 'EMP-' . $this->faker->unique()->numberBetween(10000, 99999),
            'first_name' => $this->faker->firstName(),
            'last_name' => $this->faker->lastName(),
            'email' => $this->faker->unique()->safeEmail(),
            'phone' => $this->faker->phoneNumber(),
            'gender' => $this->faker->randomElement(['Male', 'Female', 'Other']),
            'date_of_birth' => $this->faker->date('Y-m-d', '2000-01-01'),
            'blood_group' => $this->faker->randomElement(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']),
            'marital_status' => $this->faker->randomElement(['Single', 'Married']),
            'employment_type' => $this->faker->randomElement(['Permanent', 'Contract']),
            'work_location' => $this->faker->city(),
            'salary_type' => 'Monthly',
            'ctc' => $salary,
            'gross' => $salary,
            'basic' => $basic,
            'hra' => $hra,
            'da' => 0,
            'allowances' => round($salary * 0.2),
            'pf' => round($basic * 0.12),
            'esi' => 0,
            'professional_tax' => 200,
            'tds' => 0,
            'bank_details' => json_encode(['bank' => 'Demo Bank', 'account' => '1234567890']),
            'uan' => null,
            'esic_number' => null,
            'pending_biometric_scan' => false,
            'manual_attendance_approval' => false,
            'gps_attendance' => true,
            'mobile_attendance' => true,
            'web_attendance' => true,
            'shift_attendance' => false,
            'late_mark' => true,
            'early_exit' => true,
            'half_day' => true,
            'overtime' => true,
            'missed_punch' => false,
            'attendance_correction_request' => false,
            'address' => $this->faker->address(),
            'emergency_contact' => $this->faker->phoneNumber(),
            'family_details' => $this->faker->text(100),
            'references' => $this->faker->text(80),
            'education' => json_encode(['degree' => 'B.Tech']),
            'experience' => json_encode(['years' => '3']),
            'skills' => 'Laravel, Vue',
            'languages' => 'English, Hindi',
            'passport' => null,
            'driving_license' => null,
            'aadhaar' => null,
            'pan' => null,
            'voter_id' => null,
            'documents' => null,
            'document_expiry' => null,
            'joining_date' => $this->faker->dateTimeBetween('-2 years', 'now')->format('Y-m-d'),
            'confirmation_date' => null,
            'promotion_date' => null,
            'transfer_date' => null,
            'increment_date' => null,
            'suspension_date' => null,
            'exit_date' => null,
            'full_final_settlement_date' => null,
            'status' => 'active',
        ];
    }
}