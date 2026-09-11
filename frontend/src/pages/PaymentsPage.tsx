import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Download,
  Eye,
  FileText,
  Filter,
  GitBranch,
  BookOpen,
  Building2,
  Landmark,
  MoreHorizontal,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Trash2,
  WalletCards,
  X,
} from 'lucide-react';

import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';
import { formatDate, formatDateTime } from '../utils/date';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type PaymentMethod = 'qr' | 'bank_transfer' | 'cash' | 'card';
type PaymentStatus = 'pending' | 'completed' | 'failed' | 'reconciled';
type PaymentDirection = 'inward' | 'outward';
type BillType = 'sales' | 'purchase' | 'other' | 'unlinked';

interface Company {
  id: number;
  name: string;
  code?: string | null;
}

interface Branch {
  id: number;
  company_id: number;
  name: string;
  code?: string | null;
}

interface Payment {
  id: number;
  company_id: number;
  branch_id?: number | null;
  reference_no?: string | null;
  amount: number | string;
  payment_method: PaymentMethod;
  status: PaymentStatus;
  payment_direction: PaymentDirection;
  bank_name?: string | null;
  account_number?: string | null;
  ledger_reference?: string | null;
  remarks?: string | null;
  payment_date?: string | null;
  created_at?: string | null;
  updated_at?: string | null;

  company_name?: string | null;
  branch_name?: string | null;

  invoice_id?: number | null;
  sales_invoice_id?: number | null;
  purchase_invoice_id?: number | null;

  invoice_no?: string | null;
  bill_no?: string | null;
  sales_invoice_no?: string | null;
  purchase_invoice_no?: string | null;
  bill_type?: string | null;

  invoice?: {
    id?: number | null;
    invoice_no?: string | null;
    bill_no?: string | null;
  } | null;

  sales_invoice?: {
    id?: number | null;
    invoice_no?: string | null;
    bill_no?: string | null;
  } | null;

  purchase_invoice?: {
    id?: number | null;
    invoice_no?: string | null;
    bill_no?: string | null;
  } | null;

  customer_name?: string | null;
  supplier_name?: string | null;

  [key: string]: unknown;
}

interface PaymentForm {
  company_id: number;
  branch_id?: number;
  reference_no: string;
  amount: number | string;
  payment_method: PaymentMethod;
  status: PaymentStatus;
  payment_direction: PaymentDirection;
  bank_name: string;
  account_number: string;
  ledger_reference: string;
  remarks: string;
}

const PER_PAGE = [15, 25, 50, 100] as const;
const HEAD =
  'text-[11px] font-semibold uppercase tracking-wide text-slate-500';

const STATUS: Record<
  PaymentStatus,
  { label: string; cls: string; dot: string }
> = {
  pending: {
    label: 'Pending',
    cls: 'border-amber-200 bg-amber-50 text-amber-700',
    dot: 'bg-amber-500',
  },
  completed: {
    label: 'Completed',
    cls: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    dot: 'bg-emerald-500',
  },
  failed: {
    label: 'Failed',
    cls: 'border-rose-200 bg-rose-50 text-rose-700',
    dot: 'bg-rose-500',
  },
  reconciled: {
    label: 'Reconciled',
    cls: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    dot: 'bg-indigo-500',
  },
};

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

const money = (v: unknown) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(n(v));

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
};

const addDays = (value: string, days: number) => {
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
};

const dateText = (v?: string | null) => {
  if (!v) return '—';
  try {
    return formatDate(v);
  } catch {
    return v.slice(0, 10);
  }
};

const dateTimeText = (v?: string | null) => {
  if (!v) return '—';
  try {
    return formatDateTime(v);
  } catch {
    return v;
  }
};

const getDate = (p: Payment) => p.payment_date || p.created_at || '';

const normalize = <T,>(response: unknown): T[] => {
  if (Array.isArray(response)) return response as T[];

  if (response && typeof response === 'object') {
    const r = response as { data?: unknown };

    if (Array.isArray(r.data)) return r.data as T[];

    if (r.data && typeof r.data === 'object') {
      const nested = r.data as { data?: unknown };
      if (Array.isArray(nested.data)) return nested.data as T[];
    }
  }

  return [];
};

const getCompany = (p: Payment, list: Company[]) =>
  p.company_name ||
  list.find((x) => x.id === p.company_id)?.name ||
  '—';

const getBranch = (p: Payment, list: Branch[]) =>
  p.branch_name ||
  list.find((x) => x.id === p.branch_id)?.name ||
  '—';

const billType = (p: Payment): BillType => {
  const type = String(p.bill_type || '').toLowerCase();

  if (type === 'sales' || type === 'purchase') return type;

  if (p.sales_invoice_id || p.sales_invoice_no || p.sales_invoice)
    return 'sales';

  if (p.purchase_invoice_id || p.purchase_invoice_no || p.purchase_invoice)
    return 'purchase';

  if (p.invoice_id || p.invoice_no || p.bill_no || p.invoice)
    return 'other';

  return 'unlinked';
};

const billNo = (p: Payment) =>
  p.sales_invoice_no ||
  p.purchase_invoice_no ||
  p.invoice_no ||
  p.bill_no ||
  p.sales_invoice?.invoice_no ||
  p.sales_invoice?.bill_no ||
  p.purchase_invoice?.invoice_no ||
  p.purchase_invoice?.bill_no ||
  p.invoice?.invoice_no ||
  p.invoice?.bill_no ||
  null;

const billId = (p: Payment) =>
  n(
    p.sales_invoice_id ||
      p.purchase_invoice_id ||
      p.invoice_id ||
      p.sales_invoice?.id ||
      p.purchase_invoice?.id ||
      p.invoice?.id,
  ) || null;

const createReference = () => {
  const date = new Date();
  const stamp =
    `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(
      date.getDate(),
    ).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}${String(
      date.getMinutes(),
    ).padStart(2, '0')}${String(date.getSeconds()).padStart(2, '0')}`;

  const random =
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()
      : Math.random().toString(36).slice(2, 10).toUpperCase();

  return `PAY-${stamp}-${random}`;
};

