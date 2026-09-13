// src/pages/DashboardPage.tsx
import { useEffect, useState, useCallback, useMemo, memo, useRef } from 'react';
import type { ReactNode } from 'react';
import {
  FiRefreshCw, FiClock, FiUsers, FiShoppingCart, FiBox,
  FiDollarSign, FiTrendingUp, FiBarChart2, FiUserCheck, FiUserX,
  FiCalendar, FiAlertTriangle, FiActivity, FiTrendingDown,
  FiCheckCircle, FiPackage, FiAlertCircle, FiMic, FiMicOff,
  FiX, FiSend, FiMessageSquare, FiCpu, FiFilter, FiXCircle,
  FiChevronDown, FiChevronUp, FiAward, FiTarget, FiStar, FiZap, FiSave,
} from 'react-icons/fi';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, ComposedChart, Legend,
  RadialBarChart, RadialBar, LabelList, PolarAngleAxis,
  RadarChart, Radar, PolarGrid, PolarRadiusAxis,
} from 'recharts';
import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { Tooltip } from 'react-tooltip';
import 'react-tooltip/dist/react-tooltip.css';

/* ────────────────────────────────────────────────────────────────── */
/* Types                                                              */
/* ────────────────────────────────────────────────────────────────── */

interface PaymentBreakdown { total: number; online: number; cash: number; }
interface PaymentSummary { inward: PaymentBreakdown; outward: PaymentBreakdown; }

interface InventorySummary {
  totalProducts: number;
  totalQuantity: number;
  inStock: number;
  lowStock: number;
  zeroStock: number;
  negativeStock: number;
}

interface LowStockProduct { product_name: string; qty: number; }
interface TopCustomer { name: string; amount: number; }
interface TopVendor { name: string; amount: number; }

type DateRangeKey =
  | 'today' | 'yesterday' | '7d' | '30d' | '90d'
  | 'this_month' | 'last_month' | 'this_quarter' | 'this_year'
  | 'custom' | 'all';

interface FilterableRecord {
  company_id?: number | string | null;
  branch_id?: number | string | null;
  created_at?: string | null;
  invoice_date?: string | null;
  order_date?: string | null;
  purchase_date?: string | null;
  bill_date?: string | null;
  date?: string | null;
  [key: string]: unknown;
}

interface ResolvedRange { from: Date | null; to: Date | null; label: string; }

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const DEV = typeof import.meta !== 'undefined' && (import.meta as any)?.env?.DEV === true;

const DATE_RANGE_OPTIONS: { value: DateRangeKey; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'this_quarter', label: 'This quarter' },
  { value: 'this_year', label: 'This year' },
  { value: 'custom', label: 'Custom range' },
  { value: 'all', label: 'All time' },
];

/* ────────────────────────────────────────────────────────────────── */
/* Date helpers                                                       */
/* ────────────────────────────────────────────────────────────────── */

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

function resolveRange(key: DateRangeKey, customFrom?: string, customTo?: string): ResolvedRange {
  const now = new Date();
  switch (key) {
    case 'today': return { from: startOfDay(now), to: endOfDay(now), label: 'Today' };
    case 'yesterday': {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y), label: 'Yesterday' };
    }
    case '7d': { const d = new Date(now); d.setDate(d.getDate() - 6); return { from: startOfDay(d), to: endOfDay(now), label: 'Last 7 days' }; }
    case '30d': { const d = new Date(now); d.setDate(d.getDate() - 29); return { from: startOfDay(d), to: endOfDay(now), label: 'Last 30 days' }; }
    case '90d': { const d = new Date(now); d.setDate(d.getDate() - 89); return { from: startOfDay(d), to: endOfDay(now), label: 'Last 90 days' }; }
    case 'this_month': { const from = new Date(now.getFullYear(), now.getMonth(), 1); return { from: startOfDay(from), to: endOfDay(now), label: 'This month' }; }
    case 'last_month': {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: startOfDay(from), to: endOfDay(to), label: 'Last month' };
    }
    case 'this_quarter': { const q = Math.floor(now.getMonth() / 3); const from = new Date(now.getFullYear(), q * 3, 1); return { from: startOfDay(from), to: endOfDay(now), label: 'This quarter' }; }
    case 'this_year': { const from = new Date(now.getFullYear(), 0, 1); return { from: startOfDay(from), to: endOfDay(now), label: 'This year' }; }
    case 'custom': {
      const f = customFrom ? new Date(customFrom) : null;
      const t = customTo ? new Date(customTo) : null;
      return { from: f ? startOfDay(f) : null, to: t ? endOfDay(t) : null, label: 'Custom range' };
    }
    case 'all': default: return { from: null, to: null, label: 'All time' };
  }
}

function applyCompanyBranch<T extends FilterableRecord>(
  list: T[] | null,
  companyFilter: string,
  branchFilter: string,
): T[] {
  if (!list) return [];
  let out = list;
  if (companyFilter !== 'all') {
    const cid = Number(companyFilter);
    out = out.filter((r) => Number(r.company_id) === cid);
  }
  if (branchFilter !== 'all') {
    const bid = Number(branchFilter);
    out = out.filter((r) => Number(r.branch_id) === bid);
  }
  return out;
}

function previousRange(range: ResolvedRange): ResolvedRange {
  if (!range.from || !range.to) return { from: null, to: null, label: 'Previous period' };
  const span = range.to.getTime() - range.from.getTime();
  const to = new Date(range.from.getTime() - 1);
  const from = new Date(to.getTime() - span);
  return { from, to, label: 'Previous period' };
}

const compactNumber = (n: number): string => {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(2)}Cr`;
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(2)}L`;
  if (abs >= 1_000) return `${sign}₹${(abs / 1_000).toFixed(1)}K`;
  return `${sign}₹${abs.toFixed(0)}`;
};

const pctChange = (current: number, prev: number): number | null => {
  if (!Number.isFinite(current) || !Number.isFinite(prev)) return null;
  if (prev === 0) return current === 0 ? 0 : null;
  return ((current - prev) / Math.abs(prev)) * 100;
};

const getDateKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;

/* ══════════════════════════════════════════════════════════════════ */
/* Robust date parsing                                                */
/* ══════════════════════════════════════════════════════════════════ */

const parseDateSafe = (raw: any): Date | null => {
  if (!raw) return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  const s = String(raw).trim();
  if (!s) return null;

  let d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d;

  const mysql = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (mysql) {
    d = new Date(
      Number(mysql[1]), Number(mysql[2]) - 1, Number(mysql[3]),
      Number(mysql[4]), Number(mysql[5]), Number(mysql[6] || 0),
    );
    if (!Number.isNaN(d.getTime())) return d;
  }

  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (dmy) {
    const day   = Number(dmy[1]);
    const month = Number(dmy[2]) - 1;
    let year    = Number(dmy[3]);
    if (year < 100) year += 2000;
    if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
      d = new Date(year, month, day);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }

  const ymd = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (ymd) {
    const year  = Number(ymd[1]);
    const month = Number(ymd[2]) - 1;
    const day   = Number(ymd[3]);
    if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
      d = new Date(year, month, day);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }

  return null;
};

/* ══════════════════════════════════════════════════════════════════ */
/* Per-entity date field getters                                      */
/* ══════════════════════════════════════════════════════════════════ */

const getInvoiceDateField = (r: any): string | null =>
  r?.invoice_date || r?.bill_date || r?.date || r?.created_at || null;

const getPurchaseDateField = (r: any): string | null =>
  r?.purchase_date || r?.bill_date || r?.invoice_date || r?.date || r?.created_at || null;

const getOrderDateField = (r: any): string | null =>
  r?.order_date || r?.date || r?.created_at || null;

const getPaymentDateField = (r: any): string | null =>
  r?.payment_date || r?.transaction_date || r?.date || r?.created_at || null;

const withinRangeUsing = (raw: any, range: ResolvedRange): boolean => {
  if (!range.from && !range.to) return true;
  if (!raw) return true;
  const d = parseDateSafe(raw);
  if (!d) return true;
  const t = d.getTime();
  if (range.from && t < range.from.getTime()) return false;
  if (range.to && t > range.to.getTime()) return false;
  return true;
};

/* ══════════════════════════════════════════════════════════════════ */
/* Soft-delete + shape validation                                     */
/* ══════════════════════════════════════════════════════════════════ */

const isNotDeleted = (r: any): boolean => {
  if (!r || typeof r !== 'object') return false;
  if (r.deleted_at != null && r.deleted_at !== '' && r.deleted_at !== 'null') return false;
  if (r.is_deleted === true || r.is_deleted === 1) return false;
  if (r.trashed_at != null && r.trashed_at !== '') return false;
  return true;
};

/* ────────────────────────────────────────────────────────────────── */
/* Safe readers                                                       */
/* ────────────────────────────────────────────────────────────────── */

const pickNum = (obj: any, keys: string[], fallback = 0): number => {
  if (!obj) return fallback;
  for (const k of keys) {
    const v = obj[k];
    if (v != null && v !== '') {
      const n = typeof v === 'number' ? v : parseFloat(String(v));
      if (Number.isFinite(n)) return n;
    }
  }
  return fallback;
};

const pickStr = (obj: any, keys: string[], fallback = ''): string => {
  if (!obj) return fallback;
  for (const k of keys) {
    const v = obj[k];
    if (v != null && v !== '') return String(v);
  }
  return fallback;
};

const normalizeStatus = (s: any): string =>
  String(s ?? 'unknown').toLowerCase().trim();

/* ══════════════════════════════════════════════════════════════════ */
/* SHAPE GUARDS — reject records that don't belong to the collection  */
/* ══════════════════════════════════════════════════════════════════ */

/**
 * A record counts as a purchase bill ONLY when it carries at least 2
 * purchase-specific signals. This is what stops sales invoices or
 * unrelated records from being counted as purchases.
 */
const isLikelyPurchaseBill = (p: any): boolean => {
  if (!p || typeof p !== 'object') return false;

  let signals = 0;
  if (p.supplier_id != null || p.vendor_id != null) signals++;
  if (p.purchase_number || p.purchase_no) signals++;
  if (p.bill_number || p.bill_no) signals++;
  if (p.purchase_date) signals++;
  if (p.grand_total != null && p.grand_total !== '') signals++;

  // Explicit negative signal: a record with only customer_id/invoice_number
  // is a SALES invoice, never a purchase bill.
  if ((p.customer_id != null || p.invoice_number) && (p.supplier_id == null && p.vendor_id == null && !p.purchase_number)) {
    return false;
  }

  return signals >= 2;
};

/**
 * Same idea for invoices — must have a customer or invoice_number.
 */
const isLikelySalesInvoice = (i: any): boolean => {
  if (!i || typeof i !== 'object') return false;
  if (i.customer_id != null || i.customer_name != null) return true;
  if (i.invoice_number || i.invoice_no) return true;
  if (i.invoice_date) return true;
  return false;
};

/**
 * Extract an array of rows from any of the response envelopes we've seen:
 *   [...]                 → array
 *   { data: [...] }       → paginated envelope
 *   { data: { data: [] } }→ nested
 *   { rows: [...] }       → legacy
 */
const extractRows = (payload: unknown): any[] => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  const p = payload as any;
  if (Array.isArray(p.data)) return p.data;
  if (p.data && Array.isArray(p.data.data)) return p.data.data;
  if (Array.isArray(p.rows)) return p.rows;
  if (Array.isArray(p.items)) return p.items;
  return [];
};

/* ══════════════════════════════════════════════════════════════════ */
/* Recursive party-name extractor                                     */
/* ══════════════════════════════════════════════════════════════════ */

const DEEP_NAME_KEYS = [
  'name', 'full_name', 'company_name', 'display_name',
  'business_name', 'legal_name', 'contact_name', 'party_name',
  'supplier_name', 'vendor_name', 'customer_name', 'billing_name',
];

