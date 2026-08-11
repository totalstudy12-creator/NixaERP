import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  FiRefreshCw, FiDownload, FiCheckCircle, FiXCircle,
  FiUser, FiUsers, FiClock, FiDollarSign, FiCalendar,
  FiBriefcase, FiMapPin, FiSmartphone, FiEye, FiX,
  FiFileText, FiPrinter, FiAward, FiTrendingUp, FiPlus,
  FiAlertTriangle, FiPlay, FiLock, FiEdit, FiTrash2, FiLoader,
  FiRotateCcw
} from 'react-icons/fi';
import { ModernDataTable } from '../components/ModernDataTable';
import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';

// ---------- Types ----------
type PayrollStatus = 'draft' | 'generated' | 'approved' | 'rejected' | 'paid' | 'pending';

interface Employee {
  id: number;
  name: string;
  email?: string;
  employee_code?: string;
  department?: string;
  designation?: string;
  salary?: number;
  status?: string;
}

interface AttendanceSummary {
  present: number;
  absent: number;
  leave: number;
  holiday: number;
  late: number;
  half_day: number;
}

interface PayrollRecord {
  id: number;
  employee_id: number;
  employee_name: string;
  employee_code?: string;
  pay_period: string;
  basic: number;
  hra: number;
  da: number;
  allowances: number;
  incentives: number;
  overtime: number;
  pf: number;
  esi: number;
  professional_tax: number;
  tds: number;
  gross: number;
  total_deductions: number;
  net_pay: number;
  status: PayrollStatus;
  payment_method: string;
  bank_details?: string;
  notes: string;
  created_at?: string;
  updated_at?: string;
  present?: number;
  absent?: number;
  leave?: number;
  holiday?: number;
  late?: number;
  half_day?: number;
  festival_bonus?: number;
  performance_bonus?: number;
  other_bonus?: number;
  loan_balance?: number;
  loan_installment?: number;
  advance?: number;
  worked_hours?: number;
  overtime_hours?: number;
  overtime_rate?: number;
  hourly_rate?: number;
  daily_rate?: number;
  late_deduction?: number;
  unpaid_leave_deduction?: number;
  attendance_breakdown?: Record<string, {
    status: string;
    worked_seconds: number;
    late_seconds: number;
    early_seconds: number;
    overtime_seconds: number;
  }>;
  overtime_details?: { date: string; hours: number; amount: number }[];
}

// ---------- Helpers ----------
const safeNumber = (val: any): number => {
  if (val === null || val === undefined) return 0;
  const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/,/g, ''));
  return isNaN(num) ? 0 : num;
};

const formatCurrency = (amount: any): string => {
  const num = safeNumber(amount);
  return `₹${num.toFixed(2)}`;
};

const getStatusColor = (status: PayrollStatus): string => {
  const map: Record<PayrollStatus, string> = {
    draft: 'bg-gray-200 text-gray-700',
    generated: 'bg-blue-100 text-blue-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    paid: 'bg-emerald-100 text-emerald-800',
    pending: 'bg-orange-100 text-orange-800',
  };
  return map[status] || 'bg-gray-200 text-gray-700';
};

const getStatusLabel = (status: PayrollStatus): string => {
  const map: Record<PayrollStatus, string> = {
    draft: 'Draft',
    generated: 'Generated',
    approved: 'Approved',
    rejected: 'Rejected',
    paid: 'Paid',
    pending: 'Pending',
  };
  return map[status] || 'Draft';
};

