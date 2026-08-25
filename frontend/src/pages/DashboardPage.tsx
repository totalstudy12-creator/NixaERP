// src/pages/DashboardPage.tsx
import { useEffect, useState, useCallback, useMemo, memo, useRef } from 'react';
import type { ReactNode } from 'react';
import {
  FiRefreshCw, FiClock, FiUsers, FiShoppingCart, FiBox,
  FiDollarSign, FiTrendingUp, FiBarChart2, FiUserCheck, FiUserX,
  FiCalendar, FiFileText, FiAlertTriangle, FiActivity,
  FiTrendingDown, FiCheckCircle, FiPackage, FiAlertCircle,
  FiMonitor,
} from 'react-icons/fi';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, ComposedChart, Legend,
} from 'recharts';
import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
// ----- Map imports -----
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { Tooltip } from 'react-tooltip';
import 'react-tooltip/dist/react-tooltip.css';

// ---------- Simple API Cache Hook ----------
const cache = new Map<string, { data: unknown; timestamp: number }>();
const normalizeCachePayload = <T,>(payload: unknown): T => {
  if (payload === null || payload === undefined) return [] as unknown as T;
  if (Array.isArray(payload)) return payload as T;
  if (typeof payload === 'object' && payload !== null && 'data' in payload) {
    const nested = (payload as { data?: unknown }).data;
    return normalizeCachePayload<T>(nested);
  }
  return payload as T;
};

function useApiCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = 300_000
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef<Promise<T | null> | null>(null);

  const fetchData = useCallback(async (skipCache = false) => {
    if (!skipCache) {
      const entry = cache.get(key);
      if (entry && Date.now() - entry.timestamp < ttlMs) {
        setData(normalizeCachePayload<T>(entry.data));
        setLoading(false);
        return entry.data as T;
      }
    }

    if (!skipCache && inFlightRef.current) {
      return inFlightRef.current;
    }

    setLoading(true);
    setError(null);

    const request = (async () => {
      try {
        const res = await fetcher();
        const result = normalizeCachePayload<T>(res);
        cache.set(key, { data: result, timestamp: Date.now() });
        setData(result);
        return result;
      } catch (err: any) {
        const msg = err?.backendMessage || err?.message || 'Failed to load';
        setError(msg);
        return null;
      } finally {
        setLoading(false);
        inFlightRef.current = null;
      }
    })();

    inFlightRef.current = request;
    return request;
  }, [key, fetcher, ttlMs]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { data, loading, error, refresh: () => fetchData(true) };
}

// ---------- Types ----------
interface DashboardStats {
  companies: number;
  customers: number;
  products: number;
  orders: number;
  invoices: number;
  totalRevenue: number;
}

interface PaymentBreakdown {
  total: number;
  online: number;
  cash: number;
}

interface PaymentSummary {
  inward: PaymentBreakdown;
  outward: PaymentBreakdown;
}

interface RawPayment {
  payment_direction: 'inward' | 'outward';
  payment_method: string;
  amount: number;
}

interface InventorySummary {
  totalProducts: number;
  totalQuantity: number;
  inStock: number;
  lowStock: number;
  zeroStock: number;
  negativeStock: number;
}

interface InvoiceCountSummary { sale: number; purchase: number }
interface InvoiceAmountSummary { sale: number; purchase: number }
interface TopSellingProduct { product_name: string; total_qty: number }
interface LowStockProduct { product_name: string; qty: number }
interface TopCustomer { name: string; amount: number }
interface TopVendor { name: string; amount: number }
interface PurchaseDueInvoice {
  invoice_no: string;
  company_name: string;
  name: string;
  phone: string;
  due_date: string | null;
  due_from: string;
  remaining_payment: number;
}
interface LoginActivityItem { day: string; count: number }

interface NewVsExistingCustomerSale {
  new_customers: number;
  existing_customers: number;
  total_sales: number;
  new_customers_percentage: number;
  existing_customers_percentage: number;
}

const EMPTY_PAYMENT_SUMMARY: PaymentSummary = {
  inward: { total: 0, online: 0, cash: 0 },
  outward: { total: 0, online: 0, cash: 0 },
};

const FALLBACK_NEW_VS_EXISTING: NewVsExistingCustomerSale = {
  new_customers: 15,
  existing_customers: 85,
  total_sales: 100,
  new_customers_percentage: 15,
  existing_customers_percentage: 85,
};

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];

// ---------- Skeleton Components ----------
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

// ---------- Helper: group data by month ----------
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

