<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Payroll;
use App\Models\Shift;
use App\Models\Loan;
use App\Models\Advance;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Log;
use Carbon\Carbon;
use Carbon\CarbonPeriod;

class PayrollController extends Controller
{
    protected function authorizeOrFail(string $permission)
    {
        if (!request()->user() || !request()->user()->hasPermission($permission)) {
            abort(403);
        }
    }

    // ---------------------------------------------------------------
    //  HELPER – Fetch configurable company settings
    // ---------------------------------------------------------------
    protected function getConfig($key, $default = null)
    {
        $setting = \App\Models\Setting::where('key', $key)->first();
        return $setting ? $setting->value : $default;
    }

    // ---------------------------------------------------------------
    //  PAYROLL CRUD
    // ---------------------------------------------------------------
    public function index(Request $request)
    {
        $this->authorizeOrFail('view payroll');

        $query = Payroll::with('employee');

        if ($request->filled('employee_id')) {
            $query->where('employee_id', $request->employee_id);
        }
        if ($request->filled('pay_period')) {
            $query->where('pay_period', $request->pay_period);
        }

        return $query->paginate(15)->through(function ($payroll) {
            $emp = $payroll->employee;
            return array_merge($payroll->toArray(), [
                'employee_name' => $emp ? $emp->first_name . ' ' . $emp->last_name : '',
                'employee_code' => $emp ? ($emp->employee_code ?? '') : '',
            ]);
        });
    }

    public function store(Request $request)
    {
        $this->authorizeOrFail('create payroll');

        $validated = $request->validate([
            'employee_id' => 'required|exists:employees,id',
            'pay_period'  => 'required|string',
            'basic'       => 'nullable|numeric',
            'hra'         => 'nullable|numeric',
            'da'          => 'nullable|numeric',
            'allowances'  => 'nullable|numeric',
            'incentives'  => 'nullable|numeric',
            'overtime'    => 'nullable|numeric',
            'pf'          => 'nullable|numeric',
            'esi'         => 'nullable|numeric',
            'professional_tax' => 'nullable|numeric',
            'tds'         => 'nullable|numeric',
            'gross'       => 'nullable|numeric',
            'total_deductions' => 'nullable|numeric',
            'net_pay'     => 'nullable|numeric',
            'status'      => 'nullable|string',
            'payment_method' => 'nullable|string',
            'notes'       => 'nullable|string',
        ]);

        $payroll = Payroll::updateOrCreate(
            ['employee_id' => $validated['employee_id'], 'pay_period' => $validated['pay_period']],
            $validated
        );

        return response()->json($payroll, 201);
    }

    public function show($id)
    {
        $this->authorizeOrFail('view payroll');
        return response()->json(Payroll::with('employee')->findOrFail($id));
    }

    public function update(Request $request, $id)
    {
        $this->authorizeOrFail('edit payroll');
        $payroll = Payroll::findOrFail($id);

        $validated = $request->validate([
            'status'         => 'nullable|string',
            'payment_method' => 'nullable|string',
            'notes'          => 'nullable|string',
            'loan_installment' => 'nullable|numeric',
            'advance'        => 'nullable|numeric',
            'incentives'     => 'nullable|numeric',
            'allowances'     => 'nullable|numeric',
        ]);

        $payroll->update($validated);
        return response()->json($payroll);
    }

    public function destroy($id)
    {
        $this->authorizeOrFail('delete payroll');
        Payroll::destroy($id);
        return response()->noContent();
    }

