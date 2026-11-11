// src/pages/Delivery/DeliveryCalendarPage.tsx
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
  FiRefreshCw,
  FiMapPin,
  FiAlertCircle,
  FiUser,
  FiFilter,
  FiPlus,
  FiX,
  FiEye,
  FiList,
  FiLoader,
  FiAlertTriangle,
} from 'react-icons/fi';
import deliveryService, {
  DeliveryOrder,
  DeliveryTrip,
} from '../../services/deliveryService';
import { usePermission } from '../../hooks/usePermission';
import { useAuthStore } from '../../store/auth';
import { useNotification } from '../../components/NotificationContext';

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

type ViewMode = 'month' | 'week' | 'day';
type TypeFilter = 'all' | 'orders' | 'trips';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TYPE_FILTER_OPTIONS: Array<{ value: TypeFilter; label: string }> = [
  { value: 'all', label: 'All events' },
  { value: 'orders', label: 'Orders only' },
  { value: 'trips', label: 'Trips only' },
];

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'delivery_pending', label: 'Pending schedule' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'vehicle_assigned', label: 'Vehicle assigned' },
  { value: 'loading_in_progress', label: 'Loading in progress' },
  { value: 'ready_for_dispatch', label: 'Ready for dispatch' },
  { value: 'dispatched', label: 'Dispatched / in transit' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'partially_delivered', label: 'Partially delivered' },
] as const;

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
 * Date helpers (timezone-safe)
 * ════════════════════════════════════════════════════════ */

const pad = (n: number): string => String(n).padStart(2, '0');

const formatLocalDate = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Parse YYYY-MM-DD as local date (avoids UTC shift). */
const parseLocalDate = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};

const isSameDate = (dateVal: unknown, targetDay: string): boolean => {
  if (dateVal == null) return false;
  return String(dateVal).slice(0, 10) === targetDay;
};

const todayLocal = (): string => formatLocalDate(new Date());

const statusLabel = (s?: string | null): string =>
  String(s ?? '').replace(/_/g, ' ') || 'unknown';

const safeStr = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v : v == null ? fallback : String(v);

const safeNum = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

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
    console.error('[DeliveryCalendarPage]', err);
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

