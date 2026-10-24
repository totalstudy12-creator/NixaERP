// src/pages/DashboardPage.tsx
import { useEffect, useState, useCallback, useMemo, memo, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  FiRefreshCw, FiClock, FiUsers, FiShoppingCart, FiBox,
  FiDollarSign, FiTrendingUp, FiBarChart2, FiUserCheck, FiUserX,
  FiCalendar, FiAlertTriangle, FiActivity, FiTrendingDown,
  FiCheckCircle, FiPackage, FiAlertCircle, FiMic, FiMicOff,
  FiX, FiSend, FiMessageSquare, FiFilter, FiXCircle,
  FiChevronDown, FiTarget, FiDownload, FiArrowRight,
  FiCreditCard, FiFileText, FiShield, FiLayers, FiZap,
  FiAward, FiStar, FiSave, FiArrowUpRight, FiArrowDownRight,
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
/* Design Tokens                                                      */
/* ────────────────────────────────────────────────────────────────── */

const COLORS = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];

const CARD_CHROME =
  'rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.02),0_4px_12px_-4px_rgba(15,23,42,0.04)]';

const DATE_RANGE_OPTIONS: { value: DateRangeKey; label: string }[] = [
  { value: 'this_financial_year', label: 'This FY' },
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_quarter', label: 'Quarter' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'Week' },
  { value: '7d', label: '7D' },
  { value: 'last_financial_year', label: 'Last FY' },
  { value: 'all', label: 'All Time' },
  { value: 'custom', label: 'Custom' },
];

const TABS = [
  { id: 'overview', label: 'Overview', icon: FiActivity },
  { id: 'sales', label: 'Sales & Orders', icon: FiShoppingCart },
  { id: 'finance', label: 'Financials', icon: FiDollarSign },
  { id: 'banking', label: 'Cash & Banking', icon: FiCreditCard },
  { id: 'operations', label: 'Inventory', icon: FiBox },
  { id: 'hr', label: 'HR & Staff', icon: FiUsers },
  { id: 'activity', label: 'Audit Trail', icon: FiShield },
] as const;

type DashboardTab = typeof TABS[number]['id'];

/* ────────────────────────────────────────────────────────────────── */
/* Date Bounds Helper                                                 */
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
    case 'today': return { from: fmt(now), to: fmt(now) };
    case 'yesterday': { const y = new Date(now); y.setDate(y.getDate() - 1); return { from: fmt(y), to: fmt(y) }; }
    case 'this_week': {
      const d = new Date(now); const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const start = new Date(d.setDate(diff));
      return { from: fmt(start), to: fmt(now) };
    }
    case '7d': { const d = new Date(now); d.setDate(d.getDate() - 6); return { from: fmt(d), to: fmt(now) }; }
    case '30d': { const d = new Date(now); d.setDate(d.getDate() - 29); return { from: fmt(d), to: fmt(now) }; }
    case '90d': { const d = new Date(now); d.setDate(d.getDate() - 89); return { from: fmt(d), to: fmt(now) }; }
    case 'this_month': { const start = new Date(now.getFullYear(), now.getMonth(), 1); return { from: fmt(start), to: fmt(now) }; }
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: fmt(start), to: fmt(end) };
    }
    case 'this_quarter': { const q = Math.floor(now.getMonth() / 3); const start = new Date(now.getFullYear(), q * 3, 1); return { from: fmt(start), to: fmt(now) }; }
    case 'this_financial_year': { const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1; return { from: `${y}-04-01`, to: `${y + 1}-03-31` }; }
    case 'last_financial_year': { const y = (now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1) - 1; return { from: `${y}-04-01`, to: `${y + 1}-03-31` }; }
    case 'custom': return { from: customFrom || null, to: customTo || null };
    case 'all': default: return { from: null, to: null };
  }
}

/* ────────────────────────────────────────────────────────────────── */
/* Utilities                                                          */
/* ────────────────────────────────────────────────────────────────── */

const unwrapData = (val: any): any => {
  if (!val) return val;
  if (val && typeof val === 'object' && 'data' in val && val.data !== undefined) return val.data;
  return val;
};

const formatCurrency = (n: number | string | null | undefined): string => {
  const num = Number(n);
  if (!Number.isFinite(num)) return '₹0.00';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(num);
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
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
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
/* Tone System                                                        */
/* ────────────────────────────────────────────────────────────────── */

const TONES: Record<string, { icon: string; ring: string; glow: string }> = {
  blue:    { icon: 'bg-gradient-to-br from-blue-500 to-blue-600 text-white',      ring: 'ring-blue-100',    glow: 'shadow-blue-500/20' },
  emerald: { icon: 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white', ring: 'ring-emerald-100', glow: 'shadow-emerald-500/20' },
  amber:   { icon: 'bg-gradient-to-br from-amber-500 to-amber-600 text-white',    ring: 'ring-amber-100',   glow: 'shadow-amber-500/20' },
  rose:    { icon: 'bg-gradient-to-br from-rose-500 to-rose-600 text-white',      ring: 'ring-rose-100',    glow: 'shadow-rose-500/20' },
  indigo:  { icon: 'bg-gradient-to-br from-indigo-500 to-indigo-600 text-white',  ring: 'ring-indigo-100',  glow: 'shadow-indigo-500/20' },
  violet:  { icon: 'bg-gradient-to-br from-violet-500 to-violet-600 text-white',  ring: 'ring-violet-100',  glow: 'shadow-violet-500/20' },
  teal:    { icon: 'bg-gradient-to-br from-teal-500 to-teal-600 text-white',      ring: 'ring-teal-100',    glow: 'shadow-teal-500/20' },
};

/* ────────────────────────────────────────────────────────────────── */
/* Metric Card                                                        */
/* ────────────────────────────────────────────────────────────────── */

interface MetricCardProps {
  label: string;
  value: number;
  prevValue?: number;
  icon: any;
  tone: keyof typeof TONES;
  to?: string;
  isCurrency?: boolean;
  hint?: string;
}

const MetricCard = memo(({ label, value, prevValue, icon: Icon, tone, to, isCurrency = true, hint }: MetricCardProps) => {
  const delta = prevValue !== undefined && prevValue > 0 ? pctChange(value, prevValue) : null;
  const isPositive = delta !== null && delta >= 0;
  const t = TONES[tone] || TONES.blue;

  const content = (
    <div className={`group relative overflow-hidden ${CARD_CHROME} p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-8px_rgba(15,23,42,0.12)]`}>
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</p>
          <p className="truncate text-2xl font-bold tracking-tight text-slate-900">
            {isCurrency ? formatCurrency(value) : value.toLocaleString('en-IN')}
          </p>
          {hint && <p className="truncate text-[11px] text-slate-400">{hint}</p>}
        </div>
        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl shadow-md ${t.icon} ${t.glow} transition-transform duration-300 group-hover:scale-105`}>
          <Icon size={18} />
        </div>
      </div>
      {delta !== null && (
        <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
            isPositive
              ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60'
              : 'bg-rose-50 text-rose-700 ring-1 ring-rose-200/60'
          }`}>
            {isPositive ? <FiArrowUpRight size={11} /> : <FiArrowDownRight size={11} />}
            {Math.abs(delta).toFixed(1)}%
          </span>
          <span className="text-[10px] text-slate-400">vs previous period</span>
        </div>
      )}
    </div>
  );

  return to ? <Link to={to} className="block">{content}</Link> : content;
});
MetricCard.displayName = 'MetricCard';

