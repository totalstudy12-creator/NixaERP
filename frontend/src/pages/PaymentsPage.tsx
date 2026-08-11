import { useEffect, useState, useCallback, useMemo, lazy, Suspense, memo } from 'react';
import {
  FiPlus, FiRefreshCw, FiTrash2, FiDownload, FiEye,
  FiEdit, FiCheckCircle, FiAlertCircle, FiFilter,
  FiSearch, FiDollarSign, FiClock, FiXCircle,
  FiChevronDown, FiChevronRight, FiHash, FiCreditCard, FiBook
} from 'react-icons/fi';
import clsx from 'clsx';

// ---------- Lazy loaded heavy components ----------
const ModernDataTable = lazy(() =>
  import('../components/ModernDataTable').then(m => ({ default: m.ModernDataTable }))
);
const Offcanvas = lazy(() =>
  import('../components/Offcanvas').then(m => ({ default: m.Offcanvas }))
);

import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';
import { formatDate, formatDateTime } from '../utils/date';

// ---------- Simple API Cache Hook ----------
const cache = new Map<string, { data: any; timestamp: number }>();

function useApiCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = 300_000
): {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      const result = Array.isArray(res) ? res : (res as any).data ?? [];
      cache.set(key, { data: result, timestamp: Date.now() });
      setData(result);
    } catch (err: any) {
      const msg = err.message || 'Failed to load';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [key, fetcher, ttlMs]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refresh: () => fetchData(true) };
}

// ---------- Types ----------
type PaymentMethod = 'qr' | 'bank_transfer' | 'cash' | 'card';
type PaymentStatus = 'pending' | 'completed' | 'failed' | 'reconciled';

interface Payment {
  id: number;
  reference_no: string;
  amount: number | string;
  payment_method: PaymentMethod;
  status: PaymentStatus;
  bank_name: string;
  account_number: string;
  ledger_reference: string;
  remarks: string;
  created_at?: string;
  updated_at?: string;
}

