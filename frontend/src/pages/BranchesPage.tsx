import { useEffect, useState, useCallback, useMemo, lazy, Suspense, memo } from 'react';
import {
  FiPlus, FiRefreshCw, FiTrash2, FiDownload, FiEye, FiEdit,
  FiCheckCircle, FiXCircle, FiFilter, FiSearch, FiAlertCircle,
  FiChevronDown, FiChevronRight, FiMapPin, FiBriefcase, FiHash,
  FiHome, FiPhone, FiMail, FiFileText
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
interface Company {
  id: number;
  name: string;
}

interface Branch {
  id: number;
  company_id: number;
  company?: Company;
  name: string;
  code: string;
  address: string;
  phone: string;
  email: string;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

interface BranchFormData {
  company_id: number | string;
  name: string;
  code: string;
  address: string;
  phone: string;
  email: string;
  active: boolean;
}

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
  tone: 'blue' | 'emerald' | 'rose';
}) => {
  const bg = tone === 'blue' ? 'bg-blue-100 text-blue-600' :
             tone === 'emerald' ? 'bg-emerald-100 text-emerald-600' :
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
export function BranchesPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCompany, setFilterCompany] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // View state
  const [isViewPanelOpen, setIsViewPanelOpen] = useState(false);
  const [viewingBranch, setViewingBranch] = useState<Branch | null>(null);

  // Form state
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<BranchFormData>({
    company_id: '',
    name: '',
    code: '',
    address: '',
    phone: '',
    email: '',
    active: true,
  });

  // Selection for bulk actions
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // UI expand sections
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    basic: true,
    contact: false,
    address: false,
  });

  const { showSuccess, showError } = useNotification();

  // ---------- API Caching ----------
  const {
    data: companies,
    loading: compsLoading,
    error: compsError,
    refresh: refreshComps,
  } = useApiCache<Company[]>('companies', () => apiClient.getCompanies());

  const {
    data: branches,
    loading: branchesLoading,
    error: branchesError,
    refresh: refreshBranches,
  } = useApiCache<Branch[]>('branches', () => apiClient.getBranches());

  // ---------- Filter & Search ----------
  const filteredBranches = useMemo(() => {
    if (!branches) return [];
    let filtered = [...branches];
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(b =>
        b.name?.toLowerCase().includes(term) ||
        b.code?.toLowerCase().includes(term) ||
        b.email?.toLowerCase().includes(term) ||
        b.phone?.toLowerCase().includes(term) ||
        b.company?.name?.toLowerCase().includes(term)
      );
    }
    if (filterCompany !== 'all') {
      filtered = filtered.filter(b => b.company_id === parseInt(filterCompany));
    }
    if (filterStatus !== 'all') {
      filtered = filtered.filter(b => filterStatus === 'active' ? b.active : !b.active);
    }
    return filtered;
  }, [branches, searchTerm, filterCompany, filterStatus]);

  const summary = useMemo(() => ({
    total: branches?.length || 0,
    active: branches?.filter(b => b.active).length || 0,
    inactive: branches?.filter(b => !b.active).length || 0,
  }), [branches]);

  // ---------- Pagination ----------
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;
  const totalPages = Math.ceil(filteredBranches.length / rowsPerPage);
  const paginatedBranches = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredBranches.slice(start, start + rowsPerPage);
  }, [filteredBranches, currentPage]);

  useEffect(() => setCurrentPage(1), [searchTerm, filterCompany, filterStatus]);

  // ---------- Bulk actions ----------
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Delete ${selectedIds.length} branch(es)?`)) return;
    try {
      await Promise.all(selectedIds.map(id => apiClient.deleteBranch(id)));
      showSuccess('Bulk delete', `${selectedIds.length} branch(es) deleted.`);
      addAppLog({ module: 'Branches', action: 'Bulk delete', status: 'success', message: `Deleted ${selectedIds.length} branches` });
      setSelectedIds([]);
      refreshBranches();
    } catch (err: any) {
      showError('Bulk delete failed', err.message);
    }
  };

  const handleBulkStatusChange = async (active: boolean) => {
    if (selectedIds.length === 0) return;
    const label = active ? 'activate' : 'deactivate';
    if (!confirm(`Are you sure you want to ${label} ${selectedIds.length} branch(es)?`)) return;
    try {
      await Promise.all(selectedIds.map(id => apiClient.updateBranch(id, { active } as any)));
      showSuccess('Bulk update', `${selectedIds.length} branch(es) ${label}d.`);
      addAppLog({ module: 'Branches', action: 'Bulk status change', status: 'success', message: `${label}d ${selectedIds.length} branches` });
      setSelectedIds([]);
      refreshBranches();
    } catch (err: any) {
      showError('Bulk update failed', err.message);
    }
  };

  // ---------- CRUD handlers ----------
  const handleView = useCallback((branch: Branch) => {
    setViewingBranch(branch);
    setIsViewPanelOpen(true);
  }, []);

  const handleEdit = useCallback((branch: Branch) => {
    setEditingId(branch.id);
    setFormData({
      company_id: branch.company_id || '',
      name: branch.name || '',
      code: branch.code || '',
      address: branch.address || '',
      phone: branch.phone || '',
      email: branch.email || '',
      active: branch.active ?? true,
    });
    setIsPanelOpen(true);
  }, []);

  const handleDelete = useCallback(async (branch: Branch) => {
    if (!confirm(`Delete branch "${branch.name}"?`)) return;
    try {
      await apiClient.deleteBranch(branch.id);
      showSuccess('Branch deleted', `"${branch.name}" removed.`);
      addAppLog({ module: 'Branches', action: 'Delete branch', status: 'success', message: `Deleted branch ${branch.name}` });
      refreshBranches();
    } catch (err: any) {
      showError('Delete failed', err.message);
    }
  }, [refreshBranches, showError, showSuccess]);

  // ---------- Validation ----------
  const validateForm = (): boolean => {
    if (!formData.company_id) {
      showError('Validation', 'Please select a company.');
      return false;
    }
    if (!formData.name.trim()) {
      showError('Validation', 'Branch name is required.');
      return false;
    }
    return true;
  };

  const handleSubmit = useCallback(async () => {
    if (!validateForm()) return;

    const payload = {
      ...formData,
      company_id: parseInt(String(formData.company_id)),
    };

    setSubmitting(true);
    try {
      if (editingId) {
        await apiClient.updateBranch(editingId, payload);
        showSuccess('Branch updated', `"${formData.name}" updated.`);
        addAppLog({ module: 'Branches', action: 'Update branch', status: 'success', message: `Updated branch ${formData.name}` });
      } else {
        await apiClient.createBranch(payload);
        showSuccess('Branch created', `"${formData.name}" created.`);
        addAppLog({ module: 'Branches', action: 'Create branch', status: 'success', message: `Created branch ${formData.name}` });
      }
      setIsPanelOpen(false);
      refreshBranches();
    } catch (err: any) {
      showError('Save failed', err.message);
      addAppLog({ module: 'Branches', action: 'Save branch', status: 'error', message: err.message });
    } finally {
      setSubmitting(false);
    }
  }, [formData, editingId, refreshBranches, showSuccess, showError]);

  // ---------- Export CSV ----------
  const handleExport = useCallback(() => {
    if (filteredBranches.length === 0) {
      showError('Export failed', 'No branches to export.');
      return;
    }
    const headers = ['Branch Name', 'Company', 'Code', 'Phone', 'Email', 'Address', 'Status'];
    const rows = filteredBranches.map(b => [
      b.name,
      b.company?.name || '',
      b.code || '',
      b.phone || '',
      b.email || '',
      b.address || '',
      b.active ? 'Active' : 'Inactive',
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `branches-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    showSuccess('Export', 'Branches exported.');
  }, [filteredBranches, showSuccess, showError]);

  // ---------- Table Columns ----------
  const columns = useMemo(() => [
    {
      name: 'Branch',
      selector: (row: Branch) => row.name,
      sortable: true,
      cell: (row: Branch) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
            {row.name?.[0]?.toUpperCase() || 'B'}
          </div>
          <div>
            <div className="font-medium text-slate-800">{row.name}</div>
            <div className="text-xs text-slate-400">{row.code || ''}</div>
          </div>
        </div>
      ),
      width: '200px',
    },
    {
      name: 'Company',
      selector: (row: Branch) => row.company?.name || '-',
      sortable: true,
      cell: (row: Branch) => <span className="text-sm">{row.company?.name || '-'}</span>,
      width: '150px',
    },
    {
      name: 'Phone',
      selector: (row: Branch) => row.phone || '-',
      cell: (row: Branch) => <span className="text-sm text-slate-600">{row.phone || '-'}</span>,
      width: '140px',
    },
    {
      name: 'Email',
      selector: (row: Branch) => row.email || '-',
      cell: (row: Branch) => <span className="text-sm text-slate-600">{row.email || '-'}</span>,
      width: '180px',
    },
    {
      name: 'Status',
      selector: (row: Branch) => row.active ? 'Active' : 'Inactive',
      cell: (row: Branch) => {
        const active = row.active;
        return (
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
            {active ? 'Active' : 'Inactive'}
          </span>
        );
      },
      sortable: true,
      width: '110px',
    },
    {
      name: 'Actions',
      cell: (row: Branch) => (
        <div className="flex items-center gap-1">
          <button onClick={() => handleView(row)} className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors" title="View">
            <FiEye size={16} />
          </button>
          <button onClick={() => handleEdit(row)} className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors" title="Edit">
            <FiEdit size={16} />
          </button>
          <button onClick={() => handleDelete(row)} className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors" title="Delete">
            <FiTrash2 size={16} />
          </button>
        </div>
      ),
      width: '120px',
    },
  ], [handleView, handleEdit, handleDelete]);

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
    field: keyof BranchFormData,
    type: 'text' | 'email' | 'tel' | 'select' | 'textarea' | 'checkbox' = 'text',
    options?: { id: any; name?: string; title?: string }[]
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
            rows={3}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200"
          />
        ) : (
          <input
            id={id}
            type={type}
            value={value as string}
            onChange={(e) => setFormData(prev => ({ ...prev, [field]: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200"
            placeholder={`Enter ${label}`}
          />
        )}
      </div>
    );
  }, [formData]);

  const isLoading = compsLoading || branchesLoading;
  const globalError = compsError || branchesError;

  // ---------- Render ----------
  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 md:p-7 text-slate-800">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 mb-6 rounded-3xl bg-slate-950 px-5 py-6 md:px-8 md:py-7 shadow-xl shadow-slate-300/50">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> Branch Management
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl flex items-center gap-3">
            <FiHome className="text-cyan-300" /> Branches
            <span className="text-sm font-normal text-cyan-100/70 ml-2">Locations</span>
          </h1>
          <p className="text-sm text-slate-300">Manage branches, contacts, and company associations</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { refreshComps(); refreshBranches(); }} disabled={isLoading} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 transition hover:bg-white/20 disabled:opacity-60">
            <FiRefreshCw className={isLoading ? 'animate-spin inline mr-1' : 'inline mr-1'} size={14} /> Refresh
          </button>
          <button onClick={handleExport} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 transition hover:bg-white/20">
            <FiDownload className="inline mr-1" size={14} /> Export
          </button>
          <button onClick={() => {
            setEditingId(null);
            setFormData({ company_id: '', name: '', code: '', address: '', phone: '', email: '', active: true });
            setIsPanelOpen(true);
          }} className="rounded-xl bg-cyan-400 text-slate-950 px-3 py-2 text-sm font-medium transition hover:bg-cyan-300 shadow-md shadow-cyan-500/20">
            <FiPlus className="inline mr-1" size={14} /> New Branch
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <FiSearch className="absolute left-3 top-2.5 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search by name, code, phone, email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none placeholder:text-slate-400 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 transition-all duration-200"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FiFilter size={16} className="text-slate-500" />
          <select
            value={filterCompany}
            onChange={(e) => setFilterCompany(e.target.value)}
            className="input-field w-40 text-sm rounded-xl border-slate-200 bg-white py-2 px-3 focus:ring-cyan-100"
          >
            <option value="all">All Companies</option>
            {companies?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {branches ? (
          <>
            <StatCard icon={FiHome} label="Total Branches" value={summary.total} tone="blue" />
            <StatCard icon={FiCheckCircle} label="Active" value={summary.active} tone="emerald" />
            <StatCard icon={FiXCircle} label="Inactive" value={summary.inactive} tone="rose" />
          </>
        ) : (
          [...Array(3)].map((_, i) => <StatCardSkeleton key={i} />)
        )}
      </div>

      {/* Error banner */}
      {globalError && (
        <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-2 animate-shake">
          <FiAlertCircle size={20} /> {globalError}
        </div>
      )}

      {/* Bulk Actions */}
      {selectedIds.length > 0 && (
        <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 mb-4 flex flex-wrap items-center gap-3 animate-fadeIn">
          <span className="text-sm font-medium text-slate-700">{selectedIds.length} selected</span>
          <button onClick={() => handleBulkStatusChange(true)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 transition-colors">
            <FiCheckCircle size={16} /> Activate
          </button>
          <button onClick={() => handleBulkStatusChange(false)} className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600 transition-colors">
            <FiXCircle size={16} /> Deactivate
          </button>
          <button onClick={handleBulkDelete} className="inline-flex items-center gap-2 rounded-lg bg-rose-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-600 transition-colors">
            <FiTrash2 size={16} /> Delete
          </button>
          <button onClick={() => setSelectedIds([])} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
            Clear Selection
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <Suspense fallback={<TableSkeleton />}>
          {isLoading ? (
            <TableSkeleton />
          ) : (
            <>
              <ModernDataTable
                title="Branch Directory"
                columns={columns}
                data={paginatedBranches}
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
                    Showing {((currentPage - 1) * rowsPerPage) + 1} to {Math.min(currentPage * rowsPerPage, filteredBranches.length)} of {filteredBranches.length}
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

      {/* View Branch Offcanvas */}
      {isViewPanelOpen && (
        <Suspense fallback={
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
            <div className="bg-white p-8 rounded-2xl">Loading details...</div>
          </div>
        }>
          <Offcanvas
            isOpen={isViewPanelOpen}
            title={`Branch ${viewingBranch?.name || ''}`}
            onClose={() => setIsViewPanelOpen(false)}
            footer={
              <div className="flex justify-end">
                <button onClick={() => setIsViewPanelOpen(false)} className="btn btn-secondary">
                  Close
                </button>
              </div>
            }
          >
            {viewingBranch && (
              <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
                {renderSection('Branch Details', 'details', <FiHome size={18} className="text-blue-500" />,
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Branch Name</label>
                      <div className="mt-1 text-gray-900 font-semibold">{viewingBranch.name}</div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Status</label>
                      <div className="mt-1">
                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${viewingBranch.active ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                          {viewingBranch.active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Company</label>
                      <div className="mt-1 text-gray-900">{viewingBranch.company?.name || '-'}</div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Code</label>
                      <div className="mt-1 text-gray-900">{viewingBranch.code || '-'}</div>
                    </div>
                  </div>
                )}
                {renderSection('Contact', 'contact', <FiPhone size={18} className="text-indigo-500" />,
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Phone</label>
                      <div className="mt-1 text-gray-900">{viewingBranch.phone || '-'}</div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Email</label>
                      <div className="mt-1 text-gray-900">{viewingBranch.email || '-'}</div>
                    </div>
                  </div>
                )}
                {renderSection('Address', 'address', <FiMapPin size={18} className="text-emerald-500" />,
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Address</label>
                    <div className="mt-1 text-gray-900 whitespace-pre-wrap">{viewingBranch.address || '-'}</div>
                  </div>
                )}
                <div className="text-xs text-slate-400">
                  Created: {viewingBranch.created_at ? new Date(viewingBranch.created_at).toLocaleString() : '-'}
                </div>
              </div>
            )}
          </Offcanvas>
        </Suspense>
      )}

      {/* Form Offcanvas (Create/Edit) */}
      {isPanelOpen && (
        <Suspense fallback={
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
            <div className="bg-white p-8 rounded-2xl">Loading form...</div>
          </div>
        }>
          <Offcanvas
            isOpen={isPanelOpen}
            title={editingId ? 'Edit Branch' : 'Create Branch'}
            onClose={() => setIsPanelOpen(false)}
            footer={
              <div className="flex flex-col sm:flex-row sm:justify-end gap-3">
                <button onClick={() => setIsPanelOpen(false)} className="btn btn-secondary w-full sm:w-auto" disabled={submitting}>Cancel</button>
                <button onClick={handleSubmit} disabled={submitting} className="btn btn-primary w-full sm:w-auto">
                  {submitting ? 'Saving...' : editingId ? 'Update Branch' : 'Create Branch'}
                </button>
              </div>
            }
          >
            <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
              {renderSection('Basic Information', 'basic', <FiBriefcase size={18} className="text-blue-500" />,
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {renderInput('Company *', 'company_id', 'select', companies?.map(c => ({ id: c.id, name: c.name })))}
                  {renderInput('Branch Name *', 'name')}
                  {renderInput('Branch Code', 'code')}
                  {renderInput('Active', 'active', 'checkbox')}
                </div>
              )}

              {renderSection('Contact Details', 'contact', <FiMail size={18} className="text-indigo-500" />,
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {renderInput('Phone', 'phone', 'tel')}
                  {renderInput('Email', 'email', 'email')}
                </div>
              )}

              {renderSection('Address', 'address', <FiMapPin size={18} className="text-emerald-500" />,
                <div>
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