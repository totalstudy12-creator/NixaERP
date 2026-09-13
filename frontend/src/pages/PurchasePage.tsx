// src/pages/PurchasePage.tsx
import React, {
  useEffect, useState, useCallback, useMemo, lazy, Suspense, memo, useRef, startTransition,
} from 'react';
import ReactDOM from 'react-dom';
import {
  FiPlus, FiTrash2, FiDownload, FiEye, FiEdit, FiCheckCircle, FiAlertCircle, FiFilter,
  FiSearch, FiChevronDown, FiPrinter, FiPackage, FiCreditCard, FiCopy, FiMoreVertical,
  FiUpload, FiX, FiTrendingUp, FiTrendingDown, FiCalendar, FiHome, FiCamera, FiCheck,
  FiArrowRight, FiArrowLeft, FiUserPlus, FiDollarSign, FiImage, FiInfo, FiZap,
  FiRefreshCw, FiSave, FiTag, FiPercent, FiSliders,
} from 'react-icons/fi';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';
import InvoicePrint from '../components/InvoicePrint';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

const Offcanvas = lazy(() =>
  import('../components/Offcanvas').then((m) => ({ default: m.Offcanvas }))
);

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface Supplier {
  id: number; name: string; email?: string | null; phone?: string | null; gstin?: string | null;
}
interface PurchaseItem {
  id?: number; product_id?: number; product_name?: string | null;
  quantity?: number | string | null; purchase_price?: number | string | null; total?: number | string | null;
}
interface PurchaseInvoice {
  id: number; purchase_number: string; bill_number?: string | null; supplier_id: number;
  supplier?: Supplier | null; grand_total: number | string; paid_amount: number | string;
  status: string; payment_status: string; purchase_date: string; due_date?: string | null;
  warehouse?: string | null; created_at?: string | null; updated_at?: string | null;
  items?: PurchaseItem[];
  payments?: Array<{ id?: number; amount?: number | string | null; payment_direction?: string | null }>;
  company_id?: number; company?: { id: number; name: string } | null; branch_id?: number | null;
  [key: string]: unknown;
}
interface Company { id: number; name: string }
interface Branch { id: number; company_id: number; name: string }
interface ProductLite {
  id: number; name: string; sku?: string | null; barcode?: string | null;
  purchase_price?: number | string | null; sale_price?: number | string | null;
  tax_rate?: number | string | null; unit?: string | null; hsn_sac_code?: string | null;
}
interface AppLogEntry { module: string; action: string; status: 'success' | 'error' | 'info'; message: string }
interface ApiErrorLike {
  message?: string; status?: number;
  response?: { status?: number; statusText?: string; data?: unknown };
  backendMessage?: string;
  validationErrors?: Record<string, string[]>;
}

interface OCRLineItem {
  description: string; hsn_sac?: string; quantity: number; unit?: string;
  unit_price: number; discount?: number; tax_rate?: number; total: number; confidence?: number;
}
interface OCRSupplierInfo {
  name: string; gstin?: string; email?: string; phone?: string; address?: string; confidence?: number;
}
interface OCRInvoiceData {
  invoice_number: string; invoice_date: string; due_date?: string;
  supplier: OCRSupplierInfo; items: OCRLineItem[];
  subtotal: number; tax_amount: number; discount_amount: number; grand_total: number;
  currency?: string; notes?: string; overall_confidence?: number; is_interstate?: boolean;
}
interface LineItemDraft {
  id: string;
  description: string;
  hsn_sac?: string;
  quantity: number;
  unit?: string;
  unit_price: number;
  tax_rate: number;
  discount_type: 'percent' | 'amount';
  discount_percent: number;
  discount_amount: number;
  total: number;
  action: 'existing' | 'new' | 'skip';
  matched_product_id: number | null;
  matched_product_name: string | null;
}
interface PaymentDraft {
  id: string; amount: number; payment_method: string;
  payment_direction: 'inward' | 'outward';
  reference_no: string; transaction_date: string; remarks: string;
}

type OCRStep = 'upload' | 'verify' | 'charges' | 'overview';
type DatePreset = 'today' | '7d' | '30d' | 'month' | 'all' | 'custom';

const OCR_STEPS: Array<{ key: OCRStep; label: string }> = [
  { key: 'upload',   label: 'Upload' },
  { key: 'verify',   label: 'Verify & Map' },
  { key: 'charges',  label: 'Charges & Payments' },
  { key: 'overview', label: 'Overview' },
];

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

const TABLE_COLUMN_COUNT = 10;
const CACHE_TTL_MS = 300_000;
const SEARCH_DEBOUNCE_MS = 350;
const TABLE_HEAD_CLASS = 'text-[11px] font-semibold uppercase tracking-wide text-slate-500';
const OCR_MAX_BYTES = 10 * 1024 * 1024;
const OCR_ACCEPT = '.png,.jpg,.jpeg,.webp,.pdf,image/*,application/pdf';

const PAYMENT_METHOD_OPTIONS = [
  { value: 'cash',          label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque',        label: 'Cheque' },
  { value: 'UPI',           label: 'UPI' },
  { value: 'other',         label: 'Other' },
] as const;

const GST_SLABS = [0, 5, 12, 18, 28] as const;

/* ------------------------------------------------------------------ */
/* Learning / mapping memory (localStorage)                            */
/* ------------------------------------------------------------------ */

const LEARN_KEY = 'ocr_mappings_v1';

interface LearnedMappings {
  suppliers: Record<string, number>;
  products: Record<string, number>;
  updatedAt: number;
}

function loadLearnedMappings(): LearnedMappings {
  try {
    const raw = window.localStorage.getItem(LEARN_KEY);
    if (!raw) return { suppliers: {}, products: {}, updatedAt: 0 };
    const parsed = JSON.parse(raw) as Partial<LearnedMappings>;
    return {
      suppliers: parsed.suppliers ?? {},
      products: parsed.products ?? {},
      updatedAt: parsed.updatedAt ?? 0,
    };
  } catch {
    return { suppliers: {}, products: {}, updatedAt: 0 };
  }
}

function persistLearnedMappings(next: LearnedMappings): void {
  try { window.localStorage.setItem(LEARN_KEY, JSON.stringify(next)); } catch { /* quota */ }
}

function rememberSupplier(name: string, id: number): void {
  const key = normalizeName(name);
  if (!key || !id) return;
  const current = loadLearnedMappings();
  current.suppliers[key] = id;
  current.updatedAt = Date.now();
  persistLearnedMappings(current);
}

function rememberProduct(name: string, hsn: string | undefined, id: number): void {
  if (!id) return;
  const key = normalizeName(name);
  if (!key) return;
  const current = loadLearnedMappings();
  current.products[key] = id;
  if (hsn) current.products[`${key}|${hsn}`] = id;
  current.updatedAt = Date.now();
  persistLearnedMappings(current);
}

function recallSupplierId(name: string): number | null {
  const key = normalizeName(name);
  if (!key) return null;
  const map = loadLearnedMappings();
  return map.suppliers[key] ?? null;
}

function recallProductId(name: string, hsn: string | undefined): number | null {
  const key = normalizeName(name);
  if (!key) return null;
  const map = loadLearnedMappings();
  if (hsn && map.products[`${key}|${hsn}`]) return map.products[`${key}|${hsn}`];
  return map.products[key] ?? null;
}

/* ------------------------------------------------------------------ */
/* Safe helpers                                                        */
/* ------------------------------------------------------------------ */

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null) {
    const e = error as ApiErrorLike;
    const candidate = e.backendMessage || (e.response?.data as { message?: string } | undefined)?.message || e.message;
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function getDetailedError(error: unknown): string {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  const e = error as ApiErrorLike;
  const parts: string[] = [];
  if (e.backendMessage) parts.push(e.backendMessage);
  if (e.message && e.message !== e.backendMessage) parts.push(e.message);
  if (e.status !== undefined) parts.push(`HTTP ${e.status}`);
  if (e.response?.statusText) parts.push(e.response.statusText);
  if (e.validationErrors) {
    const messages = Object.entries(e.validationErrors)
      .map(([field, errs]) => `${field}: ${Array.isArray(errs) ? errs.join(', ') : String(errs)}`)
      .join('; ');
    if (messages) parts.push(messages);
  }
  return parts.join(' | ') || 'Unknown error';
}

function safeLog(entry: AppLogEntry): void { try { addAppLog(entry); } catch { /* no-op */ } }
function safeNum(value: unknown): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : 0;
}
function safeStr(value: unknown, fallback = ''): string {
  if (value == null) return fallback;
  return String(value);
}
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
function uid(prefix = 'id'): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}-${crypto.randomUUID()}`;
    }
  } catch { /* ignore */ }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
    style: 'currency', currency: 'INR', maximumFractionDigits: 2,
  }).format(safeNum(value));
}
function formatDate(value: unknown): string {
  if (!value) return '—';
  const str = typeof value === 'string' ? value : String(value);
  const dateValue = str.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return '—';
  const [year, month, day] = dateValue.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
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
function getDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function normalizeDateInput(value: unknown): string {
  if (!value) return '';
  const str = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(str) ? str : '';
}

function toBackendPaymentMethod(input: string): string {
  const v = String(input || '').trim().toLowerCase();
  if (v === 'cash') return 'cash';
  if (v === 'bank transfer' || v === 'bank_transfer') return 'bank_transfer';
  if (v === 'cheque' || v === 'check') return 'cheque';
  if (v === 'upi') return 'UPI';
  return 'other';
}

function effectiveItemDiscount(it: LineItemDraft): number {
  const base = it.quantity * it.unit_price;
  if (it.discount_type === 'percent') {
    return round2(Math.min(base, base * Math.min(100, Math.max(0, it.discount_percent)) / 100));
  }
  return round2(Math.min(base, Math.max(0, it.discount_amount)));
}

function effectiveItemGst(it: LineItemDraft): number {
  return Math.max(0, Math.min(100, it.tax_rate));
}

/* ------------------------------------------------------------------ */
/* Cache hook                                                          */
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
          setData(entry.data as T); setLoading(false); setError(null); return;
        }
      }
      setLoading(true); setError(null);
      try {
        const res = await fetcherRef.current();
        if (!mountedRef.current || requestId !== requestIdRef.current) return;
        const result = Array.isArray(res) ? res : ((res as { data?: T })?.data ?? ([] as unknown as T));
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
    return () => { mountedRef.current = false; requestIdRef.current += 1; };
  }, [fetchData]);

  const refresh = useCallback(() => { cache.delete(key); return fetchData(true); }, [fetchData, key]);
  return { data, loading, error, refresh };
}

/* ------------------------------------------------------------------ */
/* Shared table head + skeletons + stat card                           */
/* ------------------------------------------------------------------ */

function TableHeadLabel({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  const alignClass = align === 'right' ? 'justify-end' : '';
  return <span className={`inline-flex items-center gap-1 ${alignClass} ${TABLE_HEAD_CLASS}`}>{children}</span>;
}

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

type Accent = 'indigo' | 'emerald' | 'rose' | 'amber' | 'violet' | 'teal';

const StatCard = memo(({
  icon: Icon, label, value, accent = 'indigo', prefix,
}: {
  icon: React.ElementType; label: string; value: string | number; accent?: Accent; prefix?: string;
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
          <p className="mt-2 truncate text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{prefix}{value}</p>
        </div>
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${style.bg} ring-1 ${style.ring}`}>
          <Icon size={18} className={style.icon} />
        </div>
      </div>
    </div>
  );
});
StatCard.displayName = 'StatCard';

/* ------------------------------------------------------------------ */
/* Action Dropdown                                                     */
/* ------------------------------------------------------------------ */

const MENU_WIDTH = 200; const MENU_HEIGHT = 260; const MENU_MARGIN = 8;

const ActionDropdown = memo(({
  row, onPrint, onRecordPayment, onDuplicate, onDelete,
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
          const left = Math.min(Math.max(MENU_MARGIN, rect.right - MENU_WIDTH), window.innerWidth - MENU_WIDTH - MENU_MARGIN);
          const top = rect.bottom + MENU_HEIGHT <= window.innerHeight - MENU_MARGIN ? rect.bottom + 4 : Math.max(MENU_MARGIN, rect.top - MENU_HEIGHT - 4);
          setMenuStyle({ position: 'fixed', left, top, width: MENU_WIDTH, zIndex: 9999 });
        }
        return willOpen;
      });
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) && buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
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

  const closeAndAct = useCallback((action: () => void) => { startTransition(() => setOpen(false)); action(); }, []);

  return (
    <>
      <button ref={buttonRef} onClick={toggle}
        aria-label={`Actions for ${row.purchase_number}`} aria-haspopup="menu" aria-expanded={open}
        className={`grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 ${open ? 'bg-slate-100 text-slate-700' : ''}`}
        title="More actions">
        <FiMoreVertical size={16} />
      </button>
      {open && ReactDOM.createPortal(
        <div ref={menuRef} role="menu" style={menuStyle}
          className="animate-fadeIn overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl shadow-slate-900/10">
          <Link to={`/purchases/${row.id}/edit`}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
            onClick={() => closeAndAct(() => {})}>
            <FiEdit size={16} className="text-slate-400" /> Edit
          </Link>
          <button onClick={() => closeAndAct(() => onDuplicate(row))}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50">
            <FiCopy size={16} className="text-slate-400" /> Duplicate
          </button>
          <div className="my-1 border-t border-slate-100" />
          <button onClick={() => closeAndAct(() => onPrint(row))}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50">
            <FiPrinter size={16} className="text-slate-400" /> Print (A4)
          </button>
          <button onClick={() => closeAndAct(() => onRecordPayment(row))}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50">
            <FiCreditCard size={16} className="text-slate-400" /> Record Payment
          </button>
          <div className="my-1 border-t border-slate-100" />
          <button onClick={() => closeAndAct(() => onDelete(row))}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50">
            <FiTrash2 size={16} /> Delete
          </button>
        </div>, document.body
      )}
    </>
  );
});
ActionDropdown.displayName = 'ActionDropdown';

/* ------------------------------------------------------------------ */
/* CSV parser + import helpers                                         */
/* ------------------------------------------------------------------ */

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) return [];
  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = ''; let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') { if (inQuotes && line[i + 1] === '"') { current += '"'; i++; } else { inQuotes = !inQuotes; } }
      else if (char === ',' && !inQuotes) { result.push(current); current = ''; }
      else { current += char; }
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
    headers.forEach((header, idx) => { row[header] = values[idx].trim(); });
    rows.push(row);
  }
  return rows;
}

function extractId(obj: unknown, depth = 0): number | null {
  if (depth > 4 || obj == null) return null;
  if (typeof obj === 'number') return Number.isFinite(obj) ? obj : null;
  if (typeof obj === 'string' && /^\d+$/.test(obj)) return parseInt(obj, 10);
  if (Array.isArray(obj)) { for (const item of obj) { const id = extractId(item, depth + 1); if (id) return id; } return null; }
  if (typeof obj === 'object') {
    const record = obj as Record<string, unknown>;
    if ('id' in record) {
      const idVal = record.id;
      if (typeof idVal === 'number') return idVal;
      if (typeof idVal === 'string' && /^\d+$/.test(idVal)) return parseInt(idVal, 10);
    }
    if ('data' in record && record.data && typeof record.data === 'object' && !Array.isArray(record.data)) {
      const dataId = extractId(record.data, depth + 1); if (dataId) return dataId;
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
      if (val && typeof val === 'object') { const id = extractId(val, depth + 1); if (id) return id; }
    }
  }
  return null;
}

async function resolveSupplier(
  row: Record<string, unknown>, knownSuppliers: Supplier[], setSuppliers: (list: Supplier[]) => void
): Promise<number | null> {
  if (row.supplier_id && !isNaN(Number(row.supplier_id))) return Number(row.supplier_id);
  if (!row.supplier_name) return null;
  let allSuppliers = knownSuppliers;
  if (allSuppliers.length === 0) {
    try {
      const res = await apiClient.request('GET', '/suppliers');
      allSuppliers = unwrapList<Supplier>(res);
      setSuppliers(allSuppliers);
    } catch { /* silent */ }
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
  } catch { return null; }
}

/* ==================================================================
 * ERP-compatible payload builders
 * ================================================================== */

