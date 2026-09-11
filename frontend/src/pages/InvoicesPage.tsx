import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Eye,
  FileText,
  Filter,
  GitBranch,
  IndianRupee,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
  Building2,
  Clock3,
  CircleDollarSign,
  ReceiptText,
  Sparkles,
} from 'lucide-react';

import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';
import InvoicePrint from '../components/InvoicePrint';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type PaymentState = 'paid' | 'partial' | 'unpaid' | 'overdue';

type SelectOption = { value: string; label: string };

interface Customer {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  gst_number?: string | null;
}

interface Company {
  id: number;
  name: string;
  code?: string | null;
}

interface Branch {
  id: number;
  company_id: number;
  name: string;
  code?: string | null;
}

interface InvoiceItem {
  id?: number;
  product_id?: number;
  product?: { id?: number; name?: string | null } | null;
  product_name?: string | null;
  quantity?: number | string | null;
  unit_price?: number | string | null;
  total?: number | string | null;
}

interface InvoicePayment {
  id?: number;
  amount?: number | string | null;
  payment_direction?: string | null;
}

interface Invoice {
  id: number;
  invoice_no: string;
  company_id?: number;
  branch_id?: number | null;
  company?: Company | null;
  branch?: Branch | null;
  customer_id: number;
  customer?: Customer | null;
  customer_name?: string | null;
  gstin?: string | null;
  po_no?: string | null;
  total_amount: number | string;
  tax_amount: number | string;
  discount_amount?: number | string | null;
  payment_received?: number | string | null;
  paid_amount?: number | string | null;
  status?: string | null;
  due_date?: string | null;
  invoice_date?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  items?: InvoiceItem[];
  payments?: InvoicePayment[];
  [key: string]: unknown;
}

interface InvoiceQuery {
  page: number;
  per_page: number;
  search?: string;
  company_id?: number;
  branch_id?: number;
  status?: string;
  payment_state?: string;
  date_from?: string;
  date_to?: string;
  sort_by?: string;
  sort_dir?: 'asc' | 'desc';
}

