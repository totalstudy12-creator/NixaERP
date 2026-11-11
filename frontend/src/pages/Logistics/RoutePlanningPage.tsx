// src/pages/Delivery/RoutePlanningPage.tsx
import React, {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiMapPin,
  FiNavigation,
  FiTruck,
  FiUser,
  FiCalendar,
  FiArrowUp,
  FiArrowDown,
  FiCheck,
  FiAlertTriangle,
  FiDollarSign,
  FiLayers,
  FiRefreshCw,
  FiExternalLink,
  FiLoader,
  FiX,
  FiClock,
  FiSearch,
} from 'react-icons/fi';
import deliveryService, {
  DeliveryOrder,
  DeliveryVehicle,
  DeliveryDriver,
} from '../../services/deliveryService';
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

const LIMITS = {
  costMin: 0,
  costMax: 10_000_000,
  capacityReasonMax: 300,
  notesMax: 1000,
} as const;

const CAPACITY_UNITS_PIECES = new Set(['pieces', 'pcs', 'nos', 'units']);

/* ══════════════════════════════════════════════════════════
 * Helpers
 * ════════════════════════════════════════════════════════ */

const safeNum = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const safeStr = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v : v == null ? fallback : String(v);

const clampNum = (v: number, min: number, max: number): number => {
  if (!Number.isFinite(v)) return min;
  return Math.min(Math.max(v, min), max);
};
const clampStr = (v: unknown, max: number): string => String(v ?? '').slice(0, max);

