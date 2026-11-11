// src/pages/CalendarPage.tsx
import React, {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  FiCalendar,
  FiChevronLeft,
  FiChevronRight,
  FiTruck,
  FiPackage,
  FiDollarSign,
  FiRefreshCw,
  FiMapPin,
  FiCheckCircle,
  FiAlertCircle,
  FiPlus,
  FiLoader,
  FiAlertTriangle,
} from 'react-icons/fi';
import deliveryService, {
  DeliveryOrder,
  DeliveryTrip,
} from '../services/deliveryService';
import { usePermission } from '../hooks/usePermission';
import { useAuthStore } from '../store/auth';
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

/* ══════════════════════════════════════════════════════════
 * Types & Constants
 * ════════════════════════════════════════════════════════ */

export interface InvoiceDueItem {
  id: number;
  invoice_no: string;
  customer_id: number;
  total_amount: number;
  paid_amount: number;
  status: string;
  payment_status: string;
  due_date: string;
  invoice_date?: string;
  customer?: {
    id: number;
    name: string;
    phone?: string;
  };
}

type CategoryFilter = 'all' | 'deliveries' | 'trips' | 'invoices';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const CATEGORY_OPTIONS: Array<{
  key: CategoryFilter;
  label: string;
  activeCls: string;
  idleCls: string;
}> = [
  {
    key: 'all',
    label: 'All operations',
    activeCls: 'bg-indigo-600 text-white shadow-sm',
    idleCls: 'bg-slate-100 text-slate-600 hover:bg-slate-200',
  },
  {
    key: 'deliveries',
    label: 'Deliveries',
    activeCls: 'bg-emerald-600 text-white shadow-sm',
    idleCls: 'bg-slate-100 text-slate-600 hover:bg-slate-200',
  },
  {
    key: 'trips',
    label: 'Carrier trips',
    activeCls: 'bg-indigo-600 text-white shadow-sm',
    idleCls: 'bg-slate-100 text-slate-600 hover:bg-slate-200',
  },
  {
    key: 'invoices',
    label: 'Payment deadlines',
    activeCls: 'bg-amber-600 text-white shadow-sm',
    idleCls: 'bg-slate-100 text-slate-600 hover:bg-slate-200',
  },
];

const MAX_VISIBLE_EVENTS_PER_CELL = 3;

const TRIP_STATUS_CLASSES: Record<string, string> = {
  in_transit: 'border-blue-200/70 bg-blue-50 text-blue-700',
  dispatched: 'border-blue-200/70 bg-blue-50 text-blue-700',
  closed: 'border-emerald-200/70 bg-emerald-50 text-emerald-700',
  completed: 'border-emerald-200/70 bg-emerald-50 text-emerald-700',
  ready_for_dispatch: 'border-indigo-200/70 bg-indigo-50 text-indigo-700',
  vehicle_assigned: 'border-amber-200/70 bg-amber-50 text-amber-700',
  loading_pending: 'border-amber-200/70 bg-amber-50 text-amber-700',
  loading_in_progress: 'border-amber-200/70 bg-amber-50 text-amber-700',
  cancelled: 'border-slate-200 bg-slate-50 text-slate-600',
};
const DEFAULT_TRIP_STATUS_CLASS = 'border-slate-200 bg-slate-50 text-slate-600';

/* ══════════════════════════════════════════════════════════
 * Helpers
 * ════════════════════════════════════════════════════════ */

const pad = (n: number): string => String(n).padStart(2, '0');

const formatLocalDate = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const parseLocalDate = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};

const isSameDate = (dateVal: unknown, targetDay: string): boolean => {
  if (dateVal == null) return false;
  return String(dateVal).slice(0, 10) === targetDay;
};

const todayLocal = (): string => formatLocalDate(new Date());

const safeNum = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const safeStr = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v : v == null ? fallback : String(v);

const formatINR = (v: unknown, decimals = 0): string => {
  const n = safeNum(v);
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: 2,
  });
};

const statusLabel = (s?: string | null): string =>
  safeStr(s).replace(/_/g, ' ') || 'unknown';

function getApiErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (error && typeof error === 'object') {
    const e = error as {
      message?: unknown;
      response?: { status?: number; data?: { message?: unknown } };
    };
    const status = e.response?.status;
    const msg =
      (typeof e.response?.data?.message === 'string' && e.response.data.message) ||
      (typeof e.message === 'string' && e.message) ||
      '';
    if (status === 401) return 'Session expired. Please sign in again.';
    if (status === 403) return 'You do not have permission for this action.';
    if (status === 404) return 'Calendar data not found.';
    if (status && status >= 500) return 'Server error. Please try again.';
    if (msg) return msg;
  }
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}

/* ══════════════════════════════════════════════════════════
 * Error Boundary
 * ════════════════════════════════════════════════════════ */

interface BoundaryState { hasError: boolean; message?: string }
class CalendarBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { hasError: false };
  static getDerivedStateFromError(err: unknown): BoundaryState {
    return {
      hasError: true,
      message: err instanceof Error ? err.message : 'Unexpected error.',
    };
  }
  componentDidCatch(err: unknown) {
    // eslint-disable-next-line no-console
    console.error('[CalendarPage]', err);
  }
  reset = () => this.setState({ hasError: false, message: undefined });
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[400px] items-center justify-center p-6">
          <div className="max-w-md rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
            <FiAlertTriangle className="mx-auto mb-3 text-rose-600" size={32} />
            <h2 className="text-base font-bold text-slate-900">Something went wrong</h2>
            <p className="mt-1 text-sm text-slate-600">
              {this.state.message || 'Unable to render the calendar.'}
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
 * Small shared UI
 * ════════════════════════════════════════════════════════ */

const KpiCard = ({
  icon,
  label,
  value,
  accent,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  accent: 'emerald' | 'indigo' | 'amber';
  active: boolean;
  onClick: () => void;
}) => {
  const styles = {
    emerald: {
      chip: 'bg-emerald-50 text-emerald-600 ring-emerald-500/10',
      value: 'text-emerald-700',
      ring: active ? 'ring-2 ring-emerald-400/60 border-emerald-200' : '',
    },
    indigo: {
      chip: 'bg-indigo-50 text-indigo-600 ring-indigo-500/10',
      value: 'text-indigo-700',
      ring: active ? 'ring-2 ring-indigo-400/60 border-indigo-200' : '',
    },
    amber: {
      chip: 'bg-amber-50 text-amber-600 ring-amber-500/10',
      value: 'text-amber-700',
      ring: active ? 'ring-2 ring-amber-400/60 border-amber-200' : '',
    },
  }[accent];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300/80 hover:shadow-[0_8px_24px_-12px_rgba(15,23,42,0.15)] sm:p-4 ${styles.ring}`}
    >
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 ${styles.chip}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:text-[11px]">
          {label}
        </p>
        <p className={`mt-1 text-lg font-bold tabular-nums sm:text-xl ${styles.value}`}>
          {value}
        </p>
      </div>
    </button>
  );
};

const TripStatusPill = ({ status }: { status?: string | null }) => {
  const key = safeStr(status).toLowerCase();
  const cls = TRIP_STATUS_CLASSES[key] ?? DEFAULT_TRIP_STATUS_CLASS;
  return (
    <Badge
      variant="outline"
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${cls}`}
    >
      {statusLabel(key)}
    </Badge>
  );
};

const PriorityPill = ({ priority }: { priority?: string | null }) => {
  const key = safeStr(priority, 'normal').toLowerCase();
  const cls =
    key === 'urgent'
      ? 'border-rose-200/70 bg-rose-50 text-rose-700'
      : key === 'high'
        ? 'border-amber-200/70 bg-amber-50 text-amber-700'
        : 'border-emerald-200/70 bg-emerald-50 text-emerald-700';
  return (
    <Badge
      variant="outline"
      className={`shrink-0 rounded px-1.5 py-0.2 text-[9px] font-bold uppercase ${cls}`}
    >
      {key}
    </Badge>
  );
};

/* ══════════════════════════════════════════════════════════
 * Main component
 * ════════════════════════════════════════════════════════ */