function buildSupplierPayload(input: {
  name: string; gstin?: string; email?: string; phone?: string; address?: string;
  companyId: number; branchId: number | null; type?: string;
}): Record<string, unknown> {
  const name = input.name.trim();
  const addr = (input.address || '').trim();
  return {
    name,
    type: input.type || 'supplier',
    company_type: '',
    email: (input.email || '').trim(),
    contact_no: (input.phone || '').trim(),
    contact_person: '',
    gst_number: (input.gstin || '').trim().toUpperCase(),
    registration_type: '',
    pan: '',
    billing_street: addr,
    billing_landmark: '',
    billing_city: '',
    billing_state: '',
    billing_country: 'India',
    billing_pincode: '',
    shipping_street: addr,
    shipping_landmark: '',
    shipping_city: '',
    shipping_state: '',
    shipping_country: 'India',
    shipping_pincode: '',
    is_active: true,
    company_id: input.companyId,
    branch_id: input.branchId,
  };
}

interface BuildPurchaseInput {
  purchaseNumber: string;
  supplierId: number;
  purchaseDate: string;
  dueDate: string | null;
  companyId: number;
  branchId: number | null;
  status: string;
  warehouse: string;
  items: LineItemDraft[];
  isInterstate: boolean;
  payments: PaymentDraft[];
  generalDiscountType: 'percent' | 'amount';
  generalDiscountPercent: number;
  generalDiscountAmount: number;
  generalDiscountApplyType: 'before_tax' | 'after_tax';
  packingCharges: number;
  packingApplyType: 'before_tax' | 'after_tax';
  tcsPercent: number;
  roundOff: number;
  taxableSubtotal: number;
  itemTaxTotal: number;
  packingTax: number;
  grandTotal: number;
  paidAmount: number;
  paymentStatus: string;
}

function buildPurchasePayload(input: BuildPurchaseInput): Record<string, unknown> {
  const activeItems = input.items.filter((i) => i.action !== 'skip');

  return {
    purchase_number: input.purchaseNumber.trim(),
    bill_number: input.purchaseNumber.trim(),
    supplier_id: input.supplierId,
    purchase_date: input.purchaseDate,
    due_date: input.dueDate,
    company_id: input.companyId,
    branch_id: input.branchId ?? 1,
    status: (input.status || 'Ordered').toLowerCase(),
    warehouse: input.warehouse || 'Main Warehouse',

    general_discount_type: input.generalDiscountType,
    general_discount_percent: input.generalDiscountType === 'percent' ? input.generalDiscountPercent : 0,
    general_discount_amount: input.generalDiscountType === 'amount' ? input.generalDiscountAmount : 0,
    general_discount_apply_type: input.generalDiscountApplyType,
    packing_charges: round2(input.packingCharges),
    packing_apply_type: input.packingApplyType,
    tcs_percent: round2(input.tcsPercent),
    round_off: round2(input.roundOff),

    order_discount: 0,
    shipping_charges: 0,
    other_charges: 0,

    notes: 'Imported via AI OCR',
    internal_remarks: '',

    items: activeItems.map((i) => {
      const gst = effectiveItemGst(i);
      const qty = Number(i.quantity) || 0;
      const rate = Number(i.unit_price) || 0;
      const discType = i.discount_type;
      const discPct = discType === 'percent' ? Math.min(100, Math.max(0, i.discount_percent)) : 0;
      const discAmt = discType === 'amount' ? Math.max(0, i.discount_amount) : 0;
      return {
        product_id: i.action === 'existing' && i.matched_product_id ? i.matched_product_id : null,
        product_name: (i.description || 'Item').trim(),
        hsn_sac_code: i.hsn_sac || '',
        unit: i.unit || 'PCS',
        quantity: qty,
        purchase_price: rate,
        discount_type: discType,
        discount_percent: discPct,
        discount_amount: discAmt,
        gst_slab: gst,
        is_inter_state: input.isInterstate,
        cgst_percent: input.isInterstate ? 0 : gst / 2,
        sgst_percent: input.isInterstate ? 0 : gst / 2,
        igst_percent: input.isInterstate ? gst : 0,
      };
    }),

    payments: input.payments
      .filter((p) => Number(p.amount) > 0)
      .map((p) => ({
        amount: round2(Number(p.amount)),
        payment_method: toBackendPaymentMethod(p.payment_method),
        payment_direction: p.payment_direction || 'outward',
        transaction_date: p.transaction_date || getLocalToday(),
        reference_no: p.reference_no || '',
        bank_name: '',
        account_number: '',
        remarks: p.remarks || '',
        company_id: input.companyId,
        branch_id: input.branchId ?? 1,
      })),

    total_amount: round2(input.grandTotal),
    tax_amount: round2(input.itemTaxTotal + input.packingTax),
    discount_amount: round2(
      input.generalDiscountType === 'amount'
        ? input.generalDiscountAmount
        : (input.taxableSubtotal * input.generalDiscountPercent) / 100
    ),

    grand_total: round2(input.grandTotal),
    paid_amount: round2(input.paidAmount),
    payment_status: input.paymentStatus,
  };
}

/* ==================================================================
 * Post-create verification
 * ================================================================== */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface CreateResult { success: boolean; data?: unknown; verified?: boolean; error?: string }

async function findPurchaseByNumber(purchaseNumber: string): Promise<PurchaseInvoice | null> {
  if (!purchaseNumber.trim()) return null;
  cache.delete('purchase-invoices');
  try {
    const res = await apiClient.getPurchaseInvoices();
    const list = unwrapList<PurchaseInvoice>(res);
    const needle = purchaseNumber.trim().toLowerCase();
    return list.find(
      (p) =>
        String(p.purchase_number || '').toLowerCase() === needle ||
        String(p.bill_number || '').toLowerCase() === needle
    ) ?? null;
  } catch { return null; }
}

async function createPurchaseWithVerification(
  payload: Record<string, unknown>, purchaseNumber: string
): Promise<CreateResult> {
  try {
    let response: unknown;
    if (typeof (apiClient as { createPurchaseInvoice?: unknown }).createPurchaseInvoice === 'function') {
      response = await (apiClient as { createPurchaseInvoice: (p: unknown) => Promise<unknown> }).createPurchaseInvoice(payload);
    } else {
      response = await apiClient.request('POST', '/purchase-invoices', payload);
    }
    return { success: true, data: response };
  } catch (err: unknown) {
    const detailed = getDetailedError(err);
    const status = (err as { status?: number; response?: { status?: number } })?.status
      ?? (err as { response?: { status?: number } })?.response?.status;
    console.warn('[OCR] POST /purchase-invoices failed:', detailed, '(status', status, ') — verifying…');
    await sleep(800);
    const found = await findPurchaseByNumber(purchaseNumber);
    if (found) return { success: true, data: found, verified: true };
    return { success: false, error: detailed };
  }
}

/* ==================================================================
 * Gemini Vision OCR
 * ================================================================== */

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const FALLBACK_GEMINI_MODEL = 'gemini-1.5-flash';

const GEMINI_OCR_PROMPT = `You are an expert Indian GST Accounting AI system. Extract structured financial data from handwritten or printed Indian bills, cash receipts, and GST invoices.
The documents often contain mixed Hindi + English (Hinglish), handwritten amounts, Rupee symbols (₹, Rs, रुपये), GSTIN numbers, HSN/SAC codes, CGST/SGST/IGST breakdowns, and handwritten totals.

CRITICAL INSTRUCTION FOR GST & TAX EXTRACTION:
- Extract GSTIN numbers for Vendor and Customer (15-character alphanumeric, e.g., 10ABCDE1234F1Z5).
- Detect if bill is Intrastate (CGST + SGST apply) or Interstate (IGST applies).
- Extract or compute: HSN/SAC Code, Taxable Amount, GST Rate % (0, 5, 12, 18, 28), CGST Amount, SGST Amount, IGST Amount, and Total Line Item Amount.
- DO NOT HALLUCINATE. If text is illegible, set value to null and provide low confidence (<0.60).
- Check Math: Verify Taxable Amount = Qty * Rate; GST Amount = Taxable * (GST% / 100); Grand Total = Taxable Subtotal + Total Tax - Discount.
- invoice_date and due_date must be ISO YYYY-MM-DD. If the invoice shows DD/MM/YYYY, convert it.
- Return ONLY valid JSON. No prose, no markdown, no code fences.`;

const GEMINI_OCR_SCHEMA = {
  type: 'OBJECT',
  properties: {
    invoice_number: { type: 'STRING', nullable: true },
    invoice_date: { type: 'STRING', nullable: true },
    due_date: { type: 'STRING', nullable: true },
    vendor_gstin: { type: 'STRING', nullable: true },
    customer_gstin: { type: 'STRING', nullable: true },
    is_interstate: { type: 'BOOLEAN', nullable: true },
    party_name: { type: 'STRING', nullable: true },
    supplier_name: { type: 'STRING', nullable: true },
    supplier_email: { type: 'STRING', nullable: true },
    supplier_phone: { type: 'STRING', nullable: true },
    supplier_address: { type: 'STRING', nullable: true },
    supplier_confidence: { type: 'NUMBER' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          description: { type: 'STRING', nullable: true },
          product_name: { type: 'STRING', nullable: true },
          hsn_sac: { type: 'STRING', nullable: true },
          quantity: { type: 'NUMBER', nullable: true },
          unit: { type: 'STRING', nullable: true },
          unit_price: { type: 'NUMBER', nullable: true },
          rate: { type: 'NUMBER', nullable: true },
          taxable_amount: { type: 'NUMBER', nullable: true },
          gst_rate: { type: 'NUMBER', nullable: true },
          cgst_amount: { type: 'NUMBER', nullable: true },
          sgst_amount: { type: 'NUMBER', nullable: true },
          igst_amount: { type: 'NUMBER', nullable: true },
          amount: { type: 'NUMBER', nullable: true },
          total: { type: 'NUMBER', nullable: true },
          confidence: { type: 'NUMBER' },
        },
      },
    },
    subtotal: { type: 'NUMBER', nullable: true },
    taxable_subtotal: { type: 'NUMBER', nullable: true },
    total_cgst: { type: 'NUMBER', nullable: true },
    total_sgst: { type: 'NUMBER', nullable: true },
    total_igst: { type: 'NUMBER', nullable: true },
    tax_amount: { type: 'NUMBER', nullable: true },
    total_tax: { type: 'NUMBER', nullable: true },
    discount_amount: { type: 'NUMBER', nullable: true },
    discount: { type: 'NUMBER', nullable: true },
    round_off: { type: 'NUMBER', nullable: true },
    grand_total: { type: 'NUMBER', nullable: true },
    total_confidence: { type: 'NUMBER' },
    payment_method: { type: 'STRING', nullable: true },
    payment_amount: { type: 'NUMBER', nullable: true },
    notes: { type: 'STRING', nullable: true },
  },
};

function readGeminiConfig(): { apiKey: string; model: string; source: string } {
  const env = (import.meta as unknown as { env?: Record<string, unknown> }).env ?? {};
  let apiKey = safeStr(env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY).trim();
  let model = safeStr(env.VITE_GEMINI_MODEL || env.GEMINI_MODEL).trim();
  let source = apiKey ? '.env' : '';

  if (!apiKey) {
    try {
      const stored = window.localStorage.getItem('bill_extract_settings');
      if (stored) {
        const parsed = JSON.parse(stored) as { apiKey?: string; selectedModel?: string };
        if (parsed.apiKey) { apiKey = String(parsed.apiKey).trim(); source = 'BillExtract settings'; }
        if (!model && parsed.selectedModel) model = String(parsed.selectedModel).trim();
      }
    } catch { /* ignore */ }
  }
  if (!model) model = DEFAULT_GEMINI_MODEL;
  return { apiKey, model, source };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('File reading failed. File may be corrupted.'));
    reader.readAsDataURL(file);
  });
}

interface OCRErrorInfo {
  kind: 'auth' | 'quota' | 'model' | 'payload' | 'network' | 'parse' | 'blocked' | 'server' | 'unknown';
  message: string;
  canRetry: boolean;
  canSwitchModel: boolean;
  status?: number;
}

function classifyOCRError(error: unknown): OCRErrorInfo {
  const msg = error instanceof Error ? error.message : String(error || '');
  const lower = msg.toLowerCase();

  if (lower.includes('api key') || lower.includes('authentication') || lower.includes('unauthorized')) {
    return { kind: 'auth', message: msg, canRetry: false, canSwitchModel: false };
  }
  if (lower.includes('quota') || lower.includes('rate limit') || lower.includes('429')) {
    return { kind: 'quota', message: 'API quota or rate limit reached. Wait a moment and retry.', canRetry: true, canSwitchModel: true };
  }
  if (lower.includes('model') && (lower.includes('not found') || lower.includes('404'))) {
    return { kind: 'model', message: 'The requested model is unavailable. Try switching to a different model.', canRetry: false, canSwitchModel: true };
  }
  if (lower.includes('network') || lower.includes('failed to fetch') || lower.includes('timeout')) {
    return { kind: 'network', message: msg, canRetry: true, canSwitchModel: true };
  }
  if (lower.includes('parse') || lower.includes('json')) {
    return { kind: 'parse', message: 'The AI returned an unreadable response. Try a clearer photo or retry.', canRetry: true, canSwitchModel: true };
  }
  if (lower.includes('refused') || lower.includes('block')) {
    return { kind: 'blocked', message: msg, canRetry: false, canSwitchModel: true };
  }
  if (lower.includes('http error 5') || lower.includes('server')) {
    return { kind: 'server', message: msg, canRetry: true, canSwitchModel: true };
  }
  if (lower.includes('invalid api payload') || lower.includes('unsupported image')) {
    return { kind: 'payload', message: msg, canRetry: false, canSwitchModel: false };
  }
  return { kind: 'unknown', message: msg || 'OCR extraction failed.', canRetry: true, canSwitchModel: true };
}