/** Local timezone-safe date string (avoids UTC 5:30 AM IST bug). */
const todayLocalISO = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const nowLocalTime = (): string => {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
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
    if (status === 404) return 'Record not found.';
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
class RoutePlanningBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { hasError: false };
  static getDerivedStateFromError(err: unknown): BoundaryState {
    return {
      hasError: true,
      message: err instanceof Error ? err.message : 'Unexpected error.',
    };
  }
  componentDidCatch(err: unknown) {
    // eslint-disable-next-line no-console
    console.error('[RoutePlanningPage]', err);
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
              {this.state.message || 'Unable to render route planning.'}
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
 * Main component
 * ════════════════════════════════════════════════════════ */

export const RoutePlanningPage: React.FC = () => {
  const navigate = useNavigate();
  const { showSuccess, showError } = useNotification();
  const { can, isSuperAdmin } = usePermission();
  const loadingUser = useAuthStore((s) => s.loadingUser);
  const hasUser = useAuthStore((s) => Boolean(s.user));

  /* ── Permissions ── */
  const canView = isSuperAdmin || can('view deliveries');
  const canCreateTrip = isSuperAdmin || can('create deliveries') || can('create trips');

  /* ── Data ── */
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [vehicles, setVehicles] = useState<DeliveryVehicle[]>([]);
  const [drivers, setDrivers] = useState<DeliveryDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ── Grouping / filtering ── */
  const [selectedTown, setSelectedTown] = useState<string>('all');
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);

  /* ── Trip form ── */
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | ''>('');
  const [selectedDriverId, setSelectedDriverId] = useState<number | ''>('');
  const [plannedDate, setPlannedDate] = useState<string>(todayLocalISO());
  const [plannedTime, setPlannedTime] = useState<string>(nowLocalTime());
  const [transportCost, setTransportCost] = useState<number>(1500);
  const [capacityOverride, setCapacityOverride] = useState(false);
  const [capacityReason, setCapacityReason] = useState('');
  const [tripNotes, setTripNotes] = useState('');
  const [orderSearch, setOrderSearch] = useState('');

  /* ── Submission state ── */
  const [creatingTrip, setCreatingTrip] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  /* ── Refs ── */
  const fetchAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      fetchAbortRef.current?.abort();
    };
  }, []);

  /* ══════════════════════════════════════════════════════
   * Fetch
   * ══════════════════════════════════════════════════════ */

  const fetchPlanningData = useCallback(async () => {
    if (!canView) return;
    fetchAbortRef.current?.abort();
    const ctrl = new AbortController();
    fetchAbortRef.current = ctrl;

    setLoading(true);
    setError(null);
    try {
      const [ordRes, vehRes, drvRes] = await Promise.all([
        deliveryService.getOrders({ status: 'delivery_pending', per_page: 100 }),
        deliveryService.getVehicles({ status: 'available' }),
        deliveryService.getDrivers({ status: 'available' }),
      ]);
      if (ctrl.signal.aborted || !mountedRef.current) return;

      setOrders(Array.isArray((ordRes as any)?.data?.data) ? (ordRes as any).data.data : []);
      setVehicles(Array.isArray((vehRes as any)?.data) ? (vehRes as any).data : []);
      setDrivers(Array.isArray((drvRes as any)?.data) ? (drvRes as any).data : []);
    } catch (err) {
      if (ctrl.signal.aborted) return;
      const msg = getApiErrorMessage(err, 'Could not load route planning data.');
      setError(msg);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    void fetchPlanningData();
  }, [fetchPlanningData]);

  /* ── Shortcuts ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const key = e.key.toLowerCase();
      if (key === 'r') {
        e.preventDefault();
        void fetchPlanningData();
      } else if (key === 'n') {
        e.preventDefault();
        if (canCreateTrip && selectedOrderIds.length > 0) {
          void handleCreateTrip();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchPlanningData, canCreateTrip, selectedOrderIds.length]);

  /* ══════════════════════════════════════════════════════
   * Derived data
   * ══════════════════════════════════════════════════════ */

  const townGroups = useMemo(
    () => Array.from(new Set(orders.map((o) => o.town || 'Local Area'))).sort(),
    [orders]
  );

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (selectedTown !== 'all' && (o.town || 'Local Area') !== selectedTown) {
        return false;
      }
      if (orderSearch.trim()) {
        const term = orderSearch.trim().toLowerCase();
        const haystack = [
          o.delivery_order_no,
          o.recipient_name,
          o.recipient_phone,
          o.town,
          o.delivery_address,
          o.invoice?.invoice_no,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [orders, selectedTown, orderSearch]);

  const townCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    orders.forEach((o) => {
      const key = o.town || 'Local Area';
      map[key] = (map[key] ?? 0) + 1;
    });
    return map;
  }, [orders]);

  const sequencedOrders = useMemo(
    () =>
      selectedOrderIds
        .map((id) => orders.find((o) => o.id === id))
        .filter(Boolean) as DeliveryOrder[],
    [selectedOrderIds, orders]
  );

  const totals = useMemo(() => {
    const totalQty = sequencedOrders.reduce(
      (sum, o) => sum + safeNum(o.total_quantity),
      0
    );
    return {
      totalQty,
      totalCustomers: sequencedOrders.length,
      perCustomerCost:
        sequencedOrders.length > 0
          ? transportCost / sequencedOrders.length
          : 0,
    };
  }, [sequencedOrders, transportCost]);

  const selectedVehicle = useMemo(
    () => vehicles.find((v) => v.id === Number(selectedVehicleId)),
    [vehicles, selectedVehicleId]
  );

  const capacityUnitsNormalized = useMemo(
    () => safeStr(selectedVehicle?.capacity_unit).toLowerCase().trim(),
    [selectedVehicle]
  );

  const isPieceCapacity = CAPACITY_UNITS_PIECES.has(capacityUnitsNormalized);

  const isOverCapacity = Boolean(
    selectedVehicle &&
      isPieceCapacity &&
      totals.totalQty > safeNum(selectedVehicle.max_capacity)
  );

  /* ── Reset capacity override when the load drops below capacity ── */
  useEffect(() => {
    if (!isOverCapacity && capacityOverride) {
      setCapacityOverride(false);
      setCapacityReason('');
    }
  }, [isOverCapacity, capacityOverride]);

  /* ── Reset vehicle if it disappears from available list ── */
  useEffect(() => {
    if (!selectedVehicleId) return;
    if (!vehicles.some((v) => v.id === Number(selectedVehicleId))) {
      setSelectedVehicleId('');
      setSelectedDriverId('');
    }
  }, [vehicles, selectedVehicleId]);

  /* ── Reset driver if not in available list ── */
  useEffect(() => {
    if (!selectedDriverId) return;
    if (!drivers.some((d) => d.id === Number(selectedDriverId))) {
      setSelectedDriverId('');
    }
  }, [drivers, selectedDriverId]);

  /* ══════════════════════════════════════════════════════
   * Selection actions
   * ══════════════════════════════════════════════════════ */

  const toggleSelectOrder = useCallback((id: number) => {
    setSelectedOrderIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.orderIds;
      return next;
    });
  }, []);

  const selectAllInTown = useCallback(() => {
    const ids = filteredOrders.map((o) => o.id);
    setSelectedOrderIds(Array.from(new Set([...selectedOrderIds, ...ids])));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.orderIds;
      return next;
    });
  }, [filteredOrders, selectedOrderIds]);

  const clearSelection = useCallback(() => {
    setSelectedOrderIds([]);
    setCapacityOverride(false);
    setCapacityReason('');
  }, []);

  const moveStop = useCallback((index: number, direction: 'up' | 'down') => {
    setSelectedOrderIds((prev) => {
      const next = [...prev];
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  /* ══════════════════════════════════════════════════════
   * Form actions
   * ══════════════════════════════════════════════════════ */

  const handleVehicleChange = useCallback((vId: number | '') => {
    setSelectedVehicleId(vId);
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.vehicle;
      return next;
    });
    if (vId) {
      const v = vehicles.find((item) => item.id === Number(vId));
      if (v?.default_driver_id) {
        /* Only auto-assign if that driver is still in the available list */
        const stillAvailable = drivers.some((d) => d.id === v.default_driver_id);
        if (stillAvailable) {
          setSelectedDriverId(v.default_driver_id);
          return;
        }
      }
    }
    setSelectedDriverId('');
  }, [vehicles, drivers]);

  const handleTransportCostChange = useCallback((raw: string) => {
    const n = clampNum(Number(raw), LIMITS.costMin, LIMITS.costMax);
    setTransportCost(n);
  }, []);

  /* ── Google Maps directions with origin + waypoints + destination ── */
  const getDirectionsUrl = useCallback((): string => {
    if (sequencedOrders.length === 0) return '#';
    const waypoints = sequencedOrders.map((o) =>
      encodeURIComponent(o.delivery_address || `${o.town}, Bihar`)
    );
    const dest = waypoints[waypoints.length - 1];
    const middle = waypoints.slice(0, -1);
    const waypointsParam =
      middle.length > 0 ? `&waypoints=${middle.join('|')}` : '';
    return `https://www.google.com/maps/dir/?api=1&destination=${dest}${waypointsParam}&travelmode=driving`;
  }, [sequencedOrders]);

  /* ══════════════════════════════════════════════════════
   * Validation + submit
   * ══════════════════════════════════════════════════════ */

  const validate = useCallback((): boolean => {
    const errors: Record<string, string> = {};

    if (selectedOrderIds.length === 0) errors.orderIds = 'Select at least one delivery order.';
    if (!selectedVehicleId) errors.vehicle = 'Select a carrier vehicle.';
    if (!plannedDate) errors.date = 'Select a planned departure date.';
    else if (plannedDate < todayLocalISO()) errors.date = 'Departure cannot be in the past.';
    if (transportCost < LIMITS.costMin) errors.cost = 'Transport cost cannot be negative.';
    if (isOverCapacity && !capacityOverride) {
      errors.capacity = 'Load exceeds capacity. Authorize override or pick a larger vehicle.';
    }
    if (isOverCapacity && capacityOverride && !capacityReason.trim()) {
      errors.capacityReason = 'Provide a reason for the capacity override.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [
    selectedOrderIds,
    selectedVehicleId,
    plannedDate,
    transportCost,
    isOverCapacity,
    capacityOverride,
    capacityReason,
  ]);

  const handleCreateTrip = useCallback(async () => {
    if (!canCreateTrip) {
      showError('Permission denied', 'You do not have permission to create trips.');
      return;
    }
    if (!validate()) {
      showError('Validation', 'Please fix the highlighted fields.');
      return;
    }

    setCreatingTrip(true);
    try {
      const res: any = await deliveryService.createTrip({
        delivery_order_ids: selectedOrderIds,
        vehicle_id: Number(selectedVehicleId),
        driver_id: selectedDriverId ? Number(selectedDriverId) : undefined,
        planned_date: plannedDate,
        planned_departure: `${plannedDate} ${plannedTime}:00`,
        transport_cost: Number(transportCost),
        capacity_override: capacityOverride,
        capacity_override_reason: capacityReason.trim(),
        notes: tripNotes.trim(),
      });

      const tripId =
        res?.data?.id ?? res?.data?.trip?.id ?? res?.trip?.id ?? res?.id;
      showSuccess('Trip created', `Carrier trip #${tripId ?? '—'} is ready.`);
      if (tripId) {
        navigate(`/deliveries/trips?id=${tripId}`);
      } else {
        await fetchPlanningData();
      }
    } catch (err) {
      showError('Create failed', getApiErrorMessage(err, 'Could not create trip.'));
    } finally {
      if (mountedRef.current) setCreatingTrip(false);
    }
  }, [
    canCreateTrip,
    validate,
    selectedOrderIds,
    selectedVehicleId,
    selectedDriverId,
    plannedDate,
    plannedTime,
    transportCost,
    capacityOverride,
    capacityReason,
    tripNotes,
    navigate,
    fetchPlanningData,
    showSuccess,
    showError,
  ]);

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
            You don't have permission to plan delivery routes.
          </p>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════
   * Render
   * ══════════════════════════════════════════════════════ */

  return (
    <RoutePlanningBoundary>
      <div className="min-h-full bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100/60">
        <div className="mx-auto w-full max-w-[1500px] space-y-4 p-3 sm:space-y-5 sm:p-4 lg:p-5 xl:p-6">

          {/* ── Hero ── */}
          <section className="relative overflow-hidden rounded-2xl border border-slate-800/10 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-4 py-5 shadow-[0_20px_40px_-20px_rgba(15,23,42,0.45)] sm:px-6 sm:py-6 lg:px-7">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />
            <div className="relative flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200 backdrop-blur">
                  <FiNavigation size={12} /> Logistics · Route Planning
                </div>
                <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl xl:text-[30px]">
                  Area-Wise Route Planning
                </h1>
                <p className="mt-1.5 max-w-2xl text-xs text-slate-300 sm:text-sm">
                  Combine multiple customer orders from any locality into one carrier trip.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {sequencedOrders.length > 0 && (
                  <a
                    href={getDirectionsUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-xs font-semibold text-white backdrop-blur transition hover:border-white/20 hover:bg-white/10"
                  >
                    <FiExternalLink size={14} /> Road directions
                  </a>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void fetchPlanningData()}
                  disabled={loading}
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
              </div>
            </div>
          </section>

          {/* ── Error ── */}
          {error && (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-rose-700 sm:flex-row sm:items-start sm:gap-3 sm:p-4"
            >
              <div className="flex items-start gap-2 sm:flex-1">
                <FiAlertTriangle className="mt-0.5 shrink-0" size={18} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Could not load planning data</p>
                  <p className="text-xs sm:text-sm">{error}</p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => void fetchPlanningData()}
                className="w-full shrink-0 rounded-xl border-rose-300 bg-white text-xs font-semibold text-rose-700 hover:bg-rose-50 sm:w-auto"
              >
                Retry
              </Button>
            </div>
          )}

          {/* ══════════════════════════════════════════════════
           * Split layout
           * ══════════════════════════════════════════════════ */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
            {/* ── Left: orders ── */}
            <div className="space-y-4 lg:col-span-7">
              {/* Town filter card */}
              <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                <CardContent className="p-3 sm:p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Filter by delivery area / town
                    </span>
                    <div className="flex items-center gap-2 text-[11px]">
                      <button
                        type="button"
                        onClick={selectAllInTown}
                        className="font-semibold text-indigo-600 hover:underline"
                      >
                        Select all ({filteredOrders.length})
                      </button>
                      <span className="text-slate-300">•</span>
                      <button
                        type="button"
                        onClick={clearSelection}
                        disabled={selectedOrderIds.length === 0}
                        className="text-slate-500 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Clear ({selectedOrderIds.length})
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedTown('all')}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        selectedTown === 'all'
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      All localities ({orders.length})
                    </button>
                    {townGroups.map((town) => {
                      const count = townCountMap[town] ?? 0;
                      return (
                        <button
                          key={town}
                          type="button"
                          onClick={() => setSelectedTown(town)}
                          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                            selectedTown === town
                              ? 'bg-slate-900 text-white shadow-sm'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          <FiMapPin size={11} />
                          {town}
                          <span
                            className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                              selectedTown === town
                                ? 'bg-white/20'
                                : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Pending orders card */}
              <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                <CardHeader className="flex flex-col gap-2.5 border-b border-slate-100 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                      <FiLayers size={14} />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="truncate text-xs font-semibold text-slate-800 sm:text-sm">
                        Pending customer invoices
                      </CardTitle>
                      <CardDescription className="truncate text-[10px] text-slate-500 sm:text-[11px]">
                        {loading
                          ? 'Loading…'
                          : `${filteredOrders.length} order${filteredOrders.length === 1 ? '' : 's'} • ${selectedOrderIds.length} selected`}
                      </CardDescription>
                    </div>
                  </div>

                  {/* Search orders */}
                  <div className="relative w-full sm:w-60">
                    <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                    <input
                      type="text"
                      value={orderSearch}
                      onChange={(e) => setOrderSearch(e.target.value)}
                      placeholder="Search customer, phone, order…"
                      className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-7 text-xs text-slate-800 shadow-sm outline-none transition focus:border-indigo-400"
                    />
                    {orderSearch && (
                      <button
                        type="button"
                        onClick={() => setOrderSearch('')}
                        className="absolute right-2 top-1/2 grid h-4 w-4 -translate-y-1/2 place-items-center text-slate-400 hover:text-slate-700"
                      >
                        <FiX size={11} />
                      </button>
                    )}
                  </div>
                </CardHeader>

                <div className="max-h-[600px] divide-y divide-slate-100 overflow-y-auto">
                  {loading ? (
                    <div className="space-y-2 p-3">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />
                      ))}
                    </div>
                  ) : filteredOrders.length === 0 ? (
                    <div className="py-14 text-center">
                      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-slate-200/70">
                        <FiMapPin className="h-6 w-6 text-slate-400" />
                      </div>
                      <p className="mt-4 text-sm font-semibold text-slate-800">
                        No pending orders
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        No pending deliveries in this locality.
                      </p>
                    </div>
                  ) : (
                    filteredOrders.map((ord) => {
                      const isChecked = selectedOrderIds.includes(ord.id);
                      return (
                        <label
                          key={ord.id}
                          className={`flex cursor-pointer items-start gap-3 p-3 transition sm:p-3.5 ${
                            isChecked
                              ? 'border-l-4 border-indigo-500 bg-indigo-50/60'
                              : 'border-l-4 border-transparent hover:bg-slate-50/70'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelectOrder(ord.id)}
                            className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/30"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-sm font-semibold text-slate-900">
                                {safeStr(ord.recipient_name, '—')}
                              </p>
                              <span className="shrink-0 text-[11px] font-semibold text-indigo-600">
                                {safeStr(ord.invoice?.invoice_no, '—')}
                              </span>
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                              <span className="flex items-center gap-1 font-medium text-slate-700">
                                <FiMapPin className="text-rose-500" size={10} />
                                {safeStr(ord.town, 'Local')}
                                {ord.district && ` (${ord.district})`}
                              </span>
                              <span className="text-slate-300">•</span>
                              <span className="text-slate-500">
                                {safeNum(ord.total_quantity)} pcs · {safeNum(ord.total_items_count)} items
                              </span>
                            </div>
                            <p className="mt-1 truncate text-[11px] text-slate-400">
                              {safeStr(ord.delivery_address, '—')}
                            </p>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </Card>
            </div>

            {/* ── Right: trip builder ── */}
            <div className="space-y-4 lg:col-span-5">
              <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-slate-100 bg-white px-3 py-3 sm:px-5 sm:py-4">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600 ring-1 ring-indigo-500/10">
                      <FiTruck size={14} />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="truncate text-xs font-semibold text-slate-800 sm:text-sm">
                        Carrier trip configuration
                      </CardTitle>
                      <CardDescription className="truncate text-[10px] text-slate-500 sm:text-[11px]">
                        Vehicle, driver, schedule & cost
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 p-3 sm:p-5">
                  {/* Vehicle */}
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Carrier vehicle <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={String(selectedVehicleId)}
                      onChange={(e) =>
                        handleVehicleChange(e.target.value ? Number(e.target.value) : '')
                      }
                      disabled={vehicles.length === 0}
                      className={`h-10 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm outline-none transition ${
                        fieldErrors.vehicle
                          ? 'border-rose-300 ring-2 ring-rose-200'
                          : 'border-slate-200 text-slate-700 hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10'
                      } disabled:opacity-50`}
                    >
                      <option value="">
                        {vehicles.length === 0
                          ? 'No vehicles available'
                          : '— Choose carrier vehicle —'}
                      </option>
                      {vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {safeStr(v.name)} ({safeStr(v.registration_number)}) — Max: {safeNum(v.max_capacity)} {safeStr(v.capacity_unit)}
                        </option>
                      ))}
                    </select>
                    {fieldErrors.vehicle && (
                      <p className="mt-1 text-[11px] text-rose-600">{fieldErrors.vehicle}</p>
                    )}
                  </div>

                  {/* Driver */}
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Assigned driver
                    </label>
                    <select
                      value={String(selectedDriverId)}
                      onChange={(e) =>
                        setSelectedDriverId(e.target.value ? Number(e.target.value) : '')
                      }
                      disabled={drivers.length === 0}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 disabled:opacity-50"
                    >
                      <option value="">
                        {drivers.length === 0 ? 'No drivers available' : '— Choose driver —'}
                      </option>
                      {drivers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {safeStr(d.name)} ({safeStr(d.contact_number)})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Date + time */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Departure date <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={plannedDate}
                        min={todayLocalISO()}
                        onChange={(e) => setPlannedDate(e.target.value)}
                        className={`h-10 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm outline-none transition ${
                          fieldErrors.date
                            ? 'border-rose-300 ring-2 ring-rose-200'
                            : 'border-slate-200 text-slate-700 hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10'
                        }`}
                      />
                      {fieldErrors.date && (
                        <p className="mt-1 text-[11px] text-rose-600">{fieldErrors.date}</p>
                      )}
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Time
                      </label>
                      <input
                        type="time"
                        value={plannedTime}
                        onChange={(e) => setPlannedTime(e.target.value)}
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                      />
                    </div>
                  </div>

                  {/* Transport cost */}
                  <div>
                    <label className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <span>Transportation cost (₹)</span>
                      <span className="text-[10px] font-normal normal-case text-slate-400">
                        Split among customers
                      </span>
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                        ₹
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={LIMITS.costMin}
                        max={LIMITS.costMax}
                        step="1"
                        value={transportCost}
                        onChange={(e) => handleTransportCostChange(e.target.value)}
                        className={`h-10 w-full rounded-xl border bg-white pl-8 pr-3.5 text-sm font-semibold text-slate-900 shadow-sm outline-none transition ${
                          fieldErrors.cost
                            ? 'border-rose-300 ring-2 ring-rose-200'
                            : 'border-slate-200 hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Capacity warning */}
                  {isOverCapacity && selectedVehicle && (
                    <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <div className="flex items-start gap-2 text-[11px] font-bold text-amber-800">
                        <FiAlertTriangle className="mt-0.5 shrink-0" size={14} />
                        <span>
                          Capacity exceeded: {totals.totalQty} pcs vs vehicle limit{' '}
                          {safeNum(selectedVehicle.max_capacity)} pcs.
                        </span>
                      </div>
                      <label className="flex items-start gap-2 text-[11px] text-slate-700">
                        <input
                          type="checkbox"
                          checked={capacityOverride}
                          onChange={(e) => {
                            setCapacityOverride(e.target.checked);
                            if (!e.target.checked) setCapacityReason('');
                          }}
                          className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                        />
                        Authorize capacity override with explanation.
                      </label>
                      {capacityOverride && (
                        <>
                          <input
                            type="text"
                            value={capacityReason}
                            onChange={(e) =>
                              setCapacityReason(clampStr(e.target.value, LIMITS.capacityReasonMax))
                            }
                            maxLength={LIMITS.capacityReasonMax}
                            placeholder="e.g. Fiber chairs stack safely without weight overload"
                            className={`h-9 w-full rounded-lg border bg-white px-2.5 text-xs outline-none ${
                              fieldErrors.capacityReason
                                ? 'border-rose-300 ring-2 ring-rose-200'
                                : 'border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20'
                            }`}
                          />
                          {fieldErrors.capacityReason && (
                            <p className="text-[10px] text-rose-600">{fieldErrors.capacityReason}</p>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Load summary */}
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-xs">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-slate-500">Load summary</p>
                      <p className="mt-0.5 font-bold text-slate-800">
                        {totals.totalCustomers} stop{totals.totalCustomers === 1 ? '' : 's'} ·{' '}
                        {totals.totalQty} pcs
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wide text-slate-500">Per-customer</p>
                      <p className="mt-0.5 font-bold tabular-nums text-indigo-700">
                        ₹{totals.perCustomerCost.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {/* Stop sequence */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Stop sequence
                      </p>
                      {sequencedOrders.length > 0 && (
                        <p className="text-[10px] text-slate-400">
                          {sequencedOrders.length} stop{sequencedOrders.length === 1 ? '' : 's'}
                        </p>
                      )}
                    </div>

                    {sequencedOrders.length === 0 ? (
                      <div className="rounded-xl border-2 border-dashed border-slate-200 py-8 text-center text-xs text-slate-400">
                        No orders added yet — pick some from the left.
                      </div>
                    ) : (
                      <div className="max-h-[240px] space-y-1.5 overflow-y-auto pr-1">
                        {sequencedOrders.map((ord, idx) => (
                          <div
                            key={ord.id}
                            className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2 text-xs"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">
                                {idx + 1}
                              </span>
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-slate-800">
                                  {safeStr(ord.recipient_name, '—')}
                                </p>
                                <p className="truncate text-[10px] text-slate-500">
                                  {safeStr(ord.town, 'Local')} · {safeNum(ord.total_quantity)} pcs
                                </p>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-0.5">
                              <button
                                type="button"
                                onClick={() => moveStop(idx, 'up')}
                                disabled={idx === 0}
                                title="Move earlier"
                                className="grid h-6 w-6 place-items-center rounded-md text-slate-500 hover:bg-slate-200 disabled:opacity-30"
                              >
                                <FiArrowUp size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveStop(idx, 'down')}
                                disabled={idx === sequencedOrders.length - 1}
                                title="Move later"
                                className="grid h-6 w-6 place-items-center rounded-md text-slate-500 hover:bg-slate-200 disabled:opacity-30"
                              >
                                <FiArrowDown size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleSelectOrder(ord.id)}
                                title="Remove from trip"
                                className="grid h-6 w-6 place-items-center rounded-md text-rose-500 hover:bg-rose-50"
                              >
                                <FiX size={12} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Trip notes
                    </label>
                    <textarea
                      value={tripNotes}
                      onChange={(e) => setTripNotes(clampStr(e.target.value, LIMITS.notesMax))}
                      maxLength={LIMITS.notesMax}
                      rows={2}
                      placeholder="Driver instructions, special handling, gate pass info…"
                      className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                    />
                    <p className="mt-1 text-right text-[10px] text-slate-400">
                      {tripNotes.length} / {LIMITS.notesMax}
                    </p>
                  </div>

                  {/* Create button */}
                  <Button
                    type="button"
                    onClick={() => void handleCreateTrip()}
                    disabled={creatingTrip || sequencedOrders.length === 0}
                    className="h-11 w-full rounded-xl bg-indigo-600 text-sm font-semibold text-white shadow-md hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {creatingTrip ? (
                      <>
                        <FiLoader className="mr-2 animate-spin" size={15} />
                        Building carrier trip…
                      </>
                    ) : (
                      <>
                        <FiCheck className="mr-2" size={15} />
                        Confirm carrier trip ({totals.totalCustomers}{' '}
                        {totals.totalCustomers === 1 ? 'customer' : 'customers'})
                      </>
                    )}
                  </Button>

                  {fieldErrors.orderIds && (
                    <p className="text-center text-[11px] text-rose-600">{fieldErrors.orderIds}</p>
                  )}
                  {fieldErrors.capacity && (
                    <p className="text-center text-[11px] text-rose-600">{fieldErrors.capacity}</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </RoutePlanningBoundary>
  );
};

export default RoutePlanningPage;