// ---------- Main Component ----------
export function DashboardPage() {
  const { showError } = useNotification();
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // ---------- State for map GeoJSON ----------
  const [geoData, setGeoData] = useState<any>(null);
  const [geoLoading, setGeoLoading] = useState(true);

  useEffect(() => {
    fetch('/data/bihar-districts.json')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load district map data');
        return res.json();
      })
      .then(data => {
        setGeoData(data);
        setGeoLoading(false);
      })
      .catch(() => {
        setGeoLoading(false);
      });
  }, []);

  const fetchCompanies = useCallback(() => apiClient.getCompanies(), []);
  const fetchCustomers = useCallback(() => apiClient.getCustomers(), []);
  const fetchProducts = useCallback(() => apiClient.getProducts(), []);
  const fetchOrders = useCallback(() => apiClient.getOrders(), []);
  const fetchInvoices = useCallback(() => apiClient.getInvoices(), []);
  const fetchEmployees = useCallback(() => apiClient.getEmployees(), []);
  const fetchPurchases = useCallback(() => apiClient.getPurchases(), []);
  const fetchBranches = useCallback(() => apiClient.getBranches(), []);
  const fetchProfitSummary = useCallback(() => apiClient.getProfitSummary(), []);

  // Core data
  const {
    data: companies, loading: compsLoading, error: compsError, refresh: refreshComps,
  } = useApiCache<any[]>('companies', fetchCompanies);
  const {
    data: customers, loading: custsLoading, error: custsError, refresh: refreshCusts,
  } = useApiCache<any[]>('customers', fetchCustomers);
  const {
    data: products, loading: prodsLoading, error: prodsError, refresh: refreshProds,
  } = useApiCache<any[]>('products', fetchProducts);
  const {
    data: orders, loading: ordsLoading, error: ordsError, refresh: refreshOrds,
  } = useApiCache<any[]>('orders', fetchOrders);
  const {
    data: invoices, loading: invsLoading, error: invsError, refresh: refreshInvs,
  } = useApiCache<any[]>('invoices', fetchInvoices);
  const {
    data: employees, loading: empsLoading, error: empsError, refresh: refreshEmps,
  } = useApiCache<any[]>('employees', fetchEmployees);
  const {
    data: purchases, loading: purchasesLoading, error: purchasesError, refresh: refreshPurchases,
  } = useApiCache<any[]>('purchases', fetchPurchases);
  const {
    data: branches, loading: branchesLoading, error: branchesError, refresh: refreshBranches,
  } = useApiCache<any[]>('branches', fetchBranches);
  const {
    data: profitData, loading: profitLoading, error: profitError, refresh: refreshProfit,
  } = useApiCache<any>('profitSummary', fetchProfitSummary);

  // 🆕 New vs Existing filters
  const [nvCompanyFilter, setNvCompanyFilter] = useState('all');
  const [nvBranchFilter, setNvBranchFilter] = useState('all');

  const fetchNewVsExisting = useCallback(() => {
    return apiClient.getNewVsExistingCustomerSale(
      nvCompanyFilter !== 'all' ? nvCompanyFilter : undefined,
      nvBranchFilter !== 'all' ? nvBranchFilter : undefined
    );
  }, [nvCompanyFilter, nvBranchFilter]);

  const {
    data: newVsExisting,
    loading: newVsExistingLoading,
    error: newVsExistingError,
    refresh: refreshNewVsExisting,
  } = useApiCache<NewVsExistingCustomerSale>(
    `newVsExisting-${nvCompanyFilter}-${nvBranchFilter}`,
    fetchNewVsExisting
  );

  // 🆕 Fallback to sample data when API fails
  const displayNewVsExisting = useMemo(() => {
    if (newVsExistingError && !newVsExisting) return FALLBACK_NEW_VS_EXISTING;
    return newVsExisting;
  }, [newVsExisting, newVsExistingError]);

  // Derived branches for filter dropdown
  const filterBranches = useMemo(() => {
    if (!branches) return [];
    if (nvCompanyFilter === 'all') return branches;
    return branches.filter(b => b.company_id === parseInt(nvCompanyFilter));
  }, [branches, nvCompanyFilter]);

  // Chart data for new vs existing
  const newVsExistingChartData = useMemo(() => {
    if (!displayNewVsExisting) return [];
    return [
      { name: 'New Customers', value: displayNewVsExisting.new_customers },
      { name: 'Existing Customers', value: displayNewVsExisting.existing_customers },
    ];
  }, [displayNewVsExisting]);

  const fetchPaymentSummary = useCallback(async () => {
    const res = await apiClient.getPaymentSummary();
    if (res && typeof res === 'object' && 'inward' in res && 'outward' in res) {
      return res as PaymentSummary;
    }
    if (Array.isArray(res)) {
      const summary: PaymentSummary = {
        inward: { total: 0, online: 0, cash: 0 },
        outward: { total: 0, online: 0, cash: 0 },
      };
      (res as RawPayment[]).forEach((p) => {
        const direction = p.payment_direction === 'outward' ? 'outward' : 'inward';
        const method = (p.payment_method || '').toLowerCase();
        const amount = p.amount || 0;
        summary[direction].total += amount;
        if (['qr', 'upi', 'online', 'bank_transfer', 'card'].includes(method)) {
          summary[direction].online += amount;
        } else if (method === 'cash') {
          summary[direction].cash += amount;
        }
      });
      return summary;
    }
    return EMPTY_PAYMENT_SUMMARY;
  }, []);

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

  const {
    data: paymentSummary, loading: payLoading, error: payError, refresh: refreshPay,
  } = useApiCache<PaymentSummary>('paymentSummary', fetchPaymentSummary);
  const {
    data: inventory, loading: invSumLoading, error: invSumError, refresh: refreshInv,
  } = useApiCache<InventorySummary>('inventorySummary', fetchInventorySummary);
  const {
    data: invoiceCountSummary, loading: invCntLoading, error: invCntError, refresh: refreshInvCnt,
  } = useApiCache<InvoiceCountSummary>('invoiceCountSummary', fetchInvoiceCountSummary);
  const {
    data: invoiceAmtSummary, loading: invAmtLoading, error: invAmtError, refresh: refreshInvAmt,
  } = useApiCache<InvoiceAmountSummary>('invoiceAmountSummary', fetchInvoiceAmountSummary);
  const {
    data: topSelling, loading: topSellLoading, error: topSellError, refresh: refreshTopSell,
  } = useApiCache<TopSellingProduct[]>('topSellingProducts', fetchTopSellingProducts);
  const {
    data: leastSelling, loading: leastSellLoading, error: leastSellError, refresh: refreshLeastSell,
  } = useApiCache<TopSellingProduct[]>('leastSellingProducts', fetchLeastSellingProducts);
  const {
    data: lowStock, loading: lowStockLoading, error: lowStockError, refresh: refreshLowStock,
  } = useApiCache<LowStockProduct[]>('lowStockProducts', fetchLowStockProducts);
  const {
    data: topCustomers, loading: topCustLoading, error: topCustError, refresh: refreshTopCust,
  } = useApiCache<TopCustomer[]>('topCustomers', fetchTopCustomers);
  const {
    data: topVendors, loading: topVendLoading, error: topVendError, refresh: refreshTopVend,
  } = useApiCache<TopVendor[]>('topVendors', fetchTopVendors);
  const {
    data: purchaseDue, loading: purDueLoading, error: purDueError, refresh: refreshPurDue,
  } = useApiCache<PurchaseDueInvoice[]>('purchaseDue', fetchPurchaseDueInvoices);
  const {
    data: loginActivity, loading: loginActLoading, error: loginActError, refresh: refreshLoginAct,
  } = useApiCache<LoginActivityItem[]>('loginActivity', fetchLoginActivity);
  const {
    data: biharDistrictSales, loading: biharDistrictLoading, error: biharDistrictError, refresh: refreshBiharDistrict,
  } = useApiCache<any[]>('biharDistrictSales', fetchBiharDistrictSales);

  const isLoading = compsLoading || custsLoading || prodsLoading || ordsLoading || invsLoading || empsLoading;
  const hasError = compsError || custsError || prodsError || ordsError || invsError || empsError;

  // ---------- Computed stats ----------
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

  // ---------- Real chart data ----------
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
      if (!isNaN(date.getTime())) {
        const key = months[date.getMonth()];
        saleMap[key] += parseFloat(inv.total_amount) || 0;
      }
    });
    (purchases || []).forEach(pur => {
      const date = new Date(pur.created_at);
      if (!isNaN(date.getTime())) {
        const key = months[date.getMonth()];
        purchaseMap[key] += parseFloat(pur.total_amount) || 0;
      }
    });
    return months.map(month => ({
      month,
      Sales: saleMap[month],
      Purchase: purchaseMap[month],
    }));
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
    const map: Record<string, number> = { active: 0, inactive: 0, 'on-leave': 0 };
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
    const safeSummary = paymentSummary ?? EMPTY_PAYMENT_SUMMARY;
    return [
      { name: 'Inward', Online: safeSummary.inward.online, Cash: safeSummary.inward.cash },
      { name: 'Outward', Online: safeSummary.outward.online, Cash: safeSummary.outward.cash },
    ];
  }, [paymentSummary]);

  const totalOutstanding = useMemo(() => {
    return (purchaseDue || []).reduce((sum, inv) => sum + (inv.remaining_payment || 0), 0);
  }, [purchaseDue]);

  // ---------- Refresh all ----------
  const refreshAll = async () => {
    await Promise.all([
      refreshComps(), refreshCusts(), refreshProds(), refreshOrds(), refreshInvs(), refreshEmps(),
      refreshPurchases(), refreshBranches(),
      refreshPay(), refreshInv(), refreshInvCnt(), refreshInvAmt(),
      refreshTopSell(), refreshLeastSell(), refreshLowStock(),
      refreshTopCust(), refreshTopVend(), refreshPurDue(), refreshLoginAct(),
      refreshBiharDistrict(), refreshProfit(), refreshNewVsExisting(),
    ]);
    setLastUpdated(new Date());
  };

  useEffect(() => {
    if (!isLoading) setLastUpdated(new Date());
  }, [isLoading]);

  // ---------- Chart Card Wrapper ----------
  const ChartCard = ({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) => (
    <div className={`bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col ${className}`}>
      <h2 className="text-base font-semibold text-slate-800 mb-4">{title}</h2>
      <div className="flex-1">
        {isLoading ? <div className="h-56 bg-slate-200 rounded animate-pulse" /> : children}
      </div>
    </div>
  );

  // Simple table component
  const MiniTable = ({ columns, data, className }: { columns: string[]; data: any[][]; className?: string }) => (
    <div className={`overflow-x-auto ${className || ''}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
            {columns.map((col, i) => <th key={i} className="py-2 px-3 first:pl-0 last:pr-0">{col}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.map((row, i) => (
            <tr key={i} className="hover:bg-slate-50">
              {row.map((cell, j) => (
                <td key={j} className="py-2 px-3 first:pl-0 last:pr-0 text-slate-700">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // ---------- Helper color scale for map ----------
  const getMapColor = (sales: number, maxSales: number) => {
    if (!maxSales) return '#CBD5E1';
    const intensity = sales / maxSales;
    const hue = 210;
    const lightness = 90 - 60 * intensity;
    return `hsl(${hue}, 70%, ${lightness}%)`;
  };

  const showMap = !biharDistrictError && geoData && !geoLoading;

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
            <span className="text-sm font-normal text-cyan-100/70 ml-2">Real-Time Overview</span>
          </h1>
          <p className="text-sm text-slate-300">Live business metrics fetched from your data</p>
          {lastUpdated && (
            <p className="text-xs text-slate-400 mt-1">Last updated: {lastUpdated.toLocaleString()}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refreshAll} disabled={isLoading} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 transition hover:bg-white/20 disabled:opacity-60">
            <FiRefreshCw className={isLoading ? 'animate-spin inline mr-1' : 'inline mr-1'} size={14} /> Refresh
          </button>
        </div>
      </div>

      {hasError && (
        <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-2">
          <FiAlertTriangle size={20} /> Failed to load some data. Retrying…
        </div>
      )}

      {/* ===== Business Overview ===== */}
      <h2 className="text-lg font-bold text-slate-700 mb-3 flex items-center gap-2">
        <FiActivity className="text-blue-600" /> Business Overview
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
        {isLoading ? (
          [...Array(7)].map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard icon={FiBox} label="Companies" value={stats.companies} tone="blue" />
            <StatCard icon={FiUsers} label="Customers" value={stats.customers} tone="emerald" />
            <StatCard icon={FiBarChart2} label="Products" value={stats.products} tone="purple" />
            <StatCard icon={FiShoppingCart} label="Orders" value={stats.orders} tone="amber" />
            <StatCard icon={FiDollarSign} label="Invoices" value={stats.invoices} tone="rose" />
            <StatCard icon={FiTrendingUp} label="Revenue" value={`₹${stats.totalRevenue.toFixed(0)}`} tone="teal" />
            <StatCard
              icon={FiTrendingUp}
              label="Net Profit"
              value={profitData?.total_profit != null ? `₹${profitData.total_profit.toFixed(0)}` : '—'}
              tone="emerald"
            />
          </>
        )}
      </div>

      {/* ===== HR & Employees ===== */}
      <h2 className="text-lg font-bold text-slate-700 mb-3 flex items-center gap-2">
        <FiUserCheck className="text-purple-600" /> HR & Employees
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
        {isLoading ? (
          [...Array(9)].map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard icon={FiUsers} label="Total Employees" value={employees?.length || 0} tone="blue" />
            <StatCard icon={FiUserCheck} label="Active" value={(employees || []).filter(e => e.status === 'active').length} tone="emerald" />
            <StatCard icon={FiUserX} label="Inactive" value={(employees || []).filter(e => e.status === 'inactive').length} tone="rose" />
            <StatCard icon={FiCalendar} label="On Leave" value={(employees || []).filter(e => e.status === 'on-leave').length} tone="amber" />
            <StatCard icon={FiShoppingCart} label="Pending Orders" value={(orders || []).filter(o => o.status === 'pending').length} tone="rose" />
            <StatCard icon={FiShoppingCart} label="Confirmed Orders" value={(orders || []).filter(o => o.status === 'confirmed').length} tone="emerald" />
            <StatCard icon={FiFileText} label="Draft Invoices" value={(invoices || []).filter(i => i.status === 'draft').length} tone="amber" />
            <StatCard icon={FiCheckCircle} label="Paid Invoices" value={(invoices || []).filter(i => i.status === 'paid').length} tone="emerald" />
            <StatCard icon={FiClock} label="Overdue Invoices" value={(invoices || []).filter(i => i.status === 'overdue').length} tone="rose" />
          </>
        )}
      </div>

      {/* ===== Financial Overview ===== */}
      <h2 className="text-lg font-bold text-slate-700 mb-3 flex items-center gap-2">
        <FiDollarSign className="text-emerald-600" /> Financial Overview
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {/* Inward Payment */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-500 mb-2">Inward Payment</h3>
          {payLoading ? <StatCardSkeleton /> : payError ? (
            <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">Payment summary unavailable.</div>
          ) : (
            <>
              <p className="text-2xl font-bold text-emerald-600">₹{(paymentSummary ?? EMPTY_PAYMENT_SUMMARY).inward.total.toLocaleString()}</p>
              <div className="mt-3 space-y-1 text-xs text-slate-600">
                <div className="flex justify-between"><span>Online</span><span className="font-medium">₹{(paymentSummary ?? EMPTY_PAYMENT_SUMMARY).inward.online.toLocaleString()}</span></div>
                <div className="flex justify-between"><span>Cash</span><span className="font-medium">₹{(paymentSummary ?? EMPTY_PAYMENT_SUMMARY).inward.cash.toLocaleString()}</span></div>
              </div>
            </>
          )}
        </div>
        {/* Outward Payment */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-500 mb-2">Outward Payment</h3>
          {payLoading ? <StatCardSkeleton /> : payError ? (
            <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">Outward summary unavailable.</div>
          ) : (
            <>
              <p className="text-2xl font-bold text-rose-600">₹{(paymentSummary ?? EMPTY_PAYMENT_SUMMARY).outward.total.toLocaleString()}</p>
              <div className="mt-3 space-y-1 text-xs text-slate-600">
                <div className="flex justify-between"><span>Online</span><span className="font-medium">₹{(paymentSummary ?? EMPTY_PAYMENT_SUMMARY).outward.online.toLocaleString()}</span></div>
                <div className="flex justify-between"><span>Cash</span><span className="font-medium">₹{(paymentSummary ?? EMPTY_PAYMENT_SUMMARY).outward.cash.toLocaleString()}</span></div>
              </div>
            </>
          )}
        </div>
        {/* Payment Breakdown Chart */}
        <ChartCard title="Payment Breakdown" className="md:col-span-2">
          {payLoading ? <div className="h-40 bg-slate-200 rounded animate-pulse" /> : payError ? (
            <div className="flex h-40 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-sm text-rose-700">Unable to load payment data.</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={paymentChartData} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" />
                <YAxis />
                <RechartsTooltip />
                <Bar dataKey="Online" fill="#3B82F6" radius={[4,4,0,0]} />
                <Bar dataKey="Cash" fill="#F59E0B" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* ===== Inventory ===== */}
      <h2 className="text-lg font-bold text-slate-700 mb-3 flex items-center gap-2">
        <FiPackage className="text-amber-600" /> Inventory
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
        {invSumLoading ? (
          [...Array(6)].map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard icon={FiBox} label="Total Products" value={inventory?.totalProducts || 0} tone="blue" />
            <StatCard icon={FiPackage} label="Total Quantity" value={inventory?.totalQuantity || 0} tone="emerald" />
            <StatCard icon={FiCheckCircle} label="In Stock" value={inventory?.inStock || 0} tone="teal" />
            <StatCard icon={FiAlertCircle} label="Low Stock" value={inventory?.lowStock || 0} tone="amber" />
            <StatCard icon={FiAlertTriangle} label="Zero Stock" value={inventory?.zeroStock || 0} tone="rose" />
            <StatCard icon={FiTrendingDown} label="Negative Stock" value={inventory?.negativeStock || 0} tone="rose" />
          </>
        )}
      </div>

      {/* ===== Invoice Summary ===== */}
      <h2 className="text-lg font-bold text-slate-700 mb-3 flex items-center gap-2">
        <FiFileText className="text-indigo-600" /> Invoice Summary
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-500">Invoice Count</h3>
          {invCntLoading ? <StatCardSkeleton /> : (
            <div className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between"><span>Sale</span><span className="font-bold text-emerald-600">{invoiceCountSummary?.sale ?? 0}</span></div>
              <div className="flex justify-between"><span>Purchase</span><span className="font-bold text-blue-600">{invoiceCountSummary?.purchase ?? 0}</span></div>
            </div>
          )}
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-500">Invoice Amount</h3>
          {invAmtLoading ? <StatCardSkeleton /> : (
            <div className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between"><span>Sale</span><span className="font-bold text-emerald-600">₹{invoiceAmtSummary?.sale?.toLocaleString() ?? 0}</span></div>
              <div className="flex justify-between"><span>Purchase</span><span className="font-bold text-blue-600">₹{invoiceAmtSummary?.purchase?.toLocaleString() ?? 0}</span></div>
            </div>
          )}
        </div>
      </div>

      {/* ===== New vs Existing Customer Sales ===== */}
      <h2 className="text-lg font-bold text-slate-700 mb-3 flex items-center gap-2">
        <FiUsers className="text-indigo-600" /> New vs Existing Customer Sales
      </h2>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          value={nvCompanyFilter}
          onChange={(e) => { setNvCompanyFilter(e.target.value); setNvBranchFilter('all'); }}
          className="rounded-xl border-slate-200 bg-white py-2 px-3 text-sm"
        >
          <option value="all">All Companies</option>
          {companies?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select
          value={nvBranchFilter}
          onChange={(e) => setNvBranchFilter(e.target.value)}
          className="rounded-xl border-slate-200 bg-white py-2 px-3 text-sm"
          disabled={!filterBranches.length}
        >
          <option value="all">All Branches</option>
          {filterBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <ChartCard title="Customer Type Distribution">
          {newVsExistingLoading ? <div className="h-64 bg-slate-200 rounded animate-pulse" /> : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={newVsExistingChartData} dataKey="value" nameKey="name" outerRadius={80} label>
                  {newVsExistingChartData.map((_, i) => <Cell key={i} fill={i === 0 ? '#3B82F6' : '#10B981'} />)}
                </Pie>
                <RechartsTooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
          {newVsExistingError && !newVsExisting && (
            <p className="text-xs text-amber-600 mt-2 text-center">Showing sample data (API unavailable)</p>
          )}
        </ChartCard>
        <ChartCard title="Sales by Customer Type">
          {newVsExistingLoading ? <div className="h-64 bg-slate-200 rounded animate-pulse" /> : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={newVsExistingChartData}>
                <defs>
                  <linearGradient id="barGradientNew" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#1D4ED8" stopOpacity={0.7} />
                  </linearGradient>
                  <linearGradient id="barGradientExisting" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#047857" stopOpacity={0.7} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" />
                <YAxis />
                <RechartsTooltip />
                <Bar dataKey="value" radius={[8,8,0,0]}>
                  {newVsExistingChartData.map((entry, index) => (
                    <Cell key={index} fill={index === 0 ? 'url(#barGradientNew)' : 'url(#barGradientExisting)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          {newVsExistingError && !newVsExisting && (
            <p className="text-xs text-amber-600 mt-2 text-center">Showing sample data (API unavailable)</p>
          )}
        </ChartCard>
      </div>

      {/* ===== Top Customers & Vendors ===== */}
      <h2 className="text-lg font-bold text-slate-700 mb-3 flex items-center gap-2">
        <FiUsers className="text-violet-600" /> Top Customers & Vendors
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <ChartCard title="👑 Top Customers">
          {topCustLoading ? <div className="h-40 bg-slate-200 rounded animate-pulse" /> : topCustError ? (
            <div className="flex h-40 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-sm text-rose-700">Top customer data unavailable.</div>
          ) : (
            <>
              <MiniTable columns={['Name', 'Amount']} data={(topCustomers || []).map(c => [c.name, `₹${c.amount.toLocaleString()}`])} />
              <button className="mt-3 text-xs text-blue-600 hover:underline self-end">View All</button>
            </>
          )}
        </ChartCard>
        <ChartCard title="🏭 Top Vendors">
          {topVendLoading ? <div className="h-40 bg-slate-200 rounded animate-pulse" /> : (
            <>
              <MiniTable columns={['Name', 'Amount']} data={(topVendors || []).map(v => [v.name, `₹${v.amount.toLocaleString()}`])} />
              <button className="mt-3 text-xs text-blue-600 hover:underline self-end">View All</button>
            </>
          )}
        </ChartCard>
      </div>

      {/* ===== Purchase Outstanding ===== */}
      <h2 className="text-lg font-bold text-slate-700 mb-3 flex items-center gap-2">
        <FiClock className="text-rose-600" /> Purchase Outstanding
      </h2>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
        <div className="xl:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h3 className="text-base font-semibold text-slate-800 mb-4">Due Invoices</h3>
          {purDueLoading ? <div className="h-40 bg-slate-200 rounded animate-pulse" /> : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-500 uppercase">
                      <th className="py-2 px-2">Invoice No.</th>
                      <th className="py-2 px-2">Company Name</th>
                      <th className="py-2 px-2">Name</th>
                      <th className="py-2 px-2">Phone</th>
                      <th className="py-2 px-2">Due Date</th>
                      <th className="py-2 px-2">Due From</th>
                      <th className="py-2 px-2">Remaining Payment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(purchaseDue || []).map((inv, i) => {
                      const dueDate = inv.due_date ? new Date(inv.due_date) : null;
                      return (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="py-2 px-2">{inv.invoice_no}</td>
                          <td className="py-2 px-2">{inv.company_name}</td>
                          <td className="py-2 px-2">{inv.name}</td>
                          <td className="py-2 px-2">{inv.phone || '—'}</td>
                          <td className="py-2 px-2">{dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate.toLocaleDateString() : '—'}</td>
                          <td className="py-2 px-2">{inv.due_from}</td>
                          <td className="py-2 px-2 font-medium text-rose-600">₹{inv.remaining_payment.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                    {(!purchaseDue || purchaseDue.length === 0) && (
                      <tr><td colSpan={7} className="py-4 text-center text-slate-400">No records found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col justify-center items-center">
          <h3 className="text-sm font-semibold text-slate-500">Total Outstanding</h3>
          <p className="text-4xl font-extrabold text-rose-600 mt-3">₹{totalOutstanding.toLocaleString()}</p>
          <span className="text-xs text-slate-400 mt-1">from purchase invoices</span>
        </div>
      </div>

      {/* ===== Sales Invoice Due ===== */}
      <h2 className="text-lg font-bold text-slate-700 mb-3 flex items-center gap-2">
        <FiAlertTriangle className="text-amber-600" /> Sales Invoice Due
      </h2>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-8">
        <div className="text-center text-slate-400 py-6">No records found</div>
      </div>

      {/* ===== Login Activity ===== */}
      <h2 className="text-lg font-bold text-slate-700 mb-3 flex items-center gap-2">
        <FiMonitor className="text-sky-600" /> Login Activity (Last 30 Days)
      </h2>
      <ChartCard title="📅 Daily Logins">
        {loginActLoading ? <div className="h-52 bg-slate-200 rounded animate-pulse" /> : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={loginActivity || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="day" fontSize={12} />
              <YAxis allowDecimals={false} />
              <RechartsTooltip />
              <Bar dataKey="count" fill="#0EA5E9" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* ===== Charts & Trends ===== */}
      <h2 className="text-lg font-bold text-slate-700 mb-3 mt-8 flex items-center gap-2">
        <FiBarChart2 className="text-indigo-600" /> Charts & Trends
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
        <ChartCard title="📈 Monthly Revenue Trend">
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={revenueTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" />
              <YAxis />
              <RechartsTooltip />
              <Area type="monotone" dataKey="value" stroke="#10B981" fill="#10B981" fillOpacity={0.2} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* ===== NEW: Monthly Sales Bar ===== */}
        <ChartCard title="🛒 Monthly Sales (Bar)">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={revenueTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" />
              <YAxis />
              <RechartsTooltip />
              <Bar dataKey="value" fill="#10B981" radius={[6,6,0,0]} name="Sales" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* ===== NEW: Monthly Purchase Bar ===== */}
        <ChartCard title="🛍️ Monthly Purchases (Bar)">
          {purchasesLoading ? <div className="h-40 bg-slate-200 rounded animate-pulse" /> : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={purchaseTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" />
                <YAxis />
                <RechartsTooltip />
                <Bar dataKey="value" fill="#F59E0B" radius={[6,6,0,0]} name="Purchases" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="📊 Monthly Order Volume">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={ordersTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" />
              <YAxis allowDecimals={false} />
              <RechartsTooltip />
              <Bar dataKey="value" fill="#3B82F6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="💰 Sales vs Purchase Trend">
          {purchasesLoading ? <div className="h-40 bg-slate-200 rounded animate-pulse" /> : purchasesError ? (
            <div className="flex h-40 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-sm text-rose-700">Purchase data unavailable.</div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <ComposedChart data={salesPurchaseTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" />
                <YAxis />
                <RechartsTooltip />
                <Legend />
                <Bar dataKey="Sales" fill="#10B981" radius={[4,4,0,0]} />
                <Bar dataKey="Purchase" fill="#F59E0B" radius={[4,4,0,0]} />
                <Line type="monotone" dataKey="Sales" stroke="#10B981" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Purchase" stroke="#F59E0B" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="💹 Monthly Net Profit">
          {profitLoading ? (
            <div className="h-40 bg-slate-200 rounded animate-pulse" />
          ) : profitError ? (
            <div className="flex h-40 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-sm text-rose-700">
              Profit data unavailable.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={profitData?.monthly_profit || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" />
                <YAxis />
                <RechartsTooltip />
                <Area type="monotone" dataKey="profit" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.2} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="🥧 Order Status Distribution">
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={orderStatusDist} dataKey="value" nameKey="name" outerRadius={80} label>
                {orderStatusDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <RechartsTooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="📍 Employee Status">
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={employeeStatus} dataKey="value" nameKey="name" outerRadius={80} label>
                {employeeStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <RechartsTooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="⚡ Active vs Inactive Employees">
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={activeInactive} dataKey="value" innerRadius={50} outerRadius={80}>
                {activeInactive.map((_, i) => <Cell key={i} fill={i === 0 ? '#10B981' : '#EF4444'} />)}
              </Pie>
              <RechartsTooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* ===== Bihar District Sales ===== */}
        <ChartCard title="📍 District Sales — Bihar">
          {biharDistrictLoading || geoLoading ? (
            <div className="h-80 bg-slate-200 rounded animate-pulse" />
          ) : biharDistrictError ? (
            <div className="flex h-80 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-sm text-rose-700">
              District sales data unavailable.
            </div>
          ) : showMap ? (
            <>
              <ComposableMap
                projection="geoMercator"
                projectionConfig={{
                  scale: 2500,
                  center: [85.5, 25.5],
                }}
                style={{ width: '100%', height: 'auto' }}
              >
                <Geographies geography={geoData}>
                  {({ geographies }: { geographies: any[] }) => {
                    const maxSales = Math.max(
                      ...(biharDistrictSales || []).map((d: any) => d.sales),
                      1
                    );
                    return geographies.map((geo: any) => {
                      const districtName =
                        geo.properties.district ||
                        geo.properties.NAME_2 ||
                        geo.properties.name;
                      const districtData = (biharDistrictSales || []).find(
                        (d: any) => d.district.toLowerCase() === districtName?.toLowerCase()
                      );
                      const sales = districtData?.sales || 0;
                      return (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          data-tooltip-id="bihar-tooltip"
                          data-tooltip-content={`${districtName}: ₹${sales.toLocaleString()}`}
                          style={{
                            default: {
                              fill: getMapColor(sales, maxSales),
                              stroke: '#FFFFFF',
                              strokeWidth: 0.8,
                              outline: 'none',
                            },
                            hover: {
                              fill: '#3B82F6',
                              stroke: '#FFFFFF',
                              strokeWidth: 1.2,
                              outline: 'none',
                              cursor: 'pointer',
                            },
                            pressed: {
                              fill: '#1E40AF',
                              outline: 'none',
                            },
                          }}
                        />
                      );
                    });
                  }}
                </Geographies>
              </ComposableMap>
              <Tooltip id="bihar-tooltip" place="top" style={{ backgroundColor: '#1e293b', color: '#fff' }} />
              <p className="text-xs text-center text-slate-400 mt-2">
                Hover over a district to see sales
              </p>
            </>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                layout="vertical"
                data={(biharDistrictSales || []).slice().sort((a: any, b: any) => b.sales - a.sales)}
                margin={{ left: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="district" width={160} fontSize={11} />
                <RechartsTooltip formatter={(value: any) => `₹${Number(value).toLocaleString()}`} />
                <Bar dataKey="sales" fill="#3B82F6" radius={[4, 4, 4, 4]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}