// src/pages/WarehousesPage.tsx
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
  FiCheckCircle,
  FiXCircle,
  FiFilter,
  FiAlertCircle,
  FiChevronDown,
  FiMapPin,
  FiPackage,
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
  name: string;
  company_id: number;
}

interface Warehouse {
  id: number;
  company_id: number;
  branch_id: number;
  company?: Company;
  branch?: Branch;
  name: string;
  code?: string;
  location?: string;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

interface WarehouseFormData {
  company_id: number | string;
  branch_id: number | string;
  name: string;
  code: string;
  location: string;
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

function getLocalDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export function WarehousesPage() {
  const { showSuccess, showError } = useNotification();

  /* -------------------- Filter state -------------------- */
  const [filterCompany, setFilterCompany] = useState('all');
  const [filterBranch, setFilterBranch] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  /* -------------------- View state -------------------- */
  const [isViewPanelOpen, setIsViewPanelOpen] = useState(false);
  const [viewingWarehouse, setViewingWarehouse] = useState<Warehouse | null>(null);

  /* -------------------- Form state -------------------- */
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<WarehouseFormData>({
    company_id: '',
    branch_id: '',
    name: '',
    code: '',
    location: '',
    active: true,
  });
  const [formError, setFormError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  /* -------------------- Data fetching -------------------- */
  const { data: companies } = useApiCache<Company[]>('companies', () => apiClient.getCompanies());
  const { data: branches } = useApiCache<Branch[]>('branches', () => apiClient.getBranches());
  const {
    data: warehouses,
    loading: whLoading,
    error: whError,
    refresh: refreshWarehouses,
  } = useApiCache<Warehouse[]>('warehouses', () => apiClient.getWarehouses());

  const isLoading = whLoading;

  /* -------------------- Filtering -------------------- */
  const filteredWarehouses = useMemo(() => {
    if (!warehouses) return [];
    let filtered = [...warehouses];
    if (filterCompany !== 'all') {
      filtered = filtered.filter((w) => w.company_id === parseInt(filterCompany));
    }
    if (filterBranch !== 'all') {
      filtered = filtered.filter((w) => w.branch_id === parseInt(filterBranch));
    }
    if (filterStatus !== 'all') {
      filtered = filtered.filter((w) =>
        filterStatus === 'active' ? w.active : !w.active
      );
    }
    return filtered;
  }, [warehouses, filterCompany, filterBranch, filterStatus]);

  const summary = useMemo(
    () => ({
      total: warehouses?.length || 0,
      active: warehouses?.filter((w) => w.active).length || 0,
      inactive: warehouses?.filter((w) => !w.active).length || 0,
    }),
    [warehouses]
  );

  const activeFilterCount = [
    filterCompany !== 'all' ? filterCompany : undefined,
    filterBranch !== 'all' ? filterBranch : undefined,
    filterStatus !== 'all' ? filterStatus : undefined,
  ].filter(Boolean).length;

  const clearFilters = useCallback(() => {
    setFilterCompany('all');
    setFilterBranch('all');
    setFilterStatus('all');
  }, []);

  /* -------------------- Branch filtering -------------------- */
  const filteredBranchesForm = useMemo(() => {
    if (!formData.company_id || !branches) return [];
    return branches.filter((b) => b.company_id === parseInt(String(formData.company_id)));
  }, [formData.company_id, branches]);

  const filteredBranchesFilter = useMemo(() => {
    if (filterCompany !== 'all' && branches) {
      return branches.filter((b) => b.company_id === parseInt(filterCompany));
    }
    return branches || [];
  }, [filterCompany, branches]);

  /* -------------------- Selection -------------------- */
  const allSelected = Boolean(
    filteredWarehouses.length > 0 &&
      filteredWarehouses.every((w) => selectedIds.includes(w.id))
  );

  const toggleSelectAll = useCallback(() => {
    const ids = filteredWarehouses.map((w) => w.id);
    if (!ids.length) return;
    if (allSelected) {
      setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
    } else {
      setSelectedIds((current) => Array.from(new Set([...current, ...ids])));
    }
  }, [allSelected, filteredWarehouses]);

  const toggleSelected = useCallback((id: number) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((v) => v !== id) : [...current, id]
    );
  }, []);

  /* -------------------- Detail view -------------------- */
  const handleView = useCallback((warehouse: Warehouse) => {
    setViewingWarehouse(warehouse);
    setIsViewPanelOpen(true);
  }, []);