async function extractWithGemini(file: File, modelOverride?: string): Promise<OCRInvoiceData> {
  const { apiKey, model: configuredModel } = readGeminiConfig();
  const model = modelOverride || configuredModel;

  if (!apiKey) {
    throw new Error('Gemini API key is not configured. Add VITE_GEMINI_API_KEY=… to .env and restart the dev server, OR configure it in the BillExtract AI settings page.');
  }

  const base64 = await fileToBase64(file);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const payload = {
    contents: [{
      role: 'user',
      parts: [
        { text: GEMINI_OCR_PROMPT },
        {
          inlineData: {
            mimeType: file.type || 'image/jpeg',
            data: base64.includes('base64,') ? base64.split('base64,')[1] : base64,
          },
        },
      ],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: GEMINI_OCR_SCHEMA,
    },
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (networkErr) {
    throw new Error(`Network request to Gemini failed: ${networkErr instanceof Error ? networkErr.message : 'unknown error'}. Check your internet connection.`);
  }

  if (!response.ok) {
    if (response.status === 400) throw new Error('Invalid API payload or unsupported image format. Please verify the image file.');
    if (response.status === 401 || response.status === 403) throw new Error('Gemini API Key Authentication Failed. Please check your key in the BillExtract settings page or .env file.');
    if (response.status === 429) throw new Error('API Quota Rate Limit Exceeded. Please wait a moment and try again.');
    if (response.status === 404) throw new Error(`Model "${model}" was not found. Try switching to a different model.`);
    if (response.status >= 500) throw new Error(`Server returned HTTP Error ${response.status}. This is temporary — please retry.`);
    throw new Error(`Server returned HTTP Error ${response.status}.`);
  }

  const result = await response.json();
  if (!result.candidates || result.candidates.length === 0) {
    const reason = result?.promptFeedback?.blockReason;
    throw new Error(reason ? `AI engine refused to process this image (${reason}).` : 'AI Engine did not return any candidate response. Image might be unreadable.');
  }

  const rawText = result.candidates[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error('AI payload response text is empty.');

  let parsed: unknown;
  try {
    const cleanedJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    parsed = JSON.parse(cleanedJson);
  } catch {
    throw new Error('Failed to parse structured JSON from AI output.');
  }
  return normalizeOCRResponse(parsed);
}

function normalizeOCRResponse(raw: unknown): OCRInvoiceData {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const root = (obj.data && typeof obj.data === 'object' ? obj.data : obj) as Record<string, unknown>;
  const supplier = (root.supplier && typeof root.supplier === 'object' ? root.supplier : {}) as Record<string, unknown>;
  const rawItems = Array.isArray(root.items) ? (root.items as Record<string, unknown>[]) : [];

  const items: OCRLineItem[] = rawItems.map((it) => {
    const qty = safeNum(it.quantity) || 1;
    const unitPrice = safeNum(it.unit_price ?? it.rate ?? it.price);
    const total = safeNum(it.total ?? it.amount);
    const taxRate = safeNum(it.gst_rate ?? it.tax_rate) || undefined;
    return {
      description: safeStr(it.description || it.name || it.product_name, ''),
      hsn_sac: safeStr(it.hsn_sac || it.hsn || it.sac, '') || undefined,
      quantity: qty,
      unit: safeStr(it.unit || it.uom, '') || undefined,
      unit_price: unitPrice,
      discount: safeNum(it.discount) || undefined,
      tax_rate: taxRate,
      total,
      confidence: safeNum(it.confidence) || undefined,
    };
  });

  return {
    invoice_number: safeStr(root.invoice_number || root.bill_number || root.invoice_no),
    invoice_date: normalizeDateInput(root.invoice_date || root.date) || getLocalToday(),
    due_date: normalizeDateInput(root.due_date) || undefined,
    supplier: {
      name: safeStr(supplier.name || root.supplier_name || root.party_name),
      gstin: safeStr(supplier.gstin || root.vendor_gstin || root.gstin) || undefined,
      email: safeStr(supplier.email || root.supplier_email) || undefined,
      phone: safeStr(supplier.phone || root.supplier_phone) || undefined,
      address: safeStr(supplier.address || root.supplier_address) || undefined,
      confidence: safeNum(supplier.confidence || root.supplier_confidence) || undefined,
    },
    items: items.length ? items : [{ description: '', quantity: 1, unit_price: 0, total: 0 }],
    subtotal: safeNum(root.subtotal ?? root.taxable_subtotal),
    tax_amount: safeNum(root.tax_amount ?? root.total_tax),
    discount_amount: safeNum(root.discount_amount ?? root.discount),
    grand_total: safeNum(root.grand_total ?? root.total_amount ?? root.total),
    currency: safeStr(root.currency || 'INR'),
    notes: safeStr(root.notes) || undefined,
    overall_confidence: safeNum(root.total_confidence ?? root.confidence) || undefined,
    is_interstate: typeof root.is_interstate === 'boolean' ? (root.is_interstate as boolean) : undefined,
  };
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function scoreSupplierMatch(name: string, gstin: string | undefined, s: Supplier): number {
  let score = 0;
  const n1 = normalizeName(name); const n2 = normalizeName(s.name);
  if (n1 && n2) {
    if (n1 === n2) score += 60;
    else if (n2.includes(n1) || n1.includes(n2)) score += 35;
    else {
      const wordsA = new Set(n1.split(' ')); const wordsB = n2.split(' ');
      const overlap = wordsB.filter((w) => wordsA.has(w)).length;
      score += Math.min(30, overlap * 10);
    }
  }
  if (gstin && s.gstin && gstin.toUpperCase() === s.gstin.toUpperCase()) score += 100;
  return score;
}
function scoreProductMatch(item: OCRLineItem, p: ProductLite): number {
  let score = 0;
  const n1 = normalizeName(item.description); const n2 = normalizeName(p.name);
  if (n1 && n2) {
    if (n1 === n2) score += 60;
    else if (n2.includes(n1) || n1.includes(n2)) score += 35;
    else {
      const wordsA = new Set(n1.split(' ')); const wordsB = n2.split(' ');
      const overlap = wordsB.filter((w) => wordsA.has(w)).length;
      score += Math.min(30, overlap * 8);
    }
  }
  if (item.hsn_sac && p.hsn_sac_code && item.hsn_sac === p.hsn_sac_code) score += 40;
  return score;
}

/* ==================================================================
 * Legacy CSV / JSON import modal
 * ================================================================== */

interface ImportModalProps { isOpen: boolean; onClose: () => void; onImported: () => void }
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
    apiClient.getCompanies()
      .then((res: unknown) => {
        if (!active) return;
        const list = unwrapList<Company>(res);
        setCompanies(list);
        if (list.length > 0) setDefaultCompanyId(String(list[0].id));
      })
      .catch(() => {})
      .finally(() => { if (active) setLoadingCompanies(false); });
    apiClient.request('GET', '/suppliers')
      .then((res: unknown) => { if (active) setSuppliers(unwrapList<Supplier>(res)); })
      .catch(() => {});
    return () => { active = false; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setParsedRows([]); setFileName(''); setError(null);
      setImportProgress({ current: 0, total: 0 });
      setCompanies([]); setBranches([]); setSuppliers([]);
      setDefaultCompanyId(''); setDefaultBranchId('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!defaultCompanyId) { setBranches([]); setDefaultBranchId(''); return; }
    let active = true;
    setLoadingBranches(true);
    apiClient.getBranchesByCompany(Number(defaultCompanyId))
      .then((res: unknown) => {
        if (!active) return;
        const list = unwrapList<Branch>(res);
        setBranches(list);
        setDefaultBranchId(list.length > 0 ? String(list[0].id) : '');
      })
      .catch(() => { if (active) { setBranches([]); setDefaultBranchId(''); } })
      .finally(() => { if (active) setLoadingBranches(false); });
    return () => { active = false; };
  }, [defaultCompanyId]);

  const handleFile = useCallback((file: File) => {
    setError(null); setParsedRows([]); setFileName(file.name);
    const extension = file.name.split('.').pop()?.toLowerCase();
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) ?? '';
      try {
        if (extension === 'json') {
          const data = JSON.parse(text);
          if (!Array.isArray(data)) throw new Error('JSON file must contain an array of purchase objects.');
          setParsedRows(data as ImportRow[]);
        } else if (extension === 'csv') { setParsedRows(parseCSV(text)); }
        else { throw new Error('Unsupported file type. Please upload .csv or .json.'); }
      } catch (err: unknown) { setError(getErrorMessage(err, 'Failed to parse file.')); setParsedRows([]); }
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
      a.href = url; a.download = 'purchase_template.csv'; a.click();
      URL.revokeObjectURL(url);
    } else {
      const jsonData = [{
        purchase_number: 'PO-2024-001', supplier_id: 1, supplier_name: 'ABC Supplies',
        supplier_email: 'supplier@abc.com', purchase_date: '2024-01-15', due_date: '2024-02-15',
        grand_total: 1000.0, paid_amount: 500.0, status: 'Ordered', payment_status: 'Partial',
        warehouse: 'Main Warehouse', company_id: 1, branch_id: 1,
        items: [{ product_id: 1, quantity: 1, unit_price: 1000.0, total: 1180.0 }],
        payments: [{ amount: 500.0, payment_method: 'Bank Transfer', reference: 'REF001', payment_date: '2024-01-15', notes: 'Partial payment', payment_direction: 'outward', company_id: 1, branch_id: 1 }],
      }];
      const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'purchase_template.json'; a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleImport = async () => {
    if (parsedRows.length === 0) { setError('No data to import.'); return; }
    const firstRow = parsedRows[0];
    const keys = Object.keys(firstRow).map((k) => k.toLowerCase());
    const missing = ['purchase_number', 'grand_total'].filter((f) => !keys.includes(f));
    if (missing.length > 0) { setError(`Missing required columns: ${missing.join(', ')}`); return; }
    if (!defaultCompanyId) { setError('Please select a default company.'); return; }

    setIsImporting(true);
    setImportProgress({ current: 0, total: parsedRows.length });
    let successCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < parsedRows.length; i++) {
      const row = parsedRows[i];
      const normalizedRow: Record<string, unknown> = {};
      Object.keys(row).forEach((key) => { normalizedRow[key.toLowerCase()] = row[key]; });
      try {
        const supplierId = await resolveSupplier(normalizedRow, suppliers, setSuppliers);
        if (!supplierId) throw new Error('Supplier not found and could not be created.');
        const companyId = normalizedRow.company_id ? Number(normalizedRow.company_id) : Number(defaultCompanyId);
        const branchId = normalizedRow.branch_id ? Number(normalizedRow.branch_id) : defaultBranchId ? Number(defaultBranchId) : 1;
        const grandTotal = safeNum(normalizedRow.grand_total);
        const paidAmount = safeNum(normalizedRow.paid_amount);
        const status = String(normalizedRow.status || 'Ordered');
        const paymentStatus = String(normalizedRow.payment_status || (paidAmount >= grandTotal ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Unpaid'));

        const payload: Record<string, unknown> = {
          purchase_number: normalizedRow.purchase_number,
          bill_number: normalizedRow.purchase_number,
          supplier_id: supplierId,
          purchase_date: normalizedRow.purchase_date || getLocalToday(),
          due_date: normalizedRow.due_date || null,
          grand_total: grandTotal,
          paid_amount: paidAmount,
          status,
          payment_status: paymentStatus,
          warehouse: normalizedRow.warehouse || 'Main Warehouse',
          company_id: companyId,
          branch_id: branchId,
          items: Array.isArray(normalizedRow.items)
            ? (normalizedRow.items as Record<string, unknown>[]).map((item) => ({
                product_id: Number(item.product_id) || null,
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
          newPurchaseResponse = await (apiClient as { createPurchaseInvoice: (p: unknown) => Promise<unknown> }).createPurchaseInvoice(payload);
        } else {
          newPurchaseResponse = await apiClient.request('POST', '/purchase-invoices', payload);
        }
        const newPurchaseId = extractId(newPurchaseResponse);
        if (!newPurchaseId) throw new Error('Purchase created but ID extraction failed.');
        successCount++;
      } catch (err: unknown) { errors.push(`Row ${i + 1}: ${getDetailedError(err)}`); }
      setImportProgress({ current: i + 1, total: parsedRows.length });
    }

    setIsImporting(false);
    if (successCount > 0) {
      showSuccess('Import completed', `${successCount} purchase(s) created.`);
      safeLog({ module: 'Purchases', action: 'Import', status: 'success', message: `Imported ${successCount} purchases from ${fileName}` });
      onImported();
    }
    if (errors.length > 0) {
      const summary = errors.slice(0, 5).join('; ');
      showError('Some rows failed', summary);
      setError(summary);
    } else if (successCount === parsedRows.length) { onClose(); }
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
            <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
              <FiX size={18} />
            </button>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Default Company *</label>
              <div className="relative">
                <select value={defaultCompanyId} onChange={(e) => setDefaultCompanyId(e.target.value)} disabled={loadingCompanies}
                  className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10">
                  <option value="">Select Company</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Default Branch</label>
              <div className="relative">
                <select value={defaultBranchId} onChange={(e) => setDefaultBranchId(e.target.value)} disabled={loadingBranches || !defaultCompanyId}
                  className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400">
                  <option value="">Select Branch</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              </div>
            </div>
          </div>

          <div className="mb-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-xs text-slate-600">
            <p className="mb-2 font-semibold text-slate-700">File format requirements</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>CSV or JSON file.</li>
              <li>Required columns: <code className="rounded bg-slate-100 px-1">purchase_number</code>, <code className="rounded bg-slate-100 px-1">grand_total</code></li>
              <li>Supplier: <code className="rounded bg-slate-100 px-1">supplier_id</code> or <code className="rounded bg-slate-100 px-1">supplier_name</code></li>
            </ul>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <input ref={fileInputRef} type="file" accept=".csv,.json" onChange={onFileChange} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800">
              <FiUpload size={16} /> Choose File
            </button>
            <span className="truncate text-sm text-slate-500">{fileName || 'No file selected'}</span>
          </div>

          <div className="mb-4 flex flex-wrap gap-4">
            <button onClick={() => downloadTemplate('csv')} className="text-sm font-medium text-indigo-600 underline-offset-2 hover:underline">Download CSV template</button>
            <button onClick={() => downloadTemplate('json')} className="text-sm font-medium text-indigo-600 underline-offset-2 hover:underline">Download JSON template</button>
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
                    {Object.keys(parsedRows[0]).slice(0, 8).map((key) => (
                      <th key={key} className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">{key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.slice(0, 10).map((row, idx) => (
                    <tr key={idx} className="border-t border-slate-100">
                      {Object.values(row).slice(0, 8).map((value, i) => (
                        <td key={i} className="max-w-[150px] truncate px-2 py-1.5 text-xs">
                          {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {isImporting && (
            <div className="mb-4">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <FiPackage className="animate-spin" size={16} />
                Importing… {importProgress.current}/{importProgress.total}
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div className="h-2 rounded-full bg-indigo-600 transition-all"
                  style={{ width: `${importProgress.total > 0 ? (importProgress.current / importProgress.total) * 100 : 0}%` }} />
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <button onClick={onClose} disabled={isImporting}
              className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">
              Cancel
            </button>
            <button onClick={handleImport} disabled={parsedRows.length === 0 || isImporting}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50">
              {isImporting ? 'Importing…' : 'Import Purchases'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
PurchaseImportModal.displayName = 'PurchaseImportModal';

/* ==================================================================
 * Purchase OCR Wizard
 * ================================================================== */

interface PurchaseOCRModalProps { isOpen: boolean; onClose: () => void; onImported: () => void }

const PurchaseOCRModal = memo(({ isOpen, onClose, onImported }: PurchaseOCRModalProps) => {
  const { showSuccess, showError } = useNotification();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<OCRStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<OCRErrorInfo | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [envWarning, setEnvWarning] = useState<string | null>(null);
  const [geminiModel, setGeminiModel] = useState<string>('');
  const [geminiSource, setGeminiSource] = useState<string>('');

  const [extracted, setExtracted] = useState<OCRInvoiceData | null>(null);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [supplierMode, setSupplierMode] = useState<'existing' | 'new'>('new');
  const [matchedSupplierId, setMatchedSupplierId] = useState<number | null>(null);
  const [items, setItems] = useState<LineItemDraft[]>([]);
  const [loadingMappings, setLoadingMappings] = useState(false);

  const [payments, setPayments] = useState<PaymentDraft[]>([]);

  /* Bill-level — state inputs */
  const [generalDiscountType, setGeneralDiscountType] = useState<'percent' | 'amount'>('percent');
  const [generalDiscountPercent, setGeneralDiscountPercent] = useState<number>(0);
  // NOTE: renamed to avoid collision with the derived `generalDiscountAmount` below.
  const [generalDiscountAmountInput, setGeneralDiscountAmountInput] = useState<number>(0);
  const [generalDiscountApplyType, setGeneralDiscountApplyType] = useState<'before_tax' | 'after_tax'>('before_tax');
  const [packingCharges, setPackingCharges] = useState<number>(0);
  const [packingApplyType, setPackingApplyType] = useState<'before_tax' | 'after_tax'>('after_tax');
  const [tcsPercent, setTcsPercent] = useState<number>(0);
  const [autoRoundOff, setAutoRoundOff] = useState<boolean>(true);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [purchaseStatus, setPurchaseStatus] = useState<string>('Ordered');
  const [warehouse, setWarehouse] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitDiagnostics, setSubmitDiagnostics] = useState<Record<string, unknown> | null>(null);

  /* ---------- Reset ---------- */

  const resetAll = useCallback(() => {
    setStep('upload'); setFile(null); setOcrLoading(false); setOcrError(null); setDragOver(false);
    setExtracted(null); setSupplierMode('new'); setMatchedSupplierId(null); setItems([]); setPayments([]);
    setCompanyId(''); setBranchId(''); setPurchaseStatus('Ordered'); setWarehouse(''); setSubmitting(false);
    setGeneralDiscountType('percent'); setGeneralDiscountPercent(0); setGeneralDiscountAmountInput(0);
    setGeneralDiscountApplyType('before_tax');
    setPackingCharges(0); setPackingApplyType('after_tax'); setTcsPercent(0); setAutoRoundOff(true);
    setSubmitError(null); setSubmitDiagnostics(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  }, []);

  useEffect(() => {
    if (!isOpen) { const t = window.setTimeout(resetAll, 200); return () => window.clearTimeout(t); }
  }, [isOpen, resetAll]);

  useEffect(() => {
    if (!isOpen) return;
    const { apiKey, model, source } = readGeminiConfig();
    setGeminiModel(model); setGeminiSource(source);
    setEnvWarning(!apiKey ? 'Gemini API key not found. Add VITE_GEMINI_API_KEY=… to your .env file (and restart the dev server), OR configure it in the BillExtract AI settings page.' : null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    apiClient.getCompanies()
      .then((res) => {
        if (!active) return;
        const list = unwrapList<Company>(res);
        setCompanies(list);
        if (list.length === 1) setCompanyId(String(list[0].id));
      })
      .catch(() => {});
    return () => { active = false; };
  }, [isOpen]);

  useEffect(() => {
    if (!companyId) { setBranches([]); setBranchId(''); return; }
    let active = true;
    apiClient.getBranchesByCompany(Number(companyId))
      .then((res) => {
        if (!active) return;
        const list = unwrapList<Branch>(res);
        setBranches(list);
        if (list.length === 1) setBranchId(String(list[0].id));
      })
      .catch(() => { if (active) setBranches([]); });
    return () => { active = false; };
  }, [companyId]);

  /* ---------- OCR ---------- */

  const runOCR = useCallback(async (f: File, modelOverride?: string) => {
    setOcrLoading(true); setOcrError(null);
    try {
      const data = await extractWithGemini(f, modelOverride);
      setExtracted(data);
      setItems(data.items.map((it) => ({
        id: uid('item'),
        description: it.description,
        hsn_sac: it.hsn_sac,
        quantity: it.quantity,
        unit: it.unit,
        unit_price: it.unit_price,
        tax_rate: it.tax_rate ?? 0,
        discount_type: 'percent' as const,
        discount_percent: 0,
        discount_amount: 0,
        total: it.total,
        action: 'new' as const,
        matched_product_id: null,
        matched_product_name: null,
      })));
      setStep('verify');
      showSuccess('Scan complete', `Extracted ${data.items.length} line item(s).`);
    } catch (err: unknown) {
      const info = classifyOCRError(err);
      setOcrError(info);
    } finally { setOcrLoading(false); }
  }, [showSuccess]);

  const handleFile = useCallback((f: File) => {
    if (!f) return;
    if (f.size > OCR_MAX_BYTES) { showError('File too large', 'Maximum size is 10 MB.'); return; }
    setFile(f);
    void runOCR(f);
  }, [runOCR, showError]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const retryWithSameModel = useCallback(() => {
    if (file) void runOCR(file);
  }, [file, runOCR]);

  const retryWithAlternateModel = useCallback(() => {
    if (!file) return;
    const alt = geminiModel === FALLBACK_GEMINI_MODEL ? DEFAULT_GEMINI_MODEL : FALLBACK_GEMINI_MODEL;
    setGeminiModel(alt);
    showSuccess('Switching model', `Retrying with ${alt}…`);
    void runOCR(file, alt);
  }, [file, geminiModel, runOCR, showSuccess]);

  const skipOCR = useCallback(() => {
    setExtracted({
      invoice_number: '', invoice_date: getLocalToday(),
      supplier: { name: '' },
      items: [{ description: '', quantity: 1, unit_price: 0, total: 0 }],
      subtotal: 0, tax_amount: 0, discount_amount: 0, grand_total: 0, currency: 'INR',
    });
    setItems([{
      id: uid('item'),
      description: '',
      quantity: 1,
      unit_price: 0,
      tax_rate: 0,
      discount_type: 'percent',
      discount_percent: 0,
      discount_amount: 0,
      total: 0,
      action: 'new',
      matched_product_id: null,
      matched_product_name: null,
    }]);
    setStep('verify');
  }, []);

  /* ---------- Fetch suppliers + products for mapping ---------- */

  useEffect(() => {
    if (step !== 'verify') return;
    if (suppliers.length > 0 && products.length > 0) return;
    let active = true;
    setLoadingMappings(true);
    Promise.allSettled([
      suppliers.length === 0 ? apiClient.request('GET', '/suppliers') : Promise.resolve(null),
      products.length === 0 ? apiClient.getAllProducts() : Promise.resolve(null),
    ]).then(([supRes, prodRes]) => {
      if (!active) return;
      if (supRes.status === 'fulfilled' && supRes.value) setSuppliers(unwrapList<Supplier>(supRes.value));
      if (prodRes.status === 'fulfilled' && prodRes.value) setProducts(unwrapList<ProductLite>(prodRes.value));
    }).finally(() => { if (active) setLoadingMappings(false); });
    return () => { active = false; };
  }, [step, suppliers.length, products.length]);

  /* ---------- Auto-match supplier (with learning) ---------- */

  useEffect(() => {
    if (!extracted) return;
    if (suppliers.length === 0) return;
    const supplierName = extracted.supplier.name;
    const supplierGstin = extracted.supplier.gstin;

    const remembered = recallSupplierId(supplierName);
    if (remembered && suppliers.some((s) => s.id === remembered)) {
      setMatchedSupplierId(remembered);
      setSupplierMode('existing');
      return;
    }

    if (supplierName || supplierGstin) {
      let best: { id: number; score: number } | null = null;
      for (const s of suppliers) {
        const score = scoreSupplierMatch(supplierName, supplierGstin, s);
        if (!best || score > best.score) best = { id: s.id, score };
      }
      if (best && best.score >= 50) {
        setMatchedSupplierId(best.id); setSupplierMode('existing');
        if (supplierName) rememberSupplier(supplierName, best.id);
      } else {
        setMatchedSupplierId(null); setSupplierMode('new');
      }
    }
  }, [extracted, suppliers]);

  /* ---------- Auto-match products (with learning) ---------- */

  useEffect(() => {
    if (!extracted) return;
    if (products.length === 0) return;
    setItems((prev) => prev.map((draft) => {
      const it = extracted.items.find((x) => x.description === draft.description) || {
        description: draft.description,
        hsn_sac: draft.hsn_sac,
        quantity: draft.quantity,
        unit_price: draft.unit_price,
        total: draft.total,
      } as OCRLineItem;

      const remembered = recallProductId(it.description, it.hsn_sac);
      if (remembered) {
        const product = products.find((p) => p.id === remembered);
        if (product) {
          return {
            ...draft,
            action: 'existing' as const,
            matched_product_id: product.id,
            matched_product_name: product.name,
          };
        }
      }

      let best: { id: number; name: string; score: number } | null = null;
      for (const p of products) {
        const score = scoreProductMatch(it, p);
        if (!best || score > best.score) best = { id: p.id, name: p.name, score };
      }
      const matched = best && best.score >= 40 ? best : null;
      if (matched && it.description) rememberProduct(it.description, it.hsn_sac, matched.id);

      return {
        ...draft,
        action: matched ? ('existing' as const) : ('new' as const),
        matched_product_id: matched ? matched.id : null,
        matched_product_name: matched ? matched.name : null,
      };
    }));
  }, [extracted, products]);

  /* ---------- Totals (mirror create-purchase-invoice math) ---------- */

  const itemSubtotal = useMemo(
    () => round2(items.filter((i) => i.action !== 'skip').reduce((s, i) => s + i.quantity * i.unit_price, 0)),
    [items]
  );

  const itemDiscountTotal = useMemo(
    () => round2(items.filter((i) => i.action !== 'skip').reduce((s, i) => s + effectiveItemDiscount(i), 0)),
    [items]
  );

  const taxableBeforeBillDiscount = useMemo(
    () => round2(Math.max(0, itemSubtotal - itemDiscountTotal)),
    [itemSubtotal, itemDiscountTotal]
  );

  const itemTaxTotal = useMemo(
    () => round2(items.filter((i) => i.action !== 'skip').reduce((s, i) => {
      const base = Math.max(0, i.quantity * i.unit_price - effectiveItemDiscount(i));
      return s + base * (effectiveItemGst(i) / 100);
    }, 0)),
    [items]
  );

  const effectiveTaxRate = taxableBeforeBillDiscount > 0 ? itemTaxTotal / taxableBeforeBillDiscount : 0;

  const generalDiscountAmount = useMemo(() => {
    const raw = generalDiscountType === 'percent'
      ? taxableBeforeBillDiscount * Math.min(100, Math.max(0, generalDiscountPercent)) / 100
      : Math.max(0, generalDiscountAmountInput);
    return round2(Math.min(taxableBeforeBillDiscount, raw));
  }, [generalDiscountType, generalDiscountPercent, generalDiscountAmountInput, taxableBeforeBillDiscount]);

  const discountedTaxable = generalDiscountApplyType === 'before_tax'
    ? round2(Math.max(0, taxableBeforeBillDiscount - generalDiscountAmount))
    : taxableBeforeBillDiscount;

  const taxAfterBillDiscount = useMemo(() => {
    if (generalDiscountApplyType === 'after_tax') return itemTaxTotal;
    if (taxableBeforeBillDiscount <= 0) return 0;
    const factor = discountedTaxable / taxableBeforeBillDiscount;
    return round2(itemTaxTotal * factor);
  }, [generalDiscountApplyType, itemTaxTotal, taxableBeforeBillDiscount, discountedTaxable]);

  const packingTax = packingApplyType === 'before_tax'
    ? round2(Math.max(0, packingCharges) * effectiveTaxRate)
    : 0;

  const totalTaxWithPacking = round2(taxAfterBillDiscount + packingTax);
  const afterTaxGeneralDiscount = generalDiscountApplyType === 'after_tax' ? generalDiscountAmount : 0;

  const totalBeforeTcs = useMemo(() => round2(Math.max(0,
    discountedTaxable
    + (packingApplyType === 'before_tax' ? Math.max(0, packingCharges) : 0)
    + totalTaxWithPacking
    - afterTaxGeneralDiscount
    + (packingApplyType === 'after_tax' ? Math.max(0, packingCharges) : 0)
  )), [discountedTaxable, packingApplyType, packingCharges, totalTaxWithPacking, afterTaxGeneralDiscount]);

  const tcsAmount = round2(totalBeforeTcs * Math.min(100, Math.max(0, tcsPercent)) / 100);
  const totalBeforeRoundOff = round2(totalBeforeTcs + tcsAmount);

  const roundOffDelta = useMemo(
    () => (autoRoundOff ? round2(Math.round(totalBeforeRoundOff) - totalBeforeRoundOff) : 0),
    [autoRoundOff, totalBeforeRoundOff]
  );

  const draftGrandTotal = useMemo(
    () => round2(Math.max(0, totalBeforeRoundOff + roundOffDelta)),
    [totalBeforeRoundOff, roundOffDelta]
  );

  const totalPaid = useMemo(
    () => round2(payments.reduce((s, p) => s + safeNum(p.amount), 0)),
    [payments]
  );
  const remaining = Math.max(0, round2(draftGrandTotal - totalPaid));

  /* ---------- Step transitions ---------- */

  const handleBack = useCallback(() => {
    const order: OCRStep[] = ['upload', 'verify', 'charges', 'overview'];
    const idx = order.indexOf(step);
    if (idx > 0) setStep(order[idx - 1]);
  }, [step]);

  const handleNext = useCallback(() => {
    const order: OCRStep[] = ['upload', 'verify', 'charges', 'overview'];
    const idx = order.indexOf(step);
    if (idx < order.length - 1) setStep(order[idx + 1]);
  }, [step]);

  /* ---------- Item / payment helpers ---------- */

  const updateItemField = useCallback((id: string, patch: Partial<LineItemDraft>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    if (patch.matched_product_id && patch.action === 'existing') {
      const it = items.find((x) => x.id === id);
      if (it?.description) rememberProduct(it.description, it.hsn_sac, patch.matched_product_id);
    }
  }, [items]);

  const removeItem = useCallback((id: string) => { setItems((prev) => prev.filter((it) => it.id !== id)); }, []);

  const addBlankItem = useCallback(() => {
    setItems((prev) => [...prev, {
      id: uid('item'), description: '', quantity: 1, unit_price: 0, tax_rate: 0,
      discount_type: 'percent', discount_percent: 0, discount_amount: 0, total: 0,
      action: 'new', matched_product_id: null, matched_product_name: null,
    }]);
  }, []);

  const addPayment = useCallback((preset?: Partial<PaymentDraft>) => {
    setPayments((prev) => [...prev, {
      id: uid('pay'), amount: 0, payment_method: 'bank_transfer', payment_direction: 'outward',
      reference_no: `PAY-${Date.now()}`, transaction_date: getLocalToday(), remarks: '', ...preset,
    }]);
  }, []);

  const removePayment = useCallback((id: string) => { setPayments((prev) => prev.filter((p) => p.id !== id)); }, []);
  const updatePayment = useCallback((id: string, patch: Partial<PaymentDraft>) => {
    setPayments((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  /* ---------- Submittable? ---------- */

  const canSubmit = useMemo(() => {
    if (!extracted) return false;
    if (!companyId) return false;
    if (!extracted.invoice_number.trim()) return false;
    if (supplierMode === 'existing' && !matchedSupplierId) return false;
    if (supplierMode === 'new' && !extracted.supplier.name.trim()) return false;
    if (items.filter((i) => i.action !== 'skip').length === 0) return false;
    return true;
  }, [extracted, companyId, supplierMode, matchedSupplierId, items]);

  /* ---------- Submit ---------- */

  const handleSubmit = useCallback(async () => {
    if (!extracted || !canSubmit || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    setSubmitDiagnostics(null);

    const diagnostics: Record<string, unknown> = {};
    const numericCompanyId = Number(companyId);
    const numericBranchId = branchId ? Number(branchId) : 1;
    const purchaseNumber = extracted.invoice_number.trim();

    try {
      let supplierId: number | null = null;

      if (supplierMode === 'existing' && matchedSupplierId) {
        supplierId = matchedSupplierId;
        if (extracted.supplier.name) rememberSupplier(extracted.supplier.name, matchedSupplierId);
      } else {
        const supplierPayload = buildSupplierPayload({
          name: extracted.supplier.name,
          gstin: extracted.supplier.gstin,
          email: extracted.supplier.email,
          phone: extracted.supplier.phone,
          address: extracted.supplier.address,
          companyId: numericCompanyId,
          branchId: numericBranchId,
        });
        diagnostics.supplierPayload = supplierPayload;

        try {
          const createdSupplier = await apiClient.request('POST', '/suppliers', supplierPayload);
          supplierId = extractId(createdSupplier);
          diagnostics.supplierCreated = { id: supplierId };
          if (supplierId && extracted.supplier.name) rememberSupplier(extracted.supplier.name, supplierId);
        } catch (supErr) {
          diagnostics.supplierError = getDetailedError(supErr);

          let fallback = suppliers.find(
            (s) => s.name.toLowerCase() === extracted.supplier.name.toLowerCase()
          );
          if (!fallback && suppliers.length > 0) fallback = suppliers[0];

          if (fallback) {
            supplierId = fallback.id;
            diagnostics.supplierFallback = { id: fallback.id, name: fallback.name };
          } else {
            throw new Error(
              `Could not create supplier "${extracted.supplier.name}" and no existing suppliers available. ` +
              `Details: ${getDetailedError(supErr)}`
            );
          }
        }
      }

      if (!supplierId) throw new Error('Could not resolve a supplier ID.');
      diagnostics.resolvedSupplierId = supplierId;

      const paymentStatus = totalPaid >= draftGrandTotal ? 'Paid' : totalPaid > 0 ? 'Partial' : 'Unpaid';

      const purchasePayload = buildPurchasePayload({
        purchaseNumber,
        supplierId,
        purchaseDate: extracted.invoice_date || getLocalToday(),
        dueDate: extracted.due_date || null,
        companyId: numericCompanyId,
        branchId: numericBranchId,
        status: purchaseStatus,
        warehouse,
        items,
        isInterstate: extracted.is_interstate ?? true,
        payments,
        generalDiscountType,
        generalDiscountPercent,
        // Send the RAW amount the user typed, not the derived discounted figure.
        generalDiscountAmount: generalDiscountAmountInput,
        generalDiscountApplyType,
        packingCharges: round2(packingCharges),
        packingApplyType,
        tcsPercent,
        roundOff: round2(roundOffDelta),
        taxableSubtotal: round2(taxableBeforeBillDiscount),
        itemTaxTotal: round2(itemTaxTotal),
        packingTax: round2(packingTax),
        grandTotal: draftGrandTotal,
        paidAmount: totalPaid,
        paymentStatus,
      });

      diagnostics.purchasePayload = purchasePayload;

      const createResult = await createPurchaseWithVerification(purchasePayload, purchaseNumber);
      diagnostics.createResult = createResult;

      if (!createResult.success) throw new Error(createResult.error || 'Failed to create purchase.');

      let purchaseId = extractId(createResult.data);
      if (!purchaseId) {
        const found = await findPurchaseByNumber(purchaseNumber);
        if (found) { purchaseId = found.id; diagnostics.purchaseIdRecovered = found.id; }
      }
      if (!purchaseId) throw new Error('Purchase created but no ID available.');
      diagnostics.purchaseId = purchaseId;

      const paymentResults: Array<{ ok: boolean; error?: string; amount: number }> = [];
      const validPayments = payments.filter((p) => Number(p.amount) > 0);

      for (let idx = 0; idx < validPayments.length; idx++) {
        const p = validPayments[idx];
        const roundedAmount = round2(Number(p.amount));
        const reference = p.reference_no || `PAY-${purchaseId}-${idx + 1}`;

        try {
          await apiClient.request('POST', '/payments', {
            company_id: numericCompanyId,
            branch_id: numericBranchId,
            invoice_id: purchaseId,
            reference_no: reference,
            ledger_reference: reference,
            amount: roundedAmount,
            payment_method: toBackendPaymentMethod(p.payment_method),
            status: 'completed',
            payment_direction: p.payment_direction || 'outward',
            transaction_date: p.transaction_date || getLocalToday(),
            bank_name: '',
            account_number: '',
            remarks: p.remarks || '',
          });
          paymentResults.push({ ok: true, amount: roundedAmount });
        } catch (err) {
          paymentResults.push({ ok: false, amount: roundedAmount, error: getDetailedError(err) });
        }
      }
      diagnostics.paymentResults = paymentResults;

      const failedPayments = paymentResults.filter((r) => !r.ok).length;

      const verifiedNote = createResult.verified ? ' (verified via fallback)' : '';
      showSuccess(
        'Purchase created',
        `${purchaseNumber || 'Purchase'} saved${verifiedNote}` +
          (totalPaid > 0 ? ` · ₹${round2(totalPaid).toLocaleString('en-IN')} paid` : '') +
          (failedPayments > 0 ? ` (${failedPayments} payment(s) failed)` : '')
      );

      safeLog({
        module: 'Purchases',
        action: 'OCR Import',
        status: 'success',
        message: `Created purchase ${purchaseNumber} with ${items.filter((i) => i.action !== 'skip').length} item(s)`,
      });

      onImported();
      onClose();
    } catch (err: unknown) {
      const detailed = getDetailedError(err);
      console.error('[OCR] Save failed:', err, diagnostics);
      setSubmitError(detailed);
      setSubmitDiagnostics(diagnostics);
      showError('Save failed', detailed);
    } finally {
      setSubmitting(false);
    }
  }, [
    extracted, canSubmit, submitting, supplierMode, matchedSupplierId, suppliers, items,
    taxableBeforeBillDiscount, itemTaxTotal, packingTax, draftGrandTotal, totalPaid,
    purchaseStatus, warehouse, companyId, branchId, payments,
    generalDiscountType, generalDiscountPercent, generalDiscountAmountInput, generalDiscountApplyType,
    packingCharges, packingApplyType, tcsPercent, roundOffDelta,
    showSuccess, showError, onImported, onClose,
  ]);

  if (!isOpen) return null;

  const stepIndex = OCR_STEPS.findIndex((s) => s.key === step);
  const createResult = submitDiagnostics?.createResult as { verified?: boolean; success?: boolean } | undefined;

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto">
      <div className="flex min-h-full items-start justify-center p-3 sm:p-6">
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
        <div className="animate-fadeIn relative w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
                <FiZap size={18} />
              </div>
              <div>
                <h2 className="text-base font-bold tracking-tight text-slate-900">AI Purchase Scan</h2>
                <p className="text-xs text-slate-500">
                  Powered by Gemini{geminiModel ? ` · ${geminiModel}` : ''}{geminiSource ? ` · key from ${geminiSource}` : ''}
                </p>
              </div>
            </div>
            <button onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close">
              <FiX size={18} />
            </button>
          </div>

          {envWarning && (
            <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 sm:px-6">
              <div className="flex items-start gap-2 text-xs text-amber-800">
                <FiAlertCircle className="mt-0.5 shrink-0" size={14} />
                <span>{envWarning}</span>
              </div>
            </div>
          )}

          {/* Stepper */}
          <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-3 sm:px-6">
            <ol className="flex items-center gap-1 sm:gap-2">
              {OCR_STEPS.map((s, idx) => {
                const isActive = idx === stepIndex;
                const isDone = idx < stepIndex;
                return (
                  <li key={s.key} className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
                    <button type="button" onClick={() => { if (idx < stepIndex) setStep(s.key); }} disabled={idx > stepIndex}
                      className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition sm:px-3 ${
                        isActive ? 'bg-white shadow-sm ring-1 ring-indigo-500/20'
                          : idx <= stepIndex ? 'hover:bg-white/70' : 'cursor-not-allowed opacity-60'
                      }`}>
                      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                        isDone ? 'bg-emerald-500 text-white' : isActive ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'
                      }`}>
                        {isDone ? <FiCheck size={12} /> : idx + 1}
                      </span>
                      <span className={`truncate text-xs font-semibold ${isActive ? 'text-slate-900' : 'text-slate-500'}`}>{s.label}</span>
                    </button>
                    {idx < OCR_STEPS.length - 1 && (
                      <span className={`hidden h-px w-3 shrink-0 sm:block ${idx < stepIndex ? 'bg-emerald-300' : 'bg-slate-200'}`} />
                    )}
                  </li>
                );
              })}
            </ol>
          </div>

          {/* Body */}
          <div className="max-h-[calc(100vh-260px)] overflow-y-auto px-5 py-5 sm:px-6">
            {/* =================== STEP 1: UPLOAD =================== */}
            {step === 'upload' && (
              <div className="space-y-5">
                <div
                  onDrop={onDrop}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
                  className={`rounded-2xl border-2 border-dashed p-6 text-center transition sm:p-10 ${
                    dragOver ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-slate-50/60'
                  }`}>
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
                    <FiImage className="text-indigo-500" size={22} />
                  </div>
                  <p className="mt-4 text-sm font-semibold text-slate-800">Drop supplier invoice here</p>
                  <p className="mt-1 text-xs text-slate-500">PNG, JPG, WEBP or PDF · up to 10 MB</p>
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                    <input ref={fileInputRef} type="file" accept={OCR_ACCEPT} className="hidden" onChange={onFileChange} />
                    <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFileChange} />
                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={ocrLoading}
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50">
                      <FiUpload size={15} /> Browse files
                    </button>
                    <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={ocrLoading}
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">
                      <FiCamera size={15} /> Use camera
                    </button>
                  </div>
                  {file && (
                    <div className="mx-auto mt-4 flex max-w-sm items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs">
                      <span className="truncate font-medium text-slate-700">{file.name}</span>
                      <span className="shrink-0 text-slate-400">{(file.size / 1024).toFixed(1)} KB</span>
                    </div>
                  )}
                </div>

                {ocrLoading && (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                    <div className="flex items-center gap-3">
                      <FiZap className="animate-pulse text-indigo-600" size={18} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-indigo-900">Gemini is reading your invoice…</p>
                        <p className="text-xs text-indigo-700/80">This usually takes 3–10 seconds.</p>
                      </div>
                    </div>
                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-indigo-100">
                      <div className="h-full w-1/2 animate-pulse rounded-full bg-indigo-500" />
                    </div>
                  </div>
                )}

                {ocrError && !ocrLoading && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    <div className="flex items-start gap-2">
                      <FiAlertCircle className="mt-0.5 shrink-0" size={16} />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">Automatic extraction unavailable</p>
                        <p className="mt-0.5 break-words text-xs text-amber-700">{ocrError.message}</p>
                        <p className="mt-0.5 text-[10px] uppercase tracking-wide text-amber-600">Kind: {ocrError.kind}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {ocrError.canRetry && file && (
                            <button type="button" onClick={retryWithSameModel}
                              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-700">
                              <FiRefreshCw size={12} /> Retry
                            </button>
                          )}
                          {ocrError.canSwitchModel && file && (
                            <button type="button" onClick={retryWithAlternateModel}
                              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 text-xs font-semibold text-amber-800 hover:bg-amber-100">
                              <FiSliders size={12} /> Try alternate model
                            </button>
                          )}
                          <button type="button" onClick={skipOCR}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-amber-600 px-3 text-xs font-semibold text-white hover:bg-amber-700">
                            <FiEdit size={12} /> Enter manually
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-xs text-slate-600">
                  <FiInfo className="mt-0.5 shrink-0 text-slate-400" size={14} />
                  <span>Tip: The more you use this wizard, the smarter it gets — supplier &amp; product matches are remembered automatically.</span>
                </div>
              </div>
            )}

            {/* =================== STEP 2: VERIFY & MAP =================== */}
            {step === 'verify' && extracted && (
              <div className="space-y-5">
                {typeof extracted.overall_confidence === 'number' && (
                  <div className={`flex items-center gap-2 rounded-xl border p-3 text-xs ${
                    extracted.overall_confidence >= 0.75 ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : extracted.overall_confidence >= 0.5 ? 'border-amber-200 bg-amber-50 text-amber-800'
                        : 'border-rose-200 bg-rose-50 text-rose-800'
                  }`}>
                    <FiZap size={14} />
                    <span className="font-semibold">OCR confidence: {(extracted.overall_confidence * 100).toFixed(0)}%</span>
                    <span className="opacity-70">· Please review and map all fields before continuing</span>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Invoice #</label>
                    <input type="text" value={extracted.invoice_number}
                      onChange={(e) => setExtracted({ ...extracted, invoice_number: e.target.value })}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Invoice Date</label>
                    <input type="date" value={extracted.invoice_date}
                      onChange={(e) => setExtracted({ ...extracted, invoice_date: e.target.value })}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Due Date</label>
                    <input type="date" value={extracted.due_date ?? ''}
                      onChange={(e) => setExtracted({ ...extracted, due_date: e.target.value || undefined })}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10" />
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <FiHome size={14} className="text-indigo-500" /> Supplier
                    </h3>
                    <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
                      <button type="button" onClick={() => setSupplierMode('existing')}
                        className={`rounded-md px-2.5 py-1 font-semibold transition ${supplierMode === 'existing' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
                        Match existing
                      </button>
                      <button type="button" onClick={() => setSupplierMode('new')}
                        className={`rounded-md px-2.5 py-1 font-semibold transition ${supplierMode === 'new' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
                        Create new
                      </button>
                    </div>
                  </div>

                  {loadingMappings && (
                    <div className="mb-2 flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs text-indigo-800">
                      <FiRefreshCw className="animate-spin" size={12} /> Loading suppliers &amp; products…
                    </div>
                  )}

                  {supplierMode === 'existing' ? (
                    <div className="space-y-3">
                      <div className="relative">
                        <select value={matchedSupplierId ?? ''}
                          onChange={(e) => {
                            const id = e.target.value ? Number(e.target.value) : null;
                            setMatchedSupplierId(id);
                            if (id && extracted.supplier.name) rememberSupplier(extracted.supplier.name, id);
                          }}
                          className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10">
                          <option value="">Select supplier…</option>
                          {suppliers.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}{s.gstin ? ` · ${s.gstin}` : ''}</option>
                          ))}
                        </select>
                        <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                      </div>
                      {matchedSupplierId && (
                        <p className="flex items-center gap-1 text-[11px] text-emerald-600">
                          <FiCheckCircle size={11} /> Match remembered for future scans.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-2">
                      <div>
                        <span className="block font-semibold uppercase tracking-wide text-slate-400">Name</span>
                        <input type="text" value={extracted.supplier.name}
                          onChange={(e) => setExtracted({ ...extracted, supplier: { ...extracted.supplier, name: e.target.value } })}
                          className="mt-0.5 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10" />
                      </div>
                      <div>
                        <span className="block font-semibold uppercase tracking-wide text-slate-400">GSTIN</span>
                        <input type="text" value={extracted.supplier.gstin ?? ''}
                          onChange={(e) => setExtracted({ ...extracted, supplier: { ...extracted.supplier, gstin: e.target.value.toUpperCase() || undefined } })}
                          className="mt-0.5 h-8 w-full rounded-md border border-slate-200 bg-white px-2 font-mono text-xs outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10" />
                      </div>
                      <div>
                        <span className="block font-semibold uppercase tracking-wide text-slate-400">Email</span>
                        <input type="email" value={extracted.supplier.email ?? ''}
                          onChange={(e) => setExtracted({ ...extracted, supplier: { ...extracted.supplier, email: e.target.value || undefined } })}
                          className="mt-0.5 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10" />
                      </div>
                      <div>
                        <span className="block font-semibold uppercase tracking-wide text-slate-400">Phone</span>
                        <input type="tel" value={extracted.supplier.phone ?? ''}
                          onChange={(e) => setExtracted({ ...extracted, supplier: { ...extracted.supplier, phone: e.target.value || undefined } })}
                          className="mt-0.5 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10" />
                      </div>
                      <div className="sm:col-span-2 flex items-center gap-2 text-emerald-700">
                        <FiUserPlus size={13} />
                        A new supplier will be created automatically when you save.
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 bg-white">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <FiTag size={14} className="text-indigo-500" /> Line items ({items.filter((i) => i.action !== 'skip').length} / {items.length})
                    </h3>
                    <button type="button" onClick={addBlankItem}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                      <FiPlus size={12} /> Add row
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1080px] text-sm">
                      <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2 text-left">Description</th>
                          <th className="px-2 py-2 text-right">Qty</th>
                          <th className="px-2 py-2 text-right">Rate</th>
                          <th className="px-2 py-2 text-right">Disc</th>
                          <th className="px-2 py-2 text-center">GST %</th>
                          <th className="px-2 py-2 text-left">Action</th>
                          <th className="px-2 py-2 text-left">Match / new</th>
                          <th className="px-2 py-2 text-right">Line total</th>
                          <th className="w-10" />
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((it) => {
                          const base = it.quantity * it.unit_price;
                          const disc = effectiveItemDiscount(it);
                          const taxable = base - disc;
                          const lineTotal = taxable * (1 + effectiveItemGst(it) / 100);
                          return (
                            <tr key={it.id} className="border-t border-slate-100">
                              <td className="px-3 py-2">
                                <input type="text" value={it.description}
                                  onChange={(e) => updateItemField(it.id, { description: e.target.value })}
                                  className="w-full rounded-md border border-transparent bg-transparent px-1 py-1 text-sm outline-none transition hover:border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10"
                                  placeholder="Item description" />
                                {it.hsn_sac && <span className="block px-1 text-[10px] text-slate-400">HSN {it.hsn_sac}</span>}
                              </td>
                              <td className="px-2 py-2">
                                <input type="number" min="0.001" step="0.001" value={it.quantity}
                                  onChange={(e) => updateItemField(it.id, { quantity: Math.max(0, parseFloat(e.target.value) || 0) })}
                                  className="w-16 rounded-md border border-transparent bg-transparent px-1 py-1 text-right text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10" />
                              </td>
                              <td className="px-2 py-2">
                                <input type="number" min="0" step="0.01" value={it.unit_price}
                                  onChange={(e) => updateItemField(it.id, { unit_price: Math.max(0, parseFloat(e.target.value) || 0) })}
                                  className="w-20 rounded-md border border-transparent bg-transparent px-1 py-1 text-right text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10" />
                              </td>
                              <td className="px-2 py-2">
                                <div className="flex items-center justify-end gap-1">
                                  <select value={it.discount_type}
                                    onChange={(e) => updateItemField(it.id, { discount_type: e.target.value as 'percent' | 'amount' })}
                                    className="bg-transparent text-[10px] outline-none">
                                    <option value="percent">%</option>
                                    <option value="amount">₹</option>
                                  </select>
                                  {it.discount_type === 'percent' ? (
                                    <input type="number" min="0" max="100" step="0.01" value={it.discount_percent}
                                      onChange={(e) => updateItemField(it.id, { discount_percent: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) })}
                                      className="w-12 rounded-md border border-transparent bg-transparent px-1 py-1 text-right text-xs tabular-nums outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10" />
                                  ) : (
                                    <input type="number" min="0" step="0.01" value={it.discount_amount}
                                      onChange={(e) => updateItemField(it.id, { discount_amount: Math.max(0, parseFloat(e.target.value) || 0) })}
                                      className="w-16 rounded-md border border-transparent bg-transparent px-1 py-1 text-right text-xs tabular-nums outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10" />
                                  )}
                                </div>
                              </td>
                              <td className="px-2 py-2 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <select value={GST_SLABS.includes(it.tax_rate as typeof GST_SLABS[number]) ? it.tax_rate : -1}
                                    onChange={(e) => {
                                      const v = Number(e.target.value);
                                      updateItemField(it.id, { tax_rate: v === -1 ? it.tax_rate : v });
                                    }}
                                    className="bg-transparent text-xs outline-none">
                                    {GST_SLABS.map((s) => <option key={s} value={s}>{s}%</option>)}
                                    <option value={-1}>Custom</option>
                                  </select>
                                  {!GST_SLABS.includes(it.tax_rate as typeof GST_SLABS[number]) && (
                                    <input type="number" min="0" max="100" step="0.01" value={it.tax_rate}
                                      onChange={(e) => updateItemField(it.id, { tax_rate: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) })}
                                      className="w-14 rounded-md border border-slate-200 bg-white px-1 py-1 text-right text-xs tabular-nums outline-none" />
                                  )}
                                </div>
                              </td>
                              <td className="px-2 py-2">
                                <select value={it.action}
                                  onChange={(e) => {
                                    const val = e.target.value as LineItemDraft['action'];
                                    updateItemField(it.id, {
                                      action: val,
                                      matched_product_id: val === 'existing' ? it.matched_product_id : null,
                                      matched_product_name: val === 'existing' ? it.matched_product_name : null,
                                    });
                                  }}
                                  className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10">
                                  <option value="existing">Match</option>
                                  <option value="new">New</option>
                                  <option value="skip">Skip</option>
                                </select>
                              </td>
                              <td className="px-2 py-2">
                                {it.action === 'existing' ? (
                                  <div className="relative">
                                    <select value={it.matched_product_id ?? ''}
                                      onChange={(e) => {
                                        const id = e.target.value ? Number(e.target.value) : null;
                                        const p = products.find((x) => x.id === id);
                                        updateItemField(it.id, {
                                          matched_product_id: id,
                                          matched_product_name: p?.name ?? null,
                                        });
                                      }}
                                      className="h-9 w-full appearance-none rounded-lg border border-slate-200 bg-white px-2 pr-7 text-xs font-medium outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10">
                                      <option value="">Select product…</option>
                                      {products.map((p) => (
                                        <option key={p.id} value={p.id}>{p.name}{p.sku ? ` · ${p.sku}` : ''}</option>
                                      ))}
                                    </select>
                                    <FiChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
                                  </div>
                                ) : it.action === 'new' ? (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                                    <FiUserPlus size={11} /> Free-text
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500">Skipped</span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2 text-right text-sm font-semibold tabular-nums text-slate-800">
                                {formatCurrency(lineTotal)}
                              </td>
                              <td className="px-2 py-2">
                                <button type="button" onClick={() => removeItem(it.id)}
                                  className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                  aria-label="Remove item">
                                  <FiTrash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {items.length === 0 && (
                          <tr><td colSpan={9} className="px-3 py-8 text-center text-xs text-slate-400">
                            No line items. Click "Add row" or go back to re-scan.
                          </td></tr>
                        )}
                      </tbody>
                      <tfoot className="bg-slate-50">
                        <tr>
                          <td colSpan={7} className="px-3 py-2 text-right text-xs font-medium text-slate-500">Subtotal</td>
                          <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums text-slate-800">{formatCurrency(itemSubtotal)}</td>
                          <td />
                        </tr>
                        {itemDiscountTotal > 0 && (
                          <tr>
                            <td colSpan={7} className="px-3 py-2 text-right text-xs font-medium text-slate-500">Item discount</td>
                            <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums text-rose-600">-{formatCurrency(itemDiscountTotal)}</td>
                            <td />
                          </tr>
                        )}
                        <tr>
                          <td colSpan={7} className="px-3 py-2 text-right text-xs font-medium text-slate-500">Tax</td>
                          <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums text-slate-800">{formatCurrency(itemTaxTotal)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* =================== STEP 3: CHARGES & PAYMENTS =================== */}
            {step === 'charges' && (
              <div className="space-y-5">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <FiDollarSign size={14} className="text-indigo-500" /> Discounts &amp; charges
                  </h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {/* Bill discount */}
                    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          <FiPercent size={11} className="mr-1 inline" /> Bill discount
                        </label>
                        <select value={generalDiscountType}
                          onChange={(e) => setGeneralDiscountType(e.target.value as 'percent' | 'amount')}
                          className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-semibold">
                          <option value="percent">%</option>
                          <option value="amount">₹</option>
                        </select>
                      </div>
                      <input
                        type="number" min="0" step="0.01"
                        value={generalDiscountType === 'percent' ? generalDiscountPercent : generalDiscountAmountInput}
                        onChange={(e) => {
                          const v = Math.max(0, parseFloat(e.target.value) || 0);
                          if (generalDiscountType === 'percent') setGeneralDiscountPercent(Math.min(100, v));
                          else setGeneralDiscountAmountInput(v);
                        }}
                        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm tabular-nums outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10"
                      />
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-500">Apply</span>
                        <select value={generalDiscountApplyType}
                          onChange={(e) => setGeneralDiscountApplyType(e.target.value as 'before_tax' | 'after_tax')}
                          className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-semibold">
                          <option value="before_tax">Before tax</option>
                          <option value="after_tax">After tax</option>
                        </select>
                      </div>
                      <p className="text-right text-xs font-semibold text-rose-600">-{formatCurrency(generalDiscountAmount)}</p>
                    </div>

                    {/* Packing */}
                    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <FiPackage size={11} className="mr-1 inline" /> Packing charges
                      </label>
                      <input type="number" min="0" step="0.01" value={packingCharges}
                        onChange={(e) => setPackingCharges(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm tabular-nums outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10"
                      />
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-500">Apply</span>
                        <select value={packingApplyType}
                          onChange={(e) => setPackingApplyType(e.target.value as 'before_tax' | 'after_tax')}
                          className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-semibold">
                          <option value="before_tax">Before tax</option>
                          <option value="after_tax">After tax</option>
                        </select>
                      </div>
                      <p className="text-right text-xs text-slate-500">Tax {formatCurrency(packingTax)}</p>
                    </div>

                    {/* TCS */}
                    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">TCS %</label>
                      <input type="number" min="0" max="100" step="0.01" value={tcsPercent}
                        onChange={(e) => setTcsPercent(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm tabular-nums outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10"
                      />
                      <p className="text-right text-xs text-slate-500">= {formatCurrency(tcsAmount)}</p>
                    </div>

                    {/* Round-off */}
                    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Round-off</label>
                      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <button type="button" role="switch" aria-checked={autoRoundOff}
                          onClick={() => setAutoRoundOff((v) => !v)}
                          className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${autoRoundOff ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                          <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${autoRoundOff ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                        <span className="text-xs text-slate-700">Auto round to nearest ₹1</span>
                        <span className={`ml-auto text-xs font-bold tabular-nums ${roundOffDelta < 0 ? 'text-rose-600' : roundOffDelta > 0 ? 'text-emerald-600' : 'text-slate-700'}`}>
                          {roundOffDelta >= 0 ? '+' : ''}{formatCurrency(roundOffDelta)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-4">
                  <div className="rounded-lg bg-white p-3 shadow-sm">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Taxable</p>
                    <p className="mt-0.5 text-base font-bold tabular-nums text-slate-900">{formatCurrency(taxableBeforeBillDiscount)}</p>
                  </div>
                  <div className="rounded-lg bg-white p-3 shadow-sm">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Item tax</p>
                    <p className="mt-0.5 text-base font-bold tabular-nums text-slate-900">{formatCurrency(itemTaxTotal)}</p>
                  </div>
                  <div className="rounded-lg bg-white p-3 shadow-sm">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Packing GST</p>
                    <p className="mt-0.5 text-base font-bold tabular-nums text-slate-900">{formatCurrency(packingTax)}</p>
                  </div>
                  <div className="rounded-lg bg-white p-3 shadow-sm">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-600">Grand total</p>
                    <p className="mt-0.5 text-base font-bold tabular-nums text-indigo-600">{formatCurrency(draftGrandTotal)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-3">
                  <div className="rounded-lg bg-white p-3 shadow-sm">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Grand total</p>
                    <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{formatCurrency(draftGrandTotal)}</p>
                  </div>
                  <div className="rounded-lg bg-white p-3 shadow-sm">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">Paid so far</p>
                    <p className="mt-0.5 text-lg font-bold tabular-nums text-emerald-600">{formatCurrency(totalPaid)}</p>
                  </div>
                  <div className="rounded-lg bg-white p-3 shadow-sm">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-600">Balance</p>
                    <p className="mt-0.5 text-lg font-bold tabular-nums text-rose-600">{formatCurrency(remaining)}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => addPayment({ amount: remaining })} disabled={remaining <= 0}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50">
                    <FiCheck size={13} /> Pay full amount
                  </button>
                  <button type="button" onClick={() => addPayment()}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50">
                    <FiPlus size={13} /> Add partial payment
                  </button>
                  <span className="text-xs text-slate-400">You can also skip and record payments later.</span>
                </div>

                {payments.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center">
                    <FiDollarSign className="mx-auto text-slate-400" size={24} />
                    <p className="mt-2 text-sm font-medium text-slate-700">No payments added</p>
                    <p className="mt-1 text-xs text-slate-500">Add a payment now, or leave it and record it later.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {payments.map((p, idx) => (
                      <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payment #{idx + 1}</span>
                          <button type="button" onClick={() => removePayment(p.id)}
                            className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                            aria-label="Remove payment">
                            <FiTrash2 size={14} />
                          </button>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          <input type="number" min="0" step="0.01" value={p.amount}
                            onChange={(e) => updatePayment(p.id, { amount: Math.max(0, parseFloat(e.target.value) || 0) })}
                            placeholder="Amount"
                            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm tabular-nums outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10" />
                          <div className="relative">
                            <select value={p.payment_method}
                              onChange={(e) => updatePayment(p.id, { payment_method: e.target.value })}
                              className="h-9 w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-8 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10">
                              {PAYMENT_METHOD_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                            <FiChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
                          </div>
                          <div className="relative">
                            <select value={p.payment_direction}
                              onChange={(e) => updatePayment(p.id, { payment_direction: e.target.value as 'inward' | 'outward' })}
                              className="h-9 w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-8 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10">
                              <option value="outward">Outward · paid to supplier</option>
                              <option value="inward">Inward · refund / receipt</option>
                            </select>
                            <FiChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
                          </div>
                          <input type="text" value={p.reference_no}
                            onChange={(e) => updatePayment(p.id, { reference_no: e.target.value })}
                            placeholder="Reference no."
                            className="h-9 rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10" />
                          <input type="date" value={p.transaction_date}
                            onChange={(e) => updatePayment(p.id, { transaction_date: e.target.value })}
                            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10" />
                          <input type="text" value={p.remarks}
                            onChange={(e) => updatePayment(p.id, { remarks: e.target.value })}
                            placeholder="Remarks"
                            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* =================== STEP 4: OVERVIEW =================== */}
            {step === 'overview' && extracted && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Company *</label>
                    <div className="relative">
                      <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}
                        className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10">
                        <option value="">Select company…</option>
                        {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Branch</label>
                    <div className="relative">
                      <select value={branchId} onChange={(e) => setBranchId(e.target.value)} disabled={!companyId}
                        className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400">
                        <option value="">No branch</option>
                        {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                      <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Status</label>
                    <div className="relative">
                      <select value={purchaseStatus} onChange={(e) => setPurchaseStatus(e.target.value)}
                        className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10">
                        {STATUS_OPTIONS.filter((o) => o.value !== 'all').map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    </div>
                  </div>
                </div>

                <input type="text" value={warehouse} onChange={(e) => setWarehouse(e.target.value)}
                  placeholder="Warehouse (optional · defaults to 'Main Warehouse')"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10" />

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <FiPackage size={12} /> Purchase
                    </h4>
                    <dl className="space-y-1.5 text-sm">
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-500">Invoice #</dt>
                        <dd className="truncate font-semibold text-slate-800">{extracted.invoice_number || '—'}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-500">Date</dt>
                        <dd className="font-medium text-slate-800">{formatDate(extracted.invoice_date)}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-500">Items</dt>
                        <dd className="font-medium text-slate-800">{items.filter((i) => i.action !== 'skip').length}</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <FiHome size={12} /> Supplier
                    </h4>
                    <dl className="space-y-1.5 text-sm">
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-500">Name</dt>
                        <dd className="truncate font-semibold text-slate-800">
                          {supplierMode === 'existing'
                            ? suppliers.find((s) => s.id === matchedSupplierId)?.name || '—'
                            : extracted.supplier.name || '—'}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-500">Mode</dt>
                        <dd className="font-medium text-slate-800">{supplierMode === 'existing' ? 'Matched' : 'New'}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-500">GSTIN</dt>
                        <dd className="truncate font-mono text-xs text-slate-700">{extracted.supplier.gstin || '—'}</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <FiDollarSign size={12} /> Money
                    </h4>
                    <dl className="space-y-1.5 text-sm">
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-500">Subtotal</dt>
                        <dd className="font-medium tabular-nums text-slate-800">{formatCurrency(itemSubtotal)}</dd>
                      </div>
                      {itemDiscountTotal > 0 && (
                        <div className="flex justify-between gap-2">
                          <dt className="text-slate-500">Item discount</dt>
                          <dd className="font-medium tabular-nums text-rose-600">-{formatCurrency(itemDiscountTotal)}</dd>
                        </div>
                      )}
                      {generalDiscountAmount > 0 && (
                        <div className="flex justify-between gap-2">
                          <dt className="text-slate-500">Bill discount</dt>
                          <dd className="font-medium tabular-nums text-rose-600">-{formatCurrency(generalDiscountAmount)}</dd>
                        </div>
                      )}
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-500">Item tax</dt>
                        <dd className="font-medium tabular-nums text-slate-800">{formatCurrency(itemTaxTotal)}</dd>
                      </div>
                      {(packingCharges > 0 || packingTax > 0) && (
                        <div className="flex justify-between gap-2">
                          <dt className="text-slate-500">Packing</dt>
                          <dd className="font-medium tabular-nums text-slate-800">{formatCurrency(packingCharges)} + GST {formatCurrency(packingTax)}</dd>
                        </div>
                      )}
                      {tcsAmount > 0 && (
                        <div className="flex justify-between gap-2">
                          <dt className="text-slate-500">TCS</dt>
                          <dd className="font-medium tabular-nums text-slate-800">{formatCurrency(tcsAmount)}</dd>
                        </div>
                      )}
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-500">Round off</dt>
                        <dd className={`font-medium tabular-nums ${roundOffDelta < 0 ? 'text-rose-600' : roundOffDelta > 0 ? 'text-emerald-600' : 'text-slate-800'}`}>
                          {roundOffDelta >= 0 ? '+' : ''}{formatCurrency(roundOffDelta)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2 border-t border-slate-100 pt-1.5">
                        <dt className="font-semibold text-slate-700">Grand</dt>
                        <dd className="font-bold tabular-nums text-slate-900">{formatCurrency(draftGrandTotal)}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-emerald-600">Paid</dt>
                        <dd className="font-semibold tabular-nums text-emerald-600">{formatCurrency(totalPaid)}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-rose-600">Balance</dt>
                        <dd className="font-semibold tabular-nums text-rose-600">{formatCurrency(remaining)}</dd>
                      </div>
                    </dl>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white">
                  <div className="border-b border-slate-100 px-4 py-2.5">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Items to save</h4>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2 text-left">Item</th>
                          <th className="px-3 py-2 text-right">Qty</th>
                          <th className="px-3 py-2 text-right">Rate</th>
                          <th className="px-3 py-2 text-right">Disc</th>
                          <th className="px-3 py-2 text-right">GST</th>
                          <th className="px-3 py-2 text-right">Total</th>
                          <th className="px-3 py-2 text-left">Maps to</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.filter((i) => i.action !== 'skip').map((it) => {
                          const base = it.quantity * it.unit_price;
                          const disc = effectiveItemDiscount(it);
                          const taxable = base - disc;
                          const lineTotal = taxable * (1 + effectiveItemGst(it) / 100);
                          return (
                            <tr key={it.id} className="border-t border-slate-100">
                              <td className="px-3 py-2 text-slate-700">{it.description}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-slate-700">{it.quantity}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-slate-700">{formatCurrency(it.unit_price)}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-rose-600">
                                {disc > 0 ? `-${formatCurrency(disc)}` : '—'}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-slate-700">{effectiveItemGst(it)}%</td>
                              <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">
                                {formatCurrency(lineTotal)}
                              </td>
                              <td className="px-3 py-2 text-xs">
                                {it.action === 'existing' ? `Product #${it.matched_product_id}` : 'Free-text item'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {!canSubmit && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    <div className="flex items-start gap-2">
                      <FiAlertCircle className="mt-0.5 shrink-0" size={13} />
                      <div>
                        <p className="font-semibold">Cannot save yet</p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-4">
                          {!companyId && <li>Select a company</li>}
                          {!extracted.invoice_number.trim() && <li>Invoice number is required</li>}
                          {supplierMode === 'existing' && !matchedSupplierId && <li>Select a supplier</li>}
                          {supplierMode === 'new' && !extracted.supplier.name.trim() && <li>Supplier name is required</li>}
                          {items.filter((i) => i.action !== 'skip').length === 0 && <li>Add at least one item</li>}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {submitError && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
                    <div className="flex items-start gap-2">
                      <FiAlertCircle className="mt-0.5 shrink-0" size={14} />
                      <div className="min-w-0 flex-1 space-y-2">
                        <p className="font-semibold text-rose-900">Save failed</p>
                        <p className="break-words">{submitError}</p>

                        {createResult && (
                          <p className={`rounded px-2 py-1 text-[11px] font-semibold ${
                            createResult.verified ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {createResult.verified
                              ? '✓ Purchase verified via fallback lookup — it WAS created on the server.'
                              : '✗ Purchase not found on the server — it was NOT created.'}
                          </p>
                        )}

                        {submitDiagnostics && (
                          <details className="mt-2 rounded-lg bg-white/70 p-2">
                            <summary className="cursor-pointer font-semibold text-rose-900">
                              Show diagnostics (what was sent)
                            </summary>
                            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-950 p-2 font-mono text-[10px] text-rose-100">
{JSON.stringify(submitDiagnostics, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3 sm:px-6">
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleBack} disabled={stepIndex === 0 || submitting} className="h-9 rounded-xl text-xs">
                <FiArrowLeft className="mr-1.5" size={13} /> Back
              </Button>
              <Button variant="ghost" onClick={onClose} disabled={submitting}
                className="h-9 rounded-xl text-xs text-slate-500 hover:text-slate-800">
                Cancel
              </Button>
            </div>

            <div className="flex items-center gap-2">
              {step !== 'overview' && step !== 'upload' && (
                <Button onClick={handleNext} disabled={submitting}
                  className="h-9 rounded-xl bg-slate-900 text-xs font-semibold text-white hover:bg-slate-800">
                  Next <FiArrowRight className="ml-1.5" size={13} />
                </Button>
              )}
              {step === 'overview' && (
                <Button onClick={handleSubmit} disabled={!canSubmit || submitting}
                  className="h-9 rounded-xl bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-700">
                  {submitting ? (
                    <><FiRefreshCw className="mr-1.5 animate-spin" size={13} /> Saving…</>
                  ) : (
                    <><FiSave className="mr-1.5" size={13} /> Save purchase</>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
PurchaseOCRModal.displayName = 'PurchaseOCRModal';

/* ==================================================================
 * Main PurchasePage
 * ================================================================== */

export function PurchasePage() {
  const navigate = useNavigate();
  const { showSuccess, showError } = useNotification();

  /* ---------- Filters ---------- */
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPaymentStatus, setFilterPaymentStatus] = useState('all');
  const [filterCompanyId, setFilterCompanyId] = useState<number | undefined>(undefined);
  const [filterDateFrom, setFilterDateFrom] = useState(getMonthStart());
  const [filterDateTo, setFilterDateTo] = useState(getLocalToday());
  // FIX: explicit preset state so the UI chip highlights the correct preset
  const [datePreset, setDatePreset] = useState<DatePreset>('month');

  const [isViewPanelOpen, setIsViewPanelOpen] = useState(false);
  const [viewingPurchase, setViewingPurchase] = useState<PurchaseInvoice | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [printInvoice, setPrintInvoice] = useState<PurchaseInvoice | null>(null);
  const printTriggered = useRef(false);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [payingPurchase, setPayingPurchase] = useState<PurchaseInvoice | null>(null);
  const [payAmt, setPayAmt] = useState('');
  const [payMethod, setPayMethod] = useState('bank_transfer');
  const [payDirection, setPayDirection] = useState<'inward' | 'outward'>('outward');
  const [paySubmitting, setPaySubmitting] = useState(false);

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isOCROpen, setIsOCROpen] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let active = true;
    apiClient.getCompanies()
      .then((res: unknown) => { if (active) setCompanies(unwrapList<Company>(res)); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const { data: purchases, loading, error, refresh } =
    useApiCache<PurchaseInvoice[]>('purchase-invoices', () => apiClient.getPurchaseInvoices());

  /* ---------- Filtering (FIXED) ---------- */

  const filteredPurchases = useMemo(() => {
    if (!purchases) return [];
    let filtered = [...purchases];

    // FIX 1: text search (case-insensitive, includes invoice #, supplier, status)
    if (search) {
      const term = search.toLowerCase().trim();
      filtered = filtered.filter((p) =>
        String(p.purchase_number || '').toLowerCase().includes(term) ||
        String(p.bill_number || '').toLowerCase().includes(term) ||
        String(p.supplier?.name || '').toLowerCase().includes(term) ||
        String(p.status || '').toLowerCase().includes(term) ||
        String(p.payment_status || '').toLowerCase().includes(term)
      );
    }

    // FIX 2: case-insensitive status match
    if (filterStatus !== 'all') {
      const needle = filterStatus.toLowerCase();
      filtered = filtered.filter((p) => String(p.status || '').toLowerCase() === needle);
    }

    // FIX 3: case-insensitive payment status match
    if (filterPaymentStatus !== 'all') {
      const needle = filterPaymentStatus.toLowerCase();
      filtered = filtered.filter((p) => String(p.payment_status || '').toLowerCase() === needle);
    }

    // FIX 4: numeric-safe company match
    if (filterCompanyId !== undefined) {
      const target = Number(filterCompanyId);
      filtered = filtered.filter((p) => Number(p.company_id) === target);
    }

    // FIX 5: robust date range using normalised YYYY-MM-DD strings
    if (filterDateFrom) {
      filtered = filtered.filter((p) => {
        const d = normalizeDateInput(p.purchase_date);
        return d && d >= filterDateFrom;
      });
    }
    if (filterDateTo) {
      filtered = filtered.filter((p) => {
        const d = normalizeDateInput(p.purchase_date);
        return d && d <= filterDateTo;
      });
    }

    // FIX 6: newest first — deterministic ordering
    filtered.sort((a, b) => {
      const da = normalizeDateInput(a.purchase_date) || '';
      const db = normalizeDateInput(b.purchase_date) || '';
      if (da !== db) return db.localeCompare(da);
      return (b.id ?? 0) - (a.id ?? 0);
    });

    return filtered;
  }, [purchases, search, filterStatus, filterPaymentStatus, filterCompanyId, filterDateFrom, filterDateTo]);

  const summary = useMemo(() => {
    const rows = filteredPurchases;
    const totalAmount = rows.reduce((s, p) => s + safeNum(p.grand_total), 0);
    const paidAmount = rows.reduce((s, p) => s + safeNum(p.paid_amount), 0);
    return { total: rows.length, totalAmount, paidAmount, outstanding: totalAmount - paidAmount };
  }, [filteredPurchases]);

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;
  const totalPages = Math.max(1, Math.ceil(filteredPurchases.length / rowsPerPage));
  const paginatedPurchases = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredPurchases.slice(start, start + rowsPerPage);
  }, [filteredPurchases, currentPage]);

  useEffect(() => { setCurrentPage(1); }, [search, filterStatus, filterPaymentStatus, filterCompanyId, filterDateFrom, filterDateTo]);
  useEffect(() => { setSelectedIds([]); }, [search, filterStatus, filterPaymentStatus, filterCompanyId, filterDateFrom, filterDateTo, currentPage]);

  const handlePrint = useCallback((invoice: PurchaseInvoice) => {
    setPrintInvoice(invoice); printTriggered.current = false;
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

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Delete ${selectedIds.length} purchase(s)?`)) return;
    try {
      await Promise.all(selectedIds.map((id) => apiClient.deletePurchaseInvoice(id)));
      showSuccess('Bulk delete', `${selectedIds.length} purchase(s) deleted.`);
      startTransition(() => setSelectedIds([]));
      refresh();
    } catch (err: unknown) { showError('Bulk delete failed', getErrorMessage(err, 'Bulk delete failed.')); }
  };

  const handleBulkStatusChange = async (status: string) => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Change ${selectedIds.length} purchase(s) to "${status}"?`)) return;
    try {
      await Promise.all(selectedIds.map((id) => apiClient.updatePurchaseInvoice(id, { status } as Partial<PurchaseInvoice>)));
      showSuccess('Bulk update', `${selectedIds.length} purchase(s) updated.`);
      startTransition(() => setSelectedIds([]));
      refresh();
    } catch (err: unknown) { showError('Bulk update failed', getErrorMessage(err, 'Bulk update failed.')); }
  };

  const handleView = useCallback((purchase: PurchaseInvoice) => {
    setViewingPurchase(purchase); setIsViewPanelOpen(true);
  }, []);

  const handleDelete = useCallback(async (purchase: PurchaseInvoice) => {
    if (!window.confirm(`Delete purchase ${purchase.purchase_number}?`)) return;
    try {
      await apiClient.deletePurchaseInvoice(purchase.id);
      showSuccess('Purchase deleted', `Purchase ${purchase.purchase_number} removed.`);
      refresh();
    } catch (err: unknown) { showError('Delete failed', getErrorMessage(err, 'Delete failed.')); }
  }, [refresh, showSuccess, showError]);

  const handleDuplicate = useCallback((purchase: PurchaseInvoice) => {
    const params = new URLSearchParams();
    params.set('duplicate_from', String(purchase.id));
    if (purchase.supplier_id) params.set('supplier_id', String(purchase.supplier_id));
    if (purchase.company_id) params.set('company_id', String(purchase.company_id));
    if (purchase.branch_id) params.set('branch_id', String(purchase.branch_id));
    navigate(`/purchases/create?${params.toString()}`);
    showSuccess('Duplicating', `Prefilling new purchase from ${purchase.purchase_number}.`);
  }, [navigate, showSuccess]);

  const handleRecordPaymentTrigger = useCallback((purchase: PurchaseInvoice) => {
    setPayingPurchase(purchase); setPayAmt(''); setPayMethod('bank_transfer');
    setPayDirection('outward'); setShowPaymentModal(true);
  }, []);

  const handleRecordPaymentSubmit = async () => {
    if (!payingPurchase) return;
    const amount = round2(parseFloat(payAmt));
    if (!Number.isFinite(amount) || amount <= 0) { showError('Validation', 'Please enter a valid amount.'); return; }
    setPaySubmitting(true);
    try {
      const companyId = payingPurchase.company_id || companies[0]?.id || 1;
      const reference = `PAY-${payingPurchase.id}-${Date.now()}`;
      await apiClient.request('POST', '/payments', {
        company_id: companyId,
        branch_id: payingPurchase.branch_id ?? 1,
        invoice_id: payingPurchase.id,
        reference_no: reference,
        ledger_reference: reference,
        amount,
        payment_method: toBackendPaymentMethod(payMethod),
        status: 'completed',
        payment_direction: payDirection,
        transaction_date: getLocalToday(),
        bank_name: '',
        account_number: '',
        remarks: '',
      });
      showSuccess('Payment recorded', `₹${amount.toFixed(2)} recorded.`);
      setShowPaymentModal(false); setPayingPurchase(null); refresh();
    } catch (err: unknown) { showError('Payment failed', getErrorMessage(err, 'Payment failed.')); }
    finally { setPaySubmitting(false); }
  };

  const handleExport = useCallback(() => {
    if (filteredPurchases.length === 0) { showError('Export failed', 'No data'); return; }
    const headers = ['Purchase #', 'Supplier', 'Company', 'Date', 'Total', 'Paid', 'Outstanding', 'Status', 'Payment'];
    const rows = filteredPurchases.map((p) => [
      escapeCsvField(p.purchase_number),
      escapeCsvField(p.supplier?.name || ''),
      escapeCsvField(p.company?.name || ''),
      escapeCsvField(p.purchase_date),
      safeNum(p.grand_total).toFixed(2),
      safeNum(p.paid_amount).toFixed(2),
      (safeNum(p.grand_total) - safeNum(p.paid_amount)).toFixed(2),
      escapeCsvField(p.status),
      escapeCsvField(p.payment_status),
    ].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `purchases-${getLocalToday()}.csv`; a.click();
    URL.revokeObjectURL(url);
    showSuccess('Export', 'File downloaded.');
  }, [filteredPurchases, showSuccess, showError]);

  /* ---------- Date presets (FIXED) ---------- */
  const applyDatePreset = useCallback((preset: Exclude<DatePreset, 'custom'>) => {
    const today = getLocalToday();
    setDatePreset(preset);
    if (preset === 'today') { setFilterDateFrom(today); setFilterDateTo(today); }
    else if (preset === '7d') { setFilterDateFrom(getDaysAgo(6)); setFilterDateTo(today); }
    else if (preset === '30d') { setFilterDateFrom(getDaysAgo(29)); setFilterDateTo(today); }
    else if (preset === 'month') { setFilterDateFrom(getMonthStart()); setFilterDateTo(today); }
    else { setFilterDateFrom(''); setFilterDateTo(''); }
  }, []);

  const handleFromDateChange = useCallback((value: string) => {
    setDatePreset('custom');
    // FIX: swap if user picked a "from" that's after the current "to"
    if (value && filterDateTo && value > filterDateTo) {
      setFilterDateFrom(filterDateTo);
      setFilterDateTo(value);
    } else {
      setFilterDateFrom(value);
    }
  }, [filterDateTo]);

  const handleToDateChange = useCallback((value: string) => {
    setDatePreset('custom');
    // FIX: swap if user picked a "to" that's before the current "from"
    if (value && filterDateFrom && value < filterDateFrom) {
      setFilterDateTo(filterDateFrom);
      setFilterDateFrom(value);
    } else {
      setFilterDateTo(value);
    }
  }, [filterDateFrom]);

  const clearFilters = useCallback(() => {
    setSearchInput(''); setSearch(''); setFilterStatus('all'); setFilterPaymentStatus('all');
    setFilterCompanyId(undefined);
    setFilterDateFrom(getMonthStart()); setFilterDateTo(getLocalToday());
    setDatePreset('month');
  }, []);

  /* FIX: active filter count now includes a non-default date range */
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (search) count++;
    if (filterStatus !== 'all') count++;
    if (filterPaymentStatus !== 'all') count++;
    if (filterCompanyId !== undefined) count++;
    if (datePreset === 'custom' || filterDateFrom !== getMonthStart() || filterDateTo !== getLocalToday()) count++;
    return count;
  }, [search, filterStatus, filterPaymentStatus, filterCompanyId, datePreset, filterDateFrom, filterDateTo]);

  const allSelected = Boolean(paginatedPurchases.length > 0 && paginatedPurchases.every((p) => selectedIds.includes(p.id)));

  const toggleSelectAll = useCallback(() => {
    const pageIds = paginatedPurchases.map((p) => p.id);
    if (!pageIds.length) return;
    if (allSelected) setSelectedIds((current) => current.filter((id) => !pageIds.includes(id)));
    else setSelectedIds((current) => Array.from(new Set([...current, ...pageIds])));
  }, [allSelected, paginatedPurchases]);

  const toggleSelected = useCallback((id: number) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((v) => v !== id) : [...current, id]);
  }, []);

  /* Whether we should show the Reset button */
  const shouldShowReset = activeFilterCount > 0;

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-600">
            <FiAlertCircle size={24} />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">Failed to load purchases</h2>
          <p className="mt-1.5 text-sm text-slate-500">{error}</p>
          <Button onClick={refresh} className="mt-5 rounded-xl bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800">Try Again</Button>
        </div>
      </div>
    );
  }

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
          <section className="relative overflow-hidden rounded-2xl border border-slate-800/10 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-5 py-6 shadow-[0_20px_40px_-20px_rgba(15,23,42,0.45)] sm:px-7 lg:px-8">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
            <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200 backdrop-blur">
                  <FiPackage size={12} /> Finance · Purchases
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-[32px]">Purchase workspace</h1>
                <p className="mt-1.5 max-w-2xl text-sm text-slate-300">Track supplier invoices, payments and outstanding balances in one place.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={handleExport}
                  className="h-10 rounded-xl border-white/10 bg-white/5 text-white shadow-none backdrop-blur transition hover:border-white/20 hover:bg-white/10 hover:text-white">
                  <FiDownload className="mr-2" size={14} /> Export
                </Button>
                <Button variant="outline" onClick={() => setIsImportOpen(true)}
                  className="h-10 rounded-xl border-white/10 bg-white/5 text-white shadow-none backdrop-blur transition hover:border-white/20 hover:bg-white/10 hover:text-white">
                  <FiUpload className="mr-2" size={14} /> Import
                </Button>
                <Button variant="outline" onClick={() => setIsOCROpen(true)}
                  className="h-10 rounded-xl border-transparent bg-gradient-to-b from-violet-500 to-indigo-500 text-white shadow-none backdrop-blur transition hover:from-violet-400 hover:to-indigo-400">
                  <FiZap className="mr-2" size={14} /> Scan with AI
                </Button>
                <Button onClick={() => navigate('/purchases/create')}
                  className="h-10 rounded-xl bg-gradient-to-b from-cyan-300 to-cyan-400 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:from-cyan-200 hover:to-cyan-300">
                  <FiPlus className="mr-2" size={14} /> New purchase
                </Button>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
            {purchases ? (
              <>
                <StatCard icon={FiPackage} label="Total purchases" value={summary.total.toLocaleString('en-IN')} accent="indigo" />
                <StatCard icon={FiTrendingUp} label="Total amount" value={summary.totalAmount.toFixed(2)} prefix="₹" accent="violet" />
                <StatCard icon={FiCheckCircle} label="Paid" value={summary.paidAmount.toFixed(2)} prefix="₹" accent="emerald" />
                <StatCard icon={FiTrendingDown} label="Outstanding" value={summary.outstanding.toFixed(2)} prefix="₹" accent="rose" />
              </>
            ) : (Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />))}
          </section>

          {/* ==================== Filters card ==================== */}
          <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3.5 sm:px-5">
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-50 text-indigo-600 ring-1 ring-indigo-500/10">
                  <FiFilter size={14} />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-800">Filters</CardTitle>
                  <CardDescription className="text-[11px] text-slate-500">
                    {activeFilterCount > 0 ? `${activeFilterCount} active filter${activeFilterCount > 1 ? 's' : ''}` : 'Refine purchases by scope, payment and date'}
                  </CardDescription>
                </div>
              </div>
              {shouldShowReset && (
                <Button variant="ghost" size="sm" className="h-9 rounded-lg text-slate-500 hover:text-slate-800" onClick={clearFilters}>
                  <FiX className="mr-1.5" size={14} /> Reset
                </Button>
              )}
            </CardHeader>
            <CardContent className="bg-white p-4 sm:p-5">
              {/* Row 1: search + company + status + payment */}
              <div className="grid gap-3 lg:grid-cols-12">
                <div className="relative lg:col-span-4">
                  <FiSearch className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
                    className="h-10 rounded-xl border-slate-200 pl-10 shadow-sm focus-visible:ring-4 focus-visible:ring-indigo-500/10"
                    placeholder="Search purchase #, supplier, status…" autoComplete="off" spellCheck={false} />
                  {searchInput && (
                    <button type="button" onClick={() => setSearchInput('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      aria-label="Clear search">
                      <FiX size={16} />
                    </button>
                  )}
                </div>
                <div className="lg:col-span-3">
                  <div className="relative">
                    <select aria-label="Company" value={filterCompanyId !== undefined ? String(filterCompanyId) : 'all'}
                      onChange={(e) => setFilterCompanyId(e.target.value === 'all' ? undefined : Number(e.target.value))}
                      className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10">
                      <option value="all">All companies</option>
                      {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  </div>
                </div>
                <div className="lg:col-span-2">
                  <div className="relative">
                    <select aria-label="Purchase status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                      className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10">
                      {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  </div>
                </div>
                <div className="lg:col-span-3">
                  <div className="relative">
                    <select aria-label="Payment status" value={filterPaymentStatus} onChange={(e) => setFilterPaymentStatus(e.target.value)}
                      className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10">
                      {PAYMENT_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  </div>
                </div>
              </div>

              {/* Row 2: date range + presets */}
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row lg:col-span-5">
                  <div className="relative min-w-0 flex-1">
                    <FiCalendar className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <Input type="date" value={filterDateFrom} onChange={(e) => handleFromDateChange(e.target.value)}
                      className="h-10 rounded-xl border-slate-200 pl-9 shadow-sm focus-visible:ring-4 focus-visible:ring-indigo-500/10" />
                  </div>
                  <div className="hidden items-center justify-center px-1 text-slate-300 sm:flex">→</div>
                  <div className="relative min-w-0 flex-1">
                    <FiCalendar className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <Input type="date" value={filterDateTo} min={filterDateFrom || undefined} onChange={(e) => handleToDateChange(e.target.value)}
                      className="h-10 rounded-xl border-slate-200 pl-9 shadow-sm focus-visible:ring-4 focus-visible:ring-indigo-500/10" />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:col-span-7 lg:justify-end">
                  <div className="flex items-center rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm">
                    {([
                      { key: 'today', label: 'Today' },
                      { key: '7d', label: '7 days' },
                      { key: '30d', label: '30 days' },
                      { key: 'month', label: 'This month' },
                      { key: 'all', label: 'All' },
                    ] as const).map((preset) => {
                      // FIX: accurate active state derived from the `datePreset` state
                      const isActive = datePreset === preset.key;
                      return (
                        <button key={preset.key} type="button"
                          onClick={() => applyDatePreset(preset.key)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                            isActive ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                          }`}>
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                  {datePreset === 'custom' && (
                    <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
                      Custom range
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {selectedIds.length > 0 && (
            <div className="sticky top-3 z-30 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-lg shadow-slate-900/5 backdrop-blur">
              <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4">
                <div className="mr-1 flex items-center gap-2 rounded-lg bg-indigo-50 px-2.5 py-1 text-indigo-700 ring-1 ring-indigo-500/10">
                  <span className="text-sm font-bold">{selectedIds.length}</span>
                  <span className="text-xs font-medium">selected</span>
                </div>
                <Button size="sm" variant="outline" className="h-9 rounded-lg" onClick={() => handleBulkStatusChange('Received')}>
                  <FiCheckCircle className="mr-1.5 text-emerald-600" size={14} /> Mark received
                </Button>
                <Button size="sm" variant="destructive" className="h-9 rounded-lg bg-rose-600 hover:bg-rose-700" onClick={handleBulkDelete}>
                  <FiTrash2 className="mr-1.5" size={14} /> Delete
                </Button>
                <Button size="sm" variant="ghost" className="ml-auto h-9 rounded-lg text-slate-500 hover:text-slate-800"
                  onClick={() => startTransition(() => setSelectedIds([]))}>Clear</Button>
              </div>
            </div>
          )}

          <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <CardHeader className="flex flex-col gap-3 border-b border-slate-100 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600">
                  <FiPackage size={14} />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-800">Purchase orders</CardTitle>
                  <CardDescription className="text-[11px] text-slate-500">
                    {loading ? 'Loading purchases…' : `${filteredPurchases.length.toLocaleString('en-IN')} record${filteredPurchases.length === 1 ? '' : 's'}`}
                    {filterDateFrom && filterDateTo && (<> · {formatDate(filterDateFrom)} – {formatDate(filterDateTo)}</>)}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <div className="overflow-x-auto">
              <Table className="min-w-[1180px]">
                <TableHeader>
                  <TableRow className="border-slate-100 bg-slate-50/70 hover:bg-slate-50/70">
                    <TableHead className="w-11 px-3">
                      <input aria-label="Select all purchases on page" type="checkbox" checked={allSelected}
                        onChange={(event) => { event.stopPropagation(); toggleSelectAll(); }}
                        onClick={(event) => event.stopPropagation()}
                        className="h-4 w-4 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/30" />
                    </TableHead>
                    <TableHead><TableHeadLabel>Purchase #</TableHeadLabel></TableHead>
                    <TableHead><TableHeadLabel>Supplier</TableHeadLabel></TableHead>
                    <TableHead><TableHeadLabel>Company</TableHeadLabel></TableHead>
                    <TableHead><TableHeadLabel>Date</TableHeadLabel></TableHead>
                    <TableHead className="text-right"><TableHeadLabel align="right">Total</TableHeadLabel></TableHead>
                    <TableHead className="text-right"><TableHeadLabel align="right">Outstanding</TableHeadLabel></TableHead>
                    <TableHead><TableHeadLabel>Status</TableHeadLabel></TableHead>
                    <TableHead><TableHeadLabel>Payment</TableHeadLabel></TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {loading && Array.from({ length: 8 }).map((_, index) => (
                    <TableRow key={`skeleton-${index}`} className="border-slate-100">
                      {Array.from({ length: TABLE_COLUMN_COUNT }).map((__, cellIndex) => (
                        <TableCell key={cellIndex}><div className="h-4 animate-pulse rounded bg-slate-100" /></TableCell>
                      ))}
                    </TableRow>
                  ))}

                  {!loading && paginatedPurchases.map((purchase) => {
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
                      <TableRow key={purchase.id} data-state={selected ? 'selected' : undefined}
                        className={`cursor-pointer border-slate-100 transition-colors hover:bg-slate-50/70 ${selected ? 'bg-indigo-50/40 hover:bg-indigo-50/60' : ''}`}
                        onClick={() => handleView(purchase)}>
                        <TableCell className="px-3">
                          <input aria-label={`Select ${purchase.purchase_number}`} type="checkbox" checked={selected}
                            onChange={(event) => { event.stopPropagation(); toggleSelected(purchase.id); }}
                            onClick={(event) => event.stopPropagation()}
                            className="h-4 w-4 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/30" />
                        </TableCell>
                        <TableCell>
                          <div className="min-w-[140px]">
                            <Link to={`/purchases/${purchase.id}`} onClick={(event) => event.stopPropagation()}
                              className="text-sm font-semibold text-slate-900 transition hover:text-indigo-600">
                              {purchase.purchase_number}
                            </Link>
                            <p className="mt-0.5 text-[11px] font-medium text-slate-400">#{purchase.id}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="min-w-[180px]">
                            <p className="text-sm font-medium text-slate-800">{purchase.supplier?.name || '—'}</p>
                            {purchase.supplier?.email && <p className="truncate text-[11px] text-slate-500">{purchase.supplier.email}</p>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex min-w-[140px] items-center gap-1.5">
                            {purchase.company?.name ? (
                              <>
                                <span className="grid h-6 w-6 place-items-center rounded-md bg-indigo-50 text-indigo-600">
                                  <FiHome size={11} />
                                </span>
                                <span className="text-sm text-slate-700">{purchase.company.name}</span>
                              </>
                            ) : (<span className="text-sm text-slate-400">—</span>)}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-slate-600">{formatDate(purchase.purchase_date)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right text-sm font-semibold tabular-nums text-slate-900">
                          {formatCurrency(purchase.grand_total)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          <span className={`inline-flex items-center rounded-lg px-2 py-1 text-sm font-semibold tabular-nums ${
                            outstanding > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
                          }`}>
                            {formatCurrency(outstanding)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusColors[purchase.status] || 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                            {purchase.status || '—'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${paymentColors[purchase.payment_status] || 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                            {purchase.payment_status || '—'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => handleView(purchase)}
                              className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                              title="View details">
                              <FiEye size={16} />
                            </button>
                            <ActionDropdown row={purchase} onPrint={handlePrint}
                              onRecordPayment={handleRecordPaymentTrigger}
                              onDuplicate={handleDuplicate} onDelete={handleDelete} />
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
                          <p className="mt-1 text-sm text-slate-500">Try adjusting the date range, company, payment status, search term, or status.</p>
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

            {!loading && totalPages > 1 && (
              <div className="flex flex-col gap-3 border-t border-slate-100 bg-white px-4 py-3.5 sm:px-5 md:flex-row md:items-center md:justify-between">
                <p className="text-xs text-slate-500 sm:text-[13px]">
                  Page <span className="font-semibold text-slate-700">{currentPage}</span> of <span className="font-semibold text-slate-700">{totalPages}</span>
                </p>
                <div className="flex items-center justify-between gap-1.5 sm:justify-end">
                  <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg" disabled={currentPage === 1}
                    onClick={() => startTransition(() => setCurrentPage(1))} aria-label="First page">«</Button>
                  <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg" disabled={currentPage === 1}
                    onClick={() => startTransition(() => setCurrentPage((p) => Math.max(1, p - 1)))} aria-label="Previous page">‹</Button>
                  <div className="mx-1 min-w-[76px] rounded-lg bg-slate-100 px-3 py-1.5 text-center text-xs font-semibold text-slate-700">
                    {currentPage} / {totalPages}
                  </div>
                  <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg" disabled={currentPage === totalPages}
                    onClick={() => startTransition(() => setCurrentPage((p) => Math.min(totalPages, p + 1)))} aria-label="Next page">›</Button>
                  <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg" disabled={currentPage === totalPages}
                    onClick={() => startTransition(() => setCurrentPage(totalPages))} aria-label="Last page">»</Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {isViewPanelOpen && (
        <Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm"><div className="rounded-2xl bg-white p-8 text-sm text-slate-600 shadow-xl">Loading details…</div></div>}>
          <Offcanvas isOpen={isViewPanelOpen} title={`Purchase ${viewingPurchase?.purchase_number || ''}`} onClose={() => setIsViewPanelOpen(false)}>
            {viewingPurchase && (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold tracking-tight text-slate-900">{viewingPurchase.purchase_number}</h3>
                    <p className="text-sm text-slate-500">{viewingPurchase.supplier?.name || '—'}</p>
                  </div>
                  <Badge variant="outline" className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                    viewingPurchase.payment_status === 'Paid' ? 'border-emerald-200/70 bg-emerald-50 text-emerald-700'
                      : viewingPurchase.payment_status === 'Partial' ? 'border-sky-200/70 bg-sky-50 text-sky-700'
                        : 'border-rose-200/70 bg-rose-50 text-rose-700'
                  }`}>
                    {viewingPurchase.payment_status || '—'}
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Total</p>
                    <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">{formatCurrency(viewingPurchase.grand_total)}</p>
                  </div>
                  <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/60 p-2.5">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-700/80">Paid</p>
                    <p className="mt-0.5 text-sm font-bold tabular-nums text-emerald-700">{formatCurrency(viewingPurchase.paid_amount)}</p>
                  </div>
                  <div className="rounded-xl border border-rose-200/70 bg-rose-50/60 p-2.5">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-rose-700/80">Due</p>
                    <p className="mt-0.5 text-sm font-bold tabular-nums text-rose-600">
                      {formatCurrency(safeNum(viewingPurchase.grand_total) - safeNum(viewingPurchase.paid_amount))}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Button size="sm" className="h-9 rounded-xl bg-slate-900 text-xs hover:bg-slate-800"
                    onClick={() => navigate(`/purchases/${viewingPurchase.id}`)}>Open full purchase</Button>
                  <Button size="sm" variant="outline" className="h-9 rounded-xl text-xs" onClick={() => handlePrint(viewingPurchase)}>
                    <FiPrinter className="mr-1.5" size={14} /> Print (A4)
                  </Button>
                </div>
              </div>
            )}
          </Offcanvas>
        </Suspense>
      )}

      {showPaymentModal && payingPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={() => !paySubmitting && setShowPaymentModal(false)} />
          <div className="animate-fadeIn relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-violet-600 ring-1 ring-violet-500/10">
                <FiCreditCard size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Record payment</h3>
                <p className="text-xs text-slate-500">{payingPurchase.purchase_number} · {payingPurchase.supplier?.name}</p>
              </div>
            </div>
            <div className="space-y-3">
              <Input type="number" value={payAmt} onChange={(e) => setPayAmt(e.target.value)} placeholder="Amount"
                className="h-10 rounded-xl border-slate-200 text-sm font-medium focus-visible:ring-4 focus-visible:ring-indigo-500/10" />
              <div className="relative">
                <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}
                  className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10">
                  {PAYMENT_METHOD_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              </div>
              <div className="relative">
                <select value={payDirection} onChange={(e) => setPayDirection(e.target.value as 'inward' | 'outward')}
                  className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10">
                  <option value="outward">Outward (payment to supplier)</option>
                  <option value="inward">Inward (refund / receipt)</option>
                </select>
                <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowPaymentModal(false)} disabled={paySubmitting} className="h-10 rounded-xl">Cancel</Button>
              <Button onClick={handleRecordPaymentSubmit} disabled={paySubmitting} className="h-10 rounded-xl bg-indigo-600 font-semibold hover:bg-indigo-700">
                {paySubmitting && <FiPackage className="mr-2 animate-spin" size={14} />} Save payment
              </Button>
            </div>
          </div>
        </div>
      )}

      {printInvoice && (
        <InvoicePrint
          invoice={{
            ...printInvoice,
            invoice_no: printInvoice.purchase_number,
            customer: printInvoice.supplier ?? undefined,
            total_amount: printInvoice.grand_total,
            tax_amount: 0,
            items: (printInvoice.items ?? []).map((item) => ({ ...item, product_name: item.product_name ?? 'Item' })),
          } as unknown as React.ComponentProps<typeof InvoicePrint>['invoice']}
          onReady={() => {}} />
      )}

      <PurchaseImportModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} onImported={refresh} />
      <PurchaseOCRModal isOpen={isOCROpen} onClose={() => setIsOCROpen(false)} onImported={refresh} />
    </>
  );
}

export default PurchasePage;