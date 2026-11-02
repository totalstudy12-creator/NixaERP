import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Building,
  Check,
  CheckCircle,
  Clock,
  Copy,
  Edit2,
  Eye,
  FileCheck,
  FileText,
  Mail,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Send,
  Trash2,
  TrendingUp,
  UserCheck,
  UserPlus,
  X,
  XCircle,
  Loader2,
  Info,
  ChevronDown,
} from 'lucide-react';
import { apiClient } from '../api';
import { useAuthStore } from '../store/auth';

/* ============================================================
 * SHARED KIT
 * ========================================================== */
const formatMoney = (amount: number | string | undefined | null): string => {
  const n = Number(amount || 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
};

const formatDate = (v: string | null | undefined): string => {
  if (!v) return '—';
  try {
    const d = new Date(v);
    return Number.isNaN(d.getTime())
      ? '—'
      : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
};

const safeNum = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

const validators = {
  email: (v: string) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  phone: (v: string) => !v || /^[+]?[\d\s\-()]{7,20}$/.test(v),
  gstin: (v: string) =>
    !v || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v.toUpperCase()),
  pan: (v: string) => !v || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v.toUpperCase()),
};

function useDebouncedValue<T>(value: T, delay = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

type ToastKind = 'success' | 'error' | 'info';
type ToastItem = { id: number; type: ToastKind; message: string };

function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const push = useCallback((type: ToastKind, message: string) => {
    const t: ToastItem = { id: Date.now() + Math.random(), type, message };
    setToasts((prev) => [...prev, t]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 4500);
  }, []);
  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);
  return { toasts, push, dismiss };
}