interface Paginated<T> {
  data: T[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from: number | null;
  to: number | null;
}

interface InvoiceSummary {
  total: number;
  total_amount: number;
  received_amount: number;
  outstanding_amount: number;
  tax_amount: number;
  overdue: number;
  partial: number;
}

interface AppLogEntry {
  module: string;
  action: string;
  status: 'success' | 'error' | 'info';
  message: string;
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const PER_PAGE_OPTIONS = [15, 25, 50, 100] as const;
const DEFAULT_PER_PAGE = 15;
const SEARCH_DEBOUNCE_MS = 350;
const PRINT_DELAY_MS = 250;
const MENU_WIDTH = 190;
const MENU_HEIGHT = 168;
const MENU_MARGIN = 8;
const UNWRAP_DEPTH = 3;
const TABLE_COLUMN_COUNT = 9;

/** Shared class for every table header cell so all columns match exactly. */
const TABLE_HEAD_CLASS =
  'text-[11px] font-semibold uppercase tracking-wide text-slate-500';

const EMPTY_SUMMARY: InvoiceSummary = {
  total: 0,
  total_amount: 0,
  received_amount: 0,
  outstanding_amount: 0,
  tax_amount: 0,
  overdue: 0,
  partial: 0,
};

/* ------------------------------------------------------------------ */
/* Safe helpers                                                        */
/* ------------------------------------------------------------------ */

interface ApiErrorLike {
  message?: string;
  status?: number;
  response?: { status?: number };
}

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

function unwrap<T>(value: unknown, fallback: T): T {
  let current: unknown = value;
  for (let i = 0; i < UNWRAP_DEPTH; i += 1) {
    if (current == null) return fallback;
    if (Array.isArray(current)) return current as T;
    if (typeof current !== 'object') return fallback;
    if (!Object.prototype.hasOwnProperty.call(current, 'data')) return current as T;
    current = (current as { data?: unknown }).data;
  }
  return (current as T) ?? fallback;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toPositiveInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function toNullableNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getLocalToday(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysToDateString(dateString: string, days: number): string {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return dateString;
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toDateInput(value?: string | null): string {
  if (!value) return '';
  const direct = value.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDate(value?: string | null): string {
  const dateValue = toDateInput(value);
  if (!dateValue) return '—';
  const [year, month, day] = dateValue.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatMoney(value: unknown): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}

function escapeCsvField(value: unknown): string {
  const raw = String(value ?? '');
  const dangerous = /^[=+\-@\t\r]/.test(raw);
  const safe = dangerous ? `\t${raw}` : raw;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function getReceived(invoice: Invoice): number {
  if (invoice.payments?.length) {
    const received = invoice.payments
      .filter((payment) => String(payment.payment_direction ?? 'inward').toLowerCase() === 'inward')
      .reduce((sum, payment) => sum + toNumber(payment.amount), 0);
    if (received > 0) return received;
  }
  return toNumber(invoice.payment_received ?? invoice.paid_amount);
}

function getOutstanding(invoice: Invoice): number {
  return Math.max(0, toNumber(invoice.total_amount) - getReceived(invoice));
}

function getPaymentStatus(invoice: Invoice): PaymentState | 'draft' {
  if (String(invoice.status ?? '').toLowerCase() === 'draft') return 'draft';
  const outstanding = getOutstanding(invoice);
  if (outstanding <= 0) return 'paid';
  if (invoice.due_date) {
    const dueDate = toDateInput(invoice.due_date);
    const today = getLocalToday();
    if (dueDate && dueDate < today) return 'overdue';
  }
  if (getReceived(invoice) > 0) return 'partial';
  return 'unpaid';
}

function normalizePaginated(
  response: unknown,
  fallbackPage: number,
  fallbackPerPage: number,
): Paginated<Invoice> {
  const normalized = response as {
    data?: unknown;
    current_page?: unknown;
    last_page?: unknown;
    per_page?: unknown;
    total?: unknown;
    from?: unknown;
    to?: unknown;
  } | null;

  const data = Array.isArray(response)
    ? (response as Invoice[])
    : Array.isArray(normalized?.data)
      ? (normalized!.data as Invoice[])
      : [];

  return {
    data,
    current_page: toPositiveInt(normalized?.current_page, fallbackPage),
    last_page: toPositiveInt(normalized?.last_page, 1),
    per_page: toPositiveInt(normalized?.per_page, fallbackPerPage),
    total: Math.max(0, toNumber(normalized?.total)),
    from: toNullableNumber(normalized?.from),
    to: toNullableNumber(normalized?.to),
  };
}

/* ------------------------------------------------------------------ */
/* Presentational bits                                                 */
/* ------------------------------------------------------------------ */

function paymentBadge(status: ReturnType<typeof getPaymentStatus>) {
  const config: Record<string, { label: string; className: string; dot: string }> = {
    paid: {
      label: 'Paid',
      className: 'border-emerald-200/70 bg-emerald-50 text-emerald-700',
      dot: 'bg-emerald-500',
    },
    partial: {
      label: 'Partial',
      className: 'border-sky-200/70 bg-sky-50 text-sky-700',
      dot: 'bg-sky-500',
    },
    overdue: {
      label: 'Overdue',
      className: 'border-rose-200/70 bg-rose-50 text-rose-700',
      dot: 'bg-rose-500',
    },
    unpaid: {
      label: 'Unpaid',
      className: 'border-amber-200/70 bg-amber-50 text-amber-700',
      dot: 'bg-amber-500',
    },
    draft: {
      label: 'Draft',
      className: 'border-slate-200 bg-slate-50 text-slate-600',
      dot: 'bg-slate-400',
    },
  };
  const selected = config[status] ?? config.unpaid;
  return (
    <Badge
      variant="outline"
      className={`gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${selected.className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${selected.dot}`} />
      {selected.label}
    </Badge>
  );
}

function invoiceStatusBadge(status?: string | null) {
  const value = String(status ?? 'issued').toLowerCase();
  const config: Record<string, { label: string; className: string; dot: string }> = {
    issued: { label: 'Issued', className: 'border-indigo-200/70 bg-indigo-50 text-indigo-700', dot: 'bg-indigo-500' },
    pending: { label: 'Pending', className: 'border-amber-200/70 bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
    unpaid: { label: 'Unpaid', className: 'border-amber-200/70 bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
    paid: { label: 'Paid', className: 'border-emerald-200/70 bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
    draft: { label: 'Draft', className: 'border-slate-200 bg-slate-50 text-slate-600', dot: 'bg-slate-400' },
    overdue: { label: 'Overdue', className: 'border-rose-200/70 bg-rose-50 text-rose-700', dot: 'bg-rose-500' },
  };
  const selected = config[value] ?? config.issued;
  return (
    <Badge
      variant="outline"
      className={`gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${selected.className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${selected.dot}`} />
      {selected.label}
    </Badge>
  );
}

/** Shared table header wrapper — enforces identical typography across all columns. */
function TableHeadLabel({
  children,
  sortable = false,
  onClick,
  align = 'left',
}: {
  children: React.ReactNode;
  sortable?: boolean;
  onClick?: () => void;
  align?: 'left' | 'right';
}) {
  const alignClass = align === 'right' ? 'justify-end' : '';
  if (sortable && onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 ${alignClass} ${TABLE_HEAD_CLASS} transition hover:text-slate-800`}
      >
        {children}
      </button>
    );
  }
  return <span className={`inline-flex items-center gap-1 ${alignClass} ${TABLE_HEAD_CLASS}`}>{children}</span>;
}

function KpiCard({
  title,
  value,
  icon: Icon,
  accent = 'indigo',
  hint,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  accent?: 'indigo' | 'emerald' | 'rose' | 'amber' | 'violet';
  hint?: string;
}) {
  const accents: Record<string, { ring: string; icon: string; bg: string }> = {
    indigo: { ring: 'ring-indigo-500/10', icon: 'text-indigo-600', bg: 'bg-indigo-50' },
    emerald: { ring: 'ring-emerald-500/10', icon: 'text-emerald-600', bg: 'bg-emerald-50' },
    rose: { ring: 'ring-rose-500/10', icon: 'text-rose-600', bg: 'bg-rose-50' },
    amber: { ring: 'ring-amber-500/10', icon: 'text-amber-600', bg: 'bg-amber-50' },
    violet: { ring: 'ring-violet-500/10', icon: 'text-violet-600', bg: 'bg-violet-50' },
  };
  const style = accents[accent];

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-transparent transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300/80 hover:shadow-[0_8px_24px_-12px_rgba(15,23,42,0.15)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{title}</p>
          <p className="mt-2 truncate text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{value}</p>
          {hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
        </div>
        <div
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${style.bg} ring-1 ${style.ring}`}
        >
          <Icon className={`h-5 w-5 ${style.icon}`} />
        </div>
      </div>
      <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-gradient-to-br from-slate-100/70 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
    </div>
  );
}

function NativeSelect({
  value,
  onChange,
  options,
  disabled,
  ariaLabel,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <select
        aria-label={ariaLabel}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

function RowActions({
  invoice,
  onView,
  onPrint,
  onDelete,
  onClose,
  openId,
  setOpenId,
}: {
  invoice: Invoice;
  onView: (invoice: Invoice) => void;
  onPrint: (invoice: Invoice) => void;
  onDelete: (invoice: Invoice) => void;
  onClose: () => void;
  openId: number | null;
  setOpenId: (id: number | null) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const isOpen = openId === invoice.id;

  const toggle = useCallback(() => {
    if (isOpen) {
      setOpenId(null);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const left = Math.min(
        Math.max(MENU_MARGIN, rect.right - MENU_WIDTH),
        window.innerWidth - MENU_WIDTH - MENU_MARGIN,
      );
      const top =
        rect.bottom + MENU_HEIGHT <= window.innerHeight - MENU_MARGIN
          ? rect.bottom + 4
          : Math.max(MENU_MARGIN, rect.top - MENU_HEIGHT - 4);
      setMenuStyle({ position: 'fixed', left, top, width: MENU_WIDTH, zIndex: 1000 });
    }
    setOpenId(invoice.id);
  }, [invoice.id, isOpen, setOpenId]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current && !buttonRef.current.contains(target)) onClose();
    };
    const onScrollOrResize = () => onClose();

    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [isOpen, onClose]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Actions for ${invoice.invoice_no}`}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={toggle}
        className={`grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 ${
          isOpen ? 'bg-slate-100 text-slate-700' : ''
        }`}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {isOpen && (
        <div
          role="menu"
          style={menuStyle}
          className="overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl shadow-slate-900/10"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpenId(null);
              onView(invoice);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
          >
            <Eye className="h-4 w-4 text-slate-400" />
            View invoice
          </button>
          <Link
            to={`/invoices/${invoice.id}/edit`}
            role="menuitem"
            onClick={() => setOpenId(null)}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
          >
            <FileText className="h-4 w-4 text-slate-400" />
            Edit invoice
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpenId(null);
              onPrint(invoice);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
          >
            <Download className="h-4 w-4 text-slate-400" />
            Print invoice
          </button>
          <Separator className="my-1" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpenId(null);
              onDelete(invoice);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50"
          >
            <Trash2 className="h-4 w-4" />
            Delete invoice
          </button>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Page component                                                      */
/* ------------------------------------------------------------------ */

export function InvoicesPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { showError, showSuccess } = useNotification();

  const [searchInput, setSearchInput] = useState(params.get('search') || '');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [branchLoading, setBranchLoading] = useState(false);
  const [invoices, setInvoices] = useState<Paginated<Invoice> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [printInvoice, setPrintInvoice] = useState<Invoice | null>(null);
  const [printing, setPrinting] = useState(false);
  const [actionMenuId, setActionMenuId] = useState<number | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const dateInitializedRef = useRef(false);
  const invoicesRequestIdRef = useRef(0);

  /* -------------------- URL state -------------------- */

  const page = Math.max(1, Number(params.get('page') || 1) || 1);
  const perPageRaw = Number(params.get('per_page') || DEFAULT_PER_PAGE);
  const perPage = (PER_PAGE_OPTIONS as readonly number[]).includes(perPageRaw)
    ? perPageRaw
    : DEFAULT_PER_PAGE;
  const search = params.get('search') || '';
  const companyId = Number(params.get('company_id') || 0) || undefined;
  const branchId = Number(params.get('branch_id') || 0) || undefined;
  const invoiceStatus = params.get('status') || 'all';
  const paymentState = params.get('payment_state') || 'all';
  const dateFrom = params.get('date_from') || '';
  const dateTo = params.get('date_to') || '';
  const sortBy = params.get('sort_by') || 'invoice_date';
  const sortDir: 'asc' | 'desc' = params.get('sort_dir') === 'asc' ? 'asc' : 'desc';

  const updateParams = useCallback(
    (changes: Record<string, string | number | undefined>) => {
      setParams((current) => {
        const next = new URLSearchParams(current);
        Object.entries(changes).forEach(([key, value]) => {
          if (value === undefined || value === '') next.delete(key);
          else next.set(key, String(value));
        });
        return next;
      });
    },
    [setParams],
  );

  /* -------------------- Default date range = Today -------------------- */

  useEffect(() => {
    if (dateInitializedRef.current) return;
    dateInitializedRef.current = true;
    if (!params.has('date_from') && !params.has('date_to')) {
      const today = getLocalToday();
      updateParams({ date_from: today, date_to: today, page: 1 });
    }
  }, [params, updateParams]);

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const normalized = searchInput.trim();
      if (normalized !== search) {
        updateParams({ search: normalized || undefined, page: 1 });
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput, search, updateParams]);

  /* -------------------- Companies -------------------- */

  useEffect(() => {
    let active = true;
    setCompanyLoading(true);
    apiClient
      .get('/companies?per_page=1000')
      .then((response: unknown) => {
        if (!active) return;
        setCompanies(unwrap<Company[]>(response, []));
      })
      .catch((err: unknown) => {
        if (!active) return;
        showError('Company filter unavailable', getErrorMessage(err, 'Unable to load companies.'));
      })
      .finally(() => {
        if (active) setCompanyLoading(false);
      });
    return () => {
      active = false;
    };
  }, [showError]);

  /* -------------------- Branches -------------------- */

  useEffect(() => {
    let active = true;
    if (!companyId) {
      setBranches([]);
      if (branchId) updateParams({ branch_id: undefined, page: 1 });
      return () => {
        active = false;
      };
    }
    setBranchLoading(true);
    apiClient
      .getBranchesByCompany(companyId)
      .then((response: unknown) => {
        if (!active) return;
        setBranches(unwrap<Branch[]>(response, []));
      })
      .catch((err: unknown) => {
        if (!active) return;
        showError('Branch filter unavailable', getErrorMessage(err, 'Unable to load branches.'));
      })
      .finally(() => {
        if (active) setBranchLoading(false);
      });
    return () => {
      active = false;
    };
  }, [companyId, branchId, updateParams, showError]);

  /* -------------------- Query + loader -------------------- */

  const query: InvoiceQuery = useMemo(
    () => ({
      page,
      per_page: perPage,
      search: search || undefined,
      company_id: companyId,
      branch_id: branchId,
      status: invoiceStatus !== 'all' ? invoiceStatus : undefined,
      payment_state: paymentState !== 'all' ? paymentState : undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      sort_by: sortBy,
      sort_dir: sortDir,
    }),
    [page, perPage, search, companyId, branchId, invoiceStatus, paymentState, dateFrom, dateTo, sortBy, sortDir],
  );

  const loadInvoices = useCallback(async () => {
    const requestId = ++invoicesRequestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.getInvoices(query);
      if (requestId !== invoicesRequestIdRef.current) return;
      setInvoices(normalizePaginated(response, page, perPage));
    } catch (err: unknown) {
      if (requestId !== invoicesRequestIdRef.current) return;
      setError(getErrorMessage(err, 'Failed to load invoices.'));
    } finally {
      if (requestId === invoicesRequestIdRef.current) setLoading(false);
    }
  }, [query, page, perPage]);

  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);

  useEffect(
    () => () => {
      invoicesRequestIdRef.current += 1;
    },
    [],
  );

  /* -------------------- Summary computed from current page -------------------- */

  const visibleSummary = useMemo<InvoiceSummary>(() => {
    const rows = invoices?.data ?? [];
    const calculated: InvoiceSummary = { ...EMPTY_SUMMARY };
    calculated.total = invoices?.total ?? rows.length;
    calculated.total_amount = rows.reduce((sum, invoice) => sum + toNumber(invoice.total_amount), 0);
    calculated.received_amount = rows.reduce((sum, invoice) => sum + getReceived(invoice), 0);
    calculated.outstanding_amount = rows.reduce((sum, invoice) => sum + getOutstanding(invoice), 0);
    calculated.tax_amount = rows.reduce((sum, invoice) => sum + toNumber(invoice.tax_amount), 0);
    rows.forEach((invoice) => {
      const payment = getPaymentStatus(invoice);
      if (payment === 'overdue') calculated.overdue += 1;
      else if (payment === 'partial') calculated.partial += 1;
    });
    return calculated;
  }, [invoices]);

  /* -------------------- Selection resets on filter change -------------------- */

  useEffect(() => {
    setSelectedIds([]);
  }, [page, perPage, search, companyId, branchId, invoiceStatus, paymentState, dateFrom, dateTo]);

  /* -------------------- Keyboard shortcuts -------------------- */

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('[data-invoice-search]')?.focus();
      }
      if (event.key === 'Escape') {
        setActionMenuId(null);
        setMobileFiltersOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  /* -------------------- Actions -------------------- */

  const handleSort = useCallback(
    (column: string) => {
      const nextDirection = sortBy === column && sortDir === 'asc' ? 'desc' : 'asc';
      updateParams({ sort_by: column, sort_dir: nextDirection, page: 1 });
    },
    [sortBy, sortDir, updateParams],
  );

  const setDateRange = useCallback(
    (from: string, to: string) => {
      updateParams({ date_from: from || undefined, date_to: to || undefined, page: 1 });
    },
    [updateParams],
  );

  const clearFilters = useCallback(() => {
    setSearchInput('');
    const next = new URLSearchParams();
    next.set('page', '1');
    next.set('per_page', String(perPage));
    const today = getLocalToday();
    next.set('date_from', today);
    next.set('date_to', today);
    setParams(next);
  }, [perPage, setParams]);

  const allSelected = Boolean(
    invoices?.data.length && invoices.data.every((invoice) => selectedIds.includes(invoice.id)),
  );

  const toggleSelectAll = useCallback(() => {
    const pageIds = (invoices?.data ?? []).map((invoice) => invoice.id);
    if (!pageIds.length) return;
    if (allSelected) {
      setSelectedIds((current) => current.filter((id) => !pageIds.includes(id)));
    } else {
      setSelectedIds((current) => Array.from(new Set([...current, ...pageIds])));
    }
  }, [allSelected, invoices]);

  const toggleSelected = useCallback((id: number) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }, []);

  const handleView = useCallback(
    async (invoice: Invoice) => {
      try {
        const result = await apiClient.getInvoice(invoice.id);
        setViewingInvoice(unwrap<Invoice>(result, invoice));
      } catch (err: unknown) {
        showError('Unable to open invoice', getErrorMessage(err, 'Failed to load invoice details.'));
      }
    },
    [showError],
  );

  const handlePrint = useCallback(
    async (invoice: Invoice) => {
      setPrinting(true);
      try {
        const result = await apiClient.getInvoice(invoice.id);
        const details = unwrap<Invoice | null>(result, null);
        setPrintInvoice(details ?? invoice);
      } catch (err: unknown) {
        showError('Print failed', getErrorMessage(err, 'Failed to load invoice.'));
      } finally {
        setPrinting(false);
      }
    },
    [showError],
  );

  useEffect(() => {
    if (!printInvoice) return;
    const timer = window.setTimeout(() => window.print(), PRINT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [printInvoice]);

  const deleteInvoice = useCallback(
    async (invoice: Invoice) => {
      if (!window.confirm(`Delete invoice ${invoice.invoice_no}?`)) return;
      try {
        await apiClient.deleteInvoice(invoice.id);
        showSuccess('Invoice deleted', `${invoice.invoice_no} deleted successfully.`);
        safeLog({
          module: 'Invoices',
          action: 'Delete invoice',
          status: 'success',
          message: invoice.invoice_no,
        });
        await loadInvoices();
      } catch (err: unknown) {
        showError('Delete failed', getErrorMessage(err, 'Unable to delete invoice.'));
      }
    },
    [loadInvoices, showError, showSuccess],
  );

  const bulkStatus = useCallback(
    async (status: 'paid' | 'pending' | 'overdue') => {
      if (!selectedIds.length) return;
      const count = selectedIds.length;
      if (!window.confirm(`Update ${count} invoice(s) to ${status}?`)) return;
      try {
        await apiClient.bulkUpdateInvoiceStatus(selectedIds, status);
        showSuccess('Bulk update complete', `${count} invoice(s) updated.`);
        safeLog({
          module: 'Invoices',
          action: 'Bulk status change',
          status: 'success',
          message: `${count} invoices → ${status}`,
        });
        setSelectedIds([]);
        await loadInvoices();
      } catch (err: unknown) {
        showError('Bulk update failed', getErrorMessage(err, 'One or more updates failed.'));
      }
    },
    [loadInvoices, selectedIds, showError, showSuccess],
  );

  const bulkDelete = useCallback(async () => {
    if (!selectedIds.length) return;
    const count = selectedIds.length;
    if (!window.confirm(`Delete ${count} selected invoice(s)?`)) return;
    try {
      await apiClient.bulkDeleteInvoices(selectedIds);
      showSuccess('Bulk delete complete', `${count} invoice(s) deleted.`);
      safeLog({
        module: 'Invoices',
        action: 'Bulk delete',
        status: 'success',
        message: `${count} invoices`,
      });
      setSelectedIds([]);
      await loadInvoices();
    } catch (err: unknown) {
      showError('Bulk delete failed', getErrorMessage(err, 'One or more deletes failed.'));
    }
  }, [loadInvoices, selectedIds, showError, showSuccess]);

  const exportCurrentPage = useCallback(() => {
    const rows = invoices?.data ?? [];
    if (!rows.length) {
      showError('Nothing to export', 'The current page contains no invoices.');
      return;
    }
    const headers = [
      'Invoice #',
      'Customer',
      'Company',
      'Branch',
      'Total',
      'Received',
      'Outstanding',
      'Payment Status',
      'Invoice Status',
      'Invoice Date',
      'Due Date',
    ];
    const body = rows.map((invoice) =>
      [
        invoice.invoice_no,
        invoice.customer?.name || invoice.customer_name || '',
        invoice.company?.name || '',
        invoice.branch?.name || '',
        toNumber(invoice.total_amount).toFixed(2),
        getReceived(invoice).toFixed(2),
        getOutstanding(invoice).toFixed(2),
        getPaymentStatus(invoice),
        invoice.status || '',
        toDateInput(invoice.invoice_date || invoice.created_at),
        toDateInput(invoice.due_date),
      ]
        .map(escapeCsvField)
        .join(','),
    );
    const csv = [headers.map(escapeCsvField).join(','), ...body].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `invoices-page-${page}-${getLocalToday()}.csv`;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showSuccess('Export complete', `Exported ${rows.length} visible invoice(s).`);
  }, [invoices, page, showError, showSuccess]);

  /* -------------------- Derived display data -------------------- */

  const activeFilterCount = [
    search,
    companyId,
    branchId,
    invoiceStatus !== 'all' ? invoiceStatus : undefined,
    paymentState !== 'all' ? paymentState : undefined,
  ].filter(Boolean).length;

  const companyName = companyId
    ? companies.find((company) => company.id === companyId)?.name
    : undefined;
  const branchName = branchId ? branches.find((branch) => branch.id === branchId)?.name : undefined;

  const sortIcon = (column: string) => {
    if (sortBy !== column) return null;
    return sortDir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />;
  };

  const setCompanyFilter = (value: string) => {
    const nextCompany = value === 'all' ? undefined : Number(value);
    updateParams({ company_id: nextCompany, branch_id: undefined, page: 1 });
  };

  const setBranchFilter = (value: string) => {
    updateParams({ branch_id: value === 'all' ? undefined : Number(value), page: 1 });
  };

  const tableRows = invoices?.data ?? [];
  const lastPage = invoices?.last_page || 1;

  /* -------------------- Render -------------------- */

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100/60">
      <div className="mx-auto w-full max-w-[1900px] space-y-5 p-3 sm:p-4 lg:space-y-6 lg:p-6">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-2xl border border-slate-800/10 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-5 py-6 shadow-[0_20px_40px_-20px_rgba(15,23,42,0.45)] sm:px-7 lg:px-8">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />

          <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200 backdrop-blur">
                <Sparkles className="h-3 w-3" />
                Finance · Invoices
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-[32px]">
                Invoice workspace
              </h1>
              <p className="mt-1.5 max-w-2xl text-sm text-slate-300">
                Search, filter, and manage every invoice across companies and branches — all in one place.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={exportCurrentPage}
                disabled={loading || !tableRows.length}
                className="h-10 rounded-xl border-white/10 bg-white/5 text-white shadow-none backdrop-blur transition hover:border-white/20 hover:bg-white/10 hover:text-white"
              >
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
              <Button
                onClick={() => navigate('/invoices/create')}
                className="h-10 rounded-xl bg-gradient-to-b from-cyan-300 to-cyan-400 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:from-cyan-200 hover:to-cyan-300"
              >
                <Plus className="mr-2 h-4 w-4" />
                New invoice
              </Button>
            </div>
          </div>
        </section>

        {/* KPI */}
        <section className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
          <KpiCard
            title="Invoices"
            value={loading ? '…' : visibleSummary.total.toLocaleString('en-IN')}
            icon={FileText}
            accent="indigo"
            hint={visibleSummary.overdue > 0 ? `${visibleSummary.overdue} overdue` : undefined}
          />
          <KpiCard
            title="Sales value"
            value={loading ? '…' : formatMoney(visibleSummary.total_amount)}
            icon={CircleDollarSign}
            accent="violet"
          />
          <KpiCard
            title="Received"
            value={loading ? '…' : formatMoney(visibleSummary.received_amount)}
            icon={CheckCircle2}
            accent="emerald"
          />
          <KpiCard
            title="Outstanding"
            value={loading ? '…' : formatMoney(visibleSummary.outstanding_amount)}
            icon={Clock3}
            accent="rose"
            hint={
              visibleSummary.partial > 0 ? `${visibleSummary.partial} partial payments` : undefined
            }
          />
          <KpiCard
            title="Tax"
            value={loading ? '…' : formatMoney(visibleSummary.tax_amount)}
            icon={IndianRupee}
            accent="amber"
          />
        </section>

        {/* Filters */}
        <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3.5 sm:px-5">
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-50 text-indigo-600 ring-1 ring-indigo-500/10">
                <Filter className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">Filters</p>
                <p className="text-[11px] text-slate-500">
                  {activeFilterCount > 0
                    ? `${activeFilterCount} active filter${activeFilterCount > 1 ? 's' : ''}`
                    : 'Refine invoices by scope, status and date'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-9 rounded-lg lg:hidden"
                onClick={() => setMobileFiltersOpen((open) => !open)}
                aria-expanded={mobileFiltersOpen}
              >
                <Filter className="mr-2 h-3.5 w-3.5" />
                {mobileFiltersOpen ? 'Hide' : 'Show'}
              </Button>
              {(activeFilterCount > 0 || dateFrom !== getLocalToday() || dateTo !== getLocalToday()) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 rounded-lg text-slate-500 hover:text-slate-800"
                  onClick={clearFilters}
                >
                  <X className="mr-1.5 h-3.5 w-3.5" />
                  Reset
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent className={`${mobileFiltersOpen ? 'block' : 'hidden'} bg-white p-4 sm:p-5 lg:block`}>
            <div className="grid gap-3 lg:grid-cols-12">
              <div className="relative lg:col-span-4">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  data-invoice-search
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  className="h-10 rounded-xl border-slate-200 pl-10 pr-16 shadow-sm focus-visible:ring-4 focus-visible:ring-indigo-500/10"
                  placeholder="Search invoice, customer, GSTIN, PO…"
                  autoComplete="off"
                  spellCheck={false}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 md:flex">
                  ⌘K
                </span>
              </div>

              <div className="lg:col-span-2">
                <NativeSelect
                  value={companyId ? String(companyId) : 'all'}
                  onChange={setCompanyFilter}
                  ariaLabel="Company"
                  disabled={companyLoading}
                  options={[
                    { value: 'all', label: companyLoading ? 'Loading…' : 'All companies' },
                    ...companies.map((company) => ({ value: String(company.id), label: company.name })),
                  ]}
                />
              </div>

              <div className="lg:col-span-2">
                <NativeSelect
                  value={branchId ? String(branchId) : 'all'}
                  onChange={setBranchFilter}
                  ariaLabel="Branch"
                  disabled={!companyId || branchLoading}
                  options={[
                    {
                      value: 'all',
                      label: !companyId
                        ? 'Select company first'
                        : branchLoading
                          ? 'Loading…'
                          : 'All branches',
                    },
                    ...branches.map((branch) => ({ value: String(branch.id), label: branch.name })),
                  ]}
                />
              </div>

              <div className="lg:col-span-2">
                <NativeSelect
                  value={invoiceStatus}
                  onChange={(value) => updateParams({ status: value === 'all' ? undefined : value, page: 1 })}
                  ariaLabel="Invoice status"
                  options={[
                    { value: 'all', label: 'All statuses' },
                    { value: 'issued', label: 'Issued' },
                    { value: 'pending', label: 'Pending' },
                    { value: 'unpaid', label: 'Unpaid' },
                    { value: 'paid', label: 'Paid' },
                    { value: 'draft', label: 'Draft' },
                    { value: 'overdue', label: 'Overdue' },
                  ]}
                />
              </div>

              <div className="lg:col-span-2">
                <NativeSelect
                  value={paymentState}
                  onChange={(value) => updateParams({ payment_state: value === 'all' ? undefined : value, page: 1 })}
                  ariaLabel="Payment state"
                  options={[
                    { value: 'all', label: 'All payment states' },
                    { value: 'paid', label: 'Fully paid' },
                    { value: 'partial', label: 'Partially paid' },
                    { value: 'unpaid', label: 'Unpaid' },
                    { value: 'overdue', label: 'Overdue' },
                  ]}
                />
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row lg:col-span-5">
                <div className="min-w-0 flex-1">
                  <Input
                    type="date"
                    aria-label="Invoice date from"
                    value={dateFrom}
                    onChange={(event) => setDateRange(event.target.value, dateTo)}
                    className="h-10 rounded-xl border-slate-200 shadow-sm focus-visible:ring-4 focus-visible:ring-indigo-500/10"
                  />
                </div>
                <div className="hidden items-center justify-center px-1 text-slate-300 sm:flex">→</div>
                <div className="min-w-0 flex-1">
                  <Input
                    type="date"
                    aria-label="Invoice date to"
                    value={dateTo}
                    min={dateFrom || undefined}
                    onChange={(event) => setDateRange(dateFrom, event.target.value)}
                    className="h-10 rounded-xl border-slate-200 shadow-sm focus-visible:ring-4 focus-visible:ring-indigo-500/10"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 lg:col-span-7 lg:justify-end">
                <div className="flex items-center rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm">
                  {[
                    { label: 'Today', from: getLocalToday(), to: getLocalToday() },
                    { label: '7 days', from: addDaysToDateString(getLocalToday(), -6), to: getLocalToday() },
                    { label: '30 days', from: addDaysToDateString(getLocalToday(), -29), to: getLocalToday() },
                    { label: 'All', from: '', to: '' },
                  ].map((preset) => {
                    const active = dateFrom === preset.from && dateTo === preset.to;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setDateRange(preset.from, preset.to)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                          active
                            ? 'bg-slate-900 text-white shadow-sm'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {preset.label === 'Today' && <CalendarDays className="mr-1 inline h-3.5 w-3.5" />}
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {(companyName || branchName) && (
              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Active scope
                </span>
                {companyName && (
                  <Badge
                    variant="secondary"
                    className="gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-700"
                  >
                    <Building2 className="h-3 w-3 text-indigo-500" /> {companyName}
                  </Badge>
                )}
                {branchName && (
                  <Badge
                    variant="secondary"
                    className="gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-700"
                  >
                    <GitBranch className="h-3 w-3 text-violet-500" /> {branchName}
                  </Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {error && (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-800 shadow-sm">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rose-100 text-rose-600">
              <AlertCircle className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Unable to load invoices</p>
              <p className="mt-0.5 break-words text-rose-700/90">{error}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="rounded-lg border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
              onClick={loadInvoices}
            >
              Retry
            </Button>
          </div>
        )}

        {/* Bulk toolbar */}
        {selectedIds.length > 0 && (
          <div className="sticky top-3 z-30 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-lg shadow-slate-900/5 backdrop-blur">
            <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4">
              <div className="mr-1 flex items-center gap-2 rounded-lg bg-indigo-50 px-2.5 py-1 text-indigo-700 ring-1 ring-indigo-500/10">
                <span className="text-sm font-bold">{selectedIds.length}</span>
                <span className="text-xs font-medium">selected</span>
              </div>
              <Button size="sm" variant="outline" className="h-9 rounded-lg" onClick={() => bulkStatus('paid')}>
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-emerald-600" /> Mark paid
              </Button>
              <Button size="sm" variant="outline" className="h-9 rounded-lg" onClick={() => bulkStatus('pending')}>
                Mark pending
              </Button>
              <Button size="sm" variant="outline" className="h-9 rounded-lg" onClick={() => bulkStatus('overdue')}>
                Mark overdue
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-9 rounded-lg bg-rose-600 hover:bg-rose-700"
                onClick={bulkDelete}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
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
                <ReceiptText className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">All invoices</p>
                <p className="text-[11px] text-slate-500">
                  {loading
                    ? 'Loading invoice records…'
                    : `${(invoices?.total ?? 0).toLocaleString('en-IN')} record${
                        (invoices?.total ?? 0) === 1 ? '' : 's'
                      }`}
                  {dateFrom && dateTo && (
                    <>
                      {' · '}
                      {formatDate(dateFrom)} – {formatDate(dateTo)}
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Rows</span>
              <NativeSelect
                value={String(perPage)}
                onChange={(value) => updateParams({ per_page: Number(value), page: 1 })}
                ariaLabel="Rows per page"
                options={PER_PAGE_OPTIONS.map((value) => ({ value: String(value), label: String(value) }))}
                className="w-[76px]"
              />
            </div>
          </CardHeader>

          <div className="overflow-x-auto">
            <Table className="min-w-[1060px]">
              <TableHeader>
                <TableRow className="border-slate-100 bg-slate-50/70 hover:bg-slate-50/70">
                  <TableHead className="w-11 px-3">
                    <input
                      aria-label="Select all invoices on page"
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
                    <TableHeadLabel sortable onClick={() => handleSort('invoice_no')}>
                      Invoice {sortIcon('invoice_no')}
                    </TableHeadLabel>
                  </TableHead>
                  <TableHead>
                    <TableHeadLabel>Customer</TableHeadLabel>
                  </TableHead>
                  <TableHead>
                    <TableHeadLabel>Company / Branch</TableHeadLabel>
                  </TableHead>
                  <TableHead className="text-right">
                    <TableHeadLabel sortable align="right" onClick={() => handleSort('total_amount')}>
                      Amount {sortIcon('total_amount')}
                    </TableHeadLabel>
                  </TableHead>
                  <TableHead className="text-right">
                    <TableHeadLabel align="right">Outstanding</TableHeadLabel>
                  </TableHead>
                  <TableHead>
                    <TableHeadLabel>Status</TableHeadLabel>
                  </TableHead>
                  <TableHead>
                    <TableHeadLabel sortable onClick={() => handleSort('invoice_date')}>
                      Date {sortIcon('invoice_date')}
                    </TableHeadLabel>
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
                  tableRows.map((invoice) => {
                    const outstanding = getOutstanding(invoice);
                    const selected = selectedIds.includes(invoice.id);
                    return (
                      <TableRow
                        key={invoice.id}
                        data-state={selected ? 'selected' : undefined}
                        className={`cursor-pointer border-slate-100 transition-colors hover:bg-slate-50/70 ${
                          selected ? 'bg-indigo-50/40 hover:bg-indigo-50/60' : ''
                        }`}
                        onClick={() => handleView(invoice)}
                      >
                        <TableCell className="px-3">
                          <input
                            aria-label={`Select ${invoice.invoice_no}`}
                            type="checkbox"
                            checked={selected}
                            onChange={(event) => {
                              event.stopPropagation();
                              toggleSelected(invoice.id);
                            }}
                            onClick={(event) => event.stopPropagation()}
                            className="h-4 w-4 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/30"
                          />
                        </TableCell>

                        <TableCell>
                          <div className="min-w-[140px]">
                            <Link
                              to={`/invoices/${invoice.id}`}
                              onClick={(event) => event.stopPropagation()}
                              className="text-sm font-semibold text-slate-900 transition hover:text-indigo-600"
                            >
                              {invoice.invoice_no}
                            </Link>
                            <p className="mt-0.5 text-[11px] font-medium text-slate-400">#{invoice.id}</p>
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="min-w-[190px]">
                            <p className="text-sm font-medium text-slate-800">
                              {invoice.customer?.name || invoice.customer_name || '—'}
                            </p>
                            {invoice.customer?.email && (
                              <p className="truncate text-[11px] text-slate-500">{invoice.customer.email}</p>
                            )}
                            {invoice.gstin && (
                              <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                                GSTIN {invoice.gstin}
                              </p>
                            )}
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="min-w-[200px] space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className="grid h-5 w-5 place-items-center rounded-md bg-indigo-50 text-indigo-600">
                                <Building2 className="h-3 w-3" />
                              </span>
                              <span className="text-xs font-medium text-slate-700">
                                {invoice.company?.name || '—'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 pl-0.5">
                              <span className="grid h-5 w-5 place-items-center rounded-md bg-violet-50 text-violet-600">
                                <GitBranch className="h-3 w-3" />
                              </span>
                              <span className="text-[11px] text-slate-500">
                                {invoice.branch?.name || 'Main / unassigned'}
                              </span>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="whitespace-nowrap text-right text-sm font-semibold tabular-nums text-slate-900">
                          {formatMoney(invoice.total_amount)}
                        </TableCell>

                        <TableCell className="whitespace-nowrap text-right">
                          <span
                            className={`inline-flex items-center rounded-lg px-2 py-1 text-sm font-semibold tabular-nums ${
                              outstanding > 0
                                ? 'bg-rose-50 text-rose-600'
                                : 'bg-emerald-50 text-emerald-600'
                            }`}
                          >
                            {formatMoney(outstanding)}
                          </span>
                        </TableCell>

                        <TableCell>{invoiceStatusBadge(invoice.status)}</TableCell>

                        <TableCell className="whitespace-nowrap text-sm text-slate-600">
                          {formatDate(invoice.invoice_date || invoice.created_at)}
                        </TableCell>

                        <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                          <RowActions
                            invoice={invoice}
                            onView={handleView}
                            onPrint={handlePrint}
                            onDelete={deleteInvoice}
                            onClose={() => setActionMenuId(null)}
                            openId={actionMenuId}
                            setOpenId={setActionMenuId}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}

                {!loading && !tableRows.length && (
                  <TableRow>
                    <TableCell colSpan={TABLE_COLUMN_COUNT} className="py-20 text-center">
                      <div className="mx-auto max-w-md px-4">
                        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-slate-200/70">
                          <Search className="h-6 w-6 text-slate-400" />
                        </div>
                        <p className="mt-4 text-base font-semibold text-slate-800">No invoices found</p>
                        <p className="mt-1 text-sm text-slate-500">
                          Try adjusting the date range, company, branch, search term, or status.
                        </p>
                        <Button className="mt-5 rounded-lg" variant="outline" onClick={clearFilters}>
                          <RefreshCw className="mr-2 h-3.5 w-3.5" />
                          Reset filters
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-100 bg-white px-4 py-3.5 sm:px-5 md:flex-row md:items-center md:justify-between">
            <p className="text-xs text-slate-500 sm:text-[13px]">
              Showing{' '}
              <span className="font-semibold text-slate-700">{invoices?.from ?? 0}</span>–
              <span className="font-semibold text-slate-700">{invoices?.to ?? 0}</span> of{' '}
              <span className="font-semibold text-slate-700">
                {(invoices?.total ?? 0).toLocaleString('en-IN')}
              </span>
            </p>
            <div className="flex items-center justify-between gap-1.5 sm:justify-end">
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-lg"
                disabled={page <= 1 || loading}
                onClick={() => updateParams({ page: 1 })}
                aria-label="First page"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-lg"
                disabled={page <= 1 || loading}
                onClick={() => updateParams({ page: page - 1 })}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="mx-1 min-w-[76px] rounded-lg bg-slate-100 px-3 py-1.5 text-center text-xs font-semibold text-slate-700">
                {page} / {lastPage}
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-lg"
                disabled={page >= lastPage || loading}
                onClick={() => updateParams({ page: page + 1 })}
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-lg"
                disabled={page >= lastPage || loading}
                onClick={() => updateParams({ page: lastPage })}
                aria-label="Last page"
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Invoice detail sheet */}
      <Sheet
        open={!!viewingInvoice}
        onOpenChange={(open) => {
          if (!open) setViewingInvoice(null);
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-md">
          {viewingInvoice && (
            <>
              <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur">
                <SheetHeader className="space-y-0">
                  <SheetTitle className="flex items-center justify-between gap-2 pr-8">
                    <span className="flex items-center gap-2">
                      <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
                        <ReceiptText className="h-3.5 w-3.5" />
                      </span>
                      <span className="text-base font-bold text-slate-900">
                        {viewingInvoice.invoice_no}
                      </span>
                    </span>
                  </SheetTitle>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {invoiceStatusBadge(viewingInvoice.status)}
                    {paymentBadge(getPaymentStatus(viewingInvoice))}
                    <span className="ml-auto text-[11px] font-medium text-slate-400">
                      #{viewingInvoice.id}
                    </span>
                  </div>
                </SheetHeader>
              </div>

              <div className="space-y-4 px-5 py-4">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      Total
                    </p>
                    <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">
                      {formatMoney(viewingInvoice.total_amount)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/60 p-2.5">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-700/80">
                      Received
                    </p>
                    <p className="mt-0.5 text-sm font-bold tabular-nums text-emerald-700">
                      {formatMoney(getReceived(viewingInvoice))}
                    </p>
                  </div>
                  <div className="rounded-xl border border-rose-200/70 bg-rose-50/60 p-2.5">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-rose-700/80">
                      Due
                    </p>
                    <p className="mt-0.5 text-sm font-bold tabular-nums text-rose-600">
                      {formatMoney(getOutstanding(viewingInvoice))}
                    </p>
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-3.5 py-2.5">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      Customer
                    </span>
                    <div className="min-w-0 text-right">
                      <p className="truncate text-xs font-semibold text-slate-800">
                        {viewingInvoice.customer?.name || viewingInvoice.customer_name || '—'}
                      </p>
                      {viewingInvoice.customer?.email && (
                        <p className="truncate text-[11px] text-slate-500">
                          {viewingInvoice.customer.email}
                        </p>
                      )}
                      {viewingInvoice.gstin && (
                        <p className="truncate text-[10px] text-slate-400">GSTIN {viewingInvoice.gstin}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-3.5 py-2.5">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      Company
                    </span>
                    <div className="min-w-0 text-right">
                      <p className="truncate text-xs font-semibold text-slate-800">
                        {viewingInvoice.company?.name || '—'}
                      </p>
                      <p className="truncate text-[11px] text-slate-500">
                        {viewingInvoice.branch?.name || 'Main / unassigned'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-3.5 py-2.5">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      Invoice date
                    </span>
                    <span className="text-xs font-semibold text-slate-800">
                      {formatDate(viewingInvoice.invoice_date || viewingInvoice.created_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      Due date
                    </span>
                    <span className="text-xs font-semibold text-slate-800">
                      {formatDate(viewingInvoice.due_date)}
                    </span>
                  </div>
                </div>

                {Array.isArray(viewingInvoice.items) && viewingInvoice.items.length > 0 && (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Items
                      </p>
                      <Badge
                        variant="secondary"
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600"
                      >
                        {viewingInvoice.items.length}
                      </Badge>
                    </div>
                    <div className="overflow-hidden rounded-xl border border-slate-200">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50/70">
                          <tr>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              Product
                            </th>
                            <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              Qty
                            </th>
                            <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              Total
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {viewingInvoice.items.map((item, index) => (
                            <tr key={item.id || `${item.product_id || 'item'}-${index}`}>
                              <td className="px-3 py-2 text-xs font-medium text-slate-700">
                                {item.product?.name || item.product_name || `Item ${index + 1}`}
                              </td>
                              <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-600">
                                {item.quantity ?? '—'}
                              </td>
                              <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums text-slate-800">
                                {formatMoney(item.total)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Button
                    size="sm"
                    className="h-9 rounded-xl bg-slate-900 text-xs hover:bg-slate-800"
                    onClick={() => navigate(`/invoices/${viewingInvoice.id}`)}
                  >
                    Open full invoice
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 rounded-xl text-xs"
                    onClick={() => handlePrint(viewingInvoice)}
                    disabled={printing}
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    {printing ? 'Preparing…' : 'Print'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ✅ FIX: normalize every nullable field on `invoice` (including nested
          `items[].product`) to match InvoicePrint's stricter prop types, then
          cast the resulting object through `unknown` to guarantee structural
          compatibility. `InvoicePrint`'s InvoiceItem declares
          `product?: { name: string; hsn_sac_code?: string }` — a required,
          non-null `name` — while the local Invoice allows `null` on
          `product.name`. We synthesize a fresh `product` object with a
          guaranteed string `name` for every item. */}
      {printInvoice && (
        <InvoicePrint
          invoice={
            {
              ...printInvoice,
              company: printInvoice.company ?? undefined,
              branch: printInvoice.branch ?? undefined,
              customer: printInvoice.customer ?? undefined,
              items: (printInvoice.items ?? []).map((item) => {
                const name =
                  item.product?.name ?? item.product_name ?? 'Item';
                return {
                  ...item,
                  product: { name },
                  product_name: name,
                };
              }),
            } as unknown as React.ComponentProps<typeof InvoicePrint>['invoice']
          }
          onReady={() => setPrintInvoice(null)}
        />
      )}
    </div>
  );
}

export default InvoicesPage;