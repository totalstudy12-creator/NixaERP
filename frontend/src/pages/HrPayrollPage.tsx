// src/pages/HrPayrollPage.tsx
import {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  Suspense,
} from 'react';
import {
  FiUser,
  FiUsers,
  FiClock,
  FiDollarSign,
  FiActivity,
  FiSave,
  FiTrash2,
  FiRefreshCw,
  FiAlertCircle,
  FiFile,
  FiX,
  FiChevronDown,
  FiPlus,
} from 'react-icons/fi';

import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type TabId = 'overview' | 'shift' | 'advance';

interface Employee {
  id: number;
  first_name?: string;
  last_name?: string;
  name?: string;
  employee_code?: string;
  shift_start_time?: string;
  shift_end_time?: string;
  [key: string]: unknown;
}

interface AdvanceRecord {
  id: number;
  employee_id: number;
  advance_no?: string;
  amount: number | string;
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

interface ApiErrorLike {
  message?: string;
  status?: number;
  response?: { status?: number; data?: { message?: string } };
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const TABLE_HEAD_CLASS = 'text-[11px] font-semibold uppercase tracking-wide text-slate-500';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: FiActivity },
  { id: 'shift', label: 'Shift settings', icon: FiClock },
  { id: 'advance', label: 'Advances', icon: FiDollarSign },
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function getApiErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  const err = error as ApiErrorLike;
  const status = err?.response?.status ?? err?.status;
  const message = err?.response?.data?.message ?? err?.message;

  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403) return 'You do not have permission to perform this action.';
  if (status === 404) return 'The requested record was not found.';
  if (status === 409) return message || 'This operation conflicts with the current data.';
  if (status === 422) return message || 'Please check the submitted data.';
  if (status != null && status >= 500) return 'Server error. Please try again later.';

  return message || fallback;
}

