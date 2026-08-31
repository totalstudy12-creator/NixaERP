// src/pages/DashboardPage.tsx
import { useEffect, useState, useCallback, useMemo, memo, useRef } from 'react';
import type { ReactNode } from 'react';
import {
  FiRefreshCw, FiClock, FiUsers, FiShoppingCart, FiBox,
  FiDollarSign, FiTrendingUp, FiBarChart2, FiUserCheck, FiUserX,
  FiCalendar, FiFileText, FiAlertTriangle, FiActivity,
  FiTrendingDown, FiCheckCircle, FiPackage, FiAlertCircle,
  FiMonitor, FiMic, FiMicOff, FiX, FiSend, FiMessageSquare, FiCpu
} from 'react-icons/fi';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, ComposedChart, Legend,
} from 'recharts';
import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { Tooltip } from 'react-tooltip';
import 'react-tooltip/dist/react-tooltip.css';

// ─── Types ───
interface DashboardStats {
  companies: number;
  customers: number;
  products: number;
  orders: number;
  invoices: number;
  totalRevenue: number;
}

interface PaymentBreakdown { total: number; online: number; cash: number; }
interface PaymentSummary { inward: PaymentBreakdown; outward: PaymentBreakdown; }
interface InventorySummary { totalProducts: number; totalQuantity: number; inStock: number; lowStock: number; zeroStock: number; negativeStock: number; }
interface InvoiceCountSummary { sale: number; purchase: number; }
interface InvoiceAmountSummary { sale: number; purchase: number; }
interface TopSellingProduct { product_name: string; total_qty: number; }
interface LowStockProduct { product_name: string; qty: number; }
interface TopCustomer { name: string; amount: number; }
interface TopVendor { name: string; amount: number; }
interface PurchaseDueInvoice { invoice_no: string; company_name: string; name: string; phone: string; due_date: string | null; due_from: string; remaining_payment: number; }
interface LoginActivityItem { day: string; count: number; }
interface NewVsExistingCustomerSale {
  new_customers: { count: number; total_sales: number; percentage: number; sales_percentage: number; customers: any[] };
  existing_customers: { count: number; total_sales: number; percentage: number; sales_percentage: number; customers: any[] };
  summary: { total_customers: number; total_sales: number; new_customer_sales: number; existing_customer_sales: number };
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];

// ─── API Cache Hook (Concurrency Fixed) ───
const cache = new Map<string, { data: unknown; timestamp: number }>();
const inFlightRequests = new Map<string, Promise<any>>();

const normalizeCachePayload = <T,>(payload: unknown): T => {
  if (payload === null || payload === undefined) return [] as unknown as T;
  if (Array.isArray(payload)) return payload as T;
  if (typeof payload === 'object' && payload !== null && 'data' in payload) {
    return normalizeCachePayload<T>((payload as { data?: unknown }).data);
  }
  return payload as T;
};

function useApiCache<T>(key: string, fetcher: () => Promise<T>, ttlMs = 300_000) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (skipCache = false) => {
    if (!skipCache) {
      const entry = cache.get(key);
      if (entry && Date.now() - entry.timestamp < ttlMs) {
        setData(normalizeCachePayload<T>(entry.data));
        setLoading(false);
        return entry.data as T;
      }
    }

    let request = inFlightRequests.get(key);
    if (!request || skipCache) {
      request = (async () => {
        try {
          const res = await fetcher();
          const result = normalizeCachePayload<T>(res);
          cache.set(key, { data: result, timestamp: Date.now() });
          return result;
        } finally {
          inFlightRequests.delete(key);
        }
      })();
      inFlightRequests.set(key, request);
    }

    setLoading(true);
    setError(null);

    try {
      const result = await request;
      setData(result);
      return result;
    } catch (err: any) {
      setError(err?.message || 'Failed to load');
      return null;
    } finally {
      setLoading(false);
    }
  }, [key, fetcher, ttlMs]);

  useEffect(() => { void fetchData(); }, [fetchData]);
  return { data, loading, error, refresh: () => fetchData(true) };
}

