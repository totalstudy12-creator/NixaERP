// src/pages/PurchasePage.tsx
import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  lazy,
  Suspense,
  memo,
  useRef,
  startTransition,
} from 'react';
import ReactDOM from 'react-dom';
import {
  FiPlus,
  FiTrash2,
  FiDownload,
  FiEye,
  FiEdit,
  FiCheckCircle,
  FiAlertCircle,
  FiFilter,
  FiSearch,
  FiChevronDown,
  FiPrinter,
  FiPackage,
  FiCreditCard,
  FiCopy,
  FiMoreVertical,
  FiUpload,
  FiX,
  FiTrendingUp,
  FiTrendingDown,
  FiCalendar,
  FiHome,
} from 'react-icons/fi';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';
import InvoicePrint from '../components/InvoicePrint';

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

// ---------- Lazy loaded heavy components ----------
const Offcanvas = lazy(() =>
  import('../components/Offcanvas').then((m) => ({ default: m.Offcanvas }))
);

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface Supplier {
  id: number;
  name: string;
  email?: string | null;
}

interface PurchaseItem {
  id?: number;
  product_id?: number;
  product_name?: string | null;
  quantity?: number | string | null;
  purchase_price?: number | string | null;
  total?: number | string | null;
}

interface PurchaseInvoice {
  id: number;
  purchase_number: string;
  bill_number?: string | null;
  supplier_id: number;
  supplier?: Supplier | null;
  grand_total: number | string;
  paid_amount: number | string;
  status: string;
  payment_status: string;
  purchase_date: string;
  due_date?: string | null;
  warehouse?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  items?: PurchaseItem[];
  payments?: Array<{ id?: number; amount?: number | string | null; payment_direction?: string | null }>;
  company_id?: number;
  company?: { id: number; name: string } | null;
  branch_id?: number | null;
  [key: string]: unknown;
}

interface Company {
  id: number;
  name: string;
}

interface Branch {
  id: number;
  company_id: number;
  name: string;
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
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const PAYMENT_STATUS_OPTIONS = [
  { value: 'all', label: 'All payment states' },
  { value: 'Paid', label: 'Fully paid' },
  { value: 'Partial', label: 'Partially paid' },
  { value: 'Unpaid', label: 'Unpaid' },
] as const;

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'Draft', label: 'Draft' },
  { value: 'Ordered', label: 'Ordered' },
  { value: 'Received', label: 'Received' },
  { value: 'Completed', label: 'Completed' },
  { value: 'Cancelled', label: 'Cancelled' },
] as const;

const TABLE_COLUMN_COUNT = 10; // checkbox + 8 data columns + action
const CACHE_TTL_MS = 300_000;
const SEARCH_DEBOUNCE_MS = 350;
const TABLE_HEAD_CLASS = 'text-[11px] font-semibold uppercase tracking-wide text-slate-500';

/* ------------------------------------------------------------------ */
/* Safe helpers                                                        */
/* ------------------------------------------------------------------ */

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null) {
    const e = error as ApiErrorLike;
    const candidate = e.response?.data?.message || e.message;
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

/** Safely format any date-like value. */
function formatDate(value: unknown): string {
  if (!value) return '—';
  const str = typeof value === 'string' ? value : String(value);
  const dateValue = str.slice(0, 10);
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

function getLocalToday(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getMonthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
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
          ? res
          : ((res as { data?: T })?.data ?? ([] as unknown as T));
        cache.set(key, { data: result, timestamp: Date.now() });
        setData(result as T);
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
/* Shared table header label                                           */
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
      <div className="h-6 w-24 animate-pulse rounded bg-slate-200" />
    </div>
  </div>
));
StatCardSkeleton.displayName = 'StatCardSkeleton';

/* ------------------------------------------------------------------ */
/* Stat card                                                           */
/* ------------------------------------------------------------------ */

type Accent = 'indigo' | 'emerald' | 'rose' | 'amber' | 'violet' | 'teal';

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
/* Portal-based Action Dropdown                                        */
/* ------------------------------------------------------------------ */

const MENU_WIDTH = 200;
const MENU_HEIGHT = 260;
const MENU_MARGIN = 8;

const ActionDropdown = memo(
  ({
    row,
    onPrint,
    onRecordPayment,
    onDuplicate,
    onDelete,
  }: {
    row: PurchaseInvoice;
    onPrint: (p: PurchaseInvoice) => void;
    onRecordPayment: (p: PurchaseInvoice) => void;
    onDuplicate: (p: PurchaseInvoice) => void;
    onDelete: (p: PurchaseInvoice) => void;
  }) => {
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

    const toggle = useCallback(() => {
      startTransition(() => {
        setOpen((prev) => {
          const willOpen = !prev;
          if (willOpen && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
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
          return willOpen;
        });
      });
    }, []);

    useEffect(() => {
      if (!open) return;
      const handler = (e: MouseEvent) => {
        if (
          menuRef.current &&
          !menuRef.current.contains(e.target as Node) &&
          buttonRef.current &&
          !buttonRef.current.contains(e.target as Node)
        ) {
          startTransition(() => setOpen(false));
        }
      };
      const onScrollOrResize = () => startTransition(() => setOpen(false));
      document.addEventListener('mousedown', handler);
      window.addEventListener('resize', onScrollOrResize);
      window.addEventListener('scroll', onScrollOrResize, true);
      return () => {
        document.removeEventListener('mousedown', handler);
        window.removeEventListener('resize', onScrollOrResize);
        window.removeEventListener('scroll', onScrollOrResize, true);
      };
    }, [open]);

    const closeAndAct = useCallback((action: () => void) => {
      startTransition(() => setOpen(false));
      action();
    }, []);

    return (
      <>
        <button
          ref={buttonRef}
          onClick={toggle}
          aria-label={`Actions for ${row.purchase_number}`}
          aria-haspopup="menu"
          aria-expanded={open}
          className={`grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 ${
            open ? 'bg-slate-100 text-slate-700' : ''
          }`}
          title="More actions"
        >
          <FiMoreVertical size={16} />
        </button>
        {open &&
          ReactDOM.createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={menuStyle}
              className="animate-fadeIn overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl shadow-slate-900/10"
            >
              <Link
                to={`/purchases/${row.id}/edit`}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                onClick={() => closeAndAct(() => {})}
              >
                <FiEdit size={16} className="text-slate-400" /> Edit
              </Link>

              <button
                onClick={() => closeAndAct(() => onDuplicate(row))}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
              >
                <FiCopy size={16} className="text-slate-400" /> Duplicate
              </button>

              <div className="my-1 border-t border-slate-100" />

              <button
                onClick={() => closeAndAct(() => onPrint(row))}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
              >
                <FiPrinter size={16} className="text-slate-400" /> Print (A4)
              </button>

              <button
                onClick={() => closeAndAct(() => onRecordPayment(row))}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
              >
                <FiCreditCard size={16} className="text-slate-400" /> Record Payment
              </button>

              <div className="my-1 border-t border-slate-100" />

              <button
                onClick={() => closeAndAct(() => onDelete(row))}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50"
              >
                <FiTrash2 size={16} /> Delete
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
/* CSV Parser                                                          */
/* ------------------------------------------------------------------ */

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) return [];

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  };

  const headers = parseLine(lines[0]).map((h) => h.trim().toLowerCase());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    if (values.length !== headers.length) continue;
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx].trim();
    });
    rows.push(row);
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* Import helpers                                                      */
/* ------------------------------------------------------------------ */

function extractId(obj: unknown, depth = 0): number | null {
  if (depth > 4 || obj == null) return null;
  if (typeof obj === 'number') return Number.isFinite(obj) ? obj : null;
  if (typeof obj === 'string' && /^\d+$/.test(obj)) return parseInt(obj, 10);
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const id = extractId(item, depth + 1);
      if (id) return id;
    }
    return null;
  }
  if (typeof obj === 'object') {
    const record = obj as Record<string, unknown>;
    if ('id' in record) {
      const idVal = record.id;
      if (typeof idVal === 'number') return idVal;
      if (typeof idVal === 'string' && /^\d+$/.test(idVal)) return parseInt(idVal, 10);
    }
    if ('data' in record && record.data && typeof record.data === 'object' && !Array.isArray(record.data)) {
      const dataId = extractId(record.data, depth + 1);
      if (dataId) return dataId;
    }
    for (const key of Object.keys(record)) {
      if (key.toLowerCase().includes('id')) {
        const val = record[key];
        if (typeof val === 'number') return val;
        if (typeof val === 'string' && /^\d+$/.test(val)) return parseInt(val, 10);
      }
    }
    for (const key of Object.keys(record)) {
      const val = record[key];
      if (val && typeof val === 'object') {
        const id = extractId(val, depth + 1);
        if (id) return id;
      }
    }
  }
  return null;
}