const deepFindName = (obj: any, depth = 0): string => {
  if (!obj || typeof obj !== 'object' || depth > 3) return '';

  for (const k of DEEP_NAME_KEYS) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }

  const NESTED = [
    'supplier', 'vendor', 'party', 'bill_from', 'from_party',
    'supplier_info', 'vendor_info', 'business', 'company', 'contact', 'user',
  ];
  for (const k of NESTED) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (v && typeof v === 'object') {
      const found = deepFindName(v, depth + 1);
      if (found) return found;
    }
  }

  return '';
};

/**
 * Return the display name for a purchase's vendor.
 * Returns '' when truly unknown — NO fake fallback strings.
 */
const extractVendorName = (p: any): string => {
  if (!p || typeof p !== 'object') return '';
  return deepFindName(p);
};

const extractCustomerName = (p: any): string => {
  if (!p || typeof p !== 'object') return '';
  return deepFindName(p);
};

/* ────────────────────────────────────────────────────────────────── */
/* Payment direction / method classifiers                             */
/* ────────────────────────────────────────────────────────────────── */

const classifyPaymentDirection = (p: any): 'inward' | 'outward' | 'unknown' => {
  const explicit = pickStr(p, [
    'direction', 'flow', 'payment_direction', 'type', 'payment_type', 'kind', 'category',
  ]).toLowerCase();
  if (explicit) {
    if (/(^|\b)(out|outward|payable|purchase|vendor|supplier|expense|debit|paid|payment_out|pay_to)(\b|$)/.test(explicit)) {
      return 'outward';
    }
    if (/(^|\b)(in|inward|receivable|sale|sales|customer|receipt|credit|receive|payment_in|received)(\b|$)/.test(explicit)) {
      return 'inward';
    }
  }
  const hasVendor = !!(p?.vendor_id || p?.supplier_id || p?.vendor || p?.supplier);
  const hasCustomer = !!(p?.customer_id || p?.customer);
  if (hasVendor && !hasCustomer) return 'outward';
  if (hasCustomer && !hasVendor) return 'inward';
  const ref = pickStr(p, [
    'reference_type', 'payable_type', 'payable', 'transaction_type', 'source_type',
  ]).toLowerCase();
  if (/purchase|vendor|supplier|bill|expense/.test(ref)) return 'outward';
  if (/invoice|sale|customer|receipt/.test(ref)) return 'inward';
  const amt = pickNum(p, ['amount', 'total', 'paid_amount', 'payment_amount']);
  if (amt < 0) return 'outward';
  return 'unknown';
};

const classifyPaymentMethod = (p: any): 'online' | 'cash' => {
  const m = pickStr(p, ['method', 'payment_method', 'mode', 'payment_mode', 'channel', 'via']).toLowerCase();
  if (/\bcash\b|physical|hand/.test(m)) return 'cash';
  return 'online';
};

/* ══════════════════════════════════════════════════════════════════ */
/* Amount extractors                                                  */
/* ══════════════════════════════════════════════════════════════════ */

const getPurchaseTotal = (p: any): number =>
  pickNum(p, [
    'grand_total', 'grand_total_amount', 'net_total', 'net_amount', 'bill_amount',
    'total_amount', 'total', 'amount',
  ], 0);

const getInvoiceTotal = (i: any): number =>
  pickNum(i, ['total_amount', 'grand_total', 'net_total', 'amount', 'total'], 0);

const getPaidAmount = (r: any): number =>
  pickNum(r, ['paid_amount', 'amount_paid', 'received_amount', 'paid', 'amount_received'], 0);

/* ══════════════════════════════════════════════════════════════════ */
/* Deduplication                                                      */
/* ══════════════════════════════════════════════════════════════════ */

const dedupeById = <T extends Record<string, any>>(list: T[] | null): T[] => {
  if (!list) return [];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const rawId = item.id ?? item.uuid ?? item.invoice_id ?? item.bill_id ?? item.purchase_id;
    if (rawId == null) { out.push(item); continue; }
    const key = String(rawId);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
};

const dedupeBills = (list: any[] | null): any[] => {
  if (!list) return [];
  const byId = dedupeById(list);
  const seenComposite = new Set<string>();
  const out: any[] = [];
  for (const item of byId) {
    const invoiceNo = pickStr(item, [
      'invoice_no', 'bill_no', 'purchase_no', 'invoice_number',
      'purchase_number', 'bill_number', 'number',
    ]);
    const realInvoiceNo =
      invoiceNo && invoiceNo !== '—' && invoiceNo !== '-' &&
      invoiceNo.toUpperCase() !== 'N/A' && invoiceNo.toUpperCase() !== 'NULL';
    if (realInvoiceNo) {
      const total = getPurchaseTotal(item);
      const key = `${invoiceNo}::${total}`;
      if (seenComposite.has(key)) continue;
      seenComposite.add(key);
    }
    out.push(item);
  }
  return out;
};

/* ══════════════════════════════════════════════════════════════════ */
/* Employee status buckets                                            */
/* ══════════════════════════════════════════════════════════════════ */

const EMPLOYEE_ACTIVE_RE = /active|present|working|employed|on.?duty|current/i;
const EMPLOYEE_LEAVE_RE = /leave|vacation|holiday|absent/i;

/* ────────────────────────────────────────────────────────────────── */
/* Cache hook                                                         */
/* ────────────────────────────────────────────────────────────────── */

const cache = new Map<string, { data: unknown; timestamp: number }>();
const inFlight = new Map<string, Promise<unknown>>();

const unwrap = <T,>(payload: unknown): T => {
  if (payload === null || payload === undefined) return [] as unknown as T;
  if (Array.isArray(payload)) return payload as T;
  if (typeof payload === 'object' && payload !== null && 'data' in payload) {
    return unwrap<T>((payload as { data?: unknown }).data);
  }
  return payload as T;
};

