// src/pages/Delivery/DeliveryOrdersPage.tsx
import React, {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  FiPackage,
  FiSearch,
  FiCalendar,
  FiCheckCircle,
  FiTruck,
  FiMapPin,
  FiCheck,
  FiAlertCircle,
  FiPlus,
  FiRefreshCw,
  FiLoader,
  FiX,
  FiUser,
  FiChevronLeft,
  FiChevronRight,
  FiPhone,
} from 'react-icons/fi';
import deliveryService, { DeliveryOrder } from '../../services/deliveryService';
import api from '../../api';
import { useNotification } from '../../components/NotificationContext';
import { usePermission } from '../../hooks/usePermission';
import { useAuthStore } from '../../store/auth';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/* ══════════════════════════════════════════════════════════
 * Types
 * ════════════════════════════════════════════════════════ */

interface InvoiceOption {
  id: number;
  invoice_no: string;
  customer_name?: string;
  customer_phone?: string;
  customer?: { name?: string; phone?: string; city?: string; state?: string; address?: string };
  total_amount: number | string;
  status?: string;
  shipping_city?: string;
  shipping_state?: string;
  shipping_street?: string;
  billing_city?: string;
  customer_address?: string;
}

type OrderStatus =
  | 'delivery_pending'
  | 'scheduled'
  | 'vehicle_assigned'
  | 'ready_for_dispatch'
  | 'dispatched'
  | 'partially_delivered'
  | 'delivered'
  | 'delivery_failed'
  | 'cancelled';

type ConfirmStatus = 'delivered' | 'partially_delivered' | 'failed';

type FailureReason =
  | 'customer_unavailable'
  | 'address_not_found'
  | 'customer_refused'
  | 'vehicle_breakdown'
  | 'damaged_goods'
  | 'rescheduled_by_customer'
  | 'other';

type Priority = 'normal' | 'high' | 'urgent';

interface ItemQtyMap {
  [itemId: number]: { delivered: number; returned: number };
}

interface ApiErrorLike {
  message?: unknown;
  response?: { status?: number; data?: { message?: unknown; errors?: Record<string, unknown> } };
}

/* ══════════════════════════════════════════════════════════
 * Constants
 * ════════════════════════════════════════════════════════ */

const PAGE_SIZE = 15;
const SEARCH_DEBOUNCE_MS = 350;
const INVOICE_SEARCH_DEBOUNCE_MS = 300;

const LIMITS = {
  nameMax: 200,
  phoneMax: 20,
  addressMax: 500,
  townMax: 100,
  districtMax: 100,
  remarksMax: 1000,
  timeSlotMax: 60,
} as const;

const PRESET_TOWNS = [
  'Kashichak', 'Warisaliganj', 'Pawapuri', 'Nalanda', 'Nawada',
  'Pakribarawan', 'Rajauli', 'Hisua', 'Bihar Sharif', 'Rajgir',
  'Silao', 'Roh', 'Govindpur', 'Gaya',
] as const;

const NALANDA_TOWNS = new Set(['Nalanda', 'Bihar Sharif', 'Pawapuri', 'Rajgir', 'Silao']);
const GAYA_TOWNS = new Set(['Gaya']);

const STATUS_OPTIONS: Array<{ value: '' | OrderStatus; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'delivery_pending', label: 'Pending' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'vehicle_assigned', label: 'Carrier assigned' },
  { value: 'ready_for_dispatch', label: 'Ready for dispatch' },
  { value: 'dispatched', label: 'On road / dispatched' },
  { value: 'partially_delivered', label: 'Partially delivered' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'delivery_failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const PRIORITY_FILTER_OPTIONS: Array<{ value: '' | Priority; label: string }> = [
  { value: '', label: 'All priorities' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const DELIVERY_TYPE_OPTIONS = [
  { value: '', label: 'All delivery types' },
  { value: 'local', label: 'Local delivery' },
  { value: 'nearby_town', label: 'Nearby town' },
  { value: 'district', label: 'District / Regional' },
  { value: 'special', label: 'Special logistics' },
  { value: 'customer_pickup', label: 'Customer pickup' },
  { value: 'other', label: 'Other' },
];

const QUICK_DATE_OPTIONS = [
  { value: '', label: 'All dates' },
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'this_week', label: 'This week' },
  { value: 'custom', label: 'Custom range…' },
];

const STATUS_BADGE_CLASSES: Record<string, string> = {
  delivered: 'border-emerald-200/70 bg-emerald-50 text-emerald-700',
  partially_delivered: 'border-blue-200/70 bg-blue-50 text-blue-700',
  dispatched: 'border-purple-200/70 bg-purple-50 text-purple-700',
  delivery_failed: 'border-rose-200/70 bg-rose-50 text-rose-700',
  cancelled: 'border-slate-200 bg-slate-50 text-slate-600',
  scheduled: 'border-amber-200/70 bg-amber-50 text-amber-700',
  delivery_pending: 'border-amber-200/70 bg-amber-50 text-amber-700',
};

const PRIORITY_OPTIONS: Array<{ value: Priority; label: string }> = [
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const FAILURE_REASON_OPTIONS: Array<{ value: FailureReason; label: string }> = [
  { value: 'customer_unavailable', label: 'Customer unavailable' },
  { value: 'address_not_found', label: 'Address / road not found' },
  { value: 'customer_refused', label: 'Customer refused delivery' },
  { value: 'vehicle_breakdown', label: 'Carrier vehicle breakdown' },
  { value: 'damaged_goods', label: 'Damaged / defective goods' },
  { value: 'rescheduled_by_customer', label: 'Rescheduled by customer' },
  { value: 'other', label: 'Other reason' },
];

/* ══════════════════════════════════════════════════════════
 * Helpers
 * ════════════════════════════════════════════════════════ */

const clampStr = (v: unknown, max: number): string => String(v ?? '').slice(0, max);
const digitsOnly = (s: string): string => s.replace(/\D/g, '');
const phoneSafe = (s: string): string => s.replace(/[^\d+\s\-()]/g, '');

const EMAIL_LIKE_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[+]?[\d\s\-()]{7,20}$/;

const safeNum = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const formatINR = (v: unknown): string =>
  safeNum(v).toLocaleString('en-IN', { maximumFractionDigits: 2 });

/** Tomorrow, in the user's local timezone (not UTC). */
function tomorrowLocalISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Today, in the user's local timezone. */
function todayLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function isValidISODate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(v).getTime());
}

function getApiErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (error && typeof error === 'object') {
    const e = error as ApiErrorLike;
    const status = e.response?.status;
    const validation = e.response?.data?.errors;

    if (validation && typeof validation === 'object') {
      const messages = Object.values(validation).flatMap((v) =>
        Array.isArray(v) ? v : [v],
      );
      if (messages.length) return messages.map(String).join(', ');
    }

    const msg =
      (typeof e.response?.data?.message === 'string' && e.response.data.message) ||
      (typeof e.message === 'string' && e.message) ||
      '';
    if (status === 401) return 'Session expired. Please sign in again.';
    if (status === 403) return 'You do not have permission to perform this action.';
    if (status === 404) return 'The record was not found.';
    if (status && status >= 500) return 'Server error. Please try again.';
    if (msg) return msg;
  }
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}

/** Simple debounce hook. */
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/* ══════════════════════════════════════════════════════════
 * Error Boundary
 * ════════════════════════════════════════════════════════ */

interface BoundaryState { hasError: boolean; message?: string }
class DeliveryOrdersBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { hasError: false };
  static getDerivedStateFromError(err: unknown): BoundaryState {
    return {
      hasError: true,
      message: err instanceof Error ? err.message : 'Unexpected error.',
    };
  }
  componentDidCatch(err: unknown) {
    // eslint-disable-next-line no-console
    console.error('[DeliveryOrdersPage]', err);
  }
  reset = () => this.setState({ hasError: false, message: undefined });
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[400px] items-center justify-center p-6">
          <div className="max-w-md rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
            <FiAlertCircle className="mx-auto mb-3 text-rose-600" size={32} />
            <h2 className="text-base font-bold text-slate-900">Something went wrong</h2>
            <p className="mt-1 text-sm text-slate-600">
              {this.state.message || 'Unable to render delivery orders.'}
            </p>
            <button
              onClick={this.reset}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <FiRefreshCw size={14} /> Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ══════════════════════════════════════════════════════════
 * Reusable bits
 * ════════════════════════════════════════════════════════ */

