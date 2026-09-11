// src/pages/EmployeesPage.tsx
import {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  lazy,
  Suspense,
  memo,
} from 'react';
import {
  FiPlus,
  FiTrash2,
  FiEdit,
  FiDownload,
  FiUsers,
  FiUserCheck,
  FiUserX,
  FiCalendar,
  FiMapPin,
  FiBriefcase,
  FiDollarSign,
  FiClock,
  FiBook,
  FiAlertCircle,
  FiFilter,
  FiSearch,
  FiUser,
  FiX,
  FiChevronDown,
  FiMail,
  FiPhone,
  FiHash,
} from 'react-icons/fi';

import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';

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

const Offcanvas = lazy(() =>
  import('../components/Offcanvas').then((m) => ({ default: m.Offcanvas }))
);

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface Company {
  id: number;
  name: string;
}
interface Branch {
  id: number;
  name: string;
  company_id?: number;
}
interface Department {
  id: number;
  name: string;
}
interface Designation {
  id: number;
  title: string;
}
interface Employee {
  id: number;
  employee_code: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  gender: 'Male' | 'Female' | 'Other' | '';
  date_of_birth: string;
  blood_group: string;
  marital_status: string;
  company_id: number | null;
  branch_id: number | null;
  department_id: number | null;
  designation_id: number | null;
  reporting_manager_id: number | null;
  employment_type: string;
  work_location: string;
  salary_type: 'Monthly' | 'Daily' | 'Hourly' | '';
  ctc: number;
  gross: number;
  basic: number;
  hra: number;
  da: number;
  allowances: number;
  pf: number;
  esi: number;
  professional_tax: number;
  tds: number;
  bank_details: string;
  uan: string;
  esic_number: string;
  pending_biometric_scan: boolean;
  manual_attendance_approval: boolean;
  gps_attendance: boolean;
  mobile_attendance: boolean;
  web_attendance: boolean;
  shift_attendance: boolean;
  late_mark: boolean;
  early_exit: boolean;
  half_day: boolean;
  overtime: boolean;
  missed_punch: boolean;
  attendance_correction_request: boolean;
  address: string;
  emergency_contact: string;
  family_details: string;
  references: string;
  education: string;
  experience: string;
  skills: string;
  languages: string;
  passport: string;
  driving_license: string;
  aadhaar: string;
  pan: string;
  voter_id: string;
  documents: string;
  document_expiry: string;
  joining_date: string;
  confirmation_date: string;
  promotion_date: string;
  transfer_date: string;
  increment_date: string;
  suspension_date: string;
  exit_date: string;
  full_final_settlement_date: string;
  status: 'active' | 'inactive' | 'on-leave';
  company?: Company;
  branch?: Branch;
  department?: Department;
  designation?: Designation;
  reporting_manager?: Employee;
}

type EmployeeFormData = Partial<
  Omit<Employee, 'id' | 'company' | 'branch' | 'department' | 'designation' | 'reporting_manager'>
>;

interface AppLogEntry {
  module: string;
  action: string;
  status: 'success' | 'error' | 'info';
  message: string;
}

interface ApiErrorLike {
  message?: string;
  status?: number;
  response?: { status?: number; data?: { message?: string } };
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const CACHE_TTL_MS = 300_000;
const TABLE_COLUMN_COUNT = 7;

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'on-leave', label: 'On leave' },
  { value: 'inactive', label: 'Inactive' },
] as const;

const GENDER_OPTIONS = [
  { value: 'Male', label: 'Male' },
  { value: 'Female', label: 'Female' },
  { value: 'Other', label: 'Other' },
] as const;

const BLOOD_GROUP_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((v) => ({
  value: v,
  label: v,
}));

const MARITAL_OPTIONS = ['Single', 'Married', 'Divorced', 'Widowed'].map((v) => ({
  value: v,
  label: v,
}));

const EMPLOYMENT_TYPE_OPTIONS = ['Permanent', 'Contract', 'Intern', 'Probation'].map((v) => ({
  value: v,
  label: v,
}));

const SALARY_TYPE_OPTIONS = ['Monthly', 'Daily', 'Hourly'].map((v) => ({
  value: v,
  label: v,
}));

const TABLE_HEAD_CLASS = 'text-[11px] font-semibold uppercase tracking-wide text-slate-500';

/* ------------------------------------------------------------------ */
/* Safe helpers                                                        */
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

function safeLog(entry: AppLogEntry): void {
  try {
    addAppLog(entry);
  } catch {
    /* no-op */
  }
}