  /* -------------------- Bulk actions -------------------- */
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Delete ${selectedIds.length} warehouse(s)?`)) return;
    try {
      await Promise.all(selectedIds.map((id) => apiClient.deleteWarehouse(id)));
      showSuccess('Bulk delete', `${selectedIds.length} warehouse(s) deleted.`);
      safeLog({
        module: 'Warehouses',
        action: 'Bulk delete',
        status: 'success',
        message: `Deleted ${selectedIds.length} warehouses`,
      });
      setSelectedIds([]);
      refreshWarehouses();
    } catch (err: unknown) {
      showError('Bulk delete failed', getErrorMessage(err, 'Bulk delete failed.'));
    }
  };

  const handleBulkStatusChange = async (active: boolean) => {
    if (selectedIds.length === 0) return;
    const label = active ? 'activate' : 'deactivate';
    if (
      !window.confirm(
        `Are you sure you want to ${label} ${selectedIds.length} warehouse(s)?`
      )
    )
      return;
    try {
      await Promise.all(
        selectedIds.map((id) =>
          apiClient.updateWarehouse(id, { active } as Partial<Warehouse>)
        )
      );
      showSuccess('Bulk update', `${selectedIds.length} warehouse(s) ${label}d.`);
      safeLog({
        module: 'Warehouses',
        action: 'Bulk status change',
        status: 'success',
        message: `${label}d ${selectedIds.length} warehouses`,
      });
      setSelectedIds([]);
      refreshWarehouses();
    } catch (err: unknown) {
      showError('Bulk update failed', getErrorMessage(err, 'Bulk update failed.'));
    }
  };

  /* -------------------- CRUD -------------------- */
  const resetForm = () => {
    setFormData({
      company_id: '',
      branch_id: '',
      name: '',
      code: '',
      location: '',
      active: true,
    });
    setFormError(null);
  };

  const handleCreate = useCallback(() => {
    setEditingId(null);
    resetForm();
    setIsPanelOpen(true);
  }, []);

  const handleEdit = useCallback((warehouse: Warehouse) => {
    setEditingId(warehouse.id);
    setFormData({
      company_id: warehouse.company_id || '',
      branch_id: warehouse.branch_id || '',
      name: warehouse.name || '',
      code: warehouse.code || '',
      location: warehouse.location || '',
      active: warehouse.active ?? true,
    });
    setFormError(null);
    setIsPanelOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (warehouse: Warehouse) => {
      if (!window.confirm(`Delete warehouse "${warehouse.name}"?`)) return;
      try {
        await apiClient.deleteWarehouse(warehouse.id);
        showSuccess('Warehouse deleted', `"${warehouse.name}" removed.`);
        safeLog({
          module: 'Warehouses',
          action: 'Delete warehouse',
          status: 'success',
          message: `Deleted warehouse ${warehouse.name}`,
        });
        refreshWarehouses();
      } catch (err: unknown) {
        showError('Delete failed', getErrorMessage(err, 'Delete failed.'));
      }
    },
    [refreshWarehouses, showError, showSuccess]
  );

  /* -------------------- Validation -------------------- */
  const validateForm = (): boolean => {
    if (!formData.company_id) {
      setFormError('Company is required.');
      return false;
    }
    if (!formData.branch_id) {
      setFormError('Branch is required.');
      return false;
    }
    if (!formData.name.trim()) {
      setFormError('Warehouse name is required.');
      return false;
    }
    setFormError(null);
    return true;
  };

  const handleSubmit = useCallback(async () => {
    if (!validateForm()) return;
    const payload = {
      ...formData,
      company_id: parseInt(String(formData.company_id)),
      branch_id: parseInt(String(formData.branch_id)),
    };

    setSubmitting(true);
    try {
      if (editingId) {
        await apiClient.updateWarehouse(editingId, payload);
        showSuccess('Warehouse updated', `"${formData.name}" updated.`);
        safeLog({
          module: 'Warehouses',
          action: 'Update warehouse',
          status: 'success',
          message: `Updated warehouse ${formData.name}`,
        });
      } else {
        await apiClient.createWarehouse(payload);
        showSuccess('Warehouse created', `"${formData.name}" created.`);
        safeLog({
          module: 'Warehouses',
          action: 'Create warehouse',
          status: 'success',
          message: `Created warehouse ${formData.name}`,
        });
      }
      setIsPanelOpen(false);
      refreshWarehouses();
    } catch (err: unknown) {
      const msg = getErrorMessage(err, 'Save failed.');
      showError('Save failed', msg);
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  }, [formData, editingId, refreshWarehouses, showSuccess, showError]);

  /* -------------------- Export -------------------- */
  const handleExport = useCallback(() => {
    if (filteredWarehouses.length === 0) {
      showError('Export failed', 'No warehouses to export.');
      return;
    }
    const headers = ['Warehouse Name', 'Company', 'Branch', 'Code', 'Location', 'Status'];
    const rows = filteredWarehouses.map((w) =>
      [
        escapeCsvField(w.name),
        escapeCsvField(w.company?.name || ''),
        escapeCsvField(w.branch?.name || ''),
        escapeCsvField(w.code || ''),
        escapeCsvField(w.location || ''),
        w.active ? 'Active' : 'Inactive',
      ].join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `warehouses-${getLocalDate()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showSuccess('Export', 'Warehouses exported.');
  }, [filteredWarehouses, showSuccess, showError]);

