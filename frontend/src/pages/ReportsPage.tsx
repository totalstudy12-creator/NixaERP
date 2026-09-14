// src/pages/ReportsPage.tsx
import {
  useState, useEffect, useCallback, useMemo, useRef, type ReactNode,
} from 'react';
import {
  FiTrendingUp, FiShoppingCart, FiDollarSign, FiFileText, FiCreditCard,
  FiAlertTriangle, FiPrinter, FiDownload, FiRefreshCw, FiPackage, FiUser,
  FiBarChart2, FiFilter, FiGrid, FiChevronDown, FiCalendar, FiArrowUpRight,
  FiArrowDownRight, FiActivity, FiCheckCircle, FiClock, FiXCircle, FiSearch,
  FiLayers, FiDatabase, FiChevronLeft, FiChevronRight, FiBriefcase, FiMapPin,
} from 'react-icons/fi';

import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';

import { Button } from '@/components/ui/button';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';

/* ==================================================================
 * TYPES
 * ================================================================== */

type Tone = 'cyan' | 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'slate';
type Row = Record<string, unknown>;

interface PageMeta {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

interface ReportFilters {
  from: string;
  to: string;
  branch_id?: number | null;
  company_id?: number | null;
  search?: string;
  page?: number;
  per_page?: number;
}

interface Lookup {
  id: number;
  name: string;
}

/* ==================================================================
 * CONSTANTS
 * ================================================================== */

const REPORT_CATEGORIES = [
  { key: 'dashboard', label: 'Overview', description: 'Business reporting overview', icon: <FiGrid size={17} /> },
  { key: 'sales', label: 'Sales', description: 'Sales and receivables', icon: <FiShoppingCart size={17} /> },
  { key: 'purchases', label: 'Purchases', description: 'Purchases and payables', icon: <FiPackage size={17} /> },
  { key: 'accounts', label: 'Accounts', description: 'Financial accounting', icon: <FiDollarSign size={17} /> },
  { key: 'inventory', label: 'Inventory', description: 'Stock & movement', icon: <FiLayers size={17} /> },
  { key: 'gst', label: 'GST / Tax', description: 'GST reporting', icon: <FiFileText size={17} /> },
  { key: 'expenses', label: 'Expenses', description: 'Expense analysis', icon: <FiCreditCard size={17} /> },
] as const;

type CategoryKey = (typeof REPORT_CATEGORIES)[number]['key'];

const SUB_REPORTS: Record<CategoryKey, { key: string; label: string; icon: ReactNode }[]> = {
  dashboard: [],
  sales: [
    { key: 'sales-summary', label: 'Sales Summary', icon: <FiFileText size={14} /> },
    { key: 'sales-register', label: 'Sales Register', icon: <FiFileText size={14} /> },
    { key: 'sales-customer', label: 'Sales by Customer', icon: <FiUser size={14} /> },
    { key: 'sales-product', label: 'Sales by Product', icon: <FiPackage size={14} /> },
    { key: 'sales-user', label: 'Sales by User', icon: <FiUser size={14} /> },
    { key: 'sales-payment-mode', label: 'Payment Mode Summary', icon: <FiCreditCard size={14} /> },
    { key: 'sales-top-products', label: 'Top Products', icon: <FiBarChart2 size={14} /> },
    { key: 'sales-top-customers', label: 'Top Customers', icon: <FiBarChart2 size={14} /> },
    { key: 'sales-gst', label: 'GST Sales Report', icon: <FiFileText size={14} /> },
    { key: 'sales-outstanding', label: 'Outstanding Sales', icon: <FiAlertTriangle size={14} /> },
  ],
  purchases: [
    { key: 'purchase-summary', label: 'Purchase Summary', icon: <FiFileText size={14} /> },
    { key: 'purchase-register', label: 'Purchase Register', icon: <FiFileText size={14} /> },
    { key: 'purchase-vendor', label: 'Purchase by Vendor', icon: <FiUser size={14} /> },
    { key: 'purchase-outstanding', label: 'Outstanding Purchase', icon: <FiAlertTriangle size={14} /> },
  ],
  accounts: [
    { key: 'general-ledger', label: 'General Ledger', icon: <FiFileText size={14} /> },
    { key: 'trial-balance', label: 'Trial Balance', icon: <FiFileText size={14} /> },
    { key: 'profit-loss', label: 'Profit & Loss', icon: <FiTrendingUp size={14} /> },
    { key: 'pl-overview', label: 'Profitability Overview', icon: <FiBarChart2 size={14} /> },
    { key: 'invoice-profitability', label: 'Bill-wise Profitability', icon: <FiFileText size={14} /> },
    { key: 'product-profitability', label: 'Product Profitability', icon: <FiPackage size={14} /> },
    { key: 'customer-profitability', label: 'Customer Profitability', icon: <FiUser size={14} /> },
    { key: 'branch-profitability', label: 'Branch Profitability', icon: <FiGrid size={14} /> },
    { key: 'balance-sheet', label: 'Balance Sheet', icon: <FiFileText size={14} /> },
    { key: 'cash-flow', label: 'Cash Flow', icon: <FiDollarSign size={14} /> },
    { key: 'receivables-aging', label: 'Receivables Aging', icon: <FiAlertTriangle size={14} /> },
    { key: 'payables-aging', label: 'Payables Aging', icon: <FiAlertTriangle size={14} /> },
  ],
  inventory: [
    { key: 'stock-summary', label: 'Stock Summary', icon: <FiPackage size={14} /> },
    { key: 'low-stock', label: 'Low Stock', icon: <FiAlertTriangle size={14} /> },
    { key: 'stock-movement', label: 'Stock Movement', icon: <FiActivity size={14} /> },
  ],
  gst: [
    { key: 'gstr-1', label: 'GSTR-1', icon: <FiFileText size={14} /> },
    { key: 'gst-summary', label: 'GST Summary', icon: <FiFileText size={14} /> },
    { key: 'gst-rate-wise', label: 'Rate-wise GST', icon: <FiFileText size={14} /> },
  ],
  expenses: [
    { key: 'expense-summary', label: 'Expense Summary', icon: <FiCreditCard size={14} /> },
  ],
};

const ENDPOINT_MAP: Record<string, string> = {
  'profit-loss': '/reports/profit-loss',
  'pl-overview': '/reports/profit-loss-summary',
  'balance-sheet': '/reports/balance-sheet',
  'cash-flow': '/reports/cash-flow',
  'branch-profitability': '/reports/profit-loss-branches',
  'invoice-profitability': '/reports/invoice-profitability',
  'customer-profitability': '/reports/profit-loss-customers',
  'product-profitability': '/reports/product-profitability',
  'receivables-aging': '/reports/receivables-aging',
  'payables-aging': '/reports/payables-aging',
};

const STATEMENT_REPORTS = new Set([
  'profit-loss', 'pl-overview', 'balance-sheet', 'cash-flow',
]);

/* ==================================================================
 * UTILITIES
 * ================================================================== */

const cn = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

/** Robust numeric parser (handles "₹1,234.56", "(500)", "33.37%"). */
const safeNum = (v: unknown): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (v === null || v === undefined) return 0;
  const str = String(v).trim();
  if (!str) return 0;
  const negative = /^\(.*\)$/.test(str);
  const cleaned = str.replace(/[₹$€£,\s]/g, '').replace(/[()]/g, '');
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n)) return 0;
  return negative ? -Math.abs(n) : n;
};

const fmtCurrency = (v: unknown) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 2,
  }).format(safeNum(v));

const fmtNumber = (v: unknown) => new Intl.NumberFormat('en-IN').format(safeNum(v));

const fmtPct = (v: unknown) => `${safeNum(v).toFixed(2)}%`;

const fmtDate = (v?: unknown) => {
  const s = v == null ? '' : String(v);
  if (!s) return '-';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s.slice(0, 10);
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(d);
};

const today = () => new Date().toISOString().slice(0, 10);

const fyStart = () => {
  const n = new Date();
  const y = n.getMonth() >= 3 ? n.getFullYear() : n.getFullYear() - 1;
  return `${y}-04-01`;
};

const currentFY = () => {
  const n = new Date();
  const y = n.getMonth() >= 3 ? n.getFullYear() : n.getFullYear() - 1;
  return `${y}-${y + 1}`;
};

const buildQS = (params: Record<string, unknown>) => {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '' || v === 'all') return;
    qs.set(k, String(v));
  });
  const s = qs.toString();
  return s ? `?${s}` : '';
};

const humanize = (k: string) =>
  k.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();

const getByPath = (row: Row, path: string): unknown =>
  path.split('.').reduce<unknown>(
    (acc, k) => (acc && typeof acc === 'object' ? (acc as Row)[k] : undefined),
    row,
  );

