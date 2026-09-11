// src/pages/DealersPage.tsx
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
  FiRefreshCw,
  FiTrash2,
  FiEdit,
  FiDownload,
  FiUsers,
  FiUserCheck,
  FiUserX,
  FiCreditCard,
  FiAlertCircle,
  FiFilter,
  FiSearch,
  FiX,
  FiChevronDown,
  FiClock,
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

interface Dealer {
  id: number;
  company_id: number;
  branch_id?: number;
  parent_id?: number;
  name: string;
  type: string;
  company_type?: string;
  email?: string;
  contact_person?: string;
  contact_no?: string;
  gst_number?: string;
  registration_type?: string;
  pan?: string;
  billing_street?: string;
  billing_landmark?: string;
  billing_city?: string;
  billing_state?: string;
  billing_country?: string;
  billing_pincode?: string;
  shipping_street?: string;
  shipping_landmark?: string;
  shipping_city?: string;
  shipping_state?: string;
  shipping_country?: string;
  shipping_pincode?: string;
  eway_bill_distance?: number | string;
  group_id?: number | null;
  opening_balance?: number;
  credit_limit?: number;
  due_days?: number | string;
  status?: string;
  fax?: string;
  website?: string;
  note?: string;
  license_no?: string;
  custom_field_1?: string;
  custom_field_2?: string;
  is_active: boolean;
  territory?: string;
  zone?: string;
  outstanding_amount?: number;
  wallet_balance?: number;
  commission_rate?: number;
  kyc_status?: string;
  approved_at?: string;
  notes?: string;
  company?: { id: number; name: string };
  branch?: { id: number; name: string };
  parent?: { id: number; name: string };
  group?: { id: number; name: string };
}

type DealerFormData = Partial<Dealer> & { same_as_billing?: boolean };

interface Company {
  id: number;
  name: string;
}
interface Branch {
  id: number;
  name: string;
  company_id: number;
}
interface CustomerGroup {
  id: number;
  name: string;
}
interface GstLookupResult {
  company_name?: string;
  billing_street?: string;
  billing_city?: string;
  billing_state?: string;
  billing_pincode?: string;
  billing_country?: string;
  registration_type?: string;
  pan?: string;
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
const TABLE_COLUMN_COUNT = 8;

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'pending', label: 'Pending' },
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

function safeNum(value: unknown): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : 0;
}

function unwrapList<T>(response: unknown): T[] {
  if (Array.isArray(response)) return response as T[];
  if (response && typeof response === 'object' && Array.isArray((response as { data?: unknown }).data)) {
    return (response as { data: T[] }).data;
  }
  return [];
}

