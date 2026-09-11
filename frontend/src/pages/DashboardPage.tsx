// src/pages/DashboardPage.tsx
import { useEffect, useState, useCallback, useMemo, memo, useRef } from 'react';
import type { ReactNode } from 'react';
import {
  FiRefreshCw, FiClock, FiUsers, FiShoppingCart, FiBox,
  FiDollarSign, FiTrendingUp, FiBarChart2, FiUserCheck, FiUserX,
  FiCalendar, FiAlertTriangle, FiActivity, FiTrendingDown,
  FiCheckCircle, FiPackage, FiAlertCircle, FiMic, FiMicOff,
  FiX, FiSend, FiMessageSquare, FiCpu, FiFilter, FiXCircle,
  FiChevronDown, FiChevronUp, FiAward, FiTarget,
} from 'react-icons/fi';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, ComposedChart, Legend,
  RadialBarChart, RadialBar, LabelList, PolarAngleAxis,
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

interface PurchaseDueInvoice {
  invoice_no: string;
  company_name: string;
  name: string;
  phone: string;
  due_date: string | null;
  due_from: string;
  remaining_payment: number;
}

interface NewVsExistingCustomerSale {
  new_customers: {
    count: number;
    total_sales: number;
    percentage: number;
    sales_percentage: number;
    customers: any[];
  };
  existing_customers: {
    count: number;
    total_sales: number;
    percentage: number;
    sales_percentage: number;
    customers: any[];
  };
  summary: {
    total_customers: number;
    total_sales: number;
    new_customer_sales: number;
    existing_customer_sales: number;
  };
}

type DateRangeKey =
  | 'today'
  | 'yesterday'
  | '7d'
  | '30d'
  | '90d'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'this_year'
  | 'custom'
  | 'all';

interface FilterableRecord {
  company_id?: number | string | null;
  branch_id?: number | string | null;
  created_at?: string | null;
  invoice_date?: string | null;
  order_date?: string | null;
  purchase_date?: string | null;
  date?: string | null;
  [key: string]: unknown;
}

interface ResolvedRange {
  from: Date | null;
  to: Date | null;
  label: string;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const endOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

function resolveRange(key: DateRangeKey, customFrom?: string, customTo?: string): ResolvedRange {
  const now = new Date();
  switch (key) {
    case 'today':
      return { from: startOfDay(now), to: endOfDay(now), label: 'Today' };
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y), label: 'Yesterday' };
    }
    case '7d': {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      return { from: startOfDay(d), to: endOfDay(now), label: 'Last 7 days' };
    }
    case '30d': {
      const d = new Date(now);
      d.setDate(d.getDate() - 29);
      return { from: startOfDay(d), to: endOfDay(now), label: 'Last 30 days' };
    }
    case '90d': {
      const d = new Date(now);
      d.setDate(d.getDate() - 89);
      return { from: startOfDay(d), to: endOfDay(now), label: 'Last 90 days' };
    }
    case 'this_month': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: startOfDay(from), to: endOfDay(now), label: 'This month' };
    }
    case 'last_month': {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: startOfDay(from), to: endOfDay(to), label: 'Last month' };
    }
    case 'this_quarter': {
      const q = Math.floor(now.getMonth() / 3);
      const from = new Date(now.getFullYear(), q * 3, 1);
      return { from: startOfDay(from), to: endOfDay(now), label: 'This quarter' };
    }
    case 'this_year': {
      const from = new Date(now.getFullYear(), 0, 1);
      return { from: startOfDay(from), to: endOfDay(now), label: 'This year' };
    }
    case 'custom': {
      const f = customFrom ? new Date(customFrom) : null;
      const t = customTo ? new Date(customTo) : null;
      return {
        from: f ? startOfDay(f) : null,
        to: t ? endOfDay(t) : null,
        label: 'Custom range',
      };
    }
    case 'all':
    default:
      return { from: null, to: null, label: 'All time' };
  }
}

function getRecordDate(record: FilterableRecord): string | null {
  return (
    (record.created_at as string) ||
    (record.invoice_date as string) ||
    (record.order_date as string) ||
    (record.purchase_date as string) ||
    (record.date as string) ||
    null
  );
}

