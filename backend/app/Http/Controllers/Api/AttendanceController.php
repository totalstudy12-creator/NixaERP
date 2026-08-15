<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Carbon\Carbon;

class AttendanceController extends Controller
{
    // ---------- Existing methods ----------

    public function index(Request $request)
    {
        $query = Attendance::with('employee');

        if ($request->filled('employee_id')) {
            $query->where('employee_id', $request->employee_id);
        }
        if ($request->filled('month')) {
            [$year, $month] = explode('-', $request->month);
            $query->whereYear('date', $year)->whereMonth('date', $month);
        }

        return $query->orderBy('date')->get()->map(function ($attendance) {
            $date = $attendance->date;
            $dateStr = $date instanceof \Carbon\Carbon ? $date->format('Y-m-d') : (string) $date;

            $employee = $attendance->employee;
            $employeeName = $employee ? $employee->first_name . ' ' . $employee->last_name : 'Unknown';
            $employeeCode = $employee ? $employee->employee_code : '';

            return [
                'id' => $attendance->id,
                'employee_id' => $attendance->employee_id,
                'date' => $dateStr,
                'status' => $attendance->status,
                'check_in' => $attendance->check_in,
                'check_out' => $attendance->check_out,
                'shift' => $attendance->shift,
                'overtime' => $attendance->overtime,
                'notes' => $attendance->notes,
                'device' => $attendance->device,
                'location' => $attendance->location,
                'employee_name' => $employeeName,
                'employee_code' => $employeeCode,
            ];
        });
    }

    public function todaySummary()
    {
        $today = now()->toDateString();
        $all = Attendance::where('date', $today)->get();

        $present = $all->whereIn('status', ['present', 'on_time', 'late', 'remote'])->count();
        $absent = $all->where('status', 'absent')->count();
        $late = $all->where('status', 'late')->count();
        $onLeave = $all->whereIn('status', ['leave', 'paid_leave'])->count();

        return response()->json([
            'present' => $present,
            'absent' => $absent,
            'late' => $late,
            'on_leave' => $onLeave,
        ]);
    }

    // ---------- NEW: Today employee attendance list ----------
    public function todayEmployees()
    {
        $today = now()->toDateString();

        $attendances = Attendance::with('employee')
            ->where('date', $today)
            ->get()
            ->map(function ($attendance) {
                $employee = $attendance->employee;

                // Calculate working hours if check-in and check-out exist
                $workingHours = null;
                if ($attendance->check_in && $attendance->check_out) {
                    try {
                        $checkIn = Carbon::createFromFormat('H:i', $attendance->check_in);
                        $checkOut = Carbon::createFromFormat('H:i', $attendance->check_out);
                        if ($checkOut->lt($checkIn)) {
                            // Handles overnight shifts
                            $checkOut->addDay();
                        }
                        $diff = $checkIn->diff($checkOut);
                        $workingHours = sprintf('%02d:%02d', $diff->h, $diff->i);
                    } catch (\Exception $e) {
                        $workingHours = null; // invalid format
                    }
                }

                return [
                    'employee_id'    => $attendance->employee_id,
                    'employee_name'  => $employee ? $employee->first_name . ' ' . $employee->last_name : 'Unknown',
                    'employee_code'  => $employee ? $employee->employee_code : '',
                    'status'         => $attendance->status,
                    'check_in'       => $attendance->check_in,
                    'check_out'      => $attendance->check_out,
                    'shift'          => $attendance->shift,
                    'overtime'       => $attendance->overtime,
                    'working_hours'  => $workingHours,
                ];
            });

        return response()->json($attendances);
    }

    // ---------- Rest of existing methods ----------

    public function store(Request $request)
    {
        $validated = $request->validate([
            'employee_id' => 'required|exists:employees,id',
            'date'        => 'required|date',
            'status'      => [
                'required',
                Rule::in([
                    'present', 'absent', 'leave', 'paid_leave', 'remote',
                    'late', 'on_time', 'half_day', 'holiday', 'time_off'
                ])
            ],
            'check_in'    => 'nullable|date_format:H:i',
            'check_out'   => 'nullable|date_format:H:i',
            'shift'       => 'nullable|string|max:100',
            'overtime'    => 'nullable|integer|min:0',
            'notes'       => 'nullable|string|max:1000',
            'device'      => 'nullable|string|max:50',
            'location'    => 'nullable|string|max:100',
        ]);

        $attendance = Attendance::updateOrCreate(
            [
                'employee_id' => $validated['employee_id'],
                'date'        => $validated['date'],
            ],
            $validated
        );

        $attendance->load('employee');
        return response()->json($this->formatAttendance($attendance), 201);
    }

    public function show($id)
    {
        $attendance = Attendance::with('employee')->findOrFail($id);
        return response()->json($this->formatAttendance($attendance));
    }

    public function update(Request $request, $id)
    {
        $attendance = Attendance::findOrFail($id);
        $validated = $request->validate([
            'status'      => [
                'sometimes',
                Rule::in([
                    'present', 'absent', 'leave', 'paid_leave', 'remote',
                    'late', 'on_time', 'half_day', 'holiday', 'time_off'
                ])
            ],
            'check_in'    => 'nullable|date_format:H:i',
            'check_out'   => 'nullable|date_format:H:i',
            'shift'       => 'nullable|string|max:100',
            'overtime'    => 'nullable|integer|min:0',
            'notes'       => 'nullable|string|max:1000',
            'device'      => 'nullable|string|max:50',
            'location'    => 'nullable|string|max:100',
        ]);

        $attendance->update($validated);
        $attendance->load('employee');
        return response()->json($this->formatAttendance($attendance));
    }

    public function destroy($id)
    {
        Attendance::destroy($id);
        return response()->noContent();
    }

    public function bulkUpdateStatus(Request $request)
    {
        $request->validate([
            'ids'    => 'required|array',
            'ids.*'  => 'exists:attendance,id',
            'status' => [
                'required',
                Rule::in([
                    'present', 'absent', 'leave', 'paid_leave', 'remote',
                    'late', 'on_time', 'half_day', 'holiday', 'time_off'
                ])
            ],
        ]);
        Attendance::whereIn('id', $request->ids)->update(['status' => $request->status]);
        return response()->json(['message' => 'Bulk status updated']);
    }

    public function bulkDelete(Request $request)
    {
        $request->validate([
            'ids'   => 'required|array',
            'ids.*' => 'exists:attendance,id',
        ]);
        Attendance::whereIn('id', $request->ids)->delete();
        return response()->json(['message' => 'Bulk deleted']);
    }

    private function formatAttendance($attendance): array
    {
        return [
            'id'            => $attendance->id,
            'employee_id'   => $attendance->employee_id,
            'date'          => $attendance->date->format('Y-m-d'),
            'status'        => $attendance->status,
            'check_in'      => $attendance->check_in,
            'check_out'     => $attendance->check_out,
            'shift'         => $attendance->shift,
            'overtime'      => $attendance->overtime,
            'notes'         => $attendance->notes,
            'device'        => $attendance->device,
            'location'      => $attendance->location,
            'employee_name' => $attendance->employee->first_name . ' ' . $attendance->employee->last_name,
            'employee_code' => $attendance->employee->employee_code,
            'employee'      => $attendance->employee->only(['id', 'first_name', 'last_name', 'employee_code']),
        ];
    }
}