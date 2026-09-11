// src/pages/ReportsPage.tsx

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';

import {
  FiTrendingUp,
  FiShoppingCart,
  FiDollarSign,
  FiFileText,
  FiCreditCard,
  FiAlertTriangle,
  FiPrinter,
  FiDownload,
  FiRefreshCw,
  FiPackage,
  FiUser,
  FiBarChart2,
  FiFilter,
  FiGrid,
  FiChevronDown,
  FiCalendar,
  FiArrowUpRight,
  FiArrowDownRight,
  FiActivity,
  FiCheckCircle,
  FiClock,
  FiXCircle,
  FiSearch,
  FiLayers,
  FiDatabase,
} from 'react-icons/fi';

import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';

import type {
  SalesSummaryReport,
  ProfitLossReport,
  ProfitLossSummaryReport,
  ProductProfitabilityReport,
  InvoiceProfitabilityReport,
  OutstandingSalesReport,
} from '../types/reports';

/* ------------------------------------------------------------------ */
/* Minimal className combiner (replaces the clsx dependency)           */
/* ------------------------------------------------------------------ */

function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface Customer {
  id?: number;
  name?: string;
}

interface Supplier {
  id?: number;
  name?: string;
}

interface Invoice {
  id: number;
  invoice_no: string;
  customer?: Customer;
  total_amount: number | string;
  status: string;
  created_at?: string;
  branch_name?: string;
  company_name?: string;
}

interface PurchaseInvoice {
  id: number;
  purchase_number: string;
  supplier?: Supplier;
  grand_total: number | string;
  status: string;
  purchase_date: string;
  branch_name?: string;
  company_name?: string;
}

interface Payment {
  id: number;
  reference_no: string;
  amount: number | string;
  payment_method: string;
  status: string;
  transaction_date: string;
}

interface LedgerEntry {
  id: number;
  date: string;
  description: string;
  debit: number | string;
  credit: number | string;
  balance: number | string;
}

interface GstReportEntry {
  id: number;
  invoice_no?: string;
  invoice_date?: string;
  customer_name?: string;
  gstin?: string;
  taxable_value?: number | string;
  cgst?: number | string;
  sgst?: number | string;
  igst?: number | string;
  cess?: number | string;
  total_tax?: number | string;
  total_value?: number | string;
  [key: string]: unknown;
}

interface ApiErrorState {
  invoices: string | null;
  purchases: string | null;
  payments: string | null;
  ledger: string | null;
  gstr1: string | null;
}

/* ------------------------------------------------------------------ */
/* Report categories                                                   */
/* ------------------------------------------------------------------ */

const REPORT_CATEGORIES = [
  {
    key: 'dashboard',
    label: 'Overview',
    description: 'Business reporting overview',
    icon: <FiGrid size={17} />,
  },
  {
    key: 'sales',
    label: 'Sales',
    description: 'Sales and receivables',
    icon: <FiShoppingCart size={17} />,
  },
  {
    key: 'purchases',
    label: 'Purchases',
    description: 'Purchases and payables',
    icon: <FiPackage size={17} />,
  },
  {
    key: 'accounts',
    label: 'Accounts',
    description: 'Financial accounting',
    icon: <FiDollarSign size={17} />,
  },
  {
    key: 'gst',
    label: 'GST / Tax',
    description: 'GST reporting',
    icon: <FiFileText size={17} />,
  },
  {
    key: 'expenses',
    label: 'Expenses',
    description: 'Expense analysis',
    icon: <FiCreditCard size={17} />,
  },
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
  accounts: [
    { label: 'General Ledger', icon: <FiFileText size={14} /> },
    { label: 'Trial Balance', icon: <FiFileText size={14} /> },
    { label: 'Profit & Loss', icon: <FiTrendingUp size={14} /> },
    { label: 'Profitability Overview', icon: <FiBarChart2 size={14} /> },
    { label: 'Bill-wise Profitability', icon: <FiFileText size={14} /> },
    { label: 'Product Profitability', icon: <FiPackage size={14} /> },
    { label: 'Customer Profitability', icon: <FiUser size={14} /> },
    { label: 'Branch Profitability', icon: <FiGrid size={14} /> },
    { label: 'Balance Sheet', icon: <FiFileText size={14} /> },
    { label: 'Cash Flow', icon: <FiDollarSign size={14} /> },
    { label: 'Outstanding Receivable', icon: <FiAlertTriangle size={14} /> },
  ],
  gst: [{ label: 'GSTR-1', icon: <FiFileText size={14} /> }],
  expenses: [
    { label: 'Expense Summary', icon: <FiCreditCard size={14} /> },
    { label: 'Category-wise Expense', icon: <FiFileText size={14} /> },
    { label: 'Vendor-wise Expense', icon: <FiUser size={14} /> },
    { label: 'Expense vs Income', icon: <FiTrendingUp size={14} /> },
  ],
};

/* ------------------------------------------------------------------ */
/* API cache hook                                                      */
/* ------------------------------------------------------------------ */