function formatCurrency(value: unknown): string {
  const n = Number(value);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

function unwrapArray<T>(response: unknown): T[] {
  if (Array.isArray(response)) return response as T[];
  const r = response as { data?: unknown } | null;
  if (Array.isArray(r?.data)) return r.data as T[];
  return [];
}

function TableHeadLabel({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}) {
  const alignClass = align === 'right' ? 'justify-end' : '';
  return (
    <span className={`inline-flex items-center gap-1 ${alignClass} ${TABLE_HEAD_CLASS}`}>
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Skeletons                                                           */
/* ------------------------------------------------------------------ */

const SkeletonBox = ({ className = '' }: { className?: string }) => (
  <div className={`animate-pulse rounded bg-slate-200 ${className}`} />
);

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export function HrPayrollPage() {
  const { showSuccess, showError } = useNotification();

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | ''>('');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [saving, setSaving] = useState(false);

  const [advances, setAdvances] = useState<AdvanceRecord[]>([]);
  const [loadingAdvances, setLoadingAdvances] = useState(false);

  /* -------------------- Load employees -------------------- */

  const loadEmployees = useCallback(async () => {
    try {
      const res = await apiClient.request('GET', '/employees');
      const data = unwrapArray<Record<string, unknown>>(res);
      setEmployees(
        data.map((e) => ({
          ...e,
          name:
            (e.name as string) ||
            [e.first_name, e.last_name].filter(Boolean).join(' ') ||
            'Unknown',
        })) as Employee[]
      );
    } catch (err: unknown) {
      showError('Error', getApiErrorMessage(err, 'Could not load employees.'));
    }
  }, [showError]);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  useEffect(() => {
    const emp = selectedEmployeeId
      ? employees.find((e) => e.id === selectedEmployeeId) ?? null
      : null;
    setSelectedEmployee(emp);
  }, [selectedEmployeeId, employees]);

  /* -------------------- Load advances -------------------- */

  const loadAdvances = useCallback(async () => {
    if (!selectedEmployeeId) {
      setAdvances([]);
      return;
    }
    setLoadingAdvances(true);
    try {
      const res = await apiClient.request(
        'GET',
        `/payroll/advances?employee_id=${selectedEmployeeId}`
      );
      setAdvances(unwrapArray<AdvanceRecord>(res));
    } catch (err: unknown) {
      showError('Load failed', getApiErrorMessage(err, 'Load failed.'));
    } finally {
      setLoadingAdvances(false);
    }
  }, [selectedEmployeeId, showError]);

  useEffect(() => {
    if (activeTab === 'advance') void loadAdvances();
  }, [activeTab, loadAdvances]);

  /* -------------------- Update employee field -------------------- */

  const updateEmployeeField = async (field: string, value: unknown) => {
    if (!selectedEmployee || !selectedEmployeeId) return;
    setSaving(true);
    try {
      await apiClient.request('PUT', `/employees/${selectedEmployeeId}`, { [field]: value });
      setSelectedEmployee((prev) => (prev ? { ...prev, [field]: value } : null));
      showSuccess('Updated', `${field} saved.`);
    } catch (err: unknown) {
      showError('Update failed', getApiErrorMessage(err, 'Update failed.'));
    } finally {
      setSaving(false);
    }
  };

  /* -------------------- Shift form -------------------- */

  const [shiftForm, setShiftForm] = useState({ start: '', end: '' });

  useEffect(() => {
    if (selectedEmployee) {
      setShiftForm({
        start: selectedEmployee.shift_start_time || '',
        end: selectedEmployee.shift_end_time || '',
      });
    }
  }, [selectedEmployee]);

  const handleSaveShift = async () => {
    if (!shiftForm.start || !shiftForm.end) {
      showError('Validation', 'Both start and end time required.');
      return;
    }
    if (!selectedEmployee || !selectedEmployeeId) return;
    setSaving(true);
    try {
      await apiClient.request('PUT', `/employees/${selectedEmployeeId}`, {
        shift_start_time: shiftForm.start,
        shift_end_time: shiftForm.end,
      });
      setSelectedEmployee((prev) =>
        prev
          ? { ...prev, shift_start_time: shiftForm.start, shift_end_time: shiftForm.end }
          : null
      );
      showSuccess('Shift updated', 'Shift timing saved.');
    } catch (err: unknown) {
      showError('Update failed', getApiErrorMessage(err, 'Update failed.'));
    } finally {
      setSaving(false);
    }
  };

  /* -------------------- Advance form -------------------- */

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
      setAdvanceForm((prev) => ({ ...prev, attachment: e.target.files![0] }));
    }
  };

  const resetAdvanceForm = () => {
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
  };

  const handleSaveAdvance = async () => {
    if (!selectedEmployeeId) return;
    if (!advanceForm.amount || advanceForm.amount <= 0) {
      showError('Validation', 'Advance amount is required.');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
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
        const formData = new FormData();
        Object.entries(payload).forEach(([key, value]) => {
          formData.append(key, value !== null ? String(value) : '');
        });
        formData.append('attachment', advanceForm.attachment);

        const token = (await import('../store/auth')).useAuthStore.getState().token;
        const headers: HeadersInit = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(
          `${import.meta.env.VITE_API_BASE || '/api'}/payroll/advances`,
          {
            method: 'POST',
            headers,
            body: formData,
          }
        );
        const contentType = res.headers.get('content-type') || '';
        const body = contentType.includes('application/json')
          ? await res.json()
          : await res.text();
        if (!res.ok) throw new Error((body as { message?: string }).message || 'Failed');
      } else {
        await apiClient.request('POST', '/payroll/advances', payload);
      }

      showSuccess('Saved', 'Advance request saved.');
      resetAdvanceForm();
      void loadAdvances();
    } catch (err: unknown) {
      showError('Failed', getApiErrorMessage(err, 'Failed.'));
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
      void loadAdvances();
    } catch (err: unknown) {
      showError('Failed', getApiErrorMessage(err, 'Failed.'));
    } finally {
      setSaving(false);
    }
  };

  /* -------------------- Derived -------------------- */

  const summary = useMemo(
    () => ({
      total: employees.length,
      withShift: employees.filter((e) => e.shift_start_time && e.shift_end_time).length,
      advancesCount: advances.length,
      advancesTotal: advances.reduce((sum, a) => sum + Number(a.amount || 0), 0),
    }),
    [employees, advances]
  );

  const statusBadgeClass = (status: string) => {
    switch (status) {
      case 'approved':
        return 'border-emerald-200/70 bg-emerald-50 text-emerald-700';
      case 'rejected':
        return 'border-red-200/70 bg-red-50 text-red-700';
      case 'pending':
        return 'border-amber-200/70 bg-amber-50 text-amber-700';
      case 'recovered':
        return 'border-sky-200/70 bg-sky-50 text-sky-700';
      default:
        return 'border-slate-200 bg-slate-50 text-slate-600';
    }
  };

  /* -------------------- Render -------------------- */

  return (
    <>
      <style>{`
        .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <div className="min-h-full bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100/60">
        <div className="mx-auto w-full max-w-[1900px] space-y-5 p-3 sm:p-4 lg:space-y-6 lg:p-6">
          {/* Hero */}
          <section className="relative overflow-hidden rounded-2xl border border-slate-800/10 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-5 py-6 shadow-[0_20px_40px_-20px_rgba(15,23,42,0.45)] sm:px-7 lg:px-8">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />

            <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200 backdrop-blur">
                  <FiActivity size={12} />
                  People · HR & Payroll
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-[32px]">
                  Employee management
                </h1>
                <p className="mt-1.5 max-w-2xl text-sm text-slate-300">
                  Manage shifts, advances and payroll details for your workforce.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => void loadEmployees()}
                  className="h-10 rounded-xl border-white/10 bg-white/5 text-white shadow-none backdrop-blur transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                >
                  <FiRefreshCw className="mr-2" size={14} />
                  Refresh
                </Button>
              </div>
            </div>
          </section>

          {/* KPI */}
          <section className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
            <StatCard
              icon={FiUsers}
              label="Total employees"
              value={summary.total}
              accent="indigo"
            />
            <StatCard
              icon={FiClock}
              label="With shift set"
              value={summary.withShift}
              accent="violet"
            />
            <StatCard
              icon={FiDollarSign}
              label="Advances"
              value={summary.advancesCount}
              accent="amber"
            />
            <StatCard
              icon={FiActivity}
              label="Advance total"
              value={formatCurrency(summary.advancesTotal)}
              accent="emerald"
            />
          </section>

          {/* Tabs + Employee selector */}
          <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <CardContent className="bg-white p-4 sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                {/* Tab nav */}
                <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                  {TABS.map((item) => {
                    const Icon = item.icon;
                    const active = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveTab(item.id)}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                          active
                            ? 'bg-slate-900 text-white shadow-sm'
                            : 'text-slate-500 hover:bg-white hover:text-slate-900'
                        }`}
                      >
                        <Icon size={13} />
                        {item.label}
                      </button>
                    );
                  })}
                </div>

                {/* Employee selector */}
                <div className="flex flex-1 items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <FiUser size={12} /> Employee
                  </label>
                  <div className="relative min-w-0 flex-1">
                    <select
                      value={selectedEmployeeId}
                      onChange={(e) =>
                        setSelectedEmployeeId(e.target.value ? Number(e.target.value) : '')
                      }
                      className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                    >
                      <option value="">— Select employee —</option>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name} {emp.employee_code ? `(${emp.employee_code})` : ''}
                        </option>
                      ))}
                    </select>
                    <FiChevronDown
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                      size={14}
                    />
                  </div>
                  {selectedEmployeeId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedEmployeeId('')}
                      className="h-10 shrink-0 rounded-xl text-slate-500 hover:text-slate-800"
                    >
                      <FiX size={14} />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Empty state */}
          {!selectedEmployee && (
            <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <CardContent className="py-16 text-center">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-slate-200/70">
                  <FiUsers className="h-6 w-6 text-slate-400" />
                </div>
                <p className="mt-4 text-base font-semibold text-slate-800">
                  No employee selected
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Choose an employee above to manage shifts and advances.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Tab content */}
          {selectedEmployee && (
            <Suspense
              fallback={
                <div className="space-y-4">
                  <SkeletonBox className="h-32" />
                  <SkeletonBox className="h-32" />
                </div>
              }
            >
              {/* Overview */}
              {activeTab === 'overview' && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <OverviewTile
                    icon={FiUser}
                    label="Employee"
                    value={selectedEmployee.name || '—'}
                    sub={selectedEmployee.employee_code || ''}
                  />
                  <OverviewTile
                    icon={FiClock}
                    label="Shift timing"
                    value={
                      selectedEmployee.shift_start_time && selectedEmployee.shift_end_time
                        ? `${selectedEmployee.shift_start_time} – ${selectedEmployee.shift_end_time}`
                        : 'Not set'
                    }
                    sub="Set shift under the Shift settings tab"
                  />
                  <OverviewTile
                    icon={FiDollarSign}
                    label="Advances"
                    value={`${summary.advancesCount} record${
                      summary.advancesCount === 1 ? '' : 's'
                    }`}
                    sub={formatCurrency(summary.advancesTotal)}
                  />
                </div>
              )}

              {/* Shift settings */}
              {activeTab === 'shift' && (
                <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                  <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 bg-white px-4 py-3.5 sm:px-5">
                    <div className="flex items-center gap-2.5">
                      <div className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-50 text-indigo-600 ring-1 ring-indigo-500/10">
                        <FiClock size={14} />
                      </div>
                      <div>
                        <CardTitle className="text-sm font-semibold text-slate-800">
                          Shift settings
                        </CardTitle>
                        <CardDescription className="text-[11px] text-slate-500">
                          Set working hours for {selectedEmployee.name}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="bg-white p-4 sm:p-5">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="min-w-0">
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Start time
                        </label>
                        <input
                          type="time"
                          value={shiftForm.start}
                          onChange={(e) =>
                            setShiftForm({ ...shiftForm, start: e.target.value })
                          }
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                        />
                      </div>
                      <div className="min-w-0">
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                          End time
                        </label>
                        <input
                          type="time"
                          value={shiftForm.end}
                          onChange={(e) => setShiftForm({ ...shiftForm, end: e.target.value })}
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                        />
                      </div>
                    </div>

                    <div className="mt-5 flex justify-end">
                      <Button
                        onClick={handleSaveShift}
                        disabled={saving}
                        className="rounded-xl bg-indigo-600 font-semibold hover:bg-indigo-700"
                      >
                        <FiSave className="mr-1.5" size={14} />
                        {saving ? 'Saving…' : 'Save shift'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Advances */}
              {activeTab === 'advance' && (
                <div className="space-y-5">
                  {/* Request form */}
                  <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                    <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 bg-white px-4 py-3.5 sm:px-5">
                      <div className="flex items-center gap-2.5">
                        <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600 ring-1 ring-emerald-500/10">
                          <FiPlus size={14} />
                        </div>
                        <div>
                          <CardTitle className="text-sm font-semibold text-slate-800">
                            Request new advance
                          </CardTitle>
                          <CardDescription className="text-[11px] text-slate-500">
                            Create a new advance record for {selectedEmployee.name}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="bg-white p-4 sm:p-5">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="min-w-0">
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Amount <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={advanceForm.amount}
                            onChange={(e) =>
                              setAdvanceForm({
                                ...advanceForm,
                                amount: parseFloat(e.target.value) || 0,
                              })
                            }
                            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                          />
                        </div>

                        <div className="min-w-0">
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Status
                          </label>
                          <div className="relative">
                            <select
                              value={advanceForm.status}
                              onChange={(e) =>
                                setAdvanceForm({ ...advanceForm, status: e.target.value })
                              }
                              className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                            >
                              <option value="pending">Pending</option>
                              <option value="approved">Approved</option>
                              <option value="rejected">Rejected</option>
                              <option value="recovered">Recovered</option>
                            </select>
                            <FiChevronDown
                              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                              size={14}
                            />
                          </div>
                        </div>

                        <div className="min-w-0">
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Request date
                          </label>
                          <input
                            type="date"
                            value={advanceForm.request_date}
                            onChange={(e) =>
                              setAdvanceForm({ ...advanceForm, request_date: e.target.value })
                            }
                            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                          />
                        </div>

                        <div className="min-w-0">
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Payment date
                          </label>
                          <input
                            type="date"
                            value={advanceForm.payment_date}
                            onChange={(e) =>
                              setAdvanceForm({ ...advanceForm, payment_date: e.target.value })
                            }
                            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                          />
                        </div>

                        <div className="min-w-0">
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Payment method
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Cash, Bank Transfer"
                            value={advanceForm.payment_method}
                            onChange={(e) =>
                              setAdvanceForm({
                                ...advanceForm,
                                payment_method: e.target.value,
                              })
                            }
                            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                          />
                        </div>

                        <div className="min-w-0">
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Transaction reference
                          </label>
                          <input
                            type="text"
                            placeholder="Ref number"
                            value={advanceForm.transaction_reference}
                            onChange={(e) =>
                              setAdvanceForm({
                                ...advanceForm,
                                transaction_reference: e.target.value,
                              })
                            }
                            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                          />
                        </div>

                        <div className="min-w-0">
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Approved by (employee ID)
                          </label>
                          <input
                            type="number"
                            placeholder="Employee ID"
                            value={advanceForm.approved_by}
                            onChange={(e) =>
                              setAdvanceForm({ ...advanceForm, approved_by: e.target.value })
                            }
                            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                          />
                        </div>

                        <div className="min-w-0 sm:col-span-2 lg:col-span-3">
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Reason
                          </label>
                          <textarea
                            rows={2}
                            value={advanceForm.reason}
                            onChange={(e) =>
                              setAdvanceForm({ ...advanceForm, reason: e.target.value })
                            }
                            className="min-h-[70px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                          />
                        </div>

                        <div className="min-w-0 sm:col-span-2 lg:col-span-3">
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Remarks
                          </label>
                          <textarea
                            rows={2}
                            value={advanceForm.remarks}
                            onChange={(e) =>
                              setAdvanceForm({ ...advanceForm, remarks: e.target.value })
                            }
                            className="min-h-[70px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                          />
                        </div>

                        <div className="min-w-0 sm:col-span-2 lg:col-span-3">
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Attachment
                          </label>
                          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-3.5 py-2.5 text-sm text-slate-600 transition hover:border-indigo-300 hover:bg-indigo-50/40">
                            <FiFile className="shrink-0 text-slate-400" size={16} />
                            <span className="min-w-0 flex-1 truncate">
                              {advanceForm.attachment
                                ? advanceForm.attachment.name
                                : 'Choose a file (optional)'}
                            </span>
                            <input
                              type="file"
                              onChange={handleAdvanceFileChange}
                              className="hidden"
                            />
                          </label>
                          {advanceForm.attachment && (
                            <button
                              type="button"
                              onClick={() =>
                                setAdvanceForm({ ...advanceForm, attachment: null })
                              }
                              className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-red-600 underline-offset-2 hover:underline"
                            >
                              <FiX size={11} /> Remove attachment
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="mt-5 flex justify-end">
                        <Button
                          onClick={handleSaveAdvance}
                          disabled={saving}
                          className="rounded-xl bg-indigo-600 font-semibold hover:bg-indigo-700"
                        >
                          <FiSave className="mr-1.5" size={14} />
                          {saving ? 'Saving…' : 'Save advance'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Advance history */}
                  <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                    <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 bg-white px-4 py-3.5 sm:px-5">
                      <div className="flex items-center gap-2.5">
                        <div className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600">
                          <FiDollarSign size={14} />
                        </div>
                        <div>
                          <CardTitle className="text-sm font-semibold text-slate-800">
                            Advance history
                          </CardTitle>
                          <CardDescription className="text-[11px] text-slate-500">
                            {loadingAdvances
                              ? 'Loading advances…'
                              : `${advances.length} record${advances.length === 1 ? '' : 's'}`}
                          </CardDescription>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void loadAdvances()}
                        disabled={loadingAdvances}
                        className="h-9 rounded-lg text-slate-500 hover:text-slate-800"
                      >
                        <FiRefreshCw
                          className={loadingAdvances ? 'animate-spin' : ''}
                          size={14}
                        />
                      </Button>
                    </CardHeader>

                    <div className="overflow-x-auto">
                      <Table className="min-w-[900px]">
                        <TableHeader>
                          <TableRow className="border-slate-100 bg-slate-50/70 hover:bg-slate-50/70">
                            <TableHead>
                              <TableHeadLabel>Advance #</TableHeadLabel>
                            </TableHead>
                            <TableHead className="text-right">
                              <TableHeadLabel align="right">Amount</TableHeadLabel>
                            </TableHead>
                            <TableHead>
                              <TableHeadLabel>Status</TableHeadLabel>
                            </TableHead>
                            <TableHead>
                              <TableHeadLabel>Request date</TableHeadLabel>
                            </TableHead>
                            <TableHead>
                              <TableHeadLabel>Payment method</TableHeadLabel>
                            </TableHead>
                            <TableHead>
                              <TableHeadLabel>Reference</TableHeadLabel>
                            </TableHead>
                            <TableHead className="w-16 text-right">
                              <TableHeadLabel align="right">Actions</TableHeadLabel>
                            </TableHead>
                          </TableRow>
                        </TableHeader>

                        <TableBody>
                          {loadingAdvances &&
                            Array.from({ length: 3 }).map((_, idx) => (
                              <TableRow key={`skeleton-${idx}`} className="border-slate-100">
                                {Array.from({ length: 7 }).map((__, cellIndex) => (
                                  <TableCell key={cellIndex}>
                                    <div className="h-4 animate-pulse rounded bg-slate-100" />
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))}

                          {!loadingAdvances &&
                            advances.map((adv) => (
                              <TableRow
                                key={adv.id}
                                className="border-slate-100 transition-colors hover:bg-slate-50/70"
                              >
                                <TableCell>
                                  <span className="text-sm font-semibold text-slate-900">
                                    {adv.advance_no || `#${adv.id}`}
                                  </span>
                                </TableCell>
                                <TableCell className="whitespace-nowrap text-right text-sm font-semibold tabular-nums text-slate-900">
                                  {formatCurrency(adv.amount)}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant="outline"
                                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize ${statusBadgeClass(
                                      adv.status
                                    )}`}
                                  >
                                    {adv.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="whitespace-nowrap text-sm text-slate-600">
                                  {formatDate(adv.request_date)}
                                </TableCell>
                                <TableCell className="whitespace-nowrap text-sm text-slate-600">
                                  {adv.payment_method || '—'}
                                </TableCell>
                                <TableCell className="whitespace-nowrap text-sm text-slate-600">
                                  {adv.transaction_reference || '—'}
                                </TableCell>
                                <TableCell className="text-right">
                                  <button
                                    onClick={() => handleDeleteAdvance(adv.id)}
                                    className="grid h-8 w-8 place-items-center rounded-lg text-red-500 transition hover:bg-red-50 hover:text-red-700"
                                    title="Delete"
                                  >
                                    <FiTrash2 size={15} />
                                  </button>
                                </TableCell>
                              </TableRow>
                            ))}

                          {!loadingAdvances && advances.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={7} className="py-16 text-center">
                                <div className="mx-auto max-w-md px-4">
                                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-slate-200/70">
                                    <FiDollarSign className="h-6 w-6 text-slate-400" />
                                  </div>
                                  <p className="mt-4 text-base font-semibold text-slate-800">
                                    No advances found
                                  </p>
                                  <p className="mt-1 text-sm text-slate-500">
                                    Create a new advance request using the form above.
                                  </p>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </Card>
                </div>
              )}
            </Suspense>
          )}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

type Accent = 'indigo' | 'emerald' | 'rose' | 'amber' | 'violet' | 'teal' | 'sky';

function StatCard({
  icon: Icon,
  label,
  value,
  accent = 'indigo',
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  accent?: Accent;
}) {
  const accents: Record<Accent, { bg: string; icon: string; ring: string }> = {
    indigo: { bg: 'bg-indigo-50', icon: 'text-indigo-600', ring: 'ring-indigo-500/10' },
    emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600', ring: 'ring-emerald-500/10' },
    rose: { bg: 'bg-rose-50', icon: 'text-rose-600', ring: 'ring-rose-500/10' },
    amber: { bg: 'bg-amber-50', icon: 'text-amber-600', ring: 'ring-amber-500/10' },
    violet: { bg: 'bg-violet-50', icon: 'text-violet-600', ring: 'ring-violet-500/10' },
    teal: { bg: 'bg-teal-50', icon: 'text-teal-600', ring: 'ring-teal-500/10' },
    sky: { bg: 'bg-sky-50', icon: 'text-sky-600', ring: 'ring-sky-500/10' },
  };
  const style = accents[accent];

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300/80 hover:shadow-[0_8px_24px_-12px_rgba(15,23,42,0.15)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            {label}
          </p>
          <p className="mt-2 truncate text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            {value}
          </p>
        </div>
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${style.bg} ring-1 ${style.ring}`}>
          <Icon size={18} className={style.icon} />
        </div>
      </div>
    </div>
  );
}

function OverviewTile({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-500/10">
          <Icon size={18} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            {label}
          </p>
          <p className="mt-1.5 truncate text-base font-bold text-slate-900">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

export default HrPayrollPage;