<?php

namespace App\Console\Commands;

use App\Models\Employee;
use App\Models\Attendance;
use Carbon\Carbon;
use Illuminate\Console\Command;

class MarkAbsentAttendance extends Command
{
    protected $signature   = 'attendance:mark-absent {date?}';
    protected $description = 'Mark all employees absent who have no attendance record for the given date (default: yesterday)';

    public function handle()
    {
        $dateInput = $this->argument('date');
        $date      = $dateInput ? Carbon::parse($dateInput) : Carbon::yesterday();
        $dateStr   = $date->toDateString();

        // Optional: skip weekends
        // if ($date->isWeekend()) {
        //     $this->info("Skipping weekends: {$dateStr}");
        //     return 0;
        // }

        $employees = Employee::where('status', 'active')
            ->whereDoesntHave('attendances', fn($q) => $q->where('date', $dateStr))
            ->get();

        $count = 0;
        foreach ($employees as $employee) {
            Attendance::create([
                'employee_id' => $employee->id,
                'date'        => $dateStr,
                'status'      => 'absent',
                'notes'       => 'Auto-marked absent (no punch)',
            ]);
            $count++;
        }

        $this->info("{$count} employees marked absent for {$dateStr}.");
        return 0;
    }
}