    // ---------------------------------------------------------------
    //  RUN PAYROLL – Pro‑rated basic salary (pay only for worked days)
    // ---------------------------------------------------------------
    public function runPayroll(Request $request)
    {
        $this->authorizeOrFail('run payroll');

        $validated = $request->validate([
            'employee_id' => 'required|exists:employees,id',
            'pay_period'  => 'required|string',       // e.g. 2026-07
        ]);

        $employee = Employee::findOrFail($validated['employee_id']);
        [$year, $month] = explode('-', $validated['pay_period']);

        // Attendance for the REQUESTED month
        $attendances = Attendance::where('employee_id', $employee->id)
            ->whereYear('date', $year)
            ->whereMonth('date', $month)
            ->get();

        // --- Configurable values (with defaults) ---
        $graceMinutes      = (int) ($employee->grace_period_minutes ?? $this->getConfig('grace_period_minutes', 10));
        $halfDayHours      = (float) $this->getConfig('half_day_hours', 4);
        $workingHoursPerDay = (float) $this->getConfig('working_hours_per_day', 8);

        // Shift times – use employee's assigned shift or company defaults
        $shiftStart = $employee->shift_start_time ?: $this->getConfig('default_shift_start', '09:00:00');
        $shiftEnd   = $employee->shift_end_time   ?: $this->getConfig('default_shift_end', '18:00:00');

        // Percentage / amount settings
        $hraPercent   = (float) $this->getConfig('hra_percent', 0);
        $daPercent    = (float) $this->getConfig('da_percent', 0);
        $pfPercent    = (float) $this->getConfig('pf_percent', 0);
        $esiPercent   = (float) $this->getConfig('esi_percent', 0);
        $ptAmount     = (float) $this->getConfig('professional_tax', 0);
        $tdsPercent   = (float) $this->getConfig('tds_percent', 0);
        $otMultiplier = (float) $this->getConfig('overtime_multiplier', 1.5);

        // --- Standard days = total calendar days in the month ---
        $monthDate = Carbon::createFromDate($year, $month, 1);
        $standardDaysPerMonth = $monthDate->daysInMonth;   // 28/29/30/31

        $totalWorkedSeconds   = 0;
        $totalLateMinutes     = 0;
        $totalOvertimeSeconds = 0;
        $presentDays  = 0;
        $absentDays   = 0;
        $halfDays     = 0;
        $lateDaysCount = 0;
        $overtimeDetails = [];
        $attendanceBreakdown = [];

        if ($attendances->count() > 0) {
            foreach ($attendances as $att) {
                $dateStr = $att->date instanceof Carbon ? $att->date->toDateString() : (string)$att->date;
                $status  = $att->status ?? '';

                $workedSec = $att->worked_seconds ?? 0;
                $lateSec   = $att->late_seconds   ?? 0;
                $otSec     = $att->overtime_seconds ?? 0;

                // Compute from IN/OUT times if not pre‑calculated
                if ($workedSec <= 0 && $att->in_time && $att->out_time) {
                    $inTs  = strtotime($att->in_time);
                    $outTs = strtotime($att->out_time);
                    if ($inTs && $outTs) {
                        $workedSec     = max(0, $outTs - $inTs);
                        $shiftStartTs  = strtotime($shiftStart);
                        $shiftEndTs    = strtotime($shiftEnd);
                        $graceSec      = $graceMinutes * 60;
                        $lateSec       = max(0, $inTs - ($shiftStartTs + $graceSec));
                        $otSec         = max(0, $outTs - $shiftEndTs);
                    }
                }

                $totalWorkedSeconds   += $workedSec;
                $totalLateMinutes     += $lateSec / 60;
                $totalOvertimeSeconds += $otSec;

                // Status counting
                if ($status === 'absent') {
                    $absentDays++;
                } elseif ($status === 'half_day' || ($workedSec > 0 && $workedSec < $halfDayHours * 3600)) {
                    $halfDays++;
                } elseif (in_array($status, ['present','on_time','late','remote'])) {
                    $presentDays++;
                    if ($lateSec > 0) $lateDaysCount++;
                }

                $attendanceBreakdown[$dateStr] = [
                    'status'          => $status,
                    'worked_seconds'  => $workedSec,
                    'late_seconds'    => $lateSec,
                    'overtime_seconds'=> $otSec,
                ];

                if ($otSec > 0) {
                    $overtimeDetails[] = [
                        'date'   => $dateStr,
                        'hours'  => round($otSec / 3600, 2),
                        'amount' => 0,
                    ];
                }
            }
        } else {
            // No attendance → treat all calendar days as absent
            $absentDays = $standardDaysPerMonth;
        }

        // --- Salary Components ---
        $basicSalary    = (float) ($employee->basic ?? $employee->salary ?? $employee->monthly_salary ?? 0);
        $perDaySalary   = $standardDaysPerMonth > 0 ? $basicSalary / $standardDaysPerMonth : 0;
        $perMinuteRate  = $perDaySalary / ($workingHoursPerDay * 60);
        $hourlyRate     = $employee->hourly_rate ?? ($perDaySalary / $workingHoursPerDay);
        $overtimeRate   = $employee->overtime_rate ?? ($hourlyRate * $otMultiplier);

        // ----- PRO‑RATED BASIC (pay only for worked days) -----
        $workedDays     = $presentDays + ($halfDays * 0.5);
        $basicEarning   = round($workedDays * $perDaySalary, 2);

        // HRA/DA based on the prorated basic (same percentages)
        $hra = round($basicEarning * ($hraPercent / 100), 2);
        $da  = round($basicEarning * ($daPercent  / 100), 2);
        $allowances = 0;   // manual later

        // Overtime
        $totalOvertimeHours = $totalOvertimeSeconds / 3600;
        $overtimePay = round($totalOvertimeHours * $overtimeRate, 2);
        foreach ($overtimeDetails as &$ot) {
            $ot['amount'] = round($ot['hours'] * $overtimeRate, 2);
        }

        $incentives = 0;
        $gross = $basicEarning + $hra + $da + $allowances + $overtimePay + $incentives;

        // --- Deductions ---
        // Late deduction still applies (penalty for coming late)
        $lateDeduction = round($totalLateMinutes * $perMinuteRate, 2);

        // Absent and half‑day deductions are NOT applied – they are already handled by the prorated basic.
        $absentDeduction    = 0;
        $halfDayDeduction   = 0;

        // Statutory deductions
        $pf  = round($basicEarning * ($pfPercent / 100), 2);
        $esi = round($gross * ($esiPercent / 100), 2);
        $pt  = $ptAmount;
        $tds = round($gross * ($tdsPercent / 100), 2);

        // Loan & Advance (safe retrieval)
        $loanInstallment = 0;
        $loanBalance     = 0;
        try {
            if (Schema::hasColumn('loans', 'employee_id')) {
                $loan = Loan::where('employee_id', $employee->id)
                            ->where('status', 'active')
                            ->first();
                if ($loan) {
                    $loanBalance     = $loan->balance ?? ($loan->amount - ($loan->paid_amount ?? 0));
                    $loanInstallment = $loan->installment_amount ?? 0;
                }
            }
        } catch (\Exception $e) {
            Log::warning('Loan fetch failed: ' . $e->getMessage());
        }

        $advanceDeduction = 0;
        try {
            if (Schema::hasColumn('advances', 'employee_id')) {
                $advanceDeduction = Advance::where('employee_id', $employee->id)
                                           ->where('status', 'approved')
                                           ->sum('amount');
            }
        } catch (\Exception $e) {
            Log::warning('Advance fetch failed: ' . $e->getMessage());
        }

        $totalDeductions = $lateDeduction + $absentDeduction + $halfDayDeduction
                         + $pf + $esi + $pt + $tds + $loanInstallment + $advanceDeduction;

        $netPay = round($gross - $totalDeductions, 2);

        // --- Save ---
        $payroll = Payroll::updateOrCreate(
            ['employee_id' => $employee->id, 'pay_period' => $validated['pay_period']],
            [
                'basic'            => $basicEarning,
                'hra'              => $hra,
                'da'               => $da,
                'allowances'       => $allowances,
                'incentives'       => $incentives,
                'overtime'         => $overtimePay,
                'pf'               => $pf,
                'esi'              => $esi,
                'professional_tax' => $pt,
                'tds'              => $tds,
                'gross'            => $gross,
                'total_deductions' => $totalDeductions,
                'net_pay'          => $netPay,
                'status'           => 'draft',
                'present'          => $presentDays,
                'absent'           => $absentDays,
                'leave'            => $attendances->whereIn('status', ['leave','paid_leave'])->count(),
                'holiday'          => $attendances->where('status','holiday')->count(),
                'late'             => $lateDaysCount,
                'half_day'         => $halfDays,
                'worked_hours'     => round($totalWorkedSeconds / 3600, 2),
                'worked_days'      => $workedDays,
                'overtime_hours'   => round($totalOvertimeSeconds / 3600, 2),
                'hourly_rate'      => $hourlyRate,
                'overtime_rate'    => $overtimeRate,
                'daily_rate'       => $perDaySalary,
                'late_deduction'   => $lateDeduction,
                'unpaid_leave_deduction' => 0,   // not used in prorated mode
                'loan_balance'     => $loanBalance,
                'loan_installment' => $loanInstallment,
                'advance'          => $advanceDeduction,
                'attendance_breakdown' => $attendanceBreakdown,
                'overtime_details'     => $overtimeDetails,
            ]
        );

        return response()->json($payroll, 201);
    }