// ─── Skeleton Components ───
const StatCardSkeleton = memo(() => (
  <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-4 animate-pulse">
    <div className="h-10 w-10 rounded-xl bg-slate-200" />
    <div className="space-y-2 flex-1">
      <div className="h-3 w-16 bg-slate-200 rounded" />
      <div className="h-6 w-8 bg-slate-200 rounded" />
    </div>
  </div>
));

const StatCard = memo(({ icon: Icon, label, value, tone }: {
  icon: any; label: string; value: number | string; tone: 'blue' | 'emerald' | 'amber' | 'rose' | 'purple' | 'teal';
}) => {
  const bg = tone === 'blue' ? 'bg-blue-100 text-blue-600' :
             tone === 'emerald' ? 'bg-emerald-100 text-emerald-600' :
             tone === 'amber' ? 'bg-amber-100 text-amber-600' :
             tone === 'rose' ? 'bg-rose-100 text-rose-600' :
             tone === 'purple' ? 'bg-purple-100 text-purple-600' :
             'bg-teal-100 text-teal-600';
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${bg}`}><Icon size={20} /></div>
      <div>
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="text-2xl font-bold text-slate-900">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      </div>
    </div>
  );
});

// ─── Gemini AI Agent Component (with corrected API call) ───
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

  const recognitionRef = useRef<any>(null);
  const synthesisRef = useRef<SpeechSynthesis | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        setIsListening(false);
        handleSendMessage(text);
      };

      recognitionRef.current.onerror = () => setIsListening(false);
      recognitionRef.current.onend = () => setIsListening(false);
    }

    if ('speechSynthesis' in window) {
      synthesisRef.current = window.speechSynthesis;
    }

    return () => {
      if (recognitionRef.current) recognitionRef.current.abort();
      if (synthesisRef.current) synthesisRef.current.cancel();
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const speakResponse = (text: string) => {
    if (!synthesisRef.current) return;
    synthesisRef.current.cancel();
    const cleanText = text.replace(/[*#_`]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'en-US';
    utterance.rate = 1;
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
      // CORRECTED: use apiClient.geminiChat instead of sendAIAssistantChat
      const history = messages.map(m => ({ role: m.sender === 'user' ? 'user' : 'assistant', text: m.text }));
      const res = await apiClient.geminiChat(textToSend, history);
      
      const aiResponse = res?.response || res?.data?.response || 'I processed your request.';
      
      const geminiMessage: ChatMessage = { id: (Date.now() + 1).toString(), sender: 'gemini', text: aiResponse };
      setMessages((prev) => [...prev, geminiMessage]);
      speakResponse(aiResponse);
      
    } catch (err: any) {
      const errorMessage: ChatMessage = { 
        id: (Date.now() + 1).toString(), 
        sender: 'gemini', 
        text: 'Sorry, I could not connect to the AI service. Please try again.' 
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleVoice = () => {
    if (!recognitionRef.current) {
      alert("Voice recognition is not supported in your browser.");
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
      } catch (e) {
        setIsListening(false);
      }
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 text-white px-5 py-3 shadow-xl shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:-translate-y-1 transition-all"
      >
        <FiCpu size={20} />
        <span className="font-medium">Ask Gemini</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm sm:p-4">
          <div className="w-full sm:max-w-md h-[80vh] sm:h-[600px] flex flex-col bg-white sm:rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-10">
            
            <div className="flex items-center justify-between bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-4">
              <div className="flex items-center gap-2 text-white">
                <FiCpu className="text-violet-200" size={24} />
                <div>
                  <h3 className="font-bold text-lg leading-tight">Gemini Workspace</h3>
                  <p className="text-xs text-violet-200">Powered by Google AI</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsOpen(false);
                  synthesisRef.current?.cancel();
                }}
                className="p-2 rounded-full hover:bg-white/20 text-white transition-colors"
              >
                <FiX size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-3">
                  <FiMessageSquare size={40} className="opacity-20" />
                  <p className="text-sm">Ask about your metrics, customers, or trends.</p>
                </div>
              )}
              
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                    msg.sender === 'user' 
                      ? 'bg-violet-600 text-white rounded-tr-sm' 
                      : 'bg-white border border-slate-100 text-slate-700 rounded-tl-sm'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex items-center gap-2">
                    <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce"></span>
                    <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce delay-75"></span>
                    <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce delay-150"></span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="bg-white p-3 flex items-center gap-2 border-t border-slate-100">
              <button
                onClick={toggleVoice}
                className={`p-3 rounded-full shrink-0 transition-colors ${
                  isListening 
                    ? 'bg-rose-100 text-rose-600 animate-pulse' 
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {isListening ? <FiMic size={20} /> : <FiMicOff size={20} />}
              </button>
              
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder={isListening ? 'Listening...' : 'Ask Gemini anything...'}
                className="flex-1 bg-slate-100 rounded-full px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-500/50"
              />
              
              <button
                onClick={() => handleSendMessage()}
                disabled={!inputText.trim() || isLoading}
                className="p-3 rounded-full bg-violet-600 text-white shrink-0 disabled:opacity-50 hover:bg-violet-700 transition-colors"
              >
                <FiSend size={18} className="translate-x-[1px]" />
              </button>
            </div>
            
            <div className="bg-white pb-3 px-4 flex gap-2 overflow-x-auto text-xs whitespace-nowrap hide-scrollbar">
              <button onClick={() => handleSendMessage("Summarize today's revenue.")} className="px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50">Summarize revenue</button>
              <button onClick={() => handleSendMessage("Which products have low stock?")} className="px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50">Check inventory</button>
              <button onClick={() => handleSendMessage("Who are our top customers?")} className="px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50">Top customers</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

// ─── Chart Card ───
const ChartCard = ({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) => (
  <div className={`bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col ${className}`}>
    <h2 className="text-base font-semibold text-slate-800 mb-4">{title}</h2>
    <div className="flex-1">{children}</div>
  </div>
);

// ─── Mini Table ───
const MiniTable = ({ columns, data }: { columns: string[]; data: any[][] }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
          {columns.map((col, i) => <th key={i} className="py-2 px-3 first:pl-0 last:pr-0">{col}</th>)}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {data.length === 0 ? (
          <tr><td colSpan={columns.length} className="py-4 text-center text-slate-400">No data available</td></tr>
        ) : (
          data.map((row, i) => (
            <tr key={i} className="hover:bg-slate-50">
              {row.map((cell, j) => (
                <td key={j} className="py-2 px-3 first:pl-0 last:pr-0 text-slate-700">{cell}</td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);

// ─── Main Dashboard Component ───
export function DashboardPage() {
  const { showError } = useNotification();
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [geoData, setGeoData] = useState<any>(null);
  const [geoLoading, setGeoLoading] = useState(true);

  // Load GeoJSON for Bihar map
  useEffect(() => {
    fetch('/data/bihar-districts.json')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load map data');
        return res.json();
      })
      .then(data => {
        setGeoData(data);
        setGeoLoading(false);
      })
      .catch(() => setGeoLoading(false));
  }, []);

  // ─── API Fetchers ───
  const fetchCompanies = useCallback(() => apiClient.getCompanies(), []);
  const fetchCustomers = useCallback(() => apiClient.getCustomers(), []);
  const fetchProducts = useCallback(() => apiClient.getProducts(), []);
  const fetchOrders = useCallback(() => apiClient.getOrders(), []);
  const fetchInvoices = useCallback(() => apiClient.getInvoices(), []);
  const fetchEmployees = useCallback(() => apiClient.getEmployees(), []);
  // 🔧 FIX: use getPurchaseBills instead of getPurchases
  const fetchPurchases = useCallback(() => apiClient.getPurchaseBills(), []);
  const fetchBranches = useCallback(() => apiClient.getBranches(), []);
  const fetchProfitSummary = useCallback(() => apiClient.getProfitSummary(), []);
  const fetchPaymentSummary = useCallback(() => apiClient.getPaymentSummary(), []);
  const fetchInventorySummary = useCallback(() => apiClient.getInventorySummary(), []);
  const fetchInvoiceCountSummary = useCallback(() => apiClient.getInvoiceCountSummary(), []);
  const fetchInvoiceAmountSummary = useCallback(() => apiClient.getInvoiceAmountSummary(), []);
  const fetchTopSellingProducts = useCallback(() => apiClient.getTopSellingProducts(5), []);
  const fetchLeastSellingProducts = useCallback(() => apiClient.getLeastSellingProducts(5), []);
  const fetchLowStockProducts = useCallback(() => apiClient.getLowStockProducts(), []);
  const fetchTopCustomers = useCallback(() => apiClient.getTopCustomers(5), []);
  const fetchTopVendors = useCallback(() => apiClient.getTopVendors(5), []);
  const fetchPurchaseDueInvoices = useCallback(() => apiClient.getPurchaseDueInvoices(), []);
  const fetchLoginActivity = useCallback(() => apiClient.getLoginActivity(), []);
  const fetchBiharDistrictSales = useCallback(() => apiClient.getDistrictSales('Bihar'), []);

  // ─── New vs Existing filters ───
  const [nvCompanyFilter, setNvCompanyFilter] = useState('all');
  const [nvBranchFilter, setNvBranchFilter] = useState('all');

  const fetchNewVsExisting = useCallback(() => {
    return apiClient.getNewVsExistingCustomerSale(
      nvCompanyFilter !== 'all' ? nvCompanyFilter : undefined,
      nvBranchFilter !== 'all' ? nvBranchFilter : undefined
    );
  }, [nvCompanyFilter, nvBranchFilter]);

  // ─── API Data Hooks ───
  const { data: companies, loading: compsLoading, refresh: refreshComps } = useApiCache<any[]>('companies', fetchCompanies);
  const { data: customers, loading: custsLoading, refresh: refreshCusts } = useApiCache<any[]>('customers', fetchCustomers);
  const { data: products, loading: prodsLoading, refresh: refreshProds } = useApiCache<any[]>('products', fetchProducts);
  const { data: orders, loading: ordsLoading, refresh: refreshOrds } = useApiCache<any[]>('orders', fetchOrders);
  const { data: invoices, loading: invsLoading, refresh: refreshInvs } = useApiCache<any[]>('invoices', fetchInvoices);
  const { data: employees, loading: empsLoading, refresh: refreshEmps } = useApiCache<any[]>('employees', fetchEmployees);
  const { data: purchases, loading: purchasesLoading, refresh: refreshPurchases } = useApiCache<any[]>('purchases', fetchPurchases);
  const { data: branches, refresh: refreshBranches } = useApiCache<any[]>('branches', fetchBranches);
  const { data: profitData, loading: profitLoading, error: profitError, refresh: refreshProfit } = useApiCache<any>('profitSummary', fetchProfitSummary);
  const { data: paymentSummary, loading: payLoading, error: payError, refresh: refreshPay } = useApiCache<PaymentSummary>('paymentSummary', fetchPaymentSummary);
  const { data: inventory, loading: invSumLoading, refresh: refreshInv } = useApiCache<InventorySummary>('inventorySummary', fetchInventorySummary);
  const { data: invoiceCountSummary, loading: invCntLoading, refresh: refreshInvCnt } = useApiCache<InvoiceCountSummary>('invoiceCountSummary', fetchInvoiceCountSummary);
  const { data: invoiceAmtSummary, loading: invAmtLoading, refresh: refreshInvAmt } = useApiCache<InvoiceAmountSummary>('invoiceAmountSummary', fetchInvoiceAmountSummary);
  const { data: topSelling, loading: topSellLoading, refresh: refreshTopSell } = useApiCache<TopSellingProduct[]>('topSellingProducts', fetchTopSellingProducts);
  const { data: lowStock, refresh: refreshLowStock } = useApiCache<LowStockProduct[]>('lowStockProducts', fetchLowStockProducts);
  const { data: topCustomers, loading: topCustLoading, refresh: refreshTopCust } = useApiCache<TopCustomer[]>('topCustomers', fetchTopCustomers);
  const { data: topVendors, loading: topVendLoading, refresh: refreshTopVend } = useApiCache<TopVendor[]>('topVendors', fetchTopVendors);
  const { data: purchaseDue, loading: purDueLoading, refresh: refreshPurDue } = useApiCache<PurchaseDueInvoice[]>('purchaseDue', fetchPurchaseDueInvoices);
  const { data: loginActivity, loading: loginActLoading, refresh: refreshLoginAct } = useApiCache<LoginActivityItem[]>('loginActivity', fetchLoginActivity);
  const { data: biharDistrictSales, loading: biharDistrictLoading, error: biharDistrictError, refresh: refreshBiharDistrict } = useApiCache<any[]>('biharDistrictSales', fetchBiharDistrictSales);
  const { data: newVsExisting, loading: newVsExistingLoading, error: newVsExistingError, refresh: refreshNewVsExisting } = useApiCache<NewVsExistingCustomerSale>(
    `newVsExisting-${nvCompanyFilter}-${nvBranchFilter}`,
    fetchNewVsExisting
  );

  const isLoading = compsLoading || custsLoading || prodsLoading || ordsLoading || invsLoading || empsLoading;

  // ─── Computed Stats ───
  const stats: DashboardStats = useMemo(() => {
    const safeLen = (arr: any[] | null) => arr?.length ?? 0;
    const totalRevenue = (invoices || []).reduce((sum: number, inv: any) => sum + (parseFloat(inv.total_amount) || 0), 0);
    return {
      companies: safeLen(companies),
      customers: safeLen(customers),
      products: safeLen(products),
      orders: safeLen(orders),
      invoices: safeLen(invoices),
      totalRevenue,
    };
  }, [companies, customers, products, orders, invoices]);

  // ─── Chart Data ───
  const groupByMonth = (items: any[], dateField: string, valueField?: string) => {
    const map: Record<string, number> = {};
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    months.forEach(m => map[m] = 0);
    items.forEach(item => {
      const date = new Date(item[dateField]);
      if (!isNaN(date.getTime())) {
        const key = months[date.getMonth()];
        map[key] += valueField ? (parseFloat(item[valueField]) || 0) : 1;
      }
    });
    return months.map(month => ({ month, value: map[month] }));
  };

  const revenueTrend = useMemo(() => groupByMonth(invoices || [], 'created_at', 'total_amount'), [invoices]);
  const purchaseTrend = useMemo(() => groupByMonth(purchases || [], 'created_at', 'total_amount'), [purchases]);
  const ordersTrend = useMemo(() => groupByMonth(orders || [], 'created_at'), [orders]);

  const salesPurchaseTrend = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const saleMap: Record<string, number> = {};
    const purchaseMap: Record<string, number> = {};
    months.forEach(m => { saleMap[m] = 0; purchaseMap[m] = 0; });
    (invoices || []).forEach(inv => {
      const date = new Date(inv.created_at);
      if (!isNaN(date.getTime())) saleMap[months[date.getMonth()]] += parseFloat(inv.total_amount) || 0;
    });
    (purchases || []).forEach(pur => {
      const date = new Date(pur.created_at);
      if (!isNaN(date.getTime())) purchaseMap[months[date.getMonth()]] += parseFloat(pur.total_amount) || 0;
    });
    return months.map(month => ({ month, Sales: saleMap[month], Purchase: purchaseMap[month] }));
  }, [invoices, purchases]);

  const orderStatusDist = useMemo(() => {
    const map: Record<string, number> = {};
    (orders || []).forEach(o => {
      const status = o.status || 'unknown';
      map[status] = (map[status] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [orders]);

  const employeeStatus = useMemo(() => {
    const map: Record<string, number> = { active: 0, inactive: 0 };
    (employees || []).forEach(e => {
      const s = e.status || 'active';
      if (map[s] !== undefined) map[s]++;
      else map['active']++;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [employees]);

  const activeInactive = useMemo(() => {
    const active = (employees || []).filter(e => e.status === 'active').length;
    const inactive = (employees || []).length - active;
    return [{ name: 'Active', value: active }, { name: 'Inactive', value: inactive }];
  }, [employees]);

  const paymentChartData = useMemo(() => {
    const safeSummary = paymentSummary || { inward: { total: 0, online: 0, cash: 0 }, outward: { total: 0, online: 0, cash: 0 } };
    return [
      { name: 'Inward', Online: safeSummary.inward.online, Cash: safeSummary.inward.cash },
      { name: 'Outward', Online: safeSummary.outward.online, Cash: safeSummary.outward.cash },
    ];
  }, [paymentSummary]);

  const totalOutstanding = useMemo(() => {
    return (purchaseDue || []).reduce((sum, inv) => sum + (inv.remaining_payment || 0), 0);
  }, [purchaseDue]);

  const newVsExistingChartData = useMemo(() => {
    if (!newVsExisting) return [];
    return [
      { name: 'New Customers', value: newVsExisting.new_customers?.count || 0 },
      { name: 'Existing Customers', value: newVsExisting.existing_customers?.count || 0 },
    ];
  }, [newVsExisting]);

  const filterBranches = useMemo(() => {
    if (!branches) return [];
    if (nvCompanyFilter === 'all') return branches;
    return branches.filter(b => b.company_id === parseInt(nvCompanyFilter));
  }, [branches, nvCompanyFilter]);

  // ─── Refresh All ───
  const refreshAll = async () => {
    await Promise.all([
      refreshComps(), refreshCusts(), refreshProds(), refreshOrds(), refreshInvs(), refreshEmps(),
      refreshPurchases(), refreshBranches(), refreshPay(), refreshInv(), refreshInvCnt(), refreshInvAmt(),
      refreshTopSell(), refreshLowStock(), refreshTopCust(), refreshTopVend(), refreshPurDue(),
      refreshLoginAct(), refreshBiharDistrict(), refreshProfit(), refreshNewVsExisting(),
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

  // ─── Render ───
  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 md:p-7 text-slate-800">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 mb-6 rounded-3xl bg-slate-950 px-5 py-6 md:px-8 md:py-7 shadow-xl shadow-slate-300/50">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> Executive Dashboard
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl flex items-center gap-3">
            <FiBarChart2 className="text-cyan-300" /> Dashboard
          </h1>
          <p className="text-sm text-slate-300">Live business metrics</p>
          {lastUpdated && <p className="text-xs text-slate-400 mt-1">Last updated: {lastUpdated.toLocaleString()}</p>}
        </div>
        <button onClick={refreshAll} disabled={isLoading} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 hover:bg-white/20 disabled:opacity-60">
          <FiRefreshCw className={isLoading ? 'animate-spin inline mr-1' : 'inline mr-1'} size={14} /> Refresh
        </button>
      </div>

      {/* Business Overview */}
      <h2 className="text-lg font-bold text-slate-700 mb-3 flex items-center gap-2"><FiActivity className="text-blue-600" /> Business Overview</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
        {isLoading ? [...Array(7)].map((_, i) => <StatCardSkeleton key={i} />) : (
          <>
            <StatCard icon={FiBox} label="Companies" value={stats.companies} tone="blue" />
            <StatCard icon={FiUsers} label="Customers" value={stats.customers} tone="emerald" />
            <StatCard icon={FiBarChart2} label="Products" value={inventory?.totalProducts || 0} tone="purple" />
            <StatCard icon={FiShoppingCart} label="Orders" value={stats.orders} tone="amber" />
            <StatCard icon={FiDollarSign} label="Invoices" value={stats.invoices} tone="rose" />
            <StatCard icon={FiTrendingUp} label="Revenue" value={`₹${stats.totalRevenue.toFixed(0)}`} tone="teal" />
            <StatCard icon={FiTrendingUp} label="Net Profit" value={profitData?.total_profit != null ? `₹${profitData.total_profit.toFixed(0)}` : '0'} tone="emerald" />
          </>
        )}
      </div>

      {/* HR & Employees */}
      <h2 className="text-lg font-bold text-slate-700 mb-3 flex items-center gap-2"><FiUserCheck className="text-purple-600" /> HR & Employees</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
        {isLoading ? [...Array(7)].map((_, i) => <StatCardSkeleton key={i} />) : (
          <>
            <StatCard icon={FiUsers} label="Total Employees" value={employees?.length || 0} tone="blue" />
            <StatCard icon={FiUserCheck} label="Active" value={(employees || []).filter(e => e.status === 'active').length} tone="emerald" />
            <StatCard icon={FiUserX} label="Inactive" value={(employees || []).filter(e => e.status === 'inactive').length} tone="rose" />
            <StatCard icon={FiCalendar} label="On Leave" value={(employees || []).filter(e => e.status === 'on-leave').length} tone="amber" />
            <StatCard icon={FiShoppingCart} label="Pending Orders" value={(orders || []).filter(o => o.status === 'pending').length} tone="rose" />
            <StatCard icon={FiCheckCircle} label="Paid Invoices" value={(invoices || []).filter(i => i.status === 'paid').length} tone="emerald" />
            <StatCard icon={FiClock} label="Overdue" value={(invoices || []).filter(i => i.status === 'overdue').length} tone="rose" />
          </>
        )}
      </div>

      {/* Financial Overview */}
      <h2 className="text-lg font-bold text-slate-700 mb-3 flex items-center gap-2"><FiDollarSign className="text-emerald-600" /> Financial Overview</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-500 mb-2">Inward Payment</h3>
          {payLoading ? <StatCardSkeleton /> : payError ? (
            <div className="text-xs text-rose-600">Unavailable</div>
          ) : (
            <>
              <p className="text-2xl font-bold text-emerald-600">₹{(paymentSummary?.inward?.total || 0).toLocaleString()}</p>
              <div className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between"><span>Online</span><span>₹{(paymentSummary?.inward?.online || 0).toLocaleString()}</span></div>
                <div className="flex justify-between"><span>Cash</span><span>₹{(paymentSummary?.inward?.cash || 0).toLocaleString()}</span></div>
              </div>
            </>
          )}
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-500 mb-2">Outward Payment</h3>
          {payLoading ? <StatCardSkeleton /> : (
            <>
              <p className="text-2xl font-bold text-rose-600">₹{(paymentSummary?.outward?.total || 0).toLocaleString()}</p>
              <div className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between"><span>Online</span><span>₹{(paymentSummary?.outward?.online || 0).toLocaleString()}</span></div>
                <div className="flex justify-between"><span>Cash</span><span>₹{(paymentSummary?.outward?.cash || 0).toLocaleString()}</span></div>
              </div>
            </>
          )}
        </div>
        <ChartCard title="Payment Breakdown" className="md:col-span-2">
          {payLoading ? <div className="h-40 bg-slate-200 rounded animate-pulse" /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={paymentChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" /><YAxis /><RechartsTooltip />
                <Bar dataKey="Online" fill="#3B82F6" radius={[4,4,0,0]} />
                <Bar dataKey="Cash" fill="#F59E0B" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Inventory */}
      <h2 className="text-lg font-bold text-slate-700 mb-3 flex items-center gap-2"><FiPackage className="text-amber-600" /> Inventory</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {invSumLoading ? [...Array(6)].map((_, i) => <StatCardSkeleton key={i} />) : (
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

      {/* New vs Existing */}
      <h2 className="text-lg font-bold text-slate-700 mb-3 flex items-center gap-2"><FiUsers className="text-indigo-600" /> New vs Existing Customers</h2>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select value={nvCompanyFilter} onChange={(e) => { setNvCompanyFilter(e.target.value); setNvBranchFilter('all'); }} className="rounded-xl border-slate-200 bg-white py-2 px-3 text-sm outline-none">
          <option value="all">All Companies</option>
          {companies?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={nvBranchFilter} onChange={(e) => setNvBranchFilter(e.target.value)} className="rounded-xl border-slate-200 bg-white py-2 px-3 text-sm outline-none" disabled={!filterBranches.length}>
          <option value="all">All Branches</option>
          {filterBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <ChartCard title="Customer Distribution">
          {newVsExistingLoading ? <div className="h-64 bg-slate-200 rounded animate-pulse" /> : newVsExistingError ? (
            <div className="text-sm text-rose-600 text-center py-8">Data unavailable</div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={newVsExistingChartData} dataKey="value" nameKey="name" outerRadius={80} label>
                  {newVsExistingChartData.map((_, i) => <Cell key={i} fill={i === 0 ? '#3B82F6' : '#10B981'} />)}
                </Pie>
                <RechartsTooltip /><Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
        <ChartCard title="Sales by Type">
          {newVsExistingLoading ? <div className="h-64 bg-slate-200 rounded animate-pulse" /> : newVsExistingError ? (
            <div className="text-sm text-rose-600 text-center py-8">Data unavailable</div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={newVsExistingChartData}>
                <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><RechartsTooltip />
                <Bar dataKey="value" radius={[8,8,0,0]}>
                  {newVsExistingChartData.map((_, i) => <Cell key={i} fill={i === 0 ? '#3B82F6' : '#10B981'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Top Customers & Vendors */}
      <h2 className="text-lg font-bold text-slate-700 mb-3 flex items-center gap-2"><FiUsers className="text-violet-600" /> Top Customers & Vendors</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <ChartCard title="Top Customers">
          {topCustLoading ? <div className="h-40 bg-slate-200 rounded animate-pulse" /> : (
            <MiniTable columns={['Name', 'Amount']} data={(topCustomers || []).map(c => [c.name, `₹${c.amount.toLocaleString()}`])} />
          )}
        </ChartCard>
        <ChartCard title="Top Vendors">
          {topVendLoading ? <div className="h-40 bg-slate-200 rounded animate-pulse" /> : (
            <MiniTable columns={['Name', 'Amount']} data={(topVendors || []).map(v => [v.name, `₹${v.amount.toLocaleString()}`])} />
          )}
        </ChartCard>
      </div>

      {/* Purchase Outstanding */}
      <h2 className="text-lg font-bold text-slate-700 mb-3 flex items-center gap-2"><FiClock className="text-rose-600" /> Purchase Outstanding</h2>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
        <div className="xl:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          {purDueLoading ? <div className="h-40 bg-slate-200 rounded animate-pulse" /> : (
            <MiniTable columns={['Invoice', 'Company', 'Name', 'Due Date', 'Remaining']} data={(purchaseDue || []).map(inv => [
              inv.invoice_no, inv.company_name, inv.name,
              inv.due_date ? new Date(inv.due_date).toLocaleDateString() : '—',
              `₹${inv.remaining_payment.toLocaleString()}`
            ])} />
          )}
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col justify-center items-center">
          <h3 className="text-sm font-semibold text-slate-500">Total Outstanding</h3>
          <p className="text-4xl font-extrabold text-rose-600 mt-3">₹{totalOutstanding.toLocaleString()}</p>
        </div>
      </div>

      {/* Charts */}
      <h2 className="text-lg font-bold text-slate-700 mb-3 mt-8 flex items-center gap-2"><FiBarChart2 className="text-indigo-600" /> Charts & Trends</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
        
        {/* Render Map if Data exists */}
        {showMap && (
          <ChartCard title="Sales Heatmap (Bihar)" className="md:col-span-2 xl:col-span-3">
            <div className="h-96 w-full flex items-center justify-center bg-slate-50 rounded-lg overflow-hidden border border-slate-100">
              <ComposableMap projection="geoMercator" projectionConfig={{ scale: 3000, center: [85.3131, 25.0961] }} className="w-full h-full">
                <Geographies geography={geoData}>
                  {({ geographies }) =>
                    geographies.map((geo) => {
                      const dName = geo.properties.name || geo.properties.dtname;
                      const dSales = biharDistrictSales?.find((s: any) => s.district === dName)?.sales || 0;
                      const maxSales = Math.max(...(biharDistrictSales?.map((s: any) => s.sales) || [1]));
                      
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
                          data-tooltip-content={`${dName}: ₹${dSales.toLocaleString()}`}
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

        <ChartCard title="Monthly Revenue">
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={revenueTrend}>
              <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><RechartsTooltip />
              <Area type="monotone" dataKey="value" stroke="#10B981" fill="#10B981" fillOpacity={0.2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Monthly Purchases">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={purchaseTrend}>
              <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><RechartsTooltip />
              <Bar dataKey="value" fill="#F59E0B" radius={[6,6,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Sales vs Purchase">
          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart data={salesPurchaseTrend}>
              <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><RechartsTooltip /><Legend />
              <Bar dataKey="Sales" fill="#10B981" radius={[4,4,0,0]} />
              <Bar dataKey="Purchase" fill="#F59E0B" radius={[4,4,0,0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Net Profit">
          {profitError ? <div className="text-sm text-rose-600 text-center py-8">Unavailable</div> : (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={profitData?.monthly_profit || []}>
                <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><RechartsTooltip />
                <Area type="monotone" dataKey="profit" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Order Status">
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={orderStatusDist} dataKey="value" nameKey="name" outerRadius={80} label>
                {orderStatusDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <RechartsTooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Employee Status">
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={activeInactive} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                {activeInactive.map((_, i) => <Cell key={i} fill={i === 0 ? '#10B981' : '#EF4444'} />)}
              </Pie>
              <RechartsTooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* AI Voice Assistant */}
      <GeminiAIAssistant />
    </div>
  );
}