const printPayslip = (record: PayrollRecord) => {
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return;

  const totalBonus = (record.festival_bonus || 0) + (record.performance_bonus || 0) + (record.other_bonus || 0);
  const totalHours = (record.worked_hours ?? 0) + (record.overtime_hours ?? 0);

  const html = `
    <html>
    <head>
      <title>Payslip – ${record.employee_name}</title>
      <style>
        body { font-family: Arial, sans-serif; margin:0; padding:20px; color:#1e293b; }
        .page { max-width:210mm; margin:auto; border:1px solid #e2e8f0; padding:30px; }
        .header { text-align:center; border-bottom:2px solid #0f172a; padding-bottom:10px; margin-bottom:20px; }
        .header h1 { margin:0; font-size:24px; }
        .header p { margin:5px 0; font-size:14px; color:#475569; }
        .section { margin-bottom:20px; }
        .section-title { font-size:16px; font-weight:bold; border-bottom:1px solid #cbd5e1; padding-bottom:4px; margin-bottom:10px; }
        table { width:100%; border-collapse:collapse; margin-bottom:15px; }
        th, td { border:1px solid #cbd5e1; padding:8px; text-align:left; font-size:13px; }
        th { background:#f1f5f9; font-weight:600; }
        .net-pay { font-size:20px; font-weight:bold; text-align:right; margin-top:15px; padding-top:10px; border-top:2px solid #0f172a; }
        .two-col { display:flex; gap:20px; }
        .two-col > div { flex:1; }
        .attendance-grid { display:flex; flex-wrap:wrap; gap:10px; margin-top:10px; }
        .att-item { text-align:center; min-width:60px; }
        .att-value { font-size:18px; font-weight:bold; }
        .att-label { font-size:11px; color:#64748b; }
        @media print { body { -webkit-print-color-adjust:exact; } }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="header">
          <h1>PAYSLIP</h1>
          <p><strong>${record.employee_name}</strong> (${record.employee_code})</p>
          <p>Pay Period: ${record.pay_period}</p>
          <p>Status: ${getStatusLabel(record.status)} &nbsp;|&nbsp; Payment: ${record.payment_method || 'N/A'}</p>
        </div>

        <!-- Attendance Summary -->
        <div class="section">
          <div class="section-title">📋 Attendance Summary</div>
          <div class="attendance-grid">
            <div class="att-item"><div class="att-value">${record.present ?? 0}</div><div class="att-label">Present</div></div>
            <div class="att-item"><div class="att-value">${record.absent ?? 0}</div><div class="att-label">Absent</div></div>
            <div class="att-item"><div class="att-value">${record.leave ?? 0}</div><div class="att-label">Leave</div></div>
            <div class="att-item"><div class="att-value">${record.holiday ?? 0}</div><div class="att-label">Holiday</div></div>
            <div class="att-item"><div class="att-value">${record.late ?? 0}</div><div class="att-label">Late</div></div>
            <div class="att-item"><div class="att-value">${record.half_day ?? 0}</div><div class="att-label">Half Day</div></div>
            <div class="att-item"><div class="att-value">${totalHours.toFixed(1)}h</div><div class="att-label">Total Hours</div></div>
            <div class="att-item"><div class="att-value">${record.worked_hours ?? 0}h</div><div class="att-label">Worked</div></div>
            <div class="att-item"><div class="att-value">${record.overtime_hours ?? 0}h</div><div class="att-label">Overtime</div></div>
          </div>
        </div>

        <!-- Earnings & Deductions side by side -->
        <div class="two-col">
          <div>
            <div class="section-title">💰 Earnings</div>
            <table>
              <tr><td>Basic</td><td>${formatCurrency(record.basic)}</td></tr>
              <tr><td>HRA</td><td>${formatCurrency(record.hra)}</td></tr>
              <tr><td>DA</td><td>${formatCurrency(record.da)}</td></tr>
              <tr><td>Allowances</td><td>${formatCurrency(record.allowances)}</td></tr>
              <tr><td>Incentives</td><td>${formatCurrency(record.incentives)}</td></tr>
              <tr><td>Overtime</td><td>${formatCurrency(record.overtime)}</td></tr>
              <tr><td>Bonus</td><td>${formatCurrency(totalBonus)}</td></tr>
              <tr style="font-weight:bold; background:#f8fafc;"><td>GROSS</td><td>${formatCurrency(record.gross)}</td></tr>
            </table>
          </div>
          <div>
            <div class="section-title">📉 Deductions</div>
            <table>
              <tr><td>PF</td><td>${formatCurrency(record.pf)}</td></tr>
              <tr><td>ESI</td><td>${formatCurrency(record.esi)}</td></tr>
              <tr><td>Professional Tax</td><td>${formatCurrency(record.professional_tax)}</td></tr>
              <tr><td>TDS</td><td>${formatCurrency(record.tds)}</td></tr>
              <tr><td>Late Deduction</td><td>${formatCurrency(record.late_deduction)}</td></tr>
              <tr><td>Unpaid Leave</td><td>${formatCurrency(record.unpaid_leave_deduction)}</td></tr>
              <tr><td>Loan Installment</td><td>${formatCurrency(record.loan_installment)}</td></tr>
              <tr><td>Advance</td><td>${formatCurrency(record.advance)}</td></tr>
              <tr style="font-weight:bold; background:#f8fafc;"><td>TOTAL DEDUCTIONS</td><td>${formatCurrency(record.total_deductions)}</td></tr>
            </table>
          </div>
        </div>

        <!-- Overtime Details if any -->
        ${(record.overtime_details?.length ?? 0) > 0 ? `
        <div class="section">
          <div class="section-title">⏱️ Overtime Details</div>
          <table>
            <tr><th>Date</th><th>Hours</th><th>Amount</th></tr>
            ${record.overtime_details!.map(ot => `<tr><td>${ot.date}</td><td>${ot.hours}</td><td>${formatCurrency(ot.amount)}</td></tr>`).join('')}
          </table>
        </div>` : ''}

        <!-- Loan / Advance summary -->
        ${((record.loan_balance ?? 0) > 0 || (record.loan_installment ?? 0) > 0 || (record.advance ?? 0) > 0) ? `
        <div class="section">
          <div class="section-title">🏦 Loan & Advance</div>
          <table>
            <tr><td>Loan Balance</td><td>${formatCurrency(record.loan_balance)}</td></tr>
            <tr><td>Loan Installment</td><td>${formatCurrency(record.loan_installment)}</td></tr>
            <tr><td>Advance Deduction</td><td>${formatCurrency(record.advance)}</td></tr>
          </table>
        </div>` : ''}

        <!-- Rates -->
        <div class="section">
          <div class="section-title">📐 Rates</div>
          <table>
            <tr><td>Daily Rate</td><td>${formatCurrency(record.daily_rate)}</td></tr>
            <tr><td>Hourly Rate</td><td>${formatCurrency(record.hourly_rate)}</td></tr>
            <tr><td>Overtime Rate</td><td>${formatCurrency(record.overtime_rate)} / hr</td></tr>
          </table>
        </div>

        <!-- Net Pay -->
        <div class="net-pay">Net Pay: ${formatCurrency(record.net_pay)}</div>

        ${record.notes ? `<p style="margin-top:15px; font-style:italic; color:#475569;">Notes: ${record.notes}</p>` : ''}
      </div>
      <script>window.print(); window.close();</script>
    </body></html>
  `;
  win.document.write(html);
  win.document.close();
};

