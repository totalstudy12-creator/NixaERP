// src/pages/BranchesPage.tsx
import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  lazy,
  Suspense,
  memo,
  startTransition,
} from 'react';
import {
  FiPlus,
  FiTrash2,
  FiEdit,
  FiDownload,
  FiEye,
  FiCheckCircle,
  FiXCircle,
  FiFilter,
  FiAlertCircle,
  FiChevronDown,
  FiMapPin,
  FiPhone,
  FiMail,
  FiHome,
  FiHash,
  FiBriefcase,
  FiX,
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
  company_id: number;
  company?: Company;
  name: string;
  code?: string;
  address?: string;
  phone?: string;
  email?: string;
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

interface AppLogEntry {
  module: string;
  action: string;
  status: 'success' | 'error' | 'info';
  message: string;
}

interface ApiErrorLike {
  message?: string;
  status?: number;
  response?: { status?: number };
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const CACHE_TTL_MS = 300_000;
const TABLE_COLUMN_COUNT = 6;

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
] as const;

const TABLE_HEAD_CLASS = 'text-[11px] font-semibold uppercase tracking-wide text-slate-500';

/* ------------------------------------------------------------------ */
/* Safe helpers                                                        */
/* ------------------------------------------------------------------ */

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null) {
    const candidate = (error as ApiErrorLike).message;
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function safeLog(entry: AppLogEntry): void {
  try {
    addAppLog(entry);
  } catch {
    /* no-op */
  }
}

function escapeCsvField(value: unknown): string {
  const raw = String(value ?? '');
  const dangerous = /^[=+\-@\t\r]/.test(raw);
  const safe = dangerous ? `\t${raw}` : raw;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
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
        setError(getErrorMessage(err, 'Failed to load'));
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
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
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

export function BranchesPage() {
  const { showSuccess, showError } = useNotification();

  /* -------------------- Filter state -------------------- */
  const [filterCompany, setFilterCompany] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  /* -------------------- View state -------------------- */
  const [isViewPanelOpen, setIsViewPanelOpen] = useState(false);
  const [viewingBranch, setViewingBranch] = useState<Branch | null>(null);

  /* -------------------- Form state -------------------- */
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

  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  /* -------------------- Data fetching -------------------- */
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

  const isLoading = compsLoading || branchesLoading;
  const globalError = compsError || branchesError;

  /* -------------------- Filtering -------------------- */
  const filteredBranches = useMemo(() => {
    if (!branches) return [];
    let filtered = [...branches];
    if (filterCompany !== 'all') {
      filtered = filtered.filter((b) => b.company_id === parseInt(filterCompany));
    }
    if (filterStatus !== 'all') {
      filtered = filtered.filter((b) =>
        filterStatus === 'active' ? b.active : !b.active
      );
    }
    return filtered;
  }, [branches, filterCompany, filterStatus]);

  const summary = useMemo(
    () => ({
      total: branches?.length || 0,
      active: branches?.filter((b) => b.active).length || 0,
      inactive: branches?.filter((b) => !b.active).length || 0,
    }),
    [branches]
  );

  const activeFilterCount = [
    filterCompany !== 'all' ? filterCompany : undefined,
    filterStatus !== 'all' ? filterStatus : undefined,
  ].filter(Boolean).length;

  const clearFilters = useCallback(() => {
    setFilterCompany('all');
    setFilterStatus('all');
  }, []);

  /* -------------------- Selection -------------------- */
  const allSelected = Boolean(
    filteredBranches.length > 0 && filteredBranches.every((b) => selectedIds.includes(b.id))
  );

  const toggleSelectAll = useCallback(() => {
    const ids = filteredBranches.map((b) => b.id);
    if (!ids.length) return;
    if (allSelected) {
      setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
    } else {
      setSelectedIds((current) => Array.from(new Set([...current, ...ids])));
    }
  }, [allSelected, filteredBranches]);

  const toggleSelected = useCallback((id: number) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((v) => v !== id) : [...current, id]
    );
  }, []);

  /* -------------------- Detail view -------------------- */
  const handleView = useCallback((branch: Branch) => {
    setViewingBranch(branch);
    setIsViewPanelOpen(true);
  }, []);

  /* -------------------- Bulk actions -------------------- */
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Delete ${selectedIds.length} branch(es)?`)) return;
    try {
      await Promise.all(selectedIds.map((id) => apiClient.deleteBranch(id)));
      showSuccess('Bulk delete', `${selectedIds.length} branch(es) deleted.`);
      safeLog({
        module: 'Branches',
        action: 'Bulk delete',
        status: 'success',
        message: `Deleted ${selectedIds.length} branches`,
      });
      setSelectedIds([]);
      refreshBranches();
    } catch (err: unknown) {
      showError('Bulk delete failed', getErrorMessage(err, 'Bulk delete failed.'));
    }
  };

  const handleBulkStatusChange = async (active: boolean) => {
    if (selectedIds.length === 0) return;
    const label = active ? 'activate' : 'deactivate';
    if (!window.confirm(`Are you sure you want to ${label} ${selectedIds.length} branch(es)?`))
      return;
    try {
      await Promise.all(
        selectedIds.map((id) => apiClient.updateBranch(id, { active } as Partial<Branch>))
      );
      showSuccess('Bulk update', `${selectedIds.length} branch(es) ${label}d.`);
      safeLog({
        module: 'Branches',
        action: 'Bulk status change',
        status: 'success',
        message: `${label}d ${selectedIds.length} branches`,
      });
      setSelectedIds([]);
      refreshBranches();
    } catch (err: unknown) {
      showError('Bulk update failed', getErrorMessage(err, 'Bulk update failed.'));
    }
  };

  /* -------------------- CRUD -------------------- */
  const resetForm = () => {
    setFormData({
      company_id: '',
      name: '',
      code: '',
      address: '',
      phone: '',
      email: '',
      active: true,
    });
  };

  const handleCreate = useCallback(() => {
    setEditingId(null);
    resetForm();
    setIsPanelOpen(true);
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

  const handleDelete = useCallback(
    async (branch: Branch) => {
      if (!window.confirm(`Delete branch "${branch.name}"?`)) return;
      try {
        await apiClient.deleteBranch(branch.id);
        showSuccess('Branch deleted', `"${branch.name}" removed.`);
        safeLog({
          module: 'Branches',
          action: 'Delete branch',
          status: 'success',
          message: `Deleted branch ${branch.name}`,
        });
        refreshBranches();
      } catch (err: unknown) {
        showError('Delete failed', getErrorMessage(err, 'Delete failed.'));
      }
    },
    [refreshBranches, showError, showSuccess]
  );

  /* -------------------- Validation -------------------- */
  const validateForm = (): boolean => {
    if (!formData.company_id) {
      showError('Validation', 'Please select a company.');
      return false;
    }
    if (!formData.name.trim()) {
      showError('Validation', 'Branch name is required.');
      return false;
    }
    if (formData.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      showError('Validation', 'Please enter a valid email address.');
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
        safeLog({
          module: 'Branches',
          action: 'Update branch',
          status: 'success',
          message: `Updated branch ${formData.name}`,
        });
      } else {
        await apiClient.createBranch(payload);
        showSuccess('Branch created', `"${formData.name}" created.`);
        safeLog({
          module: 'Branches',
          action: 'Create branch',
          status: 'success',
          message: `Created branch ${formData.name}`,
        });
      }
      setIsPanelOpen(false);
      refreshBranches();
    } catch (err: unknown) {
      showError('Save failed', getErrorMessage(err, 'Save failed.'));
      safeLog({
        module: 'Branches',
        action: 'Save branch',
        status: 'error',
        message: getErrorMessage(err, 'Save failed.'),
      });
    } finally {
      setSubmitting(false);
    }
  }, [formData, editingId, refreshBranches, showSuccess, showError]);

  /* -------------------- Export -------------------- */
  const handleExport = useCallback(() => {
    if (filteredBranches.length === 0) {
      showError('Export failed', 'No branches to export.');
      return;
    }
    const headers = ['Branch Name', 'Company', 'Code', 'Phone', 'Email', 'Address', 'Status'];
    const rows = filteredBranches.map((b) =>
      [
        escapeCsvField(b.name),
        escapeCsvField(b.company?.name || ''),
        escapeCsvField(b.code || ''),
        escapeCsvField(b.phone || ''),
        escapeCsvField(b.email || ''),
        escapeCsvField(b.address || ''),
        b.active ? 'Active' : 'Inactive',
      ].join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `branches-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showSuccess('Export', 'Branches exported.');
  }, [filteredBranches, showSuccess, showError]);

  /* -------------------- Render field helper -------------------- */
  const renderField = (
    label: string,
    field: keyof BranchFormData,
    type: 'text' | 'email' | 'tel' = 'text',
    required = false
  ) => {
    const value = formData[field] ?? '';
    const id = `field-${field}`;
    return (
      <div className="min-w-0">
        <label
          htmlFor={id}
          className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
        <input
          id={id}
          type={type}
          value={value as string}
          onChange={(e) => setFormData((prev) => ({ ...prev, [field]: e.target.value }))}
          className="h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
          placeholder={`Enter ${label}`}
        />
      </div>
    );
  };

  /* -------------------- Error state -------------------- */
  if (globalError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-600">
            <FiAlertCircle size={24} />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">Failed to load branches</h2>
          <p className="mt-1.5 text-sm text-slate-500">{globalError}</p>
          <Button
            onClick={() => {
              refreshComps();
              refreshBranches();
            }}
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

        .branches-offcanvas-wide {
          width: min(760px, 96vw) !important;
          max-width: min(760px, 96vw) !important;
        }
        .branches-detail-offcanvas {
          width: min(560px, 96vw) !important;
          max-width: min(560px, 96vw) !important;
        }
        @media (max-width: 640px) {
          .branches-offcanvas-wide,
          .branches-detail-offcanvas { width: 100vw !important; max-width: 100vw !important; }
        }

        .branches-offcanvas-wide .branches-form-scroll,
        .branches-detail-offcanvas .branches-form-scroll {
          overflow-y: auto;
          overflow-x: hidden;
          min-height: 0;
          flex: 1 1 auto;
          max-height: calc(100vh - 180px);
          scrollbar-width: thin;
          scrollbar-color: #cbd5e1 transparent;
        }
        .branches-offcanvas-wide .branches-form-scroll::-webkit-scrollbar,
        .branches-detail-offcanvas .branches-form-scroll::-webkit-scrollbar { width: 8px; }
        .branches-offcanvas-wide .branches-form-scroll::-webkit-scrollbar-track,
        .branches-detail-offcanvas .branches-form-scroll::-webkit-scrollbar-track { background: transparent; }
        .branches-offcanvas-wide .branches-form-scroll::-webkit-scrollbar-thumb,
        .branches-detail-offcanvas .branches-form-scroll::-webkit-scrollbar-thumb {
          background-color: #cbd5e1; border-radius: 8px;
        }
        .branches-offcanvas-wide .branches-form-scroll::-webkit-scrollbar-thumb:hover,
        .branches-detail-offcanvas .branches-form-scroll::-webkit-scrollbar-thumb:hover {
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
                  <FiHome size={12} />
                  Locations · Branches
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-[32px]">
                  Branch workspace
                </h1>
                <p className="mt-1.5 max-w-2xl text-sm text-slate-300">
                  Manage branches, contacts, and company associations across your network.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={handleExport}
                  disabled={isLoading || filteredBranches.length === 0}
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
                  New branch
                </Button>
              </div>
            </div>
          </section>

          {/* KPI */}
          <section className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3">
            {branches ? (
              <>
                <StatCard icon={FiHome} label="Total branches" value={summary.total} accent="indigo" />
                <StatCard icon={FiCheckCircle} label="Active" value={summary.active} accent="emerald" />
                <StatCard icon={FiXCircle} label="Inactive" value={summary.inactive} accent="rose" />
              </>
            ) : (
              Array.from({ length: 3 }).map((_, i) => <StatCardSkeleton key={i} />)
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
                      : 'Refine branches by company or status'}
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
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="min-w-0">
                  <div className="relative">
                    <select
                      aria-label="Company"
                      value={filterCompany}
                      onChange={(e) => setFilterCompany(e.target.value)}
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

                <div className="min-w-0">
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
              </div>
            </CardContent>
          </Card>

          {/* Bulk toolbar */}
          {selectedIds.length > 0 && (
            <div className="sticky top-3 z-30 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-lg shadow-slate-900/5 backdrop-blur">
              <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4">
                <div className="mr-1 flex items-center gap-2 rounded-lg bg-indigo-50 px-2.5 py-1 text-indigo-700 ring-1 ring-indigo-500/10">
                  <span className="text-sm font-bold">{selectedIds.length}</span>
                  <span className="text-xs font-medium">selected</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 rounded-lg"
                  onClick={() => handleBulkStatusChange(true)}
                >
                  <FiCheckCircle className="mr-1.5 text-emerald-600" size={14} /> Activate
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 rounded-lg"
                  onClick={() => handleBulkStatusChange(false)}
                >
                  <FiXCircle className="mr-1.5 text-amber-600" size={14} /> Deactivate
                </Button>
                <Button
                  size="sm"
                  className="h-9 rounded-lg border border-red-600 bg-red-600 font-semibold text-white shadow-none hover:border-red-700 hover:bg-red-700"
                  onClick={handleBulkDelete}
                >
                  <FiTrash2 className="mr-1.5" size={14} /> Delete
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-9 rounded-lg text-slate-500 hover:text-slate-800"
                  onClick={() => setSelectedIds([])}
                >
                  Clear
                </Button>
              </div>
            </div>
          )}

          {/* Table card */}
          <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <CardHeader className="flex flex-col gap-3 border-b border-slate-100 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600">
                  <FiHome size={14} />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-800">
                    Branch directory
                  </CardTitle>
                  <CardDescription className="text-[11px] text-slate-500">
                    {isLoading
                      ? 'Loading branches…'
                      : `${filteredBranches.length.toLocaleString('en-IN')} record${
                          filteredBranches.length === 1 ? '' : 's'
                        } · Click a row to view details`}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <div className="overflow-x-auto">
              <Table className="min-w-[1040px]">
                <TableHeader>
                  <TableRow className="border-slate-100 bg-slate-50/70 hover:bg-slate-50/70">
                    <TableHead className="w-11 px-3">
                      <input
                        aria-label="Select all"
                        type="checkbox"
                        checked={allSelected}
                        onChange={(event) => {
                          event.stopPropagation();
                          toggleSelectAll();
                        }}
                        onClick={(event) => event.stopPropagation()}
                        className="h-4 w-4 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/30"
                      />
                    </TableHead>
                    <TableHead>
                      <TableHeadLabel>Branch</TableHeadLabel>
                    </TableHead>
                    <TableHead>
                      <TableHeadLabel>Company</TableHeadLabel>
                    </TableHead>
                    <TableHead>
                      <TableHeadLabel>Contact</TableHeadLabel>
                    </TableHead>
                    <TableHead>
                      <TableHeadLabel>Address</TableHeadLabel>
                    </TableHead>
                    <TableHead>
                      <TableHeadLabel>Status</TableHeadLabel>
                    </TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {isLoading &&
                    Array.from({ length: 8 }).map((_, index) => (
                      <TableRow key={`skeleton-${index}`} className="border-slate-100">
                        {Array.from({ length: TABLE_COLUMN_COUNT + 1 }).map((__, cellIndex) => (
                          <TableCell key={cellIndex}>
                            <div className="h-4 animate-pulse rounded bg-slate-100" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}

                  {!isLoading &&
                    filteredBranches.map((branch) => {
                      const selected = selectedIds.includes(branch.id);
                      return (
                        <TableRow
                          key={branch.id}
                          data-state={selected ? 'selected' : undefined}
                          className={`cursor-pointer border-slate-100 transition-colors hover:bg-slate-50/70 ${
                            selected ? 'bg-indigo-50/40 hover:bg-indigo-50/60' : ''
                          }`}
                          onClick={() => handleView(branch)}
                        >
                          <TableCell className="px-3" onClick={(e) => e.stopPropagation()}>
                            <input
                              aria-label={`Select ${branch.name}`}
                              type="checkbox"
                              checked={selected}
                              onChange={(event) => {
                                event.stopPropagation();
                                toggleSelected(branch.id);
                              }}
                              onClick={(event) => event.stopPropagation()}
                              className="h-4 w-4 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/30"
                            />
                          </TableCell>

                          <TableCell>
                            <div className="flex min-w-[200px] items-center gap-2.5">
                              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[11px] font-bold text-white">
                                {(branch.name || 'B')[0]?.toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-900">
                                  {branch.name}
                                </p>
                                {branch.code && (
                                  <p className="truncate font-mono text-[11px] text-slate-500">
                                    {branch.code}
                                  </p>
                                )}
                              </div>
                            </div>
                          </TableCell>

                          <TableCell>
                            <span className="text-sm text-slate-700">
                              {branch.company?.name || '—'}
                            </span>
                          </TableCell>

                          <TableCell>
                            <div className="min-w-[180px]">
                              {branch.phone && (
                                <p className="flex items-center gap-1.5 text-sm text-slate-700">
                                  <FiPhone size={12} className="text-slate-400" />
                                  {branch.phone}
                                </p>
                              )}
                              {branch.email && (
                                <p className="truncate text-[11px] text-slate-500">
                                  {branch.email}
                                </p>
                              )}
                              {!branch.phone && !branch.email && (
                                <span className="text-sm text-slate-400">—</span>
                              )}
                            </div>
                          </TableCell>

                          <TableCell>
                            <div className="flex max-w-[220px] items-start gap-1.5 text-sm text-slate-600">
                              <FiMapPin size={12} className="mt-1 shrink-0 text-slate-400" />
                              <span className="truncate">
                                {branch.address ? branch.address.replace(/\n/g, ', ') : '—'}
                              </span>
                            </div>
                          </TableCell>

                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                                branch.active
                                  ? 'border-emerald-200/70 bg-emerald-50 text-emerald-700'
                                  : 'border-red-200/70 bg-red-50 text-red-700'
                              }`}
                            >
                              {branch.active ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>

                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleEdit(branch)}
                                className="grid h-8 w-8 place-items-center rounded-lg text-indigo-500 transition hover:bg-indigo-50 hover:text-indigo-700"
                                title="Edit"
                              >
                                <FiEdit size={15} />
                              </button>
                              <button
                                onClick={() => handleDelete(branch)}
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

                  {!isLoading && !filteredBranches.length && (
                    <TableRow>
                      <TableCell colSpan={TABLE_COLUMN_COUNT + 1} className="py-20 text-center">
                        <div className="mx-auto max-w-md px-4">
                          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-slate-200/70">
                            <FiFilter className="h-6 w-6 text-slate-400" />
                          </div>
                          <p className="mt-4 text-base font-semibold text-slate-800">
                            No branches found
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            Try adjusting the company or status filter.
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
      {/* Branch detail view (opens on row click)                   */}
      {/* ══════════════════════════════════════════════════════════ */}
      {isViewPanelOpen && viewingBranch && (
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
            title={viewingBranch.name}
            onClose={() => setIsViewPanelOpen(false)}
            className="branches-detail-offcanvas"
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
                    handleEdit(viewingBranch);
                  }}
                  className="rounded-xl bg-indigo-600 font-semibold hover:bg-indigo-700"
                >
                  <FiEdit className="mr-2" size={14} /> Edit
                </Button>
              </div>
            }
          >
            <div className="branches-form-scroll space-y-4 pr-2">
              {/* Header summary */}
              <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
                <div className="flex items-start gap-3">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-base font-bold text-white shadow-sm">
                    {(viewingBranch.name || 'B')[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-bold text-slate-900">
                      {viewingBranch.name}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                          viewingBranch.active
                            ? 'border-emerald-200/70 bg-emerald-50 text-emerald-700'
                            : 'border-red-200/70 bg-red-50 text-red-700'
                        }`}
                      >
                        {viewingBranch.active ? 'Active' : 'Inactive'}
                      </Badge>
                      {viewingBranch.code && (
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 font-mono text-[11px] text-slate-600">
                          {viewingBranch.code}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Company + contact */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-3.5 py-2.5">
                  <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <FiBriefcase size={12} /> Company
                  </p>
                </div>
                <div className="px-3.5 py-3">
                  <p className="text-sm font-semibold text-slate-800">
                    {viewingBranch.company?.name || '—'}
                  </p>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-3.5 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Contact
                  </p>
                </div>
                <div className="divide-y divide-slate-100">
                  <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      <FiPhone size={12} /> Phone
                    </span>
                    <span className="text-xs font-semibold text-slate-800">
                      {viewingBranch.phone || '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      <FiMail size={12} /> Email
                    </span>
                    <span className="min-w-0 truncate text-xs font-semibold text-slate-800">
                      {viewingBranch.email || '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      <FiHash size={12} /> Code
                    </span>
                    <span className="font-mono text-xs font-semibold text-slate-800">
                      {viewingBranch.code || '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Address */}
              {(viewingBranch.address) && (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="border-b border-slate-100 px-3.5 py-2.5">
                    <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <FiMapPin size={12} /> Address
                    </p>
                  </div>
                  <div className="px-3.5 py-3 text-sm text-slate-700">
                    <p className="whitespace-pre-line">{viewingBranch.address}</p>
                  </div>
                </div>
              )}

              {/* Meta */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
                <div className="flex items-center justify-between gap-3 text-[11px]">
                  <span className="font-medium uppercase tracking-wide text-slate-400">
                    Created
                  </span>
                  <span className="font-semibold text-slate-700">
                    {formatDateTime(viewingBranch.created_at)}
                  </span>
                </div>
                {viewingBranch.updated_at && (
                  <div className="mt-1.5 flex items-center justify-between gap-3 text-[11px]">
                    <span className="font-medium uppercase tracking-wide text-slate-400">
                      Updated
                    </span>
                    <span className="font-semibold text-slate-700">
                      {formatDateTime(viewingBranch.updated_at)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </Offcanvas>
        </Suspense>
      )}

      {/* Form offcanvas (Create/Edit) */}
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
            title={editingId ? 'Edit branch' : 'New branch'}
            onClose={() => setIsPanelOpen(false)}
            className="branches-offcanvas-wide"
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
                  {submitting ? 'Saving…' : editingId ? 'Update branch' : 'Create branch'}
                </Button>
              </div>
            }
          >
            <div className="branches-form-scroll space-y-5 pr-2">
              {/* Basic info */}
              <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-indigo-500" /> Basic information
                </legend>
                <div className="mt-3 space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="min-w-0">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Company <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <select
                          value={formData.company_id as string}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, company_id: e.target.value }))
                          }
                          className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                        >
                          <option value="">Select company</option>
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

                    {renderField('Branch name', 'name', 'text', true)}
                    {renderField('Branch code', 'code')}

                    <ToggleSwitch
                      checked={formData.active}
                      onChange={(val) => setFormData((prev) => ({ ...prev, active: val }))}
                      label="Active"
                    />
                  </div>
                </div>
              </fieldset>

              {/* Contact details */}
              <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-violet-500" /> Contact details
                </legend>
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {renderField('Phone', 'phone', 'tel')}
                  {renderField('Email', 'email', 'email')}
                </div>
              </fieldset>

              {/* Address */}
              <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Address
                </legend>
                <div className="mt-3">
                  <label
                    htmlFor="field-address"
                    className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    Address
                  </label>
                  <textarea
                    id="field-address"
                    value={formData.address}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, address: e.target.value }))
                    }
                    rows={3}
                    className="min-h-[90px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                    placeholder="Enter address"
                  />
                </div>
              </fieldset>
            </div>
          </Offcanvas>
        </Suspense>
      )}
    </>
  );
}

export default BranchesPage;