    // ---------------------------------------------------------------
    //  A4 PAYSLIP
    // ---------------------------------------------------------------
    public function payslip($id)
    {
        $this->authorizeOrFail('view payroll');
        $payroll = Payroll::with('employee')->findOrFail($id);
        return response()->json([
            'payroll'  => $payroll,
            'employee' => $payroll->employee,
            'payslip'  => [
                'earnings' => [
                    'Basic'      => number_format($payroll->basic, 2),
                    'HRA'        => number_format($payroll->hra, 2),
                    'DA'         => number_format($payroll->da, 2),
                    'Allowances' => number_format($payroll->allowances, 2),
                    'Overtime'   => number_format($payroll->overtime, 2),
                    'Gross'      => number_format($payroll->gross, 2),
                ],
                'deductions' => [
                    'PF'              => number_format($payroll->pf, 2),
                    'ESI'             => number_format($payroll->esi, 2),
                    'Professional Tax'=> number_format($payroll->professional_tax, 2),
                    'TDS'             => number_format($payroll->tds, 2),
                    'Late Deduction'  => number_format($payroll->late_deduction, 2),
                    'Unpaid Leave'    => number_format($payroll->unpaid_leave_deduction, 2),
                    'Total Deductions'=> number_format($payroll->total_deductions, 2),
                ],
                'net_pay' => number_format($payroll->net_pay, 2),
            ]
        ]);
    }