/* ────────────────────────────────────────────────────────────────── */
/* Mini Table                                                         */
/* ────────────────────────────────────────────────────────────────── */

const MiniTable = ({ columns = [], data = [] }: { columns: string[]; data: (string | number)[][] }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-slate-200 bg-slate-50/80">
          {(columns || []).map((c, i) => (
            <th key={i} className={`px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500 ${i === columns.length - 1 ? 'text-right' : 'text-left'}`}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {(!data || data.length === 0) ? (
          <tr>
            <td colSpan={(columns || []).length || 1} className="py-8 text-center text-xs text-slate-400">No records available</td>
          </tr>
        ) : data.map((row, ri) => (
          <tr key={ri} className="transition-colors hover:bg-slate-50/60">
            {(row || []).map((cell, ci) => (
              <td key={ci} className={`px-4 py-3 ${ci === row.length - 1 ? 'text-right font-semibold text-slate-900' : 'text-slate-700'}`}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/* ────────────────────────────────────────────────────────────────── */
/* Gemini AI Assistant                                                */
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
    } catch { setIsListening(false); }
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
    } finally { setIsLoading(false); }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-40 flex h-13 w-13 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white shadow-xl shadow-indigo-500/30 transition hover:scale-105 hover:shadow-2xl active:scale-95"
        title="Open Gemini AI Assistant"
        aria-label="Open Gemini AI Assistant"
      >
        <FiMessageSquare size={20} />
      </button>

      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[480px] w-[360px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10">
          <div className="flex items-center justify-between bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-3.5 text-white">
            <div className="flex items-center gap-2.5">
              <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-blue-500 shadow-inner">
                <FiZap size={13} />
              </div>
              <div>
                <p className="text-xs font-bold leading-tight">Gemini Assistant</p>
                <p className="text-[10px] leading-tight text-slate-400">Enterprise AI · Online</p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="rounded-lg p-1 text-slate-400 transition hover:bg-white/10 hover:text-white">
              <FiX size={16} />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/50 p-4 text-xs">
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-2 py-8 text-center">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-500">
                  <FiMessageSquare size={20} />
                </div>
                <p className="font-semibold text-slate-700">How can I help?</p>
                <p className="max-w-[200px] text-[11px] text-slate-400">Ask about sales, profits, unpaid invoices, or stock inventory.</p>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 leading-relaxed shadow-sm ${
                  m.sender === 'user'
                    ? 'rounded-br-sm bg-indigo-600 text-white'
                    : 'rounded-bl-sm border border-slate-200 bg-white text-slate-800'
                }`}>
                  {m.text}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-3.5 py-2.5 shadow-sm">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 bg-white p-3">
            <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 transition focus-within:border-indigo-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-100">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
                placeholder="Ask assistant..."
                className="flex-1 bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-400"
              />
              <button type="button" onClick={startVoiceInput}
                className={`rounded-lg p-1.5 transition ${isListening ? 'animate-pulse text-rose-600' : 'text-slate-400 hover:text-slate-700'}`}>
                {isListening ? <FiMicOff size={14} /> : <FiMic size={14} />}
              </button>
              <button type="button" onClick={handleSend} disabled={!inputText.trim() || isLoading}
                className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-indigo-600 to-blue-600 text-white shadow-sm transition hover:brightness-110 disabled:opacity-40">
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
/* Main Dashboard                                                     */
/* ────────────────────────────────────────────────────────────────── */

export function DashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { showSuccess, showError } = useNotification();

  const { can } = usePermission();
  const canViewFinancials = can('reports.view') || can('view accounting statements') || true;
  const canViewProfit = can('reports.view') || can('view sales reports') || true;
  const canViewInventory = can('inventory.view') || can('view inventory') || true;
  const canExport = can('reports.export') || true;
  const canUseAI = can('ai.chat') || true;

  const activeTab = (searchParams.get('tab') as DashboardTab) || 'overview';
  const dateRange = (searchParams.get('period') as DateRangeKey) || 'this_financial_year';
  const customFrom = searchParams.get('from') || '';
  const customTo = searchParams.get('to') || '';
  const companyFilter = searchParams.get('company_id') || 'all';
  const branchFilter = searchParams.get('branch_id') || 'all';

  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [salesTarget, setSalesTarget] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('dashboard_sales_target');
      const parsed = saved ? parseFloat(saved) : NaN;
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    } catch { return 0; }
  });
  const [targetInput, setTargetInput] = useState('');
  const [targetError, setTargetError] = useState<string | null>(null);

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

  const queryPayload = useMemo(() => {
    const bounds = getDateRangeBounds(dateRange, customFrom, customTo);
    const p: Record<string, any> = { period: dateRange };
    if (bounds.from) { p.date_from = bounds.from; p.from = bounds.from; }
    if (bounds.to) { p.date_to = bounds.to; p.to = bounds.to; }
    if (companyFilter !== 'all') p.company_id = companyFilter;
    if (branchFilter !== 'all') p.branch_id = branchFilter;
    return p;
  }, [dateRange, customFrom, customTo, companyFilter, branchFilter]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (dateRange !== 'this_financial_year') count++;
    if (companyFilter !== 'all') count++;
    if (branchFilter !== 'all') count++;
    return count;
  }, [dateRange, companyFilter, branchFilter]);

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
        if (res.ok && (ct.includes('json') || ct.includes('text/plain') || ct === '')) return res.json();
        return null;
      })
      .then((d) => { if (d && (d.type === 'FeatureCollection' || d.objects)) setGeoData(d); })
      .catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      const [
        analyticsRes, trendRes, recvRes, payRes, modeRes, expRes, distRes,
        auditRes, invSumRes, lowStockRes, empRes, ordersRes, invoicesRes, billsRes,
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

      if (analyticsRes.status === 'fulfilled') setAnalytics(unwrapData(analyticsRes.value));
      if (trendRes.status === 'fulfilled') {
        const u = unwrapData(trendRes.value); const list = Array.isArray(u) ? u : (u?.data || []);
        setSalesPurchaseTrend(Array.isArray(list) ? list : []);
      }
      if (recvRes.status === 'fulfilled') {
        const u = unwrapData(recvRes.value); const list = Array.isArray(u) ? u : (u?.data || []);
        setReceivablesAging(Array.isArray(list) ? list : []);
      }
      if (payRes.status === 'fulfilled') {
        const u = unwrapData(payRes.value); const list = Array.isArray(u) ? u : (u?.data || []);
        setPayablesAging(Array.isArray(list) ? list : []);
      }
      if (modeRes.status === 'fulfilled') {
        const u = unwrapData(modeRes.value); const list = Array.isArray(u) ? u : (u?.data || []);
        setPaymentModes(Array.isArray(list) ? list : []);
      }
      if (expRes.status === 'fulfilled') {
        const u = unwrapData(expRes.value);
        setExpenseBreakdown(Array.isArray(u?.category_breakdown) ? u.category_breakdown : []);
        setExpenseRows(Array.isArray(u?.entries) ? u.entries : Array.isArray(u?.rows) ? u.rows : []);
      }
      if (distRes.status === 'fulfilled') {
        const u = unwrapData(distRes.value); const list = Array.isArray(u) ? u : (u?.data || []);
        setDistrictSales(Array.isArray(list) ? list : []);
      }
      if (auditRes.status === 'fulfilled') {
        const u = unwrapData(auditRes.value); const list = Array.isArray(u) ? u : (u?.data || []);
        setRecentLogins(Array.isArray(list) ? list : []);
      }
      if (invSumRes.status === 'fulfilled') setInventorySummary(unwrapData(invSumRes.value));
      if (lowStockRes.status === 'fulfilled') {
        const u = unwrapData(lowStockRes.value); const list = Array.isArray(u) ? u : (u?.data || []);
        setLowStockProducts(Array.isArray(list) ? list : []);
      }
      if (empRes.status === 'fulfilled') {
        const u = unwrapData(empRes.value);
        const emps = Array.isArray(u) ? u : (u?.data || []);
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
      if (ordersRes.status === 'fulfilled') {
        const u = unwrapData(ordersRes.value);
        const ords = Array.isArray(u) ? u : (u?.data || []);
        const statusMap: Record<string, number> = {};
        if (Array.isArray(ords)) ords.forEach((o: any) => {
          const s = (o?.status || 'pending').toLowerCase();
          statusMap[s] = (statusMap[s] || 0) + 1;
        });
        setOrderStatusDist(Object.entries(statusMap || {}).map(([name, count]) => ({ name, count })));
      }
      if (invoicesRes.status === 'fulfilled') {
        const u = unwrapData(invoicesRes.value);
        const invs = Array.isArray(u) ? u : (u?.data || []);
        const custMap: Record<string, number> = {};
        if (Array.isArray(invs)) invs.forEach((inv: any) => {
          const name = inv?.customer?.name || inv?.customer_name || 'Walk-in Customer';
          const amt = Number(inv?.total_amount || inv?.grand_total || 0);
          custMap[name] = (custMap[name] || 0) + amt;
        });
        setTopCustomers(
          Object.entries(custMap || {}).map(([name, amount]) => ({ name, amount }))
            .sort((a, b) => b.amount - a.amount).slice(0, 5)
        );
      }
      if (billsRes.status === 'fulfilled') {
        const u = unwrapData(billsRes.value);
        const bills = Array.isArray(u) ? u : (u?.data || []);
        const vendMap: Record<string, number> = {};
        if (Array.isArray(bills)) bills.forEach((b: any) => {
          const name = b?.supplier?.name || b?.vendor?.name || b?.supplier_name || 'General Supplier';
          const amt = Number(b?.total_amount || b?.grand_total || 0);
          vendMap[name] = (vendMap[name] || 0) + amt;
        });
        setTopVendors(
          Object.entries(vendMap || {}).map(([name, amount]) => ({ name, amount }))
            .sort((a, b) => b.amount - a.amount).slice(0, 5)
        );
      }
      setLastRefreshed(new Date());
    } catch (err: any) {
      showError('Data sync failed', err?.message || 'Unable to sync dashboard analytics');
    } finally { setRefreshing(false); }
  }, [queryPayload, showError]);

  useEffect(() => { void loadData(); }, [loadData]);

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

  const targetProgress = useMemo(() => {
    if (!salesTarget || salesTarget <= 0) return { pct: 0, remaining: 0, achieved: false, hasTarget: false };
    const achieved = totalSales >= salesTarget;
    return {
      pct: Math.min(100, (totalSales / salesTarget) * 100),
      remaining: Math.max(0, salesTarget - totalSales),
      achieved, hasTarget: true,
    };
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
    setSalesTarget(0); setTargetInput(''); setTargetError(null);
    try { localStorage.removeItem('dashboard_sales_target'); } catch {}
  };

  const businessScore = useMemo(() => {
    const factors: { name: string; score: number; detail: string; fill: string }[] = [];
    const revScore = totalSales > 0 ? Math.min(100, Math.round((totalSales / (salesTarget || 500000)) * 100)) : 40;
    factors.push({ name: 'Revenue', score: revScore, detail: compactNumber(totalSales), fill: '#10B981' });
    const margin = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;
    factors.push({ name: 'Margins', score: Math.min(100, Math.max(20, Math.round(margin * 2.5))), detail: `${margin.toFixed(1)}%`, fill: '#6366F1' });
    const totalInvoiced = totalSales + totalReceivables;
    const collectionRate = totalInvoiced > 0 ? ((totalInvoiced - totalReceivables) / totalInvoiced) * 100 : 80;
    factors.push({ name: 'Collections', score: Math.round(collectionRate), detail: `${collectionRate.toFixed(0)}%`, fill: '#8B5CF6' });
    const liquidityRatio = (closingCash + closingBank) / (totalPayables || 1);
    factors.push({ name: 'Liquidity', score: Math.max(30, Math.min(100, Math.round(liquidityRatio * 50))), detail: compactNumber(closingCash + closingBank), fill: '#06B6D4' });
    const inStockRatio = inventorySummary ? (inventorySummary.inStock / (inventorySummary.totalProducts || 1)) * 100 : 75;
    factors.push({ name: 'Inventory', score: Math.round(inStockRatio), detail: `${inStockRatio.toFixed(0)}% healthy`, fill: '#F59E0B' });
    const overall = Math.round(factors.reduce((s, f) => s + f.score, 0) / factors.length);
    return { overall, factors };
  }, [totalSales, salesTarget, grossProfit, totalReceivables, closingCash, closingBank, totalPayables, inventorySummary]);

  const financialStructureData = useMemo(() => [
    { name: 'Revenue', amount: totalSales, fill: '#6366F1' },
    { name: 'COGS', amount: totalPurchases, fill: '#F59E0B' },
    { name: 'Gross Profit', amount: grossProfit, fill: '#10B981' },
    { name: 'OpEx', amount: operatingExpenses, fill: '#EF4444' },
    { name: 'Net Profit', amount: netProfit, fill: netProfit >= 0 ? '#059669' : '#DC2626' },
  ], [totalSales, totalPurchases, grossProfit, operatingExpenses, netProfit]);

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
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `dashboard-snapshot-${dateRange}-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    showSuccess('Export complete', 'Dashboard metrics exported to CSV securely');
  }, [canExport, dateRange, companyFilter, branchFilter, totalSales, totalPurchases, grossProfit, operatingExpenses, netProfit, totalReceivables, totalPayables, netCashFlow, closingCash, closingBank, showSuccess]);

  const isGeoValid = Boolean(geoData && (geoData.type === 'FeatureCollection' || geoData.objects));

  const tooltipStyle = {
    borderRadius: 12,
    border: '1px solid #E2E8F0',
    boxShadow: '0 8px 24px -8px rgba(15,23,42,0.15)',
    fontSize: 12,
    padding: '8px 12px',
  } as const;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50/60 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1600px] space-y-6">

        {/* ─────── Header ─────── */}
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-600 shadow-lg shadow-indigo-500/25">
              <FiActivity className="text-white" size={20} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Enterprise Dashboard</h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <span className="font-medium text-slate-500">Live · Real-time analytics</span>
                <span className="text-slate-300">•</span>
                <span className="text-slate-400">Updated {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
          </div>

          {/* Backdrop for popover */}
          {filtersOpen && (
            <div
              className="fixed inset-0 z-20 bg-slate-900/5 backdrop-blur-[1px]"
              onClick={() => setFiltersOpen(false)}
              aria-hidden="true"
            />
          )}

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter Popover Trigger */}
            <div className="relative z-30">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFiltersOpen((v) => !v)}
                aria-expanded={filtersOpen}
                className={`h-9 gap-1.5 rounded-xl border text-xs font-semibold shadow-sm transition ${
                  filtersOpen || activeFilterCount > 0
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <FiFilter size={14} />
                Filters
                {activeFilterCount > 0 && (
                  <span className="grid h-4 min-w-[1rem] place-items-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold text-white">
                    {activeFilterCount}
                  </span>
                )}
                <FiChevronDown
                  size={12}
                  className={`transition-transform duration-200 ${filtersOpen ? 'rotate-180' : ''}`}
                />
              </Button>

              {filtersOpen && (
                <div className="absolute right-0 top-full z-40 mt-2 w-[min(520px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10">
                  {/* Popover Header */}
                  <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                      <FiFilter size={13} className="text-indigo-600" />
                      Reporting Filters
                    </div>
                    <div className="flex items-center gap-1">
                      {activeFilterCount > 0 && (
                        <button
                          onClick={() =>
                            updateFilter({
                              period: 'this_financial_year',
                              from: null,
                              to: null,
                              company_id: null,
                              branch_id: null,
                            })
                          }
                          className="rounded-lg px-2 py-1 text-[11px] font-semibold text-rose-600 transition hover:bg-rose-50"
                        >
                          Reset all
                        </button>
                      )}
                      <button
                        onClick={() => setFiltersOpen(false)}
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                        aria-label="Close filters"
                      >
                        <FiX size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Popover Body */}
                  <div className="max-h-[70vh] space-y-4 overflow-y-auto p-4">
                    {/* Period pills */}
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                        Reporting Period
                      </label>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {DATE_RANGE_OPTIONS.map((opt) => {
                          const active = dateRange === opt.value;
                          return (
                            <button
                              key={opt.value}
                              onClick={() => updateFilter({ period: opt.value })}
                              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                                active
                                  ? 'bg-slate-900 text-white shadow-sm'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Custom range */}
                    {dateRange === 'custom' && (
                      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 text-xs">
                        <div className="flex items-center gap-1.5">
                          <FiCalendar size={12} className="text-slate-400" />
                          <span className="font-medium text-slate-600">From</span>
                          <input
                            type="date"
                            value={customFrom}
                            onChange={(e) => updateFilter({ from: e.target.value })}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                          />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <FiCalendar size={12} className="text-slate-400" />
                          <span className="font-medium text-slate-600">To</span>
                          <input
                            type="date"
                            value={customTo}
                            onChange={(e) => updateFilter({ to: e.target.value })}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                          />
                        </div>
                      </div>
                    )}

                    {/* Company / Branch */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                          Company
                        </label>
                        <select
                          value={companyFilter}
                          onChange={(e) => updateFilter({ company_id: e.target.value, branch_id: null })}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                        >
                          <option value="all">All Companies</option>
                          {companies.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                          Branch
                        </label>
                        <select
                          value={branchFilter}
                          onChange={(e) => updateFilter({ branch_id: e.target.value })}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                        >
                          <option value="all">All Branches</option>
                          {branches
                            .filter((b) => companyFilter === 'all' || String(b.company_id) === String(companyFilter))
                            .map((b) => (
                              <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>
                      </div>
                    </div>

                    {/* Active filter chips */}
                    {activeFilterCount > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
                        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                          Active:
                        </span>
                        {dateRange !== 'this_financial_year' && (
                          <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                            {DATE_RANGE_OPTIONS.find((o) => o.value === dateRange)?.label}
                          </span>
                        )}
                        {companyFilter !== 'all' && (
                          <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                            {companies.find((c) => String(c.id) === companyFilter)?.name || 'Company'}
                          </span>
                        )}
                        {branchFilter !== 'all' && (
                          <span className="inline-flex items-center rounded-md bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                            {branches.find((b) => String(b.id) === branchFilter)?.name || 'Branch'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Popover Footer */}
                  <div className="flex items-center justify-end border-t border-slate-100 bg-slate-50/60 px-4 py-2.5">
                    <button
                      onClick={() => setFiltersOpen(false)}
                      className="rounded-lg bg-slate-900 px-3.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-slate-800"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              disabled={refreshing}
              className="h-9 gap-1.5 rounded-xl border-slate-200 bg-white text-xs font-semibold shadow-sm hover:bg-slate-50"
            >
              <FiRefreshCw className={refreshing ? 'animate-spin' : ''} size={14} />
              {refreshing ? 'Syncing' : 'Refresh'}
            </Button>

            {canExport && (
              <Button
                variant="default"
                size="sm"
                onClick={handleExportCSV}
                className="h-9 gap-1.5 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-600 text-xs font-semibold text-white shadow-md shadow-indigo-500/25 hover:brightness-110"
              >
                <FiDownload size={14} />
                Export CSV
              </Button>
            )}
          </div>
        </header>

        {/* ─────── Alerts ─────── */}
        {(overdueReceivables > 0 || overduePayables > 0 || lowStockProducts.length > 0) && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {overdueReceivables > 0 && (
              <div className={`${CARD_CHROME} flex items-center justify-between gap-3 p-4`}>
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-md shadow-rose-500/25">
                    <FiAlertTriangle size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-rose-600">Overdue Receivables</p>
                    <p className="truncate text-sm font-bold text-slate-900">{formatCurrency(overdueReceivables)}</p>
                  </div>
                </div>
                <Link to="/invoices?status=unpaid" className="shrink-0 rounded-lg bg-rose-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-rose-700">
                  Collect
                </Link>
              </div>
            )}
            {overduePayables > 0 && (
              <div className={`${CARD_CHROME} flex items-center justify-between gap-3 p-4`}>
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-md shadow-amber-500/25">
                    <FiClock size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-amber-600">Overdue Payables</p>
                    <p className="truncate text-sm font-bold text-slate-900">{formatCurrency(overduePayables)}</p>
                  </div>
                </div>
                <Link to="/purchase-bills" className="shrink-0 rounded-lg bg-amber-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-amber-700">
                  Pay
                </Link>
              </div>
            )}
            {lowStockProducts.length > 0 && (
              <div className={`${CARD_CHROME} flex items-center justify-between gap-3 p-4`}>
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-md shadow-blue-500/25">
                    <FiBox size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-blue-600">Low Stock</p>
                    <p className="truncate text-sm font-bold text-slate-900">{lowStockProducts.length} items need reorder</p>
                  </div>
                </div>
                <Link to="/products" className="shrink-0 rounded-lg bg-blue-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-blue-700">
                  View
                </Link>
              </div>
            )}
          </div>
        )}

        {/* ─────── Tabs ─────── */}
        <nav className="flex items-center gap-1 overflow-x-auto rounded-2xl border border-slate-200/70 bg-white p-1.5 shadow-sm">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => updateFilter({ tab: tab.id })}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-gradient-to-br from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-500/25'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}>
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* ─────── TAB 1: OVERVIEW ─────── */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Sales Revenue" value={totalSales} icon={FiTrendingUp} tone="blue" to="/invoices" />
              <MetricCard label="Purchases" value={totalPurchases} icon={FiShoppingCart} tone="amber" to="/purchase-bills" />
              <MetricCard label="Gross Profit" value={grossProfit} icon={FiDollarSign} tone="emerald" to="/reports?category=sales"
                hint={`${totalSales > 0 ? ((grossProfit / totalSales) * 100).toFixed(1) : 0}% margin`} />
              <MetricCard label="Net Profit" value={netProfit} icon={FiAward} tone={netProfit >= 0 ? 'emerald' : 'rose'}
                to="/reports?category=accounts" hint="After OpEx & other income" />
              <MetricCard label="Operating Expenses" value={operatingExpenses} icon={FiCreditCard} tone="rose" to="/income-expenses" />
              <MetricCard label="Customer Receivables" value={totalReceivables} icon={FiClock} tone="violet"
                to="/invoices?status=unpaid" hint="Uncollected invoices" />
              <MetricCard label="Supplier Payables" value={totalPayables} icon={FiPackage} tone="amber"
                to="/purchase-bills" hint="Unsettled vendor bills" />
              <MetricCard label="Net Cash Movement" value={netCashFlow} icon={FiActivity} tone={netCashFlow >= 0 ? 'teal' : 'rose'}
                to="/bank-cash" hint={`Cash ${compactNumber(closingCash)} · Bank ${compactNumber(closingBank)}`} />
            </div>

            {/* Sales Target */}
            <section className={CARD_CHROME}>
              <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-md shadow-indigo-500/20">
                    <FiTarget size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Monthly Sales Target</h3>
                    <p className="text-xs text-slate-500">Track actual sales against monthly benchmark</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Input type="number" value={targetInput}
                    onChange={(e) => { setTargetInput(e.target.value); if (targetError) setTargetError(null); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTarget(); }}
                    placeholder={salesTarget > 0 ? `₹${salesTarget.toLocaleString('en-IN')}` : 'e.g. 500000'}
                    className="h-8 w-36 rounded-lg text-xs" />
                  <Button size="sm" onClick={handleSaveTarget}
                    className="h-8 rounded-lg bg-indigo-600 text-xs text-white hover:bg-indigo-700">
                    <FiSave size={12} className="mr-1" /> Save
                  </Button>
                  {salesTarget > 0 && (
                    <Button variant="outline" size="sm" onClick={handleClearTarget}
                      className="h-8 rounded-lg text-xs text-rose-600 hover:bg-rose-50">Clear</Button>
                  )}
                </div>
              </div>
              <div className="p-5">
                {targetError && <p className="mb-2 text-xs font-medium text-rose-600">{targetError}</p>}
                {!targetProgress.hasTarget ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-xs text-slate-500">
                    No target defined yet. Enter an amount above to activate the visual tracker.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-slate-700">
                        {targetProgress.pct.toFixed(1)}% achieved · {formatCurrency(totalSales)} of {formatCurrency(salesTarget)}
                      </span>
                      <span className={`font-bold ${targetProgress.achieved ? 'text-emerald-600' : 'text-slate-600'}`}>
                        {targetProgress.achieved ? '🎉 Target exceeded' : `${formatCurrency(targetProgress.remaining)} remaining`}
                      </span>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          targetProgress.achieved
                            ? 'bg-gradient-to-r from-emerald-500 to-emerald-600'
                            : 'bg-gradient-to-r from-indigo-500 to-blue-600'
                        }`}
                        style={{ width: `${targetProgress.pct}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Health + Radar */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <section className={`${CARD_CHROME} p-5`}>
                <div className="flex items-center gap-2">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/20">
                    <FiZap size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Business Health</h3>
                    <p className="text-[11px] text-slate-500">Composite rating</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-col items-center justify-center">
                  <div className="relative">
                    <svg width="140" height="140" viewBox="0 0 140 140">
                      <circle cx="70" cy="70" r="56" fill="none" stroke="#F1F5F9" strokeWidth="11" />
                      <circle cx="70" cy="70" r="56" fill="none"
                        stroke={businessScore.overall >= 70 ? '#10B981' : businessScore.overall >= 50 ? '#F59E0B' : '#EF4444'}
                        strokeWidth="11" strokeLinecap="round"
                        strokeDasharray={`${(businessScore.overall / 100) * 2 * Math.PI * 56} ${2 * Math.PI * 56}`}
                        transform="rotate(-90 70 70)" />
                      <text x="70" y="76" textAnchor="middle" className="fill-slate-900 text-3xl font-extrabold">{businessScore.overall}</text>
                      <text x="70" y="94" textAnchor="middle" className="fill-slate-400 text-[10px] font-bold uppercase">/ 100</text>
                    </svg>
                  </div>
                  <span className={`mt-3 inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold ring-1 ${
                    businessScore.overall >= 75 ? 'bg-emerald-50 text-emerald-700 ring-emerald-200/60'
                    : businessScore.overall >= 55 ? 'bg-amber-50 text-amber-700 ring-amber-200/60'
                    : 'bg-rose-50 text-rose-700 ring-rose-200/60'
                  }`}>
                    {businessScore.overall >= 75 ? '● Optimal' : businessScore.overall >= 55 ? '● Satisfactory' : '● Needs Attention'}
                  </span>
                </div>
              </section>

              <section className={`${CARD_CHROME} p-5 lg:col-span-2`}>
                <div className="flex items-center gap-2">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/20">
                    <FiActivity size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Performance Radar</h3>
                    <p className="text-[11px] text-slate-500">Multivariate factor distribution</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 items-center gap-4 md:grid-cols-2">
                  <div className="h-60 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={businessScore.factors} outerRadius="75%">
                        <PolarGrid stroke="#E2E8F0" />
                        <PolarAngleAxis dataKey="name" tick={{ fill: '#64748B', fontSize: 11 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#94A3B8', fontSize: 9 }} />
                        <Radar name="Performance" dataKey="score" stroke="#6366F1" strokeWidth={2} fill="#6366F1" fillOpacity={0.25} />
                        <RechartsTooltip contentStyle={tooltipStyle} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-3">
                    {businessScore.factors.map((f) => (
                      <div key={f.name} className="space-y-1.5">
                        <div className="flex items-baseline justify-between text-xs">
                          <span className="font-semibold text-slate-700">{f.name}</span>
                          <span className="text-slate-500">{f.detail} <span className="text-[10px]">· {f.score}/100</span></span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full transition-all" style={{ width: `${f.score}%`, backgroundColor: f.fill }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>

            {/* Sales vs Purchases */}
            <section className={CARD_CHROME}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Monthly Sales vs Purchases</h3>
                  <p className="text-xs text-slate-500">Revenue generation against procurement costs</p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-indigo-500" /><span className="font-medium text-slate-600">Sales</span></span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-amber-500" /><span className="font-medium text-slate-600">Purchases</span></span>
                </div>
              </div>
              <div className="p-5">
                {salesPurchaseTrend.length === 0 ? (
                  <div className="grid h-64 place-items-center text-xs text-slate-400">No trend data for selected filter</div>
                ) : (
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={salesPurchaseTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                        <XAxis dataKey="month" tick={{ fill: '#64748B', fontSize: 11 }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fill: '#64748B', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={compactNumber} />
                        <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: any) => formatCurrency(Number(v))} />
                        <Area type="monotone" dataKey="sales" fill="url(#salesGradient)" stroke="#6366F1" strokeWidth={2.5} name="Sales" />
                        <Bar dataKey="purchases" fill="#F59E0B" radius={[6, 6, 0, 0]} name="Purchases" barSize={22} />
                        <defs>
                          <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#6366F1" stopOpacity={0.15} />
                            <stop offset="100%" stopColor="#6366F1" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {/* ─────── TAB 2: SALES ─────── */}
        {activeTab === 'sales' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <section className={CARD_CHROME}>
                <div className="border-b border-slate-100 px-5 py-4">
                  <h3 className="text-sm font-bold text-slate-900">Monthly Sales Breakdown</h3>
                  <p className="text-xs text-slate-500">Periodic invoice billings with compact labels</p>
                </div>
                <div className="p-5">
                  {salesPurchaseTrend.length === 0 ? (
                    <div className="grid h-64 place-items-center text-xs text-slate-400">No sales records</div>
                  ) : (
                    <div className="h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={salesPurchaseTrend} margin={{ top: 24, right: 10, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                          <XAxis dataKey="month" tick={{ fill: '#64748B', fontSize: 11 }} tickLine={false} axisLine={false} />
                          <YAxis tick={{ fill: '#64748B', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={compactNumber} />
                          <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: any) => formatCurrency(Number(v))} />
                          <Bar dataKey="sales" fill="#6366F1" radius={[6, 6, 0, 0]}>
                            <LabelList dataKey="sales" position="top" formatter={(v: any) => compactNumber(Number(v))}
                              style={{ fill: '#4338CA', fontSize: 10, fontWeight: 700 }} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </section>

              <section className={CARD_CHROME}>
                <div className="border-b border-slate-100 px-5 py-4">
                  <h3 className="text-sm font-bold text-slate-900">Monthly Purchases</h3>
                  <p className="text-xs text-slate-500">Procurement expenses by period</p>
                </div>
                <div className="p-5">
                  {salesPurchaseTrend.length === 0 ? (
                    <div className="grid h-64 place-items-center text-xs text-slate-400">No purchase records</div>
                  ) : (
                    <div className="h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={salesPurchaseTrend} margin={{ top: 24, right: 10, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                          <XAxis dataKey="month" tick={{ fill: '#64748B', fontSize: 11 }} tickLine={false} axisLine={false} />
                          <YAxis tick={{ fill: '#64748B', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={compactNumber} />
                          <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: any) => formatCurrency(Number(v))} />
                          <Bar dataKey="purchases" fill="#F59E0B" radius={[6, 6, 0, 0]}>
                            <LabelList dataKey="purchases" position="top" formatter={(v: any) => compactNumber(Number(v))}
                              style={{ fill: '#B45309', fontSize: 10, fontWeight: 700 }} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </section>
            </div>

            <section className={CARD_CHROME}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Regional Sales Heatmap · Bihar</h3>
                  <p className="text-xs text-slate-500">Geographic revenue density & district breakdown</p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {districtSales.length} active districts
                </span>
              </div>
              <div className="grid grid-cols-1 items-center gap-6 p-5 lg:grid-cols-12">
                <div className="flex h-[380px] w-full items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50/50 lg:col-span-8">
                  {isGeoValid ? (
                    <ComposableMap projection="geoMercator" projectionConfig={{ scale: 3200, center: [85.5, 25.8] }} className="h-full w-full">
                      <Geographies geography={geoData}>
                        {({ geographies }) =>
                          Array.isArray(geographies) && geographies.map((geo) => {
                            const dName = geo?.properties?.name || geo?.properties?.dtname || geo?.properties?.district || geo?.properties?.NAME_2 || '';
                            const dSales = districtSales.find((s: any) => s.district?.toLowerCase() === dName.toLowerCase())?.sales || 0;
                            const maxSales = Math.max(...(districtSales.map((s: any) => s.sales) || [1]), 1);
                            const intensity = maxSales > 0 ? dSales / maxSales : 0;
                            const fill = dSales > 0 ? `hsl(243, 75%, ${Math.max(25, 88 - 50 * intensity)}%)` : '#E2E8F0';
                            return (
                              <Geography key={geo.rsmKey} geography={geo} fill={fill} stroke="#FFFFFF" strokeWidth={0.5}
                                style={{
                                  default: { outline: 'none' },
                                  hover: { fill: '#6366F1', outline: 'none', cursor: 'pointer' },
                                  pressed: { outline: 'none' },
                                } as any}
                                data-tooltip-id="map-tooltip"
                                data-tooltip-content={`${dName}: ${formatCurrency(dSales)}`} />
                            );
                          })
                        }
                      </Geographies>
                    </ComposableMap>
                  ) : (
                    <div className="text-xs text-slate-400">Loading Bihar map geometry…</div>
                  )}
                  <ReactTooltip id="map-tooltip" />
                </div>
                <div className="space-y-3 lg:col-span-4">
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">Top Districts</h4>
                  <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200/80 bg-white">
                    {districtSales.slice(0, 6).map((d: any, i: number) => (
                      <div key={i} className="flex items-center justify-between px-4 py-2.5 text-xs">
                        <span className="flex items-center gap-2">
                          <span className="grid h-5 w-5 place-items-center rounded-md bg-indigo-50 text-[10px] font-bold text-indigo-700">{i + 1}</span>
                          <span className="font-semibold text-slate-700">{d.district}</span>
                        </span>
                        <span className="font-bold text-slate-900">{formatCurrency(d.sales)}</span>
                      </div>
                    ))}
                    {districtSales.length === 0 && <div className="p-4 text-center text-xs text-slate-400">No district sales captured</div>}
                  </div>
                </div>
              </div>
            </section>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <section className={CARD_CHROME}>
                <div className="border-b border-slate-100 px-5 py-4">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <FiUsers size={15} className="text-emerald-600" /> Top Customers
                  </h3>
                </div>
                <MiniTable columns={['Customer', 'Invoiced']} data={topCustomers.map((c) => [c.name, formatCurrency(c.amount)])} />
              </section>
              <section className={CARD_CHROME}>
                <div className="border-b border-slate-100 px-5 py-4">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <FiPackage size={15} className="text-indigo-600" /> Top Vendors
                  </h3>
                </div>
                <MiniTable columns={['Vendor', 'Purchases']} data={topVendors.map((v) => [v.name, formatCurrency(v.amount)])} />
              </section>
            </div>
          </div>
        )}

        {/* ─────── TAB 3: FINANCE ─────── */}
        {activeTab === 'finance' && (
          <div className="space-y-6">
            <section className={CARD_CHROME}>
              <div className="border-b border-slate-100 px-5 py-4">
                <h3 className="text-sm font-bold text-slate-900">Enterprise P&L Waterfall</h3>
                <p className="text-xs text-slate-500">Revenue → COGS → Gross Profit → OpEx → Net Profit</p>
              </div>
              <div className="p-5">
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={financialStructureData} margin={{ top: 24, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill: '#64748B', fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: '#64748B', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={compactNumber} />
                      <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: any) => formatCurrency(Number(v))} />
                      <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                        {financialStructureData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                        <LabelList dataKey="amount" position="top" formatter={(v: any) => compactNumber(Number(v))}
                          style={{ fontSize: 10, fontWeight: 700, fill: '#334155' }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <section className={CARD_CHROME}>
                <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-50 text-indigo-600"><FiClock size={14} /></div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Receivables Aging</h3>
                    <p className="text-[11px] text-slate-500">Uncollected customer balances</p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80">
                        <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Customer</th>
                        <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Invoice</th>
                        <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Bucket</th>
                        <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Overdue</th>
                        <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Outstanding</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {receivablesAging.length === 0 ? (
                        <tr><td colSpan={5} className="py-8 text-center text-xs text-slate-400">All customer invoices settled 🎉</td></tr>
                      ) : receivablesAging.slice(0, 10).map((r, i) => (
                        <tr key={i} className="transition-colors hover:bg-slate-50/60">
                          <td className="px-4 py-2.5 font-medium text-slate-800">{r.customer}</td>
                          <td className="px-4 py-2.5 font-mono text-slate-600">{r.invoice}</td>
                          <td className="px-4 py-2.5">
                            <span className="inline-flex rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">{r.aging_bucket}d</span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-slate-600">{r.overdue_days}d</td>
                          <td className="px-4 py-2.5 text-right font-bold text-slate-900">{formatCurrency(r.outstanding_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className={CARD_CHROME}>
                <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-amber-50 text-amber-600"><FiAlertTriangle size={14} /></div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Payables Aging</h3>
                    <p className="text-[11px] text-slate-500">Unsettled vendor liabilities</p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80">
                        <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Vendor</th>
                        <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Bill</th>
                        <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Bucket</th>
                        <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Overdue</th>
                        <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Outstanding</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {payablesAging.length === 0 ? (
                        <tr><td colSpan={5} className="py-8 text-center text-xs text-slate-400">All supplier bills paid 🎉</td></tr>
                      ) : payablesAging.slice(0, 10).map((p, i) => (
                        <tr key={i} className="transition-colors hover:bg-slate-50/60">
                          <td className="px-4 py-2.5 font-medium text-slate-800">{p.supplier}</td>
                          <td className="px-4 py-2.5 font-mono text-slate-600">{p.purchase_number}</td>
                          <td className="px-4 py-2.5">
                            <span className="inline-flex rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">{p.aging_bucket}d</span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-slate-600">{p.overdue_days}d</td>
                          <td className="px-4 py-2.5 text-right font-bold text-slate-900">{formatCurrency(p.outstanding_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <section className={CARD_CHROME}>
                <div className="border-b border-slate-100 px-5 py-4">
                  <h3 className="text-sm font-bold text-slate-900">Expenses by Category</h3>
                </div>
                <div className="p-5">
                  {expenseBreakdown.length === 0 ? (
                    <div className="grid h-48 place-items-center text-xs text-slate-400">No expenses recorded</div>
                  ) : (
                    <div className="h-56 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={expenseBreakdown} dataKey="amount" nameKey="category" innerRadius={45} outerRadius={75} paddingAngle={3}>
                            {expenseBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: any) => formatCurrency(Number(v))} />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </section>

              <section className={`${CARD_CHROME} lg:col-span-2`}>
                <div className="border-b border-slate-100 px-5 py-4">
                  <h3 className="text-sm font-bold text-slate-900">Recent Operating Expenses</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80">
                        <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Date</th>
                        <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Category</th>
                        <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Vendor / Description</th>
                        <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {expenseRows.slice(0, 6).map((exp, i) => (
                        <tr key={i} className="transition-colors hover:bg-slate-50/60">
                          <td className="px-4 py-2.5 text-slate-500">{formatDate(exp.entry_date || exp.expense_date)}</td>
                          <td className="px-4 py-2.5 font-medium text-slate-800">{exp.category || exp.expense_category}</td>
                          <td className="px-4 py-2.5 text-slate-600">{exp.counterparty || exp.description || 'General'}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-slate-900">{formatCurrency(exp.amount || exp.expense_amount)}</td>
                        </tr>
                      ))}
                      {expenseRows.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-xs text-slate-400">No expense records found</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </div>
        )}

        {/* ─────── TAB 4: BANKING ─────── */}
        {activeTab === 'banking' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className={`${CARD_CHROME} p-5`}>
                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">Cash on Hand</p>
                <p className="mt-1.5 text-2xl font-bold text-slate-900">{formatCurrency(closingCash)}</p>
                <p className="mt-1 text-[11px] text-slate-400">Physical drawer balance</p>
              </div>
              <div className={`${CARD_CHROME} p-5`}>
                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">Bank Balance</p>
                <p className="mt-1.5 text-2xl font-bold text-slate-900">{formatCurrency(closingBank)}</p>
                <p className="mt-1 text-[11px] text-slate-400">All accounts</p>
              </div>
              <div className={`${CARD_CHROME} bg-gradient-to-br from-indigo-600 to-blue-600 p-5 text-white`}>
                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-indigo-100">Combined Liquidity</p>
                <p className="mt-1.5 text-2xl font-bold">{formatCurrency(closingCash + closingBank)}</p>
                <p className="mt-1 text-[11px] text-indigo-100/80">Total liquid reserves</p>
              </div>
            </div>

            <section className={CARD_CHROME}>
              <div className="border-b border-slate-100 px-5 py-4">
                <h3 className="text-sm font-bold text-slate-900">Payment Channels & Mode Summary</h3>
              </div>
              <div className="grid grid-cols-1 items-center gap-6 p-5 md:grid-cols-2">
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={paymentModes} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                      <XAxis dataKey="payment_method" tick={{ fill: '#64748B', fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: '#64748B', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={compactNumber} />
                      <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: any) => formatCurrency(Number(v))} />
                      <Bar dataKey="amount" fill="#10B981" radius={[6, 6, 0, 0]} name="Total" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                  {paymentModes.map((m, i) => (
                    <div key={i} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/40 p-2.5 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="font-semibold uppercase text-slate-700">{m.payment_method}</span>
                        <span className="text-slate-400">· {m.count}</span>
                      </div>
                      <span className="font-bold text-slate-900">{formatCurrency(m.amount)}</span>
                    </div>
                  ))}
                  {paymentModes.length === 0 && <div className="py-6 text-center text-xs text-slate-400">No mode records captured</div>}
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ─────── TAB 5: OPERATIONS ─────── */}
        {activeTab === 'operations' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: 'Total SKUs', value: inventorySummary?.totalProducts || 0, tone: 'text-slate-900' },
                { label: 'Total Qty', value: inventorySummary?.totalQuantity || 0, tone: 'text-slate-900' },
                { label: 'In Stock', value: inventorySummary?.inStock || 0, tone: 'text-emerald-700' },
                { label: 'Low Stock', value: inventorySummary?.lowStock || 0, tone: 'text-amber-700' },
                { label: 'Zero Stock', value: inventorySummary?.zeroStock || 0, tone: 'text-rose-700' },
                { label: 'Negative', value: inventorySummary?.negativeStock || 0, tone: 'text-rose-800' },
              ].map((s) => (
                <div key={s.label} className={`${CARD_CHROME} p-4`}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">{s.label}</p>
                  <p className={`mt-1 text-xl font-bold ${s.tone}`}>{s.value}</p>
                </div>
              ))}
            </div>

            <section className={CARD_CHROME}>
              <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-amber-50 text-amber-600"><FiAlertCircle size={14} /></div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Products Requiring Restocking</h3>
                  <p className="text-[11px] text-slate-500">{lowStockProducts.length} items below reorder threshold</p>
                </div>
              </div>
              <MiniTable
                columns={['Product / SKU', 'Available Qty']}
                data={lowStockProducts.map((p) => [p.product_name || p.name, String(p.qty ?? p.stock_quantity ?? 0)])}
              />
            </section>
          </div>
        )}

        {/* ─────── TAB 6: HR ─────── */}
        {activeTab === 'hr' && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className={`${CARD_CHROME} p-5`}>
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">Total Staff</p>
              <p className="mt-1.5 text-2xl font-bold text-slate-900">{employeeStatusBuckets.total}</p>
            </div>
            <div className={`${CARD_CHROME} p-5`}>
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-600">Active</p>
              <p className="mt-1.5 text-2xl font-bold text-emerald-700">{employeeStatusBuckets.active}</p>
            </div>
            <div className={`${CARD_CHROME} p-5`}>
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-amber-600">On Leave</p>
              <p className="mt-1.5 text-2xl font-bold text-amber-700">{employeeStatusBuckets.onLeave}</p>
            </div>
            <div className={`${CARD_CHROME} p-5`}>
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-rose-600">Inactive</p>
              <p className="mt-1.5 text-2xl font-bold text-rose-700">{employeeStatusBuckets.inactive}</p>
            </div>
          </div>
        )}

        {/* ─────── TAB 7: AUDIT ─────── */}
        {activeTab === 'activity' && (
          <section className={CARD_CHROME}>
            <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-50 text-indigo-600"><FiShield size={14} /></div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Authentication & System Audit Trail</h3>
                <p className="text-[11px] text-slate-500">Verified security activity from backend logs</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80">
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Timestamp</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">User</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Action</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Status</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentLogins.slice(0, 15).map((log, i) => (
                    <tr key={i} className="transition-colors hover:bg-slate-50/60">
                      <td className="px-4 py-2.5 text-slate-500">{formatDate(log.created_at)}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{log.user_name || log.user?.name || 'System'}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-700">{log.action}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          log.status === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                        }`}>
                          {log.status || 'success'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-500">{log.ip_address || '127.0.0.1'}</td>
                    </tr>
                  ))}
                  {recentLogins.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-xs text-slate-400">No audit events recorded</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {canUseAI && <GeminiAIAssistant />}
      </div>
    </div>
  );
}

export default DashboardPage;