const escapeCsv = (value: unknown) => {
  const raw = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(raw) ? `\t${raw}` : raw;
  return /[",\n\r]/.test(safe)
    ? `"${safe.replace(/"/g, '""')}"`
    : safe;
};

function Select({
  value,
  onChange,
  options,
  disabled = false,
  label,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  label: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 disabled:bg-slate-50 disabled:text-slate-400"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

function StatusBadge({ status }: { status: PaymentStatus }) {
  const s = STATUS[status] || STATUS.pending;

  return (
    <Badge
      variant="outline"
      className={`gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${s.cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </Badge>
  );
}

function DirectionBadge({
  direction,
}: {
  direction: PaymentDirection;
}) {
  const inward = direction === 'inward';

  return (
    <Badge
      variant="outline"
      className={
        inward
          ? 'gap-1.5 rounded-full border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700'
          : 'gap-1.5 rounded-full border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700'
      }
    >
      {inward ? (
        <ArrowDown className="h-3 w-3" />
      ) : (
        <ArrowUp className="h-3 w-3" />
      )}
      {inward ? 'INWARD' : 'OUTWARD'}
    </Badge>
  );
}

function BillBadge({ payment }: { payment: Payment }) {
  const type = billType(payment);
  const value = billNo(payment);

  if (type === 'unlinked') {
    return (
      <Badge
        variant="outline"
        className="rounded-full border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] text-slate-500"
      >
        Unlinked
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
        type === 'sales'
          ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
          : type === 'purchase'
            ? 'border-violet-200 bg-violet-50 text-violet-700'
            : 'border-slate-200 bg-slate-50 text-slate-700'
      }`}
    >
      {type === 'sales'
        ? 'Sales'
        : type === 'purchase'
          ? 'Purchase'
          : 'Bill'}
      {value ? ` · ${value}` : ''}
    </Badge>
  );
}

function Kpi({
  title,
  value,
  icon: Icon,
  tone,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  tone: 'indigo' | 'emerald' | 'rose' | 'amber' | 'violet' | 'blue';
}) {
  const styles = {
    indigo: 'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    rose: 'bg-rose-50 text-rose-600',
    amber: 'bg-amber-50 text-amber-600',
    violet: 'bg-violet-50 text-violet-600',
    blue: 'bg-blue-50 text-blue-600',
  };

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            {title}
          </p>
          <p className="mt-2 truncate text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            {value}
          </p>
        </div>
        <div className={`grid h-10 w-10 place-items-center rounded-xl ${styles[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

export function PaymentsPage() {
  const { showSuccess, showError } = useNotification();

  const [payments, setPayments] = useState<Payment[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const [companyFilter, setCompanyFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [directionFilter, setDirectionFilter] = useState('all');
  const [billFilter, setBillFilter] = useState('all');

  const [dateFrom, setDateFrom] = useState(today());
  const [dateTo, setDateTo] = useState(today());

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState<number>(15);

  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [selected, setSelected] = useState<number[]>([]);
  const [menuId, setMenuId] = useState<number | null>(null);

  const [viewPayment, setViewPayment] = useState<Payment | null>(null);
  const [viewOpen, setViewOpen] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({});

  const [form, setForm] = useState<PaymentForm>({
    company_id: 0,
    branch_id: undefined,
    reference_no: '',
    amount: '',
    payment_method: 'qr',
    status: 'pending',
    payment_direction: 'inward',
    bank_name: '',
    account_number: '',
    ledger_reference: '',
    remarks: '',
  });

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sections, setSections] = useState({
    payment: true,
    bank: true,
    remarks: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [paymentRes, companyRes, branchRes] = await Promise.all([
        apiClient.getPayments(),
        apiClient.getCompanies(),
        apiClient.getBranches(),
      ]);

      setPayments(normalize<Payment>(paymentRes));
      setCompanies(normalize<Company>(companyRes));
      setBranches(normalize<Branch>(branchRes));
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Unable to load payment records.';

      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = window.setTimeout(
      () => setSearch(searchInput.trim().toLowerCase()),
      250,
    );

    return () => window.clearTimeout(t);
  }, [searchInput]);

  const companyBranches = useMemo(
    () =>
      companyFilter === 'all'
        ? branches
        : branches.filter(
            (b) => b.company_id === Number(companyFilter),
          ),
    [branches, companyFilter],
  );

  useEffect(() => {
    if (
      branchFilter !== 'all' &&
      !companyBranches.some((b) => b.id === Number(branchFilter))
    ) {
      setBranchFilter('all');
    }
  }, [branchFilter, companyBranches]);

  const filtered = useMemo(() => {
    let rows = [...payments];

    if (companyFilter !== 'all') {
      rows = rows.filter(
        (p) => p.company_id === Number(companyFilter),
      );
    }

    if (branchFilter !== 'all') {
      rows = rows.filter(
        (p) => p.branch_id === Number(branchFilter),
      );
    }

    if (statusFilter !== 'all') {
      rows = rows.filter((p) => p.status === statusFilter);
    }

    if (methodFilter !== 'all') {
      rows = rows.filter(
        (p) => p.payment_method === methodFilter,
      );
    }

    if (directionFilter !== 'all') {
      rows = rows.filter(
        (p) => p.payment_direction === directionFilter,
      );
    }

    if (billFilter !== 'all') {
      rows = rows.filter((p) => billType(p) === billFilter);
    }

    if (search) {
      rows = rows.filter((p) =>
        [
          p.reference_no,
          p.bank_name,
          p.account_number,
          p.ledger_reference,
          p.remarks,
          p.company_name,
          p.branch_name,
          p.customer_name,
          p.supplier_name,
          p.invoice_no,
          p.bill_no,
          p.sales_invoice_no,
          p.purchase_invoice_no,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(search),
      );
    }

    if (dateFrom || dateTo) {
      rows = rows.filter((p) => {
        const d = getDate(p).slice(0, 10);
        if (!d) return false;
        if (dateFrom && d < dateFrom) return false;
        if (dateTo && d > dateTo) return false;
        return true;
      });
    }

    rows.sort((a, b) => {
      let x: string | number = '';
      let y: string | number = '';

      if (sortBy === 'amount') {
        x = n(a.amount);
        y = n(b.amount);
      } else if (sortBy === 'reference_no') {
        x = a.reference_no || '';
        y = b.reference_no || '';
      } else if (sortBy === 'status') {
        x = a.status;
        y = b.status;
      } else {
        x = getDate(a);
        y = getDate(b);
      }

      if (typeof x === 'number' && typeof y === 'number') {
        return sortDir === 'asc' ? x - y : y - x;
      }

      return sortDir === 'asc'
        ? String(x).localeCompare(String(y))
        : String(y).localeCompare(String(x));
    });

    return rows;
  }, [
    payments,
    companyFilter,
    branchFilter,
    statusFilter,
    methodFilter,
    directionFilter,
    billFilter,
    search,
    dateFrom,
    dateTo,
    sortBy,
    sortDir,
  ]);

  const summary = useMemo(() => {
    const inward = filtered
      .filter((p) => p.payment_direction === 'inward')
      .reduce((s, p) => s + n(p.amount), 0);

    const outward = filtered
      .filter((p) => p.payment_direction === 'outward')
      .reduce((s, p) => s + n(p.amount), 0);

    return {
      total: filtered.length,
      totalAmount: filtered.reduce((s, p) => s + n(p.amount), 0),
      completed: filtered.filter((p) => p.status === 'completed').length,
      pending: filtered.filter((p) => p.status === 'pending').length,
      failed: filtered.filter((p) => p.status === 'failed').length,
      reconciled: filtered.filter((p) => p.status === 'reconciled').length,
      inward,
      outward,
      net: inward - outward,
      sales: filtered.filter((p) => billType(p) === 'sales').length,
      purchase: filtered.filter((p) => billType(p) === 'purchase').length,
      unlinked: filtered.filter((p) => billType(p) === 'unlinked').length,
    };
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));

  useEffect(() => {
    setPage(1);
  }, [
    search,
    companyFilter,
    branchFilter,
    statusFilter,
    methodFilter,
    directionFilter,
    billFilter,
    dateFrom,
    dateTo,
    perPage,
  ]);

  const rows = useMemo(
    () =>
      filtered.slice(
        (page - 1) * perPage,
        (page - 1) * perPage + perPage,
      ),
    [filtered, page, perPage],
  );

  const allSelected =
    rows.length > 0 && rows.every((p) => selected.includes(p.id));

  const setSort = (field: string) => {
    if (sortBy === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setCompanyFilter('all');
    setBranchFilter('all');
    setStatusFilter('all');
    setMethodFilter('all');
    setDirectionFilter('all');
    setBillFilter('all');
    setDateFrom(today());
    setDateTo(today());
    setSelected([]);
  };

  const toggleSelection = (id: number) => {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id],
    );
  };

  const toggleAll = () => {
    const ids = rows.map((p) => p.id);

    setSelected((current) =>
      allSelected
        ? current.filter((id) => !ids.includes(id))
        : Array.from(new Set([...current, ...ids])),
    );
  };

  const openCreate = () => {
    setEditingId(null);
    setFormErrors({});
    setForm({
      company_id: 0,
      branch_id: undefined,
      reference_no: '',
      amount: '',
      payment_method: 'qr',
      status: 'pending',
      payment_direction: 'inward',
      bank_name: '',
      account_number: '',
      ledger_reference: '',
      remarks: '',
    });
    setSections({ payment: true, bank: true, remarks: true });
    setEditOpen(true);
  };

  const openEdit = (p: Payment) => {
    setMenuId(null);
    setEditingId(p.id);

    setForm({
      company_id: p.company_id || 0,
      branch_id: p.branch_id || undefined,
      reference_no: p.reference_no || '',
      amount: p.amount ?? '',
      payment_method: p.payment_method || 'qr',
      status: p.status || 'pending',
      payment_direction: p.payment_direction || 'inward',
      bank_name: p.bank_name || '',
      account_number: p.account_number || '',
      ledger_reference: p.ledger_reference || '',
      remarks: p.remarks || '',
    });

    setFormErrors({});
    setEditOpen(true);
  };

  const openView = (p: Payment) => {
    setMenuId(null);
    setViewPayment(p);
    setViewOpen(true);
  };

  const deletePayment = async (p: Payment) => {
    setMenuId(null);

    if (!window.confirm(`Delete payment "${p.reference_no || p.id}"?`)) {
      return;
    }

    try {
      await apiClient.deletePayment(p.id);

      showSuccess(
        'Payment deleted',
        `${p.reference_no || `Payment #${p.id}`} was deleted.`,
      );

      addAppLog({
        module: 'Payments',
        action: 'Delete payment',
        status: 'success',
        message: p.reference_no || String(p.id),
      });

      setSelected((ids) => ids.filter((id) => id !== p.id));

      if (viewPayment?.id === p.id) {
        setViewPayment(null);
        setViewOpen(false);
      }

      await load();
    } catch (err) {
      showError(
        'Delete failed',
        err instanceof Error
          ? err.message
          : 'Unable to delete payment.',
      );
    }
  };

  const bulkStatus = async (status: PaymentStatus) => {
    if (!selected.length) return;

    if (
      !window.confirm(
        `Update ${selected.length} selected payment(s) to ${status}?`,
      )
    ) {
      return;
    }

    try {
      await Promise.all(
        selected.map((id) =>
          apiClient.updatePayment(id, { status }),
        ),
      );

      showSuccess(
        'Bulk update complete',
        `${selected.length} payment(s) updated.`,
      );

      setSelected([]);
      await load();
    } catch (err) {
      showError(
        'Bulk update failed',
        err instanceof Error
          ? err.message
          : 'Unable to update payments.',
      );
    }
  };

  const bulkDelete = async () => {
    if (!selected.length) return;

    if (
      !window.confirm(
        `Delete ${selected.length} selected payment(s)? This cannot be undone.`,
      )
    ) {
      return;
    }

    try {
      await Promise.all(
        selected.map((id) => apiClient.deletePayment(id)),
      );

      showSuccess(
        'Bulk delete complete',
        `${selected.length} payment(s) deleted.`,
      );

      setSelected([]);
      await load();
    } catch (err) {
      showError(
        'Bulk delete failed',
        err instanceof Error
          ? err.message
          : 'Unable to delete selected payments.',
      );
    }
  };

  const save = async () => {
    const errors: Record<string, boolean> = {};

    if (!form.company_id) errors.company_id = true;
    if (n(form.amount) <= 0) errors.amount = true;

    setFormErrors(errors);

    if (Object.keys(errors).length) {
      showError(
        'Validation',
        'Please select a company and enter a valid amount.',
      );
      return;
    }

    /*
     * Blank reference => secure client-generated reference.
     * Backend should ALSO have a UNIQUE constraint.
     */
    const reference =
      form.reference_no.trim() || createReference();

    const payload = {
      ...form,
      company_id: Number(form.company_id),
      branch_id: form.branch_id ? Number(form.branch_id) : null,
      amount: n(form.amount),
      reference_no: reference,
    };

    setSaving(true);

    try {
      if (editingId) {
        await apiClient.updatePayment(editingId, payload);

        showSuccess(
          'Payment updated',
          `${reference} updated successfully.`,
        );

        addAppLog({
          module: 'Payments',
          action: 'Update payment',
          status: 'success',
          message: reference,
        });
      } else {
        await apiClient.createPayment(payload);

        showSuccess(
          'Payment created',
          `${reference} created successfully.`,
        );

        addAppLog({
          module: 'Payments',
          action: 'Create payment',
          status: 'success',
          message: reference,
        });
      }

      setEditOpen(false);
      await load();
    } catch (err) {
      showError(
        'Save failed',
        err instanceof Error
          ? err.message
          : 'Unable to save payment.',
      );
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    if (!filtered.length) {
      showError(
        'Nothing to export',
        'No payments match the current filters.',
      );
      return;
    }

    const header = [
      'Reference',
      'Amount',
      'Method',
      'Status',
      'Direction',
      'Bill Type',
      'Bill No',
      'Bill ID',
      'Company',
      'Branch',
      'Customer',
      'Supplier',
      'Bank',
      'Account',
      'Ledger Reference',
      'Payment Date',
      'Remarks',
    ];

    const lines = filtered.map((p) =>
      [
        p.reference_no || '',
        n(p.amount).toFixed(2),
        p.payment_method,
        p.status,
        p.payment_direction,
        billType(p),
        billNo(p) || '',
        billId(p) || '',
        getCompany(p, companies),
        getBranch(p, branches),
        p.customer_name || '',
        p.supplier_name || '',
        p.bank_name || '',
        p.account_number || '',
        p.ledger_reference || '',
        dateText(getDate(p)),
        p.remarks || '',
      ]
        .map(escapeCsv)
        .join(','),
    );

    const blob = new Blob(
      [[header.map(escapeCsv).join(','), ...lines].join('\n')],
      { type: 'text/csv;charset=utf-8;' },
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payments-${today()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    showSuccess(
      'Export complete',
      `${filtered.length} payment(s) exported.`,
    );
  };

  const formBranches = branches.filter(
    (b) => b.company_id === Number(form.company_id),
  );

  const activeFilters = [
    search,
    companyFilter !== 'all' ? companyFilter : '',
    branchFilter !== 'all' ? branchFilter : '',
    statusFilter !== 'all' ? statusFilter : '',
    methodFilter !== 'all' ? methodFilter : '',
    directionFilter !== 'all' ? directionFilter : '',
    billFilter !== 'all' ? billFilter : '',
  ].filter(Boolean).length;

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100/60">
      <div className="mx-auto w-full max-w-[1900px] space-y-5 p-3 sm:p-4 lg:space-y-6 lg:p-6">

        {/* Header */}
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-5 py-6 shadow-[0_20px_40px_-20px_rgba(15,23,42,0.45)] sm:px-7">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />

          <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
                <WalletCards className="h-3 w-3" />
                Finance · Payments
              </div>

              <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                <CreditCard className="h-7 w-7 text-cyan-300" />
                Payment workspace
              </h1>

              <p className="mt-1.5 max-w-2xl text-sm text-slate-300">
                Track money in, money out, bill links, bank transactions and
                reconciliation across companies and branches.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={exportCsv}
                disabled={loading || !filtered.length}
                className="h-10 rounded-xl border-white/10 bg-white/5 text-white shadow-none hover:bg-white/10 hover:text-white"
              >
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>

              <Button
                onClick={openCreate}
                className="h-10 rounded-xl bg-cyan-400 font-semibold text-slate-950 hover:bg-cyan-300"
              >
                <Plus className="mr-2 h-4 w-4" />
                New payment
              </Button>
            </div>
          </div>

          <div className="relative mt-5 grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">
                Money in
              </p>
              <p className="mt-1 text-sm font-bold text-emerald-300">
                {money(summary.inward)}
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">
                Money out
              </p>
              <p className="mt-1 text-sm font-bold text-rose-300">
                {money(summary.outward)}
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">
                Net movement
              </p>
              <p
                className={`mt-1 text-sm font-bold ${
                  summary.net >= 0
                    ? 'text-cyan-300'
                    : 'text-rose-300'
                }`}
              >
                {money(summary.net)}
              </p>
            </div>
          </div>
        </section>

        {/* KPIs */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Kpi
            title="Payments"
            value={summary.total.toLocaleString('en-IN')}
            icon={ReceiptText}
            tone="indigo"
          />
          <Kpi
            title="Total value"
            value={money(summary.totalAmount)}
            icon={CircleDollarSign}
            tone="violet"
          />
          <Kpi
            title="Completed"
            value={String(summary.completed)}
            icon={CheckCircle2}
            tone="emerald"
          />
          <Kpi
            title="Pending"
            value={String(summary.pending)}
            icon={Clock3}
            tone="amber"
          />
          <Kpi
            title="Reconciled"
            value={String(summary.reconciled)}
            icon={BookOpen}
            tone="blue"
          />
          <Kpi
            title="Failed"
            value={String(summary.failed)}
            icon={AlertCircle}
            tone="rose"
          />
        </section>

        {/* Filters */}
        <Card className="overflow-hidden rounded-2xl border-slate-200/80">
          <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 px-4 py-3.5 sm:px-5">
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
                <Filter className="h-4 w-4" />
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Filters
                </p>
                <p className="text-[11px] text-slate-500">
                  {activeFilters
                    ? `${activeFilters} active filter${
                        activeFilters > 1 ? 's' : ''
                      }`
                    : 'Scope, date, payment and bill tracking'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-9 rounded-lg lg:hidden"
                onClick={() => setFiltersOpen((v) => !v)}
              >
                <Filter className="mr-2 h-3.5 w-3.5" />
                {filtersOpen ? 'Hide' : 'Show'}
              </Button>

              {/* ✅ FIX: `activeFilters` is a number and the right-hand side
                  comparisons produce booleans, so the `||` chain is
                  `number | boolean`. Comparing that with `> 0` is invalid.
                  Wrap the whole expression in `Boolean(...)` instead. */}
              {Boolean(
                activeFilters ||
                  dateFrom !== today() ||
                  dateTo !== today(),
              ) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-9 rounded-lg text-slate-500"
                >
                  <X className="mr-1.5 h-3.5 w-3.5" />
                  Reset
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent
            className={`${
              filtersOpen ? 'block' : 'hidden'
            } p-4 sm:p-5 lg:block`}
          >
            <div className="grid gap-3 lg:grid-cols-12">
              <div className="relative lg:col-span-4">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search reference, bill, bank, customer, ledger…"
                  className="h-10 rounded-xl pl-10"
                />
              </div>

              <Select
                value={companyFilter}
                onChange={(v) => {
                  setCompanyFilter(v);
                  setBranchFilter('all');
                }}
                label="Company"
                options={[
                  { value: 'all', label: 'All companies' },
                  ...companies.map((c) => ({
                    value: String(c.id),
                    label: c.name,
                  })),
                ]}
                className="lg:col-span-2"
              />

              <Select
                value={branchFilter}
                onChange={setBranchFilter}
                label="Branch"
                options={[
                  { value: 'all', label: 'All branches' },
                  ...companyBranches.map((b) => ({
                    value: String(b.id),
                    label: b.name,
                  })),
                ]}
                className="lg:col-span-2"
              />

              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                label="Status"
                options={[
                  { value: 'all', label: 'All statuses' },
                  { value: 'pending', label: 'Pending' },
                  { value: 'completed', label: 'Completed' },
                  { value: 'failed', label: 'Failed' },
                  { value: 'reconciled', label: 'Reconciled' },
                ]}
                className="lg:col-span-2"
              />

              <Select
                value={methodFilter}
                onChange={setMethodFilter}
                label="Payment method"
                options={[
                  { value: 'all', label: 'All methods' },
                  { value: 'qr', label: 'QR' },
                  { value: 'bank_transfer', label: 'Bank transfer' },
                  { value: 'cash', label: 'Cash' },
                  { value: 'card', label: 'Card' },
                ]}
                className="lg:col-span-2"
              />
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-12">
              <div className="flex gap-2 lg:col-span-5">
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  aria-label="Date from"
                  className="h-10 rounded-xl"
                />

                <Input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(e) => setDateTo(e.target.value)}
                  aria-label="Date to"
                  className="h-10 rounded-xl"
                />
              </div>

              <Select
                value={directionFilter}
                onChange={setDirectionFilter}
                label="Direction"
                options={[
                  { value: 'all', label: 'IN + OUT' },
                  { value: 'inward', label: 'INWARD · Money in' },
                  { value: 'outward', label: 'OUTWARD · Money out' },
                ]}
                className="lg:col-span-2"
              />

              <Select
                value={billFilter}
                onChange={setBillFilter}
                label="Bill type"
                options={[
                  { value: 'all', label: 'All bill links' },
                  { value: 'sales', label: 'Sales bills' },
                  { value: 'purchase', label: 'Purchase bills' },
                  { value: 'other', label: 'Other bills' },
                  { value: 'unlinked', label: 'Unlinked' },
                ]}
                className="lg:col-span-2"
              />

              <div className="flex flex-wrap items-center justify-end gap-1 rounded-xl border border-slate-200 bg-white p-1 lg:col-span-3">
                {[
                  ['Today', today(), today()],
                  ['7 days', addDays(today(), -6), today()],
                  ['30 days', addDays(today(), -29), today()],
                  ['All', '', ''],
                ].map(([label, from, to]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      setDateFrom(from);
                      setDateTo(to);
                    }}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                      dateFrom === from && dateTo === to
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {label === 'Today' && (
                      <CalendarDays className="mr-1 inline h-3.5 w-3.5" />
                    )}
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />

            <div className="min-w-0 flex-1">
              <p className="font-semibold">Unable to load payments</p>
              <p className="mt-0.5 break-words">{error}</p>
            </div>
          </div>
        )}

        {/* Tracking */}
        <Card className="rounded-2xl border-slate-200/80">
          <CardContent className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
              <p className="text-xs font-semibold text-indigo-700">
                Sales linked
              </p>
              <p className="mt-1 text-xl font-bold text-slate-900">
                {summary.sales}
              </p>
            </div>

            <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-3">
              <p className="text-xs font-semibold text-violet-700">
                Purchase linked
              </p>
              <p className="mt-1 text-xl font-bold text-slate-900">
                {summary.purchase}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <p className="text-xs font-semibold text-slate-700">
                Unlinked
              </p>
              <p className="mt-1 text-xl font-bold text-slate-900">
                {summary.unlinked}
              </p>
            </div>

            <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
              <p className="text-xs font-semibold text-emerald-700">
                Net movement
              </p>
              <p className="mt-1 text-xl font-bold text-slate-900">
                {money(summary.net)}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Bulk */}
        {selected.length > 0 && (
          <div className="sticky top-3 z-30 rounded-2xl border border-slate-200 bg-white/95 p-2.5 shadow-lg backdrop-blur">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-lg bg-indigo-50 px-2.5 py-1 text-indigo-700 hover:bg-indigo-50">
                {selected.length} selected
              </Badge>

              <Button
                size="sm"
                variant="outline"
                onClick={() => bulkStatus('completed')}
                className="h-9 rounded-lg"
              >
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
                Completed
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => bulkStatus('reconciled')}
                className="h-9 rounded-lg"
              >
                <BookOpen className="mr-1.5 h-3.5 w-3.5 text-indigo-600" />
                Reconcile
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => bulkStatus('pending')}
                className="h-9 rounded-lg"
              >
                <Clock3 className="mr-1.5 h-3.5 w-3.5 text-amber-600" />
                Pending
              </Button>

              <Button
                size="sm"
                variant="destructive"
                onClick={bulkDelete}
                className="h-9 rounded-lg !bg-rose-600 !text-white hover:!bg-rose-700"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete
              </Button>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelected([])}
                className="ml-auto h-9"
              >
                Clear
              </Button>
            </div>
          </div>
        )}

        {/* Table */}
        <Card className="overflow-hidden rounded-2xl border-slate-200/80">
          <CardHeader className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600">
                <ReceiptText className="h-4 w-4" />
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Payment records
                </p>
                <p className="text-[11px] text-slate-500">
                  {loading
                    ? 'Loading…'
                    : `${filtered.length.toLocaleString('en-IN')} matching records`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Rows
              </span>

              <Select
                value={String(perPage)}
                onChange={(v) => setPerPage(Number(v))}
                label="Rows per page"
                options={PER_PAGE.map((v) => ({
                  value: String(v),
                  label: String(v),
                }))}
                className="w-[78px]"
              />
            </div>
          </CardHeader>

          <div className="overflow-x-auto">
            <Table className="min-w-[1220px]">
              <TableHeader>
                <TableRow className="border-slate-100 bg-slate-50/70">
                  <TableHead className="w-11 px-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select all visible payments"
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                    />
                  </TableHead>

                  <TableHead>
                    <button
                      type="button"
                      onClick={() => setSort('reference_no')}
                      className={HEAD}
                    >
                      Reference
                    </button>
                  </TableHead>

                  <TableHead className="text-right">
                    <button
                      type="button"
                      onClick={() => setSort('amount')}
                      className={HEAD}
                    >
                      Amount
                    </button>
                  </TableHead>

                  <TableHead>
                    <span className={HEAD}>Method</span>
                  </TableHead>

                  <TableHead>
                    <span className={HEAD}>Status</span>
                  </TableHead>

                  <TableHead>
                    <span className={HEAD}>Direction</span>
                  </TableHead>

                  <TableHead>
                    <span className={HEAD}>Bill</span>
                  </TableHead>

                  <TableHead>
                    <span className={HEAD}>Company / Branch</span>
                  </TableHead>

                  <TableHead>
                    <button
                      type="button"
                      onClick={() => setSort('created_at')}
                      className={HEAD}
                    >
                      Date
                    </button>
                  </TableHead>

                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>

              <TableBody>
                {loading &&
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 10 }).map((__, x) => (
                        <TableCell key={x}>
                          <div className="h-4 animate-pulse rounded bg-slate-100" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}

                {!loading &&
                  rows.map((p) => {
                    const checked = selected.includes(p.id);

                    return (
                      <TableRow
                        key={p.id}
                        data-state={checked ? 'selected' : undefined}
                        onClick={() => openView(p)}
                        className={`cursor-pointer border-slate-100 hover:bg-slate-50/80 ${
                          checked ? 'bg-indigo-50/40' : ''
                        }`}
                      >
                        <TableCell
                          className="px-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSelection(p.id)}
                            aria-label={`Select ${p.reference_no || p.id}`}
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                          />
                        </TableCell>

                        <TableCell>
                          <div className="min-w-[160px]">
                            <p className="text-sm font-semibold text-slate-900">
                              {p.reference_no || `PAY-${p.id}`}
                            </p>
                            <p className="mt-0.5 text-[11px] text-slate-400">
                              #{p.id}
                            </p>
                          </div>
                        </TableCell>

                        <TableCell className="whitespace-nowrap text-right">
                          <span
                            className={`text-sm font-bold tabular-nums ${
                              p.payment_direction === 'inward'
                                ? 'text-emerald-700'
                                : 'text-rose-700'
                            }`}
                          >
                            {money(p.amount)}
                          </span>
                        </TableCell>

                        <TableCell>
                          <Badge
                            variant="outline"
                            className="rounded-full border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] capitalize"
                          >
                            {p.payment_method.replace('_', ' ')}
                          </Badge>
                        </TableCell>

                        <TableCell>
                          <StatusBadge status={p.status} />
                        </TableCell>

                        <TableCell>
                          <DirectionBadge
                            direction={p.payment_direction}
                          />
                        </TableCell>

                        <TableCell>
                          <div className="min-w-[180px]">
                            <BillBadge payment={p} />

                            {billId(p) && (
                              <p className="mt-1 text-[10px] text-slate-400">
                                Bill ID: {billId(p)}
                              </p>
                            )}

                            {(p.customer_name || p.supplier_name) && (
                              <p className="mt-1 truncate text-[11px] text-slate-500">
                                {p.customer_name || p.supplier_name}
                              </p>
                            )}
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="min-w-[210px] space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <Building2 className="h-3.5 w-3.5 text-indigo-500" />
                              <span className="text-xs font-medium text-slate-700">
                                {getCompany(p, companies)}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <GitBranch className="h-3.5 w-3.5 text-violet-500" />
                              <span className="text-[11px] text-slate-500">
                                {getBranch(p, branches)}
                              </span>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="whitespace-nowrap text-sm text-slate-600">
                          {dateText(getDate(p))}
                        </TableCell>

                        <TableCell
                          onClick={(e) => e.stopPropagation()}
                          className="text-right"
                        >
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() =>
                                setMenuId((id) =>
                                  id === p.id ? null : p.id,
                                )
                              }
                              className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>

                            {menuId === p.id && (
                              <div className="absolute right-0 top-9 z-50 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 text-left shadow-xl">
                                <button
                                  type="button"
                                  onClick={() => openView(p)}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                                >
                                  <Eye className="h-4 w-4 text-slate-400" />
                                  View details
                                </button>

                                <button
                                  type="button"
                                  onClick={() => openEdit(p)}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                                >
                                  <Pencil className="h-4 w-4 text-slate-400" />
                                  Edit payment
                                </button>

                                <Separator className="my-1" />

                                <button
                                  type="button"
                                  onClick={() => deletePayment(p)}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold !text-rose-600 hover:!bg-rose-50"
                                >
                                  <Trash2 className="h-4 w-4 !text-rose-600" />
                                  Delete payment
                                </button>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                {!loading && rows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      className="py-20 text-center"
                    >
                      <div className="mx-auto max-w-md">
                        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100">
                          <Search className="h-6 w-6 text-slate-400" />
                        </div>

                        <p className="mt-4 text-base font-semibold text-slate-800">
                          No payments found
                        </p>

                        <p className="mt-1 text-sm text-slate-500">
                          Try changing the date, company, branch, direction,
                          bill type or search.
                        </p>

                        <Button
                          variant="outline"
                          className="mt-5 rounded-lg"
                          onClick={clearFilters}
                        >
                          Reset filters
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3.5 sm:px-5 md:flex-row md:items-center md:justify-between">
            <p className="text-xs text-slate-500">
              Showing{' '}
              <span className="font-semibold text-slate-700">
                {filtered.length ? (page - 1) * perPage + 1 : 0}
              </span>{' '}
              –{' '}
              <span className="font-semibold text-slate-700">
                {Math.min(page * perPage, filtered.length)}
              </span>{' '}
              of{' '}
              <span className="font-semibold text-slate-700">
                {filtered.length.toLocaleString('en-IN')}
              </span>
            </p>

            <div className="flex items-center justify-end gap-1.5">
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-lg"
                disabled={page === 1}
                onClick={() => setPage(1)}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>

              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-lg"
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <div className="mx-1 min-w-[70px] rounded-lg bg-slate-100 px-3 py-1.5 text-center text-xs font-semibold">
                {page} / {totalPages}
              </div>

              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-lg"
                disabled={page === totalPages}
                onClick={() =>
                  setPage((p) => Math.min(totalPages, p + 1))
                }
              >
                <ChevronRight className="h-4 w-4" />
              </Button>

              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-lg"
                disabled={page === totalPages}
                onClick={() => setPage(totalPages)}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* View */}
      <Sheet
        open={viewOpen}
        onOpenChange={(open) => {
          setViewOpen(open);
          if (!open) setViewPayment(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto p-0 sm:max-w-lg"
        >
          {viewPayment && (
            <>
              <div className="sticky top-0 z-20 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur">
                <SheetHeader>
                  <SheetTitle className="pr-8">
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                        <CreditCard className="h-4 w-4" />
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-base font-bold text-slate-900">
                          {viewPayment.reference_no ||
                            `PAY-${viewPayment.id}`}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          Payment #{viewPayment.id}
                        </p>
                      </div>
                    </div>
                  </SheetTitle>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <StatusBadge status={viewPayment.status} />
                    <DirectionBadge
                      direction={viewPayment.payment_direction}
                    />
                    <BillBadge payment={viewPayment} />
                  </div>
                </SheetHeader>
              </div>

              <div className="space-y-4 px-5 py-5">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">
                    Payment amount
                  </p>

                  <p
                    className={`mt-1 text-3xl font-bold ${
                      viewPayment.payment_direction === 'inward'
                        ? 'text-emerald-700'
                        : 'text-rose-700'
                    }`}
                  >
                    {money(viewPayment.amount)}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white">
                  <div className="border-b border-slate-100 bg-slate-50/70 px-3.5 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Bill-wise tracking
                    </p>
                  </div>

                  <div className="space-y-3 p-3.5">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">
                        Bill
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">
                        {billNo(viewPayment) || 'Not linked'}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-slate-400">
                          Type
                        </p>
                        <p className="mt-1 text-xs font-semibold capitalize">
                          {billType(viewPayment)}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-slate-400">
                          Bill ID
                        </p>
                        <p className="mt-1 text-xs font-semibold">
                          {billId(viewPayment) || '—'}
                        </p>
                      </div>
                    </div>

                    {(viewPayment.customer_name ||
                      viewPayment.supplier_name) && (
                      <>
                        <Separator />

                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-slate-400">
                            Party
                          </p>
                          <p className="mt-1 text-sm font-semibold">
                            {viewPayment.customer_name ||
                              viewPayment.supplier_name}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <Building2 className="h-4 w-4 text-indigo-500" />
                    <p className="mt-2 text-[10px] uppercase tracking-wide text-slate-400">
                      Company
                    </p>
                    <p className="mt-1 text-xs font-semibold">
                      {getCompany(viewPayment, companies)}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <GitBranch className="h-4 w-4 text-violet-500" />
                    <p className="mt-2 text-[10px] uppercase tracking-wide text-slate-400">
                      Branch
                    </p>
                    <p className="mt-1 text-xs font-semibold">
                      {getBranch(viewPayment, branches)}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white">
                  <div className="border-b border-slate-100 bg-slate-50/70 px-3.5 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Payment information
                    </p>
                  </div>

                  <div className="divide-y divide-slate-100">
                    <div className="flex justify-between gap-3 px-3.5 py-3">
                      <span className="text-[11px] text-slate-400">
                        Method
                      </span>
                      <span className="text-xs font-semibold capitalize">
                        {viewPayment.payment_method.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="flex justify-between gap-3 px-3.5 py-3">
                      <span className="text-[11px] text-slate-400">
                        Payment date
                      </span>
                      <span className="text-xs font-semibold">
                        {dateText(getDate(viewPayment))}
                      </span>
                    </div>

                    <div className="flex justify-between gap-3 px-3.5 py-3">
                      <span className="text-[11px] text-slate-400">
                        Created
                      </span>
                      <span className="text-xs font-semibold">
                        {dateTimeText(viewPayment.created_at)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                  <div className="mb-3 flex items-center gap-2">
                    <Landmark className="h-4 w-4 text-indigo-500" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Bank & ledger
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">
                        Bank
                      </p>
                      <p className="mt-1 text-xs font-semibold">
                        {viewPayment.bank_name || '—'}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">
                        Account
                      </p>
                      <p className="mt-1 text-xs font-semibold">
                        {viewPayment.account_number || '—'}
                      </p>
                    </div>

                    <div className="sm:col-span-2">
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">
                        Ledger reference
                      </p>
                      <p className="mt-1 text-xs font-semibold">
                        {viewPayment.ledger_reference || '—'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">
                    Remarks
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {viewPayment.remarks || 'No remarks.'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 pb-4">
                  <Button
                    variant="outline"
                    className="h-10 rounded-xl"
                    onClick={() => {
                      setViewOpen(false);
                      openEdit(viewPayment);
                    }}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Button>

                  <Button
                    variant="destructive"
                    className="h-10 rounded-xl !bg-rose-600 !text-white hover:!bg-rose-700"
                    onClick={() => deletePayment(viewPayment)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Create/Edit */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto p-0 sm:max-w-xl"
        >
          <div className="sticky top-0 z-20 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 pr-8">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
                  {editingId ? (
                    <Pencil className="h-4 w-4" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </span>
                {editingId ? 'Edit payment' : 'Create payment'}
              </SheetTitle>
            </SheetHeader>
          </div>

          <div className="space-y-4 px-5 py-5 pb-24">
            {/* Payment */}
            <div className="rounded-2xl border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() =>
                  setSections((s) => ({
                    ...s,
                    payment: !s.payment,
                  }))
                }
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
                    <WalletCards className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">
                      Payment details
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Core transaction data
                    </p>
                  </div>
                </div>

                <ChevronDown
                  className={`h-4 w-4 transition ${
                    sections.payment ? '' : '-rotate-90'
                  }`}
                />
              </button>

              {sections.payment && (
                <div className="grid gap-4 border-t border-slate-100 p-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold">
                      Company *
                    </label>

                    <select
                      value={form.company_id}
                      onChange={(e) =>
                        setForm((x) => ({
                          ...x,
                          company_id: Number(e.target.value),
                          branch_id: undefined,
                        }))
                      }
                      className={`h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none ${
                        formErrors.company_id
                          ? 'border-rose-400 ring-4 ring-rose-100'
                          : 'border-slate-200'
                      }`}
                    >
                      <option value={0}>Select company</option>

                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold">
                      Branch
                    </label>

                    <select
                      value={form.branch_id || ''}
                      disabled={!form.company_id}
                      onChange={(e) =>
                        setForm((x) => ({
                          ...x,
                          branch_id: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        }))
                      }
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-50"
                    >
                      <option value="">
                        {form.company_id
                          ? 'Select branch'
                          : 'Select company first'}
                      </option>

                      {formBranches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold">
                      Reference number
                    </label>

                    <Input
                      value={form.reference_no}
                      onChange={(e) =>
                        setForm((x) => ({
                          ...x,
                          reference_no: e.target.value,
                        }))
                      }
                      placeholder="Leave blank for auto-generated"
                    />

                    <p className="mt-1 text-[10px] text-slate-400">
                      Blank = a unique PAY reference is generated automatically.
                    </p>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold">
                      Amount *
                    </label>

                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.amount}
                      onChange={(e) =>
                        setForm((x) => ({
                          ...x,
                          amount: e.target.value,
                        }))
                      }
                      className={
                        formErrors.amount
                          ? 'border-rose-400 ring-4 ring-rose-100'
                          : ''
                      }
                      placeholder="0.00"
                    />
                  </div>

                  <Select
                    label="Payment method"
                    value={form.payment_method}
                    onChange={(v) =>
                      setForm((x) => ({
                        ...x,
                        payment_method: v as PaymentMethod,
                      }))
                    }
                    options={[
                      { value: 'qr', label: 'QR' },
                      {
                        value: 'bank_transfer',
                        label: 'Bank transfer',
                      },
                      { value: 'cash', label: 'Cash' },
                      { value: 'card', label: 'Card' },
                    ]}
                  />

                  <Select
                    label="Status"
                    value={form.status}
                    onChange={(v) =>
                      setForm((x) => ({
                        ...x,
                        status: v as PaymentStatus,
                      }))
                    }
                    options={[
                      { value: 'pending', label: 'Pending' },
                      {
                        value: 'completed',
                        label: 'Completed',
                      },
                      { value: 'failed', label: 'Failed' },
                      {
                        value: 'reconciled',
                        label: 'Reconciled',
                      },
                    ]}
                  />

                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-xs font-semibold">
                      Direction
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setForm((x) => ({
                            ...x,
                            payment_direction: 'inward',
                          }))
                        }
                        className={`rounded-xl border p-3 text-left ${
                          form.payment_direction === 'inward'
                            ? 'border-emerald-300 bg-emerald-50 ring-4 ring-emerald-500/10'
                            : 'border-slate-200'
                        }`}
                      >
                        <span className="flex items-center gap-2 text-sm font-semibold">
                          <ArrowDown className="h-4 w-4 text-emerald-600" />
                          INWARD
                        </span>
                        <span className="mt-1 block text-[11px] text-slate-500">
                          Money received
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setForm((x) => ({
                            ...x,
                            payment_direction: 'outward',
                          }))
                        }
                        className={`rounded-xl border p-3 text-left ${
                          form.payment_direction === 'outward'
                            ? 'border-rose-300 bg-rose-50 ring-4 ring-rose-500/10'
                            : 'border-slate-200'
                        }`}
                      >
                        <span className="flex items-center gap-2 text-sm font-semibold">
                          <ArrowUp className="h-4 w-4 text-rose-600" />
                          OUTWARD
                        </span>
                        <span className="mt-1 block text-[11px] text-slate-500">
                          Money paid
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bank */}
            <div className="rounded-2xl border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() =>
                  setSections((s) => ({
                    ...s,
                    bank: !s.bank,
                  }))
                }
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-violet-50 text-violet-600">
                    <Landmark className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">
                      Bank & ledger
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Reconciliation details
                    </p>
                  </div>
                </div>

                <ChevronDown
                  className={`h-4 w-4 transition ${
                    sections.bank ? '' : '-rotate-90'
                  }`}
                />
              </button>

              {sections.bank && (
                <div className="grid gap-4 border-t border-slate-100 p-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold">
                      Bank name
                    </label>
                    <Input
                      value={form.bank_name}
                      onChange={(e) =>
                        setForm((x) => ({
                          ...x,
                          bank_name: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold">
                      Account number
                    </label>
                    <Input
                      value={form.account_number}
                      onChange={(e) =>
                        setForm((x) => ({
                          ...x,
                          account_number: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-xs font-semibold">
                      Ledger reference
                    </label>
                    <Input
                      value={form.ledger_reference}
                      onChange={(e) =>
                        setForm((x) => ({
                          ...x,
                          ledger_reference: e.target.value,
                        }))
                      }
                      placeholder="UTR / transaction / ledger reference"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Remarks */}
            <div className="rounded-2xl border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() =>
                  setSections((s) => ({
                    ...s,
                    remarks: !s.remarks,
                  }))
                }
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
                    <BookOpen className="h-4 w-4" />
                  </span>
                  <p className="text-sm font-semibold">Remarks</p>
                </div>

                <ChevronDown
                  className={`h-4 w-4 transition ${
                    sections.remarks ? '' : '-rotate-90'
                  }`}
                />
              </button>

              {sections.remarks && (
                <div className="border-t border-slate-100 p-4">
                  <textarea
                    rows={4}
                    value={form.remarks}
                    onChange={(e) =>
                      setForm((x) => ({
                        ...x,
                        remarks: e.target.value,
                      }))
                    }
                    placeholder="Payment notes..."
                    className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="fixed bottom-0 right-0 z-30 w-full border-t border-slate-200 bg-white/95 px-5 py-3 backdrop-blur sm:max-w-xl">
            <div className="flex justify-between gap-2">
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => setEditOpen(false)}
                className="h-10 rounded-xl"
              >
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>

              <Button
                disabled={saving}
                onClick={save}
                className="h-10 rounded-xl bg-slate-900 px-5 hover:bg-slate-800"
              >
                {saving ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {editingId ? 'Update payment' : 'Save payment'}
                  </>
                )}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default PaymentsPage;