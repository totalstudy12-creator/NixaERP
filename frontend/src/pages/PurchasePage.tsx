import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  lazy,
  Suspense,
  memo,
  useRef,
  startTransition,
} from 'react';
import ReactDOM from 'react-dom';
import {
  FiPlus,
  FiRefreshCw,
  FiTrash2,
  FiDownload,
  FiEye,
  FiEdit,
  FiCheckCircle,
  FiAlertCircle,
  FiFilter,
  FiSearch,
  FiDollarSign,
  FiCalendar,
  FiClock,
  FiUser,
  FiHash,
  FiChevronDown,
  FiChevronRight,
  FiMail,
  FiPrinter,
  FiPackage,
  FiCreditCard,
  FiCopy,
  FiMoreVertical,
  FiFileText,
} from 'react-icons/fi';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';
import InvoicePrint from '../components/InvoicePrint';

// ---------- Lazy loaded heavy components ----------
const ModernDataTable = lazy(() =>
  import('../components/ModernDataTable').then(m => ({ default: m.ModernDataTable }))
);
const Offcanvas = lazy(() =>
  import('../components/Offcanvas').then(m => ({ default: m.Offcanvas }))
);

// ---------- Types ----------
interface Supplier {
  id: number;
  name: string;
  email?: string;
}

interface PurchaseInvoice {
  id: number;
  purchase_number: string;
  bill_number?: string;
  supplier_id: number;
  supplier: Supplier;
  grand_total: number | string;
  paid_amount: number | string;
  status: string;
  payment_status: string;
  purchase_date: string;
  due_date: string | null;
  warehouse?: string;
  created_at?: string;
  updated_at?: string;
  items?: any[];
  payments?: any[];
  company_id?: number;
}

// ---------- Simple API Cache Hook (with cleanup) ----------
const cache = new Map<string, { data: any; timestamp: number }>();

function useApiCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = 300_000
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchData = useCallback(async (skipCache = false) => {
    if (!skipCache) {
      const entry = cache.get(key);
      if (entry && Date.now() - entry.timestamp < ttlMs) {
        setData(entry.data);
        setLoading(false);
        return;
      }
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetcher();
      if (!mountedRef.current) return;
      const result = Array.isArray(res) ? res : (res as any).data ?? [];
      cache.set(key, { data: result, timestamp: Date.now() });
      setData(result);
    } catch (err: any) {
      if (!mountedRef.current) return;
      setError(err.message || 'Failed to load');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [key, fetcher, ttlMs]);

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchData]);

  return { data, loading, error, refresh: () => fetchData(true) };
}

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

const TableSkeleton = memo(() => (
  <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4 animate-pulse">
    <div className="h-6 w-48 bg-slate-200 rounded" />
    {[...Array(10)].map((_, i) => (
      <div key={i} className="flex gap-4">
        <div className="h-4 w-1/4 bg-slate-200 rounded" />
        <div className="h-4 w-1/5 bg-slate-200 rounded" />
        <div className="h-4 w-1/6 bg-slate-200 rounded" />
        <div className="h-4 w-1/6 bg-slate-200 rounded" />
        <div className="h-4 w-1/4 bg-slate-200 rounded" />
      </div>
    ))}
  </div>
));