  /* -------------------- Render field helpers -------------------- */
  const renderField = (
    label: string,
    field: keyof WarehouseFormData,
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
          type="text"
          value={value as string}
          onChange={(e) => setFormData((prev) => ({ ...prev, [field]: e.target.value }))}
          className="h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
          placeholder={`Enter ${label}`}
        />
      </div>
    );
  };

  /* -------------------- Error state -------------------- */
  if (whError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-600">
            <FiAlertCircle size={24} />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">Failed to load warehouses</h2>
          <p className="mt-1.5 text-sm text-slate-500">{whError}</p>
          <Button
            onClick={refreshWarehouses}
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

        .warehouses-offcanvas-wide {
          width: min(760px, 96vw) !important;
          max-width: min(760px, 96vw) !important;
        }
        .warehouses-detail-offcanvas {
          width: min(560px, 96vw) !important;
          max-width: min(560px, 96vw) !important;
        }
        @media (max-width: 640px) {
          .warehouses-offcanvas-wide,
          .warehouses-detail-offcanvas { width: 100vw !important; max-width: 100vw !important; }
        }

        .warehouses-offcanvas-wide .warehouses-form-scroll,
        .warehouses-detail-offcanvas .warehouses-form-scroll {
          overflow-y: auto;
          overflow-x: hidden;
          min-height: 0;
          flex: 1 1 auto;
          max-height: calc(100vh - 180px);
          scrollbar-width: thin;
          scrollbar-color: #cbd5e1 transparent;
        }
        .warehouses-offcanvas-wide .warehouses-form-scroll::-webkit-scrollbar,
        .warehouses-detail-offcanvas .warehouses-form-scroll::-webkit-scrollbar { width: 8px; }
        .warehouses-offcanvas-wide .warehouses-form-scroll::-webkit-scrollbar-track,
        .warehouses-detail-offcanvas .warehouses-form-scroll::-webkit-scrollbar-track { background: transparent; }
        .warehouses-offcanvas-wide .warehouses-form-scroll::-webkit-scrollbar-thumb,
        .warehouses-detail-offcanvas .warehouses-form-scroll::-webkit-scrollbar-thumb {
          background-color: #cbd5e1; border-radius: 8px;
        }
        .warehouses-offcanvas-wide .warehouses-form-scroll::-webkit-scrollbar-thumb:hover,
        .warehouses-detail-offcanvas .warehouses-form-scroll::-webkit-scrollbar-thumb:hover {
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
                  <FiPackage size={12} />
                  Inventory · Warehouses
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-[32px]">
                  Warehouse workspace
                </h1>
                <p className="mt-1.5 max-w-2xl text-sm text-slate-300">
                  Manage storage locations, branch assignments, and inventory staging points.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={handleExport}
                  disabled={isLoading || filteredWarehouses.length === 0}
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
                  New warehouse
                </Button>
              </div>
            </div>
          </section>

          {/* KPI */}
          <section className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3">
            {warehouses ? (
              <>
                <StatCard
                  icon={FiPackage}
                  label="Total warehouses"
                  value={summary.total}
                  accent="indigo"
                />
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
                      : 'Refine warehouses by company, branch or status'}
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
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="min-w-0">
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

                <div className="min-w-0">
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
                  <FiPackage size={14} />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-800">
                    Warehouse directory
                  </CardTitle>
                  <CardDescription className="text-[11px] text-slate-500">
                    {isLoading
                      ? 'Loading warehouses…'
                      : `${filteredWarehouses.length.toLocaleString('en-IN')} record${
                          filteredWarehouses.length === 1 ? '' : 's'
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
                      <TableHeadLabel>Warehouse</TableHeadLabel>
                    </TableHead>
                    <TableHead>
                      <TableHeadLabel>Company</TableHeadLabel>
                    </TableHead>
                    <TableHead>
                      <TableHeadLabel>Branch</TableHeadLabel>
                    </TableHead>
                    <TableHead>
                      <TableHeadLabel>Location</TableHeadLabel>
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
                    filteredWarehouses.map((warehouse) => {
                      const selected = selectedIds.includes(warehouse.id);
                      return (
                        <TableRow
                          key={warehouse.id}
                          data-state={selected ? 'selected' : undefined}
                          className={`cursor-pointer border-slate-100 transition-colors hover:bg-slate-50/70 ${
                            selected ? 'bg-indigo-50/40 hover:bg-indigo-50/60' : ''
                          }`}
                          onClick={() => handleView(warehouse)}
                        >
                          <TableCell className="px-3" onClick={(e) => e.stopPropagation()}>
                            <input
                              aria-label={`Select ${warehouse.name}`}
                              type="checkbox"
                              checked={selected}
                              onChange={(event) => {
                                event.stopPropagation();
                                toggleSelected(warehouse.id);
                              }}
                              onClick={(event) => event.stopPropagation()}
                              className="h-4 w-4 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/30"
                            />
                          </TableCell>

                          <TableCell>
                            <div className="flex min-w-[200px] items-center gap-2.5">
                              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[11px] font-bold text-white">
                                {(warehouse.name || 'W')[0]?.toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-900">
                                  {warehouse.name}
                                </p>
                                {warehouse.code && (
                                  <p className="truncate font-mono text-[11px] text-slate-500">
                                    {warehouse.code}
                                  </p>
                                )}
                              </div>
                            </div>
                          </TableCell>

                          <TableCell>
                            <span className="text-sm text-slate-700">
                              {warehouse.company?.name || '—'}
                            </span>
                          </TableCell>

                          <TableCell>
                            <span className="text-sm text-slate-700">
                              {warehouse.branch?.name || '—'}
                            </span>
                          </TableCell>

                          <TableCell>
                            <div className="flex max-w-[260px] items-start gap-1.5 text-sm text-slate-600">
                              <FiMapPin size={12} className="mt-1 shrink-0 text-slate-400" />
                              <span className="truncate">
                                {warehouse.location ? warehouse.location.replace(/\n/g, ', ') : '—'}
                              </span>
                            </div>
                          </TableCell>

                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                                warehouse.active
                                  ? 'border-emerald-200/70 bg-emerald-50 text-emerald-700'
                                  : 'border-red-200/70 bg-red-50 text-red-700'
                              }`}
                            >
                              {warehouse.active ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>

                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleEdit(warehouse)}
                                className="grid h-8 w-8 place-items-center rounded-lg text-indigo-500 transition hover:bg-indigo-50 hover:text-indigo-700"
                                title="Edit"
                              >
                                <FiEdit size={15} />
                              </button>
                              <button
                                onClick={() => handleDelete(warehouse)}
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

                  {!isLoading && !filteredWarehouses.length && (
                    <TableRow>
                      <TableCell colSpan={TABLE_COLUMN_COUNT + 1} className="py-20 text-center">
                        <div className="mx-auto max-w-md px-4">
                          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-slate-200/70">
                            <FiFilter className="h-6 w-6 text-slate-400" />
                          </div>
                          <p className="mt-4 text-base font-semibold text-slate-800">
                            No warehouses found
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            Try adjusting the company, branch, or status filter.
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
      {/* Warehouse detail view (opens on row click)                */}
      {/* ══════════════════════════════════════════════════════════ */}
      {isViewPanelOpen && viewingWarehouse && (
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
            title={viewingWarehouse.name}
            onClose={() => setIsViewPanelOpen(false)}
            className="warehouses-detail-offcanvas"
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
                    handleEdit(viewingWarehouse);
                  }}
                  className="rounded-xl bg-indigo-600 font-semibold hover:bg-indigo-700"
                >
                  <FiEdit className="mr-2" size={14} /> Edit
                </Button>
              </div>
            }
          >
            <div className="warehouses-form-scroll space-y-4 pr-2">
              {/* Header summary */}
              <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
                <div className="flex items-start gap-3">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-base font-bold text-white shadow-sm">
                    {(viewingWarehouse.name || 'W')[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-bold text-slate-900">
                      {viewingWarehouse.name}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                          viewingWarehouse.active
                            ? 'border-emerald-200/70 bg-emerald-50 text-emerald-700'
                            : 'border-red-200/70 bg-red-50 text-red-700'
                        }`}
                      >
                        {viewingWarehouse.active ? 'Active' : 'Inactive'}
                      </Badge>
                      {viewingWarehouse.code && (
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 font-mono text-[11px] text-slate-600">
                          {viewingWarehouse.code}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Company */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-3.5 py-2.5">
                  <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <FiBriefcase size={12} /> Company
                  </p>
                </div>
                <div className="px-3.5 py-3">
                  <p className="text-sm font-semibold text-slate-800">
                    {viewingWarehouse.company?.name || '—'}
                  </p>
                </div>
              </div>

              {/* Branch */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-3.5 py-2.5">
                  <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <FiHome size={12} /> Branch
                  </p>
                </div>
                <div className="px-3.5 py-3">
                  <p className="text-sm font-semibold text-slate-800">
                    {viewingWarehouse.branch?.name || '—'}
                  </p>
                </div>
              </div>

              {/* Meta */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-3.5 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Details
                  </p>
                </div>
                <div className="divide-y divide-slate-100">
                  <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      <FiHash size={12} /> Code
                    </span>
                    <span className="font-mono text-xs font-semibold text-slate-800">
                      {viewingWarehouse.code || '—'}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-3 px-3.5 py-2.5">
                    <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      <FiMapPin size={12} /> Location
                    </span>
                    <span className="min-w-0 max-w-[240px] whitespace-pre-line text-right text-xs font-semibold text-slate-800">
                      {viewingWarehouse.location || '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Timestamps */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
                <div className="flex items-center justify-between gap-3 text-[11px]">
                  <span className="font-medium uppercase tracking-wide text-slate-400">
                    Created
                  </span>
                  <span className="font-semibold text-slate-700">
                    {formatDateTime(viewingWarehouse.created_at)}
                  </span>
                </div>
                {viewingWarehouse.updated_at && (
                  <div className="mt-1.5 flex items-center justify-between gap-3 text-[11px]">
                    <span className="font-medium uppercase tracking-wide text-slate-400">
                      Updated
                    </span>
                    <span className="font-semibold text-slate-700">
                      {formatDateTime(viewingWarehouse.updated_at)}
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
            title={editingId ? 'Edit warehouse' : 'New warehouse'}
            onClose={() => setIsPanelOpen(false)}
            className="warehouses-offcanvas-wide"
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
                  {submitting ? 'Saving…' : editingId ? 'Update warehouse' : 'Create warehouse'}
                </Button>
              </div>
            }
          >
            <div className="warehouses-form-scroll space-y-5 pr-2">
              {/* Form error banner */}
              {formError && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <FiAlertCircle className="mt-0.5 shrink-0" size={16} />
                  <span className="break-words">{formError}</span>
                </div>
              )}

              {/* Assignment */}
              <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-indigo-500" /> Assignment
                </legend>
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="min-w-0">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Company <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <select
                        value={formData.company_id as string}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            company_id: e.target.value,
                            branch_id: '',
                          }))
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

                  <div className="min-w-0">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Branch <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <select
                        value={formData.branch_id as string}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, branch_id: e.target.value }))
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
                </div>
              </fieldset>

              {/* Warehouse details */}
              <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-violet-500" /> Warehouse details
                </legend>
                <div className="mt-3 space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {renderField('Warehouse name', 'name', true)}
                    {renderField('Code', 'code')}
                  </div>

                  <div className="min-w-0">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Location
                    </label>
                    <textarea
                      value={formData.location}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, location: e.target.value }))
                      }
                      rows={3}
                      className="min-h-[90px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                      placeholder="Enter full address or location notes"
                    />
                  </div>
                </div>
              </fieldset>

              {/* Status */}
              <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Status
                </legend>
                <div className="mt-3">
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Active — visible on all documents
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={formData.active}
                      aria-label="Active"
                      onClick={() =>
                        setFormData((prev) => ({ ...prev, active: !prev.active }))
                      }
                      className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-4 focus:ring-indigo-500/20 ${
                        formData.active ? 'bg-indigo-600' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${
                          formData.active ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </fieldset>
            </div>
          </Offcanvas>
        </Suspense>
      )}
    </>
  );
}

export default WarehousesPage;