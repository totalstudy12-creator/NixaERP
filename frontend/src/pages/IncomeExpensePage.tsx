// src/pages/IncomeExpensePage.tsx
import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  FiArrowDownLeft, FiArrowUpRight, FiCalendar, FiChevronDown, FiChevronLeft, FiChevronRight,
  FiDollarSign, FiDownload, FiFilter, FiPlus, FiSearch, FiTrendingDown, FiTrendingUp,
  FiCreditCard, FiEdit2, FiTrash2, FiEye, FiX, FiAlertCircle, FiSave, FiLock,
  FiRefreshCw, FiXCircle, FiCheck, FiActivity,
} from 'react-icons/fi';
import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';

/* ────────────────────────────────────────────────────────────────── */
/* Types                                                              */
/* ────────────────────────────────────────────────────────────────── */

type Direction = 'income' | 'expense';

interface Transaction {
  id: number;
  direction: Direction;
  company_id?: number | null;
  branch_id?: number | null;
  category: string;
  counterparty?: string | null;
  amount: number;
  tax_amount?: number | null;
  total_amount?: number | null;
  entry_date: string;
  payment_method: string;
  reference_no?: string | null;
  description?: string | null;
  notes?: string | null;
  status?: string;
  company?: { id?: number; name?: string } | null;
  branch?: { id?: number; name?: string } | null;
}

interface DashboardPayload {
  kpis: {
    total_income?: number;
    total_expenses?: number;
    net_cash_flow?: number;
    pending_expenses?: number;
    pending_income?: number;
    this_month?: number;
    this_year?: number;
    income_growth_pct?: number;
    expense_growth_pct?: number;
    net_margin_pct?: number;
    transaction_count?: number;
    average_transaction_value?: number;
  };
  records: Transaction[];
}

interface Company { id: number; name: string; }
interface Branch { id: number; name: string; company_id?: number; }

interface FormState {
  company_id: string;
  branch_id: string;
  direction: Direction;
  category: string;
  counterparty: string;
  amount: string;
  tax_amount: string;
  entry_date: string;
  payment_method: string;
  reference_no: string;
  description: string;
  notes: string;
  status: string;
}

/* ────────────────────────────────────────────────────────────────── */
/* Constants                                                          */
/* ────────────────────────────────────────────────────────────────── */

const INCOME_CATEGORIES = [
  'Sales', 'Service Revenue', 'Consulting', 'Interest Income', 'Rental Income',
  'Commission', 'Refunds Received', 'Other Income',
];

const EXPENSE_CATEGORIES = [
  'Salaries', 'Rent', 'Utilities', 'Marketing', 'Office Supplies', 'Travel',
  'Software', 'Legal', 'Insurance', 'Maintenance', 'Taxes', 'Bank Charges',
  'Raw Materials', 'Logistics', 'Other Expense',
];

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'credit', label: 'Credit' },
  { value: 'other', label: 'Other' },
];

const STATUS_OPTIONS = [
  { value: 'completed', label: 'Completed' },
  { value: 'pending', label: 'Pending' },
  { value: 'cancelled', label: 'Cancelled' },
];

const PAGE_SIZE = 10;

type DatePreset = 'all' | 'today' | '7d' | '30d' | 'this_month' | 'this_year' | 'custom';

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'this_month', label: 'This month' },
  { value: 'this_year', label: 'This year' },
];

/* ────────────────────────────────────────────────────────────────── */
/* Helpers                                                            */
/* ────────────────────────────────────────────────────────────────── */

const money = (value = 0): string =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

const compactMoney = (value = 0): string => {
  const n = Number(value) || 0;
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(2)}Cr`;
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(2)}L`;
  if (abs >= 1_000) return `${sign}₹${(abs / 1_000).toFixed(1)}K`;
  return `${sign}₹${abs.toFixed(0)}`;
};

const currencyPct = (value = 0): string =>
  `${value >= 0 ? '+' : ''}${Number(value || 0).toFixed(1)}%`;

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

interface ResolvedDateRange { from: Date | null; to: Date | null; label: string; }

function resolveDatePreset(
  preset: DatePreset,
  customFrom?: string,
  customTo?: string,
): ResolvedDateRange {
  const now = new Date();
  switch (preset) {
    case 'today': return { from: startOfDay(now), to: endOfDay(now), label: 'Today' };
    case '7d': { const d = new Date(now); d.setDate(d.getDate() - 6); return { from: startOfDay(d), to: endOfDay(now), label: 'Last 7 days' }; }
    case '30d': { const d = new Date(now); d.setDate(d.getDate() - 29); return { from: startOfDay(d), to: endOfDay(now), label: 'Last 30 days' }; }
    case 'this_month': { const from = new Date(now.getFullYear(), now.getMonth(), 1); return { from: startOfDay(from), to: endOfDay(now), label: 'This month' }; }
    case 'this_year': { const from = new Date(now.getFullYear(), 0, 1); return { from: startOfDay(from), to: endOfDay(now), label: 'This year' }; }
    case 'custom': {
      const f = customFrom ? new Date(customFrom) : null;
      const t = customTo ? new Date(customTo) : null;
      return {
        from: f && !Number.isNaN(f.getTime()) ? startOfDay(f) : null,
        to: t && !Number.isNaN(t.getTime()) ? endOfDay(t) : null,
        label: 'Custom range',
      };
    }
    case 'all':
    default:
      return { from: null, to: null, label: 'All time' };
  }
}