interface PaymentFormData {
  reference_no: string;
  amount: number | string;
  payment_method: PaymentMethod;
  status: PaymentStatus;
  bank_name: string;
  account_number: string;
  ledger_reference: string;
  remarks: string;
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

const StatCard = memo(({ icon: Icon, label, value, tone, prefix }: {
  icon: any;
  label: string;
  value: string | number;
  tone: 'blue' | 'emerald' | 'amber' | 'rose' | 'purple' | 'teal';
  prefix?: string;
}) => {
  const bg = tone === 'blue' ? 'bg-blue-100 text-blue-600' :
             tone === 'emerald' ? 'bg-emerald-100 text-emerald-600' :
             tone === 'amber' ? 'bg-amber-100 text-amber-600' :
             tone === 'rose' ? 'bg-rose-100 text-rose-600' :
             tone === 'purple' ? 'bg-purple-100 text-purple-600' :
             'bg-teal-100 text-teal-600';
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${bg}`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="text-2xl font-bold text-slate-900">{prefix}{value}</p>
      </div>
    </div>
  );
});

// ---------- Component ----------
export function PaymentsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterMethod, setFilterMethod] = useState<string>('all');

  // View state
  const [isViewPanelOpen, setIsViewPanelOpen] = useState(false);
  const [viewingPayment, setViewingPayment] = useState<Payment | null>(null);

  // Form state
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<PaymentFormData>({
    reference_no: '',
    amount: '',
    payment_method: 'qr',
    status: 'pending',
    bank_name: '',
    account_number: '',
    ledger_reference: '',
    remarks: '',
  });

  // Selection for bulk actions
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // UI expand sections for form
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    paymentDetails: true,
    bankLedger: true,
    remarks: false,
  });

  const { showSuccess, showError } = useNotification();

  // ---------- API Caching ----------
  const {
    data: payments,
    loading: payLoading,
    error: payError,
    refresh: refreshPayments,
  } = useApiCache<Payment[]>('payments', () => apiClient.getPayments());

  // ---------- Filter & Search ----------
  const filteredPayments = useMemo(() => {
    if (!payments) return [];
    let filtered = [...payments];
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(p =>
        p.reference_no?.toLowerCase().includes(term) ||
        p.bank_name?.toLowerCase().includes(term) ||
        p.account_number?.toLowerCase().includes(term) ||
        p.remarks?.toLowerCase().includes(term)
      );
    }
    if (filterStatus !== 'all') filtered = filtered.filter(p => p.status === filterStatus);
    if (filterMethod !== 'all') filtered = filtered.filter(p => p.payment_method === filterMethod);
    return filtered;
  }, [payments, searchTerm, filterStatus, filterMethod]);

  const summary = useMemo(() => {
    if (!payments) return { total: 0, pending: 0, completed: 0, failed: 0, reconciled: 0, totalAmount: 0, completedAmount: 0 };
    const safeNum = (val: any) => {
      const n = typeof val === 'number' ? val : parseFloat(val);
      return isNaN(n) ? 0 : n;
    };
    const total = payments.length;
    const pending = payments.filter(p => p.status === 'pending').length;
    const completed = payments.filter(p => p.status === 'completed').length;
    const failed = payments.filter(p => p.status === 'failed').length;
    const reconciled = payments.filter(p => p.status === 'reconciled').length;
    const totalAmount = payments.reduce((sum, p) => sum + safeNum(p.amount), 0);
    const completedAmount = payments
      .filter(p => p.status === 'completed')
      .reduce((sum, p) => sum + safeNum(p.amount), 0);
    return { total, pending, completed, failed, reconciled, totalAmount, completedAmount };
  }, [payments]);

  // ---------- Pagination ----------
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;
  const totalPages = Math.ceil(filteredPayments.length / rowsPerPage);
  const paginatedPayments = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredPayments.slice(start, start + rowsPerPage);
  }, [filteredPayments, currentPage]);

  useEffect(() => setCurrentPage(1), [searchTerm, filterStatus, filterMethod]);

  // ---------- Bulk actions ----------
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Delete ${selectedIds.length} payment(s)?`)) return;
    try {
      await Promise.all(selectedIds.map(id => apiClient.deletePayment(id)));
      showSuccess('Bulk delete', `${selectedIds.length} payment(s) deleted.`);
      addAppLog({
        module: 'Payments',
        action: 'Bulk delete',
        status: 'success',
        message: `Deleted ${selectedIds.length} payments`,
      });
      setSelectedIds([]);
      refreshPayments();
    } catch (err: any) {
      showError('Bulk delete failed', err.message);
    }
  };

  const handleBulkStatusChange = async (status: PaymentStatus) => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Change ${selectedIds.length} payment(s) to "${status}"?`)) return;
    try {
      await Promise.all(
        selectedIds.map(id =>
          apiClient.updatePayment(id, { status } as Partial<PaymentFormData>)
        )
      );
      showSuccess('Bulk update', `${selectedIds.length} payment(s) updated.`);
      addAppLog({
        module: 'Payments',
        action: 'Bulk status change',
        status: 'success',
        message: `Changed status to ${status} for ${selectedIds.length} payments`,
      });
      setSelectedIds([]);
      refreshPayments();
    } catch (err: any) {
      showError('Bulk update failed', err.message);
    }
  };

  // ---------- View handler ----------
  const handleView = useCallback((payment: Payment) => {
    setViewingPayment(payment);
    setIsViewPanelOpen(true);
  }, []);

  // ---------- Edit / Create ----------
  const handleCreate = () => {
    setEditingId(null);
    setFormData({
      reference_no: '',
      amount: '',
      payment_method: 'qr',
      status: 'pending',
      bank_name: '',
      account_number: '',
      ledger_reference: '',
      remarks: '',
    });
    setIsPanelOpen(true);
  };

  const handleEdit = useCallback((payment: Payment) => {
    setEditingId(payment.id);
    setFormData({
      reference_no: payment.reference_no || '',
      amount: payment.amount ?? '',
      payment_method: payment.payment_method || 'qr',
      status: payment.status || 'pending',
      bank_name: payment.bank_name || '',
      account_number: payment.account_number || '',
      ledger_reference: payment.ledger_reference || '',
      remarks: payment.remarks || '',
    });
    setIsPanelOpen(true);
  }, []);

  // ---------- Delete ----------
  const handleDelete = useCallback(async (payment: Payment) => {
    if (!confirm(`Delete payment ${payment.reference_no}?`)) return;
    try {
      await apiClient.deletePayment(payment.id);
      showSuccess('Payment deleted', `${payment.reference_no} removed.`);
      addAppLog({
        module: 'Payments',
        action: 'Delete payment',
        status: 'success',
        message: `Deleted payment ${payment.reference_no}`,
      });
      refreshPayments();
    } catch (err: any) {
      showError('Delete failed', err.message);
    }
  }, [refreshPayments, showError, showSuccess]);

  // ---------- Validation ----------
  const validateForm = (): boolean => {
    if (!formData.reference_no.trim()) {
      showError('Validation', 'Reference number is required.');
      return false;
    }
    const amount = typeof formData.amount === 'number' ? formData.amount : parseFloat(formData.amount);
    if (isNaN(amount) || amount <= 0) {
      showError('Validation', 'Amount must be a positive number.');
      return false;
    }
    return true;
  };

  // ---------- Submit ----------
  const handleSubmit = useCallback(async () => {
    if (!validateForm()) return;

    const payload = {
      ...formData,
      amount: parseFloat(String(formData.amount)),
    };

    setSubmitting(true);
    try {
      if (editingId) {
        await apiClient.updatePayment(editingId, payload);
        showSuccess('Payment updated', `${formData.reference_no} updated.`);
        addAppLog({
          module: 'Payments',
          action: 'Update payment',
          status: 'success',
          message: `Updated payment ${formData.reference_no}`,
        });
      } else {
        await apiClient.createPayment(payload);
        showSuccess('Payment created', `${formData.reference_no} created.`);
        addAppLog({
          module: 'Payments',
          action: 'Create payment',
          status: 'success',
          message: `Created payment ${formData.reference_no}`,
        });
      }
      setIsPanelOpen(false);
      refreshPayments();
    } catch (err: any) {
      const msg = err.message || 'Save failed.';
      showError('Save failed', msg);
      addAppLog({
        module: 'Payments',
        action: 'Save payment',
        status: 'error',
        message: msg,
      });
    } finally {
      setSubmitting(false);
    }
  }, [formData, editingId, refreshPayments, showSuccess, showError]);

  // ---------- Export CSV ----------
  const handleExport = useCallback(() => {
    if (filteredPayments.length === 0) {
      showError('Export failed', 'No payments to export.');
      return;
    }
    const safeNum = (val: any) => {
      const n = typeof val === 'number' ? val : parseFloat(val);
      return isNaN(n) ? 0 : n;
    };
    const headers = ['Reference', 'Amount', 'Method', 'Status', 'Bank', 'Account', 'Ledger', 'Remarks', 'Date'];
    const rows = filteredPayments.map(p => [
      p.reference_no,
      safeNum(p.amount).toFixed(2),
      p.payment_method,
      p.status,
      p.bank_name || '',
      p.account_number || '',
      p.ledger_reference || '',
      p.remarks || '',
      p.created_at ? formatDate(p.created_at) : '',
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payments-${formatDate(new Date())}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    showSuccess('Export', 'Payments exported.');
  }, [filteredPayments, showSuccess, showError]);

  // ---------- Table Columns ----------
  const columns = useMemo(() => [
    {
      name: 'Reference',
      selector: (row: Payment) => row.reference_no,
      sortable: true,
      cell: (row: Payment) => <span className="font-medium text-slate-800">{row.reference_no}</span>,
      width: '160px',
    },
    {
      name: 'Amount',
      selector: (row: Payment) => {
        const amount = typeof row.amount === 'number' ? row.amount : parseFloat(row.amount) || 0;
        return amount;
      },
      sortable: true,
      cell: (row: Payment) => {
        const amount = typeof row.amount === 'number' ? row.amount : parseFloat(row.amount) || 0;
        return <span className="font-medium">₹{amount.toFixed(2)}</span>;
      },
      width: '120px',
    },
    {
      name: 'Method',
      selector: (row: Payment) => row.payment_method,
      cell: (row: Payment) => (
        <span className="px-2.5 py-1 rounded-full text-xs font-medium capitalize bg-slate-100 text-slate-700">
          {row.payment_method.replace('_', ' ')}
        </span>
      ),
      sortable: true,
      width: '130px',
    },
    {
      name: 'Status',
      selector: (row: Payment) => row.status,
      sortable: true,
      cell: (row: Payment) => {
        const statusMap: Record<string, { label: string; color: string }> = {
          pending: { label: 'Pending', color: 'bg-amber-100 text-amber-700' },
          completed: { label: 'Completed', color: 'bg-emerald-100 text-emerald-700' },
          failed: { label: 'Failed', color: 'bg-rose-100 text-rose-700' },
          reconciled: { label: 'Reconciled', color: 'bg-blue-100 text-blue-700' },
        };
        const s = statusMap[row.status] || statusMap.pending;
        return <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${s.color}`}>{s.label}</span>;
      },
      width: '130px',
    },
    {
      name: 'Bank',
      selector: (row: Payment) => row.bank_name || '-',
      cell: (row: Payment) => <span className="text-sm text-slate-600">{row.bank_name || '-'}</span>,
      width: '130px',
    },
    {
      name: 'Date',
      selector: (row: Payment) => row.created_at || '',
      cell: (row: Payment) => (
        <span className="text-sm text-slate-500">
          {row.created_at ? formatDate(row.created_at) : '-'}
        </span>
      ),
      sortable: true,
      width: '120px',
    },
    {
      name: 'Actions',
      cell: (row: Payment) => (
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleView(row)}
            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
            title="View"
          >
            <FiEye size={16} />
          </button>
          <button
            onClick={() => handleEdit(row)}
            className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
            title="Edit"
          >
            <FiEdit size={16} />
          </button>
          <button
            onClick={() => handleDelete(row)}
            className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors"
            title="Delete"
          >
            <FiTrash2 size={16} />
          </button>
        </div>
      ),
      width: '120px',
    },
  ], [handleView, handleEdit, handleDelete]);

  // ---------- UI Helpers ----------
  const toggleSection = useCallback((section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  }, []);

  const renderSection = (title: string, sectionKey: string, icon: React.ReactNode, children: React.ReactNode) => (
    <div className="border-b border-gray-200 pb-4 mb-4 last:border-0">
      <button
        type="button"
        onClick={() => toggleSection(sectionKey)}
        className="flex items-center justify-between w-full text-left group"
      >
        <div className="flex items-center gap-2 text-base font-semibold text-gray-800">
          {icon}
          <span>{title}</span>
        </div>
        <span className="text-gray-400 group-hover:text-gray-600 transition-transform duration-200">
          {expandedSections[sectionKey] ? <FiChevronDown size={20} /> : <FiChevronRight size={20} />}
        </span>
      </button>
      {expandedSections[sectionKey] && (
        <div className="mt-4 space-y-4 animate-fadeIn">{children}</div>
      )}
    </div>
  );

  const renderInput = (label: string, field: keyof PaymentFormData, type: 'text' | 'number' | 'select' | 'textarea' = 'text', options?: { id: string; name: string }[]) => {
    const value = formData[field] ?? '';
    const id = `field-${field}`;
    return (
      <div>
        <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        {type === 'select' ? (
          <select
            id={id}
            value={value as string}
            onChange={(e) => setFormData(prev => ({ ...prev, [field]: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200"
          >
            {options?.map(opt => (
              <option key={opt.id} value={opt.id}>{opt.name}</option>
            ))}
          </select>
        ) : type === 'textarea' ? (
          <textarea
            id={id}
            value={value as string}
            onChange={(e) => setFormData(prev => ({ ...prev, [field]: e.target.value }))}
            rows={3}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200"
          />
        ) : (
          <input
            id={id}
            type={type}
            value={value as string | number}
            onChange={(e) => setFormData(prev => ({ ...prev, [field]: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200"
            placeholder={`Enter ${label}`}
            step={type === 'number' ? '0.01' : undefined}
          />
        )}
      </div>
    );
  };

  // ---------- Render ----------
  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 md:p-7 text-slate-800">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 mb-6 rounded-3xl bg-slate-950 px-5 py-6 md:px-8 md:py-7 shadow-xl shadow-slate-300/50">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> Payment Management
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl flex items-center gap-3">
            <FiDollarSign className="text-cyan-300" /> Payments
            <span className="text-sm font-normal text-cyan-100/70 ml-2">Transactions</span>
          </h1>
          <p className="text-sm text-slate-300">Record and reconcile payments, bank transfers, and QR payments</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refreshPayments} disabled={payLoading} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 transition hover:bg-white/20 disabled:opacity-60">
            <FiRefreshCw className={payLoading ? 'animate-spin inline mr-1' : 'inline mr-1'} size={14} /> Refresh
          </button>
          <button onClick={handleExport} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 transition hover:bg-white/20">
            <FiDownload className="inline mr-1" size={14} /> Export
          </button>
          <button onClick={handleCreate} className="rounded-xl bg-cyan-400 text-slate-950 px-3 py-2 text-sm font-medium transition hover:bg-cyan-300 shadow-md shadow-cyan-500/20">
            <FiPlus className="inline mr-1" size={14} /> New Payment
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <FiSearch className="absolute left-3 top-2.5 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search by reference, bank, account, remarks..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none placeholder:text-slate-400 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 transition-all duration-200"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FiFilter size={16} className="text-slate-500" />
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input-field w-36 text-sm rounded-xl border-slate-200 bg-white py-2 px-3 focus:ring-cyan-100">
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="reconciled">Reconciled</option>
          </select>
          <select value={filterMethod} onChange={(e) => setFilterMethod(e.target.value)} className="input-field w-36 text-sm rounded-xl border-slate-200 bg-white py-2 px-3">
            <option value="all">All Methods</option>
            <option value="qr">QR</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
        {payments ? (
          <>
            <StatCard icon={FiHash} label="Total" value={summary.total} tone="blue" />
            <StatCard icon={FiClock} label="Pending" value={summary.pending} tone="amber" />
            <StatCard icon={FiCheckCircle} label="Completed" value={summary.completed} tone="emerald" />
            <StatCard icon={FiXCircle} label="Failed" value={summary.failed} tone="rose" />
            <StatCard icon={FiBook} label="Reconciled" value={summary.reconciled} tone="purple" />
            <StatCard icon={FiDollarSign} label="Total Amount" value={summary.totalAmount.toFixed(2)} tone="teal" prefix="₹" />
          </>
        ) : (
          [...Array(6)].map((_, i) => <StatCardSkeleton key={i} />)
        )}
      </div>

      {/* Error banner */}
      {payError && (
        <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-2 animate-shake">
          <FiAlertCircle size={20} /> {payError}
        </div>
      )}

      {/* Bulk Actions */}
      {selectedIds.length > 0 && (
        <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 mb-4 flex flex-wrap items-center gap-3 animate-fadeIn">
          <span className="text-sm font-medium text-slate-700">{selectedIds.length} selected</span>
          <button onClick={() => handleBulkStatusChange('completed')} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 transition-colors">
            <FiCheckCircle size={16} /> Mark Completed
          </button>
          <button onClick={() => handleBulkStatusChange('failed')} className="inline-flex items-center gap-2 rounded-lg bg-rose-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-600 transition-colors">
            <FiXCircle size={16} /> Mark Failed
          </button>
          <button onClick={() => handleBulkStatusChange('reconciled')} className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600 transition-colors">
            <FiCheckCircle size={16} /> Mark Reconciled
          </button>
          <button onClick={handleBulkDelete} className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 transition-colors">
            <FiTrash2 size={16} /> Delete
          </button>
          <button onClick={() => setSelectedIds([])} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
            Clear Selection
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <Suspense fallback={<TableSkeleton />}>
          {payLoading ? (
            <TableSkeleton />
          ) : (
            <>
              <ModernDataTable
                title="Payment Records"
                columns={columns}
                data={paginatedPayments}
                loading={false}
                selectable
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                striped
                highlightOnHover
                pointerOnHover
              />
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-3 border-t">
                  <span className="text-sm text-slate-600">
                    Showing {((currentPage - 1) * rowsPerPage) + 1} to {Math.min(currentPage * rowsPerPage, filteredPayments.length)} of {filteredPayments.length}
                  </span>
                  <div className="flex gap-1">
                    <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40">««</button>
                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40">‹</button>
                    <span className="px-3 py-1 text-sm font-medium">{currentPage} / {totalPages}</span>
                    <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40">›</button>
                    <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40">»»</button>
                  </div>
                </div>
              )}
            </>
          )}
        </Suspense>
      </div>

      {/* View Payment Offcanvas */}
      {isViewPanelOpen && (
        <Suspense fallback={
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
            <div className="bg-white p-8 rounded-2xl">Loading details...</div>
          </div>
        }>
          <Offcanvas
            isOpen={isViewPanelOpen}
            title={`Payment ${viewingPayment?.reference_no || ''}`}
            onClose={() => setIsViewPanelOpen(false)}
            footer={
              <div className="flex justify-end">
                <button onClick={() => setIsViewPanelOpen(false)} className="btn btn-secondary">
                  Close
                </button>
              </div>
            }
          >
            {viewingPayment && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Reference</label>
                    <div className="mt-1 text-gray-900 font-semibold">{viewingPayment.reference_no}</div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Status</label>
                    <div className="mt-1">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        viewingPayment.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                        viewingPayment.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                        viewingPayment.status === 'failed' ? 'bg-rose-100 text-rose-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>{viewingPayment.status}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Amount</label>
                    <div className="mt-1 text-gray-900 font-bold">₹{parseFloat(String(viewingPayment.amount)).toFixed(2)}</div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Method</label>
                    <div className="mt-1 text-gray-900 capitalize">{viewingPayment.payment_method.replace('_', ' ')}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Bank Name</label>
                    <div className="mt-1 text-gray-900">{viewingPayment.bank_name || '-'}</div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Account Number</label>
                    <div className="mt-1 text-gray-900">{viewingPayment.account_number || '-'}</div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Ledger Reference</label>
                  <div className="mt-1 text-gray-900">{viewingPayment.ledger_reference || '-'}</div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Remarks</label>
                  <div className="mt-1 text-gray-900 whitespace-pre-wrap">{viewingPayment.remarks || '-'}</div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Created At</label>
                  <div className="mt-1 text-gray-900">
                    {viewingPayment.created_at ? formatDateTime(viewingPayment.created_at) : '-'}
                  </div>
                </div>
              </div>
            )}
          </Offcanvas>
        </Suspense>
      )}

      {/* Form Offcanvas (Create/Edit) */}
      {isPanelOpen && (
        <Suspense fallback={
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
            <div className="bg-white p-8 rounded-2xl">Loading form...</div>
          </div>
        }>
          <Offcanvas
            isOpen={isPanelOpen}
            title={editingId ? 'Edit Payment' : 'Create Payment'}
            onClose={() => setIsPanelOpen(false)}
            footer={
              <div className="flex flex-col sm:flex-row sm:justify-end gap-3">
                <button onClick={() => setIsPanelOpen(false)} className="btn btn-secondary w-full sm:w-auto" disabled={submitting}>
                  Cancel
                </button>
                <button onClick={handleSubmit} disabled={submitting} className="btn btn-primary w-full sm:w-auto">
                  {submitting ? 'Saving...' : editingId ? 'Update Payment' : 'Create Payment'}
                </button>
              </div>
            }
          >
            <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
              {renderSection('Payment Details', 'paymentDetails', <FiDollarSign size={18} className="text-blue-500" />,
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {renderInput('Reference *', 'reference_no')}
                  {renderInput('Amount *', 'amount', 'number')}
                  {renderInput('Method', 'payment_method', 'select', [
                    { id: 'qr', name: 'QR' },
                    { id: 'bank_transfer', name: 'Bank Transfer' },
                    { id: 'cash', name: 'Cash' },
                    { id: 'card', name: 'Card' },
                  ])}
                  {renderInput('Status', 'status', 'select', [
                    { id: 'pending', name: 'Pending' },
                    { id: 'completed', name: 'Completed' },
                    { id: 'failed', name: 'Failed' },
                    { id: 'reconciled', name: 'Reconciled' },
                  ])}
                </div>
              )}

              {renderSection('Bank & Ledger', 'bankLedger', <FiCreditCard size={18} className="text-indigo-500" />,
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {renderInput('Bank Name', 'bank_name')}
                  {renderInput('Account Number', 'account_number')}
                  {renderInput('Ledger Reference', 'ledger_reference')}
                </div>
              )}

              {renderSection('Remarks', 'remarks', <FiBook size={18} className="text-emerald-500" />,
                <div>
                  {renderInput('Remarks', 'remarks', 'textarea')}
                </div>
              )}
            </div>
          </Offcanvas>
        </Suspense>
      )}

      {/* Styles */}
      <style>{`
        .stat-card { animation: attendance-fade-up 0.38s ease-out both; }
        .stat-card:nth-child(2) { animation-delay: 0.05s; }
        .stat-card:nth-child(3) { animation-delay: 0.1s; }
        .stat-card:nth-child(4) { animation-delay: 0.15s; }
        .stat-card:nth-child(5) { animation-delay: 0.2s; }
        .stat-card:nth-child(6) { animation-delay: 0.25s; }
        @keyframes attendance-fade-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-shake { animation: shake 0.4s ease-in-out; }
        @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        @media (max-width: 640px) {
          .rdt_TableCol, .rdt_TableCell { white-space: nowrap; }
        }
        .rdt_TableHeader .search-container,
        .rdt_TableHeader input[type="text"] { display: none !important; }
        .rdt_TableHeader > div:last-child { display: none !important; }
        .rdt_TableCol:first-child, .rdt_TableCell:first-child { display: none !important; }
      `}</style>
    </div>
  );
}