const StatCard = memo(
  ({
    icon: Icon,
    label,
    value,
    tone,
    prefix,
  }: {
    icon: any;
    label: string;
    value: string | number;
    tone: 'blue' | 'emerald' | 'amber' | 'rose' | 'purple' | 'teal' | 'slate';
    prefix?: string;
  }) => {
    const bg =
      tone === 'blue'
        ? 'bg-blue-100 text-blue-600'
        : tone === 'emerald'
        ? 'bg-emerald-100 text-emerald-600'
        : tone === 'amber'
        ? 'bg-amber-100 text-amber-600'
        : tone === 'rose'
        ? 'bg-rose-100 text-rose-600'
        : tone === 'purple'
        ? 'bg-purple-100 text-purple-600'
        : tone === 'slate'
        ? 'bg-slate-100 text-slate-600'
        : 'bg-teal-100 text-teal-600';
    return (
      <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${bg}`}>
          <Icon size={20} />
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="text-2xl font-bold text-slate-900">
            {prefix}
            {value}
          </p>
        </div>
      </div>
    );
  }
);

// ---------- Portal-based Action Dropdown (all actions except View) ----------
const ActionDropdown = memo(
  ({
    row,
    onPrint,
    onRecordPayment,
    onDuplicate,
    onDelete,
  }: {
    row: PurchaseInvoice;
    onPrint: (p: PurchaseInvoice) => void;
    onRecordPayment: (p: PurchaseInvoice) => void;
    onDuplicate: (p: PurchaseInvoice) => void;
    onDelete: (p: PurchaseInvoice) => void;
  }) => {
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

    const toggle = useCallback(() => {
      startTransition(() => {
        setOpen(prev => {
          const willOpen = !prev;
          if (willOpen && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            // If not enough space below, show above
            const top =
              rect.bottom + 4 + 280 > viewportHeight
                ? rect.top - 4 - 280
                : rect.bottom + 4;
            setMenuStyle({
              position: 'fixed',
              left: rect.left,
              top: top,
              minWidth: 200,
            });
          }
          return willOpen;
        });
      });
    }, []);

    useEffect(() => {
      if (!open) return;
      const handler = (e: MouseEvent) => {
        if (
          menuRef.current &&
          !menuRef.current.contains(e.target as Node) &&
          buttonRef.current &&
          !buttonRef.current.contains(e.target as Node)
        ) {
          startTransition(() => setOpen(false));
        }
      };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const closeAndAct = useCallback((action: () => void) => {
      startTransition(() => setOpen(false));
      action();
    }, []);

    return (
      <>
        <button
          ref={buttonRef}
          onClick={toggle}
          className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
          title="More actions"
        >
          <FiMoreVertical size={16} />
        </button>
        {open &&
          ReactDOM.createPortal(
            <div
              ref={menuRef}
              style={menuStyle}
              className="z-[9999] bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 animate-fadeIn"
            >
              {/* Edit */}
              <Link
                to={`/purchases/${row.id}/edit`}
                className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                onClick={() => closeAndAct(() => {})}
              >
                <FiEdit size={16} className="text-slate-500" /> Edit
              </Link>

              {/* Duplicate */}
              <button
                onClick={() => closeAndAct(() => onDuplicate(row))}
                className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
              >
                <FiCopy size={16} className="text-slate-500" /> Duplicate
              </button>

              <div className="border-t border-slate-200 my-1"></div>

              {/* Print */}
              <button
                onClick={() => closeAndAct(() => onPrint(row))}
                className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
              >
                <FiPrinter size={16} className="text-slate-500" /> Print
              </button>

              {/* Record Payment */}
              <button
                onClick={() => closeAndAct(() => onRecordPayment(row))}
                className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
              >
                <FiCreditCard size={16} className="text-slate-500" /> Record Payment
              </button>

              <div className="border-t border-slate-200 my-1"></div>

              {/* Delete */}
              <button
                onClick={() => closeAndAct(() => onDelete(row))}
                className="w-full text-left px-4 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50 flex items-center gap-2 transition-colors"
              >
                <FiTrash2 size={16} /> Delete
              </button>
            </div>,
            document.body
          )}
      </>
    );
  }
);

// ---------- Main Component ----------
export function PurchasePage() {
  const navigate = useNavigate();
  const { showSuccess, showError } = useNotification();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterMonth, setFilterMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [isViewPanelOpen, setIsViewPanelOpen] = useState(false);
  const [viewingPurchase, setViewingPurchase] = useState<PurchaseInvoice | null>(null);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const [printInvoice, setPrintInvoice] = useState<PurchaseInvoice | null>(null);
  const printTriggered = useRef(false);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [payingPurchase, setPayingPurchase] = useState<PurchaseInvoice | null>(null);
  const [payAmt, setPayAmt] = useState('');
  const [payMethod, setPayMethod] = useState('Bank Transfer');
  const [paySubmitting, setPaySubmitting] = useState(false);

  const {
    data: purchases,
    loading,
    error,
    refresh,
  } = useApiCache<PurchaseInvoice[]>('purchases', () => apiClient.getPurchases());

  const filteredPurchases = useMemo(() => {
    if (!purchases) return [];
    let filtered = [...purchases];
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        p =>
          p.purchase_number?.toLowerCase().includes(term) ||
          (p.supplier?.name || '').toLowerCase().includes(term) ||
          p.status?.toLowerCase().includes(term)
      );
    }
    if (filterStatus !== 'all') {
      filtered = filtered.filter(p => p.status === filterStatus);
    }
    if (filterMonth) {
      filtered = filtered.filter(p => p.purchase_date?.startsWith(filterMonth));
    }
    return filtered;
  }, [purchases, searchTerm, filterStatus, filterMonth]);

  const safeNum = (val: any) => {
    const n = typeof val === 'number' ? val : parseFloat(val);
    return isNaN(n) ? 0 : n;
  };

  const summary = useMemo(() => {
    if (!purchases) return { total: 0, totalAmount: 0, paidAmount: 0, outstanding: 0 };
    const total = purchases.length;
    const totalAmount = purchases.reduce((s, p) => s + safeNum(p.grand_total), 0);
    const paidAmount = purchases.reduce((s, p) => s + safeNum(p.paid_amount), 0);
    const outstanding = totalAmount - paidAmount;
    return { total, totalAmount, paidAmount, outstanding };
  }, [purchases]);

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;
  const totalPages = Math.ceil(filteredPurchases.length / rowsPerPage);
  const paginatedPurchases = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredPurchases.slice(start, start + rowsPerPage);
  }, [filteredPurchases, currentPage]);

  useEffect(() => setCurrentPage(1), [searchTerm, filterStatus, filterMonth]);

  const handlePrint = useCallback((invoice: PurchaseInvoice) => {
    setPrintInvoice(invoice);
    printTriggered.current = false;
  }, []);

  useEffect(() => {
    if (printInvoice && !printTriggered.current) {
      const timer = setTimeout(() => {
        window.print();
        printTriggered.current = true;
        setPrintInvoice(null);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [printInvoice]);

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Delete ${selectedIds.length} purchase(s)?`)) return;
    try {
      await Promise.all(selectedIds.map(id => apiClient.deletePurchase(id)));
      showSuccess('Bulk delete', `${selectedIds.length} purchase(s) deleted.`);
      addAppLog({ module: 'Purchases', action: 'Bulk delete', status: 'success', message: `Deleted ${selectedIds.length} purchases` });
      startTransition(() => setSelectedIds([]));
      refresh();
    } catch (err: any) {
      showError('Bulk delete failed', err.message);
    }
  };

  const handleBulkStatusChange = async (status: string) => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Change ${selectedIds.length} purchase(s) to "${status}"?`)) return;
    try {
      await Promise.all(selectedIds.map(id => apiClient.updatePurchase(id, { status } as any)));
      showSuccess('Bulk update', `${selectedIds.length} purchase(s) updated.`);
      addAppLog({ module: 'Purchases', action: 'Bulk status change', status: 'success', message: `Changed status to ${status} for ${selectedIds.length} purchases` });
      startTransition(() => setSelectedIds([]));
      refresh();
    } catch (err: any) {
      showError('Bulk update failed', err.message);
    }
  };

  const handleView = useCallback((purchase: PurchaseInvoice) => {
    setViewingPurchase(purchase);
    setIsViewPanelOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (purchase: PurchaseInvoice) => {
      if (!confirm(`Delete purchase ${purchase.purchase_number}?`)) return;
      try {
        await apiClient.deletePurchase(purchase.id);
        showSuccess('Purchase deleted', `Purchase ${purchase.purchase_number} removed.`);
        addAppLog({ module: 'Purchases', action: 'Delete', status: 'success', message: `Deleted ${purchase.purchase_number}` });
        refresh();
      } catch (err: any) {
        showError('Delete failed', err.message);
      }
    },
    [refresh, showSuccess, showError]
  );

  const handleDuplicate = useCallback(
    async (purchase: PurchaseInvoice) => {
      try {
        // Enable this when API supports it:
        // await apiClient.duplicatePurchase(purchase.id);
        // showSuccess('Duplicated', `Purchase ${purchase.purchase_number} duplicated.`);
        // refresh();
        showError('Not available', 'Duplicate feature is not yet integrated.');
      } catch (err: any) {
        showError('Duplicate failed', err.message);
      }
    },
    [refresh, showSuccess, showError]
  );

  const handleRecordPaymentTrigger = useCallback((purchase: PurchaseInvoice) => {
    setPayingPurchase(purchase);
    setPayAmt('');
    setPayMethod('Bank Transfer');
    setShowPaymentModal(true);
  }, []);

  const handleRecordPaymentSubmit = async () => {
    if (!payingPurchase) return;
    const amount = parseFloat(payAmt);
    if (isNaN(amount) || amount <= 0) {
      showError('Validation', 'Please enter a valid amount.');
      return;
    }
    setPaySubmitting(true);
    try {
      await apiClient.createPayment({
        company_id: payingPurchase.company_id || null,
        payable_id: payingPurchase.id,
        payable_type: 'PurchaseInvoice',
        amount,
        payment_method: payMethod,
        payment_date: new Date().toISOString().split('T')[0],
        reference: '',
      });
      showSuccess('Payment recorded', `₹${amount.toFixed(2)} received.`);
      addAppLog({
        module: 'Purchases',
        action: 'Record Payment',
        status: 'success',
        message: `Payment of ₹${amount} for ${payingPurchase.purchase_number}`,
      });
      setShowPaymentModal(false);
      setPayingPurchase(null);
      refresh();
    } catch (err: any) {
      showError('Payment failed', err.message);
    } finally {
      setPaySubmitting(false);
    }
  };

  const escapeCsvField = (value: string) => {
    if (/[",\n\r]/.test(value)) return '"' + value.replace(/"/g, '""') + '"';
    return value;
  };

  const handleExport = useCallback(() => {
    if (filteredPurchases.length === 0) {
      showError('Export failed', 'No data');
      return;
    }
    const headers = ['Purchase #', 'Supplier', 'Date', 'Total', 'Paid', 'Outstanding', 'Status', 'Payment'];
    const rows = filteredPurchases.map(p =>
      [
        escapeCsvField(p.purchase_number),
        escapeCsvField(p.supplier?.name || ''),
        p.purchase_date,
        safeNum(p.grand_total).toFixed(2),
        safeNum(p.paid_amount).toFixed(2),
        (safeNum(p.grand_total) - safeNum(p.paid_amount)).toFixed(2),
        p.status,
        p.payment_status,
      ].join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `purchases-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showSuccess('Export', 'File downloaded.');
  }, [filteredPurchases, showSuccess, showError]);

  const columns = useMemo(
    () => [
      {
        name: 'Purchase #',
        selector: (row: PurchaseInvoice) => row.purchase_number,
        sortable: true,
        cell: (row: PurchaseInvoice) => (
          <span className="font-medium text-blue-700">{row.purchase_number}</span>
        ),
        width: '140px',
      },
      {
        name: 'Supplier',
        selector: (row: PurchaseInvoice) => row.supplier?.name || '-',
        cell: (row: PurchaseInvoice) => (
          <span className="text-sm">{row.supplier?.name || '-'}</span>
        ),
        width: '180px',
      },
      {
        name: 'Date',
        selector: (row: PurchaseInvoice) => row.purchase_date,
        sortable: true,
        width: '100px',
      },
      {
        name: 'Total',
        selector: (row: PurchaseInvoice) => safeNum(row.grand_total),
        sortable: true,
        cell: (row: PurchaseInvoice) => (
          <span className="font-medium">₹{safeNum(row.grand_total).toFixed(2)}</span>
        ),
        width: '120px',
      },
      {
        name: 'Outstanding',
        selector: (row: PurchaseInvoice) => safeNum(row.grand_total) - safeNum(row.paid_amount),
        sortable: true,
        cell: (row: PurchaseInvoice) => {
          const out = safeNum(row.grand_total) - safeNum(row.paid_amount);
          return (
            <span className={`font-medium ${out > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              ₹{out.toFixed(2)}
            </span>
          );
        },
        width: '120px',
      },
      {
        name: 'Status',
        selector: (row: PurchaseInvoice) => row.status,
        cell: (row: PurchaseInvoice) => {
          const colors: Record<string, string> = {
            Draft: 'bg-slate-100 text-slate-600',
            Ordered: 'bg-indigo-100 text-indigo-700',
            Received: 'bg-cyan-100 text-cyan-700',
            Completed: 'bg-emerald-100 text-emerald-700',
            Cancelled: 'bg-rose-100 text-rose-700',
          };
          return (
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-medium ${colors[row.status] || 'bg-slate-100'}`}
            >
              {row.status}
            </span>
          );
        },
        width: '120px',
      },
      {
        name: 'Payment',
        selector: (row: PurchaseInvoice) => row.payment_status,
        cell: (row: PurchaseInvoice) => {
          const paid = row.payment_status === 'Paid';
          return (
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                paid ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
              }`}
            >
              {row.payment_status}
            </span>
          );
        },
        width: '100px',
      },
      {
        name: 'Actions',
        cell: (row: PurchaseInvoice) => (
          <div className="flex items-center gap-1">
            {/* Only View button remains outside the dropdown */}
            <button
              onClick={() => handleView(row)}
              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
              title="View details"
            >
              <FiEye size={16} />
            </button>
            <ActionDropdown
              row={row}
              onPrint={handlePrint}
              onRecordPayment={handleRecordPaymentTrigger}
              onDuplicate={handleDuplicate}
              onDelete={handleDelete}
            />
          </div>
        ),
        width: '120px',
      },
    ],
    [handleView, handleDelete, handleDuplicate, handlePrint, handleRecordPaymentTrigger]
  );

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-white p-8 rounded-xl shadow text-center max-w-md">
          <FiAlertCircle size={48} className="mx-auto text-rose-500" />
          <h2 className="text-xl font-bold mt-4">Failed to load purchases</h2>
          <p className="text-slate-600 mt-2">{error}</p>
          <button
            onClick={refresh}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 md:p-7 text-slate-800">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 mb-6 rounded-3xl bg-slate-950 px-5 py-6 md:px-8 md:py-7 shadow-xl">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> Purchase Management
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl flex items-center gap-3">
            <FiPackage className="text-cyan-300" /> Purchases
          </h1>
          <p className="text-sm text-slate-300">Procurement & supplier payments</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            disabled={loading}
            className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 hover:bg-white/20 disabled:opacity-60 transition-colors"
          >
            <FiRefreshCw className={loading ? 'animate-spin inline mr-1' : 'inline mr-1'} size={14} /> Refresh
          </button>
          <button
            onClick={handleExport}
            className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 hover:bg-white/20 transition-colors"
          >
            <FiDownload className="inline mr-1" size={14} /> Export
          </button>
          <Link
            to="/purchases/create"
            className="rounded-xl bg-cyan-400 text-slate-950 px-3 py-2 text-sm font-medium hover:bg-cyan-300 shadow-md inline-flex items-center transition-colors"
          >
            <FiPlus className="mr-1" size={14} /> Create Purchase
          </Link>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <FiSearch className="absolute left-3 top-2.5 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search by purchase #, supplier..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 transition-all duration-200"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FiFilter size={16} className="text-slate-500" />
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="w-36 text-sm rounded-xl border-slate-200 bg-white py-2 px-3 focus:ring-cyan-100"
          >
            <option value="all">All Status</option>
            <option value="Draft">Draft</option>
            <option value="Ordered">Ordered</option>
            <option value="Received">Received</option>
            <option value="Completed">Completed</option>
          </select>
          <input
            type="month"
            value={filterMonth}
            onChange={e => setFilterMonth(e.target.value)}
            className="w-44 text-sm rounded-xl border-slate-200 bg-white py-2 px-3 focus:ring-cyan-100"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {purchases ? (
          <>
            <StatCard icon={FiPackage} label="Total Purchases" value={summary.total} tone="blue" />
            <StatCard icon={FiDollarSign} label="Total Amount" value={summary.totalAmount.toFixed(2)} tone="teal" prefix="₹" />
            <StatCard icon={FiCheckCircle} label="Paid" value={summary.paidAmount.toFixed(2)} tone="emerald" prefix="₹" />
            <StatCard icon={FiAlertCircle} label="Outstanding" value={summary.outstanding.toFixed(2)} tone="rose" prefix="₹" />
          </>
        ) : (
          [...Array(4)].map((_, i) => <StatCardSkeleton key={i} />)
        )}
      </div>

      {selectedIds.length > 0 && (
        <div className="bg-white p-3 rounded-xl shadow-sm border mb-4 flex flex-wrap items-center gap-3 animate-fadeIn">
          <span className="text-sm font-medium text-slate-700">{selectedIds.length} selected</span>
          <button
            onClick={() => handleBulkStatusChange('Received')}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-600 transition-colors"
          >
            <FiCheckCircle size={16} /> Mark Received
          </button>
          <button
            onClick={handleBulkDelete}
            className="inline-flex items-center gap-2 rounded-lg bg-rose-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-600 transition-colors"
          >
            <FiTrash2 size={16} /> Delete
          </button>
          <button
            onClick={() => startTransition(() => setSelectedIds([]))}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <Suspense fallback={<TableSkeleton />}>
          {loading ? (
            <TableSkeleton />
          ) : (
            <ModernDataTable
              title="Purchase Orders"
              columns={columns}
              data={paginatedPurchases}
              loading={false}
              selectable
              selectedIds={selectedIds}
              onSelectionChange={(ids: number[]) => startTransition(() => setSelectedIds(ids))}
              striped
              highlightOnHover
              pointerOnHover
            />
          )}
        </Suspense>
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t">
            <span className="text-sm text-slate-600">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => startTransition(() => setCurrentPage(1))}
                disabled={currentPage === 1}
                className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40"
              >
                ««
              </button>
              <button
                onClick={() => startTransition(() => setCurrentPage(p => Math.max(1, p - 1)))}
                disabled={currentPage === 1}
                className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40"
              >
                ‹
              </button>
              <span className="px-3 py-1 text-sm font-medium">
                {currentPage}/{totalPages}
              </span>
              <button
                onClick={() =>
                  startTransition(() => setCurrentPage(p => Math.min(totalPages, p + 1)))
                }
                disabled={currentPage === totalPages}
                className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40"
              >
                ›
              </button>
              <button
                onClick={() => startTransition(() => setCurrentPage(totalPages))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40"
              >
                »»
              </button>
            </div>
          </div>
        )}
      </div>

      {isViewPanelOpen && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
              <div className="bg-white p-8 rounded-2xl">Loading details...</div>
            </div>
          }
        >
          <Offcanvas
            isOpen={isViewPanelOpen}
            title={`Purchase ${viewingPurchase?.purchase_number || ''}`}
            onClose={() => setIsViewPanelOpen(false)}
          >
            {viewingPurchase && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold">{viewingPurchase.purchase_number}</h3>
                  <p className="text-sm text-slate-500">{viewingPurchase.supplier?.name}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-slate-500">Date</p>
                    <p>{viewingPurchase.purchase_date}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Due Date</p>
                    <p>{viewingPurchase.due_date || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Grand Total</p>
                    <p className="font-bold">₹{safeNum(viewingPurchase.grand_total).toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Paid</p>
                    <p>₹{safeNum(viewingPurchase.paid_amount).toFixed(2)}</p>
                  </div>
                </div>
              </div>
            )}
          </Offcanvas>
        </Suspense>
      )}

      {showPaymentModal && payingPurchase && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-semibold mb-4">Record Payment</h3>
            <p className="text-sm mb-4">
              For {payingPurchase.purchase_number} - {payingPurchase.supplier?.name}
            </p>
            <div className="space-y-3">
              <input
                type="number"
                value={payAmt}
                onChange={e => setPayAmt(e.target.value)}
                placeholder="Amount"
                className="w-full rounded-lg border px-3 py-2"
              />
              <select
                value={payMethod}
                onChange={e => setPayMethod(e.target.value)}
                className="w-full rounded-lg border px-3 py-2"
              >
                <option>Cash</option>
                <option>Bank Transfer</option>
                <option>Cheque</option>
                <option>UPI</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowPaymentModal(false)}
                disabled={paySubmitting}
                className="px-4 py-2 rounded-lg border text-slate-600 hover:bg-slate-50 disabled:opacity-60 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRecordPaymentSubmit}
                disabled={paySubmitting}
                className="px-4 py-2 rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-700 disabled:opacity-60 transition-colors flex items-center gap-2"
              >
                {paySubmitting && <FiRefreshCw className="animate-spin" size={14} />}
                Save Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {printInvoice && (
        <InvoicePrint
          invoice={{
            ...printInvoice,
            invoice_no: printInvoice.purchase_number,
            customer: printInvoice.supplier,
            total_amount: printInvoice.grand_total,
            tax_amount: 0,
            items: printInvoice.items ?? [],
          }}
          onReady={() => {}}
        />
      )}

      <style>{`
        .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        .rdt_TableHeader .search-container,
        .rdt_TableHeader input[type="text"] { display: none !important; }
        .rdt_TableHeader > div:last-child { display: none !important; }
        .rdt_TableCol:first-child,
        .rdt_TableCell:first-child { display: none !important; }
      `}</style>
    </div>
  );
}