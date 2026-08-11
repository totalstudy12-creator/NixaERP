// src/pages/BankCashPage.tsx
import { useEffect, useState, useCallback, useMemo, lazy, Suspense, memo } from 'react';
import {
  FiPlus,
  FiRefreshCw,
  FiTrash2,
  FiDownload,
  FiEye,
  FiEdit,
  FiCheckCircle,
  FiXCircle,
  FiFilter,
  FiSearch,
  FiAlertCircle,
  FiChevronDown,
  FiChevronRight,
  FiPackage,
  FiBarChart2,
  FiDollarSign,
  FiCopy,
  FiPrinter,
  FiShare2,
  FiCreditCard,
  FiClock,
  FiRepeat,
  FiArrowUpRight,
  FiArrowDownLeft,
} from 'react-icons/fi';
import clsx from 'clsx';

// ---------- Lazy loaded heavy components ----------
const ModernDataTable = lazy(() =>
  import('../components/ModernDataTable').then(m => ({ default: m.ModernDataTable }))
);
const Offcanvas = lazy(() =>
  import('../components/Offcanvas').then(m => ({ default: m.Offcanvas }))
);

import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';

// ---------- Types ----------
type CashEntryType = 'Receipt' | 'Payment' | 'Transfer';
type CashEntryStatus = 'Pending' | 'Posted' | 'Cleared' | 'Reconciled';