function useApiCache<T>(key: string, fetcher: () => Promise<T>, ttlMs = 300_000) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const fetcherRef = useRef(fetcher);

  useEffect(() => { fetcherRef.current = fetcher; }, [fetcher]);

  const fetchData = useCallback(async (skipCache = false): Promise<T | null> => {
    if (!skipCache) {
      const entry = cache.get(key);
      if (entry && Date.now() - entry.timestamp < ttlMs) {
        if (!mountedRef.current) return entry.data as T;
        setData(unwrap<T>(entry.data));
        setLoading(false);
        return entry.data as T;
      }
    }
    let request = inFlight.get(key) as Promise<T> | undefined;
    if (!request || skipCache) {
      request = (async () => {
        try {
          const res = await fetcherRef.current();
          const result = unwrap<T>(res);
          cache.set(key, { data: result, timestamp: Date.now() });
          return result;
        } finally { inFlight.delete(key); }
      })();
      inFlight.set(key, request);
    }
    if (mountedRef.current) { setLoading(true); setError(null); }
    try {
      const result = await request;
      if (mountedRef.current) setData(result);
      return result;
    } catch (err: unknown) {
      if (mountedRef.current) setError((err as { message?: string })?.message || 'Failed to load');
      return null;
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [key, ttlMs]);

  useEffect(() => {
    mountedRef.current = true;
    void fetchData();
    return () => { mountedRef.current = false; };
  }, [fetchData]);

  return { data, loading, error, refresh: () => fetchData(true) };
}

/* ────────────────────────────────────────────────────────────────── */
/* Presentational                                                     */
/* ────────────────────────────────────────────────────────────────── */

const StatCardSkeleton = memo(() => (
  <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 animate-pulse">
    <div className="h-11 w-11 rounded-2xl bg-slate-200" />
    <div className="flex-1 space-y-2">
      <div className="h-3 w-20 rounded bg-slate-200" />
      <div className="h-6 w-24 rounded bg-slate-200" />
    </div>
  </div>
));
StatCardSkeleton.displayName = 'StatCardSkeleton';

type Tone = 'blue' | 'emerald' | 'amber' | 'rose' | 'purple' | 'teal';

const StatCard = memo(
  ({ icon: Icon, label, value, tone, hint, delta }: {
    icon: React.ElementType; label: string; value: number | string; tone: Tone;
    hint?: string; delta?: number | null;
  }) => {
    const gradients: Record<Tone, string> = {
      blue: 'from-blue-500 to-indigo-500 shadow-blue-500/20',
      emerald: 'from-emerald-500 to-teal-500 shadow-emerald-500/20',
      amber: 'from-amber-500 to-orange-500 shadow-amber-500/20',
      rose: 'from-rose-500 to-pink-500 shadow-rose-500/20',
      purple: 'from-purple-500 to-violet-500 shadow-purple-500/20',
      teal: 'from-teal-500 to-cyan-500 shadow-teal-500/20',
    };
    const deltaPositive = typeof delta === 'number' && delta >= 0;
    const deltaShow = typeof delta === 'number';
    return (
      <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_12px_24px_-12px_rgba(15,23,42,0.15)]">
        <div className="flex items-center gap-3">
          <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${gradients[tone]} text-white shadow-lg`}>
            <Icon size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
            <p className="mt-0.5 truncate text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              {typeof value === 'number' ? value.toLocaleString('en-IN') : value}
            </p>
            <div className="mt-0.5 flex items-center gap-2">
              {hint && <p className="text-[10px] text-slate-500">{hint}</p>}
              {deltaShow && (
                <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${deltaPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                  {deltaPositive ? <FiTrendingUp size={10} /> : <FiTrendingDown size={10} />}
                  {Math.abs(delta as number).toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  },
);
StatCard.displayName = 'StatCard';

const ChartCard = ({ title, subtitle, children, className = '', accent = 'indigo' }: {
  title: string; subtitle?: string; children: ReactNode; className?: string;
  accent?: 'indigo' | 'emerald' | 'amber' | 'rose' | 'violet' | 'teal';
}) => {
  const accents: Record<string, string> = {
    indigo: 'from-indigo-500 to-blue-500', emerald: 'from-emerald-500 to-teal-500',
    amber: 'from-amber-500 to-orange-500', rose: 'from-rose-500 to-pink-500',
    violet: 'from-violet-500 to-purple-500', teal: 'from-teal-500 to-cyan-500',
  };
  return (
    <div className={`group flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 hover:border-slate-300 hover:shadow-[0_12px_24px_-12px_rgba(15,23,42,0.12)] ${className}`}>
      <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-3.5">
        <span className={`h-2.5 w-2.5 rounded-full bg-gradient-to-br ${accents[accent]}`} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-slate-800">{title}</h2>
          {subtitle && <p className="truncate text-[11px] text-slate-500">{subtitle}</p>}
        </div>
      </div>
      <div className="flex-1 p-5">{children}</div>
    </div>
  );
};

const MiniTable = ({ columns, data }: { columns: string[]; data: (string | number)[][] }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {columns.map((col, i) => (<th key={i} className="px-3 py-2 first:pl-0 last:pr-0">{col}</th>))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {data.length === 0 ? (
          <tr><td colSpan={columns.length} className="py-6 text-center text-slate-400">No data available</td></tr>
        ) : (
          data.map((row, i) => (
            <tr key={i} className="hover:bg-slate-50/70">
              {row.map((cell, j) => (<td key={j} className="px-3 py-2 text-slate-700 first:pl-0 last:pr-0">{cell}</td>))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);

const RupeeTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      {payload.map((entry: any, idx: number) => (
        <p key={idx} className="flex items-center gap-2 text-xs">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color || entry.fill }} />
          <span className="text-slate-600">{entry.name}:</span>
          <span className="font-semibold text-slate-900">{compactNumber(Number(entry.value) || 0)}</span>
        </p>
      ))}
    </div>
  );
};

/* ────────────────────────────────────────────────────────────────── */
/* Gemini AI Assistant                                                */
/* ────────────────────────────────────────────────────────────────── */

interface ChatMessage { id: string; sender: 'user' | 'gemini'; text: string; }

const GeminiAIAssistant = memo(() => {
  const [isOpen, setIsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [ttsSource, setTtsSource] = useState<'browser' | 'cloud'>('browser');
  const [voiceProvider, setVoiceProvider] = useState<'browser' | 'cloud'>('cloud');
  const [voiceLanguage, setVoiceLanguage] = useState<'en-US' | 'hi-IN'>('en-US');
  const [voiceSpeed, setVoiceSpeed] = useState(0.96);

  const recognitionRef = useRef<any>(null);
  const synthesisRef = useRef<SpeechSynthesis | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const pickBestVoice = useCallback((): SpeechSynthesisVoice | null => {
    if (!('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    return (
      voices.find((voice) => {
        const name = voice.name.toLowerCase();
        const lang = voice.lang.toLowerCase();
        return (
          /female|samantha|aria|zira|susan|jenny|olivia|danielle/i.test(name) ||
          /en-us|en-gb|en-in|hi-in/i.test(lang)
        );
      }) ?? voices.find((voice) => /en-us|en-gb|en-in/i.test(voice.lang.toLowerCase())) ?? voices[0] ?? null
    );
  }, []);

  useEffect(() => {
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (SR) {
      const rec = new SR();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US';
      rec.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        setIsListening(false);
        void handleSendMessage(text);
      };
      rec.onerror = () => setIsListening(false);
      rec.onend = () => setIsListening(false);
      recognitionRef.current = rec;
    }
    if ('speechSynthesis' in window) {
      synthesisRef.current = window.speechSynthesis;
      const loadVoices = () => { if (window.speechSynthesis.getVoices().length > 0) pickBestVoice(); };
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    return () => {
      recognitionRef.current?.abort();
      synthesisRef.current?.cancel();
      if ('speechSynthesis' in window) window.speechSynthesis.onvoiceschanged = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickBestVoice]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isLoading]);

  const speakResponse = async (text: string) => {
    if (!text) return;
    try {
      const res = await apiClient.generateAiSpeech(text, voiceProvider, voiceLanguage);
      const voicePayload = (res as any)?.data ?? res;
      if (voicePayload?.source === 'cloud' && voicePayload?.audio_base64) {
        setTtsSource('cloud');
        const audio = new Audio(`data:audio/mpeg;base64,${voicePayload.audio_base64}`);
        audio.onplay = () => setIsSpeaking(true);
        audio.onended = () => setIsSpeaking(false);
        audio.onerror = () => setIsSpeaking(false);
        void audio.play();
        return;
      }
    } catch { /* fall through */ }
    setTtsSource('browser');
    if (!synthesisRef.current || !('speechSynthesis' in window)) return;
    const cleanText = text.replace(/[*#_`]/g, '').trim();
    if (!cleanText) return;
    synthesisRef.current.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    const preferred = pickBestVoice();
    if (preferred) { utterance.voice = preferred; utterance.lang = preferred.lang || voiceLanguage; }
    else utterance.lang = voiceLanguage;
    utterance.rate = voiceSpeed;
    utterance.pitch = 1.15;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    synthesisRef.current.speak(utterance);
  };

  const handleSendMessage = async (textToSend: string = inputText) => {
    if (!textToSend.trim()) return;
    const userMessage: ChatMessage = { id: Date.now().toString(), sender: 'user', text: textToSend };
    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);
    try {
      const history = messages.map((m) => ({ role: m.sender === 'user' ? 'user' : 'assistant', text: m.text }));
      const res = await apiClient.geminiChat(textToSend, history);
      const aiResponse = (res as any)?.response || (res as any)?.data?.response || 'I processed your request.';
      const geminiMessage: ChatMessage = { id: (Date.now() + 1).toString(), sender: 'gemini', text: aiResponse };
      setMessages((prev) => [...prev, geminiMessage]);
      await speakResponse(aiResponse);
    } catch {
      setMessages((prev) => [...prev, { id: (Date.now() + 1).toString(), sender: 'gemini', text: 'Sorry, I could not connect to the AI service. Please try again.' }]);
    } finally { setIsLoading(false); }
  };

  const toggleVoice = () => {
    if (!recognitionRef.current) { window.alert('Voice recognition is not supported in your browser.'); return; }
    if (isListening) { recognitionRef.current.stop(); setIsListening(false); }
    else {
      synthesisRef.current?.cancel();
      setIsSpeaking(false);
      try { recognitionRef.current.start(); setIsListening(true); } catch { setIsListening(false); }
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-5 py-3 text-white shadow-xl shadow-indigo-500/30 transition-all hover:-translate-y-1 hover:shadow-indigo-500/50"
      >
        <FiCpu size={20} />
        <span className="font-medium">Ask Gemini</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex h-[80vh] w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-[600px] sm:max-w-md sm:rounded-2xl">
            <div className="flex items-center justify-between bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-4">
              <div className="flex items-center gap-2 text-white">
                <FiCpu className="text-violet-200" size={24} />
                <div>
                  <h3 className="text-lg font-bold leading-tight">Gemini Workspace</h3>
                  <p className="text-xs text-violet-200">Powered by Google AI</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-white">
                <select value={voiceProvider} onChange={(e) => setVoiceProvider(e.target.value as 'browser' | 'cloud')} className="rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-[10px] text-white outline-none">
                  <option value="cloud" className="text-slate-800">Premium voice</option>
                  <option value="browser" className="text-slate-800">Browser voice</option>
                </select>
                <select value={voiceLanguage} onChange={(e) => setVoiceLanguage(e.target.value as 'en-US' | 'hi-IN')} className="rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-[10px] text-white outline-none">
                  <option value="en-US" className="text-slate-800">English</option>
                  <option value="hi-IN" className="text-slate-800">Hindi</option>
                </select>
              </div>
              <button onClick={() => { setIsOpen(false); synthesisRef.current?.cancel(); }} className="rounded-full p-2 text-white transition-colors hover:bg-white/20">
                <FiX size={20} />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-2 pb-2">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setShowVoiceSettings((p) => !p)} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-medium text-slate-700 hover:bg-slate-100">Voice settings</button>
                  <button type="button" onClick={() => void speakResponse('Hello! This is a preview of my voice.')} className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[10px] font-medium text-violet-700 hover:bg-violet-100">Preview voice</button>
                </div>
                <span className="text-[10px] uppercase tracking-[0.16em] text-slate-400">{ttsSource === 'cloud' ? 'Premium' : 'Browser'}</span>
              </div>

              {showVoiceSettings && (
                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="mb-2 flex items-center justify-between text-[11px] text-slate-600">
                    <span>Voice speed</span>
                    <span>{voiceSpeed.toFixed(2)}x</span>
                  </div>
                  <input type="range" min="0.75" max="1.4" step="0.05" value={voiceSpeed} onChange={(e) => setVoiceSpeed(Number(e.target.value))} className="w-full accent-violet-600" />
                </div>
              )}

              {messages.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center space-y-3 text-slate-400">
                  <FiMessageSquare size={40} className="opacity-20" />
                  <p className="text-sm">Ask about your metrics, customers, or trends.</p>
                </div>
              )}

              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm shadow-sm ${msg.sender === 'user' ? 'rounded-tr-sm bg-violet-600 text-white' : 'rounded-tl-sm border border-slate-100 bg-white text-slate-700'}`}>
                    {msg.text}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-slate-100 bg-white px-4 py-3 shadow-sm">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400" style={{ animationDelay: '0.15s' }} />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400" style={{ animationDelay: '0.3s' }} />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="flex items-center gap-2 border-t border-slate-100 bg-white p-3">
              <button onClick={toggleVoice} className={`shrink-0 rounded-full p-3 transition-colors ${isListening ? 'animate-pulse bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {isListening ? <FiMic size={20} /> : <FiMicOff size={20} />}
              </button>
              <input type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void handleSendMessage()} placeholder={isListening ? 'Listening...' : 'Ask Gemini anything...'} className="flex-1 rounded-full bg-slate-100 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-500/50" />
              <button onClick={() => void handleSendMessage()} disabled={!inputText.trim() || isLoading} className="shrink-0 rounded-full bg-violet-600 p-3 text-white transition-colors hover:bg-violet-700 disabled:opacity-50">
                <FiSend size={18} className="translate-x-[1px]" />
              </button>
            </div>

            <div className="flex gap-2 overflow-x-auto bg-white px-4 pb-3 text-xs whitespace-nowrap">
              {[
                { l: 'Summarize revenue', p: "Summarize today's revenue." },
                { l: 'Check inventory', p: 'Which products have low stock?' },
                { l: 'Top customers', p: 'Who are our top customers?' },
              ].map((q) => (
                <button key={q.l} onClick={() => void handleSendMessage(q.p)} className="rounded-full border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50">
                  {q.l}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
});
GeminiAIAssistant.displayName = 'GeminiAIAssistant';

/* ────────────────────────────────────────────────────────────────── */
/* Score gauge component                                              */
/* ────────────────────────────────────────────────────────────────── */

const ScoreGauge = ({ name, score, detail, fill }: { name: string; score: number; detail: string; fill: string; }) => {
  const r = 34;
  const c = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, score)) / 100) * c;
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <svg width="88" height="88" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        <circle cx="44" cy="44" r={r} fill="none" stroke={fill} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${dash} ${c}`} transform="rotate(-90 44 44)" />
        <text x="44" y="48" textAnchor="middle" className="fill-slate-900" style={{ fontSize: 20, fontWeight: 700 }}>{score}</text>
      </svg>
      <p className="text-xs font-semibold text-slate-700">{name}</p>
      <p className="text-[10px] text-slate-500">{detail}</p>
    </div>
  );
};

/* ────────────────────────────────────────────────────────────────── */
/* Main                                                               */
/* ────────────────────────────────────────────────────────────────── */

export function DashboardPage() {
  const { showError: _showError } = useNotification();
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [geoData, setGeoData] = useState<any>(null);
  const [geoLoading, setGeoLoading] = useState(true);

  /* -------------------- Filters -------------------- */
  const [dateRange, setDateRange] = useState<DateRangeKey>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [compareMode, setCompareMode] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  /* -------------------- Sales Target -------------------- */
  const [salesTarget, setSalesTarget] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('dashboard_sales_target');
      const parsed = saved ? parseFloat(saved) : NaN;
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    } catch { return 0; }
  });
  const [targetInput, setTargetInput] = useState('');
  const [targetError, setTargetError] = useState<string | null>(null);

  /* -------------------- Custom range validation -------------------- */
  const [dateError, setDateError] = useState<string | null>(null);

  const resolvedRange = useMemo(
    () => resolveRange(dateRange, customFrom, customTo),
    [dateRange, customFrom, customTo],
  );
  const previousPeriod = useMemo(() => previousRange(resolvedRange), [resolvedRange]);

  /* -------------------- Geo -------------------- */
  useEffect(() => {
    fetch('/data/bihar-districts.json')
      .then((res) => { if (!res.ok) throw new Error('Failed to load map data'); return res.json(); })
      .then((data) => { setGeoData(data); setGeoLoading(false); })
      .catch(() => setGeoLoading(false));
  }, []);

  /* -------------------- Fetchers -------------------- */

  const fetchList = useCallback(async (fn: () => Promise<unknown>): Promise<any[]> => {
    const res = await fn();
    return extractRows(res);
  }, []);

  const fetchInvoices = useCallback(async () => {
    const rows = await fetchList(() => apiClient.getInvoices());
    // Strict shape guard: reject anything that isn't a sales invoice
    const onlyInvoices = rows.filter(isLikelySalesInvoice);
    if (DEV && rows.length !== onlyInvoices.length) {
      // eslint-disable-next-line no-console
      console.warn(`[Dashboard] Invoices: rejected ${rows.length - onlyInvoices.length} non-invoice rows`);
    }
    return onlyInvoices;
  }, [fetchList]);

  const fetchOrders = useCallback(() => fetchList(() => apiClient.getOrders()), [fetchList]);
  const fetchCustomers = useCallback(() => fetchList(() => apiClient.getCustomers()), [fetchList]);
  const fetchEmployees = useCallback(() => fetchList(() => apiClient.getEmployees()), [fetchList]);

  /**
   * Purchase fetcher — tries the CORRECT endpoints first, then applies a
   * strict shape guard. Prevents sales invoices from leaking into
   * "Total Purchases".
   */
  const fetchPurchases = useCallback(async () => {
    const client: any = apiClient;

    // 1) Prefer the dedicated purchase-invoice resource endpoint.
    const candidates = [
      'getPurchaseInvoices',
      'getPurchaseInvoice',
    ];
    for (const name of candidates) {
      if (typeof client[name] === 'function') {
        try {
          const rows = await fetchList(() => client[name]());
          const onlyBills = rows.filter(isLikelyPurchaseBill);
          if (DEV && rows.length !== onlyBills.length) {
            // eslint-disable-next-line no-console
            console.warn(`[Dashboard] Purchases via ${name}: rejected ${rows.length - onlyBills.length} non-bill rows`);
          }
          return onlyBills;
        } catch { /* try next */ }
      }
    }

    // 2) Fallback: /purchases/bills via SalesController (still gated).
    try {
      const rows = await fetchList(() => apiClient.getPurchaseBills());
      const onlyBills = rows.filter(isLikelyPurchaseBill);
      if (DEV && rows.length !== onlyBills.length) {
        // eslint-disable-next-line no-console
        console.warn(`[Dashboard] Purchases via getPurchaseBills: rejected ${rows.length - onlyBills.length} non-bill rows`, rows.slice(0, 3));
      }
      return onlyBills;
    } catch {
      return [];
    }
  }, [fetchList]);

  const fetchPaymentsList = useCallback(async () => {
    const client: any = apiClient;
    const candidates = ['getPayments', 'getAllPayments', 'listPayments'];
    for (const name of candidates) {
      if (typeof client[name] === 'function') {
        try { return await fetchList(() => client[name]()); } catch { /* try next */ }
      }
    }
    return [];
  }, [fetchList]);

  const fetchCompanies = useCallback(() => apiClient.getCompanies(), []);
  const fetchProducts = useCallback(() => apiClient.getProducts(), []);
  const fetchBranches = useCallback(() => apiClient.getBranches(), []);
  const fetchProfitSummary = useCallback(() => apiClient.getProfitSummary(), []);
  const fetchPaymentSummary = useCallback(() => apiClient.getPaymentSummary(), []);
  const fetchInventorySummary = useCallback(() => apiClient.getInventorySummary(), []);
  const fetchLowStockProducts = useCallback(() => apiClient.getLowStockProducts(), []);
  const fetchPurchaseDueInvoices = useCallback(() => apiClient.getPurchaseDueInvoices(), []);
  const fetchBiharDistrictSales = useCallback(() => apiClient.getDistrictSales('Bihar'), []);

  /* -------------------- Hooks -------------------- */
  const { data: companies, loading: compsLoading, refresh: refreshComps } = useApiCache<any[]>('companies', fetchCompanies);
  const { data: customers, loading: custsLoading, refresh: refreshCusts } = useApiCache<any[]>('customers', fetchCustomers);
  const { data: products, loading: prodsLoading, refresh: refreshProds } = useApiCache<any[]>('products', fetchProducts);
  const { data: orders, loading: ordsLoading, refresh: refreshOrds } = useApiCache<any[]>('orders', fetchOrders);
  const { data: invoices, loading: invsLoading, refresh: refreshInvs } = useApiCache<any[]>('invoices', fetchInvoices);
  const { data: employees, loading: empsLoading, refresh: refreshEmps } = useApiCache<any[]>('employees', fetchEmployees);
  const { data: purchases, loading: purLoading, refresh: refreshPurchases } = useApiCache<any[]>('purchases', fetchPurchases);
  const { data: rawPayments, refresh: refreshPaymentsList } = useApiCache<any[]>('paymentsList', fetchPaymentsList);
  const { data: branches, refresh: refreshBranches } = useApiCache<any[]>('branches', fetchBranches);
  const { data: profitData, error: profitError, refresh: refreshProfit } = useApiCache<any>('profitSummary', fetchProfitSummary);
  const { data: paymentSummary, loading: payLoading, refresh: refreshPay } = useApiCache<PaymentSummary>('paymentSummary', fetchPaymentSummary);
  const { data: inventory, refresh: refreshInv } = useApiCache<InventorySummary>('inventorySummary', fetchInventorySummary);
  const { data: lowStock, refresh: refreshLowStock } = useApiCache<LowStockProduct[]>('lowStockProducts', fetchLowStockProducts);
  const { data: purchaseDue, loading: purDueLoading, refresh: refreshPurDue } = useApiCache<any[]>('purchaseDue', fetchPurchaseDueInvoices);
  const { data: biharDistrictSales, error: biharDistrictError, refresh: refreshBiharDistrict } = useApiCache<any[]>('biharDistrictSales', fetchBiharDistrictSales);

  const isLoading =
    compsLoading || custsLoading || prodsLoading || ordsLoading ||
    invsLoading || empsLoading || purLoading;

  /* ══════════════════════════════════════════════════════════════════ */
  /* Filtered lists                                                     */
  /* ══════════════════════════════════════════════════════════════════ */

  const filteredCustomers = useMemo(
    () =>
      applyCompanyBranch(dedupeById(customers || []), companyFilter, branchFilter)
        .filter(isNotDeleted),
    [customers, companyFilter, branchFilter],
  );

  const filteredOrders = useMemo(() => {
    const deduped = dedupeById(orders || []);
    const cb = applyCompanyBranch(deduped, companyFilter, branchFilter);
    return cb
      .filter(isNotDeleted)
      .filter((r) => withinRangeUsing(getOrderDateField(r), resolvedRange));
  }, [orders, companyFilter, branchFilter, resolvedRange]);

  const filteredInvoices = useMemo(() => {
    const deduped = dedupeById(invoices || []);
    const cb = applyCompanyBranch(deduped, companyFilter, branchFilter);
    return cb
      .filter(isNotDeleted)
      .filter((r) => withinRangeUsing(getInvoiceDateField(r), resolvedRange));
  }, [invoices, companyFilter, branchFilter, resolvedRange]);

  const filteredPurchases = useMemo(() => {
    const deduped = dedupeBills(purchases || []);
    const cb = applyCompanyBranch(deduped, companyFilter, branchFilter);
    return cb
      .filter(isNotDeleted)
      .filter(isLikelyPurchaseBill)   // ← re-check after any transformations
      .filter((r) => withinRangeUsing(getPurchaseDateField(r), resolvedRange));
  }, [purchases, companyFilter, branchFilter, resolvedRange]);

  const filteredEmployees = useMemo(
    () =>
      applyCompanyBranch(dedupeById(employees || []), companyFilter, branchFilter)
        .filter(isNotDeleted),
    [employees, companyFilter, branchFilter],
  );

  const filteredPayments = useMemo(() => {
    const deduped = dedupeById(rawPayments || []);
    const cb = applyCompanyBranch(deduped, companyFilter, branchFilter);
    return cb
      .filter(isNotDeleted)
      .filter((r) => withinRangeUsing(getPaymentDateField(r), resolvedRange));
  }, [rawPayments, companyFilter, branchFilter, resolvedRange]);

  /* -------------------- Previous-period -------------------- */
  const prevOrders = useMemo(() => {
    const cb = applyCompanyBranch(dedupeById(orders || []), companyFilter, branchFilter);
    return cb
      .filter(isNotDeleted)
      .filter((r) => withinRangeUsing(getOrderDateField(r), previousPeriod));
  }, [orders, companyFilter, branchFilter, previousPeriod]);

  const prevInvoices = useMemo(() => {
    const cb = applyCompanyBranch(dedupeById(invoices || []), companyFilter, branchFilter);
    return cb
      .filter(isNotDeleted)
      .filter((r) => withinRangeUsing(getInvoiceDateField(r), previousPeriod));
  }, [invoices, companyFilter, branchFilter, previousPeriod]);

  const prevPurchases = useMemo(() => {
    const cb = applyCompanyBranch(dedupeBills(purchases || []), companyFilter, branchFilter);
    return cb
      .filter(isNotDeleted)
      .filter(isLikelyPurchaseBill)
      .filter((r) => withinRangeUsing(getPurchaseDateField(r), previousPeriod));
  }, [purchases, companyFilter, branchFilter, previousPeriod]);

  /* -------------------- Revenue / Purchases -------------------- */
  const totalRevenue = useMemo(
    () => filteredInvoices.reduce((s, inv: any) => s + getInvoiceTotal(inv), 0),
    [filteredInvoices],
  );
  const prevTotalRevenue = useMemo(
    () => prevInvoices.reduce((s, inv: any) => s + getInvoiceTotal(inv), 0),
    [prevInvoices],
  );
  const totalPurchases = useMemo(
    () => filteredPurchases.reduce((s, pur: any) => s + getPurchaseTotal(pur), 0),
    [filteredPurchases],
  );
  const prevTotalPurchases = useMemo(
    () => prevPurchases.reduce((s, pur: any) => s + getPurchaseTotal(pur), 0),
    [prevPurchases],
  );

  const revenueDelta = useMemo(() => (compareMode ? pctChange(totalRevenue, prevTotalRevenue) : null), [compareMode, totalRevenue, prevTotalRevenue]);
  const ordersDelta = useMemo(() => (compareMode ? pctChange(filteredOrders.length, prevOrders.length) : null), [compareMode, filteredOrders.length, prevOrders.length]);
  const invoicesDelta = useMemo(() => (compareMode ? pctChange(filteredInvoices.length, prevInvoices.length) : null), [compareMode, filteredInvoices.length, prevInvoices.length]);
  const purchasesDelta = useMemo(() => (compareMode ? pctChange(totalPurchases, prevTotalPurchases) : null), [compareMode, totalPurchases, prevTotalPurchases]);

  /* -------------------- Monthly Sales / Purchases -------------------- */
  const monthlySales = useMemo(() => {
    const map = new Map<string, number>();
    filteredInvoices.forEach((inv: any) => {
      const raw = getInvoiceDateField(inv);
      if (!raw) return;
      const d = parseDateSafe(raw);
      if (!d) return;
      const key = getDateKey(d);
      map.set(key, (map.get(key) || 0) + getInvoiceTotal(inv));
    });

    if (resolvedRange.from || resolvedRange.to) {
      const start = resolvedRange.from ?? new Date();
      const end = resolvedRange.to ?? new Date();
      const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
      const last = new Date(end.getFullYear(), end.getMonth(), 1);
      const rows: { name: string; sales: number }[] = [];
      let guard = 0;
      while (cursor <= last && guard < 240) {
        const y = cursor.getFullYear();
        const m = cursor.getMonth();
        const label = start.getFullYear() === end.getFullYear() ? `${MONTH_LABELS[m]}` : `${MONTH_LABELS[m]} '${String(y).slice(2)}`;
        rows.push({ name: label, sales: map.get(`${y}-${m}`) || 0 });
        cursor.setMonth(cursor.getMonth() + 1);
        guard += 1;
      }
      return rows;
    }
    return Array.from(map.entries())
      .map(([key, sales]) => {
        const [y, m] = key.split('-').map(Number);
        return { sortKey: y * 12 + m, name: `${MONTH_LABELS[m]} '${String(y).slice(2)}`, sales };
      })
      .sort((a, b) => a.sortKey - b.sortKey)
      .map(({ name, sales }) => ({ name, sales }));
  }, [filteredInvoices, resolvedRange]);

  const monthlyPurchases = useMemo(() => {
    const map = new Map<string, number>();
    filteredPurchases.forEach((pur: any) => {
      const raw = getPurchaseDateField(pur);
      if (!raw) return;
      const d = parseDateSafe(raw);
      if (!d) return;
      const key = getDateKey(d);
      map.set(key, (map.get(key) || 0) + getPurchaseTotal(pur));
    });

    if (resolvedRange.from || resolvedRange.to) {
      const start = resolvedRange.from ?? new Date();
      const end = resolvedRange.to ?? new Date();
      const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
      const last = new Date(end.getFullYear(), end.getMonth(), 1);
      const rows: { name: string; purchases: number }[] = [];
      let guard = 0;
      while (cursor <= last && guard < 240) {
        const y = cursor.getFullYear();
        const m = cursor.getMonth();
        const label = start.getFullYear() === end.getFullYear() ? `${MONTH_LABELS[m]}` : `${MONTH_LABELS[m]} '${String(y).slice(2)}`;
        rows.push({ name: label, purchases: map.get(`${y}-${m}`) || 0 });
        cursor.setMonth(cursor.getMonth() + 1);
        guard += 1;
      }
      return rows;
    }
    return Array.from(map.entries())
      .map(([key, purchases]) => {
        const [y, m] = key.split('-').map(Number);
        return { sortKey: y * 12 + m, name: `${MONTH_LABELS[m]} '${String(y).slice(2)}`, purchases };
      })
      .sort((a, b) => a.sortKey - b.sortKey)
      .map(({ name, purchases }) => ({ name, purchases }));
  }, [filteredPurchases, resolvedRange]);

  const salesPurchaseTrend = useMemo(() => {
    const sMap = new Map<string, number>();
    const pMap = new Map<string, number>();
    filteredInvoices.forEach((inv: any) => {
      const raw = getInvoiceDateField(inv);
      if (!raw) return;
      const d = parseDateSafe(raw);
      if (!d) return;
      const k = getDateKey(d);
      sMap.set(k, (sMap.get(k) || 0) + getInvoiceTotal(inv));
    });
    filteredPurchases.forEach((pur: any) => {
      const raw = getPurchaseDateField(pur);
      if (!raw) return;
      const d = parseDateSafe(raw);
      if (!d) return;
      const k = getDateKey(d);
      pMap.set(k, (pMap.get(k) || 0) + getPurchaseTotal(pur));
    });
    const keys = Array.from(new Set([...sMap.keys(), ...pMap.keys()])).sort((a, b) => {
      const [ay, am] = a.split('-').map(Number);
      const [by, bm] = b.split('-').map(Number);
      return ay * 12 + am - (by * 12 + bm);
    });
    return keys.map((k) => {
      const [y, m] = k.split('-').map(Number);
      return {
        month: `${MONTH_LABELS[m]} '${String(y).slice(2)}`,
        Sales: sMap.get(k) || 0,
        Purchase: pMap.get(k) || 0,
      };
    });
  }, [filteredInvoices, filteredPurchases]);

  /* -------------------- Order Pipeline -------------------- */
  const radialPipeline = useMemo(() => {
    const map = new Map<string, number>();
    filteredOrders.forEach((o: any) => {
      const st = normalizeStatus(o.status);
      map.set(st, (map.get(st) || 0) + 1);
    });
    const total = filteredOrders.length || 1;
    const palette = ['#10B981', '#8B5CF6', '#3B82F6', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#F97316'];
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count], i) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value: Math.round((count / total) * 100),
        fill: palette[i % palette.length],
        raw: count,
      }));
  }, [filteredOrders]);

  const orderStatusDist = useMemo(() => {
    const map = new Map<string, number>();
    filteredOrders.forEach((o: any) => {
      const s = normalizeStatus(o.status);
      map.set(s, (map.get(s) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
    }));
  }, [filteredOrders]);

  /* -------------------- Employee Status -------------------- */
  const employeeStatusBuckets = useMemo(() => {
    let active = 0, onLeave = 0, inactive = 0, other = 0;
    filteredEmployees.forEach((e: any) => {
      const s = String(e.status ?? '').toLowerCase().trim();
      if (!s) { other++; return; }
      if (EMPLOYEE_ACTIVE_RE.test(s)) active++;
      else if (EMPLOYEE_LEAVE_RE.test(s)) onLeave++;
      else if (/inactive|terminated|resigned|disabled|suspended|left|quit/i.test(s)) inactive++;
      else other++;
    });
    return { active, onLeave, inactive, other, total: filteredEmployees.length };
  }, [filteredEmployees]);

  const activeInactive = useMemo(() => [
    { name: 'Active', value: employeeStatusBuckets.active, fill: '#10B981' },
    { name: 'On Leave', value: employeeStatusBuckets.onLeave, fill: '#F59E0B' },
    { name: 'Inactive', value: employeeStatusBuckets.inactive, fill: '#EF4444' },
    ...(employeeStatusBuckets.other > 0
      ? [{ name: 'Other', value: employeeStatusBuckets.other, fill: '#94A3B8' }]
      : []),
  ], [employeeStatusBuckets]);

  /* ────────────────────────────────────────────────────────────────── */
  /* PAYMENT BREAKDOWN                                                  */
  /* ────────────────────────────────────────────────────────────────── */
  const paymentBreakdown = useMemo<PaymentSummary>(() => {
    const inward: PaymentBreakdown = { total: 0, online: 0, cash: 0 };
    const outward: PaymentBreakdown = { total: 0, online: 0, cash: 0 };

    if (filteredPayments.length > 0) {
      filteredPayments.forEach((p: any) => {
        const dir = classifyPaymentDirection(p);
        if (dir === 'unknown') return;
        const method = classifyPaymentMethod(p);
        const amt = Math.abs(pickNum(p, ['amount', 'total', 'paid_amount', 'payment_amount']));
        const bucket = dir === 'outward' ? outward : inward;
        bucket.total += amt;
        if (method === 'cash') bucket.cash += amt;
        else bucket.online += amt;
      });
    }

    if (filteredPayments.length === 0 && paymentSummary) {
      const inSum = paymentSummary.inward;
      const outSum = paymentSummary.outward;
      if (inSum) {
        inward.total = pickNum(inSum as any, ['total', 'amount'], 0);
        inward.online = pickNum(inSum as any, ['online', 'online_amount', 'digital'], 0);
        inward.cash = pickNum(inSum as any, ['cash', 'cash_amount'], 0);
      }
      if (outSum) {
        outward.total = pickNum(outSum as any, ['total', 'amount'], 0);
        outward.online = pickNum(outSum as any, ['online', 'online_amount', 'digital'], 0);
        outward.cash = pickNum(outSum as any, ['cash', 'cash_amount'], 0);
      }
    }

    if (inward.total === 0 && filteredInvoices.length > 0) {
      filteredInvoices.forEach((inv: any) => {
        const paid = getPaidAmount(inv);
        if (paid > 0) inward.total += paid;
      });
    }
    if (outward.total === 0 && filteredPurchases.length > 0) {
      filteredPurchases.forEach((pur: any) => {
        const paid = getPaidAmount(pur);
        if (paid > 0) outward.total += paid;
      });
    }

    return { inward, outward };
  }, [filteredPayments, paymentSummary, filteredInvoices, filteredPurchases]);

  const paymentChartData = useMemo(
    () => [
      { name: 'Inward', Online: paymentBreakdown.inward.online, Cash: paymentBreakdown.inward.cash },
      { name: 'Outward', Online: paymentBreakdown.outward.online, Cash: paymentBreakdown.outward.cash },
    ],
    [paymentBreakdown],
  );

  /* -------------------- Inventory Summary -------------------- */
  const inventorySummary = useMemo<InventorySummary>(() => {
    const list = applyCompanyBranch(products, companyFilter, branchFilter) as any[];
    const usingFilter = companyFilter !== 'all' || branchFilter !== 'all';
    if (!usingFilter && inventory) return inventory;

    if (list.length === 0) {
      return { totalProducts: 0, totalQuantity: 0, inStock: 0, lowStock: 0, zeroStock: 0, negativeStock: 0 };
    }

    let totalQuantity = 0, inStock = 0, lowStockCount = 0, zeroStock = 0, negativeStock = 0;
    list.forEach((p) => {
      const qty = pickNum(p, ['qty', 'quantity', 'stock', 'current_stock', 'stock_quantity']);
      const threshold = pickNum(p, ['low_stock_threshold', 'reorder_level', 'min_stock', 'min_qty', 'alert_quantity'], 0);
      totalQuantity += qty;
      if (qty < 0) negativeStock++;
      else if (qty === 0) zeroStock++;
      else if (threshold > 0 && qty <= threshold) lowStockCount++;
      else if (threshold === 0 && qty <= 5) lowStockCount++;
      else inStock++;
    });
    return {
      totalProducts: list.length,
      totalQuantity,
      inStock, lowStock: lowStockCount, zeroStock, negativeStock,
    };
  }, [products, companyFilter, branchFilter, inventory]);

  /* -------------------- Top Customers -------------------- */
  const topCustomersComputed = useMemo<TopCustomer[]>(() => {
    const map = new Map<string, number>();
    filteredInvoices.forEach((inv: any) => {
      const name = extractCustomerName(inv);
      if (!name) return;   // skip records without a name — no fake "Unknown"
      const amt = getInvoiceTotal(inv);
      map.set(name, (map.get(name) || 0) + amt);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, amount]) => ({ name, amount }));
  }, [filteredInvoices]);

  /* -------------------- Top Vendors -------------------- */
  const topVendorsComputed = useMemo<TopVendor[]>(() => {
    const map = new Map<string, number>();
    filteredPurchases.forEach((pur: any) => {
      const name = extractVendorName(pur);
      if (!name) return;   // skip unknown vendors — no fake "Unknown"
      const amt = getPurchaseTotal(pur);
      map.set(name, (map.get(name) || 0) + amt);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, amount]) => ({ name, amount }));
  }, [filteredPurchases]);

  /* -------------------- Purchase Outstanding -------------------- */
  const purchaseOutstandingRows = useMemo(() => {
    const fromApi = (purchaseDue || []).map((inv: any) => ({
      invoice: pickStr(inv, ['invoice_no', 'bill_no', 'invoice_number', 'number', 'reference_no'], '—'),
      company: pickStr(inv, ['company_name', 'company', 'vendor_company'], '—'),
      name: extractVendorName(inv) || '—',
      dueDate: pickStr(inv, ['due_date', 'payment_due_date', 'due_on'], ''),
      remaining: pickNum(inv, ['remaining_payment', 'remaining_amount', 'due_amount', 'balance', 'amount_due', 'pending_amount']),
      companyId: inv?.company_id,
      branchId: inv?.branch_id,
    }));

    if (fromApi.length > 0) {
      return fromApi.filter((r) => {
        if (companyFilter !== 'all' && String(r.companyId) !== String(companyFilter)) return false;
        if (branchFilter !== 'all' && String(r.branchId) !== String(branchFilter)) return false;
        return r.remaining > 0;
      });
    }

    return filteredPurchases
      .map((p: any) => {
        const total = getPurchaseTotal(p);
        const paid = getPaidAmount(p);
        const remaining = Math.max(0, total - paid);
        return {
          invoice: pickStr(p, ['invoice_no', 'bill_no', 'invoice_number', 'number'], '—'),
          company: pickStr(p, ['company_name', 'company'], '—'),
          name: extractVendorName(p) || '—',
          dueDate: pickStr(p, ['due_date', 'payment_due_date'], ''),
          remaining,
          companyId: p?.company_id,
          branchId: p?.branch_id,
        };
      })
      .filter((r) => r.remaining > 0);
  }, [purchaseDue, filteredPurchases, companyFilter, branchFilter]);

  const totalOutstanding = useMemo(
    () => purchaseOutstandingRows.reduce((s, r) => s + r.remaining, 0),
    [purchaseOutstandingRows],
  );

  /* -------------------- Net Profit -------------------- */
  const monthlyProfit = useMemo(() => {
    const raw =
      profitData?.monthly_profit || profitData?.monthlyProfit || profitData?.monthly ||
      profitData?.trend || profitData?.data?.monthly_profit || profitData?.data?.monthly;
    if (Array.isArray(raw)) {
      return raw.map((r: any) => ({
        month: pickStr(r, ['month', 'label', 'name'], ''),
        profit: pickNum(r, ['profit', 'net_profit', 'netProfit', 'value', 'amount']),
      }));
    }
    return [];
  }, [profitData]);

  const totalProfit = useMemo(() => {
    if (profitData?.total_profit != null) return Number(profitData.total_profit) || 0;
    if (profitData?.totalProfit != null) return Number(profitData.totalProfit) || 0;
    return monthlyProfit.reduce((s, m) => s + m.profit, 0);
  }, [profitData, monthlyProfit]);

  /* -------------------- Sales Target -------------------- */
  const targetProgress = useMemo(() => {
    if (!salesTarget || salesTarget <= 0) {
      return { pct: 0, remaining: 0, achieved: false, hasTarget: false };
    }
    const achieved = totalRevenue >= salesTarget;
    const pct = Math.min(100, (totalRevenue / salesTarget) * 100);
    const remaining = Math.max(0, salesTarget - totalRevenue);
    return { pct, remaining, achieved, hasTarget: true };
  }, [salesTarget, totalRevenue]);

  const handleSaveTarget = () => {
    setTargetError(null);
    const trimmed = targetInput.trim();
    if (!trimmed) { setTargetError('Please enter a target amount.'); return; }
    const num = Number(trimmed);
    if (!Number.isFinite(num)) { setTargetError('Enter a valid number.'); return; }
    if (num <= 0) { setTargetError('Target must be greater than 0.'); return; }
    if (num > 1_000_000_000_000) { setTargetError('Target is too large (max ₹1 trillion).'); return; }
    setSalesTarget(num);
    try { localStorage.setItem('dashboard_sales_target', String(num)); } catch { /* ignore */ }
    setTargetInput('');
  };

  const handleClearTarget = () => {
    setSalesTarget(0);
    setTargetInput('');
    setTargetError(null);
    try { localStorage.removeItem('dashboard_sales_target'); } catch { /* ignore */ }
  };

  /* -------------------- Custom date range validation -------------------- */
  useEffect(() => {
    if (dateRange !== 'custom') { setDateError(null); return; }
    if (customFrom && customTo) {
      const f = new Date(customFrom);
      const t = new Date(customTo);
      if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime())) {
        setDateError('Invalid date.');
      } else if (f > t) {
        setDateError('"From" date must be before or equal to "To" date.');
      } else {
        setDateError(null);
      }
    } else {
      setDateError(null);
    }
  }, [dateRange, customFrom, customTo]);

  /* -------------------- Business Score -------------------- */
  const businessScore = useMemo(() => {
    const factors: { name: string; score: number; detail: string; fill: string }[] = [];

    let revScore = 60;
    if (prevTotalRevenue > 0) {
      const growth = (totalRevenue - prevTotalRevenue) / prevTotalRevenue;
      revScore = Math.max(0, Math.min(100, 50 + growth * 100));
    } else if (totalRevenue > 0) revScore = 80;
    factors.push({ name: 'Revenue', score: Math.round(revScore), detail: compactNumber(totalRevenue), fill: '#10B981' });

    const totalOrds = filteredOrders.length;
    const delivered = filteredOrders.filter((o: any) => /deliver|complete/i.test(String(o.status || ''))).length;
    factors.push({
      name: 'Fulfillment',
      score: totalOrds > 0 ? Math.round((delivered / totalOrds) * 100) : 0,
      detail: `${delivered}/${totalOrds}`,
      fill: '#3B82F6',
    });

    const totalInvs = filteredInvoices.length;
    const paidInvs = filteredInvoices.filter((i: any) => /paid|settled|complete/i.test(String(i.status || ''))).length;
    factors.push({
      name: 'Collection',
      score: totalInvs > 0 ? Math.round((paidInvs / totalInvs) * 100) : 0,
      detail: `${paidInvs}/${totalInvs}`,
      fill: '#8B5CF6',
    });

    const invTotal = inventorySummary.totalProducts || 0;
    const invHealthy = inventorySummary.inStock || 0;
    factors.push({
      name: 'Inventory',
      score: invTotal > 0 ? Math.round((invHealthy / invTotal) * 100) : 0,
      detail: `${invHealthy}/${invTotal}`,
      fill: '#F59E0B',
    });

    const custCount = filteredCustomers.length;
    factors.push({
      name: 'Customers',
      score: custCount > 0 ? Math.min(100, Math.round(Math.log10(custCount + 1) * 45)) : 0,
      detail: String(custCount),
      fill: '#06B6D4',
    });

    const overall = Math.round(factors.reduce((s, f) => s + f.score, 0) / Math.max(1, factors.length));
    return { overall, factors };
  }, [totalRevenue, prevTotalRevenue, filteredOrders, filteredInvoices, inventorySummary, filteredCustomers]);

  const scoreLabel = (s: number): { label: string; tone: string } => {
    if (s >= 85) return { label: 'Excellent', tone: 'text-emerald-600' };
    if (s >= 70) return { label: 'Healthy', tone: 'text-teal-600' };
    if (s >= 55) return { label: 'Stable', tone: 'text-amber-600' };
    if (s >= 40) return { label: 'At Risk', tone: 'text-orange-600' };
    return { label: 'Critical', tone: 'text-rose-600' };
  };
  const overallLabel = scoreLabel(businessScore.overall);

  /* -------------------- Global filter helpers -------------------- */
  const filterBranchesGlobal = useMemo(() => {
    if (!branches) return [];
    if (companyFilter === 'all') return branches;
    return branches.filter((b) => b.company_id === parseInt(companyFilter));
  }, [branches, companyFilter]);

  const activeFilterChips = useMemo(() => {
    const chips: { label: string; clear: () => void }[] = [];
    if (companyFilter !== 'all') {
      const name = companies?.find((c) => String(c.id) === companyFilter)?.name || 'Company';
      chips.push({ label: `Company: ${name}`, clear: () => setCompanyFilter('all') });
    }
    if (branchFilter !== 'all') {
      const name = filterBranchesGlobal.find((b) => String(b.id) === branchFilter)?.name || 'Branch';
      chips.push({ label: `Branch: ${name}`, clear: () => setBranchFilter('all') });
    }
    if (dateRange !== '30d') {
      const label = DATE_RANGE_OPTIONS.find((o) => o.value === dateRange)?.label || 'Date';
      chips.push({
        label: `${label}${dateRange === 'custom' && customFrom && customTo ? ` (${customFrom} → ${customTo})` : ''}`,
        clear: () => { setDateRange('30d'); setCustomFrom(''); setCustomTo(''); },
      });
    }
    return chips;
  }, [companyFilter, branchFilter, dateRange, customFrom, customTo, companies, filterBranchesGlobal]);

  const clearAllFilters = () => {
    setCompanyFilter('all'); setBranchFilter('all');
    setDateRange('30d'); setCustomFrom(''); setCustomTo('');
    setCompareMode(false);
  };

  /* -------------------- Refresh -------------------- */
  const refreshAll = async () => {
    await Promise.all([
      refreshComps(), refreshCusts(), refreshProds(), refreshOrds(), refreshInvs(), refreshEmps(),
      refreshPurchases(), refreshBranches(), refreshPay(), refreshPaymentsList(), refreshInv(),
      refreshLowStock(), refreshPurDue(), refreshBiharDistrict(), refreshProfit(),
    ]);
    setLastUpdated(new Date());
  };

  useEffect(() => { if (!isLoading) setLastUpdated(new Date()); }, [isLoading]);

  /* Debug log — shows you the raw purchases shape in dev */
  useEffect(() => {
    if (!DEV) return;
    // eslint-disable-next-line no-console
    console.log('[Dashboard Debug]', {
      purchasesRaw: purchases?.length ?? 0,
      purchasesAfterFilter: filteredPurchases.length,
      invoicesRaw: invoices?.length ?? 0,
      invoicesAfterFilter: filteredInvoices.length,
      ordersRaw: orders?.length ?? 0,
      samplePurchase: purchases?.[0],
      sampleInvoice: invoices?.[0],
      totalPurchases,
      totalRevenue,
    });
  }, [purchases, filteredPurchases, invoices, filteredInvoices, orders, totalPurchases, totalRevenue]);

  const getMapColor = (sales: number, maxSales: number) => {
    if (!maxSales) return '#CBD5E1';
    const intensity = sales / maxSales;
    return `hsl(210, 70%, ${90 - 60 * intensity}%)`;
  };

  const showMap = !biharDistrictError && geoData && !geoLoading;

  /* -------------------- Render -------------------- */
  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 text-slate-800 md:p-7">
      {/* Hero */}
      <div className="relative mb-6 overflow-hidden rounded-3xl border border-slate-800/10 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-5 py-6 shadow-[0_20px_40px_-20px_rgba(15,23,42,0.45)] sm:px-7 md:px-8 md:py-7">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />

        <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200 backdrop-blur">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              Executive Dashboard
            </div>
            <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-white md:text-3xl">
              <FiBarChart2 className="text-cyan-300" /> Workspace
            </h1>
            <p className="mt-1 text-sm text-slate-300">Live business metrics across companies and branches</p>
            {lastUpdated && <p className="mt-1 text-[11px] text-slate-400">Last updated: {lastUpdated.toLocaleString('en-IN')}</p>}
          </div>
          <button
            onClick={refreshAll}
            disabled={isLoading}
            className="self-start rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/15 backdrop-blur transition hover:bg-white/20 disabled:opacity-60 sm:self-auto"
          >
            <FiRefreshCw className={isLoading ? 'mr-1 inline animate-spin' : 'mr-1 inline'} size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Advanced Filters */}
      <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <button
          onClick={() => setFiltersOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50/60 sm:px-5"
        >
          <div className="flex items-center gap-3">
            <div className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-500 text-white shadow-md shadow-indigo-500/20">
              <FiFilter size={15} />
              {activeFilterChips.length > 0 && (
                <span className="absolute -right-1 -top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white ring-2 ring-white">
                  {activeFilterChips.length}
                </span>
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Advanced Filters</p>
              <p className="text-[11px] text-slate-500">
                {activeFilterChips.length > 0
                  ? `${activeFilterChips.length} active filter${activeFilterChips.length > 1 ? 's' : ''}`
                  : 'Date range · Company · Branch · Compare'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeFilterChips.length > 0 && (
              <span
                onClick={(e) => { e.stopPropagation(); clearAllFilters(); }}
                className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"
              >
                <FiXCircle size={12} /> Reset
              </span>
            )}
            <div className={`grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-slate-500 transition ${filtersOpen ? 'rotate-180' : ''}`}>
              <FiChevronDown size={14} />
            </div>
          </div>
        </button>

        {filtersOpen && (
          <div className="space-y-4 border-t border-slate-100 p-4 sm:p-5">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Date Range</p>
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
                {DATE_RANGE_OPTIONS.filter((o) => o.value !== 'custom').map((o) => {
                  const active = dateRange === o.value;
                  return (
                    <button
                      key={o.value}
                      onClick={() => { setDateRange(o.value); setCustomFrom(''); setCustomTo(''); }}
                      className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${active
                        ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-500/20'
                        : 'border border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50/40 hover:text-indigo-700'}`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Custom Range</p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <FiCalendar className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                      type="date"
                      value={customFrom}
                      onChange={(e) => { setCustomFrom(e.target.value); setDateRange('custom'); }}
                      className={`h-10 w-full rounded-xl border bg-white pl-9 pr-3 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:ring-4 ${dateError ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-500/10' : 'border-slate-200 focus:border-indigo-400 focus:ring-indigo-500/10'}`}
                    />
                  </div>
                  <div className="relative flex-1">
                    <FiCalendar className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                      type="date"
                      value={customTo}
                      min={customFrom || undefined}
                      onChange={(e) => { setCustomTo(e.target.value); setDateRange('custom'); }}
                      className={`h-10 w-full rounded-xl border bg-white pl-9 pr-3 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:ring-4 ${dateError ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-500/10' : 'border-slate-200 focus:border-indigo-400 focus:ring-indigo-500/10'}`}
                    />
                  </div>
                </div>
                {dateError && (
                  <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-rose-600">
                    <FiAlertCircle size={11} /> {dateError}
                  </p>
                )}
              </div>

              <div className="lg:col-span-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Company</p>
                <div className="relative">
                  <select
                    value={companyFilter}
                    onChange={(e) => { setCompanyFilter(e.target.value); setBranchFilter('all'); }}
                    className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                  >
                    <option value="all">All companies</option>
                    {companies?.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                  </select>
                  <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                </div>
              </div>

              <div className="lg:col-span-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Branch</p>
                <div className="relative">
                  <select
                    value={branchFilter}
                    onChange={(e) => setBranchFilter(e.target.value)}
                    disabled={filterBranchesGlobal.length === 0}
                    className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    <option value="all">All branches</option>
                    {filterBranchesGlobal.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
                  </select>
                  <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                </div>
              </div>

              <div className="flex items-end lg:col-span-1">
                <button
                  onClick={() => setCompareMode((v) => !v)}
                  className={`flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border text-xs font-semibold transition ${compareMode ? 'border-indigo-300 bg-gradient-to-r from-indigo-50 to-blue-50 text-indigo-700 shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                  title="Compare with previous period"
                >
                  <FiTrendingUp size={12} />
                  {compareMode ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            {activeFilterChips.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-slate-200 pt-3">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Active:</span>
                {activeFilterChips.map((chip, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-gradient-to-r from-indigo-50 to-blue-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700">
                    {chip.label}
                    <button onClick={chip.clear} className="grid h-4 w-4 place-items-center rounded-full hover:bg-indigo-200">
                      <FiX size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Business Overview */}
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-700">
        <FiActivity className="text-blue-600" /> Business Overview
      </h2>
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {isLoading ? (
          [...Array(7)].map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard icon={FiBox} label="Companies" value={companies?.length || 0} tone="blue" />
            <StatCard icon={FiUsers} label="Customers" value={filteredCustomers.length} tone="emerald" />
            <StatCard icon={FiBarChart2} label="Products" value={products?.length || 0} tone="purple" />
            <StatCard icon={FiShoppingCart} label="Orders" value={filteredOrders.length} tone="amber" delta={ordersDelta} />
            <StatCard icon={FiDollarSign} label="Invoices" value={filteredInvoices.length} tone="rose" delta={invoicesDelta} />
            <StatCard icon={FiTrendingUp} label="Revenue" value={compactNumber(totalRevenue)} tone="teal" hint={resolvedRange.label} delta={revenueDelta} />
            <StatCard icon={FiAward} label="Net Profit" value={compactNumber(totalProfit)} tone="emerald" />
          </>
        )}
      </div>

      {/* Sales Target */}
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-700">
        <FiTarget className="text-indigo-600" /> Sales Target
      </h2>
      <div className="mb-8 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="grid gap-5 p-5 md:grid-cols-3">
          <div>
            <label htmlFor="sales-target-input" className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Target Amount (₹)
            </label>
            <div className="flex gap-2">
              <input
                id="sales-target-input"
                type="text"
                inputMode="decimal"
                value={targetInput}
                onChange={(e) => { setTargetInput(e.target.value); if (targetError) setTargetError(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTarget(); }}
                placeholder={salesTarget > 0 ? `Current: ₹${salesTarget.toLocaleString('en-IN')}` : 'e.g. 5000000'}
                className={`h-10 flex-1 rounded-xl border bg-white px-3 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:ring-4 ${targetError ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-500/10' : 'border-slate-200 focus:border-indigo-400 focus:ring-indigo-500/10'}`}
                aria-invalid={!!targetError}
                aria-describedby={targetError ? 'sales-target-error' : undefined}
              />
              <button
                onClick={handleSaveTarget}
                className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-3 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-700 hover:to-blue-700"
              >
                <FiSave size={13} /> Save
              </button>
            </div>
            {targetError && (
              <p id="sales-target-error" className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-rose-600">
                <FiAlertCircle size={11} /> {targetError}
              </p>
            )}
            {!targetError && salesTarget > 0 && (
              <p className="mt-1.5 text-[11px] text-slate-500">
                Saved target:{' '}
                <span className="font-semibold text-slate-700">₹{salesTarget.toLocaleString('en-IN')}</span>
                <button onClick={handleClearTarget} className="ml-2 text-rose-600 underline hover:text-rose-700">clear</button>
              </p>
            )}
          </div>

          <div className="md:col-span-2">
            {!targetProgress.hasTarget ? (
              <div className="flex h-full min-h-[80px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-400">
                Set a sales target to track progress against your current filter.
              </div>
            ) : (
              <>
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Progress · {resolvedRange.label}
                  </span>
                  <span className={`text-sm font-bold ${targetProgress.achieved ? 'text-emerald-600' : 'text-slate-700'}`}>
                    {targetProgress.pct.toFixed(1)}%
                  </span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full transition-all ${targetProgress.achieved ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : 'bg-gradient-to-r from-indigo-500 to-blue-500'}`}
                    style={{ width: `${targetProgress.pct}%` }}
                  />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <p className="text-slate-500">Actual</p>
                    <p className="font-semibold text-slate-800">{compactNumber(totalRevenue)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Target</p>
                    <p className="font-semibold text-slate-800">{compactNumber(salesTarget)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">{targetProgress.achieved ? 'Surplus' : 'Remaining'}</p>
                    <p className={`font-semibold ${targetProgress.achieved ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {compactNumber(targetProgress.achieved ? totalRevenue - salesTarget : targetProgress.remaining)}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Business Score Performance */}
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-700">
        <FiStar className="text-amber-500" /> Business Score Performance
      </h2>
      <div className="mb-8 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-6 text-white shadow-[0_12px_30px_-12px_rgba(15,23,42,0.4)]">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200 backdrop-blur">
            <FiZap size={10} /> Composite
          </div>
          <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-slate-300">Overall Health</p>
          <p className="mt-2 text-6xl font-extrabold tracking-tight">{businessScore.overall}</p>
          <p className="mt-1 text-sm text-slate-300">out of 100</p>
          <div className={`mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold ring-1 ring-white/15`}>
            <span className={`h-2 w-2 rounded-full ${businessScore.overall >= 70 ? 'bg-emerald-400' : businessScore.overall >= 55 ? 'bg-amber-400' : 'bg-rose-400'}`} />
            {overallLabel.label}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:col-span-2">
          {businessScore.factors.map((f) => (<ScoreGauge key={f.name} {...f} />))}
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <ChartCard title="Performance Radar" subtitle="Factor comparison" accent="violet" className="xl:col-span-2">
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={businessScore.factors.map((f) => ({ name: f.name, score: f.score }))} outerRadius="80%">
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <Radar name="Score" dataKey="score" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.35} />
              <RechartsTooltip />
            </RadarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Factor Breakdown" subtitle="Key drivers" accent="teal">
          <ul className="space-y-3">
            {businessScore.factors.map((f) => (
              <li key={f.name} className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: f.fill }} />
                <span className="w-24 text-xs font-medium text-slate-600">{f.name}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full transition-all" style={{ width: `${f.score}%`, backgroundColor: f.fill }} />
                </div>
                <span className="w-10 text-right text-xs font-semibold text-slate-800">{f.score}</span>
              </li>
            ))}
          </ul>
        </ChartCard>
      </div>

      {/* Sales Performance */}
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-700">
        <FiTarget className="text-indigo-600" /> Sales Performance
      </h2>
      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard icon={FiTrendingUp} label="Revenue" value={compactNumber(totalRevenue)} tone="teal" hint={resolvedRange.label} delta={revenueDelta} />
        <StatCard icon={FiDollarSign} label="Invoices" value={filteredInvoices.length} tone="rose" delta={invoicesDelta} />
        <StatCard icon={FiShoppingCart} label="Orders" value={filteredOrders.length} tone="amber" delta={ordersDelta} />
        <StatCard
          icon={FiCheckCircle}
          label="Avg. Invoice"
          value={filteredInvoices.length > 0 ? compactNumber(totalRevenue / filteredInvoices.length) : compactNumber(0)}
          tone="emerald"
        />
      </div>

      <div className="mb-8 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <ChartCard title="Monthly Sales" subtitle={`Filtered range: ${resolvedRange.label}`} className="xl:col-span-2" accent="indigo">
          {isLoading ? (
            <div className="h-72 animate-pulse rounded-xl bg-slate-100" />
          ) : monthlySales.length === 0 || monthlySales.every((m) => m.sales === 0) ? (
            <div className="grid h-72 place-items-center text-sm text-slate-400">No sales data in the selected range</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlySales} margin={{ top: 28, right: 16, left: 0, bottom: 8 }}>
                <defs>
                  <linearGradient id="barMonthly" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366F1" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0.65} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => compactNumber(Number(v))} />
                <RechartsTooltip content={<RupeeTooltip />} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
                <Bar dataKey="sales" name="Sales" fill="url(#barMonthly)" radius={[10, 10, 4, 4]} maxBarSize={56}>
                  <LabelList
                    dataKey="sales"
                    position="top"
                    content={(props: any) => {
                      const { x, y, width, value } = props;
                      if (!value) return null;
                      return (
                        <text x={x + width / 2} y={y - 8} fill="#4f46e5" textAnchor="middle" fontSize={11} fontWeight={600}>
                          {compactNumber(Number(value))}
                        </text>
                      );
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Order Pipeline" subtitle="Distribution by status" accent="violet">
          {isLoading ? (
            <div className="h-72 animate-pulse rounded-xl bg-slate-100" />
          ) : filteredOrders.length === 0 ? (
            <div className="grid h-72 place-items-center text-sm text-slate-400">No orders in the selected range</div>
          ) : (
            <div className="relative">
              <ResponsiveContainer width="100%" height={300}>
                <RadialBarChart cx="50%" cy="50%" innerRadius="30%" outerRadius="100%" barSize={16} data={radialPipeline} startAngle={90} endAngle={-270}>
                  <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                  <RadialBar dataKey="value" background={{ fill: '#f1f5f9' }} cornerRadius={10} />
                  <RechartsTooltip
                    content={({ active, payload }: any) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload;
                      return (
                        <div className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
                          <p className="text-[11px] font-semibold text-slate-800">{p.name}</p>
                          <p className="text-xs text-slate-600">{p.raw} orders · {p.value}%</p>
                        </div>
                      );
                    }}
                  />
                </RadialBarChart>
              </ResponsiveContainer>
              <ul className="mt-1 grid grid-cols-2 gap-2">
                {radialPipeline.map((r) => (
                  <li key={r.name} className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.fill }} />
                    <span className="text-slate-600">{r.name}</span>
                    <span className="ml-auto font-semibold text-slate-800">{r.raw}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </ChartCard>
      </div>

      {/* Purchase Performance */}
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-700">
        <FiPackage className="text-amber-600" /> Purchase Performance
      </h2>
      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard icon={FiShoppingCart} label="Total Purchases" value={compactNumber(totalPurchases)} tone="amber" hint={resolvedRange.label} delta={purchasesDelta} />
        <StatCard icon={FiBox} label="Purchase Bills" value={filteredPurchases.length} tone="blue" />
        <StatCard icon={FiAlertTriangle} label="Outstanding" value={compactNumber(totalOutstanding)} tone="rose" hint={`${purchaseOutstandingRows.length} invoice${purchaseOutstandingRows.length === 1 ? '' : 's'}`} />
        <StatCard
          icon={FiDollarSign}
          label="Avg. Purchase"
          value={filteredPurchases.length > 0 ? compactNumber(totalPurchases / filteredPurchases.length) : compactNumber(0)}
          tone="purple"
        />
      </div>

      <div className="mb-8 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <ChartCard title="Monthly Purchases" subtitle={`Filtered range: ${resolvedRange.label}`} className="xl:col-span-2" accent="amber">
          {purLoading ? (
            <div className="h-72 animate-pulse rounded-xl bg-slate-100" />
          ) : monthlyPurchases.length === 0 || monthlyPurchases.every((m) => m.purchases === 0) ? (
            <div className="grid h-72 place-items-center text-sm text-slate-400">No purchase data in the selected range</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyPurchases} margin={{ top: 28, right: 16, left: 0, bottom: 8 }}>
                <defs>
                  <linearGradient id="barPurchase" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#F97316" stopOpacity={0.65} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => compactNumber(Number(v))} />
                <RechartsTooltip content={<RupeeTooltip />} cursor={{ fill: 'rgba(245,158,11,0.06)' }} />
                <Bar dataKey="purchases" name="Purchases" fill="url(#barPurchase)" radius={[10, 10, 4, 4]} maxBarSize={56}>
                  <LabelList
                    dataKey="purchases"
                    position="top"
                    content={(props: any) => {
                      const { x, y, width, value } = props;
                      if (!value) return null;
                      return (
                        <text x={x + width / 2} y={y - 8} fill="#b45309" textAnchor="middle" fontSize={11} fontWeight={600}>
                          {compactNumber(Number(value))}
                        </text>
                      );
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Top Vendors" subtitle="Highest purchase value" accent="violet">
          {purLoading ? (
            <div className="h-72 animate-pulse rounded-xl bg-slate-100" />
          ) : topVendorsComputed.length === 0 ? (
            <div className="grid h-40 place-items-center text-sm text-slate-400">No vendors in the selected range</div>
          ) : (
            <MiniTable columns={['Vendor', 'Amount']} data={topVendorsComputed.map((v) => [v.name, compactNumber(v.amount)])} />
          )}
        </ChartCard>
      </div>

      {/* HR & Employees */}
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-700">
        <FiUserCheck className="text-purple-600" /> HR & Employees
      </h2>
      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {isLoading ? (
          [...Array(6)].map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard icon={FiUsers} label="Total" value={employeeStatusBuckets.total} tone="blue" />
            <StatCard icon={FiUserCheck} label="Active" value={employeeStatusBuckets.active} tone="emerald" />
            <StatCard icon={FiCalendar} label="On Leave" value={employeeStatusBuckets.onLeave} tone="amber" />
            <StatCard icon={FiUserX} label="Inactive" value={employeeStatusBuckets.inactive} tone="rose" />
            <StatCard icon={FiShoppingCart} label="Pending Orders" value={filteredOrders.filter((o: any) => /pending/i.test(String(o.status || ''))).length} tone="rose" />
            <StatCard icon={FiClock} label="Overdue Invoices" value={filteredInvoices.filter((i: any) => /overdue/i.test(String(i.status || ''))).length} tone="rose" />
          </>
        )}
      </div>

      <div className="mb-8 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <ChartCard title="Employee Status" subtitle="By bucket" accent="emerald" className="xl:col-span-2">
          {empsLoading ? (
            <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
          ) : employeeStatusBuckets.total === 0 ? (
            <div className="grid h-64 place-items-center text-sm text-slate-400">No employees</div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={activeInactive.filter((b) => b.value > 0)}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={85}
                  paddingAngle={3}
                >
                  {activeInactive.filter((b) => b.value > 0).map((b, i) => (
                    <Cell key={i} fill={b.fill} />
                  ))}
                </Pie>
                <RechartsTooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Employee Breakdown" accent="teal">
          <ul className="space-y-3">
            {activeInactive.map((b) => (
              <li key={b.name} className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: b.fill }} />
                <span className="text-xs font-medium text-slate-600">{b.name}</span>
                <div className="ml-auto text-sm font-semibold text-slate-800">{b.value}</div>
              </li>
            ))}
          </ul>
        </ChartCard>
      </div>

      {/* Financial Overview */}
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-700">
        <FiDollarSign className="text-emerald-600" /> Financial Overview
      </h2>
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Inward Payment</h3>
          {payLoading ? (
            <StatCardSkeleton />
          ) : (
            <>
              <p className="text-2xl font-bold text-emerald-600">{compactNumber(paymentBreakdown.inward.total)}</p>
              <div className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-slate-500">Online</span><span className="font-semibold text-slate-800">{compactNumber(paymentBreakdown.inward.online)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Cash</span><span className="font-semibold text-slate-800">{compactNumber(paymentBreakdown.inward.cash)}</span></div>
              </div>
            </>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Outward Payment</h3>
          {payLoading ? (
            <StatCardSkeleton />
          ) : (
            <>
              <p className="text-2xl font-bold text-rose-600">{compactNumber(paymentBreakdown.outward.total)}</p>
              <div className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-slate-500">Online</span><span className="font-semibold text-slate-800">{compactNumber(paymentBreakdown.outward.online)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Cash</span><span className="font-semibold text-slate-800">{compactNumber(paymentBreakdown.outward.cash)}</span></div>
              </div>
            </>
          )}
        </div>

        <ChartCard title="Payment Breakdown" subtitle="Online vs Cash · filter-aware" className="md:col-span-2" accent="emerald">
          {payLoading ? (
            <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={paymentChartData} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => compactNumber(Number(v))} />
                <RechartsTooltip content={<RupeeTooltip />} cursor={{ fill: 'rgba(16,185,129,0.06)' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Online" fill="#3B82F6" radius={[8, 8, 0, 0]} maxBarSize={48} />
                <Bar dataKey="Cash" fill="#F59E0B" radius={[8, 8, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Inventory */}
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-700">
        <FiPackage className="text-amber-600" /> Inventory
      </h2>
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {prodsLoading ? (
          [...Array(6)].map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard icon={FiBox} label="Products" value={inventorySummary.totalProducts} tone="blue" />
            <StatCard icon={FiPackage} label="Quantity" value={inventorySummary.totalQuantity} tone="emerald" />
            <StatCard icon={FiCheckCircle} label="In Stock" value={inventorySummary.inStock} tone="teal" />
            <StatCard icon={FiAlertCircle} label="Low Stock" value={inventorySummary.lowStock} tone="amber" />
            <StatCard icon={FiAlertTriangle} label="Zero Stock" value={inventorySummary.zeroStock} tone="rose" />
            <StatCard icon={FiTrendingDown} label="Negative" value={inventorySummary.negativeStock} tone="rose" />
          </>
        )}
      </div>

      {lowStock && lowStock.length > 0 && (
        <>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-700">
            <FiAlertTriangle className="text-rose-600" /> Low Stock Alerts
          </h2>
          <div className="mb-8 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <MiniTable columns={['Product', 'Quantity']} data={lowStock.slice(0, 10).map((p) => [p.product_name, p.qty])} />
          </div>
        </>
      )}

      {/* Top Customers */}
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-700">
        <FiUsers className="text-violet-600" /> Top Customers
      </h2>
      <div className="mb-8 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        {invsLoading ? (
          <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
        ) : topCustomersComputed.length === 0 ? (
          <div className="grid h-40 place-items-center text-sm text-slate-400">No customers in the selected range</div>
        ) : (
          <MiniTable columns={['Name', 'Amount']} data={topCustomersComputed.map((c) => [c.name, compactNumber(c.amount)])} />
        )}
      </div>

      {/* Purchase Outstanding */}
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-700">
        <FiClock className="text-rose-600" /> Purchase Outstanding
      </h2>
      <div className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] xl:col-span-2">
          {purDueLoading ? (
            <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
          ) : purchaseOutstandingRows.length === 0 ? (
            <div className="grid h-40 place-items-center text-sm text-slate-400">No outstanding purchases 🎉</div>
          ) : (
            <MiniTable
              columns={['Invoice', 'Company', 'Vendor', 'Due Date', 'Remaining']}
              data={purchaseOutstandingRows.map((row) => [
                row.invoice, row.company, row.name,
                row.dueDate ? new Date(row.dueDate).toLocaleDateString('en-IN') : '—',
                compactNumber(row.remaining),
              ])}
            />
          )}
        </div>
        <div className="flex flex-col items-center justify-center rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50 to-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-rose-500">Total Outstanding</h3>
          <p className="mt-3 text-4xl font-extrabold text-rose-600">{compactNumber(totalOutstanding)}</p>
          <p className="mt-2 text-[11px] text-slate-500">
            {purchaseOutstandingRows.length} unpaid invoice{purchaseOutstandingRows.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {/* Charts & Trends */}
      <h2 className="mb-3 mt-8 flex items-center gap-2 text-lg font-bold text-slate-700">
        <FiBarChart2 className="text-indigo-600" /> Charts & Trends
      </h2>
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {showMap && (
          <ChartCard title="Sales Heatmap · Bihar" subtitle="District-wise revenue" className="md:col-span-2 xl:col-span-3" accent="teal">
            <div className="flex h-96 w-full items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
              <ComposableMap projection="geoMercator" projectionConfig={{ scale: 3000, center: [85.3131, 25.0961] }} className="h-full w-full">
                <Geographies geography={geoData}>
                  {({ geographies }) =>
                    geographies.map((geo) => {
                      const dName = geo.properties?.name || geo.properties?.dtname;
                      const dSales = biharDistrictSales?.find((s: any) => s.district === dName)?.sales || 0;
                      const maxSales = Math.max(...(biharDistrictSales?.map((s: any) => s.sales) || [1]));
                      return (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          fill={getMapColor(dSales, maxSales)}
                          stroke="#FFFFFF"
                          strokeWidth={0.5}
                          style={
                            {
                              default: { outline: 'none' },
                              hover: { fill: '#3B82F6', outline: 'none', cursor: 'pointer' },
                              pressed: { outline: 'none' },
                            } as any
                          }
                          data-tooltip-id="map-tooltip"
                          data-tooltip-content={`${dName}: ${compactNumber(dSales)}`}
                        />
                      );
                    })
                  }
                </Geographies>
              </ComposableMap>
              <Tooltip id="map-tooltip" />
            </div>
          </ChartCard>
        )}

        <ChartCard title="Sales vs Purchase" subtitle={`Range: ${resolvedRange.label}`} accent="indigo">
          {salesPurchaseTrend.length === 0 ? (
            <div className="grid h-64 place-items-center text-sm text-slate-400">No data in the selected range</div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <ComposedChart data={salesPurchaseTrend} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => compactNumber(Number(v))} />
                <RechartsTooltip content={<RupeeTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Sales" fill="#10B981" radius={[6, 6, 0, 0]} maxBarSize={32} />
                <Bar dataKey="Purchase" fill="#F59E0B" radius={[6, 6, 0, 0]} maxBarSize={32} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Net Profit" subtitle="Monthly trend" accent="violet">
          {profitError ? (
            <div className="py-8 text-center text-sm text-rose-600">Unavailable</div>
          ) : monthlyProfit.length === 0 ? (
            <div className="grid h-64 place-items-center text-sm text-slate-400">No profit data</div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={monthlyProfit} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <defs>
                  <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => compactNumber(Number(v))} />
                <RechartsTooltip content={<RupeeTooltip />} />
                <Area type="monotone" dataKey="profit" name="Profit" stroke="#8B5CF6" strokeWidth={2} fill="url(#profitFill)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Monthly Revenue" accent="emerald">
          {monthlySales.length === 0 ? (
            <div className="grid h-64 place-items-center text-sm text-slate-400">No revenue data</div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={monthlySales.map((m) => ({ month: m.name, value: m.sales }))} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <defs>
                  <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => compactNumber(Number(v))} />
                <RechartsTooltip content={<RupeeTooltip />} />
                <Area type="monotone" dataKey="value" name="Revenue" stroke="#10B981" strokeWidth={2} fill="url(#revFill)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Order Status" accent="rose">
          {orderStatusDist.length === 0 ? (
            <div className="grid h-64 place-items-center text-sm text-slate-400">No orders</div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={orderStatusDist} dataKey="value" nameKey="name" outerRadius={80} innerRadius={40} paddingAngle={3} label>
                  {orderStatusDist.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
                </Pie>
                <RechartsTooltip /><Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <GeminiAIAssistant />
    </div>
  );
}

export default DashboardPage;