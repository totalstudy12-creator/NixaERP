// src/pages/InventoryPage.tsx
import {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  lazy,
  Suspense,
  memo,
  type DragEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  FiPlus,
  FiTrash2,
  FiDownload,
  FiEye,
  FiEdit,
  FiCheckCircle,
  FiXCircle,
  FiFilter,
  FiAlertCircle,
  FiPackage,
  FiBox,
  FiTruck,
  FiX,
  FiUpload,
  FiChevronDown,
  FiChevronLeft,
  FiChevronRight,
  FiChevronsLeft,
  FiChevronsRight,
  FiFile,
  FiCheck,
  FiAlertTriangle,
  FiDollarSign,
  FiMoreVertical,
  FiUser,
  FiMapPin,
} from 'react-icons/fi';
import { MdWarehouse } from 'react-icons/md';

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

interface Company { id: number; name: string }
interface Branch { id: number; name: string; company_id: number }
interface Warehouse {
  id: number;
  name: string;
  branch_id?: number | null;
  company_id?: number | null;
  code?: string | null;
}
interface InventoryItem {
  id: number;
  company_id: number;
  branch_id: number | null;
  company?: Company;
  branch?: Branch;
  name: string;
  sku: string;
  barcode: string | null;
  brand: string | null;
  unit: string | null;
  purchase_price: number | string;
  sale_price: number | string;
  tax_rate: number | string;
  stock_quantity: number | string;
  reorder_level: number | string;
  description: string | null;
  active: boolean | number | string;
  created_at?: string;
  updated_at?: string;
}
interface InventoryFormData {
  company_id: number | string;
  branch_id: number | string;
  name: string;
  sku: string;
  barcode: string;
  brand: string;
  unit: string;
  purchase_price: number | string;
  sale_price: number | string;
  tax_rate: number | string;
  stock_quantity: number | string;
  reorder_level: number | string;
  description: string;
  active: boolean;
}
type DuplicateAction = 'skip' | 'update' | 'stop';
interface ImportPreviewRow {
  row: number;
  data: Record<string, unknown>;
  valid: boolean;
  errors: Record<string, string>;
  sku: string;
  name: string;
}
interface ImportSummary {
  total: number;
  valid: number;
  invalid: number;
  created?: number;
  updated?: number;
  skipped?: number;
  failed?: number;
}
interface ImportError { row: number; field: string; message: string }
interface WarehouseStock {
  id?: number;
  warehouse_id: number;
  warehouse_name: string;
  quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  average_cost: number;
  last_purchase_price: number | null;
}
interface StockMovementRecord {
  id: number;
  transaction_type: 'IN' | 'OUT';
  reference_type: string;
  reference_id: string | null;
  quantity: number;
  unit_price: number;
  stock_before: number;
  stock_after: number;
  remark: string | null;
  transaction_date: string;
  created_at?: string;
  warehouse?: { id: number; name: string };
  creator?: { id: number; name: string };
}
interface TransactionRecord {
  type: 'sale' | 'purchase';
  bill_number: string;
  party_name: string;
  date: string;
  unit_price: number;
  price_with_tax: number;
  quantity: number;
  item_discount: number;
  item_net: number;
  item_total: number;
}
interface PurchasePriceRecord {
  id: number;
  product_id: number;
  supplier_id: number | null;
  purchase_id: number | null;
  bill_number: string | null;
  quantity: number;
  unit_price: number;
  purchase_date: string;
  supplier?: { id: number; name: string };
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
  response?: { status?: number; data?: { message?: string } };
  name?: string;
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const CACHE_TTL_MS = 300_000;
const TABLE_COLUMN_COUNT = 8;
const WAREHOUSE_STOCK_CONCURRENCY = 6;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const TAB_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const PAGE_SIZE_STORAGE_KEY = 'inventory:pageSize';
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_BUTTONS = 5;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/**
 * Stock-movements and purchase-price-history endpoints accept per_page and
 * benefit from a higher window. The /transactions endpoint does NOT accept
 * per_page — sending it causes a 500 on some backend builds.
 */
const TAB_FETCH_LIMIT = 200;

function readStoredPageSize(): number {
  try {
    const raw = window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY);
    const n = raw ? Number(raw) : NaN;
    if (PAGE_SIZE_OPTIONS.includes(n as (typeof PAGE_SIZE_OPTIONS)[number])) return n;
  } catch { /* localStorage may be disabled */ }
  return DEFAULT_PAGE_SIZE;
}

function persistPageSize(size: number): void {
  try { window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(size)); } catch { /* no-op */ }
}

const UNIT_OPTIONS = [
  'Piece', 'Kg', 'Gram', 'Liter', 'Milliliter', 'Meter', 'Centimeter',
  'Box', 'Carton', 'Set', 'Pack', 'Unit', 'Hour', 'Day', 'Month', 'Year',
  'Dozen', 'Pair', 'Bundle', 'Bag', 'Roll', 'Sheet', 'Bottle', 'Can',
  'Case', 'Pallet', 'Drum',
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'in_stock', label: 'In stock' },
  { value: 'low', label: 'Low stock' },
  { value: 'out', label: 'Out of stock' },
] as const;

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
  try { addAppLog(entry); } catch { /* no-op */ }
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  return Number.isFinite(n) ? n : fallback;
}
function toPositiveNumber(value: unknown): number | null {
  const n = toFiniteNumber(value, NaN);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}
function toBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}
function safeNumber(value: unknown): number { return toFiniteNumber(value, 0); }

function safeCurrency(value: unknown): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 2,
  }).format(safeNumber(value));
}

function safeDate(value: unknown): string {
  if (!value) return '—';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(date);
}

function toDateKey(value: unknown): string {
  if (!value) return '';
  const s = String(value);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function extractArray<T>(response: unknown): T[] {
  if (Array.isArray(response)) return response as T[];
  const r = response as { data?: unknown; results?: unknown } | null;
  if (Array.isArray(r?.data)) return r.data as T[];
  const d = (r?.data as { data?: unknown } | undefined)?.data;
  if (Array.isArray(d)) return d as T[];
  if (Array.isArray(r?.results)) return r.results as T[];
  const rd = (r?.results as { data?: unknown } | undefined)?.data;
  if (Array.isArray(rd)) return rd as T[];
  return [];
}

function csvEscape(value: unknown): string {
  const text = String(value ?? '');
  const sanitized = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${sanitized.replace(/"/g, '""')}"`;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  const workers: Promise<void>[] = [];
  for (let w = 0; w < workerCount; w++) {
    workers.push(
      (async () => {
        while (true) {
          const index = cursor++;
          if (index >= items.length) return;
          try { results[index] = await fn(items[index], index); }
          catch { results[index] = undefined as unknown as R; }
        }
      })()
    );
  }
  await Promise.all(workers);
  return results;
}

/* ------------------------------------------------------------------ */
/* Cache hook (race-safe)                                              */
/* ------------------------------------------------------------------ */

interface CacheEntry<T> { data: T; timestamp: number }
const cache = new Map<string, CacheEntry<unknown>>();

function useApiCache<T>(key: string, fetcher: () => Promise<T>, ttlMs = CACHE_TTL_MS) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  const fetcherRef = useRef(fetcher);

  useEffect(() => { fetcherRef.current = fetcher; }, [fetcher]);

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
  children, align = 'left',
}: {
  children: ReactNode;
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

/* ------------------------------------------------------------------ */
/* Stat card                                                           */
/* ------------------------------------------------------------------ */

type Accent = 'indigo' | 'emerald' | 'rose' | 'amber' | 'violet' | 'teal' | 'sky';

const StatCard = memo(
  ({
    icon: Icon, label, value, accent = 'indigo',
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
      <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300/80 hover:shadow-[0_8px_24px_-12px_rgba(15,23,42,0.15)] sm:p-4">
        <div className="flex items-start justify-between gap-2 sm:gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:text-[11px] sm:tracking-[0.14em]">
              {label}
            </p>
            <p className="mt-1.5 truncate text-lg font-bold tracking-tight text-slate-900 sm:mt-2 sm:text-xl lg:text-2xl">
              {value}
            </p>
          </div>
          <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl sm:h-10 sm:w-10 ${style.bg} ring-1 ${style.ring}`}>
            <Icon size={16} className={`sm:hidden ${style.icon}`} />
            <Icon size={18} className={`hidden sm:block ${style.icon}`} />
          </div>
        </div>
      </div>
    );
  }
);
StatCard.displayName = 'StatCard';

/* ------------------------------------------------------------------ */
/* Portal-based Action Dropdown                                        */
/* ------------------------------------------------------------------ */

const MENU_WIDTH = 180;
const MENU_HEIGHT = 150;
const MENU_MARGIN = 8;

const ActionDropdown = memo(
  ({
    item, onView, onEdit, onDelete,
  }: {
    item: InventoryItem;
    onView: (i: InventoryItem) => void;
    onEdit: (i: InventoryItem) => void;
    onDelete: (i: InventoryItem) => void;
  }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const toggle = useCallback(() => {
      if (isOpen) { setIsOpen(false); return; }
      const rect = buttonRef.current?.getBoundingClientRect();
      if (rect) {
        const left = Math.min(
          Math.max(MENU_MARGIN, rect.right - MENU_WIDTH),
          window.innerWidth - MENU_WIDTH - MENU_MARGIN
        );
        const top = rect.bottom + MENU_HEIGHT <= window.innerHeight - MENU_MARGIN
          ? rect.bottom + 4
          : Math.max(MENU_MARGIN, rect.top - MENU_HEIGHT - 4);
        setMenuStyle({ position: 'fixed', left, top, width: MENU_WIDTH, zIndex: 9999 });
      }
      setIsOpen(true);
    }, [isOpen]);

    useEffect(() => {
      if (!isOpen) return;
      const handler = (event: MouseEvent) => {
        const target = event.target as Node;
        if (
          buttonRef.current && !buttonRef.current.contains(target) &&
          menuRef.current && !menuRef.current.contains(target)
        ) setIsOpen(false);
      };
      const onScrollOrResize = () => setIsOpen(false);
      document.addEventListener('mousedown', handler);
      window.addEventListener('resize', onScrollOrResize);
      window.addEventListener('scroll', onScrollOrResize, true);
      return () => {
        document.removeEventListener('mousedown', handler);
        window.removeEventListener('resize', onScrollOrResize);
        window.removeEventListener('scroll', onScrollOrResize, true);
      };
    }, [isOpen]);

    return (
      <>
        <button
          ref={buttonRef}
          type="button"
          onClick={(e) => { e.stopPropagation(); toggle(); }}
          className={`grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 ${isOpen ? 'bg-slate-100 text-slate-700' : ''}`}
          title="Actions"
          aria-haspopup="menu"
          aria-expanded={isOpen}
        >
          <FiMoreVertical size={16} />
        </button>

        {isOpen && createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={menuStyle}
            onClick={(e) => e.stopPropagation()}
            className="animate-fadeIn overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl shadow-slate-900/10"
          >
            <button type="button" role="menuitem"
              onClick={() => { setIsOpen(false); onView(item); }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50">
              <FiEye size={14} className="text-slate-500" /> View
            </button>
            <button type="button" role="menuitem"
              onClick={() => { setIsOpen(false); onEdit(item); }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50">
              <FiEdit size={14} className="text-indigo-500" /> Edit
            </button>
            <div className="my-1 border-t border-slate-100" />
            <button type="button" role="menuitem"
              onClick={() => { setIsOpen(false); onDelete(item); }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 transition hover:bg-red-50">
              <FiTrash2 size={14} /> Delete
            </button>
          </div>,
          document.body
        )}
      </>
    );
  }
);
ActionDropdown.displayName = 'ActionDropdown';

/* ------------------------------------------------------------------ */
/* Modal System                                                        */
/* ------------------------------------------------------------------ */

interface ModalProps {
  onClose: () => void;
  children: ReactNode;
  title?: string;
  width?: string;
}

const Modal = ({ onClose, children, title, width = 'max-w-5xl' }: ModalProps) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousOverflow = useRef<string>('');

  useEffect(() => {
    previousOverflow.current = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);

    const focusableSelector =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const first = modalRef.current?.querySelector<HTMLElement>(focusableSelector);
    first?.focus();

    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow.current;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/50 p-2 backdrop-blur-sm sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        className={`animate-fadeIn my-2 w-full sm:my-4 ${width} overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl`}
      >
        {title && (
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4">
            <h2 id="modal-title" className="truncate text-sm font-bold text-slate-900 sm:text-base">
              {title}
            </h2>
            <button onClick={onClose}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close modal">
              <FiX size={18} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Tabs — underline style (clean, scrollable on narrow screens)        */
/* ------------------------------------------------------------------ */

const Tabs = ({
  tabs, activeTab, onChange,
}: {
  tabs: { key: string; label: string }[];
  activeTab: string;
  onChange: (key: string) => void;
}) => (
  <div className="relative -mx-1 overflow-hidden border-b border-slate-200">
    <div className="flex gap-0.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            className={`relative shrink-0 whitespace-nowrap px-3 py-3 text-xs font-semibold transition-colors sm:px-4 ${
              isActive ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.label}
            <span
              className={`pointer-events-none absolute inset-x-2 bottom-0 h-[3px] rounded-t-full transition-all duration-200 ${
                isActive ? 'bg-indigo-600 opacity-100' : 'opacity-0'
              }`}
            />
          </button>
        );
      })}
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/* Pagination — page level                                             */
/* ------------------------------------------------------------------ */

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  pageNumbers: (number | 'ellipsis')[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

const Pagination = memo(({
  currentPage, totalPages, pageSize, totalItems, pageNumbers, onPageChange, onPageSizeChange,
}: PaginationProps) => {
  const from = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 sm:gap-3">
        <span className="whitespace-nowrap">
          Showing <strong className="text-slate-900 tabular-nums">{from.toLocaleString('en-IN')}</strong>
          {'–'}
          <strong className="text-slate-900 tabular-nums">{to.toLocaleString('en-IN')}</strong>{' '}
          of <strong className="text-slate-900 tabular-nums">{totalItems.toLocaleString('en-IN')}</strong>
        </span>

        <div className="relative">
          <select aria-label="Rows per page" value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-8 appearance-none rounded-lg border border-slate-200 bg-white pl-2.5 pr-7 text-xs font-medium text-slate-700 outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10">
            {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n} / page</option>)}
          </select>
          <FiChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
        </div>
      </div>

      <nav aria-label="Pagination" className="flex items-center gap-1 self-start sm:self-auto">
        <Button variant="outline" size="sm" type="button" aria-label="First page" className="hidden h-8 rounded-lg px-2.5 sm:inline-flex"
          onClick={() => onPageChange(1)} disabled={currentPage === 1}><FiChevronsLeft size={14} /></Button>
        <Button variant="outline" size="sm" type="button" aria-label="Previous page" className="h-8 rounded-lg px-2.5"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))} disabled={currentPage === 1}><FiChevronLeft size={14} /></Button>

        {pageNumbers.map((p, idx) =>
          p === 'ellipsis' ? (
            <span key={`e-${idx}`} aria-hidden="true" className="select-none px-1 text-xs text-slate-400">…</span>
          ) : (
            <button key={p} type="button" onClick={() => onPageChange(p)}
              aria-current={p === currentPage ? 'page' : undefined}
              aria-label={`Page ${p}`}
              className={`h-8 min-w-[30px] rounded-lg px-2 text-xs font-semibold tabular-nums transition sm:min-w-[32px] ${
                p === currentPage ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
              }`}>
              {p}
            </button>
          )
        )}

        <Button variant="outline" size="sm" type="button" aria-label="Next page" className="h-8 rounded-lg px-2.5"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages}><FiChevronRight size={14} /></Button>
        <Button variant="outline" size="sm" type="button" aria-label="Last page" className="hidden h-8 rounded-lg px-2.5 sm:inline-flex"
          onClick={() => onPageChange(totalPages)} disabled={currentPage === totalPages}><FiChevronsRight size={14} /></Button>
      </nav>
    </div>
  );
});
Pagination.displayName = 'Pagination';

