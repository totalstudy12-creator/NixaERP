// src/pages/Delivery/DeliveryReportsPage.tsx
import React, {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  FiFileText,
  FiDownload,
  FiCalendar,
  FiRefreshCw,
  FiFilter,
  FiMapPin,
  FiTruck,
  FiDollarSign,
  FiAlertTriangle,
  FiClock,
  FiLoader,
  FiX,
  FiChevronLeft,
  FiChevronRight,
  FiInbox,
} from 'react-icons/fi';
import deliveryService from '../../services/deliveryService';
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

type ReportType =
  | 'daily'
  | 'pending'
  | 'overdue'
  | 'trips'
  | 'vehicle_utilization'
  | 'transport_costs'
  | 'area_wise';

type DatePresetKey =
  | 'today'
  | 'yesterday'
  | '7d'
  | '30d'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'custom';

interface DeliveryReportOrder {
  id: number | string;
  delivery_order_no?: string;
  invoice_id?: number | string;
  invoice?: { invoice_no?: string };
  recipient_name?: string;
  recipient_phone?: string;
  town?: string;
  district?: string;
  expected_delivery_date?: string;
  total_quantity?: number | string;
  status?: string;
}

interface DeliveryReportTrip {
  id: number | string;
  trip_code?: string;
  vehicle?: { name?: string; registration_number?: string };
  driver?: { name?: string };
  planned_date?: string;
  total_customers?: number | string;
  total_quantity?: number | string;
  transport_cost?: number | string;
  status?: string;
}

interface DeliveryReportVehicle {
  id: number | string;
  vehicle_code?: string;
  registration_number?: string;
  name?: string;
  type?: string;
  max_capacity?: number | string;
  capacity_unit?: string;
  total_trips?: number | string;
  completed_trips?: number | string;
  status?: string;
}

interface DeliveryReportTripCost {
  id: number | string;
  trip_code?: string;
  vehicle?: { name?: string; registration_number?: string };
  planned_date?: string;
  transport_cost?: number | string;
  cost_allocation_status?: string;
  cost_allocations?: unknown[];
}

interface DeliveryReportArea {
  town?: string;
  district?: string;
  order_count?: number | string;
  total_qty?: number | string;
  total_charges?: number | string;
}

type ReportRow =
  | DeliveryReportOrder
  | DeliveryReportTrip
  | DeliveryReportVehicle
  | DeliveryReportTripCost
  | DeliveryReportArea;

/* ══════════════════════════════════════════════════════════
 * Constants
 * ════════════════════════════════════════════════════════ */

const DATE_PRESETS: { key: DatePresetKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'this_year', label: 'This year' },
  { key: 'custom', label: 'Custom range' },
];

const REPORT_OPTIONS: Array<{
  id: ReportType;
  name: string;
  short: string;
  icon: React.ElementType;
  usesSingleDate: boolean;
}> = [
  { id: 'daily', name: 'Daily Deliveries', short: 'Daily', icon: FiCalendar, usesSingleDate: true },
  { id: 'pending', name: 'Pending Orders', short: 'Pending', icon: FiClock, usesSingleDate: false },
  { id: 'overdue', name: 'Overdue Deliveries', short: 'Overdue', icon: FiAlertTriangle, usesSingleDate: false },
  { id: 'trips', name: 'Carrier Trips', short: 'Trips', icon: FiTruck, usesSingleDate: false },
  { id: 'vehicle_utilization', name: 'Vehicle Utilization', short: 'Vehicles', icon: FiTruck, usesSingleDate: false },
  { id: 'transport_costs', name: 'Transport Costs', short: 'Costs', icon: FiDollarSign, usesSingleDate: false },
  { id: 'area_wise', name: 'Area & Town', short: 'Areas', icon: FiMapPin, usesSingleDate: false },
];

const STATUS_BADGE_CLASSES: Record<string, string> = {
  delivered: 'border-emerald-200/70 bg-emerald-50 text-emerald-700',
  partially_delivered: 'border-blue-200/70 bg-blue-50 text-blue-700',
  dispatched: 'border-purple-200/70 bg-purple-50 text-purple-700',
  delivery_failed: 'border-rose-200/70 bg-rose-50 text-rose-700',
  cancelled: 'border-slate-200 bg-slate-50 text-slate-600',
  scheduled: 'border-amber-200/70 bg-amber-50 text-amber-700',
  delivery_pending: 'border-amber-200/70 bg-amber-50 text-amber-700',
  available: 'border-emerald-200/70 bg-emerald-50 text-emerald-700',
  on_trip: 'border-blue-200/70 bg-blue-50 text-blue-700',
  under_maintenance: 'border-rose-200/70 bg-rose-50 text-rose-700',
  planned: 'border-amber-200/70 bg-amber-50 text-amber-700',
  in_transit: 'border-purple-200/70 bg-purple-50 text-purple-700',
  completed: 'border-emerald-200/70 bg-emerald-50 text-emerald-700',
  closed: 'border-emerald-200/70 bg-emerald-50 text-emerald-700',
};

