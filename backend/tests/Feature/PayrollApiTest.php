<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Payroll;
use App\Models\User;
use App\Models\Role;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PayrollApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // Seed the database with roles and permissions
        $this->artisan('db:seed');
    }

    public function test_admin_user_can_access_payroll_endpoints()
    {
        // Create an admin user
        $adminRole = Role::where('name', 'Admin')->first();
        $user = User::factory()->create();
        $user->roles()->attach($adminRole);

        $this->actingAs($user);

        $employee = Employee::factory()->create();

        // Test GET /api/payroll
        $response = $this->getJson('/api/payroll');
        $response->assertStatus(200);

        // Test POST /api/payroll/run
        $runResponse = $this->postJson('/api/payroll/run', [
            'employee_id' => $employee->id,
            'pay_period'  => '2026-07',
        ]);
        $runResponse->assertStatus(201);
    }

    public function test_it_can_list_create_update_and_delete_payroll_records(): void
    {
        $employee = Employee::factory()->create();
        $this->withoutMiddleware();

        $createResponse = $this->postJson('/api/payroll', [
            'employee_id' => $employee->id,
            'pay_period' => '2026-07',
            'basic' => 50000,
            'hra' => 10000,
            'allowances' => 5000,
            'deductions' => 2000,
            'net_pay' => 63000,
            'status' => 'pending',
            'payment_method' => 'bank_transfer',
            'bank_details' => 'ACCT-123',
            'notes' => 'Seeded payroll',
        ]);

        $createResponse->assertCreated();

        $id = $createResponse->json('id');

        $updateResponse = $this->putJson("/api/payroll/{$id}", [
            'status' => 'paid',
            'notes' => 'Updated payroll',
        ]);

        $updateResponse->assertOk();

        $this->deleteJson("/api/payroll/{$id}")->assertNoContent();

        $this->assertDatabaseMissing('payrolls', ['id' => $id]);
    }

    public function test_it_can_manage_leave_shift_loan_and_payslip_records(): void
    {
        $employee = Employee::factory()->create();
        $this->withoutMiddleware();

        $leaveResponse = $this->postJson('/api/payroll/leaves', [
            'employee_id' => $employee->id,
            'start_date' => '2026-07-10',
            'end_date' => '2026-07-12',
            'type' => 'casual',
            'status' => 'approved',
            'notes' => 'Family visit',
        ]);
        $leaveResponse->assertCreated();

        $shiftResponse = $this->postJson('/api/payroll/shifts', [
            'employee_id' => $employee->id,
            'date' => '2026-07-12',
            'start_time' => '09:00',
            'end_time' => '18:00',
            'hours' => 8,
            'status' => 'approved',
        ]);
        $shiftResponse->assertCreated();

        $loanResponse = $this->postJson('/api/payroll/loans', [
            'employee_id' => $employee->id,
            'amount' => 5000,
            'installment_amount' => 1000,
            'installments' => 5,
            'status' => 'active',
        ]);
        $loanResponse->assertCreated();

        $payslipResponse = $this->postJson('/api/payroll/payslips', [
            'employee_id' => $employee->id,
            'pay_period' => '2026-07',
            'net_pay' => 60000,
            'status' => 'generated',
        ]);
        $payslipResponse->assertCreated();
    }
    
    public function test_it_can_run_payroll_for_a_pay_period(): void
    {
        $employee = Employee::factory()->create(['salary' => 50000]);
        $this->withoutMiddleware();

        $response = $this->postJson('/api/payroll/run', [
            'employee_id' => $employee->id,
            'pay_period'  => '2026-08',
        ]);

        $response->assertStatus(201);

        $this->assertDatabaseHas('payrolls', [
            'employee_id' => $employee->id,
            'pay_period' => '2026-08',
        ]);
    }
}