function useApiCache<T>(key: string, fetcher: () => Promise<T>, ttlMs = 300000) {
  const cache = useRef(new Map<string, { data: T; timestamp: number }>()).current;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  const fetchData = useCallback(
    async (skipCache = false) => {
      if (!skipCache) {
        const cached = cache.get(key);
        if (cached && Date.now() - cached.timestamp < ttlMs) {
          setData(cached.data);
          setLoading(false);
          setError(null);
          return;
        }
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetcherRef.current();

        let result: T = response as T;

        if (response && typeof response === 'object') {
          const payload = response as Record<string, unknown>;
          const hasData = 'data' in payload && payload.data !== undefined;
          const hasSummary = 'summary' in payload && payload.summary !== undefined;

          if (hasData && !hasSummary && Array.isArray(payload.data)) {
            result = payload.data as T;
          } else if (
            hasData &&
            !hasSummary &&
            payload.data &&
            typeof payload.data === 'object' &&
            !Array.isArray(payload.data) &&
            !('data' in payload.data) &&
            !('success' in payload.data) &&
            !('meta' in payload.data) &&
            !('summary' in payload.data)
          ) {
            result = payload.data as T;
          }
        }

        cache.set(key, { data: result as T, timestamp: Date.now() });
        setData(result as T);
      } catch (error: unknown) {
        const message =
          (error as { backendMessage?: string })?.backendMessage ||
          (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          (error as Error)?.message ||
          'Unable to load report data.';

        setError(message);
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [cache, key, ttlMs],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refresh: () => fetchData(true),
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const safeNum = (value: unknown): number => {
  const number = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(number) ? number : 0;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value);

const formatNumber = (value: number) => new Intl.NumberFormat('en-IN').format(value);

const formatDate = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

const getToday = () => new Date().toISOString().split('T')[0];

const getFinancialYearStart = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const startYear = month >= 3 ? year : year - 1;
  return `${startYear}-04-01`;
};

const getFinancialYear = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const startYear = month >= 3 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
};

const getCSVValue = (row: Record<string, unknown>, key: string) => {
  const value = key
    .split('.')
    .reduce<unknown>(
      (current, property) =>
        current && typeof current === 'object'
          ? (current as Record<string, unknown>)[property]
          : undefined,
      row,
    );

  if (value === null || value === undefined) return '';

  const text = String(value).replace(/"/g, '""');
  return `"${text}"`;
};

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export function ReportsPage() {
  const { showSuccess, showError } = useNotification();

  const [activeCategory, setActiveCategory] = useState('dashboard');
  const [activeSubReport, setActiveSubReport] = useState('');

  const [dateFrom, setDateFrom] = useState(getFinancialYearStart());
  const [dateTo, setDateTo] = useState(getToday());
  const [financialYear, setFinancialYear] = useState(getFinancialYear());

  const [filterCustomer, setFilterCustomer] = useState('all');
  const [filterVendor, setFilterVendor] = useState('all');
  const [filterProduct, setFilterProduct] = useState('all');
  const [filterBranch, setFilterBranch] = useState('all');
  const [filterCompany, setFilterCompany] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterPaymentMode, setFilterPaymentMode] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState('');

  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [companies, setCompanies] = useState<{ id: number; name: string }[]>([]);

  const printRef = useRef<HTMLDivElement>(null);

  /* -------------------- Filters data -------------------- */

  const fetchBranches = useCallback(async () => {
    try {
      const response = await apiClient.request('GET', '/branches');
      setBranches(
        Array.isArray(response)
          ? response
          : ((response as { data?: { id: number; name: string }[] }).data ?? []),
      );
    } catch {
      /* silent */
    }
  }, []);

  const fetchCompanies = useCallback(async () => {
    try {
      const response = await apiClient.request('GET', '/companies');
      setCompanies(
        Array.isArray(response)
          ? response
          : ((response as { data?: { id: number; name: string }[] }).data ?? []),
      );
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    fetchBranches();
    fetchCompanies();
  }, [fetchBranches, fetchCompanies]);

  /* -------------------- Base fetchers -------------------- */

  const invoicesFetcher = useCallback(
    () =>
      apiClient.request(
        'GET',
        `/invoices?from=${encodeURIComponent(dateFrom)}&to=${encodeURIComponent(dateTo)}`,
      ),
    [dateFrom, dateTo],
  );

  const purchasesFetcher = useCallback(
    () =>
      apiClient.request(
        'GET',
        `/purchase-invoices?from=${encodeURIComponent(dateFrom)}&to=${encodeURIComponent(dateTo)}`,
      ),
    [dateFrom, dateTo],
  );

  const paymentsFetcher = useCallback(
    () =>
      apiClient.request(
        'GET',
        `/payments?from=${encodeURIComponent(dateFrom)}&to=${encodeURIComponent(dateTo)}`,
      ),
    [dateFrom, dateTo],
  );

  const ledgerFetcher = useCallback(
    () =>
      apiClient.request(
        'GET',
        `/accounting/statements?from=${encodeURIComponent(dateFrom)}&to=${encodeURIComponent(dateTo)}`,
      ),
    [dateFrom, dateTo],
  );

  const gstr1Fetcher = useCallback(
    () =>
      apiClient.request(
        'GET',
        `/reports/gst-sales?from=${encodeURIComponent(dateFrom)}&to=${encodeURIComponent(dateTo)}`,
      ),
    [dateFrom, dateTo],
  );

  const {
    data: invoices,
    loading: invLoading,
    error: invError,
    refresh: refreshInvoices,
  } = useApiCache<Invoice[]>(`reports-invoices-${dateFrom}-${dateTo}`, invoicesFetcher);

  const {
    data: purchaseInvoices,
    loading: purchaseLoading,
    error: purchaseError,
    refresh: refreshPurchases,
  } = useApiCache<PurchaseInvoice[]>(`reports-purchases-${dateFrom}-${dateTo}`, purchasesFetcher);

  const {
    data: payments,
    loading: paymentLoading,
    error: paymentError,
    refresh: refreshPayments,
  } = useApiCache<Payment[]>(`reports-payments-${dateFrom}-${dateTo}`, paymentsFetcher);

  const {
    data: ledger,
    loading: ledgerLoading,
    error: ledgerError,
    refresh: refreshLedger,
  } = useApiCache<LedgerEntry[]>(`reports-ledger-${dateFrom}-${dateTo}`, ledgerFetcher);

  const {
    data: gstr1Data,
    loading: gstr1Loading,
    error: gstr1Error,
    refresh: refreshGstr1,
  } = useApiCache<GstReportEntry[]>(`reports-gstr1-${dateFrom}-${dateTo}`, gstr1Fetcher);

  /* -------------------- Advanced fetchers -------------------- */

  const advancedSalesSummaryFetcher = useCallback(
    () =>
      apiClient.getSalesSummary({ from: dateFrom, to: dateTo, page: 1, per_page: 100 }),
    [dateFrom, dateTo],
  );

  const advancedProfitLossFetcher = useCallback(
    () => apiClient.getProfitLossReport({ from: dateFrom, to: dateTo }),
    [dateFrom, dateTo],
  );

  const advancedProfitLossSummaryFetcher = useCallback(
    () => apiClient.getProfitLossSummary({ from: dateFrom, to: dateTo }),
    [dateFrom, dateTo],
  );

  const advancedInvoiceProfitabilityFetcher = useCallback(
    () =>
      apiClient.getInvoiceProfitabilityReport({
        from: dateFrom,
        to: dateTo,
        page: 1,
        per_page: 25,
      }),
    [dateFrom, dateTo],
  );

  const advancedProductProfitabilityFetcher = useCallback(
    () =>
      apiClient.getProductProfitabilityReport({
        from: dateFrom,
        to: dateTo,
        page: 1,
        per_page: 10,
      }),
    [dateFrom, dateTo],
  );

  const advancedCustomerProfitabilityFetcher = useCallback(
    () =>
      apiClient.getProfitLossCustomers({
        from: dateFrom,
        to: dateTo,
        page: 1,
        per_page: 10,
      }),
    [dateFrom, dateTo],
  );

  const advancedBranchProfitabilityFetcher = useCallback(
    () =>
      apiClient.getProfitLossBranches({
        from: dateFrom,
        to: dateTo,
        page: 1,
        per_page: 10,
      }),
    [dateFrom, dateTo],
  );

  const advancedGstSummaryFetcher = useCallback(
    () => apiClient.getGstSummary({ from: dateFrom, to: dateTo }),
    [dateFrom, dateTo],
  );

  const advancedOutstandingSalesFetcher = useCallback(
    () =>
      apiClient.getOutstandingSales({
        from: dateFrom,
        to: dateTo,
        page: 1,
        per_page: 100,
      }),
    [dateFrom, dateTo],
  );

  const advancedSalesRegisterFetcher = useCallback(
    () =>
      apiClient.getSalesRegister({
        from: dateFrom,
        to: dateTo,
        page: 1,
        per_page: 100,
      }),
    [dateFrom, dateTo],
  );

  const advancedSalesByCustomerFetcher = useCallback(
    () =>
      apiClient.getSalesByCustomer({
        from: dateFrom,
        to: dateTo,
        page: 1,
        per_page: 100,
      }),
    [dateFrom, dateTo],
  );

  const advancedSalesByProductFetcher = useCallback(
    () =>
      apiClient.getSalesByProduct({
        from: dateFrom,
        to: dateTo,
        page: 1,
        per_page: 100,
      }),
    [dateFrom, dateTo],
  );

  const advancedPurchaseSummaryFetcher = useCallback(
    () =>
      apiClient.getPurchaseSummary({
        from: dateFrom,
        to: dateTo,
        page: 1,
        per_page: 100,
      }),
    [dateFrom, dateTo],
  );

  const advancedOutstandingPurchasesFetcher = useCallback(
    () =>
      apiClient.getOutstandingPurchases({
        from: dateFrom,
        to: dateTo,
        page: 1,
        per_page: 100,
      }),
    [dateFrom, dateTo],
  );

  const advancedPurchaseRegisterFetcher = useCallback(
    () =>
      apiClient.getPurchaseRegister({
        from: dateFrom,
        to: dateTo,
        page: 1,
        per_page: 100,
      }),
    [dateFrom, dateTo],
  );

  const advancedPurchaseByVendorFetcher = useCallback(
    () =>
      apiClient.getPurchaseByVendor({
        from: dateFrom,
        to: dateTo,
        page: 1,
        per_page: 100,
      }),
    [dateFrom, dateTo],
  );

  const advancedGeneralLedgerFetcher = useCallback(
    () =>
      apiClient.getGeneralLedger({
        from: dateFrom,
        to: dateTo,
        page: 1,
        per_page: 100,
      }),
    [dateFrom, dateTo],
  );

  const { data: advancedSalesSummary, loading: advancedSalesSummaryLoading, error: advancedSalesSummaryError } =
    useApiCache<SalesSummaryReport>(`reports-advanced-sales-${dateFrom}-${dateTo}`, advancedSalesSummaryFetcher);

  const { data: advancedProfitLoss, loading: advancedProfitLossLoading, error: advancedProfitLossError } =
    useApiCache<ProfitLossReport>(`reports-advanced-pl-${dateFrom}-${dateTo}`, advancedProfitLossFetcher);

  const { data: advancedProfitLossSummary, loading: advancedProfitLossSummaryLoading, error: advancedProfitLossSummaryError } =
    useApiCache<ProfitLossSummaryReport>(`reports-advanced-pl-summary-${dateFrom}-${dateTo}`, advancedProfitLossSummaryFetcher);

  const { data: advancedInvoiceProfitability, loading: advancedInvoiceProfitabilityLoading, error: advancedInvoiceProfitabilityError } =
    useApiCache<InvoiceProfitabilityReport>(`reports-advanced-invoice-profitability-${dateFrom}-${dateTo}`, advancedInvoiceProfitabilityFetcher);

  const { data: advancedProductProfitability, loading: advancedProductProfitabilityLoading, error: advancedProductProfitabilityError } =
    useApiCache<ProductProfitabilityReport>(`reports-advanced-product-profitability-${dateFrom}-${dateTo}`, advancedProductProfitabilityFetcher);

  const { data: advancedCustomerProfitability, loading: advancedCustomerProfitabilityLoading, error: advancedCustomerProfitabilityError } =
    useApiCache<{ data?: Record<string, unknown>[] }>(`reports-advanced-customer-profitability-${dateFrom}-${dateTo}`, advancedCustomerProfitabilityFetcher);

  const { data: advancedBranchProfitability, loading: advancedBranchProfitabilityLoading, error: advancedBranchProfitabilityError } =
    useApiCache<{ data?: Record<string, unknown>[] }>(`reports-advanced-branch-profitability-${dateFrom}-${dateTo}`, advancedBranchProfitabilityFetcher);

  const { data: advancedGstSummary, loading: advancedGstSummaryLoading, error: advancedGstSummaryError } =
    useApiCache<Record<string, unknown>>(`reports-advanced-gst-${dateFrom}-${dateTo}`, advancedGstSummaryFetcher);

  const { data: advancedOutstandingSales, loading: advancedOutstandingSalesLoading, error: advancedOutstandingSalesError } =
    useApiCache<OutstandingSalesReport>(`reports-advanced-outstanding-${dateFrom}-${dateTo}`, advancedOutstandingSalesFetcher);

  const { data: advancedSalesRegister, loading: advancedSalesRegisterLoading, error: advancedSalesRegisterError } =
    useApiCache<{ data?: Record<string, unknown>[] }>(`reports-sales-register-${dateFrom}-${dateTo}`, advancedSalesRegisterFetcher);

  const { data: advancedSalesByCustomer, loading: advancedSalesByCustomerLoading, error: advancedSalesByCustomerError } =
    useApiCache<{ data?: Record<string, unknown>[] }>(`reports-sales-by-customer-${dateFrom}-${dateTo}`, advancedSalesByCustomerFetcher);

  const { data: advancedSalesByProduct, loading: advancedSalesByProductLoading, error: advancedSalesByProductError } =
    useApiCache<{ data?: Record<string, unknown>[] }>(`reports-sales-by-product-${dateFrom}-${dateTo}`, advancedSalesByProductFetcher);

  const { data: advancedPurchaseSummary, loading: advancedPurchaseSummaryLoading, error: advancedPurchaseSummaryError } =
    useApiCache<{ data?: Record<string, unknown>[] }>(`reports-purchase-summary-${dateFrom}-${dateTo}`, advancedPurchaseSummaryFetcher);

  const { data: advancedOutstandingPurchases, loading: advancedOutstandingPurchasesLoading, error: advancedOutstandingPurchasesError } =
    useApiCache<{ data?: Record<string, unknown>[] }>(`reports-outstanding-purchases-${dateFrom}-${dateTo}`, advancedOutstandingPurchasesFetcher);

  const { data: advancedPurchaseRegister, loading: advancedPurchaseRegisterLoading, error: advancedPurchaseRegisterError } =
    useApiCache<{ data?: Record<string, unknown>[] }>(`reports-purchase-register-${dateFrom}-${dateTo}`, advancedPurchaseRegisterFetcher);

  const { data: advancedPurchaseByVendor, loading: advancedPurchaseByVendorLoading, error: advancedPurchaseByVendorError } =
    useApiCache<{ data?: Record<string, unknown>[] }>(`reports-purchase-by-vendor-${dateFrom}-${dateTo}`, advancedPurchaseByVendorFetcher);

  const { data: advancedGeneralLedger, loading: advancedGeneralLedgerLoading, error: advancedGeneralLedgerError } =
    useApiCache<{ data?: Record<string, unknown>[] }>(`reports-general-ledger-${dateFrom}-${dateTo}`, advancedGeneralLedgerFetcher);

  // Suppress unused var lint for reported ones we still want around
  void advancedGstSummary;
  void advancedGstSummaryLoading;
  void advancedGstSummaryError;

  /* -------------------- Refresh -------------------- */

  const isRefreshing =
    invLoading ||
    purchaseLoading ||
    paymentLoading ||
    ledgerLoading ||
    gstr1Loading ||
    advancedSalesSummaryLoading ||
    advancedProfitLossLoading ||
    advancedProfitLossSummaryLoading ||
    advancedInvoiceProfitabilityLoading ||
    advancedProductProfitabilityLoading ||
    advancedCustomerProfitabilityLoading ||
    advancedBranchProfitabilityLoading ||
    advancedOutstandingSalesLoading;

  const refreshAll = () => {
    refreshInvoices();
    refreshPurchases();
    refreshPayments();
    refreshLedger();
    refreshGstr1();
  };

  /* -------------------- Summary -------------------- */

  const dashboardSummary = useMemo(() => {
    const sales = invoices?.reduce((sum, item) => sum + safeNum(item.total_amount), 0) ?? 0;

    const purchases =
      purchaseInvoices?.reduce((sum, item) => sum + safeNum(item.grand_total), 0) ?? 0;

    const receivables =
      invoices
        ?.filter((item) => {
          const status = item.status?.toLowerCase();
          return status !== 'paid' && status !== 'cancelled' && status !== 'canceled';
        })
        .reduce((sum, item) => sum + safeNum(item.total_amount), 0) ?? 0;

    const payables =
      purchaseInvoices
        ?.filter((item) => {
          const status = item.status?.toLowerCase();
          return status !== 'paid' && status !== 'cancelled' && status !== 'canceled';
        })
        .reduce((sum, item) => sum + safeNum(item.grand_total), 0) ?? 0;

    const totalPayments =
      payments?.reduce((sum, item) => sum + safeNum(item.amount), 0) ?? 0;

    return {
      sales,
      purchases,
      receivables,
      payables,
      totalPayments,
      profit: sales - purchases,
      invoiceCount: invoices?.length ?? 0,
      purchaseCount: purchaseInvoices?.length ?? 0,
      paymentCount: payments?.length ?? 0,
    };
  }, [invoices, purchaseInvoices, payments]);

  /* -------------------- Filtered data -------------------- */

  const filteredInvoices = useMemo(() => {
    if (!invoices || !Array.isArray(invoices)) return [];

    const query = search.trim().toLowerCase();

    return invoices.filter((invoice) => {
      const matchesSearch =
        !query ||
        invoice.invoice_no?.toLowerCase().includes(query) ||
        invoice.customer?.name?.toLowerCase().includes(query);

      const matchesStatus =
        filterStatus === 'all' ||
        invoice.status?.toLowerCase() === filterStatus.toLowerCase();

      const matchesCustomer =
        filterCustomer === 'all' || invoice.customer?.name === filterCustomer;

      const matchesBranch =
        filterBranch === 'all' || invoice.branch_name === filterBranch;

      const matchesCompany =
        filterCompany === 'all' || invoice.company_name === filterCompany;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesCustomer &&
        matchesBranch &&
        matchesCompany
      );
    });
  }, [invoices, search, filterStatus, filterCustomer, filterBranch, filterCompany]);

  const filteredPurchases = useMemo(() => {
    if (!purchaseInvoices || !Array.isArray(purchaseInvoices)) return [];

    const query = search.trim().toLowerCase();

    return purchaseInvoices.filter((purchase) => {
      const matchesSearch =
        !query ||
        purchase.purchase_number?.toLowerCase().includes(query) ||
        purchase.supplier?.name?.toLowerCase().includes(query);

      const matchesStatus =
        filterStatus === 'all' ||
        purchase.status?.toLowerCase() === filterStatus.toLowerCase();

      const matchesVendor =
        filterVendor === 'all' || purchase.supplier?.name === filterVendor;

      const matchesBranch =
        filterBranch === 'all' || purchase.branch_name === filterBranch;

      const matchesCompany =
        filterCompany === 'all' || purchase.company_name === filterCompany;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesVendor &&
        matchesBranch &&
        matchesCompany
      );
    });
  }, [purchaseInvoices, search, filterStatus, filterVendor, filterBranch, filterCompany]);

  const filteredLedger = useMemo(() => {
    if (!ledger || !Array.isArray(ledger)) return [];
    const query = search.trim().toLowerCase();
    return ledger.filter((entry) => {
      if (!query) return true;
      return (
        entry.description?.toLowerCase().includes(query) ||
        entry.date?.toLowerCase().includes(query)
      );
    });
  }, [ledger, search]);

  const filteredGstr1 = useMemo(() => {
    if (!gstr1Data || !Array.isArray(gstr1Data)) return [];
    const query = search.trim().toLowerCase();
    return gstr1Data.filter((entry) => {
      if (!query) return true;
      return (
        entry.invoice_no?.toLowerCase().includes(query) ||
        entry.customer_name?.toLowerCase().includes(query)
      );
    });
  }, [gstr1Data, search]);

  /* -------------------- Filter options -------------------- */

  const customerOptions = useMemo(() => {
    const values = invoices?.map((invoice) => invoice.customer?.name).filter(Boolean) ?? [];
    return Array.from(new Set(values)) as string[];
  }, [invoices]);

  const vendorOptions = useMemo(() => {
    const values = purchaseInvoices?.map((purchase) => purchase.supplier?.name).filter(Boolean) ?? [];
    return Array.from(new Set(values)) as string[];
  }, [purchaseInvoices]);

  const statusOptions = useMemo(() => {
    const values = [
      ...(invoices ?? []).map((item) => item.status),
      ...(purchaseInvoices ?? []).map((item) => item.status),
    ].filter(Boolean);
    return Array.from(new Set(values));
  }, [invoices, purchaseInvoices]);

  const branchOptions = useMemo(() => branches.map((branch) => branch.name), [branches]);

  const companyOptions = useMemo(() => companies.map((company) => company.name), [companies]);

  /* -------------------- Export / Print -------------------- */

  const exportCSV = (data: Record<string, unknown>[], headers: string[], filename: string) => {
    if (!data.length) {
      showError('Export', 'There is no real API data available to export.');
      return;
    }

    const csv = [
      headers.join(','),
      ...data.map((row) => headers.map((header) => getCSVValue(row, header)).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);

    showSuccess('Export complete', `${filename} downloaded successfully.`);
  };

  const handlePrint = () => {
    if (!printRef.current) {
      showError('Print', 'No report content is available.');
      return;
    }

    const newWindow = window.open('', '_blank', 'width=1200,height=800');
    if (!newWindow) {
      showError('Print', 'Popup blocked. Please allow popups.');
      return;
    }

    newWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Business Report</title>
          <meta charset="UTF-8" />
          <style>
            * { box-sizing: border-box; }
            body { margin: 0; padding: 12mm; background: #fff; color: #111827; font-family: Arial, Helvetica, sans-serif; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #d1d5db; padding: 7px 8px; font-size: 11px; }
            th { background: #f3f4f6; font-weight: 700; }
            .hidden-print { display: none !important; }
            @page { size: A4; margin: 10mm; }
          </style>
        </head>
        <body>${printRef.current.innerHTML}</body>
      </html>
    `);
    newWindow.document.close();
    setTimeout(() => {
      newWindow.print();
      newWindow.close();
    }, 300);
  };

  /* -------------------- Reset -------------------- */

  const resetFilters = () => {
    setDateFrom(getFinancialYearStart());
    setDateTo(getToday());
    setFinancialYear(getFinancialYear());
    setFilterCustomer('all');
    setFilterVendor('all');
    setFilterProduct('all');
    setFilterBranch('all');
    setFilterCompany('all');
    setFilterCategory('all');
    setFilterPaymentMode('all');
    setFilterStatus('all');
    setSearch('');
  };

  /* -------------------- Derived error / count -------------------- */

  const apiErrors: ApiErrorState = {
    invoices: invError,
    purchases: purchaseError,
    payments: paymentError,
    ledger: ledgerError,
    gstr1: gstr1Error,
  };

  const hasApiError = Object.values(apiErrors).some(Boolean);

  const activeFilterCount =
    (search ? 1 : 0) +
    (filterCustomer !== 'all' ? 1 : 0) +
    (filterVendor !== 'all' ? 1 : 0) +
    (filterStatus !== 'all' ? 1 : 0) +
    (filterBranch !== 'all' ? 1 : 0) +
    (filterCompany !== 'all' ? 1 : 0);

  /* -------------------- Category change -------------------- */

  const changeCategory = (category: string) => {
    setActiveCategory(category);
    setActiveSubReport('');
    setSearch('');
  };

  /* -------------------- Render -------------------- */

  return (
    <>
      <style>{`
        .reports-fadeIn { animation: fadeIn 0.2s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <div className="min-h-full bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100/60">
        <div className="mx-auto w-full max-w-[1900px] space-y-5 p-3 sm:p-4 lg:space-y-6 lg:p-6">
          {/* Hero */}
          <section className="relative overflow-hidden rounded-2xl border border-slate-800/10 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-5 py-6 shadow-[0_20px_40px_-20px_rgba(15,23,42,0.45)] sm:px-7 lg:px-8">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />

            <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200 backdrop-blur">
                  <FiBarChart2 size={12} />
                  Reporting · Analytics
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-[32px]">
                  Reports workspace
                </h1>
                <p className="mt-1.5 max-w-2xl text-sm text-slate-300">
                  Sales, purchases, accounts, GST and profitability — powered by live API data.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white backdrop-blur sm:inline-flex">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <FiDatabase size={12} />
                  API connected
                </div>
                <Button
                  variant="outline"
                  onClick={refreshAll}
                  disabled={isRefreshing}
                  className="h-10 rounded-xl border-white/10 bg-white/5 text-white shadow-none backdrop-blur transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                >
                  <FiRefreshCw className={cn('mr-2', isRefreshing && 'animate-spin')} size={14} />
                  Refresh
                </Button>
                <Button
                  variant="outline"
                  onClick={handlePrint}
                  className="h-10 rounded-xl border-white/10 bg-white/5 text-white shadow-none backdrop-blur transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                >
                  <FiPrinter className="mr-2" size={14} />
                  Print
                </Button>
              </div>
            </div>
          </section>

          {/* Category grid */}
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {REPORT_CATEGORIES.map((category) => {
              const active = activeCategory === category.key;
              return (
                <button
                  key={category.key}
                  type="button"
                  onClick={() => changeCategory(category.key)}
                  className={cn(
                    'group relative overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200',
                    active
                      ? 'border-indigo-300 bg-indigo-50/60 ring-1 ring-indigo-500/10'
                      : 'border-slate-200/80 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_8px_24px_-12px_rgba(15,23,42,0.15)]',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p
                        className={cn(
                          'text-[11px] font-semibold uppercase tracking-[0.14em]',
                          active ? 'text-indigo-500' : 'text-slate-400',
                        )}
                      >
                        {category.label}
                      </p>
                      <p className="mt-1.5 truncate text-xs text-slate-500">
                        {category.description}
                      </p>
                    </div>
                    <div
                      className={cn(
                        'grid h-9 w-9 shrink-0 place-items-center rounded-xl transition',
                        active
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-600 group-hover:bg-slate-900 group-hover:text-white',
                      )}
                    >
                      {category.icon}
                    </div>
                  </div>
                </button>
              );
            })}
          </section>

          {/* Filters */}
          <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3.5 sm:px-5">
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-50 text-indigo-600 ring-1 ring-indigo-500/10">
                  <FiFilter size={14} />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-800">
                    Report filters
                  </CardTitle>
                  <CardDescription className="text-[11px] text-slate-500">
                    {activeFilterCount > 0
                      ? `${activeFilterCount} active filter${activeFilterCount > 1 ? 's' : ''}`
                      : 'Select the reporting period and scope'}
                  </CardDescription>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowFilters((v) => !v)}
                  className="h-9 rounded-lg"
                >
                  Advanced
                  <FiChevronDown
                    size={14}
                    className={cn('ml-1.5 transition-transform', showFilters && 'rotate-180')}
                  />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetFilters}
                  className="h-9 rounded-lg text-slate-500 hover:text-slate-800"
                >
                  <FiXCircle className="mr-1.5" size={14} />
                  Reset
                </Button>
              </div>
            </CardHeader>

            <CardContent className="bg-white p-4 sm:p-5">
              <div className="grid gap-3 lg:grid-cols-12">
                <div className="relative lg:col-span-4">
                  <FiSearch
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    size={16}
                  />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search report data…"
                    autoComplete="off"
                    spellCheck={false}
                    className="h-10 rounded-xl border-slate-200 pl-10 shadow-sm focus-visible:ring-4 focus-visible:ring-indigo-500/10"
                  />
                </div>

                <div className="relative lg:col-span-2">
                  <FiCalendar
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    size={14}
                  />
                  <Input
                    type="date"
                    aria-label="Date from"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-10 rounded-xl border-slate-200 pl-9 shadow-sm focus-visible:ring-4 focus-visible:ring-indigo-500/10"
                  />
                </div>

                <div className="relative lg:col-span-2">
                  <FiCalendar
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    size={14}
                  />
                  <Input
                    type="date"
                    aria-label="Date to"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-10 rounded-xl border-slate-200 pl-9 shadow-sm focus-visible:ring-4 focus-visible:ring-indigo-500/10"
                  />
                </div>

                <div className="relative lg:col-span-2">
                  <select
                    aria-label="Financial year"
                    value={financialYear}
                    onChange={(e) => {
                      const value = e.target.value;
                      setFinancialYear(value);
                      const [start] = value.split('-');
                      setDateFrom(`${start}-04-01`);
                      setDateTo(`${Number(start) + 1}-03-31`);
                    }}
                    className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                  >
                    <option value="2026-2027">FY 2026-2027</option>
                    <option value="2025-2026">FY 2025-2026</option>
                    <option value="2024-2025">FY 2024-2025</option>
                    <option value="2023-2024">FY 2023-2024</option>
                  </select>
                  <FiChevronDown
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                    size={14}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 lg:col-span-2 lg:justify-end">
                  <div className="flex items-center rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm">
                    {[
                      { key: '30d', label: '30d' },
                      { key: '90d', label: '90d' },
                      { key: 'fy', label: 'FY' },
                    ].map((preset) => (
                      <button
                        key={preset.key}
                        type="button"
                        onClick={() => {
                          const today = new Date();
                          const to = today.toISOString().slice(0, 10);
                          if (preset.key === '30d') {
                            const d = new Date();
                            d.setDate(d.getDate() - 29);
                            setDateFrom(d.toISOString().slice(0, 10));
                            setDateTo(to);
                          } else if (preset.key === '90d') {
                            const d = new Date();
                            d.setDate(d.getDate() - 89);
                            setDateFrom(d.toISOString().slice(0, 10));
                            setDateTo(to);
                          } else {
                            setDateFrom(getFinancialYearStart());
                            setDateTo(getToday());
                          }
                        }}
                        className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {showFilters && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      {
                        label: 'Customer',
                        value: filterCustomer,
                        setter: setFilterCustomer,
                        options: customerOptions,
                        allLabel: 'All customers',
                      },
                      {
                        label: 'Vendor',
                        value: filterVendor,
                        setter: setFilterVendor,
                        options: vendorOptions,
                        allLabel: 'All vendors',
                      },
                      {
                        label: 'Status',
                        value: filterStatus,
                        setter: setFilterStatus,
                        options: statusOptions,
                        allLabel: 'All statuses',
                      },
                      {
                        label: 'Branch',
                        value: filterBranch,
                        setter: setFilterBranch,
                        options: branchOptions,
                        allLabel: 'All branches',
                      },
                      {
                        label: 'Company',
                        value: filterCompany,
                        setter: setFilterCompany,
                        options: companyOptions,
                        allLabel: 'All companies',
                      },
                    ].map((f) => (
                      <div key={f.label}>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          {f.label}
                        </label>
                        <div className="relative">
                          <select
                            value={f.value}
                            onChange={(e) => f.setter(e.target.value)}
                            className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                          >
                            <option value="all">{f.allLabel}</option>
                            {f.options.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                          <FiChevronDown
                            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                            size={14}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200/70 bg-amber-50/60 p-3 text-xs text-amber-800">
                    <FiAlertTriangle className="mt-0.5 shrink-0" size={14} />
                    <span className="break-words">
                      Customer, vendor, branch, and company filters use values returned by the
                      current APIs for the selected reporting period.
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* API error banner */}
          {hasApiError && (
            <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-800 shadow-sm">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rose-100 text-rose-600">
                <FiAlertTriangle size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Some report APIs could not be loaded</p>
                <div className="mt-1 space-y-0.5 text-xs text-rose-700/90">
                  {invError && <p>Sales: {invError}</p>}
                  {purchaseError && <p>Purchases: {purchaseError}</p>}
                  {paymentError && <p>Payments: {paymentError}</p>}
                  {ledgerError && <p>Ledger: {ledgerError}</p>}
                  {gstr1Error && <p>GST sales: {gstr1Error}</p>}
                </div>
              </div>
            </div>
          )}

          {/* Report surface */}
          <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            {SUB_REPORTS[activeCategory] && (
              <div className="border-b border-slate-100 bg-slate-50/70 px-3 py-3 sm:px-4">
                <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                  {SUB_REPORTS[activeCategory].map((report) => {
                    const active = activeSubReport === report.label;
                    return (
                      <button
                        key={report.label}
                        type="button"
                        onClick={() => setActiveSubReport(report.label)}
                        className={cn(
                          'inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition',
                          active
                            ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                        )}
                      >
                        {report.icon}
                        {report.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <CardContent className="bg-white p-4 sm:p-6">
              <div ref={printRef}>
                {activeCategory === 'dashboard' && (
                  <DashboardReport
                    summary={dashboardSummary}
                    invoices={invoices}
                    purchases={purchaseInvoices}
                    payments={payments}
                    loading={isRefreshing}
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                  />
                )}

                {activeCategory === 'sales' && (
                  <>
                    {!activeSubReport && (
                      <EmptyReport
                        title="Sales reports"
                        description="Select a sales report from the navigation above."
                        icon={<FiShoppingCart size={22} />}
                      />
                    )}
                    {activeSubReport === 'Sales Summary' && (
                      <SalesSummaryApiReport
                        data={advancedSalesSummary}
                        loading={advancedSalesSummaryLoading}
                        error={advancedSalesSummaryError}
                      />
                    )}
                    {activeSubReport === 'Sales Register' && (
                      <SalesRegisterApiTable
                        data={advancedSalesRegister}
                        loading={advancedSalesRegisterLoading}
                        error={advancedSalesRegisterError}
                      />
                    )}
                    {activeSubReport === 'Sales by Customer' && (
                      <SalesByCustomerApiTable
                        data={advancedSalesByCustomer}
                        loading={advancedSalesByCustomerLoading}
                        error={advancedSalesByCustomerError}
                      />
                    )}
                    {activeSubReport === 'Sales by Product' && (
                      <SalesByProductApiTable
                        data={advancedSalesByProduct}
                        loading={advancedSalesByProductLoading}
                        error={advancedSalesByProductError}
                      />
                    )}
                    {activeSubReport === 'Outstanding Sales' && (
                      <OutstandingSalesApiTable
                        data={advancedOutstandingSales}
                        loading={advancedOutstandingSalesLoading}
                        error={advancedOutstandingSalesError}
                      />
                    )}
                    {activeSubReport === 'GST Sales Report' && (
                      <GstReportTable
                        title="GST Sales Report"
                        description="Outward supplies (sales) returns"
                        data={filteredGstr1}
                        loading={gstr1Loading}
                        onCSV={() =>
                          exportCSV(
                            filteredGstr1 as unknown as Record<string, unknown>[],
                            [
                              'invoice_no',
                              'invoice_date',
                              'customer_name',
                              'gstin',
                              'taxable_value',
                              'cgst',
                              'sgst',
                              'igst',
                              'cess',
                              'total_tax',
                              'total_value',
                            ],
                            'gst-sales.csv',
                          )
                        }
                      />
                    )}
                  </>
                )}

                {activeCategory === 'purchases' && (
                  <>
                    {!activeSubReport && (
                      <EmptyReport
                        title="Purchase reports"
                        description="Select a purchase report from the navigation above."
                        icon={<FiPackage size={22} />}
                      />
                    )}
                    {activeSubReport === 'Purchase Summary' && (
                      <PurchaseSummaryApiTable
                        data={advancedPurchaseSummary}
                        loading={advancedPurchaseSummaryLoading}
                        error={advancedPurchaseSummaryError}
                      />
                    )}
                    {activeSubReport === 'Purchase Register' && (
                      <PurchaseRegisterApiTable
                        data={advancedPurchaseRegister}
                        loading={advancedPurchaseRegisterLoading}
                        error={advancedPurchaseRegisterError}
                      />
                    )}
                    {activeSubReport === 'Purchase by Vendor' && (
                      <PurchaseByVendorApiTable
                        data={advancedPurchaseByVendor}
                        loading={advancedPurchaseByVendorLoading}
                        error={advancedPurchaseByVendorError}
                      />
                    )}
                    {activeSubReport === 'Outstanding Purchase' && (
                      <OutstandingPurchasesApiTable
                        data={advancedOutstandingPurchases}
                        loading={advancedOutstandingPurchasesLoading}
                        error={advancedOutstandingPurchasesError}
                      />
                    )}
                  </>
                )}

                {activeCategory === 'accounts' && (
                  <>
                    {!activeSubReport && (
                      <EmptyReport
                        title="Accounts & finance"
                        description="Select a financial report from the navigation above."
                        icon={<FiDollarSign size={22} />}
                      />
                    )}
                    {activeSubReport === 'General Ledger' && (
                      <GeneralLedgerApiTable
                        data={advancedGeneralLedger}
                        loading={advancedGeneralLedgerLoading}
                        error={advancedGeneralLedgerError}
                      />
                    )}
                    {activeSubReport === 'Profit & Loss' && (
                      <ProfitLossStatement
                        data={advancedProfitLossSummary || advancedProfitLoss}
                        loading={advancedProfitLossSummaryLoading || advancedProfitLossLoading}
                        error={advancedProfitLossSummaryError || advancedProfitLossError}
                        onRefresh={() => {}}
                      />
                    )}
                    {activeSubReport === 'Profitability Overview' && (
                      <ProfitabilityOverviewPanel
                        data={advancedProfitLossSummary}
                        loading={advancedProfitLossSummaryLoading}
                        error={advancedProfitLossSummaryError}
                      />
                    )}
                    {activeSubReport === 'Bill-wise Profitability' && (
                      <InvoiceProfitabilityTable
                        data={advancedInvoiceProfitability}
                        loading={advancedInvoiceProfitabilityLoading}
                        error={advancedInvoiceProfitabilityError}
                      />
                    )}
                    {activeSubReport === 'Product Profitability' && (
                      <ProductProfitabilityTable
                        data={advancedProductProfitability}
                        loading={advancedProductProfitabilityLoading}
                        error={advancedProductProfitabilityError}
                      />
                    )}
                    {activeSubReport === 'Customer Profitability' && (
                      <DimensionProfitabilityTable
                        title="Customer Profitability"
                        data={advancedCustomerProfitability?.data ?? []}
                        loading={advancedCustomerProfitabilityLoading}
                        error={advancedCustomerProfitabilityError}
                        valueKey="gross_profit"
                        labelKey="customer"
                      />
                    )}
                    {activeSubReport === 'Branch Profitability' && (
                      <DimensionProfitabilityTable
                        title="Branch Profitability"
                        data={advancedBranchProfitability?.data ?? []}
                        loading={advancedBranchProfitabilityLoading}
                        error={advancedBranchProfitabilityError}
                        valueKey="gross_profit"
                        labelKey="branch"
                      />
                    )}
                  </>
                )}

                {activeCategory === 'gst' && (
                  <>
                    {!activeSubReport && (
                      <EmptyReport
                        title="GST / Tax reports"
                        description="Select a GST report from the navigation above."
                        icon={<FiFileText size={22} />}
                      />
                    )}
                    {activeSubReport === 'GSTR-1' && (
                      <GstReportTable
                        title="GSTR-1"
                        description="Outward supplies (sales) returns"
                        data={filteredGstr1}
                        loading={gstr1Loading}
                        onCSV={() =>
                          exportCSV(
                            filteredGstr1 as unknown as Record<string, unknown>[],
                            [
                              'invoice_no',
                              'invoice_date',
                              'customer_name',
                              'gstin',
                              'taxable_value',
                              'cgst',
                              'sgst',
                              'igst',
                              'cess',
                              'total_tax',
                              'total_value',
                            ],
                            'gstr-1.csv',
                          )
                        }
                      />
                    )}
                  </>
                )}

                {activeCategory === 'expenses' && (
                  <>
                    {!activeSubReport && (
                      <EmptyReport
                        title="Expense reports"
                        description="Select an expense report from the navigation above."
                        icon={<FiCreditCard size={22} />}
                      />
                    )}
                    {activeSubReport && <ComingSoonReport title={activeSubReport} />}
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <footer className="flex flex-col gap-2 px-1 text-[11px] text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <span>Business reports · Live API data</span>
            <span className="inline-flex items-center gap-1">
              <FiActivity size={12} />
              {isRefreshing ? 'Refreshing…' : 'Up to date'}
            </span>
          </footer>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Dashboard report                                                    */
/* ------------------------------------------------------------------ */

function DashboardReport({
  summary,
  invoices,
  purchases,
  payments,
  loading,
  dateFrom,
  dateTo,
}: {
  summary: {
    sales: number;
    purchases: number;
    receivables: number;
    payables: number;
    totalPayments: number;
    profit: number;
    invoiceCount: number;
    purchaseCount: number;
    paymentCount: number;
  };
  invoices: Invoice[] | null;
  purchases: PurchaseInvoice[] | null;
  payments: Payment[] | null;
  loading: boolean;
  dateFrom: string;
  dateTo: string;
}) {
  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-600">
            <FiActivity size={14} />
            Business overview
          </div>
          <h2 className="text-2xl font-black tracking-tight text-slate-950">Financial snapshot</h2>
          <p className="mt-1 text-sm text-slate-500">
            {dateFrom || 'All dates'} — {dateTo || 'All dates'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          <FiDatabase className="mr-1 inline" size={13} />
          Values calculated only from loaded API records
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ReportStatCard
          title="Total Sales"
          value={formatCurrency(summary.sales)}
          count={`${formatNumber(summary.invoiceCount)} invoices`}
          icon={<FiShoppingCart />}
          tone="cyan"
          loading={loading}
        />
        <ReportStatCard
          title="Total Purchases"
          value={formatCurrency(summary.purchases)}
          count={`${formatNumber(summary.purchaseCount)} purchases`}
          icon={<FiPackage />}
          tone="blue"
          loading={loading}
        />
        <ReportStatCard
          title="Receivables"
          value={formatCurrency(summary.receivables)}
          count="Unpaid sales"
          icon={<FiArrowDownRight />}
          tone="amber"
          loading={loading}
        />
        <ReportStatCard
          title="Payables"
          value={formatCurrency(summary.payables)}
          count="Unpaid purchases"
          icon={<FiArrowUpRight />}
          tone="rose"
          loading={loading}
        />
        <ReportStatCard
          title="Payments"
          value={formatCurrency(summary.totalPayments)}
          count={`${formatNumber(summary.paymentCount)} payments`}
          icon={<FiDollarSign />}
          tone="violet"
          loading={loading}
        />
        <ReportStatCard
          title="Net Difference"
          value={formatCurrency(summary.profit)}
          count="Sales minus purchases"
          icon={<FiTrendingUp />}
          tone={summary.profit >= 0 ? 'emerald' : 'rose'}
          loading={loading}
        />
        <ReportStatCard
          title="Stock Value"
          value="Not available"
          count="No stock API connected"
          icon={<FiPackage />}
          tone="slate"
          loading={false}
        />
        <ReportStatCard
          title="Cash Balance"
          value="Not available"
          count="No cash-balance API connected"
          icon={<FiDollarSign />}
          tone="slate"
          loading={false}
        />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Sales vs Purchases</h3>
              <p className="mt-1 text-xs text-slate-500">Based on actual API totals</p>
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-50 text-cyan-600">
              <FiTrendingUp size={16} />
            </div>
          </div>
          <ComparisonBar
            label="Sales"
            value={summary.sales}
            max={Math.max(summary.sales, summary.purchases, 1)}
            tone="cyan"
          />
          <ComparisonBar
            label="Purchases"
            value={summary.purchases}
            max={Math.max(summary.sales, summary.purchases, 1)}
            tone="blue"
          />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Receivables vs Payables</h3>
              <p className="mt-1 text-xs text-slate-500">Current outstanding API records</p>
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-50 text-amber-600">
              <FiCreditCard size={16} />
            </div>
          </div>
          <ComparisonBar
            label="Receivables"
            value={summary.receivables}
            max={Math.max(summary.receivables, summary.payables, 1)}
            tone="amber"
          />
          <ComparisonBar
            label="Payables"
            value={summary.payables}
            max={Math.max(summary.receivables, summary.payables, 1)}
            tone="rose"
          />
        </div>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <RecentInvoices invoices={invoices} />
        <RecentPurchases purchases={purchases} />
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-slate-600 shadow-sm">
            <FiCreditCard size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Payment data</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {payments
                ? `${formatNumber(payments.length)} payment records were returned by the payments API for this period.`
                : 'Payment API data is currently unavailable.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* GST report table                                                    */
/* ------------------------------------------------------------------ */

function GstReportTable({
  title,
  description,
  data,
  loading,
  onCSV,
}: {
  title: string;
  description?: string;
  data: GstReportEntry[];
  loading: boolean;
  onCSV: () => void;
}) {
  const totalTaxable = data.reduce((sum, entry) => sum + safeNum(entry.taxable_value), 0);
  const totalCgst = data.reduce((sum, entry) => sum + safeNum(entry.cgst), 0);
  const totalSgst = data.reduce((sum, entry) => sum + safeNum(entry.sgst), 0);
  const totalIgst = data.reduce((sum, entry) => sum + safeNum(entry.igst), 0);
  const totalCess = data.reduce((sum, entry) => sum + safeNum(entry.cess), 0);
  const totalTax = data.reduce((sum, entry) => sum + safeNum(entry.total_tax), 0);
  const totalValue = data.reduce((sum, entry) => sum + safeNum(entry.total_value), 0);

  return (
    <ReportSection title={title} description={description} count={data.length}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <TableHeader>Invoice No.</TableHeader>
              <TableHeader>Date</TableHeader>
              <TableHeader>Party Name</TableHeader>
              <TableHeader>GSTIN</TableHeader>
              <TableHeader align="right">Taxable Value</TableHeader>
              <TableHeader align="right">CGST</TableHeader>
              <TableHeader align="right">SGST</TableHeader>
              <TableHeader align="right">IGST</TableHeader>
              <TableHeader align="right">Cess</TableHeader>
              <TableHeader align="right">Total Tax</TableHeader>
              <TableHeader align="right">Total Value</TableHeader>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <LoadingRow colSpan={11} />
            ) : !data.length ? (
              <EmptyRow colSpan={11} />
            ) : (
              data.map((entry, index) => (
                <tr
                  key={`${entry.invoice_no || 'gst'}-${entry.invoice_date || 'date'}-${index}`}
                  className="border-b border-slate-100 transition hover:bg-slate-50"
                >
                  <td className="px-4 py-3.5 font-bold text-slate-900">{entry.invoice_no || '-'}</td>
                  <td className="px-4 py-3.5 text-slate-500">{formatDate(entry.invoice_date)}</td>
                  <td className="px-4 py-3.5 text-slate-600">{entry.customer_name || '-'}</td>
                  <td className="px-4 py-3.5 text-slate-600">{entry.gstin || '-'}</td>
                  <td className="px-4 py-3.5 text-right font-medium text-slate-900">
                    {formatCurrency(safeNum(entry.taxable_value))}
                  </td>
                  <td className="px-4 py-3.5 text-right text-slate-600">
                    {formatCurrency(safeNum(entry.cgst))}
                  </td>
                  <td className="px-4 py-3.5 text-right text-slate-600">
                    {formatCurrency(safeNum(entry.sgst))}
                  </td>
                  <td className="px-4 py-3.5 text-right text-slate-600">
                    {formatCurrency(safeNum(entry.igst))}
                  </td>
                  <td className="px-4 py-3.5 text-right text-slate-600">
                    {formatCurrency(safeNum(entry.cess))}
                  </td>
                  <td className="px-4 py-3.5 text-right font-bold text-slate-900">
                    {formatCurrency(safeNum(entry.total_tax))}
                  </td>
                  <td className="px-4 py-3.5 text-right font-bold text-slate-900">
                    {formatCurrency(safeNum(entry.total_value))}
                  </td>
                </tr>
              ))
            )}
            {!loading && data.length > 0 && (
              <tr className="bg-slate-50 font-bold">
                <td colSpan={4} className="px-4 py-3 text-right text-slate-700">
                  Totals
                </td>
                <td className="px-4 py-3 text-right text-slate-900">{formatCurrency(totalTaxable)}</td>
                <td className="px-4 py-3 text-right text-slate-900">{formatCurrency(totalCgst)}</td>
                <td className="px-4 py-3 text-right text-slate-900">{formatCurrency(totalSgst)}</td>
                <td className="px-4 py-3 text-right text-slate-900">{formatCurrency(totalIgst)}</td>
                <td className="px-4 py-3 text-right text-slate-900">{formatCurrency(totalCess)}</td>
                <td className="px-4 py-3 text-right text-slate-900">{formatCurrency(totalTax)}</td>
                <td className="px-4 py-3 text-right text-slate-900">{formatCurrency(totalValue)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <ExportButtons onCSV={onCSV} onPrint={() => window.print()} />
    </ReportSection>
  );
}

/* ------------------------------------------------------------------ */
/* Stat card                                                           */
/* ------------------------------------------------------------------ */

function ReportStatCard({
  title,
  value,
  count,
  icon,
  tone,
  loading,
}: {
  title: string;
  value: string;
  count: string;
  icon: React.ReactNode;
  tone: 'cyan' | 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'slate';
  loading: boolean;
}) {
  const tones = {
    cyan: { icon: 'bg-cyan-50 text-cyan-600', line: 'bg-cyan-500' },
    blue: { icon: 'bg-blue-50 text-blue-600', line: 'bg-blue-500' },
    emerald: { icon: 'bg-emerald-50 text-emerald-600', line: 'bg-emerald-500' },
    amber: { icon: 'bg-amber-50 text-amber-600', line: 'bg-amber-500' },
    rose: { icon: 'bg-rose-50 text-rose-600', line: 'bg-rose-500' },
    violet: { icon: 'bg-violet-50 text-violet-600', line: 'bg-violet-500' },
    slate: { icon: 'bg-slate-100 text-slate-600', line: 'bg-slate-400' },
  };

  const current = tones[tone];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className={cn('absolute bottom-0 left-0 h-0.5 w-full', current.line)} />
      <div className="flex items-start justify-between gap-3">
        <div className={cn('grid h-11 w-11 place-items-center rounded-xl', current.icon)}>
          {icon}
        </div>
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

/* ------------------------------------------------------------------ */
/* Comparison bar                                                      */
/* ------------------------------------------------------------------ */

function ComparisonBar({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone: 'cyan' | 'blue' | 'amber' | 'rose';
}) {
  const width = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const classes = {
    cyan: 'bg-cyan-500',
    blue: 'bg-blue-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
  };

  return (
    <div className="mb-5 last:mb-0">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-600">{label}</span>
        <span className="text-xs font-bold text-slate-900">{formatCurrency(value)}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn('h-full rounded-full transition-all duration-500', classes[tone])}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Recent invoices                                                     */
/* ------------------------------------------------------------------ */

function RecentInvoices({ invoices }: { invoices: Invoice[] | null }) {
  const rows =
    invoices
      ?.slice()
      .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
      .slice(0, 5) ?? [];

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Recent sales</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">Latest invoices returned by API</p>
        </div>
        <FiShoppingCart size={17} className="text-cyan-600" />
      </div>
      <div className="divide-y divide-slate-100">
        {!rows.length ? (
          <EmptyList />
        ) : (
          rows.map((invoice) => (
            <div key={invoice.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-slate-800">{invoice.invoice_no}</p>
                <p className="mt-0.5 truncate text-[11px] text-slate-500">
                  {invoice.customer?.name || 'Customer not provided'}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs font-bold text-slate-900">
                  {formatCurrency(safeNum(invoice.total_amount))}
                </p>
                <StatusBadge status={invoice.status} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Recent purchases                                                    */
/* ------------------------------------------------------------------ */

function RecentPurchases({ purchases }: { purchases: PurchaseInvoice[] | null }) {
  const rows =
    purchases
      ?.slice()
      .sort((a, b) => String(b.purchase_date ?? '').localeCompare(String(a.purchase_date ?? '')))
      .slice(0, 5) ?? [];

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Recent purchases</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">Latest purchase records returned by API</p>
        </div>
        <FiPackage size={17} className="text-blue-600" />
      </div>
      <div className="divide-y divide-slate-100">
        {!rows.length ? (
          <EmptyList />
        ) : (
          rows.map((purchase) => (
            <div key={purchase.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-slate-800">
                  {purchase.purchase_number}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-slate-500">
                  {purchase.supplier?.name || 'Supplier not provided'}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs font-bold text-slate-900">
                  {formatCurrency(safeNum(purchase.grand_total))}
                </p>
                <StatusBadge status={purchase.status} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Report section                                                      */
/* ------------------------------------------------------------------ */

function ReportSection({
  title,
  description,
  count,
  children,
}: {
  title: string;
  description?: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black tracking-tight text-slate-950">{title}</h2>
            {typeof count === 'number' && (
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">
                {formatNumber(count)} records
              </span>
            )}
          </div>
          {description && (
            <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
          )}
        </div>
        <div className="inline-flex items-center gap-1.5 self-start rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 sm:self-auto">
          <FiCheckCircle size={12} />
          API Data
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {children}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Export buttons                                                      */
/* ------------------------------------------------------------------ */

function ExportButtons({ onCSV, onPrint }: { onCSV: () => void; onPrint: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 p-4">
      <p className="text-[11px] text-slate-400">Exporting current API-loaded records</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCSV}
          className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-cyan-700"
        >
          <FiDownload size={13} />
          CSV
        </button>
        <button
          type="button"
          onClick={onPrint}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
        >
          <FiPrinter size={13} />
          Print
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Table header                                                        */
/* ------------------------------------------------------------------ */

function TableHeader({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <th
      className={cn(
        'px-4 py-3 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500',
        align === 'right' ? 'text-right' : 'text-left',
      )}
    >
      {children}
    </th>
  );
}

/* ------------------------------------------------------------------ */
/* Status badge                                                        */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status?: string }) {
  const normalized = status?.toLowerCase() ?? '';
  let classes = 'border-slate-200 bg-slate-50 text-slate-600';
  let Icon = FiClock;

  if (['completed', 'delivered', 'paid', 'success', 'successful'].includes(normalized)) {
    classes = 'border-emerald-200 bg-emerald-50 text-emerald-700';
    Icon = FiCheckCircle;
  } else if (['pending', 'processing', 'partial', 'unpaid'].includes(normalized)) {
    classes = 'border-amber-200 bg-amber-50 text-amber-700';
    Icon = FiClock;
  } else if (['cancelled', 'canceled', 'failed'].includes(normalized)) {
    classes = 'border-rose-200 bg-rose-50 text-rose-700';
    Icon = FiXCircle;
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide',
        classes,
      )}
    >
      <Icon size={10} />
      {status || 'Unknown'}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Loading row                                                         */
/* ------------------------------------------------------------------ */

function LoadingRow({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-16 text-center">
        <div className="inline-flex flex-col items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-50 text-cyan-600">
            <FiRefreshCw size={17} className="animate-spin" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">Loading report data</p>
            <p className="mt-1 text-xs text-slate-400">Waiting for the backend API response...</p>
          </div>
        </div>
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ */
/* Empty row                                                           */
/* ------------------------------------------------------------------ */

function EmptyRow({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-16 text-center">
        <div className="mx-auto flex max-w-sm flex-col items-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
            <FiDatabase size={20} />
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-700">No API records found</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            No records were returned for the selected reporting period or filters.
          </p>
        </div>
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ */
/* Empty list                                                          */
/* ------------------------------------------------------------------ */

function EmptyList() {
  return (
    <div className="px-5 py-10 text-center">
      <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-400">
        <FiFileText size={17} />
      </div>
      <p className="mt-2 text-xs font-semibold text-slate-600">No API records</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Empty report                                                        */
/* ------------------------------------------------------------------ */

function EmptyReport({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[440px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-5 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl border border-slate-200 bg-white text-cyan-600 shadow-sm">
        {icon}
      </div>
      <h3 className="mt-5 text-lg font-black text-slate-800">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{description}</p>
      <div className="mt-5 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500">
        <FiLayers size={13} />
        Choose a report above
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Profit & loss                                                       */
/* ------------------------------------------------------------------ */

function ProfitLossStatement({
  data,
  loading,
  error,
  onRefresh,
}: {
  data: ProfitLossReport | ProfitLossSummaryReport | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  if (error) {
    return (
      <div className="flex min-h-[440px] flex-col items-center justify-center rounded-2xl border border-dashed border-rose-200 bg-rose-50/40 px-5 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-2xl border border-rose-100 bg-white text-rose-500 shadow-sm">
          <FiAlertTriangle size={24} />
        </div>
        <h3 className="mt-5 text-lg font-black text-slate-800">Unable to load report</h3>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{error}</p>
        <button
          onClick={onRefresh}
          className="mt-5 rounded-lg bg-rose-100 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-200"
        >
          Retry
        </button>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="flex min-h-[440px] items-center justify-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-600">
          <div className="h-2 w-2 animate-pulse rounded-full bg-slate-400" />
          Loading profit & loss...
        </div>
      </div>
    );
  }

  const payload = (data as { data?: unknown })?.data ?? data;
  const isDetailed =
    payload &&
    typeof payload === 'object' &&
    'revenue' in payload &&
    (payload as { revenue?: unknown }).revenue &&
    typeof (payload as { revenue: unknown }).revenue === 'object';

  const formatCurr = (val: number) => formatCurrency(val);
  const formatPct = (val: number) => `${Number(val || 0).toFixed(2)}%`;

  if (!isDetailed) {
    const summary =
      payload && typeof payload === 'object'
        ? (payload as {
            gross_revenue?: number;
            cogs?: number;
            gross_profit?: number;
            net_profit?: number;
            net_revenue?: number;
            gross_margin?: number;
            operating_profit?: number;
            net_margin?: number;
            contribution_margin?: number;
          })
        : null;

    if (!summary) {
      return (
        <div className="flex min-h-[440px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-5 text-center">
          <div className="text-sm text-slate-500">
            No P&amp;L summary data is available for the selected range.
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <KpiCard label="Gross Revenue" value={formatCurr(Number(summary.gross_revenue || 0))} />
          <KpiCard label="COGS" value={formatCurr(Number(summary.cogs || 0))} />
          <KpiCard label="Gross Profit" value={formatCurr(Number(summary.gross_profit || 0))} />
          <KpiCard label="Net Profit" value={formatCurr(Number(summary.net_profit || 0))} highlight />
        </div>

        <ReportSection
          title="Profitability Summary"
          description="Real API summary data for the selected period"
        >
          <div className="space-y-3 p-6">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Net Revenue</span>
              <span className="font-semibold">{formatCurr(Number(summary.net_revenue || 0))}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Gross Margin</span>
              <span className="font-semibold">{formatPct(Number(summary.gross_margin || 0))}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Operating Profit</span>
              <span className="font-semibold">
                {formatCurr(Number(summary.operating_profit || 0))}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Net Margin</span>
              <span className="font-semibold">{formatPct(Number(summary.net_margin || 0))}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Contribution Margin</span>
              <span className="font-semibold">
                {formatCurr(Number(summary.contribution_margin || 0))}
              </span>
            </div>
          </div>
        </ReportSection>
      </div>
    );
  }

  const pl = payload as {
    revenue: {
      gross_sales: number;
      sales_returns: number;
      sales_discounts: number;
      net_sales: number;
    };
    cogs: {
      opening_stock: number;
      purchases: number;
      purchase_returns: number;
      closing_stock: number;
      cost_of_goods_sold: number;
    };
    gross_profit: number;
    gross_margin: number;
    operating_expenses: { name: string; amount: number }[];
    total_operating_expenses: number;
    operating_profit: number;
    other_income: number;
    other_expenses: number;
    net_profit: number;
    net_margin: number;
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label="Net Sales" value={formatCurr(pl.revenue.net_sales)} />
        <KpiCard label="COGS" value={formatCurr(pl.cogs.cost_of_goods_sold)} />
        <KpiCard label="Gross Profit" value={formatCurr(pl.gross_profit)} />
        <KpiCard label="Net Profit" value={formatCurr(pl.net_profit)} highlight />
      </div>

      <ReportSection title="Income Statement" description="Detailed profit and loss statement">
        <div className="space-y-6 rounded-lg border border-slate-200 bg-white p-6">
          <div>
            <h4 className="font-bold text-slate-900">Revenue</h4>
            <div className="mt-3 space-y-2 border-b border-slate-200 pb-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Gross Sales</span>
                <span className="font-semibold">{formatCurr(pl.revenue.gross_sales)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Less: Sales Returns</span>
                <span className="font-semibold text-rose-600">
                  ({formatCurr(pl.revenue.sales_returns)})
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Less: Discounts</span>
                <span className="font-semibold text-rose-600">
                  ({formatCurr(pl.revenue.sales_discounts)})
                </span>
              </div>
              <div className="flex justify-between text-base font-bold">
                <span>Net Sales</span>
                <span>{formatCurr(pl.revenue.net_sales)}</span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-bold text-slate-900">Cost of Goods Sold</h4>
            <div className="mt-3 space-y-2 border-b border-slate-200 pb-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Opening Stock</span>
                <span>{formatCurr(pl.cogs.opening_stock)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Add: Purchases</span>
                <span>{formatCurr(pl.cogs.purchases)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Less: Purchase Returns</span>
                <span className="text-rose-600">({formatCurr(pl.cogs.purchase_returns)})</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Less: Closing Stock</span>
                <span className="text-rose-600">({formatCurr(pl.cogs.closing_stock)})</span>
              </div>
              <div className="flex justify-between text-base font-bold">
                <span>COGS</span>
                <span>{formatCurr(pl.cogs.cost_of_goods_sold)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-emerald-50 p-3">
            <div className="flex justify-between text-base font-bold text-emerald-900">
              <span>Gross Profit</span>
              <span>{formatCurr(pl.gross_profit)}</span>
            </div>
            <div className="mt-1 flex justify-between text-sm text-emerald-600">
              <span>Gross Margin</span>
              <span>{formatPct(pl.gross_margin)}</span>
            </div>
          </div>

          <div>
            <h4 className="font-bold text-slate-900">Operating Expenses</h4>
            <div className="mt-3 space-y-2 border-b border-slate-200 pb-4">
              {pl.operating_expenses.length > 0 ? (
                pl.operating_expenses.map((exp, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span className="text-slate-600">{exp.name || `Expense ${idx + 1}`}</span>
                    <span>{formatCurr(exp.amount)}</span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-500">No expenses recorded</div>
              )}
              <div className="flex justify-between text-base font-bold">
                <span>Total Operating Expenses</span>
                <span>{formatCurr(pl.total_operating_expenses)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-blue-50 p-3">
            <div className="flex justify-between text-base font-bold text-blue-900">
              <span>Operating Profit</span>
              <span>{formatCurr(pl.operating_profit)}</span>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Add: Other Income</span>
              <span className="font-semibold text-emerald-600">
                +{formatCurr(pl.other_income)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Less: Other Expenses</span>
              <span className="font-semibold text-rose-600">
                ({formatCurr(pl.other_expenses)})
              </span>
            </div>
          </div>

          <div className="rounded-lg bg-gradient-to-r from-emerald-50 to-cyan-50 p-4">
            <div className="flex justify-between text-lg font-black text-slate-900">
              <span>Net Profit</span>
              <span className={pl.net_profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                {formatCurr(pl.net_profit)}
              </span>
            </div>
            <div className="mt-2 flex justify-between text-sm text-slate-600">
              <span>Net Margin</span>
              <span className={pl.net_margin >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                {formatPct(pl.net_margin)}
              </span>
            </div>
          </div>
        </div>
      </ReportSection>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Profitability panels                                                */
/* ------------------------------------------------------------------ */

function ProfitabilityOverviewPanel({
  data,
  loading,
  error,
}: {
  data: ProfitLossSummaryReport | null;
  loading: boolean;
  error: string | null;
}) {
  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
        {error}
      </div>
    );
  }

  if (loading || !data?.data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
        Loading profitability overview...
      </div>
    );
  }

  const d = data.data;

  return (
    <ReportSection
      title="Profitability Overview"
      description="Real backend profitability snapshot for the selected period"
    >
      <div className="space-y-5 p-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Gross Revenue" value={formatCurrency(d.gross_revenue)} />
          <KpiCard label="COGS" value={formatCurrency(d.cogs)} />
          <KpiCard label="Gross Profit" value={formatCurrency(d.gross_profit)} />
          <KpiCard label="Net Profit" value={formatCurrency(d.net_profit)} highlight />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Net Revenue" value={formatCurrency(d.net_revenue)} />
          <KpiCard label="Operating Profit" value={formatCurrency(d.operating_profit)} />
          <KpiCard label="Contribution Margin" value={formatCurrency(d.contribution_margin)} />
          <KpiCard label="Net Margin" value={`${Number(d.net_margin || 0).toFixed(2)}%`} />
        </div>
      </div>
    </ReportSection>
  );
}

function InvoiceProfitabilityTable({
  data,
  loading,
  error,
}: {
  data: InvoiceProfitabilityReport | null;
  loading: boolean;
  error: string | null;
}) {
  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
        {error}
      </div>
    );
  }

  if (loading || !data?.data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
        Loading bill-wise profitability...
      </div>
    );
  }

  return (
    <ReportSection
      title="Bill-wise Profitability"
      description="Profitability by invoice using actual item sales and historical purchase cost"
      count={data.data.length}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <TableHeader>Invoice</TableHeader>
              <TableHeader>Date</TableHeader>
              <TableHeader>Customer</TableHeader>
              <TableHeader align="right">Revenue</TableHeader>
              <TableHeader align="right">COGS</TableHeader>
              <TableHeader align="right">Gross Profit</TableHeader>
              <TableHeader align="right">Margin</TableHeader>
              <TableHeader align="right">Status</TableHeader>
            </tr>
          </thead>
          <tbody>
            {data.data.map((item) => (
              <tr key={item.invoice_id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3.5 font-semibold text-slate-800">{item.invoice_no}</td>
                <td className="px-4 py-3.5 text-slate-600">
                  {formatDate(item.invoice_date || undefined)}
                </td>
                <td className="px-4 py-3.5 text-slate-700">{item.customer_name || '-'}</td>
                <td className="px-4 py-3.5 text-right text-slate-700">
                  {formatCurrency(item.revenue)}
                </td>
                <td className="px-4 py-3.5 text-right text-slate-700">
                  {formatCurrency(item.cogs)}
                </td>
                <td className="px-4 py-3.5 text-right font-bold text-emerald-700">
                  {formatCurrency(item.gross_profit)}
                </td>
                <td className="px-4 py-3.5 text-right font-semibold text-slate-700">
                  {Number(item.profit_margin || 0).toFixed(2)}%
                </td>
                <td className="px-4 py-3.5 text-right text-slate-600">{item.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ReportSection>
  );
}

function ProductProfitabilityTable({
  data,
  loading,
  error,
}: {
  data: ProductProfitabilityReport | null;
  loading: boolean;
  error: string | null;
}) {
  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
        {error}
      </div>
    );
  }

  if (loading || !data?.data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
        Loading product profitability...
      </div>
    );
  }

  return (
    <ReportSection
      title="Product Profitability"
      description="Gross profit by sold product from real invoice data"
      count={data.data.length}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <TableHeader>Product</TableHeader>
              <TableHeader>SKU</TableHeader>
              <TableHeader align="right">Qty Sold</TableHeader>
              <TableHeader align="right">Sales</TableHeader>
              <TableHeader align="right">Cost</TableHeader>
              <TableHeader align="right">Gross Profit</TableHeader>
              <TableHeader align="right">Margin</TableHeader>
            </tr>
          </thead>
          <tbody>
            {data.data.map((item) => (
              <tr key={item.product_id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3.5 font-semibold text-slate-800">{item.product_name}</td>
                <td className="px-4 py-3.5 text-slate-600">{item.sku || '-'}</td>
                <td className="px-4 py-3.5 text-right text-slate-700">
                  {Number(item.quantity_sold || 0).toLocaleString()}
                </td>
                <td className="px-4 py-3.5 text-right text-slate-700">
                  {formatCurrency(item.sales_value)}
                </td>
                <td className="px-4 py-3.5 text-right text-slate-700">
                  {formatCurrency(item.cost_value)}
                </td>
                <td className="px-4 py-3.5 text-right font-bold text-emerald-700">
                  {formatCurrency(item.gross_profit)}
                </td>
                <td className="px-4 py-3.5 text-right font-semibold text-slate-700">
                  {Number(item.margin_percent || 0).toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ReportSection>
  );
}

function DimensionProfitabilityTable({
  title,
  data,
  loading,
  error,
  valueKey,
  labelKey,
}: {
  title: string;
  data: Array<Record<string, unknown>>;
  loading: boolean;
  error: string | null;
  valueKey: string;
  labelKey: string;
}) {
  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
        {error}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
        Loading {title.toLowerCase()}...
      </div>
    );
  }

  return (
    <ReportSection
      title={title}
      description="Profitability by dimension across the selected period"
      count={data.length}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <TableHeader>{title.replace('Profitability', '').trim() || 'Dimension'}</TableHeader>
              <TableHeader align="right">Gross Profit</TableHeader>
              <TableHeader align="right">Margin</TableHeader>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <EmptyRow colSpan={3} />
            ) : (
              data.map((row, index) => (
                <tr
                  key={`${String(row[labelKey] ?? index)}`}
                  className="border-b border-slate-100 hover:bg-slate-50"
                >
                  <td className="px-4 py-3.5 font-semibold text-slate-800">
                    {String(row[labelKey] ?? '-')}
                  </td>
                  <td className="px-4 py-3.5 text-right font-bold text-emerald-700">
                    {formatCurrency(Number(row[valueKey] || 0))}
                  </td>
                  <td className="px-4 py-3.5 text-right text-slate-700">
                    {Number(row.margin_percent || 0).toFixed(2)}%
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </ReportSection>
  );
}

/* ------------------------------------------------------------------ */
/* KPI card                                                            */
/* ------------------------------------------------------------------ */

function KpiCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        highlight ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white',
      )}
    >
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className={cn('mt-2 text-lg font-bold', highlight ? 'text-emerald-700' : 'text-slate-900')}>
        {value}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* API-backed sales report tables                                      */
/* ------------------------------------------------------------------ */

function SalesSummaryApiReport({
  data,
  loading,
  error,
}: {
  data: SalesSummaryReport | null;
  loading: boolean;
  error: string | null;
}) {
  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
        {error}
      </div>
    );
  }
  if (loading || !data?.data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
        Loading sales summary...
      </div>
    );
  }

  return (
    <ReportSection
      title="Sales Summary"
      description="Sales totals from the live backend report endpoint"
      count={data.data.length}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <TableHeader>Invoice</TableHeader>
              <TableHeader>Date</TableHeader>
              <TableHeader>Customer</TableHeader>
              <TableHeader align="right">Taxable</TableHeader>
              <TableHeader align="right">Tax</TableHeader>
              <TableHeader align="right">Total</TableHeader>
              <TableHeader align="right">Due</TableHeader>
              <TableHeader align="right">Status</TableHeader>
            </tr>
          </thead>
          <tbody>
            {data.data.map((row) => (
              <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3.5 font-semibold text-slate-800">{row.invoice_number}</td>
                <td className="px-4 py-3.5 text-slate-600">{formatDate(row.invoice_date)}</td>
                <td className="px-4 py-3.5 text-slate-700">{row.customer || '-'}</td>
                <td className="px-4 py-3.5 text-right text-slate-700">
                  {formatCurrency(Number(row.taxable_amount || 0))}
                </td>
                <td className="px-4 py-3.5 text-right text-slate-700">
                  {formatCurrency(Number(row.tax || 0))}
                </td>
                <td className="px-4 py-3.5 text-right font-bold text-slate-900">
                  {formatCurrency(Number(row.total || 0))}
                </td>
                <td className="px-4 py-3.5 text-right text-slate-700">
                  {formatCurrency(Number(row.due_amount || 0))}
                </td>
                <td className="px-4 py-3.5 text-right">
                  <StatusBadge status={row.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ReportSection>
  );
}

function SalesRegisterApiTable({
  data,
  loading,
  error,
}: {
  data: { data?: Record<string, unknown>[] } | null;
  loading: boolean;
  error: string | null;
}) {
  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
        {error}
      </div>
    );
  }
  if (loading || !data?.data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
        Loading sales register...
      </div>
    );
  }

  const rows = data.data as Array<Record<string, unknown>>;

  return (
    <ReportSection
      title="Sales Register"
      description="Transaction-level sales register from the API"
      count={rows.length}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <TableHeader>Date</TableHeader>
              <TableHeader>Invoice</TableHeader>
              <TableHeader>Customer</TableHeader>
              <TableHeader align="right">Items</TableHeader>
              <TableHeader align="right">Taxable</TableHeader>
              <TableHeader align="right">GST</TableHeader>
              <TableHeader align="right">Total</TableHeader>
              <TableHeader align="right">Status</TableHeader>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={`${String(row.invoice_number ?? 'invoice')}-${index}`}
                className="border-b border-slate-100 hover:bg-slate-50"
              >
                <td className="px-4 py-3.5 text-slate-600">{formatDate(String(row.date ?? ''))}</td>
                <td className="px-4 py-3.5 font-semibold text-slate-800">
                  {String(row.invoice_number ?? '')}
                </td>
                <td className="px-4 py-3.5 text-slate-700">{String(row.customer ?? '-')}</td>
                <td className="px-4 py-3.5 text-right text-slate-700">
                  {Number(row.item_count || 0)}
                </td>
                <td className="px-4 py-3.5 text-right text-slate-700">
                  {formatCurrency(Number(row.taxable_value || 0))}
                </td>
                <td className="px-4 py-3.5 text-right text-slate-700">
                  {formatCurrency(Number(row.gst || 0))}
                </td>
                <td className="px-4 py-3.5 text-right font-bold text-slate-900">
                  {formatCurrency(Number(row.total || 0))}
                </td>
                <td className="px-4 py-3.5 text-right">
                  <StatusBadge status={String(row.status ?? '')} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ReportSection>
  );
}

function SalesByCustomerApiTable({
  data,
  loading,
  error,
}: {
  data: { data?: Record<string, unknown>[] } | null;
  loading: boolean;
  error: string | null;
}) {
  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
        {error}
      </div>
    );
  }
  if (loading || !data?.data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
        Loading sales by customer...
      </div>
    );
  }

  const rows = data.data as Array<Record<string, unknown>>;

  return (
    <ReportSection
      title="Sales by Customer"
      description="Customer-wise sales totals from the live API"
      count={rows.length}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <TableHeader>Customer</TableHeader>
              <TableHeader align="right">Invoices</TableHeader>
              <TableHeader align="right">Taxable</TableHeader>
              <TableHeader align="right">GST</TableHeader>
              <TableHeader align="right">Total Sales</TableHeader>
              <TableHeader align="right">Paid</TableHeader>
              <TableHeader align="right">Outstanding</TableHeader>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={`${String(row.customer ?? 'customer')}-${index}`}
                className="border-b border-slate-100 hover:bg-slate-50"
              >
                <td className="px-4 py-3.5 font-semibold text-slate-800">
                  {String(row.customer ?? '-')}
                </td>
                <td className="px-4 py-3.5 text-right text-slate-700">
                  {Number(row.invoice_count || 0)}
                </td>
                <td className="px-4 py-3.5 text-right text-slate-700">
                  {formatCurrency(Number(row.taxable_sales || 0))}
                </td>
                <td className="px-4 py-3.5 text-right text-slate-700">
                  {formatCurrency(Number(row.gst || 0))}
                </td>
                <td className="px-4 py-3.5 text-right font-bold text-slate-900">
                  {formatCurrency(Number(row.total_sales || 0))}
                </td>
                <td className="px-4 py-3.5 text-right text-emerald-700">
                  {formatCurrency(Number(row.paid || 0))}
                </td>
                <td className="px-4 py-3.5 text-right text-amber-700">
                  {formatCurrency(Number(row.outstanding || 0))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ReportSection>
  );
}

function SalesByProductApiTable({
  data,
  loading,
  error,
}: {
  data: { data?: Record<string, unknown>[] } | null;
  loading: boolean;
  error: string | null;
}) {
  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
        {error}
      </div>
    );
  }
  if (loading || !data?.data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
        Loading sales by product...
      </div>
    );
  }

  const rows = data.data as Array<Record<string, unknown>>;

  return (
    <ReportSection
      title="Sales by Product"
      description="Product-wise sales totals from the live API"
      count={rows.length}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <TableHeader>Product</TableHeader>
              <TableHeader>SKU</TableHeader>
              <TableHeader align="right">Qty</TableHeader>
              <TableHeader align="right">Taxable</TableHeader>
              <TableHeader align="right">GST</TableHeader>
              <TableHeader align="right">Total Sales</TableHeader>
              <TableHeader align="right">Avg Price</TableHeader>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={`${String(row.product ?? 'product')}-${index}`}
                className="border-b border-slate-100 hover:bg-slate-50"
              >
                <td className="px-4 py-3.5 font-semibold text-slate-800">
                  {String(row.product ?? '-')}
                </td>
                <td className="px-4 py-3.5 text-slate-600">{String(row.sku ?? '-')}</td>
                <td className="px-4 py-3.5 text-right text-slate-700">
                  {Number(row.quantity || 0)}
                </td>
                <td className="px-4 py-3.5 text-right text-slate-700">
                  {formatCurrency(Number(row.taxable_sales || 0))}
                </td>
                <td className="px-4 py-3.5 text-right text-slate-700">
                  {formatCurrency(Number(row.gst || 0))}
                </td>
                <td className="px-4 py-3.5 text-right font-bold text-slate-900">
                  {formatCurrency(Number(row.total_sales || 0))}
                </td>
                <td className="px-4 py-3.5 text-right text-slate-700">
                  {formatCurrency(Number(row.avg_selling_price || 0))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ReportSection>
  );
}

function OutstandingSalesApiTable({
  data,
  loading,
  error,
}: {
  data: OutstandingSalesReport | null;
  loading: boolean;
  error: string | null;
}) {
  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
        {error}
      </div>
    );
  }
  if (loading || !data?.data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
        Loading outstanding sales...
      </div>
    );
  }

  const rows = data.data as unknown as Array<Record<string, unknown>>;

  return (
    <ReportSection
      title="Outstanding Sales"
      description="Unpaid sales invoice balances from the API"
      count={rows.length}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <TableHeader>Customer</TableHeader>
              <TableHeader>Invoice</TableHeader>
              <TableHeader>Date</TableHeader>
              <TableHeader>Due Date</TableHeader>
              <TableHeader align="right">Invoice Amount</TableHeader>
              <TableHeader align="right">Paid</TableHeader>
              <TableHeader align="right">Outstanding</TableHeader>
              <TableHeader align="right">Days</TableHeader>
              <TableHeader align="right">Status</TableHeader>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={`${String(row.invoice ?? 'invoice')}-${index}`}
                className="border-b border-slate-100 hover:bg-slate-50"
              >
                <td className="px-4 py-3.5 font-semibold text-slate-800">
                  {String(row.customer ?? '-')}
                </td>
                <td className="px-4 py-3.5 text-slate-700">{String(row.invoice ?? '-')}</td>
                <td className="px-4 py-3.5 text-slate-600">
                  {formatDate(String(row.invoice_date ?? ''))}
                </td>
                <td className="px-4 py-3.5 text-slate-600">
                  {formatDate(String(row.due_date ?? ''))}
                </td>
                <td className="px-4 py-3.5 text-right font-bold text-slate-900">
                  {formatCurrency(Number(row.invoice_amount || 0))}
                </td>
                <td className="px-4 py-3.5 text-right text-emerald-700">
                  {formatCurrency(Number(row.paid_amount || 0))}
                </td>
                <td className="px-4 py-3.5 text-right text-amber-700">
                  {formatCurrency(Number(row.outstanding_amount || 0))}
                </td>
                <td className="px-4 py-3.5 text-right text-slate-700">
                  {Number(row.overdue_days || 0)}
                </td>
                <td className="px-4 py-3.5 text-right">
                  <StatusBadge status={String(row.status ?? '')} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ReportSection>
  );
}

function PurchaseSummaryApiTable({
  data,
  loading,
  error,
}: {
  data: { data?: Record<string, unknown>[] } | null;
  loading: boolean;
  error: string | null;
}) {
  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
        {error}
      </div>
    );
  }
  if (loading || !data?.data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
        Loading purchase summary...
      </div>
    );
  }

  const rows = data.data as Array<Record<string, unknown>>;

  return (
    <ReportSection
      title="Purchase Summary"
      description="Purchase totals from the live backend report endpoint"
      count={rows.length}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <TableHeader>Purchase</TableHeader>
              <TableHeader>Date</TableHeader>
              <TableHeader>Supplier</TableHeader>
              <TableHeader align="right">Taxable</TableHeader>
              <TableHeader align="right">Tax</TableHeader>
              <TableHeader align="right">Total</TableHeader>
              <TableHeader align="right">Due</TableHeader>
              <TableHeader align="right">Status</TableHeader>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={`${String(row.purchase_number ?? 'purchase')}-${index}`}
                className="border-b border-slate-100 hover:bg-slate-50"
              >
                <td className="px-4 py-3.5 font-semibold text-slate-800">
                  {String(row.purchase_number ?? '')}
                </td>
                <td className="px-4 py-3.5 text-slate-600">
                  {formatDate(String(row.purchase_date ?? ''))}
                </td>
                <td className="px-4 py-3.5 text-slate-700">{String(row.supplier ?? '-')}</td>
                <td className="px-4 py-3.5 text-right text-slate-700">
                  {formatCurrency(Number(row.taxable_amount || 0))}
                </td>
                <td className="px-4 py-3.5 text-right text-slate-700">
                  {formatCurrency(Number(row.tax || 0))}
                </td>
                <td className="px-4 py-3.5 text-right font-bold text-slate-900">
                  {formatCurrency(Number(row.total || 0))}
                </td>
                <td className="px-4 py-3.5 text-right text-slate-700">
                  {formatCurrency(Number(row.due_amount || 0))}
                </td>
                <td className="px-4 py-3.5 text-right">
                  <StatusBadge status={String(row.status ?? '')} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ReportSection>
  );
}

function OutstandingPurchasesApiTable({
  data,
  loading,
  error,
}: {
  data: { data?: Record<string, unknown>[] } | null;
  loading: boolean;
  error: string | null;
}) {
  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
        {error}
      </div>
    );
  }
  if (loading || !data?.data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
        Loading outstanding purchases...
      </div>
    );
  }

  const rows = data.data as Array<Record<string, unknown>>;

  return (
    <ReportSection
      title="Outstanding Purchase"
      description="Unpaid purchase invoice balances from the API"
      count={rows.length}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <TableHeader>Supplier</TableHeader>
              <TableHeader>Purchase</TableHeader>
              <TableHeader>Date</TableHeader>
              <TableHeader>Due Date</TableHeader>
              <TableHeader align="right">Purchase Amount</TableHeader>
              <TableHeader align="right">Paid</TableHeader>
              <TableHeader align="right">Outstanding</TableHeader>
              <TableHeader align="right">Days</TableHeader>
              <TableHeader align="right">Status</TableHeader>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={`${String(row.purchase_number ?? 'purchase')}-${index}`}
                className="border-b border-slate-100 hover:bg-slate-50"
              >
                <td className="px-4 py-3.5 font-semibold text-slate-800">
                  {String(row.supplier ?? '-')}
                </td>
                <td className="px-4 py-3.5 text-slate-700">
                  {String(row.purchase_number ?? '-')}
                </td>
                <td className="px-4 py-3.5 text-slate-600">
                  {formatDate(String(row.purchase_date ?? ''))}
                </td>
                <td className="px-4 py-3.5 text-slate-600">
                  {formatDate(String(row.due_date ?? ''))}
                </td>
                <td className="px-4 py-3.5 text-right font-bold text-slate-900">
                  {formatCurrency(Number(row.purchase_amount || 0))}
                </td>
                <td className="px-4 py-3.5 text-right text-emerald-700">
                  {formatCurrency(Number(row.paid_amount || 0))}
                </td>
                <td className="px-4 py-3.5 text-right text-amber-700">
                  {formatCurrency(Number(row.outstanding_amount || 0))}
                </td>
                <td className="px-4 py-3.5 text-right text-slate-700">
                  {Number(row.overdue_days || 0)}
                </td>
                <td className="px-4 py-3.5 text-right">
                  <StatusBadge status={String(row.status ?? '')} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ReportSection>
  );
}

function PurchaseRegisterApiTable({
  data,
  loading,
  error,
}: {
  data: { data?: Record<string, unknown>[] } | null;
  loading: boolean;
  error: string | null;
}) {
  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
        {error}
      </div>
    );
  }
  if (loading || !data?.data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
        Loading purchase register...
      </div>
    );
  }

  const rows = data.data as Array<Record<string, unknown>>;

  return (
    <ReportSection
      title="Purchase Register"
      description="Transaction-level purchase register from the live API"
      count={rows.length}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <TableHeader>Date</TableHeader>
              <TableHeader>Bill No.</TableHeader>
              <TableHeader>Supplier</TableHeader>
              <TableHeader align="right">Items</TableHeader>
              <TableHeader align="right">Tax</TableHeader>
              <TableHeader align="right">Total</TableHeader>
              <TableHeader align="right">Due</TableHeader>
              <TableHeader align="right">Status</TableHeader>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={`${String(row.purchase_number ?? 'purchase')}-${index}`}
                className="border-b border-slate-100 hover:bg-slate-50"
              >
                <td className="px-4 py-3.5 text-slate-600">
                  {formatDate(String(row.purchase_date ?? ''))}
                </td>
                <td className="px-4 py-3.5 font-semibold text-slate-800">
                  {String(row.purchase_number ?? '')}
                </td>
                <td className="px-4 py-3.5 text-slate-700">{String(row.supplier ?? '-')}</td>
                <td className="px-4 py-3.5 text-right text-slate-700">
                  {Number(row.item_count || 0)}
                </td>
                <td className="px-4 py-3.5 text-right text-slate-700">
                  {formatCurrency(Number(row.tax || 0))}
                </td>
                <td className="px-4 py-3.5 text-right font-bold text-slate-900">
                  {formatCurrency(Number(row.total || 0))}
                </td>
                <td className="px-4 py-3.5 text-right text-slate-700">
                  {formatCurrency(Number(row.due_amount || 0))}
                </td>
                <td className="px-4 py-3.5 text-right">
                  <StatusBadge status={String(row.status ?? '')} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ReportSection>
  );
}

function PurchaseByVendorApiTable({
  data,
  loading,
  error,
}: {
  data: { data?: Record<string, unknown>[] } | null;
  loading: boolean;
  error: string | null;
}) {
  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
        {error}
      </div>
    );
  }
  if (loading || !data?.data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
        Loading purchase by vendor...
      </div>
    );
  }

  const rows = data.data as Array<Record<string, unknown>>;

  return (
    <ReportSection
      title="Purchase by Vendor"
      description="Supplier-wise purchase totals from the live API"
      count={rows.length}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <TableHeader>Vendor</TableHeader>
              <TableHeader align="right">Bills</TableHeader>
              <TableHeader align="right">Taxable</TableHeader>
              <TableHeader align="right">GST</TableHeader>
              <TableHeader align="right">Total Purchases</TableHeader>
              <TableHeader align="right">Paid</TableHeader>
              <TableHeader align="right">Outstanding</TableHeader>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={`${String(row.supplier ?? 'supplier')}-${index}`}
                className="border-b border-slate-100 hover:bg-slate-50"
              >
                <td className="px-4 py-3.5 font-semibold text-slate-800">
                  {String(row.supplier ?? '-')}
                </td>
                <td className="px-4 py-3.5 text-right text-slate-700">
                  {Number(row.purchase_count || 0)}
                </td>
                <td className="px-4 py-3.5 text-right text-slate-700">
                  {formatCurrency(Number(row.taxable_purchases || 0))}
                </td>
                <td className="px-4 py-3.5 text-right text-slate-700">
                  {formatCurrency(Number(row.gst || 0))}
                </td>
                <td className="px-4 py-3.5 text-right font-bold text-slate-900">
                  {formatCurrency(Number(row.total_purchases || 0))}
                </td>
                <td className="px-4 py-3.5 text-right text-emerald-700">
                  {formatCurrency(Number(row.paid || 0))}
                </td>
                <td className="px-4 py-3.5 text-right text-amber-700">
                  {formatCurrency(Number(row.outstanding || 0))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ReportSection>
  );
}

function GeneralLedgerApiTable({
  data,
  loading,
  error,
}: {
  data: { data?: Record<string, unknown>[] } | null;
  loading: boolean;
  error: string | null;
}) {
  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
        {error}
      </div>
    );
  }
  if (loading || !data?.data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
        Loading general ledger...
      </div>
    );
  }

  const rows = data.data as Array<Record<string, unknown>>;

  return (
    <ReportSection
      title="General Ledger"
      description="Ledger transactions built from actual sales, payments, and purchase entries for the selected period."
      count={rows.length}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <TableHeader>Date</TableHeader>
              <TableHeader>Description</TableHeader>
              <TableHeader align="right">Debit</TableHeader>
              <TableHeader align="right">Credit</TableHeader>
              <TableHeader align="right">Balance</TableHeader>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry, index) => (
              <tr key={`${String(entry.id ?? index)}`} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3.5 text-slate-500">
                  {formatDate(String(entry.date ?? ''))}
                </td>
                <td className="px-4 py-3.5 font-semibold text-slate-800">
                  {String(entry.description ?? '')}
                </td>
                <td className="px-4 py-3.5 text-right font-medium text-rose-600">
                  {formatCurrency(Number(entry.debit || 0))}
                </td>
                <td className="px-4 py-3.5 text-right font-medium text-emerald-600">
                  {formatCurrency(Number(entry.credit || 0))}
                </td>
                <td className="px-4 py-3.5 text-right font-bold text-slate-900">
                  {formatCurrency(Number(entry.balance || 0))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ReportSection>
  );
}

/* ------------------------------------------------------------------ */
/* Coming soon                                                         */
/* ------------------------------------------------------------------ */

function ComingSoonReport({ title }: { title: string }) {
  return (
    <div className="flex min-h-[440px] flex-col items-center justify-center rounded-2xl border border-dashed border-amber-200 bg-amber-50/40 px-5 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl border border-amber-100 bg-white text-amber-500 shadow-sm">
        <FiFileText size={24} />
      </div>
      <h3 className="mt-5 text-lg font-black text-slate-800">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
        This report is not displayed with fabricated or mock values. Connect its backend API
        before showing real report results.
      </p>
      <div className="mt-5 inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-amber-700">
        <FiDatabase size={13} />
        Backend API required
      </div>
    </div>
  );
}

export default ReportsPage;