export const CalendarPage: React.FC = () => {
  const navigate = useNavigate();
  const { showError } = useNotification();
  const { can, isSuperAdmin } = usePermission();
  const loadingUser = useAuthStore((s) => s.loadingUser);
  const hasUser = useAuthStore((s) => Boolean(s.user));

  /* ── Permissions ── */
  const canView = isSuperAdmin || can('view deliveries') || can('view invoices');

  /* ── State ── */
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [trips, setTrips] = useState<DeliveryTrip[]>([]);
  const [invoicesDue, setInvoicesDue] = useState<InvoiceDueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string>(todayLocal());
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

  /* ── Refs ── */
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  /* ── Fetch range (current month ± 7 days) ── */
  const fetchRange = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstGrid = new Date(year, month, 1 - 7);
    const lastGrid = new Date(year, month + 1, 7);
    return { start: formatLocalDate(firstGrid), end: formatLocalDate(lastGrid) };
  }, [currentDate]);

  /* ══════════════════════════════════════════════════════
   * Fetch
   * ══════════════════════════════════════════════════════ */

  const fetchCalendarEvents = useCallback(async () => {
    if (!canView) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError(null);
    try {
      const res = await deliveryService.getCalendar({
        start: fetchRange.start,
        end: fetchRange.end,
      });
      if (ctrl.signal.aborted || !mountedRef.current) return;
      const raw = (res as any)?.data || res;
      setOrders(Array.isArray(raw?.orders) ? raw.orders : []);
      setTrips(Array.isArray(raw?.trips) ? raw.trips : []);
      setInvoicesDue(Array.isArray(raw?.invoices_due) ? raw.invoices_due : []);
    } catch (err) {
      if (ctrl.signal.aborted) return;
      const msg = getApiErrorMessage(err, 'Could not load calendar data.');
      setError(msg);
      setOrders([]);
      setTrips([]);
      setInvoicesDue([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [canView, fetchRange.start, fetchRange.end]);

  useEffect(() => {
    void fetchCalendarEvents();
  }, [fetchCalendarEvents]);

  /* ══════════════════════════════════════════════════════
   * Navigation
   * ══════════════════════════════════════════════════════ */

  const prevMonth = useCallback(() => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  }, [currentDate]);

  const nextMonth = useCallback(() => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  }, [currentDate]);

  const goToToday = useCallback(() => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDay(formatLocalDate(today));
  }, []);

  /* ── Shortcuts ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const key = e.key.toLowerCase();
      if (key === 'r') {
        e.preventDefault();
        void fetchCalendarEvents();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevMonth();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextMonth();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fetchCalendarEvents, prevMonth, nextMonth]);

  /* ══════════════════════════════════════════════════════
   * Derived data
   * ══════════════════════════════════════════════════════ */

  const ordersByDay = useMemo(() => {
    const map = new Map<string, DeliveryOrder[]>();
    orders.forEach((o) => {
      const key = String(o.expected_delivery_date ?? '').slice(0, 10);
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    });
    return map;
  }, [orders]);

  const tripsByDay = useMemo(() => {
    const map = new Map<string, DeliveryTrip[]>();
    trips.forEach((t) => {
      const key = String(t.planned_date ?? '').slice(0, 10);
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });
    return map;
  }, [trips]);

  const invoicesByDay = useMemo(() => {
    const map = new Map<string, InvoiceDueItem[]>();
    invoicesDue.forEach((inv) => {
      const key = String(inv.due_date ?? '').slice(0, 10);
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(inv);
    });
    return map;
  }, [invoicesDue]);

  /* ── Filtered KPIs (respect active filter) ── */
  const kpiCounts = useMemo(
    () => ({
      deliveries: orders.length,
      trips: trips.length,
      invoices: invoicesDue.length,
      total: orders.length + trips.length + invoicesDue.length,
    }),
    [orders.length, trips.length, invoicesDue.length]
  );

  /* ── Calendar grid math ── */
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthName = currentDate.toLocaleString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const calendarDays = useMemo(() => {
    const days: (string | null)[] = [];
    for (let i = 0; i < firstDayOfMonth; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(`${year}-${pad(month + 1)}-${pad(d)}`);
    }
    return days;
  }, [year, month, firstDayOfMonth, daysInMonth]);

  const selectedDayOrders = useMemo(() => {
    if (categoryFilter !== 'all' && categoryFilter !== 'deliveries') return [];
    return ordersByDay.get(selectedDay) ?? [];
  }, [ordersByDay, selectedDay, categoryFilter]);

  const selectedDayTrips = useMemo(() => {
    if (categoryFilter !== 'all' && categoryFilter !== 'trips') return [];
    return tripsByDay.get(selectedDay) ?? [];
  }, [tripsByDay, selectedDay, categoryFilter]);

  const selectedDayInvoices = useMemo(() => {
    if (categoryFilter !== 'all' && categoryFilter !== 'invoices') return [];
    return invoicesByDay.get(selectedDay) ?? [];
  }, [invoicesByDay, selectedDay, categoryFilter]);

  const totalDayEvents =
    selectedDayOrders.length + selectedDayTrips.length + selectedDayInvoices.length;
  const todayStr = todayLocal();

  /* ── Access guard ── */
  if (loadingUser && !hasUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="rounded-2xl bg-white px-6 py-5 text-sm text-slate-600 shadow-sm">
          Loading permissions…
        </div>
      </div>
    );
  }
  if (!canView) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <FiAlertTriangle className="mx-auto mb-3 text-rose-600" size={32} />
          <h2 className="text-lg font-bold text-slate-900">Access denied</h2>
          <p className="mt-1.5 text-sm text-slate-500">
            You don't have permission to view the operations calendar.
          </p>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════
   * Render
   * ══════════════════════════════════════════════════════ */

  return (
    <CalendarBoundary>
      <div className="min-h-full bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100/60">
        <div className="mx-auto w-full max-w-[1500px] space-y-4 p-3 sm:space-y-5 sm:p-4 lg:p-5 xl:p-6">

          {/* ════════ Hero ════════ */}
          <section className="relative overflow-hidden rounded-2xl border border-slate-800/10 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-4 py-5 shadow-[0_20px_40px_-20px_rgba(15,23,42,0.45)] sm:px-6 sm:py-6 lg:px-7">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />
            <div className="relative flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200 backdrop-blur">
                  <FiCalendar size={12} /> Operations · Calendar
                </div>
                <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl xl:text-[30px]">
                  Unified Operations Calendar
                </h1>
                <p className="mt-1.5 max-w-2xl text-xs text-slate-300 sm:text-sm">
                  Deliveries, carrier trips, and payment deadlines — all in one monthly view.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate('/deliveries/orders')}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-white backdrop-blur transition hover:border-white/20 hover:bg-white/10"
                >
                  <FiPackage size={14} /> New delivery
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/deliveries/routes')}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-gradient-to-b from-cyan-300 to-cyan-400 px-4 text-xs font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:from-cyan-200 hover:to-cyan-300"
                >
                  <FiPlus size={14} /> Plan trip
                </button>
              </div>
            </div>
          </section>

          {/* ════════ Controls ════════ */}
          <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <CardContent className="flex flex-wrap items-center gap-2 p-3 sm:p-4">
              <Button
                type="button"
                variant="outline"
                onClick={goToToday}
                className="h-9 rounded-lg text-xs font-semibold"
              >
                Today
              </Button>

              <div className="flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={prevMonth}
                  title="Previous month (Ctrl+←)"
                  aria-label="Previous month"
                  className="p-1.5 text-slate-600 transition hover:bg-slate-100"
                >
                  <FiChevronLeft size={16} />
                </button>
                <span className="min-w-[140px] px-3 text-center text-xs font-bold text-slate-800">
                  {monthName}
                </span>
                <button
                  type="button"
                  onClick={nextMonth}
                  title="Next month (Ctrl+→)"
                  aria-label="Next month"
                  className="p-1.5 text-slate-600 transition hover:bg-slate-100"
                >
                  <FiChevronRight size={16} />
                </button>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={() => void fetchCalendarEvents()}
                disabled={loading}
                title="Refresh (Ctrl+R)"
                className="h-9 rounded-lg"
              >
                {loading ? (
                  <FiLoader className="animate-spin" size={15} />
                ) : (
                  <FiRefreshCw size={15} />
                )}
              </Button>

              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                {CATEGORY_OPTIONS.map((opt) => {
                  const active = categoryFilter === opt.key;
                  const count =
                    opt.key === 'all'
                      ? kpiCounts.total
                      : opt.key === 'deliveries'
                        ? kpiCounts.deliveries
                        : opt.key === 'trips'
                          ? kpiCounts.trips
                          : kpiCounts.invoices;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setCategoryFilter(opt.key)}
                      className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                        active ? opt.activeCls : opt.idleCls
                      }`}
                    >
                      {opt.label} ({count})
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* ════════ KPI cards ════════ */}
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KpiCard
              icon={<FiPackage size={20} className="text-emerald-600" />}
              label="Deliveries"
              value={kpiCounts.deliveries}
              accent="emerald"
              active={categoryFilter === 'deliveries'}
              onClick={() =>
                setCategoryFilter((prev) =>
                  prev === 'deliveries' ? 'all' : 'deliveries'
                )
              }
            />
            <KpiCard
              icon={<FiTruck size={20} className="text-indigo-600" />}
              label="Carrier trips"
              value={kpiCounts.trips}
              accent="indigo"
              active={categoryFilter === 'trips'}
              onClick={() =>
                setCategoryFilter((prev) => (prev === 'trips' ? 'all' : 'trips'))
              }
            />
            <KpiCard
              icon={<FiDollarSign size={20} className="text-amber-600" />}
              label="Invoices due"
              value={kpiCounts.invoices}
              accent="amber"
              active={categoryFilter === 'invoices'}
              onClick={() =>
                setCategoryFilter((prev) =>
                  prev === 'invoices' ? 'all' : 'invoices'
                )
              }
            />
          </section>

          {/* ════════ Error ════════ */}
          {error && (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-rose-700 sm:flex-row sm:items-start sm:gap-3 sm:p-4"
            >
              <div className="flex items-start gap-2 sm:flex-1">
                <FiAlertCircle className="mt-0.5 shrink-0" size={18} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Could not load calendar</p>
                  <p className="text-xs sm:text-sm">{error}</p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => void fetchCalendarEvents()}
                className="w-full shrink-0 rounded-xl border-rose-300 bg-white text-xs font-semibold text-rose-700 hover:bg-rose-50 sm:w-auto"
              >
                Retry
              </Button>
            </div>
          )}

          {/* ════════ Grid + Sidebar ════════ */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4 lg:gap-6">
            {/* Calendar grid */}
            <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:col-span-3">
              <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/70 py-2.5 text-center text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:text-[11px]">
                {WEEKDAY_LABELS.map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>

              {loading ? (
                <div className="flex justify-center py-24">
                  <FiLoader className="animate-spin text-indigo-500" size={28} />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="min-w-[640px] sm:min-w-0">
                    <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-slate-100">
                      {calendarDays.map((dayStr, idx) => {
                        if (!dayStr) {
                          return (
                            <div
                              key={`empty-${idx}`}
                              className="min-h-[100px] bg-slate-50/40"
                            />
                          );
                        }

                        const cellOrders =
                          categoryFilter === 'all' || categoryFilter === 'deliveries'
                            ? ordersByDay.get(dayStr) ?? []
                            : [];
                        const cellTrips =
                          categoryFilter === 'all' || categoryFilter === 'trips'
                            ? tripsByDay.get(dayStr) ?? []
                            : [];
                        const cellInvoices =
                          categoryFilter === 'all' || categoryFilter === 'invoices'
                            ? invoicesByDay.get(dayStr) ?? []
                            : [];

                        /* Build a capped list of visible events */
                        const allEvents: Array<{
                          kind: 'trip' | 'order' | 'invoice';
                          key: string;
                          node: ReactNode;
                        }> = [];

                        // Trips first
                        cellTrips.forEach((t) => {
                          allEvents.push({
                            kind: 'trip',
                            key: `t-${t.id}`,
                            node: (
                              <span
                                key={`t-${t.id}`}
                                className="flex items-center gap-1 truncate rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-800 transition hover:brightness-95"
                                title={`Trip ${safeStr(t.trip_code)} · ${safeNum(
                                  t.total_customers
                                )} stops`}
                              >
                                <FiTruck className="shrink-0" size={10} />
                                <span className="truncate">
                                  {safeStr(t.trip_code, 'Trip')}
                                </span>
                              </span>
                            ),
                          });
                        });

                        // Then orders
                        cellOrders.forEach((o) => {
                          const priority = safeStr(o.priority, 'normal').toLowerCase();
                          const cls =
                            priority === 'urgent'
                              ? 'bg-rose-100 text-rose-800'
                              : priority === 'high'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-50 text-emerald-800';
                          allEvents.push({
                            kind: 'order',
                            key: `o-${o.id}`,
                            node: (
                              <span
                                key={`o-${o.id}`}
                                className={`flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-[10px] font-medium transition hover:brightness-95 ${cls}`}
                                title={`Delivery: ${safeStr(o.recipient_name)} (${safeStr(
                                  o.town,
                                  'Local'
                                )})`}
                              >
                                <FiPackage className="shrink-0" size={10} />
                                <span className="truncate">
                                  {safeStr(o.recipient_name, 'Order')}
                                </span>
                              </span>
                            ),
                          });
                        });

                        // Then invoices
                        cellInvoices.forEach((inv) => {
                          allEvents.push({
                            kind: 'invoice',
                            key: `inv-${inv.id}`,
                            node: (
                              <span
                                key={`inv-${inv.id}`}
                                className="flex items-center gap-1 truncate rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 transition hover:brightness-95"
                                title={`Invoice #${safeStr(
                                  inv.invoice_no
                                )} due — ₹${formatINR(inv.total_amount)}`}
                              >
                                <FiDollarSign className="shrink-0" size={10} />
                                <span className="truncate">
                                  #{safeStr(inv.invoice_no, 'INV')}
                                </span>
                              </span>
                            ),
                          });
                        });

                        const totalEvents = allEvents.length;
                        const visibleEvents = allEvents.slice(
                          0,
                          MAX_VISIBLE_EVENTS_PER_CELL
                        );
                        const remainingEvents = Math.max(
                          0,
                          totalEvents - MAX_VISIBLE_EVENTS_PER_CELL
                        );
                        const isSelected = selectedDay === dayStr;
                        const isToday = todayStr === dayStr;
                        const dayNum = parseInt(dayStr.slice(-2), 10);

                        return (
                          <button
                            type="button"
                            key={dayStr}
                            onClick={() => setSelectedDay(dayStr)}
                            className={`flex min-h-[100px] flex-col justify-between p-1.5 text-left transition ${
                              isSelected
                                ? 'bg-indigo-50/80 ring-2 ring-inset ring-indigo-500'
                                : 'hover:bg-slate-50/80'
                            }`}
                          >
                            <div className="mb-1 flex items-center justify-between">
                              <span
                                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                                  isToday
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : isSelected
                                      ? 'bg-indigo-100 text-indigo-700'
                                      : 'text-slate-700'
                                }`}
                              >
                                {dayNum}
                              </span>
                              {totalEvents > 0 && (
                                <span className="font-mono text-[9px] font-semibold text-slate-500">
                                  {totalEvents}
                                </span>
                              )}
                            </div>

                            <div className="max-h-[70px] space-y-0.5 overflow-y-auto">
                              {visibleEvents.map((e) => e.node)}
                              {remainingEvents > 0 && (
                                <span className="block px-1 text-[9px] font-semibold text-slate-500">
                                  +{remainingEvents} more
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </Card>

            {/* Day agenda sidebar */}
            <Card className="rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:col-span-1">
              <CardHeader className="border-b border-slate-100 bg-white px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      Day agenda
                    </p>
                    <CardTitle className="mt-0.5 truncate text-sm font-bold text-slate-900">
                      {parseLocalDate(selectedDay).toLocaleDateString('en-IN', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </CardTitle>
                  </div>
                  <Badge
                    variant="outline"
                    className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700"
                  >
                    {totalDayEvents} events
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-3 p-3">
                {/* Trips */}
                {(categoryFilter === 'all' || categoryFilter === 'trips') && (
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-indigo-600">
                        <FiTruck size={11} /> Trips ({selectedDayTrips.length})
                      </p>
                      <Link
                        to="/deliveries/trips"
                        className="text-[10px] font-semibold text-indigo-600 hover:underline"
                      >
                        Manage
                      </Link>
                    </div>

                    {selectedDayTrips.length === 0 ? (
                      <p className="py-2 text-[11px] italic text-slate-400">
                        No trips scheduled.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {selectedDayTrips.map((t) => (
                          <div
                            key={t.id}
                            className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-xs font-bold text-indigo-900">
                                {safeStr(t.trip_code, 'Trip')}
                              </span>
                              <TripStatusPill status={t.status} />
                            </div>
                            <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-slate-600">
                              <FiTruck className="text-slate-400" size={10} />
                              <span className="truncate">
                                {safeStr(t.vehicle?.name, 'Carrier')} (
                                {safeStr(t.vehicle?.registration_number, 'N/A')})
                              </span>
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Deliveries */}
                {(categoryFilter === 'all' || categoryFilter === 'deliveries') && (
                  <div className="border-t border-slate-100 pt-3">
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-emerald-600">
                        <FiPackage size={11} /> Deliveries (
                        {selectedDayOrders.length})
                      </p>
                      <Link
                        to="/deliveries/orders"
                        className="text-[10px] font-semibold text-emerald-600 hover:underline"
                      >
                        All
                      </Link>
                    </div>

                    {selectedDayOrders.length === 0 ? (
                      <p className="py-2 text-[11px] italic text-slate-400">
                        No deliveries scheduled.
                      </p>
                    ) : (
                      <div className="max-h-[260px] space-y-1.5 overflow-y-auto pr-0.5">
                        {selectedDayOrders.map((o) => (
                          <div
                            key={o.id}
                            className="rounded-lg border border-slate-200 bg-slate-50 p-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="truncate text-xs font-bold text-slate-900">
                                {safeStr(o.recipient_name, 'Order')}
                              </span>
                              <PriorityPill priority={o.priority} />
                            </div>
                            <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-slate-500">
                              <FiMapPin className="text-slate-400" size={10} />
                              <span className="truncate">
                                {safeStr(o.town, 'Local')},{' '}
                                {safeStr(o.district, '—')}
                              </span>
                            </p>
                            <p className="mt-1 flex justify-between border-t border-slate-200/60 pt-1 text-[11px] text-slate-500">
                              <span>
                                Order #
                                {safeStr(
                                  (o as any).delivery_order_no,
                                  String(o.id)
                                )}
                              </span>
                              <span className="font-semibold text-slate-700">
                                {safeNum(o.total_quantity)} pcs
                              </span>
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Invoices */}
                {(categoryFilter === 'all' || categoryFilter === 'invoices') && (
                  <div className="border-t border-slate-100 pt-3">
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-amber-600">
                        <FiDollarSign size={11} /> Payment deadlines (
                        {selectedDayInvoices.length})
                      </p>
                      <Link
                        to="/invoices"
                        className="text-[10px] font-semibold text-amber-600 hover:underline"
                      >
                        All
                      </Link>
                    </div>

                    {selectedDayInvoices.length === 0 ? (
                      <p className="py-2 text-[11px] italic text-slate-400">
                        No payment deadlines.
                      </p>
                    ) : (
                      <div className="max-h-[240px] space-y-1.5 overflow-y-auto pr-0.5">
                        {selectedDayInvoices.map((inv) => {
                          const outstanding =
                            safeNum(inv.total_amount) - safeNum(inv.paid_amount);
                          return (
                            <div
                              key={inv.id}
                              className="rounded-lg border border-amber-200 bg-amber-50/60 p-2"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="truncate text-xs font-bold text-slate-900">
                                  #{safeStr(inv.invoice_no, 'INV')} —{' '}
                                  {safeStr(inv.customer?.name, 'Customer')}
                                </span>
                                <Badge
                                  variant="outline"
                                  className="shrink-0 rounded border border-amber-200 bg-amber-100 px-1.5 py-0.2 text-[9px] font-bold uppercase text-amber-800"
                                >
                                  {statusLabel(inv.payment_status)}
                                </Badge>
                              </div>
                              <p className="mt-1 flex justify-between text-[11px] text-slate-600">
                                <span>Amount due</span>
                                <span className="font-bold text-amber-700">
                                  ₹{formatINR(outstanding)}
                                </span>
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {totalDayEvents === 0 && (
                  <div className="py-6 text-center">
                    <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-slate-200/70">
                      <FiCalendar className="h-5 w-5 text-slate-400" />
                    </div>
                    <p className="mt-2 text-xs font-semibold text-slate-800">
                      Nothing scheduled
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      No events for this day.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </CalendarBoundary>
  );
};

export default CalendarPage;