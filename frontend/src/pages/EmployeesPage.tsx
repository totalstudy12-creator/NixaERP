// src/pages/EmployeesPage.tsx
import { useEffect, useState, useCallback, useMemo, lazy, Suspense, memo } from 'react';
import {
  FiPlus, FiRefreshCw, FiTrash2, FiEdit, FiDownload,
  FiChevronDown, FiChevronRight, FiUsers, FiUserCheck,
  FiUserX, FiCalendar, FiMapPin, FiBriefcase, FiDollarSign,
  FiClock, FiBook, FiAlertCircle, FiFilter, FiSearch, FiUser
} from 'react-icons/fi';
import clsx from 'clsx';

// ---------- Lazy loaded heavy components ----------
const ModernDataTable = lazy(() =>
  import('../components/ModernDataTable').then(m => ({ default: m.ModernDataTable }))
);
const Offcanvas = lazy(() =>
  import('../components/Offcanvas').then(m => ({ default: m.Offcanvas }))
);

import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';

// ---------- Simple API Cache Hook ----------
const cache = new Map<string, { data: any; timestamp: number }>();

function useApiCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = 300_000
): {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (skipCache = false) => {
    if (!skipCache) {
      const entry = cache.get(key);
      if (entry && Date.now() - entry.timestamp < ttlMs) {
        setData(entry.data);
        setLoading(false);
        return;
      }
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetcher();
      const result = Array.isArray(res) ? res : (res as any).data ?? [];
      cache.set(key, { data: result, timestamp: Date.now() });
      setData(result);
    } catch (err: any) {
      const msg = err.message || 'Failed to load';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [key, fetcher, ttlMs]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refresh: () => fetchData(true) };
}

// ---------- Types ----------
interface Company { id: number; name: string; }
interface Branch { id: number; name: string; company_id?: number; }
interface Department { id: number; name: string; }
interface Designation { id: number; title: string; }

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

type EmployeeFormData = Partial<Omit<Employee, 'id' | 'company' | 'branch' | 'department' | 'designation' | 'reporting_manager'>>;

// ---------- Skeleton Components (Memoised) ----------
const StatCardSkeleton = memo(() => (
  <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-4 animate-pulse">
    <div className="h-10 w-10 rounded-xl bg-slate-200" />
    <div className="space-y-2 flex-1">
      <div className="h-3 w-16 bg-slate-200 rounded" />
      <div className="h-6 w-8 bg-slate-200 rounded" />
    </div>
  </div>
));

const TableSkeleton = memo(() => (
  <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4 animate-pulse">
    <div className="h-6 w-48 bg-slate-200 rounded" />
    {[...Array(10)].map((_, i) => (
      <div key={i} className="flex gap-4">
        <div className="h-4 w-1/4 bg-slate-200 rounded" />
        <div className="h-4 w-1/5 bg-slate-200 rounded" />
        <div className="h-4 w-1/6 bg-slate-200 rounded" />
        <div className="h-4 w-1/6 bg-slate-200 rounded" />
        <div className="h-4 w-1/4 bg-slate-200 rounded" />
      </div>
    ))}
  </div>
));

const StatCard = memo(({ icon: Icon, label, value, tone }: {
  icon: any;
  label: string;
  value: number;
  tone: 'blue' | 'emerald' | 'amber' | 'rose';
}) => {
  const bg = tone === 'blue' ? 'bg-blue-100 text-blue-600' :
             tone === 'emerald' ? 'bg-emerald-100 text-emerald-600' :
             tone === 'amber' ? 'bg-amber-100 text-amber-600' :
             'bg-rose-100 text-rose-600';
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${bg}`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
});

// ---------- Main Component ----------
export function EmployeesPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCompany, setFilterCompany] = useState('all');
  const [filterBranch, setFilterBranch] = useState('all');

  // Form state
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<EmployeeFormData>({
    employee_code: '', first_name: '', last_name: '', email: '', phone: '',
    gender: '', date_of_birth: '', blood_group: '', marital_status: '',
    company_id: null, branch_id: null, department_id: null, designation_id: null,
    reporting_manager_id: null, employment_type: '', work_location: '', salary_type: '',
    ctc: 0, gross: 0, basic: 0, hra: 0, da: 0, allowances: 0,
    pf: 0, esi: 0, professional_tax: 0, tds: 0, bank_details: '',
    uan: '', esic_number: '',
    pending_biometric_scan: false, manual_attendance_approval: false,
    gps_attendance: false, mobile_attendance: false, web_attendance: false,
    shift_attendance: false, late_mark: false, early_exit: false,
    half_day: false, overtime: false, missed_punch: false,
    attendance_correction_request: false,
    address: '', emergency_contact: '', family_details: '', references: '',
    education: '', experience: '', skills: '', languages: '',
    passport: '', driving_license: '', aadhaar: '', pan: '', voter_id: '',
    documents: '', document_expiry: '',
    joining_date: '', confirmation_date: '', promotion_date: '', transfer_date: '',
    increment_date: '', suspension_date: '', exit_date: '', full_final_settlement_date: '',
    status: 'active',
  });
  const [submitting, setSubmitting] = useState(false);

  // UI expand sections
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    basic: true,
    company: true,
    salary: false,
    attendance: false,
    personal: false,
    documents: false,
    lifecycle: false,
  });

  const { showSuccess, showError } = useNotification();

  // ---------- API Caching ----------
  const {
    data: employees,
    loading: empLoading,
    error: empError,
    refresh: refreshEmps,
  } = useApiCache<Employee[]>('employees', () => apiClient.getEmployees());

  const { data: companies } = useApiCache<Company[]>('companies', () => apiClient.getCompanies());
  const { data: branches } = useApiCache<Branch[]>('branches', () => apiClient.getBranches());
  const { data: departments } = useApiCache<Department[]>('departments', () => apiClient.getDepartments?.() ?? []);
  const { data: designations } = useApiCache<Designation[]>('designations', () => apiClient.getDesignations?.() ?? []);
  const { data: reportingManagers } = useApiCache<Employee[]>('managers', () => apiClient.getEmployees?.() ?? []);

  // ---------- Filter & Search ----------
  const filteredEmployees = useMemo(() => {
    if (!employees) return [];
    let filtered = [...employees];
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(e =>
        `${e.first_name} ${e.last_name}`.toLowerCase().includes(term) ||
        e.employee_code?.toLowerCase().includes(term) ||
        e.email?.toLowerCase().includes(term) ||
        e.phone?.toLowerCase().includes(term)
      );
    }
    if (filterStatus !== 'all') filtered = filtered.filter(e => e.status === filterStatus);
    if (filterCompany !== 'all') filtered = filtered.filter(e => e.company_id === parseInt(filterCompany));
    if (filterBranch !== 'all') filtered = filtered.filter(e => e.branch_id === parseInt(filterBranch));
    return filtered;
  }, [employees, searchTerm, filterStatus, filterCompany, filterBranch]);

  const summary = useMemo(() => ({
    total: employees?.length || 0,
    active: employees?.filter(e => e.status === 'active').length || 0,
    onLeave: employees?.filter(e => e.status === 'on-leave').length || 0,
    inactive: employees?.filter(e => e.status === 'inactive').length || 0,
  }), [employees]);

  // ---------- Pagination (client side) ----------
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;
  const totalPages = Math.ceil(filteredEmployees.length / rowsPerPage);
  const paginatedEmployees = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredEmployees.slice(start, start + rowsPerPage);
  }, [filteredEmployees, currentPage]);

  useEffect(() => setCurrentPage(1), [searchTerm, filterStatus, filterCompany, filterBranch]);

  // ---------- Filter branches for FORM ----------
  const filteredBranchesForm = useMemo(() => {
    if (formData.company_id && branches) {
      const companyId = parseInt(String(formData.company_id));
      return branches.filter(b => b.company_id === companyId);
    }
    return [];
  }, [formData.company_id, branches]);

  const filteredBranchesFilter = useMemo(() => {
    if (filterCompany !== 'all' && branches) {
      return branches.filter(b => b.company_id === parseInt(filterCompany));
    }
    return branches || [];
  }, [filterCompany, branches]);

  // ---------- CRUD Handlers ----------
  const handleCreate = useCallback(() => {
    setEditingId(null);
    const newCode = `EMP-${String((employees?.length ?? 0) + 1).padStart(3, '0')}`;
    setFormData({
      employee_code: newCode,
      first_name: '', last_name: '', email: '', phone: '',
      gender: '', date_of_birth: '', blood_group: '', marital_status: '',
      company_id: null, branch_id: null, department_id: null, designation_id: null,
      reporting_manager_id: null, employment_type: '', work_location: '', salary_type: '',
      ctc: 0, gross: 0, basic: 0, hra: 0, da: 0, allowances: 0,
      pf: 0, esi: 0, professional_tax: 0, tds: 0, bank_details: '',
      uan: '', esic_number: '',
      pending_biometric_scan: false, manual_attendance_approval: false,
      gps_attendance: false, mobile_attendance: false, web_attendance: false,
      shift_attendance: false, late_mark: false, early_exit: false,
      half_day: false, overtime: false, missed_punch: false,
      attendance_correction_request: false,
      address: '', emergency_contact: '', family_details: '', references: '',
      education: '', experience: '', skills: '', languages: '',
      passport: '', driving_license: '', aadhaar: '', pan: '', voter_id: '',
      documents: '', document_expiry: '',
      joining_date: '', confirmation_date: '', promotion_date: '', transfer_date: '',
      increment_date: '', suspension_date: '', exit_date: '', full_final_settlement_date: '',
      status: 'active',
    });
    setIsPanelOpen(true);
  }, [employees]);

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

  const handleDelete = useCallback(async (employee: Employee) => {
    if (!confirm(`Delete ${employee.first_name} ${employee.last_name}?`)) return;
    try {
      await apiClient.deleteEmployee(employee.id);
      showSuccess('Employee deleted', `${employee.first_name} ${employee.last_name} removed.`);
      addAppLog({ module: 'Employees', action: 'Delete employee', status: 'success', message: `Deleted ${employee.first_name} ${employee.last_name}` });
      refreshEmps();
    } catch (err: any) {
      showError('Delete failed', err.message);
    }
  }, [refreshEmps, showError, showSuccess]);

  const validateForm = (): boolean => {
    if (!formData.first_name?.trim()) { showError('Validation', 'First name is required.'); return false; }
    if (!formData.last_name?.trim()) { showError('Validation', 'Last name is required.'); return false; }
    if (!formData.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) { showError('Validation', 'Valid email is required.'); return false; }
    if (!formData.phone?.trim() || !/^[0-9+\-()\s]{7,15}$/.test(formData.phone)) { showError('Validation', 'Valid phone number required (7-15 digits).'); return false; }
    if (!formData.joining_date) { showError('Validation', 'Joining date is required.'); return false; }
    if (!formData.gender) { showError('Validation', 'Gender is required.'); return false; }
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
      reporting_manager_id: formData.reporting_manager_id ? parseInt(String(formData.reporting_manager_id)) : null,
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
        addAppLog({ module: 'Employees', action: 'Update employee', status: 'success', message: `Updated ${formData.first_name} ${formData.last_name}` });
      } else {
        await apiClient.createEmployee(payload);
        showSuccess('Employee created', `${formData.first_name} ${formData.last_name} added.`);
        addAppLog({ module: 'Employees', action: 'Create employee', status: 'success', message: `Created ${formData.first_name} ${formData.last_name}` });
      }
      setIsPanelOpen(false);
      refreshEmps();
    } catch (err: any) {
      showError('Save failed', err.message);
      addAppLog({ module: 'Employees', action: 'Save employee', status: 'error', message: err.message });
    } finally {
      setSubmitting(false);
    }
  }, [formData, editingId, refreshEmps, showSuccess, showError]);

  const handleExport = useCallback(() => {
    const headers = ['Employee Code', 'First Name', 'Last Name', 'Email', 'Phone', 'Gender', 'DOB', 'Status', 'Company', 'Branch', 'Address'];
    const rows = filteredEmployees.map(e => [
      e.employee_code, e.first_name, e.last_name, e.email, e.phone,
      e.gender, e.date_of_birth, e.status,
      e.company?.name || '', e.branch?.name || '', e.address
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `employees-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    showSuccess('Export', 'Employee data exported to CSV.');
  }, [filteredEmployees, showSuccess]);

  // ---------- UI Helpers ----------
  const toggleSection = useCallback((section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  }, []);

  const ToggleSwitch = memo(({ checked, onChange, label }: {
    checked: boolean;
    onChange: (val: boolean) => void;
    label: string;
  }) => (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-700">{label}</span>
      <button
        type="button"
        className={clsx(
          'relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
          checked ? 'bg-blue-600' : 'bg-gray-300'
        )}
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
      >
        <span className={clsx(
          'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
          checked ? 'translate-x-5' : 'translate-x-0'
        )} />
      </button>
    </div>
  ));

  const renderSection = useCallback((title: string, sectionKey: string, icon: React.ReactNode, children: React.ReactNode) => (
    <div className="border-b border-gray-200 pb-4 mb-4 last:border-0">
      <button
        type="button"
        onClick={() => toggleSection(sectionKey)}
        className="flex items-center justify-between w-full text-left group"
      >
        <div className="flex items-center gap-2 text-base font-semibold text-gray-800">
          {icon}
          <span>{title}</span>
        </div>
        <span className="text-gray-400 group-hover:text-gray-600 transition-transform duration-200">
          {expandedSections[sectionKey] ? <FiChevronDown size={20} /> : <FiChevronRight size={20} />}
        </span>
      </button>
      {expandedSections[sectionKey] && (
        <div className="mt-4 space-y-4 animate-fadeIn">{children}</div>
      )}
    </div>
  ), [expandedSections, toggleSection]);

  const renderInput = useCallback((
    label: string,
    field: keyof EmployeeFormData,
    type: 'text' | 'email' | 'tel' | 'date' | 'number' | 'select' | 'textarea' | 'checkbox' = 'text',
    options?: any[]
  ) => {
    const value = formData[field] ?? '';
    const id = `field-${field}`;

    if (type === 'checkbox') {
      return <ToggleSwitch checked={!!value} onChange={(val) => setFormData(prev => ({ ...prev, [field]: val }))} label={label} />;
    }

    return (
      <div>
        <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        {type === 'select' ? (
          <select
            id={id}
            value={value as string}
            onChange={(e) => setFormData(prev => ({ ...prev, [field]: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200"
          >
            <option value="">Select {label}</option>
            {options?.map(opt => (
              <option key={opt.id} value={opt.id}>{opt.name || opt.title}</option>
            ))}
          </select>
        ) : type === 'textarea' ? (
          <textarea
            id={id}
            value={value as string}
            onChange={(e) => setFormData(prev => ({ ...prev, [field]: e.target.value }))}
            rows={2}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200"
          />
        ) : (
          <input
            id={id}
            type={type}
            value={value as string | number}
            onChange={(e) => setFormData(prev => ({ ...prev, [field]: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200"
            placeholder={`Enter ${label}`}
          />
        )}
      </div>
    );
  }, [formData]);

  // ---------- Table Columns ----------
  const columns = useMemo(() => [
    {
      name: 'Name',
      selector: (row: Employee) => `${row.first_name} ${row.last_name}`,
      sortable: true,
      cell: (row: Employee) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
            {row.first_name?.[0]}{row.last_name?.[0]}
          </div>
          <div>
            <div className="font-medium text-slate-800">{row.first_name} {row.last_name}</div>
            <div className="text-xs text-slate-400">{row.employee_code}</div>
          </div>
        </div>
      ),
      width: '200px',
    },
    {
      name: 'Email',
      selector: (row: Employee) => row.email,
      cell: (row: Employee) => <span className="text-sm text-slate-600">{row.email}</span>,
      width: '180px',
    },
    {
      name: 'Phone',
      selector: (row: Employee) => row.phone,
      cell: (row: Employee) => <span className="text-sm text-slate-600">{row.phone}</span>,
      width: '140px',
    },
    {
      name: 'Address',
      selector: (row: Employee) => row.address || '—',
      cell: (row: Employee) => <span className="text-sm text-slate-600 max-w-[200px] truncate">{row.address || '—'}</span>,
      width: '150px',
    },
    {
      name: 'Company',
      selector: (row: Employee) => row.company?.name || '-',
      cell: (row: Employee) => <span className="text-sm">{row.company?.name || '-'}</span>,
      width: '120px',
    },
    {
      name: 'Branch',
      selector: (row: Employee) => row.branch?.name || '-',
      cell: (row: Employee) => <span className="text-sm">{row.branch?.name || '-'}</span>,
      width: '120px',
    },
    {
      name: 'Status',
      selector: (row: Employee) => row.status,
      cell: (row: Employee) => {
        const statusMap: Record<string, { label: string; color: string }> = {
          active: { label: 'Active', color: 'bg-emerald-100 text-emerald-700' },
          inactive: { label: 'Inactive', color: 'bg-rose-100 text-rose-700' },
          'on-leave': { label: 'On Leave', color: 'bg-amber-100 text-amber-700' },
        };
        const s = statusMap[row.status] || statusMap.active;
        return <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${s.color}`}>{s.label}</span>;
      },
      sortable: true,
      width: '100px',
    },
    {
      name: 'Actions',
      cell: (row: Employee) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleEdit(row)}
            className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
            title="Edit"
          >
            <FiEdit size={16} />
          </button>
          <button
            onClick={() => handleDelete(row)}
            className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors"
            title="Delete"
          >
            <FiTrash2 size={16} />
          </button>
        </div>
      ),
      width: '100px',
    },
  ], [handleEdit, handleDelete]);

  // ---------- Render ----------
  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 md:p-7 text-slate-800">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 mb-6 rounded-3xl bg-slate-950 px-5 py-6 md:px-8 md:py-7 shadow-xl shadow-slate-300/50">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> Employee Management
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl flex items-center gap-3">
            <FiUsers className="text-cyan-300" /> Employees
            <span className="text-sm font-normal text-cyan-100/70 ml-2">Directory</span>
          </h1>
          <p className="text-sm text-slate-300">Manage your workforce, attendance settings, and records</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refreshEmps} disabled={empLoading} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 transition hover:bg-white/20 disabled:opacity-60">
            <FiRefreshCw className={empLoading ? 'animate-spin inline mr-1' : 'inline mr-1'} size={14} /> Refresh
          </button>
          <button onClick={handleExport} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 transition hover:bg-white/20">
            <FiDownload className="inline mr-1" size={14} /> Export
          </button>
          <button onClick={handleCreate} className="rounded-xl bg-cyan-400 text-slate-950 px-3 py-2 text-sm font-medium transition hover:bg-cyan-300 shadow-md shadow-cyan-500/20">
            <FiPlus className="inline mr-1" size={14} /> Add Employee
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <FiSearch className="absolute left-3 top-2.5 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search by name, code, email or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none placeholder:text-slate-400 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 transition-all duration-200"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FiFilter size={16} className="text-slate-500" />
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input-field w-32 text-sm rounded-xl border-slate-200 bg-white py-2 px-3 focus:ring-cyan-100">
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="on-leave">On Leave</option>
            <option value="inactive">Inactive</option>
          </select>
          <select value={filterCompany} onChange={(e) => { setFilterCompany(e.target.value); setFilterBranch('all'); }} className="input-field w-36 text-sm rounded-xl border-slate-200 bg-white py-2 px-3">
            <option value="all">All Companies</option>
            {companies?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)} className="input-field w-36 text-sm rounded-xl border-slate-200 bg-white py-2 px-3">
            <option value="all">All Branches</option>
            {filteredBranchesFilter.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {employees ? (
          <>
            <StatCard icon={FiUsers} label="Total" value={summary.total} tone="blue" />
            <StatCard icon={FiUserCheck} label="Active" value={summary.active} tone="emerald" />
            <StatCard icon={FiUser} label="On Leave" value={summary.onLeave} tone="amber" />
            <StatCard icon={FiUserX} label="Inactive" value={summary.inactive} tone="rose" />
          </>
        ) : (
          [...Array(4)].map((_, i) => <StatCardSkeleton key={i} />)
        )}
      </div>

      {/* Error banner */}
      {empError && (
        <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-2 animate-shake">
          <FiAlertCircle size={20} /> {empError}
        </div>
      )}

      {/* Table with skeleton & pagination */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <Suspense fallback={<TableSkeleton />}>
          {empLoading ? (
            <TableSkeleton />
          ) : (
            <>
              <ModernDataTable
                title="Employee Directory"
                columns={columns}
                data={paginatedEmployees}
                loading={false}
                selectable={false}
                striped
                highlightOnHover
                pointerOnHover
              />
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-3 border-t">
                  <span className="text-sm text-slate-600">
                    Showing {((currentPage - 1) * rowsPerPage) + 1} to {Math.min(currentPage * rowsPerPage, filteredEmployees.length)} of {filteredEmployees.length}
                  </span>
                  <div className="flex gap-1">
                    <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40">««</button>
                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40">‹</button>
                    <span className="px-3 py-1 text-sm font-medium">{currentPage} / {totalPages}</span>
                    <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40">›</button>
                    <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40">»»</button>
                  </div>
                </div>
              )}
            </>
          )}
        </Suspense>
      </div>

      {/* Offcanvas – lazy loaded only when opened */}
      {isPanelOpen && (
        <Suspense fallback={
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
            <div className="bg-white p-8 rounded-2xl">Loading form...</div>
          </div>
        }>
          <Offcanvas
            isOpen={isPanelOpen}
            title={editingId ? 'Edit Employee' : 'Create Employee'}
            onClose={() => setIsPanelOpen(false)}
            footer={
              <div className="flex flex-col sm:flex-row sm:justify-end gap-3">
                <button onClick={() => setIsPanelOpen(false)} className="btn btn-secondary w-full sm:w-auto" disabled={submitting}>Cancel</button>
                <button onClick={handleSubmit} disabled={submitting} className="btn btn-primary w-full sm:w-auto">
                  {submitting ? 'Saving...' : editingId ? 'Update Employee' : 'Create Employee'}
                </button>
              </div>
            }
          >
            <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
              {renderSection('Basic Information', 'basic', <FiUser size={18} className="text-blue-500" />,
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {renderInput('Employee Code', 'employee_code')}
                  {renderInput('Status', 'status', 'select', [
                    { id: 'active', name: 'Active' }, { id: 'on-leave', name: 'On Leave' }, { id: 'inactive', name: 'Inactive' }
                  ])}
                  {renderInput('First Name *', 'first_name')}
                  {renderInput('Last Name *', 'last_name')}
                  {renderInput('Email *', 'email', 'email')}
                  {renderInput('Phone *', 'phone', 'tel')}
                  {renderInput('Gender *', 'gender', 'select', [
                    { id: 'Male', name: 'Male' }, { id: 'Female', name: 'Female' }, { id: 'Other', name: 'Other' }
                  ])}
                  {renderInput('Date of Birth', 'date_of_birth', 'date')}
                  {renderInput('Blood Group', 'blood_group', 'select', [
                    { id: 'A+', name: 'A+' }, { id: 'A-', name: 'A-' }, { id: 'B+', name: 'B+' }, { id: 'B-', name: 'B-' },
                    { id: 'AB+', name: 'AB+' }, { id: 'AB-', name: 'AB-' }, { id: 'O+', name: 'O+' }, { id: 'O-', name: 'O-' }
                  ])}
                  {renderInput('Marital Status', 'marital_status', 'select', [
                    { id: 'Single', name: 'Single' }, { id: 'Married', name: 'Married' }, { id: 'Divorced', name: 'Divorced' }, { id: 'Widowed', name: 'Widowed' }
                  ])}
                </div>
              )}

              {renderSection('Company Details', 'company', <FiBriefcase size={18} className="text-indigo-500" />,
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {renderInput('Company', 'company_id', 'select', companies || [])}
                  {renderInput('Branch', 'branch_id', 'select', filteredBranchesForm)}
                  {renderInput('Department', 'department_id', 'select', departments || [])}
                  {renderInput('Designation', 'designation_id', 'select', designations || [])}
                  {renderInput('Reporting Manager', 'reporting_manager_id', 'select', reportingManagers || [])}
                  {renderInput('Employment Type', 'employment_type', 'select', [
                    { id: 'Permanent', name: 'Permanent' }, { id: 'Contract', name: 'Contract' },
                    { id: 'Intern', name: 'Intern' }, { id: 'Probation', name: 'Probation' }
                  ])}
                  {renderInput('Work Location', 'work_location')}
                </div>
              )}

              {renderSection('Salary Details', 'salary', <FiDollarSign size={18} className="text-green-500" />,
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {renderInput('Salary Type', 'salary_type', 'select', [
                    { id: 'Monthly', name: 'Monthly' }, { id: 'Daily', name: 'Daily' }, { id: 'Hourly', name: 'Hourly' }
                  ])}
                  {renderInput('CTC', 'ctc', 'number')}
                  {renderInput('Gross', 'gross', 'number')}
                  {renderInput('Basic', 'basic', 'number')}
                  {renderInput('HRA', 'hra', 'number')}
                  {renderInput('DA', 'da', 'number')}
                  {renderInput('Allowances', 'allowances', 'number')}
                  {renderInput('PF', 'pf', 'number')}
                  {renderInput('ESI', 'esi', 'number')}
                  {renderInput('Professional Tax', 'professional_tax', 'number')}
                  {renderInput('TDS', 'tds', 'number')}
                  {renderInput('Bank Details', 'bank_details', 'textarea')}
                  {renderInput('UAN', 'uan')}
                  {renderInput('ESIC Number', 'esic_number')}
                </div>
              )}

              {renderSection('Attendance', 'attendance', <FiClock size={18} className="text-purple-500" />,
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {renderInput('Pending Biometric Scan', 'pending_biometric_scan', 'checkbox')}
                  {renderInput('Manual Attendance Approval', 'manual_attendance_approval', 'checkbox')}
                  {renderInput('GPS Attendance', 'gps_attendance', 'checkbox')}
                  {renderInput('Mobile Attendance', 'mobile_attendance', 'checkbox')}
                  {renderInput('Web Attendance', 'web_attendance', 'checkbox')}
                  {renderInput('Shift Attendance', 'shift_attendance', 'checkbox')}
                  {renderInput('Late Mark', 'late_mark', 'checkbox')}
                  {renderInput('Early Exit', 'early_exit', 'checkbox')}
                  {renderInput('Half Day', 'half_day', 'checkbox')}
                  {renderInput('Overtime', 'overtime', 'checkbox')}
                  {renderInput('Missed Punch', 'missed_punch', 'checkbox')}
                  {renderInput('Attendance Correction Request', 'attendance_correction_request', 'checkbox')}
                </div>
              )}

              {renderSection('Personal Information', 'personal', <FiMapPin size={18} className="text-orange-500" />,
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {renderInput('Address', 'address', 'textarea')}
                  {renderInput('Emergency Contact', 'emergency_contact', 'textarea')}
                  {renderInput('Family Details', 'family_details', 'textarea')}
                  {renderInput('References', 'references', 'textarea')}
                  {renderInput('Education', 'education', 'textarea')}
                  {renderInput('Experience', 'experience', 'textarea')}
                  {renderInput('Skills', 'skills', 'textarea')}
                  {renderInput('Languages', 'languages', 'textarea')}
                  {renderInput('Passport', 'passport')}
                  {renderInput('Driving License', 'driving_license')}
                  {renderInput('Aadhaar', 'aadhaar')}
                  {renderInput('PAN', 'pan')}
                  {renderInput('Voter ID', 'voter_id')}
                </div>
              )}

              {renderSection('Documents', 'documents', <FiBook size={18} className="text-cyan-500" />,
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {renderInput('Documents (URLs or IDs)', 'documents', 'textarea')}
                  {renderInput('Document Expiry Date', 'document_expiry', 'date')}
                </div>
              )}

              {renderSection('Employee Lifecycle', 'lifecycle', <FiCalendar size={18} className="text-rose-500" />,
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {renderInput('Joining Date *', 'joining_date', 'date')}
                  {renderInput('Confirmation Date', 'confirmation_date', 'date')}
                  {renderInput('Promotion Date', 'promotion_date', 'date')}
                  {renderInput('Transfer Date', 'transfer_date', 'date')}
                  {renderInput('Increment Date', 'increment_date', 'date')}
                  {renderInput('Suspension Date', 'suspension_date', 'date')}
                  {renderInput('Exit Date', 'exit_date', 'date')}
                  {renderInput('Full & Final Settlement Date', 'full_final_settlement_date', 'date')}
                </div>
              )}
            </div>
          </Offcanvas>
        </Suspense>
      )}

      {/* Styles */}
      <style>{`
        .stat-card { animation: attendance-fade-up 0.38s ease-out both; }
        .stat-card:nth-child(2) { animation-delay: 0.05s; }
        .stat-card:nth-child(3) { animation-delay: 0.1s; }
        .stat-card:nth-child(4) { animation-delay: 0.15s; }
        @keyframes attendance-fade-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .live-pulse { animation: attendance-live-pulse 1.6s ease-in-out infinite; }
        @keyframes attendance-live-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .45; transform: scale(.72); } }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-shake { animation: shake 0.4s ease-in-out; }
        @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        @media (max-width: 640px) {
          .rdt_TableCol, .rdt_TableCell { white-space: nowrap; }
        }
        .rdt_TableHeader .search-container,
        .rdt_TableHeader input[type="text"] { display: none !important; }
        .rdt_TableHeader > div:last-child { display: none !important; }
        .rdt_TableCol:first-child, .rdt_TableCell:first-child { display: none !important; }
      `}</style>
    </div>
  );
}