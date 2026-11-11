// src/pages/Delivery/TripManagementPage.tsx
import React, {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  FiNavigation,
  FiTruck,
  FiCalendar,
  FiCheckCircle,
  FiPlay,
  FiEye,
  FiDollarSign,
  FiAlertTriangle,
  FiUser,
  FiRefreshCw,
  FiLoader,
  FiX,
  FiChevronLeft,
  FiChevronRight,
  FiMapPin,
  FiPackage,
  FiSearch,
} from 'react-icons/fi';
import deliveryService, { DeliveryTrip, DeliveryVehicle, DeliveryDriver } from '../../services/deliveryService';
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
 * Constants
 * ════════════════════════════════════════════════════════ */

function useDebouncedValue<T>(value: T, delay: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return v;
}

const PAGE_SIZE = 15;

const QUICK_TRIP_DATES = [
  { value: '', label: 'All dates' },
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'this_week', label: 'This week' },
  { value: 'custom', label: 'Custom range…' },
];

const TRIP_STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All trips' },
  { value: 'vehicle_assigned', label: 'Vehicle assigned' },
  { value: 'loading_pending', label: 'Loading pending' },
  { value: 'loading_in_progress', label: 'Loading' },
  { value: 'ready_for_dispatch', label: 'Ready' },
  { value: 'in_transit', label: 'On road' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_BADGES: Record<string, string> = {
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
const DEFAULT_STATUS_CLASS = 'border-amber-200/70 bg-amber-50 text-amber-700';

const LIMITS = {
  odometerMax: 100_000_000,
  remarksMax: 1000,
} as const;

/* ══════════════════════════════════════════════════════════
 * Helpers
 * ════════════════════════════════════════════════════════ */

const safeNum = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const safeStr = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v : v == null ? fallback : String(v);

const clampStr = (v: unknown, max: number): string => String(v ?? '').slice(0, max);

const formatINR = (v: unknown, decimals = 2): string => {
  const n = safeNum(v);
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: 2,
  });
};

