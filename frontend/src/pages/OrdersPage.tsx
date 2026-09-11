// src/pages/OrdersPage.tsx
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
import ReactDOM from 'react-dom';
import {
  FiPlus,
  FiTrash2,
  FiEdit,
  FiDownload,
  FiEye,
  FiShoppingCart,
  FiClock,
  FiTruck,
  FiCheckCircle,
  FiAlertCircle,
  FiFilter,
  FiSearch,
  FiDollarSign,
  FiPackage,
  FiCalendar,
  FiPrinter,
  FiX,
  FiArrowLeft,
  FiChevronDown,
} from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';
import OrderPrint from '../components/OrderPrint';

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

type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'delivered';
type OrderSource = 'whatsapp' | 'manual' | 'phone' | 'email';
type PaymentMethod = 'qr' | 'bank_transfer' | 'cash' | 'card';
type PaymentDirection = 'inward' | 'outward';
type CustomerType = 'customer' | 'vendor' | 'dealer' | 'distributor';

interface Company {
  id: number;
  name: string;
}
interface Branch {
  id: number;
  name: string;
  company_id: number;
}
interface Customer {
  id: number;
  name: string;
  type?: string;
}
interface Product {
  id: number;
  name: string;
  sku?: string;
  price: number;
  sale_price?: number;
}
interface OrderItem {
  product_id: number;
  product_name: string;
  qty: number;
  price: number;
}
interface Order {
  id: number;
  company_id: number;
  customer_id: number;
  customer?: Customer | null;
  quotation_id: number | null;
  order_no: string;
  total_amount: number | string;
  tax_amount: number | string;
  payment_amount?: number | string;
  is_partial?: boolean;
  payment_method?: PaymentMethod;
  payment_direction?: PaymentDirection;
  status: OrderStatus;
  source: OrderSource;
  delivery_date: string | null;
  shipping_address: string;
  notes: string;
  items: OrderItem[];
  created_at?: string;
  updated_at?: string;
  balance_due?: number;
  payment_status?: string;
  customer_name?: string;
  company?: Company | null;
  [key: string]: unknown;
}
interface OrderFormData {
  company_id: string | number;
  customer_id: string | number;
  quotation_id: string | number;
  order_no: string;
  total_amount: number | string;
  tax_amount: number | string;
  status: OrderStatus;
  source: OrderSource;
  payment_method: PaymentMethod;
  payment_direction: PaymentDirection;
  payment_amount: number | string;
  is_partial: boolean;
  delivery_date: string;
  shipping_address: string;
  notes: string;
}
interface NewCustomerForm {
  company_id: number | string;
  branch_id: number | string;
  type: CustomerType;
  name: string;
  contact_person: string;
  contact_no: string;
  email: string;
  gst_number: string;
  registration_type: string;
  pan: string;
  billing_street: string;
  billing_city: string;
  billing_state: string;
  billing_country: string;
  billing_pincode: string;
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

const TABLE_COLUMN_COUNT = 8;
const CACHE_TTL_MS = 300_000;

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
] as const;

