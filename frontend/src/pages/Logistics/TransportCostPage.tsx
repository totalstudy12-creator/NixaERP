// src/pages/Logistics/TransportCostPage.tsx
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
  FiDollarSign,
  FiTruck,
  FiCheckCircle,
  FiAlertCircle,
  FiRefreshCw,
  FiEdit2,
  FiPieChart,
  FiShield,
  FiInfo,
  FiLoader,
  FiX,
  FiAlertTriangle,
  FiSearch,
  FiFilter,
} from 'react-icons/fi';
import deliveryService, {
  DeliveryTrip,
  DeliveryCostAllocation,
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
 * Types & Constants
 * ════════════════════════════════════════════════════════ */

type CostStatus = 'unallocated' | 'allocated' | 'approved' | 'locked' | string;

type AllocationMethod = 'equal' | 'quantity' | 'weight' | 'volume' | 'manual';

/**
 * `DeliveryCostAllocation` types `order` as a full `DeliveryOrder`
 * (with required `id`, `company_id`, etc.). That's incompatible with the
 * narrower shape we actually consume here, so we strip those fields via
 * `Omit` and re-declare them with our minimal shape.
 */
type AllocationRow = Omit<DeliveryCostAllocation, 'order' | 'invoice'> & {
  order?: {
    recipient_name?: string;
    town?: string;
    district?: string;
  };
  invoice?: {
    invoice_no?: string;
  };
};

const LIMITS = {
  costMin: 0.01,
  costMax: 100_000_000,
  amountMin: 0,
  amountMax: 100_000_000,
  reasonMax: 500,
} as const;

const METHOD_OPTIONS: Array<{ value: AllocationMethod; label: string; hint: string }> = [
  { value: 'equal', label: 'Equal split (per order)', hint: 'Each customer pays an equal share' },
  { value: 'quantity', label: 'Proportional to quantity', hint: 'By units / pieces' },
  { value: 'weight', label: 'Proportional to weight', hint: 'By kg' },
  { value: 'volume', label: 'Proportional to volume', hint: 'By cft' },
  { value: 'manual', label: 'Manual entry', hint: 'Custom amounts per customer' },
];

const STATUS_BADGES: Record<string, { label: string; cls: string }> = {
  unallocated: { label: 'Unallocated', cls: 'border-slate-200 bg-slate-50 text-slate-600' },
  allocated: { label: 'Allocated', cls: 'border-blue-200/70 bg-blue-50 text-blue-700' },
  approved: { label: 'Approved', cls: 'border-emerald-200/70 bg-emerald-50 text-emerald-700' },
  locked: { label: 'Locked', cls: 'border-emerald-200/70 bg-emerald-50 text-emerald-700' },
};

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

const formatINR = (v: unknown, decimals = 2): string => {
  const n = safeNum(v);
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
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
    if (status === 404) return 'Trip or allocation not found.';
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
class TransportCostBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { hasError: false };
  static getDerivedStateFromError(err: unknown): BoundaryState {
    return {
      hasError: true,
      message: err instanceof Error ? err.message : 'Unexpected error.',
    };
  }
  componentDidCatch(err: unknown) {
    // eslint-disable-next-line no-console
    console.error('[TransportCostPage]', err);
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
              {this.state.message || 'Unable to render transport costs.'}
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
 * Main
 * ════════════════════════════════════════════════════════ */

export const TransportCostPage: React.FC = () => {
  const { showSuccess, showError, showInfo } = useNotification();
  const { can, isSuperAdmin } = usePermission();
  const loadingUser = useAuthStore((s) => s.loadingUser);
  const hasUser = useAuthStore((s) => Boolean(s.user));

  /* ── Permissions ── */
  const canView = isSuperAdmin || can('view deliveries') || can('view transport costs');
  const canAllocate = isSuperAdmin || can('edit deliveries') || can('allocate transport costs');
  const canApprove = isSuperAdmin || can('approve deliveries') || can('approve transport costs');

  /* ── Data ── */
  const [trips, setTrips] = useState<DeliveryTrip[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null);
  const [currentTrip, setCurrentTrip] = useState<DeliveryTrip | null>(null);

  const [loadingTrips, setLoadingTrips] = useState(true);

  /* ── Filter state ── */
  const [tripSearch, setTripSearch] = useState('');
  const [allocationStatusFilter, setAllocationStatusFilter] = useState<'all' | 'draft' | 'allocated' | 'approved'>('all');

  const filteredTripsList = useMemo(() => {
    return trips.filter((t) => {
      if (allocationStatusFilter !== 'all' && t.cost_allocation_status !== allocationStatusFilter) {
        return false;
      }
      if (tripSearch.trim()) {
        const term = tripSearch.trim().toLowerCase();
        const code = (t.trip_code || '').toLowerCase();
        const date = (t.planned_date || '').toLowerCase();
        const veh = (t.vehicle?.name || t.vehicle?.registration_number || '').toLowerCase();
        if (!code.includes(term) && !date.includes(term) && !veh.includes(term)) return false;
      }
      return true;
    });
  }, [trips, allocationStatusFilter, tripSearch]);
  const [loadingTrip, setLoadingTrip] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tripError, setTripError] = useState<string | null>(null);

  /* ── Allocation form ── */
  const [transportCostInput, setTransportCostInput] = useState<string>('');
  const [method, setMethod] = useState<AllocationMethod>('equal');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [allocating, setAllocating] = useState(false);
  const [approving, setApproving] = useState(false);

  /* ── Adjustment modal ── */
  const [adjustmentModalOpen, setAdjustmentModalOpen] = useState(false);
  const [editingAllocation, setEditingAllocation] = useState<AllocationRow | null>(null);
  const [newAmount, setNewAmount] = useState<string>('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [adjustmentErrors, setAdjustmentErrors] = useState<Record<string, string>>({});
  const [savingAdjustment, setSavingAdjustment] = useState(false);

  /* ── Refs ── */
  const tripsAbortRef = useRef<AbortController | null>(null);
  const tripDetailAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      tripsAbortRef.current?.abort();
      tripDetailAbortRef.current?.abort();
    };
  }, []);

  /* ══════════════════════════════════════════════════════
   * Fetch
   * ══════════════════════════════════════════════════════ */

  const fetchTrips = useCallback(async () => {
    if (!canView) return;
    tripsAbortRef.current?.abort();
    const ctrl = new AbortController();
    tripsAbortRef.current = ctrl;

    setLoadingTrips(true);
    setError(null);
    try {
      const res = await deliveryService.getTrips({ per_page: 50 });
      if (ctrl.signal.aborted || !mountedRef.current) return;
      const list: DeliveryTrip[] = Array.isArray((res as any)?.data?.data)
        ? (res as any).data.data
        : Array.isArray((res as any)?.data)
          ? ((res as any).data as DeliveryTrip[])
          : [];
      setTrips(list);

      setSelectedTripId((prev) => {
        if (prev && list.some((t) => t.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    } catch (err) {
      if (ctrl.signal.aborted) return;
      const msg = getApiErrorMessage(err, 'Could not load trips.');
      setError(msg);
      setTrips([]);
    } finally {
      if (mountedRef.current) setLoadingTrips(false);
    }
  }, [canView]);

  const fetchTripDetails = useCallback(async (tripId: number) => {
    tripDetailAbortRef.current?.abort();
    const ctrl = new AbortController();
    tripDetailAbortRef.current = ctrl;

    setLoadingTrip(true);
    setTripError(null);
    try {
      const res = await deliveryService.getTrip(tripId);
      if (ctrl.signal.aborted || !mountedRef.current) return;
      const trip = (res as any)?.data ?? null;
      setCurrentTrip(trip);
      setTransportCostInput(trip?.transport_cost != null ? String(trip.transport_cost) : '');
      if (trip?.cost_allocation_method) {
        setMethod(trip.cost_allocation_method as AllocationMethod);
      } else {
        setMethod('equal');
      }
      setFieldErrors({});
    } catch (err) {
      if (ctrl.signal.aborted) return;
      const msg = getApiErrorMessage(err, 'Could not load trip details.');
      setTripError(msg);
      setCurrentTrip(null);
    } finally {
      if (mountedRef.current) setLoadingTrip(false);
    }
  }, []);

  useEffect(() => {
    void fetchTrips();
  }, [fetchTrips]);

  useEffect(() => {
    if (!selectedTripId) {
      setCurrentTrip(null);
      return;
    }
    void fetchTripDetails(selectedTripId);
  }, [selectedTripId, fetchTripDetails]);

  /* ── Shortcuts ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        void fetchTrips();
        if (selectedTripId) void fetchTripDetails(selectedTripId);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fetchTrips, fetchTripDetails, selectedTripId]);

  /* ── Modal keyboard + scroll lock ── */
  useEffect(() => {
    if (!adjustmentModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !savingAdjustment) setAdjustmentModalOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [adjustmentModalOpen, savingAdjustment]);

  /* ══════════════════════════════════════════════════════
   * Derived
   * ══════════════════════════════════════════════════════ */

  const allocations = useMemo<AllocationRow[]>(
    () =>
      Array.isArray(currentTrip?.cost_allocations)
        ? (currentTrip!.cost_allocations as unknown as AllocationRow[])
        : [],
    [currentTrip]
  );

  const currentStatus = safeStr(currentTrip?.cost_allocation_status) as CostStatus;
  const isApproved = currentStatus === 'approved' || currentStatus === 'locked';

  const totals = useMemo(() => {
    const allocated = allocations.reduce(
      (acc, a) => acc + safeNum(a.final_allocated_amount),
      0
    );
    const tripCost = safeNum(currentTrip?.transport_cost);
    const variance = tripCost - allocated;
    return {
      allocated,
      tripCost,
      variance,
      isBalanced: Math.abs(variance) < 0.01,
    };
  }, [allocations, currentTrip]);

  /* ══════════════════════════════════════════════════════
   * Handlers
   * ══════════════════════════════════════════════════════ */

  const clearFieldError = useCallback((field: string) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const handleRunAllocation = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAllocate) {
      showError('Permission denied', 'You do not have permission to allocate transport costs.');
      return;
    }
    if (!selectedTripId) return;

    const cost = safeNum(transportCostInput, NaN);
    const errs: Record<string, string> = {};
    if (!Number.isFinite(cost) || cost < LIMITS.costMin) {
      errs.cost = `Enter a cost greater than ₹${LIMITS.costMin}.`;
    } else if (cost > LIMITS.costMax) {
      errs.cost = `Cost cannot exceed ₹${formatINR(LIMITS.costMax, 0)}.`;
    }
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    if (allocations.length > 0) {
      if (!window.confirm('Re-run cost allocation?\n\nThis will overwrite the current distribution.')) return;
    }

    setAllocating(true);
    try {
      await deliveryService.allocateCost(selectedTripId, {
        transport_cost: cost,
        method,
      });
      await Promise.all([fetchTripDetails(selectedTripId), fetchTrips()]);
      showSuccess(
        'Cost allocated',
        `₹${formatINR(cost)} distributed using “${method}” across ${allocations.length || 'all'} orders.`
      );
    } catch (err) {
      showError('Allocation failed', getApiErrorMessage(err, 'Could not allocate costs.'));
    } finally {
      if (mountedRef.current) setAllocating(false);
    }
  }, [
    canAllocate,
    selectedTripId,
    transportCostInput,
    method,
    allocations.length,
    fetchTripDetails,
    fetchTrips,
    showSuccess,
    showError,
  ]);

  const openAdjustmentModal = useCallback((alloc: AllocationRow) => {
    if (!canAllocate) {
      showError('Permission denied', 'You do not have permission to adjust allocations.');
      return;
    }
    if (isApproved) {
      showInfo('Locked', 'This allocation is approved and locked. Cannot adjust.');
      return;
    }
    setEditingAllocation(alloc);
    setNewAmount(String(safeNum(alloc.final_allocated_amount)));
    setAdjustmentReason(safeStr(alloc.adjustment_reason));
    setAdjustmentErrors({});
    setAdjustmentModalOpen(true);
  }, [canAllocate, isApproved, showError, showInfo]);

  const handleSaveAdjustment = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAllocation) return;

    const amount = safeNum(newAmount, NaN);
    const errs: Record<string, string> = {};
    if (!Number.isFinite(amount) || amount < LIMITS.amountMin) {
      errs.amount = 'Amount must be a valid non-negative number.';
    } else if (amount > LIMITS.amountMax) {
      errs.amount = `Amount cannot exceed ₹${formatINR(LIMITS.amountMax, 0)}.`;
    }
    if (!adjustmentReason.trim()) {
      errs.reason = 'Reason is required for the audit log.';
    } else if (adjustmentReason.length > LIMITS.reasonMax) {
      errs.reason = `Reason cannot exceed ${LIMITS.reasonMax} characters.`;
    }
    setAdjustmentErrors(errs);
    if (Object.keys(errs).length) return;

    /* Warn about balance break */
    const otherTotal = allocations
      .filter((a) => a.id !== editingAllocation.id)
      .reduce((acc, a) => acc + safeNum(a.final_allocated_amount), 0);
    const newTotal = otherTotal + amount;
    const variance = totals.tripCost - newTotal;
    if (Math.abs(variance) > 0.01) {
      const proceed = window.confirm(
        `Warning: After this adjustment the allocations will not match the trip expense.\n\n` +
          `Trip expense: ₹${formatINR(totals.tripCost)}\n` +
          `New allocations total: ₹${formatINR(newTotal)}\n` +
          `Difference: ₹${formatINR(variance)}\n\nProceed anyway?`
      );
      if (!proceed) return;
    }

    setSavingAdjustment(true);
    try {
      await deliveryService.adjustCostAllocation(editingAllocation.id, {
        new_amount: amount,
        reason: adjustmentReason.trim(),
      });
      setAdjustmentModalOpen(false);
      if (selectedTripId) await fetchTripDetails(selectedTripId);
      showSuccess(
        'Adjustment saved',
        `Order #${safeNum(editingAllocation.delivery_order_id)} updated to ₹${formatINR(amount)}.`
      );
    } catch (err) {
      showError('Adjustment failed', getApiErrorMessage(err, 'Could not save adjustment.'));
    } finally {
      if (mountedRef.current) setSavingAdjustment(false);
    }
  }, [
    editingAllocation,
    newAmount,
    adjustmentReason,
    allocations,
    totals.tripCost,
    selectedTripId,
    fetchTripDetails,
    showSuccess,
    showError,
  ]);

  const handleApproveCost = useCallback(async () => {
    if (!canApprove) {
      showError('Permission denied', 'You do not have permission to approve costs.');
      return;
    }
    if (!selectedTripId) return;

    if (!totals.isBalanced) {
      showError(
        'Cannot approve',
        `Allocations (₹${formatINR(totals.allocated)}) must match trip expense (₹${formatINR(totals.tripCost)}) before approval.`
      );
      return;
    }
    if (!window.confirm(
      `Approve and lock transport cost allocation?\n\n` +
        `Total: ₹${formatINR(totals.allocated)} across ${allocations.length} order${allocations.length === 1 ? '' : 's'}.\n\n` +
        `This cannot be undone.`
    )) return;

    setApproving(true);
    try {
      await deliveryService.approveCost(selectedTripId);
      await Promise.all([fetchTripDetails(selectedTripId), fetchTrips()]);
      showSuccess('Approved', 'Transport cost allocations approved and locked.');
    } catch (err) {
      showError('Approval failed', getApiErrorMessage(err, 'Could not approve allocation.'));
    } finally {
      if (mountedRef.current) setApproving(false);
    }
  }, [
    canApprove,
    selectedTripId,
    totals,
    allocations.length,
    fetchTripDetails,
    fetchTrips,
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
            You don't have permission to view transport costs.
          </p>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════
   * Render
   * ══════════════════════════════════════════════════════ */

  const statusConfig = STATUS_BADGES[currentStatus] ?? {
    label: statusLabel(currentStatus),
    cls: 'border-slate-200 bg-slate-50 text-slate-600',
  };
  const canAllocateNow = canAllocate && !isApproved;

  return (
    <TransportCostBoundary>
      <div className="min-h-full bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100/60">
        <div className="mx-auto w-full max-w-[1500px] space-y-4 p-3 sm:space-y-5 sm:p-4 lg:p-5 xl:p-6">

          {/* ════════ Hero ════════ */}
          <section className="relative overflow-hidden rounded-2xl border border-slate-800/10 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-4 py-5 shadow-[0_20px_40px_-20px_rgba(15,23,42,0.45)] sm:px-6 sm:py-6 lg:px-7">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-emerald-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />
            <div className="relative flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200 backdrop-blur">
                  <FiDollarSign size={12} /> Logistics · Costs
                </div>
                <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl xl:text-[30px]">
                  Transportation Cost Allocation
                </h1>
                <p className="mt-1.5 max-w-2xl text-xs text-slate-300 sm:text-sm">
                  Split trip expenses (fuel, driver, vehicle) across combined orders — without touching sales invoices.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!isApproved && allocations.length > 0 && canApprove && (
                  <Button
                    type="button"
                    onClick={() => void handleApproveCost()}
                    disabled={approving || !totals.isBalanced}
                    title={!totals.isBalanced ? 'Allocations must match trip expense' : 'Approve & lock'}
                    className="h-10 rounded-xl bg-gradient-to-b from-emerald-300 to-emerald-400 font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:from-emerald-200 hover:to-emerald-300 disabled:cursor-not-allowed disabled:from-slate-500 disabled:to-slate-600 disabled:text-slate-300"
                  >
                    {approving ? (
                      <FiLoader className="mr-2 animate-spin" size={14} />
                    ) : (
                      <FiCheckCircle className="mr-2" size={14} />
                    )}
                    {approving ? 'Approving…' : 'Approve & lock'}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void fetchTrips();
                    if (selectedTripId) void fetchTripDetails(selectedTripId);
                  }}
                  disabled={loadingTrips || loadingTrip}
                  title="Refresh (Ctrl+R)"
                  className="h-10 rounded-xl border-white/10 bg-white/5 text-white shadow-none backdrop-blur transition hover:border-white/20 hover:bg-white/10 hover:text-white disabled:opacity-50"
                >
                  {loadingTrips || loadingTrip ? (
                    <FiLoader className="mr-2 animate-spin" size={14} />
                  ) : (
                    <FiRefreshCw className="mr-2" size={14} />
                  )}
                  Refresh
                </Button>
              </div>
            </div>
          </section>

          {/* ════════ Error ════════ */}
          {error && (
            <div role="alert" className="flex flex-col gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-rose-700 sm:flex-row sm:items-start sm:gap-3 sm:p-4">
              <div className="flex items-start gap-2 sm:flex-1">
                <FiAlertCircle className="mt-0.5 shrink-0" size={18} />
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
          {tripError && !error && (
            <div role="alert" className="flex flex-col gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-rose-700 sm:flex-row sm:items-start sm:gap-3 sm:p-4">
              <div className="flex items-start gap-2 sm:flex-1">
                <FiAlertCircle className="mt-0.5 shrink-0" size={18} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Could not load trip details</p>
                  <p className="text-xs sm:text-sm">{tripError}</p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => selectedTripId && void fetchTripDetails(selectedTripId)}
                className="w-full shrink-0 rounded-xl border-rose-300 bg-white text-xs font-semibold text-rose-700 hover:bg-rose-50 sm:w-auto"
              >
                Retry
              </Button>
            </div>
          )}

          {/* ════════ Invariant banner ════════ */}
          <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-3 text-blue-900 sm:p-4">
            <FiShield className="mt-0.5 shrink-0 text-blue-600" size={18} />
            <div className="text-xs leading-relaxed">
              <strong>Accounting invariant:</strong> Allocated carrier costs live in the
              logistics audit ledger for internal cost tracking and margin analysis. They{' '}
              <strong>never</strong> modify original customer sales invoices or billing totals.
            </div>
          </div>

          {/* ════════ Trip selector + calculator ════════ */}
          <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <CardHeader className="flex flex-col gap-2 border-b border-slate-100 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600 ring-1 ring-emerald-500/10">
                  <FiTruck size={14} />
                </div>
                <div className="min-w-0">
                  <CardTitle className="truncate text-xs font-semibold text-slate-800 sm:text-sm">
                    Select trip &amp; calculate cost
                  </CardTitle>
                  <CardDescription className="truncate text-[10px] text-slate-500 sm:text-[11px]">
                    {trips.length} trip{trips.length === 1 ? '' : 's'} available
                  </CardDescription>
                </div>
              </div>
              {currentTrip && (
                <Badge
                  variant="outline"
                  className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize ${statusConfig.cls}`}
                >
                  {statusConfig.label}
                </Badge>
              )}
            </CardHeader>

            <CardContent className="space-y-4 p-3 sm:p-5">
              {/* Trip Filters Toolbar */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input
                    type="text"
                    value={tripSearch}
                    onChange={(e) => setTripSearch(e.target.value)}
                    placeholder="Search trips by code, date, vehicle…"
                    className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-8 text-xs text-slate-800 shadow-sm outline-none transition focus:border-indigo-400"
                  />
                  {tripSearch && (
                    <button
                      type="button"
                      onClick={() => setTripSearch('')}
                      className="absolute right-2 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center text-slate-400 hover:text-slate-700"
                    >
                      <FiX size={12} />
                    </button>
                  )}
                </div>

                <select
                  aria-label="Filter by allocation status"
                  value={allocationStatusFilter}
                  onChange={(e) => setAllocationStatusFilter(e.target.value as any)}
                  className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm outline-none transition focus:border-indigo-400 sm:text-xs"
                >
                  <option value="all">All allocation statuses</option>
                  <option value="draft">Draft / Unallocated</option>
                  <option value="allocated">Allocated (Pending approval)</option>
                  <option value="approved">Approved</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Select Trip ({filteredTripsList.length} of {trips.length})
                </label>
                <select
                  aria-label="Select trip"
                  value={selectedTripId ?? ''}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (v > 0) setSelectedTripId(v);
                  }}
                  disabled={loadingTrips || filteredTripsList.length === 0}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-800 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 disabled:opacity-50"
                >
                  {filteredTripsList.length === 0 ? (
                    <option value="">No trips match active filter</option>
                  ) : (
                    filteredTripsList.map((t) => (
                      <option key={t.id} value={t.id}>
                        {safeStr(t.trip_code)} — {safeStr(t.planned_date)} ({safeNum(t.total_customers)} orders) [₹
                        {formatINR(t.transport_cost, 0)}] [{t.cost_allocation_status || 'draft'}]
                      </option>
                    ))
                  )}
                </select>
              </div>

              <form onSubmit={handleRunAllocation} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Total trip expense (₹) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                      ₹
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min={LIMITS.costMin}
                      max={LIMITS.costMax}
                      value={transportCostInput}
                      onChange={(e) => {
                        setTransportCostInput(e.target.value);
                        clearFieldError('cost');
                      }}
                      placeholder="e.g. 1200.00"
                      disabled={isApproved}
                      className={`h-10 w-full rounded-xl border bg-white pl-8 pr-3.5 text-sm font-semibold text-slate-900 shadow-sm outline-none transition disabled:bg-slate-50 disabled:text-slate-500 ${
                        fieldErrors.cost
                          ? 'border-rose-300 ring-2 ring-rose-200'
                          : 'border-slate-200 hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10'
                      }`}
                    />
                  </div>
                  {fieldErrors.cost && (
                    <p className="mt-1 text-[11px] text-rose-600">{fieldErrors.cost}</p>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Allocation method <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value as AllocationMethod)}
                    disabled={isApproved}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-800 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 disabled:opacity-50"
                  >
                    {METHOD_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[10px] text-slate-400">
                    {METHOD_OPTIONS.find((m) => m.value === method)?.hint}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    Rounding invariant
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-700">
                    <FiInfo className="text-emerald-500" size={11} /> Penny-perfect paisa distribution
                  </p>
                </div>

                <Button
                  type="submit"
                  disabled={allocating || isApproved || !canAllocateNow}
                  className="h-10 w-full rounded-xl bg-indigo-600 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
                >
                  {allocating ? (
                    <>
                      <FiLoader className="mr-1.5 animate-spin" size={13} />
                      Calculating…
                    </>
                  ) : (
                    <>
                      <FiPieChart className="mr-1.5" size={13} />
                      Calculate &amp; distribute
                    </>
                  )}
                </Button>
              </form>

              {isApproved && (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                  <FiCheckCircle className="shrink-0" size={14} />
                  This allocation is <strong>approved and locked</strong> — figures are immutable.
                </div>
              )}
            </CardContent>
          </Card>

          {/* ════════ Totals summary ════════ */}
          {currentTrip && (
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Card className="rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                <CardContent className="p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Trip expense
                  </p>
                  <p className="mt-1.5 text-xl font-bold tabular-nums text-slate-900">
                    ₹{formatINR(totals.tripCost)}
                  </p>
                </CardContent>
              </Card>
              <Card className="rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                <CardContent className="p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Total allocated
                  </p>
                  <p className="mt-1.5 text-xl font-bold tabular-nums text-slate-900">
                    ₹{formatINR(totals.allocated)}
                  </p>
                </CardContent>
              </Card>
              <Card
                className={`rounded-2xl border shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${
                  totals.isBalanced ? 'border-emerald-200/70 bg-emerald-50/40' : 'border-amber-200/70 bg-amber-50/40'
                }`}
              >
                <CardContent className="p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    {totals.isBalanced ? 'Balanced' : 'Variance'}
                  </p>
                  <p
                    className={`mt-1.5 text-xl font-bold tabular-nums ${
                      totals.isBalanced ? 'text-emerald-700' : 'text-amber-700'
                    }`}
                  >
                    {totals.isBalanced ? '✓ Matched' : `₹${formatINR(Math.abs(totals.variance))}`}
                  </p>
                </CardContent>
              </Card>
            </section>
          )}

          {/* ════════ Allocation breakdown ════════ */}
          <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-slate-100 bg-white px-3 py-3 sm:px-5 sm:py-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                  <FiPieChart size={14} />
                </div>
                <div className="min-w-0">
                  <CardTitle className="truncate text-xs font-semibold text-slate-800 sm:text-sm">
                    Cost distribution
                  </CardTitle>
                  <CardDescription className="truncate text-[10px] text-slate-500 sm:text-[11px]">
                    {currentTrip
                      ? `Trip ${safeStr(currentTrip.trip_code)} · ${allocations.length} order${allocations.length === 1 ? '' : 's'}`
                      : '—'}
                  </CardDescription>
                </div>
              </div>
              {allocations.length > 0 && (
                <div className="shrink-0 text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Allocated
                  </p>
                  <p className="mt-0.5 font-mono text-sm font-bold text-slate-900">
                    ₹{formatINR(totals.allocated)}
                  </p>
                </div>
              )}
            </CardHeader>

            {/* Table (lg+) */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50/70 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Order / Customer</th>
                    <th className="px-5 py-3 font-semibold">Invoice</th>
                    <th className="px-5 py-3 font-semibold">Basis</th>
                    <th className="px-5 py-3 text-center font-semibold">Share</th>
                    <th className="px-5 py-3 text-right font-semibold">Calculated</th>
                    <th className="px-5 py-3 text-right font-semibold">Adjustment</th>
                    <th className="px-5 py-3 text-right font-semibold">Final</th>
                    <th className="px-5 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingTrip ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        {Array.from({ length: 8 }).map((__, c) => (
                          <td key={c} className="px-5 py-3.5">
                            <div className="h-4 animate-pulse rounded bg-slate-100" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : allocations.length === 0 ? (
                    <tr>
                      <td colSpan={8}>
                        <div className="py-14 text-center">
                          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-slate-200/70">
                            <FiPieChart className="h-6 w-6 text-slate-400" />
                          </div>
                          <p className="mt-4 text-sm font-semibold text-slate-800">
                            No allocation yet
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Enter the total trip expense above and click “Calculate &amp; distribute”.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    allocations.map((alloc) => {
                      const adj = safeNum(alloc.adjustment_amount);
                      const hasAdj = Math.abs(adj) > 0.005;
                      return (
                        <tr key={alloc.id} className="transition-colors hover:bg-slate-50/70">
                          <td className="px-5 py-3.5">
                            <p className="font-semibold text-slate-900">
                              {alloc.order?.recipient_name ?? `Order #${safeNum(alloc.delivery_order_id)}`}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {safeStr(alloc.order?.town, 'Local')}
                              {alloc.order?.district ? `, ${alloc.order.district}` : ''}
                            </p>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="font-mono text-[11px] font-semibold text-indigo-600">
                              {alloc.invoice?.invoice_no ?? `INV #${alloc.invoice_id}`}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="text-xs font-medium capitalize text-slate-700">
                              {safeStr(alloc.allocation_method)}: {safeNum(alloc.allocation_basis_value)}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-center font-semibold tabular-nums text-slate-900">
                            {safeNum(alloc.allocation_percentage).toFixed(2)}%
                          </td>
                          <td className="px-5 py-3.5 text-right font-mono tabular-nums text-slate-700">
                            ₹{formatINR(alloc.calculated_amount)}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            {hasAdj ? (
                              <div>
                                <p
                                  className={`font-mono text-xs font-bold ${
                                    adj > 0 ? 'text-emerald-600' : 'text-rose-600'
                                  }`}
                                >
                                  {adj > 0 ? '+' : ''}₹{formatINR(adj)}
                                </p>
                                {alloc.adjustment_reason && (
                                  <p
                                    className="mt-0.5 max-w-[140px] truncate text-[10px] italic text-slate-400"
                                    title={alloc.adjustment_reason}
                                  >
                                    {alloc.adjustment_reason}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-right font-mono text-sm font-bold tabular-nums text-slate-900">
                            ₹{formatINR(alloc.final_allocated_amount)}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openAdjustmentModal(alloc)}
                              disabled={isApproved || !canAllocate}
                              title={isApproved ? 'Locked after approval' : 'Adjust amount'}
                              className="h-8 rounded-lg"
                            >
                              <FiEdit2 size={13} />
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
              {loadingTrip ? (
                <div className="space-y-2 p-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />
                  ))}
                </div>
              ) : allocations.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-slate-200/70">
                    <FiPieChart className="h-5 w-5 text-slate-400" />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-800">No allocation yet</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Calculate above to distribute the trip cost.
                  </p>
                </div>
              ) : (
                allocations.map((alloc) => {
                  const adj = safeNum(alloc.adjustment_amount);
                  const hasAdj = Math.abs(adj) > 0.005;
                  return (
                    <div key={alloc.id} className="p-3 sm:p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {alloc.order?.recipient_name ?? `Order #${safeNum(alloc.delivery_order_id)}`}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-slate-500">
                            {safeStr(alloc.invoice?.invoice_no ?? `INV #${alloc.invoice_id}`, '—')} ·{' '}
                            {safeStr(alloc.order?.town, 'Local')}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-slate-500">
                            <span className="capitalize">{safeStr(alloc.allocation_method)}</span> ·{' '}
                            {safeNum(alloc.allocation_percentage).toFixed(2)}%
                          </p>
                          {hasAdj && (
                            <p
                              className={`mt-1 text-[11px] font-semibold ${
                                adj > 0 ? 'text-emerald-600' : 'text-rose-600'
                              }`}
                            >
                              {adj > 0 ? '+' : ''}₹{formatINR(adj)} adj.
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-bold tabular-nums text-slate-900">
                            ₹{formatINR(alloc.final_allocated_amount)}
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openAdjustmentModal(alloc)}
                            disabled={isApproved || !canAllocate}
                            className="mt-1 h-7 rounded-lg text-[11px]"
                          >
                            <FiEdit2 size={11} className="mr-1" /> Adjust
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* ════════ Adjustment Modal ════════ */}
      {adjustmentModalOpen && editingAllocation && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !savingAdjustment) setAdjustmentModalOpen(false);
          }}
        >
          <div
            className="relative flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <FiEdit2 size={18} />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-bold text-slate-900 sm:text-base">
                    Adjust cost allocation
                  </h3>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    Order #{safeNum(editingAllocation.delivery_order_id)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !savingAdjustment && setAdjustmentModalOpen(false)}
                disabled={savingAdjustment}
                aria-label="Close modal"
                className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
              >
                <FiX size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveAdjustment} className="flex min-h-0 flex-1 flex-col">
              <div className="space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Recipient
                  </label>
                  <p className="text-sm font-semibold text-slate-900">
                    {editingAllocation.order?.recipient_name ?? '—'}
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Adjusted amount (₹) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                      ₹
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min={LIMITS.amountMin}
                      max={LIMITS.amountMax}
                      value={newAmount}
                      onChange={(e) => {
                        setNewAmount(e.target.value);
                        setAdjustmentErrors((prev) => {
                          if (!prev.amount) return prev;
                          const next = { ...prev };
                          delete next.amount;
                          return next;
                        });
                      }}
                      className={`h-10 w-full rounded-xl border bg-white pl-8 pr-3.5 text-sm font-semibold text-slate-900 shadow-sm outline-none transition ${
                        adjustmentErrors.amount
                          ? 'border-rose-300 ring-2 ring-rose-200'
                          : 'border-slate-200 hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10'
                      }`}
                    />
                  </div>
                  {adjustmentErrors.amount && (
                    <p className="mt-1 text-[11px] text-rose-600">{adjustmentErrors.amount}</p>
                  )}
                  <p className="mt-1 text-[10px] text-slate-400">
                    Previously calculated: ₹{formatINR(editingAllocation.calculated_amount)}
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Reason (required for audit) <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={adjustmentReason}
                    onChange={(e) => {
                      setAdjustmentReason(clampStr(e.target.value, LIMITS.reasonMax));
                      setAdjustmentErrors((prev) => {
                        if (!prev.reason) return prev;
                        const next = { ...prev };
                        delete next.reason;
                        return next;
                      });
                    }}
                    maxLength={LIMITS.reasonMax}
                    placeholder="e.g. Extra handling required for heavy sound equipment"
                    className={`w-full resize-y rounded-xl border bg-white px-3.5 py-2.5 text-sm outline-none transition ${
                      adjustmentErrors.reason
                        ? 'border-rose-300 ring-2 ring-rose-200'
                        : 'border-slate-200 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10'
                    }`}
                  />
                  <div className="mt-1 flex items-start justify-between gap-2">
                    {adjustmentErrors.reason ? (
                      <p className="text-[11px] text-rose-600">{adjustmentErrors.reason}</p>
                    ) : (
                      <span />
                    )}
                    <p className="shrink-0 text-[10px] text-slate-400">
                      {adjustmentReason.length}/{LIMITS.reasonMax}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3 sm:flex-row sm:justify-end sm:px-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAdjustmentModalOpen(false)}
                  disabled={savingAdjustment}
                  className="rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={savingAdjustment}
                  className="rounded-xl bg-indigo-600 font-semibold hover:bg-indigo-700"
                >
                  {savingAdjustment && <FiLoader className="mr-1.5 animate-spin" size={13} />}
                  {savingAdjustment ? 'Saving…' : 'Save adjustment'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </TransportCostBoundary>
  );
};

export default TransportCostPage;