function isWithinRange(record: FilterableRecord, range: ResolvedRange): boolean {
  if (!range.from && !range.to) return true;
  const raw = getRecordDate(record);
  if (!raw) return true;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return true;
  const t = d.getTime();
  if (range.from && t < range.from.getTime()) return false;
  if (range.to && t > range.to.getTime()) return false;
  return true;
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

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  const fetchData = useCallback(
    async (skipCache = false): Promise<T | null> => {
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
          } finally {
            inFlight.delete(key);
          }
        })();
        inFlight.set(key, request);
      }

      if (mountedRef.current) {
        setLoading(true);
        setError(null);
      }

      try {
        const result = await request;
        if (mountedRef.current) setData(result);
        return result;
      } catch (err: unknown) {
        if (mountedRef.current) {
          setError((err as { message?: string })?.message || 'Failed to load');
        }
        return null;
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [key, ttlMs],
  );

  useEffect(() => {
    mountedRef.current = true;
    void fetchData();
    return () => {
      mountedRef.current = false;
    };
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
  ({
    icon: Icon,
    label,
    value,
    tone,
    hint,
    delta,
  }: {
    icon: React.ElementType;
    label: string;
    value: number | string;
    tone: Tone;
    hint?: string;
    delta?: number | null;
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              {label}
            </p>
            <p className="mt-0.5 truncate text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              {typeof value === 'number' ? value.toLocaleString('en-IN') : value}
            </p>
            <div className="mt-0.5 flex items-center gap-2">
              {hint && <p className="text-[10px] text-slate-500">{hint}</p>}
              {deltaShow && (
                <span
                  className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                    deltaPositive
                      ? 'bg-emerald-50 text-emerald-600'
                      : 'bg-rose-50 text-rose-600'
                  }`}
                >
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

const ChartCard = ({
  title,
  subtitle,
  children,
  className = '',
  accent = 'indigo',
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  accent?: 'indigo' | 'emerald' | 'amber' | 'rose' | 'violet' | 'teal';
}) => {
  const accents: Record<string, string> = {
    indigo: 'from-indigo-500 to-blue-500',
    emerald: 'from-emerald-500 to-teal-500',
    amber: 'from-amber-500 to-orange-500',
    rose: 'from-rose-500 to-pink-500',
    violet: 'from-violet-500 to-purple-500',
    teal: 'from-teal-500 to-cyan-500',
  };
  return (
    <div
      className={`group flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 hover:border-slate-300 hover:shadow-[0_12px_24px_-12px_rgba(15,23,42,0.12)] ${className}`}
    >
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

const MiniTable = ({
  columns,
  data,
}: {
  columns: string[];
  data: (string | number)[][];
}) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {columns.map((col, i) => (
            <th key={i} className="px-3 py-2 first:pl-0 last:pr-0">
              {col}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {data.length === 0 ? (
          <tr>
            <td colSpan={columns.length} className="py-6 text-center text-slate-400">
              No data available
            </td>
          </tr>
        ) : (
          data.map((row, i) => (
            <tr key={i} className="hover:bg-slate-50/70">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 text-slate-700 first:pl-0 last:pr-0">
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

const RupeeTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      {payload.map((entry: any, idx: number) => (
        <p key={idx} className="flex items-center gap-2 text-xs">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color || entry.fill }}
          />
          <span className="text-slate-600">{entry.name}:</span>
          <span className="font-semibold text-slate-900">
            {compactNumber(Number(entry.value) || 0)}
          </span>
        </p>
      ))}
    </div>
  );
};

/* ────────────────────────────────────────────────────────────────── */
/* Gemini AI                                                          */
/* ────────────────────────────────────────────────────────────────── */

interface ChatMessage {
  id: string;
  sender: 'user' | 'gemini';
  text: string;
}

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
      }) ??
      voices.find((voice) => /en-us|en-gb|en-in/i.test(voice.lang.toLowerCase())) ??
      voices[0] ??
      null
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
      const loadVoices = () => {
        if (window.speechSynthesis.getVoices().length > 0) pickBestVoice();
      };
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

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
    } catch {
      /* fall through */
    }
    setTtsSource('browser');
    if (!synthesisRef.current || !('speechSynthesis' in window)) return;
    const cleanText = text.replace(/[*#_`]/g, '').trim();
    if (!cleanText) return;
    synthesisRef.current.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    const preferred = pickBestVoice();
    if (preferred) {
      utterance.voice = preferred;
      utterance.lang = preferred.lang || voiceLanguage;
    } else {
      utterance.lang = voiceLanguage;
    }
    utterance.rate = voiceSpeed;
    utterance.pitch = 1.15;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    synthesisRef.current.speak(utterance);
  };

  const handleSendMessage = async (textToSend: string = inputText) => {
    if (!textToSend.trim()) return;
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: textToSend,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);
    try {
      const history = messages.map((m) => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        text: m.text,
      }));
      const res = await apiClient.geminiChat(textToSend, history);
      const aiResponse =
        (res as any)?.response || (res as any)?.data?.response || 'I processed your request.';
      const geminiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'gemini',
        text: aiResponse,
      };
      setMessages((prev) => [...prev, geminiMessage]);
      await speakResponse(aiResponse);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: 'gemini',
          text: 'Sorry, I could not connect to the AI service. Please try again.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleVoice = () => {
    if (!recognitionRef.current) {
      window.alert('Voice recognition is not supported in your browser.');
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      synthesisRef.current?.cancel();
      setIsSpeaking(false);
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch {
        setIsListening(false);
      }
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
                <select
                  value={voiceProvider}
                  onChange={(e) => setVoiceProvider(e.target.value as 'browser' | 'cloud')}
                  className="rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-[10px] text-white outline-none"
                >
                  <option value="cloud" className="text-slate-800">Premium voice</option>
                  <option value="browser" className="text-slate-800">Browser voice</option>
                </select>
                <select
                  value={voiceLanguage}
                  onChange={(e) => setVoiceLanguage(e.target.value as 'en-US' | 'hi-IN')}
                  className="rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-[10px] text-white outline-none"
                >
                  <option value="en-US" className="text-slate-800">English</option>
                  <option value="hi-IN" className="text-slate-800">Hindi</option>
                </select>
              </div>
              <button
                onClick={() => {
                  setIsOpen(false);
                  synthesisRef.current?.cancel();
                }}
                className="rounded-full p-2 text-white transition-colors hover:bg-white/20"
              >
                <FiX size={20} />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-2 pb-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowVoiceSettings((p) => !p)}
                    className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-medium text-slate-700 hover:bg-slate-100"
                  >
                    Voice settings
                  </button>
                  <button
                    type="button"
                    onClick={() => void speakResponse('Hello! This is a preview of my voice.')}
                    className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[10px] font-medium text-violet-700 hover:bg-violet-100"
                  >
                    Preview voice
                  </button>
                </div>
                <span className="text-[10px] uppercase tracking-[0.16em] text-slate-400">
                  {ttsSource === 'cloud' ? 'Premium' : 'Browser'}
                </span>
              </div>

              {showVoiceSettings && (
                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="mb-2 flex items-center justify-between text-[11px] text-slate-600">
                    <span>Voice speed</span>
                    <span>{voiceSpeed.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.75"
                    max="1.4"
                    step="0.05"
                    value={voiceSpeed}
                    onChange={(e) => setVoiceSpeed(Number(e.target.value))}
                    className="w-full accent-violet-600"
                  />
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
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                      msg.sender === 'user'
                        ? 'rounded-tr-sm bg-violet-600 text-white'
                        : 'rounded-tl-sm border border-slate-100 bg-white text-slate-700'
                    }`}
                  >
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
              <button
                onClick={toggleVoice}
                className={`shrink-0 rounded-full p-3 transition-colors ${
                  isListening ? 'animate-pulse bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {isListening ? <FiMic size={20} /> : <FiMicOff size={20} />}
              </button>
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void handleSendMessage()}
                placeholder={isListening ? 'Listening...' : 'Ask Gemini anything...'}
                className="flex-1 rounded-full bg-slate-100 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-500/50"
              />
              <button
                onClick={() => void handleSendMessage()}
                disabled={!inputText.trim() || isLoading}
                className="shrink-0 rounded-full bg-violet-600 p-3 text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
              >
                <FiSend size={18} className="translate-x-[1px]" />
              </button>
            </div>

            <div className="flex gap-2 overflow-x-auto bg-white px-4 pb-3 text-xs whitespace-nowrap">
              {[
                { l: 'Summarize revenue', p: "Summarize today's revenue." },
                { l: 'Check inventory', p: 'Which products have low stock?' },
                { l: 'Top customers', p: 'Who are our top customers?' },
              ].map((q) => (
                <button
                  key={q.l}
                  onClick={() => void handleSendMessage(q.p)}
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50"
                >
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
/* Main                                                               */
/* ────────────────────────────────────────────────────────────────── */

export function DashboardPage() {
  const { showError: _showError } = useNotification();
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [geoData, setGeoData] = useState<any>(null);
  const [geoLoading, setGeoLoading] = useState(true);

  /* -------------------- Advanced filters -------------------- */
  const [dateRange, setDateRange] = useState<DateRangeKey>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [compareMode, setCompareMode] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);

  const resolvedRange = useMemo(
    () => resolveRange(dateRange, customFrom, customTo),
    [dateRange, customFrom, customTo],
  );

  const previousPeriod = useMemo(() => previousRange(resolvedRange), [resolvedRange]);

  /* -------------------- Geo -------------------- */
  useEffect(() => {
    fetch('/data/bihar-districts.json')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load map data');
        return res.json();
      })
      .then((data) => {
        setGeoData(data);
        setGeoLoading(false);
      })
      .catch(() => setGeoLoading(false));
  }, []);

  /* -------------------- Fetchers -------------------- */

  // ✅ All list fetchers unwrap paginated envelopes into plain arrays.
  const fetchInvoices = useCallback(async () => {
    const res: unknown = await apiClient.getInvoices();
    if (Array.isArray(res)) return res;
    const r = res as { data?: unknown[] };
    return Array.isArray(r?.data) ? r.data : [];
  }, []);

  const fetchOrders = useCallback(async () => {
    const res: unknown = await apiClient.getOrders();
    if (Array.isArray(res)) return res;
    const r = res as { data?: unknown[] };
    return Array.isArray(r?.data) ? r.data : [];
  }, []);

  const fetchCustomers = useCallback(async () => {
    const res: unknown = await apiClient.getCustomers();
    if (Array.isArray(res)) return res;
    const r = res as { data?: unknown[] };
    return Array.isArray(r?.data) ? r.data : [];
  }, []);

  const fetchEmployees = useCallback(async () => {
    const res: unknown = await apiClient.getEmployees();
    if (Array.isArray(res)) return res;
    const r = res as { data?: unknown[] };
    return Array.isArray(r?.data) ? r.data : [];
  }, []);

  const fetchPurchases = useCallback(async () => {
    const res: unknown = await apiClient.getPurchaseBills();
    if (Array.isArray(res)) return res;
    const r = res as { data?: unknown[] };
    return Array.isArray(r?.data) ? r.data : [];
  }, []);

  const fetchCompanies = useCallback(() => apiClient.getCompanies(), []);
  const fetchProducts = useCallback(() => apiClient.getProducts(), []);
  const fetchBranches = useCallback(() => apiClient.getBranches(), []);
  const fetchProfitSummary = useCallback(() => apiClient.getProfitSummary(), []);
  const fetchPaymentSummary = useCallback(() => apiClient.getPaymentSummary(), []);
  const fetchInventorySummary = useCallback(() => apiClient.getInventorySummary(), []);
  const fetchLowStockProducts = useCallback(() => apiClient.getLowStockProducts(), []);
  const fetchTopCustomers = useCallback(() => apiClient.getTopCustomers(5), []);
  const fetchTopVendors = useCallback(() => apiClient.getTopVendors(5), []);
  const fetchPurchaseDueInvoices = useCallback(() => apiClient.getPurchaseDueInvoices(), []);
  const fetchBiharDistrictSales = useCallback(() => apiClient.getDistrictSales('Bihar'), []);

  /* -------------------- New vs Existing -------------------- */
  const [nvCompanyFilter, setNvCompanyFilter] = useState('all');
  const [nvBranchFilter, setNvBranchFilter] = useState('all');

  const fetchNewVsExisting = useCallback(() => {
    return apiClient.getNewVsExistingCustomerSale(
      nvCompanyFilter !== 'all' ? nvCompanyFilter : undefined,
      nvBranchFilter !== 'all' ? nvBranchFilter : undefined,
    );
  }, [nvCompanyFilter, nvBranchFilter]);

  /* -------------------- Hooks -------------------- */
  const { data: companies, loading: compsLoading, refresh: refreshComps } = useApiCache<any[]>('companies', fetchCompanies);
  const { data: customers, loading: custsLoading, refresh: refreshCusts } = useApiCache<any[]>('customers', fetchCustomers);
  const { data: products, loading: prodsLoading, refresh: refreshProds } = useApiCache<any[]>('products', fetchProducts);
  const { data: orders, loading: ordsLoading, refresh: refreshOrds } = useApiCache<any[]>('orders', fetchOrders);
  const { data: invoices, loading: invsLoading, refresh: refreshInvs } = useApiCache<any[]>('invoices', fetchInvoices);
  const { data: employees, loading: empsLoading, refresh: refreshEmps } = useApiCache<any[]>('employees', fetchEmployees);
  const { data: purchases, loading: purLoading, refresh: refreshPurchases } = useApiCache<any[]>('purchases', fetchPurchases);
  const { data: branches, refresh: refreshBranches } = useApiCache<any[]>('branches', fetchBranches);
  const { data: profitData, error: profitError, refresh: refreshProfit } = useApiCache<any>('profitSummary', fetchProfitSummary);
  const { data: paymentSummary, loading: payLoading, error: payError, refresh: refreshPay } = useApiCache<PaymentSummary>('paymentSummary', fetchPaymentSummary);
  const { data: inventory, loading: invSumLoading, refresh: refreshInv } = useApiCache<InventorySummary>('inventorySummary', fetchInventorySummary);
  const { data: lowStock, refresh: refreshLowStock } = useApiCache<LowStockProduct[]>('lowStockProducts', fetchLowStockProducts);
  const { data: topCustomers, loading: topCustLoading, refresh: refreshTopCust } = useApiCache<TopCustomer[]>('topCustomers', fetchTopCustomers);
  const { data: topVendors, loading: topVendLoading, refresh: refreshTopVend } = useApiCache<TopVendor[]>('topVendors', fetchTopVendors);
  const { data: purchaseDue, loading: purDueLoading, refresh: refreshPurDue } = useApiCache<PurchaseDueInvoice[]>('purchaseDue', fetchPurchaseDueInvoices);
  const { data: biharDistrictSales, error: biharDistrictError, refresh: refreshBiharDistrict } = useApiCache<any[]>('biharDistrictSales', fetchBiharDistrictSales);
  const { data: newVsExisting, loading: nvLoading, error: nvError, refresh: refreshNewVsExisting } = useApiCache<NewVsExistingCustomerSale>(
    `newVsExisting-${nvCompanyFilter}-${nvBranchFilter}`,
    fetchNewVsExisting,
  );

  const isLoading =
    compsLoading ||
    custsLoading ||
    prodsLoading ||
    ordsLoading ||
    invsLoading ||
    empsLoading ||
    purLoading;

  /* -------------------- Filtered lists -------------------- */
  const filteredCustomers = useMemo(
    () => applyCompanyBranch(customers, companyFilter, branchFilter),
    [customers, companyFilter, branchFilter],
  );
  const filteredOrders = useMemo(
    () =>
      applyCompanyBranch(orders, companyFilter, branchFilter).filter((r) =>
        isWithinRange(r as FilterableRecord, resolvedRange),
      ),
    [orders, companyFilter, branchFilter, resolvedRange],
  );
  const filteredInvoices = useMemo(
    () =>
      applyCompanyBranch(invoices, companyFilter, branchFilter).filter((r) =>
        isWithinRange(r as FilterableRecord, resolvedRange),
      ),
    [invoices, companyFilter, branchFilter, resolvedRange],
  );
  const filteredPurchases = useMemo(
    () =>
      applyCompanyBranch(purchases, companyFilter, branchFilter).filter((r) =>
        isWithinRange(r as FilterableRecord, resolvedRange),
      ),
    [purchases, companyFilter, branchFilter, resolvedRange],
  );
  const filteredEmployees = useMemo(
    () => applyCompanyBranch(employees, companyFilter, branchFilter),
    [employees, companyFilter, branchFilter],
  );

  /* -------------------- Previous-period lists (for delta) -------------------- */
  const prevOrders = useMemo(
    () =>
      applyCompanyBranch(orders, companyFilter, branchFilter).filter((r) =>
        isWithinRange(r as FilterableRecord, previousPeriod),
      ),
    [orders, companyFilter, branchFilter, previousPeriod],
  );
  const prevInvoices = useMemo(
    () =>
      applyCompanyBranch(invoices, companyFilter, branchFilter).filter((r) =>
        isWithinRange(r as FilterableRecord, previousPeriod),
      ),
    [invoices, companyFilter, branchFilter, previousPeriod],
  );

  /* -------------------- Derived stats -------------------- */
  const totalRevenue = useMemo(
    () => filteredInvoices.reduce((s, inv: any) => s + (parseFloat(inv.total_amount) || 0), 0),
    [filteredInvoices],
  );
  const prevTotalRevenue = useMemo(
    () => prevInvoices.reduce((s, inv: any) => s + (parseFloat(inv.total_amount) || 0), 0),
    [prevInvoices],
  );

  const revenueDelta = useMemo(
    () => (compareMode ? pctChange(totalRevenue, prevTotalRevenue) : null),
    [compareMode, totalRevenue, prevTotalRevenue],
  );
  const ordersDelta = useMemo(
    () => (compareMode ? pctChange(filteredOrders.length, prevOrders.length) : null),
    [compareMode, filteredOrders.length, prevOrders.length],
  );
  const invoicesDelta = useMemo(
    () => (compareMode ? pctChange(filteredInvoices.length, prevInvoices.length) : null),
    [compareMode, filteredInvoices.length, prevInvoices.length],
  );

  /* ────────────────────────────────────────────────────────────────── */
  /* NEW: Monthly Sales — dynamically respects the active filter range  */
  /* ────────────────────────────────────────────────────────────────── */
  const monthlySales = useMemo(() => {
    // Build a map of "YYYY-M" → total sales from the currently-filtered invoices
    const salesByMonth = new Map<string, number>();
    filteredInvoices.forEach((inv: any) => {
      const raw = inv.invoice_date || inv.created_at;
      if (!raw) return;
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return;
      const key = getDateKey(d);
      salesByMonth.set(key, (salesByMonth.get(key) || 0) + (parseFloat(inv.total_amount) || 0));
    });

    // If we have an explicit range, iterate month-by-month from `from` to `to`
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
        const label = start.getFullYear() === end.getFullYear()
          ? `${MONTH_LABELS[m]}`
          : `${MONTH_LABELS[m]} '${String(y).slice(2)}`;
        rows.push({
          name: label,
          sales: salesByMonth.get(`${y}-${m}`) || 0,
        });
        cursor.setMonth(cursor.getMonth() + 1);
        guard += 1;
      }
      return rows;
    }

    // "All time" fallback: use only months that actually have data
    return Array.from(salesByMonth.entries())
      .map(([key, sales]) => {
        const [yStr, mStr] = key.split('-');
        const y = Number(yStr);
        const m = Number(mStr);
        return {
          sortKey: y * 12 + m,
          name: `${MONTH_LABELS[m]} '${String(y).slice(2)}`,
          sales,
        };
      })
      .sort((a, b) => a.sortKey - b.sortKey)
      .map(({ name, sales }) => ({ name, sales }));
  }, [filteredInvoices, resolvedRange]);

  /* -------------------- Radial Pipeline -------------------- */
  const radialPipeline = useMemo(() => {
    const delivered = filteredOrders.filter((o: any) => o.status === 'delivered').length;
    const shipped = filteredOrders.filter((o: any) => o.status === 'shipped').length;
    const confirmed = filteredOrders.filter((o: any) => o.status === 'confirmed').length;
    const pending = filteredOrders.filter((o: any) => o.status === 'pending').length;
    const total = delivered + shipped + confirmed + pending || 1;
    return [
      { name: 'Delivered', value: Math.round((delivered / total) * 100), fill: '#10B981', raw: delivered },
      { name: 'Shipped', value: Math.round((shipped / total) * 100), fill: '#8B5CF6', raw: shipped },
      { name: 'Confirmed', value: Math.round((confirmed / total) * 100), fill: '#3B82F6', raw: confirmed },
      { name: 'Pending', value: Math.round((pending / total) * 100), fill: '#F59E0B', raw: pending },
    ];
  }, [filteredOrders]);

  /* -------------------- Chart data -------------------- */
  const groupByMonth = useCallback(
    (items: any[], dateField: string, valueField?: string) => {
      const map: Record<string, number> = {};
      MONTH_LABELS.forEach((m) => (map[m] = 0));
      items.forEach((item) => {
        const date = new Date(item[dateField]);
        if (!Number.isNaN(date.getTime())) {
          const key = MONTH_LABELS[date.getMonth()];
          map[key] += valueField ? parseFloat(item[valueField]) || 0 : 1;
        }
      });
      return MONTH_LABELS.map((month) => ({ month, value: map[month] }));
    },
    [],
  );

  const revenueTrend = useMemo(
    () => groupByMonth(filteredInvoices, 'created_at', 'total_amount'),
    [filteredInvoices, groupByMonth],
  );
  const purchaseTrend = useMemo(
    () => groupByMonth(filteredPurchases, 'created_at', 'total_amount'),
    [filteredPurchases, groupByMonth],
  );

  const salesPurchaseTrend = useMemo(() => {
    const saleMap: Record<string, number> = {};
    const purchaseMap: Record<string, number> = {};
    MONTH_LABELS.forEach((m) => {
      saleMap[m] = 0;
      purchaseMap[m] = 0;
    });
    filteredInvoices.forEach((inv) => {
      const date = new Date(inv.created_at);
      if (!Number.isNaN(date.getTime())) saleMap[MONTH_LABELS[date.getMonth()]] += parseFloat(inv.total_amount) || 0;
    });
    filteredPurchases.forEach((pur) => {
      const date = new Date(pur.created_at);
      if (!Number.isNaN(date.getTime())) purchaseMap[MONTH_LABELS[date.getMonth()]] += parseFloat(pur.total_amount) || 0;
    });
    return MONTH_LABELS.map((month) => ({
      month,
      Sales: saleMap[month],
      Purchase: purchaseMap[month],
    }));
  }, [filteredInvoices, filteredPurchases]);

  const orderStatusDist = useMemo(() => {
    const map: Record<string, number> = {};
    filteredOrders.forEach((o) => {
      const status = o.status || 'unknown';
      map[status] = (map[status] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [filteredOrders]);

  const activeInactive = useMemo(() => {
    const active = filteredEmployees.filter((e) => e.status === 'active').length;
    const inactive = filteredEmployees.length - active;
    return [
      { name: 'Active', value: active },
      { name: 'Inactive', value: inactive },
    ];
  }, [filteredEmployees]);

  const paymentChartData = useMemo(() => {
    const safe = paymentSummary || {
      inward: { total: 0, online: 0, cash: 0 },
      outward: { total: 0, online: 0, cash: 0 },
    };
    return [
      { name: 'Inward', Online: safe.inward.online, Cash: safe.inward.cash },
      { name: 'Outward', Online: safe.outward.online, Cash: safe.outward.cash },
    ];
  }, [paymentSummary]);

  const totalOutstanding = useMemo(
    () => (purchaseDue || []).reduce((sum, inv) => sum + (inv.remaining_payment || 0), 0),
    [purchaseDue],
  );

  const newVsExistingChartData = useMemo(() => {
    if (!newVsExisting) return [];
    return [
      { name: 'New Customers', value: newVsExisting.new_customers?.count || 0 },
      { name: 'Existing Customers', value: newVsExisting.existing_customers?.count || 0 },
    ];
  }, [newVsExisting]);

  const nvFilterBranches = useMemo(() => {
    if (!branches) return [];
    if (nvCompanyFilter === 'all') return branches;
    return branches.filter((b) => b.company_id === parseInt(nvCompanyFilter));
  }, [branches, nvCompanyFilter]);

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
        clear: () => {
          setDateRange('30d');
          setCustomFrom('');
          setCustomTo('');
        },
      });
    }
    return chips;
  }, [companyFilter, branchFilter, dateRange, customFrom, customTo, companies, filterBranchesGlobal]);

  const clearAllFilters = () => {
    setCompanyFilter('all');
    setBranchFilter('all');
    setDateRange('30d');
    setCustomFrom('');
    setCustomTo('');
    setCompareMode(false);
  };

  /* -------------------- Refresh -------------------- */
  const refreshAll = async () => {
    await Promise.all([
      refreshComps(), refreshCusts(), refreshProds(), refreshOrds(), refreshInvs(), refreshEmps(),
      refreshPurchases(), refreshBranches(), refreshPay(), refreshInv(),
      refreshLowStock(), refreshTopCust(), refreshTopVend(), refreshPurDue(),
      refreshBiharDistrict(), refreshProfit(), refreshNewVsExisting(),
    ]);
    setLastUpdated(new Date());
  };

  useEffect(() => {
    if (!isLoading) setLastUpdated(new Date());
  }, [isLoading]);

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
            <p className="mt-1 text-sm text-slate-300">
              Live business metrics across companies and branches
            </p>
            {lastUpdated && (
              <p className="mt-1 text-[11px] text-slate-400">
                Last updated: {lastUpdated.toLocaleString('en-IN')}
              </p>
            )}
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
          className="flex w-full items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 text-left sm:px-5"
        >
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-50 text-indigo-600 ring-1 ring-indigo-500/10">
              <FiFilter size={14} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Advanced Filters</p>
              <p className="text-[11px] text-slate-500">
                {activeFilterChips.length > 0
                  ? `${activeFilterChips.length} active filter${activeFilterChips.length > 1 ? 's' : ''}`
                  : 'Date range, company, branch and comparison'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeFilterChips.length > 0 && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  clearAllFilters();
                }}
                className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              >
                <FiXCircle size={12} /> Reset
              </span>
            )}
            {filtersOpen ? <FiChevronUp size={16} /> : <FiChevronDown size={16} />}
          </div>
        </button>

        {filtersOpen && (
          <div className="space-y-4 p-4 sm:p-5">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Quick Range
              </p>
              <div className="flex flex-wrap gap-1.5">
                {DATE_RANGE_OPTIONS.filter((o) => o.value !== 'custom').map((o) => {
                  const active = dateRange === o.value;
                  return (
                    <button
                      key={o.value}
                      onClick={() => {
                        setDateRange(o.value);
                        setCustomFrom('');
                        setCustomTo('');
                      }}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        active
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Custom Range
                </p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <FiCalendar className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                      type="date"
                      value={customFrom}
                      onChange={(e) => {
                        setCustomFrom(e.target.value);
                        setDateRange('custom');
                      }}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                    />
                  </div>
                  <div className="relative flex-1">
                    <FiCalendar className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                      type="date"
                      value={customTo}
                      min={customFrom || undefined}
                      onChange={(e) => {
                        setCustomTo(e.target.value);
                        setDateRange('custom');
                      }}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                    />
                  </div>
                </div>
              </div>

              <div className="lg:col-span-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Company
                </p>
                <div className="relative">
                  <select
                    value={companyFilter}
                    onChange={(e) => {
                      setCompanyFilter(e.target.value);
                      setBranchFilter('all');
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
                  <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                </div>
              </div>

              <div className="lg:col-span-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Branch
                </p>
                <div className="relative">
                  <select
                    value={branchFilter}
                    onChange={(e) => setBranchFilter(e.target.value)}
                    disabled={filterBranchesGlobal.length === 0}
                    className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    <option value="all">All branches</option>
                    {filterBranchesGlobal.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                </div>
              </div>

              <div className="flex items-end lg:col-span-1">
                <button
                  onClick={() => setCompareMode((v) => !v)}
                  className={`flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border text-xs font-semibold transition ${
                    compareMode
                      ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                  title="Compare with previous period"
                >
                  <FiTrendingUp size={12} />
                  {compareMode ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            {activeFilterChips.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-slate-200 pt-3">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Active:
                </span>
                {activeFilterChips.map((chip, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700"
                  >
                    {chip.label}
                    <button
                      onClick={chip.clear}
                      className="grid h-4 w-4 place-items-center rounded-full hover:bg-indigo-200"
                    >
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
            <StatCard
              icon={FiTrendingUp}
              label="Revenue"
              value={compactNumber(totalRevenue)}
              tone="teal"
              hint={resolvedRange.label}
              delta={revenueDelta}
            />
            <StatCard
              icon={FiAward}
              label="Net Profit"
              value={
                profitData?.total_profit != null
                  ? compactNumber(profitData.total_profit)
                  : compactNumber(0)
              }
              tone="emerald"
            />
          </>
        )}
      </div>

      {/* Sales Performance */}
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-700">
        <FiTarget className="text-indigo-600" /> Sales Performance
      </h2>
      <div className="mb-8 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <ChartCard
          title="Monthly Sales"
          subtitle={`Filtered range: ${resolvedRange.label}`}
          className="xl:col-span-2"
          accent="indigo"
        >
          {isLoading ? (
            <div className="h-72 animate-pulse rounded-xl bg-slate-100" />
          ) : monthlySales.length === 0 || monthlySales.every((m) => m.sales === 0) ? (
            <div className="grid h-72 place-items-center text-sm text-slate-400">
              No sales data in the selected range
            </div>
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
                        <text
                          x={x + width / 2}
                          y={y - 8}
                          fill="#4f46e5"
                          textAnchor="middle"
                          fontSize={11}
                          fontWeight={600}
                        >
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

        <ChartCard title="Order Pipeline" subtitle="Percentage per status" accent="violet">
          {isLoading ? (
            <div className="h-72 animate-pulse rounded-xl bg-slate-100" />
          ) : filteredOrders.length === 0 ? (
            <div className="grid h-72 place-items-center text-sm text-slate-400">
              No orders in the selected range
            </div>
          ) : (
            <div className="relative">
              <ResponsiveContainer width="100%" height={300}>
                <RadialBarChart
                  cx="50%"
                  cy="50%"
                  innerRadius="30%"
                  outerRadius="100%"
                  barSize={16}
                  data={radialPipeline}
                  startAngle={90}
                  endAngle={-270}
                >
                  <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                  <RadialBar dataKey="value" background={{ fill: '#f1f5f9' }} cornerRadius={10} />
                  <RechartsTooltip
                    content={({ active, payload }: any) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload;
                      return (
                        <div className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
                          <p className="text-[11px] font-semibold text-slate-800">{p.name}</p>
                          <p className="text-xs text-slate-600">
                            {p.raw} orders · {p.value}%
                          </p>
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

      {/* HR */}
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-700">
        <FiUserCheck className="text-purple-600" /> HR & Employees
      </h2>
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {isLoading ? (
          [...Array(7)].map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard icon={FiUsers} label="Total Employees" value={filteredEmployees.length} tone="blue" />
            <StatCard icon={FiUserCheck} label="Active" value={filteredEmployees.filter((e) => e.status === 'active').length} tone="emerald" />
            <StatCard icon={FiUserX} label="Inactive" value={filteredEmployees.filter((e) => e.status === 'inactive').length} tone="rose" />
            <StatCard icon={FiCalendar} label="On Leave" value={filteredEmployees.filter((e) => e.status === 'on-leave').length} tone="amber" />
            <StatCard icon={FiShoppingCart} label="Pending Orders" value={filteredOrders.filter((o) => o.status === 'pending').length} tone="rose" />
            <StatCard icon={FiCheckCircle} label="Paid Invoices" value={filteredInvoices.filter((i) => i.status === 'paid').length} tone="emerald" />
            <StatCard icon={FiClock} label="Overdue" value={filteredInvoices.filter((i) => i.status === 'overdue').length} tone="rose" />
          </>
        )}
      </div>

      {/* Financial */}
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-700">
        <FiDollarSign className="text-emerald-600" /> Financial Overview
      </h2>
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Inward Payment</h3>
          {payLoading ? (
            <StatCardSkeleton />
          ) : payError ? (
            <div className="text-xs text-rose-600">Unavailable</div>
          ) : (
            <>
              <p className="text-2xl font-bold text-emerald-600">
                {compactNumber(paymentSummary?.inward?.total || 0)}
              </p>
              <div className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-slate-500">Online</span><span className="font-semibold text-slate-800">{compactNumber(paymentSummary?.inward?.online || 0)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Cash</span><span className="font-semibold text-slate-800">{compactNumber(paymentSummary?.inward?.cash || 0)}</span></div>
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
              <p className="text-2xl font-bold text-rose-600">
                {compactNumber(paymentSummary?.outward?.total || 0)}
              </p>
              <div className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-slate-500">Online</span><span className="font-semibold text-slate-800">{compactNumber(paymentSummary?.outward?.online || 0)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Cash</span><span className="font-semibold text-slate-800">{compactNumber(paymentSummary?.outward?.cash || 0)}</span></div>
              </div>
            </>
          )}
        </div>
        <ChartCard title="Payment Breakdown" subtitle="Online vs Cash" className="md:col-span-2" accent="emerald">
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
        {invSumLoading ? (
          [...Array(6)].map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard icon={FiBox} label="Products" value={inventory?.totalProducts || 0} tone="blue" />
            <StatCard icon={FiPackage} label="Quantity" value={inventory?.totalQuantity || 0} tone="emerald" />
            <StatCard icon={FiCheckCircle} label="In Stock" value={inventory?.inStock || 0} tone="teal" />
            <StatCard icon={FiAlertCircle} label="Low Stock" value={inventory?.lowStock || 0} tone="amber" />
            <StatCard icon={FiAlertTriangle} label="Zero Stock" value={inventory?.zeroStock || 0} tone="rose" />
            <StatCard icon={FiTrendingDown} label="Negative" value={inventory?.negativeStock || 0} tone="rose" />
          </>
        )}
      </div>

      {lowStock && lowStock.length > 0 && (
        <>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-700">
            <FiAlertTriangle className="text-rose-600" /> Low Stock Alerts
          </h2>
          <div className="mb-8 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <MiniTable
              columns={['Product', 'Quantity']}
              data={lowStock.slice(0, 10).map((p) => [p.product_name, p.qty])}
            />
          </div>
        </>
      )}

      {/* New vs Existing */}
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-700">
        <FiUsers className="text-indigo-600" /> New vs Existing Customers
      </h2>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={nvCompanyFilter}
          onChange={(e) => {
            setNvCompanyFilter(e.target.value);
            setNvBranchFilter('all');
          }}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
        >
          <option value="all">All Companies</option>
          {companies?.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={nvBranchFilter}
          onChange={(e) => setNvBranchFilter(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
          disabled={!nvFilterBranches.length}
        >
          <option value="all">All Branches</option>
          {nvFilterBranches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        <ChartCard title="Customer Distribution" accent="indigo">
          {nvLoading ? (
            <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
          ) : nvError ? (
            <div className="py-8 text-center text-sm text-rose-600">Data unavailable</div>
          ) : newVsExistingChartData.every((d) => d.value === 0) ? (
            <div className="grid h-64 place-items-center text-sm text-slate-400">
              No customer data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={newVsExistingChartData}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={80}
                  innerRadius={40}
                  paddingAngle={3}
                  label
                >
                  {newVsExistingChartData.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? '#3B82F6' : '#10B981'} />
                  ))}
                </Pie>
                <RechartsTooltip /><Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
        <ChartCard title="Sales by Type" accent="emerald">
          {nvLoading ? (
            <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
          ) : nvError ? (
            <div className="py-8 text-center text-sm text-rose-600">Data unavailable</div>
          ) : newVsExistingChartData.every((d) => d.value === 0) ? (
            <div className="grid h-64 place-items-center text-sm text-slate-400">
              No customer data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={newVsExistingChartData} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <RechartsTooltip />
                <Bar dataKey="value" radius={[10, 10, 4, 4]} maxBarSize={56}>
                  {newVsExistingChartData.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? '#3B82F6' : '#10B981'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Top Customers & Vendors */}
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-700">
        <FiUsers className="text-violet-600" /> Top Customers & Vendors
      </h2>
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        <ChartCard title="Top Customers" accent="violet">
          {topCustLoading ? (
            <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
          ) : (
            <MiniTable
              columns={['Name', 'Amount']}
              data={(topCustomers || []).map((c) => [c.name, compactNumber(c.amount)])}
            />
          )}
        </ChartCard>
        <ChartCard title="Top Vendors" accent="amber">
          {topVendLoading ? (
            <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
          ) : (
            <MiniTable
              columns={['Name', 'Amount']}
              data={(topVendors || []).map((v) => [v.name, compactNumber(v.amount)])}
            />
          )}
        </ChartCard>
      </div>

      {/* Purchase Outstanding */}
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-700">
        <FiClock className="text-rose-600" /> Purchase Outstanding
      </h2>
      <div className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] xl:col-span-2">
          {purDueLoading ? (
            <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
          ) : (
            <MiniTable
              columns={['Invoice', 'Company', 'Name', 'Due Date', 'Remaining']}
              data={(purchaseDue || []).map((inv) => [
                inv.invoice_no,
                inv.company_name,
                inv.name,
                inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-IN') : '—',
                compactNumber(inv.remaining_payment),
              ])}
            />
          )}
        </div>
        <div className="flex flex-col items-center justify-center rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50 to-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-rose-500">Total Outstanding</h3>
          <p className="mt-3 text-4xl font-extrabold text-rose-600">
            {compactNumber(totalOutstanding)}
          </p>
        </div>
      </div>

      {/* Charts */}
      <h2 className="mb-3 mt-8 flex items-center gap-2 text-lg font-bold text-slate-700">
        <FiBarChart2 className="text-indigo-600" /> Charts & Trends
      </h2>
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {showMap && (
          <ChartCard
            title="Sales Heatmap · Bihar"
            subtitle="District-wise revenue"
            className="md:col-span-2 xl:col-span-3"
            accent="teal"
          >
            <div className="flex h-96 w-full items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
              <ComposableMap
                projection="geoMercator"
                projectionConfig={{ scale: 3000, center: [85.3131, 25.0961] }}
                className="h-full w-full"
              >
                <Geographies geography={geoData}>
                  {({ geographies }) =>
                    geographies.map((geo) => {
                      const dName = geo.properties.name || geo.properties.dtname;
                      const dSales =
                        biharDistrictSales?.find((s: any) => s.district === dName)?.sales || 0;
                      const maxSales = Math.max(
                        ...(biharDistrictSales?.map((s: any) => s.sales) || [1]),
                      );
                      return (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          fill={getMapColor(dSales, maxSales)}
                          stroke="#FFFFFF"
                          strokeWidth={0.5}
                          style={{
                            default: { outline: 'none' },
                            hover: { fill: '#3B82F6', outline: 'none', cursor: 'pointer' },
                            pressed: { outline: 'none' },
                          }}
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

        <ChartCard title="Monthly Revenue" accent="emerald">
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={revenueTrend} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
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
        </ChartCard>

        <ChartCard title="Monthly Purchases" accent="amber">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={purchaseTrend} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => compactNumber(Number(v))} />
              <RechartsTooltip content={<RupeeTooltip />} cursor={{ fill: 'rgba(245,158,11,0.06)' }} />
              <Bar dataKey="value" name="Purchases" fill="#F59E0B" radius={[8, 8, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Sales vs Purchase" accent="indigo">
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
        </ChartCard>

        <ChartCard title="Net Profit" accent="violet">
          {profitError ? (
            <div className="py-8 text-center text-sm text-rose-600">Unavailable</div>
          ) : !profitData?.monthly_profit?.length ? (
            <div className="grid h-64 place-items-center text-sm text-slate-400">No profit data</div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={profitData.monthly_profit} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
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

        <ChartCard title="Order Status" accent="rose">
          {orderStatusDist.length === 0 ? (
            <div className="grid h-64 place-items-center text-sm text-slate-400">No orders</div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={orderStatusDist} dataKey="value" nameKey="name" outerRadius={80} innerRadius={40} paddingAngle={3} label>
                  {orderStatusDist.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip /><Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Employee Status" accent="emerald">
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={activeInactive} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3}>
                {activeInactive.map((_, i) => (
                  <Cell key={i} fill={i === 0 ? '#10B981' : '#EF4444'} />
                ))}
              </Pie>
              <RechartsTooltip /><Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <GeminiAIAssistant />
    </div>
  );
}

export default DashboardPage;