const SOURCE_OPTIONS = [
  { value: 'all', label: 'All sources' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'manual', label: 'Manual' },
  { value: 'phone', label: 'Phone' },
  { value: 'email', label: 'Email' },
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

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const dateValue = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return '—';
  const [year, month, day] = dateValue.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/* ------------------------------------------------------------------ */
/* Cache hook                                                          */
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
/* Searchable Select (portal-rendered dropdown)                        */
/* ------------------------------------------------------------------ */

interface SearchableOption {
  id: number | string;
  name: string;
}

const SearchableSelect: React.FC<{
  options: SearchableOption[];
  value: string | number | '';
  onChange: (value: string | number | '') => void;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  className?: string;
}> = ({ options, value, onChange, placeholder, disabled, error, className }) => {
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  const reposition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    const desiredHeight = 320;
    const openUp = spaceBelow < desiredHeight && spaceAbove > spaceBelow;
    setDropdownStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      top: openUp ? undefined : rect.bottom + 4,
      bottom: openUp ? viewportHeight - rect.top + 4 : undefined,
      maxHeight: Math.min(desiredHeight, openUp ? spaceAbove - 12 : spaceBelow - 12),
      zIndex: 9999,
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    reposition();

    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    const onScrollOrResize = () => {
      // Reposition on scroll of the offcanvas, close on window resize
      reposition();
    };
    const onWindowResize = () => {
      setIsOpen(false);
    };

    document.addEventListener('mousedown', onClick);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onWindowResize);
    return () => {
      document.removeEventListener('mousedown', onClick);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onWindowResize);
    };
  }, [isOpen, reposition]);

  const selectedOption = options.find((opt) => opt.id === value);
  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const term = search.toLowerCase();
    return options.filter((opt) => opt.name.toLowerCase().includes(term));
  }, [options, search]);

  return (
    <div className={`relative w-full min-w-0 ${className ?? ''}`}>
      <div
        ref={triggerRef}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!disabled) setIsOpen((o) => !o);
          }
          if (e.key === 'Escape') setIsOpen(false);
        }}
        className={`flex h-10 w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-xl border bg-white px-3.5 text-sm shadow-sm transition ${
          disabled
            ? 'cursor-not-allowed bg-slate-50 text-slate-400'
            : error
              ? 'border-rose-300 ring-2 ring-rose-200'
              : 'border-slate-200 text-slate-700 hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10'
        }`}
        onClick={() => !disabled && setIsOpen((o) => !o)}
      >
        <span className={`truncate ${selectedOption ? 'font-medium' : 'text-slate-400'}`}>
          {selectedOption ? selectedOption.name : placeholder || 'Select…'}
        </span>
        <FiChevronDown
          className={`shrink-0 text-slate-400 transition ${isOpen ? 'rotate-180' : ''}`}
          size={14}
        />
      </div>

      {isOpen &&
        !disabled &&
        ReactDOM.createPortal(
          <div
            ref={dropdownRef}
            style={dropdownStyle}
            className="animate-fadeIn overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10"
          >
            <div className="border-b border-slate-100 p-2">
              <Input
                type="text"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 rounded-lg border-slate-200 text-sm"
                autoFocus
              />
            </div>
            <ul className="overflow-y-auto py-1" style={{ maxHeight: '100%' }}>
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-sm text-slate-400">No options</li>
              ) : (
                filtered.map((opt) => (
                  <li
                    key={opt.id}
                    className={`cursor-pointer truncate px-3 py-2 text-sm transition hover:bg-slate-50 ${
                      opt.id === value ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-slate-700'
                    }`}
                    onClick={() => {
                      onChange(opt.id);
                      setIsOpen(false);
                      setSearch('');
                    }}
                  >
                    {opt.name}
                  </li>
                ))
              )}
            </ul>
          </div>,
          document.body
        )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export function OrdersPage() {
  const navigate = useNavigate();
  const { showSuccess, showError } = useNotification();

  /* -------------------- Filter state -------------------- */
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterSource, setFilterSource] = useState<string>('all');
  const [filterCompanyId, setFilterCompanyId] = useState<number | undefined>(undefined);
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  /* -------------------- Panel state -------------------- */
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [viewMode, setViewMode] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<OrderFormData>({
    company_id: '',
    customer_id: '',
    quotation_id: '',
    order_no: '',
    total_amount: '',
    tax_amount: '',
    status: 'pending',
    source: 'whatsapp',
    payment_method: 'qr',
    payment_direction: 'inward',
    payment_amount: 0,
    is_partial: false,
    delivery_date: '',
    shipping_address: '',
    notes: '',
  });
  const [items, setItems] = useState<OrderItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({});

  /* -------------------- Customer creation state -------------------- */
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [newCustomer, setNewCustomer] = useState<NewCustomerForm>({
    company_id: '',
    branch_id: '',
    type: 'customer',
    name: '',
    contact_person: '',
    contact_no: '',
    email: '',
    gst_number: '',
    registration_type: '',
    pan: '',
    billing_street: '',
    billing_city: '',
    billing_state: '',
    billing_country: 'India',
    billing_pincode: '',
  });

  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  /* -------------------- Print -------------------- */
  const [printOrder, setPrintOrder] = useState<Order | null>(null);
  const printTriggered = useRef(false);

  /* -------------------- Data fetching -------------------- */
  const {
    data: orders,
    loading: ordLoading,
    error: ordError,
    refresh: refreshOrders,
  } = useApiCache<Order[]>('orders', () => apiClient.getOrders());

  const { data: companies } = useApiCache<Company[]>('companies', () => apiClient.getCompanies());
  const { data: branches } = useApiCache<Branch[]>('branches', () => apiClient.getBranches());
  const { data: customers, refresh: refreshCustomers } = useApiCache<Customer[]>('customers', () =>
    apiClient.getCustomers()
  );

  // ⬇️ Load ALL products (not just the first page).
  // Tries /products?per_page=1000 first, falls back to whatever getProducts() returns.
  const { data: products } = useApiCache<Product[]>('products-all', async () => {
    try {
      const res = await apiClient.request('GET', '/products?per_page=1000');
      const list = unwrapList<Product>(res);
      if (list.length > 0) return list;
    } catch {
      /* fall through */
    }
    const fallback = await apiClient.getProducts();
    return unwrapList<Product>(fallback);
  });

  /* -------------------- Print handler -------------------- */
  const handlePrint = useCallback((order: Order) => {
    setPrintOrder(order);
    printTriggered.current = false;
  }, []);

  useEffect(() => {
    if (printOrder && !printTriggered.current) {
      const timer = setTimeout(() => {
        window.print();
        printTriggered.current = true;
        setPrintOrder(null);
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [printOrder]);

  /* -------------------- Order number generator -------------------- */
  const generateOrderNo = useCallback(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 9000) + 1000;
    let candidate = `ORD-${y}${m}${d}-${random}`;
    if (orders) {
      let tries = 0;
      while (orders.some((o) => o.order_no === candidate) && tries < 100) {
        const newRandom = Math.floor(Math.random() * 9000) + 1000;
        candidate = `ORD-${y}${m}${d}-${newRandom}`;
        tries++;
      }
    }
    return candidate;
  }, [orders]);

  /* -------------------- Filter + search -------------------- */
  const filteredOrders = useMemo(() => {
    if (!orders) return [];
    let filtered = [...orders];

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (o) =>
          o.order_no?.toLowerCase().includes(term) ||
          (o.customer?.name || o.customer_name || '').toLowerCase().includes(term)
      );
    }
    if (filterStatus !== 'all') filtered = filtered.filter((o) => o.status === filterStatus);
    if (filterSource !== 'all') filtered = filtered.filter((o) => o.source === filterSource);
    if (filterCompanyId) filtered = filtered.filter((o) => o.company_id === filterCompanyId);
    if (filterDateFrom) {
      filtered = filtered.filter((o) => {
        const d = (o.created_at || '').slice(0, 10);
        return d >= filterDateFrom;
      });
    }
    if (filterDateTo) {
      filtered = filtered.filter((o) => {
        const d = (o.created_at || '').slice(0, 10);
        return d <= filterDateTo;
      });
    }
    return filtered;
  }, [orders, searchTerm, filterStatus, filterSource, filterCompanyId, filterDateFrom, filterDateTo]);

  const summary = useMemo(() => {
    const rows = filteredOrders;
    return {
      total: rows.length,
      pending: rows.filter((o) => o.status === 'pending').length,
      confirmed: rows.filter((o) => o.status === 'confirmed').length,
      shipped: rows.filter((o) => o.status === 'shipped').length,
      delivered: rows.filter((o) => o.status === 'delivered').length,
      totalDue: rows.reduce((sum, o) => sum + safeNum(o.balance_due), 0),
    };
  }, [filteredOrders]);

  /* -------------------- Pagination -------------------- */
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / rowsPerPage));
  const paginatedOrders = useMemo(
    () => filteredOrders.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage),
    [filteredOrders, currentPage]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus, filterSource, filterCompanyId, filterDateFrom, filterDateTo]);

  /* -------------------- Bulk actions -------------------- */
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Delete ${selectedIds.length} order(s)?`)) return;
    try {
      await Promise.all(selectedIds.map((id) => apiClient.deleteOrder(id)));
      showSuccess('Bulk delete', `${selectedIds.length} order(s) deleted.`);
      safeLog({
        module: 'Orders',
        action: 'Bulk delete',
        status: 'success',
        message: `Deleted ${selectedIds.length} orders`,
      });
      setSelectedIds([]);
      refreshOrders();
    } catch (err: unknown) {
      showError('Bulk delete failed', getErrorMessage(err, 'Bulk delete failed.'));
    }
  };

  const handleBulkStatusChange = async (status: OrderStatus) => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Change ${selectedIds.length} order(s) to ${status}?`)) return;
    try {
      await Promise.all(
        selectedIds.map((id) => apiClient.updateOrder(id, { status } as Partial<OrderFormData>))
      );
      showSuccess('Bulk update', `Status changed for ${selectedIds.length} order(s).`);
      safeLog({
        module: 'Orders',
        action: 'Bulk status change',
        status: 'success',
        message: `Changed status to ${status} for ${selectedIds.length} orders`,
      });
      setSelectedIds([]);
      refreshOrders();
    } catch (err: unknown) {
      showError('Bulk update failed', getErrorMessage(err, 'Bulk update failed.'));
    }
  };

  /* -------------------- Map items -------------------- */
  const productMap = useMemo(() => {
    if (!products) return new Map<number, string>();
    const map = new Map<number, string>();
    products.forEach((p) => map.set(p.id, p.name));
    return map;
  }, [products]);

  const mapOrderItems = useCallback(
    (orderItems: unknown[]): OrderItem[] => {
      return (orderItems as Array<Record<string, unknown>>).map((item) => ({
        product_id: Number(item.product_id),
        product_name:
          productMap.get(Number(item.product_id)) ||
          (item.product as { name?: string } | undefined)?.name ||
          (item.product_name as string) ||
          `Product #${item.product_id}`,
        qty: Number(item.quantity ?? item.qty ?? 0),
        price: safeNum(item.unit_price ?? item.price ?? 0),
      }));
    },
    [productMap]
  );

  /* -------------------- CRUD -------------------- */
  const openView = useCallback(
    (order: Order) => {
      setViewMode(true);
      setEditingId(order.id);
      setFormData({
        company_id: order.company_id || '',
        customer_id: order.customer_id || '',
        quotation_id: order.quotation_id || '',
        order_no: order.order_no || '',
        total_amount: order.total_amount ?? '',
        tax_amount: order.tax_amount ?? '',
        status: order.status || 'pending',
        source: order.source || 'whatsapp',
        payment_method: order.payment_method || 'qr',
        payment_direction: order.payment_direction || 'inward',
        payment_amount: order.payment_amount ?? 0,
        is_partial: order.is_partial || false,
        delivery_date: order.delivery_date || '',
        shipping_address: order.shipping_address || '',
        notes: order.notes || '',
      });
      setItems(mapOrderItems(order.items || []));
      setIsPanelOpen(true);
    },
    [mapOrderItems]
  );

  const openEdit = useCallback(
    (order: Order) => {
      setViewMode(false);
      setEditingId(order.id);
      setFormData({
        company_id: order.company_id || '',
        customer_id: order.customer_id || '',
        quotation_id: order.quotation_id || '',
        order_no: order.order_no || '',
        total_amount: order.total_amount ?? '',
        tax_amount: order.tax_amount ?? '',
        status: order.status || 'pending',
        source: order.source || 'whatsapp',
        payment_method: order.payment_method || 'qr',
        payment_direction: order.payment_direction || 'inward',
        payment_amount: order.payment_amount ?? 0,
        is_partial: order.is_partial || false,
        delivery_date: order.delivery_date || '',
        shipping_address: order.shipping_address || '',
        notes: order.notes || '',
      });
      setItems(mapOrderItems(order.items || []));
      setIsPanelOpen(true);
    },
    [mapOrderItems]
  );

  const handleDelete = useCallback(
    async (order: Order) => {
      if (!window.confirm(`Delete order ${order.order_no}?`)) return;
      try {
        await apiClient.deleteOrder(order.id);
        showSuccess('Order deleted', `Order ${order.order_no} removed.`);
        safeLog({
          module: 'Orders',
          action: 'Delete',
          status: 'success',
          message: `Deleted ${order.order_no}`,
        });
        refreshOrders();
      } catch (err: unknown) {
        showError('Delete failed', getErrorMessage(err, 'Delete failed.'));
      }
    },
    [refreshOrders, showSuccess, showError]
  );

  /* -------------------- Customer creation -------------------- */
  const filteredBranchesForNewCustomer = useMemo(() => {
    if (newCustomer.company_id && branches) {
      return branches.filter((b) => b.company_id === Number(newCustomer.company_id));
    }
    return [];
  }, [newCustomer.company_id, branches]);

  const createCustomerInline = async () => {
    if (!newCustomer.name.trim()) {
      showError('Validation', 'Customer name is required.');
      return;
    }
    if (!newCustomer.company_id) {
      showError('Validation', 'Company is required.');
      return;
    }
    if (!newCustomer.billing_city.trim()) {
      showError('Validation', 'Billing city is required.');
      return;
    }
    try {
      const created = await apiClient.createCustomer({
        ...newCustomer,
        company_id: Number(newCustomer.company_id),
        branch_id: newCustomer.branch_id ? Number(newCustomer.branch_id) : null,
      });
      showSuccess('Customer created', `${created.name} added.`);
      refreshCustomers();
      setFormData((prev) => ({ ...prev, customer_id: created.id }));
      setShowCustomerForm(false);
      setNewCustomer({
        company_id: '',
        branch_id: '',
        type: 'customer',
        name: '',
        contact_person: '',
        contact_no: '',
        email: '',
        gst_number: '',
        registration_type: '',
        pan: '',
        billing_street: '',
        billing_city: '',
        billing_state: '',
        billing_country: 'India',
        billing_pincode: '',
      });
    } catch (err: unknown) {
      showError('Create failed', getErrorMessage(err, 'Create failed.'));
    }
  };

  /* -------------------- Items management -------------------- */
  const [selectedProductId, setSelectedProductId] = useState<string | number | ''>('');

  const addItemToOrder = (productId: number) => {
    if (!products) return;
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    if (items.some((item) => item.product_id === productId)) {
      showError('Duplicate', 'Product already added.');
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        product_id: product.id,
        product_name: product.name,
        qty: 1,
        price: product.sale_price || product.price || 0,
      },
    ]);
  };

  const updateItemQty = (index: number, qty: number) => {
    if (qty >= 1) setItems((prev) => prev.map((it, i) => (i === index ? { ...it, qty } : it)));
  };

  const updateItemPrice = (index: number, price: number) => {
    if (price >= 0) setItems((prev) => prev.map((it, i) => (i === index ? { ...it, price } : it)));
  };

  const removeItem = (index: number) => setItems((prev) => prev.filter((_, i) => i !== index));

  const subtotal = useMemo(() => items.reduce((sum, item) => sum + item.qty * item.price, 0), [items]);
  const tax = useMemo(() => parseFloat(String(formData.tax_amount || 0)) || 0, [formData.tax_amount]);
  const total = subtotal + tax;

  /* -------------------- Validation -------------------- */
  const validateForm = (): boolean => {
    const errors: Record<string, boolean> = {};
    let valid = true;
    if (!formData.company_id || formData.company_id === '') {
      errors.company_id = true;
      valid = false;
    }
    if (!formData.customer_id || formData.customer_id === '') {
      errors.customer_id = true;
      valid = false;
    }
    if (!editingId && !formData.order_no.trim()) {
      errors.order_no = true;
      valid = false;
    }
    if (items.length === 0) {
      errors.items = true;
      valid = false;
    }
    if (total <= 0) {
      errors.total = true;
      valid = false;
    }
    if (formData.is_partial) {
      const pmt = parseFloat(String(formData.payment_amount || 0));
      if (pmt <= 0) {
        errors.payment_amount = true;
        valid = false;
      }
      if (pmt >= total) {
        errors.payment_amount = true;
        valid = false;
      }
    }
    if (!['inward', 'outward'].includes(formData.payment_direction)) {
      errors.payment_direction = true;
      valid = false;
    }
    setFormErrors(errors);
    if (!valid) showError('Validation', 'Please fix the highlighted required fields.');
    return valid;
  };

  const handleSubmit = useCallback(async () => {
    if (!validateForm()) return;
    const paymentAmount = parseFloat(String(formData.payment_amount || 0));
    const isPartial = formData.is_partial || (paymentAmount > 0 && paymentAmount < total);
    const payload = {
      company_id: parseInt(String(formData.company_id)),
      customer_id: parseInt(String(formData.customer_id)),
      quotation_id: formData.quotation_id ? parseInt(String(formData.quotation_id)) : null,
      order_no: editingId ? formData.order_no : formData.order_no || undefined,
      total_amount: total,
      tax_amount: tax,
      payment_method: formData.payment_method,
      payment_direction: formData.payment_direction,
      payment_amount: paymentAmount,
      is_partial: isPartial,
      status: formData.status,
      source: formData.source,
      delivery_date: formData.delivery_date || null,
      shipping_address: formData.shipping_address,
      notes: formData.notes,
      items: items.map((item) => ({
        product_id: item.product_id,
        qty: item.qty,
        price: item.price,
      })),
    };

    setSubmitting(true);
    try {
      let savedOrder: Order;
      if (editingId) {
        savedOrder = await apiClient.updateOrder(editingId, payload);
        showSuccess('Order updated', `Order ${formData.order_no} updated.`);
      } else {
        savedOrder = await apiClient.createOrder(payload);
        showSuccess('Order created', 'Order created successfully.');
        if (paymentAmount > 0) {
          try {
            await apiClient.createPayment({
              company_id: parseInt(String(formData.company_id)),
              invoice_id: null,
              reference_no: savedOrder.order_no,
              amount: paymentAmount,
              payment_method: formData.payment_method,
              payment_direction: formData.payment_direction,
              status: isPartial ? 'partial' : 'paid',
              transaction_date: new Date().toISOString().slice(0, 10),
              remarks: `Payment for order ${savedOrder.order_no}`,
            });
            showSuccess('Payment recorded', `₹${paymentAmount.toFixed(2)} received.`);
          } catch (payErr: unknown) {
            showError('Payment record failed', getErrorMessage(payErr, 'Payment record failed.'));
          }
        }
      }
      safeLog({
        module: 'Orders',
        action: editingId ? 'Update order' : 'Create order',
        status: 'success',
        message: editingId ? `Updated ${formData.order_no}` : 'New order created',
      });
      setIsPanelOpen(false);
      refreshOrders();
    } catch (err: unknown) {
      showError('Save failed', getErrorMessage(err, 'Save failed.'));
      safeLog({
        module: 'Orders',
        action: 'Save order',
        status: 'error',
        message: getErrorMessage(err, 'Save failed.'),
      });
    } finally {
      setSubmitting(false);
    }
  }, [formData, editingId, items, total, tax, refreshOrders, showSuccess, showError]);

  const handleCreateInvoice = async () => {
    if (!editingId) return;
    const invoiceNo = window.prompt('Enter invoice number for this order');
    if (!invoiceNo) return;
    try {
      await apiClient.createInvoiceFromOrder(editingId, invoiceNo);
      showSuccess(
        'Invoice created',
        `Invoice ${invoiceNo} created from order ${formData.order_no}.`
      );
    } catch (err: unknown) {
      showError('Create invoice failed', getErrorMessage(err, 'Create invoice failed.'));
    }
  };

  /* -------------------- Export -------------------- */
  const handleExport = useCallback(() => {
    if (filteredOrders.length === 0) {
      showError('Export failed', 'No orders to export.');
      return;
    }
    const headers = [
      'Order #',
      'Customer',
      'Total',
      'Source',
      'Status',
      'Payment Status',
      'Delivery Date',
      'Date',
    ];
    const rows = filteredOrders.map((o) => {
      const t = safeNum(o.total_amount);
      return [
        escapeCsvField(o.order_no),
        escapeCsvField(o.customer?.name || o.customer_name || '-'),
        t.toFixed(2),
        escapeCsvField(o.source || '-'),
        escapeCsvField(o.status),
        escapeCsvField(o.payment_status || '-'),
        escapeCsvField(o.delivery_date || '-'),
        o.created_at ? new Date(o.created_at).toLocaleDateString() : '-',
      ].join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showSuccess('Export', 'Orders exported.');
  }, [filteredOrders, showSuccess, showError]);

  /* -------------------- Helpers -------------------- */
  const clearFilters = useCallback(() => {
    setSearchTerm('');
    setFilterStatus('all');
    setFilterSource('all');
    setFilterCompanyId(undefined);
    setFilterDateFrom('');
    setFilterDateTo('');
  }, []);

  const activeFilterCount = [
    searchTerm,
    filterStatus !== 'all' ? filterStatus : undefined,
    filterSource !== 'all' ? filterSource : undefined,
    filterCompanyId,
  ].filter(Boolean).length;

  const allSelected = Boolean(
    paginatedOrders.length > 0 && paginatedOrders.every((o) => selectedIds.includes(o.id))
  );

  const toggleSelectAll = useCallback(() => {
    const pageIds = paginatedOrders.map((o) => o.id);
    if (!pageIds.length) return;
    if (allSelected) {
      setSelectedIds((current) => current.filter((id) => !pageIds.includes(id)));
    } else {
      setSelectedIds((current) => Array.from(new Set([...current, ...pageIds])));
    }
  }, [allSelected, paginatedOrders]);

  const toggleSelected = useCallback((id: number) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((v) => v !== id) : [...current, id]
    );
  }, []);

  /* -------------------- Render field helper -------------------- */
  const renderField = (
    label: string,
    field: keyof OrderFormData,
    type: 'text' | 'number' | 'date' | 'select' | 'textarea' = 'text',
    options?: Array<{ id: string | number; name: string }>,
    required = false,
    readOnly = false
  ) => {
    // ✅ FIX: cast through `unknown` first — `OrderFormData` has no index signature.
    const value = (formData as unknown as Record<string, unknown>)[field] ?? '';
    const id = `field-${field}`;
    const hasError = formErrors[field];
    const disabled = viewMode || readOnly;
    const baseInput =
      'h-10 w-full min-w-0 rounded-xl border bg-white px-3.5 text-sm shadow-sm outline-none transition';
    const stateClass = disabled
      ? 'cursor-not-allowed bg-slate-50 text-slate-400'
      : hasError
        ? 'border-rose-300 ring-2 ring-rose-200'
        : 'border-slate-200 text-slate-700 hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10';

    return (
      <div className="min-w-0">
        <label
          htmlFor={id}
          className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
        {type === 'select' ? (
          <div className="relative min-w-0">
            <select
              id={id}
              value={value as string}
              onChange={(e) => setFormData((prev) => ({ ...prev, [field]: e.target.value }))}
              disabled={disabled}
              className={`${baseInput} ${stateClass} appearance-none pr-9`}
            >
              <option value="">Select {label}</option>
              {options?.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.name || opt.id}
                </option>
              ))}
            </select>
            <FiChevronDown
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={14}
            />
          </div>
        ) : type === 'textarea' ? (
          <textarea
            id={id}
            value={value as string}
            onChange={(e) => setFormData((prev) => ({ ...prev, [field]: e.target.value }))}
            disabled={disabled}
            rows={3}
            className={`${baseInput} min-h-[80px] resize-y py-2.5 ${stateClass}`}
            placeholder={`Enter ${label}`}
          />
        ) : (
          <input
            id={id}
            type={type}
            value={value as string | number}
            onChange={(e) => setFormData((prev) => ({ ...prev, [field]: e.target.value }))}
            disabled={disabled}
            className={`${baseInput} ${stateClass}`}
            placeholder={`Enter ${label}`}
            step={type === 'number' ? '0.01' : undefined}
          />
        )}
      </div>
    );
  };

  /* -------------------- Error state -------------------- */
  if (ordError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-600">
            <FiAlertCircle size={24} />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">Failed to load orders</h2>
          <p className="mt-1.5 text-sm text-slate-500">{ordError}</p>
          <Button
            onClick={refreshOrders}
            className="mt-5 rounded-xl bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  /* -------------------- Render -------------------- */
  return (
    <>
      {/* A4 print + offcanvas width + scroll overrides */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
          body * { visibility: hidden !important; }
          #a4-print-root, #a4-print-root * { visibility: visible !important; }
          #a4-print-root { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
        .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }

        /* ── Wider offcanvas for Create/Edit Order ── */
        .orders-offcanvas-wide {
          width: min(1080px, 96vw) !important;
          max-width: min(1080px, 96vw) !important;
        }
        @media (max-width: 640px) {
          .orders-offcanvas-wide { width: 100vw !important; max-width: 100vw !important; }
        }

        /* ── Scroll containment inside the offcanvas ── */
        .orders-offcanvas-wide .orders-form-scroll {
          overflow-y: auto;
          overflow-x: hidden;
          min-height: 0;
          flex: 1 1 auto;
          max-height: calc(100vh - 180px);
          scrollbar-width: thin;
          scrollbar-color: #cbd5e1 transparent;
        }
        .orders-offcanvas-wide .orders-form-scroll::-webkit-scrollbar { width: 8px; }
        .orders-offcanvas-wide .orders-form-scroll::-webkit-scrollbar-track { background: transparent; }
        .orders-offcanvas-wide .orders-form-scroll::-webkit-scrollbar-thumb {
          background-color: #cbd5e1; border-radius: 8px;
        }
        .orders-offcanvas-wide .orders-form-scroll::-webkit-scrollbar-thumb:hover {
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
                  <FiShoppingCart size={12} />
                  Sales · Orders
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-[32px]">
                  Order workspace
                </h1>
                <p className="mt-1.5 max-w-2xl text-sm text-slate-300">
                  Create, track and fulfil customer orders — across every company, source and status.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={handleExport}
                  className="h-10 rounded-xl border-white/10 bg-white/5 text-white shadow-none backdrop-blur transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                >
                  <FiDownload className="mr-2" size={14} />
                  Export
                </Button>
                <Button
                  onClick={() => {
                    setViewMode(false);
                    setEditingId(null);
                    setFormData({
                      company_id: '',
                      customer_id: '',
                      quotation_id: '',
                      order_no: generateOrderNo(),
                      total_amount: '',
                      tax_amount: '',
                      status: 'pending',
                      source: 'whatsapp',
                      payment_method: 'qr',
                      payment_direction: 'inward',
                      payment_amount: 0,
                      is_partial: false,
                      delivery_date: '',
                      shipping_address: '',
                      notes: '',
                    });
                    setItems([]);
                    setFormErrors({});
                    setIsPanelOpen(true);
                    setShowCustomerForm(false);
                    setSelectedProductId('');
                  }}
                  className="h-10 rounded-xl bg-gradient-to-b from-cyan-300 to-cyan-400 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:from-cyan-200 hover:to-cyan-300"
                >
                  <FiPlus className="mr-2" size={14} />
                  New order
                </Button>
              </div>
            </div>
          </section>

          {/* KPI */}
          <section className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
            {orders ? (
              <>
                <StatCard icon={FiShoppingCart} label="Total" value={summary.total} accent="indigo" />
                <StatCard icon={FiClock} label="Pending" value={summary.pending} accent="amber" />
                <StatCard
                  icon={FiCheckCircle}
                  label="Confirmed"
                  value={summary.confirmed}
                  accent="sky"
                />
                <StatCard icon={FiTruck} label="Shipped" value={summary.shipped} accent="violet" />
                <StatCard icon={FiPackage} label="Delivered" value={summary.delivered} accent="emerald" />
                <StatCard
                  icon={FiDollarSign}
                  label="Total due"
                  value={summary.totalDue.toFixed(2)}
                  prefix="₹"
                  accent="rose"
                />
              </>
            ) : (
              Array.from({ length: 6 }).map((_, i) => <StatCardSkeleton key={i} />)
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
                      : 'Refine orders by scope, source and date'}
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(activeFilterCount > 0 || filterDateFrom || filterDateTo) && (
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
                    placeholder="Search order # or customer…"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>

                <div className="lg:col-span-3">
                  <div className="relative">
                    <select
                      aria-label="Company"
                      value={filterCompanyId ? String(filterCompanyId) : 'all'}
                      onChange={(e) =>
                        setFilterCompanyId(
                          e.target.value === 'all' ? undefined : Number(e.target.value)
                        )
                      }
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
                      aria-label="Order status"
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
                      aria-label="Order source"
                      value={filterSource}
                      onChange={(e) => setFilterSource(e.target.value)}
                      className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                    >
                      {SOURCE_OPTIONS.map((o) => (
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

              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row lg:col-span-5">
                  <div className="relative min-w-0 flex-1">
                    <FiCalendar
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                      size={14}
                    />
                    <Input
                      type="date"
                      aria-label="Order date from"
                      value={filterDateFrom}
                      onChange={(e) => setFilterDateFrom(e.target.value)}
                      className="h-10 rounded-xl border-slate-200 pl-9 shadow-sm focus-visible:ring-4 focus-visible:ring-indigo-500/10"
                    />
                  </div>
                  <div className="hidden items-center justify-center px-1 text-slate-300 sm:flex">→</div>
                  <div className="relative min-w-0 flex-1">
                    <FiCalendar
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                      size={14}
                    />
                    <Input
                      type="date"
                      aria-label="Order date to"
                      value={filterDateTo}
                      min={filterDateFrom || undefined}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                      className="h-10 rounded-xl border-slate-200 pl-9 shadow-sm focus-visible:ring-4 focus-visible:ring-indigo-500/10"
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
                  onClick={() => handleBulkStatusChange('confirmed')}
                >
                  <FiCheckCircle className="mr-1.5 text-sky-600" size={14} /> Confirm
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 rounded-lg"
                  onClick={() => handleBulkStatusChange('shipped')}
                >
                  <FiTruck className="mr-1.5 text-violet-600" size={14} /> Ship
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 rounded-lg"
                  onClick={() => handleBulkStatusChange('delivered')}
                >
                  <FiPackage className="mr-1.5 text-emerald-600" size={14} /> Deliver
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-9 rounded-lg bg-rose-600 hover:bg-rose-700"
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
                  <FiShoppingCart size={14} />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-800">Orders</CardTitle>
                  <CardDescription className="text-[11px] text-slate-500">
                    {ordLoading
                      ? 'Loading orders…'
                      : `${filteredOrders.length.toLocaleString('en-IN')} record${
                          filteredOrders.length === 1 ? '' : 's'
                        }`}
                    {filterDateFrom && filterDateTo && (
                      <>
                        {' · '}
                        {formatDate(filterDateFrom)} – {formatDate(filterDateTo)}
                      </>
                    )}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <div className="overflow-x-auto">
              <Table className="min-w-[1050px]">
                <TableHeader>
                  <TableRow className="border-slate-100 bg-slate-50/70 hover:bg-slate-50/70">
                    <TableHead className="w-11 px-3">
                      <input
                        aria-label="Select all orders on page"
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
                      <TableHeadLabel>Order #</TableHeadLabel>
                    </TableHead>
                    <TableHead>
                      <TableHeadLabel>Customer</TableHeadLabel>
                    </TableHead>
                    <TableHead className="text-right">
                      <TableHeadLabel align="right">Total</TableHeadLabel>
                    </TableHead>
                    <TableHead>
                      <TableHeadLabel>Source</TableHeadLabel>
                    </TableHead>
                    <TableHead>
                      <TableHeadLabel>Status</TableHeadLabel>
                    </TableHead>
                    <TableHead>
                      <TableHeadLabel>Delivery</TableHeadLabel>
                    </TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {ordLoading &&
                    Array.from({ length: 8 }).map((_, index) => (
                      <TableRow key={`skeleton-${index}`} className="border-slate-100">
                        {Array.from({ length: TABLE_COLUMN_COUNT }).map((__, cellIndex) => (
                          <TableCell key={cellIndex}>
                            <div className="h-4 animate-pulse rounded bg-slate-100" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}

                  {!ordLoading &&
                    paginatedOrders.map((order) => {
                      const selected = selectedIds.includes(order.id);
                      const statusColors: Record<OrderStatus, string> = {
                        pending: 'border-amber-200/70 bg-amber-50 text-amber-700',
                        confirmed: 'border-sky-200/70 bg-sky-50 text-sky-700',
                        shipped: 'border-violet-200/70 bg-violet-50 text-violet-700',
                        delivered: 'border-emerald-200/70 bg-emerald-50 text-emerald-700',
                      };
                      const statusLabel: Record<OrderStatus, string> = {
                        pending: 'Pending',
                        confirmed: 'Confirmed',
                        shipped: 'Shipped',
                        delivered: 'Delivered',
                      };
                      const sourceColors: Record<string, string> = {
                        whatsapp: 'border-emerald-200/70 bg-emerald-50 text-emerald-700',
                        manual: 'border-slate-200 bg-slate-50 text-slate-600',
                        phone: 'border-sky-200/70 bg-sky-50 text-sky-700',
                        email: 'border-violet-200/70 bg-violet-50 text-violet-700',
                      };

                      return (
                        <TableRow
                          key={order.id}
                          data-state={selected ? 'selected' : undefined}
                          className={`cursor-pointer border-slate-100 transition-colors hover:bg-slate-50/70 ${
                            selected ? 'bg-indigo-50/40 hover:bg-indigo-50/60' : ''
                          }`}
                          onClick={() => openView(order)}
                        >
                          <TableCell className="px-3">
                            <input
                              aria-label={`Select ${order.order_no}`}
                              type="checkbox"
                              checked={selected}
                              onChange={(event) => {
                                event.stopPropagation();
                                toggleSelected(order.id);
                              }}
                              onClick={(event) => event.stopPropagation()}
                              className="h-4 w-4 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/30"
                            />
                          </TableCell>

                          <TableCell>
                            <div className="min-w-[140px]">
                              <span className="text-sm font-semibold text-slate-900">
                                {order.order_no}
                              </span>
                              <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                                {order.created_at ? formatDate(order.created_at) : `#${order.id}`}
                              </p>
                            </div>
                          </TableCell>

                          <TableCell>
                            <div className="flex min-w-[190px] items-center gap-2.5">
                              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[11px] font-bold text-white">
                                {(order.customer?.name || order.customer_name || '?')[0]?.toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-slate-800">
                                  {order.customer?.name || order.customer_name || '—'}
                                </p>
                              </div>
                            </div>
                          </TableCell>

                          <TableCell className="whitespace-nowrap text-right text-sm font-semibold tabular-nums text-slate-900">
                            {formatCurrency(order.total_amount)}
                          </TableCell>

                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize ${
                                sourceColors[order.source] ||
                                'border-slate-200 bg-slate-50 text-slate-600'
                              }`}
                            >
                              {order.source}
                            </Badge>
                          </TableCell>

                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <Badge
                                variant="outline"
                                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                                  statusColors[order.status] ||
                                  'border-slate-200 bg-slate-50 text-slate-600'
                                }`}
                              >
                                {statusLabel[order.status] || order.status}
                              </Badge>
                              {order.payment_status && (
                                <span
                                  className={`text-[10px] font-medium uppercase tracking-wide ${
                                    order.payment_status === 'paid'
                                      ? 'text-emerald-600'
                                      : order.payment_status === 'partial'
                                        ? 'text-amber-600'
                                        : 'text-slate-400'
                                  }`}
                                >
                                  {order.payment_status}
                                </span>
                              )}
                            </div>
                          </TableCell>

                          <TableCell className="whitespace-nowrap text-sm text-slate-600">
                            {formatDate(order.delivery_date)}
                          </TableCell>

                          <TableCell
                            className="text-right"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => openView(order)}
                                className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                                title="View"
                              >
                                <FiEye size={15} />
                              </button>
                              <button
                                onClick={() => openEdit(order)}
                                className="grid h-8 w-8 place-items-center rounded-lg text-indigo-500 transition hover:bg-indigo-50 hover:text-indigo-700"
                                title="Edit"
                              >
                                <FiEdit size={15} />
                              </button>
                              <button
                                onClick={() => handlePrint(order)}
                                className="grid h-8 w-8 place-items-center rounded-lg text-sky-500 transition hover:bg-sky-50 hover:text-sky-700"
                                title="Print (A4)"
                              >
                                <FiPrinter size={15} />
                              </button>
                              <button
                                onClick={() => handleDelete(order)}
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

                  {!ordLoading && !paginatedOrders.length && (
                    <TableRow>
                      <TableCell colSpan={TABLE_COLUMN_COUNT} className="py-20 text-center">
                        <div className="mx-auto max-w-md px-4">
                          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-slate-200/70">
                            <FiSearch className="h-6 w-6 text-slate-400" />
                          </div>
                          <p className="mt-4 text-base font-semibold text-slate-800">
                            No orders found
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            Try adjusting the date range, company, source, status, or search term.
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

            {!ordLoading && totalPages > 1 && (
              <div className="flex flex-col gap-3 border-t border-slate-100 bg-white px-4 py-3.5 sm:px-5 md:flex-row md:items-center md:justify-between">
                <p className="text-xs text-slate-500 sm:text-[13px]">
                  Page <span className="font-semibold text-slate-700">{currentPage}</span> of{' '}
                  <span className="font-semibold text-slate-700">{totalPages}</span>
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

      {/* Offcanvas – Order or Customer form */}
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
            title={
              showCustomerForm
                ? 'Create Customer'
                : viewMode
                  ? 'View Order'
                  : editingId
                    ? 'Edit Order'
                    : 'Create Order'
            }
            onClose={() => {
              if (showCustomerForm) setShowCustomerForm(false);
              else setIsPanelOpen(false);
            }}
            className="orders-offcanvas-wide"
            footer={
              showCustomerForm ? (
                <div className="flex w-full justify-between">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowCustomerForm(false);
                      setNewCustomer({
                        company_id: '',
                        branch_id: '',
                        type: 'customer',
                        name: '',
                        contact_person: '',
                        contact_no: '',
                        email: '',
                        gst_number: '',
                        registration_type: '',
                        pan: '',
                        billing_street: '',
                        billing_city: '',
                        billing_state: '',
                        billing_country: 'India',
                        billing_pincode: '',
                      });
                    }}
                    className="rounded-xl"
                  >
                    <FiArrowLeft className="mr-2" size={14} /> Back to order
                  </Button>
                  <Button
                    onClick={createCustomerInline}
                    className="rounded-xl bg-indigo-600 font-semibold hover:bg-indigo-700"
                  >
                    Create customer
                  </Button>
                </div>
              ) : (
                <div className="flex w-full justify-between">
                  <Button
                    variant="outline"
                    onClick={() => setIsPanelOpen(false)}
                    disabled={submitting}
                    className="rounded-xl"
                  >
                    <FiX className="mr-2" size={14} /> {viewMode ? 'Close' : 'Cancel'}
                  </Button>
                  {!viewMode && (
                    <div className="flex gap-2">
                      {editingId && (
                        <Button
                          variant="outline"
                          onClick={handleCreateInvoice}
                          className="rounded-xl text-indigo-600"
                        >
                          Create invoice
                        </Button>
                      )}
                      <Button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="rounded-xl bg-indigo-600 font-semibold hover:bg-indigo-700"
                      >
                        {submitting ? 'Saving…' : editingId ? 'Update' : 'Save'}
                      </Button>
                    </div>
                  )}
                </div>
              )
            }
          >
            {showCustomerForm ? (
              /* ── Customer form ── */
              <div className="orders-form-scroll space-y-5 pr-2">
                <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                  <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                    <span className="h-2 w-2 rounded-full bg-indigo-500" /> Customer information
                  </legend>
                  <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="min-w-0">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Company *
                      </label>
                      <SearchableSelect
                        options={companies?.map((c) => ({ id: c.id, name: c.name })) || []}
                        value={newCustomer.company_id}
                        onChange={(val) => setNewCustomer((prev) => ({ ...prev, company_id: val }))}
                        placeholder="Select company"
                      />
                    </div>
                    <div className="min-w-0">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Branch
                      </label>
                      <SearchableSelect
                        options={filteredBranchesForNewCustomer.map((b) => ({
                          id: b.id,
                          name: b.name,
                        }))}
                        value={newCustomer.branch_id}
                        onChange={(val) => setNewCustomer((prev) => ({ ...prev, branch_id: val }))}
                        placeholder="None"
                      />
                    </div>
                    <div className="min-w-0">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Type
                      </label>
                      <div className="relative">
                        <select
                          value={newCustomer.type}
                          onChange={(e) =>
                            setNewCustomer((prev) => ({
                              ...prev,
                              type: e.target.value as CustomerType,
                            }))
                          }
                          className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                        >
                          <option value="customer">Customer</option>
                          <option value="vendor">Vendor</option>
                          <option value="dealer">Dealer</option>
                          <option value="distributor">Distributor</option>
                        </select>
                        <FiChevronDown
                          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                          size={14}
                        />
                      </div>
                    </div>
                    <div className="min-w-0">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Name *
                      </label>
                      <Input
                        value={newCustomer.name}
                        onChange={(e) => setNewCustomer((prev) => ({ ...prev, name: e.target.value }))}
                        className="h-10 rounded-xl border-slate-200"
                        placeholder="Customer name"
                      />
                    </div>
                    <div className="min-w-0">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Contact person
                      </label>
                      <Input
                        value={newCustomer.contact_person}
                        onChange={(e) =>
                          setNewCustomer((prev) => ({ ...prev, contact_person: e.target.value }))
                        }
                        className="h-10 rounded-xl border-slate-200"
                        placeholder="Contact person"
                      />
                    </div>
                    <div className="min-w-0">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Contact no
                      </label>
                      <Input
                        value={newCustomer.contact_no}
                        onChange={(e) =>
                          setNewCustomer((prev) => ({
                            ...prev,
                            contact_no: e.target.value.replace(/\D/g, ''),
                          }))
                        }
                        className="h-10 rounded-xl border-slate-200"
                        placeholder="Phone number"
                      />
                    </div>
                    <div className="min-w-0 sm:col-span-2 lg:col-span-3">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Email
                      </label>
                      <Input
                        type="email"
                        value={newCustomer.email}
                        onChange={(e) => setNewCustomer((prev) => ({ ...prev, email: e.target.value }))}
                        className="h-10 rounded-xl border-slate-200"
                        placeholder="Email"
                      />
                    </div>
                  </div>
                </fieldset>

                <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                  <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                    <span className="h-2 w-2 rounded-full bg-violet-500" /> Registration & tax
                  </legend>
                  <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="min-w-0">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        GST number
                      </label>
                      <Input
                        value={newCustomer.gst_number}
                        onChange={(e) =>
                          setNewCustomer((prev) => ({ ...prev, gst_number: e.target.value }))
                        }
                        className="h-10 rounded-xl border-slate-200"
                        placeholder="GSTIN"
                      />
                    </div>
                    <div className="min-w-0">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Registration type
                      </label>
                      <div className="relative">
                        <select
                          value={newCustomer.registration_type}
                          onChange={(e) =>
                            setNewCustomer((prev) => ({
                              ...prev,
                              registration_type: e.target.value,
                            }))
                          }
                          className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
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
                    <div className="min-w-0">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        PAN
                      </label>
                      <Input
                        value={newCustomer.pan}
                        onChange={(e) => setNewCustomer((prev) => ({ ...prev, pan: e.target.value }))}
                        className="h-10 rounded-xl border-slate-200"
                        placeholder="PAN"
                      />
                    </div>
                  </div>
                </fieldset>

                <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                  <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" /> Billing address
                  </legend>
                  <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="min-w-0">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        City *
                      </label>
                      <Input
                        value={newCustomer.billing_city}
                        onChange={(e) =>
                          setNewCustomer((prev) => ({ ...prev, billing_city: e.target.value }))
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
                        value={newCustomer.billing_state}
                        onChange={(e) =>
                          setNewCustomer((prev) => ({ ...prev, billing_state: e.target.value }))
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
                        value={newCustomer.billing_country}
                        onChange={(e) =>
                          setNewCustomer((prev) => ({ ...prev, billing_country: e.target.value }))
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
                        value={newCustomer.billing_pincode}
                        onChange={(e) =>
                          setNewCustomer((prev) => ({ ...prev, billing_pincode: e.target.value }))
                        }
                        className="h-10 rounded-xl border-slate-200"
                        placeholder="Pincode"
                      />
                    </div>
                    <div className="min-w-0 sm:col-span-2 lg:col-span-3">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Street address
                      </label>
                      <textarea
                        value={newCustomer.billing_street}
                        onChange={(e) =>
                          setNewCustomer((prev) => ({ ...prev, billing_street: e.target.value }))
                        }
                        rows={2}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                        placeholder="Street address"
                      />
                    </div>
                  </div>
                </fieldset>
              </div>
            ) : (
              /* ── Order form ── */
              <div className="orders-form-scroll space-y-5 pr-2">
                {/* Order information */}
                <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                  <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                    <span className="h-2 w-2 rounded-full bg-indigo-500" /> Order information
                  </legend>
                  <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {renderField(
                      'Company',
                      'company_id',
                      'select',
                      companies?.map((c) => ({ id: c.id, name: c.name })),
                      true
                    )}

                    <div className="min-w-0 sm:col-span-2 lg:col-span-2">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Customer <span className="text-rose-500">*</span>
                      </label>
                      <div className="flex gap-2">
                        <div className="min-w-0 flex-1">
                          <SearchableSelect
                            options={customers?.map((c) => ({ id: c.id, name: c.name })) || []}
                            value={formData.customer_id}
                            onChange={(val) =>
                              setFormData((prev) => ({ ...prev, customer_id: val }))
                            }
                            placeholder="Select customer"
                            disabled={viewMode}
                            error={formErrors.customer_id}
                          />
                        </div>
                        {!viewMode && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setShowCustomerForm(true)}
                            className="h-10 shrink-0 rounded-xl px-3 text-sm"
                          >
                            <FiPlus size={14} />
                          </Button>
                        )}
                      </div>
                    </div>

                    {renderField('Order number', 'order_no', 'text', undefined, false, viewMode)}

                    <div className="min-w-0 sm:col-span-2">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Quotation
                      </label>
                      <input
                        type="text"
                        disabled
                        value="Coming soon"
                        className="h-10 w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-400"
                      />
                    </div>
                  </div>
                </fieldset>

                {/* Items */}
                <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                  <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                    <span className="h-2 w-2 rounded-full bg-violet-500" /> Items
                  </legend>
                  <div className="mt-3">
                    {!viewMode ? (
                      <>
                        <div className="mb-3 min-w-0">
                          <SearchableSelect
                            options={
                              products?.map((p) => ({
                                id: p.id,
                                name: `${p.name} (₹${p.sale_price || p.price || 0})`,
                              })) || []
                            }
                            value={selectedProductId}
                            onChange={(val) => {
                              if (val) {
                                addItemToOrder(Number(val));
                                setSelectedProductId('');
                              }
                            }}
                            placeholder={
                              products && products.length > 0
                                ? `Select product to add (${products.length} available)`
                                : 'No products found'
                            }
                          />
                        </div>
                        {items.length === 0 ? (
                          <p className="py-4 text-center text-sm italic text-slate-400">
                            No products added yet
                          </p>
                        ) : (
                          <div className="max-h-60 overflow-y-auto overflow-x-hidden rounded-xl border border-slate-200 bg-white p-2">
                            {items.map((item, idx) => (
                              <div
                                key={idx}
                                className="flex min-w-0 items-center gap-2 rounded-lg border-b border-slate-100 p-2 last:border-0"
                              >
                                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">
                                  {item.product_name}
                                </span>
                                <Input
                                  type="number"
                                  min="1"
                                  value={item.qty}
                                  onChange={(e) => updateItemQty(idx, Number(e.target.value))}
                                  className="h-8 w-16 shrink-0 rounded-lg text-sm"
                                />
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={item.price}
                                  onChange={(e) => updateItemPrice(idx, Number(e.target.value))}
                                  className="h-8 w-24 shrink-0 rounded-lg text-sm"
                                />
                                <button
                                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-rose-500 transition hover:bg-rose-50"
                                  onClick={() => removeItem(idx)}
                                  aria-label={`Remove ${item.product_name}`}
                                >
                                  <FiX size={14} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
                        {items.length === 0 ? (
                          <p className="text-sm italic text-slate-400">No items</p>
                        ) : (
                          <ul className="space-y-1.5">
                            {items.map((item, idx) => (
                              <li key={idx} className="flex justify-between gap-3 text-sm">
                                <span className="min-w-0 truncate text-slate-700">
                                  {item.product_name}
                                </span>
                                <span className="shrink-0 font-medium tabular-nums text-slate-800">
                                  {item.qty} × ₹{(item.price ?? 0).toFixed(2)} = ₹
                                  {((item.qty ?? 0) * (item.price ?? 0)).toFixed(2)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="min-w-0">
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Subtotal
                        </label>
                        <div className="flex h-10 items-center rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm font-semibold tabular-nums text-slate-800">
                          ₹{subtotal.toFixed(2)}
                        </div>
                      </div>
                      <div className="min-w-0">
                        {renderField('Tax amount', 'tax_amount', 'number')}
                      </div>
                      <div className="min-w-0">
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Total
                        </label>
                        <div className="flex h-10 items-center rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 text-sm font-bold tabular-nums text-indigo-700">
                          ₹{total.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                </fieldset>

                {/* Payment */}
                <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                  <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" /> Payment
                  </legend>
                  <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {renderField('Payment method', 'payment_method', 'select', [
                      { id: 'qr', name: 'UPI' },
                      { id: 'bank_transfer', name: 'Bank Transfer' },
                      { id: 'cash', name: 'Cash' },
                      { id: 'card', name: 'Card' },
                    ])}
                    <div className="min-w-0">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Payment direction <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <select
                          value={formData.payment_direction}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              payment_direction: e.target.value as PaymentDirection,
                            }))
                          }
                          disabled={viewMode}
                          className={`h-10 w-full appearance-none rounded-xl border bg-white px-3.5 pr-9 text-sm font-medium shadow-sm outline-none transition ${
                            viewMode
                              ? 'cursor-not-allowed bg-slate-50 text-slate-400'
                              : formErrors.payment_direction
                                ? 'border-rose-300 ring-2 ring-rose-200'
                                : 'border-slate-200 text-slate-700 hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10'
                          }`}
                        >
                          <option value="inward">Inward (payment received)</option>
                          <option value="outward">Outward (payment sent)</option>
                        </select>
                        <FiChevronDown
                          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                          size={14}
                        />
                      </div>
                    </div>
                    {renderField('Order source', 'source', 'select', [
                      { id: 'whatsapp', name: 'WhatsApp' },
                      { id: 'manual', name: 'Manual' },
                      { id: 'phone', name: 'Phone' },
                      { id: 'email', name: 'Email' },
                    ])}
                    <div className="min-w-0 sm:col-span-2 lg:col-span-3">
                      {renderField('Amount paid', 'payment_amount', 'number')}
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="is_partial"
                          checked={formData.is_partial}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, is_partial: e.target.checked }))
                          }
                          disabled={viewMode}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <label htmlFor="is_partial" className="text-xs text-slate-600">
                          Partial payment
                        </label>
                      </div>
                      {formData.is_partial && (
                        <p className="mt-1 text-[11px] text-amber-600">
                          Amount must be greater than 0 and less than the total.
                        </p>
                      )}
                    </div>
                    <div className="min-w-0 sm:col-span-2 lg:col-span-3">
                      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">Total paid</span>
                          <span className="font-semibold tabular-nums text-slate-900">
                            ₹{parseFloat(String(formData.payment_amount || 0)).toFixed(2)}
                          </span>
                        </div>
                        <div className="mt-1 flex justify-between text-sm">
                          <span className="text-slate-600">Balance due</span>
                          <span className="font-semibold tabular-nums text-rose-600">
                            ₹
                            {(total - parseFloat(String(formData.payment_amount || 0))).toFixed(2)}
                          </span>
                        </div>
                        <div className="mt-1 flex justify-between text-sm">
                          <span className="text-slate-600">Payment status</span>
                          <span
                            className={`font-semibold ${
                              total - parseFloat(String(formData.payment_amount || 0)) <= 0
                                ? 'text-emerald-600'
                                : 'text-amber-600'
                            }`}
                          >
                            {total - parseFloat(String(formData.payment_amount || 0)) <= 0
                              ? 'Paid'
                              : 'Partial'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </fieldset>

                {/* Delivery & status */}
                <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                  <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                    <span className="h-2 w-2 rounded-full bg-sky-500" /> Delivery & status
                  </legend>
                  <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {renderField('Delivery date', 'delivery_date', 'date')}
                    {renderField('Status', 'status', 'select', [
                      { id: 'pending', name: 'Pending' },
                      { id: 'confirmed', name: 'Confirmed' },
                      { id: 'shipped', name: 'Shipped' },
                      { id: 'delivered', name: 'Delivered' },
                    ])}
                    <div className="min-w-0 sm:col-span-2 lg:col-span-3">
                      {renderField('Shipping address', 'shipping_address', 'textarea')}
                    </div>
                  </div>
                </fieldset>

                {/* Notes */}
                <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                  <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                    <span className="h-2 w-2 rounded-full bg-slate-500" /> Notes
                  </legend>
                  <div className="mt-3 min-w-0">{renderField('Notes', 'notes', 'textarea')}</div>
                </fieldset>
              </div>
            )}
          </Offcanvas>
        </Suspense>
      )}

      {/* ✅ FIX: normalize BOTH `company` and `customer` from `X | null | undefined`
          to `X | undefined` so the object matches OrderPrint's stricter prop types.
          The `as unknown as React.ComponentProps<typeof OrderPrint>['order']` cast
          is a safety net in case OrderPrint declares any other non-nullable field. */}
      {printOrder && (
        <OrderPrint
          order={
            {
              ...printOrder,
              company: printOrder.company ?? undefined,
              customer: printOrder.customer ?? undefined,
            } as unknown as React.ComponentProps<typeof OrderPrint>['order']
          }
          onReady={() => {}}
        />
      )}
    </>
  );
}

export default OrdersPage;