function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[90] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm shadow-lg animate-slide-in ${
            t.type === 'success'
              ? 'border-emerald-200 bg-white text-emerald-800'
              : t.type === 'info'
                ? 'border-blue-200 bg-white text-blue-800'
                : 'border-rose-200 bg-white text-rose-800'
          }`}
        >
          {t.type === 'success' ? (
            <CheckCircle size={16} className="mt-0.5 flex-shrink-0 text-emerald-600" />
          ) : t.type === 'info' ? (
            <Info size={16} className="mt-0.5 flex-shrink-0 text-blue-600" />
          ) : (
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0 text-rose-600" />
          )}
          <span className="flex-1">{t.message}</span>
          <button
            onClick={() => onDismiss(t.id)}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function Modal({
  children,
  onClose,
  size = 'md',
}: {
  children: React.ReactNode;
  onClose: () => void;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' } as const;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`animate-modal-in w-full overflow-hidden rounded-2xl bg-white shadow-2xl ${sizes[size]} max-h-[90vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function ModalHeader({
  icon,
  title,
  subtitle,
  onClose,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
          {icon}
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold text-slate-900">{title}</h3>
          {subtitle && <p className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
      <button
        onClick={onClose}
        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        aria-label="Close"
      >
        <X size={16} />
      </button>
    </div>
  );
}

type MenuItem = {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

function ActionMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative inline-block text-left" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        aria-label="More actions"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1 w-48 origin-top-right rounded-xl border border-slate-200 bg-white p-1 shadow-xl animate-fade-in">
          {items.map((item, i) => (
            <button
              key={i}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition disabled:opacity-40 ${
                item.destructive
                  ? 'text-rose-600 hover:bg-rose-50'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              {item.icon && (
                <span className={item.destructive ? 'text-rose-500' : 'text-slate-400'}>
                  {item.icon}
                </span>
              )}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-100 ${className}`} />;
}

function Field({
  label,
  error,
  children,
  className = '',
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-[11px] font-semibold text-slate-600">{label}</label>
      {children}
      {error && (
        <p className="mt-1 flex items-center gap-1 text-[10px] font-medium text-rose-600">
          <AlertCircle size={10} /> {error}
        </p>
      )}
    </div>
  );
}

const inputCls =
  'mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

/* ============================================================
 * QUOTATIONS PAGE
 * ========================================================== */
export function QuotationsPage() {
  const navigate = useNavigate();
  const { toasts, push, dismiss } = useToasts();

  const [quotations, setQuotations] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [statusFilter, setStatusFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Modals
  const [convertModalQuotation, setConvertModalQuotation] = useState<any>(null);
  const [statusModalQuotation, setStatusModalQuotation] = useState<any>(null);

  const [convertForm, setConvertForm] = useState(() => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const d15 = new Date();
    d15.setDate(d15.getDate() + 15);
    const due = `${d15.getFullYear()}-${String(d15.getMonth() + 1).padStart(2, '0')}-${String(d15.getDate()).padStart(2, '0')}`;
    return {
      invoice_date: today,
      due_date: due,
      auto_deduct_stock: true,
      payment_term: 'Net 15',
      warehouse_id: '',
    };
  });
  const [convertError, setConvertError] = useState<{ due?: string }>({});
  const [converting, setConverting] = useState(false);

  const [statusForm, setStatusForm] = useState({
    status: 'sent',
    rejection_reason: '',
    follow_up_date: '',
  });
  const [statusError, setStatusError] = useState<{ reason?: string }>({});

  // Auxiliary
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);

  /* ---- Load list ---- */
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      try {
        const params: Record<string, unknown> = { page, per_page: 15 };
        if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
        if (statusFilter !== 'all') params.status = statusFilter;
        if (branchFilter !== 'all') params.branch_id = branchFilter;

        const [quotesRes, summaryRes] = await Promise.all([
          apiClient.getQuotations(params),
          apiClient.getQuotationSummary(),
        ]);
        if (controller.signal.aborted) return;

        const d: any = quotesRes;
        if (d?.data) {
          setQuotations(d.data);
          setTotalPages(d.last_page || 1);
          setTotalCount(d.total || 0);
        } else if (Array.isArray(d)) {
          setQuotations(d);
          setTotalCount(d.length);
        }
        setSummary(summaryRes);
      } catch (err: any) {
        if (!controller.signal.aborted) push('error', err?.message || 'Failed to load quotations');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [page, debouncedSearch, statusFilter, branchFilter, push]);

  /* ---- Load aux ---- */
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const [w, b] = await Promise.all([apiClient.getWarehouses(), apiClient.getBranches()]);
        if (controller.signal.aborted) return;
        setWarehouses(Array.isArray(w) ? w : (w as any)?.data || []);
        setBranches(Array.isArray(b) ? b : (b as any)?.data || []);
      } catch {
        /* soft */
      }
    })();
    return () => controller.abort();
  }, []);

  const resetPage = useCallback(() => setPage(1), []);

  const handleDuplicate = async (id: number) => {
    try {
      const res: any = await apiClient.duplicateQuotation(id);
      push('success', res?.message || 'Quotation duplicated');
      setPage((p) => p); // trigger reload
      // Force reload by toggling a dummy — simplest: use a state counter
      window.location.reload(); // fallback — see note below
    } catch (err: any) {
      push('error', err?.message || 'Could not duplicate quotation');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this quotation permanently?')) return;
    try {
      await apiClient.deleteQuotation(id);
      push('success', 'Quotation deleted');
      setQuotations((prev) => prev.filter((q) => q.id !== id));
    } catch (err: any) {
      push('error', err?.message || 'Could not delete quotation');
    }
  };

  const handleConvert = async (e: FormEvent) => {
    e.preventDefault();
    if (!convertModalQuotation) return;
    const errs: { due?: string } = {};
    if (convertForm.invoice_date && convertForm.due_date && convertForm.due_date < convertForm.invoice_date) {
      errs.due = 'Due date must be on or after invoice date';
    }
    if (Object.keys(errs).length > 0) {
      setConvertError(errs);
      return;
    }
    setConvertError({});
    setConverting(true);
    try {
      const res: any = await apiClient.convertQuotation(convertModalQuotation.id, {
        invoice_date: convertForm.invoice_date,
        due_date: convertForm.due_date,
        auto_deduct_stock: convertForm.auto_deduct_stock,
        warehouse_id: convertForm.warehouse_id ? Number(convertForm.warehouse_id) : undefined,
        payment_term: convertForm.payment_term,
      });
      push('success', `Converted to Invoice #${res?.invoice?.invoice_no || ''}`);
      setConvertModalQuotation(null);
      setQuotations((prev) =>
        prev.map((q) =>
          q.id === convertModalQuotation.id ? { ...q, status: 'converted' } : q,
        ),
      );
    } catch (err: any) {
      push('error', err?.message || 'Failed to convert quotation');
    } finally {
      setConverting(false);
    }
  };

  const handleUpdateStatus = async (e: FormEvent) => {
    e.preventDefault();
    if (!statusModalQuotation) return;
    if (statusForm.status === 'rejected' && !statusForm.rejection_reason.trim()) {
      setStatusError({ reason: 'Reason is required when rejecting' });
      return;
    }
    setStatusError({});
    try {
      await apiClient.updateQuotationStatus(statusModalQuotation.id, statusForm);
      push('success', `Status updated to ${statusForm.status}`);
      setQuotations((prev) =>
        prev.map((q) => (q.id === statusModalQuotation.id ? { ...q, status: statusForm.status } : q)),
      );
      setStatusModalQuotation(null);
    } catch (err: any) {
      push('error', err?.message || 'Failed to update status');
    }
  };

  const whatsappLink = (quote: any) => {
    const raw = String(quote.customer_phone || '').replace(/\D/g, '');
    const withCountry = raw.length === 10 ? `91${raw}` : raw;
    const msg =
      `Hello ${quote.customer_name},\n\n` +
      `Quotation *#${quote.quotation_number}* dated ${formatDate(quote.quotation_date)}\n\n` +
      `*Total:* ₹${Number(quote.total_amount).toLocaleString('en-IN')}\n` +
      `*Valid Until:* ${formatDate(quote.valid_until)}\n\n` +
      `Please let us know if you have any questions.\n\nThank you!`;
    return `https://api.whatsapp.com/send?phone=${withCountry}&text=${encodeURIComponent(msg)}`;
  };

  const renderStatusBadge = (q: any) => {
    if (q.status === 'converted')
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2.5 py-1 text-[11px] font-semibold text-purple-700 border border-purple-200">
          <CheckCircle size={11} /> Converted
        </span>
      );
    if (q.is_expired)
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 border border-rose-200">
          <Clock size={11} /> Expired
        </span>
      );
    if (q.status === 'accepted')
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
          <Check size={11} /> Accepted
        </span>
      );
    if (q.status === 'sent')
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 border border-blue-200">
          <Send size={11} /> Sent
        </span>
      );
    if (q.status === 'rejected')
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 border border-rose-200">
          <XCircle size={11} /> Rejected
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 border border-slate-200">
        <Clock size={11} /> Draft
      </span>
    );
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <ToastStack toasts={toasts} onDismiss={dismiss} />

      {/* Hero */}
      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6 text-white shadow-sm">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-indigo-300">
              CRM · Sales Documents
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Quotations & Proposals
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Prepare, share, and convert approved proposals into Sales Invoices.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => p)}
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-semibold transition hover:bg-white/20"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
            <button
              onClick={() => navigate('/quotations/create')}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:bg-indigo-400"
            >
              <Plus size={15} /> New Quotation
            </button>
          </div>
        </div>
      </section>

      {/* Metrics */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total Proposals"
          value={summary?.total_count ?? totalCount}
          hint={`Pipeline: ${formatMoney(summary?.total_value ?? 0)}`}
          icon={<FileText size={16} className="text-indigo-600" />}
        />
        <MetricCard
          label="Awaiting Reply"
          value={summary?.sent_count ?? 0}
          hint="Active quotes shared with clients"
          icon={<Send size={16} className="text-blue-600" />}
          tone="blue"
        />
        <MetricCard
          label="Accepted & Converted"
          value={(summary?.accepted_count || 0) + (summary?.converted_count || 0)}
          hint={`Won: ${formatMoney(summary?.accepted_value ?? 0)}`}
          icon={<CheckCircle size={16} className="text-emerald-600" />}
          tone="emerald"
        />
        <MetricCard
          label="Conversion Rate"
          value={`${summary?.conversion_rate ?? 0}%`}
          hint={`${summary?.expired_count || 0} expired`}
          icon={<TrendingUp size={16} className="text-purple-600" />}
          tone="purple"
        />
      </section>

      {/* Filters + Table */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                resetPage();
              }}
              placeholder="Search quotation #, customer, phone…"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={branchFilter}
              onChange={(e) => {
                setBranchFilter(e.target.value);
                resetPage();
              }}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 outline-none focus:border-indigo-500"
            >
              <option value="all">All Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <div className="inline-flex rounded-lg bg-slate-100 p-1 text-xs font-semibold">
              {['all', 'draft', 'sent', 'accepted', 'converted', 'expired'].map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setStatusFilter(s);
                    resetPage();
                  }}
                  className={`rounded-md px-2.5 py-1.5 capitalize transition ${
                    statusFilter === s
                      ? 'bg-white text-indigo-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : quotations.length === 0 ? (
          <div className="p-12 text-center">
            <FileText size={40} className="mx-auto text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-700">
              {search || statusFilter !== 'all' ? 'No matching quotations' : 'No quotations yet'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {search || statusFilter !== 'all'
                ? 'Try adjusting your filters.'
                : 'Create your first proposal to get started.'}
            </p>
            {!search && statusFilter === 'all' && (
              <button
                onClick={() => navigate('/quotations/create')}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500"
              >
                <Plus size={14} /> Create Quotation
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3.5 font-semibold">Quotation #</th>
                  <th className="px-5 py-3.5 font-semibold">Customer</th>
                  <th className="px-5 py-3.5 font-semibold">Branch</th>
                  <th className="px-5 py-3.5 font-semibold">Date</th>
                  <th className="px-5 py-3.5 font-semibold">Valid Until</th>
                  <th className="px-5 py-3.5 font-semibold text-right">Amount</th>
                  <th className="px-5 py-3.5 font-semibold">Status</th>
                  <th className="px-5 py-3.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {quotations.map((quote) => (
                  <tr key={quote.id} className="transition hover:bg-slate-50/70">
                    <td className="px-5 py-3.5">
                      <button
                        onClick={() => navigate(`/quotations/${quote.id}`)}
                        className="inline-flex items-center gap-1 font-bold text-indigo-600 hover:underline"
                      >
                        {quote.quotation_number || `QT-${quote.id}`}
                      </button>
                      {quote.converted_invoice_id && (
                        <span className="block text-[11px] font-normal text-purple-600">
                          → Inv #{quote.converted_invoice?.invoice_no || quote.converted_invoice_id}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-900">{quote.customer_name}</p>
                      <p className="text-xs text-slate-400">
                        {quote.customer_phone || quote.customer_email || '—'}
                      </p>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                        {quote.branch?.name || 'Main'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-600">
                      {formatDate(quote.quotation_date)}
                    </td>
                    <td className="px-5 py-3.5 text-xs">
                      <span className={quote.is_expired ? 'font-medium text-rose-600' : 'text-slate-600'}>
                        {formatDate(quote.valid_until)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold text-slate-900">
                      {formatMoney(quote.total_amount)}
                    </td>
                    <td className="px-5 py-3.5">{renderStatusBadge(quote)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        {quote.status !== 'converted' && (
                          <button
                            onClick={() => {
                              setConvertModalQuotation(quote);
                              setConvertForm((f) => ({
                                ...f,
                                warehouse_id: warehouses[0]?.id ? String(warehouses[0].id) : '',
                              }));
                              setConvertError({});
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100"
                          >
                            <FileCheck size={12} /> Convert
                          </button>
                        )}
                        {quote.customer_phone && (
                          <a
                            href={whatsappLink(quote)}
                            target="_blank"
                            rel="noreferrer"
                            title="Share via WhatsApp"
                            className="rounded-lg p-1.5 text-emerald-600 transition hover:bg-emerald-50"
                          >
                            <MessageCircle size={15} />
                          </a>
                        )}
                        <ActionMenu
                          items={[
                            {
                              label: 'View / Print',
                              icon: <Printer size={13} />,
                              onClick: () => navigate(`/quotations/${quote.id}`),
                            },
                            ...(quote.status !== 'converted'
                              ? [
                                  {
                                    label: 'Edit',
                                    icon: <Edit2 size={13} />,
                                    onClick: () => navigate(`/quotations/${quote.id}/edit`),
                                  },
                                  {
                                    label: 'Change Status',
                                    icon: <Send size={13} />,
                                    onClick: () => {
                                      setStatusModalQuotation(quote);
                                      setStatusForm({
                                        status: quote.status === 'draft' ? 'sent' : 'accepted',
                                        rejection_reason: quote.rejection_reason || '',
                                        follow_up_date: quote.follow_up_date || '',
                                      });
                                      setStatusError({});
                                    },
                                  },
                                ]
                              : []),
                            {
                              label: 'Duplicate',
                              icon: <Copy size={13} />,
                              onClick: () => handleDuplicate(quote.id),
                            },
                            ...(quote.status !== 'converted'
                              ? [
                                  {
                                    label: 'Delete',
                                    icon: <Trash2 size={13} />,
                                    onClick: () => handleDelete(quote.id),
                                    destructive: true,
                                  },
                                ]
                              : []),
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
            <p className="text-xs text-slate-500">
              Page {page} of {totalPages} · {totalCount} total
            </p>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Convert Modal */}
      {convertModalQuotation && (
        <Modal onClose={() => setConvertModalQuotation(null)}>
          <ModalHeader
            icon={<FileCheck size={18} />}
            title="Convert to Sales Invoice"
            subtitle={`#${convertModalQuotation.quotation_number} · ${convertModalQuotation.customer_name}`}
            onClose={() => setConvertModalQuotation(null)}
          />
          <form onSubmit={handleConvert} className="flex min-h-0 flex-1 flex-col">
            <div className="space-y-4 overflow-y-auto p-6 text-xs">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3 text-emerald-800">
                Creates a Sales Invoice for{' '}
                <strong>{formatMoney(convertModalQuotation.total_amount)}</strong> and deducts inventory.
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Invoice Date *">
                  <input
                    type="date"
                    required
                    value={convertForm.invoice_date}
                    onChange={(e) =>
                      setConvertForm({ ...convertForm, invoice_date: e.target.value })
                    }
                    className={inputCls}
                  />
                </Field>
                <Field label="Due Date *" error={convertError.due}>
                  <input
                    type="date"
                    required
                    value={convertForm.due_date}
                    onChange={(e) => setConvertForm({ ...convertForm, due_date: e.target.value })}
                    className={inputCls}
                  />
                </Field>
              </div>

              <Field label="Dispatch Warehouse">
                <select
                  value={convertForm.warehouse_id}
                  onChange={(e) =>
                    setConvertForm({ ...convertForm, warehouse_id: e.target.value })
                  }
                  className={inputCls}
                >
                  <option value="">Default warehouse</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.code || 'MAIN'})
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Payment Terms">
                <select
                  value={convertForm.payment_term}
                  onChange={(e) =>
                    setConvertForm({ ...convertForm, payment_term: e.target.value })
                  }
                  className={inputCls}
                >
                  <option value="Immediate">Immediate</option>
                  <option value="Net 7">Net 7 Days</option>
                  <option value="Net 15">Net 15 Days</option>
                  <option value="Net 30">Net 30 Days</option>
                  <option value="Net 60">Net 60 Days</option>
                </select>
              </Field>

              <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <input
                  type="checkbox"
                  checked={convertForm.auto_deduct_stock}
                  onChange={(e) =>
                    setConvertForm({ ...convertForm, auto_deduct_stock: e.target.checked })
                  }
                  className="mt-0.5 rounded border-slate-300 text-emerald-600"
                />
                <span className="text-slate-700">
                  Deduct warehouse inventory for catalog products
                </span>
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-3.5">
              <button
                type="button"
                onClick={() => setConvertModalQuotation(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={converting}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {converting && <Loader2 size={13} className="animate-spin" />}
                {converting ? 'Converting…' : 'Generate Invoice'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Status Modal */}
      {statusModalQuotation && (
        <Modal onClose={() => setStatusModalQuotation(null)} size="sm">
          <ModalHeader
            icon={<Send size={18} />}
            title="Update Status"
            subtitle={`#${statusModalQuotation.quotation_number}`}
            onClose={() => setStatusModalQuotation(null)}
          />
          <form onSubmit={handleUpdateStatus} className="flex min-h-0 flex-1 flex-col">
            <div className="space-y-4 overflow-y-auto p-6 text-xs">
              <Field label="New Status">
                <select
                  value={statusForm.status}
                  onChange={(e) => setStatusForm({ ...statusForm, status: e.target.value })}
                  className={inputCls}
                >
                  <option value="draft">Draft</option>
                  <option value="sent">Sent to Customer</option>
                  <option value="accepted">Accepted / Approved</option>
                  <option value="rejected">Rejected / Lost</option>
                </select>
              </Field>

              {statusForm.status === 'rejected' && (
                <Field label="Rejection Reason *" error={statusError.reason}>
                  <textarea
                    rows={3}
                    value={statusForm.rejection_reason}
                    onChange={(e) =>
                      setStatusForm({ ...statusForm, rejection_reason: e.target.value })
                    }
                    placeholder="e.g. Budget constraints, competitor selected…"
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-xs outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
                  />
                </Field>
              )}

              <Field label="Follow-up Date">
                <input
                  type="date"
                  value={statusForm.follow_up_date}
                  onChange={(e) =>
                    setStatusForm({ ...statusForm, follow_up_date: e.target.value })
                  }
                  className={inputCls}
                />
              </Field>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-3.5">
              <button
                type="button"
                onClick={() => setStatusModalQuotation(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"
              >
                Update Status
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  icon,
  tone = 'slate',
}: {
  label: string;
  value: React.ReactNode;
  hint: string;
  icon: React.ReactNode;
  tone?: 'slate' | 'blue' | 'emerald' | 'purple';
}) {
  const colors = {
    slate: 'text-slate-900',
    blue: 'text-blue-600',
    emerald: 'text-emerald-600',
    purple: 'text-purple-600',
  } as const;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between text-slate-500">
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
        {icon}
      </div>
      <p className={`mt-3 text-2xl font-bold ${colors[tone]}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

/* ============================================================
 * LEADS PAGE
 * ========================================================== */
const LEAD_STAGES = [
  { key: 'new', label: 'New', color: 'indigo' },
  { key: 'contacted', label: 'Contacted', color: 'blue' },
  { key: 'qualified', label: 'Qualified', color: 'teal' },
  { key: 'quotation_sent', label: 'Proposal Sent', color: 'amber' },
  { key: 'negotiation', label: 'Negotiation', color: 'purple' },
  { key: 'won', label: 'Won', color: 'emerald' },
  { key: 'lost', label: 'Lost', color: 'rose' },
] as const;

type LeadStageKey = (typeof LEAD_STAGES)[number]['key'];

const emptyLeadForm = () => ({
  name: '',
  company_name: '',
  branch_id: '',
  email: '',
  phone: '',
  whatsapp: '',
  source: 'website',
  stage: 'new' as LeadStageKey,
  priority: 'medium',
  expected_value: '',
  city: '',
  state: '',
  address: '',
  notes: '',
  next_follow_up: '',
});

export function LeadsPage() {
  const { toasts, push, dismiss } = useToasts();

  const [leads, setLeads] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [branches, setBranches] = useState<any[]>([]);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<any>(null);
  const [detailLead, setDetailLead] = useState<any>(null);
  const [stageModalLead, setStageModalLead] = useState<any>(null);

  const [leadForm, setLeadForm] = useState(emptyLeadForm());
  const [leadErrors, setLeadErrors] = useState<{ name?: string; email?: string; phone?: string }>({});

  const [activityForm, setActivityForm] = useState({
    activity_type: 'call',
    title: '',
    description: '',
    follow_up_date: '',
  });
  const [activitySubmitting, setActivitySubmitting] = useState(false);

  const [stageForm, setStageForm] = useState({
    stage: 'contacted' as LeadStageKey,
    note: '',
    lost_reason: '',
  });

  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      try {
        const params: Record<string, unknown> = { per_page: 100 };
        if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
        if (stageFilter !== 'all') params.stage = stageFilter;
        if (sourceFilter !== 'all') params.source = sourceFilter;
        if (branchFilter !== 'all') params.branch_id = branchFilter;

        const [leadsRes, sumRes] = await Promise.all([
          apiClient.getLeads(params),
          apiClient.getLeadSummary(),
        ]);
        if (controller.signal.aborted) return;
        const data: any = leadsRes;
        setLeads(Array.isArray(data) ? data : data?.data || []);
        setSummary(sumRes);
      } catch (e: any) {
        if (!controller.signal.aborted) push('error', e?.message || 'Could not load leads');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [debouncedSearch, stageFilter, sourceFilter, branchFilter, refreshKey, push]);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const bRes: any = await apiClient.getBranches();
        if (controller.signal.aborted) return;
        setBranches(Array.isArray(bRes) ? bRes : bRes?.data || []);
      } catch {
        /* soft */
      }
    })();
    return () => controller.abort();
  }, []);

  // Memoize per-stage groups
  const groupedLeads = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const st of LEAD_STAGES) groups[st.key] = [];
    for (const l of leads) {
      if (groups[l.stage]) groups[l.stage].push(l);
    }
    return groups;
  }, [leads]);

  const stageTotal = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const st of LEAD_STAGES) {
      totals[st.key] = (groupedLeads[st.key] || []).reduce(
        (s, l) => s + safeNum(l.expected_value),
        0,
      );
    }
    return totals;
  }, [groupedLeads]);

  const openCreate = (presetStage?: LeadStageKey) => {
    setEditingLead(null);
    setLeadErrors({});
    setLeadForm({ ...emptyLeadForm(), stage: presetStage || 'new' });
    setCreateModalOpen(true);
  };

  const saveLead = async (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof leadErrors = {};
    if (!leadForm.name.trim()) errs.name = 'Name is required';
    if (!validators.email(leadForm.email)) errs.email = 'Invalid email format';
    if (!validators.phone(leadForm.phone)) errs.phone = 'Invalid phone format';
    if (Object.keys(errs).length > 0) {
      setLeadErrors(errs);
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        ...leadForm,
        company_id: 1,
        branch_id: leadForm.branch_id ? Number(leadForm.branch_id) : null,
        expected_value: leadForm.expected_value ? Number(leadForm.expected_value) : 0,
      };
      let savedLead: any = null;
      if (editingLead) {
        const res: any = await apiClient.updateLead(editingLead.id, payload);
        savedLead = res?.data || res;
        push('success', 'Lead updated');
      } else {
        const res: any = await apiClient.createLead(payload);
        savedLead = res?.data || res;
        push('success', 'Lead created');
      }
      setCreateModalOpen(false);
      setLeads((prev) => {
        if (editingLead) {
          return prev.map((l) =>
            l.id === editingLead.id ? { ...l, ...leadForm, ...(savedLead?.id ? savedLead : {}) } : l,
          );
        }
        if (savedLead && savedLead.id) {
          return [savedLead, ...prev.filter((l) => l.id !== savedLead.id)];
        }
        return prev;
      });
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      push('error', err?.message || 'Could not save lead');
    } finally {
      setSaving(false);
    }
  };

  const handleStageMove = async (e: FormEvent) => {
    e.preventDefault();
    if (!stageModalLead?.id) return;
    try {
      await apiClient.updateLeadStage(
        stageModalLead.id,
        stageForm.stage,
        stageForm.note,
        stageForm.lost_reason,
      );
      setLeads((prev) =>
        prev.map((l) => (l.id === stageModalLead.id ? { ...l, stage: stageForm.stage } : l)),
      );
      push('success', `Moved to ${stageForm.stage.replace('_', ' ')}`);
      setStageModalLead(null);
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      push('error', err?.message || 'Failed to update stage');
    }
  };

  const handleAddActivity = async (e: FormEvent) => {
    e.preventDefault();
    if (!detailLead?.id || !activityForm.title.trim()) return;
    setActivitySubmitting(true);
    try {
      await apiClient.addLeadActivity(detailLead.id, activityForm);
      const fresh: any = await apiClient.getLead(detailLead.id);
      setDetailLead(fresh?.data || fresh);
      setActivityForm({ activity_type: 'call', title: '', description: '', follow_up_date: '' });
      push('success', 'Activity logged');
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      push('error', err?.message || 'Failed to log activity');
    } finally {
      setActivitySubmitting(false);
    }
  };

  const handleConvertLead = async (lead: any) => {
    if (!lead?.id) return;
    if (!window.confirm(`Convert "${lead.name}" into a Customer and Contact card?`)) return;
    try {
      await apiClient.convertLead(lead.id, { create_customer: true, create_contact: true });
      push('success', `Converted "${lead.name}" to Customer`);
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, stage: 'won' } : l)));
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      push('error', err?.message || 'Failed to convert lead');
    }
  };

  const openDetail = async (id: number) => {
    if (!id) return;
    try {
      const res: any = await apiClient.getLead(id);
      setDetailLead(res?.data || res);
    } catch (err: any) {
      push('error', err?.message || 'Could not load lead');
      // If the lead doesn't exist on server, filter out invalid/stale lead from local state
      setLeads((prev) => prev.filter((l) => l.id !== id));
    }
  };

  const handleDeleteLead = async (id: number, name: string) => {
    if (!id) return;
    if (!window.confirm(`Are you sure you want to delete lead "${name}"? This action cannot be undone.`)) return;
    try {
      await apiClient.deleteLead(id);
      setLeads((prev) => prev.filter((l) => l.id !== id));
      if (detailLead?.id === id) setDetailLead(null);
      push('success', 'Lead deleted successfully');
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      push('error', err?.message || 'Failed to delete lead');
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <ToastStack toasts={toasts} onDismiss={dismiss} />

      {/* Hero */}
      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6 text-white shadow-sm">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-indigo-300">
              CRM · Sales Pipeline
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Leads & Prospects
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Track enquiries, manage stages, log activities, and convert won deals into accounts.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl bg-white/10 p-1 text-xs">
              <button
                onClick={() => setViewMode('kanban')}
                className={`rounded-lg px-3 py-1.5 font-semibold transition ${
                  viewMode === 'kanban' ? 'bg-white text-slate-900' : 'text-white/80 hover:text-white'
                }`}
              >
                Kanban
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`rounded-lg px-3 py-1.5 font-semibold transition ${
                  viewMode === 'table' ? 'bg-white text-slate-900' : 'text-white/80 hover:text-white'
                }`}
              >
                Table
              </button>
            </div>
            <button
              onClick={() => openCreate()}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:bg-indigo-400"
            >
              <Plus size={15} /> Add Lead
            </button>
          </div>
        </div>
      </section>

      {/* Metrics */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total Leads"
          value={summary?.total_leads ?? leads.length}
          hint="All registered prospects"
          icon={<UserPlus size={16} className="text-indigo-600" />}
        />
        <MetricCard
          label="Pipeline Value"
          value={formatMoney(summary?.total_pipeline_value ?? 0)}
          hint="Active deal estimates"
          icon={<TrendingUp size={16} className="text-indigo-600" />}
          tone="blue"
        />
        <MetricCard
          label="Won Revenue"
          value={formatMoney(summary?.won_value ?? 0)}
          hint={`Conversion: ${summary?.conversion_rate ?? 0}%`}
          icon={<CheckCircle size={16} className="text-emerald-600" />}
          tone="emerald"
        />
        <MetricCard
          label="Needs Follow-up"
          value={summary?.needs_follow_up ?? 0}
          hint="Scheduled today or overdue"
          icon={<Clock size={16} className="text-amber-600" />}
        />
      </section>

      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, company, phone…"
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-indigo-500"
          >
            <option value="all">All Stages</option>
            {LEAD_STAGES.map((st) => (
              <option key={st.key} value={st.key}>
                {st.label}
              </option>
            ))}
          </select>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-indigo-500"
          >
            <option value="all">All Sources</option>
            <option value="website">Website</option>
            <option value="referral">Referral</option>
            <option value="walk_in">Walk-in</option>
            <option value="social_media">Social Media</option>
            <option value="campaign">Campaign</option>
            <option value="cold_call">Cold Call</option>
          </select>
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-indigo-500"
          >
            <option value="all">All Branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* View */}
      {viewMode === 'kanban' ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {LEAD_STAGES.map((st) => {
            const stageLeads = groupedLeads[st.key] || [];
            return (
              <div
                key={st.key}
                className="flex min-h-[500px] w-80 flex-shrink-0 flex-col rounded-2xl border border-slate-200 bg-slate-100/70 p-3"
              >
                <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-800">{st.label}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-700 ring-1 ring-slate-200">
                      {stageLeads.length}
                    </span>
                  </div>
                  <button
                    onClick={() => openCreate(st.key)}
                    className="rounded-md p-1 text-slate-400 transition hover:bg-white hover:text-indigo-600"
                    aria-label={`Add lead to ${st.label}`}
                  >
                    <Plus size={12} />
                  </button>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto">
                  {loading
                    ? [1, 2].map((i) => <Skeleton key={i} className="h-32 w-full" />)
                    : stageLeads.map((lead) => (
                        <LeadCard
                          key={lead.id}
                          lead={lead}
                          onOpen={() => void openDetail(lead.id)}
                          onMove={() => {
                            setStageModalLead(lead);
                            setStageForm({ stage: lead.stage, note: '', lost_reason: '' });
                          }}
                          onConvert={() => void handleConvertLead(lead)}
                          onEdit={() => {
                            setEditingLead(lead);
                            setLeadForm({ ...emptyLeadForm(), ...lead });
                            setCreateModalOpen(true);
                          }}
                          onDelete={() => void handleDeleteLead(lead.id, lead.name)}
                        />
                      ))}
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 text-[11px] font-medium text-slate-500">
                  <span>Total</span>
                  <span>{formatMoney(stageTotal[st.key])}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : leads.length === 0 ? (
            <EmptyState
              icon={<UserPlus size={40} className="text-slate-300" />}
              title="No leads yet"
              description="Add your first prospect to start tracking."
              action={
                <button
                  onClick={() => openCreate()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500"
                >
                  <Plus size={14} /> Add Lead
                </button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[750px] text-left text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Lead</th>
                    <th className="px-5 py-3 font-semibold">Branch</th>
                    <th className="px-5 py-3 font-semibold">Company</th>
                    <th className="px-5 py-3 font-semibold">Stage</th>
                    <th className="px-5 py-3 font-semibold text-right">Value</th>
                    <th className="px-5 py-3 font-semibold">Next Action</th>
                    <th className="px-5 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leads.map((l) => (
                    <tr key={l.id} className="transition hover:bg-slate-50/70">
                      <td className="px-5 py-3.5">
                        <button
                          onClick={() => void openDetail(l.id)}
                          className="text-left font-semibold text-slate-900 hover:text-indigo-600"
                        >
                          {l.name}
                        </button>
                        <p className="text-xs text-slate-400">{l.phone || l.email || '—'}</p>
                        {(l.city || l.state || l.address) && (
                          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                            <MapPin size={10} className="shrink-0 text-slate-400" />
                            <span>{[l.city, l.state].filter(Boolean).join(', ') || l.address}</span>
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-600">
                        {l.branch?.name || '—'}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-600">
                        {l.company_name || '—'}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold capitalize text-indigo-700">
                          {l.stage?.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-semibold text-slate-900">
                        {formatMoney(l.expected_value)}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-600">
                        {formatDate(l.next_follow_up)}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => {
                              setStageModalLead(l);
                              setStageForm({ stage: l.stage, note: '', lost_reason: '' });
                            }}
                            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100"
                            title="Move stage"
                          >
                            <ArrowRight size={13} />
                          </button>
                          {l.stage !== 'won' && (
                            <button
                              onClick={() => void handleConvertLead(l)}
                              className="rounded-lg p-1.5 text-emerald-600 transition hover:bg-emerald-50"
                              title="Convert to customer"
                            >
                              <UserCheck size={13} />
                            </button>
                          )}
                          <ActionMenu
                            items={[
                              {
                                label: 'View Details',
                                icon: <Eye size={13} />,
                                onClick: () => void openDetail(l.id),
                              },
                              {
                                label: 'Edit',
                                icon: <Edit2 size={13} />,
                                onClick: () => {
                                  setEditingLead(l);
                                  setLeadForm({ ...emptyLeadForm(), ...l });
                                  setCreateModalOpen(true);
                                },
                              },
                              {
                                label: 'Delete',
                                icon: <Trash2 size={13} className="text-rose-500" />,
                                onClick: () => void handleDeleteLead(l.id, l.name),
                              },
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Detail Modal */}
      {detailLead && (
        <Modal onClose={() => setDetailLead(null)} size="lg">
          <ModalHeader
            icon={<UserCheck size={18} />}
            title={detailLead.name}
            subtitle={`${detailLead.company_name || 'Individual'} · ${detailLead.stage?.replace('_', ' ')}`}
            onClose={() => setDetailLead(null)}
          />
          <div className="space-y-5 overflow-y-auto p-6 text-xs">
            {/* Quick Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const l = detailLead;
                    setDetailLead(null);
                    setEditingLead(l);
                    setLeadForm({ ...emptyLeadForm(), ...l });
                    setCreateModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  <Edit2 size={12} className="text-slate-500" /> Edit Lead
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const l = detailLead;
                    setStageModalLead(l);
                    setStageForm({ stage: l.stage, note: '', lost_reason: '' });
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  <ArrowRight size={12} className="text-slate-500" /> Move Stage
                </button>
                {detailLead.stage !== 'won' && (
                  <button
                    type="button"
                    onClick={() => {
                      void handleConvertLead(detailLead);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                  >
                    <UserCheck size={12} /> Convert to Customer
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  void handleDeleteLead(detailLead.id, detailLead.name);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100"
              >
                <Trash2 size={12} /> Delete
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 sm:grid-cols-3">
              <DetailRow label="Phone" value={detailLead.phone} />
              <DetailRow label="Email" value={detailLead.email} />
              <DetailRow label="Deal Value" value={formatMoney(detailLead.expected_value)} highlight />
              <DetailRow label="City" value={detailLead.city} />
              <DetailRow label="State" value={detailLead.state} />
              <div className="col-span-2 sm:col-span-3">
                <DetailRow label="Address" value={detailLead.address} />
              </div>
            </div>

            <form
              onSubmit={handleAddActivity}
              className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
            >
              <h3 className="text-xs font-bold text-slate-800">Log Activity</h3>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={activityForm.activity_type}
                  onChange={(e) =>
                    setActivityForm({ ...activityForm, activity_type: e.target.value })
                  }
                  className="h-9 rounded-lg border border-slate-200 px-2 text-xs focus:border-indigo-500 focus:outline-none"
                >
                  <option value="call">Phone Call</option>
                  <option value="meeting">Meeting / Demo</option>
                  <option value="note">Internal Note</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">Email</option>
                </select>
                <input
                  type="date"
                  value={activityForm.follow_up_date}
                  onChange={(e) =>
                    setActivityForm({ ...activityForm, follow_up_date: e.target.value })
                  }
                  className="h-9 rounded-lg border border-slate-200 px-2 text-xs focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <input
                required
                value={activityForm.title}
                onChange={(e) => setActivityForm({ ...activityForm, title: e.target.value })}
                placeholder="What happened?"
                className="h-9 w-full rounded-lg border border-slate-200 px-2 text-xs focus:border-indigo-500 focus:outline-none"
              />
              <textarea
                rows={2}
                value={activityForm.description}
                onChange={(e) =>
                  setActivityForm({ ...activityForm, description: e.target.value })
                }
                placeholder="Notes, outcomes…"
                className="w-full rounded-lg border border-slate-200 p-2 text-xs focus:border-indigo-500 focus:outline-none"
              />
              <button
                disabled={activitySubmitting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
              >
                {activitySubmitting && <Loader2 size={11} className="animate-spin" />}
                Save Activity
              </button>
            </form>

            <div>
              <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Timeline
              </h3>
              {detailLead.activities?.length ? (
                <div className="space-y-3">
                  {detailLead.activities.map((act: any) => (
                    <div
                      key={act.id}
                      className="space-y-0.5 border-l-2 border-indigo-300 pl-3"
                    >
                      <p className="font-semibold text-slate-900">{act.title}</p>
                      {act.description && <p className="text-slate-600">{act.description}</p>}
                      <p className="text-[10px] text-slate-400">
                        {new Date(act.activity_date).toLocaleString()} · {act.activity_type}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 italic">No activity yet.</p>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Create/Edit Modal */}
      {createModalOpen && (
        <Modal onClose={() => setCreateModalOpen(false)}>
          <ModalHeader
            icon={<UserPlus size={18} />}
            title={editingLead ? 'Edit Lead' : 'Add Lead'}
            subtitle="Track prospect details and pipeline placement"
            onClose={() => setCreateModalOpen(false)}
          />
          <form onSubmit={saveLead} className="flex min-h-0 flex-1 flex-col">
            <div className="space-y-3 overflow-y-auto p-6 text-xs">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name *" error={leadErrors.name}>
                  <input
                    value={leadForm.name}
                    onChange={(e) => setLeadForm({ ...leadForm, name: e.target.value })}
                    className={inputCls}
                  />
                </Field>
                <Field label="Company">
                  <input
                    value={leadForm.company_name}
                    onChange={(e) =>
                      setLeadForm({ ...leadForm, company_name: e.target.value })
                    }
                    className={inputCls}
                  />
                </Field>
                <Field label="Phone" error={leadErrors.phone}>
                  <input
                    value={leadForm.phone}
                    onChange={(e) => setLeadForm({ ...leadForm, phone: e.target.value })}
                    className={inputCls}
                  />
                </Field>
                <Field label="Email" error={leadErrors.email}>
                  <input
                    type="email"
                    value={leadForm.email}
                    onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })}
                    className={inputCls}
                  />
                </Field>
                <Field label="Source">
                  <select
                    value={leadForm.source}
                    onChange={(e) => setLeadForm({ ...leadForm, source: e.target.value })}
                    className={inputCls}
                  >
                    <option value="website">Website</option>
                    <option value="referral">Referral</option>
                    <option value="walk_in">Walk-in</option>
                    <option value="social_media">Social Media</option>
                    <option value="campaign">Campaign</option>
                    <option value="cold_call">Cold Call</option>
                  </select>
                </Field>
                <Field label="Expected Value (₹)">
                  <input
                    type="number"
                    value={leadForm.expected_value}
                    onChange={(e) =>
                      setLeadForm({ ...leadForm, expected_value: e.target.value })
                    }
                    className={inputCls}
                  />
                </Field>
                <Field label="Stage">
                  <select
                    value={leadForm.stage}
                    onChange={(e) =>
                      setLeadForm({ ...leadForm, stage: e.target.value as LeadStageKey })
                    }
                    className={inputCls}
                  >
                    {LEAD_STAGES.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Branch" className="sm:col-span-2">
                  <select
                    value={leadForm.branch_id}
                    onChange={(e) => setLeadForm({ ...leadForm, branch_id: e.target.value })}
                    className={inputCls}
                  >
                    <option value="">Default branch</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Address" className="sm:col-span-2">
                  <textarea
                    rows={2}
                    value={leadForm.address}
                    onChange={(e) => setLeadForm({ ...leadForm, address: e.target.value })}
                    placeholder="Street address, building, locality…"
                    className="w-full rounded-xl border border-slate-200 p-2 text-xs focus:border-indigo-500 focus:outline-none"
                  />
                </Field>
                <Field label="City">
                  <input
                    value={leadForm.city}
                    onChange={(e) => setLeadForm({ ...leadForm, city: e.target.value })}
                    placeholder="City / District"
                    className={inputCls}
                  />
                </Field>
                <Field label="State">
                  <input
                    value={leadForm.state}
                    onChange={(e) => setLeadForm({ ...leadForm, state: e.target.value })}
                    placeholder="State"
                    className={inputCls}
                  />
                </Field>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-3.5">
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
              >
                {saving && <Loader2 size={13} className="animate-spin" />}
                {saving ? 'Saving…' : editingLead ? 'Update Lead' : 'Create Lead'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Stage Modal */}
      {stageModalLead && (
        <Modal onClose={() => setStageModalLead(null)} size="sm">
          <ModalHeader
            icon={<ArrowRight size={18} />}
            title="Move Pipeline Stage"
            subtitle={stageModalLead.name}
            onClose={() => setStageModalLead(null)}
          />
          <form onSubmit={handleStageMove} className="flex min-h-0 flex-1 flex-col">
            <div className="space-y-3 overflow-y-auto p-6 text-xs">
              <Field label="New Stage">
                <select
                  value={stageForm.stage}
                  onChange={(e) =>
                    setStageForm({ ...stageForm, stage: e.target.value as LeadStageKey })
                  }
                  className={inputCls}
                >
                  {LEAD_STAGES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>
              {stageForm.stage === 'lost' && (
                <Field label="Reason for Loss">
                  <input
                    value={stageForm.lost_reason}
                    onChange={(e) => setStageForm({ ...stageForm, lost_reason: e.target.value })}
                    placeholder="Price, competitor, timing…"
                    className={inputCls}
                  />
                </Field>
              )}
              <Field label="Note">
                <textarea
                  rows={2}
                  value={stageForm.note}
                  onChange={(e) => setStageForm({ ...stageForm, note: e.target.value })}
                  placeholder="Optional timeline remark"
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2 text-xs focus:border-indigo-500 focus:outline-none"
                />
              </Field>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-3.5">
              <button
                type="button"
                onClick={() => setStageModalLead(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500"
              >
                Update Stage
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function LeadCard({
  lead,
  onOpen,
  onMove,
  onConvert,
  onEdit,
  onDelete,
}: {
  lead: any;
  onOpen: () => void;
  onMove: () => void;
  onConvert: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const isHigh = lead.priority === 'urgent' || lead.priority === 'high';
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition hover:border-indigo-300">
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={onOpen}
          className="text-left font-semibold text-sm text-slate-900 transition hover:text-indigo-600"
        >
          {lead.name}
        </button>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
            isHigh ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'
          }`}
        >
          {lead.priority}
        </span>
      </div>
      {lead.company_name && (
        <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
          <Building size={11} /> {lead.company_name}
        </p>
      )}
      {(lead.city || lead.state || lead.address) && (
        <p
          className="mt-1 flex items-center gap-1 text-[11px] text-slate-500 truncate"
          title={lead.address ? `${lead.address}${lead.city ? `, ${lead.city}` : ''}${lead.state ? `, ${lead.state}` : ''}` : `${lead.city || ''} ${lead.state || ''}`}
        >
          <MapPin size={11} className="shrink-0 text-slate-400" />
          <span>{[lead.city, lead.state].filter(Boolean).join(', ') || lead.address}</span>
        </p>
      )}
      {lead.branch?.name && (
        <span className="mt-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
          {lead.branch.name}
        </span>
      )}
      {safeNum(lead.expected_value) > 0 && (
        <p className="mt-2 text-xs font-bold text-emerald-600">
          {formatMoney(lead.expected_value)}
        </p>
      )}
      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-500">
        <span className="truncate">{lead.phone || lead.email || '—'}</span>
        <div className="flex items-center gap-0.5">
          {onEdit && (
            <button
              onClick={onEdit}
              title="Edit lead"
              className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-indigo-600"
            >
              <Edit2 size={13} />
            </button>
          )}
          <button
            onClick={onMove}
            title="Move stage"
            className="rounded p-1 text-slate-400 transition hover:bg-slate-50 hover:text-indigo-600"
          >
            <ArrowRight size={13} />
          </button>
          {lead.stage !== 'won' && (
            <button
              onClick={onConvert}
              title="Convert to customer"
              className="rounded p-1 text-emerald-600 transition hover:bg-emerald-50"
            >
              <UserCheck size={13} />
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              title="Delete lead"
              className="rounded p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * CONTACTS PAGE
 * ========================================================== */
const emptyContactForm = () => ({
  name: '',
  company_name: '',
  branch_id: '',
  designation: '',
  email: '',
  phone: '',
  alt_phone: '',
  contact_type: 'customer',
  gstin: '',
  pan: '',
  billing_address: '',
  city: '',
  state: '',
  pincode: '',
  notes: '',
});

export function ContactsPage() {
  const { toasts, push, dismiss } = useToasts();
  const [contacts, setContacts] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [typeFilter, setTypeFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [branches, setBranches] = useState<any[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<any>(null);
  const [detailContact, setDetailContact] = useState<any>(null);

  const [form, setForm] = useState(emptyContactForm());
  const [errors, setErrors] = useState<{ name?: string; email?: string; phone?: string; gstin?: string; pan?: string }>({});
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      try {
        const params: Record<string, unknown> = { per_page: 50 };
        if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
        if (typeFilter !== 'all') params.contact_type = typeFilter;
        if (branchFilter !== 'all') params.branch_id = branchFilter;

        const [res, sumRes] = await Promise.all([
          apiClient.getContacts(params),
          apiClient.getContactSummary(),
        ]);
        if (controller.signal.aborted) return;
        const data: any = res;
        setContacts(Array.isArray(data) ? data : data?.data || []);
        setSummary(sumRes);
      } catch (e: any) {
        if (!controller.signal.aborted) push('error', e?.message || 'Could not load contacts');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [debouncedSearch, typeFilter, branchFilter, refreshKey, push]);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const bRes: any = await apiClient.getBranches();
        if (controller.signal.aborted) return;
        setBranches(Array.isArray(bRes) ? bRes : bRes?.data || []);
      } catch {
        /* soft */
      }
    })();
    return () => controller.abort();
  }, []);

  // Debounced duplicate check
  useEffect(() => {
    if (!form.phone && !form.email) {
      setDuplicateWarning(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const check: any = await apiClient.checkContactDuplicate({
          phone: form.phone,
          email: form.email,
          exclude_id: editingContact?.id,
        });
        if (check?.is_duplicate && check?.matches?.length > 0) {
          const m = check.matches[0];
          setDuplicateWarning(`Match found: ${m.name} (${m.phone || m.email})`);
        } else {
          setDuplicateWarning(null);
        }
      } catch {
        /* soft */
      }
    }, 500);
    return () => clearTimeout(t);
  }, [form.phone, form.email, editingContact]);

  const saveContact = async (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (!validators.email(form.email)) errs.email = 'Invalid email';
    if (!validators.phone(form.phone)) errs.phone = 'Invalid phone';
    if (!validators.gstin(form.gstin)) errs.gstin = 'Invalid GSTIN';
    if (!validators.pan(form.pan)) errs.pan = 'Invalid PAN';
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        ...form,
        company_id: 1,
        branch_id: form.branch_id ? Number(form.branch_id) : null,
      };
      let savedContact: any = null;
      if (editingContact) {
        const res: any = await apiClient.updateContact(editingContact.id, payload);
        savedContact = res?.data || res;
        push('success', 'Contact updated');
      } else {
        const res: any = await apiClient.createContact(payload);
        savedContact = res?.data || res;
        push('success', 'Contact created');
      }
      setModalOpen(false);
      setContacts((prev) => {
        if (editingContact) {
          return prev.map((c) =>
            c.id === editingContact.id ? { ...c, ...form, ...(savedContact?.id ? savedContact : {}) } : c,
          );
        }
        if (savedContact && savedContact.id) {
          return [savedContact, ...prev.filter((c) => c.id !== savedContact.id)];
        }
        return prev;
      });
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      push('error', err?.message || 'Could not save contact');
    } finally {
      setSaving(false);
    }
  };

  const deleteContact = async (id: number) => {
    if (!window.confirm('Delete this contact?')) return;
    try {
      await apiClient.deleteContact(id);
      setContacts((prev) => prev.filter((c) => c.id !== id));
      push('success', 'Contact deleted');
    } catch (err: any) {
      push('error', err?.message || 'Could not delete contact');
    }
  };

  const openDetail = async (id: number) => {
    try {
      const res: any = await apiClient.getContact(id);
      setDetailContact(res?.data || res);
    } catch (err: any) {
      push('error', err?.message || 'Could not load contact');
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <ToastStack toasts={toasts} onDismiss={dismiss} />

      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6 text-white shadow-sm">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-indigo-300">
              CRM · Directory
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Contacts Directory
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Centralized address book and tax registry for customers, suppliers, dealers, and reps.
            </p>
          </div>
          <button
            onClick={() => {
              setEditingContact(null);
              setErrors({});
              setDuplicateWarning(null);
              setForm(emptyContactForm());
              setModalOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:bg-indigo-400"
          >
            <UserPlus size={15} /> Add Contact
          </button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total Contacts"
          value={summary?.total_contacts ?? contacts.length}
          hint="All registered contacts"
          icon={<UserPlus size={16} className="text-indigo-600" />}
        />
        <MetricCard
          label="Customers"
          value={summary?.customers ?? 0}
          hint="Active buyer accounts"
          icon={<UserCheck size={16} className="text-indigo-600" />}
          tone="blue"
        />
        <MetricCard
          label="Suppliers"
          value={summary?.suppliers ?? 0}
          hint="Vendor accounts"
          icon={<Building size={16} className="text-teal-600" />}
        />
        <MetricCard
          label="Dealers & Partners"
          value={summary?.dealers ?? 0}
          hint="Channel accounts"
          icon={<UserCheck size={16} className="text-purple-600" />}
          tone="purple"
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, GSTIN…"
              className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-indigo-500"
            >
              <option value="all">All Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <div className="inline-flex rounded-lg bg-slate-100 p-1 text-xs">
              {['all', 'customer', 'supplier', 'dealer', 'lead'].map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`rounded-md px-2.5 py-1.5 capitalize transition ${
                    typeFilter === t
                      ? 'bg-white font-semibold text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : contacts.length === 0 ? (
          <EmptyState
            icon={<UserPlus size={40} className="text-slate-300" />}
            title="No contacts yet"
            description="Add your first customer or supplier."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[750px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Name</th>
                  <th className="px-5 py-3 font-semibold">Type</th>
                  <th className="px-5 py-3 font-semibold">Company</th>
                  <th className="px-5 py-3 font-semibold">Phone</th>
                  <th className="px-5 py-3 font-semibold">Email</th>
                  <th className="px-5 py-3 font-semibold">City</th>
                  <th className="px-5 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {contacts.map((c) => (
                  <tr key={c.id} className="transition hover:bg-slate-50/70">
                    <td className="px-5 py-3.5">
                      <button
                        onClick={() => void openDetail(c.id)}
                        className="text-left font-semibold text-slate-900 hover:text-indigo-600"
                      >
                        {c.name}
                        {c.designation && (
                          <span className="block text-xs font-normal text-slate-400">
                            {c.designation}
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold capitalize text-indigo-700">
                        {c.contact_type}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-600">
                      {c.company_name || '—'}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-600">
                      {c.phone || c.alt_phone || '—'}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-600">{c.email || '—'}</td>
                    <td className="px-5 py-3.5 text-xs text-slate-600">
                      {[c.city, c.state].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <ActionMenu
                        items={[
                          {
                            label: 'View Details',
                            icon: <Eye size={13} />,
                            onClick: () => void openDetail(c.id),
                          },
                          {
                            label: 'Edit',
                            icon: <Edit2 size={13} />,
                            onClick: () => {
                              setEditingContact(c);
                              setErrors({});
                              setForm({ ...emptyContactForm(), ...c });
                              setModalOpen(true);
                            },
                          },
                          {
                            label: 'Delete',
                            icon: <Trash2 size={13} />,
                            onClick: () => void deleteContact(c.id),
                            destructive: true,
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Create/Edit Modal */}
      {modalOpen && (
        <Modal onClose={() => setModalOpen(false)}>
          <ModalHeader
            icon={<UserPlus size={18} />}
            title={editingContact ? 'Edit Contact' : 'Add Contact'}
            onClose={() => setModalOpen(false)}
          />
          <form onSubmit={saveContact} className="flex min-h-0 flex-1 flex-col">
            <div className="space-y-3 overflow-y-auto p-6 text-xs">
              {duplicateWarning && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800">
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                  {duplicateWarning}
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name *" error={errors.name}>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className={inputCls}
                  />
                </Field>
                <Field label="Company">
                  <input
                    value={form.company_name}
                    onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                    className={inputCls}
                  />
                </Field>
                <Field label="Designation">
                  <input
                    value={form.designation}
                    onChange={(e) => setForm({ ...form, designation: e.target.value })}
                    placeholder="Manager, Director…"
                    className={inputCls}
                  />
                </Field>
                <Field label="Contact Type">
                  <select
                    value={form.contact_type}
                    onChange={(e) => setForm({ ...form, contact_type: e.target.value })}
                    className={inputCls}
                  >
                    <option value="customer">Customer</option>
                    <option value="supplier">Supplier</option>
                    <option value="dealer">Dealer</option>
                    <option value="lead">Lead</option>
                    <option value="partner">Partner</option>
                  </select>
                </Field>
                <Field label="Phone" error={errors.phone}>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className={inputCls}
                  />
                </Field>
                <Field label="Email" error={errors.email}>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className={inputCls}
                  />
                </Field>
                <Field label="GSTIN" error={errors.gstin}>
                  <input
                    value={form.gstin}
                    onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
                    className={inputCls}
                  />
                </Field>
                <Field label="PAN" error={errors.pan}>
                  <input
                    value={form.pan}
                    onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase() })}
                    className={inputCls}
                  />
                </Field>
                <Field label="City">
                  <input
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className={inputCls}
                  />
                </Field>
                <Field label="State">
                  <input
                    value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value })}
                    className={inputCls}
                  />
                </Field>
                <Field label="Assigned Branch" className="sm:col-span-2">
                  <select
                    value={form.branch_id}
                    onChange={(e) => setForm({ ...form, branch_id: e.target.value })}
                    className={inputCls}
                  >
                    <option value="">Default branch</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-3.5">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
              >
                {saving && <Loader2 size={13} className="animate-spin" />}
                {saving ? 'Saving…' : editingContact ? 'Update Contact' : 'Create Contact'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Detail Modal */}
      {detailContact && (
        <Modal onClose={() => setDetailContact(null)}>
          <ModalHeader
            icon={<UserCheck size={18} />}
            title={detailContact.name}
            subtitle={`${detailContact.company_name || 'Individual'} · ${detailContact.designation || detailContact.contact_type}`}
            onClose={() => setDetailContact(null)}
          />
          <div className="space-y-4 overflow-y-auto p-6 text-xs">
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <DetailRow label="Phone" value={detailContact.phone} />
              <DetailRow label="Email" value={detailContact.email} />
              <DetailRow label="GSTIN" value={detailContact.gstin} />
              <DetailRow label="City" value={detailContact.city} />
            </div>

            {detailContact.linked_invoices?.length > 0 && (
              <div>
                <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Linked Invoices
                </h3>
                <div className="space-y-1.5">
                  {detailContact.linked_invoices.map((inv: any) => (
                    <div
                      key={inv.id}
                      className="flex justify-between rounded-lg border border-slate-100 bg-slate-50 p-2"
                    >
                      <span className="font-semibold text-slate-800">{inv.invoice_no}</span>
                      <span className="text-slate-600">
                        {formatMoney(inv.total_amount)} · {inv.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ============================================================
 * OPPORTUNITIES PAGE
 * ========================================================== */
export function OpportunitiesPage() {
  const { toasts, push, dismiss } = useToasts();
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; deal_value?: string }>({});

  const [form, setForm] = useState({
    title: '',
    deal_value: '',
    stage: 'discovery',
    probability: 25,
    notes: '',
  });

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      try {
        const [res, sumRes] = await Promise.all([
          apiClient.getOpportunities({ search: debouncedSearch }),
          apiClient.getOpportunitySummary(),
        ]);
        if (controller.signal.aborted) return;
        const data: any = res;
        setOpportunities(Array.isArray(data) ? data : data?.data || []);
        setSummary(sumRes);
      } catch (e: any) {
        if (!controller.signal.aborted) push('error', e?.message || 'Could not load opportunities');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [debouncedSearch, push]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!form.title.trim()) errs.title = 'Title is required';
    if (!form.deal_value || Number(form.deal_value) <= 0) errs.deal_value = 'Enter a positive value';
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setSaving(true);
    try {
      await apiClient.createOpportunity({
        ...form,
        company_id: 1,
        deal_value: Number(form.deal_value || 0),
      });
      setOpen(false);
      setForm({ title: '', deal_value: '', stage: 'discovery', probability: 25, notes: '' });
      push('success', 'Opportunity created');
    } catch (err: any) {
      push('error', err?.message || 'Could not create opportunity');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <ToastStack toasts={toasts} onDismiss={dismiss} />

      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6 text-white shadow-sm">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-indigo-300">
              CRM · Revenue
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Deal Opportunities
            </h1>
            <p className="mt-2 text-sm text-slate-300">
              Track deal value, stages, and close rates across enterprise accounts.
            </p>
          </div>
          <button
            onClick={() => {
              setErrors({});
              setOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:bg-indigo-400"
          >
            <Plus size={15} /> New Deal
          </button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="Pipeline Value"
          value={formatMoney(summary?.pipeline_value ?? 0)}
          hint="Open deals"
          icon={<TrendingUp size={16} className="text-indigo-600" />}
          tone="blue"
        />
        <MetricCard
          label="Won Deals"
          value={formatMoney(summary?.won_value ?? 0)}
          hint="Closed revenue"
          icon={<CheckCircle size={16} className="text-emerald-600" />}
          tone="emerald"
        />
        <MetricCard
          label="Win Rate"
          value={`${summary?.win_rate ?? 0}%`}
          hint="Historical close rate"
          icon={<TrendingUp size={16} className="text-purple-600" />}
          tone="purple"
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search deals…"
              className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
        </div>
        {loading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : opportunities.length === 0 ? (
          <EmptyState
            icon={<TrendingUp size={40} className="text-slate-300" />}
            title="No opportunities yet"
            description="Track high-value deals by creating an opportunity."
            action={
              <button
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500"
              >
                <Plus size={14} /> Create Opportunity
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Opportunity</th>
                  <th className="px-5 py-3 font-semibold">Account</th>
                  <th className="px-5 py-3 font-semibold text-right">Value</th>
                  <th className="px-5 py-3 font-semibold">Stage</th>
                  <th className="px-5 py-3 font-semibold text-right">Probability</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {opportunities.map((op) => (
                  <tr key={op.id} className="transition hover:bg-slate-50/70">
                    <td className="px-5 py-3.5 font-semibold text-slate-900">{op.title}</td>
                    <td className="px-5 py-3.5 text-xs text-slate-600">
                      {op.customer?.name || '—'}
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold text-indigo-600">
                      {formatMoney(op.deal_value)}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-medium capitalize text-indigo-700">
                        {op.stage}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right text-xs text-slate-600">
                      {op.probability || 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {open && (
        <Modal onClose={() => setOpen(false)} size="sm">
          <ModalHeader
            icon={<TrendingUp size={18} />}
            title="Create Opportunity"
            onClose={() => setOpen(false)}
          />
          <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
            <div className="space-y-3 overflow-y-auto p-6 text-xs">
              <Field label="Title *" error={errors.title}>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <Field label="Deal Value (₹) *" error={errors.deal_value}>
                <input
                  type="number"
                  value={form.deal_value}
                  onChange={(e) => setForm({ ...form, deal_value: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <Field label="Stage">
                <select
                  value={form.stage}
                  onChange={(e) => setForm({ ...form, stage: e.target.value })}
                  className={inputCls}
                >
                  <option value="discovery">Discovery</option>
                  <option value="proposal">Proposal</option>
                  <option value="negotiation">Negotiation</option>
                  <option value="won">Won</option>
                  <option value="lost">Lost</option>
                </select>
              </Field>
              <Field label="Probability %">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={form.probability}
                  onChange={(e) =>
                    setForm({ ...form, probability: Number(e.target.value) })
                  }
                  className={inputCls}
                />
              </Field>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-3.5">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
              >
                {saving && <Loader2 size={13} className="animate-spin" />}
                Save Deal
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

/* ============================================================
 * CAMPAIGNS PAGE
 * ========================================================== */
export function CampaignsPage() {
  const { toasts, push, dismiss } = useToasts();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ name?: string }>({});

  const [form, setForm] = useState({
    name: '',
    channel: 'email',
    target_audience: '',
    budget: '',
  });

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      try {
        const [res, sumRes] = await Promise.all([
          apiClient.getCampaigns({ search: debouncedSearch }),
          apiClient.getCampaignSummary(),
        ]);
        if (controller.signal.aborted) return;
        const data: any = res;
        setCampaigns(Array.isArray(data) ? data : data?.data || []);
        setSummary(sumRes);
      } catch (e: any) {
        if (!controller.signal.aborted) push('error', e?.message || 'Could not load campaigns');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [debouncedSearch, push]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setErrors({ name: 'Name is required' });
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await apiClient.createCampaign({
        ...form,
        company_id: 1,
        budget: Number(form.budget || 0),
      });
      setOpen(false);
      setForm({ name: '', channel: 'email', target_audience: '', budget: '' });
      push('success', 'Campaign created');
    } catch (err: any) {
      push('error', err?.message || 'Could not create campaign');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <ToastStack toasts={toasts} onDismiss={dismiss} />

      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6 text-white shadow-sm">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-indigo-300">
              CRM · Outreach
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Marketing Campaigns
            </h1>
            <p className="mt-2 text-sm text-slate-300">
              Coordinate omnichannel outreach via WhatsApp, email, and social.
            </p>
          </div>
          <button
            onClick={() => {
              setErrors({});
              setOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:bg-indigo-400"
          >
            <Plus size={15} /> New Campaign
          </button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="Active Campaigns"
          value={summary?.active_campaigns ?? 0}
          hint="Live outreach"
          icon={<Send size={16} className="text-indigo-600" />}
          tone="blue"
        />
        <MetricCard
          label="Total Budget"
          value={formatMoney(summary?.total_budget ?? 0)}
          hint="Allocated spend"
          icon={<TrendingUp size={16} className="text-emerald-600" />}
          tone="emerald"
        />
        <MetricCard
          label="Total Cost"
          value={formatMoney(summary?.total_cost ?? 0)}
          hint="Actual spend"
          icon={<TrendingUp size={16} className="text-purple-600" />}
          tone="purple"
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search campaigns…"
              className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
        </div>
        {loading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : campaigns.length === 0 ? (
          <EmptyState
            icon={<Send size={40} className="text-slate-300" />}
            title="No campaigns yet"
            description="Launch your first outreach campaign."
            action={
              <button
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500"
              >
                <Plus size={14} /> Create Campaign
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Campaign</th>
                  <th className="px-5 py-3 font-semibold">Channel</th>
                  <th className="px-5 py-3 font-semibold">Audience</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 text-right font-semibold">Budget</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {campaigns.map((c) => (
                  <tr key={c.id} className="transition hover:bg-slate-50/70">
                    <td className="px-5 py-3.5 font-semibold text-slate-900">{c.name}</td>
                    <td className="px-5 py-3.5 text-xs uppercase text-slate-600">{c.channel}</td>
                    <td className="px-5 py-3.5 text-xs text-slate-600">
                      {c.target_audience || 'All contacts'}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold capitalize text-indigo-700">
                        {c.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold text-slate-900">
                      {formatMoney(c.budget)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {open && (
        <Modal onClose={() => setOpen(false)} size="sm">
          <ModalHeader
            icon={<Send size={18} />}
            title="Create Campaign"
            onClose={() => setOpen(false)}
          />
          <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
            <div className="space-y-3 overflow-y-auto p-6 text-xs">
              <Field label="Campaign Name *" error={errors.name}>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <Field label="Channel">
                <select
                  value={form.channel}
                  onChange={(e) => setForm({ ...form, channel: e.target.value })}
                  className={inputCls}
                >
                  <option value="email">Email</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="sms">SMS</option>
                  <option value="social">Social Media</option>
                </select>
              </Field>
              <Field label="Target Audience">
                <input
                  value={form.target_audience}
                  onChange={(e) => setForm({ ...form, target_audience: e.target.value })}
                  placeholder="Retail stores, high value leads…"
                  className={inputCls}
                />
              </Field>
              <Field label="Budget (₹)">
                <input
                  type="number"
                  value={form.budget}
                  onChange={(e) => setForm({ ...form, budget: e.target.value })}
                  className={inputCls}
                />
              </Field>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-3.5">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
              >
                {saving && <Loader2 size={13} className="animate-spin" />}
                Launch Campaign
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

/* ============================================================
 * SHARED SMALL COMPONENTS
 * ========================================================== */
function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="p-12 text-center">
      <div className="mx-auto">{icon}</div>
      <p className="mt-3 text-sm font-medium text-slate-700">{title}</p>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function DetailRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div>
      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <span
        className={`mt-0.5 block font-medium ${
          highlight ? 'font-bold text-emerald-600' : 'text-slate-800'
        }`}
      >
        {value || '—'}
      </span>
    </div>
  );
}