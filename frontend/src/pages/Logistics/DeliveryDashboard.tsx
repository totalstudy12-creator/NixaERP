// src/pages/Delivery/DeliveryDashboard.tsx
import React, {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import {
  FiTruck,
  FiCalendar,
  FiMapPin,
  FiNavigation,
  FiDollarSign,
  FiAlertTriangle,
  FiClock,
  FiArrowRight,
  FiRefreshCw,
  FiLoader,
  FiZap,
} from 'react-icons/fi';
import deliveryService, { DeliveryDashboardData } from '../../services/deliveryService';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/* ──────────────────────────────────────────────────────────
 * Safe helpers
 * ──────────────────────────────────────────────────────── */

const safeNum = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const formatINR = (v: unknown, minimumFractionDigits = 0): string => {
  const n = safeNum(v);
  return n.toLocaleString('en-IN', {
    minimumFractionDigits,
    maximumFractionDigits: 2,
  });
};
const formatQty = (v: unknown): string => safeNum(v).toLocaleString('en-IN');

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
    if (status === 403) return 'You do not have permission to view this data.';
    if (status === 404) return 'Delivery dashboard not found.';
    if (status && status >= 500) return 'Server error. Please try again.';
    if (msg) return msg;
  }
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}

/* ──────────────────────────────────────────────────────────
 * Theme
 * ──────────────────────────────────────────────────────── */

type Accent = 'indigo' | 'emerald' | 'rose' | 'amber' | 'violet' | 'teal' | 'sky';

const ACCENTS: Record<Accent, { bg: string; icon: string; ring: string }> = {
  indigo:  { bg: 'bg-indigo-50',  icon: 'text-indigo-600',  ring: 'ring-indigo-500/10' },
  emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600', ring: 'ring-emerald-500/10' },
  rose:    { bg: 'bg-rose-50',    icon: 'text-rose-600',    ring: 'ring-rose-500/10' },
  amber:   { bg: 'bg-amber-50',   icon: 'text-amber-600',   ring: 'ring-amber-500/10' },
  violet:  { bg: 'bg-violet-50',  icon: 'text-violet-600',  ring: 'ring-violet-500/10' },
  teal:    { bg: 'bg-teal-50',    icon: 'text-teal-600',    ring: 'ring-teal-500/10' },
  sky:     { bg: 'bg-sky-50',     icon: 'text-sky-600',     ring: 'ring-sky-500/10' },
};

const TRIP_STATUS_CLASSES: Record<string, string> = {
  in_transit: 'border-blue-200/70 bg-blue-50 text-blue-700',
  dispatched: 'border-blue-200/70 bg-blue-50 text-blue-700',
  closed:     'border-emerald-200/70 bg-emerald-50 text-emerald-700',
  completed:  'border-emerald-200/70 bg-emerald-50 text-emerald-700',
  planned:    'border-amber-200/70 bg-amber-50 text-amber-700',
};
const DEFAULT_STATUS_CLASS = 'border-slate-200 bg-slate-50 text-slate-600';

/* ──────────────────────────────────────────────────────────
 * StatCard
 * ──────────────────────────────────────────────────────── */

