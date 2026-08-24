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
  FiBox,
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

import clsx from 'clsx';

import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';

// ============================================================
// TYPES
// ============================================================

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
}

interface PurchaseInvoice {
  id: number;
  purchase_number: string;
  supplier?: Supplier;
  grand_total: number | string;
  status: string;
  purchase_date: string;
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

interface ApiErrorState {
  invoices: string | null;
  purchases: string | null;
  payments: string | null;
  ledger: string | null;
}

// ============================================================
// REPORT CATEGORIES
// ============================================================

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

const SUB_REPORTS: Record<
  string,
  { label: string; icon: JSX.Element }[]
> = {
  sales: [
    {
      label: 'Sales Summary',
      icon: <FiFileText size={14} />,
    },
    {
      label: 'Sales Register',
      icon: <FiFileText size={14} />,
    },
    {
      label: 'Sales by Customer',
      icon: <FiUser size={14} />,
    },
    {
      label: 'Sales by Product',
      icon: <FiPackage size={14} />,
    },
    {
      label: 'GST Sales Report',
      icon: <FiFileText size={14} />,
    },
    {
      label: 'Outstanding Sales',
      icon: <FiAlertTriangle size={14} />,
    },
  ],

  purchases: [
    {
      label: 'Purchase Summary',
      icon: <FiFileText size={14} />,
    },
    {
      label: 'Purchase Register',
      icon: <FiFileText size={14} />,
    },
    {
      label: 'Purchase by Vendor',
      icon: <FiUser size={14} />,
    },
    {
      label: 'GST Purchase Report',
      icon: <FiFileText size={14} />,
    },
    {
      label: 'Outstanding Purchase',
      icon: <FiAlertTriangle size={14} />,
    },
  ],

  accounts: [
    {
      label: 'General Ledger',
      icon: <FiFileText size={14} />,
    },
    {
      label: 'Trial Balance',
      icon: <FiFileText size={14} />,
    },
    {
      label: 'Profit & Loss',
      icon: <FiTrendingUp size={14} />,
    },
    {
      label: 'Balance Sheet',
      icon: <FiFileText size={14} />,
    },
    {
      label: 'Cash Flow',
      icon: <FiDollarSign size={14} />,
    },
    {
      label: 'Outstanding Receivable',
      icon: <FiAlertTriangle size={14} />,
    },
  ],

  gst: [
    {
      label: 'GSTR-1',
      icon: <FiFileText size={14} />,
    },
    {
      label: 'GSTR-3B',
      icon: <FiFileText size={14} />,
    },
    {
      label: 'Input Tax Credit',
      icon: <FiFileText size={14} />,
    },
    {
      label: 'GST Rate-wise Report',
      icon: <FiFileText size={14} />,
    },
  ],

  expenses: [
    {
      label: 'Expense Summary',
      icon: <FiCreditCard size={14} />,
    },
    {
      label: 'Category-wise Expense',
      icon: <FiFileText size={14} />,
    },
    {
      label: 'Vendor-wise Expense',
      icon: <FiUser size={14} />,
    },
    {
      label: 'Expense vs Income',
      icon: <FiTrendingUp size={14} />,
    },
  ],
};

// ============================================================
// API CACHE HOOK
// ============================================================

function useApiCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = 300000
) {
  const cache = useRef(
    new Map<string, { data: T; timestamp: number }>()
  ).current;

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

        if (
          cached &&
          Date.now() - cached.timestamp < ttlMs
        ) {
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

        const result = Array.isArray(response)
          ? response
          : ((response as any)?.data ?? []);

        if (!Array.isArray(result)) {
          throw new Error(
            'Invalid API response. Expected an array.'
          );
        }

        cache.set(key, {
          data: result,
          timestamp: Date.now(),
        });

        setData(result);
      } catch (error: any) {
        const message =
          error?.response?.data?.message ||
          error?.message ||
          'Unable to load report data.';

        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [cache, key, ttlMs]
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

// ============================================================
// HELPERS
// ============================================================

const safeNum = (value: unknown): number => {
  const number =
    typeof value === 'number'
      ? value
      : Number.parseFloat(String(value ?? ''));

  return Number.isFinite(number) ? number : 0;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value);

const formatNumber = (value: number) =>
  new Intl.NumberFormat('en-IN').format(value);

const formatDate = (value?: string) => {
  if (!value) return '-';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10);
  }

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

const getToday = () =>
  new Date().toISOString().split('T')[0];

const getFinancialYearStart = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const startYear =
    month >= 3 ? year : year - 1;

  return `${startYear}-04-01`;
};

const getFinancialYear = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const startYear =
    month >= 3 ? year : year - 1;

  return `${startYear}-${startYear + 1}`;
};

const getCSVValue = (
  row: any,
  key: string
) => {
  const value = key
    .split('.')
    .reduce(
      (current, property) =>
        current?.[property],
      row
    );

  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  const text = String(value).replace(
    /"/g,
    '""'
  );

  return `"${text}"`;
};

// ============================================================
// MAIN COMPONENT
// ============================================================