async function resolveSupplier(
  row: Record<string, unknown>,
  knownSuppliers: Supplier[],
  setSuppliers: (list: Supplier[]) => void
): Promise<number | null> {
  if (row.supplier_id && !isNaN(Number(row.supplier_id))) return Number(row.supplier_id);
  if (!row.supplier_name) return null;

  let allSuppliers = knownSuppliers;
  if (allSuppliers.length === 0) {
    try {
      const res = await apiClient.request('GET', '/suppliers');
      allSuppliers = unwrapList<Supplier>(res);
      setSuppliers(allSuppliers);
    } catch {
      /* silent */
    }
  }

  const email = String(row.supplier_email ?? '').toLowerCase();
  const name = String(row.supplier_name ?? '').toLowerCase();
  const matched = allSuppliers.find(
    (s) => (email && s.email?.toLowerCase() === email) || s.name.toLowerCase() === name
  );
  if (matched) return matched.id;

  try {
    const newSupplier = await apiClient.request('POST', '/suppliers', {
      name: row.supplier_name,
      email: row.supplier_email || undefined,
    });
    return extractId(newSupplier);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Purchase Import Modal                                               */
/* ------------------------------------------------------------------ */

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
}

type ImportRow = Record<string, unknown>;

const PurchaseImportModal = memo(({ isOpen, onClose, onImported }: ImportModalProps) => {
  const { showSuccess, showError } = useNotification();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedRows, setParsedRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [defaultCompanyId, setDefaultCompanyId] = useState('');
  const [defaultBranchId, setDefaultBranchId] = useState('');
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    setLoadingCompanies(true);

    apiClient
      .getCompanies()
      .then((res: unknown) => {
        if (!active) return;
        const list = unwrapList<Company>(res);
        setCompanies(list);
        if (list.length > 0) setDefaultCompanyId(String(list[0].id));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingCompanies(false);
      });

    apiClient
      .request('GET', '/suppliers')
      .then((res: unknown) => {
        if (!active) return;
        setSuppliers(unwrapList<Supplier>(res));
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setParsedRows([]);
      setFileName('');
      setError(null);
      setImportProgress({ current: 0, total: 0 });
      setCompanies([]);
      setBranches([]);
      setSuppliers([]);
      setDefaultCompanyId('');
      setDefaultBranchId('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!defaultCompanyId) {
      setBranches([]);
      setDefaultBranchId('');
      return;
    }
    let active = true;
    setLoadingBranches(true);
    apiClient
      .getBranchesByCompany(Number(defaultCompanyId))
      .then((res: unknown) => {
        if (!active) return;
        const list = unwrapList<Branch>(res);
        setBranches(list);
        setDefaultBranchId(list.length > 0 ? String(list[0].id) : '');
      })
      .catch(() => {
        if (active) {
          setBranches([]);
          setDefaultBranchId('');
        }
      })
      .finally(() => {
        if (active) setLoadingBranches(false);
      });
    return () => {
      active = false;
    };
  }, [defaultCompanyId]);

  const handleFile = useCallback((file: File) => {
    setError(null);
    setParsedRows([]);
    setFileName(file.name);

    const extension = file.name.split('.').pop()?.toLowerCase();
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) ?? '';
      try {
        if (extension === 'json') {
          const data = JSON.parse(text);
          if (!Array.isArray(data)) {
            throw new Error('JSON file must contain an array of purchase objects.');
          }
          setParsedRows(data as ImportRow[]);
        } else if (extension === 'csv') {
          setParsedRows(parseCSV(text));
        } else {
          throw new Error('Unsupported file type. Please upload .csv or .json.');
        }
      } catch (err: unknown) {
        setError(getErrorMessage(err, 'Failed to parse file.'));
        setParsedRows([]);
      }
    };
    reader.onerror = () => setError('Failed to read file.');
    reader.readAsText(file);
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const downloadTemplate = (type: 'csv' | 'json') => {
    if (type === 'csv') {
      const csvContent = `purchase_number,supplier_id,supplier_name,supplier_email,purchase_date,due_date,grand_total,paid_amount,status,payment_status,warehouse,company_id,branch_id,payment_amount,payment_method,payment_reference,payment_date,payment_notes,payment_direction\nPO-2024-001,1,ABC Supplies,supplier@abc.com,2024-01-15,2024-02-15,1000.00,500.00,Ordered,Partial,Main Warehouse,1,1,500.00,Bank Transfer,REF001,2024-01-15,Partial payment,outward`;
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'purchase_template.csv';
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const jsonData = [
        {
          purchase_number: 'PO-2024-001',
          supplier_id: 1,
          supplier_name: 'ABC Supplies',
          supplier_email: 'supplier@abc.com',
          purchase_date: '2024-01-15',
          due_date: '2024-02-15',
          grand_total: 1000.0,
          paid_amount: 500.0,
          status: 'Ordered',
          payment_status: 'Partial',
          warehouse: 'Main Warehouse',
          company_id: 1,
          branch_id: 1,
          items: [{ product_id: 1, quantity: 1, unit_price: 1000.0, total: 1180.0 }],
          payments: [
            {
              amount: 500.0,
              payment_method: 'Bank Transfer',
              reference: 'REF001',
              payment_date: '2024-01-15',
              notes: 'Partial payment',
              payment_direction: 'outward',
              company_id: 1,
              branch_id: 1,
            },
          ],
        },
      ];
      const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'purchase_template.json';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleImport = async () => {
    if (parsedRows.length === 0) {
      setError('No data to import.');
      return;
    }
    const firstRow = parsedRows[0];
    const keys = Object.keys(firstRow).map((k) => k.toLowerCase());
    const required = ['purchase_number', 'grand_total'];
    const missing = required.filter((f) => !keys.includes(f));
    if (missing.length > 0) {
      setError(`Missing required columns: ${missing.join(', ')}`);
      return;
    }
    if (!defaultCompanyId) {
      setError('Please select a default company.');
      return;
    }

    setIsImporting(true);
    setImportProgress({ current: 0, total: parsedRows.length });
    let successCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < parsedRows.length; i++) {
      const row = parsedRows[i];
      const normalizedRow: Record<string, unknown> = {};
      Object.keys(row).forEach((key) => {
        normalizedRow[key.toLowerCase()] = row[key];
      });

      try {
        const supplierId = await resolveSupplier(normalizedRow, suppliers, setSuppliers);
        if (!supplierId) throw new Error('Supplier not found and could not be created.');

        const companyId = normalizedRow.company_id
          ? Number(normalizedRow.company_id)
          : Number(defaultCompanyId);
        const branchId = normalizedRow.branch_id
          ? Number(normalizedRow.branch_id)
          : defaultBranchId
            ? Number(defaultBranchId)
            : undefined;

        const grandTotal = safeNum(normalizedRow.grand_total);
        const paidAmount = safeNum(normalizedRow.paid_amount);

        const status = String(normalizedRow.status || 'Ordered');
        const paymentStatus = String(
          normalizedRow.payment_status ||
            (paidAmount >= grandTotal ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Unpaid')
        );

        const payload: Record<string, unknown> = {
          purchase_number: normalizedRow.purchase_number,
          supplier_id: supplierId,
          purchase_date: normalizedRow.purchase_date || getLocalToday(),
          due_date: normalizedRow.due_date || null,
          grand_total: grandTotal,
          paid_amount: paidAmount,
          status,
          payment_status: paymentStatus,
          warehouse: normalizedRow.warehouse || undefined,
          company_id: companyId,
          branch_id: branchId,
          items: Array.isArray(normalizedRow.items)
            ? (normalizedRow.items as Record<string, unknown>[]).map((item) => ({
                product_id: Number(item.product_id),
                product_name: item.product_name || '',
                quantity: Number(item.quantity || 1),
                purchase_price: Number(item.purchase_price || item.unit_price || 0),
                total: Number(item.total || safeNum(item.quantity) * safeNum(item.purchase_price)),
              }))
            : [],
        };
        Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);

        let newPurchaseResponse: unknown;
        if (typeof (apiClient as { createPurchaseInvoice?: unknown }).createPurchaseInvoice === 'function') {
          newPurchaseResponse = await (
            apiClient as { createPurchaseInvoice: (p: unknown) => Promise<unknown> }
          ).createPurchaseInvoice(payload);
        } else {
          newPurchaseResponse = await apiClient.request('POST', '/purchase-invoices', payload);
        }

        const newPurchaseId = extractId(newPurchaseResponse);
        if (!newPurchaseId) throw new Error('Purchase created but ID extraction failed.');

        const paymentAmount = safeNum(normalizedRow.payment_amount);
        if (paymentAmount > 0) {
          await apiClient.request('POST', '/payments', {
            company_id: companyId,
            invoice_id: newPurchaseId,
            reference_no: String(normalizedRow.payment_reference || `PAY-${newPurchaseId}-1`),
            amount: paymentAmount,
            payment_method: String(normalizedRow.payment_method || 'bank_transfer'),
            status: 'completed',
            payment_direction: String(normalizedRow.payment_direction || 'outward'),
            transaction_date: normalizedRow.payment_date || getLocalToday(),
            remarks: String(normalizedRow.payment_notes || ''),
            ...(branchId && { branch_id: branchId }),
          });
        }

        successCount++;
      } catch (err: unknown) {
        errors.push(`Row ${i + 1}: ${getErrorMessage(err, 'Unknown error')}`);
      }
      setImportProgress({ current: i + 1, total: parsedRows.length });
    }

    setIsImporting(false);
    if (successCount > 0) {
      showSuccess('Import completed', `${successCount} purchase(s) created.`);
      safeLog({
        module: 'Purchases',
        action: 'Import',
        status: 'success',
        message: `Imported ${successCount} purchases from ${fileName}`,
      });
      onImported();
    }
    if (errors.length > 0) {
      const summary = errors.slice(0, 5).join('; ');
      showError('Some rows failed', summary);
      setError(summary);
    } else if (successCount === parsedRows.length) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={onClose} />
        <div className="animate-fadeIn relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-500/10">
                <FiUpload size={18} />
              </div>
              <div>
                <h2 className="text-lg font-bold tracking-tight text-slate-900">Import Purchases</h2>
                <p className="text-xs text-slate-500">Upload a CSV or JSON file to bulk create purchases.</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close"
            >
              <FiX size={18} />
            </button>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Default Company *
              </label>
              <div className="relative">
                <select
                  value={defaultCompanyId}
                  onChange={(e) => setDefaultCompanyId(e.target.value)}
                  className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                  disabled={loadingCompanies}
                >
                  <option value="">Select Company</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <FiChevronDown
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                  size={16}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Default Branch
              </label>
              <div className="relative">
                <select
                  value={defaultBranchId}
                  onChange={(e) => setDefaultBranchId(e.target.value)}
                  className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                  disabled={loadingBranches || !defaultCompanyId}
                >
                  <option value="">Select Branch</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <FiChevronDown
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                  size={16}
                />
              </div>
            </div>
          </div>

          <div className="mb-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-xs text-slate-600">
            <p className="mb-2 font-semibold text-slate-700">File format requirements</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>CSV or JSON file.</li>
              <li>
                Required columns: <code className="rounded bg-slate-100 px-1">purchase_number</code>,{' '}
                <code className="rounded bg-slate-100 px-1">grand_total</code>
              </li>
              <li>
                Supplier: <code className="rounded bg-slate-100 px-1">supplier_id</code> or{' '}
                <code className="rounded bg-slate-100 px-1">supplier_name</code>
              </li>
              <li>Company/Branch fall back to the defaults above.</li>
              <li>Payments supported via dedicated columns or a JSON array.</li>
            </ul>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.json"
              onChange={onFileChange}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <FiUpload size={16} /> Choose File
            </button>
            <span className="truncate text-sm text-slate-500">{fileName || 'No file selected'}</span>
          </div>

          <div className="mb-4 flex flex-wrap gap-4">
            <button
              onClick={() => downloadTemplate('csv')}
              className="text-sm font-medium text-indigo-600 underline-offset-2 hover:underline"
            >
              Download CSV template
            </button>
            <button
              onClick={() => downloadTemplate('json')}
              className="text-sm font-medium text-indigo-600 underline-offset-2 hover:underline"
            >
              Download JSON template
            </button>
          </div>

          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50/80 p-3 text-sm text-rose-700">
              <FiAlertCircle className="mt-0.5 shrink-0" size={16} />
              <span className="break-words">{error}</span>
            </div>
          )}

          {parsedRows.length > 0 && (
            <div className="mb-4 max-h-64 overflow-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    {Object.keys(parsedRows[0])
                      .slice(0, 8)
                      .map((key) => (
                        <th
                          key={key}
                          className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500"
                        >
                          {key}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.slice(0, 10).map((row, idx) => (
                    <tr key={idx} className="border-t border-slate-100">
                      {Object.values(row)
                        .slice(0, 8)
                        .map((value, i) => (
                          <td key={i} className="max-w-[150px] truncate px-2 py-1.5 text-xs">
                            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                          </td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsedRows.length > 10 && (
                <div className="border-t border-slate-100 p-2 text-xs text-slate-500">
                  Showing first 10 of {parsedRows.length} rows
                </div>
              )}
            </div>
          )}

          {isImporting && (
            <div className="mb-4">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <FiPackage className="animate-spin" size={16} />
                Importing… {importProgress.current}/{importProgress.total}
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-2 rounded-full bg-indigo-600 transition-all"
                  style={{
                    width: `${
                      importProgress.total > 0
                        ? (importProgress.current / importProgress.total) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={onClose}
              disabled={isImporting}
              className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={parsedRows.length === 0 || isImporting}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {isImporting ? 'Importing…' : 'Import Purchases'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
PurchaseImportModal.displayName = 'PurchaseImportModal';

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export function PurchasePage() {
  const navigate = useNavigate();
  const { showSuccess, showError } = useNotification();

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPaymentStatus, setFilterPaymentStatus] = useState('all');
  const [filterCompanyId, setFilterCompanyId] = useState<number | undefined>(undefined);
  const [filterDateFrom, setFilterDateFrom] = useState(getMonthStart());
  const [filterDateTo, setFilterDateTo] = useState(getLocalToday());

  const [isViewPanelOpen, setIsViewPanelOpen] = useState(false);
  const [viewingPurchase, setViewingPurchase] = useState<PurchaseInvoice | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [printInvoice, setPrintInvoice] = useState<PurchaseInvoice | null>(null);
  const printTriggered = useRef(false);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [payingPurchase, setPayingPurchase] = useState<PurchaseInvoice | null>(null);
  const [payAmt, setPayAmt] = useState('');
  const [payMethod, setPayMethod] = useState('Bank Transfer');
  const [payDirection, setPayDirection] = useState<'inward' | 'outward'>('outward');
  const [paySubmitting, setPaySubmitting] = useState(false);

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);

  /* -------------------- Search debounce -------------------- */

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  /* -------------------- Load companies -------------------- */

  useEffect(() => {
    let active = true;
    apiClient
      .getCompanies()
      .then((res: unknown) => {
        if (active) setCompanies(unwrapList<Company>(res));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  /* -------------------- Data fetch -------------------- */

  const {
    data: purchases,
    loading,
    error,
    refresh,
  } = useApiCache<PurchaseInvoice[]>('purchase-invoices', () => apiClient.getPurchaseInvoices());

  /* -------------------- Client-side filtering -------------------- */

  const filteredPurchases = useMemo(() => {
    if (!purchases) return [];
    let filtered = [...purchases];

    if (search) {
      const term = search.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.purchase_number?.toLowerCase().includes(term) ||
          (p.supplier?.name || '').toLowerCase().includes(term) ||
          p.status?.toLowerCase().includes(term)
      );
    }

    if (filterStatus !== 'all') {
      filtered = filtered.filter((p) => p.status === filterStatus);
    }

    if (filterPaymentStatus !== 'all') {
      filtered = filtered.filter((p) => p.payment_status === filterPaymentStatus);
    }

    if (filterCompanyId) {
      filtered = filtered.filter((p) => p.company_id === filterCompanyId);
    }

    if (filterDateFrom) {
      filtered = filtered.filter((p) => p.purchase_date && p.purchase_date >= filterDateFrom);
    }
    if (filterDateTo) {
      filtered = filtered.filter((p) => p.purchase_date && p.purchase_date <= filterDateTo);
    }

    return filtered;
  }, [purchases, search, filterStatus, filterPaymentStatus, filterCompanyId, filterDateFrom, filterDateTo]);

  /* -------------------- Summary (from filtered data) -------------------- */

  const summary = useMemo(() => {
    const rows = filteredPurchases;
    const total = rows.length;
    const totalAmount = rows.reduce((s, p) => s + safeNum(p.grand_total), 0);
    const paidAmount = rows.reduce((s, p) => s + safeNum(p.paid_amount), 0);
    const outstanding = totalAmount - paidAmount;
    return { total, totalAmount, paidAmount, outstanding };
  }, [filteredPurchases]);

  /* -------------------- Pagination -------------------- */

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;
  const totalPages = Math.max(1, Math.ceil(filteredPurchases.length / rowsPerPage));
  const paginatedPurchases = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredPurchases.slice(start, start + rowsPerPage);
  }, [filteredPurchases, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterStatus, filterPaymentStatus, filterCompanyId, filterDateFrom, filterDateTo]);

  /* -------------------- Clear selection on filter change -------------------- */

  useEffect(() => {
    setSelectedIds([]);
  }, [search, filterStatus, filterPaymentStatus, filterCompanyId, filterDateFrom, filterDateTo, currentPage]);

  /* -------------------- A4 Print -------------------- */

  const handlePrint = useCallback((invoice: PurchaseInvoice) => {
    setPrintInvoice(invoice);
    printTriggered.current = false;
  }, []);

  useEffect(() => {
    if (printInvoice && !printTriggered.current) {
      const timer = setTimeout(() => {
        window.print();
        printTriggered.current = true;
        setPrintInvoice(null);
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [printInvoice]);

  /* -------------------- Bulk actions -------------------- */

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Delete ${selectedIds.length} purchase(s)?`)) return;
    try {
      await Promise.all(selectedIds.map((id) => apiClient.deletePurchaseInvoice(id)));
      showSuccess('Bulk delete', `${selectedIds.length} purchase(s) deleted.`);
      safeLog({
        module: 'Purchases',
        action: 'Bulk delete',
        status: 'success',
        message: `Deleted ${selectedIds.length} purchases`,
      });
      startTransition(() => setSelectedIds([]));
      refresh();
    } catch (err: unknown) {
      showError('Bulk delete failed', getErrorMessage(err, 'Bulk delete failed.'));
    }
  };

  const handleBulkStatusChange = async (status: string) => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Change ${selectedIds.length} purchase(s) to "${status}"?`)) return;
    try {
      await Promise.all(
        selectedIds.map((id) =>
          apiClient.updatePurchaseInvoice(id, { status } as Partial<PurchaseInvoice>)
        )
      );
      showSuccess('Bulk update', `${selectedIds.length} purchase(s) updated.`);
      safeLog({
        module: 'Purchases',
        action: 'Bulk status change',
        status: 'success',
        message: `Changed status to ${status} for ${selectedIds.length} purchases`,
      });
      startTransition(() => setSelectedIds([]));
      refresh();
    } catch (err: unknown) {
      showError('Bulk update failed', getErrorMessage(err, 'Bulk update failed.'));
    }
  };

  const handleView = useCallback((purchase: PurchaseInvoice) => {
    setViewingPurchase(purchase);
    setIsViewPanelOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (purchase: PurchaseInvoice) => {
      if (!window.confirm(`Delete purchase ${purchase.purchase_number}?`)) return;
      try {
        await apiClient.deletePurchaseInvoice(purchase.id);
        showSuccess('Purchase deleted', `Purchase ${purchase.purchase_number} removed.`);
        safeLog({
          module: 'Purchases',
          action: 'Delete',
          status: 'success',
          message: `Deleted ${purchase.purchase_number}`,
        });
        refresh();
      } catch (err: unknown) {
        showError('Delete failed', getErrorMessage(err, 'Delete failed.'));
      }
    },
    [refresh, showSuccess, showError]
  );

  /* -------------------- Duplicate: prefill create page -------------------- */

  const handleDuplicate = useCallback(
    (purchase: PurchaseInvoice) => {
      const params = new URLSearchParams();
      params.set('duplicate_from', String(purchase.id));
      if (purchase.supplier_id) params.set('supplier_id', String(purchase.supplier_id));
      if (purchase.company_id) params.set('company_id', String(purchase.company_id));
      if (purchase.branch_id) params.set('branch_id', String(purchase.branch_id));
      navigate(`/purchases/create?${params.toString()}`);
      showSuccess('Duplicating', `Prefilling new purchase from ${purchase.purchase_number}.`);
    },
    [navigate, showSuccess]
  );

  const handleRecordPaymentTrigger = useCallback((purchase: PurchaseInvoice) => {
    setPayingPurchase(purchase);
    setPayAmt('');
    setPayMethod('Bank Transfer');
    setPayDirection('outward');
    setShowPaymentModal(true);
  }, []);

  const handleRecordPaymentSubmit = async () => {
    if (!payingPurchase) return;
    const amount = parseFloat(payAmt);
    if (!Number.isFinite(amount) || amount <= 0) {
      showError('Validation', 'Please enter a valid amount.');
      return;
    }
    setPaySubmitting(true);
    try {
      const companyId = payingPurchase.company_id || companies[0]?.id || 1;
      await apiClient.request('POST', '/payments', {
        company_id: companyId,
        invoice_id: payingPurchase.id,
        reference_no: `PAY-${payingPurchase.id}-${Date.now()}`,
        amount,
        payment_method: payMethod.toLowerCase().replace(' ', '_'),
        status: 'completed',
        payment_direction: payDirection,
        transaction_date: getLocalToday(),
        remarks: '',
      });
      showSuccess('Payment recorded', `₹${amount.toFixed(2)} recorded.`);
      safeLog({
        module: 'Purchases',
        action: 'Record Payment',
        status: 'success',
        message: `Payment of ₹${amount} for ${payingPurchase.purchase_number}`,
      });
      setShowPaymentModal(false);
      setPayingPurchase(null);
      refresh();
    } catch (err: unknown) {
      showError('Payment failed', getErrorMessage(err, 'Payment failed.'));
    } finally {
      setPaySubmitting(false);
    }
  };

  /* -------------------- Export -------------------- */

  const handleExport = useCallback(() => {
    if (filteredPurchases.length === 0) {
      showError('Export failed', 'No data');
      return;
    }
    const headers = ['Purchase #', 'Supplier', 'Company', 'Date', 'Total', 'Paid', 'Outstanding', 'Status', 'Payment'];
    const rows = filteredPurchases.map((p) =>
      [
        escapeCsvField(p.purchase_number),
        escapeCsvField(p.supplier?.name || ''),
        escapeCsvField(p.company?.name || ''),
        escapeCsvField(p.purchase_date),
        safeNum(p.grand_total).toFixed(2),
        safeNum(p.paid_amount).toFixed(2),
        (safeNum(p.grand_total) - safeNum(p.paid_amount)).toFixed(2),
        escapeCsvField(p.status),
        escapeCsvField(p.payment_status),
      ].join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `purchases-${getLocalToday()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showSuccess('Export', 'File downloaded.');
  }, [filteredPurchases, showSuccess, showError]);

  /* -------------------- Filter presets -------------------- */

  const setDatePreset = (preset: 'today' | '7d' | '30d' | 'month' | 'all') => {
    const today = getLocalToday();
    if (preset === 'today') {
      setFilterDateFrom(today);
      setFilterDateTo(today);
    } else if (preset === '7d') {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      setFilterDateFrom(d.toISOString().slice(0, 10));
      setFilterDateTo(today);
    } else if (preset === '30d') {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      setFilterDateFrom(d.toISOString().slice(0, 10));
      setFilterDateTo(today);
    } else if (preset === 'month') {
      setFilterDateFrom(getMonthStart());
      setFilterDateTo(today);
    } else {
      setFilterDateFrom('');
      setFilterDateTo('');
    }
  };

  const clearFilters = useCallback(() => {
    setSearchInput('');
    setSearch('');
    setFilterStatus('all');
    setFilterPaymentStatus('all');
    setFilterCompanyId(undefined);
    setFilterDateFrom(getMonthStart());
    setFilterDateTo(getLocalToday());
  }, []);

  const activeFilterCount = [
    search,
    filterStatus !== 'all' ? filterStatus : undefined,
    filterPaymentStatus !== 'all' ? filterPaymentStatus : undefined,
    filterCompanyId,
  ].filter(Boolean).length;

  const allSelected = Boolean(
    paginatedPurchases.length > 0 &&
      paginatedPurchases.every((p) => selectedIds.includes(p.id))
  );

  const toggleSelectAll = useCallback(() => {
    const pageIds = paginatedPurchases.map((p) => p.id);
    if (!pageIds.length) return;
    if (allSelected) {
      setSelectedIds((current) => current.filter((id) => !pageIds.includes(id)));
    } else {
      setSelectedIds((current) => Array.from(new Set([...current, ...pageIds])));
    }
  }, [allSelected, paginatedPurchases]);

  const toggleSelected = useCallback((id: number) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((v) => v !== id) : [...current, id]
    );
  }, []);

  /* -------------------- Error state -------------------- */

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-600">
            <FiAlertCircle size={24} />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">Failed to load purchases</h2>
          <p className="mt-1.5 text-sm text-slate-500">{error}</p>
          <Button
            onClick={refresh}
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
                  Finance · Purchases
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-[32px]">
                  Purchase workspace
                </h1>
                <p className="mt-1.5 max-w-2xl text-sm text-slate-300">
                  Track supplier invoices, payments and outstanding balances in one place.
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
                  variant="outline"
                  onClick={() => setIsImportOpen(true)}
                  className="h-10 rounded-xl border-white/10 bg-white/5 text-white shadow-none backdrop-blur transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                >
                  <FiUpload className="mr-2" size={14} />
                  Import
                </Button>
                <Button
                  onClick={() => navigate('/purchases/create')}
                  className="h-10 rounded-xl bg-gradient-to-b from-cyan-300 to-cyan-400 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:from-cyan-200 hover:to-cyan-300"
                >
                  <FiPlus className="mr-2" size={14} />
                  New purchase
                </Button>
              </div>
            </div>
          </section>

          {/* KPI */}
          <section className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
            {purchases ? (
              <>
                <StatCard
                  icon={FiPackage}
                  label="Total purchases"
                  value={summary.total.toLocaleString('en-IN')}
                  accent="indigo"
                />
                <StatCard
                  icon={FiTrendingUp}
                  label="Total amount"
                  value={summary.totalAmount.toFixed(2)}
                  prefix="₹"
                  accent="violet"
                />
                <StatCard
                  icon={FiCheckCircle}
                  label="Paid"
                  value={summary.paidAmount.toFixed(2)}
                  prefix="₹"
                  accent="emerald"
                />
                <StatCard
                  icon={FiTrendingDown}
                  label="Outstanding"
                  value={summary.outstanding.toFixed(2)}
                  prefix="₹"
                  accent="rose"
                />
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
                      : 'Refine purchases by scope, payment and date'}
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(activeFilterCount > 0 ||
                  filterDateFrom !== getMonthStart() ||
                  filterDateTo !== getLocalToday()) && (
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
              {/* Row 1: search + selects */}
              <div className="grid gap-3 lg:grid-cols-12">
                <div className="relative lg:col-span-4">
                  <FiSearch
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    size={16}
                  />
                  <Input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="h-10 rounded-xl border-slate-200 pl-10 shadow-sm focus-visible:ring-4 focus-visible:ring-indigo-500/10"
                    placeholder="Search purchase #, supplier, status…"
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
                        setFilterCompanyId(e.target.value === 'all' ? undefined : Number(e.target.value))
                      }
                      className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                    >
                      <option value="all">All companies</option>
                      {companies.map((c) => (
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
                      aria-label="Purchase status"
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
                      aria-label="Payment status"
                      value={filterPaymentStatus}
                      onChange={(e) => setFilterPaymentStatus(e.target.value)}
                      className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                    >
                      {PAYMENT_STATUS_OPTIONS.map((o) => (
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

              {/* Row 2: date range + presets */}
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row lg:col-span-5">
                  <div className="relative min-w-0 flex-1">
                    <FiCalendar
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                      size={14}
                    />
                    <Input
                      type="date"
                      aria-label="Purchase date from"
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
                      aria-label="Purchase date to"
                      value={filterDateTo}
                      min={filterDateFrom || undefined}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                      className="h-10 rounded-xl border-slate-200 pl-9 shadow-sm focus-visible:ring-4 focus-visible:ring-indigo-500/10"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 lg:col-span-7 lg:justify-end">
                  <div className="flex items-center rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm">
                    {[
                      { key: 'today', label: 'Today' },
                      { key: '7d', label: '7 days' },
                      { key: '30d', label: '30 days' },
                      { key: 'month', label: 'This month' },
                      { key: 'all', label: 'All' },
                    ].map((preset) => {
                      const isAll = preset.key === 'all';
                      const isActive =
                        (!isAll && filterDateFrom && filterDateTo) ||
                        (isAll && !filterDateFrom && !filterDateTo);
                      return (
                        <button
                          key={preset.key}
                          type="button"
                          onClick={() => setDatePreset(preset.key as 'today' | '7d' | '30d' | 'month' | 'all')}
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                            isActive
                              ? 'bg-slate-900 text-white shadow-sm'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
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
                  onClick={() => handleBulkStatusChange('Received')}
                >
                  <FiCheckCircle className="mr-1.5 text-emerald-600" size={14} /> Mark received
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
                  onClick={() => startTransition(() => setSelectedIds([]))}
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
                  <CardTitle className="text-sm font-semibold text-slate-800">Purchase orders</CardTitle>
                  <CardDescription className="text-[11px] text-slate-500">
                    {loading
                      ? 'Loading purchases…'
                      : `${filteredPurchases.length.toLocaleString('en-IN')} record${
                          filteredPurchases.length === 1 ? '' : 's'
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
              <Table className="min-w-[1180px]">
                <TableHeader>
                  <TableRow className="border-slate-100 bg-slate-50/70 hover:bg-slate-50/70">
                    <TableHead className="w-11 px-3">
                      <input
                        aria-label="Select all purchases on page"
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
                      <TableHeadLabel>Purchase #</TableHeadLabel>
                    </TableHead>
                    <TableHead>
                      <TableHeadLabel>Supplier</TableHeadLabel>
                    </TableHead>
                    <TableHead>
                      <TableHeadLabel>Company</TableHeadLabel>
                    </TableHead>
                    <TableHead>
                      <TableHeadLabel>Date</TableHeadLabel>
                    </TableHead>
                    <TableHead className="text-right">
                      <TableHeadLabel align="right">Total</TableHeadLabel>
                    </TableHead>
                    <TableHead className="text-right">
                      <TableHeadLabel align="right">Outstanding</TableHeadLabel>
                    </TableHead>
                    <TableHead>
                      <TableHeadLabel>Status</TableHeadLabel>
                    </TableHead>
                    <TableHead>
                      <TableHeadLabel>Payment</TableHeadLabel>
                    </TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {loading &&
                    Array.from({ length: 8 }).map((_, index) => (
                      <TableRow key={`skeleton-${index}`} className="border-slate-100">
                        {Array.from({ length: TABLE_COLUMN_COUNT }).map((__, cellIndex) => (
                          <TableCell key={cellIndex}>
                            <div className="h-4 animate-pulse rounded bg-slate-100" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}

                  {!loading &&
                    paginatedPurchases.map((purchase) => {
                      const outstanding = safeNum(purchase.grand_total) - safeNum(purchase.paid_amount);
                      const selected = selectedIds.includes(purchase.id);
                      const statusColors: Record<string, string> = {
                        Draft: 'border-slate-200 bg-slate-50 text-slate-600',
                        Ordered: 'border-indigo-200/70 bg-indigo-50 text-indigo-700',
                        Received: 'border-cyan-200/70 bg-cyan-50 text-cyan-700',
                        Completed: 'border-emerald-200/70 bg-emerald-50 text-emerald-700',
                        Cancelled: 'border-rose-200/70 bg-rose-50 text-rose-700',
                      };
                      const paymentColors: Record<string, string> = {
                        Paid: 'border-emerald-200/70 bg-emerald-50 text-emerald-700',
                        Partial: 'border-sky-200/70 bg-sky-50 text-sky-700',
                        Unpaid: 'border-rose-200/70 bg-rose-50 text-rose-700',
                      };
                      return (
                        <TableRow
                          key={purchase.id}
                          data-state={selected ? 'selected' : undefined}
                          className={`cursor-pointer border-slate-100 transition-colors hover:bg-slate-50/70 ${
                            selected ? 'bg-indigo-50/40 hover:bg-indigo-50/60' : ''
                          }`}
                          onClick={() => handleView(purchase)}
                        >
                          <TableCell className="px-3">
                            <input
                              aria-label={`Select ${purchase.purchase_number}`}
                              type="checkbox"
                              checked={selected}
                              onChange={(event) => {
                                event.stopPropagation();
                                toggleSelected(purchase.id);
                              }}
                              onClick={(event) => event.stopPropagation()}
                              className="h-4 w-4 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/30"
                            />
                          </TableCell>

                          <TableCell>
                            <div className="min-w-[140px]">
                              <Link
                                to={`/purchases/${purchase.id}`}
                                onClick={(event) => event.stopPropagation()}
                                className="text-sm font-semibold text-slate-900 transition hover:text-indigo-600"
                              >
                                {purchase.purchase_number}
                              </Link>
                              <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                                #{purchase.id}
                              </p>
                            </div>
                          </TableCell>

                          <TableCell>
                            <div className="min-w-[180px]">
                              <p className="text-sm font-medium text-slate-800">
                                {purchase.supplier?.name || '—'}
                              </p>
                              {purchase.supplier?.email && (
                                <p className="truncate text-[11px] text-slate-500">
                                  {purchase.supplier.email}
                                </p>
                              )}
                            </div>
                          </TableCell>

                          <TableCell>
                            <div className="flex min-w-[140px] items-center gap-1.5">
                              {purchase.company?.name ? (
                                <>
                                  <span className="grid h-6 w-6 place-items-center rounded-md bg-indigo-50 text-indigo-600">
                                    <FiHome size={11} />
                                  </span>
                                  <span className="text-sm text-slate-700">
                                    {purchase.company.name}
                                  </span>
                                </>
                              ) : (
                                <span className="text-sm text-slate-400">—</span>
                              )}
                            </div>
                          </TableCell>

                          <TableCell className="whitespace-nowrap text-sm text-slate-600">
                            {formatDate(purchase.purchase_date)}
                          </TableCell>

                          <TableCell className="whitespace-nowrap text-right text-sm font-semibold tabular-nums text-slate-900">
                            {formatCurrency(purchase.grand_total)}
                          </TableCell>

                          <TableCell className="whitespace-nowrap text-right">
                            <span
                              className={`inline-flex items-center rounded-lg px-2 py-1 text-sm font-semibold tabular-nums ${
                                outstanding > 0
                                  ? 'bg-rose-50 text-rose-600'
                                  : 'bg-emerald-50 text-emerald-600'
                              }`}
                            >
                              {formatCurrency(outstanding)}
                            </span>
                          </TableCell>

                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                                statusColors[purchase.status] ||
                                'border-slate-200 bg-slate-50 text-slate-600'
                              }`}
                            >
                              {purchase.status || '—'}
                            </Badge>
                          </TableCell>

                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                                paymentColors[purchase.payment_status] ||
                                'border-slate-200 bg-slate-50 text-slate-600'
                              }`}
                            >
                              {purchase.payment_status || '—'}
                            </Badge>
                          </TableCell>

                          <TableCell
                            className="text-right"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleView(purchase)}
                                className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                                title="View details"
                              >
                                <FiEye size={16} />
                              </button>
                              <ActionDropdown
                                row={purchase}
                                onPrint={handlePrint}
                                onRecordPayment={handleRecordPaymentTrigger}
                                onDuplicate={handleDuplicate}
                                onDelete={handleDelete}
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}

                  {!loading && !paginatedPurchases.length && (
                    <TableRow>
                      <TableCell colSpan={TABLE_COLUMN_COUNT} className="py-20 text-center">
                        <div className="mx-auto max-w-md px-4">
                          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-slate-200/70">
                            <FiSearch className="h-6 w-6 text-slate-400" />
                          </div>
                          <p className="mt-4 text-base font-semibold text-slate-800">No purchases found</p>
                          <p className="mt-1 text-sm text-slate-500">
                            Try adjusting the date range, company, payment status, search term, or status.
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
            {!loading && totalPages > 1 && (
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
                    onClick={() => startTransition(() => setCurrentPage((p) => Math.max(1, p - 1)))}
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

      {/* Detail offcanvas */}
      {isViewPanelOpen && (
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
            title={`Purchase ${viewingPurchase?.purchase_number || ''}`}
            onClose={() => setIsViewPanelOpen(false)}
          >
            {viewingPurchase && (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold tracking-tight text-slate-900">
                      {viewingPurchase.purchase_number}
                    </h3>
                    <p className="text-sm text-slate-500">{viewingPurchase.supplier?.name || '—'}</p>
                  </div>
                  <Badge
                    variant="outline"
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                      viewingPurchase.payment_status === 'Paid'
                        ? 'border-emerald-200/70 bg-emerald-50 text-emerald-700'
                        : viewingPurchase.payment_status === 'Partial'
                          ? 'border-sky-200/70 bg-sky-50 text-sky-700'
                          : 'border-rose-200/70 bg-rose-50 text-rose-700'
                    }`}
                  >
                    {viewingPurchase.payment_status || '—'}
                  </Badge>
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-3.5 py-2.5">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      Date
                    </span>
                    <span className="text-xs font-semibold text-slate-800">
                      {formatDate(viewingPurchase.purchase_date)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-3.5 py-2.5">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      Due date
                    </span>
                    <span className="text-xs font-semibold text-slate-800">
                      {formatDate(viewingPurchase.due_date)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-3.5 py-2.5">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      Status
                    </span>
                    <span className="text-xs font-semibold text-slate-800">
                      {viewingPurchase.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      Warehouse
                    </span>
                    <span className="text-xs font-semibold text-slate-800">
                      {viewingPurchase.warehouse || '—'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      Total
                    </p>
                    <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">
                      {formatCurrency(viewingPurchase.grand_total)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/60 p-2.5">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-700/80">
                      Paid
                    </p>
                    <p className="mt-0.5 text-sm font-bold tabular-nums text-emerald-700">
                      {formatCurrency(viewingPurchase.paid_amount)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-rose-200/70 bg-rose-50/60 p-2.5">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-rose-700/80">
                      Due
                    </p>
                    <p className="mt-0.5 text-sm font-bold tabular-nums text-rose-600">
                      {formatCurrency(
                        safeNum(viewingPurchase.grand_total) - safeNum(viewingPurchase.paid_amount)
                      )}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Button
                    size="sm"
                    className="h-9 rounded-xl bg-slate-900 text-xs hover:bg-slate-800"
                    onClick={() => navigate(`/purchases/${viewingPurchase.id}`)}
                  >
                    Open full purchase
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 rounded-xl text-xs"
                    onClick={() => handlePrint(viewingPurchase)}
                  >
                    <FiPrinter className="mr-1.5" size={14} />
                    Print (A4)
                  </Button>
                </div>
              </div>
            )}
          </Offcanvas>
        </Suspense>
      )}

      {/* Payment modal */}
      {showPaymentModal && payingPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm"
            onClick={() => !paySubmitting && setShowPaymentModal(false)}
          />
          <div className="animate-fadeIn relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-violet-600 ring-1 ring-violet-500/10">
                <FiCreditCard size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Record payment</h3>
                <p className="text-xs text-slate-500">
                  {payingPurchase.purchase_number} · {payingPurchase.supplier?.name}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Amount
                </label>
                <Input
                  type="number"
                  value={payAmt}
                  onChange={(e) => setPayAmt(e.target.value)}
                  placeholder="0.00"
                  className="h-10 rounded-xl border-slate-200 text-sm font-medium focus-visible:ring-4 focus-visible:ring-indigo-500/10"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Method
                </label>
                <div className="relative">
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                    className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                  >
                    <option>Cash</option>
                    <option>Bank Transfer</option>
                    <option>Cheque</option>
                    <option>UPI</option>
                  </select>
                  <FiChevronDown
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                    size={14}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Direction
                </label>
                <div className="relative">
                  <select
                    value={payDirection}
                    onChange={(e) => setPayDirection(e.target.value as 'inward' | 'outward')}
                    className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                  >
                    <option value="outward">Outward (payment to supplier)</option>
                    <option value="inward">Inward (refund / receipt)</option>
                  </select>
                  <FiChevronDown
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                    size={14}
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowPaymentModal(false)}
                disabled={paySubmitting}
                className="h-10 rounded-xl"
              >
                Cancel
              </Button>
              <Button
                onClick={handleRecordPaymentSubmit}
                disabled={paySubmitting}
                className="h-10 rounded-xl bg-indigo-600 font-semibold hover:bg-indigo-700"
              >
                {paySubmitting && <FiPackage className="mr-2 animate-spin" size={14} />}
                Save payment
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ FIX: normalize all nullable fields on the invoice before passing to
          <InvoicePrint />. `InvoicePrint`'s InvoiceItem declares a non-null
          `product_name?: string` and `product?: { name: string; ... }`, and its
          Invoice declares `customer?: Customer` (not `Supplier`), so we:
            1. cast `supplier` → `customer`
            2. coerce `product_name` to a plain string per item
            3. cast the entire object through `unknown` to
               `React.ComponentProps<typeof InvoicePrint>['invoice']` so any
               remaining structural mismatch is accepted without further churn. */}
      {printInvoice && (
        <InvoicePrint
          invoice={
            {
              ...printInvoice,
              invoice_no: printInvoice.purchase_number,
              customer: printInvoice.supplier ?? undefined,
              total_amount: printInvoice.grand_total,
              tax_amount: 0,
              items: (printInvoice.items ?? []).map((item) => ({
                ...item,
                product_name: item.product_name ?? 'Item',
              })),
            } as unknown as React.ComponentProps<typeof InvoicePrint>['invoice']
          }
          onReady={() => {}}
        />
      )}

      <PurchaseImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImported={refresh}
      />
    </>
  );
}

export default PurchasePage;