import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense, memo } from 'react';
import {
  FiTrendingUp, FiShoppingCart, FiDollarSign, FiFileText, FiCreditCard,
  FiAlertTriangle, FiCalendar, FiPrinter, FiDownload, FiRefreshCw,
  FiPackage, FiUser, FiBarChart2, FiSearch, FiFilter, FiX, FiChevronDown,
  FiChevronRight, FiGrid, FiList, FiEye, FiMail, FiShare2, FiCopy, FiBox
} from 'react-icons/fi';
import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import clsx from 'clsx';

// Lazy table
const ModernDataTable = lazy(() => import('../components/ModernDataTable').then(m => ({ default: m.ModernDataTable })));

// ── Stable API cache hook ──
function useApiCache<T>(key: string, fetcher: () => Promise<T>, ttlMs = 300_000) {
  const cache = useRef(new Map<string, { data: T; timestamp: number }>()).current;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  useEffect(() => { fetcherRef.current = fetcher; });

  const fetchData = useCallback(async (skipCache = false) => {
    if (!skipCache) {
      const entry = cache.get(key);
      if (entry && Date.now() - entry.timestamp < ttlMs) { setData(entry.data); setLoading(false); return; }
    }
    setLoading(true); setError(null);
    try {
      const res = await fetcherRef.current();
      const result = Array.isArray(res) ? res : (res as any).data ?? [];
      cache.set(key, { data: result, timestamp: Date.now() });
      setData(result);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }, [key, ttlMs]);

  useEffect(() => { fetchData(); }, [fetchData]);
  return { data, loading, error, refresh: () => fetchData(true) };
}

// ── Common Types ──
interface Order { id: number; order_no: string; customer?: { name: string }; total_amount: number | string; status: string; created_at?: string; }
interface PurchaseInvoice { id: number; purchase_number: string; supplier?: { name: string }; grand_total: number | string; status: string; purchase_date: string; }
interface Payment { id: number; reference_no: string; amount: number | string; payment_method: string; status: string; transaction_date: string; }
interface LedgerEntry { id: number; date: string; description: string; debit: number; credit: number; balance: number; }

// ── Report Categories ──
const REPORT_CATEGORIES = [
  { key: 'dashboard', label: 'Dashboard', icon: <FiGrid size={18} /> },
  { key: 'sales', label: 'Sales', icon: <FiShoppingCart size={18} /> },
  { key: 'purchases', label: 'Purchases', icon: <FiPackage size={18} /> },
  { key: 'inventory', label: 'Inventory', icon: <FiBox size={18} /> },
  { key: 'customers', label: 'Customers', icon: <FiUser size={18} /> },
  { key: 'accounts', label: 'Accounts & Finance', icon: <FiDollarSign size={18} /> },
  { key: 'gst', label: 'GST / Tax', icon: <FiFileText size={18} /> },
  { key: 'expenses', label: 'Expenses', icon: <FiCreditCard size={18} /> },
  { key: 'analysis', label: 'Business Analysis', icon: <FiTrendingUp size={18} /> },
];

const SUB_REPORTS: Record<string, { label: string; icon: JSX.Element }[]> = {
  sales: [
    { label: 'Sales Summary', icon: <FiFileText size={14} /> },
    { label: 'Sales Register', icon: <FiFileText size={14} /> },
    { label: 'Sales by Customer', icon: <FiUser size={14} /> },
    { label: 'Sales by Product', icon: <FiPackage size={14} /> },
    { label: 'GST Sales Report', icon: <FiFileText size={14} /> },
    { label: 'Outstanding Sales', icon: <FiAlertTriangle size={14} /> },
  ],
  purchases: [
    { label: 'Purchase Summary', icon: <FiFileText size={14} /> },
    { label: 'Purchase Register', icon: <FiFileText size={14} /> },
    { label: 'Purchase by Vendor', icon: <FiUser size={14} /> },
    { label: 'GST Purchase Report', icon: <FiFileText size={14} /> },
    { label: 'Outstanding Purchase', icon: <FiAlertTriangle size={14} /> },
  ],
  inventory: [
    { label: 'Stock Summary', icon: <FiPackage size={14} /> },
    { label: 'Current Stock', icon: <FiPackage size={14} /> },
    { label: 'Low Stock Report', icon: <FiAlertTriangle size={14} /> },
    { label: 'Stock Valuation', icon: <FiDollarSign size={14} /> },
  ],
  customers: [
    { label: 'Customer-wise Sales', icon: <FiUser size={14} /> },
    { label: 'Customer Outstanding', icon: <FiAlertTriangle size={14} /> },
    { label: 'Customer Ledger', icon: <FiFileText size={14} /> },
    { label: 'Top Customers', icon: <FiTrendingUp size={14} /> },
  ],
  accounts: [
    { label: 'General Ledger', icon: <FiFileText size={14} /> },
    { label: 'Trial Balance', icon: <FiFileText size={14} /> },
    { label: 'Profit & Loss', icon: <FiTrendingUp size={14} /> },
    { label: 'Balance Sheet', icon: <FiFileText size={14} /> },
    { label: 'Cash Flow', icon: <FiDollarSign size={14} /> },
    { label: 'Outstanding Receivable', icon: <FiAlertTriangle size={14} /> },
  ],
  gst: [
    { label: 'GSTR-1', icon: <FiFileText size={14} /> },
    { label: 'GSTR-3B', icon: <FiFileText size={14} /> },
    { label: 'Input Tax Credit', icon: <FiFileText size={14} /> },
    { label: 'GST Rate-wise Report', icon: <FiFileText size={14} /> },
  ],
  expenses: [
    { label: 'Expense Summary', icon: <FiCreditCard size={14} /> },
    { label: 'Category-wise Expense', icon: <FiFileText size={14} /> },
    { label: 'Vendor-wise Expense', icon: <FiUser size={14} /> },
    { label: 'Expense vs Income', icon: <FiTrendingUp size={14} /> },
  ],
  analysis: [
    { label: 'Sales vs Purchase', icon: <FiTrendingUp size={14} /> },
    { label: 'Profit Analysis', icon: <FiTrendingUp size={14} /> },
    { label: 'Branch Performance', icon: <FiGrid size={14} /> },
    { label: 'Monthly Growth', icon: <FiCalendar size={14} /> },
  ],
};

// ── Main Component ──
export function ReportsPage() {
  const { showSuccess, showError } = useNotification();

  const [activeCategory, setActiveCategory] = useState<string>('dashboard');
  const [activeSubReport, setActiveSubReport] = useState<string>('');

  // Date filters
  const [dateFrom, setDateFrom] = useState(() => new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [financialYear, setFinancialYear] = useState('2025-2026');

  // Additional filters
  const [filterCustomer, setFilterCustomer] = useState('all');
  const [filterVendor, setFilterVendor] = useState('all');
  const [filterProduct, setFilterProduct] = useState('all');
  const [filterBranch, setFilterBranch] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterPaymentMode, setFilterPaymentMode] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  // Column visibility (mock)
  const [showFilters, setShowFilters] = useState(false);

  // Data fetching
  const { data: orders, loading: ordLoading, refresh: refreshOrders } = useApiCache<Order[]>('report-orders', () =>
    apiClient.request('GET', `/orders?from=${dateFrom}&to=${dateTo}`)
  );
  const { data: purchases, loading: purchLoading, refresh: refreshPurchases } = useApiCache<PurchaseInvoice[]>('report-purchases', () =>
    apiClient.request('GET', `/purchase-invoices?from=${dateFrom}&to=${dateTo}`)
  );
  const { data: payments, loading: payLoading, refresh: refreshPayments } = useApiCache<Payment[]>('report-payments', () =>
    apiClient.request('GET', `/payments?from=${dateFrom}&to=${dateTo}`)
  );
  const { data: ledger, loading: ledLoading } = useApiCache<LedgerEntry[]>('report-ledger', () =>
    apiClient.request('GET', `/ledger?from=${dateFrom}&to=${dateTo}`)
  );

  const safeNum = (val: any) => { const n = typeof val === 'number' ? val : parseFloat(val); return isNaN(n) ? 0 : n; };

  // Dashboard summary calculations
  const dashboardSummary = useMemo(() => ({
    totalSales: orders?.reduce((s, o) => s + safeNum(o.total_amount), 0) || 0,
    totalPurchases: purchases?.reduce((s, p) => s + safeNum(p.grand_total), 0) || 0,
    totalReceivables: orders?.filter(o => o.status !== 'delivered').reduce((s, o) => s + safeNum(o.total_amount), 0) || 0,
    totalPayables: purchases?.filter(p => p.status !== 'Completed').reduce((s, p) => s + safeNum(p.grand_total), 0) || 0,
    totalPayments: payments?.reduce((s, p) => s + safeNum(p.amount), 0) || 0,
    profit: (orders?.reduce((s, o) => s + safeNum(o.total_amount), 0) || 0) - (purchases?.reduce((s, p) => s + safeNum(p.grand_total), 0) || 0),
  }), [orders, purchases, payments]);

  // Print handler
  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = () => {
    if (!printRef.current) return;
    const newWin = window.open('', '_blank');
    if (newWin) {
      newWin.document.write(`
        <html><head><title>${activeCategory} Report</title>
        <style>
          body { font-family: Arial; padding: 10mm; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #000; padding: 4px 8px; text-align: left; }
          th { background: #f0f0f0; }
          .hidden-print { display: none; }
        </style></head><body>${printRef.current.innerHTML}</body></html>
      `);
      newWin.document.close();
      setTimeout(() => { newWin.print(); newWin.close(); }, 300);
    }
  };

  // Export CSV (simple)
  const exportCSV = (data: any[], headers: string[], filename: string) => {
    const csv = [headers.join(','), ...data.map(row => headers.map(h => row[h] || '').join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
    showSuccess('Export', 'CSV downloaded.');
  };

  // Coming Soon alert
  const comingSoon = () => showError('Coming Soon', 'This feature is under development.');

  // Refresh all
  const refreshAll = () => {
    refreshOrders(); refreshPurchases(); refreshPayments();
  };

  // ── Render helpers ──
  const Card = ({ title, value, icon, color }: { title: string; value: string | number; icon: JSX.Element; color: string }) => (
    <div className={`${color} rounded-xl p-4 flex items-center gap-3`}>
      <div className="text-2xl opacity-75">{icon}</div>
      <div>
        <p className="text-xs font-medium opacity-80">{title}</p>
        <p className="text-xl font-bold">{value}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 md:p-7 text-slate-800">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 mb-6 rounded-3xl bg-slate-950 px-5 py-6 md:px-8 md:py-7 shadow-xl">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> Reports
          </div>
          <h1 className="text-2xl font-bold text-white md:text-3xl flex items-center gap-3">
            <FiBarChart2 className="text-cyan-300" /> Business Reports
          </h1>
          <p className="text-sm text-slate-300">Centralized reporting hub</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refreshAll} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 hover:bg-white/20">
            <FiRefreshCw className="inline mr-1" size={14} /> Refresh
          </button>
          <button onClick={handlePrint} className="rounded-xl bg-cyan-400 text-slate-950 px-3 py-2 text-sm font-medium hover:bg-cyan-300">
            <FiPrinter className="inline mr-1" size={14} /> Print
          </button>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {REPORT_CATEGORIES.map(cat => (
          <button
            key={cat.key}
            onClick={() => { setActiveCategory(cat.key); setActiveSubReport(''); }}
            className={clsx(
              'px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition',
              activeCategory === cat.key ? 'bg-slate-800 text-white shadow' : 'bg-white text-slate-600 hover:bg-slate-100'
            )}
          >
            {cat.icon} {cat.label}
          </button>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-xl p-4 mb-6 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-600 flex items-center gap-2"><FiFilter size={16} /> Filters</h3>
          <div className="flex gap-2">
            <button onClick={refreshAll} className="text-xs px-3 py-1 rounded-lg bg-blue-500 text-white hover:bg-blue-600">Apply</button>
            <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="text-xs px-3 py-1 rounded-lg border">Reset</button>
            <button onClick={comingSoon} className="text-xs px-3 py-1 rounded-lg border">Save Filter</button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="text-xs font-medium">Date From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full rounded-lg border px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium">Date To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full rounded-lg border px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium">Financial Year</label>
            <select value={financialYear} onChange={e => setFinancialYear(e.target.value)} className="w-full rounded-lg border px-2 py-1 text-sm">
              <option>2025-2026</option><option>2024-2025</option><option>2023-2024</option>
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={comingSoon} className="text-xs text-blue-600 hover:underline">+ Add More Filters</button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {/* Sub‑report navigation */}
        {SUB_REPORTS[activeCategory] && activeCategory !== 'dashboard' && (
          <div className="border-b bg-slate-50 p-4 flex flex-wrap gap-2">
            {SUB_REPORTS[activeCategory].map(sub => (
              <button
                key={sub.label}
                onClick={() => setActiveSubReport(sub.label)}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition',
                  activeSubReport === sub.label ? 'bg-blue-600 text-white' : 'bg-white border text-slate-600 hover:bg-blue-50'
                )}
              >
                {sub.icon} {sub.label}
              </button>
            ))}
          </div>
        )}

        {/* Content Area */}
        <div className="p-6" ref={printRef}>
          {/* ── DASHBOARD ── */}
          {activeCategory === 'dashboard' && (
            <div>
              <h2 className="text-xl font-bold mb-4">Report Dashboard</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <Card title="Total Sales" value={`₹${dashboardSummary.totalSales.toFixed(2)}`} icon={<FiShoppingCart />} color="bg-blue-50 text-blue-700" />
                <Card title="Total Purchases" value={`₹${dashboardSummary.totalPurchases.toFixed(2)}`} icon={<FiPackage />} color="bg-green-50 text-green-700" />
                <Card title="Total Receivables" value={`₹${dashboardSummary.totalReceivables.toFixed(2)}`} icon={<FiAlertTriangle />} color="bg-amber-50 text-amber-700" />
                <Card title="Total Payables" value={`₹${dashboardSummary.totalPayables.toFixed(2)}`} icon={<FiCreditCard />} color="bg-rose-50 text-rose-700" />
                <Card title="Total Payments" value={`₹${dashboardSummary.totalPayments.toFixed(2)}`} icon={<FiDollarSign />} color="bg-purple-50 text-purple-700" />
                <Card title="Net Profit" value={`₹${dashboardSummary.profit.toFixed(2)}`} icon={<FiTrendingUp />} color="bg-teal-50 text-teal-700" />
                <Card title="Stock Value" value="Coming Soon" icon={<FiPackage />} color="bg-slate-50 text-slate-500" />
                <Card title="Cash Balance" value="Coming Soon" icon={<FiDollarSign />} color="bg-slate-50 text-slate-500" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="border rounded-xl p-4 text-center text-slate-500">
                  <FiTrendingUp size={40} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Sales vs Purchase Trend (Coming Soon)</p>
                </div>
                <div className="border rounded-xl p-4 text-center text-slate-500">
                  <FiTrendingUp size={40} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Top Selling Products (Coming Soon)</p>
                </div>
              </div>
            </div>
          )}

          {/* ── SALES ── */}
          {activeCategory === 'sales' && (
            <div>
              {activeSubReport === '' && <p className="text-slate-500 text-sm">Select a sub‑report above.</p>}
              {activeSubReport === 'Sales Summary' && (
                <div>
                  <h2 className="text-lg font-bold mb-4">Sales Summary</h2>
                  <table className="w-full text-sm">
                    <thead><tr className="bg-slate-50"><th className="py-2 px-3 text-left">Order #</th><th className="py-2 px-3 text-left">Customer</th><th className="py-2 px-3 text-right">Amount</th><th className="py-2 px-3 text-left">Date</th></tr></thead>
                    <tbody>
                      {ordLoading ? <tr><td colSpan={4} className="py-4 text-center">Loading...</td></tr> : orders?.map(o => (
                        <tr key={o.id} className="border-b"><td className="py-2 px-3">{o.order_no}</td><td className="py-2 px-3">{o.customer?.name || '-'}</td><td className="py-2 px-3 text-right">₹{safeNum(o.total_amount).toFixed(2)}</td><td className="py-2 px-3">{o.created_at?.slice(0,10)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-4 flex gap-2">
                    <button onClick={() => exportCSV(orders || [], ['order_no', 'customer?.name', 'total_amount', 'created_at'], 'sales-summary.csv')} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-sm"><FiDownload className="inline mr-1" size={14} /> CSV</button>
                    <button onClick={comingSoon} className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-sm">PDF</button>
                    <button onClick={comingSoon} className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-sm">Excel</button>
                  </div>
                </div>
              )}
              {activeSubReport !== 'Sales Summary' && activeSubReport !== '' && (
                <div className="text-center py-16 text-slate-400">
                  <FiFileText size={40} className="mx-auto mb-3 opacity-30" />
                  <p>"{activeSubReport}" – Coming Soon</p>
                </div>
              )}
            </div>
          )}

          {/* ── PURCHASES ── */}
          {activeCategory === 'purchases' && (
            <div>
              {activeSubReport === '' && <p className="text-slate-500 text-sm">Select a sub‑report above.</p>}
              {activeSubReport === 'Purchase Summary' && (
                <div>
                  <h2 className="text-lg font-bold mb-4">Purchase Summary</h2>
                  <table className="w-full text-sm">
                    <thead><tr className="bg-slate-50"><th className="py-2 px-3 text-left">Purchase #</th><th className="py-2 px-3 text-left">Supplier</th><th className="py-2 px-3 text-right">Amount</th><th className="py-2 px-3 text-left">Date</th></tr></thead>
                    <tbody>
                      {purchLoading ? <tr><td colSpan={4} className="py-4 text-center">Loading...</td></tr> : purchases?.map(p => (
                        <tr key={p.id} className="border-b"><td className="py-2 px-3">{p.purchase_number}</td><td className="py-2 px-3">{p.supplier?.name || '-'}</td><td className="py-2 px-3 text-right">₹{safeNum(p.grand_total).toFixed(2)}</td><td className="py-2 px-3">{p.purchase_date}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-4 flex gap-2">
                    <button onClick={() => exportCSV(purchases || [], ['purchase_number', 'supplier?.name', 'grand_total', 'purchase_date'], 'purchase-summary.csv')} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-sm"><FiDownload className="inline mr-1" size={14} /> CSV</button>
                    <button onClick={comingSoon} className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-sm">PDF</button>
                    <button onClick={comingSoon} className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-sm">Excel</button>
                  </div>
                </div>
              )}
              {activeSubReport !== 'Purchase Summary' && activeSubReport !== '' && (
                <div className="text-center py-16 text-slate-400">
                  <FiFileText size={40} className="mx-auto mb-3 opacity-30" />
                  <p>"{activeSubReport}" – Coming Soon</p>
                </div>
              )}
            </div>
          )}

          {/* ── ACCOUNTS ── */}
          {activeCategory === 'accounts' && (
            <div>
              {activeSubReport === '' && <p className="text-slate-500 text-sm">Select a sub‑report above.</p>}
              {activeSubReport === 'General Ledger' && (
                <div>
                  <h2 className="text-lg font-bold mb-4">General Ledger</h2>
                  <table className="w-full text-sm">
                    <thead><tr className="bg-slate-50"><th className="py-2 px-3 text-left">Date</th><th className="py-2 px-3 text-left">Description</th><th className="py-2 px-3 text-right">Debit</th><th className="py-2 px-3 text-right">Credit</th><th className="py-2 px-3 text-right">Balance</th></tr></thead>
                    <tbody>
                      {ledLoading ? <tr><td colSpan={5} className="py-4 text-center">Loading...</td></tr> : ledger?.map(e => (
                        <tr key={e.id} className="border-b"><td className="py-2 px-3">{e.date}</td><td className="py-2 px-3">{e.description}</td><td className="py-2 px-3 text-right">₹{e.debit.toFixed(2)}</td><td className="py-2 px-3 text-right">₹{e.credit.toFixed(2)}</td><td className="py-2 px-3 text-right font-medium">₹{e.balance.toFixed(2)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-4 flex gap-2">
                    <button onClick={() => exportCSV(ledger || [], ['date', 'description', 'debit', 'credit', 'balance'], 'ledger.csv')} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-sm"><FiDownload className="inline mr-1" size={14} /> CSV</button>
                    <button onClick={comingSoon} className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-sm">PDF</button>
                    <button onClick={comingSoon} className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-sm">Excel</button>
                  </div>
                </div>
              )}
              {activeSubReport !== 'General Ledger' && activeSubReport !== '' && (
                <div className="text-center py-16 text-slate-400">
                  <FiFileText size={40} className="mx-auto mb-3 opacity-30" />
                  <p>"{activeSubReport}" – Coming Soon</p>
                </div>
              )}
            </div>
          )}

          {/* ── OTHER CATEGORIES (PLACEHOLDER) ── */}
          {!['dashboard', 'sales', 'purchases', 'accounts'].includes(activeCategory) && (
            <div className="text-center py-16 text-slate-400">
              <FiFileText size={40} className="mx-auto mb-3 opacity-30" />
              <p>"{activeCategory}" reports – Coming Soon</p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .hidden-print { }
        @media print {
          .hidden-print { display: none; }
          body { background: white; }
        }
      `}</style>
    </div>
  );
}