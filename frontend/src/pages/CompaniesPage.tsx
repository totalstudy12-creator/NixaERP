import { useEffect, useState, useCallback, useMemo, lazy, Suspense, memo } from 'react';
import {
  FiPlus, FiRefreshCw, FiTrash2, FiEdit, FiDownload,
  FiChevronDown, FiChevronRight, FiBriefcase, FiMapPin,
  FiGlobe, FiAlertCircle, FiFilter, FiSearch, FiHash
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

// ---------- Types (matching DB schema) ----------
interface Company {
  id: number;
  name: string;
  code: string;
  email: string;
  gst_number?: string;
  pan_number?: string;
  type?: string;
  phone: string;
  address: string;
  website?: string;
  active: boolean;            // boolean in DB
  created_at?: string;
  updated_at?: string;
  deleted_at?: string;
}

type CompanyFormData = Partial<Omit<Company, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>>;

// ---------- Company types for dropdown ----------
const COMPANY_TYPES = [
  'Private Limited',
  'Public Limited',
  'Partnership',
  'Proprietorship',
  'LLP',
  'Others',
];

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

// ---------- Component ----------
export function CompaniesPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');  // 'all' | 'active' | 'inactive'

  // Form state
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<CompanyFormData>({
    name: '',
    code: '',
    email: '',
    gst_number: '',
    pan_number: '',
    type: '',
    phone: '',
    address: '',
    website: '',
    active: true,
  });
  const [submitting, setSubmitting] = useState(false);

  // Selection for bulk actions
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // UI expand sections
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    basic: true,
    contact: true,
  });

  const { showSuccess, showError } = useNotification();

  // ---------- API Caching ----------
  const {
    data: companies,
    loading: compLoading,
    error: compError,
    refresh: refreshCompanies,
  } = useApiCache<Company[]>('companies', () => apiClient.getCompanies());

  // ---------- Filter & Search ----------
  const filteredCompanies = useMemo(() => {
    if (!companies) return [];
    let filtered = [...companies];
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(c =>
        c.name?.toLowerCase().includes(term) ||
        c.code?.toLowerCase().includes(term) ||
        c.email?.toLowerCase().includes(term) ||
        c.phone?.toLowerCase().includes(term) ||
        c.type?.toLowerCase().includes(term) ||
        c.gst_number?.toLowerCase().includes(term) ||
        c.pan_number?.toLowerCase().includes(term)
      );
    }
    if (filterStatus === 'active') {
      filtered = filtered.filter(c => c.active === true);
    } else if (filterStatus === 'inactive') {
      filtered = filtered.filter(c => c.active === false);
    }
    return filtered;
  }, [companies, searchTerm, filterStatus]);

  const summary = useMemo(() => ({
    total: companies?.length || 0,
    active: companies?.filter(c => c.active === true).length || 0,
    inactive: companies?.filter(c => c.active === false).length || 0,
  }), [companies]);

  // ---------- Pagination (client side) ----------
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;
  const totalPages = Math.ceil(filteredCompanies.length / rowsPerPage);
  const paginatedCompanies = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredCompanies.slice(start, start + rowsPerPage);
  }, [filteredCompanies, currentPage]);

  useEffect(() => setCurrentPage(1), [searchTerm, filterStatus]);

  // ---------- CRUD Handlers ----------
  const handleCreate = useCallback(() => {
    setEditingId(null);
    setFormData({
      name: '',
      code: '',
      email: '',
      gst_number: '',
      pan_number: '',
      type: '',
      phone: '',
      address: '',
      website: '',
      active: true,
    });
    setIsPanelOpen(true);
  }, []);

  const handleEdit = useCallback((company: Company) => {
    setEditingId(company.id);
    setFormData({
      name: company.name,
      code: company.code,
      email: company.email,
      gst_number: company.gst_number || '',
      pan_number: company.pan_number || '',
      type: company.type || '',
      phone: company.phone,
      address: company.address,
      website: company.website || '',
      active: company.active,
    });
    setIsPanelOpen(true);
  }, []);

  const handleDelete = useCallback(async (company: Company) => {
    if (!confirm(`Delete company "${company.name}"?`)) return;
    try {
      await apiClient.deleteCompany(company.id);
      showSuccess('Company deleted', `${company.name} removed.`);
      addAppLog({
        module: 'Companies',
        action: 'Delete company',
        status: 'success',
        message: `Deleted company ${company.name}`,
      });
      refreshCompanies();
      setSelectedIds(prev => prev.filter(id => id !== company.id));
    } catch (err: any) {
      showError('Delete failed', err.message);
    }
  }, [refreshCompanies, showError, showSuccess]);

  // ---------- Columns ----------
  const columns = useMemo(() => [
    {
      name: 'Company Name',
      selector: (row: Company) => row.name,
      sortable: true,
      cell: (row: Company) => (
        <div className="font-medium text-slate-800">{row.name}</div>
      ),
      width: '180px',
    },
    {
      name: 'Code',
      selector: (row: Company) => row.code,
      sortable: true,
      cell: (row: Company) => <span className="text-sm text-slate-600">{row.code}</span>,
      width: '100px',
    },
    {
      name: 'Email',
      selector: (row: Company) => row.email,
      cell: (row: Company) => <span className="text-sm text-slate-600">{row.email}</span>,
      width: '200px',
    },
    {
      name: 'Phone',
      selector: (row: Company) => row.phone,
      cell: (row: Company) => <span className="text-sm text-slate-600">{row.phone}</span>,
      width: '150px',
    },
    {
      name: 'Type',
      selector: (row: Company) => row.type || '—',
      cell: (row: Company) => <span className="text-sm text-slate-600">{row.type || '—'}</span>,
      width: '140px',
    },
    {
      name: 'GST',
      selector: (row: Company) => row.gst_number || '—',
      cell: (row: Company) => <span className="text-sm text-slate-500">{row.gst_number || '—'}</span>,
      width: '130px',
    },
    {
      name: 'PAN',
      selector: (row: Company) => row.pan_number || '—',
      cell: (row: Company) => <span className="text-sm text-slate-500">{row.pan_number || '—'}</span>,
      width: '120px',
    },
    {
      name: 'Status',
      selector: (row: Company) => row.active ? 'Active' : 'Inactive',
      sortable: true,
      cell: (row: Company) => (
        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
          row.active ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
        }`}>
          {row.active ? 'Active' : 'Inactive'}
        </span>
      ),
      width: '110px',
    },
    {
      name: 'Actions',
      cell: (row: Company) => (
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

  // ---------- Bulk delete ----------
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Delete ${selectedIds.length} company(s)?`)) return;
    try {
      await Promise.all(selectedIds.map((id) => apiClient.deleteCompany(id)));
      showSuccess('Bulk delete', `${selectedIds.length} company(s) deleted.`);
      addAppLog({
        module: 'Companies',
        action: 'Bulk delete',
        status: 'success',
        message: `Deleted ${selectedIds.length} companies`,
      });
      setSelectedIds([]);
      refreshCompanies();
    } catch (err: any) {
      showError('Bulk delete failed', err.message);
    }
  };

  // ---------- Validation ----------
  const validateForm = (): boolean => {
    if (!formData.name?.trim()) {
      showError('Validation', 'Company name is required.');
      return false;
    }
    if (!formData.code?.trim()) {
      showError('Validation', 'Company code is required.');
      return false;
    }
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      showError('Validation', 'Please enter a valid email address.');
      return false;
    }
    if (formData.phone && !/^[0-9+\-()\s]{7,15}$/.test(formData.phone)) {
      showError('Validation', 'Phone number must be 7-15 digits/valid chars.');
      return false;
    }
    if (formData.website && !/^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(formData.website)) {
      showError('Validation', 'Please enter a valid website URL (optional).');
      return false;
    }
    // Optional GST/PAN validation (basic)
    if (formData.gst_number && !/^[0-9A-Z]{15}$/i.test(formData.gst_number)) {
      showError('Validation', 'GST number must be 15 alphanumeric characters.');
      return false;
    }
    if (formData.pan_number && !/^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(formData.pan_number)) {
      showError('Validation', 'PAN number format: ABCDE1234F.');
      return false;
    }
    return true;
  };

  const handleSubmit = useCallback(async () => {
    if (!validateForm()) return;

    const payload: CompanyFormData = {
      ...formData,
      name: formData.name?.trim(),
      code: formData.code?.trim(),
    };

    setSubmitting(true);
    try {
      if (editingId) {
        await apiClient.updateCompany(editingId, payload);
        showSuccess('Company updated', `${payload.name} updated.`);
        addAppLog({
          module: 'Companies',
          action: 'Update company',
          status: 'success',
          message: `Updated company ${payload.name}`,
        });
      } else {
        await apiClient.createCompany(payload);
        showSuccess('Company created', `${payload.name} created.`);
        addAppLog({
          module: 'Companies',
          action: 'Create company',
          status: 'success',
          message: `Created company ${payload.name}`,
        });
      }
      setIsPanelOpen(false);
      refreshCompanies();
    } catch (err: any) {
      showError('Save failed', err.message);
      addAppLog({
        module: 'Companies',
        action: 'Save company',
        status: 'error',
        message: err.message,
      });
    } finally {
      setSubmitting(false);
    }
  }, [formData, editingId, refreshCompanies, showSuccess, showError]);

  // ---------- Export CSV ----------
  const handleExport = useCallback(() => {
    if (filteredCompanies.length === 0) {
      showError('Export failed', 'No companies to export.');
      return;
    }
    const headers = ['Name', 'Code', 'Email', 'Phone', 'Type', 'GST', 'PAN', 'Address', 'Website', 'Active'];
    const rows = filteredCompanies.map(c => [
      c.name, c.code, c.email, c.phone, c.type || '',
      c.gst_number || '', c.pan_number || '', c.address || '',
      c.website || '', c.active ? 'Yes' : 'No'
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `companies-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    showSuccess('Export', 'Companies exported.');
  }, [filteredCompanies, showSuccess, showError]);

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
    field: keyof CompanyFormData,
    type: 'text' | 'email' | 'tel' | 'url' | 'number' | 'select' | 'textarea' = 'text',
    options?: any[]
  ) => {
    const value = formData[field] ?? '';
    const id = `field-${field}`;

    return (
      <div>
        <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
        {type === 'select' ? (
          <select
            id={id}
            value={value as string}
            onChange={(e) => setFormData(prev => ({ ...prev, [field]: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200"
          >
            <option value="">Select {label}</option>
            {options?.map(opt => (
              <option key={opt.value || opt} value={opt.value || opt}>{opt.label || opt}</option>
            ))}
          </select>
        ) : type === 'textarea' ? (
          <textarea
            id={id}
            value={value as string}
            onChange={(e) => setFormData(prev => ({ ...prev, [field]: e.target.value }))}
            rows={3}
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

  // ---------- Render ----------
  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 md:p-7 text-slate-800">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 mb-6 rounded-3xl bg-slate-950 px-5 py-6 md:px-8 md:py-7 shadow-xl shadow-slate-300/50">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> Company Management
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl flex items-center gap-3">
            <FiBriefcase className="text-cyan-300" /> Companies
            <span className="text-sm font-normal text-cyan-100/70 ml-2">Directory</span>
          </h1>
          <p className="text-sm text-slate-300">Manage all registered companies and their details</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refreshCompanies} disabled={compLoading} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 transition hover:bg-white/20 disabled:opacity-60">
            <FiRefreshCw className={compLoading ? 'animate-spin inline mr-1' : 'inline mr-1'} size={14} /> Refresh
          </button>
          <button onClick={handleExport} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 transition hover:bg-white/20">
            <FiDownload className="inline mr-1" size={14} /> Export
          </button>
          <button onClick={handleCreate} className="rounded-xl bg-cyan-400 text-slate-950 px-3 py-2 text-sm font-medium transition hover:bg-cyan-300 shadow-md shadow-cyan-500/20">
            <FiPlus className="inline mr-1" size={14} /> Add Company
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <FiSearch className="absolute left-3 top-2.5 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search by name, code, email, GST, PAN or type..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none placeholder:text-slate-400 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 transition-all duration-200"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FiFilter size={16} className="text-slate-500" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input-field w-36 text-sm rounded-xl border-slate-200 bg-white py-2 px-3 focus:ring-cyan-100"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Summary Cards (3 instead of 4) */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        {companies ? (
          <>
            <StatCard icon={FiBriefcase} label="Total" value={summary.total} tone="blue" />
            <StatCard icon={FiGlobe} label="Active" value={summary.active} tone="emerald" />
            <StatCard icon={FiMapPin} label="Inactive" value={summary.inactive} tone="rose" />
          </>
        ) : (
          [...Array(3)].map((_, i) => <StatCardSkeleton key={i} />)
        )}
      </div>

      {/* Error banner */}
      {compError && (
        <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-2 animate-shake">
          <FiAlertCircle size={20} /> {compError}
        </div>
      )}

      {/* Bulk Actions */}
      {selectedIds.length > 0 && (
        <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 mb-4 flex flex-wrap items-center gap-3 animate-fadeIn">
          <span className="text-sm font-medium text-slate-700">{selectedIds.length} selected</span>
          <button onClick={handleBulkDelete} className="inline-flex items-center gap-2 rounded-lg bg-rose-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-600 transition-colors">
            <FiTrash2 size={16} /> Delete
          </button>
          <button onClick={() => setSelectedIds([])} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
            Clear Selection
          </button>
        </div>
      )}

      {/* Table with skeleton & pagination */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <Suspense fallback={<TableSkeleton />}>
          {compLoading ? (
            <TableSkeleton />
          ) : (
            <>
              <ModernDataTable
                title="Companies List"
                columns={columns}
                data={paginatedCompanies}
                loading={false}
                selectable
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                striped
                highlightOnHover
                pointerOnHover
              />
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-3 border-t">
                  <span className="text-sm text-slate-600">
                    Showing {((currentPage - 1) * rowsPerPage) + 1} to {Math.min(currentPage * rowsPerPage, filteredCompanies.length)} of {filteredCompanies.length}
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

      {/* Offcanvas – Form */}
      {isPanelOpen && (
        <Suspense fallback={
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
            <div className="bg-white p-8 rounded-2xl">Loading form...</div>
          </div>
        }>
          <Offcanvas
            isOpen={isPanelOpen}
            title={editingId ? 'Edit Company' : 'Create Company'}
            onClose={() => setIsPanelOpen(false)}
            footer={
              <div className="flex flex-col sm:flex-row sm:justify-end gap-3">
                <button onClick={() => setIsPanelOpen(false)} className="btn btn-secondary w-full sm:w-auto" disabled={submitting}>
                  Cancel
                </button>
                <button onClick={handleSubmit} disabled={submitting} className="btn btn-primary w-full sm:w-auto">
                  {submitting ? 'Saving...' : editingId ? 'Update Company' : 'Create Company'}
                </button>
              </div>
            }
          >
            <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
              {renderSection('Company Information', 'basic', <FiBriefcase size={18} className="text-blue-500" />,
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {renderInput('Company Name *', 'name')}
                  {renderInput('Code *', 'code')}
                  {renderInput('Type', 'type', 'select', COMPANY_TYPES.map(t => ({ value: t, label: t })))}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Active</label>
                    <ToggleSwitch
                      checked={formData.active ?? true}
                      onChange={(val) => setFormData(prev => ({ ...prev, active: val }))}
                      label={formData.active ? 'Active' : 'Inactive'}
                    />
                  </div>
                  {renderInput('GST Number', 'gst_number')}
                  {renderInput('PAN Number', 'pan_number')}
                </div>
              )}

              {renderSection('Contact Details', 'contact', <FiMapPin size={18} className="text-indigo-500" />,
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {renderInput('Email', 'email', 'email')}
                  {renderInput('Phone', 'phone', 'tel')}
                  {renderInput('Website', 'website', 'url')}
                  {renderInput('Address', 'address', 'textarea')}
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