const parseDateSafe = (raw: any): Date | null => {
  if (!raw) return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  const s = String(raw).trim();
  if (!s) return null;

  const dateOnly = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (dateOnly) {
    const d = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
    if (!Number.isNaN(d.getTime())) return d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatDate = (raw?: string | null): string => {
  const d = parseDateSafe(raw);
  if (!d) return '—';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
    }).format(d);
  } catch { return String(raw ?? '—'); }
};

const paymentMethodLabel = (value?: string | null): string => {
  const found = PAYMENT_METHODS.find((m) => m.value === value);
  if (found) return found.label;
  if (!value) return '—';
  return String(value).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

const statusLabel = (value?: string | null): string => {
  if (!value) return 'Completed';
  return String(value).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

const statusTone = (value?: string | null): string => {
  const s = String(value ?? 'completed').toLowerCase();
  if (s === 'completed' || s === 'approved' || s === 'paid') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (s === 'pending' || s === 'processing') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (s === 'cancelled' || s === 'rejected' || s === 'failed') return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
};

const extractRows = (payload: unknown): any[] => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  const p = payload as any;
  if (Array.isArray(p.data)) return p.data;
  if (p.data && Array.isArray(p.data.data)) return p.data.data;
  if (Array.isArray(p.rows)) return p.rows;
  if (Array.isArray(p.items)) return p.items;
  return [];
};

/* ────────────────────────────────────────────────────────────────── */
/* KPI card                                                           */
/* ────────────────────────────────────────────────────────────────── */

type Tone = 'emerald' | 'amber' | 'indigo' | 'rose' | 'teal' | 'violet';

const TONE_GRADIENTS: Record<Tone, string> = {
  emerald: 'from-emerald-500 to-teal-500 shadow-emerald-500/20',
  amber: 'from-amber-500 to-orange-500 shadow-amber-500/20',
  indigo: 'from-indigo-500 to-blue-500 shadow-indigo-500/20',
  rose: 'from-rose-500 to-pink-500 shadow-rose-500/20',
  teal: 'from-teal-500 to-cyan-500 shadow-teal-500/20',
  violet: 'from-violet-500 to-purple-500 shadow-violet-500/20',
};

interface KpiCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
  tone: Tone;
  delta?: number | null;
}