/** Compact pagination used inside modal tabs. */
const MiniPagination = memo(({
  page, size, total, totalPages, onPageChange, onSizeChange,
}: {
  page: number; size: number; total: number; totalPages: number;
  onPageChange: (p: number) => void;
  onSizeChange: (s: number) => void;
}) => {
  const from = total === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(page * size, total);

  return (
    <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50/40 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[11px] text-slate-500">
        Showing{' '}
        <strong className="tabular-nums text-slate-800">{from.toLocaleString('en-IN')}</strong>–
        <strong className="tabular-nums text-slate-800">{to.toLocaleString('en-IN')}</strong>{' '}
        of <strong className="tabular-nums text-slate-800">{total.toLocaleString('en-IN')}</strong>
      </p>
      <div className="flex items-center gap-2 self-start sm:self-auto">
        <select
          aria-label="Rows per page"
          value={size}
          onChange={(e) => onSizeChange(Number(e.target.value))}
          className="h-7 appearance-none rounded-lg border border-slate-200 bg-white px-2 pr-6 text-[11px] font-medium text-slate-700 outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10"
        >
          {TAB_PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n} / page</option>)}
        </select>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Previous page" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page === 1}
            className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40">‹</button>
          <span className="min-w-[54px] rounded-md bg-white px-2 py-0.5 text-center text-[11px] font-semibold tabular-nums text-slate-700 ring-1 ring-slate-200">
            {page} / {totalPages}
          </span>
          <button type="button" aria-label="Next page" onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page === totalPages}
            className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40">›</button>
        </div>
      </div>
    </div>
  );
});
MiniPagination.displayName = 'MiniPagination';