/** Return first non-null / non-empty value for a list of candidate keys. */
const pickFromKeys = (row: Row, keys: string[]): unknown => {
  for (const k of keys) {
    const v = getByPath(row, k);
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
};

/** Return the first non-zero numeric value for a list of candidate keys. */
const numFromKeys = (row: Row, keys: string[]): number => safeNum(pickFromKeys(row, keys));

/* ==================================================================
 * KEY ALIAS BANKS — cover common backend naming conventions
 * ================================================================== */

const ROW_KEYS = {
  invoice_no: [
    'invoice_no', 'invoice_number', 'invoiceNumber', 'invoice',
    'bill_no', 'bill_number', 'billNumber',
    'number', 'no', 'code',
    'invoice.no', 'invoice.code', 'invoice.number',
  ],
  invoice_date: [
    'invoice_date', 'invoiceDate', 'date', 'bill_date', 'billDate',
    'created_at', 'createdAt',
    'invoice.date', 'invoice.created_at',
  ],
  customer: [
    'customer_name', 'customerName', 'customer', 'party_name', 'partyName',
    'client_name', 'clientName', 'party', 'client',
    'customer.name', 'party.name',
  ],
  qty: [
    'total_quantity', 'totalQuantity', 'quantity', 'qty',
    'total_qty', 'totalQty', 'items_count', 'item_count',
    'total_items', 'qty_sold', 'quantity_sold',
  ],
  sales: [
    'sales_value', 'salesValue', 'sales_amount', 'salesAmount',
    'sale_value', 'saleValue', 'sale_amount', 'saleAmount',
    'sales', 'sale',
    'total_sales', 'totalSales', 'total_sale', 'totalSale',
    'invoice_total', 'invoiceTotal', 'invoice_amount', 'invoiceAmount',
    'invoice_value', 'invoiceValue',
    'bill_total', 'bill_amount', 'billAmount', 'bill_value', 'billValue',
    'total_amount', 'totalAmount', 'grand_total', 'grandTotal',
    'net_amount', 'netAmount', 'gross_amount', 'grossAmount',
    'subtotal', 'sub_total', 'subTotal',
    'revenue', 'total_revenue', 'gross_sales',
    'invoice.total', 'invoice.total_amount', 'invoice.amount', 'invoice.grand_total',
    'sale.total', 'sale.amount', 'bill.total', 'bill.amount',
  ],
  cost: [
    'cost_value', 'costValue', 'cost_amount', 'costAmount',
    'cost', 'total_cost', 'totalCost',
    'cogs', 'total_cogs', 'cogs_value', 'cogsValue',
    'purchase_value', 'purchaseValue', 'purchase_cost', 'purchaseCost',
    'purchase_amount', 'purchaseAmount',
  ],
  gp: [
    'gross_profit', 'grossProfit', 'gross_profit_value', 'grossProfitValue',
    'profit', 'profit_value', 'profitValue',
    'gp', 'gp_value', 'gpValue',
  ],
  margin: [
    'profit_margin', 'profitMargin', 'gross_margin', 'grossMargin',
    'margin', 'gp_percent', 'gpPercent',
    'margin_percent', 'marginPercent', 'gp_margin', 'gpMargin',
  ],
  net: ['net_profit', 'netProfit', 'net_profit_value', 'netProfitValue'],
  status: ['status', 'invoice_status', 'payment_status', 'invoice.status'],
  calc_status: ['calc_status', 'calcStatus', 'cost_status', 'costStatus'],
};

const S_KEY = {
  sales: [
    'total_sales', 'totalSales', 'sales_value', 'salesValue', 'sales',
    'sales_amount', 'salesAmount', 'revenue', 'total_revenue',
    'gross_sales', 'net_sales', 'total_amount',
  ],
  cost: [
    'total_cost', 'totalCost', 'cost_value', 'costValue', 'cost',
    'cogs', 'total_cogs', 'purchase_value', 'purchase_cost',
  ],
  gp: ['gross_profit', 'grossProfit', 'gross_profit_value', 'gp', 'profit'],
  gm: ['gross_margin', 'grossMargin', 'margin', 'profit_margin', 'gp_percent'],
  exp: ['total_expenses', 'totalExpenses', 'expenses', 'total_expense', 'operating_expenses'],
  np: ['net_profit', 'netProfit', 'net_profit_value'],
  missing: ['missing_cost_lines', 'missingCostLines', 'missing_cost', 'missing_cost_count'],
};

/* ---------- Row resolver: derive missing values from each other -------- */

interface ResolvedRow {
  sales: number;
  cost: number;
  gp: number;
  margin: number;
  net: number;
}

const resolveRow = (r: Row): ResolvedRow => {
  let sales = numFromKeys(r, ROW_KEYS.sales);
  let cost = numFromKeys(r, ROW_KEYS.cost);
  let gp = numFromKeys(r, ROW_KEYS.gp);
  let margin = numFromKeys(r, ROW_KEYS.margin);
  const net = numFromKeys(r, ROW_KEYS.net);

  // Derive sales from cost + gp when the sales key is missing.
  if (!sales && (cost || gp)) sales = cost + gp;
  // Derive gp from sales - cost when the gp key is missing.
  if (!gp && (sales || cost)) gp = sales - cost;
  // Derive margin from sales & gp.
  if (!margin && sales) margin = (gp / sales) * 100;

  return { sales, cost, gp, margin, net };
};

/* ==================================================================
 * DATA HOOK
 * ================================================================== */

interface UseReportOptions {
  path: string;
  filters: ReportFilters;
  enabled?: boolean;
  ttlMs?: number;
}

interface UseReportResult {
  rows: Row[];
  raw: Record<string, unknown> | null;
  summary: Record<string, number> | null;
  meta: PageMeta | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const reportCache = new Map<string, { at: number; payload: Record<string, unknown> }>();

function useReport({ path, filters, enabled = true, ttlMs = 120_000 }: UseReportOptions): UseReportResult {
  const [rows, setRows] = useState<Row[]>([]);
  const [raw, setRaw] = useState<Record<string, unknown> | null>(null);
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(Boolean(enabled && path));
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const qs = useMemo(
    () => buildQS(filters as unknown as Record<string, unknown>),
    [filters],
  );
  const url = path ? `${path}${qs}` : '';
  const key = url;

  useEffect(() => {
    if (!enabled || !url) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    const cached = reportCache.get(key);
    if (cached && Date.now() - cached.at < ttlMs) {
      const p = cached.payload;
      setRaw(p);
      setRows(Array.isArray(p.data) ? (p.data as Row[]) : []);
      setSummary((p.summary as Record<string, number>) ?? null);
      setMeta((p.meta as PageMeta) ?? null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    apiClient
      .request('GET', url)
      .then((res: unknown) => {
        if (cancelled) return;
        const payload = (res ?? {}) as Record<string, unknown>;
        reportCache.set(key, { at: Date.now(), payload });
        setRaw(payload);
        setRows(Array.isArray(payload.data) ? (payload.data as Row[]) : []);
        setSummary((payload.summary as Record<string, number>) ?? null);
        setMeta((payload.meta as PageMeta) ?? null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg =
          (err as { backendMessage?: string })?.backendMessage ||
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          (err as Error)?.message ||
          'Unable to load report.';
        setError(msg);
        setRows([]);
        setRaw(null);
        setSummary(null);
        setMeta(null);
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; controller.abort(); };
  }, [key, url, enabled, ttlMs, tick]);

  const refresh = useCallback(() => {
    reportCache.delete(key);
    setTick((t) => t + 1);
  }, [key]);

  return { rows, raw, summary, meta, loading, error, refresh };
}

/* ==================================================================
 * SHARED UI PRIMITIVES
 * ================================================================== */

function StatCard({
  title, value, count, icon, tone, loading,
}: {
  title: string; value: string; count: string; icon: ReactNode; tone: Tone; loading: boolean;
}) {
  const tones: Record<Tone, { icon: string; line: string }> = {
    cyan: { icon: 'bg-cyan-50 text-cyan-600', line: 'bg-cyan-500' },
    blue: { icon: 'bg-blue-50 text-blue-600', line: 'bg-blue-500' },
    emerald: { icon: 'bg-emerald-50 text-emerald-600', line: 'bg-emerald-500' },
    amber: { icon: 'bg-amber-50 text-amber-600', line: 'bg-amber-500' },
    rose: { icon: 'bg-rose-50 text-rose-600', line: 'bg-rose-500' },
    violet: { icon: 'bg-violet-50 text-violet-600', line: 'bg-violet-500' },
    slate: { icon: 'bg-slate-100 text-slate-600', line: 'bg-slate-400' },
  };
  const t = tones[tone];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className={cn('absolute bottom-0 left-0 h-0.5 w-full', t.line)} />
      <div className="flex items-start justify-between gap-3">
        <div className={cn('grid h-11 w-11 place-items-center rounded-xl', t.icon)}>{icon}</div>
        <FiArrowUpRight size={15} className="text-slate-300" />
      </div>
      <div className="mt-4">
        <p className="text-xs font-semibold text-slate-500">{title}</p>
        {loading ? (
          <>
            <div className="mt-2 h-7 w-32 animate-pulse rounded-lg bg-slate-100" />
            <div className="mt-2 h-3 w-20 animate-pulse rounded bg-slate-100" />
          </>
        ) : (
          <>
            <p className="mt-1 truncate text-xl font-black tracking-tight text-slate-950">{value}</p>
            <p className="mt-1 text-[11px] text-slate-400">{count}</p>
          </>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const n = (status ?? '').toLowerCase();
  let cls = 'border-slate-200 bg-slate-50 text-slate-600';
  let Icon = FiClock;
  if (['completed', 'delivered', 'paid', 'success', 'successful', 'active'].includes(n)) {
    cls = 'border-emerald-200 bg-emerald-50 text-emerald-700'; Icon = FiCheckCircle;
  } else if (['pending', 'processing', 'partial', 'unpaid', 'draft'].includes(n)) {
    cls = 'border-amber-200 bg-amber-50 text-amber-700'; Icon = FiClock;
  } else if (['cancelled', 'canceled', 'failed', 'inactive'].includes(n)) {
    cls = 'border-rose-200 bg-rose-50 text-rose-700'; Icon = FiXCircle;
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide', cls)}>
      <Icon size={10} />{status || 'Unknown'}
    </span>
  );
}

function CostMissingBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-amber-700">
      <FiAlertTriangle size={10} /> Cost Missing
    </span>
  );
}

function TableHead({ children, align = 'left' }: { children: ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={cn(
      'sticky top-0 z-10 bg-slate-50 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500',
      align === 'right' ? 'text-right' : 'text-left',
    )}>
      {children}
    </th>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-rose-200 bg-rose-50/40 px-5 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl border border-rose-100 bg-white text-rose-500 shadow-sm">
        <FiAlertTriangle size={22} />
      </div>
      <h3 className="mt-4 text-base font-black text-slate-800">Unable to load report</h3>
      <p className="mt-2 max-w-md text-xs leading-5 text-slate-500">{message}</p>
      {onRetry && (
        <button
          type="button" onClick={onRetry}
          className="mt-4 rounded-lg bg-rose-100 px-4 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-200"
        >
          Retry
        </button>
      )}
    </div>
  );
}

function EmptyState({ title, description, icon }: { title: string; description: string; icon: ReactNode }) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-5 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl border border-slate-200 bg-white text-cyan-600 shadow-sm">
        {icon}
      </div>
      <h3 className="mt-4 text-base font-black text-slate-800">{title}</h3>
      <p className="mt-2 max-w-md text-xs leading-5 text-slate-500">{description}</p>
    </div>
  );
}

function LoadingBlock({ label = 'Loading report data…' }: { label?: string }) {
  return (
    <div className="flex min-h-[280px] items-center justify-center">
      <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-xs text-slate-600">
        <FiRefreshCw className="animate-spin" size={14} />
        {label}
      </div>
    </div>
  );
}

function Pagination({ meta, onPage }: { meta: PageMeta; onPage: (p: number) => void }) {
  if (!meta || meta.last_page <= 1) return null;
  const page = meta.current_page;
  const last = meta.last_page;
  const pages = useMemo(() => {
    const out: number[] = [];
    const from = Math.max(1, page - 2);
    const to = Math.min(last, page + 2);
    for (let i = from; i <= to; i++) out.push(i);
    return out;
  }, [page, last]);

  return (
    <div className="no-print flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-xs">
      <span className="text-slate-500">
        Page <b className="text-slate-800">{page}</b> of <b className="text-slate-800">{last}</b>
        {' '}· {fmtNumber(meta.total)} records
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button" onClick={() => onPage(page - 1)} disabled={page <= 1}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FiChevronLeft size={12} /> Prev
        </button>
        {pages.map((p) => (
          <button
            key={p} type="button" onClick={() => onPage(p)}
            className={cn(
              'min-w-[30px] rounded-lg border px-2 py-1.5 font-semibold transition',
              p === page
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            {p}
          </button>
        ))}
        <button
          type="button" onClick={() => onPage(page + 1)} disabled={page >= last}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next <FiChevronRight size={12} />
        </button>
      </div>
    </div>
  );
}

/* ==================================================================
 * REPORT TABLE
 * ================================================================== */

interface Column {
  key: string;
  label: string;
  align?: 'left' | 'right';
  render?: (row: Row) => ReactNode;
  value?: (row: Row) => unknown;
}

function ReportTable({
  title, description, columns, rows, loading, error, meta, onPage, onRefresh, onExportCSV, emptyIcon,
}: {
  title: string;
  description?: string;
  columns: Column[];
  rows: Row[];
  loading: boolean;
  error: string | null;
  meta?: PageMeta | null;
  onPage?: (p: number) => void;
  onRefresh?: () => void;
  onExportCSV?: () => void;
  emptyIcon?: ReactNode;
}) {
  const printRef = useRef<HTMLElement>(null);

  if (error) return <ErrorState message={error} onRetry={onRefresh} />;

  return (
    <section ref={printRef} data-report-root>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-black tracking-tight text-slate-950 sm:text-xl">{title}</h2>
            {meta && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                {fmtNumber(meta.total)} records
              </span>
            )}
          </div>
          {description && <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}
        </div>
        <div className="flex items-center gap-2 no-print">
          {onExportCSV && (
            <button
              type="button" onClick={onExportCSV} disabled={!rows.length}
              className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-600 px-3 py-2 text-[11px] font-bold text-white transition hover:bg-cyan-700 disabled:opacity-50"
            >
              <FiDownload size={12} /> CSV
            </button>
          )}
          <button
            type="button" onClick={() => printReport(printRef.current)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50"
          >
            <FiPrinter size={12} /> Print A4
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {columns.map((c) => (
                  <TableHead key={c.key} align={c.align}>{c.label}</TableHead>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={columns.length} className="px-4 py-16 text-center"><LoadingBlock /></td></tr>
              ) : !rows.length ? (
                <tr><td colSpan={columns.length} className="px-4 py-16 text-center">
                  <div className="mx-auto flex max-w-sm flex-col items-center">
                    <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
                      {emptyIcon ?? <FiDatabase size={20} />}
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-700">No records found</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      No data was returned for the selected reporting period or filters.
                    </p>
                  </div>
                </td></tr>
              ) : (
                rows.map((row, idx) => (
                  <tr key={String(row.id ?? row.invoice_id ?? row.branch_id ?? idx)} className="border-b border-slate-100 transition hover:bg-slate-50">
                    {columns.map((c) => (
                      <td key={c.key} className={cn('px-4 py-3 text-slate-700', c.align === 'right' ? 'text-right' : 'text-left')}>
                        {c.render ? c.render(row) : String(getByPath(row, c.key) ?? '-')}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {meta && onPage && <Pagination meta={meta} onPage={onPage} />}
      </div>
    </section>
  );
}

/* ==================================================================
 * A4 PRINT
 * ================================================================== */

const A4_PRINT_CSS = `
  *, *::before, *::after { box-sizing: border-box !important; }

  html, body {
    background: #fff !important;
    color: #0f172a;
    margin: 0; padding: 0;
    font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
    font-size: 11px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .print-shell { padding: 8mm 6mm; }

  .print-header {
    display: flex; align-items: flex-end; justify-content: space-between;
    border-bottom: 2px solid #0f172a;
    padding-bottom: 6px;
    margin-bottom: 14px;
  }
  .print-header .title { font-size: 16px; font-weight: 800; margin: 0; color: #0f172a; }
  .print-header .sub { font-size: 10px; color: #64748b; margin: 2px 0 0; }
  .print-header .meta { font-size: 10px; color: #64748b; text-align: right; }

  /* Hide interactive chrome */
  .no-print, button { display: none !important; }

  /* Neutralize screen-only styles inside report root */
  [data-report-root] * {
    overflow: visible !important;
    max-height: none !important;
    box-shadow: none !important;
    animation: none !important;
    transition: none !important;
  }
  [data-report-root] {
    border: 0 !important;
    padding: 0 !important;
    margin: 0 !important;
    background: #fff !important;
  }

  /* Cards become plain blocks in print */
  [data-report-root] .rounded-2xl,
  [data-report-root] .rounded-xl {
    border-radius: 4px !important;
  }

  /* Grid collapses on paper */
  [data-report-root] .grid {
    display: grid !important;
    gap: 6px !important;
  }
  [data-report-root] .grid > * {
    border: 1px solid #cbd5e1 !important;
    padding: 6px 8px !important;
    background: #fff !important;
  }

  /* Tables */
  table { width: 100% !important; border-collapse: collapse !important; table-layout: auto; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  th, td {
    border: 1px solid #cbd5e1 !important;
    padding: 4px 6px !important;
    font-size: 10px !important;
    vertical-align: top;
    text-align: left;
  }
  th {
    background: #f1f5f9 !important;
    font-weight: 700 !important;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    font-size: 9px !important;
  }
  td[data-align="right"],
  th[data-align="right"] { text-align: right !important; }

  h1, h2, h3, h4 { margin: 0 0 4px; color: #0f172a; }
  h2 { font-size: 14px !important; }
  h3 { font-size: 12px !important; }
  h4 { font-size: 11px !important; }

  /* Color-coded values stay legible */
  .text-emerald-700, .text-emerald-600 { color: #047857 !important; }
  .text-rose-700, .text-rose-600 { color: #be123c !important; }

  @page {
    size: A4 portrait;
    margin: 12mm 10mm;
  }

  @media print {
    .print-shell { padding: 0; }
    tr { page-break-inside: avoid; }
    thead { page-break-after: avoid; }
    h1, h2, h3, h4 { page-break-after: avoid; }
  }
`;

/** Copy every stylesheet from the live document so Tailwind layout survives the popup. */
function printReport(root: HTMLElement | null, opts?: { title?: string; subtitle?: string }) {
  if (!root) return;
  const w = window.open('', '_blank', 'width=1024,height=1280');
  if (!w) return;

  const styleTags = Array.from(
    document.querySelectorAll('style, link[rel="stylesheet"]'),
  ).map((n) => n.outerHTML).join('\n');

  const generated = new Date().toLocaleString('en-IN');

  // Try to infer the title from the report root.
  const heading = root.querySelector('h1, h2')?.textContent?.trim();
  const title = opts?.title || heading || 'Business Report';
  const subtitle = opts?.subtitle || '';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — ${new Date().toLocaleDateString('en-IN')}</title>
  ${styleTags}
  <style>${A4_PRINT_CSS}</style>
</head>
<body>
  <div class="print-shell">
    <header class="print-header">
      <div>
        <p class="title">${title}</p>
        ${subtitle ? `<p class="sub">${subtitle}</p>` : ''}
      </div>
      <div class="meta">
        <div>Generated ${generated}</div>
      </div>
    </header>
    <main class="print-content">${root.innerHTML}</main>
  </div>
</body>
</html>`;

  w.document.open();
  w.document.write(html);
  w.document.close();

  // Tag right-aligned numeric cells so print CSS handles them properly.
  w.document.querySelectorAll('td, th').forEach((cell) => {
    const cls = cell.className || '';
    if (/text-right/.test(cls)) cell.setAttribute('data-align', 'right');
  });

  const fire = () => {
    try { w.focus(); w.print(); } catch { /* user may have closed it */ }
  };
  if (w.document.readyState === 'complete') {
    setTimeout(fire, 500);
  } else {
    w.addEventListener('load', () => setTimeout(fire, 500));
  }
}

/* ==================================================================
 * FILTER CHIP
 * ================================================================== */

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="grid h-3.5 w-3.5 place-items-center rounded-full bg-indigo-200/70 text-indigo-700 transition hover:bg-indigo-300"
        aria-label={`Remove ${label}`}
      >
        <FiXCircle size={10} />
      </button>
    </span>
  );
}

/* ==================================================================
 * BILL-WISE PROFITABILITY VIEW
 * ================================================================== */

interface InvoiceProfitabilitySummary {
  total_sales: number;
  total_cost: number;
  gross_profit: number;
  gross_margin: number;
  total_expenses: number;
  net_profit: number;
  missing_cost_lines?: number;
}

function InvoiceProfitabilityView({
  rows, summary, meta, loading, error, onRefresh, onPage, onExportCSV,
}: {
  rows: Row[];
  summary: Record<string, number> | null;
  meta: PageMeta | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onPage: (p: number) => void;
  onExportCSV: () => void;
}) {
  const printRef = useRef<HTMLElement>(null);

  /**
   * Summary computation:
   *   1. Use backend summary values when non-zero.
   *   2. Fall back to row sums (through resolveRow so missing keys are derived).
   *   3. Derive gross_profit / margin / net_profit as a last resort.
   * Never computes GP from a partial row-sum that ignores backend totals.
   */
  const s: InvoiceProfitabilitySummary = useMemo(() => {
    const src: Record<string, unknown> = summary ?? {};

    const pickNonZero = (keys: string[]): number => {
      for (const k of keys) {
        if (!(k in src)) continue;
        const n = safeNum(src[k]);
        if (n !== 0) return n;
      }
      return 0;
    };

    let total_sales = pickNonZero(S_KEY.sales);
    let total_cost = pickNonZero(S_KEY.cost);
    let gross_profit = pickNonZero(S_KEY.gp);
    const total_expenses = pickNonZero(S_KEY.exp);
    let net_profit = pickNonZero(S_KEY.np);
    const missing_cost_lines = pickNonZero(S_KEY.missing);
    let gross_margin = pickNonZero(S_KEY.gm);

    // Row-based fallbacks via resolveRow.
    if (rows.length) {
      let rs = 0, rc = 0, rgp = 0;
      for (const r of rows) {
        const rr = resolveRow(r);
        rs += rr.sales;
        rc += rr.cost;
        rgp += rr.gp;
      }
      if (!total_sales) total_sales = rs;
      if (!total_cost) total_cost = rc;
      if (!gross_profit) gross_profit = rgp;
    }

    // Derive what we can from totals.
    if (!gross_profit && (total_sales || total_cost)) gross_profit = total_sales - total_cost;
    if (!gross_margin && total_sales) gross_margin = (gross_profit / total_sales) * 100;
    if (!net_profit) net_profit = gross_profit - total_expenses;

    return {
      total_sales,
      total_cost,
      gross_profit,
      gross_margin,
      total_expenses,
      net_profit,
      missing_cost_lines,
    };
  }, [summary, rows]);

  const hasMissingCost = safeNum(s.missing_cost_lines) > 0;

  if (error) return <ErrorState message={error} onRetry={onRefresh} />;

  return (
    <section ref={printRef} data-report-root className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-black tracking-tight text-slate-950 sm:text-xl">
            Bill-wise Profitability
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Gross Profit = (Item Sale Price − Item Purchase Price) × Quantity — calculated on the backend from real invoice items and purchase prices.
          </p>
        </div>
        <div className="flex items-center gap-2 no-print">
          <button
            type="button" onClick={onExportCSV} disabled={!rows.length}
            className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-600 px-3 py-2 text-[11px] font-bold text-white transition hover:bg-cyan-700 disabled:opacity-50"
          >
            <FiDownload size={12} /> CSV
          </button>
          <button
            type="button" onClick={() => printReport(printRef.current)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50"
          >
            <FiPrinter size={12} /> Print A4
          </button>
        </div>
      </div>

      {/* Missing-cost warning */}
      {hasMissingCost && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-800">
          <FiAlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">
              {fmtNumber(s.missing_cost_lines)} line(s) missing a valid purchase price
            </p>
            <p className="mt-1 text-xs text-amber-700">
              Those invoices are marked <b>Cost Missing</b> and their gross profit is understated. Add purchase records for the affected products and refresh.
            </p>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard title="Total Sales" value={fmtCurrency(s.total_sales)} count="Filtered invoices" icon={<FiShoppingCart />} tone="cyan" loading={loading} />
        <StatCard title="Total Cost (COGS)" value={fmtCurrency(s.total_cost)} count="Purchase value of sold items" icon={<FiPackage />} tone="blue" loading={loading} />
        <StatCard title="Gross Profit" value={fmtCurrency(s.gross_profit)} count="Sales − Cost" icon={<FiTrendingUp />} tone={s.gross_profit >= 0 ? 'emerald' : 'rose'} loading={loading} />
        <StatCard title="Gross Margin" value={fmtPct(s.gross_margin)} count="GP ÷ Sales × 100" icon={<FiBarChart2 />} tone="violet" loading={loading} />
        <StatCard title="Recorded Expenses" value={fmtCurrency(s.total_expenses)} count="Actual expense records only" icon={<FiCreditCard />} tone="amber" loading={loading} />
        <StatCard title="Net Profit" value={fmtCurrency(s.net_profit)} count="Gross Profit − Recorded Expenses" icon={<FiDollarSign />} tone={s.net_profit >= 0 ? 'emerald' : 'rose'} loading={loading} />
      </div>

      {/* Bill-wise table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <TableHead>Invoice</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead align="right">Qty</TableHead>
                <TableHead align="right">Sales</TableHead>
                <TableHead align="right">Cost</TableHead>
                <TableHead align="right">Gross Profit</TableHead>
                <TableHead align="right">GP %</TableHead>
                <TableHead align="right">Net Profit</TableHead>
                <TableHead align="right">Status</TableHead>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-16 text-center"><LoadingBlock /></td></tr>
              ) : !rows.length ? (
                <tr><td colSpan={10} className="px-4 py-16 text-center">
                  <div className="mx-auto flex max-w-sm flex-col items-center">
                    <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
                      <FiDatabase size={20} />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-700">No invoices found</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      No data was returned for the selected reporting period or filters.
                    </p>
                  </div>
                </td></tr>
              ) : (
                rows.map((r, i) => {
                  const resolved = resolveRow(r);
                  const calcStatus = String(pickFromKeys(r, ROW_KEYS.calc_status) ?? 'ok');
                  const invoiceNo = pickFromKeys(r, ROW_KEYS.invoice_no);
                  const invoiceDate = pickFromKeys(r, ROW_KEYS.invoice_date);
                  const customer = pickFromKeys(r, ROW_KEYS.customer);
                  const qty = numFromKeys(r, ROW_KEYS.qty);
                  const status = pickFromKeys(r, ROW_KEYS.status);

                  return (
                    <tr key={String(r.invoice_id ?? r.id ?? i)} className="border-b border-slate-100 transition hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-slate-800">
                        {invoiceNo == null || invoiceNo === '' ? '-' : String(invoiceNo)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{fmtDate(invoiceDate)}</td>
                      <td className="px-4 py-3 text-slate-700">{customer == null || customer === '' ? '-' : String(customer)}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{fmtNumber(qty)}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{fmtCurrency(resolved.sales)}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{fmtCurrency(resolved.cost)}</td>
                      <td className={cn('px-4 py-3 text-right font-bold',
                        resolved.gp >= 0 ? 'text-emerald-700' : 'text-rose-700')}>
                        {fmtCurrency(resolved.gp)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">
                        {fmtPct(resolved.margin)}
                      </td>
                      <td className={cn('px-4 py-3 text-right font-semibold',
                        resolved.net >= 0 ? 'text-emerald-700' : 'text-rose-700')}>
                        {fmtCurrency(resolved.net)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {calcStatus === 'cost_missing' && <CostMissingBadge />}
                          <StatusBadge status={status == null ? '' : String(status)} />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {!loading && rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-100 font-bold text-slate-900">
                  <td colSpan={3} className="px-4 py-3 text-right">Totals (filtered)</td>
                  <td className="px-4 py-3 text-right text-slate-400">—</td>
                  <td className="px-4 py-3 text-right">{fmtCurrency(s.total_sales)}</td>
                  <td className="px-4 py-3 text-right">{fmtCurrency(s.total_cost)}</td>
                  <td className={cn('px-4 py-3 text-right',
                    s.gross_profit >= 0 ? 'text-emerald-700' : 'text-rose-700')}>
                    {fmtCurrency(s.gross_profit)}
                  </td>
                  <td className="px-4 py-3 text-right">{fmtPct(s.gross_margin)}</td>
                  <td className={cn('px-4 py-3 text-right',
                    s.net_profit >= 0 ? 'text-emerald-700' : 'text-rose-700')}>
                    {fmtCurrency(s.net_profit)}
                  </td>
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {meta && <Pagination meta={meta} onPage={onPage} />}
      </div>
    </section>
  );
}

/* ==================================================================
 * MAIN PAGE
 * ================================================================== */

export function ReportsPage() {
  const { showSuccess, showError } = useNotification();

  const [activeCategory, setActiveCategory] = useState<CategoryKey>('dashboard');
  const [activeSubReport, setActiveSubReport] = useState<string>('');

  const [dateFrom, setDateFrom] = useState(fyStart());
  const [dateTo, setDateTo] = useState(today());
  const [financialYear, setFinancialYear] = useState(currentFY());
  const [companyId, setCompanyId] = useState<number | ''>('');
  const [branchId, setBranchId] = useState<number | ''>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [showFilters, setShowFilters] = useState(false);   // collapsed by default
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [companies, setCompanies] = useState<Lookup[]>([]);
  const [branches, setBranches] = useState<Lookup[]>([]);

  useEffect(() => {
    Promise.allSettled([
      apiClient.request('GET', '/companies'),
      apiClient.request('GET', '/branches'),
    ]).then(([c, b]) => {
      const unwrap = (res: unknown): Lookup[] => {
        if (Array.isArray(res)) return res as Lookup[];
        const data = (res as { data?: Lookup[] })?.data;
        return Array.isArray(data) ? data : [];
      };
      if (c.status === 'fulfilled') setCompanies(unwrap(c.value));
      if (b.status === 'fulfilled') setBranches(unwrap(b.value));
    });
  }, []);

  useEffect(() => {
    setPage(1);
  }, [dateFrom, dateTo, companyId, branchId, activeSubReport, search, perPage]);

  const filters: ReportFilters = useMemo(() => ({
    from: dateFrom,
    to: dateTo,
    company_id: companyId === '' ? null : companyId,
    branch_id: branchId === '' ? null : branchId,
    search: search.trim() || undefined,
    page,
    per_page: perPage,
  }), [dateFrom, dateTo, companyId, branchId, search, page, perPage]);

  /* Summary endpoint doesn't accept pagination; send a lighter filter set. */
  const summaryFilters: ReportFilters = useMemo(() => ({
    from: dateFrom,
    to: dateTo,
    company_id: companyId === '' ? null : companyId,
    branch_id: branchId === '' ? null : branchId,
  }), [dateFrom, dateTo, companyId, branchId]);

  const dashboard = useReport({ path: '/reports/summary', filters: summaryFilters });

  const subReportPath = useMemo(() => {
    if (activeCategory === 'dashboard' || !activeSubReport) return '';
    return ENDPOINT_MAP[activeSubReport] ?? `/reports/${activeSubReport}`;
  }, [activeCategory, activeSubReport]);

  const subReport = useReport({
    path: subReportPath,
    filters,
    enabled: Boolean(subReportPath),
  });

  const dashSummary = useMemo(() => {
    const outer = dashboard.raw ?? {};
    const nested = outer.data;
    const s: Record<string, unknown> =
      nested && typeof nested === 'object' && !Array.isArray(nested)
        ? (nested as Record<string, unknown>)
        : (dashboard.summary ?? {});

    const sales = safeNum(s.total_sales);
    const purchases = safeNum(s.total_purchases);
    return {
      sales,
      purchases,
      receivables: safeNum(s.receivables),
      payables: safeNum(s.payables),
      totalPayments: safeNum(s.payments_received ?? s.payments),
      profit: safeNum(s.net_profit ?? s.gross_profit),
      invoiceCount: safeNum(s.invoice_count ?? s.sales_count),
      purchaseCount: safeNum(s.purchase_count),
      paymentCount: safeNum(s.payment_count),
      stockValue: safeNum(s.stock_value),
      stockQty: safeNum(s.stock_quantity),
    };
  }, [dashboard.raw, dashboard.summary]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (companyId !== '') n++;
    if (branchId !== '') n++;
    if (search.trim()) n++;
    return n;
  }, [companyId, branchId, search]);

  const isLoadingAny = dashboard.loading || subReport.loading;

  const refreshAll = useCallback(() => {
    reportCache.clear();
    dashboard.refresh();
    if (subReportPath) subReport.refresh();
    showSuccess('Refreshed', 'Latest report data loaded.');
  }, [dashboard, subReport, subReportPath, showSuccess]);

  const resetAll = () => {
    setDateFrom(fyStart());
    setDateTo(today());
    setFinancialYear(currentFY());
    setCompanyId('');
    setBranchId('');
    setSearch('');
    setPage(1);
    setPerPage(25);
  };

  const clearAdvanced = () => {
    setCompanyId('');
    setBranchId('');
    setSearch('');
  };

  const exportCSV = (rows: Row[], columns: Column[], filename: string) => {
    if (!rows.length) { showError('Export', 'No data to export.'); return; }
    const headers = columns.map((c) => c.label);
    const csv = [
      headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(','),
      ...rows.map((r) => columns.map((c) => {
        const raw = c.value ? c.value(r) : getByPath(r, c.key);
        const text = raw === null || raw === undefined ? '' : String(raw).replace(/"/g, '""');
        return `"${text}"`;
      }).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showSuccess('Export complete', `${filename} downloaded.`);
  };

  /* --------- CSV columns for Bill-wise Profitability export --------- */
  const billWiseColumns: Column[] = useMemo(() => [
    { key: 'invoice_no', label: 'Invoice', value: (r) => pickFromKeys(r, ROW_KEYS.invoice_no) },
    { key: 'invoice_date', label: 'Date', value: (r) => pickFromKeys(r, ROW_KEYS.invoice_date) },
    { key: 'customer_name', label: 'Customer', value: (r) => pickFromKeys(r, ROW_KEYS.customer) },
    { key: 'total_quantity', label: 'Qty', value: (r) => numFromKeys(r, ROW_KEYS.qty) },
    { key: 'sales_value', label: 'Sales', value: (r) => resolveRow(r).sales },
    { key: 'cost_value', label: 'Cost', value: (r) => resolveRow(r).cost },
    { key: 'gross_profit', label: 'Gross Profit', value: (r) => resolveRow(r).gp },
    { key: 'profit_margin', label: 'GP %', value: (r) => resolveRow(r).margin },
    { key: 'net_profit', label: 'Net Profit', value: (r) => resolveRow(r).net },
    { key: 'status', label: 'Status', value: (r) => pickFromKeys(r, ROW_KEYS.status) },
    { key: 'calc_status', label: 'Calc Status', value: (r) => pickFromKeys(r, ROW_KEYS.calc_status) },
  ], []);

  /* --------- Standard column map (all other reports) --------- */
  const columnMap: Record<string, Column[]> = useMemo(() => ({
    // --- SALES
    'sales-summary': [
      { key: 'invoice_number', label: 'Invoice' },
      { key: 'invoice_date', label: 'Date', render: (r) => fmtDate(r.invoice_date) },
      { key: 'customer', label: 'Customer' },
      { key: 'taxable_amount', label: 'Taxable', align: 'right', render: (r) => fmtCurrency(r.taxable_amount) },
      { key: 'tax', label: 'Tax', align: 'right', render: (r) => fmtCurrency(r.tax) },
      { key: 'total', label: 'Total', align: 'right', render: (r) => fmtCurrency(r.total) },
      { key: 'due_amount', label: 'Due', align: 'right', render: (r) => fmtCurrency(r.due_amount) },
      { key: 'status', label: 'Status', align: 'right', render: (r) => <StatusBadge status={String(r.status ?? '')} /> },
    ],
    'sales-register': [
      { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
      { key: 'invoice_number', label: 'Invoice' },
      { key: 'customer', label: 'Customer' },
      { key: 'item_count', label: 'Items', align: 'right' },
      { key: 'taxable_value', label: 'Taxable', align: 'right', render: (r) => fmtCurrency(r.taxable_value) },
      { key: 'gst', label: 'GST', align: 'right', render: (r) => fmtCurrency(r.gst) },
      { key: 'total', label: 'Total', align: 'right', render: (r) => fmtCurrency(r.total) },
      { key: 'status', label: 'Status', align: 'right', render: (r) => <StatusBadge status={String(r.status ?? '')} /> },
    ],
    'sales-customer': [
      { key: 'customer', label: 'Customer' },
      { key: 'invoice_count', label: 'Invoices', align: 'right' },
      { key: 'taxable_sales', label: 'Taxable', align: 'right', render: (r) => fmtCurrency(r.taxable_sales) },
      { key: 'gst', label: 'GST', align: 'right', render: (r) => fmtCurrency(r.gst) },
      { key: 'total_sales', label: 'Total Sales', align: 'right', render: (r) => fmtCurrency(r.total_sales) },
      { key: 'paid', label: 'Paid', align: 'right', render: (r) => fmtCurrency(r.paid) },
      { key: 'outstanding', label: 'Outstanding', align: 'right', render: (r) => fmtCurrency(r.outstanding) },
    ],
    'sales-product': [
      { key: 'product', label: 'Product' },
      { key: 'sku', label: 'SKU' },
      { key: 'quantity', label: 'Qty', align: 'right' },
      { key: 'taxable_sales', label: 'Taxable', align: 'right', render: (r) => fmtCurrency(r.taxable_sales) },
      { key: 'gst', label: 'GST', align: 'right', render: (r) => fmtCurrency(r.gst) },
      { key: 'total_sales', label: 'Total', align: 'right', render: (r) => fmtCurrency(r.total_sales) },
      { key: 'avg_selling_price', label: 'Avg Price', align: 'right', render: (r) => fmtCurrency(r.avg_selling_price) },
    ],
    'sales-user': [
      { key: 'user', label: 'User' },
      { key: 'invoice_count', label: 'Invoices', align: 'right' },
      { key: 'total_sales', label: 'Total Sales', align: 'right', render: (r) => fmtCurrency(r.total_sales) },
    ],
    'sales-payment-mode': [
      { key: 'payment_method', label: 'Payment Mode' },
      { key: 'count', label: 'Count', align: 'right' },
      { key: 'total', label: 'Amount', align: 'right', render: (r) => fmtCurrency(r.total) },
    ],
    'sales-top-products': [
      { key: 'product', label: 'Product' },
      { key: 'sku', label: 'SKU' },
      { key: 'quantity', label: 'Qty', align: 'right' },
      { key: 'total_sales', label: 'Sales', align: 'right', render: (r) => fmtCurrency(r.total_sales) },
    ],
    'sales-top-customers': [
      { key: 'customer', label: 'Customer' },
      { key: 'invoice_count', label: 'Invoices', align: 'right' },
      { key: 'total_sales', label: 'Sales', align: 'right', render: (r) => fmtCurrency(r.total_sales) },
    ],
    'sales-gst': [
      { key: 'invoice_no', label: 'Invoice' },
      { key: 'invoice_date', label: 'Date', render: (r) => fmtDate(r.invoice_date) },
      { key: 'customer_name', label: 'Party' },
      { key: 'gstin', label: 'GSTIN' },
      { key: 'taxable_value', label: 'Taxable', align: 'right', render: (r) => fmtCurrency(r.taxable_value) },
      { key: 'cgst', label: 'CGST', align: 'right', render: (r) => fmtCurrency(r.cgst) },
      { key: 'sgst', label: 'SGST', align: 'right', render: (r) => fmtCurrency(r.sgst) },
      { key: 'igst', label: 'IGST', align: 'right', render: (r) => fmtCurrency(r.igst) },
      { key: 'total_tax', label: 'Tax', align: 'right', render: (r) => fmtCurrency(r.total_tax) },
      { key: 'total_value', label: 'Total', align: 'right', render: (r) => fmtCurrency(r.total_value) },
    ],
    'sales-outstanding': [
      { key: 'customer', label: 'Customer' },
      { key: 'invoice', label: 'Invoice' },
      { key: 'invoice_date', label: 'Date', render: (r) => fmtDate(r.invoice_date) },
      { key: 'due_date', label: 'Due', render: (r) => fmtDate(r.due_date) },
      { key: 'invoice_amount', label: 'Amount', align: 'right', render: (r) => fmtCurrency(r.invoice_amount) },
      { key: 'paid_amount', label: 'Paid', align: 'right', render: (r) => fmtCurrency(r.paid_amount) },
      { key: 'outstanding_amount', label: 'Outstanding', align: 'right', render: (r) => fmtCurrency(r.outstanding_amount) },
      { key: 'overdue_days', label: 'Days', align: 'right' },
    ],
    // --- PURCHASES
    'purchase-summary': [
      { key: 'purchase_number', label: 'Purchase' },
      { key: 'purchase_date', label: 'Date', render: (r) => fmtDate(r.purchase_date) },
      { key: 'supplier', label: 'Supplier' },
      { key: 'taxable_amount', label: 'Taxable', align: 'right', render: (r) => fmtCurrency(r.taxable_amount) },
      { key: 'tax', label: 'Tax', align: 'right', render: (r) => fmtCurrency(r.tax) },
      { key: 'total', label: 'Total', align: 'right', render: (r) => fmtCurrency(r.total) },
      { key: 'due_amount', label: 'Due', align: 'right', render: (r) => fmtCurrency(r.due_amount) },
      { key: 'status', label: 'Status', align: 'right', render: (r) => <StatusBadge status={String(r.status ?? '')} /> },
    ],
    'purchase-register': [
      { key: 'purchase_date', label: 'Date', render: (r) => fmtDate(r.purchase_date) },
      { key: 'purchase_number', label: 'Bill No.' },
      { key: 'supplier', label: 'Supplier' },
      { key: 'item_count', label: 'Items', align: 'right' },
      { key: 'tax', label: 'Tax', align: 'right', render: (r) => fmtCurrency(r.tax) },
      { key: 'total', label: 'Total', align: 'right', render: (r) => fmtCurrency(r.total) },
      { key: 'due_amount', label: 'Due', align: 'right', render: (r) => fmtCurrency(r.due_amount) },
      { key: 'status', label: 'Status', align: 'right', render: (r) => <StatusBadge status={String(r.status ?? '')} /> },
    ],
    'purchase-vendor': [
      { key: 'supplier', label: 'Vendor' },
      { key: 'purchase_count', label: 'Bills', align: 'right' },
      { key: 'taxable_purchases', label: 'Taxable', align: 'right', render: (r) => fmtCurrency(r.taxable_purchases) },
      { key: 'gst', label: 'GST', align: 'right', render: (r) => fmtCurrency(r.gst) },
      { key: 'total_purchases', label: 'Total', align: 'right', render: (r) => fmtCurrency(r.total_purchases) },
      { key: 'paid', label: 'Paid', align: 'right', render: (r) => fmtCurrency(r.paid) },
      { key: 'outstanding', label: 'Outstanding', align: 'right', render: (r) => fmtCurrency(r.outstanding) },
    ],
    'purchase-outstanding': [
      { key: 'supplier', label: 'Supplier' },
      { key: 'purchase_number', label: 'Bill No.' },
      { key: 'purchase_date', label: 'Date', render: (r) => fmtDate(r.purchase_date) },
      { key: 'due_date', label: 'Due', render: (r) => fmtDate(r.due_date) },
      { key: 'purchase_amount', label: 'Amount', align: 'right', render: (r) => fmtCurrency(r.purchase_amount) },
      { key: 'paid_amount', label: 'Paid', align: 'right', render: (r) => fmtCurrency(r.paid_amount) },
      { key: 'outstanding_amount', label: 'Outstanding', align: 'right', render: (r) => fmtCurrency(r.outstanding_amount) },
      { key: 'overdue_days', label: 'Days', align: 'right' },
    ],
    // --- ACCOUNTS
    'general-ledger': [
      { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
      { key: 'description', label: 'Description' },
      { key: 'debit', label: 'Debit', align: 'right', render: (r) => fmtCurrency(r.debit) },
      { key: 'credit', label: 'Credit', align: 'right', render: (r) => fmtCurrency(r.credit) },
      { key: 'balance', label: 'Balance', align: 'right', render: (r) => fmtCurrency(r.balance) },
    ],
    'trial-balance': [
      { key: 'account', label: 'Account' },
      { key: 'debit', label: 'Debit', align: 'right', render: (r) => fmtCurrency(r.debit) },
      { key: 'credit', label: 'Credit', align: 'right', render: (r) => fmtCurrency(r.credit) },
      { key: 'balance', label: 'Balance', align: 'right', render: (r) => fmtCurrency(r.balance) },
    ],
    'product-profitability': [
      { key: 'product_name', label: 'Product' },
      { key: 'sku', label: 'SKU' },
      { key: 'quantity_sold', label: 'Qty Sold', align: 'right' },
      { key: 'sales_value', label: 'Sales', align: 'right', render: (r) => fmtCurrency(r.sales_value) },
      { key: 'cost_value', label: 'Cost', align: 'right', render: (r) => fmtCurrency(r.cost_value) },
      { key: 'gross_profit', label: 'Gross Profit', align: 'right', render: (r) => <span className="font-bold text-emerald-700">{fmtCurrency(r.gross_profit)}</span> },
      { key: 'margin_percent', label: 'Margin', align: 'right', render: (r) => fmtPct(r.margin_percent) },
    ],
    'customer-profitability': [
      { key: 'customer', label: 'Customer' },
      { key: 'invoice_count', label: 'Invoices', align: 'right' },
      { key: 'revenue', label: 'Revenue', align: 'right', render: (r) => fmtCurrency(r.revenue) },
      { key: 'gross_profit', label: 'Gross Profit', align: 'right', render: (r) => <span className="font-bold text-emerald-700">{fmtCurrency(r.gross_profit)}</span> },
      { key: 'margin_percent', label: 'Margin', align: 'right', render: (r) => fmtPct(r.margin_percent) },
    ],
    'branch-profitability': [
      { key: 'branch', label: 'Branch' },
      { key: 'invoice_count', label: 'Invoices', align: 'right' },
      { key: 'revenue', label: 'Revenue', align: 'right', render: (r) => fmtCurrency(r.revenue) },
      { key: 'cogs', label: 'COGS', align: 'right', render: (r) => fmtCurrency(r.cogs) },
      { key: 'gross_profit', label: 'Gross Profit', align: 'right', render: (r) => <span className="font-bold text-emerald-700">{fmtCurrency(r.gross_profit)}</span> },
      { key: 'margin_percent', label: 'Margin', align: 'right', render: (r) => fmtPct(r.margin_percent) },
    ],
    'receivables-aging': [
      { key: 'customer', label: 'Customer' },
      { key: 'current', label: 'Current', align: 'right', render: (r) => fmtCurrency(r.current) },
      { key: '1_30', label: '1-30', align: 'right', render: (r) => fmtCurrency(r['1_30']) },
      { key: '31_60', label: '31-60', align: 'right', render: (r) => fmtCurrency(r['31_60']) },
      { key: '61_90', label: '61-90', align: 'right', render: (r) => fmtCurrency(r['61_90']) },
      { key: 'over_90', label: '90+', align: 'right', render: (r) => fmtCurrency(r.over_90) },
      { key: 'total', label: 'Total', align: 'right', render: (r) => <span className="font-bold">{fmtCurrency(r.total)}</span> },
    ],
    'payables-aging': [
      { key: 'supplier', label: 'Supplier' },
      { key: 'current', label: 'Current', align: 'right', render: (r) => fmtCurrency(r.current) },
      { key: '1_30', label: '1-30', align: 'right', render: (r) => fmtCurrency(r['1_30']) },
      { key: '31_60', label: '31-60', align: 'right', render: (r) => fmtCurrency(r['31_60']) },
      { key: '61_90', label: '61-90', align: 'right', render: (r) => fmtCurrency(r['61_90']) },
      { key: 'over_90', label: '90+', align: 'right', render: (r) => fmtCurrency(r.over_90) },
      { key: 'total', label: 'Total', align: 'right', render: (r) => <span className="font-bold">{fmtCurrency(r.total)}</span> },
    ],
    // --- INVENTORY
    'stock-summary': [
      { key: 'product', label: 'Product' },
      { key: 'sku', label: 'SKU' },
      { key: 'quantity', label: 'Qty', align: 'right' },
      { key: 'unit_price', label: 'Unit Price', align: 'right', render: (r) => fmtCurrency(r.unit_price) },
      { key: 'stock_value', label: 'Stock Value', align: 'right', render: (r) => <span className="font-bold">{fmtCurrency(r.stock_value)}</span> },
    ],
    'low-stock': [
      { key: 'product', label: 'Product' },
      { key: 'sku', label: 'SKU' },
      { key: 'quantity', label: 'Qty', align: 'right' },
      { key: 'reorder_level', label: 'Reorder Level', align: 'right' },
    ],
    'stock-movement': [
      { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
      { key: 'product', label: 'Product' },
      { key: 'type', label: 'Type' },
      { key: 'quantity', label: 'Qty', align: 'right' },
      { key: 'reference', label: 'Reference' },
    ],
    // --- GST
    'gstr-1': [
      { key: 'invoice_no', label: 'Invoice' },
      { key: 'invoice_date', label: 'Date', render: (r) => fmtDate(r.invoice_date) },
      { key: 'customer_name', label: 'Party' },
      { key: 'gstin', label: 'GSTIN' },
      { key: 'taxable_value', label: 'Taxable', align: 'right', render: (r) => fmtCurrency(r.taxable_value) },
      { key: 'cgst', label: 'CGST', align: 'right', render: (r) => fmtCurrency(r.cgst) },
      { key: 'sgst', label: 'SGST', align: 'right', render: (r) => fmtCurrency(r.sgst) },
      { key: 'igst', label: 'IGST', align: 'right', render: (r) => fmtCurrency(r.igst) },
      { key: 'total_tax', label: 'Tax', align: 'right', render: (r) => fmtCurrency(r.total_tax) },
      { key: 'total_value', label: 'Total', align: 'right', render: (r) => fmtCurrency(r.total_value) },
    ],
    'gst-summary': [
      { key: 'period', label: 'Period' },
      { key: 'taxable_value', label: 'Taxable', align: 'right', render: (r) => fmtCurrency(r.taxable_value) },
      { key: 'cgst', label: 'CGST', align: 'right', render: (r) => fmtCurrency(r.cgst) },
      { key: 'sgst', label: 'SGST', align: 'right', render: (r) => fmtCurrency(r.sgst) },
      { key: 'igst', label: 'IGST', align: 'right', render: (r) => fmtCurrency(r.igst) },
      { key: 'total_tax', label: 'Total Tax', align: 'right', render: (r) => fmtCurrency(r.total_tax) },
    ],
    'gst-rate-wise': [
      { key: 'rate', label: 'Rate %', align: 'right', render: (r) => `${safeNum(r.rate)}%` },
      { key: 'taxable_value', label: 'Taxable', align: 'right', render: (r) => fmtCurrency(r.taxable_value) },
      { key: 'cgst', label: 'CGST', align: 'right', render: (r) => fmtCurrency(r.cgst) },
      { key: 'sgst', label: 'SGST', align: 'right', render: (r) => fmtCurrency(r.sgst) },
      { key: 'igst', label: 'IGST', align: 'right', render: (r) => fmtCurrency(r.igst) },
      { key: 'total_tax', label: 'Total Tax', align: 'right', render: (r) => fmtCurrency(r.total_tax) },
    ],
    // --- EXPENSES
    'expense-summary': [
      { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
      { key: 'category', label: 'Category' },
      { key: 'vendor', label: 'Vendor' },
      { key: 'description', label: 'Description' },
      { key: 'amount', label: 'Amount', align: 'right', render: (r) => fmtCurrency(r.amount) },
    ],
  }), []);

  const normalizedRows = useMemo<Row[]>(() => {
    if (activeSubReport !== 'gst-summary') return subReport.rows;
    const node = subReport.raw?.data;
    if (!node || typeof node !== 'object' || Array.isArray(node)) return subReport.rows;
    const root = node as Record<string, any>;
    const outward = root.outward ?? {};
    const inward = root.inward ?? {};
    const itc = root.input_tax_credit ?? {};
    const liability = root.net_liability ?? {};
    return [
      {
        period: `${dateFrom} to ${dateTo} — Outward`,
        taxable_value: safeNum(outward.taxable_value),
        cgst: safeNum(outward.cgst),
        sgst: safeNum(outward.sgst),
        igst: safeNum(outward.igst),
        total_tax: safeNum(outward.total_tax),
      },
      {
        period: `${dateFrom} to ${dateTo} — Inward`,
        taxable_value: safeNum(inward.taxable_value),
        cgst: safeNum(inward.cgst),
        sgst: safeNum(inward.sgst),
        igst: safeNum(inward.igst),
        total_tax: safeNum(inward.total_tax),
      },
      {
        period: `${dateFrom} to ${dateTo} — Input Tax Credit`,
        taxable_value: safeNum(inward.taxable_value),
        cgst: safeNum(itc.cgst_itc),
        sgst: safeNum(itc.sgst_itc),
        igst: safeNum(itc.igst_itc),
        total_tax: safeNum(itc.total_itc),
      },
      {
        period: `${dateFrom} to ${dateTo} — Net Liability`,
        taxable_value: 0,
        cgst: safeNum(liability.cgst),
        sgst: safeNum(liability.sgst),
        igst: safeNum(liability.igst),
        total_tax: safeNum(liability.total),
      },
    ];
  }, [activeSubReport, subReport.raw, subReport.rows, dateFrom, dateTo]);

  const activeColumns = subReportPath ? columnMap[activeSubReport] ?? [] : [];
  const isStatement = STATEMENT_REPORTS.has(activeSubReport);
  const isInvoiceProfitability = activeSubReport === 'invoice-profitability';

  const companyName = companies.find((c) => c.id === companyId)?.name;
  const branchName = branches.find((b) => b.id === branchId)?.name;

  return (
    <>
      <style>{`
        .reports-fadeIn { animation: fadeIn .2s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        @media print { .no-print { display: none !important; } }
      `}</style>

      <div className="reports-shell min-h-full bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100/60">
        <div className="mx-auto w-full max-w-[1900px] space-y-5 p-3 sm:p-4 lg:space-y-6 lg:p-6">

          {/* Hero */}
          <section className="no-print relative overflow-hidden rounded-2xl border border-slate-800/10 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-5 py-6 shadow-[0_20px_40px_-20px_rgba(15,23,42,0.45)] sm:px-7 lg:px-8">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
            <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200 backdrop-blur">
                  <FiBarChart2 size={12} /> Reporting · Analytics
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Reports workspace</h1>
                <p className="mt-1.5 max-w-2xl text-sm text-slate-300">
                  Sales, purchases, accounts, GST, inventory and profitability — powered by live API data.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white backdrop-blur sm:inline-flex">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <FiDatabase size={12} /> Live
                </div>
                <Button
                  variant="outline" onClick={refreshAll} disabled={isLoadingAny}
                  className="h-10 rounded-xl border-white/10 bg-white/5 text-white hover:bg-white/10"
                >
                  <FiRefreshCw className={cn('mr-2', isLoadingAny && 'animate-spin')} size={14} />
                  Refresh
                </Button>
              </div>
            </div>
          </section>

          {/* Category grid */}
          <section className="no-print grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
            {REPORT_CATEGORIES.map((c) => {
              const active = activeCategory === c.key;
              return (
                <button
                  key={c.key} type="button"
                  onClick={() => { setActiveCategory(c.key); setActiveSubReport(''); setSearch(''); setPage(1); }}
                  className={cn(
                    'group relative overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200',
                    active
                      ? 'border-indigo-300 bg-indigo-50/60 ring-1 ring-indigo-500/10'
                      : 'border-slate-200/80 bg-white hover:-translate-y-0.5 hover:border-slate-300',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={cn('text-[11px] font-semibold uppercase tracking-[0.14em]', active ? 'text-indigo-500' : 'text-slate-400')}>
                        {c.label}
                      </p>
                      <p className="mt-1.5 truncate text-xs text-slate-500">{c.description}</p>
                    </div>
                    <div className={cn(
                      'grid h-9 w-9 shrink-0 place-items-center rounded-xl transition',
                      active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 group-hover:bg-slate-900 group-hover:text-white',
                    )}>
                      {c.icon}
                    </div>
                  </div>
                </button>
              );
            })}
          </section>

          {/* ============== FILTERS (collapsed by default) ============== */}
          <Card className="no-print overflow-hidden rounded-2xl border-slate-200/80">
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              className="flex w-full items-center justify-between gap-3 bg-white px-4 py-3.5 text-left transition hover:bg-slate-50 sm:px-5"
              aria-expanded={showFilters}
            >
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-50 text-indigo-600 ring-1 ring-indigo-500/10">
                  <FiFilter size={14} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Report filters</p>
                  <p className="text-[11px] text-slate-500">
                    {activeFilterCount > 0
                      ? `${activeFilterCount} active filter${activeFilterCount > 1 ? 's' : ''} · ${dateFrom} → ${dateTo}`
                      : `${dateFrom} → ${dateTo} · click to expand`}
                  </p>
                </div>
                {activeFilterCount > 0 && (
                  <span className="ml-1 inline-flex h-5 items-center rounded-full bg-indigo-600 px-2 text-[10px] font-bold text-white">
                    {activeFilterCount}
                  </span>
                )}
              </div>
              <FiChevronDown
                size={16}
                className={cn('text-slate-400 transition-transform', showFilters && 'rotate-180')}
              />
            </button>

            {showFilters && (
              <CardContent className="reports-fadeIn border-t border-slate-100 bg-white p-4 sm:p-5">
                <div className="grid gap-3 lg:grid-cols-12">
                  <div className="relative lg:col-span-4">
                    <FiSearch className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search within report…"
                      autoComplete="off"
                      spellCheck={false}
                      className="h-10 rounded-xl border-slate-200 pl-10"
                    />
                  </div>

                  <div className="relative lg:col-span-2">
                    <FiBriefcase className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <select
                      aria-label="Company"
                      value={companyId === '' ? '' : String(companyId)}
                      onChange={(e) => setCompanyId(e.target.value === '' ? '' : Number(e.target.value))}
                      className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-9 pr-8 text-sm font-medium text-slate-700 outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                    >
                      <option value="">All companies</option>
                      {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  </div>

                  <div className="relative lg:col-span-2">
                    <FiMapPin className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <select
                      aria-label="Branch"
                      value={branchId === '' ? '' : String(branchId)}
                      onChange={(e) => setBranchId(e.target.value === '' ? '' : Number(e.target.value))}
                      className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-9 pr-8 text-sm font-medium text-slate-700 outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                    >
                      <option value="">All branches</option>
                      {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  </div>

                  <div className="relative lg:col-span-2">
                    <FiCalendar className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <Input type="date" aria-label="From" value={dateFrom} max={dateTo}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="h-10 rounded-xl border-slate-200 pl-9" />
                  </div>

                  <div className="relative lg:col-span-2">
                    <FiCalendar className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <Input type="date" aria-label="To" value={dateTo} min={dateFrom} max={today()}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="h-10 rounded-xl border-slate-200 pl-9" />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <div className="flex items-center rounded-xl border border-slate-200 bg-white p-0.5">
                    {[
                      { key: 'today', label: 'Today' },
                      { key: '7d', label: '7d' },
                      { key: '30d', label: '30d' },
                      { key: '90d', label: '90d' },
                      { key: 'fy', label: 'This FY' },
                    ].map((p) => (
                      <button
                        key={p.key} type="button"
                        onClick={() => {
                          const now = today();
                          if (p.key === 'today') { setDateFrom(now); setDateTo(now); }
                          else if (p.key === '7d') {
                            const d = new Date(); d.setDate(d.getDate() - 6);
                            setDateFrom(d.toISOString().slice(0, 10)); setDateTo(now);
                          } else if (p.key === '30d') {
                            const d = new Date(); d.setDate(d.getDate() - 29);
                            setDateFrom(d.toISOString().slice(0, 10)); setDateTo(now);
                          } else if (p.key === '90d') {
                            const d = new Date(); d.setDate(d.getDate() - 89);
                            setDateFrom(d.toISOString().slice(0, 10)); setDateTo(now);
                          } else { setDateFrom(fyStart()); setDateTo(now); }
                        }}
                        className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  <div className="relative">
                    <select
                      aria-label="Financial year"
                      value={financialYear}
                      onChange={(e) => {
                        const v = e.target.value;
                        setFinancialYear(v);
                        const [start] = v.split('-');
                        setDateFrom(`${start}-04-01`);
                        setDateTo(`${Number(start) + 1}-03-31`);
                      }}
                      className="h-9 appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-8 text-xs font-medium text-slate-700 outline-none hover:border-slate-300 focus:border-indigo-400"
                    >
                      <option value="2026-2027">FY 2026-2027</option>
                      <option value="2025-2026">FY 2025-2026</option>
                      <option value="2024-2025">FY 2024-2025</option>
                      <option value="2023-2024">FY 2023-2024</option>
                    </select>
                    <FiChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
                  </div>

                  {showAdvanced && (
                    <div className="relative">
                      <select
                        aria-label="Rows per page"
                        value={perPage}
                        onChange={(e) => setPerPage(Number(e.target.value))}
                        className="h-9 appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-8 text-xs font-medium text-slate-700 outline-none hover:border-slate-300 focus:border-indigo-400"
                      >
                        {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} rows</option>)}
                      </select>
                      <FiChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
                    </div>
                  )}

                  <Button variant="outline" size="sm" onClick={() => setShowAdvanced((v) => !v)} className="h-9 rounded-lg">
                    More filters
                    <FiChevronDown size={14} className={cn('ml-1.5 transition-transform', showAdvanced && 'rotate-180')} />
                  </Button>

                  {activeFilterCount > 0 && (
                    <button
                      type="button"
                      onClick={clearAdvanced}
                      className="ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                    >
                      <FiXCircle size={12} /> Clear advanced filters
                    </button>
                  )}
                  <Button variant="ghost" size="sm" onClick={resetAll} className="h-9 rounded-lg text-slate-500 hover:text-slate-800">
                    <FiXCircle className="mr-1.5" size={14} /> Reset all
                  </Button>
                </div>

                {activeFilterCount > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Active:</span>
                    {companyName && (
                      <FilterChip label={`Company: ${companyName}`} onRemove={() => setCompanyId('')} />
                    )}
                    {branchName && (
                      <FilterChip label={`Branch: ${branchName}`} onRemove={() => setBranchId('')} />
                    )}
                    {search.trim() && (
                      <FilterChip label={`Search: "${search.trim()}"`} onRemove={() => setSearch('')} />
                    )}
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          {/* ============== REPORT SURFACE ============== */}
          <Card className="overflow-hidden rounded-2xl border-slate-200/80">
            {SUB_REPORTS[activeCategory].length > 0 && (
              <div className="no-print border-b border-slate-100 bg-slate-50/70 px-3 py-3 sm:px-4">
                <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                  {SUB_REPORTS[activeCategory].map((r) => {
                    const active = activeSubReport === r.key;
                    return (
                      <button
                        key={r.key} type="button"
                        onClick={() => { setActiveSubReport(r.key); setSearch(''); setPage(1); }}
                        className={cn(
                          'inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition',
                          active
                            ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                        )}
                      >
                        {r.icon}{r.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <CardContent className="bg-white p-4 sm:p-6">
              {activeCategory === 'dashboard' && (
                <DashboardView
                  summary={dashSummary}
                  loading={dashboard.loading}
                  error={dashboard.error}
                  onRefresh={dashboard.refresh}
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                />
              )}

              {activeCategory !== 'dashboard' && !activeSubReport && (
                <EmptyState
                  title={`${REPORT_CATEGORIES.find((c) => c.key === activeCategory)?.label} reports`}
                  description="Select a report from the navigation above to view live data."
                  icon={<FiLayers size={22} />}
                />
              )}

              {activeCategory !== 'dashboard' && activeSubReport && isStatement && (
                <div className="reports-fadeIn">
                  <StatementView
                    kind={activeSubReport}
                    raw={subReport.raw}
                    summary={subReport.summary}
                    loading={subReport.loading}
                    error={subReport.error}
                    onRefresh={subReport.refresh}
                  />
                </div>
              )}

              {activeCategory !== 'dashboard' && isInvoiceProfitability && (
                <div className="reports-fadeIn">
                  <InvoiceProfitabilityView
                    rows={subReport.rows}
                    summary={subReport.summary}
                    meta={subReport.meta}
                    loading={subReport.loading}
                    error={subReport.error}
                    onRefresh={subReport.refresh}
                    onPage={setPage}
                    onExportCSV={() =>
                      exportCSV(subReport.rows, billWiseColumns, `bill-wise-profitability-${dateFrom}-${dateTo}.csv`)
                    }
                  />
                </div>
              )}

              {activeCategory !== 'dashboard' && activeSubReport && !isStatement && !isInvoiceProfitability && activeColumns.length > 0 && (
                <div className="reports-fadeIn">
                  <ReportTable
                    title={SUB_REPORTS[activeCategory].find((r) => r.key === activeSubReport)?.label ?? ''}
                    description="Live backend data — automatically excludes deleted records"
                    columns={activeColumns}
                    rows={normalizedRows}
                    loading={subReport.loading}
                    error={subReport.error}
                    meta={subReport.meta}
                    onPage={setPage}
                    onRefresh={subReport.refresh}
                    onExportCSV={() => exportCSV(normalizedRows, activeColumns, `${activeSubReport}-${dateFrom}-${dateTo}.csv`)}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <footer className="no-print flex flex-col gap-2 px-1 text-[11px] text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <span>Business reports · Live API data</span>
            <span className="inline-flex items-center gap-1">
              <FiActivity size={12} />
              {isLoadingAny ? 'Refreshing…' : 'Up to date'}
            </span>
          </footer>
        </div>
      </div>
    </>
  );
}

/* ==================================================================
 * DASHBOARD
 * ================================================================== */

function DashboardView({
  summary, loading, error, onRefresh, dateFrom, dateTo,
}: {
  summary: {
    sales: number; purchases: number; receivables: number; payables: number;
    totalPayments: number; profit: number; invoiceCount: number;
    purchaseCount: number; paymentCount: number; stockValue: number; stockQty: number;
  };
  loading: boolean; error: string | null; onRefresh: () => void;
  dateFrom: string; dateTo: string;
}) {
  const printRef = useRef<HTMLDivElement>(null);

  if (error) return <ErrorState message={error} onRetry={onRefresh} />;

  return (
    <div ref={printRef} data-report-root className="reports-fadeIn">
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-600">
            <FiActivity size={14} /> Business overview
          </div>
          <h2 className="text-2xl font-black tracking-tight text-slate-950">Financial snapshot</h2>
          <p className="mt-1 text-sm text-slate-500">{dateFrom} — {dateTo}</p>
        </div>
        <button
          type="button"
          onClick={() => printReport(printRef.current, { title: 'Financial Snapshot', subtitle: `${dateFrom} — ${dateTo}` })}
          className="no-print inline-flex items-center gap-1.5 self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50"
        >
          <FiPrinter size={12} /> Print A4
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total Sales" value={fmtCurrency(summary.sales)} count={`${fmtNumber(summary.invoiceCount)} invoices`} icon={<FiShoppingCart />} tone="cyan" loading={loading} />
        <StatCard title="Total Purchases" value={fmtCurrency(summary.purchases)} count={`${fmtNumber(summary.purchaseCount)} purchases`} icon={<FiPackage />} tone="blue" loading={loading} />
        <StatCard title="Receivables" value={fmtCurrency(summary.receivables)} count="Unpaid sales" icon={<FiArrowDownRight />} tone="amber" loading={loading} />
        <StatCard title="Payables" value={fmtCurrency(summary.payables)} count="Unpaid purchases" icon={<FiArrowUpRight />} tone="rose" loading={loading} />
        <StatCard title="Payments" value={fmtCurrency(summary.totalPayments)} count={`${fmtNumber(summary.paymentCount)} payments`} icon={<FiDollarSign />} tone="violet" loading={loading} />
        <StatCard title="Net Difference" value={fmtCurrency(summary.profit)} count="Sales minus purchases" icon={<FiTrendingUp />} tone={summary.profit >= 0 ? 'emerald' : 'rose'} loading={loading} />
        <StatCard title="Stock Value" value={fmtCurrency(summary.stockValue)} count={`${fmtNumber(summary.stockQty)} units on hand`} icon={<FiPackage />} tone="emerald" loading={loading} />
        <StatCard title="Cash Position" value={fmtCurrency(summary.totalPayments)} count="Total recorded payments" icon={<FiDollarSign />} tone="slate" loading={loading} />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-bold text-slate-900">Sales vs Purchases</h3>
          <Bar label="Sales" value={summary.sales} max={Math.max(summary.sales, summary.purchases, 1)} tone="cyan" />
          <Bar label="Purchases" value={summary.purchases} max={Math.max(summary.sales, summary.purchases, 1)} tone="blue" />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-bold text-slate-900">Receivables vs Payables</h3>
          <Bar label="Receivables" value={summary.receivables} max={Math.max(summary.receivables, summary.payables, 1)} tone="amber" />
          <Bar label="Payables" value={summary.payables} max={Math.max(summary.receivables, summary.payables, 1)} tone="rose" />
        </div>
      </div>
    </div>
  );
}

function Bar({ label, value, max, tone }: { label: string; value: number; max: number; tone: 'cyan' | 'blue' | 'amber' | 'rose' }) {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const map = { cyan: 'bg-cyan-500', blue: 'bg-blue-500', amber: 'bg-amber-500', rose: 'bg-rose-500' };
  return (
    <div className="mb-5 last:mb-0">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-600">{label}</span>
        <span className="text-xs font-bold text-slate-900">{fmtCurrency(value)}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div className={cn('h-full rounded-full transition-all duration-500', map[tone])} style={{ width: `${w}%` }} />
      </div>
    </div>
  );
}

/* ==================================================================
 * STATEMENTS (P&L, Balance Sheet, Cash Flow)
 * ================================================================== */

interface PLDetailed {
  revenue?: {
    gross_sales?: number; sales_returns?: number; sales_discounts?: number; net_sales?: number;
  };
  cogs?: {
    opening_stock?: number | null; purchases?: number; purchase_returns?: number;
    closing_stock?: number | null; cost_of_goods_sold?: number;
    direct_costs?: number; method?: string; opening_closing_stock_available?: boolean;
  };
  gross_profit?: number;
  gross_margin?: number;
  operating_expenses?: Array<{ name?: string; amount?: number }>;
  total_operating_expenses?: number;
  operating_profit?: number;
  other_income?: number;
  other_expenses?: number;
  net_profit?: number;
  net_margin?: number;
  management_reference?: { purchase_taxable?: number; purchase_net_taxable?: number; purchase_gst?: number; purchase_grand_total?: number };
  data_quality?: { missing_cost_lines?: number; expense_source?: string; note?: string };
}

function extractStatementPayload(raw: Record<string, unknown> | null): Record<string, unknown> {
  if (!raw) return {};

  let node: unknown = raw;
  for (let i = 0; i < 2; i++) {
    if (
      node &&
      typeof node === 'object' &&
      !Array.isArray(node) &&
      'data' in (node as object)
    ) {
      const next = (node as { data?: unknown }).data;
      if (next !== undefined && next !== null && next !== '') {
        node = next;
        continue;
      }
    }
    break;
  }

  if (Array.isArray(node)) {
    if (node.length === 0) return {};
    if (node.length === 1 && node[0] && typeof node[0] === 'object' && !Array.isArray(node[0])) {
      return node[0] as Record<string, unknown>;
    }
    const agg: Record<string, number> = {};
    for (const row of node) {
      if (!row || typeof row !== 'object') continue;
      for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
        const n = typeof v === 'number' ? v : Number.parseFloat(String(v ?? ''));
        if (Number.isFinite(n)) agg[k] = (agg[k] ?? 0) + n;
      }
    }
    return agg;
  }

  if (node && typeof node === 'object') {
    return node as Record<string, unknown>;
  }

  return {};
}

function StatementView({
  kind, raw, summary, loading, error, onRefresh,
}: {
  kind: string;
  raw: Record<string, unknown> | null;
  summary: Record<string, number> | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const printRef = useRef<HTMLElement>(null);

  const payload = useMemo<Record<string, unknown>>(
    () => extractStatementPayload(raw),
    [raw],
  );

  const headerTitle = useMemo(() => {
    if (kind === 'profit-loss' || kind === 'pl-overview') return 'Profit & Loss Statement';
    if (kind === 'balance-sheet') return 'Balance Sheet';
    if (kind === 'cash-flow') return 'Cash Flow Statement';
    return humanize(kind);
  }, [kind]);

  if (error) return <ErrorState message={error} onRetry={onRefresh} />;
  if (loading) return <LoadingBlock label={`Loading ${humanize(kind)}…`} />;

  const isPLDetailed = Boolean(
    payload.revenue && typeof payload.revenue === 'object' && !Array.isArray(payload.revenue),
  );

  return (
    <section ref={printRef} data-report-root>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-black tracking-tight text-slate-950 sm:text-xl">{headerTitle}</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Actual figures returned from the reporting API — deleted records excluded
          </p>
        </div>
        <button
          type="button" onClick={() => printReport(printRef.current, { title: headerTitle })}
          className="no-print inline-flex items-center gap-1.5 self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50"
        >
          <FiPrinter size={12} /> Print A4
        </button>
      </div>

      {(kind === 'profit-loss' || kind === 'pl-overview') && (
        isPLDetailed
          ? <PLDetailedView data={payload as unknown as PLDetailed} />
          : <PLSummaryView payload={payload} summary={summary} />
      )}

      {kind === 'balance-sheet' && <BalanceSheetView payload={payload} summary={summary} />}

      {kind === 'cash-flow' && <CashFlowView payload={payload} summary={summary} />}
    </section>
  );
}

function PLDetailedView({ data }: { data: PLDetailed }) {
  const rev = data.revenue ?? {};
  const cogs = data.cogs ?? {};
  const opex = Array.isArray(data.operating_expenses) ? data.operating_expenses : [];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Net Sales" value={fmtCurrency(rev.net_sales)} />
        <Kpi label="COGS" value={fmtCurrency(cogs.cost_of_goods_sold)} />
        <Kpi label="Gross Profit" value={fmtCurrency(data.gross_profit)} />
        <Kpi
          label="Net Profit"
          value={fmtCurrency(data.net_profit)}
          highlight
          tone={safeNum(data.net_profit) >= 0 ? 'emerald' : 'rose'}
        />
      </div>

      {((data.data_quality?.missing_cost_lines ?? 0) > 0 || data.data_quality?.expense_source === 'not_available') && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
          {data.data_quality?.missing_cost_lines ? (
            <div><strong>{data.data_quality.missing_cost_lines}</strong> sold/returned item line(s) do not have a known purchase cost. Their COGS currently uses ₹0 only as a calculation placeholder, so this P&L should be reviewed before final accounts.</div>
          ) : null}
          {data.data_quality?.expense_source === 'not_available' ? (
            <div className="mt-1">No recognized expenses table was available. Net profit therefore excludes operating expenses rather than inventing an amount.</div>
          ) : null}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <PLSection title="Revenue">
          <PLRow label="Gross Sales" value={rev.gross_sales} />
          <PLRow label="Less: Sales Returns" value={rev.sales_returns} negative />
          <PLRow label="Less: Discounts" value={rev.sales_discounts} negative />
          <PLTotalRow label="Net Sales" value={rev.net_sales} />
        </PLSection>

        <PLSection title="Cost of Goods Sold">
          <PLRow label="Purchases (management reference)" value={cogs.purchases} />
          <PLRow label="Purchase Returns" value={cogs.purchase_returns} negative />
          <PLRow label="Direct Costs" value={cogs.direct_costs} />
          <PLTotalRow label="COGS (Actual Goods Sold)" value={cogs.cost_of_goods_sold} />
          <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-500">
            COGS is calculated from actual quantity sold × latest known purchase cost on or before the sale date. Purchases are not directly treated as an expense.
          </div>
        </PLSection>

        <div className="mb-5 rounded-xl bg-emerald-50 p-4">
          <div className="flex items-center justify-between text-base font-bold text-emerald-900">
            <span>Gross Profit</span>
            <span>{fmtCurrency(data.gross_profit)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-emerald-700">
            <span>Gross Margin</span>
            <span>{fmtPct(data.gross_margin)}</span>
          </div>
        </div>

        <PLSection title="Operating Expenses">
          {opex.length === 0 ? (
            <div className="py-2 text-xs text-slate-500">No operating expenses recorded.</div>
          ) : opex.map((e, i) => (
            <PLRow key={i} label={e.name || `Expense ${i + 1}`} value={e.amount} />
          ))}
          <PLTotalRow label="Total Operating Expenses" value={data.total_operating_expenses} />
        </PLSection>

        <div className="mb-5 rounded-xl bg-blue-50 p-4">
          <div className="flex items-center justify-between text-base font-bold text-blue-900">
            <span>Operating Profit</span>
            <span>{fmtCurrency(data.operating_profit)}</span>
          </div>
        </div>

        <PLSection title="Other">
          <PLRow label="Add: Other Income" value={data.other_income} positive />
          <PLRow label="Less: Other Expenses" value={data.other_expenses} negative />
        </PLSection>

        <div className={cn(
          'rounded-xl p-4',
          safeNum(data.net_profit) >= 0
            ? 'bg-emerald-50'
            : 'bg-rose-50',
        )}>
          <div className="flex items-center justify-between text-lg font-black text-slate-900">
            <span>Net Profit</span>
            <span className={safeNum(data.net_profit) >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
              {fmtCurrency(data.net_profit)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm text-slate-600">
            <span>Net Margin</span>
            <span className={safeNum(data.net_margin) >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
              {fmtPct(data.net_margin)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PLSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-5">
      <h4 className="mb-2 text-sm font-bold text-slate-900">{title}</h4>
      <div className="space-y-1.5 border-b border-slate-100 pb-4">{children}</div>
    </div>
  );
}

function PLRow({ label, value, negative, positive }: { label: string; value?: number; negative?: boolean; positive?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-600">{label}</span>
      <span className={cn(
        'font-semibold',
        negative ? 'text-rose-600' : positive ? 'text-emerald-600' : 'text-slate-800',
      )}>
        {negative ? `(${fmtCurrency(value)})` : fmtCurrency(value)}
      </span>
    </div>
  );
}

function PLTotalRow({ label, value }: { label: string; value?: number }) {
  return (
    <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-sm font-bold text-slate-900">
      <span>{label}</span>
      <span>{fmtCurrency(value)}</span>
    </div>
  );
}

function PLSummaryView({
  payload, summary,
}: {
  payload: Record<string, unknown>;
  summary: Record<string, number> | null;
}) {
  const merged: Record<string, number> = useMemo(() => {
    const out: Record<string, number> = {};
    if (summary) Object.entries(summary).forEach(([k, v]) => { out[k] = safeNum(v); });
    Object.entries(payload).forEach(([k, v]) => {
      if (typeof v === 'number' || (typeof v === 'string' && !Number.isNaN(Number(v)))) {
        out[k] = safeNum(v);
      }
    });
    return out;
  }, [payload, summary]);

  const keys = Object.keys(merged);
  if (keys.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
        No Profit &amp; Loss data was returned for this period.
      </div>
    );
  }

  const highlightKeys = ['gross_revenue', 'cogs', 'gross_profit', 'net_profit', 'net_revenue', 'operating_profit'];
  const highlighted = highlightKeys.filter((k) => k in merged);

  return (
    <div className="space-y-5">
      {highlighted.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {highlighted.map((k) => (
            <Kpi
              key={k}
              label={humanize(k)}
              value={fmtCurrency(merged[k])}
              highlight={k === 'net_profit'}
              tone={k === 'net_profit' ? (merged[k] >= 0 ? 'emerald' : 'rose') : undefined}
            />
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h4 className="mb-3 text-sm font-bold text-slate-900">All figures</h4>
        <div className="space-y-1.5">
          {keys.map((k) => (
            <div key={k} className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0">
              <span className="text-slate-600">{humanize(k)}</span>
              <span className="font-semibold text-slate-900">{fmtCurrency(merged[k])}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BalanceSheetView({
  payload, summary,
}: {
  payload: Record<string, unknown>;
  summary: Record<string, number> | null;
}) {
  const assets = (payload.assets ?? {}) as Record<string, unknown>;
  const liabilities = (payload.liabilities ?? {}) as Record<string, unknown>;
  const equity = (payload.equity ?? {}) as Record<string, unknown>;

  const hasStructure =
    Object.keys(assets).length > 0 ||
    Object.keys(liabilities).length > 0 ||
    Object.keys(equity).length > 0;

  const flat = useMemo<Record<string, number>>(() => {
    if (hasStructure) return {};
    const out: Record<string, number> = {};
    if (summary) Object.entries(summary).forEach(([k, v]) => { out[k] = safeNum(v); });
    Object.entries(payload).forEach(([k, v]) => {
      if (typeof v === 'number' || (typeof v === 'string' && !Number.isNaN(Number(v)))) {
        out[k] = safeNum(v);
      }
    });
    return out;
  }, [payload, summary, hasStructure]);

  if (!hasStructure && Object.keys(flat).length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
        No Balance Sheet data was returned for this period.
      </div>
    );
  }

  if (!hasStructure) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        {Object.entries(flat).map(([k, v]) => (
          <div key={k} className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0">
            <span className="text-slate-600">{humanize(k)}</span>
            <span className="font-semibold text-slate-900">{fmtCurrency(v)}</span>
          </div>
        ))}
      </div>
    );
  }

  const renderBlock = (title: string, block: Record<string, unknown>) => (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h4 className="mb-3 text-sm font-bold text-slate-900">{title}</h4>
      {Object.entries(block).map(([k, v]) => (
        <div key={k} className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0">
          <span className="text-slate-600">{humanize(k)}</span>
          <span className="font-semibold text-slate-900">{fmtCurrency(v)}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {renderBlock('Assets', assets)}
      <div className="space-y-5">
        {renderBlock('Liabilities', liabilities)}
        {renderBlock('Equity', equity)}
      </div>
    </div>
  );
}

function CashFlowView({
  payload, summary,
}: {
  payload: Record<string, unknown>;
  summary: Record<string, number> | null;
}) {
  const inflows = Array.isArray(payload.inflows) ? payload.inflows as Array<Record<string, unknown>> : [];
  const outflows = Array.isArray(payload.outflows) ? payload.outflows as Array<Record<string, unknown>> : [];

  const hasStructured = inflows.length > 0 || outflows.length > 0;

  const flat = useMemo<Record<string, number>>(() => {
    if (hasStructured) return {};
    const out: Record<string, number> = {};
    if (summary) Object.entries(summary).forEach(([k, v]) => { out[k] = safeNum(v); });
    Object.entries(payload).forEach(([k, v]) => {
      if (typeof v === 'number' || (typeof v === 'string' && !Number.isNaN(Number(v)))) {
        out[k] = safeNum(v);
      }
    });
    return out;
  }, [payload, summary, hasStructured]);

  if (!hasStructured && Object.keys(flat).length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
        No Cash Flow data was returned for this period.
      </div>
    );
  }

  if (!hasStructured) {
    const highlights = ['opening_balance', 'net_cash_flow', 'closing_balance'].filter((k) => k in flat);
    return (
      <div className="space-y-5">
        {highlights.length > 0 && (
          <div className="grid gap-4 md:grid-cols-3">
            {highlights.map((k) => (
              <Kpi
                key={k}
                label={humanize(k)}
                value={fmtCurrency(flat[k])}
                highlight={k === 'net_cash_flow'}
                tone={k === 'net_cash_flow' ? (flat[k] >= 0 ? 'emerald' : 'rose') : undefined}
              />
            ))}
          </div>
        )}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          {Object.entries(flat).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0">
              <span className="text-slate-600">{humanize(k)}</span>
              <span className="font-semibold text-slate-900">{fmtCurrency(v)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const totalInflow = inflows.reduce((s, r) => s + safeNum(r.amount), 0);
  const totalOutflow = outflows.reduce((s, r) => s + safeNum(r.amount), 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <Kpi label="Opening Balance" value={fmtCurrency(payload.opening_balance)} />
        <Kpi label="Total Inflow" value={fmtCurrency(totalInflow)} tone="emerald" />
        <Kpi label="Total Outflow" value={fmtCurrency(totalOutflow)} tone="rose" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 bg-emerald-50/60 px-5 py-3">
            <h4 className="text-sm font-bold text-emerald-900">Inflows</h4>
          </div>
          <div className="divide-y divide-slate-100">
            {inflows.length === 0 ? (
              <div className="p-5 text-xs text-slate-500">No inflow entries.</div>
            ) : inflows.map((r, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="text-slate-600">{String(r.category ?? r.description ?? '—')}</span>
                <span className="font-semibold text-emerald-700">{fmtCurrency(r.amount)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 bg-rose-50/60 px-5 py-3">
            <h4 className="text-sm font-bold text-rose-900">Outflows</h4>
          </div>
          <div className="divide-y divide-slate-100">
            {outflows.length === 0 ? (
              <div className="p-5 text-xs text-slate-500">No outflow entries.</div>
            ) : outflows.map((r, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="text-slate-600">{String(r.category ?? r.description ?? '—')}</span>
                <span className="font-semibold text-rose-700">{fmtCurrency(r.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-gradient-to-r from-slate-50 to-cyan-50 p-5">
        <div className="flex items-center justify-between text-lg font-black text-slate-900">
          <span>Closing Balance</span>
          <span className={safeNum(payload.closing_balance) >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
            {fmtCurrency(payload.closing_balance)}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
          <span>Net Cash Flow</span>
          <span>{fmtCurrency(safeNum(payload.net_cash_flow ?? (totalInflow - totalOutflow)))}</span>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label, value, highlight, tone,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  tone?: 'emerald' | 'rose';
}) {
  const bg = highlight
    ? tone === 'rose'
      ? 'border-rose-200 bg-rose-50'
      : 'border-emerald-200 bg-emerald-50'
    : 'border-slate-200 bg-white';
  const text = highlight
    ? tone === 'rose'
      ? 'text-rose-700'
      : 'text-emerald-700'
    : 'text-slate-900';
  return (
    <div className={cn('rounded-lg border p-4', bg)}>
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className={cn('mt-2 text-lg font-bold', text)}>{value}</div>
    </div>
  );
}

export default ReportsPage;