const KpiCard = ({ icon: Icon, label, value, hint, tone, delta }: KpiCardProps) => {
  const showDelta = typeof delta === 'number' && Number.isFinite(delta);
  const positive = showDelta && (delta as number) >= 0;
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_12px_24px_-12px_rgba(15,23,42,0.15)]">
      <div className="flex items-center gap-3">
        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${TONE_GRADIENTS[tone]} text-white shadow-lg`}>
          <Icon size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
          <p className="mt-0.5 truncate text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{value}</p>
          <div className="mt-0.5 flex items-center gap-2">
            {hint && <p className="text-[10px] text-slate-500">{hint}</p>}
            {showDelta && (
              <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${positive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                {positive ? <FiTrendingUp size={10} /> : <FiTrendingDown size={10} />}
                {Math.abs(delta as number).toFixed(1)}%
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const KpiCardSkeleton = () => (
  <div className="flex animate-pulse items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4">
    <div className="h-11 w-11 rounded-2xl bg-slate-200" />
    <div className="flex-1 space-y-2">
      <div className="h-3 w-20 rounded bg-slate-200" />
      <div className="h-6 w-24 rounded bg-slate-200" />
    </div>
  </div>
);

/* ────────────────────────────────────────────────────────────────── */
/* Main                                                               */
/* ────────────────────────────────────────────────────────────────── */

export function IncomeExpensePage() {
  const { showSuccess, showError } = useNotification();

  /* ---------- Data ---------- */
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  /* ---------- Filters ---------- */
  const [search, setSearch] = useState('');
  const [directionFilter, setDirectionFilter] = useState<'all' | Direction>('all');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  /* ---------- Pagination ---------- */
  const [page, setPage] = useState(1);

  /* ---------- Add / Edit Modal ---------- */
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState<FormState>({
    company_id: '',
    branch_id: '',
    direction: 'income',
    category: 'Sales',
    counterparty: '',
    amount: '',
    tax_amount: '0',
    entry_date: new Date().toISOString().slice(0, 10),
    payment_method: 'bank_transfer',
    reference_no: '',
    description: '',
    notes: '',
    status: 'completed',
  });

  /* ---------- View Modal ---------- */
  const [viewing, setViewing] = useState<Transaction | null>(null);

  /* ---------- Delete Modal ---------- */
  const [deleting, setDeleting] = useState<Transaction | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  /* ---------- Range resolution ---------- */
  const resolvedRange = useMemo(
    () => resolveDatePreset(datePreset, customFrom, customTo),
    [datePreset, customFrom, customTo],
  );

  /* ---------- Fetch ---------- */
  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      const [dashboardRes, listRes, companyRes, branchRes] = await Promise.all([
        apiClient.get('/income-expenses/dashboard'),
        apiClient.get('/income-expenses?per_page=200'),
        apiClient.getCompanies(),
        apiClient.getBranches(),
      ]);

      const dashboardPayload =
        dashboardRes && typeof dashboardRes === 'object' && 'kpis' in dashboardRes
          ? (dashboardRes as DashboardPayload)
          : { kpis: {}, records: [] };

      const list = extractRows(listRes);
      const companyList = extractRows(companyRes);
      const branchList = extractRows(branchRes);

      setDashboard(dashboardPayload as DashboardPayload);
      setTransactions(list as Transaction[]);
      setCompanies(companyList as Company[]);
      setBranches(branchList as Branch[]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unable to load financial records.';
      setError(msg);
      if (isRefresh) showError('Refresh failed', msg);
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  }, [showError]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  /* ---------- Filtering ---------- */
  const filteredTransactions = useMemo(() => {
    const term = search.trim().toLowerCase();
    const { from, to } = resolvedRange;

    return transactions.filter((t) => {
      // Text search
      if (term) {
        const haystack = [
          t.category,
          t.counterparty,
          t.reference_no,
          t.description,
          t.notes,
          t.company?.name,
          t.branch?.name,
          paymentMethodLabel(t.payment_method),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }

      // Direction
      if (directionFilter !== 'all' && t.direction !== directionFilter) return false;

      // Company / Branch
      if (companyFilter !== 'all' && String(t.company_id ?? '') !== String(companyFilter)) return false;
      if (branchFilter !== 'all' && String(t.branch_id ?? '') !== String(branchFilter)) return false;

      // Payment method
      if (paymentFilter !== 'all' && String(t.payment_method ?? '') !== paymentFilter) return false;

      // Status
      if (statusFilter !== 'all' && String(t.status ?? 'completed').toLowerCase() !== statusFilter) return false;

      // Date range
      if (from || to) {
        const d = parseDateSafe(t.entry_date);
        if (d) {
          const ts = d.getTime();
          if (from && ts < from.getTime()) return false;
          if (to && ts > to.getTime()) return false;
        }
      }

      return true;
    });
  }, [
    transactions, search, directionFilter, companyFilter, branchFilter,
    paymentFilter, statusFilter, resolvedRange,
  ]);

  /* ---------- Totals for filtered set ---------- */
  const filteredTotals = useMemo(() => {
    let income = 0;
    let expense = 0;
    filteredTransactions.forEach((t) => {
      const amt = Number(t.total_amount ?? (Number(t.amount) + Number(t.tax_amount ?? 0)));
      if (t.direction === 'income') income += amt;
      else expense += amt;
    });
    return { income, expense, net: income - expense };
  }, [filteredTransactions]);

  /* ---------- Reset page when filters change ---------- */
  useEffect(() => { setPage(1); }, [
    search, directionFilter, companyFilter, branchFilter,
    paymentFilter, statusFilter, datePreset, customFrom, customTo,
  ]);

  /* ---------- Pagination ---------- */
  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedTransactions = useMemo(
    () => filteredTransactions.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredTransactions, currentPage],
  );

  /* ---------- Active filter chips ---------- */
  const activeFilterChips = useMemo(() => {
    const chips: { label: string; clear: () => void }[] = [];
    if (directionFilter !== 'all') {
      chips.push({
        label: `Type: ${directionFilter === 'income' ? 'Income' : 'Expense'}`,
        clear: () => setDirectionFilter('all'),
      });
    }
    if (companyFilter !== 'all') {
      const name = companies.find((c) => String(c.id) === companyFilter)?.name || 'Company';
      chips.push({ label: `Company: ${name}`, clear: () => setCompanyFilter('all') });
    }
    if (branchFilter !== 'all') {
      const name = branches.find((b) => String(b.id) === branchFilter)?.name || 'Branch';
      chips.push({ label: `Branch: ${name}`, clear: () => setBranchFilter('all') });
    }
    if (paymentFilter !== 'all') {
      chips.push({ label: `Method: ${paymentMethodLabel(paymentFilter)}`, clear: () => setPaymentFilter('all') });
    }
    if (statusFilter !== 'all') {
      chips.push({ label: `Status: ${statusLabel(statusFilter)}`, clear: () => setStatusFilter('all') });
    }
    if (datePreset !== 'all') {
      const label = DATE_PRESETS.find((p) => p.value === datePreset)?.label || 'Date';
      chips.push({
        label: `${label}${datePreset === 'custom' && customFrom && customTo ? ` (${customFrom} → ${customTo})` : ''}`,
        clear: () => { setDatePreset('all'); setCustomFrom(''); setCustomTo(''); },
      });
    }
    return chips;
  }, [
    directionFilter, companyFilter, branchFilter, paymentFilter, statusFilter,
    datePreset, customFrom, customTo, companies, branches,
  ]);

  const clearAllFilters = () => {
    setDirectionFilter('all');
    setCompanyFilter('all');
    setBranchFilter('all');
    setPaymentFilter('all');
    setStatusFilter('all');
    setDatePreset('all');
    setCustomFrom('');
    setCustomTo('');
    setSearch('');
  };

  const branchesForCompany = useMemo(() => {
    if (companyFilter === 'all') return branches;
    const cid = Number(companyFilter);
    return branches.filter((b) => Number(b.company_id) === cid);
  }, [branches, companyFilter]);

  /* ---------- Open create modal ---------- */
  const openCreate = (direction: Direction) => {
    setEditingId(null);
    setFormError('');
    setForm({
      company_id: companies[0]?.id ? String(companies[0].id) : '',
      branch_id: '',
      direction,
      category: direction === 'income' ? 'Sales' : 'Salaries',
      counterparty: '',
      amount: '',
      tax_amount: '0',
      entry_date: new Date().toISOString().slice(0, 10),
      payment_method: 'bank_transfer',
      reference_no: '',
      description: '',
      notes: '',
      status: 'completed',
    });
    setFormOpen(true);
  };

  /* ---------- Open edit modal ---------- */
  const openEdit = (t: Transaction) => {
    setEditingId(t.id);
    setFormError('');
    setForm({
      company_id: t.company_id != null ? String(t.company_id) : '',
      branch_id: t.branch_id != null ? String(t.branch_id) : '',
      direction: t.direction,
      category: t.category || '',
      counterparty: t.counterparty || '',
      amount: t.amount != null ? String(t.amount) : '',
      tax_amount: t.tax_amount != null ? String(t.tax_amount) : '0',
      entry_date: t.entry_date ? String(t.entry_date).slice(0, 10) : new Date().toISOString().slice(0, 10),
      payment_method: t.payment_method || 'bank_transfer',
      reference_no: t.reference_no || '',
      description: t.description || '',
      notes: t.notes || '',
      status: t.status || 'completed',
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
    setEditingId(null);
    setFormError('');
  };

  /* ---------- Submit ---------- */
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.company_id) { setFormError('Company is required.'); return; }
    const amountNum = Number(form.amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) { setFormError('Amount must be greater than 0.'); return; }
    if (!form.category.trim()) { setFormError('Category is required.'); return; }
    if (!form.entry_date) { setFormError('Date is required.'); return; }

    setSaving(true);
    setFormError('');

    const payload = {
      company_id: Number(form.company_id),
      branch_id: form.branch_id ? Number(form.branch_id) : null,
      direction: form.direction,
      category: form.category.trim(),
      counterparty: form.counterparty.trim() || null,
      amount: amountNum,
      tax_amount: Number(form.tax_amount || 0),
      total_amount: amountNum + Number(form.tax_amount || 0),
      entry_date: form.entry_date,
      payment_method: form.payment_method,
      reference_no: form.reference_no.trim() || null,
      description: form.description.trim() || null,
      notes: form.notes.trim() || null,
      status: form.status,
    };

    try {
      const client: any = apiClient;
      if (editingId != null) {
        if (typeof client.updateIncomeExpense === 'function') {
          await client.updateIncomeExpense(editingId, payload);
        } else {
          await client.request('PUT', `/income-expenses/${editingId}`, payload);
        }
        showSuccess('Transaction updated', 'The record was saved successfully.');
      } else {
        if (typeof client.createIncomeExpense === 'function') {
          await client.createIncomeExpense(payload);
        } else {
          await client.request('POST', '/income-expenses', payload);
        }
        showSuccess('Transaction created', 'The record was saved successfully.');
      }
      setFormOpen(false);
      setEditingId(null);
      await fetchData(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not save the transaction.';
      setFormError(msg);
      showError('Save failed', msg);
    } finally {
      setSaving(false);
    }
  };

  /* ---------- Delete ---------- */
  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      const client: any = apiClient;
      if (typeof client.deleteIncomeExpense === 'function') {
        await client.deleteIncomeExpense(deleting.id);
      } else {
        await client.request('DELETE', `/income-expenses/${deleting.id}`);
      }
      showSuccess('Transaction deleted', 'The record was removed.');
      setDeleting(null);
      await fetchData(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not delete the transaction.';
      showError('Delete failed', msg);
    } finally {
      setDeleteBusy(false);
    }
  };

  /* ---------- CSV Export ---------- */
  const exportCsv = () => {
    const esc = (v: string | number | null | undefined) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const headers = [
      'Date', 'Direction', 'Category', 'Party', 'Company', 'Branch',
      'Payment Method', 'Reference', 'Amount', 'Tax', 'Total', 'Status',
    ];
    const rows = [headers.map(esc).join(',')];
    filteredTransactions.forEach((t) => {
      rows.push([
        t.entry_date,
        t.direction,
        t.category,
        t.counterparty ?? '',
        t.company?.name ?? '',
        t.branch?.name ?? '',
        paymentMethodLabel(t.payment_method),
        t.reference_no ?? '',
        Number(t.amount || 0).toFixed(2),
        Number(t.tax_amount || 0).toFixed(2),
        Number(t.total_amount ?? (Number(t.amount || 0) + Number(t.tax_amount || 0))).toFixed(2),
        statusLabel(t.status),
      ].map(esc).join(','));
    });
    const csv = rows.join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `income-expenses-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showSuccess('Export ready', `${filteredTransactions.length} row(s) exported.`);
  };

  /* ---------- KPI values ---------- */
  const kpis = dashboard?.kpis ?? {};
  const incomeGrowth = Number(kpis.income_growth_pct ?? 0);
  const expenseGrowth = Number(kpis.expense_growth_pct ?? 0);

  /* ================================================================ */
  /* Render                                                           */
  /* ================================================================ */

  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 text-slate-800 md:p-7">

      {/* ---------- Hero ---------- */}
      <div className="relative mb-6 overflow-hidden rounded-3xl border border-slate-800/10 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-5 py-6 shadow-[0_20px_40px_-20px_rgba(15,23,42,0.45)] sm:px-7 md:px-8 md:py-7">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl" />

        <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200 backdrop-blur">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              Finance · Ledger
            </div>
            <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-white md:text-3xl">
              <FiActivity className="text-emerald-300" /> Income &amp; Expenses
            </h1>
            <p className="mt-1 text-sm text-slate-300">
              Track every inflow and outflow with full audit visibility.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void fetchData(true)}
              disabled={refreshing}
              className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/15 backdrop-blur transition hover:bg-white/20 disabled:opacity-60"
            >
              <FiRefreshCw className={refreshing ? 'mr-1 inline animate-spin' : 'mr-1 inline'} size={14} />
              Refresh
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={filteredTransactions.length === 0}
              className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/15 backdrop-blur transition hover:bg-white/20 disabled:opacity-50"
            >
              <FiDownload className="mr-1 inline" size={14} /> Export
            </button>
            <button
              type="button"
              onClick={() => openCreate('income')}
              className="rounded-xl bg-gradient-to-r from-emerald-400 to-teal-400 px-4 py-2 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-500/20 transition hover:from-emerald-300 hover:to-teal-300"
            >
              <FiPlus className="mr-1 inline" size={14} /> Add Income
            </button>
            <button
              type="button"
              onClick={() => openCreate('expense')}
              className="rounded-xl bg-gradient-to-r from-amber-300 to-orange-400 px-4 py-2 text-sm font-semibold text-amber-950 shadow-lg shadow-amber-500/20 transition hover:from-amber-200 hover:to-orange-300"
            >
              <FiPlus className="mr-1 inline" size={14} /> Add Expense
            </button>
          </div>
        </div>
      </div>

      {/* ---------- KPI Cards ---------- */}
      <section className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          [...Array(4)].map((_, i) => <KpiCardSkeleton key={i} />)
        ) : (
          <>
            <KpiCard
              icon={FiTrendingUp}
              label="Total Income"
              value={compactMoney(Number(kpis.total_income ?? 0))}
              tone="emerald"
              hint="vs last month"
              delta={incomeGrowth}
            />
            <KpiCard
              icon={FiTrendingDown}
              label="Total Expenses"
              value={compactMoney(Number(kpis.total_expenses ?? 0))}
              tone="amber"
              hint="vs last month"
              delta={expenseGrowth}
            />
            <KpiCard
              icon={FiDollarSign}
              label="Net Cash Flow"
              value={compactMoney(Number(kpis.net_cash_flow ?? 0))}
              tone="indigo"
              hint={`${compactMoney(Number(kpis.this_month ?? 0))} this month`}
            />
            <KpiCard
              icon={FiCreditCard}
              label="Transactions"
              value={String(Number(kpis.transaction_count ?? 0))}
              tone="violet"
              hint={`Avg ${compactMoney(Number(kpis.average_transaction_value ?? 0))}`}
            />
          </>
        )}
      </section>

      {/* ---------- Filter Panel ---------- */}
      <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50/60 sm:px-5"
        >
          <div className="flex items-center gap-3">
            <div className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-500 text-white shadow-md shadow-indigo-500/20">
              <FiFilter size={15} />
              {activeFilterChips.length > 0 && (
                <span className="absolute -right-1 -top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white ring-2 ring-white">
                  {activeFilterChips.length}
                </span>
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Advanced Filters</p>
              <p className="text-[11px] text-slate-500">
                {activeFilterChips.length > 0
                  ? `${activeFilterChips.length} active filter${activeFilterChips.length > 1 ? 's' : ''}`
                  : 'Date · Company · Branch · Type · Method · Status'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeFilterChips.length > 0 && (
              <span
                onClick={(e) => { e.stopPropagation(); clearAllFilters(); }}
                className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"
              >
                <FiXCircle size={12} /> Reset
              </span>
            )}
            <div className={`grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-slate-500 transition ${filtersOpen ? 'rotate-180' : ''}`}>
              <FiChevronDown size={14} />
            </div>
          </div>
        </button>

        {filtersOpen && (
          <div className="space-y-4 border-t border-slate-100 p-4 sm:p-5">
            {/* Date presets */}
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Date Range</p>
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
                {DATE_PRESETS.map((p) => {
                  const active = datePreset === p.value;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => { setDatePreset(p.value); setCustomFrom(''); setCustomTo(''); }}
                      className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${active
                        ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-500/20'
                        : 'border border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50/40 hover:text-indigo-700'}`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom range + dropdowns */}
            <div className="grid gap-3 lg:grid-cols-12">
              <div className="lg:col-span-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Custom Range</p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <FiCalendar className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                      type="date"
                      value={customFrom}
                      onChange={(e) => { setCustomFrom(e.target.value); setDatePreset('custom'); }}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                    />
                  </div>
                  <div className="relative flex-1">
                    <FiCalendar className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                      type="date"
                      value={customTo}
                      min={customFrom || undefined}
                      onChange={(e) => { setCustomTo(e.target.value); setDatePreset('custom'); }}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                    />
                  </div>
                </div>
              </div>

              <div className="lg:col-span-2">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Type</p>
                <div className="relative">
                  <select
                    value={directionFilter}
                    onChange={(e) => setDirectionFilter(e.target.value as 'all' | Direction)}
                    className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                  >
                    <option value="all">All types</option>
                    <option value="income">Income</option>
                    <option value="expense">Expense</option>
                  </select>
                  <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                </div>
              </div>

              <div className="lg:col-span-2">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Company</p>
                <div className="relative">
                  <select
                    value={companyFilter}
                    onChange={(e) => { setCompanyFilter(e.target.value); setBranchFilter('all'); }}
                    className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                  >
                    <option value="all">All companies</option>
                    {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                </div>
              </div>

              <div className="lg:col-span-2">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Branch</p>
                <div className="relative">
                  <select
                    value={branchFilter}
                    onChange={(e) => setBranchFilter(e.target.value)}
                    disabled={branchesForCompany.length === 0}
                    className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    <option value="all">All branches</option>
                    {branchesForCompany.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                </div>
              </div>

              <div className="lg:col-span-2">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Method</p>
                <div className="relative">
                  <select
                    value={paymentFilter}
                    onChange={(e) => setPaymentFilter(e.target.value)}
                    className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                  >
                    <option value="all">All methods</option>
                    {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                  <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                </div>
              </div>
            </div>

            {/* Active chips */}
            {activeFilterChips.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-slate-200 pt-3">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Active:</span>
                {activeFilterChips.map((chip, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-gradient-to-r from-indigo-50 to-blue-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700">
                    {chip.label}
                    <button onClick={chip.clear} className="grid h-4 w-4 place-items-center rounded-full hover:bg-indigo-200">
                      <FiX size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ---------- Transaction Table ---------- */}
      <section className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative w-full max-w-md">
            <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search transaction, category, reference, party…"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
            />
          </div>

          {/* Totals bar */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700">
              <FiArrowUpRight size={12} /> {compactMoney(filteredTotals.income)}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-700">
              <FiArrowDownLeft size={12} /> {compactMoney(filteredTotals.expense)}
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
              filteredTotals.net >= 0
                ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                : 'border-rose-200 bg-rose-50 text-rose-700'
            }`}>
              <FiDollarSign size={12} /> Net {compactMoney(filteredTotals.net)}
            </span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-700">
            <FiAlertCircle size={16} /> {error}
          </div>
        )}

        {/* Table / states */}
        {loading ? (
          <div className="space-y-3 p-6">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 animate-pulse">
                <div className="h-4 w-24 rounded bg-slate-200" />
                <div className="h-4 w-16 rounded bg-slate-200" />
                <div className="h-4 flex-1 rounded bg-slate-200" />
                <div className="h-4 w-24 rounded bg-slate-200" />
                <div className="h-4 w-20 rounded bg-slate-200" />
              </div>
            ))}
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="p-10 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400">
              <FiCreditCard size={24} />
            </div>
            <p className="mt-4 text-base font-semibold text-slate-800">No financial transactions found</p>
            <p className="mt-1 text-sm text-slate-500">
              {activeFilterChips.length > 0 || search
                ? 'Try clearing your filters or adjusting the search term.'
                : 'Create your first income or expense entry to get started.'}
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => openCreate('income')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
              >
                <FiPlus size={14} /> Add Income
              </button>
              <button
                type="button"
                onClick={() => openCreate('expense')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700"
              >
                <FiPlus size={14} /> Add Expense
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-[1080px] w-full text-left text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Date</th>
                    <th className="px-5 py-3 font-semibold">Type</th>
                    <th className="px-5 py-3 font-semibold">Category</th>
                    <th className="px-5 py-3 font-semibold">Party</th>
                    <th className="px-5 py-3 font-semibold">Company / Branch</th>
                    <th className="px-5 py-3 font-semibold">Method</th>
                    <th className="px-5 py-3 font-semibold text-right">Amount</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedTransactions.map((t) => {
                    const total = Number(t.total_amount ?? (Number(t.amount || 0) + Number(t.tax_amount || 0)));
                    const isIncome = t.direction === 'income';
                    return (
                      <tr key={t.id} className="transition hover:bg-slate-50/60">
                        <td className="whitespace-nowrap px-5 py-4 text-slate-700">
                          {formatDate(t.entry_date)}
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                            isIncome
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-amber-200 bg-amber-50 text-amber-700'
                          }`}>
                            {isIncome ? <FiArrowUpRight size={11} /> : <FiArrowDownLeft size={11} />}
                            {isIncome ? 'Income' : 'Expense'}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-medium text-slate-800">{t.category || '—'}</p>
                          {t.reference_no && (
                            <p className="mt-0.5 text-[11px] text-slate-400">Ref: {t.reference_no}</p>
                          )}
                        </td>
                        <td className="px-5 py-4 text-slate-700">{t.counterparty || '—'}</td>
                        <td className="px-5 py-4">
                          <p className="text-slate-700">{t.company?.name || '—'}</p>
                          {t.branch?.name && (
                            <p className="mt-0.5 text-[11px] text-slate-400">{t.branch.name}</p>
                          )}
                        </td>
                        <td className="px-5 py-4 text-slate-700">
                          {paymentMethodLabel(t.payment_method)}
                        </td>
                        <td className={`whitespace-nowrap px-5 py-4 text-right font-semibold ${isIncome ? 'text-emerald-700' : 'text-amber-700'}`}>
                          {isIncome ? '+' : '−'} {money(total)}
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusTone(t.status)}`}>
                            {statusLabel(t.status)}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setViewing(t)}
                              title="View details"
                              className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-indigo-50 hover:text-indigo-600"
                            >
                              <FiEye size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => openEdit(t)}
                              title="Edit"
                              className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-600"
                            >
                              <FiEdit2 size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleting(t)}
                              title="Delete"
                              className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"
                            >
                              <FiTrash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 sm:flex-row">
              <p className="text-xs text-slate-500">
                Showing{' '}
                <span className="font-semibold text-slate-700">
                  {filteredTransactions.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}
                </span>{' '}
                –{' '}
                <span className="font-semibold text-slate-700">
                  {Math.min(currentPage * PAGE_SIZE, filteredTransactions.length)}
                </span>{' '}
                of <span className="font-semibold text-slate-700">{filteredTransactions.length}</span> transaction(s)
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FiChevronLeft size={13} /> Previous
                </button>
                <span className="px-3 text-xs font-semibold text-slate-700">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next <FiChevronRight size={13} />
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {/* ======================== Add / Edit Modal ======================== */}
      {formOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <form
            onSubmit={submit}
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
          >
            {/* Header */}
            <div className={`flex items-center justify-between border-b px-6 py-4 ${
              form.direction === 'income'
                ? 'border-emerald-100 bg-gradient-to-r from-emerald-50 to-teal-50'
                : 'border-amber-100 bg-gradient-to-r from-amber-50 to-orange-50'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`grid h-10 w-10 place-items-center rounded-xl text-white shadow-sm ${
                  form.direction === 'income'
                    ? 'bg-gradient-to-br from-emerald-500 to-teal-500'
                    : 'bg-gradient-to-br from-amber-500 to-orange-500'
                }`}>
                  {form.direction === 'income' ? <FiArrowUpRight size={18} /> : <FiArrowDownLeft size={18} />}
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                    {editingId != null ? 'Edit Transaction' : 'New Transaction'}
                  </p>
                  <h2 className="text-lg font-bold text-slate-900">
                    {editingId != null
                      ? `Editing ${form.direction === 'income' ? 'Income' : 'Expense'}`
                      : form.direction === 'income' ? 'Add Income' : 'Add Expense'}
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={closeForm}
                disabled={saving}
                className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition hover:bg-white hover:text-slate-800 disabled:opacity-50"
                aria-label="Close"
              >
                <FiX size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
              <label className="block text-sm text-slate-600">
                Direction
                <select
                  value={form.direction}
                  onChange={(e) => setForm((c) => ({ ...c, direction: e.target.value as Direction, category: e.target.value === 'income' ? 'Sales' : 'Salaries' }))}
                  className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-slate-800 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                >
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>
              </label>

              <label className="block text-sm text-slate-600">
                Date
                <input
                  type="date"
                  value={form.entry_date}
                  onChange={(e) => setForm((c) => ({ ...c, entry_date: e.target.value }))}
                  className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-slate-800 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                  required
                />
              </label>

              <label className="block text-sm text-slate-600">
                Company *
                <select
                  value={form.company_id}
                  onChange={(e) => { setForm((c) => ({ ...c, company_id: e.target.value, branch_id: '' })); }}
                  className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-slate-800 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                  required
                >
                  <option value="">Select company</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>

              <label className="block text-sm text-slate-600">
                Branch
                <select
                  value={form.branch_id}
                  onChange={(e) => setForm((c) => ({ ...c, branch_id: e.target.value }))}
                  className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-slate-800 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                >
                  <option value="">— None —</option>
                  {branches
                    .filter((b) => !form.company_id || String(b.company_id ?? '') === String(form.company_id))
                    .map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>

              <label className="block text-sm text-slate-600 md:col-span-2">
                Category *
                <input
                  list="income-expense-category-options"
                  value={form.category}
                  onChange={(e) => setForm((c) => ({ ...c, category: e.target.value }))}
                  className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-slate-800 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                  required
                />
                <datalist id="income-expense-category-options">
                  {(form.direction === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </label>

              <label className="block text-sm text-slate-600">
                Amount (₹) *
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm((c) => ({ ...c, amount: e.target.value }))}
                  className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-slate-800 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                  required
                />
              </label>

              <label className="block text-sm text-slate-600">
                Tax (₹)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.tax_amount}
                  onChange={(e) => setForm((c) => ({ ...c, tax_amount: e.target.value }))}
                  className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-slate-800 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                />
              </label>

              <label className="block text-sm text-slate-600">
                Payment Method
                <select
                  value={form.payment_method}
                  onChange={(e) => setForm((c) => ({ ...c, payment_method: e.target.value }))}
                  className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-slate-800 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                >
                  {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </label>

              <label className="block text-sm text-slate-600">
                Status
                <select
                  value={form.status}
                  onChange={(e) => setForm((c) => ({ ...c, status: e.target.value }))}
                  className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-slate-800 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                >
                  {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>

              <label className="block text-sm text-slate-600 md:col-span-2">
                Party / Counterparty
                <input
                  value={form.counterparty}
                  onChange={(e) => setForm((c) => ({ ...c, counterparty: e.target.value }))}
                  placeholder="Customer, vendor, or contact name"
                  className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-slate-800 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                />
              </label>

              <label className="block text-sm text-slate-600 md:col-span-2">
                Reference Number
                <input
                  value={form.reference_no}
                  onChange={(e) => setForm((c) => ({ ...c, reference_no: e.target.value }))}
                  placeholder="Invoice / cheque / transaction ID"
                  className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-slate-800 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                />
              </label>

              <label className="block text-sm text-slate-600 md:col-span-2">
                Description
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))}
                  rows={2}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-800 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                />
              </label>

              <label className="block text-sm text-slate-600 md:col-span-2">
                Notes
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))}
                  rows={2}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-800 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                />
              </label>

              {formError && (
                <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 md:col-span-2">
                  <FiAlertCircle size={14} /> {formError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
              <button
                type="button"
                onClick={closeForm}
                disabled={saving}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition disabled:opacity-60 ${
                  form.direction === 'income'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                {saving ? (
                  <>
                    <FiRefreshCw className="animate-spin" size={14} /> Saving…
                  </>
                ) : (
                  <>
                    <FiSave size={14} /> {editingId != null ? 'Update transaction' : 'Save transaction'}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ======================== View Modal ======================== */}
      {viewing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className={`flex items-center justify-between border-b px-6 py-4 ${
              viewing.direction === 'income'
                ? 'border-emerald-100 bg-gradient-to-r from-emerald-50 to-teal-50'
                : 'border-amber-100 bg-gradient-to-r from-amber-50 to-orange-50'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`grid h-10 w-10 place-items-center rounded-xl text-white shadow-sm ${
                  viewing.direction === 'income'
                    ? 'bg-gradient-to-br from-emerald-500 to-teal-500'
                    : 'bg-gradient-to-br from-amber-500 to-orange-500'
                }`}>
                  {viewing.direction === 'income' ? <FiArrowUpRight size={18} /> : <FiArrowDownLeft size={18} />}
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Transaction</p>
                  <h2 className="text-lg font-bold text-slate-900">
                    {viewing.category || (viewing.direction === 'income' ? 'Income' : 'Expense')}
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewing(null)}
                className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition hover:bg-white hover:text-slate-800"
                aria-label="Close"
              >
                <FiX size={18} />
              </button>
            </div>

            <div className="px-6 py-5">
              <div className="mb-4 rounded-xl bg-slate-50 p-4 text-center">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total Amount</p>
                <p className={`mt-1 text-3xl font-extrabold ${viewing.direction === 'income' ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {money(Number(viewing.total_amount ?? (Number(viewing.amount || 0) + Number(viewing.tax_amount || 0))))}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Base {money(viewing.amount)} + Tax {money(viewing.tax_amount ?? 0)}
                </p>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Date</dt>
                  <dd className="mt-0.5 text-slate-800">{formatDate(viewing.entry_date)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Status</dt>
                  <dd className="mt-0.5">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusTone(viewing.status)}`}>
                      {statusLabel(viewing.status)}
                    </span>
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Party</dt>
                  <dd className="mt-0.5 text-slate-800">{viewing.counterparty || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Company</dt>
                  <dd className="mt-0.5 text-slate-800">{viewing.company?.name || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Branch</dt>
                  <dd className="mt-0.5 text-slate-800">{viewing.branch?.name || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Payment method</dt>
                  <dd className="mt-0.5 text-slate-800">{paymentMethodLabel(viewing.payment_method)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Reference</dt>
                  <dd className="mt-0.5 text-slate-800">{viewing.reference_no || '—'}</dd>
                </div>
                {viewing.description && (
                  <div className="col-span-2">
                    <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Description</dt>
                    <dd className="mt-0.5 whitespace-pre-wrap text-slate-800">{viewing.description}</dd>
                  </div>
                )}
                {viewing.notes && (
                  <div className="col-span-2">
                    <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Notes</dt>
                    <dd className="mt-0.5 whitespace-pre-wrap text-slate-800">{viewing.notes}</dd>
                  </div>
                )}
              </dl>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
              <button
                type="button"
                onClick={() => setViewing(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => { const t = viewing; setViewing(null); if (t) openEdit(t); }}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
              >
                <FiEdit2 size={14} /> Edit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================== Delete Modal ======================== */}
      {deleting && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start gap-3 border-b border-rose-100 bg-gradient-to-r from-rose-50 to-pink-50 px-6 py-4">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-rose-500 to-pink-500 text-white shadow-sm">
                <FiAlertCircle size={18} />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-500">Confirm delete</p>
                <h2 className="text-lg font-bold text-slate-900">Delete this transaction?</h2>
              </div>
            </div>

            <div className="px-6 py-5">
              <p className="text-sm text-slate-600">
                You are about to permanently delete this{' '}
                <span className="font-semibold text-slate-900">
                  {deleting.direction === 'income' ? 'income' : 'expense'}
                </span>{' '}
                record of <span className="font-semibold text-slate-900">{money(Number(deleting.total_amount ?? deleting.amount))}</span> from{' '}
                <span className="font-semibold text-slate-900">{formatDate(deleting.entry_date)}</span>.
                This action cannot be undone.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
              <button
                type="button"
                onClick={() => setDeleting(null)}
                disabled={deleteBusy}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={deleteBusy}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-60"
              >
                {deleteBusy ? (
                  <>
                    <FiRefreshCw className="animate-spin" size={14} /> Deleting…
                  </>
                ) : (
                  <>
                    <FiTrash2 size={14} /> Delete permanently
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}