const formatDate = (v: unknown): string => {
  if (!v) return '—';
  const s = String(v).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || '—';
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return s;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
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
    if (status === 404) return 'Trip not found.';
    if (status === 422 && msg) return msg;
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
class TripsBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { hasError: false };
  static getDerivedStateFromError(err: unknown): BoundaryState {
    return {
      hasError: true,
      message: err instanceof Error ? err.message : 'Unexpected error.',
    };
  }
  componentDidCatch(err: unknown) {
    // eslint-disable-next-line no-console
    console.error('[TripManagementPage]', err);
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
              {this.state.message || 'Unable to render trips.'}
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
 * Modal shell (shared by dispatch/close dialogs)
 * ════════════════════════════════════════════════════════ */

const ModalShell = ({
  title,
  subtitle,
  icon,
  onClose,
  children,
  footer,
  maxWidth = 'max-w-md',
  closeDisabled = false,
}: {
  title: string;
  subtitle?: string;
  icon: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  maxWidth?: string;
  closeDisabled?: boolean;
}) => {
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
            aria-label="Close modal"
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
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

export const TripManagementPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { showError, showSuccess } = useNotification();
  const { can, isSuperAdmin } = usePermission();
  const loadingUser = useAuthStore((s) => s.loadingUser);
  const hasUser = useAuthStore((s) => Boolean(s.user));

  /* ── Permissions ── */
  const canView = isSuperAdmin || can('view deliveries');
  const canDispatch = isSuperAdmin || can('edit deliveries') || can('dispatch trips');
  const canClose = isSuperAdmin || can('edit deliveries') || can('close trips');

  /* ── List state ── */
  const [trips, setTrips] = useState<DeliveryTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  /* ── Extra Filters ── */
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [vehicleFilter, setVehicleFilter] = useState('');
  const [driverFilter, setDriverFilter] = useState('');
  const [quickDateFilter, setQuickDateFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [vehiclesList, setVehiclesList] = useState<DeliveryVehicle[]>([]);
  const [driversList, setDriversList] = useState<DeliveryDriver[]>([]);

  useEffect(() => {
    deliveryService.getVehicles().then((res: any) => {
      const list = Array.isArray(res?.data?.data) ? res.data.data : Array.isArray(res?.data) ? res.data : [];
      setVehiclesList(list);
    }).catch(() => {});
    deliveryService.getDrivers().then((res: any) => {
      const list = Array.isArray(res?.data?.data) ? res.data.data : Array.isArray(res?.data) ? res.data : [];
      setDriversList(list);
    }).catch(() => {});
  }, []);

  const hasActiveFilters = Boolean(
    search.trim() ||
    statusFilter ||
    vehicleFilter ||
    driverFilter ||
    quickDateFilter ||
    dateFrom ||
    dateTo
  );

  const resetAllFilters = () => {
    setSearch('');
    setStatusFilter('');
    setVehicleFilter('');
    setDriverFilter('');
    setQuickDateFilter('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  /* ── Trip detail modal ── */
  const [activeTrip, setActiveTrip] = useState<DeliveryTrip | null>(null);
  const [tripModalOpen, setTripModalOpen] = useState(false);
  const [tripLoading, setTripLoading] = useState(false);
  const [tripError, setTripError] = useState<string | null>(null);

  /* ── Action modals ── */
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [odometer, setOdometer] = useState('');
  const [remarks, setRemarks] = useState('');
  const [forceClose, setForceClose] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState(false);

  /* ── Refs ── */
  const listAbortRef = useRef<AbortController | null>(null);
  const detailAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      listAbortRef.current?.abort();
      detailAbortRef.current?.abort();
    };
  }, []);

  /* ══════════════════════════════════════════════════════
   * Fetch list
   * ══════════════════════════════════════════════════════ */

  const fetchTrips = useCallback(async () => {
    if (!canView) return;
    listAbortRef.current?.abort();
    const ctrl = new AbortController();
    listAbortRef.current = ctrl;

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

      const res = await deliveryService.getTrips({
        page,
        per_page: PAGE_SIZE,
        status: statusFilter || undefined,
        search: debouncedSearch.trim() || undefined,
        vehicle_id: vehicleFilter || undefined,
        driver_id: driverFilter || undefined,
        date_from: resolvedDateFrom || undefined,
        date_to: resolvedDateTo || undefined,
      });
      if (ctrl.signal.aborted || !mountedRef.current) return;
      const list: DeliveryTrip[] = Array.isArray((res as any)?.data?.data)
        ? (res as any).data.data
        : [];
      setTrips(list);
      setTotal(safeNum((res as any)?.data?.total));
    } catch (err) {
      if (ctrl.signal.aborted) return;
      const msg = getApiErrorMessage(err, 'Could not load trips.');
      setError(msg);
      setTrips([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [canView, page, statusFilter, debouncedSearch, vehicleFilter, driverFilter, quickDateFilter, dateFrom, dateTo]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, vehicleFilter, driverFilter, quickDateFilter, dateFrom, dateTo]);

  useEffect(() => {
    void fetchTrips();
  }, [fetchTrips]);

  /* ══════════════════════════════════════════════════════
   * Fetch single trip
   * ══════════════════════════════════════════════════════ */

  const openTripModal = useCallback(async (tripId: number) => {
    detailAbortRef.current?.abort();
    const ctrl = new AbortController();
    detailAbortRef.current = ctrl;

    setTripModalOpen(true);
    setTripLoading(true);
    setTripError(null);
    try {
      const res = await deliveryService.getTrip(tripId);
      if (ctrl.signal.aborted || !mountedRef.current) return;
      setActiveTrip(((res as any)?.data as DeliveryTrip) ?? null);
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setTripError(getApiErrorMessage(err, 'Could not load trip details.'));
      setActiveTrip(null);
    } finally {
      if (mountedRef.current) setTripLoading(false);
    }
  }, []);

  const closeTripModal = useCallback(() => {
    setTripModalOpen(false);
    setActiveTrip(null);
    setTripError(null);
    /* Clear ?id= from URL */
    const params = new URLSearchParams(searchParams);
    if (params.has('id')) {
      params.delete('id');
      setSearchParams(params, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  /* ── Auto-open from URL param `?id=` ── */
  useEffect(() => {
    const idStr = searchParams.get('id');
    if (!idStr) return;
    const id = Number(idStr);
    if (!Number.isFinite(id) || id <= 0) return;
    if (activeTrip?.id === id) return;
    void openTripModal(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  /* ── Shortcuts ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta || e.key.toLowerCase() !== 'r') return;
      e.preventDefault();
      void fetchTrips();
      if (activeTrip) void openTripModal(activeTrip.id);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fetchTrips, openTripModal, activeTrip]);

  /* ══════════════════════════════════════════════════════
   * Action modals
   * ══════════════════════════════════════════════════════ */

  const openDispatchModal = useCallback(() => {
    if (!canDispatch) {
      showError('Permission denied', 'You do not have permission to dispatch trips.');
      return;
    }
    setOdometer('');
    setRemarks('');
    setForceClose(false);
    setFieldErrors({});
    setDispatchOpen(true);
  }, [canDispatch, showError]);

  const openCloseModal = useCallback(() => {
    if (!canClose) {
      showError('Permission denied', 'You do not have permission to close trips.');
      return;
    }
    setOdometer('');
    setRemarks('');
    setForceClose(false);
    setFieldErrors({});
    setCloseOpen(true);
  }, [canClose, showError]);

  const validateOdometer = useCallback((value: string, required: boolean): number | null => {
    if (!value.trim()) {
      if (required) {
        setFieldErrors((p) => ({ ...p, odometer: 'Odometer reading is required.' }));
        return null;
      }
      return 0;
    }
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      setFieldErrors((p) => ({ ...p, odometer: 'Odometer must be a non-negative number.' }));
      return null;
    }
    if (n > LIMITS.odometerMax) {
      setFieldErrors((p) => ({ ...p, odometer: 'Odometer value looks unrealistic.' }));
      return null;
    }
    return n;
  }, []);

  const handleDispatch = useCallback(async () => {
    if (!activeTrip || !canDispatch) return;
    setFieldErrors({});

    const startReading = validateOdometer(odometer, false);
    if (startReading === null) return;

    if (!window.confirm(
      `Dispatch trip #${activeTrip.trip_code}?\n\n` +
        `Vehicle: ${safeStr(activeTrip.vehicle?.name, 'Unassigned')}\n` +
        `Driver: ${safeStr(activeTrip.driver?.name, 'Unassigned')}\n\n` +
        `Once dispatched, changes cannot be undone.`
    )) return;

    setActionLoading(true);
    try {
      await deliveryService.dispatchTrip(activeTrip.id, {
        odometer_start: startReading > 0 ? startReading : undefined,
        remarks: remarks.trim(),
      });
      setDispatchOpen(false);
      showSuccess('Dispatched', `Trip #${activeTrip.trip_code} is on road.`);
      await Promise.all([openTripModal(activeTrip.id), fetchTrips()]);
    } catch (err) {
      showError('Dispatch failed', getApiErrorMessage(err, 'Could not dispatch trip.'));
    } finally {
      if (mountedRef.current) setActionLoading(false);
    }
  }, [
    activeTrip,
    canDispatch,
    odometer,
    remarks,
    validateOdometer,
    openTripModal,
    fetchTrips,
    showSuccess,
    showError,
  ]);

  const handleCloseTrip = useCallback(async () => {
    if (!activeTrip || !canClose) return;
    setFieldErrors({});

    const endReading = validateOdometer(odometer, false);
    if (endReading === null) return;

    const pendingStops = (activeTrip.stops ?? []).filter(
      (s: any) => !['delivered', 'delivery_failed', 'cancelled'].includes(s?.status)
    ).length;
    if (pendingStops > 0 && !forceClose) {
      setFieldErrors((p) => ({
        ...p,
        forceClose: `${pendingStops} stop${pendingStops === 1 ? '' : 's'} still pending. Check "Force close" to proceed.`,
      }));
      return;
    }

    if (!window.confirm(
      `Close trip #${activeTrip.trip_code}?\n\n` +
        (pendingStops > 0 ? `${pendingStops} stop${pendingStops === 1 ? '' : 's'} will be force-closed.\n\n` : '') +
        `Vehicle will be released back to the fleet.`
    )) return;

    setActionLoading(true);
    try {
      await deliveryService.closeTrip(activeTrip.id, {
        odometer_end: endReading > 0 ? endReading : undefined,
        force_close: forceClose,
        remarks: remarks.trim(),
      });
      setCloseOpen(false);
      showSuccess('Trip closed', `Trip #${activeTrip.trip_code} closed and fleet released.`);
      await Promise.all([openTripModal(activeTrip.id), fetchTrips()]);
    } catch (err) {
      showError('Close failed', getApiErrorMessage(err, 'Could not close trip.'));
    } finally {
      if (mountedRef.current) setActionLoading(false);
    }
  }, [
    activeTrip,
    canClose,
    odometer,
    remarks,
    forceClose,
    validateOdometer,
    openTripModal,
    fetchTrips,
    showSuccess,
    showError,
  ]);

  /* ══════════════════════════════════════════════════════
   * Derived
   * ══════════════════════════════════════════════════════ */

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const pendingStopsCount = useMemo(() => {
    if (!activeTrip?.stops) return 0;
    return activeTrip.stops.filter(
      (s: any) => !['delivered', 'delivery_failed', 'cancelled'].includes(s?.status)
    ).length;
  }, [activeTrip]);

  /* ══════════════════════════════════════════════════════
   * Access guard
   * ══════════════════════════════════════════════════════ */

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
            You don't have permission to view trips.
          </p>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════
   * Render
   * ══════════════════════════════════════════════════════ */

  return (
    <TripsBoundary>
      <div className="min-h-full bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100/60">
        <div className="mx-auto w-full max-w-[1500px] space-y-4 p-3 sm:space-y-5 sm:p-4 lg:p-5 xl:p-6">

          {/* ════════ Hero ════════ */}
          <section className="relative overflow-hidden rounded-2xl border border-slate-800/10 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-4 py-5 shadow-[0_20px_40px_-20px_rgba(15,23,42,0.45)] sm:px-6 sm:py-6 lg:px-7">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />
            <div className="relative flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200 backdrop-blur">
                  <FiNavigation size={12} /> Logistics · Trips
                </div>
                <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl xl:text-[30px]">
                  Carrier Trip &amp; Dispatch
                </h1>
                <p className="mt-1.5 max-w-2xl text-xs text-slate-300 sm:text-sm">
                  Track multi-customer trips, dispatch on road, record odometer, and close fleet trips.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void fetchTrips();
                    if (activeTrip) void openTripModal(activeTrip.id);
                  }}
                  disabled={loading || tripLoading}
                  title="Refresh (Ctrl+R)"
                  className="h-10 rounded-xl border-white/10 bg-white/5 text-white shadow-none backdrop-blur transition hover:border-white/20 hover:bg-white/10 hover:text-white disabled:opacity-50"
                >
                  {loading ? (
                    <FiLoader className="mr-2 animate-spin" size={14} />
                  ) : (
                    <FiRefreshCw className="mr-2" size={14} />
                  )}
                  Refresh
                </Button>
                <Link
                  to="/deliveries/routes"
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-b from-cyan-300 to-cyan-400 px-4 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:from-cyan-200 hover:to-cyan-300"
                >
                  <FiNavigation size={14} /> Plan trip
                </Link>
              </div>
            </div>
          </section>

          {/* ════════ Error ════════ */}
          {error && (
            <div role="alert" className="flex flex-col gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-rose-700 sm:flex-row sm:items-start sm:gap-3 sm:p-4">
              <div className="flex items-start gap-2 sm:flex-1">
                <FiAlertTriangle className="mt-0.5 shrink-0" size={18} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Could not load trips</p>
                  <p className="text-xs sm:text-sm">{error}</p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => void fetchTrips()}
                className="w-full shrink-0 rounded-xl border-rose-300 bg-white text-xs font-semibold text-rose-700 hover:bg-rose-50 sm:w-auto"
              >
                Retry
              </Button>
            </div>
          )}

          {/* ════════ Filters Card ════════ */}
          <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <CardContent className="space-y-3 p-3 sm:p-4">
              {/* Row 1: Search + Quick Reset */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <FiSearch className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value.slice(0, 100))}
                    placeholder="Search trip code, vehicle, driver, customer stop, notes…"
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-10 text-sm text-slate-800 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
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

              {/* Row 2: Dropdowns */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {/* Vehicle Filter */}
                <select
                  aria-label="Filter by vehicle"
                  value={vehicleFilter}
                  onChange={(e) => setVehicleFilter(e.target.value)}
                  className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 sm:text-xs"
                >
                  <option value="">All carrier vehicles</option>
                  {vehiclesList.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.registration_number})
                    </option>
                  ))}
                </select>

                {/* Driver Filter */}
                <select
                  aria-label="Filter by driver"
                  value={driverFilter}
                  onChange={(e) => setDriverFilter(e.target.value)}
                  className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 sm:text-xs"
                >
                  <option value="">All carrier drivers</option>
                  {driversList.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} {d.contact_number ? `(${d.contact_number})` : ''}
                    </option>
                  ))}
                </select>

                {/* Quick Date Filter */}
                <select
                  aria-label="Filter by planned date"
                  value={quickDateFilter}
                  onChange={(e) => setQuickDateFilter(e.target.value)}
                  className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 sm:text-xs"
                >
                  {QUICK_TRIP_DATES.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>

              {/* Custom Date Range Picker */}
              {quickDateFilter === 'custom' && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50/80 p-2.5 text-xs text-slate-600">
                  <span className="font-semibold text-slate-700">Planned Date Range:</span>
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

              {/* Status pills row */}
              <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2.5">
                {TRIP_STATUS_FILTERS.map((f) => {
                  const active = statusFilter === f.value;
                  return (
                    <button
                      key={f.value || 'all'}
                      type="button"
                      onClick={() => { setStatusFilter(f.value); setPage(1); }}
                      className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        active
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* ════════ Trips Card ════════ */}
          <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-slate-100 bg-white px-3 py-3 sm:px-5 sm:py-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                  <FiTruck size={14} />
                </div>
                <div className="min-w-0">
                  <CardTitle className="truncate text-xs font-semibold text-slate-800 sm:text-sm">
                    Carrier trips
                  </CardTitle>
                  <CardDescription className="truncate text-[10px] text-slate-500 sm:text-[11px]">
                    {loading
                      ? 'Loading…'
                      : `${total.toLocaleString('en-IN')} trip${total === 1 ? '' : 's'} • Page ${page} of ${totalPages}`}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            {/* Table (lg+) */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50/70 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Trip</th>
                    <th className="px-5 py-3 font-semibold">Vehicle</th>
                    <th className="px-5 py-3 font-semibold">Driver</th>
                    <th className="px-5 py-3 font-semibold">Planned</th>
                    <th className="px-5 py-3 text-center font-semibold">Load</th>
                    <th className="px-5 py-3 text-center font-semibold">Status</th>
                    <th className="px-5 py-3 text-right font-semibold">Cost</th>
                    <th className="px-5 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        {Array.from({ length: 8 }).map((__, c) => (
                          <td key={c} className="px-5 py-3.5">
                            <div className="h-4 animate-pulse rounded bg-slate-100" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : trips.length === 0 ? (
                    <tr>
                      <td colSpan={8}>
                        <div className="py-14 text-center">
                          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-slate-200/70">
                            <FiTruck className="h-6 w-6 text-slate-400" />
                          </div>
                          <p className="mt-4 text-sm font-semibold text-slate-800">
                            No trips found
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {hasActiveFilters
                              ? 'No trips match your active filters. Try adjusting search or filters.'
                              : 'Plan a trip to get started.'}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    trips.map((t) => {
                      const badge = STATUS_BADGES[t.status] ?? DEFAULT_STATUS_CLASS;
                      return (
                        <tr key={t.id} className="transition-colors hover:bg-slate-50/70">
                          <td className="px-5 py-3.5">
                            <button
                              type="button"
                              onClick={() => void openTripModal(t.id)}
                              className="font-mono font-semibold text-indigo-600 hover:underline"
                            >
                              {safeStr(t.trip_code, '—')}
                            </button>
                          </td>
                          <td className="px-5 py-3.5 text-slate-700">
                            {t.vehicle ? (
                              <>
                                <span className="font-medium text-slate-900">
                                  {safeStr(t.vehicle.name, '—')}
                                </span>
                                {t.vehicle.registration_number && (
                                  <span className="ml-1 font-mono text-[11px] text-slate-500">
                                    ({t.vehicle.registration_number})
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-slate-400">Unassigned</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-slate-600">
                            {t.driver ? safeStr(t.driver.name, '—') : (
                              <span className="text-slate-400">Unassigned</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-xs text-slate-600">
                            {formatDate(t.planned_date)}
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <p className="text-xs font-semibold text-slate-800">
                              {safeNum(t.total_customers)} stops
                            </p>
                            <p className="text-[10px] text-slate-500">
                              {safeNum(t.total_quantity)} pcs
                            </p>
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <Badge
                              variant="outline"
                              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize ${badge}`}
                            >
                              {statusLabel(t.status)}
                            </Badge>
                          </td>
                          <td className="px-5 py-3.5 text-right font-semibold tabular-nums text-slate-900">
                            ₹{formatINR(t.transport_cost, 0)}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void openTripModal(t.id)}
                              className="h-8 rounded-lg"
                            >
                              <FiEye size={13} className="mr-1" /> Inspect
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Cards (below lg) */}
            <div className="divide-y divide-slate-100 lg:hidden">
              {loading ? (
                <div className="space-y-2 p-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />
                  ))}
                </div>
              ) : trips.length === 0 ? (
                <div className="py-14 text-center">
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-slate-200/70">
                    <FiTruck className="h-6 w-6 text-slate-400" />
                  </div>
                  <p className="mt-4 text-sm font-semibold text-slate-800">No trips found</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {statusFilter ? 'Try a different status filter.' : 'Plan a trip to get started.'}
                  </p>
                </div>
              ) : (
                trips.map((t) => {
                  const badge = STATUS_BADGES[t.status] ?? DEFAULT_STATUS_CLASS;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => void openTripModal(t.id)}
                      className="block w-full p-3 text-left transition hover:bg-slate-50/70 sm:p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="truncate font-mono text-sm font-semibold text-indigo-600">
                              {safeStr(t.trip_code, '—')}
                            </p>
                            <Badge
                              variant="outline"
                              className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${badge}`}
                            >
                              {statusLabel(t.status)}
                            </Badge>
                          </div>
                          <p className="mt-1 truncate text-xs text-slate-700">
                            <FiTruck size={10} className="mr-1 inline" />
                            {t.vehicle ? `${safeStr(t.vehicle.name)} (${safeStr(t.vehicle.registration_number)})` : 'Unassigned vehicle'}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-slate-500">
                            <FiUser size={10} className="mr-1 inline" />
                            {t.driver?.name ?? '—'} · {formatDate(t.planned_date)}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            {safeNum(t.total_customers)} stops · {safeNum(t.total_quantity)} pcs
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-bold tabular-nums text-slate-900">
                            ₹{formatINR(t.transport_cost, 0)}
                          </p>
                          <p className="mt-1 text-[10px] font-semibold text-indigo-600">Inspect →</p>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Pagination */}
            {(totalPages > 1 || total > 0) && (
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
                    disabled={!canPrev || loading}
                    className="h-8 rounded-lg"
                  >
                    <FiChevronLeft size={14} /> Prev
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={!canNext || loading}
                    className="h-8 rounded-lg"
                  >
                    Next <FiChevronRight size={14} />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* ════════ Trip Detail Modal ════════ */}
      {tripModalOpen && (
        <ModalShell
          title={activeTrip ? `Trip #${safeStr(activeTrip.trip_code)}` : 'Trip details'}
          subtitle={
            activeTrip
              ? `${formatDate(activeTrip.planned_date)} · ${safeStr(activeTrip.vehicle?.name, 'Unassigned vehicle')}`
              : undefined
          }
          icon={<FiNavigation size={18} />}
          onClose={closeTripModal}
          maxWidth="max-w-3xl"
          footer={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={closeTripModal}
                className="rounded-xl"
              >
                Close
              </Button>
              {activeTrip?.status === 'ready_for_dispatch' && canDispatch && (
                <Button
                  type="button"
                  onClick={openDispatchModal}
                  className="rounded-xl bg-blue-600 font-semibold text-white hover:bg-blue-700"
                >
                  <FiPlay className="mr-1.5" size={13} /> Dispatch on road
                </Button>
              )}
              {activeTrip?.status === 'in_transit' && canClose && (
                <Button
                  type="button"
                  onClick={openCloseModal}
                  className="rounded-xl bg-emerald-600 font-semibold text-white hover:bg-emerald-700"
                >
                  <FiCheckCircle className="mr-1.5" size={13} /> Complete &amp; close
                </Button>
              )}
            </div>
          }
        >
          {tripLoading ? (
            <div className="py-14 text-center">
              <FiLoader className="mx-auto mb-2 animate-spin text-indigo-500" size={22} />
              <p className="text-xs text-slate-500">Loading trip details…</p>
            </div>
          ) : tripError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              <div className="flex items-start gap-2">
                <FiAlertTriangle className="mt-0.5 shrink-0" size={16} />
                <span>{tripError}</span>
              </div>
            </div>
          ) : activeTrip ? (
            <div className="space-y-4">
              {/* Status bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Current status
                  </p>
                  <p className="mt-0.5 text-sm font-bold capitalize text-slate-900">
                    {statusLabel(activeTrip.status)}
                  </p>
                </div>
                <Link
                  to={`/deliveries/costs?trip_id=${activeTrip.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <FiDollarSign size={12} /> Split cost (₹{formatINR(activeTrip.transport_cost, 0)})
                </Link>
              </div>

              {/* Stops */}
              <div>
                <h4 className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <span>Delivery stops ({(activeTrip.stops ?? []).length})</span>
                  {pendingStopsCount > 0 && (
                    <span className="text-amber-600 normal-case">
                      {pendingStopsCount} pending
                    </span>
                  )}
                </h4>
                {(activeTrip.stops ?? []).length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center text-xs text-slate-500">
                    No stops on this trip yet.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <div className="max-h-64 overflow-y-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 bg-slate-50/95 text-[10px] uppercase tracking-wide text-slate-500 backdrop-blur">
                          <tr>
                            <th className="px-3 py-2 font-semibold">#</th>
                            <th className="px-3 py-2 font-semibold">Customer</th>
                            <th className="px-3 py-2 font-semibold">Location</th>
                            <th className="px-3 py-2 font-semibold">Invoice</th>
                            <th className="px-3 py-2 text-center font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(activeTrip.stops ?? []).map((stop: any) => (
                            <tr key={stop.id}>
                              <td className="px-3 py-2.5 font-mono font-bold text-indigo-600">
                                #{safeNum(stop.stop_sequence)}
                              </td>
                              <td className="px-3 py-2.5 font-semibold text-slate-900">
                                {safeStr(stop.customer_name, '—')}
                              </td>
                              <td className="px-3 py-2.5 text-slate-600">
                                <span className="inline-flex items-center gap-1">
                                  <FiMapPin size={10} className="text-rose-500" />
                                  {safeStr(stop.delivery_area, '—')}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 font-mono text-[11px] text-indigo-600">
                                {safeStr(stop.invoice?.invoice_no, '—')}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <Badge
                                  variant="outline"
                                  className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold capitalize text-slate-600"
                                >
                                  {statusLabel(stop.status)}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Loading summary */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Loading items ({(activeTrip.loading_items ?? []).length})
                  </h4>
                  <Link
                    to={`/deliveries/loading?trip_id=${activeTrip.id}`}
                    className="text-[11px] font-semibold text-indigo-600 hover:underline"
                  >
                    Open full checklist →
                  </Link>
                </div>
                {(activeTrip.loading_items ?? []).length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center text-xs text-slate-500">
                    No loading items registered yet.
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {(activeTrip.loading_items ?? []).slice(0, 4).map((li: any) => (
                        <div
                          key={li.id}
                          className="rounded-xl border border-slate-200 bg-slate-50/50 p-2.5"
                        >
                          <p className="truncate text-xs font-semibold text-slate-800">
                            {safeStr(li.product?.name, `Product #${li.product_id}`)}
                          </p>
                          <p className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-500">
                            <FiPackage size={9} />
                            {safeStr(li.warehouse?.name, 'Primary godown')}
                          </p>
                          <p className="mt-1 text-xs font-bold tabular-nums text-slate-700">
                            {safeNum(li.picked_quantity)} / {safeNum(li.planned_quantity)} pcs
                          </p>
                        </div>
                      ))}
                    </div>
                    {(activeTrip.loading_items ?? []).length > 4 && (
                      <p className="mt-2 text-center text-[11px] text-slate-500">
                        + {(activeTrip.loading_items ?? []).length - 4} more item
                        {(activeTrip.loading_items ?? []).length - 4 === 1 ? '' : 's'}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          ) : null}
        </ModalShell>
      )}

      {/* ════════ Dispatch Modal ════════ */}
      {dispatchOpen && activeTrip && (
        <ModalShell
          title="Dispatch trip"
          subtitle={`#${safeStr(activeTrip.trip_code)}`}
          icon={<FiPlay size={18} />}
          onClose={() => !actionLoading && setDispatchOpen(false)}
          closeDisabled={actionLoading}
          footer={
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDispatchOpen(false)}
                disabled={actionLoading}
                className="rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void handleDispatch()}
                disabled={actionLoading}
                className="rounded-xl bg-blue-600 font-semibold text-white hover:bg-blue-700"
              >
                {actionLoading && <FiLoader className="mr-1.5 animate-spin" size={13} />}
                {actionLoading ? 'Dispatching…' : 'Confirm dispatch'}
              </Button>
            </div>
          }
        >
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Starting odometer (km)
              </label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={LIMITS.odometerMax}
                value={odometer}
                onChange={(e) => {
                  setOdometer(e.target.value);
                  setFieldErrors((p) => {
                    if (!p.odometer) return p;
                    const next = { ...p };
                    delete next.odometer;
                    return next;
                  });
                }}
                placeholder="e.g. 12540"
                className={`h-10 w-full rounded-xl border bg-white px-3.5 text-sm outline-none transition ${
                  fieldErrors.odometer
                    ? 'border-rose-300 ring-2 ring-rose-200'
                    : 'border-slate-200 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10'
                }`}
              />
              {fieldErrors.odometer && (
                <p className="mt-1 text-[11px] text-rose-600">{fieldErrors.odometer}</p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Dispatch remarks
              </label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(clampStr(e.target.value, LIMITS.remarksMax))}
                rows={3}
                maxLength={LIMITS.remarksMax}
                placeholder="Checked tarp, vehicle loaded safely…"
                className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
              />
              <p className="mt-1 text-right text-[10px] text-slate-400">
                {remarks.length}/{LIMITS.remarksMax}
              </p>
            </div>
          </div>
        </ModalShell>
      )}

      {/* ════════ Close Modal ════════ */}
      {closeOpen && activeTrip && (
        <ModalShell
          title="Close trip"
          subtitle={`#${safeStr(activeTrip.trip_code)}`}
          icon={<FiCheckCircle size={18} />}
          onClose={() => !actionLoading && setCloseOpen(false)}
          closeDisabled={actionLoading}
          footer={
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCloseOpen(false)}
                disabled={actionLoading}
                className="rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void handleCloseTrip()}
                disabled={actionLoading}
                className="rounded-xl bg-emerald-600 font-semibold text-white hover:bg-emerald-700"
              >
                {actionLoading && <FiLoader className="mr-1.5 animate-spin" size={13} />}
                {actionLoading ? 'Closing…' : 'Close & release fleet'}
              </Button>
            </div>
          }
        >
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Ending odometer (km)
              </label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={LIMITS.odometerMax}
                value={odometer}
                onChange={(e) => {
                  setOdometer(e.target.value);
                  setFieldErrors((p) => {
                    if (!p.odometer) return p;
                    const next = { ...p };
                    delete next.odometer;
                    return next;
                  });
                }}
                placeholder="e.g. 12610"
                className={`h-10 w-full rounded-xl border bg-white px-3.5 text-sm outline-none transition ${
                  fieldErrors.odometer
                    ? 'border-rose-300 ring-2 ring-rose-200'
                    : 'border-slate-200 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10'
                }`}
              />
              {fieldErrors.odometer && (
                <p className="mt-1 text-[11px] text-rose-600">{fieldErrors.odometer}</p>
              )}
            </div>

            {pendingStopsCount > 0 && (
              <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <input
                  type="checkbox"
                  checked={forceClose}
                  onChange={(e) => {
                    setForceClose(e.target.checked);
                    setFieldErrors((p) => {
                      if (!p.forceClose) return p;
                      const next = { ...p };
                      delete next.forceClose;
                      return next;
                    });
                  }}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                />
                <span>
                  <strong>Force close:</strong> {pendingStopsCount} stop
                  {pendingStopsCount === 1 ? '' : 's'} still pending. Check to close anyway.
                </span>
              </label>
            )}
            {fieldErrors.forceClose && (
              <p className="text-[11px] text-rose-600">{fieldErrors.forceClose}</p>
            )}

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Closing notes
              </label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(clampStr(e.target.value, LIMITS.remarksMax))}
                rows={3}
                maxLength={LIMITS.remarksMax}
                placeholder="Vehicle returned to godown safely, driver released…"
                className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
              />
              <p className="mt-1 text-right text-[10px] text-slate-400">
                {remarks.length}/{LIMITS.remarksMax}
              </p>
            </div>
          </div>
        </ModalShell>
      )}
    </TripsBoundary>
  );
};

export default TripManagementPage;