const StatusBadge = React.memo(({ status }: { status: string }) => {
  const cls = STATUS_BADGE_CLASSES[status] ?? 'border-slate-200 bg-slate-50 text-slate-600';
  return (
    <Badge variant="outline" className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize ${cls}`}>
      {status.replace(/_/g, ' ')}
    </Badge>
  );
});
StatusBadge.displayName = 'StatusBadge';

const ModalShell: React.FC<{
  title: string;
  subtitle?: string;
  icon: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  maxWidth?: string;
  closeDisabled?: boolean;
}> = ({ title, subtitle, icon, onClose, children, footer, maxWidth = 'max-w-md', closeDisabled = false }) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !closeDisabled) onClose();
    };
    document.addEventListener('keydown', handler);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = prev;
    };
  }, [onClose, closeDisabled]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !closeDisabled) onClose(); }}
    >
      <div
        className={`relative flex max-h-[92vh] w-full ${maxWidth} flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              {icon}
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-bold text-slate-900 sm:text-base">{title}</h3>
              {subtitle && <p className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={closeDisabled}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
            aria-label="Close modal"
          >
            <FiX size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">{children}</div>
        <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-3 sm:px-6">{footer}</div>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════
 * Main component
 * ════════════════════════════════════════════════════════ */

export const DeliveryOrdersPage: React.FC = () => {
  const { showError, showSuccess } = useNotification();
  const { can, isSuperAdmin } = usePermission();
  const loadingUser = useAuthStore((s) => s.loadingUser);
  const hasUser = useAuthStore((s) => Boolean(s.user));

  /* ── Permissions ── */
  const canViewOrders = isSuperAdmin || can('view deliveries') || can('view delivery orders');
  const canCreateOrder = isSuperAdmin || can('create deliveries') || can('create delivery orders');
  const canScheduleOrder = isSuperAdmin || can('edit deliveries') || can('schedule deliveries');
  const canConfirmDelivery = isSuperAdmin || can('edit deliveries') || can('confirm deliveries');

  /* ── Orders ── */
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  /* ── Filters ── */
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const [statusFilter, setStatusFilter] = useState<'' | OrderStatus>('');
  const [townFilter, setTownFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'' | Priority>('');
  const [deliveryTypeFilter, setDeliveryTypeFilter] = useState('');
  const [quickDateFilter, setQuickDateFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const hasActiveFilters = Boolean(
    search.trim() ||
    statusFilter ||
    townFilter ||
    priorityFilter ||
    deliveryTypeFilter ||
    quickDateFilter ||
    dateFrom ||
    dateTo
  );

  const resetAllFilters = () => {
    setSearch('');
    setStatusFilter('');
    setTownFilter('');
    setPriorityFilter('');
    setDeliveryTypeFilter('');
    setQuickDateFilter('');
    setDateFrom('');
    setDateTo('');
  };

  /* ── Schedule modal ── */
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleOrder, setScheduleOrder] = useState<DeliveryOrder | null>(null);
  const [scheduleDate, setScheduleDate] = useState(tomorrowLocalISO());
  const [scheduleTime, setScheduleTime] = useState('10:00 AM - 01:00 PM');
  const [schedulePriority, setSchedulePriority] = useState<Priority>('normal');
  const [scheduleRemarks, setScheduleRemarks] = useState('');
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false);

  /* ── Confirm modal ── */
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmOrder, setConfirmOrder] = useState<DeliveryOrder | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState<ConfirmStatus>('delivered');
  const [failureReason, setFailureReason] = useState<FailureReason>('customer_unavailable');
  const [receiverName, setReceiverName] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [confirmRemarks, setConfirmRemarks] = useState('');
  const [itemQuantities, setItemQuantities] = useState<ItemQtyMap>({});
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);

  /* ── Create modal ── */
  const [createOpen, setCreateOpen] = useState(false);
  const [invoices, setInvoices] = useState<InvoiceOption[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const debouncedInvoiceSearch = useDebouncedValue(invoiceSearch, INVOICE_SEARCH_DEBOUNCE_MS);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceOption | null>(null);
  const [form, setForm] = useState({
    recipientName: '',
    recipientPhone: '',
    town: 'Kashichak',
    district: 'Nawada',
    address: '',
    date: tomorrowLocalISO(),
    priority: 'normal' as Priority,
    manualTown: false,
  });
  const [createSubmitting, setCreateSubmitting] = useState(false);

  /* ── Abort controllers ── */
  const ordersAbortRef = useRef<AbortController | null>(null);
  const confirmAbortRef = useRef<AbortController | null>(null);
  const invoicesAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  /* ── Lifecycle ── */
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      ordersAbortRef.current?.abort();
      confirmAbortRef.current?.abort();
      invoicesAbortRef.current?.abort();
    };
  }, []);

  /* ── Fetch orders ── */
  const fetchOrders = useCallback(async () => {
    if (!canViewOrders) return;
    ordersAbortRef.current?.abort();
    const ctrl = new AbortController();
    ordersAbortRef.current = ctrl;
    setLoading(true);
    setError(null);
    try {
      let resolvedDateFrom = dateFrom;
      let resolvedDateTo = dateTo;
      if (quickDateFilter === 'today') {
        const today = new Date().toISOString().slice(0, 10);
        resolvedDateFrom = today;
        resolvedDateTo = today;
      } else if (quickDateFilter === 'tomorrow') {
        const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
        resolvedDateFrom = tomorrow;
        resolvedDateTo = tomorrow;
      } else if (quickDateFilter === 'this_week') {
        const d = new Date();
        const first = new Date(d.setDate(d.getDate() - d.getDay())).toISOString().slice(0, 10);
        const last = new Date(d.setDate(d.getDate() - d.getDay() + 6)).toISOString().slice(0, 10);
        resolvedDateFrom = first;
        resolvedDateTo = last;
      }

      const res = await deliveryService.getOrders({
        page,
        per_page: PAGE_SIZE,
        search: debouncedSearch.trim() || undefined,
        status: statusFilter || undefined,
        town: townFilter || undefined,
        priority: priorityFilter || undefined,
        delivery_type: deliveryTypeFilter || undefined,
        date_from: resolvedDateFrom || undefined,
        date_to: resolvedDateTo || undefined,
      });
      if (ctrl.signal.aborted || !mountedRef.current) return;
      setOrders(res.data.data ?? []);
      setTotal(safeNum(res.data.total));
    } catch (err) {
      if (ctrl.signal.aborted) return;
      const msg = getApiErrorMessage(err, 'Could not load delivery orders.');
      setError(msg);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [canViewOrders, page, debouncedSearch, statusFilter, townFilter, priorityFilter, deliveryTypeFilter, quickDateFilter, dateFrom, dateTo]);

  /* Reset page when filters change */
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, townFilter, priorityFilter, deliveryTypeFilter, quickDateFilter, dateFrom, dateTo]);

  /* Fetch on any filter change */
  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  /* ── Fetch invoices for create modal ── */
  useEffect(() => {
    if (!createOpen) return;
    invoicesAbortRef.current?.abort();
    const ctrl = new AbortController();
    invoicesAbortRef.current = ctrl;
    setInvoicesLoading(true);

    (async () => {
      try {
        const res = await api.get('/invoices', {
          signal: ctrl.signal,
          params: {
            search: debouncedInvoiceSearch.trim() || undefined,
            per_page: 50,
            sort_by: 'created_at',
            sort_dir: 'desc',
          },
        });
        if (ctrl.signal.aborted || !mountedRef.current) return;
        const raw = res.data?.data ?? res.data ?? [];
        const list = Array.isArray(raw) ? raw : raw?.data ?? [];
        setInvoices(Array.isArray(list) ? list : []);
      } catch (err) {
        if (ctrl.signal.aborted) return;
        const msg = getApiErrorMessage(err, 'Could not search invoices.');
        showError('Invoice search failed', msg);
        setInvoices([]);
      } finally {
        if (mountedRef.current) setInvoicesLoading(false);
      }
    })();

    return () => ctrl.abort();
  }, [createOpen, debouncedInvoiceSearch, showError]);

  /* ── Pagination ── */
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canGoPrev = page > 1;
  const canGoNext = page < totalPages;

  /* ── Handlers ── */
  const openScheduleModal = useCallback((order: DeliveryOrder) => {
    if (!canScheduleOrder) {
      showError('Permission denied', 'You do not have permission to schedule deliveries.');
      return;
    }
    setScheduleOrder(order);
    setScheduleDate(order.expected_delivery_date || tomorrowLocalISO());
    setScheduleTime(order.expected_delivery_time || '10:00 AM - 01:00 PM');
    setSchedulePriority((order.priority as Priority) || 'normal');
    setScheduleRemarks('');
    setScheduleOpen(true);
  }, [canScheduleOrder, showError]);

  const submitSchedule = useCallback(async () => {
    if (!scheduleOrder) return;
    if (!isValidISODate(scheduleDate)) {
      showError('Invalid date', 'Please select a valid delivery date.');
      return;
    }
    setScheduleSubmitting(true);
    try {
      await deliveryService.scheduleOrder(scheduleOrder.id, {
        expected_delivery_date: scheduleDate,
        expected_delivery_time: clampStr(scheduleTime, LIMITS.timeSlotMax),
        priority: schedulePriority,
        remarks: clampStr(scheduleRemarks, LIMITS.remarksMax),
      });
      showSuccess('Scheduled', `Delivery ${scheduleOrder.delivery_order_no} scheduled.`);
      setScheduleOpen(false);
      void fetchOrders();
    } catch (err) {
      showError('Schedule failed', getApiErrorMessage(err, 'Could not update schedule.'));
    } finally {
      setScheduleSubmitting(false);
    }
  }, [scheduleOrder, scheduleDate, scheduleTime, schedulePriority, scheduleRemarks, showSuccess, showError, fetchOrders]);

  const openConfirmModal = useCallback(async (order: DeliveryOrder) => {
    if (!canConfirmDelivery) {
      showError('Permission denied', 'You do not have permission to confirm deliveries.');
      return;
    }
    confirmAbortRef.current?.abort();
    const ctrl = new AbortController();
    confirmAbortRef.current = ctrl;

    setConfirmOrder(order);
    setConfirmStatus('delivered');
    setFailureReason('customer_unavailable');
    setReceiverName(order.recipient_name || '');
    setReceiverPhone(order.recipient_phone || '');
    setConfirmRemarks('');
    setItemQuantities({});
    setConfirmLoading(true);
    setConfirmOpen(true);

    try {
      const res = await deliveryService.getOrder(order.id);
      if (ctrl.signal.aborted || !mountedRef.current) return;
      const full = res.data;
      setConfirmOrder(full);
      const init: ItemQtyMap = {};
      if (Array.isArray(full.items)) {
        full.items.forEach((item) => {
          init[item.id] = {
            delivered: safeNum(item.requested_quantity),
            returned: 0,
          };
        });
      }
      setItemQuantities(init);
    } catch (err) {
      if (ctrl.signal.aborted) return;
      showError('Could not load order', getApiErrorMessage(err, 'Please try again.'));
    } finally {
      if (mountedRef.current) setConfirmLoading(false);
    }
  }, [canConfirmDelivery, showError]);

  const submitConfirm = useCallback(async () => {
    if (!confirmOrder) return;

    /* Phone validation */
    if (receiverPhone && !PHONE_REGEX.test(receiverPhone)) {
      showError('Invalid phone', 'Please enter a valid receiver phone number.');
      return;
    }

    /* Partial delivery validation */
    if (confirmStatus === 'partially_delivered' && confirmOrder.items) {
      for (const item of confirmOrder.items) {
        const qty = itemQuantities[item.id];
        const requested = safeNum(item.requested_quantity);
        if (!qty || qty.delivered < 0 || qty.delivered > requested) {
          showError('Invalid quantities', `Delivered quantity for "${item.product_name}" must be between 0 and ${requested}.`);
          return;
        }
      }
    }

    setConfirmSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        status: confirmStatus,
        receiver_name: clampStr(receiverName, LIMITS.nameMax),
        receiver_phone: clampStr(receiverPhone, LIMITS.phoneMax),
        remarks: clampStr(confirmRemarks, LIMITS.remarksMax),
      };

      if (confirmStatus === 'failed') {
        payload.failure_reason = failureReason;
        payload.failure_remarks = clampStr(confirmRemarks, LIMITS.remarksMax);
      } else if (confirmStatus === 'partially_delivered' && confirmOrder.items) {
        const items: Record<number, { delivered_quantity: number; returned_quantity: number }> = {};
        for (const item of confirmOrder.items) {
          const qty = itemQuantities[item.id];
          items[item.id] = {
            delivered_quantity: safeNum(qty?.delivered),
            returned_quantity: Math.max(0, safeNum(item.requested_quantity) - safeNum(qty?.delivered)),
          };
        }
        payload.items = items;
      }

      await deliveryService.confirmOrder(confirmOrder.id, payload);
      showSuccess('Delivery confirmed', `Order ${confirmOrder.delivery_order_no} updated.`);
      setConfirmOpen(false);
      void fetchOrders();
    } catch (err) {
      showError('Confirmation failed', getApiErrorMessage(err, 'Could not submit delivery confirmation.'));
    } finally {
      setConfirmSubmitting(false);
    }
  }, [confirmOrder, confirmStatus, failureReason, receiverName, receiverPhone, confirmRemarks, itemQuantities, showSuccess, showError, fetchOrders]);

  const openCreateModal = useCallback(() => {
    if (!canCreateOrder) {
      showError('Permission denied', 'You do not have permission to create delivery orders.');
      return;
    }
    setSelectedInvoice(null);
    setInvoiceSearch('');
    setInvoices([]);
    setForm({
      recipientName: '',
      recipientPhone: '',
      town: 'Kashichak',
      district: 'Nawada',
      address: '',
      date: tomorrowLocalISO(),
      priority: 'normal',
      manualTown: false,
    });
    setCreateOpen(true);
  }, [canCreateOrder, showError]);

  const handleSelectInvoice = useCallback((inv: InvoiceOption) => {
    setSelectedInvoice(inv);

    const name = inv.customer_name || inv.customer?.name || '';
    const phone = inv.customer_phone || inv.customer?.phone || '';
    const address = inv.shipping_street || inv.customer_address || inv.customer?.address || '';
    const detectedTown = (inv.shipping_city || inv.billing_city || inv.customer?.city || '').trim();
    const detectedDistrict = (inv.shipping_state || inv.customer?.state || '').trim();

    let town = 'Kashichak';
    let manual = false;
    if (detectedTown) {
      town = detectedTown;
      manual = !(PRESET_TOWNS as readonly string[]).includes(detectedTown);
    }

    let district = 'Nawada';
    if (detectedDistrict && detectedDistrict.toLowerCase() !== 'bihar') {
      district = detectedDistrict;
    } else if (NALANDA_TOWNS.has(town)) {
      district = 'Nalanda';
    } else if (GAYA_TOWNS.has(town)) {
      district = 'Gaya';
    }

    setForm({
      recipientName: name,
      recipientPhone: phone,
      town,
      district,
      address,
      date: tomorrowLocalISO(),
      priority: 'normal',
      manualTown: manual,
    });
  }, []);

  const submitCreate = useCallback(async () => {
    if (!selectedInvoice) {
      showError('Invoice required', 'Please search and select a sales invoice.');
      return;
    }
    if (!form.recipientName.trim()) {
      showError('Recipient name required', 'Please enter the recipient name.');
      return;
    }
    if (!PHONE_REGEX.test(form.recipientPhone)) {
      showError('Invalid phone', 'Please enter a valid recipient phone number.');
      return;
    }
    if (!form.town.trim()) {
      showError('Town required', 'Please select or enter a town / delivery area.');
      return;
    }
    if (!form.district.trim()) {
      showError('District required', 'Please enter the district.');
      return;
    }
    if (!isValidISODate(form.date)) {
      showError('Invalid date', 'Please enter a valid expected delivery date.');
      return;
    }

    setCreateSubmitting(true);
    try {
      await deliveryService.createOrder({
        invoice_id: selectedInvoice.id,
        recipient_name: form.recipientName.trim(),
        recipient_phone: form.recipientPhone.trim(),
        delivery_type: 'nearby_town',
        priority: form.priority,
        town: form.town.trim(),
        district: form.district.trim(),
        delivery_address: clampStr(form.address, LIMITS.addressMax),
        expected_delivery_date: form.date,
      });
      showSuccess('Delivery order created', `Invoice ${selectedInvoice.invoice_no} registered.`);
      setCreateOpen(false);
      void fetchOrders();
    } catch (err) {
      showError('Create failed', getApiErrorMessage(err, 'Could not create delivery order.'));
    } finally {
      setCreateSubmitting(false);
    }
  }, [selectedInvoice, form, showSuccess, showError, fetchOrders]);

  /* ── Access guards ── */
  if (loadingUser && !hasUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="rounded-2xl bg-white px-6 py-5 text-sm text-slate-600 shadow-sm">
          Loading permissions…
        </div>
      </div>
    );
  }
  if (!canViewOrders) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <FiAlertCircle className="mx-auto mb-3 text-rose-600" size={32} />
          <h2 className="text-lg font-bold text-slate-900">Access denied</h2>
          <p className="mt-1.5 text-sm text-slate-500">
            You don't have permission to view delivery orders.
          </p>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════
   * Render
   * ════════════════════════════════════════════════════ */
  return (
    <DeliveryOrdersBoundary>
      <div className="min-h-full bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100/60">
        <div className="mx-auto w-full max-w-[1500px] space-y-4 p-3 sm:space-y-5 sm:p-4 lg:p-5 xl:p-6">

          {/* ── Hero ── */}
          <section className="relative overflow-hidden rounded-2xl border border-slate-800/10 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-4 py-5 shadow-[0_20px_40px_-20px_rgba(15,23,42,0.45)] sm:px-6 sm:py-6 lg:px-7">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />
            <div className="relative flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200 backdrop-blur">
                  <FiPackage size={12} /> Logistics · Delivery Orders
                </div>
                <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl xl:text-[30px]">
                  Invoice Delivery Orders
                </h1>
                <p className="mt-1.5 max-w-2xl text-xs text-slate-300 sm:text-sm">
                  Track shipments, delivery addresses, dispatch scheduling, and partial / full confirmations.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void fetchOrders()}
                  disabled={loading}
                  className="h-10 rounded-xl border-white/10 bg-white/5 text-white shadow-none backdrop-blur transition hover:border-white/20 hover:bg-white/10 hover:text-white disabled:opacity-50"
                >
                  {loading ? (
                    <FiLoader className="mr-2 animate-spin" size={14} />
                  ) : (
                    <FiRefreshCw className="mr-2" size={14} />
                  )}
                  Refresh
                </Button>
                {canCreateOrder && (
                  <button
                    type="button"
                    onClick={openCreateModal}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-b from-cyan-300 to-cyan-400 px-4 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:from-cyan-200 hover:to-cyan-300"
                  >
                    <FiPlus size={14} />
                    Register Delivery
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* ── Filters ── */}
          <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <CardContent className="space-y-3 p-3 sm:p-4">
              {/* Row 1: Search + Quick Reset */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <FiSearch className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(clampStr(e.target.value, LIMITS.nameMax))}
                    placeholder="Search order #, invoice #, customer name, phone, address…"
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-10 text-sm text-slate-800 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                    maxLength={LIMITS.nameMax}
                    autoComplete="off"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      aria-label="Clear search"
                      className="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    >
                      <FiX size={14} />
                    </button>
                  )}
                </div>

                {hasActiveFilters && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={resetAllFilters}
                    className="h-10 shrink-0 gap-1 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                  >
                    <FiX size={13} /> Reset filters
                  </Button>
                )}
              </div>

              {/* Row 2: Select Filters */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {/* Status */}
                <select
                  aria-label="Filter by status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as '' | OrderStatus)}
                  className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 sm:text-xs"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>

                {/* Town */}
                <select
                  aria-label="Filter by town"
                  value={townFilter}
                  onChange={(e) => setTownFilter(e.target.value)}
                  className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 sm:text-xs"
                >
                  <option value="">All towns / areas</option>
                  {PRESET_TOWNS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>

                {/* Priority */}
                <select
                  aria-label="Filter by priority"
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value as '' | Priority)}
                  className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 sm:text-xs"
                >
                  {PRIORITY_FILTER_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>

                {/* Delivery Type */}
                <select
                  aria-label="Filter by delivery type"
                  value={deliveryTypeFilter}
                  onChange={(e) => setDeliveryTypeFilter(e.target.value)}
                  className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 sm:text-xs"
                >
                  {DELIVERY_TYPE_OPTIONS.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>

                {/* Date range filter */}
                <select
                  aria-label="Filter by date"
                  value={quickDateFilter}
                  onChange={(e) => setQuickDateFilter(e.target.value)}
                  className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 sm:text-xs"
                >
                  {QUICK_DATE_OPTIONS.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>

              {/* Row 3: Custom Date Range (if selected) */}
              {quickDateFilter === 'custom' && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50/80 p-2.5 text-xs text-slate-600">
                  <span className="font-semibold text-slate-700">Date Range:</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs shadow-sm outline-none focus:border-indigo-400"
                  />
                  <span>to</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs shadow-sm outline-none focus:border-indigo-400"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Error ── */}
          {error && (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-rose-700 sm:flex-row sm:items-start sm:gap-3 sm:p-4"
            >
              <div className="flex items-start gap-2 sm:flex-1">
                <FiAlertCircle className="mt-0.5 shrink-0" size={18} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Could not load orders</p>
                  <p className="text-xs sm:text-sm">{error}</p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => void fetchOrders()}
                className="w-full shrink-0 rounded-xl border-rose-300 bg-white text-xs font-semibold text-rose-700 hover:bg-rose-50 sm:w-auto"
              >
                Retry
              </Button>
            </div>
          )}

          {/* ── Orders Card ── */}
          <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-slate-100 bg-white px-3 py-3 sm:px-5 sm:py-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                  <FiPackage size={14} />
                </div>
                <div className="min-w-0">
                  <CardTitle className="truncate text-xs font-semibold text-slate-800 sm:text-sm">
                    Delivery Orders
                  </CardTitle>
                  <CardDescription className="truncate text-[10px] text-slate-500 sm:text-[11px]">
                    {loading ? 'Loading…' : `${total.toLocaleString('en-IN')} order${total === 1 ? '' : 's'}`}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            {/* ── Table (lg+) ── */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50/70 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Order / Date</th>
                    <th className="px-5 py-3 font-semibold">Customer</th>
                    <th className="px-5 py-3 font-semibold">Invoice</th>
                    <th className="px-5 py-3 font-semibold">Destination</th>
                    <th className="px-5 py-3 text-center font-semibold">Carrier</th>
                    <th className="px-5 py-3 text-center font-semibold">Status</th>
                    <th className="px-5 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-14 text-center text-sm text-slate-400">
                        <FiLoader className="mx-auto mb-2 animate-spin text-indigo-500" size={20} />
                        Loading delivery orders…
                      </td>
                    </tr>
                  ) : orders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-14 text-center">
                        <div className="mx-auto max-w-sm">
                          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-slate-200/70">
                            <FiPackage className="h-6 w-6 text-slate-400" />
                          </div>
                          <p className="mt-4 text-sm font-semibold text-slate-800">
                            No orders found
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {debouncedSearch || statusFilter || townFilter
                              ? 'Try adjusting filters or search term.'
                              : 'Register a delivery from a sales invoice to get started.'}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    orders.map((ord) => (
                      <tr key={ord.id} className="transition-colors hover:bg-slate-50/70">
                        <td className="px-5 py-3.5">
                          <p className="font-semibold text-slate-900">{ord.delivery_order_no}</p>
                          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                            <FiCalendar size={11} /> {ord.expected_delivery_date}
                          </p>
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="font-medium text-slate-900">{ord.recipient_name}</p>
                          <p className="text-[11px] text-slate-500">{ord.recipient_phone}</p>
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="font-medium text-indigo-600">
                            {ord.invoice?.invoice_no || `INV #${ord.invoice_id}`}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {ord.total_quantity} pcs · {ord.total_items_count} items
                          </p>
                        </td>
                        <td className="max-w-[220px] px-5 py-3.5">
                          <p className="flex items-center gap-1 truncate font-medium text-slate-800">
                            <FiMapPin size={11} className="shrink-0 text-rose-500" />
                            {ord.town || 'Local'}
                            <span className="text-[11px] font-normal text-slate-400">({ord.district})</span>
                          </p>
                          <p className="truncate text-[11px] text-slate-500" title={ord.delivery_address}>
                            {ord.delivery_address}
                          </p>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          {ord.current_trip ? (
                            <div className="inline-flex flex-col items-center">
                              <span className="text-[11px] font-semibold text-indigo-600">
                                {ord.current_trip.trip_code}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {ord.current_trip.vehicle?.name || 'Assigned'}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[11px] italic text-slate-400">Unassigned</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <StatusBadge status={ord.status} />
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {ord.status !== 'delivered' && ord.status !== 'cancelled' && (
                            <div className="inline-flex items-center gap-1.5">
                              {canScheduleOrder && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openScheduleModal(ord)}
                                  className="h-8 rounded-lg text-[11px]"
                                >
                                  Reschedule
                                </Button>
                              )}
                              {canConfirmDelivery && (
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => void openConfirmModal(ord)}
                                  className="h-8 rounded-lg bg-emerald-600 text-[11px] font-semibold text-white hover:bg-emerald-700"
                                >
                                  <FiCheck className="mr-1" size={12} /> Confirm
                                </Button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* ── Cards (mobile / tablet) ── */}
            <div className="divide-y divide-slate-100 lg:hidden">
              {loading ? (
                <div className="p-8 text-center text-sm text-slate-400">
                  <FiLoader className="mx-auto mb-2 animate-spin text-indigo-500" size={20} />
                  Loading delivery orders…
                </div>
              ) : orders.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-slate-200/70">
                    <FiPackage className="h-5 w-5 text-slate-400" />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-800">No orders found</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {debouncedSearch || statusFilter || townFilter
                      ? 'Try adjusting filters.'
                      : 'Register a delivery to get started.'}
                  </p>
                </div>
              ) : (
                orders.map((ord) => (
                  <div key={ord.id} className="p-3 sm:p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {ord.delivery_order_no}
                          </p>
                          <StatusBadge status={ord.status} />
                        </div>
                        <p className="mt-1 truncate text-xs text-slate-700">
                          <FiUser size={10} className="mr-1 inline" />
                          {ord.recipient_name}
                          {ord.recipient_phone && (
                            <span className="ml-2 text-[11px] text-slate-500">
                              <FiPhone size={10} className="mr-0.5 inline" /> {ord.recipient_phone}
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-slate-500">
                          <FiMapPin size={10} className="mr-0.5 inline text-rose-500" />
                          {ord.town || 'Local'}
                          {ord.district && ` · ${ord.district}`}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-slate-500">
                          <FiCalendar size={10} className="mr-0.5 inline" />
                          {ord.expected_delivery_date}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-indigo-600">
                          {ord.invoice?.invoice_no || `INV #${ord.invoice_id}`} · {ord.total_quantity} pcs
                        </p>
                      </div>
                    </div>
                    {ord.status !== 'delivered' && ord.status !== 'cancelled' && (
                      <div className="mt-2 flex items-center justify-end gap-2">
                        {canScheduleOrder && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openScheduleModal(ord)}
                            className="h-8 rounded-lg text-[11px]"
                          >
                            Reschedule
                          </Button>
                        )}
                        {canConfirmDelivery && (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void openConfirmModal(ord)}
                            className="h-8 rounded-lg bg-emerald-600 text-[11px] font-semibold text-white hover:bg-emerald-700"
                          >
                            <FiCheck className="mr-1" size={12} /> Confirm
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* ── Pagination ── */}
            <div className="flex flex-col gap-2 border-t border-slate-100 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <p className="text-xs text-slate-500">
                Page <strong className="text-slate-800">{page}</strong> of{' '}
                <strong className="text-slate-800">{totalPages}</strong> · {total.toLocaleString('en-IN')} total
              </p>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={!canGoPrev || loading}
                  className="h-8 rounded-lg"
                >
                  <FiChevronLeft size={14} /> Prev
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!canGoNext || loading}
                  className="h-8 rounded-lg"
                >
                  Next <FiChevronRight size={14} />
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════
       * Schedule Modal
       * ════════════════════════════════════════════════════ */}
      {scheduleOpen && scheduleOrder && (
        <ModalShell
          title="Schedule Delivery"
          subtitle={`#${scheduleOrder.delivery_order_no}`}
          icon={<FiCalendar size={18} />}
          onClose={() => !scheduleSubmitting && setScheduleOpen(false)}
          closeDisabled={scheduleSubmitting}
          footer={
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setScheduleOpen(false)}
                disabled={scheduleSubmitting}
                className="rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void submitSchedule()}
                disabled={scheduleSubmitting}
                className="rounded-xl bg-indigo-600 font-semibold hover:bg-indigo-700"
              >
                {scheduleSubmitting && <FiLoader className="mr-1.5 animate-spin" size={13} />}
                {scheduleSubmitting ? 'Saving…' : 'Save Schedule'}
              </Button>
            </div>
          }
        >
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Expected delivery date *
              </label>
              <input
                type="date"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                min={todayLocalISO()}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Time slot / window
              </label>
              <input
                type="text"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(clampStr(e.target.value, LIMITS.timeSlotMax))}
                placeholder="10:00 AM - 01:00 PM"
                maxLength={LIMITS.timeSlotMax}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Priority
              </label>
              <select
                value={schedulePriority}
                onChange={(e) => setSchedulePriority(e.target.value as Priority)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
              >
                {PRIORITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Remarks / driver instructions
              </label>
              <textarea
                value={scheduleRemarks}
                onChange={(e) => setScheduleRemarks(clampStr(e.target.value, LIMITS.remarksMax))}
                rows={3}
                maxLength={LIMITS.remarksMax}
                placeholder="Landmark notes, road conditions…"
                className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
              />
              <p className="mt-1 text-right text-[10px] text-slate-400">
                {scheduleRemarks.length} / {LIMITS.remarksMax}
              </p>
            </div>
          </div>
        </ModalShell>
      )}

      {/* ════════════════════════════════════════════════════
       * Confirm Modal
       * ════════════════════════════════════════════════════ */}
      {confirmOpen && confirmOrder && (
        <ModalShell
          title="Confirm Delivery"
          subtitle={`#${confirmOrder.delivery_order_no}`}
          icon={<FiCheckCircle size={18} />}
          maxWidth="max-w-lg"
          onClose={() => !confirmSubmitting && setConfirmOpen(false)}
          closeDisabled={confirmSubmitting}
          footer={
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmOpen(false)}
                disabled={confirmSubmitting}
                className="rounded-xl"
              >
                Close
              </Button>
              <Button
                type="button"
                onClick={() => void submitConfirm()}
                disabled={confirmSubmitting || confirmLoading}
                className="rounded-xl bg-emerald-600 font-semibold text-white hover:bg-emerald-700"
              >
                {confirmSubmitting && <FiLoader className="mr-1.5 animate-spin" size={13} />}
                {confirmSubmitting ? 'Recording…' : 'Submit Confirmation'}
              </Button>
            </div>
          }
        >
          {confirmLoading ? (
            <div className="py-12 text-center">
              <FiLoader className="mx-auto mb-2 animate-spin text-indigo-500" size={22} />
              <p className="text-xs text-slate-500">Loading order details…</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Delivery outcome
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { key: 'delivered', label: 'Full', color: 'emerald' },
                    { key: 'partially_delivered', label: 'Partial', color: 'blue' },
                    { key: 'failed', label: 'Failed', color: 'rose' },
                  ] as const).map((opt) => {
                    const active = confirmStatus === opt.key;
                    const colorMap = {
                      emerald: 'bg-emerald-600 border-emerald-600',
                      blue: 'bg-blue-600 border-blue-600',
                      rose: 'bg-rose-600 border-rose-600',
                    };
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setConfirmStatus(opt.key)}
                        className={`rounded-xl border py-2 text-xs font-semibold transition ${
                          active
                            ? `${colorMap[opt.color]} text-white`
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {confirmStatus === 'failed' && (
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Failure reason
                  </label>
                  <select
                    value={failureReason}
                    onChange={(e) => setFailureReason(e.target.value as FailureReason)}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                  >
                    {FAILURE_REASON_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {confirmStatus === 'partially_delivered' && confirmOrder.items && (
                <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                    Item quantities
                  </p>
                  {confirmOrder.items.map((item) => {
                    const requested = safeNum(item.requested_quantity);
                    const qty = itemQuantities[item.id] ?? { delivered: requested, returned: 0 };
                    return (
                      <div key={item.id} className="flex items-center justify-between gap-2 py-1">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-slate-800">{item.product_name}</p>
                          <p className="text-[10px] text-slate-500">Ordered: {requested} pcs</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <label className="text-[10px] text-slate-500">Delivered:</label>
                          <input
                            type="number"
                            min={0}
                            max={requested}
                            step="1"
                            value={qty.delivered}
                            onChange={(e) => {
                              const v = Math.max(0, Math.min(requested, Math.floor(Number(e.target.value) || 0)));
                              setItemQuantities((prev) => ({
                                ...prev,
                                [item.id]: { delivered: v, returned: requested - v },
                              }));
                            }}
                            className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-center text-xs outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Receiver name
                  </label>
                  <input
                    type="text"
                    value={receiverName}
                    onChange={(e) => setReceiverName(clampStr(e.target.value, LIMITS.nameMax))}
                    maxLength={LIMITS.nameMax}
                    placeholder="Received by"
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Receiver phone
                  </label>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={receiverPhone}
                    onChange={(e) => setReceiverPhone(phoneSafe(clampStr(e.target.value, LIMITS.phoneMax)))}
                    maxLength={LIMITS.phoneMax}
                    pattern="[+]?[0-9\s\-()]{7,20}"
                    placeholder="Phone number"
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Delivery remarks
                </label>
                <textarea
                  value={confirmRemarks}
                  onChange={(e) => setConfirmRemarks(clampStr(e.target.value, LIMITS.remarksMax))}
                  rows={2}
                  maxLength={LIMITS.remarksMax}
                  placeholder="Signature confirmation, return remarks…"
                  className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                />
              </div>
            </div>
          )}
        </ModalShell>
      )}

      {/* ════════════════════════════════════════════════════
       * Create Modal
       * ════════════════════════════════════════════════════ */}
      {createOpen && (
        <ModalShell
          title="Register Delivery from Invoice"
          subtitle="Search invoice, verify destination, schedule dispatch"
          icon={<FiPlus size={18} />}
          maxWidth="max-w-xl"
          onClose={() => !createSubmitting && setCreateOpen(false)}
          closeDisabled={createSubmitting}
          footer={
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={createSubmitting}
                className="rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void submitCreate()}
                disabled={createSubmitting || !selectedInvoice}
                className="rounded-xl bg-indigo-600 font-semibold hover:bg-indigo-700"
              >
                {createSubmitting && <FiLoader className="mr-1.5 animate-spin" size={13} />}
                {createSubmitting ? 'Creating…' : 'Register Delivery'}
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Invoice picker */}
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Sales invoice *
              </label>

              {!selectedInvoice ? (
                <div className="space-y-2">
                  <div className="relative">
                    <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                      type="text"
                      value={invoiceSearch}
                      onChange={(e) => setInvoiceSearch(clampStr(e.target.value, LIMITS.nameMax))}
                      placeholder="Search invoice #, customer name, or phone…"
                      maxLength={LIMITS.nameMax}
                      autoFocus
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-9 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                    />
                    {invoicesLoading && (
                      <FiLoader className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400" size={14} />
                    )}
                    {invoiceSearch && !invoicesLoading && (
                      <button
                        type="button"
                        onClick={() => setInvoiceSearch('')}
                        className="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        aria-label="Clear search"
                      >
                        <FiX size={13} />
                      </button>
                    )}
                  </div>

                  <div className="max-h-52 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                    {invoicesLoading ? (
                      <div className="p-4 text-center text-xs text-slate-400">
                        <FiLoader className="mr-1.5 inline animate-spin" size={12} /> Searching…
                      </div>
                    ) : invoices.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400">
                        {invoiceSearch
                          ? `No invoices matching "${invoiceSearch}".`
                          : 'Type to search invoices.'}
                      </div>
                    ) : (
                      invoices.map((inv) => (
                        <button
                          key={inv.id}
                          type="button"
                          onClick={() => handleSelectInvoice(inv)}
                          className="flex w-full items-center justify-between gap-2 p-3 text-left transition hover:bg-indigo-50/60"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-mono text-xs font-bold text-indigo-600">
                              {inv.invoice_no}
                            </p>
                            <p className="truncate text-xs font-semibold text-slate-900">
                              {inv.customer_name || inv.customer?.name || 'Walk-in'}
                            </p>
                            <p className="truncate text-[11px] text-slate-500">
                              {inv.shipping_city || inv.customer?.city || 'Local'} ·{' '}
                              {inv.customer_phone || inv.customer?.phone || 'N/A'}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="font-mono text-xs font-bold text-slate-900">
                              ₹{formatINR(inv.total_amount)}
                            </p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-600">
                      <FiCheckCircle size={16} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs font-bold text-indigo-900">
                        {selectedInvoice.invoice_no}
                      </p>
                      <p className="truncate text-[11px] text-slate-600">
                        {selectedInvoice.customer_name || selectedInvoice.customer?.name} · ₹{formatINR(selectedInvoice.total_amount)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedInvoice(null);
                      setInvoiceSearch('');
                    }}
                    className="shrink-0 rounded-lg border border-indigo-200 bg-white px-2 py-1 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-100"
                  >
                    Change
                  </button>
                </div>
              )}
            </div>

            {/* Recipient */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Recipient name *
                </label>
                <input
                  type="text"
                  value={form.recipientName}
                  onChange={(e) => setForm((p) => ({ ...p, recipientName: clampStr(e.target.value, LIMITS.nameMax) }))}
                  maxLength={LIMITS.nameMax}
                  placeholder="Recipient name"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Recipient phone *
                </label>
                <input
                  type="tel"
                  inputMode="tel"
                  value={form.recipientPhone}
                  onChange={(e) => setForm((p) => ({ ...p, recipientPhone: phoneSafe(clampStr(e.target.value, LIMITS.phoneMax)) }))}
                  maxLength={LIMITS.phoneMax}
                  pattern="[+]?[0-9\s\-()]{7,20}"
                  placeholder="+91…"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                />
              </div>
            </div>

            {/* Town + District */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Town / area *
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !form.manualTown;
                      setForm((p) => ({
                        ...p,
                        manualTown: next,
                        town: next ? '' : (PRESET_TOWNS as readonly string[]).includes(p.town) ? p.town : 'Kashichak',
                      }));
                    }}
                    className="text-[10px] font-semibold text-indigo-600 hover:underline"
                  >
                    {form.manualTown ? '← Use preset' : '+ Custom'}
                  </button>
                </div>
                {form.manualTown ? (
                  <input
                    type="text"
                    value={form.town}
                    onChange={(e) => setForm((p) => ({ ...p, town: clampStr(e.target.value, LIMITS.townMax) }))}
                    maxLength={LIMITS.townMax}
                    placeholder="Type custom town / village…"
                    autoFocus
                    className="h-10 w-full rounded-xl border border-indigo-400 bg-white px-3.5 text-sm outline-none focus:ring-4 focus:ring-indigo-500/10"
                  />
                ) : (
                  <select
                    value={form.town}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '__manual__') {
                        setForm((p) => ({ ...p, manualTown: true, town: '' }));
                        return;
                      }
                      let district = 'Nawada';
                      if (NALANDA_TOWNS.has(v)) district = 'Nalanda';
                      else if (GAYA_TOWNS.has(v)) district = 'Gaya';
                      setForm((p) => ({ ...p, town: v, district }));
                    }}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                  >
                    {PRESET_TOWNS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                    <option value="__manual__">+ Other / Custom…</option>
                  </select>
                )}
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  District *
                </label>
                <input
                  type="text"
                  value={form.district}
                  onChange={(e) => setForm((p) => ({ ...p, district: clampStr(e.target.value, LIMITS.districtMax) }))}
                  maxLength={LIMITS.districtMax}
                  placeholder="District"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                />
              </div>
            </div>

            {/* Address */}
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Delivery address
              </label>
              <textarea
                value={form.address}
                onChange={(e) => setForm((p) => ({ ...p, address: clampStr(e.target.value, LIMITS.addressMax) }))}
                rows={2}
                maxLength={LIMITS.addressMax}
                placeholder="Street / landmark snapshot…"
                className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
              />
            </div>

            {/* Date + Priority */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Expected date *
                </label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                  min={todayLocalISO()}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Priority
                </label>
                <select
                  value={form.priority}
                  onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value as Priority }))}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                >
                  {PRIORITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </ModalShell>
      )}
    </DeliveryOrdersBoundary>
  );
};

export default DeliveryOrdersPage;