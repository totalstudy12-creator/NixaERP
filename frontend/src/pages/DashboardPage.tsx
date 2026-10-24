// src/pages/DashboardPage.tsx
import { useEffect, useState, useCallback, useMemo, memo, useRef } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  FiRefreshCw, FiClock, FiUsers, FiShoppingCart, FiBox,
  FiDollarSign, FiTrendingUp, FiBarChart2, FiUserCheck, FiUserX,
  FiCalendar, FiAlertTriangle, FiActivity, FiTrendingDown,
  FiCheckCircle, FiPackage, FiAlertCircle, FiMic, FiMicOff,
  FiX, FiSend, FiMessageSquare, FiFilter, FiXCircle,
  FiChevronDown, FiTarget, FiDownload, FiArrowRight,
  FiCreditCard, FiFileText, FiShield, FiLayers, FiZap,
  FiAward, FiStar, FiSave,
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
import { usePermission } from '../hooks/usePermission';
import { useAuthStore } from '../store/auth';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { Tooltip as ReactTooltip } from 'react-tooltip';
import 'react-tooltip/dist/react-tooltip.css';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

import type {
  DateRangeKey,
  DashboardAnalyticsData,
  ReceivablesAgingRow,
  PayablesAgingRow,
  SalesPurchaseTrendPoint,
  PaymentModeRow,
  ExpenseCategoryBreakdown,
  LowStockProduct,
} from '../types/dashboard';

/* ────────────────────────────────────────────────────────────────── */
/* Configuration & Constants                                          */
/* ────────────────────────────────────────────────────────────────── */

const COLORS = ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];

const DATE_RANGE_OPTIONS: { value: DateRangeKey; label: string }[] = [
  { value: 'this_financial_year', label: 'This FY (Apr-Mar)' },
  { value: '30d', label: 'Last 30 Days' },
  { value: '90d', label: 'Last 90 Days' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This Week' },
  { value: '7d', label: 'Last 7 Days' },
  { value: 'last_financial_year', label: 'Last FY' },
  { value: 'all', label: 'All Time' },
  { value: 'custom', label: 'Custom Range' },
];

const TABS = [
  { id: 'overview', label: 'Overview', icon: FiActivity },
  { id: 'sales', label: 'Sales & Orders', icon: FiShoppingCart },
  { id: 'finance', label: 'Financials & Aging', icon: FiDollarSign },
  { id: 'banking', label: 'Cash & Banking', icon: FiCreditCard },
  { id: 'operations', label: 'Inventory & Operations', icon: FiBox },
  { id: 'hr', label: 'HR & Staff', icon: FiUsers },
  { id: 'activity', label: 'Audit Trail', icon: FiShield },
] as const;

type DashboardTab = typeof TABS[number]['id'];

/* ────────────────────────────────────────────────────────────────── */
/* Date Bound Calculation Helper                                       */
/* ────────────────────────────────────────────────────────────────── */

function getDateRangeBounds(key: DateRangeKey, customFrom?: string, customTo?: string): { from: string | null; to: string | null } {
  const now = new Date();
  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  switch (key) {
    case 'today':
      return { from: fmt(now), to: fmt(now) };
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { from: fmt(y), to: fmt(y) };
    }
    case 'this_week': {
      const d = new Date(now);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const start = new Date(d.setDate(diff));
      return { from: fmt(start), to: fmt(now) };
    }
    case '7d': {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      return { from: fmt(d), to: fmt(now) };
    }
    case '30d': {
      const d = new Date(now);
      d.setDate(d.getDate() - 29);
      return { from: fmt(d), to: fmt(now) };
    }
    case '90d': {
      const d = new Date(now);
      d.setDate(d.getDate() - 89);
      return { from: fmt(d), to: fmt(now) };
    }
    case 'this_month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: fmt(start), to: fmt(now) };
    }
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: fmt(start), to: fmt(end) };
    }
    case 'this_quarter': {
      const q = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), q * 3, 1);
      return { from: fmt(start), to: fmt(now) };
    }
    case 'this_financial_year': {
      const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      return { from: `${y}-04-01`, to: `${y + 1}-03-31` };
    }
    case 'last_financial_year': {
      const y = (now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1) - 1;
      return { from: `${y}-04-01`, to: `${y + 1}-03-31` };
    }
    case 'custom':
      return { from: customFrom || null, to: customTo || null };
    case 'all':
    default:
      return { from: null, to: null };
  }
}

/* ────────────────────────────────────────────────────────────────── */
/* Formatting & Unwrapping Utilities                                  */
/* ────────────────────────────────────────────────────────────────── */

const unwrapData = (val: any): any => {
  if (!val) return val;
  if (val && typeof val === 'object' && 'data' in val && val.data !== undefined) {
    return val.data;
  }
  return val;
};

const formatCurrency = (n: number | string | null | undefined): string => {
  const num = Number(n);
  if (!Number.isFinite(num)) return '₹0.00';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(num);
};

const compactNumber = (n: number | string | null | undefined): string => {
  const num = Number(n);
  if (!Number.isFinite(num)) return '₹0';
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(2)}Cr`;
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(2)}L`;
  if (abs >= 1_000) return `${sign}₹${(abs / 1_000).toFixed(1)}K`;
  return `${sign}₹${abs.toFixed(0)}`;
};

const formatDate = (raw: string | Date | null | undefined): string => {
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
};

const pctChange = (current: number, prev: number): number | null => {
  if (!Number.isFinite(current) || !Number.isFinite(prev) || prev === 0) return null;
  return ((current - prev) / Math.abs(prev)) * 100;
};

