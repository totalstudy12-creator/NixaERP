<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AttendanceApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_can_list_attendance_records(): void
    {
        $employee = Employee::factory()->create();
        Attendance::factory()->create([
            'employee_id' => $employee->id,
            'date' => '2026-07-12',
            'status' => 'present',
        ]);

        $this->withoutMiddleware();

        $response = $this->getJson('/api/attendance');

        $response->assertOk()
            ->assertJsonStructure([
                'data' => [
                    ['id', 'employee_id', 'date', 'status', 'employee_name'],
                ],
            ]);
    }

    public function test_it_can_create_update_and_delete_an_attendance_record(): void
    {
        $employee = Employee::factory()->create();
        $this->withoutMiddleware();

        $createResponse = $this->postJson('/api/attendance', [
            'employee_id' => $employee->id,
            'date' => '2026-07-13',
            'status' => 'present',
            'check_in' => '09:00',
            'check_out' => '17:00',
            'notes' => 'On time',
        ]);

        $createResponse->assertCreated()
            ->assertJsonPath('employee_id', $employee->id)
            ->assertJsonPath('status', 'present');

        $id = $createResponse->json('id');

        $response = $this->putJson("/api/attendance/{$id}", [
            'status' => 'remote',
            'notes' => 'Remote day',
        ]);

        $response->assertOk()
            ->assertJsonPath('status', 'remote');

        $this->deleteJson("/api/attendance/{$id}")->assertNoContent();

        $this->assertDatabaseMissing('attendance', ['id' => $id]);
    }
}