interface CashEntry {
  id: number;
  account: string;
  type: CashEntryType;
  reference: string;
  amount: number;
  date: string;
  status: CashEntryStatus;
  description: string;
  category: string;
  counterparty: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface CashEntryFormData {
  account: string;
  type: CashEntryType;
  reference: string;
  amount: number | string;
  date: string;
  status: CashEntryStatus;
  description: string;
  category: string;
  counterparty: string;
}

// ---------- Helpers ----------
const currency = (value: number) => `₹ ${value.toLocaleString('en-IN')}`;
const today = new Date().toISOString().slice(0, 10);

// ---------- localStorage helpers ----------
const STORAGE_KEY = 'raptor-bank-cash-entries';

function readEntries(): CashEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeEntries(list: CashEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function seedEntries(): CashEntry[] {
  if (readEntries().length > 0) return readEntries();
  const sample: CashEntry[] = [
    {
      id: 1,
      account: 'Cash Drawer',
      type: 'Receipt',
      reference: 'RCPT-1001',
      amount: 50000,
      date: '2026-08-02',
      status: 'Posted',
      description: 'Counter sale receipt',
      category: 'Sales',
      counterparty: 'Customer A',
      createdBy: 'Admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 2,
      account: 'HDFC Bank',
      type: 'Transfer',
      reference: 'TRF-001',
      amount: 120000,
      date: '2026-08-01',
      status: 'Cleared',
      description: 'Fund transfer to current account',
      category: 'Transfer',
      counterparty: 'Self',
      createdBy: 'Admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  writeEntries(sample);
  return sample;
}

const accounts = ['Cash Drawer', 'HDFC Bank', 'ICICI Bank', 'SBI Current Account', 'Axis Bank'];
const categories = ['Sales', 'Purchase', 'Expense', 'Transfer', 'Deposit', 'Withdrawal', 'Other'];
const statusOptions: CashEntryStatus[] = ['Pending', 'Posted', 'Cleared', 'Reconciled'];

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
  ({ icon: Icon, label, value, tone }: {
    icon: any;
    label: string;
    value: string | number;
    tone: 'blue' | 'emerald' | 'amber' | 'rose' | 'purple' | 'teal';
  }) => {
    const bg =
      tone === 'blue' ? 'bg-blue-100 text-blue-600' :
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
          <p className="text-2xl font-bold text-slate-900">{value}</p>
        </div>
      </div>
    );
  }
);

// ---------- Component ----------
export function BankCashPage() {
  const { showSuccess, showError } = useNotification();

  const [entries, setEntries] = useState<CashEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterAccount, setFilterAccount] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');

  // Selection for bulk actions
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // View offcanvas
  const [isViewPanelOpen, setIsViewPanelOpen] = useState(false);
  const [viewingEntry, setViewingEntry] = useState<CashEntry | null>(null);

  // Form offcanvas (create/edit)
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<CashEntryFormData>({
    account: '',
    type: 'Receipt',
    reference: '',
    amount: '',
    date: today,
    status: 'Posted',
    description: '',
    category: '',
    counterparty: '',
  });

  // Expandable sections in form
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    basic: true,
    details: false,
  });

  // ---------- Data Loading ----------
  const loadEntries = useCallback(() => {
    setLoading(true);
    const data = seedEntries();
    setEntries(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const persist = useCallback((next: CashEntry[]) => {
    writeEntries(next);
    setEntries(next);
  }, []);

  // ---------- Filter & Search ----------
  const filteredEntries = useMemo(() => {
    let data = [...entries];
    const term = searchTerm.toLowerCase().trim();
    if (term) {
      data = data.filter(
        e =>
          e.account.toLowerCase().includes(term) ||
          e.reference.toLowerCase().includes(term) ||
          e.description?.toLowerCase().includes(term) ||
          e.counterparty?.toLowerCase().includes(term)
      );
    }
    if (filterType !== 'all') data = data.filter(e => e.type === filterType);
    if (filterStatus !== 'all') data = data.filter(e => e.status === filterStatus);
    if (filterAccount !== 'all') data = data.filter(e => e.account === filterAccount);
    if (filterCategory !== 'all') data = data.filter(e => e.category === filterCategory);
    if (dateFrom) data = data.filter(e => e.date >= dateFrom);
    if (dateTo) data = data.filter(e => e.date <= dateTo);
    if (amountMin) data = data.filter(e => e.amount >= Number(amountMin));
    if (amountMax) data = data.filter(e => e.amount <= Number(amountMax));
    return data;
  }, [entries, searchTerm, filterType, filterStatus, filterAccount, filterCategory, dateFrom, dateTo, amountMin, amountMax]);

  // Summary
  const summary = useMemo(() => {
    const total = entries.length;
    const totalAmount = entries.reduce((s, e) => s + e.amount, 0);
    const receipts = entries.filter(e => e.type === 'Receipt').reduce((s, e) => s + e.amount, 0);
    const payments = entries.filter(e => e.type === 'Payment').reduce((s, e) => s + e.amount, 0);
    const posted = entries.filter(e => e.status === 'Posted').length;
    const pending = entries.filter(e => e.status === 'Pending').length;
    return { total, totalAmount, receipts, payments, posted, pending };
  }, [entries]);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;
  const totalPages = Math.ceil(filteredEntries.length / rowsPerPage);
  const paginatedEntries = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredEntries.slice(start, start + rowsPerPage);
  }, [filteredEntries, currentPage]);

  useEffect(() => setCurrentPage(1), [
    searchTerm, filterType, filterStatus, filterAccount, filterCategory, dateFrom, dateTo, amountMin, amountMax,
  ]);

  // ---------- Handlers ----------
  const handleCreate = () => {
    setEditingId(null);
    setFormData({
      account: '',
      type: 'Receipt',
      reference: '',
      amount: '',
      date: today,
      status: 'Posted',
      description: '',
      category: '',
      counterparty: '',
    });
    setIsPanelOpen(true);
  };

  const handleEdit = useCallback((e: CashEntry) => {
    setEditingId(e.id);
    setFormData({
      account: e.account,
      type: e.type,
      reference: e.reference,
      amount: e.amount,
      date: e.date,
      status: e.status,
      description: e.description || '',
      category: e.category || '',
      counterparty: e.counterparty || '',
    });
    setIsPanelOpen(true);
  }, []);

  const handleView = useCallback((e: CashEntry) => {
    setViewingEntry(e);
    setIsViewPanelOpen(true);
  }, []);

  const handleDelete = useCallback(
    (e: CashEntry) => {
      if (!confirm(`Delete entry ${e.reference}?`)) return;
      const next = entries.filter(item => item.id !== e.id);
      persist(next);
      showSuccess('Entry deleted', `${e.reference} removed.`);
      addAppLog({ module: 'BankCash', action: 'Delete', status: 'success', message: `Deleted ${e.reference}` });
    },
    [entries, persist, showSuccess]
  );

  const handleDuplicate = useCallback(
    (e: CashEntry) => {
      const newId = Date.now();
      const copy: CashEntry = {
        ...e,
        id: newId,
        reference: `COPY-${e.reference}`,
        date: today,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      persist([copy, ...entries]);
      showSuccess('Duplicated', `Created ${copy.reference}`);
    },
    [entries, persist, showSuccess]
  );

  // Bulk actions
  const bulkDelete = () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Delete ${selectedIds.length} entries?`)) return;
    const next = entries.filter(e => !selectedIds.includes(e.id));
    persist(next);
    setSelectedIds([]);
    showSuccess('Bulk delete', `${selectedIds.length} entries removed.`);
    addAppLog({ module: 'BankCash', action: 'Bulk Delete', status: 'success', message: `${selectedIds.length} deleted` });
  };

  const bulkStatusUpdate = (newStatus: CashEntryStatus) => {
    if (selectedIds.length === 0) return;
    const now = new Date().toISOString();
    const updated = entries.map(e => {
      if (!selectedIds.includes(e.id)) return e;
      return { ...e, status: newStatus, updatedAt: now };
    });
    persist(updated);
    setSelectedIds([]);
    showSuccess('Bulk update', `Updated ${selectedIds.length} entries to ${newStatus}`);
    addAppLog({ module: 'BankCash', action: 'Bulk Status', status: 'success', message: `${selectedIds.length} → ${newStatus}` });
  };

  const exportCSV = () => {
    if (filteredEntries.length === 0) return;
    const headers = ['Account', 'Type', 'Reference', 'Amount', 'Date', 'Status', 'Description', 'Counterparty'];
    const rows = filteredEntries.map(e =>
      [e.account, e.type, e.reference, e.amount, e.date, e.status, e.description, e.counterparty].join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bank-cash-${today}.csv`;
    a.click();
    showSuccess('Export', 'File downloaded.');
  };

  const handleSave = () => {
    if (!formData.account || !formData.amount) {
      showError('Validation', 'Please fill in account and amount.');
      return;
    }

    const now = new Date().toISOString();
    const newId = editingId || Date.now();
    const isNew = !editingId;

    const entry: CashEntry = {
      id: newId,
      account: formData.account,
      type: formData.type,
      reference: formData.reference || `TXN-${Date.now().toString().slice(-4)}`,
      amount: Number(formData.amount),
      date: formData.date || today,
      status: formData.status,
      description: formData.description,
      category: formData.category,
      counterparty: formData.counterparty,
      createdBy: 'Admin',
      createdAt: isNew ? now : entries.find(e => e.id === editingId)?.createdAt || now,
      updatedAt: now,
    };

    if (isNew) {
      persist([entry, ...entries]);
      showSuccess('Entry created', entry.reference);
    } else {
      const next = entries.map(e => (e.id === newId ? entry : e));
      persist(next);
      showSuccess('Entry updated', entry.reference);
    }
    setIsPanelOpen(false);
  };

  // ---------- Table Columns ----------
  const columns = useMemo(
    () => [
      {
        name: 'Account',
        selector: (row: CashEntry) => row.account,
        sortable: true,
        cell: (row: CashEntry) => (
          <div>
            <div className="font-medium text-blue-700">{row.account}</div>
            <div className="text-xs text-slate-400">{row.reference}</div>
          </div>
        ),
        width: '180px',
      },
      {
        name: 'Type',
        selector: (row: CashEntry) => row.type,
        cell: (row: CashEntry) => {
          const color = row.type === 'Receipt' ? 'text-emerald-600' : row.type === 'Payment' ? 'text-rose-600' : 'text-violet-600';
          return (
            <span className={`inline-flex items-center gap-1 ${color} font-medium text-sm`}>
              {row.type === 'Receipt' ? <FiArrowDownLeft size={14} /> : row.type === 'Payment' ? <FiArrowUpRight size={14} /> : <FiRepeat size={14} />}
              {row.type}
            </span>
          );
        },
        sortable: true,
        width: '120px',
      },
      {
        name: 'Amount',
        selector: (row: CashEntry) => row.amount,
        sortable: true,
        cell: (row: CashEntry) => <span className="font-semibold">{currency(row.amount)}</span>,
        width: '120px',
      },
      {
        name: 'Date',
        selector: (row: CashEntry) => row.date,
        sortable: true,
        width: '110px',
      },
      {
        name: 'Status',
        selector: (row: CashEntry) => row.status,
        cell: (row: CashEntry) => {
          const colors: Record<string, string> = {
            Pending: 'bg-amber-100 text-amber-700',
            Posted: 'bg-emerald-100 text-emerald-700',
            Cleared: 'bg-blue-100 text-blue-700',
            Reconciled: 'bg-purple-100 text-purple-700',
          };
          return <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${colors[row.status] || 'bg-slate-100'}`}>{row.status}</span>;
        },
        sortable: true,
        width: '120px',
      },
      {
        name: 'Counterparty',
        selector: (row: CashEntry) => row.counterparty || '—',
        cell: (row: CashEntry) => <span className="text-sm">{row.counterparty || '—'}</span>,
        width: '140px',
      },
      {
        name: 'Actions',
        cell: (row: CashEntry) => (
          <div className="flex items-center gap-1">
            <button onClick={() => handleView(row)} className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-50" title="View"><FiEye size={16} /></button>
            <button onClick={() => handleEdit(row)} className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50" title="Edit"><FiEdit size={16} /></button>
            <button onClick={() => handleDuplicate(row)} className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-50" title="Duplicate"><FiCopy size={16} /></button>
            <button onClick={() => handleDelete(row)} className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50" title="Delete"><FiTrash2 size={16} /></button>
          </div>
        ),
        width: '150px',
      },
    ],
    [handleEdit, handleView, handleDelete, handleDuplicate]
  );

  const toggleSection = (section: string) =>
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));

  // ---------- Render ----------
  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 md:p-7 text-slate-800">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 mb-6 rounded-3xl bg-slate-950 px-5 py-6 md:px-8 md:py-7 shadow-xl shadow-slate-300/50">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> Bank & Cash Management
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl flex items-center gap-3">
            <FiCreditCard className="text-cyan-300" /> Bank & Cash
            <span className="text-sm font-normal text-cyan-100/70 ml-2">Cash Flow</span>
          </h1>
          <p className="text-sm text-slate-300">Manage cash receipts, bank transfers, and reconciliations</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadEntries}
            disabled={loading}
            className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 transition hover:bg-white/20 disabled:opacity-60"
          >
            <FiRefreshCw className={loading ? 'animate-spin inline mr-1' : 'inline mr-1'} size={14} /> Refresh
          </button>
          <button
            onClick={exportCSV}
            className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 transition hover:bg-white/20"
          >
            <FiDownload className="inline mr-1" size={14} /> Export
          </button>
          <button
            onClick={handleCreate}
            className="rounded-xl bg-cyan-400 text-slate-950 px-3 py-2 text-sm font-medium transition hover:bg-cyan-300 shadow-md shadow-cyan-500/20"
          >
            <FiPlus className="inline mr-1" size={14} /> New Entry
          </button>
        </div>
      </div>

      {/* Summary Cards – prefix removed for currency values */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <StatCard icon={FiRepeat} label="Total Entries" value={summary.total} tone="blue" />
        <StatCard icon={FiDollarSign} label="Total Amount" value={currency(summary.totalAmount)} tone="amber" />
        <StatCard icon={FiArrowDownLeft} label="Receipts" value={currency(summary.receipts)} tone="emerald" />
        <StatCard icon={FiArrowUpRight} label="Payments" value={currency(summary.payments)} tone="rose" />
        <StatCard icon={FiCheckCircle} label="Posted" value={summary.posted} tone="teal" />
        <StatCard icon={FiClock} label="Pending" value={summary.pending} tone="purple" />
      </div>

      {/* Filters – refined layout */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search – single search bar */}
          <div className="relative flex-1">
            <FiSearch className="absolute left-3 top-2.5 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search by account, reference, description, or counterparty..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none placeholder:text-slate-400 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 transition-all duration-200"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FiFilter size={16} className="text-slate-500" />
            <select value={filterType} onChange={e => setFilterType(e.target.value)} className="input-field w-28 text-sm rounded-xl border-slate-200 bg-white py-2 px-3">
              <option value="all">All Types</option>
              <option value="Receipt">Receipt</option>
              <option value="Payment">Payment</option>
              <option value="Transfer">Transfer</option>
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input-field w-32 text-sm rounded-xl border-slate-200 bg-white py-2 px-3">
              <option value="all">All Status</option>
              {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)} className="input-field w-36 text-sm rounded-xl border-slate-200 bg-white py-2 px-3">
              <option value="all">All Accounts</option>
              {accounts.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="input-field w-32 text-sm rounded-xl border-slate-200 bg-white py-2 px-3">
              <option value="all">All Categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-1 text-sm">
            <span className="text-slate-500">Date:</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
            <span className="text-slate-400">to</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
          </div>
          <div className="flex items-center gap-1 text-sm">
            <span className="text-slate-500">Amount:</span>
            <input type="number" placeholder="Min ₹" value={amountMin} onChange={e => setAmountMin(e.target.value)} className="w-24 border border-slate-200 rounded-lg px-3 py-1.5 text-sm" />
            <span className="text-slate-400">–</span>
            <input type="number" placeholder="Max ₹" value={amountMax} onChange={e => setAmountMax(e.target.value)} className="w-24 border border-slate-200 rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <button
            onClick={() => {
              setSearchTerm('');
              setFilterType('all');
              setFilterStatus('all');
              setFilterAccount('all');
              setFilterCategory('all');
              setDateFrom('');
              setDateTo('');
              setAmountMin('');
              setAmountMax('');
            }}
            className="text-sm text-slate-500 hover:text-slate-700 underline"
          >
            Reset Filters
          </button>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedIds.length > 0 && (
        <div className="bg-white p-3 rounded-xl shadow-sm border mb-4 flex flex-wrap items-center gap-3 animate-fadeIn">
          <span className="text-sm font-medium text-slate-700">{selectedIds.length} selected</span>
          <button onClick={bulkDelete} className="inline-flex items-center gap-2 rounded-lg bg-rose-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-600"><FiTrash2 size={16} /> Delete</button>
          <select onChange={e => bulkStatusUpdate(e.target.value as CashEntryStatus)} className="rounded-lg border px-3 py-1.5 text-sm">
            <option value="">Change Status</option>
            {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={() => setSelectedIds([])} className="text-sm text-slate-500">Clear</button>
        </div>
      )}

      {/* Table – search disabled to avoid duplication */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <Suspense fallback={<TableSkeleton />}>
          {loading ? (
            <TableSkeleton />
          ) : (
            <ModernDataTable
              title="Transaction Register"
              columns={columns}
              data={paginatedEntries}
              loading={false}
              selectable
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              striped
              highlightOnHover
              pointerOnHover
              searchable={false}  // 👈 disables built‑in search, we use our own filter
            />
          )}
        </Suspense>
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t">
            <span className="text-sm text-slate-600">Page {currentPage} of {totalPages}</span>
            <div className="flex gap-1">
              <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40">««</button>
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40">‹</button>
              <span className="px-3 py-1 text-sm font-medium">{currentPage}/{totalPages}</span>
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40">›</button>
              <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40">»»</button>
            </div>
          </div>
        )}
      </div>

      {/* View Offcanvas */}
      <Offcanvas
        isOpen={isViewPanelOpen}
        title={viewingEntry?.reference || 'Details'}
        onClose={() => setIsViewPanelOpen(false)}
        footer={<button onClick={() => setIsViewPanelOpen(false)} className="btn btn-secondary">Close</button>}
      >
        {viewingEntry && (
          <div className="space-y-4">
            <div className="bg-slate-50 p-4 rounded-xl">
              <p className="text-xs uppercase text-slate-500">{viewingEntry.reference}</p>
              <h4 className="text-lg font-semibold">{viewingEntry.account}</h4>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><p className="text-xs text-slate-500">Type</p><p>{viewingEntry.type}</p></div>
              <div><p className="text-xs text-slate-500">Amount</p><p className="font-bold">{currency(viewingEntry.amount)}</p></div>
              <div><p className="text-xs text-slate-500">Date</p><p>{viewingEntry.date}</p></div>
              <div><p className="text-xs text-slate-500">Status</p><p>{viewingEntry.status}</p></div>
              <div><p className="text-xs text-slate-500">Category</p><p>{viewingEntry.category || '—'}</p></div>
              <div><p className="text-xs text-slate-500">Counterparty</p><p>{viewingEntry.counterparty || '—'}</p></div>
            </div>
            <div>
              <p className="text-xs text-slate-500">Description</p>
              <p className="text-sm whitespace-pre-wrap">{viewingEntry.description || '—'}</p>
            </div>
          </div>
        )}
      </Offcanvas>

      {/* Create/Edit Offcanvas */}
      <Offcanvas
        isOpen={isPanelOpen}
        title={editingId ? 'Edit Entry' : 'New Entry'}
        onClose={() => setIsPanelOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setIsPanelOpen(false)} className="btn btn-secondary">Cancel</button>
            <button onClick={handleSave} disabled={submitting} className="btn btn-primary">
              {editingId ? 'Update' : 'Create'}
            </button>
          </div>
        }
      >
        <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
          {/* Basic section */}
          <div className="border-b pb-4">
            <button onClick={() => toggleSection('basic')} className="flex items-center justify-between w-full text-left font-semibold">
              <span>Basic Information</span>
              {expandedSections.basic ? <FiChevronDown /> : <FiChevronRight />}
            </button>
            {expandedSections.basic && (
              <div className="mt-3 grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs">Account</label>
                  <select className="w-full rounded-lg border px-3 py-2 text-sm" value={formData.account} onChange={e => setFormData({ ...formData, account: e.target.value })}>
                    <option value="">Select account</option>
                    {accounts.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs">Type</label>
                  <select className="w-full rounded-lg border px-3 py-2 text-sm" value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value as CashEntryType })}>
                    <option value="Receipt">Receipt</option>
                    <option value="Payment">Payment</option>
                    <option value="Transfer">Transfer</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs">Status</label>
                  <select className="w-full rounded-lg border px-3 py-2 text-sm" value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value as CashEntryStatus })}>
                    {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div><label className="text-xs">Amount</label><input type="number" className="w-full rounded-lg border px-3 py-2 text-sm" value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} /></div>
                <div><label className="text-xs">Date</label><input type="date" className="w-full rounded-lg border px-3 py-2 text-sm" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} /></div>
                <div><label className="text-xs">Reference</label><input className="w-full rounded-lg border px-3 py-2 text-sm" value={formData.reference} onChange={e => setFormData({ ...formData, reference: e.target.value })} /></div>
                <div><label className="text-xs">Category</label><select className="w-full rounded-lg border px-3 py-2 text-sm" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}><option value="">Select</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                <div><label className="text-xs">Counterparty</label><input className="w-full rounded-lg border px-3 py-2 text-sm" value={formData.counterparty} onChange={e => setFormData({ ...formData, counterparty: e.target.value })} /></div>
              </div>
            )}
          </div>

          {/* Details section */}
          <div>
            <button onClick={() => toggleSection('details')} className="flex items-center justify-between w-full text-left font-semibold">
              <span>Additional Details</span>
              {expandedSections.details ? <FiChevronDown /> : <FiChevronRight />}
            </button>
            {expandedSections.details && (
              <div className="mt-3">
                <label className="text-xs">Description</label>
                <textarea className="w-full rounded-lg border px-3 py-2 text-sm mt-1" rows={3} value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
              </div>
            )}
          </div>
        </div>
      </Offcanvas>

      <style>{`
        .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        /* Hide any extra table search that might appear */
        .rdt_TableHeader .search-container,
        .rdt_TableHeader input[type="text"] {
          display: none !important;
        }
        .rdt_TableHeader > div:last-child {
          display: none !important;
        }
        /* Hide the first column if it's the select column (we use custom selection) */
        .rdt_TableCol:first-child,
        .rdt_TableCell:first-child {
          display: none !important;
        }
      `}</style>
    </div>
  );
}