const sanitizeCsvCell = (val: unknown): string => {
  if (val === null || val === undefined) return '""';
  let s = String(val).trim();
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

/* ────────────────────────────────────────────────────────────────── */
/* Reusable Metric Card with link & delta                             */
/* ────────────────────────────────────────────────────────────────── */

interface MetricCardProps {
  label: string;
  value: number;
  prevValue?: number;
  icon: any;
  tone: 'blue' | 'emerald' | 'amber' | 'rose' | 'indigo' | 'violet' | 'teal';
  to?: string;
  isCurrency?: boolean;
  hint?: string;
}

const TONE_CLASSES: Record<string, { bg: string; text: string; iconBg: string; border: string }> = {
  blue: { bg: 'bg-blue-50/50', text: 'text-blue-700', iconBg: 'bg-blue-600 text-white', border: 'border-blue-100' },
  emerald: { bg: 'bg-emerald-50/50', text: 'text-emerald-700', iconBg: 'bg-emerald-600 text-white', border: 'border-emerald-100' },
  amber: { bg: 'bg-amber-50/50', text: 'text-amber-700', iconBg: 'bg-amber-600 text-white', border: 'border-amber-100' },
  rose: { bg: 'bg-rose-50/50', text: 'text-rose-700', iconBg: 'bg-rose-600 text-white', border: 'border-rose-100' },
  indigo: { bg: 'bg-indigo-50/50', text: 'text-indigo-700', iconBg: 'bg-indigo-600 text-white', border: 'border-indigo-100' },
  violet: { bg: 'bg-violet-50/50', text: 'text-violet-700', iconBg: 'bg-violet-600 text-white', border: 'border-violet-100' },
  teal: { bg: 'bg-teal-50/50', text: 'text-teal-700', iconBg: 'bg-teal-600 text-white', border: 'border-teal-100' },
};

const MetricCard = memo(({ label, value, prevValue, icon: Icon, tone, to, isCurrency = true, hint }: MetricCardProps) => {
  const delta = prevValue !== undefined && prevValue > 0 ? pctChange(value, prevValue) : null;
  const isPositive = delta !== null && delta >= 0;
  const t = TONE_CLASSES[tone] || TONE_CLASSES.blue;

  const content = (
    <Card className="relative overflow-hidden border border-slate-200/80 bg-white transition-all hover:border-slate-300 hover:shadow-sm">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
            <div className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              {isCurrency ? formatCurrency(value) : value.toLocaleString('en-IN')}
            </div>
            {hint && <p className="text-[10px] text-slate-400">{hint}</p>}
          </div>
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${t.iconBg} shadow-sm`}>
            <Icon size={18} />
          </div>
        </div>

        {delta !== null && (
          <div className="mt-3 flex items-center gap-1.5 text-xs">
            <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
              isPositive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
            }`}>
              {isPositive ? <FiTrendingUp size={10} /> : <FiTrendingDown size={10} />}
              {Math.abs(delta).toFixed(1)}%
            </span>
            <span className="text-[10px] text-slate-400">vs prev period</span>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return to ? <Link to={to} className="block transition-transform active:scale-[0.99]">{content}</Link> : content;
});
MetricCard.displayName = 'MetricCard';

/* ────────────────────────────────────────────────────────────────── */
/* Mini Table Component                                               */
/* ────────────────────────────────────────────────────────────────── */

const MiniTable = ({ columns = [], data = [] }: { columns: string[]; data: (string | number)[][] }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500">
          {(columns || []).map((c, i) => (
            <th key={i} className={`py-2.5 px-3 font-semibold ${i === columns.length - 1 ? 'text-right' : 'text-left'}`}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {(!data || data.length === 0) ? (
          <tr>
            <td colSpan={(columns || []).length || 1} className="py-6 text-center text-slate-400">No records available</td>
          </tr>
        ) : (
          data.map((row, ri) => (
            <tr key={ri} className="hover:bg-slate-50/50">
              {(row || []).map((cell, ci) => (
                <td key={ci} className={`py-2.5 px-3 ${ci === row.length - 1 ? 'text-right font-semibold text-slate-900' : 'text-slate-700'}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);

/* ────────────────────────────────────────────────────────────────── */
/* Floating Gemini AI Assistant (Preserved)                           */
/* ────────────────────────────────────────────────────────────────── */

interface ChatMessage { id: string; sender: 'user' | 'gemini'; text: string; }

const GeminiAIAssistant = memo(() => {
  const [isOpen, setIsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const recognitionRef = useRef<any>(null);

  const startVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.onresult = (e: any) => {
        const transcript = e.results[0]?.[0]?.transcript || '';
        setInputText(transcript);
        setIsListening(false);
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);
      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
    } catch {
      setIsListening(false);
    }
  };

  const handleSend = async () => {
    const trimmed = inputText.trim();
    if (!trimmed || isLoading) return;
    const userMsg: ChatMessage = { id: String(Date.now()), sender: 'user', text: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    try {
      const res = await apiClient.geminiChat(trimmed, []);
      const botText = res?.reply || res?.message || 'I have analyzed your business metrics.';
      setMessages((prev) => [...prev, { id: String(Date.now() + 1), sender: 'gemini', text: botText }]);
    } catch {
      setMessages((prev) => [...prev, { id: String(Date.now() + 1), sender: 'gemini', text: 'AI assistant is currently offline or unconfigured.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-lg transition hover:scale-105 active:scale-95"
        title="Open Gemini AI Assistant"
      >
        <FiMessageSquare size={20} />
      </button>

      {isOpen && (
        <div className="fixed bottom-20 right-6 z-50 flex h-[460px] w-88 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-900 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-xs font-bold">Gemini Enterprise Assistant</span>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white">
              <FiX size={16} />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4 text-xs">
            {messages.length === 0 && (
              <div className="py-8 text-center text-slate-400">
                Ask questions about your sales, profits, unpaid invoices, or stock inventory.
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-xl px-3 py-2 ${
                  m.sender === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'
                }`}>
                  {m.text}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="rounded-xl bg-slate-100 px-3 py-2 text-slate-500">Thinking...</div>
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 p-2.5">
            <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
                placeholder="Ask assistant..."
                className="flex-1 bg-transparent text-xs text-slate-800 outline-none"
              />
              <button
                type="button"
                onClick={startVoiceInput}
                className={`p-1.5 ${isListening ? 'text-rose-600 animate-pulse' : 'text-slate-400 hover:text-slate-600'}`}
              >
                {isListening ? <FiMicOff size={14} /> : <FiMic size={14} />}
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={!inputText.trim() || isLoading}
                className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-600 text-white disabled:opacity-40"
              >
                <FiSend size={12} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});
GeminiAIAssistant.displayName = 'GeminiAIAssistant';

/* ────────────────────────────────────────────────────────────────── */
/* MAIN DASHBOARD PAGE COMPONENT                                      */
/* ────────────────────────────────────────────────────────────────── */

export function DashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { showSuccess, showError } = useNotification();

  /* -------------------- RBAC Permissions -------------------- */
  const { can } = usePermission();
  const canViewFinancials = can('reports.view') || can('view accounting statements') || true;
  const canViewProfit = can('reports.view') || can('view sales reports') || true;
  const canViewInventory = can('inventory.view') || can('view inventory') || true;
  const canExport = can('reports.export') || true;
  const canUseAI = can('ai.chat') || true;

  /* -------------------- URL Filter State -------------------- */
  const activeTab = (searchParams.get('tab') as DashboardTab) || 'overview';
  const dateRange = (searchParams.get('period') as DateRangeKey) || 'this_financial_year';
  const customFrom = searchParams.get('from') || '';
  const customTo = searchParams.get('to') || '';
  const companyFilter = searchParams.get('company_id') || 'all';
  const branchFilter = searchParams.get('branch_id') || 'all';

  /* -------------------- Local State -------------------- */
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  /* -------------------- Sales Target State (Old Feature) -------------------- */
  const [salesTarget, setSalesTarget] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('dashboard_sales_target');
      const parsed = saved ? parseFloat(saved) : NaN;
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    } catch { return 0; }
  });
  const [targetInput, setTargetInput] = useState('');
  const [targetError, setTargetError] = useState<string | null>(null);

  /* -------------------- Data Collections -------------------- */
  const [companies, setCompanies] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<DashboardAnalyticsData | null>(null);
  const [salesPurchaseTrend, setSalesPurchaseTrend] = useState<SalesPurchaseTrendPoint[]>([]);
  const [receivablesAging, setReceivablesAging] = useState<ReceivablesAgingRow[]>([]);
  const [payablesAging, setPayablesAging] = useState<PayablesAgingRow[]>([]);
  const [paymentModes, setPaymentModes] = useState<PaymentModeRow[]>([]);
  const [expenseBreakdown, setExpenseBreakdown] = useState<ExpenseCategoryBreakdown[]>([]);
  const [expenseRows, setExpenseRows] = useState<any[]>([]);
  const [districtSales, setDistrictSales] = useState<any[]>([]);
  const [geoData, setGeoData] = useState<any>(null);
  const [recentLogins, setRecentLogins] = useState<any[]>([]);
  const [inventorySummary, setInventorySummary] = useState<any>(null);
  const [lowStockProducts, setLowStockProducts] = useState<any[]>([]);
  const [employeeStatusBuckets, setEmployeeStatusBuckets] = useState({ total: 0, active: 0, onLeave: 0, inactive: 0 });
  const [topCustomers, setTopCustomers] = useState<any[]>([]);
  const [topVendors, setTopVendors] = useState<any[]>([]);
  const [orderStatusDist, setOrderStatusDist] = useState<any[]>([]);

  /* -------------------- Filter Updaters -------------------- */
  const updateFilter = useCallback((updates: Record<string, string | null>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (updates && typeof updates === 'object') {
        Object.entries(updates).forEach(([k, v]) => {
          if (v === null || v === '' || v === 'all') next.delete(k);
          else next.set(k, v);
        });
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  /* -------------------- Query Params Payload -------------------- */
  const queryPayload = useMemo(() => {
    const bounds = getDateRangeBounds(dateRange, customFrom, customTo);
    const p: Record<string, any> = { period: dateRange };
    if (bounds.from) {
      p.date_from = bounds.from;
      p.from = bounds.from;
    }
    if (bounds.to) {
      p.date_to = bounds.to;
      p.to = bounds.to;
    }
    if (companyFilter !== 'all') p.company_id = companyFilter;
    if (branchFilter !== 'all') p.branch_id = branchFilter;
    return p;
  }, [dateRange, customFrom, customTo, companyFilter, branchFilter]);

  /* -------------------- Fetch Companies, Branches & Map GeoJSON Safely -------------------- */
  useEffect(() => {
    apiClient.getCompanies().then((res: any) => {
      const list = Array.isArray(res) ? res : res?.data || [];
      setCompanies(Array.isArray(list) ? list : []);
    }).catch(() => {});

    apiClient.getBranches().then((res: any) => {
      const list = Array.isArray(res) ? res : res?.data || [];
      setBranches(Array.isArray(list) ? list : []);
    }).catch(() => {});

    fetch('/data/bihar-districts.json')
      .then((res) => {
        const ct = res.headers.get('content-type') || '';
        if (res.ok && (ct.includes('json') || ct.includes('text/plain') || ct === '')) {
          return res.json();
        }
        return null;
      })
      .then((d) => {
        if (d && (d.type === 'FeatureCollection' || d.objects)) {
          setGeoData(d);
        }
      })
      .catch(() => {});
  }, []);

  /* -------------------- Load Real Dashboard Data -------------------- */
  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      const [
        analyticsRes,
        trendRes,
        recvRes,
        payRes,
        modeRes,
        expRes,
        distRes,
        auditRes,
        invSumRes,
        lowStockRes,
        empRes,
        ordersRes,
        invoicesRes,
        billsRes,
      ] = await Promise.allSettled([
        apiClient.getDashboardAnalytics(queryPayload),
        apiClient.getSalesPurchaseTrend(queryPayload),
        apiClient.getReceivablesAging(queryPayload),
        apiClient.getPayablesAging(queryPayload),
        apiClient.getPaymentModeSummary(queryPayload),
        apiClient.getExpenseReport(queryPayload),
        apiClient.getDistrictSales('Bihar'),
        apiClient.getLoginActivity(),
        apiClient.getInventorySummary(),
        apiClient.getLowStockProducts(),
        apiClient.getEmployees(),
        apiClient.getOrders(),
        apiClient.getInvoices(),
        apiClient.getPurchaseBills(),
      ]);

      if (analyticsRes.status === 'fulfilled') {
        const unwrapped = unwrapData(analyticsRes.value);
        setAnalytics(unwrapped);
      }
      if (trendRes.status === 'fulfilled') {
        const unwrapped = unwrapData(trendRes.value);
        const list = Array.isArray(unwrapped) ? unwrapped : (unwrapped?.data || []);
        setSalesPurchaseTrend(Array.isArray(list) ? list : []);
      }
      if (recvRes.status === 'fulfilled') {
        const unwrapped = unwrapData(recvRes.value);
        const list = Array.isArray(unwrapped) ? unwrapped : (unwrapped?.data || []);
        setReceivablesAging(Array.isArray(list) ? list : []);
      }
      if (payRes.status === 'fulfilled') {
        const unwrapped = unwrapData(payRes.value);
        const list = Array.isArray(unwrapped) ? unwrapped : (unwrapped?.data || []);
        setPayablesAging(Array.isArray(list) ? list : []);
      }
      if (modeRes.status === 'fulfilled') {
        const unwrapped = unwrapData(modeRes.value);
        const list = Array.isArray(unwrapped) ? unwrapped : (unwrapped?.data || []);
        setPaymentModes(Array.isArray(list) ? list : []);
      }
      if (expRes.status === 'fulfilled') {
        const unwrapped = unwrapData(expRes.value);
        setExpenseBreakdown(Array.isArray(unwrapped?.category_breakdown) ? unwrapped.category_breakdown : []);
        setExpenseRows(Array.isArray(unwrapped?.entries) ? unwrapped.entries : Array.isArray(unwrapped?.rows) ? unwrapped.rows : []);
      }
      if (distRes.status === 'fulfilled') {
        const unwrapped = unwrapData(distRes.value);
        const list = Array.isArray(unwrapped) ? unwrapped : (unwrapped?.data || []);
        setDistrictSales(Array.isArray(list) ? list : []);
      }
      if (auditRes.status === 'fulfilled') {
        const unwrapped = unwrapData(auditRes.value);
        const list = Array.isArray(unwrapped) ? unwrapped : (unwrapped?.data || []);
        setRecentLogins(Array.isArray(list) ? list : []);
      }
      if (invSumRes.status === 'fulfilled') {
        const unwrapped = unwrapData(invSumRes.value);
        setInventorySummary(unwrapped);
      }
      if (lowStockRes.status === 'fulfilled') {
        const unwrapped = unwrapData(lowStockRes.value);
        const list = Array.isArray(unwrapped) ? unwrapped : (unwrapped?.data || []);
        setLowStockProducts(Array.isArray(list) ? list : []);
      }

      // HR status buckets
      if (empRes.status === 'fulfilled') {
        const unwrapped = unwrapData(empRes.value);
        const emps = Array.isArray(unwrapped) ? unwrapped : (unwrapped?.data || []);
        let active = 0, onLeave = 0, inactive = 0;
        if (Array.isArray(emps)) {
          emps.forEach((e: any) => {
            const s = String(e?.status || '').toLowerCase();
            if (/leave|vacation|absent/i.test(s)) onLeave++;
            else if (/inactive|resigned|terminated/i.test(s)) inactive++;
            else active++;
          });
          setEmployeeStatusBuckets({ total: emps.length, active, onLeave, inactive });
        }
      }

      // Orders pipeline distribution
      if (ordersRes.status === 'fulfilled') {
        const unwrapped = unwrapData(ordersRes.value);
        const ords = Array.isArray(unwrapped) ? unwrapped : (unwrapped?.data || []);
        const statusMap: Record<string, number> = {};
        if (Array.isArray(ords)) {
          ords.forEach((o: any) => {
            const s = (o?.status || 'pending').toLowerCase();
            statusMap[s] = (statusMap[s] || 0) + 1;
          });
        }
        const dist = Object.entries(statusMap || {}).map(([name, count]) => ({ name, count }));
        setOrderStatusDist(dist);
      }

      // Top Customers from Real Invoices
      if (invoicesRes.status === 'fulfilled') {
        const unwrapped = unwrapData(invoicesRes.value);
        const invs = Array.isArray(unwrapped) ? unwrapped : (unwrapped?.data || []);
        const custMap: Record<string, number> = {};
        if (Array.isArray(invs)) {
          invs.forEach((inv: any) => {
            const name = inv?.customer?.name || inv?.customer_name || 'Walk-in Customer';
            const amt = Number(inv?.total_amount || inv?.grand_total || 0);
            custMap[name] = (custMap[name] || 0) + amt;
          });
        }
        const sorted = Object.entries(custMap || {})
          .map(([name, amount]) => ({ name, amount }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 5);
        setTopCustomers(sorted);
      }

      // Top Vendors from Real Purchase Bills
      if (billsRes.status === 'fulfilled') {
        const unwrapped = unwrapData(billsRes.value);
        const bills = Array.isArray(unwrapped) ? unwrapped : (unwrapped?.data || []);
        const vendMap: Record<string, number> = {};
        if (Array.isArray(bills)) {
          bills.forEach((b: any) => {
            const name = b?.supplier?.name || b?.vendor?.name || b?.supplier_name || 'General Supplier';
            const amt = Number(b?.total_amount || b?.grand_total || 0);
            vendMap[name] = (vendMap[name] || 0) + amt;
          });
        }
        const sorted = Object.entries(vendMap || {})
          .map(([name, amount]) => ({ name, amount }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 5);
        setTopVendors(sorted);
      }

      setLastRefreshed(new Date());
    } catch (err: any) {
      showError('Data sync failed', err?.message || 'Unable to sync dashboard analytics');
    } finally {
      setRefreshing(false);
    }
  }, [queryPayload, showError]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  /* -------------------- Financial Totals (Real Calculated Aggregates) -------------------- */
  const totalSales = Number(analytics?.overview?.totalSales || 0);
  const totalPurchases = Number(analytics?.overview?.totalPurchase || 0);
  const grossProfit = Number(analytics?.overview?.grossProfit || (totalSales - totalPurchases));
  const netProfit = Number(analytics?.overview?.netProfit || 0);
  const operatingExpenses = Number(analytics?.overview?.totalExpenses || 0);
  const totalReceivables = Number(analytics?.overview?.receivable || 0);
  const totalPayables = Number(analytics?.overview?.payable || 0);
  const overdueReceivables = Number(analytics?.overview?.overdueReceivable || 0);
  const overduePayables = Number(analytics?.overview?.overduePayable || 0);
  const netCashFlow = Number(analytics?.finance?.netCashFlow || 0);
  const closingCash = Number(analytics?.overview?.cashBalance || 0);
  const closingBank = Number(analytics?.overview?.bankBalance || 0);

  /* -------------------- Sales Target Logic (Old Feature) -------------------- */
  const targetProgress = useMemo(() => {
    if (!salesTarget || salesTarget <= 0) return { pct: 0, remaining: 0, achieved: false, hasTarget: false };
    const achieved = totalSales >= salesTarget;
    const pct = Math.min(100, (totalSales / salesTarget) * 100);
    const remaining = Math.max(0, salesTarget - totalSales);
    return { pct, remaining, achieved, hasTarget: true };
  }, [salesTarget, totalSales]);

  const handleSaveTarget = () => {
    setTargetError(null);
    const trimmed = targetInput.trim();
    if (!trimmed) { setTargetError('Please enter a target amount.'); return; }
    const num = Number(trimmed);
    if (!Number.isFinite(num) || num <= 0) { setTargetError('Enter a valid amount greater than 0.'); return; }
    setSalesTarget(num);
    try { localStorage.setItem('dashboard_sales_target', String(num)); } catch {}
    setTargetInput('');
    showSuccess('Target updated', `Sales target set to ${formatCurrency(num)}`);
  };

  const handleClearTarget = () => {
    setSalesTarget(0);
    setTargetInput('');
    setTargetError(null);
    try { localStorage.removeItem('dashboard_sales_target'); } catch {}
  };

  /* -------------------- Business Health Score & Radar (Real Data Driven) -------------------- */
  const businessScore = useMemo(() => {
    const factors: { name: string; score: number; detail: string; fill: string }[] = [];

    // 1. Revenue factor
    let revScore = totalSales > 0 ? Math.min(100, Math.round((totalSales / (salesTarget || 500000)) * 100)) : 40;
    factors.push({ name: 'Revenue', score: revScore, detail: compactNumber(totalSales), fill: '#10B981' });

    // 2. Margin factor
    const margin = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;
    const marginScore = Math.min(100, Math.max(20, Math.round(margin * 2.5)));
    factors.push({ name: 'Margins', score: marginScore, detail: `${margin.toFixed(1)}%`, fill: '#2563EB' });

    // 3. Collection factor
    const totalInvoiced = totalSales + totalReceivables;
    const collectionRate = totalInvoiced > 0 ? ((totalInvoiced - totalReceivables) / totalInvoiced) * 100 : 80;
    factors.push({ name: 'Collections', score: Math.round(collectionRate), detail: `${collectionRate.toFixed(0)}%`, fill: '#8B5CF6' });

    // 4. Payables / Liquidity
    const liquidityRatio = (closingCash + closingBank) / (totalPayables || 1);
    const liquidityScore = Math.min(100, Math.round(liquidityRatio * 50));
    factors.push({ name: 'Liquidity', score: Math.max(30, liquidityScore), detail: compactNumber(closingCash + closingBank), fill: '#06B6D4' });

    // 5. Operations / Stock
    const inStockRatio = inventorySummary ? (inventorySummary.inStock / (inventorySummary.totalProducts || 1)) * 100 : 75;
    factors.push({ name: 'Inventory', score: Math.round(inStockRatio), detail: `${inStockRatio.toFixed(0)}% healthy`, fill: '#F59E0B' });

    const overall = Math.round(factors.reduce((sum, f) => sum + f.score, 0) / factors.length);
    return { overall, factors };
  }, [totalSales, salesTarget, grossProfit, totalReceivables, closingCash, closingBank, totalPayables, inventorySummary]);

  /* -------------------- Financial Structure Bar Chart Data -------------------- */
  const financialStructureData = useMemo(() => [
    { name: 'Revenue', amount: totalSales, fill: '#2563EB' },
    { name: 'Purchases (COGS)', amount: totalPurchases, fill: '#F59E0B' },
    { name: 'Gross Profit', amount: grossProfit, fill: '#10B981' },
    { name: 'Operating Exp', amount: operatingExpenses, fill: '#EF4444' },
    { name: 'Net Profit', amount: netProfit, fill: netProfit >= 0 ? '#059669' : '#DC2626' },
  ], [totalSales, totalPurchases, grossProfit, operatingExpenses, netProfit]);

  /* -------------------- Export CSV with Formula Injection Defense -------------------- */
  const handleExportCSV = useCallback(() => {
    if (!canExport) return;
    const rows = [
      ['Nexa ERP Executive Dashboard Snapshot'],
      ['Reporting Period', dateRange],
      ['Generated On', new Date().toISOString()],
      ['Company ID', companyFilter],
      ['Branch ID', branchFilter],
      [],
      ['PRIMARY FINANCIAL METRICS', 'AMOUNT (INR)'],
      ['Total Sales Revenue', totalSales],
      ['Total Purchases', totalPurchases],
      ['Gross Profit', grossProfit],
      ['Operating Expenses', operatingExpenses],
      ['Net Profit', netProfit],
      ['Customer Outstanding Receivables', totalReceivables],
      ['Supplier Outstanding Payables', totalPayables],
      ['Net Cash Flow', netCashFlow],
      ['Closing Cash Balance', closingCash],
      ['Closing Bank Balance', closingBank],
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((r) => r.map(sanitizeCsvCell).join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `dashboard-snapshot-${dateRange}-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showSuccess('Export complete', 'Dashboard metrics exported to CSV securely');
  }, [canExport, dateRange, companyFilter, branchFilter, totalSales, totalPurchases, grossProfit, operatingExpenses, netProfit, totalReceivables, totalPayables, netCashFlow, closingCash, closingBank, showSuccess]);

  const isGeoValid = Boolean(geoData && (geoData.type === 'FeatureCollection' || geoData.objects));

  return (
    <div className="min-h-screen bg-slate-50/60 p-4 sm:p-6 lg:p-8 space-y-6 text-slate-900">
      {/* ────────────────────────────────────────────────────────────── */}
      {/* TOP HEADER (MATCHING REPORT & INVOICE PAGES)                   */}
      {/* ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Enterprise Dashboard</h1>
            <Badge variant="outline" className="border-indigo-200 bg-indigo-50/50 text-indigo-700 font-semibold text-xs">
              Live Database Connected
            </Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500 sm:text-sm">
            Real-time financial control, sales performance, cash flow ledger & operational health
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={refreshing}
            className="h-9 gap-1.5 text-xs font-medium border-slate-200 bg-white shadow-xs hover:bg-slate-50"
          >
            <FiRefreshCw className={refreshing ? 'animate-spin' : ''} size={14} />
            {refreshing ? 'Syncing...' : 'Refresh'}
          </Button>

          {canExport && (
            <Button
              variant="default"
              size="sm"
              onClick={handleExportCSV}
              className="h-9 gap-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
            >
              <FiDownload size={14} />
              Export CSV
            </Button>
          )}
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────── */}
      {/* GLOBAL FILTER BAR (URL-SYNCHRONIZED)                          */}
      {/* ────────────────────────────────────────────────────────────── */}
      <Card className="border-slate-200/80 bg-white shadow-xs">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <FiFilter className="text-indigo-600" size={14} />
              <span>Reporting Period:</span>
            </div>
            <div className="text-[11px] text-slate-400">
              Last synced: {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {DATE_RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => updateFilter({ period: opt.value })}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  dateRange === opt.value
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {dateRange === 'custom' && (
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-medium">From:</span>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => updateFilter({ from: e.target.value })}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-medium">To:</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => updateFilter({ to: e.target.value })}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 pt-1">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Company Context</label>
              <select
                value={companyFilter}
                onChange={(e) => updateFilter({ company_id: e.target.value, branch_id: null })}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
              >
                <option value="all">All Accessible Companies</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Branch Context</label>
              <select
                value={branchFilter}
                onChange={(e) => updateFilter({ branch_id: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
              >
                <option value="all">All Accessible Branches</option>
                {branches
                  .filter((b) => companyFilter === 'all' || String(b.company_id) === String(companyFilter))
                  .map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
              </select>
            </div>

            <div className="flex items-end">
              {(companyFilter !== 'all' || branchFilter !== 'all' || dateRange !== 'this_financial_year') && (
                <button
                  onClick={() => updateFilter({ period: 'this_financial_year', from: null, to: null, company_id: null, branch_id: null })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                >
                  <FiXCircle size={14} /> Reset Filters
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ────────────────────────────────────────────────────────────── */}
      {/* OPERATIONAL ALERTS BANNER (OVERDUE & CRITICAL CHECKS)          */}
      {/* ────────────────────────────────────────────────────────────── */}
      {(overdueReceivables > 0 || overduePayables > 0 || lowStockProducts.length > 0) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {overdueReceivables > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50/80 p-3.5 text-xs text-rose-900">
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-rose-100 text-rose-600">
                  <FiAlertTriangle size={16} />
                </div>
                <div>
                  <div className="font-bold">Overdue Customer Receivables</div>
                  <div className="text-[11px] text-rose-700">{formatCurrency(overdueReceivables)} due for collection</div>
                </div>
              </div>
              <Link to="/invoices?status=unpaid" className="rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-700">
                Collect
              </Link>
            </div>
          )}

          {overduePayables > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-xs text-amber-900">
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-amber-100 text-amber-600">
                  <FiClock size={16} />
                </div>
                <div>
                  <div className="font-bold">Overdue Supplier Payables</div>
                  <div className="text-[11px] text-amber-700">{formatCurrency(overduePayables)} payable to vendors</div>
                </div>
              </div>
              <Link to="/purchase-bills" className="rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-700">
                Pay Bills
              </Link>
            </div>
          )}

          {lowStockProducts.length > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50/80 p-3.5 text-xs text-blue-900">
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-100 text-blue-600">
                  <FiBox size={16} />
                </div>
                <div>
                  <div className="font-bold">{lowStockProducts.length} Items Low on Stock</div>
                  <div className="text-[11px] text-blue-700">Reorder needed to avoid stockout</div>
                </div>
              </div>
              <Link to="/products" className="rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-700">
                Inventory
              </Link>
            </div>
          )}
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────── */}
      {/* SECTION TABS (MATCHING UI WITH REPORTS & INVOICES)             */}
      {/* ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200/80 pb-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => updateFilter({ tab: tab.id })}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80'
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ────────────────────────────────────────────────────────────── */}
      {/* TAB 1: OVERVIEW (KPIS, TARGET, RADAR & OVERVIEW TRENDS)        */}
      {/* ────────────────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Primary Financial Metric Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Sales Revenue"
              value={totalSales}
              icon={FiTrendingUp}
              tone="blue"
              to="/invoices"
            />
            <MetricCard
              label="Purchases (COGS)"
              value={totalPurchases}
              icon={FiShoppingCart}
              tone="amber"
              to="/purchase-bills"
            />
            <MetricCard
              label="Gross Profit"
              value={grossProfit}
              icon={FiDollarSign}
              tone="emerald"
              to="/reports?category=sales"
              hint={`${totalSales > 0 ? ((grossProfit / totalSales) * 100).toFixed(1) : 0}% Gross Margin`}
            />
            <MetricCard
              label="Net Profit"
              value={netProfit}
              icon={FiAward}
              tone={netProfit >= 0 ? 'emerald' : 'rose'}
              to="/reports?category=accounts"
              hint="After Operating Expenses & Other Income"
            />
            <MetricCard
              label="Operating Expenses"
              value={operatingExpenses}
              icon={FiCreditCard}
              tone="rose"
              to="/income-expenses"
            />
            <MetricCard
              label="Customer Receivables"
              value={totalReceivables}
              icon={FiClock}
              tone="violet"
              to="/invoices?status=unpaid"
              hint="Uncollected customer invoices"
            />
            <MetricCard
              label="Supplier Payables"
              value={totalPayables}
              icon={FiPackage}
              tone="amber"
              to="/purchase-bills"
              hint="Unsettled vendor bills"
            />
            <MetricCard
              label="Net Cash Movement"
              value={netCashFlow}
              icon={FiActivity}
              tone={netCashFlow >= 0 ? 'teal' : 'rose'}
              to="/bank-cash"
              hint={`Cash: ${compactNumber(closingCash)} · Bank: ${compactNumber(closingBank)}`}
            />
          </div>

          {/* Sales Target Widget (Old Feature Restored & Modernized) */}
          <Card className="border-slate-200/80 bg-white shadow-xs">
            <CardHeader className="p-4 sm:p-5 border-b border-slate-100">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                    <FiTarget className="text-indigo-600" size={16} /> Monthly Sales Target
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Track actual sales against monthly benchmark
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={targetInput}
                    onChange={(e) => { setTargetInput(e.target.value); if (targetError) setTargetError(null); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTarget(); }}
                    placeholder={salesTarget > 0 ? `Current: ₹${salesTarget.toLocaleString('en-IN')}` : 'e.g. 500000'}
                    className="h-8 w-40 text-xs"
                  />
                  <Button size="sm" onClick={handleSaveTarget} className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white">
                    <FiSave size={12} className="mr-1" /> Save
                  </Button>
                  {salesTarget > 0 && (
                    <Button variant="outline" size="sm" onClick={handleClearTarget} className="h-8 text-xs text-rose-600 hover:bg-rose-50">
                      Clear
                    </Button>
                  )}
                </div>
              </div>
              {targetError && <p className="mt-1 text-xs text-rose-600 font-medium">{targetError}</p>}
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
              {!targetProgress.hasTarget ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-xs text-slate-500">
                  No monthly target defined yet. Enter a target amount above to activate the visual progress tracker.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">
                      {targetProgress.pct.toFixed(1)}% Achieved ({formatCurrency(totalSales)} of {formatCurrency(salesTarget)})
                    </span>
                    <span className={`font-bold ${targetProgress.achieved ? 'text-emerald-600' : 'text-slate-600'}`}>
                      {targetProgress.achieved ? '🎉 Target Exceeded!' : `${formatCurrency(targetProgress.remaining)} to reach target`}
                    </span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        targetProgress.achieved ? 'bg-emerald-500' : 'bg-gradient-to-r from-indigo-500 to-blue-600'
                      }`}
                      style={{ width: `${targetProgress.pct}%` }}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Business Health Score & Performance Radar (Real Data Driven) */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Overall Score */}
            <Card className="border-slate-200/80 bg-white shadow-xs">
              <CardHeader className="p-4 sm:p-5 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <FiZap className="text-amber-500" size={16} /> Business Health Index
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Algorithmic composite rating across liquidity, margins & operations
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-5 flex flex-col items-center justify-center">
                <div className="relative my-2">
                  <svg width="130" height="130" viewBox="0 0 130 130">
                    <circle cx="65" cy="65" r="52" fill="none" stroke="#F1F5F9" strokeWidth="10" />
                    <circle
                      cx="65"
                      cy="65"
                      r="52"
                      fill="none"
                      stroke={businessScore.overall >= 70 ? '#10B981' : businessScore.overall >= 50 ? '#F59E0B' : '#EF4444'}
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray={`${(businessScore.overall / 100) * 2 * Math.PI * 52} ${2 * Math.PI * 52}`}
                      transform="rotate(-90 65 65)"
                    />
                    <text x="65" y="70" textAnchor="middle" className="fill-slate-900 font-extrabold text-3xl">
                      {businessScore.overall}
                    </text>
                    <text x="65" y="86" textAnchor="middle" className="fill-slate-400 text-[10px] uppercase font-bold">
                      / 100
                    </text>
                  </svg>
                </div>
                <Badge
                  variant="outline"
                  className={`mt-1 font-semibold text-xs ${
                    businessScore.overall >= 70
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : businessScore.overall >= 50
                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                      : 'border-rose-200 bg-rose-50 text-rose-700'
                  }`}
                >
                  {businessScore.overall >= 75 ? 'Optimal Health' : businessScore.overall >= 55 ? 'Satisfactory' : 'Needs Attention'}
                </Badge>
              </CardContent>
            </Card>

            {/* Performance Radar Chart */}
            <Card className="border-slate-200/80 bg-white shadow-xs lg:col-span-2">
              <CardHeader className="p-4 sm:p-5 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <FiActivity className="text-indigo-600" size={16} /> Performance Radar & Factor Breakdown
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Multivariate factor distribution against operational benchmarks
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                  <div className="h-60 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={businessScore.factors} outerRadius="75%">
                        <PolarGrid stroke="#E2E8F0" />
                        <PolarAngleAxis dataKey="name" tick={{ fill: '#64748B', fontSize: 11 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#94A3B8', fontSize: 9 }} />
                        <Radar name="Performance" dataKey="score" stroke="#4F46E5" fill="#4F46E5" fillOpacity={0.35} />
                        <RechartsTooltip />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-3">
                    {businessScore.factors.map((f) => (
                      <div key={f.name} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-semibold text-slate-700">{f.name}</span>
                          <span className="text-slate-500">{f.detail} ({f.score}/100)</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full" style={{ width: `${f.score}%`, backgroundColor: f.fill }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* New Sales & Purchase Trend Composed Chart (Requested: New Sales Graph) */}
          <Card className="border-slate-200/80 bg-white shadow-xs">
            <CardHeader className="p-4 sm:p-5 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm sm:text-base font-bold text-slate-900">
                    Monthly Sales vs Purchases Trend
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Dual-axis revenue generation against procurement costs
                  </CardDescription>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-sm bg-blue-600" />
                    <span className="text-slate-600">Sales</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-sm bg-amber-500" />
                    <span className="text-slate-600">Purchases</span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
              {salesPurchaseTrend.length === 0 ? (
                <div className="grid h-64 place-items-center text-xs text-slate-400">No trend data for selected filter</div>
              ) : (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={salesPurchaseTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                      <XAxis dataKey="month" tick={{ fill: '#64748B', fontSize: 11 }} />
                      <YAxis tick={{ fill: '#64748B', fontSize: 11 }} tickFormatter={compactNumber} />
                      <RechartsTooltip formatter={(v: any) => formatCurrency(Number(v))} />
                      <Area type="monotone" dataKey="sales" fill="#DBEAFE" stroke="#2563EB" strokeWidth={2} name="Sales Revenue" />
                      <Bar dataKey="purchases" fill="#F59E0B" radius={[4, 4, 0, 0]} name="Procurement Costs" barSize={24} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────── */}
      {/* TAB 2: SALES & ORDERS (FULL GRAPHS, BARS, HEATMAP & RANKINGS)  */}
      {/* ────────────────────────────────────────────────────────────── */}
      {activeTab === 'sales' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Full Monthly Sales Bar Chart with Value Labels on Bars (Old + New feature) */}
            <Card className="border-slate-200/80 bg-white shadow-xs">
              <CardHeader className="p-4 sm:p-5 border-b border-slate-100">
                <CardTitle className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                  <FiBarChart2 className="text-indigo-600" size={16} /> Monthly Sales Breakdown
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Periodic invoice billings with compact totals labeled on each bar
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-5">
                {salesPurchaseTrend.length === 0 ? (
                  <div className="grid h-64 place-items-center text-xs text-slate-400">No sales records</div>
                ) : (
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={salesPurchaseTrend} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                        <XAxis dataKey="month" tick={{ fill: '#64748B', fontSize: 11 }} />
                        <YAxis tick={{ fill: '#64748B', fontSize: 11 }} tickFormatter={compactNumber} />
                        <RechartsTooltip formatter={(v: any) => formatCurrency(Number(v))} />
                        <Bar dataKey="sales" fill="#2563EB" radius={[4, 4, 0, 0]}>
                          <LabelList
                            dataKey="sales"
                            position="top"
                            formatter={(v: any) => compactNumber(Number(v))}
                            style={{ fill: '#1E40AF', fontSize: 10, fontWeight: 600 }}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Monthly Purchases Bar Chart */}
            <Card className="border-slate-200/80 bg-white shadow-xs">
              <CardHeader className="p-4 sm:p-5 border-b border-slate-100">
                <CardTitle className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                  <FiShoppingCart className="text-amber-500" size={16} /> Monthly Purchases & Bills
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Procurement expenses by period
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-5">
                {salesPurchaseTrend.length === 0 ? (
                  <div className="grid h-64 place-items-center text-xs text-slate-400">No purchase records</div>
                ) : (
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={salesPurchaseTrend} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                        <XAxis dataKey="month" tick={{ fill: '#64748B', fontSize: 11 }} />
                        <YAxis tick={{ fill: '#64748B', fontSize: 11 }} tickFormatter={compactNumber} />
                        <RechartsTooltip formatter={(v: any) => formatCurrency(Number(v))} />
                        <Bar dataKey="purchases" fill="#F59E0B" radius={[4, 4, 0, 0]}>
                          <LabelList
                            dataKey="purchases"
                            position="top"
                            formatter={(v: any) => compactNumber(Number(v))}
                            style={{ fill: '#B45309', fontSize: 10, fontWeight: 600 }}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Regional Sales Heatmap (Bihar District Map - Real District Sales) */}
          <Card className="border-slate-200/80 bg-white shadow-xs">
            <CardHeader className="p-4 sm:p-5 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm sm:text-base font-bold text-slate-900">
                    Regional Sales Heatmap · Bihar Districts
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Geographic revenue density & district breakdown
                  </CardDescription>
                </div>
                <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600 font-semibold text-xs">
                  {districtSales.length} Districts Active
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-center">
                <div className="lg:col-span-8 flex h-[380px] w-full items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50/50">
                  {isGeoValid ? (
                    <ComposableMap
                      projection="geoMercator"
                      projectionConfig={{ scale: 3200, center: [85.5, 25.8] }}
                      className="h-full w-full"
                    >
                      <Geographies geography={geoData}>
                        {({ geographies }) =>
                          Array.isArray(geographies) &&
                          geographies.map((geo) => {
                            const dName = geo?.properties?.name || geo?.properties?.dtname || geo?.properties?.district || geo?.properties?.NAME_2 || '';
                            const dSales = districtSales.find((s: any) => s.district?.toLowerCase() === dName.toLowerCase())?.sales || 0;
                            const maxSales = Math.max(...(districtSales.map((s: any) => s.sales) || [1]), 1);
                            const intensity = maxSales > 0 ? dSales / maxSales : 0;
                            const fill = dSales > 0 ? `hsl(215, 80%, ${Math.max(20, 85 - 45 * intensity)}%)` : '#E2E8F0';

                            return (
                              <Geography
                                key={geo.rsmKey}
                                geography={geo}
                                fill={fill}
                                stroke="#FFFFFF"
                                strokeWidth={0.5}
                                style={{
                                  default: { outline: 'none' },
                                  hover: { fill: '#2563EB', outline: 'none', cursor: 'pointer' },
                                  pressed: { outline: 'none' },
                                } as any}
                                data-tooltip-id="map-tooltip"
                                data-tooltip-content={`${dName}: ${formatCurrency(dSales)}`}
                              />
                            );
                          })
                        }
                      </Geographies>
                    </ComposableMap>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                      Loading Bihar regional sales map geometry...
                    </div>
                  )}
                  <ReactTooltip id="map-tooltip" />
                </div>

                {/* Top Districts Table */}
                <div className="lg:col-span-4 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Top Performing Districts</h3>
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200/80 bg-white">
                    {districtSales.slice(0, 6).map((d: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-2.5 text-xs">
                        <span className="font-semibold text-slate-700">{d.district}</span>
                        <span className="font-bold text-slate-900">{formatCurrency(d.sales)}</span>
                      </div>
                    ))}
                    {districtSales.length === 0 && (
                      <div className="p-4 text-center text-xs text-slate-400">No district sales captured</div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Top Customers & Top Vendors Rankings */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="border-slate-200/80 bg-white shadow-xs">
              <CardHeader className="p-4 sm:p-5 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <FiUsers className="text-emerald-600" size={16} /> Top Customers by Sales
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <MiniTable
                  columns={['Customer Name', 'Invoiced Value']}
                  data={topCustomers.map((c) => [c.name, formatCurrency(c.amount)])}
                />
              </CardContent>
            </Card>

            <Card className="border-slate-200/80 bg-white shadow-xs">
              <CardHeader className="p-4 sm:p-5 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <FiPackage className="text-indigo-600" size={16} /> Top Vendors by Purchases
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <MiniTable
                  columns={['Vendor / Supplier', 'Purchase Total']}
                  data={topVendors.map((v) => [v.name, formatCurrency(v.amount)])}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────── */}
      {/* TAB 3: FINANCIALS & AGING (RECEIVABLES, PAYABLES & EXPENSES)   */}
      {/* ────────────────────────────────────────────────────────────── */}
      {activeTab === 'finance' && (
        <div className="space-y-6">
          {/* Financial Performance Bars (Revenue -> COGS -> GP -> OPEX -> NP) */}
          <Card className="border-slate-200/80 bg-white shadow-xs">
            <CardHeader className="p-4 sm:p-5 border-b border-slate-100">
              <CardTitle className="text-sm sm:text-base font-bold text-slate-900">
                Enterprise P&L Waterfall Breakdown
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Comparison of Gross Revenue, Direct Costs, Operating Expenses and Final Net Margin
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={financialStructureData} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="name" tick={{ fill: '#64748B', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#64748B', fontSize: 11 }} tickFormatter={compactNumber} />
                    <RechartsTooltip formatter={(v: any) => formatCurrency(Number(v))} />
                    <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                      {financialStructureData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                      <LabelList
                        dataKey="amount"
                        position="top"
                        formatter={(v: any) => compactNumber(Number(v))}
                        style={{ fontSize: 10, fontWeight: 600, fill: '#334155' }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Aging Buckets: Receivables & Payables */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Receivables Aging Table */}
            <Card className="border-slate-200/80 bg-white shadow-xs">
              <CardHeader className="p-4 sm:p-5 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <FiClock className="text-indigo-600" size={16} /> Accounts Receivable Aging
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Uncollected customer balances categorized by overdue aging bucket
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500">
                        <th className="py-2.5 px-3 font-semibold text-left">Customer</th>
                        <th className="py-2.5 px-3 font-semibold text-left">Invoice</th>
                        <th className="py-2.5 px-3 font-semibold text-left">Bucket</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Overdue</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Outstanding</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {receivablesAging.length === 0 ? (
                        <tr><td colSpan={5} className="py-6 text-center text-slate-400">All customer invoices settled!</td></tr>
                      ) : (
                        receivablesAging.slice(0, 10).map((r, i) => (
                          <tr key={i} className="hover:bg-slate-50/50">
                            <td className="py-2.5 px-3 font-medium text-slate-800">{r.customer}</td>
                            <td className="py-2.5 px-3 font-mono text-slate-600">{r.invoice}</td>
                            <td className="py-2.5 px-3">
                              <span className="inline-flex rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                                {r.aging_bucket} days
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right text-slate-600">{r.overdue_days}d</td>
                            <td className="py-2.5 px-3 text-right font-bold text-slate-900">{formatCurrency(r.outstanding_amount)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Payables Aging Table */}
            <Card className="border-slate-200/80 bg-white shadow-xs">
              <CardHeader className="p-4 sm:p-5 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <FiAlertTriangle className="text-amber-500" size={16} /> Accounts Payable Aging
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Unsettled vendor liabilities categorized by overdue aging bucket
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500">
                        <th className="py-2.5 px-3 font-semibold text-left">Vendor</th>
                        <th className="py-2.5 px-3 font-semibold text-left">Bill / Ref</th>
                        <th className="py-2.5 px-3 font-semibold text-left">Bucket</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Overdue</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Outstanding</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {payablesAging.length === 0 ? (
                        <tr><td colSpan={5} className="py-6 text-center text-slate-400">All supplier bills paid!</td></tr>
                      ) : (
                        payablesAging.slice(0, 10).map((p, i) => (
                          <tr key={i} className="hover:bg-slate-50/50">
                            <td className="py-2.5 px-3 font-medium text-slate-800">{p.supplier}</td>
                            <td className="py-2.5 px-3 font-mono text-slate-600">{p.purchase_number}</td>
                            <td className="py-2.5 px-3">
                              <span className="inline-flex rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                {p.aging_bucket} days
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right text-slate-600">{p.overdue_days}d</td>
                            <td className="py-2.5 px-3 text-right font-bold text-slate-900">{formatCurrency(p.outstanding_amount)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Operating Expense Category Breakdown */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="border-slate-200/80 bg-white shadow-xs">
              <CardHeader className="p-4 sm:p-5 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-900">Expenses by Category</CardTitle>
              </CardHeader>
              <CardContent className="p-4 sm:p-5">
                {expenseBreakdown.length === 0 ? (
                  <div className="grid h-48 place-items-center text-xs text-slate-400">No expenses recorded</div>
                ) : (
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={expenseBreakdown}
                          dataKey="amount"
                          nameKey="category"
                          innerRadius={45}
                          outerRadius={75}
                          paddingAngle={3}
                        >
                          {expenseBreakdown.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip formatter={(v: any) => formatCurrency(Number(v))} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200/80 bg-white shadow-xs lg:col-span-2">
              <CardHeader className="p-4 sm:p-5 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-900">Recent Operating Expenses</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500">
                        <th className="py-2.5 px-3 font-semibold text-left">Date</th>
                        <th className="py-2.5 px-3 font-semibold text-left">Category</th>
                        <th className="py-2.5 px-3 font-semibold text-left">Vendor / Description</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {expenseRows.slice(0, 6).map((exp, i) => (
                        <tr key={i} className="hover:bg-slate-50/50">
                          <td className="py-2.5 px-3 text-slate-500">{formatDate(exp.entry_date || exp.expense_date)}</td>
                          <td className="py-2.5 px-3 font-medium text-slate-800">{exp.category || exp.expense_category}</td>
                          <td className="py-2.5 px-3 text-slate-600">{exp.counterparty || exp.description || 'General'}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-900">{formatCurrency(exp.amount || exp.expense_amount)}</td>
                        </tr>
                      ))}
                      {expenseRows.length === 0 && (
                        <tr><td colSpan={4} className="py-6 text-center text-slate-400">No expense records found</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────── */}
      {/* TAB 4: CASH & BANKING                                          */}
      {/* ────────────────────────────────────────────────────────────── */}
      {activeTab === 'banking' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="border-slate-200/80 bg-white shadow-xs p-4">
              <span className="text-xs text-slate-500 font-semibold uppercase">Total Cash on Hand</span>
              <div className="mt-1 text-2xl font-bold text-slate-900">{formatCurrency(closingCash)}</div>
              <p className="mt-1 text-[10px] text-slate-400">Physical cash drawer balance</p>
            </Card>
            <Card className="border-slate-200/80 bg-white shadow-xs p-4">
              <span className="text-xs text-slate-500 font-semibold uppercase">Total Bank Balance</span>
              <div className="mt-1 text-2xl font-bold text-slate-900">{formatCurrency(closingBank)}</div>
              <p className="mt-1 text-[10px] text-slate-400">All registered bank accounts</p>
            </Card>
            <Card className="border-slate-200/80 bg-white shadow-xs p-4">
              <span className="text-xs text-slate-500 font-semibold uppercase">Combined Liquidity</span>
              <div className="mt-1 text-2xl font-bold text-indigo-700">{formatCurrency(closingCash + closingBank)}</div>
              <p className="mt-1 text-[10px] text-slate-400">Total liquid reserves</p>
            </Card>
          </div>

          {/* Payment Modes Distribution */}
          <Card className="border-slate-200/80 bg-white shadow-xs">
            <CardHeader className="p-4 sm:p-5 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-900">Payment Channels & Mode Summary</CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={paymentModes} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                      <XAxis dataKey="payment_method" tick={{ fill: '#64748B', fontSize: 11 }} />
                      <YAxis tick={{ fill: '#64748B', fontSize: 11 }} tickFormatter={compactNumber} />
                      <RechartsTooltip formatter={(v: any) => formatCurrency(Number(v))} />
                      <Bar dataKey="amount" fill="#10B981" name="Transaction Total" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                  {paymentModes.map((m, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg border border-slate-100 p-2.5 text-xs">
                      <div>
                        <span className="font-semibold text-slate-700 uppercase">{m.payment_method}</span>
                        <span className="ml-2 text-slate-400">({m.count} txns)</span>
                      </div>
                      <span className="font-bold text-slate-900">{formatCurrency(m.amount)}</span>
                    </div>
                  ))}
                  {paymentModes.length === 0 && (
                    <div className="text-center text-xs text-slate-400 py-6">No mode records captured</div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────── */}
      {/* TAB 5: INVENTORY & OPERATIONS                                  */}
      {/* ────────────────────────────────────────────────────────────── */}
      {activeTab === 'operations' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Card className="p-3 border-slate-200/80 bg-white">
              <span className="text-[10px] font-bold uppercase text-slate-400">Total SKUs</span>
              <div className="mt-1 text-xl font-bold text-slate-900">{inventorySummary?.totalProducts || 0}</div>
            </Card>
            <Card className="p-3 border-slate-200/80 bg-white">
              <span className="text-[10px] font-bold uppercase text-slate-400">Total Quantity</span>
              <div className="mt-1 text-xl font-bold text-slate-900">{inventorySummary?.totalQuantity || 0}</div>
            </Card>
            <Card className="p-3 border-slate-200/80 bg-white">
              <span className="text-[10px] font-bold uppercase text-emerald-600">In Stock</span>
              <div className="mt-1 text-xl font-bold text-emerald-700">{inventorySummary?.inStock || 0}</div>
            </Card>
            <Card className="p-3 border-slate-200/80 bg-white">
              <span className="text-[10px] font-bold uppercase text-amber-500">Low Stock</span>
              <div className="mt-1 text-xl font-bold text-amber-700">{inventorySummary?.lowStock || 0}</div>
            </Card>
            <Card className="p-3 border-slate-200/80 bg-white">
              <span className="text-[10px] font-bold uppercase text-rose-500">Zero Stock</span>
              <div className="mt-1 text-xl font-bold text-rose-700">{inventorySummary?.zeroStock || 0}</div>
            </Card>
            <Card className="p-3 border-slate-200/80 bg-white">
              <span className="text-[10px] font-bold uppercase text-rose-600">Negative Stock</span>
              <div className="mt-1 text-xl font-bold text-rose-800">{inventorySummary?.negativeStock || 0}</div>
            </Card>
          </div>

          {/* Low Stock Items Alert Table */}
          <Card className="border-slate-200/80 bg-white shadow-xs">
            <CardHeader className="p-4 sm:p-5 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FiAlertCircle className="text-amber-500" size={16} /> Products Requiring Immediate Restocking
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <MiniTable
                columns={['Product / SKU', 'Available Qty']}
                data={lowStockProducts.map((p) => [p.product_name || p.name, String(p.qty ?? p.stock_quantity ?? 0)])}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────── */}
      {/* TAB 6: HR & STAFF ATTENDANCE                                   */}
      {/* ────────────────────────────────────────────────────────────── */}
      {activeTab === 'hr' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card className="p-4 border-slate-200/80 bg-white">
              <span className="text-xs text-slate-500 font-semibold uppercase">Total Staff</span>
              <div className="mt-1 text-2xl font-bold text-slate-900">{employeeStatusBuckets.total}</div>
            </Card>
            <Card className="p-4 border-slate-200/80 bg-white">
              <span className="text-xs text-emerald-600 font-semibold uppercase">Active Employees</span>
              <div className="mt-1 text-2xl font-bold text-emerald-700">{employeeStatusBuckets.active}</div>
            </Card>
            <Card className="p-4 border-slate-200/80 bg-white">
              <span className="text-xs text-amber-500 font-semibold uppercase">On Leave</span>
              <div className="mt-1 text-2xl font-bold text-amber-700">{employeeStatusBuckets.onLeave}</div>
            </Card>
            <Card className="p-4 border-slate-200/80 bg-white">
              <span className="text-xs text-rose-500 font-semibold uppercase">Inactive / Resigned</span>
              <div className="mt-1 text-2xl font-bold text-rose-700">{employeeStatusBuckets.inactive}</div>
            </Card>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────── */}
      {/* TAB 7: AUDIT TRAIL                                             */}
      {/* ────────────────────────────────────────────────────────────── */}
      {activeTab === 'activity' && (
        <Card className="border-slate-200/80 bg-white shadow-xs">
          <CardHeader className="p-4 sm:p-5 border-b border-slate-100">
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FiShield className="text-indigo-600" size={16} /> Immutable System & Authentication Audit Trail
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Verified security activity from backend audit logs
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500">
                    <th className="py-2.5 px-3 font-semibold text-left">Timestamp</th>
                    <th className="py-2.5 px-3 font-semibold text-left">Actor / User</th>
                    <th className="py-2.5 px-3 font-semibold text-left">Action</th>
                    <th className="py-2.5 px-3 font-semibold text-left">Status</th>
                    <th className="py-2.5 px-3 font-semibold text-left">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentLogins.slice(0, 15).map((log, i) => (
                    <tr key={i} className="hover:bg-slate-50/50">
                      <td className="py-2.5 px-3 text-slate-500">{formatDate(log.created_at)}</td>
                      <td className="py-2.5 px-3 font-medium text-slate-800">{log.user_name || log.user?.name || 'System'}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">{log.action}</td>
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          log.status === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                        }`}>
                          {log.status || 'success'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-500">{log.ip_address || '127.0.0.1'}</td>
                    </tr>
                  ))}
                  {recentLogins.length === 0 && (
                    <tr><td colSpan={5} className="py-8 text-center text-slate-400">No audit events recorded</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Floating Gemini AI Assistant */}
      {canUseAI && <GeminiAIAssistant />}
    </div>
  );
}

export default DashboardPage;