    // ---------------------------------------------------------------
    //  SHIFTS CRUD
    // ---------------------------------------------------------------
    public function shifts(Request $request)
    {
        $query = Shift::with('employee');
        if ($request->filled('employee_id')) {
            $query->where('employee_id', $request->employee_id);
        }
        return $query->latest()->get();
    }

    public function storeShift(Request $request)
    {
        $data = $request->validate([
            'employee_id' => 'required|exists:employees,id',
            'date'        => 'required|date',
            'start_time'  => 'required',
            'end_time'    => 'required',
            'hours'       => 'nullable|numeric',
            'status'      => 'nullable|string',
            'notes'       => 'nullable|string',
        ]);
        $shift = Shift::create($data);
        return response()->json($shift, 201);
    }

    public function showShift($id)
    {
        return response()->json(Shift::with('employee')->findOrFail($id));
    }

    public function updateShift(Request $request, $id)
    {
        $shift = Shift::findOrFail($id);
        $data = $request->validate([
            'status' => 'nullable|string',
            'notes'  => 'nullable|string',
            'hours'  => 'nullable|numeric',
        ]);
        $shift->update($data);
        return response()->json($shift);
    }

    public function destroyShift($id)
    {
        Shift::destroy($id);
        return response()->noContent();
    }

    // ---------------------------------------------------------------
    //  LOANS CRUD
    // ---------------------------------------------------------------
    public function loans(Request $request)
    {
        $query = Loan::with('employee');
        if ($request->filled('employee_id')) {
            $query->where('employee_id', $request->employee_id);
        }
        return $query->latest()->get();
    }

