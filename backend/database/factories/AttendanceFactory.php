<?php

namespace Database\Factories;

use App\Models\Attendance;
use App\Models\Employee;
use Illuminate\Database\Eloquent\Factories\Factory;

class AttendanceFactory extends Factory
{
    protected $model = Attendance::class;

    public function definition(): array
    {
        $status = $this->faker->randomElement([
            'present', 'absent', 'leave', 'remote', 'late', 'half_day', 'holiday'
        ]);

        $checkIn = null;
        $checkOut = null;
        if (in_array($status, ['present', 'remote', 'late'])) {
            $hour = $status === 'late' ? '10' : '09';
            $checkIn = $this->faker->time('H:i', $hour . ':30');
            $checkOut = $this->faker->time('H:i', '18:30');
        } elseif ($status === 'half_day') {
            $checkIn = $this->faker->time('H:i', '09:30');
            $checkOut = '13:00';
        }

        $overtime = 0;
        if (in_array($status, ['present', 'remote', 'late'])) {
            $overtime = $this->faker->numberBetween(0, 120); // 0‑2 hours in minutes
        }

        return [
            'employee_id' => Employee::factory(),
            'date' => $this->faker->dateTimeBetween('-30 days', 'now')->format('Y-m-d'),
            'status' => $status,
            'check_in' => $checkIn,
            'check_out' => $checkOut,
            'shift' => $this->faker->randomElement([
                'General Shift (09:00 - 18:00)',
                'Morning Shift (06:00 - 15:00)',
                'Evening Shift (15:00 - 00:00)',
            ]),
            'overtime' => $overtime,
            'notes' => $this->faker->optional(0.3)->sentence(3),
            'device' => $this->faker->randomElement([
                'Fingerprint', 'ESP32-001', 'ESP32-002', 'Manual'
            ]),
            'location' => $this->faker->randomElement([
                'Office', 'Remote', 'Factory', 'Warehouse'
            ]),
        ];
    }
}