const TripStatusPill = ({ status }: { status?: string | null }) => {
  const key = safeStr(status).toLowerCase();
  const cls = TRIP_STATUS_CLASSES[key] ?? DEFAULT_TRIP_STATUS_CLASS;
  return (
    <Badge
      variant="outline"
      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${cls}`}
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

const ModalShell = ({
  title,
  subtitle,
  icon,
  onClose,
  children,
  footer,
  maxWidth = 'max-w-lg',
}: {
  title: string;
  subtitle?: string;
  icon: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  maxWidth?: string;
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
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
            aria-label="Close modal"
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
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

export const DeliveryCalendarPage: React.FC = () => {
  const navigate = useNavigate();
  const { showError, showInfo } = useNotification();
  const { can, isSuperAdmin } = usePermission();
  const loadingUser = useAuthStore((s) => s.loadingUser);
  const hasUser = useAuthStore((s) => Boolean(s.user));

  /* ── Permissions ── */
  const canView = isSuperAdmin || can('view deliveries');

  /* ── State ── */
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [trips, setTrips] = useState<DeliveryTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string>(todayLocal());

  /* ── Views & filters ── */
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [townFilter, setTownFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState('all');

  /* ── Modals ── */
  const [selectedOrder, setSelectedOrder] = useState<DeliveryOrder | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<DeliveryTrip | null>(null);

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

  /* ── Derived date bounds for fetch (view-aware) ── */
  const fetchRange = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    if (viewMode === 'day') {
      // Fetch +/- 1 day buffer for navigation responsiveness
      const d = parseLocalDate(selectedDay);
      const start = new Date(d); start.setDate(d.getDate() - 1);
      const end = new Date(d); end.setDate(d.getDate() + 1);
      return { start: formatLocalDate(start), end: formatLocalDate(end) };
    }

    if (viewMode === 'week') {
      const c = new Date(currentDate);
      const dow = c.getDay();
      const sunday = new Date(c); sunday.setDate(c.getDate() - dow);
      const saturday = new Date(sunday); saturday.setDate(sunday.getDate() + 6);
      // pad for adjacent navigation
      const start = new Date(sunday); start.setDate(sunday.getDate() - 7);
      const end = new Date(saturday); end.setDate(saturday.getDate() + 7);
      return { start: formatLocalDate(start), end: formatLocalDate(end) };
    }

    // month view: full grid + adjacent days
    const firstGrid = new Date(year, month, 1 - 7);
    const lastGrid = new Date(year, month + 1, 7);
    return { start: formatLocalDate(firstGrid), end: formatLocalDate(lastGrid) };
  }, [currentDate, viewMode, selectedDay]);

  /* ══════════════════════════════════════════════════════
   * Fetch
   * ══════════════════════════════════════════════════════ */

  const fetchCalendarData = useCallback(async () => {
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
    } catch (err) {
      if (ctrl.signal.aborted) return;
      const msg = getApiErrorMessage(err, 'Could not load calendar data.');
      setError(msg);
      setOrders([]);
      setTrips([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [canView, fetchRange.start, fetchRange.end]);

  useEffect(() => {
    void fetchCalendarData();
  }, [fetchCalendarData]);

  /* ══════════════════════════════════════════════════════
   * Navigation
   * ══════════════════════════════════════════════════════ */

  const prevPeriod = useCallback(() => {
    if (viewMode === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    } else if (viewMode === 'week') {
      const d = new Date(currentDate); d.setDate(d.getDate() - 7);
      setCurrentDate(d);
    } else {
      const d = parseLocalDate(selectedDay);
      d.setDate(d.getDate() - 1);
      setCurrentDate(d);
      setSelectedDay(formatLocalDate(d));
    }
  }, [currentDate, viewMode, selectedDay]);

  const nextPeriod = useCallback(() => {
    if (viewMode === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    } else if (viewMode === 'week') {
      const d = new Date(currentDate); d.setDate(d.getDate() + 7);
      setCurrentDate(d);
    } else {
      const d = parseLocalDate(selectedDay);
      d.setDate(d.getDate() + 1);
      setCurrentDate(d);
      setSelectedDay(formatLocalDate(d));
    }
  }, [currentDate, viewMode, selectedDay]);

  const goToToday = useCallback(() => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDay(formatLocalDate(today));
  }, []);

  /* ── Shortcuts: Ctrl/Cmd + R refresh, Ctrl/Cmd + ←/→ navigate ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const key = e.key.toLowerCase();
      if (key === 'r') {
        e.preventDefault();
        void fetchCalendarData();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevPeriod();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextPeriod();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fetchCalendarData, prevPeriod, nextPeriod]);

  /* ══════════════════════════════════════════════════════
   * Derived data
   * ══════════════════════════════════════════════════════ */

  const distinctTowns = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) => { if (o.town) set.add(o.town.trim()); });
    return Array.from(set).sort();
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (typeFilter === 'trips') return false;
      if (
        townFilter !== 'all' &&
        safeStr(o.town).toLowerCase() !== townFilter.toLowerCase()
      ) return false;
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      return true;
    });
  }, [orders, typeFilter, townFilter, statusFilter]);

  const filteredTrips = useMemo(() => {
    return trips.filter((t) => {
      if (typeFilter === 'orders') return false;
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      return true;
    });
  }, [trips, typeFilter, statusFilter]);

  /* Group by day for fast lookups */
  const ordersByDay = useMemo(() => {
    const map = new Map<string, DeliveryOrder[]>();
    filteredOrders.forEach((o) => {
      const key = String(o.expected_delivery_date ?? '').slice(0, 10);
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    });
    return map;
  }, [filteredOrders]);

  const tripsByDay = useMemo(() => {
    const map = new Map<string, DeliveryTrip[]>();
    filteredTrips.forEach((t) => {
      const key = String(t.planned_date ?? '').slice(0, 10);
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });
    return map;
  }, [filteredTrips]);

  /* Calendar grid */
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });
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

  const weekDays = useMemo(() => {
    const curr = new Date(currentDate);
    const sun = new Date(curr);
    sun.setDate(curr.getDate() - curr.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sun);
      d.setDate(sun.getDate() + i);
      return formatLocalDate(d);
    });
  }, [currentDate]);

  const selectedDayOrders = useMemo(
    () => ordersByDay.get(selectedDay) ?? [],
    [ordersByDay, selectedDay]
  );
  const selectedDayTrips = useMemo(
    () => tripsByDay.get(selectedDay) ?? [],
    [tripsByDay, selectedDay]
  );

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
            You don't have permission to view the delivery calendar.
          </p>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════
   * Render
   * ══════════════════════════════════════════════════════ */

  const displayTitle =
    viewMode === 'day'
      ? parseLocalDate(selectedDay).toLocaleDateString('en-IN', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : viewMode === 'week'
        ? `${parseLocalDate(weekDays[0]).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })} — ${parseLocalDate(weekDays[6]).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}`
        : monthName;

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
                  <FiCalendar size={12} /> Logistics · Calendar
                </div>
                <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl xl:text-[30px]">
                  Delivery &amp; Trip Schedule
                </h1>
                <p className="mt-1.5 max-w-2xl text-xs text-slate-300 sm:text-sm">
                  Interactive view of customer deliveries and carrier trips across any date.
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
            <CardContent className="flex flex-col gap-3 p-3 sm:p-4">
              <div className="flex flex-wrap items-center gap-2">
                {/* View switcher */}
                <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                  {(['month', 'week', 'day'] as const).map((m) => {
                    const active = viewMode === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setViewMode(m)}
                        className={`rounded-md px-2.5 py-1 text-xs font-semibold capitalize transition ${
                          active
                            ? 'bg-white text-indigo-600 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {m}
                      </button>
                    );
                  })}
                </div>

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
                    onClick={prevPeriod}
                    title="Previous (Ctrl+←)"
                    aria-label="Previous period"
                    className="p-1.5 text-slate-600 transition hover:bg-slate-100"
                  >
                    <FiChevronLeft size={16} />
                  </button>
                  <span className="min-w-[130px] px-3 text-center text-xs font-bold text-slate-800">
                    {displayTitle}
                  </span>
                  <button
                    type="button"
                    onClick={nextPeriod}
                    title="Next (Ctrl+→)"
                    aria-label="Next period"
                    className="p-1.5 text-slate-600 transition hover:bg-slate-100"
                  >
                    <FiChevronRight size={16} />
                  </button>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void fetchCalendarData()}
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
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                  <FiFilter size={12} /> Filters:
                </span>
                <select
                  aria-label="Event type filter"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                >
                  {TYPE_FILTER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <select
                  aria-label="Town filter"
                  value={townFilter}
                  onChange={(e) => setTownFilter(e.target.value)}
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="all">All towns</option>
                  {distinctTowns.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <select
                  aria-label="Status filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                >
                  {STATUS_FILTER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-indigo-500" /> Carrier trip
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" /> Normal delivery
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" /> High priority
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-500" /> Urgent
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Error */}
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
                onClick={() => void fetchCalendarData()}
                className="w-full shrink-0 rounded-xl border-rose-300 bg-white text-xs font-semibold text-rose-700 hover:bg-rose-50 sm:w-auto"
              >
                Retry
              </Button>
            </div>
          )}

          {/* ════════ Grid + Sidebar ════════ */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4 lg:gap-6">
            {/* Grid */}
            <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:col-span-3">
              {/* Weekday header */}
              <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/70 py-2.5 text-center text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:text-[11px]">
                {WEEKDAY_LABELS.map((d) => <span key={d}>{d}</span>)}
              </div>

              {loading ? (
                <div className="flex justify-center py-24">
                  <FiLoader className="animate-spin text-indigo-500" size={28} />
                </div>
              ) : (
                <>
                  {/* MONTH VIEW — mobile: horizontal scroll, desktop: 7 cols */}
                  {viewMode === 'month' && (
                    <div className="overflow-x-auto">
                      <div className="min-w-[640px] sm:min-w-0">
                        <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-slate-100">
                          {calendarDays.map((dayStr, idx) => {
                            if (!dayStr) {
                              return (
                                <div key={`empty-${idx}`} className="min-h-[100px] bg-slate-50/40" />
                              );
                            }

                            const dayOrders = ordersByDay.get(dayStr) ?? [];
                            const dayTrips = tripsByDay.get(dayStr) ?? [];
                            const isSelected = selectedDay === dayStr;
                            const isToday = todayStr === dayStr;
                            const dayNum = parseInt(dayStr.slice(-2), 10);
                            const visibleOrders = dayOrders.slice(0, 2);
                            const moreOrders = dayOrders.length - visibleOrders.length;
                            const visibleTrips = dayTrips.slice(0, 1);
                            const moreTrips = dayTrips.length - visibleTrips.length;

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
                                  {(dayOrders.length > 0 || dayTrips.length > 0) && (
                                    <div className="flex items-center gap-0.5 text-[9px] font-semibold">
                                      {dayTrips.length > 0 && (
                                        <span className="rounded bg-indigo-100 px-1 text-indigo-700">
                                          {dayTrips.length}T
                                        </span>
                                      )}
                                      {dayOrders.length > 0 && (
                                        <span className="rounded bg-emerald-100 px-1 text-emerald-700">
                                          {dayOrders.length}O
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>

                                <div className="max-h-[70px] space-y-0.5 overflow-y-auto">
                                  {visibleTrips.map((t) => (
                                    <span
                                      key={`trip-${t.id}`}
                                      onClick={(e) => { e.stopPropagation(); setSelectedTrip(t); }}
                                      className="flex items-center gap-1 truncate rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-800 transition hover:brightness-95"
                                      title={`${safeStr(t.trip_code)} • ${safeStr(t.vehicle?.name, 'Carrier')} (${safeNum(t.total_customers)} stops)`}
                                    >
                                      <FiTruck className="shrink-0" size={10} />
                                      <span className="truncate">{safeStr(t.trip_code, 'Trip')}</span>
                                    </span>
                                  ))}
                                  {moreTrips > 0 && (
                                    <span className="block px-1 text-[9px] font-semibold text-indigo-500">
                                      +{moreTrips} trip{moreTrips === 1 ? '' : 's'}
                                    </span>
                                  )}

                                  {visibleOrders.map((o) => {
                                    const priority = safeStr(o.priority, 'normal').toLowerCase();
                                    const cls =
                                      priority === 'urgent'
                                        ? 'bg-rose-100 text-rose-800'
                                        : priority === 'high'
                                          ? 'bg-amber-100 text-amber-800'
                                          : 'bg-emerald-50 text-emerald-800';
                                    return (
                                      <span
                                        key={`order-${o.id}`}
                                        onClick={(e) => { e.stopPropagation(); setSelectedOrder(o); }}
                                        className={`flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-[10px] font-medium transition hover:brightness-95 ${cls}`}
                                        title={`${safeStr(o.recipient_name)} (${safeStr(o.town, 'Local')})`}
                                      >
                                        <FiPackage className="shrink-0" size={10} />
                                        <span className="truncate">{safeStr(o.recipient_name, 'Order')}</span>
                                      </span>
                                    );
                                  })}
                                  {moreOrders > 0 && (
                                    <span className="block px-1 text-[9px] font-semibold text-slate-500">
                                      +{moreOrders} more order{moreOrders === 1 ? '' : 's'}
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

                  {/* WEEK VIEW */}
                  {viewMode === 'week' && (
                    <div className="overflow-x-auto">
                      <div className="grid min-w-[700px] grid-cols-7 auto-rows-fr divide-x divide-slate-100 sm:min-w-0">
                        {weekDays.map((dayStr) => {
                          const dayOrders = ordersByDay.get(dayStr) ?? [];
                          const dayTrips = tripsByDay.get(dayStr) ?? [];
                          const isSelected = selectedDay === dayStr;
                          const isToday = todayStr === dayStr;
                          const dateObj = parseLocalDate(dayStr);

                          return (
                            <button
                              type="button"
                              key={dayStr}
                              onClick={() => setSelectedDay(dayStr)}
                              className={`flex flex-col items-stretch gap-2 p-2 text-left transition ${
                                isSelected
                                  ? 'bg-indigo-50/80 ring-2 ring-inset ring-indigo-500'
                                  : 'hover:bg-slate-50/80'
                              }`}
                            >
                              <div className="border-b border-slate-100 pb-2 text-center">
                                <p className="text-[10px] font-bold uppercase text-slate-400">
                                  {dateObj.toLocaleDateString('en-IN', { weekday: 'short' })}
                                </p>
                                <p
                                  className={`mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-extrabold ${
                                    isToday
                                      ? 'bg-indigo-600 text-white'
                                      : isSelected
                                        ? 'bg-indigo-100 text-indigo-700'
                                        : 'text-slate-800'
                                  }`}
                                >
                                  {dateObj.getDate()}
                                </p>
                              </div>

                              <div className="max-h-[280px] space-y-1 overflow-y-auto">
                                {dayTrips.map((t) => (
                                  <div
                                    key={`wt-${t.id}`}
                                    onClick={(e) => { e.stopPropagation(); setSelectedTrip(t); }}
                                    className="rounded bg-indigo-100 p-1.5 text-[11px] font-semibold text-indigo-900 transition hover:brightness-95"
                                  >
                                    <div className="flex items-center gap-1">
                                      <FiTruck className="text-indigo-600" size={11} />
                                      <span className="truncate">{safeStr(t.trip_code, 'Trip')}</span>
                                    </div>
                                    <p className="mt-0.5 truncate text-[10px] font-normal text-indigo-700">
                                      {safeStr(t.vehicle?.name, 'Carrier')}
                                    </p>
                                  </div>
                                ))}
                                {dayOrders.map((o) => (
                                  <div
                                    key={`wo-${o.id}`}
                                    onClick={(e) => { e.stopPropagation(); setSelectedOrder(o); }}
                                    className="rounded border border-emerald-200 bg-emerald-50 p-1.5 text-[11px] text-emerald-900 transition hover:brightness-95"
                                  >
                                    <p className="truncate font-semibold">{safeStr(o.recipient_name, 'Order')}</p>
                                    <p className="truncate text-[10px] text-emerald-700">
                                      {safeStr(o.town, 'Local')}
                                    </p>
                                  </div>
                                ))}
                                {dayTrips.length === 0 && dayOrders.length === 0 && (
                                  <p className="py-4 text-center text-[10px] italic text-slate-400">
                                    No events
                                  </p>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* DAY VIEW */}
                  {viewMode === 'day' && (
                    <div className="space-y-4 p-3 sm:p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                        <h3 className="text-sm font-bold text-slate-900">
                          {parseLocalDate(selectedDay).toLocaleDateString('en-IN', {
                            weekday: 'long',
                            month: 'long',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </h3>
                        <div className="flex items-center gap-2 text-xs">
                          <Badge
                            variant="outline"
                            className="rounded-full border border-indigo-200/70 bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700"
                          >
                            {selectedDayTrips.length} trip{selectedDayTrips.length === 1 ? '' : 's'}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="rounded-full border border-emerald-200/70 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700"
                          >
                            {selectedDayOrders.length} order{selectedDayOrders.length === 1 ? '' : 's'}
                          </Badge>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-indigo-600">
                            <FiTruck size={12} /> Carrier trips
                          </h4>
                          {selectedDayTrips.length === 0 ? (
                            <p className="rounded-lg bg-slate-50 p-4 text-xs italic text-slate-400">
                              No trips scheduled for this day.
                            </p>
                          ) : (
                            selectedDayTrips.map((t) => (
                              <button
                                type="button"
                                key={`dt-${t.id}`}
                                onClick={() => setSelectedTrip(t)}
                                className="w-full rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 text-left transition hover:border-indigo-300 hover:shadow-sm"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="truncate text-sm font-bold text-indigo-900">
                                    {safeStr(t.trip_code, 'Trip')}
                                  </span>
                                  <TripStatusPill status={t.status} />
                                </div>
                                <p className="mt-1 flex items-center gap-1 text-xs text-slate-700">
                                  <FiTruck className="text-slate-400" size={11} />
                                  {safeStr(t.vehicle?.name, 'Carrier')} ({safeStr(t.vehicle?.registration_number, 'N/A')})
                                </p>
                                <p className="mt-1 flex justify-between text-xs text-slate-500">
                                  <span>Driver: {safeStr(t.driver?.name, 'Unassigned')}</span>
                                  <span>{safeNum(t.total_customers)} stops</span>
                                </p>
                              </button>
                            ))
                          )}
                        </div>

                        <div className="space-y-2">
                          <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-600">
                            <FiPackage size={12} /> Customer deliveries
                          </h4>
                          {selectedDayOrders.length === 0 ? (
                            <p className="rounded-lg bg-slate-50 p-4 text-xs italic text-slate-400">
                              No deliveries scheduled for this day.
                            </p>
                          ) : (
                            <div className="max-h-[420px] space-y-2 overflow-y-auto">
                              {selectedDayOrders.map((o) => (
                                <button
                                  type="button"
                                  key={`do-${o.id}`}
                                  onClick={() => setSelectedOrder(o)}
                                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-slate-300 hover:shadow-sm"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <span className="truncate text-sm font-bold text-slate-900">
                                      {safeStr(o.recipient_name, 'Order')}
                                    </span>
                                    <PriorityPill priority={o.priority} />
                                  </div>
                                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-600">
                                    <FiMapPin className="text-slate-400" size={11} />
                                    {safeStr(o.town, 'Local')}, {safeStr(o.district, '—')}
                                  </p>
                                  <p className="mt-1 flex justify-between border-t border-slate-200/60 pt-1 text-xs text-slate-500">
                                    <span>Order #{safeStr((o as any).delivery_order_no, String(o.id))}</span>
                                    <span className="font-semibold text-slate-700">
                                      {safeNum(o.total_quantity)} pcs
                                    </span>
                                  </p>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </Card>

            {/* Sidebar agenda */}
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
                    {selectedDayOrders.length + selectedDayTrips.length} events
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-3 p-3">
                {/* Trips */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-indigo-600">
                      <FiTruck size={11} /> Trips ({selectedDayTrips.length})
                    </p>
                    <Link
                      to="/deliveries/trips"
                      className="text-[10px] font-semibold text-indigo-600 hover:underline"
                    >
                      + New
                    </Link>
                  </div>

                  {selectedDayTrips.length === 0 ? (
                    <p className="py-2 text-[11px] italic text-slate-400">
                      No trips scheduled.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {selectedDayTrips.map((t) => (
                        <button
                          type="button"
                          key={`sg-t-${t.id}`}
                          onClick={() => setSelectedTrip(t)}
                          className="w-full rounded-lg border border-indigo-200 bg-indigo-50/60 p-2 text-left transition hover:border-indigo-300"
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
                              {safeStr(t.vehicle?.name, 'Carrier')} ({safeStr(t.vehicle?.registration_number, 'N/A')})
                            </span>
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Orders */}
                <div className="border-t border-slate-100 pt-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-emerald-600">
                      <FiPackage size={11} /> Deliveries ({selectedDayOrders.length})
                    </p>
                    <Link
                      to="/deliveries/orders"
                      className="text-[10px] font-semibold text-emerald-600 hover:underline"
                    >
                      + Add
                    </Link>
                  </div>

                  {selectedDayOrders.length === 0 ? (
                    <p className="py-2 text-[11px] italic text-slate-400">
                      No deliveries scheduled.
                    </p>
                  ) : (
                    <div className="max-h-[280px] space-y-1.5 overflow-y-auto pr-0.5">
                      {selectedDayOrders.map((o) => (
                        <button
                          type="button"
                          key={`sg-o-${o.id}`}
                          onClick={() => setSelectedOrder(o)}
                          className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-left transition hover:border-slate-300"
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
                              {safeStr(o.town, 'Local')}, {safeStr(o.district, '—')}
                            </span>
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* ════════ Order Detail Modal ════════ */}
      {selectedOrder && (
        <ModalShell
          title={`Order #${safeStr((selectedOrder as any).delivery_order_no, String(selectedOrder.id))}`}
          subtitle={safeStr(selectedOrder.recipient_name, '—')}
          icon={<FiPackage size={18} />}
          onClose={() => setSelectedOrder(null)}
          footer={
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelectedOrder(null)}
                className="rounded-xl"
              >
                Close
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setSelectedOrder(null);
                  navigate('/deliveries/orders');
                }}
                className="rounded-xl bg-indigo-600 font-semibold hover:bg-indigo-700"
              >
                <FiEye className="mr-1.5" size={13} /> View in deliveries
              </Button>
            </div>
          }
        >
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-slate-50 p-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Expected date
                </p>
                <p className="mt-0.5 font-bold text-slate-800">
                  {safeStr(selectedOrder.expected_delivery_date, '—')}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Status / priority
                </p>
                <p className="mt-0.5 font-bold uppercase text-indigo-700">
                  {statusLabel(selectedOrder.status)} · {safeStr(selectedOrder.priority, 'normal')}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Contact
                </p>
                <p className="mt-0.5 font-bold text-slate-800">
                  {safeStr(selectedOrder.recipient_phone, '—')}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Destination
                </p>
                <p className="mt-0.5 font-bold text-slate-800">
                  {safeStr(selectedOrder.town, 'Local')}, {safeStr(selectedOrder.district, '—')}
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Delivery address
              </p>
              <p className="mt-1 font-medium text-slate-800">
                {safeStr(selectedOrder.delivery_address, 'Address on file')}
              </p>
            </div>

            {(selectedOrder as any).current_trip && (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-800">
                  Assigned carrier trip
                </p>
                <p className="mt-1 font-mono font-bold text-indigo-900">
                  {safeStr((selectedOrder as any).current_trip.trip_code, '—')}
                </p>
                <p className="text-[11px] text-slate-600">
                  Vehicle: {safeStr((selectedOrder as any).current_trip.vehicle?.name, 'Carrier')}
                </p>
              </div>
            )}
          </div>
        </ModalShell>
      )}

      {/* ════════ Trip Detail Modal ════════ */}
      {selectedTrip && (
        <ModalShell
          title={`Trip #${safeStr(selectedTrip.trip_code, '—')}`}
          subtitle={selectedTrip.planned_date ? `Planned ${selectedTrip.planned_date}` : undefined}
          icon={<FiTruck size={18} />}
          onClose={() => setSelectedTrip(null)}
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelectedTrip(null)}
                className="rounded-xl"
              >
                Close
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setSelectedTrip(null);
                  navigate('/deliveries/loading');
                }}
                className="rounded-xl bg-indigo-600 font-semibold hover:bg-indigo-700"
              >
                <FiList className="mr-1.5" size={13} /> Checklist
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setSelectedTrip(null);
                  navigate('/deliveries/routes');
                }}
                className="rounded-xl bg-blue-600 font-semibold text-white hover:bg-blue-700"
              >
                <FiMapPin className="mr-1.5" size={13} /> Route
              </Button>
            </div>
          }
        >
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-slate-50 p-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Planned date
                </p>
                <p className="mt-0.5 font-bold text-slate-800">{safeStr(selectedTrip.planned_date, '—')}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Status
                </p>
                <p className="mt-0.5"><TripStatusPill status={selectedTrip.status} /></p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Vehicle
                </p>
                <p className="mt-0.5 font-bold text-slate-800">
                  {safeStr(selectedTrip.vehicle?.name, 'Carrier')} ({safeStr(selectedTrip.vehicle?.registration_number, 'N/A')})
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Driver
                </p>
                <p className="mt-0.5 font-bold text-slate-800">
                  {safeStr(selectedTrip.driver?.name, 'Unassigned')}
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-indigo-50/60 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-800">
                Delivery scope
              </p>
              <p className="mt-1 text-slate-700">
                {safeNum(selectedTrip.total_customers)} customer orders ·{' '}
                {safeNum(selectedTrip.total_quantity)} units
              </p>
            </div>
          </div>
        </ModalShell>
      )}
    </CalendarBoundary>
  );
};

export default DeliveryCalendarPage;