/* ══════════════════════════════════════════════════════════
 * Helpers
 * ════════════════════════════════════════════════════════ */

const safeNum = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const formatINR = (v: unknown, decimals = 0): string => {
  const n = safeNum(v);
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: 2,
  });
};

const formatQty = (v: unknown): string => safeNum(v).toLocaleString('en-IN');

/** Local timezone-safe ISO date helper. */
const toLocalISO = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const todayLocalISO = () => toLocalISO(new Date());

const isValidISODate = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(v + 'T00:00:00').getTime());

function presetToRange(preset: DatePresetKey): { date: string; from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case 'today':
      return { date: toLocalISO(now), from: toLocalISO(now), to: toLocalISO(now) };
    case 'yesterday': {
      const d = new Date(now); d.setDate(d.getDate() - 1);
      return { date: toLocalISO(d), from: toLocalISO(d), to: toLocalISO(d) };
    }
    case '7d': {
      const from = new Date(now); from.setDate(from.getDate() - 6);
      return { date: toLocalISO(now), from: toLocalISO(from), to: toLocalISO(now) };
    }
    case '30d': {
      const from = new Date(now); from.setDate(from.getDate() - 29);
      return { date: toLocalISO(now), from: toLocalISO(from), to: toLocalISO(now) };
    }
    case 'this_month':
      return {
        date: toLocalISO(now),
        from: toLocalISO(new Date(y, m, 1)),
        to: toLocalISO(new Date(y, m + 1, 0)),
      };
    case 'last_month':
      return {
        date: toLocalISO(new Date(y, m - 1, 1)),
        from: toLocalISO(new Date(y, m - 1, 1)),
        to: toLocalISO(new Date(y, m, 0)),
      };
    case 'this_year':
      return {
        date: toLocalISO(now),
        from: toLocalISO(new Date(y, 0, 1)),
        to: toLocalISO(now),
      };
    case 'custom':
    default:
      return {
        date: toLocalISO(now),
        from: toLocalISO(new Date(y, m, 1)),
        to: toLocalISO(new Date(y, m + 1, 0)),
      };
  }
}

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
    if (status === 404) return 'Report endpoint not found.';
    if (status && status >= 500) return 'Server error. Please try again.';
    if (msg) return msg;
  }
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return v;
}

/* ══════════════════════════════════════════════════════════
 * Error Boundary
 * ════════════════════════════════════════════════════════ */

interface BoundaryState { hasError: boolean; message?: string }
class DeliveryReportsBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { hasError: false };
  static getDerivedStateFromError(err: unknown): BoundaryState {
    return {
      hasError: true,
      message: err instanceof Error ? err.message : 'Unexpected error.',
    };
  }
  componentDidCatch(err: unknown) {
    // eslint-disable-next-line no-console
    console.error('[DeliveryReportsPage]', err);
  }
  reset = () => this.setState({ hasError: false, message: undefined });
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[400px] items-center justify-center p-6">
          <div className="max-w-md rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
            <FiAlertTriangle className="mx-auto mb-3 text-rose-600" size={32} />
            <h2 className="text-base font-bold text-slate-900">Something went wrong</h2>
            <p className="mt-1 text-sm text-slate-600">{this.state.message || 'Unable to render reports.'}</p>
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