function escapeCsvField(value: unknown): string {
  const raw = String(value ?? '');
  const dangerous = /^[=+\-@\t\r]/.test(raw);
  const safe = dangerous ? `\t${raw}` : raw;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function formatCurrency(value: unknown): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(safeNum(value));
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
    prefix,
  }: {
    icon: React.ElementType;
    label: string;
    value: string | number;
    accent?: Accent;
    prefix?: string;
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
              {prefix}
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

export function DealersPage() {
  const { showSuccess, showError } = useNotification();

  /* -------------------- Filters -------------------- */
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterTerritory, setFilterTerritory] = useState('all');
  const [filterZone, setFilterZone] = useState('all');

  /* -------------------- Panel state -------------------- */
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<DealerFormData>({
    company_id: 0,
    branch_id: undefined,
    parent_id: undefined,
    name: '',
    type: 'dealer',
    company_type: '',
    email: '',
    contact_person: '',
    contact_no: '',
    gst_number: '',
    registration_type: '',
    pan: '',
    billing_street: '',
    billing_landmark: '',
    billing_city: '',
    billing_state: '',
    billing_country: 'India',
    billing_pincode: '',
    shipping_street: '',
    shipping_landmark: '',
    shipping_city: '',
    shipping_state: '',
    shipping_country: 'India',
    shipping_pincode: '',
    eway_bill_distance: '',
    group_id: undefined,
    opening_balance: 0,
    credit_limit: 0,
    due_days: '',
    fax: '',
    website: '',
    note: '',
    license_no: '',
    custom_field_1: '',
    custom_field_2: '',
    is_active: true,
    territory: '',
    zone: '',
    outstanding_amount: 0,
    wallet_balance: 0,
    commission_rate: 0,
    kyc_status: 'pending',
    approved_at: undefined,
    notes: '',
    same_as_billing: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({});

  const [showGroupModal, setShowGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [addingGroup, setAddingGroup] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;

  /* -------------------- Data fetching -------------------- */
  const {
    data: allCustomers,
    loading: custLoading,
    error: custError,
    refresh: refreshCustomers,
  } = useApiCache<Dealer[]>('allCustomers', () => apiClient.request('GET', '/customers?per_page=1000'));

  const { data: companies } = useApiCache<Company[]>('companies', () => apiClient.getCompanies());
  const { data: branches } = useApiCache<Branch[]>('branches', () => apiClient.getBranches());
  const { data: customerGroups, refresh: refreshGroups } = useApiCache<CustomerGroup[]>(
    'customerGroups',
    () => apiClient.getCustomerGroups()
  );

  const dealers = useMemo(
    () => (allCustomers || []).filter((c) => c.type === 'dealer'),
    [allCustomers]
  );

  /* -------------------- Filters & derived -------------------- */
  const filteredDealers = useMemo(() => {
    let filtered = [...dealers];
    const term = searchTerm.toLowerCase().trim();
    if (term) {
      filtered = filtered.filter(
        (d) =>
          d.name?.toLowerCase().includes(term) ||
          d.contact_person?.toLowerCase().includes(term) ||
          d.territory?.toLowerCase().includes(term) ||
          d.zone?.toLowerCase().includes(term) ||
          d.email?.toLowerCase().includes(term)
      );
    }
    if (filterStatus !== 'all') filtered = filtered.filter((d) => d.status === filterStatus);
    if (filterTerritory !== 'all') filtered = filtered.filter((d) => d.territory === filterTerritory);
    if (filterZone !== 'all') filtered = filtered.filter((d) => d.zone === filterZone);
    return filtered;
  }, [dealers, searchTerm, filterStatus, filterTerritory, filterZone]);

  const totalPages = Math.max(1, Math.ceil(filteredDealers.length / rowsPerPage));
  const paginatedDealers = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredDealers.slice(start, start + rowsPerPage);
  }, [filteredDealers, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus, filterTerritory, filterZone]);

  const summary = useMemo(
    () => ({
      total: dealers.length,
      active: dealers.filter((d) => d.status === 'active').length,
      inactive: dealers.filter((d) => d.status === 'inactive').length,
      pending: dealers.filter((d) => d.status === 'pending' || !d.status).length,
      totalCredit: dealers.reduce((sum, d) => sum + safeNum(d.credit_limit), 0),
      totalOutstanding: dealers.reduce((sum, d) => sum + safeNum(d.outstanding_amount), 0),
    }),
    [dealers]
  );

  const territories = useMemo(
    () => [...new Set(dealers.map((d) => d.territory).filter((t): t is string => Boolean(t)))],
    [dealers]
  );
  const zones = useMemo(
    () => [...new Set(dealers.map((d) => d.zone).filter((z): z is string => Boolean(z)))],
    [dealers]
  );

  const filteredBranchesForm = useMemo(() => {
    if (formData.company_id && branches) {
      return branches.filter((b) => b.company_id === Number(formData.company_id));
    }
    return [];
  }, [formData.company_id, branches]);

  const activeFilterCount = [
    searchTerm,
    filterStatus !== 'all' ? filterStatus : undefined,
    filterTerritory !== 'all' ? filterTerritory : undefined,
    filterZone !== 'all' ? filterZone : undefined,
  ].filter(Boolean).length;

  const clearFilters = useCallback(() => {
    setSearchTerm('');
    setFilterStatus('all');
    setFilterTerritory('all');
    setFilterZone('all');
  }, []);

  /* -------------------- GST lookup -------------------- */
  const [lookingUp, setLookingUp] = useState(false);

  const handleGstChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, gst_number: e.target.value }));
  };

  const handleAutoFill = async () => {
    if (!formData.gst_number || formData.gst_number.length < 10) {
      showError('Invalid GSTIN', 'Please enter a valid GSTIN (min 10 characters).');
      return;
    }
    setLookingUp(true);
    try {
      const data = (await apiClient.lookupGst(formData.gst_number)) as GstLookupResult;
      if (data) {
        setFormData((prev) => ({
          ...prev,
          name: data.company_name || prev.name,
          billing_street: data.billing_street || prev.billing_street,
          billing_city: data.billing_city || prev.billing_city,
          billing_state: data.billing_state || prev.billing_state,
          billing_pincode: data.billing_pincode || prev.billing_pincode,
          billing_country: data.billing_country || prev.billing_country,
          registration_type: data.registration_type || prev.registration_type,
          pan: data.pan || prev.pan,
        }));
        showSuccess('GSTIN details auto-filled');
      } else {
        showError('Not found', 'Unable to fetch GSTIN details. Check the number and try again.');
      }
    } catch (err: unknown) {
      showError('Lookup failed', getErrorMessage(err, 'Unable to fetch GSTIN details.'));
    } finally {
      setLookingUp(false);
    }
  };

  /* -------------------- Same as billing -------------------- */
  const handleSameAsBillingToggle = (checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      same_as_billing: checked,
      ...(checked
        ? {
            shipping_street: prev.billing_street,
            shipping_landmark: prev.billing_landmark,
            shipping_city: prev.billing_city,
            shipping_state: prev.billing_state,
            shipping_country: prev.billing_country,
            shipping_pincode: prev.billing_pincode,
          }
        : {}),
    }));
  };

  /* -------------------- Group add -------------------- */
  const handleAddGroup = async () => {
    if (!newGroupName.trim()) return;
    setAddingGroup(true);
    try {
      await apiClient.createCustomerGroup({ name: newGroupName.trim() });
      refreshGroups();
      setNewGroupName('');
      setShowGroupModal(false);
      showSuccess('Group added', `${newGroupName.trim()} created.`);
    } catch (err: unknown) {
      showError('Failed to add group', getErrorMessage(err, 'Failed to add group.'));
    } finally {
      setAddingGroup(false);
    }
  };

  /* -------------------- CRUD -------------------- */
  const resetForm = () => {
    setFormData({
      company_id: 0,
      branch_id: undefined,
      parent_id: undefined,
      name: '',
      type: 'dealer',
      company_type: '',
      email: '',
      contact_person: '',
      contact_no: '',
      gst_number: '',
      registration_type: '',
      pan: '',
      billing_street: '',
      billing_landmark: '',
      billing_city: '',
      billing_state: '',
      billing_country: 'India',
      billing_pincode: '',
      shipping_street: '',
      shipping_landmark: '',
      shipping_city: '',
      shipping_state: '',
      shipping_country: 'India',
      shipping_pincode: '',
      eway_bill_distance: '',
      group_id: undefined,
      opening_balance: 0,
      credit_limit: 0,
      due_days: '',
      fax: '',
      website: '',
      note: '',
      license_no: '',
      custom_field_1: '',
      custom_field_2: '',
      is_active: true,
      territory: '',
      zone: '',
      outstanding_amount: 0,
      wallet_balance: 0,
      commission_rate: 0,
      kyc_status: 'pending',
      approved_at: undefined,
      notes: '',
      same_as_billing: true,
    });
    setFormErrors({});
  };

  const handleCreate = useCallback(() => {
    setEditingId(null);
    resetForm();
    setIsPanelOpen(true);
  }, []);

  const handleEdit = useCallback((dealer: Dealer) => {
    setEditingId(dealer.id);
    setFormData({
      company_id: dealer.company_id,
      branch_id: dealer.branch_id,
      parent_id: dealer.parent_id,
      name: dealer.name || '',
      type: 'dealer',
      company_type: dealer.company_type || '',
      email: dealer.email || '',
      contact_person: dealer.contact_person || '',
      contact_no: dealer.contact_no || '',
      gst_number: dealer.gst_number || '',
      registration_type: dealer.registration_type || '',
      pan: dealer.pan || '',
      billing_street: dealer.billing_street || '',
      billing_landmark: dealer.billing_landmark || '',
      billing_city: dealer.billing_city || '',
      billing_state: dealer.billing_state || '',
      billing_country: dealer.billing_country || 'India',
      billing_pincode: dealer.billing_pincode || '',
      shipping_street: dealer.shipping_street || '',
      shipping_landmark: dealer.shipping_landmark || '',
      shipping_city: dealer.shipping_city || '',
      shipping_state: dealer.shipping_state || '',
      shipping_country: dealer.shipping_country || 'India',
      shipping_pincode: dealer.shipping_pincode || '',
      eway_bill_distance: dealer.eway_bill_distance ?? '',
      group_id: dealer.group_id ?? undefined,
      opening_balance: dealer.opening_balance ?? 0,
      credit_limit: dealer.credit_limit ?? 0,
      due_days: dealer.due_days ?? '',
      fax: dealer.fax || '',
      website: dealer.website || '',
      note: dealer.note || '',
      license_no: dealer.license_no || '',
      custom_field_1: dealer.custom_field_1 || '',
      custom_field_2: dealer.custom_field_2 || '',
      is_active: dealer.is_active !== false,
      territory: dealer.territory || '',
      zone: dealer.zone || '',
      outstanding_amount: dealer.outstanding_amount ?? 0,
      wallet_balance: dealer.wallet_balance ?? 0,
      commission_rate: dealer.commission_rate ?? 0,
      kyc_status: dealer.kyc_status || 'pending',
      approved_at: dealer.approved_at,
      notes: dealer.notes || '',
      same_as_billing:
        !dealer.shipping_street ||
        (dealer.shipping_street === dealer.billing_street &&
          dealer.shipping_city === dealer.billing_city),
    });
    setFormErrors({});
    setIsPanelOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (dealer: Dealer) => {
      if (!window.confirm(`Delete dealer ${dealer.name}?`)) return;
      try {
        await apiClient.deleteCustomer(dealer.id);
        showSuccess('Dealer deleted', `${dealer.name} removed.`);
        safeLog({
          module: 'Dealers',
          action: 'Delete',
          status: 'success',
          message: `Deleted ${dealer.name}`,
        });
        refreshCustomers();
      } catch (err: unknown) {
        showError('Delete failed', getErrorMessage(err, 'Delete failed.'));
      }
    },
    [refreshCustomers, showSuccess, showError]
  );

  /* -------------------- Validation -------------------- */
  const validateForm = (): boolean => {
    const errors: Record<string, boolean> = {};
    let valid = true;
    if (!formData.name?.trim()) {
      errors.name = true;
      valid = false;
    }
    if (!formData.company_id || formData.company_id === 0) {
      errors.company_id = true;
      valid = false;
    }
    if (!formData.billing_city?.trim()) {
      errors.billing_city = true;
      valid = false;
    }
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = true;
      valid = false;
    }
    if (formData.contact_no && !/^\d+$/.test(formData.contact_no.trim())) {
      errors.contact_no = true;
      valid = false;
    }
    setFormErrors(errors);
    if (!valid) showError('Validation', 'Please fix the highlighted required fields.');
    return valid;
  };

  const handleSubmit = useCallback(async () => {
    if (!validateForm()) return;
    const { same_as_billing: _same, ...rest } = formData;
    const payload = {
      ...rest,
      type: 'dealer',
      company_id: Number(formData.company_id),
      branch_id: formData.branch_id ? Number(formData.branch_id) : null,
      parent_id: formData.parent_id ? Number(formData.parent_id) : null,
      group_id: formData.group_id ? Number(formData.group_id) : null,
      eway_bill_distance: formData.eway_bill_distance ? Number(formData.eway_bill_distance) : null,
      opening_balance: safeNum(formData.opening_balance),
      credit_limit: safeNum(formData.credit_limit),
      outstanding_amount: safeNum(formData.outstanding_amount),
      wallet_balance: safeNum(formData.wallet_balance),
      commission_rate: safeNum(formData.commission_rate),
      due_days: formData.due_days ? Number(formData.due_days) : null,
    };

    setSubmitting(true);
    try {
      if (editingId) {
        await apiClient.updateCustomer(editingId, payload);
        showSuccess('Dealer updated', `${payload.name} updated.`);
        safeLog({
          module: 'Dealers',
          action: 'Update',
          status: 'success',
          message: `Updated ${payload.name}`,
        });
      } else {
        await apiClient.createCustomer(payload);
        showSuccess('Dealer created', `${payload.name} added.`);
        safeLog({
          module: 'Dealers',
          action: 'Create',
          status: 'success',
          message: `Created ${payload.name}`,
        });
      }
      setIsPanelOpen(false);
      refreshCustomers();
    } catch (err: unknown) {
      showError('Save failed', getErrorMessage(err, 'Save failed.'));
      safeLog({
        module: 'Dealers',
        action: 'Save',
        status: 'error',
        message: getErrorMessage(err, 'Save failed.'),
      });
    } finally {
      setSubmitting(false);
    }
  }, [formData, editingId, refreshCustomers, showSuccess, showError]);

  const handleExport = useCallback(() => {
    if (filteredDealers.length === 0) {
      showError('Export failed', 'No dealers to export.');
      return;
    }
    const headers = [
      'Name',
      'Contact',
      'Email',
      'Territory',
      'Zone',
      'Status',
      'Credit Limit',
      'Outstanding',
      'Wallet',
      'Commission',
    ];
    const rows = filteredDealers.map((d) =>
      [
        escapeCsvField(d.name),
        escapeCsvField(d.contact_person || ''),
        escapeCsvField(d.email || ''),
        escapeCsvField(d.territory || ''),
        escapeCsvField(d.zone || ''),
        escapeCsvField(d.status || ''),
        safeNum(d.credit_limit).toFixed(2),
        safeNum(d.outstanding_amount).toFixed(2),
        safeNum(d.wallet_balance).toFixed(2),
        safeNum(d.commission_rate).toFixed(2),
      ].join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dealers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showSuccess('Export', 'Dealer data exported.');
  }, [filteredDealers, showSuccess, showError]);

  /* -------------------- Render field helper -------------------- */
  const renderField = (
    label: string,
    field: keyof DealerFormData,
    type: 'text' | 'number' | 'email' = 'text',
    required = false
  ) => {
    const value = (formData as Record<string, unknown>)[field] ?? '';
    const id = `field-${field}`;
    const hasError = formErrors[field];
    const base = 'h-10 w-full min-w-0 rounded-xl border bg-white px-3.5 text-sm shadow-sm outline-none transition';
    const stateClass = hasError
      ? 'border-rose-300 ring-2 ring-rose-200'
      : 'border-slate-200 text-slate-700 hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10';

    return (
      <div className="min-w-0">
        <label htmlFor={id} className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
        <input
          id={id}
          type={type}
          value={value as string | number}
          onChange={(e) => setFormData((prev) => ({ ...prev, [field]: e.target.value }))}
          className={`${base} ${stateClass}`}
          placeholder={`Enter ${label}`}
          step={type === 'number' ? '0.01' : undefined}
        />
      </div>
    );
  };

  const renderSelect = (
    label: string,
    field: keyof DealerFormData,
    options: { value: string; label: string }[]
  ) => {
    const value = (formData as Record<string, unknown>)[field] ?? '';
    const id = `field-${field}`;
    return (
      <div className="min-w-0">
        <label htmlFor={id} className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </label>
        <div className="relative">
          <select
            id={id}
            value={String(value)}
            onChange={(e) => setFormData((prev) => ({ ...prev, [field]: e.target.value }))}
            className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
          >
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

  /* -------------------- Table columns -------------------- */
  const columns = useMemo(
    () => [
      {
        name: 'Name',
        selector: (row: Dealer) => row.name,
        sortable: true,
        cell: (row: Dealer) => (
          <div className="flex min-w-[190px] items-center gap-2.5">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[11px] font-bold text-white">
              {(row.name || 'D')[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{row.name}</p>
              {row.contact_person && (
                <p className="truncate text-[11px] text-slate-500">{row.contact_person}</p>
              )}
            </div>
          </div>
        ),
        width: '220px',
      },
      {
        name: 'Company',
        selector: (row: Dealer) => row.company_id,
        cell: (row: Dealer) => {
          const comp = (companies || []).find((c) => c.id === row.company_id);
          return <span className="text-sm text-slate-700">{comp?.name || `ID: ${row.company_id}`}</span>;
        },
        width: '150px',
      },
      {
        name: 'Territory',
        selector: (row: Dealer) => row.territory || '-',
        cell: (row: Dealer) => (
          <span className="text-sm text-slate-700">{row.territory || '—'}</span>
        ),
        width: '130px',
      },
      {
        name: 'Zone',
        selector: (row: Dealer) => row.zone || '-',
        cell: (row: Dealer) => (
          <span className="text-sm text-slate-700">{row.zone || '—'}</span>
        ),
        width: '110px',
      },
      {
        name: 'Credit Limit',
        selector: (row: Dealer) => safeNum(row.credit_limit),
        sortable: true,
        cell: (row: Dealer) => (
          <span className="text-sm font-semibold tabular-nums text-slate-900">
            {formatCurrency(row.credit_limit)}
          </span>
        ),
        width: '130px',
      },
      {
        name: 'Outstanding',
        selector: (row: Dealer) => safeNum(row.outstanding_amount),
        sortable: true,
        cell: (row: Dealer) => {
          const out = safeNum(row.outstanding_amount);
          return (
            <span
              className={`inline-flex items-center rounded-lg px-2 py-1 text-sm font-semibold tabular-nums ${
                out > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
              }`}
            >
              {formatCurrency(out)}
            </span>
          );
        },
        width: '140px',
      },
      {
        name: 'Status',
        selector: (row: Dealer) => row.status || 'pending',
        cell: (row: Dealer) => {
          const colors: Record<string, string> = {
            active: 'border-emerald-200/70 bg-emerald-50 text-emerald-700',
            inactive: 'border-rose-200/70 bg-rose-50 text-rose-700',
            pending: 'border-amber-200/70 bg-amber-50 text-amber-700',
          };
          const status = row.status || 'pending';
          return (
            <Badge
              variant="outline"
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize ${
                colors[status] || 'border-slate-200 bg-slate-50 text-slate-600'
              }`}
            >
              {status}
            </Badge>
          );
        },
        width: '110px',
      },
      {
        name: 'Actions',
        cell: (row: Dealer) => (
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={() => handleEdit(row)}
              className="grid h-8 w-8 place-items-center rounded-lg text-indigo-500 transition hover:bg-indigo-50 hover:text-indigo-700"
              title="Edit"
            >
              <FiEdit size={15} />
            </button>
            <button
              onClick={() => handleDelete(row)}
              className="grid h-8 w-8 place-items-center rounded-lg text-rose-500 transition hover:bg-rose-50 hover:text-rose-700"
              title="Delete"
            >
              <FiTrash2 size={15} />
            </button>
          </div>
        ),
        width: '100px',
      },
    ],
    [handleEdit, handleDelete, companies]
  );

  /* -------------------- Error state -------------------- */
  if (custError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-600">
            <FiAlertCircle size={24} />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">Failed to load dealers</h2>
          <p className="mt-1.5 text-sm text-slate-500">{custError}</p>
          <Button
            onClick={refreshCustomers}
            className="mt-5 rounded-xl bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <FiRefreshCw className="mr-2" size={14} />
            Try Again
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

        /* ── Wider offcanvas for Dealer form ── */
        .dealers-offcanvas-wide {
          width: min(1080px, 96vw) !important;
          max-width: min(1080px, 96vw) !important;
        }
        @media (max-width: 640px) {
          .dealers-offcanvas-wide { width: 100vw !important; max-width: 100vw !important; }
        }

        /* ── Scroll containment inside the offcanvas ── */
        .dealers-offcanvas-wide .dealers-form-scroll {
          overflow-y: auto;
          overflow-x: hidden;
          min-height: 0;
          flex: 1 1 auto;
          max-height: calc(100vh - 180px);
          scrollbar-width: thin;
          scrollbar-color: #cbd5e1 transparent;
        }
        .dealers-offcanvas-wide .dealers-form-scroll::-webkit-scrollbar { width: 8px; }
        .dealers-offcanvas-wide .dealers-form-scroll::-webkit-scrollbar-track { background: transparent; }
        .dealers-offcanvas-wide .dealers-form-scroll::-webkit-scrollbar-thumb {
          background-color: #cbd5e1; border-radius: 8px;
        }
        .dealers-offcanvas-wide .dealers-form-scroll::-webkit-scrollbar-thumb:hover {
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
                  Network · Dealers
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-[32px]">
                  Dealer directory
                </h1>
                <p className="mt-1.5 max-w-2xl text-sm text-slate-300">
                  Manage your dealer network, territories, credit limits, and KYC status.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={refreshCustomers}
                  disabled={custLoading}
                  className="h-10 rounded-xl border-white/10 bg-white/5 text-white shadow-none backdrop-blur transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                >
                  <FiRefreshCw className={`mr-2 ${custLoading ? 'animate-spin' : ''}`} size={14} />
                  Refresh
                </Button>
                <Button
                  variant="outline"
                  onClick={handleExport}
                  disabled={custLoading || filteredDealers.length === 0}
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
                  Add dealer
                </Button>
              </div>
            </div>
          </section>

          {/* KPI */}
          <section className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
            {custLoading ? (
              Array.from({ length: 5 }).map((_, i) => <StatCardSkeleton key={i} />)
            ) : (
              <>
                <StatCard icon={FiUsers} label="Total dealers" value={summary.total} accent="indigo" />
                <StatCard icon={FiUserCheck} label="Active" value={summary.active} accent="emerald" />
                <StatCard icon={FiUserX} label="Inactive" value={summary.inactive} accent="rose" />
                <StatCard icon={FiClock} label="Pending" value={summary.pending} accent="amber" />
                <StatCard
                  icon={FiCreditCard}
                  label="Total credit"
                  value={summary.totalCredit.toFixed(2)}
                  prefix="₹"
                  accent="violet"
                />
              </>
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
                      : 'Refine dealers by status, territory and zone'}
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
                <div className="relative lg:col-span-6">
                  <FiSearch
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    size={16}
                  />
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-10 rounded-xl border-slate-200 pl-10 shadow-sm focus-visible:ring-4 focus-visible:ring-indigo-500/10"
                    placeholder="Search by name, contact, email, territory…"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>

                <div className="lg:col-span-2">
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

                <div className="lg:col-span-2">
                  <div className="relative">
                    <select
                      aria-label="Territory"
                      value={filterTerritory}
                      onChange={(e) => setFilterTerritory(e.target.value)}
                      className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                    >
                      <option value="all">All territories</option>
                      {territories.map((t) => (
                        <option key={t} value={t}>
                          {t}
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
                      aria-label="Zone"
                      value={filterZone}
                      onChange={(e) => setFilterZone(e.target.value)}
                      className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                    >
                      <option value="all">All zones</option>
                      {zones.map((z) => (
                        <option key={z} value={z}>
                          {z}
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
                    Dealer directory
                  </CardTitle>
                  <CardDescription className="text-[11px] text-slate-500">
                    {custLoading
                      ? 'Loading dealers…'
                      : `${filteredDealers.length.toLocaleString('en-IN')} record${
                          filteredDealers.length === 1 ? '' : 's'
                        }`}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <div className="overflow-x-auto">
              <Table className="min-w-[1100px]">
                <TableHeader>
                  <TableRow className="border-slate-100 bg-slate-50/70 hover:bg-slate-50/70">
                    <TableHead>
                      <TableHeadLabel>Name</TableHeadLabel>
                    </TableHead>
                    <TableHead>
                      <TableHeadLabel>Company</TableHeadLabel>
                    </TableHead>
                    <TableHead>
                      <TableHeadLabel>Territory</TableHeadLabel>
                    </TableHead>
                    <TableHead>
                      <TableHeadLabel>Zone</TableHeadLabel>
                    </TableHead>
                    <TableHead className="text-right">
                      <TableHeadLabel align="right">Credit limit</TableHeadLabel>
                    </TableHead>
                    <TableHead className="text-right">
                      <TableHeadLabel align="right">Outstanding</TableHeadLabel>
                    </TableHead>
                    <TableHead>
                      <TableHeadLabel>Status</TableHeadLabel>
                    </TableHead>
                    <TableHead className="w-24 text-right">
                      <TableHeadLabel align="right">Actions</TableHeadLabel>
                    </TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {custLoading &&
                    Array.from({ length: 8 }).map((_, index) => (
                      <TableRow key={`skeleton-${index}`} className="border-slate-100">
                        {Array.from({ length: TABLE_COLUMN_COUNT }).map((__, cellIndex) => (
                          <TableCell key={cellIndex}>
                            <div className="h-4 animate-pulse rounded bg-slate-100" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}

                  {!custLoading && paginatedDealers.length > 0 && (
                    <>
                      {columns.slice(0, 7).map((col) => null)}
                      {paginatedDealers.map((dealer) => {
                        const comp = (companies || []).find((c) => c.id === dealer.company_id);
                        const out = safeNum(dealer.outstanding_amount);
                        const status = dealer.status || 'pending';
                        const statusColors: Record<string, string> = {
                          active: 'border-emerald-200/70 bg-emerald-50 text-emerald-700',
                          inactive: 'border-rose-200/70 bg-rose-50 text-rose-700',
                          pending: 'border-amber-200/70 bg-amber-50 text-amber-700',
                        };
                        return (
                          <TableRow
                            key={dealer.id}
                            className="border-slate-100 transition-colors hover:bg-slate-50/70"
                          >
                            <TableCell>
                              <div className="flex min-w-[190px] items-center gap-2.5">
                                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[11px] font-bold text-white">
                                  {(dealer.name || 'D')[0]?.toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-slate-900">
                                    {dealer.name}
                                  </p>
                                  {dealer.contact_person && (
                                    <p className="truncate text-[11px] text-slate-500">
                                      {dealer.contact_person}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </TableCell>

                            <TableCell className="text-sm text-slate-700">
                              {comp?.name || `ID: ${dealer.company_id}`}
                            </TableCell>

                            <TableCell className="text-sm text-slate-700">
                              {dealer.territory || '—'}
                            </TableCell>

                            <TableCell className="text-sm text-slate-700">
                              {dealer.zone || '—'}
                            </TableCell>

                            <TableCell className="whitespace-nowrap text-right text-sm font-semibold tabular-nums text-slate-900">
                              {formatCurrency(dealer.credit_limit)}
                            </TableCell>

                            <TableCell className="whitespace-nowrap text-right">
                              <span
                                className={`inline-flex items-center rounded-lg px-2 py-1 text-sm font-semibold tabular-nums ${
                                  out > 0
                                    ? 'bg-rose-50 text-rose-600'
                                    : 'bg-emerald-50 text-emerald-600'
                                }`}
                              >
                                {formatCurrency(out)}
                              </span>
                            </TableCell>

                            <TableCell>
                              <Badge
                                variant="outline"
                                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize ${
                                  statusColors[status] ||
                                  'border-slate-200 bg-slate-50 text-slate-600'
                                }`}
                              >
                                {status}
                              </Badge>
                            </TableCell>

                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleEdit(dealer)}
                                  className="grid h-8 w-8 place-items-center rounded-lg text-indigo-500 transition hover:bg-indigo-50 hover:text-indigo-700"
                                  title="Edit"
                                >
                                  <FiEdit size={15} />
                                </button>
                                <button
                                  onClick={() => handleDelete(dealer)}
                                  className="grid h-8 w-8 place-items-center rounded-lg text-rose-500 transition hover:bg-rose-50 hover:text-rose-700"
                                  title="Delete"
                                >
                                  <FiTrash2 size={15} />
                                </button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </>
                  )}

                  {!custLoading && paginatedDealers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={TABLE_COLUMN_COUNT} className="py-20 text-center">
                        <div className="mx-auto max-w-md px-4">
                          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-slate-200/70">
                            <FiSearch className="h-6 w-6 text-slate-400" />
                          </div>
                          <p className="mt-4 text-base font-semibold text-slate-800">
                            No dealers found
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            Try adjusting the status, territory, zone, or search term.
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

            {/* Pagination */}
            {!custLoading && totalPages > 1 && (
              <div className="flex flex-col gap-3 border-t border-slate-100 bg-white px-4 py-3.5 sm:px-5 md:flex-row md:items-center md:justify-between">
                <p className="text-xs text-slate-500 sm:text-[13px]">
                  Showing{' '}
                  <span className="font-semibold text-slate-700">
                    {(currentPage - 1) * rowsPerPage + 1}
                  </span>
                  –
                  <span className="font-semibold text-slate-700">
                    {Math.min(currentPage * rowsPerPage, filteredDealers.length)}
                  </span>{' '}
                  of{' '}
                  <span className="font-semibold text-slate-700">
                    {filteredDealers.length.toLocaleString('en-IN')}
                  </span>
                </p>
                <div className="flex items-center justify-between gap-1.5 sm:justify-end">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 rounded-lg"
                    disabled={currentPage === 1}
                    onClick={() => startTransition(() => setCurrentPage(1))}
                    aria-label="First page"
                  >
                    «
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 rounded-lg"
                    disabled={currentPage === 1}
                    onClick={() =>
                      startTransition(() => setCurrentPage((p) => Math.max(1, p - 1)))
                    }
                    aria-label="Previous page"
                  >
                    ‹
                  </Button>
                  <div className="mx-1 min-w-[76px] rounded-lg bg-slate-100 px-3 py-1.5 text-center text-xs font-semibold text-slate-700">
                    {currentPage} / {totalPages}
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 rounded-lg"
                    disabled={currentPage === totalPages}
                    onClick={() =>
                      startTransition(() => setCurrentPage((p) => Math.min(totalPages, p + 1)))
                    }
                    aria-label="Next page"
                  >
                    ›
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 rounded-lg"
                    disabled={currentPage === totalPages}
                    onClick={() => startTransition(() => setCurrentPage(totalPages))}
                    aria-label="Last page"
                  >
                    »
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Offcanvas – Dealer form */}
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
            title={editingId ? 'Edit dealer' : 'Add dealer'}
            onClose={() => setIsPanelOpen(false)}
            className="dealers-offcanvas-wide"
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
                  {submitting ? 'Saving…' : editingId ? 'Update dealer' : 'Save dealer'}
                </Button>
              </div>
            }
          >
            <div className="dealers-form-scroll space-y-5 pr-2">
              {/* Dealer detail */}
              <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-indigo-500" /> Dealer detail
                </legend>
                <div className="mt-3 space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="min-w-0">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Company <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <select
                          value={formData.company_id as number}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              company_id: Number(e.target.value),
                              branch_id: undefined,
                            }))
                          }
                          className={`h-10 w-full appearance-none rounded-xl border bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition ${
                            formErrors.company_id
                              ? 'border-rose-300 ring-2 ring-rose-200'
                              : 'border-slate-200 hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10'
                          }`}
                        >
                          <option value={0}>Select company</option>
                          {(companies || []).map((c) => (
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
                        Branch
                      </label>
                      <div className="relative">
                        <select
                          value={(formData.branch_id as number) ?? ''}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              branch_id: e.target.value ? Number(e.target.value) : undefined,
                            }))
                          }
                          className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                        >
                          <option value="">None</option>
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
                    <div className="min-w-0">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Status
                      </label>
                      <div className="relative">
                        <select
                          value={formData.status || 'pending'}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, status: e.target.value }))
                          }
                          className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                        >
                          <option value="pending">Pending</option>
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                        <FiChevronDown
                          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                          size={14}
                        />
                      </div>
                    </div>
                  </div>

                  {/* GSTIN */}
                  <div className="min-w-0">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      GSTIN
                    </label>
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        value={formData.gst_number || ''}
                        onChange={handleGstChange}
                        className="h-10 flex-1 rounded-xl border-slate-200 shadow-sm focus-visible:ring-4 focus-visible:ring-indigo-500/10"
                        placeholder="Enter GSTIN"
                      />
                      <Button
                        type="button"
                        onClick={handleAutoFill}
                        disabled={lookingUp || !formData.gst_number}
                        className="h-10 shrink-0 rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white hover:bg-slate-800"
                      >
                        {lookingUp ? (
                          <FiRefreshCw className="animate-spin" size={14} />
                        ) : (
                          'Auto fill'
                        )}
                      </Button>
                    </div>
                  </div>

                  {renderField('Company name', 'name', 'text', true)}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {renderField('Contact person', 'contact_person')}
                    <div className="min-w-0">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Contact no
                      </label>
                      <Input
                        type="tel"
                        value={formData.contact_no || ''}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            contact_no: e.target.value.replace(/\D/g, ''),
                          }))
                        }
                        className={`h-10 rounded-xl shadow-sm ${
                          formErrors.contact_no
                            ? 'border-rose-300 ring-2 ring-rose-200'
                            : 'border-slate-200'
                        }`}
                        placeholder="Enter contact no"
                        maxLength={10}
                      />
                    </div>
                    {renderField('Email', 'email', 'email')}
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="min-w-0">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Registration type
                      </label>
                      <div className="relative">
                        <select
                          value={formData.registration_type || ''}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              registration_type: e.target.value,
                            }))
                          }
                          className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                        >
                          <option value="">Select</option>
                          <option value="Registered">Registered</option>
                          <option value="Unregistered">Unregistered</option>
                        </select>
                        <FiChevronDown
                          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                          size={14}
                        />
                      </div>
                    </div>
                    {renderField('PAN', 'pan')}
                  </div>
                </div>
              </fieldset>

              {/* Billing */}
              <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Billing address
                </legend>
                <div className="mt-3 space-y-4">
                  <div className="min-w-0">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Address
                    </label>
                    <textarea
                      value={formData.billing_street || ''}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, billing_street: e.target.value }))
                      }
                      rows={2}
                      className={`min-h-[80px] w-full resize-y rounded-xl border bg-white px-3.5 py-2.5 text-sm outline-none transition ${
                        formErrors.billing_city
                          ? 'border-rose-300 ring-2 ring-rose-200'
                          : 'border-slate-200 hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10'
                      }`}
                      placeholder="Enter address"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {renderField('City', 'billing_city', 'text', true)}
                    {renderField('State', 'billing_state')}
                    {renderField('Country', 'billing_country')}
                    {renderField('Pincode', 'billing_pincode')}
                  </div>
                </div>
              </fieldset>

              {/* Shipping */}
              <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-teal-500" /> Shipping address
                </legend>
                <div className="mt-3">
                  <label className="mb-3 flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.same_as_billing ?? true}
                      onChange={(e) => handleSameAsBillingToggle(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-slate-600">Same as billing address</span>
                  </label>
                  {!formData.same_as_billing && (
                    <div className="space-y-4">
                      <div className="min-w-0">
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Address
                        </label>
                        <textarea
                          value={formData.shipping_street || ''}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              shipping_street: e.target.value,
                            }))
                          }
                          rows={2}
                          className="min-h-[80px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                          placeholder="Enter shipping address"
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="min-w-0">
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                            City
                          </label>
                          <Input
                            value={formData.shipping_city || ''}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                shipping_city: e.target.value,
                              }))
                            }
                            className="h-10 rounded-xl border-slate-200"
                            placeholder="City"
                          />
                        </div>
                        <div className="min-w-0">
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                            State
                          </label>
                          <Input
                            value={formData.shipping_state || ''}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                shipping_state: e.target.value,
                              }))
                            }
                            className="h-10 rounded-xl border-slate-200"
                            placeholder="State"
                          />
                        </div>
                        <div className="min-w-0">
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Country
                          </label>
                          <Input
                            value={formData.shipping_country || ''}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                shipping_country: e.target.value,
                              }))
                            }
                            className="h-10 rounded-xl border-slate-200"
                            placeholder="Country"
                          />
                        </div>
                        <div className="min-w-0">
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Pincode
                          </label>
                          <Input
                            value={formData.shipping_pincode || ''}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                shipping_pincode: e.target.value,
                              }))
                            }
                            className="h-10 rounded-xl border-slate-200"
                            placeholder="Pincode"
                            maxLength={6}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </fieldset>

              {/* Group & Balance */}
              <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-violet-500" /> Group & balance
                </legend>
                <div className="mt-3 space-y-4">
                  <div className="flex min-w-0 items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Group
                      </label>
                      <div className="relative">
                        <select
                          value={(formData.group_id as number) ?? ''}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              group_id: e.target.value ? Number(e.target.value) : undefined,
                            }))
                          }
                          className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                        >
                          <option value="">Select group</option>
                          {(customerGroups || []).map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                            </option>
                          ))}
                        </select>
                        <FiChevronDown
                          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                          size={14}
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowGroupModal(true)}
                      className="h-10 shrink-0 rounded-xl"
                    >
                      <FiPlus className="mr-1.5" size={14} /> Add
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    {renderField('Opening balance', 'opening_balance', 'number')}
                    {renderField('Credit limit', 'credit_limit', 'number')}
                    {renderField('Due days', 'due_days', 'number')}
                  </div>
                </div>
              </fieldset>

              {/* Dealer settings */}
              <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-amber-500" /> Dealer settings
                </legend>
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {renderField('Territory', 'territory')}
                  {renderField('Zone', 'zone')}
                  <div className="min-w-0">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      KYC status
                    </label>
                    <div className="relative">
                      <select
                        value={formData.kyc_status || 'pending'}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, kyc_status: e.target.value }))
                        }
                        className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                      >
                        <option value="pending">Pending</option>
                        <option value="verified">Verified</option>
                        <option value="rejected">Rejected</option>
                      </select>
                      <FiChevronDown
                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                        size={14}
                      />
                    </div>
                  </div>
                  {renderField('Outstanding amount', 'outstanding_amount', 'number')}
                  {renderField('Wallet balance', 'wallet_balance', 'number')}
                  {renderField('Commission rate (%)', 'commission_rate', 'number')}
                  <div className="min-w-0">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Approved at
                    </label>
                    <Input
                      type="datetime-local"
                      value={
                        formData.approved_at
                          ? new Date(formData.approved_at).toISOString().slice(0, 16)
                          : ''
                      }
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, approved_at: e.target.value }))
                      }
                      className="h-10 rounded-xl border-slate-200"
                    />
                  </div>
                  <div className="min-w-0 sm:col-span-2 lg:col-span-3">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Notes
                    </label>
                    <textarea
                      value={formData.notes || ''}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, notes: e.target.value }))
                      }
                      rows={2}
                      className="min-h-[80px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                      placeholder="Notes"
                    />
                  </div>
                </div>
              </fieldset>

              {/* Custom fields */}
              <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-rose-500" /> Custom fields
                </legend>
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {renderField('License no.', 'license_no')}
                  {renderField('Custom field 1', 'custom_field_1')}
                  {renderField('Custom field 2', 'custom_field_2')}
                </div>
              </fieldset>

              {/* Additional */}
              <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-sky-500" /> Additional details
                </legend>
                <div className="mt-3 space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {renderField('Fax no', 'fax')}
                    {renderField('Website', 'website')}
                    {renderField('E-way distance (km)', 'eway_bill_distance', 'number')}
                  </div>
                  <div className="min-w-0">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Note
                    </label>
                    <textarea
                      value={formData.note || ''}
                      onChange={(e) => setFormData((prev) => ({ ...prev, note: e.target.value }))}
                      rows={2}
                      className="min-h-[80px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                      placeholder="Enter note"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="dealer-is-active"
                      checked={formData.is_active ?? true}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, is_active: e.target.checked }))
                      }
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <label htmlFor="dealer-is-active" className="text-sm text-slate-600">
                      Enable — visible on all documents
                    </label>
                  </div>
                </div>
              </fieldset>
            </div>
          </Offcanvas>
        </Suspense>
      )}

      {/* Add group modal */}
      {showGroupModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm"
            onClick={() => !addingGroup && setShowGroupModal(false)}
          />
          <div className="animate-fadeIn relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-500/10">
                <FiUsers size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Add customer group</h3>
                <p className="text-xs text-slate-500">Group dealers for easier filtering.</p>
              </div>
            </div>
            <Input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              className="h-10 rounded-xl border-slate-200"
              placeholder="Group name"
            />
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowGroupModal(false);
                  setNewGroupName('');
                }}
                disabled={addingGroup}
                className="rounded-xl"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddGroup}
                disabled={addingGroup || !newGroupName.trim()}
                className="rounded-xl bg-indigo-600 font-semibold hover:bg-indigo-700"
              >
                {addingGroup ? 'Adding…' : 'Add group'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default DealersPage;