const StatCard = React.memo(function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  accent = 'indigo',
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  accent?: Accent;
}) {
  const s = ACCENTS[accent];
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300/80 hover:shadow-[0_8px_24px_-12px_rgba(15,23,42,0.15)] sm:p-4">
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:text-[11px]">
            {label}
          </p>
          <p className="mt-1.5 truncate text-lg font-bold tracking-tight text-slate-900 sm:mt-2 sm:text-xl lg:text-2xl">
            {value}
          </p>
          {hint && (
            <p className="mt-1 truncate text-[10px] text-slate-500 sm:text-[11px]">{hint}</p>
          )}
        </div>
        <div
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl sm:h-10 sm:w-10 ${s.bg} ring-1 ${s.ring}`}
        >
          <Icon size={16} className={`sm:hidden ${s.icon}`} />
          <Icon size={18} className={`hidden sm:block ${s.icon}`} />
        </div>
      </div>
    </div>
  );
});
StatCard.displayName = 'StatCard';

/* ──────────────────────────────────────────────────────────
 * Error Boundary
 * ──────────────────────────────────────────────────────── */

interface BoundaryState { hasError: boolean; message?: string }
class DeliveryDashboardBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { hasError: false };
  static getDerivedStateFromError(err: unknown): BoundaryState {
    return {
      hasError: true,
      message: err instanceof Error ? err.message : 'Unexpected render error.',
    };
  }
  componentDidCatch(err: unknown) {
    // eslint-disable-next-line no-console
    console.error('[DeliveryDashboard] crashed', err);
  }
  reset = () => this.setState({ hasError: false, message: undefined });
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[400px] items-center justify-center p-6">
          <div className="max-w-md rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center sm:p-8">
            <FiAlertTriangle className="mx-auto mb-3 text-rose-600" size={32} />
            <h2 className="text-base font-bold text-slate-900 sm:text-lg">
              Something went wrong
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {this.state.message || 'Unable to render the delivery dashboard.'}
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

/* ──────────────────────────────────────────────────────────
 * Skeletons
 * ──────────────────────────────────────────────────────── */

const StatSkeleton = () => (
  <div className="animate-pulse rounded-2xl border border-slate-200/80 bg-white p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1 space-y-2">
        <div className="h-3 w-24 rounded bg-slate-200" />
        <div className="h-6 w-16 rounded bg-slate-200" />
      </div>
      <div className="h-10 w-10 rounded-xl bg-slate-200" />
    </div>
  </div>
);

const HeroSkeleton = () => (
  <div className="animate-pulse rounded-2xl border border-slate-800/10 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-5 py-6 sm:px-7 lg:px-8">
    <div className="h-3 w-32 rounded bg-white/10" />
    <div className="mt-3 h-7 w-72 max-w-full rounded bg-white/10" />
    <div className="mt-2 h-3 w-full max-w-md rounded bg-white/10" />
  </div>
);

const AutoRefreshOptions = [
  { value: 0, label: 'Off' },
  { value: 30_000, label: '30s' },
  { value: 60_000, label: '1m' },
  { value: 300_000, label: '5m' },
] as const;

/* ──────────────────────────────────────────────────────────
 * Component
 * ──────────────────────────────────────────────────────── */

export const DeliveryDashboard: React.FC = () => {
  const [data, setData] = useState<DeliveryDashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [autoRefreshMs, setAutoRefreshMs] = useState<number>(0);

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const fetchDashboard = useCallback(
    async (mode: 'initial' | 'refresh' = 'refresh') => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (mode === 'initial') setLoading(true);
      else setRefreshing(true);
      setError(null);

      try {
        const res = await deliveryService.getDashboard();
        if (controller.signal.aborted || !mountedRef.current) return;
        setData(res?.data ?? null);
        setLastUpdated(new Date());
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(getApiErrorMessage(err, 'Failed to load delivery metrics.'));
      } finally {
        if (mountedRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    mountedRef.current = true;
    void fetchDashboard('initial');
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, [fetchDashboard]);

  useEffect(() => {
    if (!autoRefreshMs || autoRefreshMs <= 0) return;
    const id = window.setInterval(() => {
      void fetchDashboard('refresh');
    }, autoRefreshMs);
    return () => window.clearInterval(id);
  }, [autoRefreshMs, fetchDashboard]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta || e.key.toLowerCase() !== 'r') return;
      e.preventDefault();
      if (!refreshing && !loading) void fetchDashboard('refresh');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fetchDashboard, refreshing, loading]);

  const metrics = useMemo(() => {
    const m = data?.metrics;
    return {
      scheduledToday: safeNum(m?.scheduled_today),
      completedToday: safeNum(m?.completed_today),
      pendingDeliveries: safeNum(m?.pending_deliveries),
      overdueDeliveries: safeNum(m?.overdue_deliveries),
      activeTrips: safeNum(m?.active_trips),
      dispatchedTrips: safeNum(m?.dispatched_trips),
      totalTransportExpenditure: safeNum(m?.total_transport_expenditure),
      totalAllocatedCost: safeNum(m?.total_allocated_cost),
      availableVehicles: safeNum(m?.available_vehicles),
      onTripVehicles: safeNum(m?.on_trip_vehicles),
      underMaintenanceVehicles: safeNum(m?.under_maintenance_vehicles),
    };
  }, [data]);

  const areaRows = useMemo(() => data?.area_breakdown ?? [], [data]);
  const recentTrips = useMemo(() => data?.recent_trips ?? [], [data]);

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdated) return '—';
    return lastUpdated.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }, [lastUpdated]);

  const totalFleetCount =
    metrics.availableVehicles + metrics.onTripVehicles + metrics.underMaintenanceVehicles;

  /* ── Initial loading ── */
  if (loading) {
    return (
      <div className="min-h-full bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100/60">
        <div className="mx-auto w-full max-w-[1500px] space-y-4 p-3 sm:space-y-5 sm:p-4 lg:p-5 xl:p-6">
          <HeroSkeleton />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatSkeleton /><StatSkeleton /><StatSkeleton /><StatSkeleton />
          </div>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="h-64 animate-pulse rounded-2xl bg-slate-200 xl:col-span-2" />
            <div className="h-64 animate-pulse rounded-2xl bg-slate-200" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <DeliveryDashboardBoundary>
      <div className="min-h-full bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100/60">
        <div className="mx-auto w-full max-w-[1500px] space-y-4 p-3 sm:space-y-5 sm:p-4 lg:p-5 xl:p-6">

          {/* ════════════════════════════════════════════════
           * HERO
           * ════════════════════════════════════════════════ */}
          <section className="relative overflow-hidden rounded-2xl border border-slate-800/10 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-4 py-5 shadow-[0_20px_40px_-20px_rgba(15,23,42,0.45)] sm:px-6 sm:py-6 lg:px-7">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />

            <div className="relative flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200 backdrop-blur">
                  <FiTruck size={12} /> Logistics · Delivery
                </div>
                <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl xl:text-[30px]">
                  Smart Delivery &amp; Route Logistics
                </h1>
                <p className="mt-1.5 max-w-2xl text-xs text-slate-300 sm:text-sm">
                  Wholesale multi-customer carrier trips, area planning, godown loading &amp;
                  transport cost allocation.
                </p>
                <p className="mt-1 text-[10px] text-slate-400 sm:text-[11px]">
                  Last updated:{' '}
                  <span className="font-medium text-slate-200">{lastUpdatedLabel}</span>
                </p>
              </div>

              {/* Action buttons — fluid: stacked full-width on mobile, inline from md */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-auto">
                  <FiZap
                    size={13}
                    className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${
                      autoRefreshMs > 0 ? 'text-emerald-300' : 'text-slate-400'
                    }`}
                  />
                  <select
                    aria-label="Auto-refresh interval"
                    value={autoRefreshMs}
                    onChange={(e) => setAutoRefreshMs(Number(e.target.value))}
                    className="h-10 w-full appearance-none rounded-xl border border-white/10 bg-white/5 pl-8 pr-8 text-xs font-semibold text-white backdrop-blur transition hover:bg-white/10 focus:outline-none sm:w-auto"
                  >
                    {AutoRefreshOptions.map((o) => (
                      <option key={o.value} value={o.value} className="text-slate-800">
                        Auto: {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void fetchDashboard('refresh')}
                  disabled={refreshing || loading}
                  title="Refresh (Ctrl+R)"
                  className="h-10 flex-1 rounded-xl border-white/10 bg-white/5 text-white shadow-none backdrop-blur transition hover:border-white/20 hover:bg-white/10 hover:text-white disabled:opacity-50 sm:flex-none"
                >
                  {refreshing ? (
                    <FiLoader className="mr-2 animate-spin" size={14} />
                  ) : (
                    <FiRefreshCw className="mr-2" size={14} />
                  )}
                  <span className="truncate">{refreshing ? 'Refreshing…' : 'Refresh'}</span>
                </Button>

                <Link
                  to="/deliveries/routes"
                  className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-cyan-300 to-cyan-400 px-4 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:from-cyan-200 hover:to-cyan-300 sm:flex-none"
                >
                  <FiNavigation size={14} />
                  <span className="truncate">Plan Trip</span>
                </Link>
              </div>
            </div>

            {/* Hero mini stats */}
            <div className="relative mt-5 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-white/5 p-2.5 sm:p-3">
                <p className="text-[9px] uppercase tracking-wide text-slate-400 sm:text-[10px]">
                  Scheduled today
                </p>
                <p className="mt-0.5 text-xs font-bold text-sky-300 sm:mt-1 sm:text-sm">
                  {metrics.scheduledToday}
                  <span className="ml-1 text-[9px] font-medium text-slate-400 sm:text-[10px]">
                    / {metrics.completedToday} done
                  </span>
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-2.5 sm:p-3">
                <p className="text-[9px] uppercase tracking-wide text-slate-400 sm:text-[10px]">
                  Pending
                </p>
                <p className="mt-0.5 text-xs font-bold text-amber-300 sm:mt-1 sm:text-sm">
                  {metrics.pendingDeliveries}
                  <span className="ml-1 text-[9px] font-medium text-rose-300 sm:text-[10px]">
                    ({metrics.overdueDeliveries} late)
                  </span>
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-2.5 sm:p-3">
                <p className="text-[9px] uppercase tracking-wide text-slate-400 sm:text-[10px]">
                  Active trips
                </p>
                <p className="mt-0.5 text-xs font-bold text-emerald-300 sm:mt-1 sm:text-sm">
                  {metrics.activeTrips}
                  <span className="ml-1 text-[9px] font-medium text-slate-400 sm:text-[10px]">
                    / {metrics.dispatchedTrips} road
                  </span>
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-2.5 sm:p-3">
                <p className="text-[9px] uppercase tracking-wide text-slate-400 sm:text-[10px]">
                  Expenditure
                </p>
                <p className="mt-0.5 truncate text-xs font-bold text-violet-300 sm:mt-1 sm:text-sm">
                  ₹{formatINR(metrics.totalTransportExpenditure)}
                </p>
              </div>
            </div>
          </section>

          {/* ── Error ── */}
          {error && (
            <div
              role="alert"
              aria-live="polite"
              className="flex flex-col gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-rose-700 sm:flex-row sm:items-start sm:gap-3 sm:p-4"
            >
              <div className="flex items-start gap-2 sm:flex-1">
                <FiAlertTriangle className="mt-0.5 shrink-0" size={18} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Could not load dashboard</p>
                  <p className="text-xs sm:text-sm">{error}</p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => void fetchDashboard('refresh')}
                className="w-full shrink-0 rounded-xl border-rose-300 bg-white text-xs font-semibold text-rose-700 hover:bg-rose-50 sm:w-auto"
              >
                Retry
              </Button>
            </div>
          )}

          {/* ════════════════════════════════════════════════
           * KPI CARDS
           * 1 col → 2 col → 4 col (only at xl: 1280px)
           * ════════════════════════════════════════════════ */}
          <section className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3 md:gap-4 xl:grid-cols-4">
            <StatCard
              icon={FiCalendar}
              label="Scheduled Today"
              value={metrics.scheduledToday}
              hint={`Completed: ${metrics.completedToday}`}
              accent="sky"
            />
            <StatCard
              icon={FiClock}
              label="Pending Deliveries"
              value={metrics.pendingDeliveries}
              hint={
                <span className="text-rose-600">
                  {metrics.overdueDeliveries} overdue
                </span>
              }
              accent="amber"
            />
            <StatCard
              icon={FiTruck}
              label="Active Carrier Trips"
              value={metrics.activeTrips}
              hint={`${metrics.dispatchedTrips} on road`}
              accent="emerald"
            />
            <StatCard
              icon={FiDollarSign}
              label="Transport Expenditure"
              value={`₹${formatINR(metrics.totalTransportExpenditure)}`}
              hint={`Allocated: ₹${formatINR(metrics.totalAllocatedCost)}`}
              accent="violet"
            />
          </section>

          {/* ════════════════════════════════════════════════
           * AREA BACKLOG + FLEET
           * stacked < xl, 3-col at xl (2:1 ratio)
           * ════════════════════════════════════════════════ */}
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-3 xl:gap-6">
            {/* ── Area Backlog ── */}
            <Card className="min-w-0 overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] xl:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-slate-100 bg-white px-3 py-3 sm:px-5 sm:py-4">
                <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600 ring-1 ring-indigo-500/10">
                    <FiMapPin size={14} />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="truncate text-xs font-semibold text-slate-800 sm:text-sm">
                      Town &amp; Area Delivery Backlog
                    </CardTitle>
                    <CardDescription className="truncate text-[10px] text-slate-500 sm:text-[11px]">
                      {areaRows.length > 0
                        ? `${areaRows.length} area${areaRows.length === 1 ? '' : 's'} with pending deliveries`
                        : 'No pending area deliveries'}
                    </CardDescription>
                  </div>
                </div>
                <Link
                  to="/deliveries/routes"
                  className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 sm:text-xs"
                >
                  <span className="hidden sm:inline">Group into trip</span>
                  <span className="sm:hidden">Group</span>
                  <FiArrowRight size={13} />
                </Link>
              </CardHeader>

              {/* ── Table view (lg+) ── */}
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50/70 text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold lg:px-5">Town / Area</th>
                      <th className="px-4 py-3 font-semibold lg:px-5">District</th>
                      <th className="px-4 py-3 text-center font-semibold lg:px-5">Pending</th>
                      <th className="px-4 py-3 text-right font-semibold lg:px-5">Quantity</th>
                      <th className="px-4 py-3 text-right font-semibold lg:px-5">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {areaRows.length > 0 ? (
                      areaRows.map((row, idx) => (
                        <tr
                          key={`${row.town ?? 'area'}-${idx}`}
                          className="transition-colors hover:bg-slate-50/70"
                        >
                          <td className="px-4 py-3.5 lg:px-5">
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-2 shrink-0 rounded-full bg-indigo-500" />
                              <span className="truncate font-semibold text-slate-900">
                                {row.town || 'Nearby Local Area'}
                              </span>
                            </div>
                          </td>
                          <td className="truncate px-4 py-3.5 text-xs text-slate-600 lg:px-5">
                            {row.district || 'Nawada'}
                          </td>
                          <td className="px-4 py-3.5 text-center lg:px-5">
                            <Badge
                              variant="outline"
                              className="rounded-full border border-amber-200/70 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700"
                            >
                              {safeNum(row.count)} orders
                            </Badge>
                          </td>
                          <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-slate-900 lg:px-5">
                            {formatQty(row.total_qty)} pcs
                          </td>
                          <td className="px-4 py-3.5 text-right lg:px-5">
                            <Link
                              to={`/deliveries/routes?town=${encodeURIComponent(row.town ?? '')}`}
                              className="text-xs font-semibold text-indigo-600 hover:underline"
                            >
                              Plan carrier
                            </Link>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-14 text-center text-sm text-slate-400">
                          No pending area deliveries currently queued.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* ── Card view (up to lg) ── */}
              <div className="divide-y divide-slate-100 lg:hidden">
                {areaRows.length > 0 ? (
                  areaRows.map((row, idx) => (
                    <div key={`${row.town ?? 'area'}-${idx}`} className="p-3 sm:p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {row.town || 'Nearby Local Area'}
                            </p>
                          </div>
                          <p className="mt-0.5 truncate text-[11px] text-slate-500">
                            {row.district || 'Nawada'}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className="shrink-0 rounded-full border border-amber-200/70 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
                        >
                          {safeNum(row.count)}
                        </Badge>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <p className="text-[11px] text-slate-500">
                          Qty:{' '}
                          <span className="font-semibold text-slate-800">
                            {formatQty(row.total_qty)} pcs
                          </span>
                        </p>
                        <Link
                          to={`/deliveries/routes?town=${encodeURIComponent(row.town ?? '')}`}
                          className="text-[11px] font-semibold text-indigo-600 hover:underline"
                        >
                          Plan →
                        </Link>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-xs text-slate-400">
                    No pending area deliveries currently queued.
                  </div>
                )}
              </div>
            </Card>

            {/* ── Fleet status ── */}
            <Card className="min-w-0 rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-slate-100 bg-white px-3 py-3 sm:px-5 sm:py-4">
                <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                    <FiTruck size={14} />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="truncate text-xs font-semibold text-slate-800 sm:text-sm">
                      Carrier Fleet Status
                    </CardTitle>
                    <CardDescription className="truncate text-[10px] text-slate-500 sm:text-[11px]">
                      {totalFleetCount} vehicle{totalFleetCount === 1 ? '' : 's'} tracked
                    </CardDescription>
                  </div>
                </div>
                <Link
                  to="/deliveries/vehicles"
                  className="shrink-0 text-[11px] font-semibold text-indigo-600 hover:underline sm:text-xs"
                >
                  Manage
                </Link>
              </CardHeader>

              <CardContent className="space-y-2 p-3 sm:space-y-2.5 sm:p-5">
                <div className="flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2 sm:py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" />
                    <span className="truncate text-xs font-medium text-slate-700 sm:text-sm">
                      Available
                    </span>
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-emerald-700">
                    {metrics.availableVehicles}
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2 sm:py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-blue-500" />
                    <span className="truncate text-xs font-medium text-slate-700 sm:text-sm">
                      On Trip
                    </span>
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-blue-700">
                    {metrics.onTripVehicles}
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-rose-100 bg-rose-50/60 px-3 py-2 sm:py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500" />
                    <span className="truncate text-xs font-medium text-slate-700 sm:text-sm">
                      Maintenance
                    </span>
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-rose-700">
                    {metrics.underMaintenanceVehicles}
                  </span>
                </div>

                <div className="border-t border-slate-100 pt-3">
                  <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:text-[11px]">
                    Logistics Quick Links
                  </h3>
                  <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                    <Link
                      to="/deliveries/loading"
                      className="rounded-xl border border-slate-200 bg-white p-2 text-center text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 sm:p-2.5 sm:text-xs"
                    >
                      Godown
                    </Link>
                    <Link
                      to="/deliveries/calendar"
                      className="rounded-xl border border-slate-200 bg-white p-2 text-center text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 sm:p-2.5 sm:text-xs"
                    >
                      Calendar
                    </Link>
                    <Link
                      to="/deliveries/drivers"
                      className="rounded-xl border border-slate-200 bg-white p-2 text-center text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 sm:p-2.5 sm:text-xs"
                    >
                      Drivers
                    </Link>
                    <Link
                      to="/deliveries/reports"
                      className="rounded-xl border border-slate-200 bg-white p-2 text-center text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 sm:p-2.5 sm:text-xs"
                    >
                      Reports
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ════════════════════════════════════════════════
           * RECENT TRIPS — card up to xl, table at xl+
           * ════════════════════════════════════════════════ */}
          <Card className="min-w-0 overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-slate-100 bg-white px-3 py-3 sm:px-5 sm:py-4">
              <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                  <FiNavigation size={14} />
                </div>
                <div className="min-w-0">
                  <CardTitle className="truncate text-xs font-semibold text-slate-800 sm:text-sm">
                    Recent Multi-Customer Trips
                  </CardTitle>
                  <CardDescription className="truncate text-[10px] text-slate-500 sm:text-[11px]">
                    {recentTrips.length > 0
                      ? `${recentTrips.length} recent trip${recentTrips.length === 1 ? '' : 's'}`
                      : 'No trips recorded yet'}
                  </CardDescription>
                </div>
              </div>
              <Link
                to="/deliveries/trips"
                className="shrink-0 text-[11px] font-semibold text-indigo-600 hover:underline sm:text-xs"
              >
                View all
              </Link>
            </CardHeader>

            {/* ── Table view (xl+) ── */}
            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50/70 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Trip ID</th>
                    <th className="px-5 py-3 font-semibold">Vehicle</th>
                    <th className="px-5 py-3 font-semibold">Driver</th>
                    <th className="px-5 py-3 font-semibold">Planned Date</th>
                    <th className="px-5 py-3 text-center font-semibold">Stops</th>
                    <th className="px-5 py-3 text-center font-semibold">Status</th>
                    <th className="px-5 py-3 text-right font-semibold">Cost</th>
                    <th className="px-5 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentTrips.length > 0 ? (
                    recentTrips.map((trip) => {
                      const statusKey = String(trip.status ?? '').toLowerCase();
                      const statusClass =
                        TRIP_STATUS_CLASSES[statusKey] ?? DEFAULT_STATUS_CLASS;
                      return (
                        <tr
                          key={trip.id}
                          className="transition-colors hover:bg-slate-50/70"
                        >
                          <td className="px-5 py-3.5">
                            <Link
                              to={`/deliveries/trips?id=${trip.id}`}
                              className="font-semibold text-indigo-600 hover:underline"
                            >
                              {trip.trip_code ?? `#${trip.id}`}
                            </Link>
                          </td>
                          <td className="px-5 py-3.5 text-slate-700">
                            {trip.vehicle ? (
                              <>
                                <span className="font-medium text-slate-900">
                                  {trip.vehicle.name ?? '—'}
                                </span>
                                {trip.vehicle.registration_number && (
                                  <span className="ml-1 font-mono text-[11px] text-slate-500">
                                    ({trip.vehicle.registration_number})
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-slate-400">Unassigned</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-slate-600">
                            {trip.driver?.name ?? (
                              <span className="text-slate-400">Unassigned</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-xs text-slate-600">
                            {trip.planned_date ?? '—'}
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                              {safeNum(trip.total_customers)}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <Badge
                              variant="outline"
                              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize ${statusClass}`}
                            >
                              {(trip.status ?? 'unknown').replace(/_/g, ' ')}
                            </Badge>
                          </td>
                          <td className="px-5 py-3.5 text-right font-semibold tabular-nums text-slate-900">
                            ₹{formatINR(trip.transport_cost)}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <Link
                              to={`/deliveries/trips?id=${trip.id}`}
                              className="text-xs font-semibold text-indigo-600 hover:underline"
                            >
                              Details
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-14 text-center">
                        <div className="mx-auto max-w-md px-4">
                          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-slate-200/70">
                            <FiTruck className="h-6 w-6 text-slate-400" />
                          </div>
                          <p className="mt-4 text-base font-semibold text-slate-800">
                            No trips recorded yet
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            Click &ldquo;Plan Multi-Customer Trip&rdquo; to create your first trip.
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* ── Card view (up to xl) ── */}
            <div className="divide-y divide-slate-100 xl:hidden">
              {recentTrips.length > 0 ? (
                recentTrips.map((trip) => {
                  const statusKey = String(trip.status ?? '').toLowerCase();
                  const statusClass =
                    TRIP_STATUS_CLASSES[statusKey] ?? DEFAULT_STATUS_CLASS;
                  return (
                    <Link
                      key={trip.id}
                      to={`/deliveries/trips?id=${trip.id}`}
                      className="block p-3 transition-colors hover:bg-slate-50/70 sm:p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-indigo-600">
                              {trip.trip_code ?? `#${trip.id}`}
                            </p>
                            <Badge
                              variant="outline"
                              className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${statusClass}`}
                            >
                              {(trip.status ?? 'unknown').replace(/_/g, ' ')}
                            </Badge>
                          </div>
                          <p className="mt-1 truncate text-xs text-slate-700">
                            {trip.vehicle ? (
                              <>
                                <span className="font-medium">{trip.vehicle.name ?? '—'}</span>
                                {trip.vehicle.registration_number && (
                                  <span className="ml-1 font-mono text-[10px] text-slate-500">
                                    ({trip.vehicle.registration_number})
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-slate-400">Unassigned vehicle</span>
                            )}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-slate-500">
                            Driver: {trip.driver?.name ?? '—'} · {trip.planned_date ?? 'No date'}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-bold tabular-nums text-slate-900">
                            ₹{formatINR(trip.transport_cost)}
                          </p>
                          <p className="mt-0.5 text-[10px] text-slate-500">
                            {safeNum(trip.total_customers)} stops
                          </p>
                        </div>
                      </div>
                    </Link>
                  );
                })
              ) : (
                <div className="p-8 text-center">
                  <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-slate-200/70">
                    <FiTruck className="h-5 w-5 text-slate-400" />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-800">No trips yet</p>
                  <p className="mt-1 text-xs text-slate-500">Plan a trip to get started.</p>
                  <Link
                    to="/deliveries/routes"
                    className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700"
                  >
                    <FiNavigation size={12} /> Plan a trip
                  </Link>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </DeliveryDashboardBoundary>
  );
};

export default DeliveryDashboard;