export function ReportsPage() {
  const {
    showSuccess,
    showError,
  } = useNotification();

  const [activeCategory, setActiveCategory] =
    useState('dashboard');

  const [activeSubReport, setActiveSubReport] =
    useState('');

  const [dateFrom, setDateFrom] =
    useState(getFinancialYearStart());

  const [dateTo, setDateTo] =
    useState(getToday());

  const [financialYear, setFinancialYear] =
    useState(getFinancialYear());

  const [filterCustomer, setFilterCustomer] =
    useState('all');

  const [filterVendor, setFilterVendor] =
    useState('all');

  const [filterProduct, setFilterProduct] =
    useState('all');

  const [filterBranch, setFilterBranch] =
    useState('all');

  const [filterCategory, setFilterCategory] =
    useState('all');

  const [filterPaymentMode, setFilterPaymentMode] =
    useState('all');

  const [filterStatus, setFilterStatus] =
    useState('all');

  const [showFilters, setShowFilters] =
    useState(false);

  const [search, setSearch] =
    useState('');

  const printRef =
    useRef<HTMLDivElement>(null);

  // ============================================================
  // API
  // ============================================================

  const invoicesFetcher = useCallback(
    () =>
      apiClient.request(
        'GET',
        `/invoices?from=${encodeURIComponent(
          dateFrom
        )}&to=${encodeURIComponent(dateTo)}`
      ),
    [dateFrom, dateTo]
  );

  const purchasesFetcher = useCallback(
    () =>
      apiClient.request(
        'GET',
        `/purchase-invoices?from=${encodeURIComponent(
          dateFrom
        )}&to=${encodeURIComponent(dateTo)}`
      ),
    [dateFrom, dateTo]
  );

  const paymentsFetcher = useCallback(
    () =>
      apiClient.request(
        'GET',
        `/payments?from=${encodeURIComponent(
          dateFrom
        )}&to=${encodeURIComponent(dateTo)}`
      ),
    [dateFrom, dateTo]
  );

  const ledgerFetcher = useCallback(
    () =>
      apiClient.request(
        'GET',
        `/ledger?from=${encodeURIComponent(
          dateFrom
        )}&to=${encodeURIComponent(dateTo)}`
      ),
    [dateFrom, dateTo]
  );

  const {
    data: invoices,
    loading: invLoading,
    error: invError,
    refresh: refreshInvoices,
  } = useApiCache<Invoice[]>(
    `reports-invoices-${dateFrom}-${dateTo}`,
    invoicesFetcher
  );

  const {
    data: purchaseInvoices,
    loading: purchaseLoading,
    error: purchaseError,
    refresh: refreshPurchases,
  } = useApiCache<PurchaseInvoice[]>(
    `reports-purchases-${dateFrom}-${dateTo}`,
    purchasesFetcher
  );

  const {
    data: payments,
    loading: paymentLoading,
    error: paymentError,
    refresh: refreshPayments,
  } = useApiCache<Payment[]>(
    `reports-payments-${dateFrom}-${dateTo}`,
    paymentsFetcher
  );

  const {
    data: ledger,
    loading: ledgerLoading,
    error: ledgerError,
    refresh: refreshLedger,
  } = useApiCache<LedgerEntry[]>(
    `reports-ledger-${dateFrom}-${dateTo}`,
    ledgerFetcher
  );

  // ============================================================
  // REFRESH
  // ============================================================

  const isRefreshing =
    invLoading ||
    purchaseLoading ||
    paymentLoading ||
    ledgerLoading;

  const refreshAll = () => {
    refreshInvoices();
    refreshPurchases();
    refreshPayments();
    refreshLedger();
  };

  // ============================================================
  // SUMMARY
  // ============================================================

  const dashboardSummary = useMemo(() => {
    const sales =
      invoices?.reduce(
        (sum, item) =>
          sum + safeNum(item.total_amount),
        0
      ) ?? 0;

    const purchases =
      purchaseInvoices?.reduce(
        (sum, item) =>
          sum + safeNum(item.grand_total),
        0
      ) ?? 0;

    const receivables =
      invoices
        ?.filter((item) => {
          const status =
            item.status?.toLowerCase();

          return (
            status !== 'paid' &&
            status !== 'cancelled' &&
            status !== 'canceled'
          );
        })
        .reduce(
          (sum, item) =>
            sum + safeNum(item.total_amount),
          0
        ) ?? 0;

    const payables =
      purchaseInvoices
        ?.filter((item) => {
          const status =
            item.status?.toLowerCase();

          return (
            status !== 'paid' &&
            status !== 'cancelled' &&
            status !== 'canceled'
          );
        })
        .reduce(
          (sum, item) =>
            sum + safeNum(item.grand_total),
          0
        ) ?? 0;

    const totalPayments =
      payments?.reduce(
        (sum, item) =>
          sum + safeNum(item.amount),
        0
      ) ?? 0;

    return {
      sales,
      purchases,
      receivables,
      payables,
      totalPayments,
      profit: sales - purchases,
      invoiceCount:
        invoices?.length ?? 0,
      purchaseCount:
        purchaseInvoices?.length ?? 0,
      paymentCount:
        payments?.length ?? 0,
    };
  }, [
    invoices,
    purchaseInvoices,
    payments,
  ]);

  // ============================================================
  // FILTERED DATA
  // ============================================================

  const filteredInvoices = useMemo(() => {
    if (!invoices) return [];

    const query =
      search.trim().toLowerCase();

    return invoices.filter((invoice) => {
      const matchesSearch =
        !query ||
        invoice.invoice_no
          ?.toLowerCase()
          .includes(query) ||
        invoice.customer?.name
          ?.toLowerCase()
          .includes(query);

      const matchesStatus =
        filterStatus === 'all' ||
        invoice.status?.toLowerCase() ===
          filterStatus.toLowerCase();

      const matchesCustomer =
        filterCustomer === 'all' ||
        invoice.customer?.name ===
          filterCustomer;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesCustomer
      );
    });
  }, [
    invoices,
    search,
    filterStatus,
    filterCustomer,
  ]);

  const filteredPurchases = useMemo(() => {
    if (!purchaseInvoices) return [];

    const query =
      search.trim().toLowerCase();

    return purchaseInvoices.filter(
      (purchase) => {
        const matchesSearch =
          !query ||
          purchase.purchase_number
            ?.toLowerCase()
            .includes(query) ||
          purchase.supplier?.name
            ?.toLowerCase()
            .includes(query);

        const matchesStatus =
          filterStatus === 'all' ||
          purchase.status
            ?.toLowerCase() ===
            filterStatus.toLowerCase();

        const matchesVendor =
          filterVendor === 'all' ||
          purchase.supplier?.name ===
            filterVendor;

        return (
          matchesSearch &&
          matchesStatus &&
          matchesVendor
        );
      }
    );
  }, [
    purchaseInvoices,
    search,
    filterStatus,
    filterVendor,
  ]);

  const filteredLedger = useMemo(() => {
    if (!ledger) return [];

    const query =
      search.trim().toLowerCase();

    return ledger.filter((entry) => {
      if (!query) return true;

      return (
        entry.description
          ?.toLowerCase()
          .includes(query) ||
        entry.date
          ?.toLowerCase()
          .includes(query)
      );
    });
  }, [ledger, search]);

  // ============================================================
  // UNIQUE FILTER VALUES FROM REAL API DATA
  // ============================================================

  const customerOptions = useMemo(() => {
    const values =
      invoices
        ?.map(
          (invoice) =>
            invoice.customer?.name
        )
        .filter(Boolean) ?? [];

    return Array.from(
      new Set(values)
    ) as string[];
  }, [invoices]);

  const vendorOptions = useMemo(() => {
    const values =
      purchaseInvoices
        ?.map(
          (purchase) =>
            purchase.supplier?.name
        )
        .filter(Boolean) ?? [];

    return Array.from(
      new Set(values)
    ) as string[];
  }, [purchaseInvoices]);

  const statusOptions = useMemo(() => {
    const values = [
      ...(invoices ?? []).map(
        (item) => item.status
      ),
      ...(purchaseInvoices ?? []).map(
        (item) => item.status
      ),
    ].filter(Boolean);

    return Array.from(
      new Set(values)
    );
  }, [
    invoices,
    purchaseInvoices,
  ]);

  // ============================================================
  // CSV
  // ============================================================

  const exportCSV = (
    data: any[],
    headers: string[],
    filename: string
  ) => {
    if (!data.length) {
      showError(
        'Export',
        'There is no real API data available to export.'
      );
      return;
    }

    const csv = [
      headers.join(','),
      ...data.map((row) =>
        headers
          .map((header) =>
            getCSVValue(row, header)
          )
          .join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], {
      type: 'text/csv;charset=utf-8;',
    });

    const url =
      URL.createObjectURL(blob);

    const anchor =
      document.createElement('a');

    anchor.href = url;
    anchor.download = filename;

    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    URL.revokeObjectURL(url);

    showSuccess(
      'Export complete',
      `${filename} downloaded successfully.`
    );
  };

  // ============================================================
  // PRINT
  // ============================================================

  const handlePrint = () => {
    if (!printRef.current) {
      showError(
        'Print',
        'No report content is available.'
      );
      return;
    }

    const newWindow =
      window.open(
        '',
        '_blank',
        'width=1200,height=800'
      );

    if (!newWindow) {
      showError(
        'Print',
        'Popup blocked. Please allow popups.'
      );
      return;
    }

    newWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Business Report</title>
          <meta charset="UTF-8" />

          <style>
            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              padding: 12mm;
              background: #ffffff;
              color: #111827;
              font-family:
                Arial,
                Helvetica,
                sans-serif;
            }

            table {
              width: 100%;
              border-collapse: collapse;
            }

            th,
            td {
              border: 1px solid #d1d5db;
              padding: 7px 8px;
              font-size: 11px;
            }

            th {
              background: #f3f4f6;
              font-weight: 700;
            }

            .hidden-print {
              display: none !important;
            }

            @page {
              size: A4;
              margin: 10mm;
            }
          </style>
        </head>

        <body>
          ${printRef.current.innerHTML}
        </body>
      </html>
    `);

    newWindow.document.close();

    setTimeout(() => {
      newWindow.print();
      newWindow.close();
    }, 300);
  };

  // ============================================================
  // RESET FILTERS
  // ============================================================

  const resetFilters = () => {
    setDateFrom(getFinancialYearStart());
    setDateTo(getToday());
    setFinancialYear(getFinancialYear());

    setFilterCustomer('all');
    setFilterVendor('all');
    setFilterProduct('all');
    setFilterBranch('all');
    setFilterCategory('all');
    setFilterPaymentMode('all');
    setFilterStatus('all');

    setSearch('');
  };

  // ============================================================
  // API ERROR
  // ============================================================

  const apiErrors: ApiErrorState = {
    invoices: invError,
    purchases: purchaseError,
    payments: paymentError,
    ledger: ledgerError,
  };

  const hasApiError =
    Object.values(apiErrors).some(Boolean);

  // ============================================================
  // CATEGORY CHANGE
  // ============================================================

  const changeCategory = (
    category: string
  ) => {
    setActiveCategory(category);
    setActiveSubReport('');
    setSearch('');
  };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="min-h-screen bg-[#f6f8fb] text-slate-900">
      {/* ======================================================
          PAGE HEADER
      ====================================================== */}

      <header className="mb-6 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="relative px-5 py-6 md:px-8 md:py-7">
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-cyan-50 blur-3xl" />
          <div className="absolute bottom-0 right-28 h-24 w-24 rounded-full bg-blue-50 blur-2xl" />

          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-100 bg-cyan-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Live Business Reports
              </div>

              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-950 text-white shadow-lg">
                  <FiBarChart2 size={23} />
                </div>

                <div>
                  <h1 className="text-2xl font-black tracking-tight text-slate-950 md:text-3xl">
                    Reports & Analytics
                  </h1>

                  <p className="mt-1 text-sm text-slate-500">
                    Real API-powered business reporting
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="hidden rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 sm:block">
                <FiDatabase className="mr-1 inline" size={13} />
                API Data
              </div>

              <button
                type="button"
                onClick={refreshAll}
                disabled={isRefreshing}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FiRefreshCw
                  size={15}
                  className={
                    isRefreshing
                      ? 'animate-spin'
                      : ''
                  }
                />
                Refresh
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                <FiPrinter size={15} />
                Print
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ======================================================
          CATEGORY NAVIGATION
      ====================================================== */}

      <section className="mb-6">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {REPORT_CATEGORIES.map(
            (category) => {
              const active =
                activeCategory ===
                category.key;

              return (
                <button
                  key={category.key}
                  type="button"
                  onClick={() =>
                    changeCategory(
                      category.key
                    )
                  }
                  className={clsx(
                    'group relative overflow-hidden rounded-2xl border p-4 text-left transition-all',
                    active
                      ? 'border-cyan-500 bg-cyan-50 shadow-md shadow-cyan-100'
                      : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md'
                  )}
                >
                  {active && (
                    <span className="absolute left-0 top-0 h-full w-1 bg-cyan-500" />
                  )}

                  <div className="flex items-center gap-3">
                    <div
                      className={clsx(
                        'grid h-10 w-10 shrink-0 place-items-center rounded-xl transition',
                        active
                          ? 'bg-cyan-600 text-white'
                          : 'bg-slate-100 text-slate-600 group-hover:bg-slate-900 group-hover:text-white'
                      )}
                    >
                      {category.icon}
                    </div>

                    <div className="min-w-0">
                      <p
                        className={clsx(
                          'text-sm font-bold',
                          active
                            ? 'text-cyan-800'
                            : 'text-slate-800'
                        )}
                      >
                        {category.label}
                      </p>

                      <p className="mt-0.5 truncate text-[11px] text-slate-500">
                        {category.description}
                      </p>
                    </div>
                  </div>
                </button>
              );
            }
          )}
        </div>
      </section>

      {/* ======================================================
          FILTER TOOLBAR
      ====================================================== */}

      <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-50 text-cyan-600">
              <FiFilter size={16} />
            </div>

            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Report Filters
              </h2>

              <p className="text-[11px] text-slate-500">
                Select the reporting period and filters
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setShowFilters(
                  (value) => !value
                )
              }
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Advanced Filters
              <FiChevronDown
                size={14}
                className={clsx(
                  'transition-transform',
                  showFilters &&
                    'rotate-180'
                )}
              />
            </button>

            <button
              type="button"
              onClick={resetFilters}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Reset
            </button>

            <button
              type="button"
              onClick={refreshAll}
              className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-bold text-white hover:bg-cyan-700"
            >
              Apply
            </button>
          </div>
        </div>

        <div className="grid gap-4 p-4 md:grid-cols-2 lg:grid-cols-4">
          <FilterField label="Date From">
            <div className="relative">
              <FiCalendar
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                type="date"
                value={dateFrom}
                onChange={(event) =>
                  setDateFrom(
                    event.target.value
                  )
                }
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              />
            </div>
          </FilterField>

          <FilterField label="Date To">
            <div className="relative">
              <FiCalendar
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                type="date"
                value={dateTo}
                onChange={(event) =>
                  setDateTo(
                    event.target.value
                  )
                }
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              />
            </div>
          </FilterField>

          <FilterField label="Financial Year">
            <select
              value={financialYear}
              onChange={(event) => {
                const value =
                  event.target.value;

                setFinancialYear(value);

                const [start] =
                  value.split('-');

                setDateFrom(
                  `${start}-04-01`
                );
                setDateTo(
                  `${Number(start) + 1}-03-31`
                );
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            >
              <option value="2026-2027">
                2026-2027
              </option>
              <option value="2025-2026">
                2025-2026
              </option>
              <option value="2024-2025">
                2024-2025
              </option>
              <option value="2023-2024">
                2023-2024
              </option>
            </select>
          </FilterField>

          <FilterField label="Search">
            <div className="relative">
              <FiSearch
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                type="search"
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value
                  )
                }
                placeholder="Search report data..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              />
            </div>
          </FilterField>
        </div>

        {showFilters && (
          <div className="border-t border-slate-100 bg-slate-50/60 p-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <FilterField label="Customer">
                <select
                  value={filterCustomer}
                  onChange={(event) =>
                    setFilterCustomer(
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan-500"
                >
                  <option value="all">
                    All Customers
                  </option>

                  {customerOptions.map(
                    (customer) => (
                      <option
                        key={customer}
                        value={customer}
                      >
                        {customer}
                      </option>
                    )
                  )}
                </select>
              </FilterField>

              <FilterField label="Vendor">
                <select
                  value={filterVendor}
                  onChange={(event) =>
                    setFilterVendor(
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan-500"
                >
                  <option value="all">
                    All Vendors
                  </option>

                  {vendorOptions.map(
                    (vendor) => (
                      <option
                        key={vendor}
                        value={vendor}
                      >
                        {vendor}
                      </option>
                    )
                  )}
                </select>
              </FilterField>

              <FilterField label="Status">
                <select
                  value={filterStatus}
                  onChange={(event) =>
                    setFilterStatus(
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan-500"
                >
                  <option value="all">
                    All Status
                  </option>

                  {statusOptions.map(
                    (status) => (
                      <option
                        key={status}
                        value={status}
                      >
                        {status}
                      </option>
                    )
                  )}
                </select>
              </FilterField>

              <FilterField label="Branch">
                <select
                  value={filterBranch}
                  onChange={(event) =>
                    setFilterBranch(
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan-500"
                >
                  <option value="all">
                    All Branches
                  </option>
                </select>
              </FilterField>

              <FilterField label="Product">
                <select
                  value={filterProduct}
                  onChange={(event) =>
                    setFilterProduct(
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan-500"
                >
                  <option value="all">
                    All Products
                  </option>
                </select>
              </FilterField>

              <FilterField label="Category">
                <select
                  value={filterCategory}
                  onChange={(event) =>
                    setFilterCategory(
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan-500"
                >
                  <option value="all">
                    All Categories
                  </option>
                </select>
              </FilterField>

              <FilterField label="Payment Mode">
                <select
                  value={filterPaymentMode}
                  onChange={(event) =>
                    setFilterPaymentMode(
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan-500"
                >
                  <option value="all">
                    All Payment Modes
                  </option>
                </select>
              </FilterField>
            </div>

            <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <FiAlertTriangle
                size={14}
              />
              Customer and vendor filters use values returned by the
              current APIs. Other filters remain unselected until their
              corresponding backend data is available.
            </div>
          </div>
        )}
      </section>

      {/* ======================================================
          API STATUS
      ====================================================== */}

      {hasApiError && (
        <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <div className="flex gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rose-100 text-rose-600">
              <FiAlertTriangle
                size={17}
              />
            </div>

            <div>
              <p className="text-sm font-bold text-rose-800">
                Some report APIs could not be loaded
              </p>

              <div className="mt-1 space-y-0.5 text-xs text-rose-700">
                {invError && (
                  <p>
                    Sales: {invError}
                  </p>
                )}

                {purchaseError && (
                  <p>
                    Purchases: {purchaseError}
                  </p>
                )}

                {paymentError && (
                  <p>
                    Payments: {paymentError}
                  </p>
                )}

                {ledgerError && (
                  <p>
                    Ledger: {ledgerError}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================
          REPORT AREA
      ====================================================== */}

      <main
        ref={printRef}
        className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm"
      >
        {/* ====================================================
            SUB NAVIGATION
        ==================================================== */}

        {SUB_REPORTS[
          activeCategory
        ] && (
          <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {SUB_REPORTS[
                activeCategory
              ].map((report) => {
                const active =
                  activeSubReport ===
                  report.label;

                return (
                  <button
                    key={report.label}
                    type="button"
                    onClick={() =>
                      setActiveSubReport(
                        report.label
                      )
                    }
                    className={clsx(
                      'inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition',
                      active
                        ? 'border-slate-950 bg-slate-950 text-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
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

        <div className="p-4 md:p-6">
          {/* ==================================================
              DASHBOARD
          ================================================== */}

          {activeCategory ===
            'dashboard' && (
            <DashboardReport
              summary={
                dashboardSummary
              }
              invoices={invoices}
              purchases={
                purchaseInvoices
              }
              payments={payments}
              loading={isRefreshing}
              dateFrom={dateFrom}
              dateTo={dateTo}
            />
          )}

          {/* ==================================================
              SALES
          ================================================== */}

          {activeCategory ===
            'sales' && (
            <>
              {!activeSubReport && (
                <EmptyReport
                  title="Sales Reports"
                  description="Select a sales report from the navigation above."
                  icon={
                    <FiShoppingCart
                      size={24}
                    />
                  }
                />
              )}

              {activeSubReport ===
                'Sales Summary' && (
                <SalesTable
                  invoices={
                    filteredInvoices
                  }
                  loading={
                    invLoading
                  }
                  onCSV={() =>
                    exportCSV(
                      filteredInvoices,
                      [
                        'invoice_no',
                        'customer.name',
                        'total_amount',
                        'created_at',
                        'status',
                      ],
                      'sales-summary.csv'
                    )
                  }
                />
              )}

              {activeSubReport &&
                activeSubReport !==
                  'Sales Summary' && (
                  <ComingSoonReport
                    title={
                      activeSubReport
                    }
                  />
                )}
            </>
          )}

          {/* ==================================================
              PURCHASES
          ================================================== */}

          {activeCategory ===
            'purchases' && (
            <>
              {!activeSubReport && (
                <EmptyReport
                  title="Purchase Reports"
                  description="Select a purchase report from the navigation above."
                  icon={
                    <FiPackage
                      size={24}
                    />
                  }
                />
              )}

              {activeSubReport ===
                'Purchase Summary' && (
                <PurchaseTable
                  purchases={
                    filteredPurchases
                  }
                  loading={
                    purchaseLoading
                  }
                  onCSV={() =>
                    exportCSV(
                      filteredPurchases,
                      [
                        'purchase_number',
                        'supplier.name',
                        'grand_total',
                        'purchase_date',
                        'status',
                      ],
                      'purchase-summary.csv'
                    )
                  }
                />
              )}

              {activeSubReport &&
                activeSubReport !==
                  'Purchase Summary' && (
                  <ComingSoonReport
                    title={
                      activeSubReport
                    }
                  />
                )}
            </>
          )}

          {/* ==================================================
              ACCOUNTS
          ================================================== */}

          {activeCategory ===
            'accounts' && (
            <>
              {!activeSubReport && (
                <EmptyReport
                  title="Accounts & Finance"
                  description="Select a financial report from the navigation above."
                  icon={
                    <FiDollarSign
                      size={24}
                    />
                  }
                />
              )}

              {activeSubReport ===
                'General Ledger' && (
                <LedgerTable
                  ledger={
                    filteredLedger
                  }
                  loading={
                    ledgerLoading
                  }
                  onCSV={() =>
                    exportCSV(
                      filteredLedger,
                      [
                        'date',
                        'description',
                        'debit',
                        'credit',
                        'balance',
                      ],
                      'general-ledger.csv'
                    )
                  }
                />
              )}

              {activeSubReport &&
                activeSubReport !==
                  'General Ledger' && (
                  <ComingSoonReport
                    title={
                      activeSubReport
                    }
                  />
                )}
            </>
          )}

          {/* ==================================================
              GST
          ================================================== */}

          {activeCategory ===
            'gst' && (
            <>
              {!activeSubReport && (
                <EmptyReport
                  title="GST / Tax Reports"
                  description="Select a GST report from the navigation above."
                  icon={
                    <FiFileText
                      size={24}
                    />
                  }
                />
              )}

              {activeSubReport && (
                <ComingSoonReport
                  title={
                    activeSubReport
                  }
                />
              )}
            </>
          )}

          {/* ==================================================
              EXPENSES
          ================================================== */}

          {activeCategory ===
            'expenses' && (
            <>
              {!activeSubReport && (
                <EmptyReport
                  title="Expense Reports"
                  description="Select an expense report from the navigation above."
                  icon={
                    <FiCreditCard
                      size={24}
                    />
                  }
                />
              )}

              {activeSubReport && (
                <ComingSoonReport
                  title={
                    activeSubReport
                  }
                />
              )}
            </>
          )}
        </div>
      </main>

      {/* ======================================================
          FOOTER
      ====================================================== */}

      <footer className="mt-5 flex flex-col gap-2 px-1 text-[11px] text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <span>
          Business Reports
        </span>

        <span className="inline-flex items-center gap-1">
          <FiActivity size={12} />
          Live API-powered reporting
        </span>
      </footer>
    </div>
  );
}

// ============================================================
// DASHBOARD REPORT
// ============================================================

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
      {/* Header */}

      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-600">
            <FiActivity
              size={14}
            />
            Business Overview
          </div>

          <h2 className="text-2xl font-black tracking-tight text-slate-950">
            Financial Snapshot
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            {dateFrom || 'All dates'} —{' '}
            {dateTo || 'All dates'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          <FiDatabase
            className="mr-1 inline"
            size={13}
          />
          Values calculated only from
          loaded API records
        </div>
      </div>

      {/* KPI */}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ReportStatCard
          title="Total Sales"
          value={formatCurrency(
            summary.sales
          )}
          count={`${formatNumber(
            summary.invoiceCount
          )} invoices`}
          icon={<FiShoppingCart />}
          tone="cyan"
          loading={loading}
        />

        <ReportStatCard
          title="Total Purchases"
          value={formatCurrency(
            summary.purchases
          )}
          count={`${formatNumber(
            summary.purchaseCount
          )} purchases`}
          icon={<FiPackage />}
          tone="blue"
          loading={loading}
        />

        <ReportStatCard
          title="Receivables"
          value={formatCurrency(
            summary.receivables
          )}
          count="Unpaid sales"
          icon={<FiArrowDownRight />}
          tone="amber"
          loading={loading}
        />

        <ReportStatCard
          title="Payables"
          value={formatCurrency(
            summary.payables
          )}
          count="Unpaid purchases"
          icon={<FiArrowUpRight />}
          tone="rose"
          loading={loading}
        />

        <ReportStatCard
          title="Payments"
          value={formatCurrency(
            summary.totalPayments
          )}
          count={`${formatNumber(
            summary.paymentCount
          )} payments`}
          icon={<FiDollarSign />}
          tone="violet"
          loading={loading}
        />

        <ReportStatCard
          title="Net Difference"
          value={formatCurrency(
            summary.profit
          )}
          count="Sales minus purchases"
          icon={<FiTrendingUp />}
          tone={
            summary.profit >= 0
              ? 'emerald'
              : 'rose'
          }
          loading={loading}
        />

        <ReportStatCard
          title="Stock Value"
          value="Not available"
          count="No stock API connected"
          icon={<FiBox />}
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

      {/* Business comparison */}

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Sales vs Purchases
              </h3>

              <p className="mt-1 text-xs text-slate-500">
                Based on actual API totals
              </p>
            </div>

            <div className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-50 text-cyan-600">
              <FiTrendingUp
                size={16}
              />
            </div>
          </div>

          <ComparisonBar
            label="Sales"
            value={summary.sales}
            max={Math.max(
              summary.sales,
              summary.purchases,
              1
            )}
            tone="cyan"
          />

          <ComparisonBar
            label="Purchases"
            value={summary.purchases}
            max={Math.max(
              summary.sales,
              summary.purchases,
              1
            )}
            tone="blue"
          />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Receivables vs Payables
              </h3>

              <p className="mt-1 text-xs text-slate-500">
                Current outstanding API records
              </p>
            </div>

            <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-50 text-amber-600">
              <FiCreditCard
                size={16}
              />
            </div>
          </div>

          <ComparisonBar
            label="Receivables"
            value={summary.receivables}
            max={Math.max(
              summary.receivables,
              summary.payables,
              1
            )}
            tone="amber"
          />

          <ComparisonBar
            label="Payables"
            value={summary.payables}
            max={Math.max(
              summary.receivables,
              summary.payables,
              1
            )}
            tone="rose"
          />
        </div>
      </div>

      {/* Recent actual API data */}

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <RecentInvoices
          invoices={invoices}
        />

        <RecentPurchases
          purchases={purchases}
        />
      </div>

      {/* Payment data status */}

      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-slate-600 shadow-sm">
            <FiCreditCard
              size={16}
            />
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-800">
              Payment data
            </h3>

            <p className="mt-1 text-xs leading-5 text-slate-500">
              {payments
                ? `${formatNumber(
                    payments.length
                  )} payment records were returned by the payments API for this period.`
                : 'Payment API data is currently unavailable.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// STAT CARD
// ============================================================

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
  tone:
    | 'cyan'
    | 'blue'
    | 'emerald'
    | 'amber'
    | 'rose'
    | 'violet'
    | 'slate';
  loading: boolean;
}) {
  const tones = {
    cyan: {
      icon: 'bg-cyan-50 text-cyan-600',
      line: 'bg-cyan-500',
    },
    blue: {
      icon: 'bg-blue-50 text-blue-600',
      line: 'bg-blue-500',
    },
    emerald: {
      icon: 'bg-emerald-50 text-emerald-600',
      line: 'bg-emerald-500',
    },
    amber: {
      icon: 'bg-amber-50 text-amber-600',
      line: 'bg-amber-500',
    },
    rose: {
      icon: 'bg-rose-50 text-rose-600',
      line: 'bg-rose-500',
    },
    violet: {
      icon: 'bg-violet-50 text-violet-600',
      line: 'bg-violet-500',
    },
    slate: {
      icon: 'bg-slate-100 text-slate-600',
      line: 'bg-slate-400',
    },
  };

  const current =
    tones[tone];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div
        className={clsx(
          'absolute bottom-0 left-0 h-0.5 w-full',
          current.line
        )}
      />

      <div className="flex items-start justify-between gap-3">
        <div
          className={clsx(
            'grid h-11 w-11 place-items-center rounded-xl',
            current.icon
          )}
        >
          {icon}
        </div>

        <FiArrowUpRight
          size={15}
          className="text-slate-300"
        />
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold text-slate-500">
          {title}
        </p>

        {loading ? (
          <>
            <div className="mt-2 h-7 w-32 animate-pulse rounded-lg bg-slate-100" />
            <div className="mt-2 h-3 w-20 animate-pulse rounded bg-slate-100" />
          </>
        ) : (
          <>
            <p className="mt-1 truncate text-xl font-black tracking-tight text-slate-950">
              {value}
            </p>

            <p className="mt-1 text-[11px] text-slate-400">
              {count}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// COMPARISON BAR
// ============================================================

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
  const width =
    max > 0
      ? Math.min(
          100,
          (value / max) * 100
        )
      : 0;

  const classes = {
    cyan: 'bg-cyan-500',
    blue: 'bg-blue-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
  };

  return (
    <div className="mb-5 last:mb-0">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-600">
          {label}
        </span>

        <span className="text-xs font-bold text-slate-900">
          {formatCurrency(value)}
        </span>
      </div>

      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={clsx(
            'h-full rounded-full transition-all duration-500',
            classes[tone]
          )}
          style={{
            width: `${width}%`,
          }}
        />
      </div>
    </div>
  );
}

// ============================================================
// RECENT INVOICES
// ============================================================

function RecentInvoices({
  invoices,
}: {
  invoices: Invoice[] | null;
}) {
  const rows =
    invoices
      ?.slice()
      .sort((a, b) =>
        String(
          b.created_at ?? ''
        ).localeCompare(
          String(a.created_at ?? '')
        )
      )
      .slice(0, 5) ?? [];

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            Recent Sales
          </h3>

          <p className="mt-0.5 text-[11px] text-slate-500">
            Latest invoices returned by API
          </p>
        </div>

        <FiShoppingCart
          size={17}
          className="text-cyan-600"
        />
      </div>

      <div className="divide-y divide-slate-100">
        {!rows.length ? (
          <EmptyList />
        ) : (
          rows.map((invoice) => (
            <div
              key={invoice.id}
              className="flex items-center justify-between gap-3 px-5 py-3.5"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-slate-800">
                  {invoice.invoice_no}
                </p>

                <p className="mt-0.5 truncate text-[11px] text-slate-500">
                  {invoice.customer?.name ||
                    'Customer not provided'}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className="text-xs font-bold text-slate-900">
                  {formatCurrency(
                    safeNum(
                      invoice.total_amount
                    )
                  )}
                </p>

                <StatusBadge
                  status={
                    invoice.status
                  }
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================
// RECENT PURCHASES
// ============================================================

function RecentPurchases({
  purchases,
}: {
  purchases:
    | PurchaseInvoice[]
    | null;
}) {
  const rows =
    purchases
      ?.slice()
      .sort((a, b) =>
        String(
          b.purchase_date ?? ''
        ).localeCompare(
          String(
            a.purchase_date ?? ''
          )
        )
      )
      .slice(0, 5) ?? [];

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            Recent Purchases
          </h3>

          <p className="mt-0.5 text-[11px] text-slate-500">
            Latest purchase records returned by API
          </p>
        </div>

        <FiPackage
          size={17}
          className="text-blue-600"
        />
      </div>

      <div className="divide-y divide-slate-100">
        {!rows.length ? (
          <EmptyList />
        ) : (
          rows.map((purchase) => (
            <div
              key={purchase.id}
              className="flex items-center justify-between gap-3 px-5 py-3.5"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-slate-800">
                  {purchase.purchase_number}
                </p>

                <p className="mt-0.5 truncate text-[11px] text-slate-500">
                  {purchase.supplier?.name ||
                    'Supplier not provided'}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className="text-xs font-bold text-slate-900">
                  {formatCurrency(
                    safeNum(
                      purchase.grand_total
                    )
                  )}
                </p>

                <StatusBadge
                  status={
                    purchase.status
                  }
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================
// SALES TABLE
// ============================================================

function SalesTable({
  invoices,
  loading,
  onCSV,
}: {
  invoices: Invoice[];
  loading: boolean;
  onCSV: () => void;
}) {
  return (
    <ReportSection
      title="Sales Summary"
      description="Sales invoices returned by the invoices API for the selected period."
      count={invoices.length}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <TableHeader>
                Invoice No.
              </TableHeader>

              <TableHeader>
                Customer
              </TableHeader>

              <TableHeader align="right">
                Amount
              </TableHeader>

              <TableHeader>
                Date
              </TableHeader>

              <TableHeader>
                Status
              </TableHeader>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <LoadingRow colSpan={5} />
            ) : !invoices.length ? (
              <EmptyRow colSpan={5} />
            ) : (
              invoices.map((invoice) => (
                <tr
                  key={invoice.id}
                  className="border-b border-slate-100 transition hover:bg-slate-50"
                >
                  <td className="px-4 py-3.5 font-bold text-slate-900">
                    {invoice.invoice_no}
                  </td>

                  <td className="px-4 py-3.5 text-slate-600">
                    {invoice.customer?.name ||
                      '-'}
                  </td>

                  <td className="px-4 py-3.5 text-right font-bold text-slate-900">
                    {formatCurrency(
                      safeNum(
                        invoice.total_amount
                      )
                    )}
                  </td>

                  <td className="px-4 py-3.5 text-slate-500">
                    {formatDate(
                      invoice.created_at
                    )}
                  </td>

                  <td className="px-4 py-3.5">
                    <StatusBadge
                      status={
                        invoice.status
                      }
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ExportButtons
        onCSV={onCSV}
        onPrint={() =>
          window.print()
        }
      />
    </ReportSection>
  );
}

// ============================================================
// PURCHASE TABLE
// ============================================================

function PurchaseTable({
  purchases,
  loading,
  onCSV,
}: {
  purchases: PurchaseInvoice[];
  loading: boolean;
  onCSV: () => void;
}) {
  return (
    <ReportSection
      title="Purchase Summary"
      description="Purchase invoices returned by the purchase API for the selected period."
      count={purchases.length}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <TableHeader>
                Purchase No.
              </TableHeader>

              <TableHeader>
                Supplier
              </TableHeader>

              <TableHeader align="right">
                Amount
              </TableHeader>

              <TableHeader>
                Date
              </TableHeader>

              <TableHeader>
                Status
              </TableHeader>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <LoadingRow colSpan={5} />
            ) : !purchases.length ? (
              <EmptyRow colSpan={5} />
            ) : (
              purchases.map(
                (purchase) => (
                  <tr
                    key={purchase.id}
                    className="border-b border-slate-100 transition hover:bg-slate-50"
                  >
                    <td className="px-4 py-3.5 font-bold text-slate-900">
                      {
                        purchase.purchase_number
                      }
                    </td>

                    <td className="px-4 py-3.5 text-slate-600">
                      {purchase.supplier?.name ||
                        '-'}
                    </td>

                    <td className="px-4 py-3.5 text-right font-bold text-slate-900">
                      {formatCurrency(
                        safeNum(
                          purchase.grand_total
                        )
                      )}
                    </td>

                    <td className="px-4 py-3.5 text-slate-500">
                      {formatDate(
                        purchase.purchase_date
                      )}
                    </td>

                    <td className="px-4 py-3.5">
                      <StatusBadge
                        status={
                          purchase.status
                        }
                      />
                    </td>
                  </tr>
                )
              )
            )}
          </tbody>
        </table>
      </div>

      <ExportButtons
        onCSV={onCSV}
        onPrint={() =>
          window.print()
        }
      />
    </ReportSection>
  );
}

// ============================================================
// LEDGER TABLE
// ============================================================

function LedgerTable({
  ledger,
  loading,
  onCSV,
}: {
  ledger: LedgerEntry[];
  loading: boolean;
  onCSV: () => void;
}) {
  return (
    <ReportSection
      title="General Ledger"
      description="Ledger transactions returned by the ledger API for the selected period."
      count={ledger.length}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[850px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <TableHeader>
                Date
              </TableHeader>

              <TableHeader>
                Description
              </TableHeader>

              <TableHeader align="right">
                Debit
              </TableHeader>

              <TableHeader align="right">
                Credit
              </TableHeader>

              <TableHeader align="right">
                Balance
              </TableHeader>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <LoadingRow colSpan={5} />
            ) : !ledger.length ? (
              <EmptyRow colSpan={5} />
            ) : (
              ledger.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-slate-100 transition hover:bg-slate-50"
                >
                  <td className="px-4 py-3.5 text-slate-500">
                    {formatDate(
                      entry.date
                    )}
                  </td>

                  <td className="px-4 py-3.5 font-semibold text-slate-800">
                    {entry.description}
                  </td>

                  <td className="px-4 py-3.5 text-right font-medium text-rose-600">
                    {formatCurrency(
                      safeNum(
                        entry.debit
                      )
                    )}
                  </td>

                  <td className="px-4 py-3.5 text-right font-medium text-emerald-600">
                    {formatCurrency(
                      safeNum(
                        entry.credit
                      )
                    )}
                  </td>

                  <td className="px-4 py-3.5 text-right font-bold text-slate-900">
                    {formatCurrency(
                      safeNum(
                        entry.balance
                      )
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ExportButtons
        onCSV={onCSV}
        onPrint={() =>
          window.print()
        }
      />
    </ReportSection>
  );
}

// ============================================================
// REPORT SECTION
// ============================================================

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
            <h2 className="text-xl font-black tracking-tight text-slate-950">
              {title}
            </h2>

            {typeof count ===
              'number' && (
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">
                {formatNumber(
                  count
                )}{' '}
                records
              </span>
            )}
          </div>

          {description && (
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {description}
            </p>
          )}
        </div>

        <div className="inline-flex items-center gap-1.5 self-start rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 sm:self-auto">
          <FiCheckCircle
            size={12}
          />
          API Data
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {children}
      </div>
    </section>
  );
}

// ============================================================
// EXPORT BUTTONS
// ============================================================

function ExportButtons({
  onCSV,
  onPrint,
}: {
  onCSV: () => void;
  onPrint: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 p-4">
      <p className="text-[11px] text-slate-400">
        Exporting current API-loaded records
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCSV}
          className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-cyan-700"
        >
          <FiDownload
            size={13}
          />
          CSV
        </button>

        <button
          type="button"
          onClick={onPrint}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
        >
          <FiPrinter
            size={13}
          />
          Print
        </button>
      </div>
    </div>
  );
}

// ============================================================
// TABLE HEADER
// ============================================================

function TableHeader({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <th
      className={clsx(
        'px-4 py-3 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500',
        align === 'right'
          ? 'text-right'
          : 'text-left'
      )}
    >
      {children}
    </th>
  );
}

// ============================================================
// FILTER FIELD
// ============================================================

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </label>

      {children}
    </div>
  );
}

// ============================================================
// STATUS BADGE
// ============================================================

function StatusBadge({
  status,
}: {
  status?: string;
}) {
  const normalized =
    status?.toLowerCase() ?? '';

  let classes =
    'border-slate-200 bg-slate-50 text-slate-600';

  let Icon =
    FiClock;

  if (
    [
      'completed',
      'delivered',
      'paid',
      'success',
      'successful',
    ].includes(normalized)
  ) {
    classes =
      'border-emerald-200 bg-emerald-50 text-emerald-700';
    Icon = FiCheckCircle;
  } else if (
    [
      'pending',
      'processing',
      'partial',
      'unpaid',
    ].includes(normalized)
  ) {
    classes =
      'border-amber-200 bg-amber-50 text-amber-700';
    Icon = FiClock;
  } else if (
    [
      'cancelled',
      'canceled',
      'failed',
    ].includes(normalized)
  ) {
    classes =
      'border-rose-200 bg-rose-50 text-rose-700';
    Icon = FiXCircle;
  }

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide',
        classes
      )}
    >
      <Icon size={10} />
      {status || 'Unknown'}
    </span>
  );
}

// ============================================================
// LOADING ROW
// ============================================================

function LoadingRow({
  colSpan,
}: {
  colSpan: number;
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-4 py-16 text-center"
      >
        <div className="inline-flex flex-col items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-50 text-cyan-600">
            <FiRefreshCw
              size={17}
              className="animate-spin"
            />
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-700">
              Loading report data
            </p>

            <p className="mt-1 text-xs text-slate-400">
              Waiting for the backend API response...
            </p>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ============================================================
// EMPTY ROW
// ============================================================

function EmptyRow({
  colSpan,
}: {
  colSpan: number;
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-4 py-16 text-center"
      >
        <div className="mx-auto flex max-w-sm flex-col items-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
            <FiDatabase
              size={20}
            />
          </div>

          <p className="mt-3 text-sm font-semibold text-slate-700">
            No API records found
          </p>

          <p className="mt-1 text-xs leading-5 text-slate-400">
            No records were returned for the selected reporting period or filters.
          </p>
        </div>
      </td>
    </tr>
  );
}

// ============================================================
// EMPTY LIST
// ============================================================

function EmptyList() {
  return (
    <div className="px-5 py-10 text-center">
      <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-400">
        <FiFileText
          size={17}
        />
      </div>

      <p className="mt-2 text-xs font-semibold text-slate-600">
        No API records
      </p>
    </div>
  );
}

// ============================================================
// EMPTY REPORT
// ============================================================

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

      <h3 className="mt-5 text-lg font-black text-slate-800">
        {title}
      </h3>

      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
        {description}
      </p>

      <div className="mt-5 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500">
        <FiLayers size={13} />
        Choose a report above
      </div>
    </div>
  );
}

// ============================================================
// COMING SOON / API NOT CONNECTED
// ============================================================

function ComingSoonReport({
  title,
}: {
  title: string;
}) {
  return (
    <div className="flex min-h-[440px] flex-col items-center justify-center rounded-2xl border border-dashed border-amber-200 bg-amber-50/40 px-5 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl border border-amber-100 bg-white text-amber-500 shadow-sm">
        <FiFileText
          size={24}
        />
      </div>

      <h3 className="mt-5 text-lg font-black text-slate-800">
        {title}
      </h3>

      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
        This report is not displayed with fabricated or mock values.
        Connect its backend API before showing real report results.
      </p>

      <div className="mt-5 inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-amber-700">
        <FiDatabase size={13} />
        Backend API required
      </div>
    </div>
  );
}