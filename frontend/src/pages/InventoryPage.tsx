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
interface ImportError {
  row: number;
  field: string;
  message: string;
}
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

const UNIT_OPTIONS = [
  'Piece',
  'Kg',
  'Gram',
  'Liter',
  'Milliliter',
  'Meter',
  'Centimeter',
  'Box',
  'Carton',
  'Set',
  'Pack',
  'Unit',
  'Hour',
  'Day',
  'Month',
  'Year',
  'Dozen',
  'Pair',
  'Bundle',
  'Bag',
  'Roll',
  'Sheet',
  'Bottle',
  'Can',
  'Case',
  'Pallet',
  'Drum',
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
  try {
    addAppLog(entry);
  } catch {
    /* no-op */
  }
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

function safeNumber(value: unknown): number {
  return toFiniteNumber(value, 0);
}

function safeCurrency(value: unknown): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(safeNumber(value));
}

function safeDate(value: unknown): string {
  if (!value) return '—';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
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
  const sanitized = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${sanitized.replace(/"/g, '""')}"`;
}

/**
 * Runs `fn` over `items` with a bounded concurrency limit.
 * Preserves input order in the returned array.
 */
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
          try {
            results[index] = await fn(items[index], index);
          } catch {
            results[index] = undefined as unknown as R;
          }
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
/* Skeletons & Loader                                                  */
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

const TypewriterLoader = memo(() => (
  <div className="flex flex-col items-center justify-center p-10">
    <div className="typewriter">
      <div className="slide">
        <i />
      </div>
      <div className="paper" />
      <div className="keyboard" />
    </div>
    <p className="mt-6 animate-pulse text-sm text-slate-500">Loading inventory…</p>
  </div>
));
TypewriterLoader.displayName = 'TypewriterLoader';

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
/* Portal-based Action Dropdown                                        */
/* ------------------------------------------------------------------ */

const MENU_WIDTH = 180;
const MENU_HEIGHT = 150;
const MENU_MARGIN = 8;

const ActionDropdown = memo(
  ({
    item,
    onView,
    onEdit,
    onDelete,
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
      if (isOpen) {
        setIsOpen(false);
        return;
      }
      const rect = buttonRef.current?.getBoundingClientRect();
      if (rect) {
        const left = Math.min(
          Math.max(MENU_MARGIN, rect.right - MENU_WIDTH),
          window.innerWidth - MENU_WIDTH - MENU_MARGIN
        );
        const top =
          rect.bottom + MENU_HEIGHT <= window.innerHeight - MENU_MARGIN
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
          buttonRef.current &&
          !buttonRef.current.contains(target) &&
          menuRef.current &&
          !menuRef.current.contains(target)
        ) {
          setIsOpen(false);
        }
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
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          className={`grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 ${
            isOpen ? 'bg-slate-100 text-slate-700' : ''
          }`}
          title="Actions"
          aria-haspopup="menu"
          aria-expanded={isOpen}
        >
          <FiMoreVertical size={16} />
        </button>

        {isOpen &&
          createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={menuStyle}
              onClick={(e) => e.stopPropagation()}
              className="animate-fadeIn overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl shadow-slate-900/10"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsOpen(false);
                  onView(item);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
              >
                <FiEye size={14} className="text-slate-500" /> View
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsOpen(false);
                  onEdit(item);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
              >
                <FiEdit size={14} className="text-indigo-500" /> Edit
              </button>
              <div className="my-1 border-t border-slate-100" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsOpen(false);
                  onDelete(item);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 transition hover:bg-red-50"
              >
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

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
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
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        className={`animate-fadeIn my-4 w-full ${width} rounded-2xl border border-slate-200 bg-white shadow-2xl`}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <h2 id="modal-title" className="text-base font-bold text-slate-900">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close modal"
            >
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
/* iOS-style Tabs                                                      */
/* ------------------------------------------------------------------ */

const IosTabs = ({
  tabs,
  activeTab,
  onChange,
}: {
  tabs: { key: string; label: string }[];
  activeTab: string;
  onChange: (key: string) => void;
}) => {
  return (
    <div className="flex w-full justify-center rounded-xl bg-slate-100/60 p-2">
      <div
        className="relative grid items-center rounded-full bg-white p-1 shadow-inner ring-1 ring-slate-200/70"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}
      >
        <div
          className="absolute left-1 top-1 h-[calc(100%-8px)] rounded-full bg-slate-900 shadow transition-transform duration-300"
          style={{
            width: `calc(${100 / tabs.length}% - 8px)`,
            transform: `translateX(${tabs.findIndex((t) => t.key === activeTab) * 100}%)`,
          }}
        />
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`relative z-10 whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
              activeTab === tab.key ? 'text-white' : 'text-slate-500 hover:text-slate-800'
            }`}
            role="tab"
            aria-selected={activeTab === tab.key}
            tabIndex={activeTab === tab.key ? 0 : -1}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Product Detail Modal                                                */
/* ------------------------------------------------------------------ */

const ProductDetailModal = ({
  product,
  onClose,
  onEdit,
  onStockIn,
  onStockOut,
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
    controllersRef.current.forEach((c) => c.abort());
    controllersRef.current.clear();
  }, [product.id, clearTabData]);

  const fetchTabData = useCallback(
    async (tabKey: string) => {
      if (controllersRef.current.has(tabKey)) {
        controllersRef.current.get(tabKey)?.abort();
      }
      const controller = new AbortController();
      controllersRef.current.set(tabKey, controller);

      setTabLoading((prev) => ({ ...prev, [tabKey]: true }));
      setTabErrors((prev) => ({ ...prev, [tabKey]: '' }));

      try {
        switch (tabKey) {
          case 'summary':
          case 'warehouse': {
            const [summaryRes, warehouseRes] = await Promise.all([
              apiClient.get(`/products/${product.id}/inventory-summary`, {
                signal: controller.signal,
              }),
              apiClient.get(`/products/${product.id}/warehouse-stock`, {
                signal: controller.signal,
              }),
            ]);
            setSummaryData((summaryRes.data ?? {}) as Record<string, unknown>);
            setWarehouseData(extractArray<WarehouseStock>(warehouseRes.data));
            break;
          }
          case 'timeline': {
            const res = await apiClient.get(
              `/products/${product.id}/stock-movements?per_page=50`,
              { signal: controller.signal }
            );
            setMovements(extractArray<StockMovementRecord>(res.data));
            break;
          }
          case 'billwise': {
            const res = await apiClient.get(`/products/${product.id}/transactions`, {
              signal: controller.signal,
            });
            setTransactions(extractArray<TransactionRecord>(res.data));
            break;
          }
          case 'purchasehistory': {
            const res = await apiClient.get(
              `/products/${product.id}/purchase-price-history?per_page=50`,
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
    return () => {
      controllersRef.current.forEach((c) => c.abort());
    };
  }, [fetchTabData]);

  useEffect(() => {
    if (activeTab === 'summary' || activeTab === 'warehouse') return;
    fetchTabData(activeTab);
  }, [activeTab, fetchTabData]);

  const tabs = [
    { key: 'summary', label: 'Summary' },
    { key: 'billwise', label: 'Bill-Wise' },
    { key: 'party', label: 'Party' },
    { key: 'timeline', label: 'Timeline' },
    { key: 'pricelist', label: 'Price List' },
    { key: 'purchasehistory', label: 'Purchase History' },
    { key: 'warehouse', label: 'Warehouse' },
  ];

  const partyGroups = useMemo(() => {
    if (!transactions.length) return [];
    const map = new Map<string, TransactionRecord[]>();
    transactions.forEach((t) => {
      const key = t.party_name || 'Unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });
    return Array.from(map.entries()).map(([party, items]) => ({ party, items }));
  }, [transactions]);

  const isLoading = tabLoading[activeTab] || false;
  const activeTabError = tabErrors[activeTab] || null;

  return (
    <Modal onClose={onClose} title={product.name} width="max-w-7xl">
      <div className="p-6">
        {/* Header summary card */}
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-base font-bold text-white shadow-sm">
                {(product.name || 'P')[0]?.toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-slate-900">{product.name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 font-mono text-[11px] text-slate-600">
                    {product.sku || '—'}
                  </span>
                  {product.brand && (
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] text-slate-600">
                      {product.brand}
                    </span>
                  )}
                  <Badge
                    variant="outline"
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                      toBoolean(product.active)
                        ? 'border-emerald-200/70 bg-emerald-50 text-emerald-700'
                        : 'border-red-200/70 bg-red-50 text-red-700'
                    }`}
                  >
                    {toBoolean(product.active) ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => onEdit(product)}
                variant="outline"
                className="h-9 rounded-xl"
              >
                <FiEdit className="mr-1.5" size={14} /> Edit
              </Button>
              <Button
                onClick={() => onStockIn(product)}
                className="h-9 rounded-xl bg-emerald-600 font-semibold hover:bg-emerald-700"
              >
                <FiPackage className="mr-1.5" size={14} /> Stock IN
              </Button>
              <Button
                onClick={() => onStockOut(product)}
                className="h-9 rounded-xl bg-rose-600 font-semibold hover:bg-rose-700"
              >
                <FiTruck className="mr-1.5" size={14} /> Stock OUT
              </Button>
            </div>
          </div>
        </div>

        {/* Summary tiles */}
        {summaryData && (
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-6">
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Sale price
              </p>
              <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">
                {safeCurrency(product.sale_price)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Total stock
              </p>
              <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">
                {safeNumber(summaryData.total_stock)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Available
              </p>
              <p className="mt-1 text-sm font-bold tabular-nums text-emerald-700">
                {safeNumber(summaryData.available_stock)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Reserved
              </p>
              <p className="mt-1 text-sm font-bold tabular-nums text-amber-700">
                {safeNumber(summaryData.reserved_stock)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Avg purchase
              </p>
              <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">
                {safeCurrency(summaryData.average_purchase_price)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Last purchase
              </p>
              <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">
                {safeCurrency(summaryData.last_purchase_price)}
              </p>
            </div>
          </div>
        )}

        <div className="mt-5">
          <IosTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
        </div>

        <div className="mt-5">
          {activeTabError && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
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
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Last purchase price
                    </p>
                    <p className="mt-1 text-lg font-bold text-slate-900">
                      {safeCurrency(summaryData.last_purchase_price)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Average purchase price
                    </p>
                    <p className="mt-1 text-lg font-bold text-slate-900">
                      {safeCurrency(summaryData.average_purchase_price)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Last sale price
                    </p>
                    <p className="mt-1 text-lg font-bold text-slate-900">
                      {safeCurrency(summaryData.last_sale_price)}
                    </p>
                  </div>
                </div>
              )}

              {activeTab === 'billwise' && (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Bill #
                        </th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Party
                        </th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Date
                        </th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Unit price
                        </th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Price w/tax
                        </th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Qty
                        </th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Discount
                        </th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((t, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="px-3 py-2 text-xs text-slate-700">{t.bill_number}</td>
                          <td className="px-3 py-2 text-xs text-slate-700">{t.party_name}</td>
                          <td className="px-3 py-2 text-xs text-slate-700">
                            {safeDate(t.date)}
                          </td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-700">
                            {safeCurrency(t.unit_price)}
                          </td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-700">
                            {safeCurrency(t.price_with_tax)}
                          </td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-700">
                            {safeNumber(t.quantity)}
                          </td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-700">
                            {safeNumber(t.item_discount)}%
                          </td>
                          <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums text-slate-900">
                            {safeCurrency(t.item_total)}
                          </td>
                        </tr>
                      ))}
                      {transactions.length === 0 && (
                        <tr>
                          <td colSpan={8} className="py-10 text-center text-sm text-slate-400">
                            No transactions found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === 'party' && (
                <div>
                  {partyGroups.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 py-10 text-center">
                      <p className="text-sm font-semibold text-slate-800">No party transactions</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        No party transactions found for this product.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {partyGroups.map((group) => (
                        <div
                          key={group.party}
                          className="rounded-xl border border-slate-200 bg-white p-4"
                        >
                          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                            <span className="grid h-6 w-6 place-items-center rounded-md bg-indigo-50 text-indigo-600">
                              <FiUser size={12} />
                            </span>
                            {group.party}
                          </h3>
                          <div className="mt-3 overflow-x-auto rounded-lg border border-slate-100">
                            <table className="w-full text-sm">
                              <thead className="bg-slate-50">
                                <tr>
                                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                    Bill #
                                  </th>
                                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                    Date
                                  </th>
                                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                    Qty
                                  </th>
                                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                    Total
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {group.items.map((t, i) => (
                                  <tr key={i} className="border-t border-slate-100">
                                    <td className="px-3 py-2 text-xs text-slate-700">
                                      {t.bill_number}
                                    </td>
                                    <td className="px-3 py-2 text-xs text-slate-700">
                                      {safeDate(t.date)}
                                    </td>
                                    <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-700">
                                      {safeNumber(t.quantity)}
                                    </td>
                                    <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums text-slate-900">
                                      {safeCurrency(t.item_total)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'timeline' && (
                <div className="relative space-y-2 pl-6">
                  <div className="absolute bottom-2 left-2.5 top-2 w-px bg-slate-200" />
                  {movements.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 py-10 text-center">
                      <p className="text-sm font-semibold text-slate-800">No movements</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        No stock movements recorded yet.
                      </p>
                    </div>
                  ) : (
                    movements.map((m) => (
                      <div key={m.id} className="relative pl-3">
                        <div
                          className={`absolute -left-[17px] top-3 grid h-6 w-6 place-items-center rounded-full ring-4 ring-white ${
                            m.transaction_type === 'IN'
                              ? 'bg-emerald-100 text-emerald-600'
                              : 'bg-rose-100 text-rose-600'
                          }`}
                        >
                          {m.transaction_type === 'IN' ? (
                            <FiPackage size={11} />
                          ) : (
                            <FiTruck size={11} />
                          )}
                        </div>
                        <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-slate-900">
                              {m.transaction_type} · {m.reference_type}
                            </p>
                            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                              <FiMapPin size={10} />
                              {safeDate(m.transaction_date)} · {safeNumber(m.stock_before)} →{' '}
                              {safeNumber(m.stock_after)}
                            </p>
                            {m.warehouse && (
                              <p className="mt-0.5 text-[11px] text-slate-500">
                                {m.warehouse.name}
                              </p>
                            )}
                            {m.creator && (
                              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
                                <FiUser size={10} /> {m.creator.name}
                              </p>
                            )}
                            {m.remark && (
                              <p className="mt-1 text-[11px] text-slate-500">{m.remark}</p>
                            )}
                          </div>
                          <div className="shrink-0 text-right">
                            <p
                              className={`text-sm font-semibold tabular-nums ${
                                m.transaction_type === 'IN'
                                  ? 'text-emerald-600'
                                  : 'text-rose-600'
                              }`}
                            >
                              {m.transaction_type === 'IN' ? '+' : '−'}
                              {safeNumber(m.quantity)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'pricelist' && priceList && (
                <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                  {[
                    { key: 'purchase_price', label: 'Purchase price' },
                    { key: 'sale_price', label: 'Sale price' },
                    { key: 'mrp', label: 'MRP' },
                    { key: 'wholesale_price', label: 'Wholesale' },
                    { key: 'dealer_price', label: 'Dealer' },
                    { key: 'distributor_price', label: 'Distributor' },
                  ].map((row) => (
                    <div
                      key={row.key}
                      className="rounded-xl border border-slate-200 bg-white p-3"
                    >
                      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        {row.label}
                      </dt>
                      <dd className="mt-1 text-sm font-bold tabular-nums text-slate-900">
                        {safeCurrency(priceList[row.key])}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              {activeTab === 'purchasehistory' && (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Date
                        </th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Supplier
                        </th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Bill #
                        </th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Qty
                        </th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Unit price
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {priceHistory.map((p) => (
                        <tr key={p.id} className="border-t border-slate-100">
                          <td className="px-3 py-2 text-xs text-slate-700">
                            {safeDate(p.purchase_date)}
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-700">
                            {p.supplier?.name || '—'}
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-700">
                            {p.bill_number || '—'}
                          </td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-700">
                            {safeNumber(p.quantity)}
                          </td>
                          <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums text-slate-900">
                            {safeCurrency(p.unit_price)}
                          </td>
                        </tr>
                      ))}
                      {priceHistory.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-10 text-center text-sm text-slate-400">
                            No purchase history
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === 'warehouse' && (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Warehouse
                        </th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Qty
                        </th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Reserved
                        </th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Available
                        </th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Avg cost
                        </th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Last purchase
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {warehouseData.map((w) => (
                        <tr key={w.warehouse_id} className="border-t border-slate-100">
                          <td className="px-3 py-2 text-xs font-medium text-slate-800">
                            {w.warehouse_name}
                          </td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-700">
                            {safeNumber(w.quantity)}
                          </td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-700">
                            {safeNumber(w.reserved_quantity)}
                          </td>
                          <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums text-emerald-700">
                            {safeNumber(w.available_quantity)}
                          </td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-700">
                            {safeCurrency(w.average_cost)}
                          </td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-700">
                            {safeCurrency(w.last_purchase_price)}
                          </td>
                        </tr>
                      ))}
                      {warehouseData.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-10 text-center text-sm text-slate-400">
                            No warehouse records
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
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
  product,
  onClose,
  onSuccess,
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
  const [idempotencyKey] = useState<string>(() => crypto.randomUUID());

  useEffect(() => {
    const controller = new AbortController();
    apiClient
      .get('/warehouses?per_page=all', { signal: controller.signal })
      .then((res) => setWarehouses(extractArray<{ id: number; name: string }>(res.data)))
      .catch((err: unknown) => {
        if ((err as ApiErrorLike).name !== 'AbortError') {
          setWarehouseError(getApiErrorMessage(err, 'Failed to load warehouses.'));
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!form.warehouse_id) return;
    const controller = new AbortController();
    apiClient
      .get(`/products/${product.id}/warehouse-stock`, { signal: controller.signal })
      .then((res) => {
        const stocks = extractArray<WarehouseStock>(res.data);
        const selected = stocks.find((s) => s.warehouse_id === Number(form.warehouse_id));
        setSelectedStock(selected ? selected.available_quantity : 0);
      })
      .catch((err: unknown) => {
        if ((err as ApiErrorLike).name !== 'AbortError') setSelectedStock(null);
      });
    return () => controller.abort();
  }, [form.warehouse_id, product.id]);

  const validate = (): string | null => {
    if (!form.warehouse_id) return 'Select a warehouse.';
    const qty = toPositiveNumber(form.quantity);
    if (qty === null) return 'Enter a positive quantity.';
    const unitCost = toFiniteNumber(form.unit_cost, NaN);
    if (!Number.isFinite(unitCost) || unitCost < 0)
      return 'Unit cost must be a non-negative number.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.transaction_date))
      return 'Invalid date format. Use YYYY-MM-DD.';
    if (new Date(form.transaction_date) > new Date())
      return 'Transaction date cannot be in the future.';
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validate();
    if (validationError) {
      showError('Validation', validationError);
      return;
    }
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
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10';

  return (
    <Modal onClose={onClose} title="Stock IN" width="max-w-md">
      <div className="space-y-4 p-6">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Product
          </label>
          <input
            type="text"
            value={product.name}
            disabled
            className={`${inputClass} cursor-not-allowed bg-slate-50 text-slate-400`}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Warehouse *
          </label>
          <div className="relative">
            <select
              value={form.warehouse_id}
              onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })}
              className={`${inputClass} appearance-none pr-9`}
            >
              <option value="">Select warehouse</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <FiChevronDown
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={14}
            />
          </div>
          {warehouseError && <p className="mt-1 text-xs text-red-500">{warehouseError}</p>}
          {selectedStock !== null && (
            <p className="mt-1 text-xs text-slate-500">Current available: {selectedStock}</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Quantity *
            </label>
            <input
              type="number"
              min="0"
              step="any"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Unit cost
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.unit_cost}
              onChange={(e) => setForm({ ...form, unit_cost: e.target.value })}
              className={inputClass}
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Transaction type
          </label>
          <div className="relative">
            <select
              value={form.reference_type}
              onChange={(e) => setForm({ ...form, reference_type: e.target.value })}
              className={`${inputClass} appearance-none pr-9`}
            >
              <option value="manual">Manual</option>
              <option value="purchase">Purchase</option>
              <option value="return">Return</option>
              <option value="adjustment">Adjustment</option>
              <option value="opening_stock">Opening stock</option>
              <option value="other">Other</option>
            </select>
            <FiChevronDown
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={14}
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Reference / bill number
          </label>
          <input
            type="text"
            value={form.reference_id}
            onChange={(e) => setForm({ ...form, reference_id: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Transaction date
          </label>
          <input
            type="date"
            value={form.transaction_date}
            onChange={(e) => setForm({ ...form, transaction_date: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Remark
          </label>
          <textarea
            value={form.remark}
            onChange={(e) => setForm({ ...form, remark: e.target.value })}
            rows={2}
            maxLength={2000}
            className="min-h-[70px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="rounded-xl">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-xl bg-emerald-600 font-semibold hover:bg-emerald-700"
          >
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
  product,
  onClose,
  onSuccess,
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
  const [idempotencyKey] = useState<string>(() => crypto.randomUUID());

  useEffect(() => {
    const controller = new AbortController();
    apiClient
      .get('/warehouses?per_page=all', { signal: controller.signal })
      .then((res) => setWarehouses(extractArray<{ id: number; name: string }>(res.data)))
      .catch((err: unknown) => {
        if ((err as ApiErrorLike).name !== 'AbortError') {
          setWarehouseError(getApiErrorMessage(err, 'Failed to load warehouses.'));
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!form.warehouse_id) return;
    const controller = new AbortController();
    apiClient
      .get(`/products/${product.id}/warehouse-stock`, { signal: controller.signal })
      .then((res) => {
        const stocks = extractArray<WarehouseStock>(res.data);
        const selected = stocks.find((s) => s.warehouse_id === Number(form.warehouse_id));
        setAvailableStock(selected ? selected.available_quantity : 0);
      })
      .catch((err: unknown) => {
        if ((err as ApiErrorLike).name !== 'AbortError') setAvailableStock(null);
      });
    return () => controller.abort();
  }, [form.warehouse_id, product.id]);

  const validate = (): string | null => {
    if (!form.warehouse_id) return 'Select a warehouse.';
    const qty = toPositiveNumber(form.quantity);
    if (qty === null) return 'Enter a positive quantity.';
    const unitPrice = toFiniteNumber(form.unit_price, NaN);
    if (!Number.isFinite(unitPrice) || unitPrice < 0)
      return 'Unit price must be a non-negative number.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.transaction_date))
      return 'Invalid date format. Use YYYY-MM-DD.';
    if (new Date(form.transaction_date) > new Date())
      return 'Transaction date cannot be in the future.';
    if (availableStock !== null && qty > availableStock) {
      return `Insufficient stock. Available: ${availableStock}, Requested: ${qty}`;
    }
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validate();
    if (validationError) {
      showError('Validation', validationError);
      return;
    }
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
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10';

  return (
    <Modal onClose={onClose} title="Stock OUT" width="max-w-md">
      <div className="space-y-4 p-6">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Product
          </label>
          <input
            type="text"
            value={product.name}
            disabled
            className={`${inputClass} cursor-not-allowed bg-slate-50 text-slate-400`}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Warehouse *
          </label>
          <div className="relative">
            <select
              value={form.warehouse_id}
              onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })}
              className={`${inputClass} appearance-none pr-9`}
            >
              <option value="">Select warehouse</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <FiChevronDown
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={14}
            />
          </div>
          {warehouseError && <p className="mt-1 text-xs text-red-500">{warehouseError}</p>}
          {availableStock !== null && (
            <p className="mt-1 text-xs text-slate-500">Available stock: {availableStock}</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Quantity *
            </label>
            <input
              type="number"
              min="0"
              step="any"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Unit price
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.unit_price}
              onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
              className={inputClass}
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Transaction type
          </label>
          <div className="relative">
            <select
              value={form.reference_type}
              onChange={(e) => setForm({ ...form, reference_type: e.target.value })}
              className={`${inputClass} appearance-none pr-9`}
            >
              <option value="manual">Manual</option>
              <option value="sale">Sale</option>
              <option value="return">Return</option>
              <option value="adjustment">Adjustment</option>
              <option value="transfer">Transfer</option>
              <option value="other">Other</option>
            </select>
            <FiChevronDown
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={14}
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Reference / bill number
          </label>
          <input
            type="text"
            value={form.reference_id}
            onChange={(e) => setForm({ ...form, reference_id: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Transaction date
          </label>
          <input
            type="date"
            value={form.transaction_date}
            onChange={(e) => setForm({ ...form, transaction_date: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Remark
          </label>
          <textarea
            value={form.remark}
            onChange={(e) => setForm({ ...form, remark: e.target.value })}
            rows={2}
            maxLength={2000}
            className="min-h-[70px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="rounded-xl">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-xl bg-rose-600 font-semibold hover:bg-rose-700"
          >
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

  const {
    data: companies,
    refresh: refreshComps,
  } = useApiCache<Company[]>('companies', () => apiClient.getCompanies());

  const {
    data: branches,
    refresh: refreshBranches,
  } = useApiCache<Branch[]>('branches', () => apiClient.getBranches());

  const {
    data: warehouses,
    loading: warehousesLoading,
    refresh: refreshWarehouses,
  } = useApiCache<Warehouse[]>(
    'warehouses',
    async () => extractArray<Warehouse>((await apiClient.get('/warehouses?per_page=all')).data)
  );

  const {
    data: items,
    loading: itemsLoading,
    error: itemsError,
    refresh: refreshItems,
  } = useApiCache<InventoryItem[]>('inventory', () => apiClient.getAllProducts());

  const [searchTerm, setSearchTerm] = useState('');
  const [filterCompany, setFilterCompany] = useState('all');
  const [filterBranch, setFilterBranch] = useState('all');
  const [filterBrand, setFilterBrand] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterWarehouse, setFilterWarehouse] = useState('all');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  /* ------ Warehouse stock map (per-product, fetched lazily) ------ */
  const [warehouseStockMap, setWarehouseStockMap] = useState<Map<number, WarehouseStock[]>>(
    new Map()
  );
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
    company_id: '',
    branch_id: '',
    name: '',
    sku: '',
    barcode: '',
    brand: '',
    unit: 'Piece',
    purchase_price: '',
    sale_price: '',
    tax_rate: '',
    stock_quantity: '',
    reorder_level: '',
    description: '',
    active: true,
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

  /* -------------------- Derived data -------------------- */

  const brands = useMemo(() => {
    if (!items) return [];
    const br = new Set<string>();
    items.forEach((i) => {
      if (i.brand) br.add(i.brand);
    });
    return Array.from(br).sort();
  }, [items]);

  /**
   * Eager load warehouse stock rows for every product the first time a
   * specific warehouse filter is chosen. Bounded concurrency keeps the
   * server happy even with big inventories.
   */
  useEffect(() => {
    if (filterWarehouse === 'all' || !items || items.length === 0) return;

    const pending = items.filter((item) => !loadedWarehouseStockRef.current.has(item.id));
    if (pending.length === 0) return;

    let cancelled = false;
    setWarehouseStockLoading(true);

    (async () => {
      const fetched: Array<[number, WarehouseStock[]]> = [];

      await mapWithConcurrency(
        pending,
        WAREHOUSE_STOCK_CONCURRENCY,
        async (item) => {
          if (cancelled) return;
          try {
            const res = await apiClient.get(`/products/${item.id}/warehouse-stock`);
            fetched.push([item.id, extractArray<WarehouseStock>(res.data)]);
          } catch {
            // Swallow per-product failure — mark it as fetched-with-nothing so
            // we don't retry on every render.
            fetched.push([item.id, []]);
          }
        }
      );

      if (cancelled) return;

      fetched.forEach(([id]) => loadedWarehouseStockRef.current.add(id));

      setWarehouseStockMap((prev) => {
        const next = new Map(prev);
        fetched.forEach(([id, stocks]) => next.set(id, stocks));
        return next;
      });
      setWarehouseStockLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [filterWarehouse, items]);

  /** Look up the stock row for a product in the currently-selected warehouse. */
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
          case 'active':
            return isActive;
          case 'inactive':
            return !isActive;
          case 'in_stock':
            return stock > reorder;
          case 'low':
            return stock > 0 && stock <= reorder;
          case 'out':
            return stock <= 0;
          default:
            return true;
        }
      });
    }
    // Warehouse scope: keep only products that have a row in that warehouse.
    if (filterWarehouse !== 'all') {
      filtered = filtered.filter((item) => {
        const rows = warehouseStockMap.get(item.id);
        if (!rows) return false; // still loading or missing → hide from this view
        const wid = Number(filterWarehouse);
        return rows.some((r) => r.warehouse_id === wid);
      });
    }
    return filtered;
  }, [
    items,
    searchTerm,
    filterCompany,
    filterBranch,
    filterBrand,
    filterStatus,
    filterWarehouse,
    warehouseStockMap,
  ]);

  /**
   * Summary. When a warehouse filter is active, aggregate quantities come
   * from `product_warehouse_stocks` rather than the denormalized
   * `products.stock_quantity` column.
   */
  const summary = useMemo(() => {
    if (!items)
      return {
        total: 0,
        active: 0,
        inactive: 0,
        lowStock: 0,
        outOfStock: 0,
        totalUnits: 0,
        totalValue: 0,
      };

    const scopedItems: Array<{ qty: number; reorder: number; salePrice: number; active: boolean }> =
      [];

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
      active: (filterWarehouse === 'all' ? items.map((i) => toBoolean(i.active)) : scopedItems.map((s) => s.active))
        .filter(Boolean).length,
      inactive: (filterWarehouse === 'all' ? items.map((i) => toBoolean(i.active)) : scopedItems.map((s) => s.active))
        .filter((v) => !v).length,
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
    setSearchTerm('');
    setFilterCompany('all');
    setFilterBranch('all');
    setFilterBrand('all');
    setFilterStatus('all');
    setFilterWarehouse('all');
  }, []);

  /* -------------------- Branch filtering -------------------- */

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

  /** Warehouses filtered by the currently selected company/branch (when set). */
  const filteredWarehousesFilter = useMemo(() => {
    if (!warehouses) return [];
    let list = warehouses;
    if (filterCompany !== 'all') {
      list = list.filter(
        (w) => w.company_id == null || String(w.company_id) === filterCompany
      );
    }
    if (filterBranch !== 'all') {
      list = list.filter(
        (w) => w.branch_id == null || String(w.branch_id) === filterBranch
      );
    }
    return list;
  }, [warehouses, filterCompany, filterBranch]);

  /* -------------------- Selection -------------------- */

  const allSelected = Boolean(
    filteredItems.length > 0 && filteredItems.every((i) => selectedIds.includes(i.id))
  );

  const toggleSelectAll = useCallback(() => {
    const ids = filteredItems.map((i) => i.id);
    if (!ids.length) return;
    if (allSelected) {
      setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
    } else {
      setSelectedIds((current) => Array.from(new Set([...current, ...ids])));
    }
  }, [allSelected, filteredItems]);

  const toggleSelected = useCallback((id: number) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((v) => v !== id) : [...current, id]
    );
  }, []);

  /* -------------------- Bulk actions -------------------- */

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Delete ${selectedIds.length} item(s)?`)) return;
    try {
      const results = await Promise.allSettled(
        selectedIds.map((id) => apiClient.deleteProduct(id))
      );
      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed === 0) {
        showSuccess('Bulk delete', `${succeeded} item(s) deleted.`);
      } else {
        showError(
          'Bulk delete',
          `${succeeded} deleted, ${failed} failed. Please check server logs.`
        );
      }
      setSelectedIds([]);
      refreshItems();
    } catch (error: unknown) {
      showError('Bulk delete failed', getApiErrorMessage(error));
    }
  };

  const handleBulkStatusChange = async (active: boolean) => {
    if (selectedIds.length === 0) return;
    const label = active ? 'activate' : 'deactivate';
    if (!window.confirm(`Are you sure you want to ${label} ${selectedIds.length} item(s)?`))
      return;
    try {
      const results = await Promise.allSettled(
        selectedIds.map((id) => apiClient.updateProduct(id, { active } as Record<string, unknown>))
      );
      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed === 0) {
        showSuccess('Bulk update', `${succeeded} item(s) ${label}d.`);
      } else {
        showError('Bulk update', `${succeeded} ${label}d, ${failed} failed.`);
      }
      setSelectedIds([]);
      refreshItems();
    } catch (error: unknown) {
      showError('Bulk update failed', getApiErrorMessage(error));
    }
  };

  const handleBulkUpdateStock = async (_quantity: number) => {
    showError(
      'Disabled',
      'Direct bulk stock overwrite is not allowed. Use Stock IN/OUT or a proper stock adjustment flow.'
    );
  };

  /* -------------------- CRUD -------------------- */

  const handleView = useCallback((item: InventoryItem) => {
    setViewingItem(item);
    setIsViewPanelOpen(true);
  }, []);

  const handleCreate = () => {
    setEditingId(null);
    setFormData({
      company_id: '',
      branch_id: '',
      name: '',
      sku: '',
      barcode: '',
      brand: '',
      unit: 'Piece',
      purchase_price: '',
      sale_price: '',
      tax_rate: '',
      stock_quantity: '',
      reorder_level: '',
      description: '',
      active: true,
    });
    setFormErrors({});
    setIsPanelOpen(true);
  };

  const handleEdit = useCallback((item: InventoryItem) => {
    setEditingId(item.id);
    setFormData({
      company_id: item.company_id || '',
      branch_id: item.branch_id ?? '',
      name: item.name || '',
      sku: item.sku || '',
      barcode: item.barcode || '',
      brand: item.brand || '',
      unit: item.unit || 'Piece',
      purchase_price: item.purchase_price ?? '',
      sale_price: item.sale_price ?? '',
      tax_rate: item.tax_rate ?? '',
      stock_quantity: item.stock_quantity ?? '',
      reorder_level: item.reorder_level ?? '',
      description: item.description || '',
      active: toBoolean(item.active),
    });
    setFormErrors({});
    setIsPanelOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (item: InventoryItem) => {
      if (!window.confirm(`Delete "${item.name}"?`)) return;
      try {
        await apiClient.deleteProduct(item.id);
        showSuccess('Item deleted', `"${item.name}" removed.`);
        safeLog({
          module: 'Inventory',
          action: 'Delete',
          status: 'success',
          message: `Deleted ${item.name}`,
        });
        refreshItems();
      } catch (error: unknown) {
        showError('Delete failed', getApiErrorMessage(error));
      }
    },
    [refreshItems, showSuccess, showError]
  );

  /* -------------------- Validation -------------------- */

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    let valid = true;

    const companyId = Number(formData.company_id);
    if (!Number.isInteger(companyId) || companyId <= 0) {
      errors.company_id = 'Select a company.';
      valid = false;
    }

    const branchId = formData.branch_id ? Number(formData.branch_id) : null;
    if (branchId !== null) {
      if (!Number.isInteger(branchId) || branchId <= 0) {
        errors.branch_id = 'Invalid branch.';
        valid = false;
      } else if (branches) {
        const branch = branches.find((b) => b.id === branchId);
        if (!branch || branch.company_id !== companyId) {
          errors.branch_id = 'Branch does not belong to the selected company.';
          valid = false;
        }
      }
    }

    const name = formData.name.trim();
    if (!name) {
      errors.name = 'Name is required.';
      valid = false;
    } else if (name.length > 255) {
      errors.name = 'Name must be 255 characters or less.';
      valid = false;
    }

    const sku = formData.sku.trim();
    if (!sku) {
      errors.sku = 'SKU is required.';
      valid = false;
    } else if (sku.length > 100) {
      errors.sku = 'SKU must be 100 characters or less.';
      valid = false;
    }

    if (formData.barcode && formData.barcode.length > 100) {
      errors.barcode = 'Barcode must be 100 characters or less.';
      valid = false;
    }
    if (formData.brand && formData.brand.length > 150) {
      errors.brand = 'Brand must be 150 characters or less.';
      valid = false;
    }
    if (formData.description && formData.description.length > 5000) {
      errors.description = 'Description must be 5000 characters or less.';
      valid = false;
    }

    const purchasePrice = toFiniteNumber(formData.purchase_price, NaN);
    if (!Number.isFinite(purchasePrice) || purchasePrice < 0) {
      errors.purchase_price = 'Purchase price must be a non-negative number.';
      valid = false;
    }
    const salePrice = toFiniteNumber(formData.sale_price, NaN);
    if (!Number.isFinite(salePrice) || salePrice < 0) {
      errors.sale_price = 'Sale price must be a non-negative number.';
      valid = false;
    }
    const taxRate = toFiniteNumber(formData.tax_rate, NaN);
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
      errors.tax_rate = 'Tax rate must be between 0 and 100.';
      valid = false;
    }
    const stockQuantity = toFiniteNumber(formData.stock_quantity, NaN);
    if (!Number.isFinite(stockQuantity) || stockQuantity < 0) {
      errors.stock_quantity = 'Stock quantity must be a non-negative number.';
      valid = false;
    }
    const reorderLevel = toFiniteNumber(formData.reorder_level, NaN);
    if (!Number.isFinite(reorderLevel) || reorderLevel < 0) {
      errors.reorder_level = 'Reorder level must be a non-negative number.';
      valid = false;
    }

    setFormErrors(errors);
    if (!valid) showError('Validation', 'Please fix the highlighted fields.');
    return valid;
  };

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
        safeLog({
          module: 'Inventory',
          action: 'Update',
          status: 'success',
          message: `Updated ${payload.name}`,
        });
      } else {
        await apiClient.createProduct(payload);
        showSuccess('Item created', `"${payload.name}" created.`);
        safeLog({
          module: 'Inventory',
          action: 'Create',
          status: 'success',
          message: `Created ${payload.name}`,
        });
      }
      setIsPanelOpen(false);
      refreshItems();
      refreshComps();
      refreshBranches();
    } catch (error: unknown) {
      const msg = getApiErrorMessage(error);
      showError('Save failed', msg);
      safeLog({ module: 'Inventory', action: 'Save', status: 'error', message: msg });
    } finally {
      setSubmitting(false);
    }
  }, [formData, editingId, refreshItems, refreshComps, refreshBranches, showSuccess, showError]);

  /* -------------------- Export -------------------- */

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
          if (selectedIds.length === 0) {
            showError('Export', 'No items selected.');
            return;
          }
          params.selected_ids = selectedIds;
        }
        const blob = await apiClient.exportInventory(params);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        showSuccess('Export', 'Inventory exported successfully.');
        safeLog({
          module: 'Inventory',
          action: 'Export',
          status: 'success',
          message: `Exported ${mode} view`,
        });
      } catch (error: unknown) {
        const msg = getApiErrorMessage(error);
        showError('Export failed', msg);
        safeLog({ module: 'Inventory', action: 'Export', status: 'error', message: msg });
      }
      setExportMenuOpen(false);
    },
    [
      searchTerm,
      filterCompany,
      filterBranch,
      filterBrand,
      filterStatus,
      filterWarehouse,
      selectedIds,
      showSuccess,
      showError,
    ]
  );

  /* -------------------- Import -------------------- */

  const handleImportOpen = () => {
    setIsImportOpen(true);
    setImportStep('select');
    setImportFile(null);
    setImportPreview([]);
    setImportSummary(null);
    setImportErrors([]);
    setImportResultMessage('');
    setImportSuccess(false);
    setDragOver(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = (file: File | null) => {
    if (!file) return;
    const validTypes = ['text/csv', 'application/vnd.ms-excel'];
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!validTypes.includes(file.type) && ext !== 'csv') {
      showError('Invalid file', 'Please select a CSV file.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showError('File too large', 'Maximum size is 10MB.');
      return;
    }
    setImportFile(file);
    void handlePreview(file);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length) handleFileChange(files[0]);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handlePreview = async (file: File = importFile as File) => {
    if (!file) return;
    setImportLoading(true);
    try {
      const response = await apiClient.importInventory(file, duplicateAction, true);
      const preview = Array.isArray(response?.preview)
        ? (response.preview as ImportPreviewRow[])
        : [];
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
    } finally {
      setImportLoading(false);
    }
  };

  const handleImport = async () => {
    if (!importFile) return;
    const allowed: DuplicateAction[] = ['skip', 'update', 'stop'];
    if (!allowed.includes(duplicateAction)) setDuplicateAction('skip');
    setImportLoading(true);
    try {
      const response = await apiClient.importInventory(importFile, duplicateAction, false);
      setImportSummary((response?.summary as ImportSummary) ?? null);
      setImportErrors(Array.isArray(response?.errors) ? (response.errors as ImportError[]) : []);
      setImportResultMessage(response?.message ?? '');
      setImportSuccess(Boolean(response?.success));
      setImportStep('result');
      if (response?.success) {
        showSuccess('Import completed', response.message);
        refreshItems();
        safeLog({
          module: 'Inventory',
          action: 'Import',
          status: 'success',
          message: `Imported ${response.summary?.created ?? 0} items`,
        });
      } else {
        showError('Import failed', response?.message || 'Please check errors.');
        safeLog({
          module: 'Inventory',
          action: 'Import',
          status: 'error',
          message: response?.message,
        });
      }
    } catch (error: unknown) {
      const msg = getApiErrorMessage(error);
      showError('Import failed', msg);
      setImportStep('preview');
      safeLog({ module: 'Inventory', action: 'Import', status: 'error', message: msg });
    } finally {
      setImportLoading(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await apiClient.downloadTemplate();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'inventory_template.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showSuccess('Template downloaded', 'Ready for import.');
    } catch (error: unknown) {
      showError('Template download failed', getApiErrorMessage(error));
    }
  };

  const handleDownloadErrorReport = () => {
    if (importErrors.length === 0) return;
    const headers = ['Row', 'Field', 'Error'];
    const rows = importErrors.map((e) => [e.row, e.field, e.message]);
    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => csvEscape(cell)).join(','))
      .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'import_errors.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  /* -------------------- Form field helper -------------------- */

  const renderField = (
    label: string,
    field: keyof InventoryFormData,
    type: 'text' | 'number' | 'select' | 'textarea' = 'text',
    options?: Array<{ id: string | number; name: string }>,
    required = false
  ) => {
    const value = (formData as unknown as Record<string, unknown>)[field] ?? '';
    const id = `field-${field}`;
    const errorMsg = formErrors[field];
    const baseInput =
      'h-10 w-full min-w-0 rounded-xl border bg-white px-3.5 text-sm shadow-sm outline-none transition';
    const stateClass = errorMsg
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
              className={`${baseInput} ${stateClass} appearance-none pr-9`}
              aria-invalid={!!errorMsg}
            >
              <option value="">Select {label}</option>
              {options?.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.name}
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
            rows={3}
            maxLength={5000}
            className={`${baseInput} min-h-[80px] resize-y py-2.5 ${stateClass}`}
            placeholder={`Enter ${label}`}
            aria-invalid={!!errorMsg}
          />
        ) : (
          <input
            id={id}
            type={type}
            value={value as string | number}
            onChange={(e) => setFormData((prev) => ({ ...prev, [field]: e.target.value }))}
            className={`${baseInput} ${stateClass}`}
            placeholder={`Enter ${label}`}
            step={type === 'number' ? '0.01' : undefined}
            aria-invalid={!!errorMsg}
          />
        )}
        {errorMsg && <p className="mt-1 text-[11px] text-rose-600">{errorMsg}</p>}
      </div>
    );
  };

  const isLoading = itemsLoading;
  const isWarehouseScoped = filterWarehouse !== 'all';
  const stockColumnLabel = isWarehouseScoped ? 'Warehouse Stock' : 'Total Stock';

  /* -------------------- Error state -------------------- */

  if (itemsError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-600">
            <FiAlertCircle size={24} />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">Failed to load inventory</h2>
          <p className="mt-1.5 text-sm text-slate-500">{itemsError}</p>
          <Button
            onClick={refreshItems}
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

        .inventory-offcanvas-wide {
          width: min(1080px, 96vw) !important;
          max-width: min(1080px, 96vw) !important;
        }
        @media (max-width: 640px) {
          .inventory-offcanvas-wide { width: 100vw !important; max-width: 100vw !important; }
        }

        .inventory-offcanvas-wide .inventory-form-scroll {
          overflow-y: auto;
          overflow-x: hidden;
          min-height: 0;
          flex: 1 1 auto;
          max-height: calc(100vh - 180px);
          scrollbar-width: thin;
          scrollbar-color: #cbd5e1 transparent;
        }
        .inventory-offcanvas-wide .inventory-form-scroll::-webkit-scrollbar { width: 8px; }
        .inventory-offcanvas-wide .inventory-form-scroll::-webkit-scrollbar-track { background: transparent; }
        .inventory-offcanvas-wide .inventory-form-scroll::-webkit-scrollbar-thumb {
          background-color: #cbd5e1; border-radius: 8px;
        }
        .inventory-offcanvas-wide .inventory-form-scroll::-webkit-scrollbar-thumb:hover {
          background-color: #94a3b8;
        }

        .typewriter {
          --blue: #5C86FF;
          --blue-dark: #275EFE;
          --key: #fff;
          --paper: #EEF0FD;
          --text: #D3D4EC;
          --tool: #FBC56C;
          --duration: 3s;
          position: relative;
          animation: bounce05 var(--duration) linear infinite;
        }
        .typewriter .slide {
          width: 92px; height: 20px; border-radius: 3px; margin-left: 14px;
          transform: translateX(14px);
          background: linear-gradient(var(--blue), var(--blue-dark));
          animation: slide05 var(--duration) ease infinite;
        }
        .typewriter .slide:before, .typewriter .slide:after, .typewriter .slide i:before {
          content: ""; position: absolute; background: var(--tool);
        }
        .typewriter .slide:before { width: 2px; height: 8px; top: 6px; left: 100%; }
        .typewriter .slide:after { left: 94px; top: 3px; height: 14px; width: 6px; border-radius: 3px; }
        .typewriter .slide i { display: block; position: absolute; right: 100%; width: 6px; height: 4px; top: 4px; background: var(--tool); }
        .typewriter .slide i:before { right: 100%; top: -2px; width: 4px; border-radius: 2px; height: 14px; }
        .typewriter .paper {
          position: absolute; left: 24px; top: -26px; width: 40px; height: 46px; border-radius: 5px;
          background: var(--paper); transform: translateY(46px);
          animation: paper05 var(--duration) linear infinite;
        }
        .typewriter .paper:before {
          content: ""; position: absolute; left: 6px; right: 6px; top: 7px; border-radius: 2px;
          height: 4px; transform: scaleY(0.8); background: var(--text);
          box-shadow: 0 12px 0 var(--text), 0 24px 0 var(--text), 0 36px 0 var(--text);
        }
        .typewriter .keyboard { width: 120px; height: 56px; margin-top: -10px; z-index: 1; position: relative; }
        .typewriter .keyboard:before, .typewriter .keyboard:after { content: ""; position: absolute; }
        .typewriter .keyboard:before {
          top: 0; left: 0; right: 0; bottom: 0; border-radius: 7px;
          background: linear-gradient(135deg, var(--blue), var(--blue-dark));
          transform: perspective(10px) rotateX(2deg); transform-origin: 50% 100%;
        }
        .typewriter .keyboard:after {
          left: 2px; top: 25px; width: 11px; height: 4px; border-radius: 2px;
          box-shadow: 15px 0 0 var(--key), 30px 0 0 var(--key), 45px 0 0 var(--key), 60px 0 0 var(--key), 75px 0 0 var(--key), 90px 0 0 var(--key), 22px 10px 0 var(--key), 37px 10px 0 var(--key), 52px 10px 0 var(--key), 60px 10px 0 var(--key), 68px 10px 0 var(--key), 83px 10px 0 var(--key);
        }
        @keyframes bounce05 { 85%, 92%, 100% { transform: translateY(0); } 89% { transform: translateY(-4px); } 95% { transform: translateY(2px); } }
        @keyframes slide05 {
          5% { transform: translateX(14px); }
          15%, 30% { transform: translateX(6px); }
          40%, 55% { transform: translateX(0); }
          65%, 70% { transform: translateX(-4px); }
          80%, 89% { transform: translateX(-12px); }
          100% { transform: translateX(14px); }
        }
        @keyframes paper05 {
          5% { transform: translateY(46px); }
          20%, 30% { transform: translateY(34px); }
          22%, 55% { transform: translateY(22px); }
          65%, 70% { transform: translateY(10px); }
          80%, 85% { transform: translateY(0); }
          92%, 100% { transform: translateY(46px); }
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
                  Inventory · Products
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-[32px]">
                  Inventory workspace
                </h1>
                <p className="mt-1.5 max-w-2xl text-sm text-slate-300">
                  Track products, stock levels, pricing, and reorder points across your network.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={handleImportOpen}
                  className="h-10 rounded-xl border-white/10 bg-white/5 text-white shadow-none backdrop-blur transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                >
                  <FiUpload className="mr-2" size={14} />
                  Import
                </Button>
                <div className="relative">
                  <Button
                    variant="outline"
                    onClick={() => setExportMenuOpen((v) => !v)}
                    className="h-10 rounded-xl border-white/10 bg-white/5 text-white shadow-none backdrop-blur transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                  >
                    <FiDownload className="mr-2" size={14} />
                    Export
                    <FiChevronDown className="ml-1.5" size={12} />
                  </Button>
                  {exportMenuOpen && (
                    <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl shadow-slate-900/10">
                      <button
                        type="button"
                        onClick={() => handleExport('current')}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                      >
                        <FiDownload size={14} className="text-slate-400" /> Export current view
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExport('selected')}
                        disabled={selectedIds.length === 0}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <FiDownload size={14} className="text-slate-400" /> Export selected (
                        {selectedIds.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExport('all')}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                      >
                        <FiDownload size={14} className="text-slate-400" /> Export all
                      </button>
                    </div>
                  )}
                </div>
                <Button
                  onClick={handleCreate}
                  className="h-10 rounded-xl bg-gradient-to-b from-cyan-300 to-cyan-400 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:from-cyan-200 hover:to-cyan-300"
                >
                  <FiPlus className="mr-2" size={14} />
                  Add item
                </Button>
              </div>
            </div>
          </section>

          {/* KPI */}
          <section className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
            {items ? (
              <>
                <StatCard icon={FiBox} label="Total items" value={summary.total} accent="indigo" />
                <StatCard icon={FiCheckCircle} label="Active" value={summary.active} accent="emerald" />
                <StatCard icon={FiXCircle} label="Inactive" value={summary.inactive} accent="rose" />
                <StatCard icon={FiAlertCircle} label="Low stock" value={summary.lowStock} accent="amber" />
                <StatCard icon={FiTruck} label="Out of stock" value={summary.outOfStock} accent="violet" />
                <StatCard
                  icon={FiDollarSign}
                  label={
                    isWarehouseScoped
                      ? 'Warehouse value (est.)'
                      : 'Total value (est.)'
                  }
                  value={`₹${summary.totalValue.toFixed(2)}`}
                  accent="teal"
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
                      : 'Refine inventory by company, branch, brand, warehouse or status'}
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
                <div className="relative lg:col-span-3">
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-10 rounded-xl border-slate-200 pl-3.5 shadow-sm focus-visible:ring-4 focus-visible:ring-indigo-500/10"
                    placeholder="Search by name, SKU, barcode, brand…"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>

                <div className="lg:col-span-2">
                  <div className="relative">
                    <select
                      aria-label="Company"
                      value={filterCompany}
                      onChange={(e) => {
                        setFilterCompany(e.target.value);
                        setFilterBranch('all');
                        setFilterWarehouse('all');
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
                      onChange={(e) => {
                        setFilterBranch(e.target.value);
                        setFilterWarehouse('all');
                      }}
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

                <div className="lg:col-span-2">
                  <div className="relative">
                    <select
                      aria-label="Warehouse"
                      value={filterWarehouse}
                      onChange={(e) => setFilterWarehouse(e.target.value)}
                      className={`h-10 w-full appearance-none rounded-xl border bg-white px-3.5 pr-9 text-sm font-medium shadow-sm outline-none transition ${
                        filterWarehouse !== 'all'
                          ? 'border-indigo-400 text-indigo-700 ring-4 ring-indigo-500/10'
                          : 'border-slate-200 text-slate-700 hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10'
                      }`}
                    >
                      <option value="all">All warehouses</option>
                      {warehousesLoading && <option value="" disabled>Loading warehouses…</option>}
                      {filteredWarehousesFilter.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                    <MdWarehouse
                      className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 ${
                        filterWarehouse !== 'all' ? 'text-indigo-500' : 'text-slate-400'
                      }`}
                      size={14}
                    />
                  </div>
                </div>

                <div className="lg:col-span-1">
                  <div className="relative">
                    <select
                      aria-label="Brand"
                      value={filterBrand}
                      onChange={(e) => setFilterBrand(e.target.value)}
                      className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                    >
                      <option value="all">All brands</option>
                      {brands.map((b) => (
                        <option key={b} value={b}>
                          {b}
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

              {/* Active warehouse chip */}
              {isWarehouseScoped && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/60 px-3 py-2 text-xs text-indigo-800">
                  <MdWarehouse size={14} />
                  <span className="font-semibold">Warehouse view:</span>
                  <span>
                    {filteredWarehousesFilter.find((w) => String(w.id) === filterWarehouse)?.name ||
                      `#${filterWarehouse}`}
                  </span>
                  <span className="text-indigo-500/80">
                    · Stock numbers now come from{' '}
                    <code className="rounded bg-white/60 px-1 py-0.5 font-mono">
                      product_warehouse_stocks
                    </code>
                  </span>
                  {warehouseStockLoading && (
                    <span className="ml-1 inline-flex items-center gap-1 text-indigo-600">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-500" />
                      loading stock rows…
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setFilterWarehouse('all')}
                    className="ml-auto inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[11px] font-semibold text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-100"
                  >
                    <FiX size={11} /> Clear
                  </button>
                </div>
              )}
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
                  onClick={() => {
                    const qty = window.prompt('Enter new stock quantity:');
                    if (qty !== null && !isNaN(Number(qty)) && Number(qty) >= 0)
                      handleBulkUpdateStock(Number(qty));
                  }}
                >
                  <FiEdit className="mr-1.5 text-indigo-600" size={14} /> Update stock
                </Button>
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
                  {isWarehouseScoped ? <MdWarehouse size={14} /> : <FiPackage size={14} />}
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-800">
                    {isWarehouseScoped ? 'Warehouse inventory' : 'Inventory items'}
                  </CardTitle>
                  <CardDescription className="text-[11px] text-slate-500">
                    {isLoading
                      ? 'Loading inventory…'
                      : `${filteredItems.length.toLocaleString('en-IN')} record${
                          filteredItems.length === 1 ? '' : 's'
                        }${
                          isWarehouseScoped
                            ? ' · scoped to selected warehouse'
                            : ' · Click a row to view details'
                        }`}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <div className="overflow-x-auto">
              <Table className="min-w-[1140px]">
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
                      <TableHeadLabel>Item</TableHeadLabel>
                    </TableHead>
                    <TableHead>
                      <TableHeadLabel>SKU</TableHeadLabel>
                    </TableHead>
                    <TableHead>
                      <TableHeadLabel>Brand</TableHeadLabel>
                    </TableHead>
                    <TableHead className="text-right">
                      <TableHeadLabel align="right">{stockColumnLabel}</TableHeadLabel>
                    </TableHead>
                    <TableHead className="text-right">
                      <TableHeadLabel align="right">Sale price</TableHeadLabel>
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
                        {Array.from({ length: TABLE_COLUMN_COUNT }).map((__, cellIndex) => (
                          <TableCell key={cellIndex}>
                            <div className="h-4 animate-pulse rounded bg-slate-100" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}

                  {!isLoading &&
                    filteredItems.map((item) => {
                      const selected = selectedIds.includes(item.id);
                      const unitLabel = (item.unit || 'pcs').toString();
                      const reorder = safeNumber(item.reorder_level);

                      let displayQty: number;
                      let isPending = false;
                      let subLabel: string | null = null;

                      if (isWarehouseScoped) {
                        const rows = warehouseStockMap.get(item.id);
                        if (!rows) {
                          isPending = warehouseStockLoading;
                          displayQty = 0;
                        } else {
                          const row = getWarehouseStockRow(item.id, filterWarehouse);
                          displayQty = row ? safeNumber(row.quantity) : 0;
                          if (row && safeNumber(row.reserved_quantity) > 0) {
                            subLabel = `${safeNumber(row.reserved_quantity)} reserved`;
                          }
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
                        <TableRow
                          key={item.id}
                          data-state={selected ? 'selected' : undefined}
                          className={`cursor-pointer border-slate-100 transition-colors hover:bg-slate-50/70 ${
                            selected ? 'bg-indigo-50/40 hover:bg-indigo-50/60' : ''
                          }`}
                          onClick={() => handleView(item)}
                        >
                          <TableCell className="px-3" onClick={(e) => e.stopPropagation()}>
                            <input
                              aria-label={`Select ${item.name}`}
                              type="checkbox"
                              checked={selected}
                              onChange={(event) => {
                                event.stopPropagation();
                                toggleSelected(item.id);
                              }}
                              onClick={(event) => event.stopPropagation()}
                              className="h-4 w-4 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/30"
                            />
                          </TableCell>

                          <TableCell>
                            <div className="flex min-w-[220px] items-center gap-2.5">
                              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[11px] font-bold text-white">
                                {String(item.name ?? 'P').charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-900">
                                  {item.name}
                                </p>
                                {item.barcode && (
                                  <p className="truncate font-mono text-[11px] text-slate-500">
                                    {item.barcode}
                                  </p>
                                )}
                              </div>
                            </div>
                          </TableCell>

                          <TableCell>
                            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 font-mono text-[11px] text-slate-700">
                              {item.sku || '—'}
                            </span>
                          </TableCell>

                          <TableCell>
                            <span className="text-sm text-slate-700">{item.brand || '—'}</span>
                          </TableCell>

                          <TableCell className="whitespace-nowrap text-right">
                            <div className="inline-flex flex-col items-end gap-0.5">
                              {isPending ? (
                                <span className="inline-flex h-7 w-20 animate-pulse items-center justify-end rounded-lg bg-slate-100 px-2 text-[11px] text-slate-400">
                                  …
                                </span>
                              ) : (
                                <span
                                  className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold tabular-nums ${stockClass}`}
                                  title={
                                    displayQty <= 0
                                      ? 'Out of stock'
                                      : displayQty <= reorder
                                        ? `Low stock (reorder at ${reorder})`
                                        : `In stock (reorder at ${reorder})`
                                  }
                                >
                                  <span>{displayQty.toLocaleString('en-IN')}</span>
                                  <span className="text-[10px] font-medium uppercase opacity-70">
                                    {unitLabel}
                                  </span>
                                </span>
                              )}
                              {subLabel ? (
                                <span className="text-[10px] text-slate-500">{subLabel}</span>
                              ) : (
                                !isPending &&
                                reorder > 0 && (
                                  <span className="text-[10px] text-slate-400">
                                    reorder @ {reorder.toLocaleString('en-IN')}
                                  </span>
                                )
                              )}
                            </div>
                          </TableCell>

                          <TableCell className="whitespace-nowrap text-right text-sm font-semibold tabular-nums text-slate-900">
                            {safeCurrency(item.sale_price)}
                          </TableCell>

                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                                toBoolean(item.active)
                                  ? 'border-emerald-200/70 bg-emerald-50 text-emerald-700'
                                  : 'border-red-200/70 bg-red-50 text-red-700'
                              }`}
                            >
                              {toBoolean(item.active) ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>

                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <ActionDropdown
                              item={item}
                              onView={handleView}
                              onEdit={handleEdit}
                              onDelete={handleDelete}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}

                  {!isLoading && !filteredItems.length && (
                    <TableRow>
                      <TableCell colSpan={TABLE_COLUMN_COUNT} className="py-20 text-center">
                        <div className="mx-auto max-w-md px-4">
                          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-slate-200/70">
                            {isWarehouseScoped ? (
                              <MdWarehouse className="h-6 w-6 text-slate-400" />
                            ) : (
                              <FiFilter className="h-6 w-6 text-slate-400" />
                            )}
                          </div>
                          <p className="mt-4 text-base font-semibold text-slate-800">
                            {isWarehouseScoped
                              ? 'No products in this warehouse'
                              : 'No items found'}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            {isWarehouseScoped
                              ? 'No products have a stock row in this warehouse yet. Use Stock IN to add some.'
                              : 'Try adjusting the company, branch, brand, status, or search term.'}
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

      {/* Product Detail Modal */}
      {isViewPanelOpen && viewingItem && (
        <ProductDetailModal
          product={viewingItem}
          onClose={() => setIsViewPanelOpen(false)}
          onEdit={(item) => {
            setIsViewPanelOpen(false);
            handleEdit(item);
          }}
          onStockIn={(item) => {
            setIsViewPanelOpen(false);
            setViewingItem(item);
            setShowStockIn(true);
          }}
          onStockOut={(item) => {
            setIsViewPanelOpen(false);
            setViewingItem(item);
            setShowStockOut(true);
          }}
        />
      )}

      {/* Stock In / Out Modals */}
      {showStockIn && viewingItem && (
        <StockInModal
          product={viewingItem}
          onClose={() => setShowStockIn(false)}
          onSuccess={() => {
            refreshItems();
            // Invalidate the warehouse-stock cache so the next warehouse view
            // reflects the newly received stock.
            loadedWarehouseStockRef.current.clear();
            setWarehouseStockMap(new Map());
          }}
        />
      )}
      {showStockOut && viewingItem && (
        <StockOutModal
          product={viewingItem}
          onClose={() => setShowStockOut(false)}
          onSuccess={() => {
            refreshItems();
            loadedWarehouseStockRef.current.clear();
            setWarehouseStockMap(new Map());
          }}
        />
      )}

      {/* Form Offcanvas */}
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
            title={editingId ? 'Edit item' : 'Add item'}
            onClose={() => setIsPanelOpen(false)}
            className="inventory-offcanvas-wide"
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
                  {submitting ? 'Saving…' : editingId ? 'Update item' : 'Save item'}
                </Button>
              </div>
            }
          >
            <div className="inventory-form-scroll space-y-5 pr-2">
              {/* Basic information */}
              <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-indigo-500" /> Basic information
                </legend>
                <div className="mt-3 space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {renderField(
                      'Company',
                      'company_id',
                      'select',
                      companies?.map((c) => ({ id: c.id, name: c.name })),
                      true
                    )}
                    <div className="min-w-0">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Branch
                      </label>
                      <div className="relative">
                        <select
                          value={formData.branch_id as string}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, branch_id: e.target.value }))
                          }
                          disabled={!formData.company_id}
                          className={`h-10 w-full appearance-none rounded-xl border bg-white px-3.5 pr-9 text-sm font-medium shadow-sm outline-none transition ${
                            formErrors.branch_id
                              ? 'border-rose-300 ring-2 ring-rose-200'
                              : 'border-slate-200 text-slate-700 hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10'
                          } disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400`}
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
                    <div className="min-w-0">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Unit
                      </label>
                      <div className="relative">
                        <select
                          value={formData.unit}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, unit: e.target.value }))
                          }
                          className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                        >
                          {UNIT_OPTIONS.map((u) => (
                            <option key={u} value={u}>
                              {u}
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

              {/* Pricing */}
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

              {/* Stock & status */}
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

      {/* Import Offcanvas */}
      {isImportOpen && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm">
              <div className="rounded-2xl bg-white p-8 text-sm text-slate-600 shadow-xl">
                Loading…
              </div>
            </div>
          }
        >
          <Offcanvas
            isOpen={isImportOpen}
            title="Import inventory"
            onClose={() => setIsImportOpen(false)}
            className="inventory-offcanvas-wide"
            footer={
              <div className="flex w-full justify-between">
                <Button
                  variant="outline"
                  onClick={() => setIsImportOpen(false)}
                  disabled={importLoading}
                  className="rounded-xl"
                >
                  Close
                </Button>
                {importStep === 'select' && (
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-xl bg-indigo-600 font-semibold hover:bg-indigo-700"
                  >
                    Browse file
                  </Button>
                )}
                {importStep === 'preview' && !importLoading && (
                  <Button
                    onClick={handleImport}
                    disabled={!importSummary || importSummary.valid === 0}
                    className="rounded-xl bg-emerald-600 font-semibold hover:bg-emerald-700"
                  >
                    Import{importSummary ? ` (${importSummary.valid} valid)` : ''}
                  </Button>
                )}
                {importStep === 'result' && (
                  <Button
                    onClick={() => {
                      setIsImportOpen(false);
                      refreshItems();
                    }}
                    className="rounded-xl bg-indigo-600 font-semibold hover:bg-indigo-700"
                  >
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
                    Upload a CSV file to import inventory items. The file must match the required
                    format. You can download a template below.
                  </p>
                  <div
                    className={`rounded-2xl border-2 border-dashed p-8 text-center transition ${
                      dragOver ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300'
                    }`}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                  >
                    <FiUpload size={40} className="mx-auto mb-3 text-slate-400" />
                    <p className="text-sm text-slate-600">
                      Drag and drop your CSV file here, or click to browse
                    </p>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileChange(file);
                      }}
                      accept=".csv"
                      className="hidden"
                    />
                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      variant="outline"
                      className="mt-3 rounded-xl"
                    >
                      Browse files
                    </Button>
                  </div>
                  {importFile && (
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <FiFile className="shrink-0 text-indigo-600" size={16} />
                        <span className="truncate text-sm font-medium">{importFile.name}</span>
                        <span className="shrink-0 text-xs text-slate-500">
                          ({(importFile.size / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setImportFile(null);
                          if (fileInputRef.current) fileInputRef.current.value = '';
                          setImportStep('select');
                        }}
                        className="grid h-7 w-7 place-items-center rounded-lg text-red-500 transition hover:bg-red-50"
                        aria-label="Remove file"
                      >
                        <FiX size={16} />
                      </button>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <button
                      onClick={handleDownloadTemplate}
                      className="flex items-center gap-1 text-sm font-medium text-indigo-600 underline-offset-2 hover:underline"
                    >
                      <FiDownload size={14} /> Download template
                    </button>
                    {importFile && (
                      <Button
                        onClick={() => handlePreview(importFile)}
                        disabled={importLoading}
                        className="rounded-xl bg-slate-900 font-semibold hover:bg-slate-800"
                      >
                        {importLoading ? 'Processing…' : 'Preview'}
                      </Button>
                    )}
                  </div>
                </>
              )}

              {importStep === 'preview' && (
                <>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Duplicate SKU
                      </span>
                      <div className="relative">
                        <select
                          value={duplicateAction}
                          onChange={(e) =>
                            setDuplicateAction(e.target.value as DuplicateAction)
                          }
                          disabled={importLoading}
                          className="h-9 appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-8 text-sm font-medium text-slate-700 outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                        >
                          <option value="skip">Skip</option>
                          <option value="update">Update</option>
                          <option value="stop">Stop</option>
                        </select>
                        <FiChevronDown
                          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                          size={12}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-slate-600">
                        Total:{' '}
                        <strong className="text-slate-900">{importSummary?.total || 0}</strong>
                      </span>
                      <span className="text-emerald-600">
                        Valid: <strong>{importSummary?.valid || 0}</strong>
                      </span>
                      <span className="text-red-600">
                        Invalid: <strong>{importSummary?.invalid || 0}</strong>
                      </span>
                    </div>
                  </div>
                  {importLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50">
                            <tr>
                              {['#', 'Name', 'SKU', 'Barcode', 'Company', 'Branch', 'Sale price', 'Stock', 'Valid'].map(
                                (h) => (
                                  <th
                                    key={h}
                                    className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 ${
                                      h === 'Valid' ? 'text-left' : 'text-left'
                                    }`}
                                  >
                                    {h}
                                  </th>
                                )
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {importPreview.slice(0, 50).map((row) => (
                              <tr
                                key={row.row}
                                className={`border-t border-slate-100 ${
                                  row.valid ? '' : 'bg-red-50/60'
                                }`}
                              >
                                <td className="px-3 py-2 text-xs text-slate-600">{row.row}</td>
                                <td className="px-3 py-2 text-xs text-slate-700">
                                  {(row.data.name as string) || '—'}
                                </td>
                                <td className="px-3 py-2 text-xs text-slate-700">
                                  {(row.data.sku as string) || '—'}
                                </td>
                                <td className="px-3 py-2 text-xs text-slate-700">
                                  {(row.data.barcode as string) || '—'}
                                </td>
                                <td className="px-3 py-2 text-xs text-slate-700">
                                  {String(row.data.company_id ?? '—')}
                                </td>
                                <td className="px-3 py-2 text-xs text-slate-700">
                                  {String(row.data.branch_id ?? '—')}
                                </td>
                                <td className="px-3 py-2 text-xs text-slate-700">
                                  {String(row.data.sale_price ?? '—')}
                                </td>
                                <td className="px-3 py-2 text-xs text-slate-700">
                                  {String(row.data.stock_quantity ?? '—')}
                                </td>
                                <td className="px-3 py-2 text-xs">
                                  {row.valid ? (
                                    <FiCheck className="text-emerald-600" size={14} />
                                  ) : (
                                    <FiAlertTriangle
                                      className="text-red-600"
                                      size={14}
                                      aria-label={Object.values(row.errors).join(', ')}
                                    />
                                  )}
                                </td>
                              </tr>
                            ))}
                            {importPreview.length > 50 && (
                              <tr className="border-t border-slate-100">
                                <td
                                  colSpan={9}
                                  className="px-3 py-2 text-center text-xs text-slate-500"
                                >
                                  … and {importPreview.length - 50} more rows
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      {importErrors.length > 0 && (
                        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
                          <p className="mb-2 text-xs font-semibold text-red-700">
                            Validation errors
                          </p>
                          <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-red-600">
                            {importErrors.slice(0, 20).map((err, idx) => (
                              <li key={idx}>
                                Row {err.row}: {err.field} – {err.message}
                              </li>
                            ))}
                            {importErrors.length > 20 && (
                              <li>… and {importErrors.length - 20} more</li>
                            )}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {importStep === 'result' && (
                <div className="space-y-4">
                  <div
                    className={`rounded-xl p-4 ${
                      importSuccess
                        ? 'border border-emerald-200 bg-emerald-50'
                        : 'border border-red-200 bg-red-50'
                    }`}
                  >
                    <h3 className="text-base font-bold text-slate-900">
                      {importSuccess ? 'Import completed' : 'Import failed'}
                    </h3>
                    <p className="mt-1 text-sm text-slate-700">{importResultMessage}</p>
                  </div>
                  {importSummary && (
                    <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
                      <div className="rounded-xl bg-slate-50 p-3 text-center">
                        <div className="text-lg font-bold text-slate-900">
                          {importSummary.total}
                        </div>
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">
                          Total
                        </div>
                      </div>
                      <div className="rounded-xl bg-emerald-50 p-3 text-center">
                        <div className="text-lg font-bold text-emerald-700">
                          {importSummary.created ?? 0}
                        </div>
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">
                          Created
                        </div>
                      </div>
                      <div className="rounded-xl bg-indigo-50 p-3 text-center">
                        <div className="text-lg font-bold text-indigo-700">
                          {importSummary.updated ?? 0}
                        </div>
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">
                          Updated
                        </div>
                      </div>
                      <div className="rounded-xl bg-amber-50 p-3 text-center">
                        <div className="text-lg font-bold text-amber-700">
                          {importSummary.skipped ?? 0}
                        </div>
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">
                          Skipped
                        </div>
                      </div>
                      <div className="rounded-xl bg-red-50 p-3 text-center">
                        <div className="text-lg font-bold text-red-700">
                          {importSummary.failed ?? 0}
                        </div>
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">
                          Failed
                        </div>
                      </div>
                    </div>
                  )}
                  {importErrors.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
                          Errors ({importErrors.length})
                        </p>
                        <button
                          onClick={handleDownloadErrorReport}
                          className="flex items-center gap-1 text-xs font-medium text-indigo-600 underline-offset-2 hover:underline"
                        >
                          <FiDownload size={12} /> Download report
                        </button>
                      </div>
                      <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                Row
                              </th>
                              <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                Field
                              </th>
                              <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                Message
                              </th>
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
                                <td
                                  colSpan={3}
                                  className="px-3 py-1.5 text-center text-slate-500"
                                >
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