/** Generic client-side pagination hook used by every modal tab. */
function usePagination<T>(items: T[], initialSize: number = 10) {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(initialSize);

  const totalPages = Math.max(1, Math.ceil(items.length / size));

  useEffect(() => { setPage(1); }, [items.length, size]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const paged = useMemo(() => {
    const start = (page - 1) * size;
    return items.slice(start, start + size);
  }, [items, page, size]);

  return { page, size, totalPages, paged, total: items.length, setPage, setSize };
}

const EmptyState = ({ title, hint }: { title: string; hint?: string }) => (
  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-10 text-center">
    <p className="text-sm font-semibold text-slate-800">{title}</p>
    {hint && <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">{hint}</p>}
  </div>
);

/** Reusable inline stat tile for the modal (label on top, value below, no wrap). */
const StatTile = ({ label, value, tone = 'text-slate-900' }: { label: string; value: string | number; tone?: string }) => (
  <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-2.5 sm:p-3">
    <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <p className={`mt-1 truncate text-sm font-bold tabular-nums sm:text-base ${tone}`}>{value}</p>
  </div>
);

/* ------------------------------------------------------------------ */
/* Product Detail Modal                                                */
/* ------------------------------------------------------------------ */

type BillTypeFilter = 'all' | 'sale' | 'purchase';

const ProductDetailModal = ({
  product, onClose, onEdit, onStockIn, onStockOut,
}: {
  product: InventoryItem;
  onClose: () => void;
  onEdit: (i: InventoryItem) => void;
  onStockIn: (i: InventoryItem) => void;
  onStockOut: (i: InventoryItem) => void;
}) => {
  const [activeTab, setActiveTab] = useState('summary');
  const [summaryData, setSummaryData] = useState<Record<string, unknown> | null>(null);
  const [warehouseData, setWarehouseData] = useState<WarehouseStock[]>([]);
  const [movements, setMovements] = useState<StockMovementRecord[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [priceHistory, setPriceHistory] = useState<PurchasePriceRecord[]>([]);
  const [priceList, setPriceList] = useState<Record<string, unknown> | null>(null);
  const [tabLoading, setTabLoading] = useState<Record<string, boolean>>({});
  const [tabErrors, setTabErrors] = useState<Record<string, string>>({});
  const [billTypeFilter, setBillTypeFilter] = useState<BillTypeFilter>('sale');
  const controllersRef = useRef<Map<string, AbortController>>(new Map());

  const clearTabData = useCallback(() => {
    setSummaryData(null);
    setWarehouseData([]);
    setMovements([]);
    setTransactions([]);
    setPriceHistory([]);
    setPriceList(null);
  }, []);

  useEffect(() => {
    clearTabData();
    setActiveTab('summary');
    setBillTypeFilter('sale');
    controllersRef.current.forEach((c) => c.abort());
    controllersRef.current.clear();
  }, [product.id, clearTabData]);

  const fetchTabData = useCallback(
    async (tabKey: string) => {
      if (controllersRef.current.has(tabKey)) controllersRef.current.get(tabKey)?.abort();
      const controller = new AbortController();
      controllersRef.current.set(tabKey, controller);

      setTabLoading((prev) => ({ ...prev, [tabKey]: true }));
      setTabErrors((prev) => ({ ...prev, [tabKey]: '' }));

      try {
        switch (tabKey) {
          case 'summary':
          case 'warehouse': {
            const [summaryRes, warehouseRes] = await Promise.all([
              apiClient.get(`/products/${product.id}/inventory-summary`, { signal: controller.signal }),
              apiClient.get(`/products/${product.id}/warehouse-stock`, { signal: controller.signal }),
            ]);
            setSummaryData((summaryRes.data ?? {}) as Record<string, unknown>);
            setWarehouseData(extractArray<WarehouseStock>(warehouseRes.data));
            break;
          }
          case 'timeline': {
            const res = await apiClient.get(
              `/products/${product.id}/stock-movements?per_page=${TAB_FETCH_LIMIT}`,
              { signal: controller.signal }
            );
            setMovements(extractArray<StockMovementRecord>(res.data));
            break;
          }
          case 'billwise': {
            // NOTE: /transactions does NOT accept per_page on the backend.
            const res = await apiClient.get(
              `/products/${product.id}/transactions`,
              { signal: controller.signal }
            );
            setTransactions(extractArray<TransactionRecord>(res.data));
            break;
          }
          case 'purchasehistory': {
            const res = await apiClient.get(
              `/products/${product.id}/purchase-price-history?per_page=${TAB_FETCH_LIMIT}`,
              { signal: controller.signal }
            );
            setPriceHistory(extractArray<PurchasePriceRecord>(res.data));
            break;
          }
          case 'pricelist': {
            const res = await apiClient.get(`/products/${product.id}/price-list`, {
              signal: controller.signal,
            });
            setPriceList((res.data ?? {}) as Record<string, unknown>);
            break;
          }
          default:
            break;
        }
      } catch (error: unknown) {
        if ((error as ApiErrorLike).name !== 'AbortError') {
          setTabErrors((prev) => ({
            ...prev,
            [tabKey]: getApiErrorMessage(error, 'Failed to load data.'),
          }));
        }
      } finally {
        if (!controller.signal.aborted) {
          setTabLoading((prev) => ({ ...prev, [tabKey]: false }));
        }
        controllersRef.current.delete(tabKey);
      }
    },
    [product.id]
  );

  useEffect(() => {
    fetchTabData('summary');
    fetchTabData('warehouse');
    return () => { controllersRef.current.forEach((c) => c.abort()); };
  }, [fetchTabData]);

  useEffect(() => {
    if (activeTab === 'summary' || activeTab === 'warehouse') return;
    fetchTabData(activeTab);
  }, [activeTab, fetchTabData]);

  /* ------------ Sorted & filtered data ------------ */

  const sortedMovements = useMemo(
    () =>
      [...movements].sort((a, b) => {
        const da = toDateKey(a.transaction_date);
        const db = toDateKey(b.transaction_date);
        if (da !== db) return db.localeCompare(da);
        const ca = String(a.created_at ?? '');
        const cb = String(b.created_at ?? '');
        if (ca !== cb) return cb.localeCompare(ca);
        return (b.id ?? 0) - (a.id ?? 0);
      }),
    [movements]
  );

  const filteredTransactions = useMemo(() => {
    if (billTypeFilter === 'all') return transactions;
    return transactions.filter((t) => t.type === billTypeFilter);
  }, [transactions, billTypeFilter]);

  const sortedPriceHistory = useMemo(
    () =>
      [...priceHistory].sort((a, b) => {
        const da = toDateKey(a.purchase_date);
        const db = toDateKey(b.purchase_date);
        if (da !== db) return db.localeCompare(da);
        return (b.id ?? 0) - (a.id ?? 0);
      }),
    [priceHistory]
  );

  const timelinePager = usePagination(sortedMovements, 10);
  const billwisePager = usePagination(filteredTransactions, 10);
  const partyPager = usePagination(filteredTransactions, 10);
  const purchaseHistoryPager = usePagination(sortedPriceHistory, 10);
  const warehousePager = usePagination(warehouseData, 10);

  const partyGroups = useMemo(() => {
    if (!partyPager.paged.length) return [];
    const map = new Map<string, TransactionRecord[]>();
    partyPager.paged.forEach((t) => {
      const key = t.party_name || 'Unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });
    return Array.from(map.entries()).map(([party, items]) => ({ party, items }));
  }, [partyPager.paged]);

  const tabs = useMemo(
    () => [
      { key: 'summary', label: 'Summary' },
      { key: 'billwise', label: 'Bill-Wise' },
      { key: 'party', label: 'Party' },
      { key: 'timeline', label: 'Timeline' },
      { key: 'pricelist', label: 'Price List' },
      { key: 'purchasehistory', label: 'Purchase History' },
      { key: 'warehouse', label: 'Warehouse' },
    ],
    []
  );

  const isLoading = tabLoading[activeTab] || false;
  const activeTabError = tabErrors[activeTab] || null;

  /* ---------------- Renders ---------------- */

  const renderBillwise = () => (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Show</span>
        <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5 text-[11px]">
          {([
            { key: 'all', label: 'All' },
            { key: 'sale', label: 'Sales' },
            { key: 'purchase', label: 'Purchases' },
          ] as const).map((opt) => (
            <button key={opt.key} type="button" onClick={() => setBillTypeFilter(opt.key as BillTypeFilter)}
              className={`rounded-md px-2.5 py-0.5 font-semibold transition ${
                billTypeFilter === opt.key ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}>
              {opt.label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-slate-400">({filteredTransactions.length})</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50">
            <tr>
              {['Type', 'Bill #', 'Party', 'Date', 'Unit price', 'Price w/tax', 'Qty', 'Disc', 'Total'].map((h, i) => (
                <th key={h}
                  className={`whitespace-nowrap px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 ${
                    i >= 4 ? 'text-right' : 'text-left'
                  }`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {billwisePager.paged.map((t, i) => (
              <tr key={`${t.bill_number}-${i}`} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    t.type === 'sale'
                      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60'
                      : 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200/60'
                  }`}>
                    {t.type === 'sale' ? 'SALE' : 'PURCHASE'}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-slate-700">{t.bill_number}</td>
                <td className="max-w-[180px] truncate px-3 py-2 text-xs text-slate-700">{t.party_name}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-700">{safeDate(t.date)}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-700">{safeCurrency(t.unit_price)}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-700">{safeCurrency(t.price_with_tax)}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-700">{safeNumber(t.quantity)}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-700">{safeNumber(t.item_discount)}%</td>
                <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums text-slate-900">{safeCurrency(t.item_total)}</td>
              </tr>
            ))}
            {billwisePager.paged.length === 0 && (
              <tr><td colSpan={9} className="py-10 text-center text-sm text-slate-400">
                {billTypeFilter === 'sale' ? 'No sales bills for this product yet' : 'No transactions found'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {filteredTransactions.length > 0 && (
        <MiniPagination
          page={billwisePager.page} size={billwisePager.size}
          total={billwisePager.total} totalPages={billwisePager.totalPages}
          onPageChange={billwisePager.setPage} onSizeChange={billwisePager.setSize}
        />
      )}
    </div>
  );

  const renderTimeline = () => (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <div className="relative space-y-2 p-3 pl-6 sm:p-4 sm:pl-8">
        <div className="absolute bottom-4 left-3 top-4 w-px bg-slate-200 sm:left-4" />
        {timelinePager.paged.length === 0 ? (
          <EmptyState title="No movements" hint="No stock movements recorded yet." />
        ) : (
          timelinePager.paged.map((m) => {
            const txDate = toDateKey(m.transaction_date);
            const createdDate = toDateKey(m.created_at);
            const isBackdated = !!createdDate && createdDate !== txDate;

            return (
              <div key={m.id} className="relative pl-2.5 sm:pl-3">
                <div
                  className={`absolute -left-[17px] top-3 grid h-6 w-6 place-items-center rounded-full ring-4 ring-white sm:-left-[21px] ${
                    m.transaction_type === 'IN'
                      ? 'bg-emerald-100 text-emerald-600'
                      : 'bg-rose-100 text-rose-600'
                  }`}
                >
                  {m.transaction_type === 'IN' ? <FiPackage size={11} /> : <FiTruck size={11} />}
                </div>
                <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-2.5 sm:gap-3 sm:p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">
                      {m.transaction_type} · {m.reference_type}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <FiMapPin size={10} />
                        {safeDate(m.transaction_date)}
                      </span>
                      {isBackdated && (
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200/70">
                          posted {safeDate(m.created_at)}
                        </span>
                      )}
                      <span className="tabular-nums text-slate-500">
                        {safeNumber(m.stock_before)} → {safeNumber(m.stock_after)}
                      </span>
                    </p>
                    {m.warehouse && <p className="mt-0.5 text-[11px] text-slate-500">{m.warehouse.name}</p>}
                    {m.creator && (
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
                        <FiUser size={10} /> {m.creator.name}
                      </p>
                    )}
                    {m.remark && <p className="mt-1 text-[11px] text-slate-500">{m.remark}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-sm font-semibold tabular-nums ${
                      m.transaction_type === 'IN' ? 'text-emerald-600' : 'text-rose-600'
                    }`}>
                      {m.transaction_type === 'IN' ? '+' : '−'}
                      {safeNumber(m.quantity)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {sortedMovements.length > 0 && (
        <MiniPagination
          page={timelinePager.page} size={timelinePager.size}
          total={timelinePager.total} totalPages={timelinePager.totalPages}
          onPageChange={timelinePager.setPage} onSizeChange={timelinePager.setSize}
        />
      )}
    </div>
  );

  const renderParty = () => (
    <div className="space-y-3">
      {partyGroups.length === 0 ? (
        <EmptyState title="No party transactions" hint="No party transactions found for this product." />
      ) : (
        partyGroups.map((group) => (
          <div key={group.party} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <h3 className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-3 py-2.5 text-sm font-bold text-slate-900 sm:px-4">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-indigo-50 text-indigo-600">
                <FiUser size={12} />
              </span>
              <span className="truncate">{group.party}</span>
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[400px] text-sm">
                <thead className="bg-slate-50/40">
                  <tr>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">Bill #</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">Date</th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500">Qty</th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((t, i) => (
                    <tr key={`${group.party}-${i}`} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-xs text-slate-700">{t.bill_number}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-700">{safeDate(t.date)}</td>
                      <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-700">{safeNumber(t.quantity)}</td>
                      <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums text-slate-900">{safeCurrency(t.item_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
      {filteredTransactions.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <MiniPagination
            page={partyPager.page} size={partyPager.size}
            total={partyPager.total} totalPages={partyPager.totalPages}
            onPageChange={partyPager.setPage} onSizeChange={partyPager.setSize}
          />
        </div>
      )}
    </div>
  );

  const renderPurchaseHistory = () => (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">Date</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">Supplier</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">Bill #</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500">Qty</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500">Unit price</th>
            </tr>
          </thead>
          <tbody>
            {purchaseHistoryPager.paged.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-700">{safeDate(p.purchase_date)}</td>
                <td className="max-w-[180px] truncate px-3 py-2 text-xs text-slate-700">{p.supplier?.name || '—'}</td>
                <td className="px-3 py-2 text-xs text-slate-700">{p.bill_number || '—'}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-700">{safeNumber(p.quantity)}</td>
                <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums text-slate-900">{safeCurrency(p.unit_price)}</td>
              </tr>
            ))}
            {purchaseHistoryPager.paged.length === 0 && (
              <tr><td colSpan={5} className="py-10 text-center text-sm text-slate-400">No purchase history</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {sortedPriceHistory.length > 0 && (
        <MiniPagination
          page={purchaseHistoryPager.page} size={purchaseHistoryPager.size}
          total={purchaseHistoryPager.total} totalPages={purchaseHistoryPager.totalPages}
          onPageChange={purchaseHistoryPager.setPage} onSizeChange={purchaseHistoryPager.setSize}
        />
      )}
    </div>
  );

  const renderWarehouse = () => (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">Warehouse</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500">Qty</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500">Reserved</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500">Available</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500">Avg cost</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500">Last purchase</th>
            </tr>
          </thead>
          <tbody>
            {warehousePager.paged.map((w) => (
              <tr key={w.warehouse_id} className="border-t border-slate-100">
                <td className="px-3 py-2 text-xs font-medium text-slate-800">{w.warehouse_name}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-700">{safeNumber(w.quantity)}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-700">{safeNumber(w.reserved_quantity)}</td>
                <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums text-emerald-700">{safeNumber(w.available_quantity)}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-700">{safeCurrency(w.average_cost)}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-700">{safeCurrency(w.last_purchase_price)}</td>
              </tr>
            ))}
            {warehousePager.paged.length === 0 && (
              <tr><td colSpan={6} className="py-10 text-center text-sm text-slate-400">No warehouse records</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {warehouseData.length > 0 && (
        <MiniPagination
          page={warehousePager.page} size={warehousePager.size}
          total={warehousePager.total} totalPages={warehousePager.totalPages}
          onPageChange={warehousePager.setPage} onSizeChange={warehousePager.setSize}
        />
      )}
    </div>
  );

  return (
    <Modal onClose={onClose} title={product.name} width="max-w-7xl">
      <div className="p-3 sm:p-5">
        {/* Header summary card */}
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-3 sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white shadow-sm sm:h-12 sm:w-12 sm:text-base">
                {(product.name || 'P')[0]?.toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900 sm:text-base">{product.name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 font-mono text-[10px] text-slate-600 sm:px-2.5 sm:text-[11px]">
                    {product.sku || '—'}
                  </span>
                  {product.brand && (
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-600 sm:px-2.5 sm:text-[11px]">
                      {product.brand}
                    </span>
                  )}
                  <Badge variant="outline"
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold sm:px-2.5 sm:text-[11px] ${
                      toBoolean(product.active)
                        ? 'border-emerald-200/70 bg-emerald-50 text-emerald-700'
                        : 'border-red-200/70 bg-red-50 text-red-700'
                    }`}>
                    {toBoolean(product.active) ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              <Button onClick={() => onEdit(product)} variant="outline" className="h-8 rounded-lg text-xs sm:h-9 sm:rounded-xl sm:text-sm">
                <FiEdit className="mr-1.5" size={14} /> Edit
              </Button>
              <Button onClick={() => onStockIn(product)}
                className="h-8 rounded-lg bg-emerald-600 text-xs font-semibold hover:bg-emerald-700 sm:h-9 sm:rounded-xl sm:text-sm">
                <FiPackage className="mr-1.5" size={14} /> Stock IN
              </Button>
              <Button onClick={() => onStockOut(product)}
                className="h-8 rounded-lg bg-rose-600 text-xs font-semibold hover:bg-rose-700 sm:h-9 sm:rounded-xl sm:text-sm">
                <FiTruck className="mr-1.5" size={14} /> Stock OUT
              </Button>
            </div>
          </div>
        </div>

        {/* Summary tiles — responsive grid, no label wrap */}
        {summaryData && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile label="Sale price" value={safeCurrency(product.sale_price)} />
            <StatTile label="Total stock" value={safeNumber(summaryData.total_stock)} />
            <StatTile label="Available" value={safeNumber(summaryData.available_stock)} tone="text-emerald-700" />
            <StatTile label="Reserved" value={safeNumber(summaryData.reserved_stock)} tone="text-amber-700" />
            <StatTile label="Avg purchase" value={safeCurrency(summaryData.average_purchase_price)} />
            <StatTile label="Last purchase" value={safeCurrency(summaryData.last_purchase_price)} />
          </div>
        )}

        {/* Tabs */}
        <div className="mt-4">
          <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
        </div>

        <div className="mt-4">
          {activeTabError && (
            <div className="mb-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <FiAlertCircle className="mt-0.5 shrink-0" size={16} />
              <span className="break-words">{activeTabError}</span>
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
            </div>
          ) : (
            <>
              {activeTab === 'summary' && summaryData && (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <StatTile label="Last purchase price" value={safeCurrency(summaryData.last_purchase_price)} />
                  <StatTile label="Average purchase price" value={safeCurrency(summaryData.average_purchase_price)} />
                  <StatTile label="Last sale price" value={safeCurrency(summaryData.last_sale_price)} />
                </div>
              )}

              {activeTab === 'billwise' && renderBillwise()}
              {activeTab === 'party' && renderParty()}
              {activeTab === 'timeline' && renderTimeline()}

              {activeTab === 'pricelist' && (
                priceList ? (
                  <dl className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    {[
                      { key: 'purchase_price', label: 'Purchase price' },
                      { key: 'sale_price', label: 'Sale price' },
                      { key: 'mrp', label: 'MRP' },
                      { key: 'wholesale_price', label: 'Wholesale' },
                      { key: 'dealer_price', label: 'Dealer' },
                      { key: 'distributor_price', label: 'Distributor' },
                    ].map((row) => (
                      <StatTile key={row.key} label={row.label} value={safeCurrency(priceList[row.key])} />
                    ))}
                  </dl>
                ) : <EmptyState title="No price list available" />
              )}

              {activeTab === 'purchasehistory' && renderPurchaseHistory()}
              {activeTab === 'warehouse' && renderWarehouse()}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Stock IN Modal                                                      */
/* ------------------------------------------------------------------ */

const StockInModal = ({
  product, onClose, onSuccess,
}: {
  product: InventoryItem;
  onClose: () => void;
  onSuccess: () => void;
}) => {
  const [form, setForm] = useState({
    warehouse_id: '',
    quantity: '',
    unit_cost: product.purchase_price?.toString() || '0',
    reference_type: 'manual',
    reference_id: '',
    transaction_date: new Date().toISOString().slice(0, 10),
    remark: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const { showSuccess, showError } = useNotification();
  const [warehouses, setWarehouses] = useState<Array<{ id: number; name: string }>>([]);
  const [warehouseError, setWarehouseError] = useState('');
  const [selectedStock, setSelectedStock] = useState<number | null>(null);
  const [idempotencyKey] = useState<string>(() => {
    try { return crypto.randomUUID(); }
    catch { return `key-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
  });

  useEffect(() => {
    const controller = new AbortController();
    apiClient.get('/warehouses?per_page=all', { signal: controller.signal })
      .then((res) => setWarehouses(extractArray<{ id: number; name: string }>(res.data)))
      .catch((err: unknown) => {
        if ((err as ApiErrorLike).name !== 'AbortError') {
          setWarehouseError(getApiErrorMessage(err, 'Failed to load warehouses.'));
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!form.warehouse_id) { setSelectedStock(null); return; }
    const controller = new AbortController();
    apiClient.get(`/products/${product.id}/warehouse-stock`, { signal: controller.signal })
      .then((res) => {
        const stocks = extractArray<WarehouseStock>(res.data);
        const selected = stocks.find((s) => s.warehouse_id === Number(form.warehouse_id));
        setSelectedStock(selected ? selected.available_quantity : 0);
      })
      .catch((err: unknown) => { if ((err as ApiErrorLike).name !== 'AbortError') setSelectedStock(null); });
    return () => controller.abort();
  }, [form.warehouse_id, product.id]);

  const validate = (): string | null => {
    if (!form.warehouse_id) return 'Select a warehouse.';
    const qty = toPositiveNumber(form.quantity);
    if (qty === null) return 'Enter a positive quantity.';
    const unitCost = toFiniteNumber(form.unit_cost, NaN);
    if (!Number.isFinite(unitCost) || unitCost < 0) return 'Unit cost must be a non-negative number.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.transaction_date)) return 'Invalid date format. Use YYYY-MM-DD.';
    if (new Date(form.transaction_date) > new Date()) return 'Transaction date cannot be in the future.';
    if (form.remark.length > 2000) return 'Remark must be 2000 characters or less.';
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validate();
    if (validationError) { showError('Validation', validationError); return; }
    setSubmitting(true);
    try {
      await apiClient.post(`/products/${product.id}/stock-in`, {
        ...form,
        quantity: toPositiveNumber(form.quantity),
        unit_cost: toFiniteNumber(form.unit_cost, 0),
        idempotency_key: idempotencyKey,
      });
      showSuccess('Stock IN successful', `Added ${form.quantity} units.`);
      onSuccess();
      onClose();
    } catch (error: unknown) {
      showError('Stock IN failed', getApiErrorMessage(error));
    } finally { setSubmitting(false); }
  };

  const inputClass =
    'h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10';

  return (
    <Modal onClose={onClose} title="Stock IN" width="max-w-md">
      <div className="space-y-4 p-4 sm:p-6">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Product</label>
          <input type="text" value={product.name} disabled className={`${inputClass} cursor-not-allowed bg-slate-50 text-slate-400`} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Warehouse *</label>
          <div className="relative">
            <select value={form.warehouse_id} onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })}
              className={`${inputClass} appearance-none pr-9`}>
              <option value="">Select warehouse</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          </div>
          {warehouseError && <p className="mt-1 text-xs text-red-500">{warehouseError}</p>}
          {selectedStock !== null && <p className="mt-1 text-xs text-slate-500">Current available: {selectedStock}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Quantity *</label>
            <input type="number" min="0" step="any" inputMode="decimal" value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Unit cost</label>
            <input type="number" min="0" step="0.01" inputMode="decimal" value={form.unit_cost}
              onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} className={inputClass} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Transaction type</label>
          <div className="relative">
            <select value={form.reference_type} onChange={(e) => setForm({ ...form, reference_type: e.target.value })}
              className={`${inputClass} appearance-none pr-9`}>
              <option value="manual">Manual</option>
              <option value="purchase">Purchase</option>
              <option value="return">Return</option>
              <option value="adjustment">Adjustment</option>
              <option value="opening_stock">Opening stock</option>
              <option value="other">Other</option>
            </select>
            <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Reference / bill number</label>
          <input type="text" value={form.reference_id} maxLength={100}
            onChange={(e) => setForm({ ...form, reference_id: e.target.value })} className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Transaction date</label>
          <input type="date" value={form.transaction_date}
            onChange={(e) => setForm({ ...form, transaction_date: e.target.value })} className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Remark</label>
          <textarea value={form.remark} rows={2} maxLength={2000}
            onChange={(e) => setForm({ ...form, remark: e.target.value })}
            className="min-h-[70px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="rounded-xl">Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}
            className="rounded-xl bg-emerald-600 font-semibold hover:bg-emerald-700">
            {submitting ? 'Processing…' : 'Stock IN'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Stock OUT Modal                                                     */
/* ------------------------------------------------------------------ */

const StockOutModal = ({
  product, onClose, onSuccess,
}: {
  product: InventoryItem;
  onClose: () => void;
  onSuccess: () => void;
}) => {
  const [form, setForm] = useState({
    warehouse_id: '',
    quantity: '',
    unit_price: product.sale_price?.toString() || '0',
    reference_type: 'manual',
    reference_id: '',
    transaction_date: new Date().toISOString().slice(0, 10),
    remark: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const { showSuccess, showError } = useNotification();
  const [warehouses, setWarehouses] = useState<Array<{ id: number; name: string }>>([]);
  const [warehouseError, setWarehouseError] = useState('');
  const [availableStock, setAvailableStock] = useState<number | null>(null);
  const [idempotencyKey] = useState<string>(() => {
    try { return crypto.randomUUID(); }
    catch { return `key-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
  });

  useEffect(() => {
    const controller = new AbortController();
    apiClient.get('/warehouses?per_page=all', { signal: controller.signal })
      .then((res) => setWarehouses(extractArray<{ id: number; name: string }>(res.data)))
      .catch((err: unknown) => {
        if ((err as ApiErrorLike).name !== 'AbortError') {
          setWarehouseError(getApiErrorMessage(err, 'Failed to load warehouses.'));
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!form.warehouse_id) { setAvailableStock(null); return; }
    const controller = new AbortController();
    apiClient.get(`/products/${product.id}/warehouse-stock`, { signal: controller.signal })
      .then((res) => {
        const stocks = extractArray<WarehouseStock>(res.data);
        const selected = stocks.find((s) => s.warehouse_id === Number(form.warehouse_id));
        setAvailableStock(selected ? selected.available_quantity : 0);
      })
      .catch((err: unknown) => { if ((err as ApiErrorLike).name !== 'AbortError') setAvailableStock(null); });
    return () => controller.abort();
  }, [form.warehouse_id, product.id]);

  const validate = (): string | null => {
    if (!form.warehouse_id) return 'Select a warehouse.';
    const qty = toPositiveNumber(form.quantity);
    if (qty === null) return 'Enter a positive quantity.';
    const unitPrice = toFiniteNumber(form.unit_price, NaN);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return 'Unit price must be a non-negative number.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.transaction_date)) return 'Invalid date format. Use YYYY-MM-DD.';
    if (new Date(form.transaction_date) > new Date()) return 'Transaction date cannot be in the future.';
    if (availableStock !== null && qty > availableStock) {
      return `Insufficient stock. Available: ${availableStock}, Requested: ${qty}`;
    }
    if (form.remark.length > 2000) return 'Remark must be 2000 characters or less.';
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validate();
    if (validationError) { showError('Validation', validationError); return; }
    setSubmitting(true);
    try {
      await apiClient.post(`/products/${product.id}/stock-out`, {
        ...form,
        quantity: toPositiveNumber(form.quantity),
        unit_price: toFiniteNumber(form.unit_price, 0),
        idempotency_key: idempotencyKey,
      });
      showSuccess('Stock OUT successful', `Removed ${form.quantity} units.`);
      onSuccess();
      onClose();
    } catch (error: unknown) {
      showError('Stock OUT failed', getApiErrorMessage(error));
    } finally { setSubmitting(false); }
  };

  const inputClass =
    'h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10';

  return (
    <Modal onClose={onClose} title="Stock OUT" width="max-w-md">
      <div className="space-y-4 p-4 sm:p-6">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Product</label>
          <input type="text" value={product.name} disabled className={`${inputClass} cursor-not-allowed bg-slate-50 text-slate-400`} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Warehouse *</label>
          <div className="relative">
            <select value={form.warehouse_id} onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })}
              className={`${inputClass} appearance-none pr-9`}>
              <option value="">Select warehouse</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          </div>
          {warehouseError && <p className="mt-1 text-xs text-red-500">{warehouseError}</p>}
          {availableStock !== null && <p className="mt-1 text-xs text-slate-500">Available stock: {availableStock}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Quantity *</label>
            <input type="number" min="0" step="any" inputMode="decimal" value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Unit price</label>
            <input type="number" min="0" step="0.01" inputMode="decimal" value={form.unit_price}
              onChange={(e) => setForm({ ...form, unit_price: e.target.value })} className={inputClass} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Transaction type</label>
          <div className="relative">
            <select value={form.reference_type} onChange={(e) => setForm({ ...form, reference_type: e.target.value })}
              className={`${inputClass} appearance-none pr-9`}>
              <option value="manual">Manual</option>
              <option value="sale">Sale</option>
              <option value="return">Return</option>
              <option value="adjustment">Adjustment</option>
              <option value="transfer">Transfer</option>
              <option value="other">Other</option>
            </select>
            <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Reference / bill number</label>
          <input type="text" value={form.reference_id} maxLength={100}
            onChange={(e) => setForm({ ...form, reference_id: e.target.value })} className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Transaction date</label>
          <input type="date" value={form.transaction_date}
            onChange={(e) => setForm({ ...form, transaction_date: e.target.value })} className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Remark</label>
          <textarea value={form.remark} rows={2} maxLength={2000}
            onChange={(e) => setForm({ ...form, remark: e.target.value })}
            className="min-h-[70px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="rounded-xl">Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}
            className="rounded-xl bg-rose-600 font-semibold hover:bg-rose-700">
            {submitting ? 'Processing…' : 'Stock OUT'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Main Component                                                      */
/* ------------------------------------------------------------------ */

export function InventoryPage() {
  const { showSuccess, showError } = useNotification();

  const { data: companies, refresh: refreshComps } = useApiCache<Company[]>(
    'companies', () => apiClient.getCompanies()
  );

  const { data: branches, refresh: refreshBranches } = useApiCache<Branch[]>(
    'branches', () => apiClient.getBranches()
  );

  const {
    data: warehouses, loading: warehousesLoading,
  } = useApiCache<Warehouse[]>(
    'warehouses',
    async () => extractArray<Warehouse>((await apiClient.get('/warehouses?per_page=all')).data)
  );

  const {
    data: items, loading: itemsLoading, error: itemsError, refresh: refreshItems,
  } = useApiCache<InventoryItem[]>('inventory', () => apiClient.getAllProducts());

  const [searchTerm, setSearchTerm] = useState('');
  const [filterCompany, setFilterCompany] = useState('all');
  const [filterBranch, setFilterBranch] = useState('all');
  const [filterBrand, setFilterBrand] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterWarehouse, setFilterWarehouse] = useState('all');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const [warehouseStockMap, setWarehouseStockMap] = useState<Map<number, WarehouseStock[]>>(new Map());
  const [warehouseStockLoading, setWarehouseStockLoading] = useState(false);
  const loadedWarehouseStockRef = useRef<Set<number>>(new Set());

  const [isViewPanelOpen, setIsViewPanelOpen] = useState(false);
  const [viewingItem, setViewingItem] = useState<InventoryItem | null>(null);
  const [showStockIn, setShowStockIn] = useState(false);
  const [showStockOut, setShowStockOut] = useState(false);

  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<InventoryFormData>({
    company_id: '', branch_id: '', name: '', sku: '', barcode: '', brand: '',
    unit: 'Piece', purchase_price: '', sale_price: '', tax_rate: '',
    stock_quantity: '', reorder_level: '', description: '', active: true,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importStep, setImportStep] = useState<'select' | 'preview' | 'result'>('select');
  const [importLoading, setImportLoading] = useState(false);
  const [duplicateAction, setDuplicateAction] = useState<DuplicateAction>('skip');
  const [importPreview, setImportPreview] = useState<ImportPreviewRow[]>([]);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [importErrors, setImportErrors] = useState<ImportError[]>([]);
  const [importResultMessage, setImportResultMessage] = useState('');
  const [importSuccess, setImportSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(() => readStoredPageSize());

  useEffect(() => { persistPageSize(pageSize); }, [pageSize]);

  const brands = useMemo(() => {
    if (!items) return [];
    const br = new Set<string>();
    items.forEach((i) => { if (i.brand) br.add(i.brand); });
    return Array.from(br).sort();
  }, [items]);

  useEffect(() => {
    if (filterWarehouse === 'all' || !items || items.length === 0) return;
    const pending = items.filter((item) => !loadedWarehouseStockRef.current.has(item.id));
    if (pending.length === 0) return;

    let cancelled = false;
    setWarehouseStockLoading(true);

    (async () => {
      const fetched: Array<[number, WarehouseStock[]]> = [];
      await mapWithConcurrency(pending, WAREHOUSE_STOCK_CONCURRENCY, async (item) => {
        if (cancelled) return;
        try {
          const res = await apiClient.get(`/products/${item.id}/warehouse-stock`);
          fetched.push([item.id, extractArray<WarehouseStock>(res.data)]);
        } catch { fetched.push([item.id, []]); }
      });
      if (cancelled) return;
      fetched.forEach(([id]) => loadedWarehouseStockRef.current.add(id));
      setWarehouseStockMap((prev) => {
        const next = new Map(prev);
        fetched.forEach(([id, stocks]) => next.set(id, stocks));
        return next;
      });
      setWarehouseStockLoading(false);
    })();

    return () => { cancelled = true; };
  }, [filterWarehouse, items]);

  const getWarehouseStockRow = useCallback(
    (productId: number, warehouseId: string): WarehouseStock | null => {
      if (warehouseId === 'all') return null;
      const rows = warehouseStockMap.get(productId);
      if (!rows) return null;
      const wid = Number(warehouseId);
      return rows.find((r) => r.warehouse_id === wid) ?? null;
    },
    [warehouseStockMap]
  );

  const filteredItems = useMemo(() => {
    if (!items) return [];
    let filtered = [...items];
    const term = searchTerm.toLowerCase().trim();
    if (term) {
      filtered = filtered.filter(
        (item) =>
          String(item.name ?? '').toLowerCase().includes(term) ||
          String(item.sku ?? '').toLowerCase().includes(term) ||
          String(item.barcode ?? '').toLowerCase().includes(term) ||
          String(item.brand ?? '').toLowerCase().includes(term) ||
          String(item.description ?? '').toLowerCase().includes(term)
      );
    }
    if (filterCompany !== 'all')
      filtered = filtered.filter((i) => String(i.company_id) === filterCompany);
    if (filterBranch !== 'all')
      filtered = filtered.filter((i) => String(i.branch_id) === filterBranch);
    if (filterBrand !== 'all') filtered = filtered.filter((i) => i.brand === filterBrand);
    if (filterStatus !== 'all') {
      filtered = filtered.filter((item) => {
        const stock = safeNumber(item.stock_quantity);
        const reorder = safeNumber(item.reorder_level);
        const isActive = toBoolean(item.active);
        switch (filterStatus) {
          case 'active': return isActive;
          case 'inactive': return !isActive;
          case 'in_stock': return stock > reorder;
          case 'low': return stock > 0 && stock <= reorder;
          case 'out': return stock <= 0;
          default: return true;
        }
      });
    }
    if (filterWarehouse !== 'all') {
      filtered = filtered.filter((item) => {
        const rows = warehouseStockMap.get(item.id);
        if (!rows) return false;
        const wid = Number(filterWarehouse);
        return rows.some((r) => r.warehouse_id === wid);
      });
    }
    return filtered;
  }, [items, searchTerm, filterCompany, filterBranch, filterBrand, filterStatus, filterWarehouse, warehouseStockMap]);

  const totalItems = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  useEffect(() => { setCurrentPage(1); }, [
    searchTerm, filterCompany, filterBranch, filterBrand, filterStatus, filterWarehouse, pageSize, items,
  ]);
  useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages); }, [currentPage, totalPages]);

  const pageNumbers = useMemo<(number | 'ellipsis')[]>(() => {
    if (totalPages <= MAX_PAGE_BUTTONS + 2) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | 'ellipsis')[] = [1];
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    if (start > 2) pages.push('ellipsis');
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < totalPages - 1) pages.push('ellipsis');
    pages.push(totalPages);
    return pages;
  }, [currentPage, totalPages]);

  const summary = useMemo(() => {
    if (!items) return { total: 0, active: 0, inactive: 0, lowStock: 0, outOfStock: 0, totalUnits: 0, totalValue: 0 };
    const scopedItems: Array<{ qty: number; reorder: number; salePrice: number; active: boolean }> = [];

    if (filterWarehouse === 'all') {
      items.forEach((i) =>
        scopedItems.push({
          qty: safeNumber(i.stock_quantity),
          reorder: safeNumber(i.reorder_level),
          salePrice: safeNumber(i.sale_price),
          active: toBoolean(i.active),
        })
      );
    } else {
      const wid = Number(filterWarehouse);
      items.forEach((i) => {
        const rows = warehouseStockMap.get(i.id);
        if (!rows) return;
        const row = rows.find((r) => r.warehouse_id === wid);
        if (!row) return;
        scopedItems.push({
          qty: safeNumber(row.quantity),
          reorder: safeNumber(i.reorder_level),
          salePrice: safeNumber(i.sale_price),
          active: toBoolean(i.active),
        });
      });
    }

    return {
      total: filterWarehouse === 'all' ? items.length : scopedItems.length,
      active: (filterWarehouse === 'all' ? items.map((i) => toBoolean(i.active)) : scopedItems.map((s) => s.active)).filter(Boolean).length,
      inactive: (filterWarehouse === 'all' ? items.map((i) => toBoolean(i.active)) : scopedItems.map((s) => s.active)).filter((v) => !v).length,
      lowStock: scopedItems.filter((s) => s.qty > 0 && s.qty <= s.reorder).length,
      outOfStock: scopedItems.filter((s) => s.qty <= 0).length,
      totalUnits: scopedItems.reduce((sum, s) => sum + s.qty, 0),
      totalValue: scopedItems.reduce((sum, s) => sum + s.salePrice * s.qty, 0),
    };
  }, [items, filterWarehouse, warehouseStockMap]);

  const activeFilterCount = [
    filterCompany !== 'all' ? filterCompany : undefined,
    filterBranch !== 'all' ? filterBranch : undefined,
    filterBrand !== 'all' ? filterBrand : undefined,
    filterStatus !== 'all' ? filterStatus : undefined,
    filterWarehouse !== 'all' ? filterWarehouse : undefined,
  ].filter(Boolean).length;

  const clearFilters = useCallback(() => {
    setSearchTerm(''); setFilterCompany('all'); setFilterBranch('all');
    setFilterBrand('all'); setFilterStatus('all'); setFilterWarehouse('all');
  }, []);

  const filteredBranchesForm = useMemo(() => {
    if (formData.company_id && branches) {
      const companyId = String(formData.company_id);
      return branches.filter((b) => String(b.company_id) === companyId);
    }
    return [];
  }, [formData.company_id, branches]);

  const filteredBranchesFilter = useMemo(() => {
    if (filterCompany !== 'all' && branches) {
      return branches.filter((b) => String(b.company_id) === filterCompany);
    }
    return branches || [];
  }, [filterCompany, branches]);

  const filteredWarehousesFilter = useMemo(() => {
    if (!warehouses) return [];
    let list = warehouses;
    if (filterCompany !== 'all') {
      list = list.filter((w) => w.company_id == null || String(w.company_id) === filterCompany);
    }
    if (filterBranch !== 'all') {
      list = list.filter((w) => w.branch_id == null || String(w.branch_id) === filterBranch);
    }
    return list;
  }, [warehouses, filterCompany, filterBranch]);

  const allSelected = useMemo(
    () => paginatedItems.length > 0 && paginatedItems.every((i) => selectedIds.includes(i.id)),
    [paginatedItems, selectedIds]
  );
  const someSelected = useMemo(
    () => !allSelected && paginatedItems.some((i) => selectedIds.includes(i.id)),
    [allSelected, paginatedItems, selectedIds]
  );

  const toggleSelectAll = useCallback(() => {
    const ids = paginatedItems.map((i) => i.id);
    if (!ids.length) return;
    if (allSelected) setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
    else setSelectedIds((current) => Array.from(new Set([...current, ...ids])));
  }, [allSelected, paginatedItems]);

  const toggleSelected = useCallback((id: number) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((v) => v !== id) : [...current, id]);
  }, []);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Delete ${selectedIds.length} item(s)? This cannot be undone.`)) return;
    try {
      const results = await Promise.allSettled(selectedIds.map((id) => apiClient.deleteProduct(id)));
      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed === 0) showSuccess('Bulk delete', `${succeeded} item(s) deleted.`);
      else showError('Bulk delete', `${succeeded} deleted, ${failed} failed. Please check server logs.`);
      setSelectedIds([]);
      refreshItems();
    } catch (error: unknown) { showError('Bulk delete failed', getApiErrorMessage(error)); }
  }, [selectedIds, refreshItems, showSuccess, showError]);

  const handleBulkStatusChange = useCallback(
    async (active: boolean) => {
      if (selectedIds.length === 0) return;
      const label = active ? 'activate' : 'deactivate';
      if (!window.confirm(`Are you sure you want to ${label} ${selectedIds.length} item(s)?`)) return;
      try {
        const results = await Promise.allSettled(
          selectedIds.map((id) => apiClient.updateProduct(id, { active } as Record<string, unknown>))
        );
        const succeeded = results.filter((r) => r.status === 'fulfilled').length;
        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed === 0) showSuccess('Bulk update', `${succeeded} item(s) ${label}d.`);
        else showError('Bulk update', `${succeeded} ${label}d, ${failed} failed.`);
        setSelectedIds([]);
        refreshItems();
      } catch (error: unknown) { showError('Bulk update failed', getApiErrorMessage(error)); }
    },
    [selectedIds, refreshItems, showSuccess, showError]
  );

  const handleBulkUpdateStock = useCallback(
    async (_quantity: number) => {
      showError('Disabled', 'Direct bulk stock overwrite is not allowed. Use Stock IN/OUT or a proper stock adjustment flow.');
    },
    [showError]
  );

  const handleView = useCallback((item: InventoryItem) => {
    setViewingItem(item); setIsViewPanelOpen(true);
  }, []);

  const handleCreate = useCallback(() => {
    setEditingId(null);
    setFormData({
      company_id: '', branch_id: '', name: '', sku: '', barcode: '', brand: '',
      unit: 'Piece', purchase_price: '', sale_price: '', tax_rate: '',
      stock_quantity: '', reorder_level: '', description: '', active: true,
    });
    setFormErrors({});
    setIsPanelOpen(true);
  }, []);

  const handleEdit = useCallback((item: InventoryItem) => {
    setEditingId(item.id);
    setFormData({
      company_id: item.company_id || '', branch_id: item.branch_id ?? '',
      name: item.name || '', sku: item.sku || '', barcode: item.barcode || '',
      brand: item.brand || '', unit: item.unit || 'Piece',
      purchase_price: item.purchase_price ?? '', sale_price: item.sale_price ?? '',
      tax_rate: item.tax_rate ?? '', stock_quantity: item.stock_quantity ?? '',
      reorder_level: item.reorder_level ?? '', description: item.description || '',
      active: toBoolean(item.active),
    });
    setFormErrors({});
    setIsPanelOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (item: InventoryItem) => {
      if (!window.confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
      try {
        await apiClient.deleteProduct(item.id);
        showSuccess('Item deleted', `"${item.name}" removed.`);
        safeLog({ module: 'Inventory', action: 'Delete', status: 'success', message: `Deleted ${item.name}` });
        refreshItems();
      } catch (error: unknown) { showError('Delete failed', getApiErrorMessage(error)); }
    },
    [refreshItems, showSuccess, showError]
  );

  const validateForm = useCallback((): boolean => {
    const errors: Record<string, string> = {};
    let valid = true;

    const companyId = Number(formData.company_id);
    if (!Number.isInteger(companyId) || companyId <= 0) { errors.company_id = 'Select a company.'; valid = false; }

    const branchId = formData.branch_id ? Number(formData.branch_id) : null;
    if (branchId !== null) {
      if (!Number.isInteger(branchId) || branchId <= 0) { errors.branch_id = 'Invalid branch.'; valid = false; }
      else if (branches) {
        const branch = branches.find((b) => b.id === branchId);
        if (!branch || branch.company_id !== companyId) {
          errors.branch_id = 'Branch does not belong to the selected company.'; valid = false;
        }
      }
    }

    const name = formData.name.trim();
    if (!name) { errors.name = 'Name is required.'; valid = false; }
    else if (name.length > 255) { errors.name = 'Name must be 255 characters or less.'; valid = false; }

    const sku = formData.sku.trim();
    if (!sku) { errors.sku = 'SKU is required.'; valid = false; }
    else if (sku.length > 100) { errors.sku = 'SKU must be 100 characters or less.'; valid = false; }

    if (formData.barcode && formData.barcode.length > 100) { errors.barcode = 'Barcode must be 100 characters or less.'; valid = false; }
    if (formData.brand && formData.brand.length > 150) { errors.brand = 'Brand must be 150 characters or less.'; valid = false; }
    if (formData.description && formData.description.length > 5000) { errors.description = 'Description must be 5000 characters or less.'; valid = false; }

    const purchasePrice = toFiniteNumber(formData.purchase_price, NaN);
    if (!Number.isFinite(purchasePrice) || purchasePrice < 0) { errors.purchase_price = 'Purchase price must be a non-negative number.'; valid = false; }
    const salePrice = toFiniteNumber(formData.sale_price, NaN);
    if (!Number.isFinite(salePrice) || salePrice < 0) { errors.sale_price = 'Sale price must be a non-negative number.'; valid = false; }
    const taxRate = toFiniteNumber(formData.tax_rate, NaN);
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) { errors.tax_rate = 'Tax rate must be between 0 and 100.'; valid = false; }
    const stockQuantity = toFiniteNumber(formData.stock_quantity, NaN);
    if (!Number.isFinite(stockQuantity) || stockQuantity < 0) { errors.stock_quantity = 'Stock quantity must be a non-negative number.'; valid = false; }
    const reorderLevel = toFiniteNumber(formData.reorder_level, NaN);
    if (!Number.isFinite(reorderLevel) || reorderLevel < 0) { errors.reorder_level = 'Reorder level must be a non-negative number.'; valid = false; }

    setFormErrors(errors);
    if (!valid) showError('Validation', 'Please fix the highlighted fields.');
    return valid;
  }, [formData, branches, showError]);

  const handleSubmit = useCallback(async () => {
    if (!validateForm()) return;

    const payload = {
      company_id: Number(formData.company_id),
      branch_id: formData.branch_id ? Number(formData.branch_id) : null,
      name: formData.name.trim(),
      sku: formData.sku.trim(),
      barcode: formData.barcode.trim() || null,
      brand: formData.brand.trim() || null,
      unit: formData.unit,
      purchase_price: toFiniteNumber(formData.purchase_price, 0),
      sale_price: toFiniteNumber(formData.sale_price, 0),
      tax_rate: toFiniteNumber(formData.tax_rate, 0),
      stock_quantity: toFiniteNumber(formData.stock_quantity, 0),
      reorder_level: toFiniteNumber(formData.reorder_level, 0),
      description: formData.description.trim() || null,
      active: formData.active,
    };

    setSubmitting(true);
    try {
      if (editingId) {
        await apiClient.updateProduct(editingId, payload);
        showSuccess('Item updated', `"${payload.name}" updated.`);
        safeLog({ module: 'Inventory', action: 'Update', status: 'success', message: `Updated ${payload.name}` });
      } else {
        await apiClient.createProduct(payload);
        showSuccess('Item created', `"${payload.name}" created.`);
        safeLog({ module: 'Inventory', action: 'Create', status: 'success', message: `Created ${payload.name}` });
      }
      setIsPanelOpen(false);
      refreshItems(); refreshComps(); refreshBranches();
    } catch (error: unknown) {
      const msg = getApiErrorMessage(error);
      showError('Save failed', msg);
      safeLog({ module: 'Inventory', action: 'Save', status: 'error', message: msg });
    } finally { setSubmitting(false); }
  }, [formData, editingId, validateForm, refreshItems, refreshComps, refreshBranches, showSuccess, showError]);

  const handleExport = useCallback(
    async (mode: 'current' | 'selected' | 'all') => {
      try {
        let params: Record<string, unknown> = {};
        if (mode === 'current') {
          params = {
            search: searchTerm || undefined,
            company_id: filterCompany !== 'all' ? filterCompany : undefined,
            branch_id: filterBranch !== 'all' ? filterBranch : undefined,
            brand: filterBrand !== 'all' ? filterBrand : undefined,
            status: filterStatus !== 'all' ? filterStatus : undefined,
            warehouse_id: filterWarehouse !== 'all' ? filterWarehouse : undefined,
          };
        } else if (mode === 'selected') {
          if (selectedIds.length === 0) { showError('Export', 'No items selected.'); return; }
          params.selected_ids = selectedIds;
        }
        const blob = await apiClient.exportInventory(params);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link); link.click(); link.remove();
        URL.revokeObjectURL(url);
        showSuccess('Export', 'Inventory exported successfully.');
        safeLog({ module: 'Inventory', action: 'Export', status: 'success', message: `Exported ${mode} view` });
      } catch (error: unknown) {
        const msg = getApiErrorMessage(error);
        showError('Export failed', msg);
        safeLog({ module: 'Inventory', action: 'Export', status: 'error', message: msg });
      }
      setExportMenuOpen(false);
    },
    [searchTerm, filterCompany, filterBranch, filterBrand, filterStatus, filterWarehouse, selectedIds, showSuccess, showError]
  );

  const handleImportOpen = useCallback(() => {
    setIsImportOpen(true);
    setImportStep('select'); setImportFile(null); setImportPreview([]);
    setImportSummary(null); setImportErrors([]);
    setImportResultMessage(''); setImportSuccess(false); setDragOver(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handlePreview = useCallback(
    async (file: File) => {
      setImportLoading(true);
      try {
        const response = await apiClient.importInventory(file, duplicateAction, true);
        const preview = Array.isArray(response?.preview) ? (response.preview as ImportPreviewRow[]) : [];
        const errors = Array.isArray(response?.errors) ? (response.errors as ImportError[]) : [];
        setImportPreview(preview);
        setImportSummary({
          total: response?.total ?? preview.length,
          valid: response?.valid ?? 0,
          invalid: response?.invalid ?? preview.length,
        });
        setImportErrors(errors);
        setImportStep('preview');
      } catch (error: unknown) {
        showError('Preview failed', getApiErrorMessage(error));
        setImportStep('select');
      } finally { setImportLoading(false); }
    },
    [duplicateAction, showError]
  );

  const handleFileChange = useCallback(
    (file: File | null) => {
      if (!file) return;
      const validTypes = ['text/csv', 'application/vnd.ms-excel'];
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!validTypes.includes(file.type) && ext !== 'csv') {
        showError('Invalid file', 'Please select a CSV file.'); return;
      }
      if (file.size > MAX_UPLOAD_BYTES) { showError('File too large', 'Maximum size is 10MB.'); return; }
      setImportFile(file);
      void handlePreview(file);
    },
    [handlePreview, showError]
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault(); setDragOver(false);
      const files = e.dataTransfer.files;
      if (files.length) handleFileChange(files[0]);
    },
    [handleFileChange]
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragOver(true); }, []);
  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragOver(false); }, []);

  const handleImport = useCallback(async () => {
    if (!importFile) return;
    const allowed: DuplicateAction[] = ['skip', 'update', 'stop'];
    const safeAction = allowed.includes(duplicateAction) ? duplicateAction : 'skip';
    setImportLoading(true);
    try {
      const response = await apiClient.importInventory(importFile, safeAction, false);
      setImportSummary((response?.summary as ImportSummary) ?? null);
      setImportErrors(Array.isArray(response?.errors) ? (response.errors as ImportError[]) : []);
      setImportResultMessage(response?.message ?? '');
      setImportSuccess(Boolean(response?.success));
      setImportStep('result');
      if (response?.success) {
        showSuccess('Import completed', response.message);
        refreshItems();
        safeLog({ module: 'Inventory', action: 'Import', status: 'success', message: `Imported ${response.summary?.created ?? 0} items` });
      } else {
        showError('Import failed', response?.message || 'Please check errors.');
        safeLog({ module: 'Inventory', action: 'Import', status: 'error', message: response?.message });
      }
    } catch (error: unknown) {
      const msg = getApiErrorMessage(error);
      showError('Import failed', msg);
      setImportStep('preview');
      safeLog({ module: 'Inventory', action: 'Import', status: 'error', message: msg });
    } finally { setImportLoading(false); }
  }, [importFile, duplicateAction, refreshItems, showSuccess, showError]);

  const handleDownloadTemplate = useCallback(async () => {
    try {
      const blob = await apiClient.downloadTemplate();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = 'inventory_template.csv';
      document.body.appendChild(link); link.click(); link.remove();
      URL.revokeObjectURL(url);
      showSuccess('Template downloaded', 'Ready for import.');
    } catch (error: unknown) {
      showError('Template download failed', getApiErrorMessage(error));
    }
  }, [showSuccess, showError]);

  const handleDownloadErrorReport = useCallback(() => {
    if (importErrors.length === 0) return;
    const headers = ['Row', 'Field', 'Error'];
    const rows = importErrors.map((e) => [e.row, e.field, e.message]);
    const csvContent = [headers, ...rows].map((row) => row.map((cell) => csvEscape(cell)).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'import_errors.csv';
    document.body.appendChild(link); link.click(); link.remove();
    URL.revokeObjectURL(url);
  }, [importErrors]);

  const renderField = useCallback(
    (
      label: string,
      field: keyof InventoryFormData,
      type: 'text' | 'number' | 'select' | 'textarea' = 'text',
      options?: Array<{ id: string | number; name: string }>,
      required = false
    ) => {
      const value = (formData as unknown as Record<string, unknown>)[field] ?? '';
      const id = `field-${field}`;
      const errorMsg = formErrors[field];
      const baseInput = 'h-10 w-full min-w-0 rounded-xl border bg-white px-3.5 text-sm shadow-sm outline-none transition';
      const stateClass = errorMsg
        ? 'border-rose-300 ring-2 ring-rose-200'
        : 'border-slate-200 text-slate-700 hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10';

      return (
        <div className="min-w-0">
          <label htmlFor={id} className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            {label} {required && <span className="text-rose-500">*</span>}
          </label>
          {type === 'select' ? (
            <div className="relative min-w-0">
              <select id={id} value={value as string}
                onChange={(e) => setFormData((prev) => ({ ...prev, [field]: e.target.value }))}
                className={`${baseInput} ${stateClass} appearance-none pr-9`}
                aria-invalid={!!errorMsg}>
                <option value="">Select {label}</option>
                {options?.map((opt) => <option key={opt.id} value={opt.id}>{opt.name}</option>)}
              </select>
              <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            </div>
          ) : type === 'textarea' ? (
            <textarea id={id} value={value as string}
              onChange={(e) => setFormData((prev) => ({ ...prev, [field]: e.target.value }))}
              rows={3} maxLength={5000}
              className={`${baseInput} min-h-[80px] resize-y py-2.5 ${stateClass}`}
              placeholder={`Enter ${label}`} aria-invalid={!!errorMsg} />
          ) : (
            <input id={id} type={type} value={value as string | number}
              onChange={(e) => setFormData((prev) => ({ ...prev, [field]: e.target.value }))}
              className={`${baseInput} ${stateClass}`}
              placeholder={`Enter ${label}`}
              step={type === 'number' ? '0.01' : undefined}
              inputMode={type === 'number' ? 'decimal' : undefined}
              aria-invalid={!!errorMsg} />
          )}
          {errorMsg && <p className="mt-1 text-[11px] text-rose-600">{errorMsg}</p>}
        </div>
      );
    },
    [formData, formErrors]
  );

  const isLoading = itemsLoading;
  const isWarehouseScoped = filterWarehouse !== 'all';
  const stockColumnLabel = isWarehouseScoped ? 'Warehouse Stock' : 'Total Stock';

  if (itemsError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-600">
            <FiAlertCircle size={24} />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">Failed to load inventory</h2>
          <p className="mt-1.5 text-sm text-slate-500">{itemsError}</p>
          <Button onClick={refreshItems} className="mt-5 rounded-xl bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800">
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }

        .inventory-offcanvas-wide {
          width: min(1080px, 96vw) !important;
          max-width: min(1080px, 96vw) !important;
        }
        @media (max-width: 640px) {
          .inventory-offcanvas-wide { width: 100vw !important; max-width: 100vw !important; }
        }

        .inventory-offcanvas-wide .inventory-form-scroll {
          overflow-y: auto; overflow-x: hidden; min-height: 0;
          flex: 1 1 auto; max-height: calc(100vh - 180px);
          scrollbar-width: thin; scrollbar-color: #cbd5e1 transparent;
        }
        .inventory-offcanvas-wide .inventory-form-scroll::-webkit-scrollbar { width: 8px; }
        .inventory-offcanvas-wide .inventory-form-scroll::-webkit-scrollbar-track { background: transparent; }
        .inventory-offcanvas-wide .inventory-form-scroll::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 8px; }
        .inventory-offcanvas-wide .inventory-form-scroll::-webkit-scrollbar-thumb:hover { background-color: #94a3b8; }
      `}</style>

      <div className="min-h-full bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100/60">
        <div className="mx-auto w-full max-w-[1900px] space-y-4 p-3 sm:space-y-5 sm:p-4 lg:space-y-6 lg:p-6">
          {/* Hero */}
          <section className="relative overflow-hidden rounded-2xl border border-slate-800/10 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-4 py-5 shadow-[0_20px_40px_-20px_rgba(15,23,42,0.45)] sm:px-7 sm:py-6 lg:px-8">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />

            <div className="relative flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200 backdrop-blur">
                  <FiPackage size={12} /> Inventory · Products
                </div>
                <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl lg:text-[32px]">Inventory workspace</h1>
                <p className="mt-1.5 max-w-2xl text-xs text-slate-300 sm:text-sm">
                  Track products, stock levels, pricing, and reorder points across your network.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={handleImportOpen}
                  className="h-9 rounded-xl border-white/10 bg-white/5 text-white shadow-none backdrop-blur transition hover:border-white/20 hover:bg-white/10 hover:text-white sm:h-10">
                  <FiUpload className="mr-1.5 sm:mr-2" size={14} /> Import
                </Button>
                <div className="relative">
                  <Button variant="outline" onClick={() => setExportMenuOpen((v) => !v)}
                    className="h-9 rounded-xl border-white/10 bg-white/5 text-white shadow-none backdrop-blur transition hover:border-white/20 hover:bg-white/10 hover:text-white sm:h-10">
                    <FiDownload className="mr-1.5 sm:mr-2" size={14} /> Export
                    <FiChevronDown className="ml-1.5" size={12} />
                  </Button>
                  {exportMenuOpen && (
                    <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl shadow-slate-900/10">
                      <button type="button" onClick={() => handleExport('current')}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50">
                        <FiDownload size={14} className="text-slate-400" /> Export current view
                      </button>
                      <button type="button" onClick={() => handleExport('selected')} disabled={selectedIds.length === 0}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
                        <FiDownload size={14} className="text-slate-400" /> Export selected ({selectedIds.length})
                      </button>
                      <button type="button" onClick={() => handleExport('all')}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50">
                        <FiDownload size={14} className="text-slate-400" /> Export all
                      </button>
                    </div>
                  )}
                </div>
                <Button onClick={handleCreate}
                  className="h-9 rounded-xl bg-gradient-to-b from-cyan-300 to-cyan-400 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:from-cyan-200 hover:to-cyan-300 sm:h-10">
                  <FiPlus className="mr-1.5 sm:mr-2" size={14} /> Add item
                </Button>
              </div>
            </div>
          </section>

          {/* KPI */}
          <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 md:gap-4 xl:grid-cols-6">
            {items ? (
              <>
                <StatCard icon={FiBox} label="Total items" value={summary.total} accent="indigo" />
                <StatCard icon={FiCheckCircle} label="Active" value={summary.active} accent="emerald" />
                <StatCard icon={FiXCircle} label="Inactive" value={summary.inactive} accent="rose" />
                <StatCard icon={FiAlertCircle} label="Low stock" value={summary.lowStock} accent="amber" />
                <StatCard icon={FiTruck} label="Out of stock" value={summary.outOfStock} accent="violet" />
                <StatCard icon={FiDollarSign}
                  label={isWarehouseScoped ? 'Warehouse value' : 'Total value (est.)'}
                  value={`₹${summary.totalValue.toFixed(2)}`} accent="teal" />
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
                      : 'Refine inventory by company, branch, brand, warehouse or status'}
                  </CardDescription>
                </div>
              </div>
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" className="h-9 rounded-lg text-slate-500 hover:text-slate-800" onClick={clearFilters}>
                  <FiX className="mr-1.5" size={14} /> Reset
                </Button>
              )}
            </CardHeader>

            <CardContent className="bg-white p-4 sm:p-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
                <div className="relative sm:col-span-2 lg:col-span-3">
                  <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-10 rounded-xl border-slate-200 pl-3.5 shadow-sm focus-visible:ring-4 focus-visible:ring-indigo-500/10"
                    placeholder="Search name, SKU, barcode, brand…"
                    autoComplete="off" spellCheck={false} maxLength={200} />
                </div>

                <div className="lg:col-span-2">
                  <div className="relative">
                    <select aria-label="Company" value={filterCompany}
                      onChange={(e) => { setFilterCompany(e.target.value); setFilterBranch('all'); setFilterWarehouse('all'); }}
                      className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10">
                      <option value="all">All companies</option>
                      {companies?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  </div>
                </div>

                <div className="lg:col-span-2">
                  <div className="relative">
                    <select aria-label="Branch" value={filterBranch}
                      onChange={(e) => { setFilterBranch(e.target.value); setFilterWarehouse('all'); }}
                      className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10">
                      <option value="all">All branches</option>
                      {filteredBranchesFilter.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  </div>
                </div>

                <div className="lg:col-span-2">
                  <div className="relative">
                    <select aria-label="Warehouse" value={filterWarehouse}
                      onChange={(e) => setFilterWarehouse(e.target.value)}
                      className={`h-10 w-full appearance-none rounded-xl border bg-white px-3.5 pr-9 text-sm font-medium shadow-sm outline-none transition ${
                        filterWarehouse !== 'all'
                          ? 'border-indigo-400 text-indigo-700 ring-4 ring-indigo-500/10'
                          : 'border-slate-200 text-slate-700 hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10'
                      }`}>
                      <option value="all">All warehouses</option>
                      {warehousesLoading && <option value="" disabled>Loading warehouses…</option>}
                      {filteredWarehousesFilter.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                    <MdWarehouse
                      className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 ${filterWarehouse !== 'all' ? 'text-indigo-500' : 'text-slate-400'}`}
                      size={14} />
                  </div>
                </div>

                <div className="lg:col-span-1">
                  <div className="relative">
                    <select aria-label="Brand" value={filterBrand}
                      onChange={(e) => setFilterBrand(e.target.value)}
                      className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10">
                      <option value="all">Brand</option>
                      {brands.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                    <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  </div>
                </div>

                <div className="lg:col-span-2">
                  <div className="relative">
                    <select aria-label="Status" value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10">
                      {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  </div>
                </div>
              </div>

              {isWarehouseScoped && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/60 px-3 py-2 text-xs text-indigo-800">
                  <MdWarehouse size={14} />
                  <span className="font-semibold">Warehouse view:</span>
                  <span>{filteredWarehousesFilter.find((w) => String(w.id) === filterWarehouse)?.name || `#${filterWarehouse}`}</span>
                  <span className="hidden text-indigo-500/80 sm:inline">
                    · Stock numbers now come from{' '}
                    <code className="rounded bg-white/60 px-1 py-0.5 font-mono">product_warehouse_stocks</code>
                  </span>
                  {warehouseStockLoading && (
                    <span className="ml-1 inline-flex items-center gap-1 text-indigo-600">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-500" />
                      loading…
                    </span>
                  )}
                  <button type="button" onClick={() => setFilterWarehouse('all')}
                    className="ml-auto inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[11px] font-semibold text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-100">
                    <FiX size={11} /> Clear
                  </button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Bulk toolbar */}
          {selectedIds.length > 0 && (
            <div className="sticky top-2 z-30 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-lg shadow-slate-900/5 backdrop-blur sm:top-3">
              <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4">
                <div className="mr-1 flex items-center gap-2 rounded-lg bg-indigo-50 px-2.5 py-1 text-indigo-700 ring-1 ring-indigo-500/10">
                  <span className="text-sm font-bold">{selectedIds.length}</span>
                  <span className="text-xs font-medium">selected</span>
                </div>
                <Button size="sm" variant="outline" className="hidden h-9 rounded-lg sm:inline-flex"
                  onClick={() => {
                    const qty = window.prompt('Enter new stock quantity:');
                    if (qty !== null && !isNaN(Number(qty)) && Number(qty) >= 0) handleBulkUpdateStock(Number(qty));
                  }}>
                  <FiEdit className="mr-1.5 text-indigo-600" size={14} /> Update stock
                </Button>
                <Button size="sm" variant="outline" className="h-9 rounded-lg" onClick={() => handleBulkStatusChange(true)}>
                  <FiCheckCircle className="mr-1.5 text-emerald-600" size={14} /> Activate
                </Button>
                <Button size="sm" variant="outline" className="h-9 rounded-lg" onClick={() => handleBulkStatusChange(false)}>
                  <FiXCircle className="mr-1.5 text-amber-600" size={14} /> Deactivate
                </Button>
                <Button size="sm"
                  className="h-9 rounded-lg border border-red-600 bg-red-600 font-semibold text-white shadow-none hover:border-red-700 hover:bg-red-700"
                  onClick={handleBulkDelete}>
                  <FiTrash2 className="mr-1.5" size={14} /> Delete
                </Button>
                <Button size="sm" variant="ghost" className="ml-auto h-9 rounded-lg text-slate-500 hover:text-slate-800" onClick={() => setSelectedIds([])}>
                  Clear
                </Button>
              </div>
            </div>
          )}

          {/* Table */}
          <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <CardHeader className="flex flex-col gap-2 border-b border-slate-100 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600">
                  {isWarehouseScoped ? <MdWarehouse size={14} /> : <FiPackage size={14} />}
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-800">
                    {isWarehouseScoped ? 'Warehouse inventory' : 'Inventory items'}
                  </CardTitle>
                  <CardDescription className="text-[11px] text-slate-500">
                    {isLoading
                      ? 'Loading inventory…'
                      : `${totalItems.toLocaleString('en-IN')} record${totalItems === 1 ? '' : 's'}${isWarehouseScoped ? ' · scoped to selected warehouse' : ' · Click a row to view details'}`}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <div className="overflow-x-auto">
              <Table className="min-w-[1000px]">
                <TableHeader>
                  <TableRow className="border-slate-100 bg-slate-50/70 hover:bg-slate-50/70">
                    <TableHead className="w-11 px-3">
                      <input aria-label="Select all on this page" type="checkbox" checked={allSelected}
                        ref={(el) => { if (el) el.indeterminate = someSelected; }}
                        onChange={(event) => { event.stopPropagation(); toggleSelectAll(); }}
                        onClick={(event) => event.stopPropagation()}
                        className="h-4 w-4 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/30" />
                    </TableHead>
                    <TableHead><TableHeadLabel>Item</TableHeadLabel></TableHead>
                    <TableHead><TableHeadLabel>SKU</TableHeadLabel></TableHead>
                    <TableHead><TableHeadLabel>Brand</TableHeadLabel></TableHead>
                    <TableHead className="text-right"><TableHeadLabel align="right">{stockColumnLabel}</TableHeadLabel></TableHead>
                    <TableHead className="text-right"><TableHeadLabel align="right">Sale price</TableHeadLabel></TableHead>
                    <TableHead><TableHeadLabel>Status</TableHeadLabel></TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {isLoading && Array.from({ length: 8 }).map((_, index) => (
                    <TableRow key={`skeleton-${index}`} className="border-slate-100">
                      {Array.from({ length: TABLE_COLUMN_COUNT }).map((__, cellIndex) => (
                        <TableCell key={cellIndex}><div className="h-4 animate-pulse rounded bg-slate-100" /></TableCell>
                      ))}
                    </TableRow>
                  ))}

                  {!isLoading && paginatedItems.map((item) => {
                    const selected = selectedIds.includes(item.id);
                    const unitLabel = (item.unit || 'pcs').toString();
                    const reorder = safeNumber(item.reorder_level);

                    let displayQty: number;
                    let isPending = false;
                    let subLabel: string | null = null;

                    if (isWarehouseScoped) {
                      const rows = warehouseStockMap.get(item.id);
                      if (!rows) { isPending = warehouseStockLoading; displayQty = 0; }
                      else {
                        const row = getWarehouseStockRow(item.id, filterWarehouse);
                        displayQty = row ? safeNumber(row.quantity) : 0;
                        if (row && safeNumber(row.reserved_quantity) > 0) subLabel = `${safeNumber(row.reserved_quantity)} reserved`;
                      }
                    } else {
                      displayQty = safeNumber(item.stock_quantity);
                    }

                    const stockClass =
                      displayQty <= 0
                        ? 'bg-rose-50 text-rose-600 ring-1 ring-rose-200/60'
                        : displayQty <= reorder
                          ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/60'
                          : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60';

                    return (
                      <TableRow key={item.id} data-state={selected ? 'selected' : undefined}
                        className={`cursor-pointer border-slate-100 transition-colors hover:bg-slate-50/70 ${selected ? 'bg-indigo-50/40 hover:bg-indigo-50/60' : ''}`}
                        onClick={() => handleView(item)}>
                        <TableCell className="px-3" onClick={(e) => e.stopPropagation()}>
                          <input aria-label={`Select ${item.name}`} type="checkbox" checked={selected}
                            onChange={(event) => { event.stopPropagation(); toggleSelected(item.id); }}
                            onClick={(event) => event.stopPropagation()}
                            className="h-4 w-4 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/30" />
                        </TableCell>

                        <TableCell>
                          <div className="flex min-w-[200px] items-center gap-2.5">
                            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[11px] font-bold text-white">
                              {String(item.name ?? 'P').charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{item.name}</p>
                              {item.barcode && <p className="truncate font-mono text-[11px] text-slate-500">{item.barcode}</p>}
                            </div>
                          </div>
                        </TableCell>

                        <TableCell>
                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 font-mono text-[11px] text-slate-700">
                            {item.sku || '—'}
                          </span>
                        </TableCell>

                        <TableCell><span className="text-sm text-slate-700">{item.brand || '—'}</span></TableCell>

                        <TableCell className="whitespace-nowrap text-right">
                          <div className="inline-flex flex-col items-end gap-0.5">
                            {isPending ? (
                              <span className="inline-flex h-7 w-20 animate-pulse items-center justify-end rounded-lg bg-slate-100 px-2 text-[11px] text-slate-400">…</span>
                            ) : (
                              <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold tabular-nums ${stockClass}`}
                                title={displayQty <= 0 ? 'Out of stock' : displayQty <= reorder ? `Low stock (reorder at ${reorder})` : `In stock (reorder at ${reorder})`}>
                                <span>{displayQty.toLocaleString('en-IN')}</span>
                                <span className="text-[10px] font-medium uppercase opacity-70">{unitLabel}</span>
                              </span>
                            )}
                            {subLabel ? (
                              <span className="text-[10px] text-slate-500">{subLabel}</span>
                            ) : (
                              !isPending && reorder > 0 && (
                                <span className="text-[10px] text-slate-400">reorder @ {reorder.toLocaleString('en-IN')}</span>
                              )
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="whitespace-nowrap text-right text-sm font-semibold tabular-nums text-slate-900">
                          {safeCurrency(item.sale_price)}
                        </TableCell>

                        <TableCell>
                          <Badge variant="outline"
                            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                              toBoolean(item.active)
                                ? 'border-emerald-200/70 bg-emerald-50 text-emerald-700'
                                : 'border-red-200/70 bg-red-50 text-red-700'
                            }`}>
                            {toBoolean(item.active) ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>

                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <ActionDropdown item={item} onView={handleView} onEdit={handleEdit} onDelete={handleDelete} />
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {!isLoading && !totalItems && (
                    <TableRow>
                      <TableCell colSpan={TABLE_COLUMN_COUNT} className="py-16 text-center">
                        <div className="mx-auto max-w-md px-4">
                          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-slate-200/70">
                            {isWarehouseScoped ? <MdWarehouse className="h-6 w-6 text-slate-400" /> : <FiFilter className="h-6 w-6 text-slate-400" />}
                          </div>
                          <p className="mt-4 text-base font-semibold text-slate-800">
                            {isWarehouseScoped ? 'No products in this warehouse' : 'No items found'}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            {isWarehouseScoped
                              ? 'No products have a stock row in this warehouse yet. Use Stock IN to add some.'
                              : 'Try adjusting the company, branch, brand, status, or search term.'}
                          </p>
                          <Button className="mt-5 rounded-lg" variant="outline" onClick={clearFilters}>
                            <FiFilter className="mr-2" size={14} /> Reset filters
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {!isLoading && totalItems > 0 && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                totalItems={totalItems}
                pageNumbers={pageNumbers}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
              />
            )}
          </Card>
        </div>
      </div>

      {/* Modals & offcanvas */}
      {isViewPanelOpen && viewingItem && (
        <ProductDetailModal
          product={viewingItem}
          onClose={() => setIsViewPanelOpen(false)}
          onEdit={(item) => { setIsViewPanelOpen(false); handleEdit(item); }}
          onStockIn={(item) => { setIsViewPanelOpen(false); setViewingItem(item); setShowStockIn(true); }}
          onStockOut={(item) => { setIsViewPanelOpen(false); setViewingItem(item); setShowStockOut(true); }}
        />
      )}

      {showStockIn && viewingItem && (
        <StockInModal product={viewingItem}
          onClose={() => setShowStockIn(false)}
          onSuccess={() => {
            refreshItems();
            loadedWarehouseStockRef.current.clear();
            setWarehouseStockMap(new Map());
          }} />
      )}
      {showStockOut && viewingItem && (
        <StockOutModal product={viewingItem}
          onClose={() => setShowStockOut(false)}
          onSuccess={() => {
            refreshItems();
            loadedWarehouseStockRef.current.clear();
            setWarehouseStockMap(new Map());
          }} />
      )}

      {isPanelOpen && (
        <Suspense fallback={
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm">
            <div className="rounded-2xl bg-white p-8 text-sm text-slate-600 shadow-xl">Loading form…</div>
          </div>
        }>
          <Offcanvas
            isOpen={isPanelOpen}
            title={editingId ? 'Edit item' : 'Add item'}
            onClose={() => setIsPanelOpen(false)}
            className="inventory-offcanvas-wide"
            footer={
              <div className="flex w-full justify-between">
                <Button variant="outline" onClick={() => setIsPanelOpen(false)} disabled={submitting} className="rounded-xl">
                  <FiX className="mr-2" size={14} /> Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={submitting}
                  className="rounded-xl bg-indigo-600 font-semibold hover:bg-indigo-700">
                  {submitting ? 'Saving…' : editingId ? 'Update item' : 'Save item'}
                </Button>
              </div>
            }
          >
            <div className="inventory-form-scroll space-y-5 pr-2">
              <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-indigo-500" /> Basic information
                </legend>
                <div className="mt-3 space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {renderField('Company', 'company_id', 'select', companies?.map((c) => ({ id: c.id, name: c.name })), true)}
                    <div className="min-w-0">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Branch</label>
                      <div className="relative">
                        <select value={formData.branch_id as string}
                          onChange={(e) => setFormData((prev) => ({ ...prev, branch_id: e.target.value }))}
                          disabled={!formData.company_id}
                          className={`h-10 w-full appearance-none rounded-xl border bg-white px-3.5 pr-9 text-sm font-medium shadow-sm outline-none transition ${
                            formErrors.branch_id
                              ? 'border-rose-300 ring-2 ring-rose-200'
                              : 'border-slate-200 text-slate-700 hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10'
                          } disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400`}>
                          <option value="">{formData.company_id ? 'Select branch' : 'Select company first'}</option>
                          {filteredBranchesForm.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                        <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                      </div>
                    </div>
                    <div className="min-w-0">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Unit</label>
                      <div className="relative">
                        <select value={formData.unit}
                          onChange={(e) => setFormData((prev) => ({ ...prev, unit: e.target.value }))}
                          className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10">
                          {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                        <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {renderField('Item name', 'name', 'text', undefined, true)}
                    {renderField('SKU', 'sku', 'text', undefined, true)}
                    {renderField('Barcode', 'barcode')}
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {renderField('Brand', 'brand')}
                    <div className="min-w-0 sm:col-span-2">
                      {renderField('Description', 'description', 'textarea')}
                    </div>
                  </div>
                </div>
              </fieldset>

              <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-violet-500" /> Pricing
                </legend>
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {renderField('Purchase price (₹)', 'purchase_price', 'number')}
                  {renderField('Sale price (₹)', 'sale_price', 'number', undefined, true)}
                  {renderField('Tax rate (%)', 'tax_rate', 'number')}
                </div>
              </fieldset>

              <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Stock & status
                </legend>
                <div className="mt-3 space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {renderField('Stock quantity', 'stock_quantity', 'number', undefined, true)}
                    {renderField('Reorder level', 'reorder_level', 'number')}
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Active — visible on all documents
                    </span>
                    <button type="button" role="switch" aria-checked={formData.active} aria-label="Active"
                      onClick={() => setFormData((prev) => ({ ...prev, active: !prev.active }))}
                      className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-4 focus:ring-indigo-500/20 ${formData.active ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${formData.active ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                </div>
              </fieldset>
            </div>
          </Offcanvas>
        </Suspense>
      )}

      {isImportOpen && (
        <Suspense fallback={
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm">
            <div className="rounded-2xl bg-white p-8 text-sm text-slate-600 shadow-xl">Loading…</div>
          </div>
        }>
          <Offcanvas
            isOpen={isImportOpen}
            title="Import inventory"
            onClose={() => setIsImportOpen(false)}
            className="inventory-offcanvas-wide"
            footer={
              <div className="flex w-full justify-between">
                <Button variant="outline" onClick={() => setIsImportOpen(false)} disabled={importLoading} className="rounded-xl">Close</Button>
                {importStep === 'select' && (
                  <Button onClick={() => fileInputRef.current?.click()}
                    className="rounded-xl bg-indigo-600 font-semibold hover:bg-indigo-700">Browse file</Button>
                )}
                {importStep === 'preview' && !importLoading && (
                  <Button onClick={handleImport} disabled={!importSummary || importSummary.valid === 0}
                    className="rounded-xl bg-emerald-600 font-semibold hover:bg-emerald-700">
                    Import{importSummary ? ` (${importSummary.valid} valid)` : ''}
                  </Button>
                )}
                {importStep === 'result' && (
                  <Button onClick={() => { setIsImportOpen(false); refreshItems(); }}
                    className="rounded-xl bg-indigo-600 font-semibold hover:bg-indigo-700">
                    Close & refresh
                  </Button>
                )}
              </div>
            }
          >
            <div className="inventory-form-scroll space-y-5 pr-2">
              {importStep === 'select' && (
                <>
                  <p className="text-sm text-slate-600">
                    Upload a CSV file to import inventory items. The file must match the required format.
                    You can download a template below.
                  </p>
                  <div
                    className={`rounded-2xl border-2 border-dashed p-6 text-center transition sm:p-8 ${dragOver ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300'}`}
                    onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}>
                    <FiUpload size={40} className="mx-auto mb-3 text-slate-400" />
                    <p className="text-sm text-slate-600">Drag and drop your CSV file here, or click to browse</p>
                    <input type="file" ref={fileInputRef}
                      onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFileChange(file); }}
                      accept=".csv,text/csv" className="hidden" />
                    <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="mt-3 rounded-xl">
                      Browse files
                    </Button>
                  </div>
                  {importFile && (
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <FiFile className="shrink-0 text-indigo-600" size={16} />
                        <span className="truncate text-sm font-medium">{importFile.name}</span>
                        <span className="shrink-0 text-xs text-slate-500">({(importFile.size / 1024).toFixed(1)} KB)</span>
                      </div>
                      <button onClick={() => { setImportFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; setImportStep('select'); }}
                        className="grid h-7 w-7 place-items-center rounded-lg text-red-500 transition hover:bg-red-50" aria-label="Remove file">
                        <FiX size={16} />
                      </button>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <button onClick={handleDownloadTemplate}
                      className="flex items-center gap-1 text-sm font-medium text-indigo-600 underline-offset-2 hover:underline">
                      <FiDownload size={14} /> Download template
                    </button>
                    {importFile && (
                      <Button onClick={() => handlePreview(importFile)} disabled={importLoading}
                        className="rounded-xl bg-slate-900 font-semibold hover:bg-slate-800">
                        {importLoading ? 'Processing…' : 'Preview'}
                      </Button>
                    )}
                  </div>
                </>
              )}

              {importStep === 'preview' && (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Duplicate SKU</span>
                      <div className="relative">
                        <select value={duplicateAction}
                          onChange={(e) => setDuplicateAction(e.target.value as DuplicateAction)}
                          disabled={importLoading}
                          className="h-9 appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-8 text-sm font-medium text-slate-700 outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10">
                          <option value="skip">Skip</option>
                          <option value="update">Update</option>
                          <option value="stop">Stop</option>
                        </select>
                        <FiChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-slate-600">Total: <strong className="text-slate-900">{importSummary?.total || 0}</strong></span>
                      <span className="text-emerald-600">Valid: <strong>{importSummary?.valid || 0}</strong></span>
                      <span className="text-red-600">Invalid: <strong>{importSummary?.invalid || 0}</strong></span>
                    </div>
                  </div>
                  {importLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full min-w-[720px] text-sm">
                          <thead className="bg-slate-50">
                            <tr>
                              {['#', 'Name', 'SKU', 'Barcode', 'Company', 'Branch', 'Sale price', 'Stock', 'Valid'].map((h) => (
                                <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {importPreview.slice(0, 50).map((row) => (
                              <tr key={row.row} className={`border-t border-slate-100 ${row.valid ? '' : 'bg-red-50/60'}`}>
                                <td className="px-3 py-2 text-xs text-slate-600">{row.row}</td>
                                <td className="px-3 py-2 text-xs text-slate-700">{(row.data.name as string) || '—'}</td>
                                <td className="px-3 py-2 text-xs text-slate-700">{(row.data.sku as string) || '—'}</td>
                                <td className="px-3 py-2 text-xs text-slate-700">{(row.data.barcode as string) || '—'}</td>
                                <td className="px-3 py-2 text-xs text-slate-700">{String(row.data.company_id ?? '—')}</td>
                                <td className="px-3 py-2 text-xs text-slate-700">{String(row.data.branch_id ?? '—')}</td>
                                <td className="px-3 py-2 text-xs text-slate-700">{String(row.data.sale_price ?? '—')}</td>
                                <td className="px-3 py-2 text-xs text-slate-700">{String(row.data.stock_quantity ?? '—')}</td>
                                <td className="px-3 py-2 text-xs">
                                  {row.valid
                                    ? <FiCheck className="text-emerald-600" size={14} />
                                    : <FiAlertTriangle className="text-red-600" size={14} aria-label={Object.values(row.errors).join(', ')} />}
                                </td>
                              </tr>
                            ))}
                            {importPreview.length > 50 && (
                              <tr className="border-t border-slate-100">
                                <td colSpan={9} className="px-3 py-2 text-center text-xs text-slate-500">
                                  … and {importPreview.length - 50} more rows
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      {importErrors.length > 0 && (
                        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
                          <p className="mb-2 text-xs font-semibold text-red-700">Validation errors</p>
                          <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-red-600">
                            {importErrors.slice(0, 20).map((err, idx) => (
                              <li key={idx}>Row {err.row}: {err.field} – {err.message}</li>
                            ))}
                            {importErrors.length > 20 && <li>… and {importErrors.length - 20} more</li>}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {importStep === 'result' && (
                <div className="space-y-4">
                  <div className={`rounded-xl p-4 ${importSuccess ? 'border border-emerald-200 bg-emerald-50' : 'border border-red-200 bg-red-50'}`}>
                    <h3 className="text-base font-bold text-slate-900">
                      {importSuccess ? 'Import completed' : 'Import failed'}
                    </h3>
                    <p className="mt-1 text-sm text-slate-700">{importResultMessage}</p>
                  </div>
                  {importSummary && (
                    <div className="grid grid-cols-2 gap-2.5 text-sm sm:grid-cols-5">
                      {[
                        { label: 'Total', value: importSummary.total, color: 'bg-slate-50 text-slate-900' },
                        { label: 'Created', value: importSummary.created ?? 0, color: 'bg-emerald-50 text-emerald-700' },
                        { label: 'Updated', value: importSummary.updated ?? 0, color: 'bg-indigo-50 text-indigo-700' },
                        { label: 'Skipped', value: importSummary.skipped ?? 0, color: 'bg-amber-50 text-amber-700' },
                        { label: 'Failed', value: importSummary.failed ?? 0, color: 'bg-red-50 text-red-700' },
                      ].map((s) => (
                        <div key={s.label} className={`rounded-xl p-3 text-center ${s.color}`}>
                          <div className="text-lg font-bold">{s.value}</div>
                          <div className="text-[11px] uppercase tracking-wide text-slate-500">{s.label}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {importErrors.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Errors ({importErrors.length})</p>
                        <button onClick={handleDownloadErrorReport}
                          className="flex items-center gap-1 text-xs font-medium text-indigo-600 underline-offset-2 hover:underline">
                          <FiDownload size={12} /> Download report
                        </button>
                      </div>
                      <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">Row</th>
                              <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">Field</th>
                              <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">Message</th>
                            </tr>
                          </thead>
                          <tbody>
                            {importErrors.slice(0, 50).map((err, idx) => (
                              <tr key={idx} className="border-t border-slate-100">
                                <td className="px-3 py-1.5 text-slate-600">{err.row}</td>
                                <td className="px-3 py-1.5 text-slate-600">{err.field}</td>
                                <td className="px-3 py-1.5 text-slate-700">{err.message}</td>
                              </tr>
                            ))}
                            {importErrors.length > 50 && (
                              <tr className="border-t border-slate-100">
                                <td colSpan={3} className="px-3 py-1.5 text-center text-slate-500">
                                  … and {importErrors.length - 50} more
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Offcanvas>
        </Suspense>
      )}
    </>
  );
}

export default InventoryPage;