function csvEscape(value: unknown): string {
  const text = String(value ?? '');
  const sanitized = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${sanitized.replace(/"/g, '""')}"`;
}

function safeCurrency(value: unknown): string {
  const n = Number(value ?? 0);
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

/* ------------------------------------------------------------------ */
/* Cache hook (race-safe)                                              */
/* ------------------------------------------------------------------ */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function useApiCache<T>(key: string, fetcher: () => Promise<T>, ttlMs = CACHE_TTL_MS) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  const fetchData = useCallback(
    async (skipCache = false) => {
      const requestId = ++requestIdRef.current;

      if (!skipCache) {
        const entry = cache.get(key);
        if (entry && Date.now() - entry.timestamp < ttlMs) {
          if (!mountedRef.current || requestId !== requestIdRef.current) return;
          setData(entry.data as T);
          setLoading(false);
          setError(null);
          return;
        }
      }

      setLoading(true);
      setError(null);

      try {
        const res = await fetcherRef.current();
        if (!mountedRef.current || requestId !== requestIdRef.current) return;
        const result = Array.isArray(res)
          ? (res as T)
          : ((res as { data?: T })?.data ?? ([] as unknown as T));
        cache.set(key, { data: result, timestamp: Date.now() });
        setData(result);
      } catch (err: unknown) {
        if (!mountedRef.current || requestId !== requestIdRef.current) return;
        setError(getApiErrorMessage(err, 'Failed to load'));
      } finally {
        if (mountedRef.current && requestId === requestIdRef.current) setLoading(false);
      }
    },
    [key, ttlMs]
  );

  useEffect(() => {
    mountedRef.current = true;
    void fetchData();
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, [fetchData]);

  const refresh = useCallback(() => {
    cache.delete(key);
    return fetchData(true);
  }, [fetchData, key]);

  return { data, loading, error, refresh };
}

/* ------------------------------------------------------------------ */
/* Uniform table header                                                */
/* ------------------------------------------------------------------ */

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

const StatCardSkeleton = memo(() => (
  <div className="flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-4">
    <div className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-slate-200" />
    <div className="flex-1 space-y-2">
      <div className="h-3 w-20 animate-pulse rounded bg-slate-200" />
      <div className="h-6 w-16 animate-pulse rounded bg-slate-200" />
    </div>
  </div>
));
StatCardSkeleton.displayName = 'StatCardSkeleton';

const TableSkeleton = memo(() => (
  <div className="space-y-3 bg-white p-6">
    <div className="h-6 w-48 animate-pulse rounded bg-slate-200" />
    {Array.from({ length: 8 }).map((_, i) => (
      <div key={i} className="flex gap-4">
        <div className="h-4 w-1/4 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-1/5 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-1/6 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-1/6 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-1/4 animate-pulse rounded bg-slate-200" />
      </div>
    ))}
  </div>
));
TableSkeleton.displayName = 'TableSkeleton';

/* ------------------------------------------------------------------ */
/* Stat card                                                           */
/* ------------------------------------------------------------------ */

type Accent = 'indigo' | 'emerald' | 'rose' | 'amber' | 'violet' | 'teal' | 'sky';

const StatCard = memo(
  ({
    icon: Icon,
    label,
    value,
    accent = 'indigo',
  }: {
    icon: React.ElementType;
    label: string;
    value: string | number;
    accent?: Accent;
  }) => {
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
);
StatCard.displayName = 'StatCard';

/* ------------------------------------------------------------------ */
/* Toggle switch                                                       */
/* ------------------------------------------------------------------ */

const ToggleSwitch = memo(
  ({
    checked,
    onChange,
    label,
  }: {
    checked: boolean;
    onChange: (val: boolean) => void;
    label: string;
  }) => (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-4 focus:ring-indigo-500/20 ${
          checked ? 'bg-indigo-600' : 'bg-slate-300'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
);
ToggleSwitch.displayName = 'ToggleSwitch';

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export function EmployeesPage() {
  const { showSuccess, showError } = useNotification();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCompany, setFilterCompany] = useState('all');
  const [filterBranch, setFilterBranch] = useState('all');

  const [isViewPanelOpen, setIsViewPanelOpen] = useState(false);
  const [viewingEmployee, setViewingEmployee] = useState<Employee | null>(null);

  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<EmployeeFormData>({
    employee_code: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    gender: '',
    date_of_birth: '',
    blood_group: '',
    marital_status: '',
    company_id: null,
    branch_id: null,
    department_id: null,
    designation_id: null,
    reporting_manager_id: null,
    employment_type: '',
    work_location: '',
    salary_type: '',
    ctc: 0,
    gross: 0,
    basic: 0,
    hra: 0,
    da: 0,
    allowances: 0,
    pf: 0,
    esi: 0,
    professional_tax: 0,
    tds: 0,
    bank_details: '',
    uan: '',
    esic_number: '',
    pending_biometric_scan: false,
    manual_attendance_approval: false,
    gps_attendance: false,
    mobile_attendance: false,
    web_attendance: false,
    shift_attendance: false,
    late_mark: false,
    early_exit: false,
    half_day: false,
    overtime: false,
    missed_punch: false,
    attendance_correction_request: false,
    address: '',
    emergency_contact: '',
    family_details: '',
    references: '',
    education: '',
    experience: '',
    skills: '',
    languages: '',
    passport: '',
    driving_license: '',
    aadhaar: '',
    pan: '',
    voter_id: '',
    documents: '',
    document_expiry: '',
    joining_date: '',
    confirmation_date: '',
    promotion_date: '',
    transfer_date: '',
    increment_date: '',
    suspension_date: '',
    exit_date: '',
    full_final_settlement_date: '',
    status: 'active',
  });
  const [submitting, setSubmitting] = useState(false);

  const {
    data: employees,
    loading: empLoading,
    error: empError,
    refresh: refreshEmps,
  } = useApiCache<Employee[]>('employees', () => apiClient.getEmployees());

  const { data: companies } = useApiCache<Company[]>('companies', () =>
    apiClient.getCompanies()
  );
  const { data: branches } = useApiCache<Branch[]>('branches', () => apiClient.getBranches());
  const { data: departments } = useApiCache<Department[]>(
    'departments',
    () =>
      (apiClient as unknown as { getDepartments?: () => Promise<Department[]> }).getDepartments?.() ??
      Promise.resolve([])
  );
  const { data: designations } = useApiCache<Designation[]>(
    'designations',
    () =>
      (apiClient as unknown as { getDesignations?: () => Promise<Designation[]> }).getDesignations?.() ??
      Promise.resolve([])
  );
  const { data: reportingManagers } = useApiCache<Employee[]>(
    'managers',
    () => apiClient.getEmployees?.() ?? Promise.resolve([])
  );

  /* -------------------- Filtering -------------------- */

  const filteredEmployees = useMemo(() => {
    if (!employees) return [];
    let filtered = [...employees];
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          `${e.first_name} ${e.last_name}`.toLowerCase().includes(term) ||
          e.employee_code?.toLowerCase().includes(term) ||
          e.email?.toLowerCase().includes(term) ||
          e.phone?.toLowerCase().includes(term)
      );
    }
    if (filterStatus !== 'all') filtered = filtered.filter((e) => e.status === filterStatus);
    if (filterCompany !== 'all')
      filtered = filtered.filter((e) => e.company_id === parseInt(filterCompany));
    if (filterBranch !== 'all')
      filtered = filtered.filter((e) => e.branch_id === parseInt(filterBranch));
    return filtered;
  }, [employees, searchTerm, filterStatus, filterCompany, filterBranch]);

  const summary = useMemo(
    () => ({
      total: employees?.length || 0,
      active: employees?.filter((e) => e.status === 'active').length || 0,
      onLeave: employees?.filter((e) => e.status === 'on-leave').length || 0,
      inactive: employees?.filter((e) => e.status === 'inactive').length || 0,
    }),
    [employees]
  );

  const activeFilterCount = [
    searchTerm,
    filterStatus !== 'all' ? filterStatus : undefined,
    filterCompany !== 'all' ? filterCompany : undefined,
    filterBranch !== 'all' ? filterBranch : undefined,
  ].filter(Boolean).length;

  const clearFilters = useCallback(() => {
    setSearchTerm('');
    setFilterStatus('all');
    setFilterCompany('all');
    setFilterBranch('all');
  }, []);

  /* -------------------- Branch filters -------------------- */

  const filteredBranchesForm = useMemo(() => {
    if (formData.company_id && branches) {
      const companyId = parseInt(String(formData.company_id));
      return branches.filter((b) => b.company_id === companyId);
    }
    return [];
  }, [formData.company_id, branches]);

  const filteredBranchesFilter = useMemo(() => {
    if (filterCompany !== 'all' && branches) {
      return branches.filter((b) => b.company_id === parseInt(filterCompany));
    }
    return branches || [];
  }, [filterCompany, branches]);

  /* -------------------- Detail view -------------------- */

  const handleView = useCallback((employee: Employee) => {
    setViewingEmployee(employee);
    setIsViewPanelOpen(true);
  }, []);

  /* -------------------- CRUD -------------------- */

  const resetForm = useCallback(() => {
    setFormData({
      employee_code: '',
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      gender: '',
      date_of_birth: '',
      blood_group: '',
      marital_status: '',
      company_id: null,
      branch_id: null,
      department_id: null,
      designation_id: null,
      reporting_manager_id: null,
      employment_type: '',
      work_location: '',
      salary_type: '',
      ctc: 0,
      gross: 0,
      basic: 0,
      hra: 0,
      da: 0,
      allowances: 0,
      pf: 0,
      esi: 0,
      professional_tax: 0,
      tds: 0,
      bank_details: '',
      uan: '',
      esic_number: '',
      pending_biometric_scan: false,
      manual_attendance_approval: false,
      gps_attendance: false,
      mobile_attendance: false,
      web_attendance: false,
      shift_attendance: false,
      late_mark: false,
      early_exit: false,
      half_day: false,
      overtime: false,
      missed_punch: false,
      attendance_correction_request: false,
      address: '',
      emergency_contact: '',
      family_details: '',
      references: '',
      education: '',
      experience: '',
      skills: '',
      languages: '',
      passport: '',
      driving_license: '',
      aadhaar: '',
      pan: '',
      voter_id: '',
      documents: '',
      document_expiry: '',
      joining_date: '',
      confirmation_date: '',
      promotion_date: '',
      transfer_date: '',
      increment_date: '',
      suspension_date: '',
      exit_date: '',
      full_final_settlement_date: '',
      status: 'active',
    });
  }, []);

  const handleCreate = useCallback(() => {
    setEditingId(null);
    resetForm();
    const newCode = `EMP-${String((employees?.length ?? 0) + 1).padStart(3, '0')}`;
    setFormData((prev) => ({ ...prev, employee_code: newCode }));
    setIsPanelOpen(true);
  }, [employees, resetForm]);

  const handleEdit = useCallback((employee: Employee) => {
    setEditingId(employee.id);
    setFormData({
      employee_code: employee.employee_code,
      first_name: employee.first_name,
      last_name: employee.last_name,
      email: employee.email,
      phone: employee.phone,
      gender: employee.gender,
      date_of_birth: employee.date_of_birth,
      blood_group: employee.blood_group,
      marital_status: employee.marital_status,
      company_id: employee.company_id ?? null,
      branch_id: employee.branch_id ?? null,
      department_id: employee.department_id ?? null,
      designation_id: employee.designation_id ?? null,
      reporting_manager_id: employee.reporting_manager_id ?? null,
      employment_type: employee.employment_type,
      work_location: employee.work_location,
      salary_type: employee.salary_type,
      ctc: employee.ctc || 0,
      gross: employee.gross || 0,
      basic: employee.basic || 0,
      hra: employee.hra || 0,
      da: employee.da || 0,
      allowances: employee.allowances || 0,
      pf: employee.pf || 0,
      esi: employee.esi || 0,
      professional_tax: employee.professional_tax || 0,
      tds: employee.tds || 0,
      bank_details: employee.bank_details || '',
      uan: employee.uan || '',
      esic_number: employee.esic_number || '',
      pending_biometric_scan: employee.pending_biometric_scan,
      manual_attendance_approval: employee.manual_attendance_approval,
      gps_attendance: employee.gps_attendance,
      mobile_attendance: employee.mobile_attendance,
      web_attendance: employee.web_attendance,
      shift_attendance: employee.shift_attendance,
      late_mark: employee.late_mark,
      early_exit: employee.early_exit,
      half_day: employee.half_day,
      overtime: employee.overtime,
      missed_punch: employee.missed_punch,
      attendance_correction_request: employee.attendance_correction_request,
      address: employee.address,
      emergency_contact: employee.emergency_contact,
      family_details: employee.family_details,
      references: employee.references,
      education: employee.education,
      experience: employee.experience,
      skills: employee.skills,
      languages: employee.languages,
      passport: employee.passport,
      driving_license: employee.driving_license,
      aadhaar: employee.aadhaar,
      pan: employee.pan,
      voter_id: employee.voter_id,
      documents: employee.documents,
      document_expiry: employee.document_expiry,
      joining_date: employee.joining_date,
      confirmation_date: employee.confirmation_date,
      promotion_date: employee.promotion_date,
      transfer_date: employee.transfer_date,
      increment_date: employee.increment_date,
      suspension_date: employee.suspension_date,
      exit_date: employee.exit_date,
      full_final_settlement_date: employee.full_final_settlement_date,
      status: employee.status,
    });
    setIsPanelOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (employee: Employee) => {
      if (!window.confirm(`Delete ${employee.first_name} ${employee.last_name}?`)) return;
      try {
        await apiClient.deleteEmployee(employee.id);
        showSuccess('Employee deleted', `${employee.first_name} ${employee.last_name} removed.`);
        safeLog({
          module: 'Employees',
          action: 'Delete employee',
          status: 'success',
          message: `Deleted ${employee.first_name} ${employee.last_name}`,
        });
        refreshEmps();
      } catch (err: unknown) {
        showError('Delete failed', getApiErrorMessage(err, 'Delete failed.'));
      }
    },
    [refreshEmps, showError, showSuccess]
  );

  /* -------------------- Validation -------------------- */

  const validateForm = (): boolean => {
    if (!formData.first_name?.trim()) {
      showError('Validation', 'First name is required.');
      return false;
    }
    if (!formData.last_name?.trim()) {
      showError('Validation', 'Last name is required.');
      return false;
    }
    if (!formData.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      showError('Validation', 'Valid email is required.');
      return false;
    }
    if (!formData.phone?.trim() || !/^[0-9+\-()\s]{7,15}$/.test(formData.phone)) {
      showError('Validation', 'Valid phone number required (7-15 digits).');
      return false;
    }
    if (!formData.joining_date) {
      showError('Validation', 'Joining date is required.');
      return false;
    }
    if (!formData.gender) {
      showError('Validation', 'Gender is required.');
      return false;
    }
    return true;
  };

  const handleSubmit = useCallback(async () => {
    if (!validateForm()) return;
    const payload = {
      ...formData,
      company_id: formData.company_id ? parseInt(String(formData.company_id)) : null,
      branch_id: formData.branch_id ? parseInt(String(formData.branch_id)) : null,
      department_id: formData.department_id ? parseInt(String(formData.department_id)) : null,
      designation_id: formData.designation_id ? parseInt(String(formData.designation_id)) : null,
      reporting_manager_id: formData.reporting_manager_id
        ? parseInt(String(formData.reporting_manager_id))
        : null,
      ctc: Number(formData.ctc) || 0,
      gross: Number(formData.gross) || 0,
      basic: Number(formData.basic) || 0,
      hra: Number(formData.hra) || 0,
      da: Number(formData.da) || 0,
      allowances: Number(formData.allowances) || 0,
      pf: Number(formData.pf) || 0,
      esi: Number(formData.esi) || 0,
      professional_tax: Number(formData.professional_tax) || 0,
      tds: Number(formData.tds) || 0,
    };

    setSubmitting(true);
    try {
      if (editingId) {
        await apiClient.updateEmployee(editingId, payload);
        showSuccess('Employee updated', `${formData.first_name} ${formData.last_name} updated.`);
        safeLog({
          module: 'Employees',
          action: 'Update employee',
          status: 'success',
          message: `Updated ${formData.first_name} ${formData.last_name}`,
        });
      } else {
        await apiClient.createEmployee(payload);
        showSuccess('Employee created', `${formData.first_name} ${formData.last_name} added.`);
        safeLog({
          module: 'Employees',
          action: 'Create employee',
          status: 'success',
          message: `Created ${formData.first_name} ${formData.last_name}`,
        });
      }
      setIsPanelOpen(false);
      refreshEmps();
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, 'Save failed.');
      showError('Save failed', msg);
      safeLog({ module: 'Employees', action: 'Save employee', status: 'error', message: msg });
    } finally {
      setSubmitting(false);
    }
  }, [formData, editingId, refreshEmps, showSuccess, showError]);

  /* -------------------- Export -------------------- */

  const handleExport = useCallback(() => {
    if (filteredEmployees.length === 0) {
      showError('Export failed', 'No employees to export.');
      return;
    }
    const headers = [
      'Employee Code',
      'First Name',
      'Last Name',
      'Email',
      'Phone',
      'Gender',
      'DOB',
      'Status',
      'Company',
      'Branch',
      'Address',
    ];
    const rows = filteredEmployees.map((e) =>
      [
        csvEscape(e.employee_code),
        csvEscape(e.first_name),
        csvEscape(e.last_name),
        csvEscape(e.email),
        csvEscape(e.phone),
        csvEscape(e.gender),
        csvEscape(e.date_of_birth),
        csvEscape(e.status),
        csvEscape(e.company?.name || ''),
        csvEscape(e.branch?.name || ''),
        csvEscape(e.address),
      ].join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `employees-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showSuccess('Export', 'Employee data exported.');
  }, [filteredEmployees, showSuccess, showError]);

  /* -------------------- Render field helpers -------------------- */

  const renderField = (
    label: string,
    field: keyof EmployeeFormData,
    type: 'text' | 'email' | 'tel' | 'date' | 'number' | 'textarea' = 'text',
    required = false
  ) => {
    const value = formData[field] ?? '';
    const id = `field-${field}`;
    const base =
      'h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10';
    return (
      <div className="min-w-0">
        <label
          htmlFor={id}
          className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
        {type === 'textarea' ? (
          <textarea
            id={id}
            value={value as string}
            onChange={(e) => setFormData((prev) => ({ ...prev, [field]: e.target.value }))}
            rows={2}
            className={`${base} min-h-[70px] resize-y py-2.5`}
            placeholder={`Enter ${label}`}
          />
        ) : (
          <input
            id={id}
            type={type}
            value={value as string | number}
            onChange={(e) => setFormData((prev) => ({ ...prev, [field]: e.target.value }))}
            className={base}
            placeholder={`Enter ${label}`}
            step={type === 'number' ? '0.01' : undefined}
          />
        )}
      </div>
    );
  };

  // ✅ FIX: accept ReadonlyArray so `as const` tuples (GENDER_OPTIONS etc.) are assignable
  const renderSelect = (
    label: string,
    field: keyof EmployeeFormData,
    options: ReadonlyArray<{ value: string | number; label: string }>,
    required = false
  ) => {
    const value = (formData[field] as string | number | null) ?? '';
    const id = `field-${field}`;
    return (
      <div className="min-w-0">
        <label
          htmlFor={id}
          className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
        <div className="relative">
          <select
            id={id}
            value={String(value)}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                [field]: e.target.value === '' ? null : e.target.value,
              }))
            }
            className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
          >
            <option value="">Select {label}</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <FiChevronDown
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={14}
          />
        </div>
      </div>
    );
  };

  const renderToggle = (label: string, field: keyof EmployeeFormData) => {
    const checked = Boolean(formData[field]);
    return (
      <ToggleSwitch
        label={label}
        checked={checked}
        onChange={(val) => setFormData((prev) => ({ ...prev, [field]: val }))}
      />
    );
  };

  /* -------------------- Error state -------------------- */

  if (empError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-600">
            <FiAlertCircle size={24} />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">Failed to load employees</h2>
          <p className="mt-1.5 text-sm text-slate-500">{empError}</p>
          <Button
            onClick={refreshEmps}
            className="mt-5 rounded-xl bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }

  /* -------------------- Render -------------------- */

  return (
    <>
      <style>{`
        .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }

        .employees-offcanvas-wide {
          width: min(1080px, 96vw) !important;
          max-width: min(1080px, 96vw) !important;
        }
        .employees-detail-offcanvas {
          width: min(620px, 96vw) !important;
          max-width: min(620px, 96vw) !important;
        }
        @media (max-width: 640px) {
          .employees-offcanvas-wide,
          .employees-detail-offcanvas { width: 100vw !important; max-width: 100vw !important; }
        }

        .employees-offcanvas-wide .employees-form-scroll,
        .employees-detail-offcanvas .employees-form-scroll {
          overflow-y: auto;
          overflow-x: hidden;
          min-height: 0;
          flex: 1 1 auto;
          max-height: calc(100vh - 180px);
          scrollbar-width: thin;
          scrollbar-color: #cbd5e1 transparent;
        }
        .employees-offcanvas-wide .employees-form-scroll::-webkit-scrollbar,
        .employees-detail-offcanvas .employees-form-scroll::-webkit-scrollbar { width: 8px; }
        .employees-offcanvas-wide .employees-form-scroll::-webkit-scrollbar-track,
        .employees-detail-offcanvas .employees-form-scroll::-webkit-scrollbar-track { background: transparent; }
        .employees-offcanvas-wide .employees-form-scroll::-webkit-scrollbar-thumb,
        .employees-detail-offcanvas .employees-form-scroll::-webkit-scrollbar-thumb {
          background-color: #cbd5e1; border-radius: 8px;
        }
        .employees-offcanvas-wide .employees-form-scroll::-webkit-scrollbar-thumb:hover,
        .employees-detail-offcanvas .employees-form-scroll::-webkit-scrollbar-thumb:hover {
          background-color: #94a3b8;
        }
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
                  <FiUsers size={12} />
                  People · Employees
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-[32px]">
                  Employee workspace
                </h1>
                <p className="mt-1.5 max-w-2xl text-sm text-slate-300">
                  Manage your workforce, attendance settings, and records.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={handleExport}
                  disabled={empLoading || filteredEmployees.length === 0}
                  className="h-10 rounded-xl border-white/10 bg-white/5 text-white shadow-none backdrop-blur transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                >
                  <FiDownload className="mr-2" size={14} />
                  Export
                </Button>
                <Button
                  onClick={handleCreate}
                  className="h-10 rounded-xl bg-gradient-to-b from-cyan-300 to-cyan-400 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:from-cyan-200 hover:to-cyan-300"
                >
                  <FiPlus className="mr-2" size={14} />
                  Add employee
                </Button>
              </div>
            </div>
          </section>

          {/* KPI */}
          <section className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
            {employees ? (
              <>
                <StatCard icon={FiUsers} label="Total" value={summary.total} accent="indigo" />
                <StatCard icon={FiUserCheck} label="Active" value={summary.active} accent="emerald" />
                <StatCard icon={FiClock} label="On leave" value={summary.onLeave} accent="amber" />
                <StatCard icon={FiUserX} label="Inactive" value={summary.inactive} accent="rose" />
              </>
            ) : (
              Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
            )}
          </section>

          {/* Filters */}
          <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3.5 sm:px-5">
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-50 text-indigo-600 ring-1 ring-indigo-500/10">
                  <FiFilter size={14} />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-800">Filters</CardTitle>
                  <CardDescription className="text-[11px] text-slate-500">
                    {activeFilterCount > 0
                      ? `${activeFilterCount} active filter${activeFilterCount > 1 ? 's' : ''}`
                      : 'Refine employees by status, company or branch'}
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {activeFilterCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 rounded-lg text-slate-500 hover:text-slate-800"
                    onClick={clearFilters}
                  >
                    <FiX className="mr-1.5" size={14} />
                    Reset
                  </Button>
                )}
              </div>
            </CardHeader>

            <CardContent className="bg-white p-4 sm:p-5">
              <div className="grid gap-3 lg:grid-cols-12">
                <div className="relative lg:col-span-4">
                  <FiSearch
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    size={16}
                  />
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-10 rounded-xl border-slate-200 pl-10 shadow-sm focus-visible:ring-4 focus-visible:ring-indigo-500/10"
                    placeholder="Search by name, code, email or phone…"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>

                <div className="lg:col-span-3">
                  <div className="relative">
                    <select
                      aria-label="Status"
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                    >
                      {STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <FiChevronDown
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                      size={14}
                    />
                  </div>
                </div>

                <div className="lg:col-span-3">
                  <div className="relative">
                    <select
                      aria-label="Company"
                      value={filterCompany}
                      onChange={(e) => {
                        setFilterCompany(e.target.value);
                        setFilterBranch('all');
                      }}
                      className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                    >
                      <option value="all">All companies</option>
                      {companies?.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <FiChevronDown
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                      size={14}
                    />
                  </div>
                </div>

                <div className="lg:col-span-2">
                  <div className="relative">
                    <select
                      aria-label="Branch"
                      value={filterBranch}
                      onChange={(e) => setFilterBranch(e.target.value)}
                      className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                    >
                      <option value="all">All branches</option>
                      {filteredBranchesFilter.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                    <FiChevronDown
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                      size={14}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Table card */}
          <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <CardHeader className="flex flex-col gap-3 border-b border-slate-100 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600">
                  <FiUsers size={14} />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-800">
                    Employee directory
                  </CardTitle>
                  <CardDescription className="text-[11px] text-slate-500">
                    {empLoading
                      ? 'Loading employees…'
                      : `${filteredEmployees.length.toLocaleString('en-IN')} record${
                          filteredEmployees.length === 1 ? '' : 's'
                        } · Click a row to view details`}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <div className="overflow-x-auto">
              <Table className="min-w-[1100px]">
                <TableHeader>
                  <TableRow className="border-slate-100 bg-slate-50/70 hover:bg-slate-50/70">
                    <TableHead>
                      <TableHeadLabel>Employee</TableHeadLabel>
                    </TableHead>
                    <TableHead>
                      <TableHeadLabel>Contact</TableHeadLabel>
                    </TableHead>
                    <TableHead>
                      <TableHeadLabel>Company</TableHeadLabel>
                    </TableHead>
                    <TableHead>
                      <TableHeadLabel>Branch</TableHeadLabel>
                    </TableHead>
                    <TableHead>
                      <TableHeadLabel>Joining</TableHeadLabel>
                    </TableHead>
                    <TableHead>
                      <TableHeadLabel>Status</TableHeadLabel>
                    </TableHead>
                    <TableHead className="w-20 text-right">
                      <TableHeadLabel align="right">Actions</TableHeadLabel>
                    </TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {empLoading &&
                    Array.from({ length: 8 }).map((_, index) => (
                      <TableRow key={`skeleton-${index}`} className="border-slate-100">
                        {Array.from({ length: TABLE_COLUMN_COUNT }).map((__, cellIndex) => (
                          <TableCell key={cellIndex}>
                            <div className="h-4 animate-pulse rounded bg-slate-100" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}

                  {!empLoading &&
                    filteredEmployees.map((employee) => {
                      const statusColors: Record<string, string> = {
                        active: 'border-emerald-200/70 bg-emerald-50 text-emerald-700',
                        'on-leave': 'border-amber-200/70 bg-amber-50 text-amber-700',
                        inactive: 'border-red-200/70 bg-red-50 text-red-700',
                      };
                      const statusLabel: Record<string, string> = {
                        active: 'Active',
                        'on-leave': 'On leave',
                        inactive: 'Inactive',
                      };
                      const initials = `${employee.first_name?.[0] ?? ''}${
                        employee.last_name?.[0] ?? ''
                      }`.toUpperCase();

                      return (
                        <TableRow
                          key={employee.id}
                          className="cursor-pointer border-slate-100 transition-colors hover:bg-slate-50/70"
                          onClick={() => handleView(employee)}
                        >
                          <TableCell>
                            <div className="flex min-w-[220px] items-center gap-2.5">
                              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[11px] font-bold text-white">
                                {initials || 'E'}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-900">
                                  {employee.first_name} {employee.last_name}
                                </p>
                                {employee.employee_code && (
                                  <p className="truncate font-mono text-[11px] text-slate-500">
                                    {employee.employee_code}
                                  </p>
                                )}
                              </div>
                            </div>
                          </TableCell>

                          <TableCell>
                            <div className="min-w-[190px]">
                              {employee.email && (
                                <p className="truncate text-sm text-slate-700">
                                  {employee.email}
                                </p>
                              )}
                              {employee.phone && (
                                <p className="truncate text-[11px] text-slate-500">
                                  {employee.phone}
                                </p>
                              )}
                              {!employee.email && !employee.phone && (
                                <span className="text-sm text-slate-400">—</span>
                              )}
                            </div>
                          </TableCell>

                          <TableCell>
                            <span className="text-sm text-slate-700">
                              {employee.company?.name || '—'}
                            </span>
                          </TableCell>

                          <TableCell>
                            <span className="text-sm text-slate-700">
                              {employee.branch?.name || '—'}
                            </span>
                          </TableCell>

                          <TableCell className="whitespace-nowrap text-sm text-slate-600">
                            {formatDate(employee.joining_date)}
                          </TableCell>

                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                                statusColors[employee.status] ||
                                'border-slate-200 bg-slate-50 text-slate-600'
                              }`}
                            >
                              {statusLabel[employee.status] || employee.status}
                            </Badge>
                          </TableCell>

                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleEdit(employee)}
                                className="grid h-8 w-8 place-items-center rounded-lg text-indigo-500 transition hover:bg-indigo-50 hover:text-indigo-700"
                                title="Edit"
                              >
                                <FiEdit size={15} />
                              </button>
                              <button
                                onClick={() => handleDelete(employee)}
                                className="grid h-8 w-8 place-items-center rounded-lg text-red-500 transition hover:bg-red-50 hover:text-red-700"
                                title="Delete"
                              >
                                <FiTrash2 size={15} />
                              </button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}

                  {!empLoading && !filteredEmployees.length && (
                    <TableRow>
                      <TableCell colSpan={TABLE_COLUMN_COUNT} className="py-20 text-center">
                        <div className="mx-auto max-w-md px-4">
                          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-slate-200/70">
                            <FiFilter className="h-6 w-6 text-slate-400" />
                          </div>
                          <p className="mt-4 text-base font-semibold text-slate-800">
                            No employees found
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            Try adjusting the status, company, branch, or search term.
                          </p>
                          <Button
                            className="mt-5 rounded-lg"
                            variant="outline"
                            onClick={clearFilters}
                          >
                            <FiFilter className="mr-2" size={14} />
                            Reset filters
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* Employee detail view (opens on row click)                 */}
      {/* ══════════════════════════════════════════════════════════ */}
      {isViewPanelOpen && viewingEmployee && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm">
              <div className="rounded-2xl bg-white p-8 text-sm text-slate-600 shadow-xl">
                Loading details…
              </div>
            </div>
          }
        >
          <Offcanvas
            isOpen={isViewPanelOpen}
            title={`${viewingEmployee.first_name} ${viewingEmployee.last_name}`}
            onClose={() => setIsViewPanelOpen(false)}
            className="employees-detail-offcanvas"
            footer={
              <div className="flex w-full justify-between gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsViewPanelOpen(false)}
                  className="rounded-xl"
                >
                  <FiX className="mr-2" size={14} /> Close
                </Button>
                <Button
                  onClick={() => {
                    setIsViewPanelOpen(false);
                    handleEdit(viewingEmployee);
                  }}
                  className="rounded-xl bg-indigo-600 font-semibold hover:bg-indigo-700"
                >
                  <FiEdit className="mr-2" size={14} /> Edit
                </Button>
              </div>
            }
          >
            <div className="employees-form-scroll space-y-4 pr-2">
              {/* Header summary */}
              <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
                <div className="flex items-start gap-3">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-base font-bold text-white shadow-sm">
                    {`${viewingEmployee.first_name?.[0] ?? ''}${
                      viewingEmployee.last_name?.[0] ?? ''
                    }`.toUpperCase() || 'E'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-bold text-slate-900">
                      {viewingEmployee.first_name} {viewingEmployee.last_name}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                          viewingEmployee.status === 'active'
                            ? 'border-emerald-200/70 bg-emerald-50 text-emerald-700'
                            : viewingEmployee.status === 'on-leave'
                              ? 'border-amber-200/70 bg-amber-50 text-amber-700'
                              : 'border-red-200/70 bg-red-50 text-red-700'
                        }`}
                      >
                        {viewingEmployee.status === 'on-leave'
                          ? 'On leave'
                          : viewingEmployee.status}
                      </Badge>
                      {viewingEmployee.employee_code && (
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 font-mono text-[11px] text-slate-600">
                          {viewingEmployee.employee_code}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Contact */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-3.5 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Contact
                  </p>
                </div>
                <div className="divide-y divide-slate-100">
                  <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      <FiMail size={12} /> Email
                    </span>
                    <span className="min-w-0 truncate text-xs font-semibold text-slate-800">
                      {viewingEmployee.email || '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      <FiPhone size={12} /> Phone
                    </span>
                    <span className="text-xs font-semibold text-slate-800">
                      {viewingEmployee.phone || '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      <FiMapPin size={12} /> Address
                    </span>
                    <span className="min-w-0 max-w-[260px] whitespace-pre-line text-right text-xs font-semibold text-slate-800">
                      {viewingEmployee.address || '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Company & role */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-3.5 py-2.5">
                  <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <FiBriefcase size={12} /> Company & role
                  </p>
                </div>
                <div className="divide-y divide-slate-100">
                  <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      Company
                    </span>
                    <span className="text-xs font-semibold text-slate-800">
                      {viewingEmployee.company?.name || '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      Branch
                    </span>
                    <span className="text-xs font-semibold text-slate-800">
                      {viewingEmployee.branch?.name || '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      Department
                    </span>
                    <span className="text-xs font-semibold text-slate-800">
                      {viewingEmployee.department?.name || '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      Designation
                    </span>
                    <span className="text-xs font-semibold text-slate-800">
                      {viewingEmployee.designation?.title || '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      Employment type
                    </span>
                    <span className="text-xs font-semibold text-slate-800">
                      {viewingEmployee.employment_type || '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      Work location
                    </span>
                    <span className="text-xs font-semibold text-slate-800">
                      {viewingEmployee.work_location || '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Compensation */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-3.5 py-2.5">
                  <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <FiDollarSign size={12} /> Compensation
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 p-3.5">
                  {[
                    { label: 'CTC', value: viewingEmployee.ctc },
                    { label: 'Gross', value: viewingEmployee.gross },
                    { label: 'Basic', value: viewingEmployee.basic },
                    { label: 'HRA', value: viewingEmployee.hra },
                    { label: 'DA', value: viewingEmployee.da },
                    { label: 'Allowances', value: viewingEmployee.allowances },
                    { label: 'PF', value: viewingEmployee.pf },
                    { label: 'ESI', value: viewingEmployee.esi },
                    { label: 'Professional tax', value: viewingEmployee.professional_tax },
                    { label: 'TDS', value: viewingEmployee.tds },
                  ].map((row) => (
                    <div
                      key={row.label}
                      className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5"
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        {row.label}
                      </p>
                      <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">
                        {safeCurrency(row.value)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Lifecycle */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-3.5 py-2.5">
                  <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <FiCalendar size={12} /> Lifecycle
                  </p>
                </div>
                <div className="divide-y divide-slate-100">
                  {[
                    { label: 'Joining date', value: viewingEmployee.joining_date },
                    { label: 'Confirmation date', value: viewingEmployee.confirmation_date },
                    { label: 'Promotion date', value: viewingEmployee.promotion_date },
                    { label: 'Transfer date', value: viewingEmployee.transfer_date },
                    { label: 'Increment date', value: viewingEmployee.increment_date },
                    { label: 'Suspension date', value: viewingEmployee.suspension_date },
                    { label: 'Exit date', value: viewingEmployee.exit_date },
                    {
                      label: 'Full & final settlement',
                      value: viewingEmployee.full_final_settlement_date,
                    },
                  ]
                    .filter((row) => row.value)
                    .map((row) => (
                      <div
                        key={row.label}
                        className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                      >
                        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                          {row.label}
                        </span>
                        <span className="text-xs font-semibold text-slate-800">
                          {formatDate(row.value)}
                        </span>
                      </div>
                    ))}
                </div>
              </div>

              {/* Attendance flags */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-3.5 py-2.5">
                  <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <FiClock size={12} /> Attendance flags
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5 p-3.5">
                  {[
                    { label: 'GPS', value: viewingEmployee.gps_attendance },
                    { label: 'Mobile', value: viewingEmployee.mobile_attendance },
                    { label: 'Web', value: viewingEmployee.web_attendance },
                    { label: 'Shift', value: viewingEmployee.shift_attendance },
                    { label: 'Late mark', value: viewingEmployee.late_mark },
                    { label: 'Early exit', value: viewingEmployee.early_exit },
                    { label: 'Half day', value: viewingEmployee.half_day },
                    { label: 'Overtime', value: viewingEmployee.overtime },
                    { label: 'Missed punch', value: viewingEmployee.missed_punch },
                    {
                      label: 'Biometric pending',
                      value: viewingEmployee.pending_biometric_scan,
                    },
                  ]
                    .filter((flag) => flag.value)
                    .map((flag) => (
                      <span
                        key={flag.label}
                        className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-700"
                      >
                        {flag.label}
                      </span>
                    ))}
                  {[
                    viewingEmployee.gps_attendance,
                    viewingEmployee.mobile_attendance,
                    viewingEmployee.web_attendance,
                    viewingEmployee.shift_attendance,
                    viewingEmployee.late_mark,
                    viewingEmployee.early_exit,
                    viewingEmployee.half_day,
                    viewingEmployee.overtime,
                    viewingEmployee.missed_punch,
                    viewingEmployee.pending_biometric_scan,
                  ].every((v) => !v) && (
                    <span className="text-xs text-slate-400">No attendance flags</span>
                  )}
                </div>
              </div>
            </div>
          </Offcanvas>
        </Suspense>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* Form offcanvas (Create / Edit)                            */}
      {/* ══════════════════════════════════════════════════════════ */}
      {isPanelOpen && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm">
              <div className="rounded-2xl bg-white p-8 text-sm text-slate-600 shadow-xl">
                Loading form…
              </div>
            </div>
          }
        >
          <Offcanvas
            isOpen={isPanelOpen}
            title={editingId ? 'Edit employee' : 'New employee'}
            onClose={() => setIsPanelOpen(false)}
            className="employees-offcanvas-wide"
            footer={
              <div className="flex w-full justify-between">
                <Button
                  variant="outline"
                  onClick={() => setIsPanelOpen(false)}
                  disabled={submitting}
                  className="rounded-xl"
                >
                  <FiX className="mr-2" size={14} /> Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="rounded-xl bg-indigo-600 font-semibold hover:bg-indigo-700"
                >
                  {submitting ? 'Saving…' : editingId ? 'Update employee' : 'Create employee'}
                </Button>
              </div>
            }
          >
            <div className="employees-form-scroll space-y-5 pr-2">
              {/* Basic information */}
              <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-indigo-500" /> Basic information
                </legend>
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {renderField('Employee code', 'employee_code')}
                  {renderSelect(
                    'Status',
                    'status',
                    STATUS_OPTIONS.filter((o) => o.value !== 'all').map((o) => ({
                      value: o.value,
                      label: o.label,
                    }))
                  )}
                  {renderField('First name', 'first_name', 'text', true)}
                  {renderField('Last name', 'last_name', 'text', true)}
                  {renderField('Email', 'email', 'email', true)}
                  {renderField('Phone', 'phone', 'tel', true)}
                  {renderSelect('Gender', 'gender', GENDER_OPTIONS, true)}
                  {renderField('Date of birth', 'date_of_birth', 'date')}
                  {renderSelect('Blood group', 'blood_group', BLOOD_GROUP_OPTIONS)}
                  {renderSelect('Marital status', 'marital_status', MARITAL_OPTIONS)}
                </div>
              </fieldset>

              {/* Company & role */}
              <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-violet-500" /> Company & role
                </legend>
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {renderSelect(
                    'Company',
                    'company_id',
                    (companies || []).map((c) => ({ value: c.id, label: c.name }))
                  )}
                  <div className="min-w-0">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Branch
                    </label>
                    <div className="relative">
                      <select
                        value={String(formData.branch_id ?? '')}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            branch_id: e.target.value ? Number(e.target.value) : null,
                          }))
                        }
                        disabled={!formData.company_id}
                        className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                      >
                        <option value="">
                          {formData.company_id ? 'Select branch' : 'Select company first'}
                        </option>
                        {filteredBranchesForm.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                      <FiChevronDown
                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                        size={14}
                      />
                    </div>
                  </div>
                  {renderSelect(
                    'Department',
                    'department_id',
                    (departments || []).map((d) => ({ value: d.id, label: d.name }))
                  )}
                  {renderSelect(
                    'Designation',
                    'designation_id',
                    (designations || []).map((d) => ({ value: d.id, label: d.title }))
                  )}
                  {renderSelect(
                    'Reporting manager',
                    'reporting_manager_id',
                    (reportingManagers || []).map((m) => ({
                      value: m.id,
                      label: `${m.first_name} ${m.last_name}`,
                    }))
                  )}
                  {renderSelect('Employment type', 'employment_type', EMPLOYMENT_TYPE_OPTIONS)}
                  {renderField('Work location', 'work_location')}
                </div>
              </fieldset>

              {/* Compensation */}
              <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Compensation
                </legend>
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {renderSelect('Salary type', 'salary_type', SALARY_TYPE_OPTIONS)}
                  {renderField('CTC (₹)', 'ctc', 'number')}
                  {renderField('Gross (₹)', 'gross', 'number')}
                  {renderField('Basic (₹)', 'basic', 'number')}
                  {renderField('HRA (₹)', 'hra', 'number')}
                  {renderField('DA (₹)', 'da', 'number')}
                  {renderField('Allowances (₹)', 'allowances', 'number')}
                  {renderField('PF (₹)', 'pf', 'number')}
                  {renderField('ESI (₹)', 'esi', 'number')}
                  {renderField('Professional tax (₹)', 'professional_tax', 'number')}
                  {renderField('TDS (₹)', 'tds', 'number')}
                  {renderField('UAN', 'uan')}
                  {renderField('ESIC number', 'esic_number')}
                  <div className="min-w-0 sm:col-span-2 lg:col-span-3">
                    {renderField('Bank details', 'bank_details', 'textarea')}
                  </div>
                </div>
              </fieldset>

              {/* Attendance flags */}
              <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-amber-500" /> Attendance
                </legend>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {renderToggle('Pending biometric scan', 'pending_biometric_scan')}
                  {renderToggle('Manual approval', 'manual_attendance_approval')}
                  {renderToggle('GPS attendance', 'gps_attendance')}
                  {renderToggle('Mobile attendance', 'mobile_attendance')}
                  {renderToggle('Web attendance', 'web_attendance')}
                  {renderToggle('Shift attendance', 'shift_attendance')}
                  {renderToggle('Late mark', 'late_mark')}
                  {renderToggle('Early exit', 'early_exit')}
                  {renderToggle('Half day', 'half_day')}
                  {renderToggle('Overtime', 'overtime')}
                  {renderToggle('Missed punch', 'missed_punch')}
                  {renderToggle('Attendance correction request', 'attendance_correction_request')}
                </div>
              </fieldset>

              {/* Personal information */}
              <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-teal-500" /> Personal information
                </legend>
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="min-w-0 sm:col-span-2 lg:col-span-3">
                    {renderField('Address', 'address', 'textarea')}
                  </div>
                  <div className="min-w-0 sm:col-span-2 lg:col-span-3">
                    {renderField('Emergency contact', 'emergency_contact', 'textarea')}
                  </div>
                  <div className="min-w-0 sm:col-span-2 lg:col-span-3">
                    {renderField('Family details', 'family_details', 'textarea')}
                  </div>
                  <div className="min-w-0 sm:col-span-2 lg:col-span-3">
                    {renderField('References', 'references', 'textarea')}
                  </div>
                  <div className="min-w-0 sm:col-span-2 lg:col-span-3">
                    {renderField('Education', 'education', 'textarea')}
                  </div>
                  <div className="min-w-0 sm:col-span-2 lg:col-span-3">
                    {renderField('Experience', 'experience', 'textarea')}
                  </div>
                  <div className="min-w-0 sm:col-span-2 lg:col-span-3">
                    {renderField('Skills', 'skills', 'textarea')}
                  </div>
                  <div className="min-w-0 sm:col-span-2 lg:col-span-3">
                    {renderField('Languages', 'languages', 'textarea')}
                  </div>
                  {renderField('Passport', 'passport')}
                  {renderField('Driving license', 'driving_license')}
                  {renderField('Aadhaar', 'aadhaar')}
                  {renderField('PAN', 'pan')}
                  {renderField('Voter ID', 'voter_id')}
                </div>
              </fieldset>

              {/* Documents */}
              <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-violet-500" /> Documents
                </legend>
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="min-w-0 sm:col-span-2">
                    {renderField('Documents (URLs or IDs)', 'documents', 'textarea')}
                  </div>
                  {renderField('Document expiry date', 'document_expiry', 'date')}
                </div>
              </fieldset>

              {/* Lifecycle */}
              <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-rose-500" /> Employee lifecycle
                </legend>
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {renderField('Joining date', 'joining_date', 'date', true)}
                  {renderField('Confirmation date', 'confirmation_date', 'date')}
                  {renderField('Promotion date', 'promotion_date', 'date')}
                  {renderField('Transfer date', 'transfer_date', 'date')}
                  {renderField('Increment date', 'increment_date', 'date')}
                  {renderField('Suspension date', 'suspension_date', 'date')}
                  {renderField('Exit date', 'exit_date', 'date')}
                  {renderField('Full & final settlement date', 'full_final_settlement_date', 'date')}
                </div>
              </fieldset>
            </div>
          </Offcanvas>
        </Suspense>
      )}
    </>
  );
}

export default EmployeesPage;