// ---------- Component ----------
export function PayrollPage() {
  const [items, setItems] = useState<PayrollRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [generating, setGenerating] = useState(false);
  const [regeneratingIds, setRegeneratingIds] = useState<number[]>([]);

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | ''>('');
  const [payrollMonth, setPayrollMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [attendanceSummary, setAttendanceSummary] = useState<AttendanceSummary | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  // Edit modal state
  const [editingRecord, setEditingRecord] = useState<PayrollRecord | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const { showSuccess, showError } = useNotification();

  // ---------- Load employees ----------
  const loadEmployees = useCallback(async () => {
    try {
      const response = await apiClient.getEmployees?.() || [];
      const data = Array.isArray(response) ? response : response.data || [];
      const mapped = data.map((emp: any) => ({
        id: emp.id,
        name: emp.name || [emp.first_name, emp.last_name].filter(Boolean).join(' ') || 'Unknown',
        employee_code: emp.employee_code,
        department: emp.department?.name || emp.department || '',
        designation: emp.designation?.title || emp.designation?.name || emp.designation || '',
        salary: safeNumber(emp.basic ?? emp.salary ?? 0),
      }));
      setEmployees(mapped);
    } catch (err) {
      console.error('Failed to load employees', err);
    }
  }, []);

  // ---------- Load payroll records ----------
  const loadPayrolls = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPermissionDenied(false);
    try {
      const response = await apiClient.getPayrolls?.() || [];
      const data = Array.isArray(response) ? response : response.data || [];
      const parsed = data.map((rec: any) => ({
        ...rec,
        basic: safeNumber(rec.basic),
        hra: safeNumber(rec.hra),
        da: safeNumber(rec.da),
        allowances: safeNumber(rec.allowances),
        incentives: safeNumber(rec.incentives),
        overtime: safeNumber(rec.overtime),
        pf: safeNumber(rec.pf),
        esi: safeNumber(rec.esi),
        professional_tax: safeNumber(rec.professional_tax),
        tds: safeNumber(rec.tds),
        gross: safeNumber(rec.gross),
        total_deductions: safeNumber(rec.total_deductions),
        net_pay: safeNumber(rec.net_pay),
        festival_bonus: safeNumber(rec.festival_bonus),
        performance_bonus: safeNumber(rec.performance_bonus),
        other_bonus: safeNumber(rec.other_bonus),
        loan_balance: safeNumber(rec.loan_balance),
        loan_installment: safeNumber(rec.loan_installment),
        advance: safeNumber(rec.advance),
        worked_hours: safeNumber(rec.worked_hours),
        overtime_hours: safeNumber(rec.overtime_hours),
        overtime_rate: safeNumber(rec.overtime_rate),
        hourly_rate: safeNumber(rec.hourly_rate),
        daily_rate: safeNumber(rec.daily_rate),
        late_deduction: safeNumber(rec.late_deduction),
        unpaid_leave_deduction: safeNumber(rec.unpaid_leave_deduction),
      }));
      setItems(parsed);
      setLastUpdated(new Date());
    } catch (err: any) {
      console.error('Payroll fetch error', err);
      if (err.response?.status === 403 || err.message?.includes('403')) {
        setPermissionDenied(true);
        setError('You do not have permission to view payroll records.');
        showError('Permission Denied', 'You are not authorized to access payroll data.');
      } else {
        setError(err.message || 'Could not load payroll records.');
        showError('Failed', 'Could not load payroll records.');
      }
    } finally {
      setLoading(false);
    }
  }, [showError]);

  // ---------- Initial load & reload on filter change ----------
  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  useEffect(() => {
    loadPayrolls();
  }, [loadPayrolls, selectedEmployeeId, payrollMonth]);

  // ---------- Load attendance summary for selected employee/month ----------
  useEffect(() => {
    setAttendanceSummary(null);
    setAttendanceLoading(true);

    if (!selectedEmployeeId || !payrollMonth) {
      setAttendanceLoading(false);
      return;
    }

    let cancelled = false;
    const fetchAttendance = async () => {
      try {
        const query = `employee_id=${selectedEmployeeId}&month=${payrollMonth}`;
        const data = await apiClient.getAttendance(query);
        const records = Array.isArray(data) ? data : data?.data ?? [];

        let present = 0, absent = 0, leave = 0, holiday = 0, late = 0, half_day = 0;
        records.forEach((rec: any) => {
          const status = rec.status;
          if (['present', 'on_time', 'late', 'remote'].includes(status)) present++;
          else if (status === 'absent') absent++;
          else if (status === 'leave' || status === 'paid_leave') leave++;
          else if (status === 'holiday') holiday++;
          else if (status === 'half_day') half_day++;
          if (status === 'late') late++;
        });

        if (!cancelled) {
          setAttendanceSummary({ present, absent, leave, holiday, late, half_day });
        }
      } catch (err) {
        console.warn('Could not load attendance summary', err);
        if (!cancelled) setAttendanceSummary(null);
      } finally {
        if (!cancelled) setAttendanceLoading(false);
      }
    };

    fetchAttendance();
    return () => { cancelled = true; };
  }, [selectedEmployeeId, payrollMonth]);

  // ---------- Filtered list ----------
  const filteredItems = useMemo(() => {
    let filtered = items;
    if (selectedEmployeeId) {
      filtered = filtered.filter(i => i.employee_id === selectedEmployeeId);
    }
    if (payrollMonth) {
      filtered = filtered.filter(i => i.pay_period === payrollMonth);
    }
    return filtered;
  }, [items, selectedEmployeeId, payrollMonth]);

  const selectedRecord = filteredItems.length > 0 ? filteredItems[0] : null;

  // ---------- Handlers ----------
  const handleGeneratePayroll = useCallback(async () => {
    if (!selectedEmployeeId || !payrollMonth) {
      showError('Missing data', 'Please select an employee and month.');
      return;
    }
    if (attendanceLoading) {
      showError('Please wait', 'Attendance data is still loading.');
      return;
    }
    setGenerating(true);
    try {
      await apiClient.runPayroll?.({
        employee_id: selectedEmployeeId,
        pay_period: payrollMonth,
      });
      showSuccess('Payroll Generated', `Payroll for ${payrollMonth} has been created.`);
      await loadPayrolls();
    } catch (err: any) {
      const msg = err.response?.status === 403
        ? 'You do not have permission to run payroll.'
        : err.message || 'Could not generate payroll.';
      showError('Generation failed', msg);
    } finally {
      setGenerating(false);
    }
  }, [selectedEmployeeId, payrollMonth, attendanceLoading, loadPayrolls, showSuccess, showError]);

  // Regenerate for any record (used by row button)
  const handleRegenerate = async (record: PayrollRecord) => {
    setRegeneratingIds(prev => [...prev, record.id]);
    try {
      await apiClient.runPayroll?.({
        employee_id: record.employee_id,
        pay_period: record.pay_period,
      });
      showSuccess('Regenerated', `Payroll for ${record.employee_name} (${record.pay_period}) has been updated.`);
      await loadPayrolls();
    } catch (err: any) {
      showError('Regeneration failed', err.message || 'Could not regenerate payroll.');
    } finally {
      setRegeneratingIds(prev => prev.filter(id => id !== record.id));
    }
  };

  const handleMarkAsPaid = useCallback(async () => {
    if (!selectedRecord) return;
    if (selectedRecord.status === 'paid') {
      showError('Already paid', 'This payroll has already been marked as paid.');
      return;
    }
    try {
      await apiClient.updatePayroll?.(selectedRecord.id, { status: 'paid' });
      showSuccess('Marked as Paid', `Payroll for ${selectedRecord.employee_name} is now paid.`);
      await loadPayrolls();
    } catch (err: any) {
      const msg = err.response?.status === 403
        ? 'You do not have permission to update payroll.'
        : err.message || 'Failed to mark as paid.';
      showError('Failed', msg);
    }
  }, [selectedRecord, loadPayrolls, showSuccess, showError]);

  const handleEditSave = async () => {
    if (!editingRecord) return;
    try {
      await apiClient.updatePayroll?.(editingRecord.id, editingRecord);
      showSuccess('Saved', 'Changes saved.');
      setIsEditModalOpen(false);
      loadPayrolls();
    } catch (err: any) {
      showError('Failed', err.message || 'Could not save.');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this payroll record?')) return;
    try {
      await apiClient.deletePayroll?.(id);
      showSuccess('Deleted', 'Payroll record deleted.');
      loadPayrolls();
    } catch (err: any) {
      showError('Failed', err.message || 'Could not delete.');
    }
  };

  const handleDownloadPayslip = useCallback(() => {
    if (!selectedRecord) return;
    showSuccess('Payslip', 'Download will start shortly.');
  }, [selectedRecord, showSuccess]);

  // ---------- Render employee details ----------
  const renderEmployeeDetails = useCallback(() => {
    if (permissionDenied) {
      return (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
          <FiLock size={48} className="mx-auto text-rose-400 mb-3" />
          <h2 className="text-xl font-semibold text-rose-600">Access Denied</h2>
          <p className="mt-1 text-slate-600">You don't have permission to view payroll details.</p>
          <p className="text-sm text-slate-400 mt-2">Please contact your administrator.</p>
        </div>
      );
    }

    if (!selectedRecord && !selectedEmployeeId) {
      return (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
          <FiUser size={48} className="mx-auto text-slate-300 mb-3" />
          <p className="text-lg font-medium">Select an employee and month</p>
          <p className="text-sm">The payroll details will appear here.</p>
        </div>
      );
    }

    if (!selectedRecord) {
      const emp = employees.find(e => e.id === selectedEmployeeId);
      return (
        <div className="bg-white rounded-xl border border-slate-200 p-6 text-center">
          <FiAlertTriangle size={48} className="mx-auto text-amber-500 mb-3" />
          <h2 className="text-lg font-semibold text-slate-800">
            No payroll record for {emp?.name || 'Employee'} in {payrollMonth}
          </h2>
          <p className="text-slate-500 mt-1">
            Click below to auto‑generate payroll based on attendance data.
          </p>
          {attendanceLoading ? (
            <div className="flex justify-center mt-3">
              <FiLoader className="animate-spin text-slate-400" size={24} />
            </div>
          ) : attendanceSummary ? (
            <div className="flex justify-center gap-4 mt-3 text-sm">
              <span className="text-emerald-600"><strong>{attendanceSummary.present}</strong> Present</span>
              <span className="text-rose-600"><strong>{attendanceSummary.absent}</strong> Absent</span>
              <span className="text-amber-600"><strong>{attendanceSummary.late}</strong> Late</span>
              <span className="text-indigo-600"><strong>{attendanceSummary.half_day}</strong> Half‑day</span>
              <span className="text-yellow-600"><strong>{attendanceSummary.leave}</strong> Leave</span>
            </div>
          ) : (
            <p className="text-xs text-slate-400 mt-2">Attendance data not available.</p>
          )}
          <button
            onClick={handleGeneratePayroll}
            disabled={generating || attendanceLoading}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-emerald-700 disabled:opacity-50"
          >
            <FiPlay size={16} />
            {generating ? 'Generating...' : 'Generate Payroll'}
          </button>
        </div>
      );
    }

    const record = selectedRecord;
    const totalHours = (record.worked_hours ?? 0) + (record.overtime_hours ?? 0);

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">{record.employee_name}</h2>
            <div className="flex flex-wrap gap-3 text-sm text-slate-500 mt-1">
              <span><span className="font-medium">Code:</span> {record.employee_code}</span>
              <span><span className="font-medium">Department:</span> {employees.find(e => e.id === record.employee_id)?.department || '—'}</span>
              <span><span className="font-medium">Designation:</span> {employees.find(e => e.id === record.employee_id)?.designation || '—'}</span>
              <span><span className="font-medium">Period:</span> {record.pay_period}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleMarkAsPaid}
              disabled={record.status === 'paid'}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                record.status === 'paid'
                  ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                  : 'bg-emerald-500 text-white hover:bg-emerald-600'
              }`}
            >
              <FiCheckCircle size={16} />
              {record.status === 'paid' ? 'Already Paid' : 'Mark as Paid'}
            </button>
            <button onClick={handleDownloadPayslip} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 transition">
              <FiDownload size={16} /> Payslip
            </button>
            <button onClick={() => printPayslip(record)} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition">
              <FiPrinter size={16} /> Print
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(record.status)}`}>
            {getStatusLabel(record.status)}
          </span>
          {(record.worked_hours ?? 0) > 0 || (record.overtime_hours ?? 0) > 0 ? (
            <span className="text-xs text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
              {record.worked_hours ?? 0}h worked · {record.overtime_hours ?? 0}h OT
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <FiTrendingUp className="text-emerald-600" /> Earnings
              </h3>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span>Basic</span><span className="font-medium">{formatCurrency(record.basic)}</span></div>
                <div className="flex justify-between"><span>HRA</span><span className="font-medium">{formatCurrency(record.hra)}</span></div>
                <div className="flex justify-between"><span>DA</span><span className="font-medium">{formatCurrency(record.da)}</span></div>
                <div className="flex justify-between"><span>Allowances</span><span className="font-medium">{formatCurrency(record.allowances)}</span></div>
                <div className="flex justify-between"><span>Incentives</span><span className="font-medium">{formatCurrency(record.incentives)}</span></div>
                <div className="flex justify-between"><span>Overtime</span><span className="font-medium">{formatCurrency(record.overtime)}</span></div>
                <div className="flex justify-between"><span>Bonus</span><span className="font-medium">{formatCurrency((record.festival_bonus || 0) + (record.performance_bonus || 0) + (record.other_bonus || 0))}</span></div>
                <div className="border-t pt-2 mt-1 font-bold flex justify-between text-slate-800">
                  <span>Gross Salary</span>
                  <span>{formatCurrency(record.gross)}</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <FiXCircle className="text-rose-600" /> Deductions
              </h3>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span>PF</span><span className="font-medium">{formatCurrency(record.pf)}</span></div>
                <div className="flex justify-between"><span>ESI</span><span className="font-medium">{formatCurrency(record.esi)}</span></div>
                <div className="flex justify-between"><span>Professional Tax</span><span className="font-medium">{formatCurrency(record.professional_tax)}</span></div>
                <div className="flex justify-between"><span>TDS</span><span className="font-medium">{formatCurrency(record.tds)}</span></div>
                <div className="flex justify-between"><span>Late Deduction</span><span className="font-medium text-rose-600">{formatCurrency(record.late_deduction)}</span></div>
                <div className="flex justify-between"><span>Unpaid Leave</span><span className="font-medium text-rose-600">{formatCurrency(record.unpaid_leave_deduction)}</span></div>
                <div className="flex justify-between"><span>Loan Installment</span><span className="font-medium">{formatCurrency(record.loan_installment)}</span></div>
                <div className="flex justify-between"><span>Advance</span><span className="font-medium">{formatCurrency(record.advance)}</span></div>
                <div className="border-t pt-2 mt-1 font-bold flex justify-between text-slate-800">
                  <span>Total Deductions</span>
                  <span>{formatCurrency(record.total_deductions)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200">
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold text-emerald-800">Net Pay</span>
                <span className="text-2xl font-bold text-emerald-700">{formatCurrency(record.net_pay)}</span>
              </div>
              <div className="text-xs text-emerald-600 mt-1">
                Payment: {record.payment_method} • {record.bank_details || 'No bank details'}
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <h3 className="font-semibold text-slate-700 mb-2 flex items-center gap-2">
                <FiClock className="text-amber-600" /> Work & Overtime
              </h3>
              <div className="text-sm space-y-1.5">
                <div className="flex justify-between"><span>Worked Hours</span><span className="font-medium">{record.worked_hours ?? 0} hrs</span></div>
                <div className="flex justify-between"><span>Overtime Hours</span><span className="font-medium text-amber-600">{record.overtime_hours ?? 0} hrs</span></div>
                <div className="flex justify-between border-t pt-1.5 mt-1.5">
                  <span className="font-semibold">Total Working Hours</span>
                  <span className="font-bold text-slate-800">{totalHours.toFixed(2)} hrs</span>
                </div>
                <div className="flex justify-between"><span>Overtime Rate</span><span className="font-medium">{formatCurrency(record.overtime_rate)} / hr</span></div>
                <div className="flex justify-between"><span>Hourly Rate</span><span className="font-medium">{formatCurrency(record.hourly_rate)} / hr</span></div>
                <div className="flex justify-between"><span>Daily Rate</span><span className="font-medium">{formatCurrency(record.daily_rate)} / day</span></div>
              </div>
            </div>

            {attendanceSummary && (
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <h3 className="font-semibold text-slate-700 mb-2 flex items-center gap-2">
                  <FiUsers className="text-blue-600" /> Attendance Summary
                </h3>
                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                  <div><span className="block text-green-600 font-bold">{attendanceSummary.present}</span><span className="text-xs text-slate-500">Present</span></div>
                  <div><span className="block text-red-600 font-bold">{attendanceSummary.absent}</span><span className="text-xs text-slate-500">Absent</span></div>
                  <div><span className="block text-yellow-600 font-bold">{attendanceSummary.leave}</span><span className="text-xs text-slate-500">Leave</span></div>
                  <div><span className="block text-pink-600 font-bold">{attendanceSummary.holiday}</span><span className="text-xs text-slate-500">Holiday</span></div>
                  <div><span className="block text-orange-600 font-bold">{attendanceSummary.late}</span><span className="text-xs text-slate-500">Late</span></div>
                  <div><span className="block text-indigo-600 font-bold">{attendanceSummary.half_day}</span><span className="text-xs text-slate-500">Half day</span></div>
                </div>
              </div>
            )}

            {(record.overtime_details?.length ?? 0) > 0 && (
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <h3 className="font-semibold text-slate-700 mb-2 flex items-center gap-2">
                  <FiClock className="text-amber-600" /> Overtime Details
                </h3>
                <div className="space-y-1 text-sm">
                  {record.overtime_details!.map((ot, idx) => (
                    <div key={idx} className="flex justify-between border-b border-slate-100 pb-1">
                      <span>{ot.date}</span>
                      <span>{ot.hours} hrs</span>
                      <span className="font-medium">{formatCurrency(ot.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {((record.loan_balance ?? 0) > 0 || (record.loan_installment ?? 0) > 0 || (record.advance ?? 0) > 0) && (
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <h3 className="font-semibold text-slate-700 mb-2">Loan & Advance</h3>
                <div className="text-sm space-y-1">
                  <div className="flex justify-between"><span>Balance</span><span>{formatCurrency(record.loan_balance)}</span></div>
                  <div className="flex justify-between"><span>Installment</span><span>{formatCurrency(record.loan_installment)}</span></div>
                  <div className="flex justify-between"><span>Advance</span><span>{formatCurrency(record.advance)}</span></div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-slate-600 hover:text-slate-800 flex items-center gap-2">
              <FiFileText size={16} /> View Full Payslip Preview
            </summary>
            <div className="mt-4 bg-white border rounded-xl p-6 text-sm">
              <div className="text-center border-b pb-4 mb-4">
                <h4 className="text-lg font-bold">Payslip</h4>
                <p>{record.employee_name} ({record.employee_code})</p>
                <p className="text-slate-500">{record.pay_period}</p>
                <div className="mt-1 text-xs text-slate-400">
                  {record.worked_hours}h worked · {record.overtime_hours}h overtime
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h5 className="font-semibold text-slate-700">Earnings</h5>
                  <div className="space-y-1 mt-1">
                    <div className="flex justify-between"><span>Basic</span><span>{formatCurrency(record.basic)}</span></div>
                    <div className="flex justify-between"><span>HRA</span><span>{formatCurrency(record.hra)}</span></div>
                    <div className="flex justify-between"><span>DA</span><span>{formatCurrency(record.da)}</span></div>
                    <div className="flex justify-between"><span>Allowances</span><span>{formatCurrency(record.allowances)}</span></div>
                    <div className="flex justify-between"><span>Incentives</span><span>{formatCurrency(record.incentives)}</span></div>
                    <div className="flex justify-between"><span>Overtime</span><span>{formatCurrency(record.overtime)}</span></div>
                    <div className="flex justify-between"><span>Bonus</span><span>{formatCurrency((record.festival_bonus || 0) + (record.performance_bonus || 0) + (record.other_bonus || 0))}</span></div>
                    <div className="border-t pt-1 font-semibold flex justify-between"><span>Gross</span><span>{formatCurrency(record.gross)}</span></div>
                  </div>
                </div>
                <div>
                  <h5 className="font-semibold text-slate-700">Deductions</h5>
                  <div className="space-y-1 mt-1">
                    <div className="flex justify-between"><span>PF</span><span>{formatCurrency(record.pf)}</span></div>
                    <div className="flex justify-between"><span>ESI</span><span>{formatCurrency(record.esi)}</span></div>
                    <div className="flex justify-between"><span>Prof. Tax</span><span>{formatCurrency(record.professional_tax)}</span></div>
                    <div className="flex justify-between"><span>TDS</span><span>{formatCurrency(record.tds)}</span></div>
                    <div className="flex justify-between"><span>Late Deduction</span><span>{formatCurrency(record.late_deduction)}</span></div>
                    <div className="flex justify-between"><span>Unpaid Leave</span><span>{formatCurrency(record.unpaid_leave_deduction)}</span></div>
                    <div className="flex justify-between"><span>Loan</span><span>{formatCurrency(record.loan_installment)}</span></div>
                    <div className="flex justify-between"><span>Advance</span><span>{formatCurrency(record.advance)}</span></div>
                    <div className="border-t pt-1 font-semibold flex justify-between"><span>Total Deductions</span><span>{formatCurrency(record.total_deductions)}</span></div>
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t text-center font-bold text-lg text-emerald-700">
                Net Pay: {formatCurrency(record.net_pay)}
              </div>
            </div>
          </details>
        </div>
      </div>
    );
  }, [
    permissionDenied, selectedRecord, selectedEmployeeId, employees,
    payrollMonth, attendanceSummary, attendanceLoading, generating,
    handleGeneratePayroll, handleMarkAsPaid,
    handleDownloadPayslip
  ]);

  // ---------- Render ----------
  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 text-slate-800 md:p-7">
      <div className="mb-6 rounded-3xl bg-slate-950 p-5 shadow-xl shadow-slate-300/50 md:p-7">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Payroll workspace</div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-white md:text-3xl">
              <FiDollarSign className="text-cyan-300" /> Payroll Management
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-white/10 rounded-xl px-3 py-1.5 flex items-center gap-2 text-sm text-slate-300">
              <FiCalendar size={14} />
              <input
                type="month"
                className="bg-transparent border-none text-white focus:outline-none w-36"
                value={payrollMonth}
                onChange={e => setPayrollMonth(e.target.value)}
              />
            </div>
            <button
              onClick={() => { loadPayrolls(); showSuccess('Refreshed', 'Payroll data reloaded.'); }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3.5 py-2 text-sm font-medium text-white ring-1 ring-white/15 transition hover:bg-white/20"
            >
              <FiRefreshCw size={14} /> Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/50">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 min-w-fit">
            <FiUser size={18} /> Select Employee:
          </label>
          <select
            className="input-field flex-1 w-full sm:w-auto min-w-[200px]"
            value={selectedEmployeeId}
            onChange={e => setSelectedEmployeeId(e.target.value ? Number(e.target.value) : '')}
            disabled={permissionDenied}
          >
            <option value="">All Employees</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.employee_code} - {emp.name}</option>
            ))}
          </select>
          {selectedEmployeeId && (
            <button onClick={() => setSelectedEmployeeId('')} className="text-sm text-slate-500 hover:text-slate-700 underline">
              Clear
            </button>
          )}
        </div>
        <div className="mt-2 text-xs text-slate-400">
          {permissionDenied ? (
            <span className="text-rose-500">⚠️ You don't have permission to view payroll records.</span>
          ) : (
            <>
              {selectedEmployeeId
                ? `Showing payroll for ${employees.find(e => e.id === selectedEmployeeId)?.name || 'selected employee'}`
                : 'Showing all employees'}
              {' • '}
              {filteredItems.length} record{filteredItems.length !== 1 ? 's' : ''} found for {payrollMonth}
            </>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm shadow-slate-200/50">
          {renderEmployeeDetails()}
        </div>

        {!permissionDenied && (
          <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/50 overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700">All Payroll Records</h3>
              <p className="text-xs text-slate-500">List of all employees for the selected month</p>
            </div>
            <ModernDataTable
              title=""
              columns={[
                { name: 'Employee', selector: (row: PayrollRecord) => row.employee_name, sortable: true },
                { name: 'Code', selector: (row: PayrollRecord) => row.employee_code || '—', sortable: true },
                { name: 'Gross', selector: (row: PayrollRecord) => formatCurrency(row.gross), sortable: true },
                { name: 'Net', selector: (row: PayrollRecord) => formatCurrency(row.net_pay), sortable: true },
                {
                  name: 'Status',
                  selector: (row: PayrollRecord) => (
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(row.status)}`}>
                      {getStatusLabel(row.status)}
                    </span>
                  ),
                  sortable: true,
                },
                {
                  name: 'Actions',
                  cell: (row: PayrollRecord) => (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setSelectedEmployeeId(row.employee_id)}
                        className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-blue-600 transition"
                        title="View details"
                      >
                        <FiEye size={16} />
                      </button>
                      <button
                        onClick={() => { setEditingRecord({...row}); setIsEditModalOpen(true); }}
                        className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-amber-600 transition"
                        title="Edit"
                      >
                        <FiEdit size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(row.id)}
                        className="p-1.5 rounded-lg text-slate-600 hover:bg-red-50 hover:text-red-600 transition"
                        title="Delete"
                      >
                        <FiTrash2 size={16} />
                      </button>
                      <button
                        onClick={() => handleRegenerate(row)}
                        disabled={regeneratingIds.includes(row.id)}
                        className="p-1.5 rounded-lg text-slate-600 hover:bg-green-50 hover:text-green-600 transition disabled:opacity-50"
                        title="Regenerate payroll for this month"
                      >
                        <FiRotateCcw size={16} />
                      </button>
                    </div>
                  ),
                },
              ]}
              data={filteredItems}
              loading={loading}
            />
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {isEditModalOpen && editingRecord && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Edit Payroll</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Status</label>
                <select
                  value={editingRecord.status}
                  onChange={e => setEditingRecord({ ...editingRecord, status: e.target.value as PayrollStatus })}
                  className="input-field w-full"
                >
                  <option value="draft">Draft</option>
                  <option value="generated">Generated</option>
                  <option value="approved">Approved</option>
                  <option value="paid">Paid</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Payment Method</label>
                <input
                  type="text"
                  value={editingRecord.payment_method || ''}
                  onChange={e => setEditingRecord({ ...editingRecord, payment_method: e.target.value })}
                  className="input-field w-full"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Notes</label>
                <textarea
                  value={editingRecord.notes || ''}
                  onChange={e => setEditingRecord({ ...editingRecord, notes: e.target.value })}
                  className="input-field w-full"
                  rows={3}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setIsEditModalOpen(false)} className="btn btn-ghost">Cancel</button>
              <button onClick={handleEditSave} className="btn bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-xl">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}