const StatusBadge = React.memo(({ status }: { status?: string | null }) => {
  const raw = String(status ?? '').toLowerCase();
  const cls = STATUS_BADGE_CLASSES[raw] ?? 'border-slate-200 bg-slate-50 text-slate-600';
  const label = raw ? raw.replace(/_/g, ' ') : 'unknown';
  return (
    <Badge
      variant="outline"
      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize ${cls}`}
    >
      {label}
    </Badge>
  );
});
StatusBadge.displayName = 'StatusBadge';

const TableLoader = ({ cols }: { cols: number }) => (
  <tbody>
    {Array.from({ length: 5 }).map((_, r) => (
      <tr key={r} className="border-t border-slate-100">
        {Array.from({ length: cols }).map((__, c) => (
          <td key={c} className="px-5 py-3.5">
            <div className="h-4 animate-pulse rounded bg-slate-100" />
          </td>
        ))}
      </tr>
    ))}
  </tbody>
);

const EmptyState = ({ message }: { message: string }) => (
  <div className="py-14 text-center">
    <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-slate-200/70">
      <FiInbox className="h-6 w-6 text-slate-400" />
    </div>
    <p className="mt-4 text-sm font-semibold text-slate-800">No records</p>
    <p className="mt-1 text-xs text-slate-500">{message}</p>
  </div>
);

/* ══════════════════════════════════════════════════════════
 * Main component
 * ════════════════════════════════════════════════════════ */

export const DeliveryReportsPage: React.FC = () => {
  const { showError, showSuccess } = useNotification();
  const { can, isSuperAdmin } = usePermission();
  const loadingUser = useAuthStore((s) => s.loadingUser);
  const hasUser = useAuthStore((s) => Boolean(s.user));

  /* ── Permissions ── */
  const canViewReports = isSuperAdmin || can('view deliveries') || can('view delivery reports');
  const canExportReports = isSuperAdmin || can('export deliveries') || can('export delivery reports');

  /* ── Report type ── */
  const [reportType, setReportType] = useState<ReportType>('daily');

  /* ── Dates ── */
  const [datePreset, setDatePreset] = useState<DatePresetKey>('this_month');
  const initialRange = useMemo(() => presetToRange('this_month'), []);
  const [date, setDate] = useState<string>(initialRange.date);
  const [startDate, setStartDate] = useState<string>(initialRange.from);
  const [endDate, setEndDate] = useState<string>(initialRange.to);

  /* ── Data / state ── */
  const [reportData, setReportData] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  /* ── Debounce date inputs so typing doesn't hammer the API ── */
  const debouncedDate = useDebouncedValue(date, 300);
  const debouncedStart = useDebouncedValue(startDate, 300);
  const debouncedEnd = useDebouncedValue(endDate, 300);

  /* ── Date range validation ── */
  useEffect(() => {
    if (debouncedStart && debouncedEnd && debouncedStart > debouncedEnd) {
      showError('Invalid range', '"From" is after "To" — corrected automatically.');
      setEndDate(debouncedStart);
    }
  }, [debouncedStart, debouncedEnd, showError]);

  /* ── Preset change handler ── */
  const handlePresetChange = useCallback((preset: DatePresetKey) => {
    setDatePreset(preset);
    if (preset !== 'custom') {
      const r = presetToRange(preset);
      setDate(r.date);
      setStartDate(r.from);
      setEndDate(r.to);
    }
  }, []);

  /* ── Fetch report ── */
  const fetchReport = useCallback(async () => {
    if (!canViewReports) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError(null);

    try {
      const res = await deliveryService.getReports({
        type: reportType,
        date: isValidISODate(debouncedDate) ? debouncedDate : undefined,
        start_date: isValidISODate(debouncedStart) ? debouncedStart : undefined,
        end_date: isValidISODate(debouncedEnd) ? debouncedEnd : undefined,
      });
      if (ctrl.signal.aborted || !mountedRef.current) return;

      const rows = Array.isArray((res as any)?.data)
        ? ((res as any).data as ReportRow[])
        : [];
      setReportData(rows);
      setLastUpdated(new Date());
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setError(getApiErrorMessage(err, 'Could not load report.'));
      setReportData([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [canViewReports, reportType, debouncedDate, debouncedStart, debouncedEnd]);

  useEffect(() => {
    void fetchReport();
  }, [fetchReport]);

  /* ── Ctrl/Cmd + R ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta || e.key.toLowerCase() !== 'r') return;
      e.preventDefault();
      if (!loading) void fetchReport();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fetchReport, loading]);

  /* ── Export ── */
  const handleExport = useCallback(async () => {
    if (!canExportReports) {
      showError('Permission denied', 'You do not have permission to export reports.');
      return;
    }
    setExporting(true);
    try {
      const base = deliveryService.getExportUrl(reportType);
      const sep = base.includes('?') ? '&' : '?';
      const query = [
        `start_date=${encodeURIComponent(startDate)}`,
        `end_date=${encodeURIComponent(endDate)}`,
        `date=${encodeURIComponent(date)}`,
      ].join('&');
      const fullUrl = `${base}${sep}${query}`;

      // Primary: window.open
      const win = window.open(fullUrl, '_blank', 'noopener,noreferrer');
      // Fallback: anchor click (works if popup blocked)
      if (!win) {
        const a = document.createElement('a');
        a.href = fullUrl;
        a.download = `delivery-report-${reportType}-${date}.csv`;
        a.rel = 'noopener noreferrer';
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      showSuccess('Export started', 'Your download should begin shortly.');
    } catch (err) {
      showError('Export failed', getApiErrorMessage(err, 'Could not download report.'));
    } finally {
      setExporting(false);
    }
  }, [canExportReports, reportType, startDate, endDate, date, showSuccess, showError]);

  /* ── Derived ── */
  const currentReport = useMemo(
    () => REPORT_OPTIONS.find((r) => r.id === reportType) ?? REPORT_OPTIONS[0],
    [reportType]
  );

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdated) return '—';
    return lastUpdated.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }, [lastUpdated]);

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
  if (!canViewReports) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <FiAlertTriangle className="mx-auto mb-3 text-rose-600" size={32} />
          <h2 className="text-lg font-bold text-slate-900">Access denied</h2>
          <p className="mt-1.5 text-sm text-slate-500">
            You don't have permission to view delivery reports.
          </p>
        </div>
      </div>
    );
  }

  /* ── Render helpers (desktop table / mobile cards) ── */
  const renderOrdersTable = () => {
    const rows = reportData as DeliveryReportOrder[];
    return (
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50/70 text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-5 py-3 font-semibold">Order / Invoice</th>
            <th className="px-5 py-3 font-semibold">Recipient</th>
            <th className="px-5 py-3 font-semibold">Destination</th>
            <th className="px-5 py-3 font-semibold">Expected</th>
            <th className="px-5 py-3 text-center font-semibold">Qty</th>
            <th className="px-5 py-3 text-center font-semibold">Status</th>
          </tr>
        </thead>
        {loading ? (
          <TableLoader cols={6} />
        ) : rows.length === 0 ? (
          <tbody>
            <tr>
              <td colSpan={6}>
                <EmptyState message="No orders found for this range." />
              </td>
            </tr>
          </tbody>
        ) : (
          <tbody className="divide-y divide-slate-100">
            {rows.map((order) => (
              <tr key={order.id} className="transition-colors hover:bg-slate-50/70">
                <td className="px-5 py-3.5">
                  <p className="font-mono font-semibold text-slate-900">{order.delivery_order_no ?? `#${order.id}`}</p>
                  <p className="text-[11px] font-mono text-indigo-600">
                    {order.invoice?.invoice_no ?? `INV #${order.invoice_id ?? '—'}`}
                  </p>
                </td>
                <td className="px-5 py-3.5">
                  <p className="font-medium text-slate-900">{order.recipient_name ?? '—'}</p>
                  <p className="text-[11px] text-slate-500">{order.recipient_phone ?? '—'}</p>
                </td>
                <td className="px-5 py-3.5">
                  <p className="font-medium text-slate-900">{order.town ?? '—'}</p>
                  <p className="text-[11px] text-slate-500">{order.district ?? '—'}</p>
                </td>
                <td className="px-5 py-3.5 text-xs text-slate-600">{order.expected_delivery_date ?? '—'}</td>
                <td className="px-5 py-3.5 text-center font-semibold tabular-nums text-slate-900">
                  {formatQty(order.total_quantity)} pcs
                </td>
                <td className="px-5 py-3.5 text-center">
                  <StatusBadge status={order.status} />
                </td>
              </tr>
            ))}
          </tbody>
        )}
      </table>
    );
  };

  const renderOrdersCards = () => {
    const rows = reportData as DeliveryReportOrder[];
    if (loading) {
      return (
        <div className="space-y-2 p-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      );
    }
    if (rows.length === 0) return <EmptyState message="No orders found for this range." />;
    return (
      <div className="divide-y divide-slate-100">
        {rows.map((order) => (
          <div key={order.id} className="p-3 sm:p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="truncate font-mono text-sm font-semibold text-slate-900">
                    {order.delivery_order_no ?? `#${order.id}`}
                  </p>
                  <StatusBadge status={order.status} />
                </div>
                <p className="mt-1 truncate text-xs text-slate-700">
                  {order.recipient_name ?? '—'}{order.recipient_phone ? ` · ${order.recipient_phone}` : ''}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-slate-500">
                  {order.town ?? '—'}{order.district ? ` · ${order.district}` : ''}
                </p>
                <p className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
                  <span className="font-mono text-indigo-600">
                    {order.invoice?.invoice_no ?? `INV #${order.invoice_id ?? '—'}`}
                  </span>
                  {order.expected_delivery_date && <span>· {order.expected_delivery_date}</span>}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold tabular-nums text-slate-900">
                  {formatQty(order.total_quantity)} pcs
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderTripsTable = () => {
    const rows = reportData as DeliveryReportTrip[];
    return (
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50/70 text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-5 py-3 font-semibold">Trip</th>
            <th className="px-5 py-3 font-semibold">Vehicle / Driver</th>
            <th className="px-5 py-3 font-semibold">Planned</th>
            <th className="px-5 py-3 text-center font-semibold">Stops</th>
            <th className="px-5 py-3 text-center font-semibold">Qty</th>
            <th className="px-5 py-3 text-right font-semibold">Transport Cost</th>
            <th className="px-5 py-3 text-center font-semibold">Status</th>
          </tr>
        </thead>
        {loading ? (
          <TableLoader cols={7} />
        ) : rows.length === 0 ? (
          <tbody>
            <tr>
              <td colSpan={7}>
                <EmptyState message="No trips found for this range." />
              </td>
            </tr>
          </tbody>
        ) : (
          <tbody className="divide-y divide-slate-100">
            {rows.map((trip) => (
              <tr key={trip.id} className="transition-colors hover:bg-slate-50/70">
                <td className="px-5 py-3.5 font-mono font-semibold text-slate-900">
                  {trip.trip_code ?? `#${trip.id}`}
                </td>
                <td className="px-5 py-3.5">
                  <p className="font-medium text-slate-900">
                    {trip.vehicle?.name ?? 'Unassigned'}
                    {trip.vehicle?.registration_number && (
                      <span className="ml-1 font-mono text-[11px] text-slate-500">
                        ({trip.vehicle.registration_number})
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-slate-500">Driver: {trip.driver?.name ?? '—'}</p>
                </td>
                <td className="px-5 py-3.5 text-xs text-slate-600">{trip.planned_date ?? '—'}</td>
                <td className="px-5 py-3.5 text-center font-semibold tabular-nums">{safeNum(trip.total_customers)}</td>
                <td className="px-5 py-3.5 text-center font-semibold tabular-nums">{formatQty(trip.total_quantity)}</td>
                <td className="px-5 py-3.5 text-right font-semibold tabular-nums text-emerald-700">
                  ₹{formatINR(trip.transport_cost)}
                </td>
                <td className="px-5 py-3.5 text-center">
                  <StatusBadge status={trip.status} />
                </td>
              </tr>
            ))}
          </tbody>
        )}
      </table>
    );
  };

  const renderTripsCards = () => {
    const rows = reportData as DeliveryReportTrip[];
    if (loading) {
      return (
        <div className="space-y-2 p-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      );
    }
    if (rows.length === 0) return <EmptyState message="No trips found for this range." />;
    return (
      <div className="divide-y divide-slate-100">
        {rows.map((trip) => (
          <div key={trip.id} className="p-3 sm:p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="truncate font-mono text-sm font-semibold text-slate-900">
                    {trip.trip_code ?? `#${trip.id}`}
                  </p>
                  <StatusBadge status={trip.status} />
                </div>
                <p className="mt-1 truncate text-xs text-slate-700">
                  {trip.vehicle?.name ?? 'Unassigned'}
                  {trip.vehicle?.registration_number && (
                    <span className="ml-1 font-mono text-[10px] text-slate-500">
                      ({trip.vehicle.registration_number})
                    </span>
                  )}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-slate-500">
                  Driver: {trip.driver?.name ?? '—'} · {trip.planned_date ?? 'No date'}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold tabular-nums text-emerald-700">
                  ₹{formatINR(trip.transport_cost)}
                </p>
                <p className="mt-0.5 text-[10px] text-slate-500">
                  {safeNum(trip.total_customers)} stops · {formatQty(trip.total_quantity)} pcs
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderVehiclesTable = () => {
    const rows = reportData as DeliveryReportVehicle[];
    return (
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50/70 text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-5 py-3 font-semibold">Vehicle</th>
            <th className="px-5 py-3 font-semibold">Type</th>
            <th className="px-5 py-3 font-semibold">Capacity</th>
            <th className="px-5 py-3 text-center font-semibold">Total Trips</th>
            <th className="px-5 py-3 text-center font-semibold">Completed</th>
            <th className="px-5 py-3 text-center font-semibold">Status</th>
          </tr>
        </thead>
        {loading ? (
          <TableLoader cols={6} />
        ) : rows.length === 0 ? (
          <tbody>
            <tr>
              <td colSpan={6}>
                <EmptyState message="No vehicles tracked for this range." />
              </td>
            </tr>
          </tbody>
        ) : (
          <tbody className="divide-y divide-slate-100">
            {rows.map((veh) => (
              <tr key={veh.id} className="transition-colors hover:bg-slate-50/70">
                <td className="px-5 py-3.5">
                  <p className="font-mono font-semibold text-slate-900">{veh.registration_number ?? '—'}</p>
                  {veh.vehicle_code && (
                    <p className="text-[11px] font-mono text-slate-500">{veh.vehicle_code}</p>
                  )}
                </td>
                <td className="px-5 py-3.5">
                  <p className="font-medium text-slate-900">{veh.name ?? '—'}</p>
                  <p className="text-[11px] uppercase text-slate-500">{veh.type ?? ''}</p>
                </td>
                <td className="px-5 py-3.5 text-xs text-slate-600">
                  {safeNum(veh.max_capacity)} {veh.capacity_unit ?? ''}
                </td>
                <td className="px-5 py-3.5 text-center text-base font-bold tabular-nums text-blue-600">
                  {safeNum(veh.total_trips)}
                </td>
                <td className="px-5 py-3.5 text-center text-base font-bold tabular-nums text-emerald-600">
                  {safeNum(veh.completed_trips)}
                </td>
                <td className="px-5 py-3.5 text-center">
                  <StatusBadge status={veh.status} />
                </td>
              </tr>
            ))}
          </tbody>
        )}
      </table>
    );
  };

  const renderVehiclesCards = () => {
    const rows = reportData as DeliveryReportVehicle[];
    if (loading) {
      return (
        <div className="space-y-2 p-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      );
    }
    if (rows.length === 0) return <EmptyState message="No vehicles tracked for this range." />;
    return (
      <div className="divide-y divide-slate-100">
        {rows.map((veh) => (
          <div key={veh.id} className="p-3 sm:p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="truncate font-mono text-sm font-semibold text-slate-900">
                    {veh.registration_number ?? '—'}
                  </p>
                  <StatusBadge status={veh.status} />
                </div>
                <p className="mt-1 truncate text-xs text-slate-700">{veh.name ?? '—'}</p>
                <p className="mt-0.5 truncate text-[11px] uppercase text-slate-500">
                  {veh.type ?? ''} · {safeNum(veh.max_capacity)} {veh.capacity_unit ?? ''}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs text-slate-500">
                  <span className="font-bold text-blue-600">{safeNum(veh.total_trips)}</span> trips
                </p>
                <p className="mt-0.5 text-[10px] text-slate-500">
                  <span className="font-bold text-emerald-600">{safeNum(veh.completed_trips)}</span> completed
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderCostsTable = () => {
    const rows = reportData as DeliveryReportTripCost[];
    return (
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50/70 text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-5 py-3 font-semibold">Trip</th>
            <th className="px-5 py-3 font-semibold">Vehicle</th>
            <th className="px-5 py-3 font-semibold">Planned</th>
            <th className="px-5 py-3 text-right font-semibold">Expense</th>
            <th className="px-5 py-3 font-semibold">Allocation</th>
            <th className="px-5 py-3 text-center font-semibold">Allocated Orders</th>
          </tr>
        </thead>
        {loading ? (
          <TableLoader cols={6} />
        ) : rows.length === 0 ? (
          <tbody>
            <tr>
              <td colSpan={6}>
                <EmptyState message="No transport costs recorded." />
              </td>
            </tr>
          </tbody>
        ) : (
          <tbody className="divide-y divide-slate-100">
            {rows.map((trip) => (
              <tr key={trip.id} className="transition-colors hover:bg-slate-50/70">
                <td className="px-5 py-3.5 font-mono font-semibold text-slate-900">
                  {trip.trip_code ?? `#${trip.id}`}
                </td>
                <td className="px-5 py-3.5 text-xs text-slate-700">
                  {trip.vehicle?.name ?? '—'}
                  {trip.vehicle?.registration_number && (
                    <span className="ml-1 font-mono text-[10px] text-slate-500">
                      ({trip.vehicle.registration_number})
                    </span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-xs text-slate-600">{trip.planned_date ?? '—'}</td>
                <td className="px-5 py-3.5 text-right font-semibold tabular-nums text-emerald-700">
                  ₹{formatINR(trip.transport_cost, 2)}
                </td>
                <td className="px-5 py-3.5 text-xs font-semibold capitalize text-slate-700">
                  {trip.cost_allocation_status?.replace(/_/g, ' ') ?? '—'}
                </td>
                <td className="px-5 py-3.5 text-center font-semibold tabular-nums">
                  {Array.isArray(trip.cost_allocations) ? trip.cost_allocations.length : 0} orders
                </td>
              </tr>
            ))}
          </tbody>
        )}
      </table>
    );
  };

  const renderCostsCards = () => {
    const rows = reportData as DeliveryReportTripCost[];
    if (loading) {
      return (
        <div className="space-y-2 p-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      );
    }
    if (rows.length === 0) return <EmptyState message="No transport costs recorded." />;
    return (
      <div className="divide-y divide-slate-100">
        {rows.map((trip) => (
          <div key={trip.id} className="p-3 sm:p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm font-semibold text-slate-900">
                  {trip.trip_code ?? `#${trip.id}`}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-slate-500">
                  {trip.vehicle?.name ?? '—'} · {trip.planned_date ?? '—'}
                </p>
                <p className="mt-0.5 text-[11px] capitalize text-slate-500">
                  {trip.cost_allocation_status?.replace(/_/g, ' ') ?? '—'}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold tabular-nums text-emerald-700">
                  ₹{formatINR(trip.transport_cost, 2)}
                </p>
                <p className="mt-0.5 text-[10px] text-slate-500">
                  {Array.isArray(trip.cost_allocations) ? trip.cost_allocations.length : 0} orders
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderAreaTable = () => {
    const rows = reportData as DeliveryReportArea[];
    return (
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50/70 text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-5 py-3 font-semibold">Town / Locality</th>
            <th className="px-5 py-3 font-semibold">District</th>
            <th className="px-5 py-3 text-center font-semibold">Orders</th>
            <th className="px-5 py-3 text-center font-semibold">Qty (Units)</th>
            <th className="px-5 py-3 text-right font-semibold">Delivery Charges</th>
          </tr>
        </thead>
        {loading ? (
          <TableLoader cols={5} />
        ) : rows.length === 0 ? (
          <tbody>
            <tr>
              <td colSpan={5}>
                <EmptyState message="No area activity found for this range." />
              </td>
            </tr>
          </tbody>
        ) : (
          <tbody className="divide-y divide-slate-100">
            {rows.map((area, i) => (
              <tr key={`${area.town ?? 'area'}-${i}`} className="transition-colors hover:bg-slate-50/70">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <FiMapPin className="shrink-0 text-indigo-500" size={12} />
                    <span className="font-semibold text-slate-900">{area.town ?? '—'}</span>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-xs text-slate-600">{area.district ?? '—'}</td>
                <td className="px-5 py-3.5 text-center font-semibold tabular-nums text-blue-600">
                  {safeNum(area.order_count)}
                </td>
                <td className="px-5 py-3.5 text-center font-semibold tabular-nums text-slate-900">
                  {formatQty(area.total_qty)}
                </td>
                <td className="px-5 py-3.5 text-right font-semibold tabular-nums text-emerald-700">
                  ₹{formatINR(area.total_charges)}
                </td>
              </tr>
            ))}
          </tbody>
        )}
      </table>
    );
  };

  const renderAreaCards = () => {
    const rows = reportData as DeliveryReportArea[];
    if (loading) {
      return (
        <div className="space-y-2 p-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      );
    }
    if (rows.length === 0) return <EmptyState message="No area activity found for this range." />;
    return (
      <div className="divide-y divide-slate-100">
        {rows.map((area, i) => (
          <div key={`${area.town ?? 'area'}-${i}`} className="p-3 sm:p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <FiMapPin className="shrink-0 text-indigo-500" size={11} />
                  <p className="truncate text-sm font-semibold text-slate-900">{area.town ?? '—'}</p>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-slate-500">{area.district ?? '—'}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  <span className="font-bold text-blue-600">{safeNum(area.order_count)}</span> orders ·{' '}
                  {formatQty(area.total_qty)} pcs
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold tabular-nums text-emerald-700">
                  ₹{formatINR(area.total_charges)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderReport = () => {
    switch (reportType) {
      case 'daily':
      case 'pending':
      case 'overdue':
        return (
          <>
            <div className="hidden lg:block">{renderOrdersTable()}</div>
            <div className="lg:hidden">{renderOrdersCards()}</div>
          </>
        );
      case 'trips':
        return (
          <>
            <div className="hidden lg:block">{renderTripsTable()}</div>
            <div className="lg:hidden">{renderTripsCards()}</div>
          </>
        );
      case 'vehicle_utilization':
        return (
          <>
            <div className="hidden lg:block">{renderVehiclesTable()}</div>
            <div className="lg:hidden">{renderVehiclesCards()}</div>
          </>
        );
      case 'transport_costs':
        return (
          <>
            <div className="hidden lg:block">{renderCostsTable()}</div>
            <div className="lg:hidden">{renderCostsCards()}</div>
          </>
        );
      case 'area_wise':
        return (
          <>
            <div className="hidden lg:block">{renderAreaTable()}</div>
            <div className="lg:hidden">{renderAreaCards()}</div>
          </>
        );
      default:
        return null;
    }
  };

  /* ══════════════════════════════════════════════════════
   * Render
   * ════════════════════════════════════════════════════ */
  return (
    <DeliveryReportsBoundary>
      <div className="min-h-full bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100/60">
        <div className="mx-auto w-full max-w-[1500px] space-y-4 p-3 sm:space-y-5 sm:p-4 lg:p-5 xl:p-6">

          {/* Hero */}
          <section className="relative overflow-hidden rounded-2xl border border-slate-800/10 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-4 py-5 shadow-[0_20px_40px_-20px_rgba(15,23,42,0.45)] sm:px-6 sm:py-6 lg:px-7">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />
            <div className="relative flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200 backdrop-blur">
                  <FiFileText size={12} /> Logistics · Reports
                </div>
                <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl xl:text-[30px]">
                  Delivery &amp; Logistics Reports
                </h1>
                <p className="mt-1.5 max-w-2xl text-xs text-slate-300 sm:text-sm">
                  Audit and export delivery orders, trips, vehicle utilization, costs, and area breakdowns.
                </p>
                <p className="mt-1 text-[10px] text-slate-400 sm:text-[11px]">
                  Last updated: <span className="font-medium text-slate-200">{lastUpdatedLabel}</span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void fetchReport()}
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

                {canExportReports && (
                  <button
                    type="button"
                    onClick={() => void handleExport()}
                    disabled={exporting}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-b from-cyan-300 to-cyan-400 px-4 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:from-cyan-200 hover:to-cyan-300 disabled:opacity-60"
                  >
                    {exporting ? (
                      <FiLoader className="animate-spin" size={14} />
                    ) : (
                      <FiDownload size={14} />
                    )}
                    {exporting ? 'Exporting…' : 'Export CSV'}
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Report tabs */}
          <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="flex gap-1 overflow-x-auto px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {REPORT_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = reportType === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setReportType(opt.id)}
                    className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold transition ${
                      active
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <Icon size={13} className={active ? 'text-white' : 'text-slate-400'} />
                    <span className="hidden sm:inline">{opt.name}</span>
                    <span className="sm:hidden">{opt.short}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Filters */}
          <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <CardContent className="p-3 sm:p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <FiFilter size={12} /> Filters
                  </span>

                  <select
                    aria-label="Date preset"
                    value={datePreset}
                    onChange={(e) => handlePresetChange(e.target.value as DatePresetKey)}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                  >
                    {DATE_PRESETS.map((p) => (
                      <option key={p.key} value={p.key}>{p.label}</option>
                    ))}
                  </select>

                  {currentReport.usesSingleDate ? (
                    <input
                      type="date"
                      aria-label="Report date"
                      value={date}
                      onChange={(e) => {
                        setDatePreset('custom');
                        setDate(e.target.value);
                      }}
                      className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                    />
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="date"
                        aria-label="From date"
                        value={startDate}
                        onChange={(e) => {
                          setDatePreset('custom');
                          setStartDate(e.target.value);
                        }}
                        className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                      />
                      <span className="text-[11px] text-slate-400">to</span>
                      <input
                        type="date"
                        aria-label="To date"
                        value={endDate}
                        min={startDate || undefined}
                        onChange={(e) => {
                          setDatePreset('custom');
                          setEndDate(e.target.value);
                        }}
                        className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                      />
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-slate-500">
                  <strong className="text-slate-800">{reportData.length}</strong> record
                  {reportData.length === 1 ? '' : 's'} retrieved
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Error */}
          {error && (
            <div
              role="alert"
              aria-live="polite"
              className="flex flex-col gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-rose-700 sm:flex-row sm:items-start sm:gap-3 sm:p-4"
            >
              <div className="flex items-start gap-2 sm:flex-1">
                <FiAlertTriangle className="mt-0.5 shrink-0" size={18} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Could not load report</p>
                  <p className="text-xs sm:text-sm">{error}</p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => void fetchReport()}
                className="w-full shrink-0 rounded-xl border-rose-300 bg-white text-xs font-semibold text-rose-700 hover:bg-rose-50 sm:w-auto"
              >
                Retry
              </Button>
            </div>
          )}

          {/* Report content */}
          <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-slate-100 bg-white px-3 py-3 sm:px-5 sm:py-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                  <currentReport.icon size={14} />
                </div>
                <div className="min-w-0">
                  <CardTitle className="truncate text-xs font-semibold text-slate-800 sm:text-sm">
                    {currentReport.name}
                  </CardTitle>
                  <CardDescription className="truncate text-[10px] text-slate-500 sm:text-[11px]">
                    {currentReport.usesSingleDate
                      ? `As on ${date}`
                      : `${startDate} → ${endDate}`}
                  </CardDescription>
                </div>
              </div>
              {reportData.length > 0 && (
                <Badge
                  variant="outline"
                  className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700"
                >
                  {reportData.length} rows
                </Badge>
              )}
            </CardHeader>

            <div className="overflow-x-auto">{renderReport()}</div>
          </Card>
        </div>
      </div>
    </DeliveryReportsBoundary>
  );
};

export default DeliveryReportsPage;