    public function storeLoan(Request $request)
    {
        $data = $request->validate([
            'employee_id'      => 'required|exists:employees,id',
            'amount'           => 'required|numeric|min:0',
            'installment_amount' => 'nullable|numeric|min:0',
            'installments'     => 'nullable|integer|min:0',
            'status'           => 'nullable|string',
            'notes'            => 'nullable|string',
        ]);
        $loan = Loan::create($data);
        return response()->json($loan, 201);
    }

    public function showLoan($id)
    {
        return response()->json(Loan::with('employee')->findOrFail($id));
    }

    public function updateLoan(Request $request, $id)
    {
        $loan = Loan::findOrFail($id);
        $data = $request->validate([
            'status' => 'nullable|string',
            'notes'  => 'nullable|string',
        ]);
        $loan->update($data);
        return response()->json($loan);
    }

    public function destroyLoan($id)
    {
        Loan::destroy($id);
        return response()->noContent();
    }

    // ---------------------------------------------------------------
    //  ADVANCES CRUD
    // ---------------------------------------------------------------
    public function advances(Request $request)
    {
        $query = Advance::with('employee');
        if ($request->filled('employee_id')) {
            $query->where('employee_id', $request->employee_id);
        }
        return $query->latest()->get();
    }

    public function storeAdvance(Request $request)
    {
        $data = $request->validate([
            'employee_id' => 'required|exists:employees,id',
            'advance_no'  => 'nullable|string|max:50',
            'amount'      => 'required|numeric|min:0',
            'request_date'=> 'nullable|date',
            'payment_date'=> 'nullable|date',
            'payment_method' => 'nullable|string|max:50',
            'transaction_reference' => 'nullable|string|max:100',
            'status'      => 'nullable|string|max:20',
            'approved_by' => 'nullable|integer|exists:employees,id',
            'reason'      => 'nullable|string',
            'remarks'     => 'nullable|string',
            'attachment'  => 'nullable|string|max:255',
        ]);

        if (empty($data['advance_no'])) {
            $data['advance_no'] = 'ADV-' . str_pad(Advance::max('id') + 1, 5, '0', STR_PAD_LEFT);
        }
        if (auth()->check()) {
            $data['created_by'] = auth()->id();
        }

        $advance = Advance::create($data);
        return response()->json($advance, 201);
    }

    public function showAdvance($id)
    {
        return response()->json(Advance::with('employee', 'approvedBy')->findOrFail($id));
    }

    public function updateAdvance(Request $request, $id)
    {
        $advance = Advance::findOrFail($id);
        $data = $request->validate([
            'status'         => 'nullable|string|max:20',
            'remarks'        => 'nullable|string',
            'payment_date'   => 'nullable|date',
            'payment_method' => 'nullable|string|max:50',
            'transaction_reference' => 'nullable|string|max:100',
            'approved_by'    => 'nullable|integer|exists:employees,id',
        ]);

        if (in_array($request->status, ['approved', 'rejected']) && auth()->check()) {
            $data['approved_by'] = auth()->id();
        }
        $data['updated_by'] = auth()->check() ? auth()->id() : null;
        $advance->update($data);
        return response()->json($advance);
    }

    public function destroyAdvance($id)
    {
        Advance::destroy($id);
        return response()->noContent();
    }

    // ---------------------------------------------------------------
    //  PAYSLIPS (reuse payroll)
    // ---------------------------------------------------------------
    public function payslips(Request $request)      { return $this->index($request); }
    public function storePayslip(Request $request)   { return $this->store($request); }
    public function showPayslip($id)                { return $this->show($id); }
    public function updatePayslip(Request $request, $id) { return $this->update($request, $id); }
    public function destroyPayslip($id)             { return $this->destroy($id); }
}