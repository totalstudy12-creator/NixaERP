import { useEffect, useState, useCallback, Suspense } from 'react';
import {
  FiUser, FiUsers, FiClock, FiDollarSign,
  FiActivity, FiSave, FiTrash2, FiRefreshCw
} from 'react-icons/fi';
import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';

type TabId = 'overview' | 'shift' | 'advance';

interface Employee {
  id: number;
  first_name?: string;
  last_name?: string;
  name?: string;
  employee_code?: string;
  shift_start_time?: string;
  shift_end_time?: string;
  [key: string]: any;
}

interface AdvanceRecord {
  id: number;
  employee_id: number;
  advance_no?: string;
  amount: number | string;           // accept both
  request_date?: string;
  payment_date?: string;
  payment_method?: string;
  transaction_reference?: string;
  status: string;
  approved_by?: number | null;
  reason?: string;
  remarks?: string;
  attachment?: string;
}

const SkeletonBox = ({ className = '' }: { className?: string }) => (
  <div className={`bg-slate-200 animate-pulse rounded ${className}`} />
);

export function HrPayrollPage() {
  const { showSuccess, showError } = useNotification();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | ''>('');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [saving, setSaving] = useState(false);

  // Advances list
  const [advances, setAdvances] = useState<AdvanceRecord[]>([]);
  const [loadingAdvances, setLoadingAdvances] = useState(false);

  // ---------- Load employees ----------
  const loadEmployees = useCallback(async () => {
    try {
      const res = await apiClient.request('GET', '/employees');
      const data = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      setEmployees(data.map((e: any) => ({
        ...e,
        name: e.name || [e.first_name, e.last_name].filter(Boolean).join(' ') || 'Unknown',
      })));
    } catch (err) {
      showError('Error', 'Could not load employees.');
    }
  }, [showError]);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);

  useEffect(() => {
    const emp = selectedEmployeeId
      ? employees.find(e => e.id === selectedEmployeeId) ?? null
      : null;
    setSelectedEmployee(emp);
  }, [selectedEmployeeId, employees]);

  // ---------- Load advances for selected employee ----------
  const loadAdvances = useCallback(async () => {
    if (!selectedEmployeeId) {
      setAdvances([]);
      return;
    }
    setLoadingAdvances(true);
    try {
      const res = await apiClient.request('GET', `/payroll/advances?employee_id=${selectedEmployeeId}`);
      const data = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      setAdvances(data);
    } catch (err: any) {
      showError('Load failed', err.message);
    } finally {
      setLoadingAdvances(false);
    }
  }, [selectedEmployeeId, showError]);

  useEffect(() => {
    if (activeTab === 'advance') loadAdvances();
  }, [activeTab, loadAdvances]);

  // ---------- Update employee fields (shift) – direct request ----------
  const updateEmployeeField = async (field: string, value: any) => {
    if (!selectedEmployee || !selectedEmployeeId) return;
    setSaving(true);
    try {
      await apiClient.request('PUT', `/employees/${selectedEmployeeId}`, { [field]: value });
      setSelectedEmployee(prev => prev ? { ...prev, [field]: value } : null);
      showSuccess('Updated', `${field} saved.`);
    } catch (err: any) {
      showError('Update failed', err.message);
    } finally {
      setSaving(false);
    }
  };

  // ---------- Shift form ----------
  const [shiftForm, setShiftForm] = useState({ start: '', end: '' });
  useEffect(() => {
    if (selectedEmployee) {
      setShiftForm({
        start: selectedEmployee.shift_start_time || '',
        end: selectedEmployee.shift_end_time || '',
      });
    }
  }, [selectedEmployee]);

  const handleSaveShift = () => {
    if (!shiftForm.start || !shiftForm.end) {
      showError('Validation', 'Both start and end time required.');
      return;
    }
    updateEmployeeField('shift_start_time', shiftForm.start);
    updateEmployeeField('shift_end_time', shiftForm.end);
  };

  // ---------- Advance form ----------
  const [advanceForm, setAdvanceForm] = useState({
    amount: 0,
    status: 'pending',
    request_date: '',
    payment_date: '',
    payment_method: '',
    transaction_reference: '',
    approved_by: '',
    reason: '',
    remarks: '',
    attachment: null as File | null,
  });

  const handleAdvanceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setAdvanceForm(prev => ({ ...prev, attachment: e.target.files![0] }));
    }
  };

  const handleSaveAdvance = async () => {
    if (!selectedEmployeeId) return;
    if (!advanceForm.amount || advanceForm.amount <= 0) {
      showError('Validation', 'Advance amount is required.');
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        employee_id: selectedEmployeeId,
        amount: advanceForm.amount,
        status: advanceForm.status,
        request_date: advanceForm.request_date || null,
        payment_date: advanceForm.payment_date || null,
        payment_method: advanceForm.payment_method || null,
        transaction_reference: advanceForm.transaction_reference || null,
        reason: advanceForm.reason,
        remarks: advanceForm.remarks,
      };
      if (advanceForm.approved_by) {
        payload.approved_by = Number(advanceForm.approved_by);
      }

      if (advanceForm.attachment) {
        // File upload – use FormData
        const formData = new FormData();
        Object.entries(payload).forEach(([key, value]) => {
          formData.append(key, value !== null ? String(value) : '');
        });
        formData.append('attachment', advanceForm.attachment);

        const token = (await import('../store/auth')).useAuthStore.getState().token;
        const headers: any = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${import.meta.env.VITE_API_BASE || '/api'}/payroll/advances`, {
          method: 'POST',
          headers,
          body: formData,
        });
        const contentType = res.headers.get('content-type') || '';
        const body = contentType.includes('application/json') ? await res.json() : await res.text();
        if (!res.ok) throw new Error((body as any).message || 'Failed');
      } else {
        await apiClient.request('POST', '/payroll/advances', payload);
      }

      showSuccess('Saved', 'Advance request saved.');
      setAdvanceForm({
        amount: 0,
        status: 'pending',
        request_date: '',
        payment_date: '',
        payment_method: '',
        transaction_reference: '',
        approved_by: '',
        reason: '',
        remarks: '',
        attachment: null,
      });
      loadAdvances();
    } catch (err: any) {
      showError('Failed', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAdvance = async (id: number) => {
    if (!window.confirm('Delete this advance?')) return;
    setSaving(true);
    try {
      await apiClient.request('DELETE', `/payroll/advances/${id}`);
      showSuccess('Deleted', 'Advance removed.');
      loadAdvances();
    } catch (err: any) {
      showError('Failed', err.message);
    } finally {
      setSaving(false);
    }
  };

  // ---------- Helpers ----------
  const formatCurrency = (val: any) => `₹${(Number(val) || 0).toFixed(2)}`;  // FIXED
  const statusBadge = (status: string) => {
    const base = 'px-2 py-0.5 rounded-full text-xs font-medium ';
    switch (status) {
      case 'approved': return base + 'bg-emerald-100 text-emerald-700';
      case 'rejected': return base + 'bg-rose-100 text-rose-700';
      case 'pending': return base + 'bg-amber-100 text-amber-700';
      case 'recovered': return base + 'bg-blue-100 text-blue-700';
      default: return base + 'bg-slate-100 text-slate-600';
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 md:p-7 text-slate-800">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 mb-6 rounded-3xl bg-slate-950 px-5 py-6 md:px-8 md:py-7 shadow-xl shadow-slate-300/50">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> HR & Payroll
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl flex items-center gap-3">
            <FiActivity className="text-cyan-300" /> Employee Management
          </h1>
          <p className="text-sm text-slate-300">Shifts, advances & more</p>
        </div>
      </div>

      {/* Tabs */}
      <nav className="mb-5 flex items-center gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
        {[
          { id: 'overview', label: 'Overview', icon: FiActivity },
          { id: 'shift', label: 'Shift Settings', icon: FiClock },
          { id: 'advance', label: 'Advances', icon: FiDollarSign },
        ].map(item => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as TabId)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition ${
                activeTab === item.id
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon size={16} /> {item.label}
            </button>
          );
        })}
      </nav>

      {/* Employee selector */}
      <div className="mb-6 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
            <FiUser className="text-indigo-500" /> Employee
          </label>
          <select
            value={selectedEmployeeId}
            onChange={e => setSelectedEmployeeId(e.target.value ? Number(e.target.value) : '')}
            className="flex-1 min-w-[200px] rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
          >
            <option value="">-- Select Employee --</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>
                {emp.name} {emp.employee_code ? `(${emp.employee_code})` : ''}
              </option>
            ))}
          </select>
          {selectedEmployeeId && (
            <button onClick={() => setSelectedEmployeeId('')} className="text-sm text-indigo-600 hover:underline">
              Clear
            </button>
          )}
        </div>
      </div>

      {/* No employee selected */}
      {!selectedEmployee && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <FiUsers size={48} className="mx-auto text-slate-300" />
          <p className="mt-2 text-slate-500">Select an employee to manage HR & payroll details.</p>
        </div>
      )}

      {/* Tabs content */}
      {selectedEmployee && (
        <Suspense fallback={<div className="space-y-4"><SkeletonBox className="h-32" /><SkeletonBox className="h-32" /></div>}>
          {/* Overview */}
          {activeTab === 'overview' && (
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-sm text-slate-500">Shift</p>
                <p className="font-semibold text-lg">
                  {selectedEmployee.shift_start_time || '—'} - {selectedEmployee.shift_end_time || '—'}
                </p>
              </div>
            </div>
          )}

          {/* Shift tab */}
          {activeTab === 'shift' && (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="text-lg font-bold mb-4">Shift Timing</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm text-slate-500 mb-1">Start Time</label>
                  <input
                    type="time"
                    value={shiftForm.start}
                    onChange={e => setShiftForm({...shiftForm, start: e.target.value})}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-500 mb-1">End Time</label>
                  <input
                    type="time"
                    value={shiftForm.end}
                    onChange={e => setShiftForm({...shiftForm, end: e.target.value})}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  />
                </div>
              </div>
              <button
                onClick={handleSaveShift}
                disabled={saving}
                className="flex items-center gap-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                <FiSave size={16} /> Save Shift
              </button>
            </div>
          )}

          {/* Advance tab */}
          {activeTab === 'advance' && (
            <div className="space-y-6">
              {/* Request form */}
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h3 className="text-lg font-bold mb-4">Request New Advance</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="text-sm text-slate-500">Amount *</label>
                    <input
                      type="number" step="0.01"
                      value={advanceForm.amount}
                      onChange={e => setAdvanceForm({...advanceForm, amount: parseFloat(e.target.value) || 0})}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-slate-500">Status</label>
                    <select
                      value={advanceForm.status}
                      onChange={e => setAdvanceForm({...advanceForm, status: e.target.value})}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2"
                    >
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                      <option value="recovered">Recovered</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-slate-500">Request Date</label>
                    <input
                      type="date"
                      value={advanceForm.request_date}
                      onChange={e => setAdvanceForm({...advanceForm, request_date: e.target.value})}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-slate-500">Payment Date</label>
                    <input
                      type="date"
                      value={advanceForm.payment_date}
                      onChange={e => setAdvanceForm({...advanceForm, payment_date: e.target.value})}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-slate-500">Payment Method</label>
                    <input
                      type="text"
                      placeholder="e.g. Cash, Bank Transfer"
                      value={advanceForm.payment_method}
                      onChange={e => setAdvanceForm({...advanceForm, payment_method: e.target.value})}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-slate-500">Transaction Reference</label>
                    <input
                      type="text"
                      placeholder="Ref number"
                      value={advanceForm.transaction_reference}
                      onChange={e => setAdvanceForm({...advanceForm, transaction_reference: e.target.value})}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-slate-500">Approved By (Employee ID)</label>
                    <input
                      type="number"
                      placeholder="Employee ID"
                      value={advanceForm.approved_by}
                      onChange={e => setAdvanceForm({...advanceForm, approved_by: e.target.value})}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-sm text-slate-500">Reason</label>
                    <textarea
                      rows={2}
                      value={advanceForm.reason}
                      onChange={e => setAdvanceForm({...advanceForm, reason: e.target.value})}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-sm text-slate-500">Remarks</label>
                    <textarea
                      rows={2}
                      value={advanceForm.remarks}
                      onChange={e => setAdvanceForm({...advanceForm, remarks: e.target.value})}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-sm text-slate-500">Attachment</label>
                    <input
                      type="file"
                      onChange={handleAdvanceFileChange}
                      className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                    />
                  </div>
                </div>
                <button
                  onClick={handleSaveAdvance}
                  disabled={saving}
                  className="flex items-center gap-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  <FiSave size={16} /> Save Advance
                </button>
              </div>

              {/* Existing advances list */}
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-bold">Advance History</h3>
                  <button onClick={loadAdvances} disabled={loadingAdvances} className="text-indigo-600 hover:text-indigo-800">
                    <FiRefreshCw size={18} className={loadingAdvances ? 'animate-spin' : ''} />
                  </button>
                </div>
                {loadingAdvances ? (
                  <div className="space-y-2">
                    <SkeletonBox className="h-8" />
                    <SkeletonBox className="h-8" />
                  </div>
                ) : advances.length === 0 ? (
                  <p className="text-sm text-slate-400">No advances found.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="p-2 text-left">Advance No</th>
                          <th className="p-2 text-left">Amount</th>
                          <th className="p-2 text-left">Status</th>
                          <th className="p-2 text-left">Request Date</th>
                          <th className="p-2 text-left">Payment Method</th>
                          <th className="p-2 text-left">Ref</th>
                          <th className="p-2 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {advances.map(adv => (
                          <tr key={adv.id} className="border-b border-slate-100">
                            <td className="p-2 font-medium">{adv.advance_no || '-'}</td>
                            <td className="p-2">{formatCurrency(adv.amount)}</td>   {/* now safe */}
                            <td className="p-2"><span className={statusBadge(adv.status)}>{adv.status}</span></td>
                            <td className="p-2">{adv.request_date || '-'}</td>
                            <td className="p-2">{adv.payment_method || '-'}</td>
                            <td className="p-2">{adv.transaction_reference || '-'}</td>
                            <td className="p-2 text-right">
                              <button
                                onClick={() => handleDeleteAdvance(adv.id)}
                                className="text-slate-400 hover:text-rose-600"
                              >
                                <FiTrash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </Suspense>
      )}
    </div>
  );
}