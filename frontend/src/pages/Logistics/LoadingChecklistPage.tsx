// src/pages/Delivery/LoadingChecklistPage.tsx
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
  FiCheckSquare,
  FiBox,
  FiTruck,
  FiCheckCircle,
  FiAlertCircle,
  FiPrinter,
  FiRefreshCw,
  FiUser,
  FiLayers,
  FiHome,
  FiLoader,
  FiX,
  FiSearch,
  FiFilter,
} from 'react-icons/fi';
import deliveryService, {
  DeliveryTrip,
  DeliveryLoadingItem,
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

const TRIP_STATUS_CLASSES: Record<string, string> = {
  ready_for_dispatch: 'border-blue-200/70 bg-blue-50 text-blue-700',
  loading_in_progress: 'border-amber-200/70 bg-amber-50 text-amber-700',
  loading_pending: 'border-slate-200 bg-slate-50 text-slate-600',
  vehicle_assigned: 'border-indigo-200/70 bg-indigo-50 text-indigo-700',
  planned: 'border-slate-200 bg-slate-50 text-slate-600',
  dispatched: 'border-purple-200/70 bg-purple-50 text-purple-700',
  closed: 'border-emerald-200/70 bg-emerald-50 text-emerald-700',
  completed: 'border-emerald-200/70 bg-emerald-50 text-emerald-700',
};
const DEFAULT_TRIP_STATUS_CLASS = 'border-slate-200 bg-slate-50 text-slate-600';

const CONFIRMED_LOADING_STATES = new Set([
  'ready_for_dispatch',
  'dispatched',
  'closed',
  'completed',
]);

const ACTIVE_LOADING_STATES = ['loading_pending', 'loading_in_progress', 'vehicle_assigned', 'planned'];

/* ══════════════════════════════════════════════════════════
 * Helpers
 * ════════════════════════════════════════════════════════ */

const safeNum = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const safeStr = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v : v == null ? fallback : String(v);

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
    if (status === 404) return 'Trip or item not found.';
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
class LoadingChecklistBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { hasError: false };
  static getDerivedStateFromError(err: unknown): BoundaryState {
    return {
      hasError: true,
      message: err instanceof Error ? err.message : 'Unexpected error.',
    };
  }
  componentDidCatch(err: unknown) {
    // eslint-disable-next-line no-console
    console.error('[LoadingChecklistPage]', err);
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
              {this.state.message || 'Unable to render loading checklist.'}
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

export const LoadingChecklistPage: React.FC = () => {
  const { showError, showSuccess } = useNotification();
  const { can, isSuperAdmin } = usePermission();
  const loadingUser = useAuthStore((s) => s.loadingUser);
  const hasUser = useAuthStore((s) => Boolean(s.user));

  /* ── Permissions ── */
  const canView = isSuperAdmin || can('view deliveries') || can('view loading');
  const canEdit = isSuperAdmin || can('edit deliveries') || can('update loading');
  const canConfirm = isSuperAdmin || can('edit deliveries') || can('confirm loading');

  /* ── Data ── */
  const [trips, setTrips] = useState<DeliveryTrip[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null);
  const [currentTrip, setCurrentTrip] = useState<DeliveryTrip | null>(null);

  /* ── Loading / error states ── */
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [loadingTrip, setLoadingTrip] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tripError, setTripError] = useState<string | null>(null);

  /* ── Per-item updating state ── */
  const [updatingItemId, setUpdatingItemId] = useState<number | null>(null);
  const [confirmingLoading, setConfirmingLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);

  /* ── Local draft quantities (typing UX) ── */
  const [draftQty, setDraftQty] = useState<Record<number, number>>({});

  /* ── Checklist Filters ── */
  const [itemSearch, setItemSearch] = useState('');
  const [godownFilter, setGodownFilter] = useState('all');
  const [pickingStatusFilter, setPickingStatusFilter] = useState<'all' | 'pending' | 'completed'>('all');

  const hasChecklistFilters = Boolean(itemSearch.trim() || godownFilter !== 'all' || pickingStatusFilter !== 'all');

  const resetChecklistFilters = () => {
    setItemSearch('');
    setGodownFilter('all');
    setPickingStatusFilter('all');
  };

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
   * Fetchers
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

      // Auto-select a trip if none is chosen
      setSelectedTripId((prev) => {
        if (prev && list.some((t) => t.id === prev)) return prev;
        if (list.length === 0) return null;
        const active =
          list.find((t) => ACTIVE_LOADING_STATES.includes(t.status)) || list[0];
        return active?.id ?? null;
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
      setCurrentTrip(res?.data ?? null);
      setDraftQty({});
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
      if (!meta) return;
      const key = e.key.toLowerCase();
      if (key === 'r') {
        e.preventDefault();
        void fetchTrips();
        if (selectedTripId) void fetchTripDetails(selectedTripId);
      } else if (key === 'p') {
        e.preventDefault();
        if (currentTrip) window.print();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedTripId, currentTrip, fetchTrips, fetchTripDetails]);

  /* ══════════════════════════════════════════════════════
   * Item update actions
   * ══════════════════════════════════════════════════════ */

  const commitItemQty = useCallback(async (item: DeliveryLoadingItem, newQty: number) => {
    if (!canEdit) {
      showError('Permission denied', 'You do not have permission to update loading items.');
      return false;
    }
    const safeQty = Math.max(0, Math.min(item.planned_quantity, Math.floor(newQty)));
    if (safeQty === Number(item.picked_quantity)) return true;

    setUpdatingItemId(item.id);
    try {
      await deliveryService.updateLoadingItem(item.id, safeQty);
      if (selectedTripId) await fetchTripDetails(selectedTripId);
      // Clear draft for this item
      setDraftQty((prev) => {
        if (!(item.id in prev)) return prev;
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      return true;
    } catch (err) {
      showError('Update failed', getApiErrorMessage(err, 'Could not update loaded quantity.'));
      return false;
    } finally {
      if (mountedRef.current) setUpdatingItemId(null);
    }
  }, [canEdit, selectedTripId, fetchTripDetails, showError]);

  const handleQtyInputChange = useCallback((item: DeliveryLoadingItem, raw: string) => {
    const num = Math.max(0, Math.min(item.planned_quantity, Math.floor(Number(raw) || 0)));
    setDraftQty((prev) => ({ ...prev, [item.id]: num }));
  }, []);

  const handleQtyBlur = useCallback((item: DeliveryLoadingItem) => {
    const draft = draftQty[item.id];
    if (draft === undefined) return;
    if (draft === Number(item.picked_quantity)) {
      setDraftQty((prev) => { const n = { ...prev }; delete n[item.id]; return n; });
      return;
    }
    void commitItemQty(item, draft);
  }, [draftQty, commitItemQty]);

  const handleQtyKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>, item: DeliveryLoadingItem) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      setDraftQty((prev) => { const n = { ...prev }; delete n[item.id]; return n; });
    }
  }, []);

  const handleIncrement = useCallback((item: DeliveryLoadingItem, delta: number) => {
    if (!canEdit) return;
    if (updatingItemId === item.id) return;
    const current = draftQty[item.id] ?? Number(item.picked_quantity);
    const next = Math.max(0, Math.min(item.planned_quantity, current + delta));
    if (next === current) return;
    setDraftQty((prev) => ({ ...prev, [item.id]: next }));
    void commitItemQty(item, next);
  }, [canEdit, updatingItemId, draftQty, commitItemQty]);

  const handleLoadAllItem = useCallback((item: DeliveryLoadingItem) => {
    if (!canEdit || updatingItemId === item.id) return;
    setDraftQty((prev) => ({ ...prev, [item.id]: item.planned_quantity }));
    void commitItemQty(item, item.planned_quantity);
  }, [canEdit, updatingItemId, commitItemQty]);

  /* ══════════════════════════════════════════════════════
   * Bulk actions
   * ══════════════════════════════════════════════════════ */

  const handleLoadAllPlanned = useCallback(async () => {
    if (!canEdit) {
      showError('Permission denied', 'You do not have permission to update loading items.');
      return;
    }
    if (!currentTrip?.loading_items || bulkLoading) return;
    const pending = currentTrip.loading_items.filter(
      (i) => Number(i.picked_quantity) < Number(i.planned_quantity)
    );
    if (pending.length === 0) {
      showSuccess('All loaded', 'All items are already at 100% picked.');
      return;
    }
    if (!window.confirm(
      `Mark all remaining items as 100% loaded?\n\n${pending.length} item${pending.length === 1 ? '' : 's'} will be updated.`
    )) return;

    setBulkLoading(true);
    try {
      const results = await Promise.allSettled(
        pending.map((item) => deliveryService.updateLoadingItem(item.id, item.planned_quantity))
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (selectedTripId) await fetchTripDetails(selectedTripId);
      setDraftQty({});
      if (failed === 0) {
        showSuccess('Bulk update done', `All ${pending.length} item${pending.length === 1 ? '' : 's'} marked loaded.`);
      } else {
        showError('Partial failure', `${failed} of ${pending.length} item${pending.length === 1 ? '' : 's'} failed to update.`);
      }
    } catch (err) {
      showError('Bulk update failed', getApiErrorMessage(err));
    } finally {
      if (mountedRef.current) setBulkLoading(false);
    }
  }, [canEdit, currentTrip, selectedTripId, bulkLoading, fetchTripDetails, showSuccess, showError]);

  const handleConfirmLoading = useCallback(async () => {
    if (!canConfirm) {
      showError('Permission denied', 'You do not have permission to confirm loading.');
      return;
    }
    if (!selectedTripId || confirmingLoading) return;

    const pending = currentTrip?.loading_items?.filter(
      (i) => Number(i.picked_quantity) < Number(i.planned_quantity)
    ) ?? [];
    const msg = pending.length > 0
      ? `${pending.length} item${pending.length === 1 ? '' : 's'} are not fully loaded.\n\nConfirm loading anyway? The trip will be marked ready for dispatch.`
      : 'Confirm that all items are correctly loaded?\n\nThe trip will be marked ready for dispatch.';
    if (!window.confirm(msg)) return;

    setConfirmingLoading(true);
    try {
      await deliveryService.confirmLoading(selectedTripId);
      await Promise.all([fetchTripDetails(selectedTripId), fetchTrips()]);
      setDraftQty({});
      showSuccess('Loading confirmed', 'Trip is ready for dispatch.');
    } catch (err) {
      showError('Confirmation failed', getApiErrorMessage(err));
    } finally {
      if (mountedRef.current) setConfirmingLoading(false);
    }
  }, [canConfirm, selectedTripId, currentTrip, confirmingLoading, fetchTripDetails, fetchTrips, showSuccess, showError]);

  /* ══════════════════════════════════════════════════════
   * Derived data
   * ══════════════════════════════════════════════════════ */

  const distinctGodowns = useMemo(() => {
    const set = new Set<string>();
    currentTrip?.loading_items?.forEach((i) => {
      set.add(i.warehouse?.name || 'Primary Godown');
    });
    return Array.from(set);
  }, [currentTrip]);

  const groupedByWarehouse = useMemo(() => {
    const groups: Record<string, DeliveryLoadingItem[]> = {};
    if (currentTrip?.loading_items) {
      currentTrip.loading_items.forEach((item) => {
        const name = item.warehouse?.name || 'Primary Godown';
        if (godownFilter !== 'all' && name !== godownFilter) return;

        if (itemSearch.trim()) {
          const term = itemSearch.trim().toLowerCase();
          const prodName = (item.product?.name || item.notes || '').toLowerCase();
          const sku = (item.product?.sku || '').toLowerCase();
          if (!prodName.includes(term) && !sku.includes(term)) return;
        }

        const planned = safeNum(item.planned_quantity);
        const picked = safeNum(item.picked_quantity);
        if (pickingStatusFilter === 'pending' && picked >= planned) return;
        if (pickingStatusFilter === 'completed' && picked < planned) return;

        if (!groups[name]) groups[name] = [];
        groups[name].push(item);
      });
    }
    return groups;
  }, [currentTrip, itemSearch, godownFilter, pickingStatusFilter]);

  const totals = useMemo(() => {
    const items = currentTrip?.loading_items ?? [];
    const planned = items.reduce((acc, i) => acc + safeNum(i.planned_quantity), 0);
    const picked = items.reduce((acc, i) => acc + safeNum(i.picked_quantity), 0);
    const pendingLines = items.filter(
      (i) => safeNum(i.picked_quantity) < safeNum(i.planned_quantity)
    ).length;
    return {
      planned,
      picked,
      pendingLines,
      progressPercent: planned > 0 ? Math.round((picked / planned) * 100) : 0,
    };
  }, [currentTrip]);

  const canConfirmLoadingState = useMemo(() => {
    if (!currentTrip) return false;
    if (CONFIRMED_LOADING_STATES.has(currentTrip.status)) return false;
    return canConfirm;
  }, [currentTrip, canConfirm]);

  const displayQty = useCallback((item: DeliveryLoadingItem): number => {
    return draftQty[item.id] ?? Number(item.picked_quantity);
  }, [draftQty]);

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
          <FiAlertCircle className="mx-auto mb-3 text-rose-600" size={32} />
          <h2 className="text-lg font-bold text-slate-900">Access denied</h2>
          <p className="mt-1.5 text-sm text-slate-500">
            You don't have permission to view loading checklists.
          </p>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════
   * Render
   * ══════════════════════════════════════════════════════ */

  return (
    <LoadingChecklistBoundary>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm 10mm; }
          html, body { background: #fff !important; color: #000 !important; margin: 0 !important; padding: 0 !important; }
          body * { visibility: hidden !important; }
          .print-manifest, .print-manifest * { visibility: visible !important; }
          .print-manifest {
            position: absolute !important; left: 0 !important; top: 0 !important;
            width: 100% !important; margin: 0 !important; padding: 0 !important;
            display: block !important; color: #000 !important; background: #fff !important;
            font-family: Arial, Helvetica, sans-serif !important;
          }
          .page-break-avoid { page-break-inside: avoid !important; }
        }
      `}</style>

      <div className="min-h-full bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100/60 print:hidden">
        <div className="mx-auto w-full max-w-[1500px] space-y-4 p-3 sm:space-y-5 sm:p-4 lg:p-5 xl:p-6">

          {/* ── Hero ── */}
          <section className="relative overflow-hidden rounded-2xl border border-slate-800/10 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-4 py-5 shadow-[0_20px_40px_-20px_rgba(15,23,42,0.45)] sm:px-6 sm:py-6 lg:px-7">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-emerald-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />
            <div className="relative flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200 backdrop-blur">
                  <FiCheckSquare size={12} /> Logistics · Godown Loading
                </div>
                <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl xl:text-[30px]">
                  Godown Loading Checklist
                </h1>
                <p className="mt-1.5 max-w-2xl text-xs text-slate-300 sm:text-sm">
                  Verify picked quantities per facility before dispatch — without double-deducting stock.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
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
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => currentTrip && window.print()}
                  disabled={!currentTrip}
                  title="Print (Ctrl+P)"
                  className="h-10 rounded-xl border-white/10 bg-white/5 text-white shadow-none backdrop-blur transition hover:border-white/20 hover:bg-white/10 hover:text-white disabled:opacity-50"
                >
                  <FiPrinter className="mr-2" size={14} />
                  Print Manifest
                </Button>
              </div>
            </div>
          </section>

          {/* ── Trip selector + actions ── */}
          <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <CardContent className="p-3 sm:p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                  <label className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Select Trip
                  </label>
                  <select
                    aria-label="Select trip"
                    value={selectedTripId ?? ''}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (v > 0) setSelectedTripId(v);
                    }}
                    disabled={loadingTrips || trips.length === 0}
                    className="h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-800 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 disabled:opacity-50 sm:max-w-md"
                  >
                    {trips.length === 0 ? (
                      <option value="">No trips available</option>
                    ) : (
                      trips.map((t) => (
                        <option key={t.id} value={t.id}>
                          {safeStr(t.trip_code)} — {safeStr(t.planned_date)} ({t.vehicle?.name || 'No Vehicle'}) [{statusLabel(t.status)}]
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {currentTrip && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleLoadAllPlanned()}
                      disabled={!canEdit || bulkLoading || totals.pendingLines === 0}
                      className="h-10 rounded-xl border-indigo-200 bg-indigo-50 font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                    >
                      {bulkLoading ? (
                        <FiLoader className="mr-1.5 animate-spin" size={13} />
                      ) : (
                        <FiCheckSquare className="mr-1.5" size={13} />
                      )}
                      {bulkLoading ? 'Updating…' : 'Mark all as loaded'}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void handleConfirmLoading()}
                      disabled={!canConfirmLoadingState || confirmingLoading}
                      className="h-10 rounded-xl bg-emerald-600 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {confirmingLoading ? (
                        <FiLoader className="mr-1.5 animate-spin" size={13} />
                      ) : (
                        <FiCheckCircle className="mr-1.5" size={13} />
                      )}
                      {confirmingLoading ? 'Confirming…' : 'Confirm loading'}
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ── Errors ── */}
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

          {/* ── Body ── */}
          {loadingTrip ? (
            <div className="space-y-4">
              <div className="h-32 animate-pulse rounded-2xl bg-slate-200" />
              <div className="h-64 animate-pulse rounded-2xl bg-slate-200" />
            </div>
          ) : !currentTrip ? (
            <Card className="rounded-2xl border-slate-200/80">
              <CardContent>
                <div className="py-14 text-center">
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-slate-200/70">
                    <FiTruck className="h-6 w-6 text-slate-400" />
                  </div>
                  <p className="mt-4 text-base font-semibold text-slate-800">
                    No carrier trips found
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Create a delivery trip from Route Planning to inspect loading checklists.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4 lg:space-y-6">
              {/* ── Trip summary card ── */}
              <Card className="rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                <CardContent className="p-4 sm:p-6">
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4 lg:gap-6">
                    {/* Trip */}
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                        Trip details
                      </p>
                      <p className="mt-1 text-lg font-bold text-slate-900">
                        {safeStr(currentTrip.trip_code, '—')}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Date: {safeStr(currentTrip.planned_date, '—')}
                      </p>
                      {(currentTrip.company || currentTrip.branch) && (
                        <p className="mt-1 text-[11px] font-medium text-slate-700">
                          {currentTrip.company?.name ?? '—'}
                          {currentTrip.branch ? ` · ${currentTrip.branch.name}` : ''}
                        </p>
                      )}
                      <div className="mt-2">
                        <Badge
                          variant="outline"
                          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize ${
                            TRIP_STATUS_CLASSES[currentTrip.status] ?? DEFAULT_TRIP_STATUS_CLASS
                          }`}
                        >
                          {statusLabel(currentTrip.status)}
                        </Badge>
                      </div>
                    </div>

                    {/* Vehicle / driver */}
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                        Vehicle &amp; driver
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                        <FiTruck size={13} className="text-blue-500" />
                        {currentTrip.vehicle?.name || 'Unassigned'}
                        {currentTrip.vehicle?.registration_number && (
                          <span className="font-mono text-[11px] text-slate-500">
                            ({currentTrip.vehicle.registration_number})
                          </span>
                        )}
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                        <FiUser size={11} className="text-emerald-500" />
                        {currentTrip.driver?.name || 'Unassigned'}
                        {currentTrip.driver?.contact_number && (
                          <span className="text-slate-400">({currentTrip.driver.contact_number})</span>
                        )}
                      </p>
                    </div>

                    {/* Scope */}
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                        Delivery scope
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {safeNum(currentTrip.total_customers)} customer orders
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {safeNum(currentTrip.total_items_count)} SKUs · {safeNum(currentTrip.total_quantity)} units
                      </p>
                    </div>

                    {/* Progress */}
                    <div>
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                          Picking progress
                        </p>
                        <p className={`text-sm font-bold tabular-nums ${totals.progressPercent === 100 ? 'text-emerald-600' : 'text-slate-900'}`}>
                          {totals.progressPercent}%
                        </p>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            totals.progressPercent === 100 ? 'bg-emerald-500' : 'bg-indigo-500'
                          }`}
                          style={{ width: `${totals.progressPercent}%` }}
                          role="progressbar"
                          aria-valuenow={totals.progressPercent}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        />
                      </div>
                      <p className="mt-1.5 text-[11px] text-slate-500">
                        <span className="font-semibold text-slate-800">{totals.picked}</span>
                        {' / '}
                        {totals.planned} units
                        {totals.pendingLines > 0 && (
                          <span className="ml-2 text-amber-600">
                            ({totals.pendingLines} line{totals.pendingLines === 1 ? '' : 's'} pending)
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ── Checklist Filters ── */}
              {currentTrip && currentTrip.loading_items && currentTrip.loading_items.length > 0 && (
                <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                      {/* Search */}
                      <div className="relative flex-1">
                        <FiSearch className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                        <input
                          type="text"
                          value={itemSearch}
                          onChange={(e) => setItemSearch(e.target.value)}
                          placeholder="Search product name, SKU, item notes…"
                          className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-9 text-xs text-slate-800 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 sm:text-sm"
                        />
                        {itemSearch && (
                          <button
                            type="button"
                            onClick={() => setItemSearch('')}
                            aria-label="Clear search"
                            className="absolute right-2 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-md text-slate-400 hover:text-slate-700"
                          >
                            <FiX size={13} />
                          </button>
                        )}
                      </div>

                      {/* Godown Filter */}
                      <select
                        aria-label="Filter by godown"
                        value={godownFilter}
                        onChange={(e) => setGodownFilter(e.target.value)}
                        className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 sm:text-xs"
                      >
                        <option value="all">All Godowns</option>
                        {distinctGodowns.map((g) => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </select>

                      {/* Status Filter */}
                      <select
                        aria-label="Filter by loading status"
                        value={pickingStatusFilter}
                        onChange={(e) => setPickingStatusFilter(e.target.value as any)}
                        className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 sm:text-xs"
                      >
                        <option value="all">All Items</option>
                        <option value="pending">Pending Loading</option>
                        <option value="completed">100% Loaded</option>
                      </select>

                      {hasChecklistFilters && (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={resetChecklistFilters}
                          className="h-9 shrink-0 gap-1 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                        >
                          <FiX size={13} /> Clear
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ── Warehouse sections ── */}
              {Object.keys(groupedByWarehouse).length === 0 ? (
                <Card className="rounded-2xl border-slate-200/80">
                  <CardContent>
                    <div className="py-14 text-center">
                      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-slate-200/70">
                        <FiBox className="h-6 w-6 text-slate-400" />
                      </div>
                      <p className="mt-4 text-base font-semibold text-slate-800">
                        No loading items registered
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Add delivery orders to this trip from Route Planning to generate the checklist.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                Object.entries(groupedByWarehouse).map(([whName, items]) => {
                  const whPlanned = items.reduce((acc, i) => acc + safeNum(i.planned_quantity), 0);
                  const whPicked = items.reduce((acc, i) => acc + safeNum(i.picked_quantity), 0);
                  const whDone = whPlanned > 0 && whPicked >= whPlanned;

                  return (
                    <Card key={whName} className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                      <CardHeader className="flex flex-col gap-2 border-b border-slate-100 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-500/10">
                            <FiHome size={14} />
                          </div>
                          <div className="min-w-0">
                            <CardTitle className="truncate text-xs font-semibold text-slate-800 sm:text-sm">
                              {whName}
                            </CardTitle>
                            <CardDescription className="truncate text-[10px] text-slate-500 sm:text-[11px]">
                              {items.length} line item{items.length === 1 ? '' : 's'} · {whPicked}/{whPlanned} units
                            </CardDescription>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                            whDone
                              ? 'border-emerald-200/70 bg-emerald-50 text-emerald-700'
                              : 'border-amber-200/70 bg-amber-50 text-amber-700'
                          }`}
                        >
                          {whDone ? (
                            <>
                              <FiCheckCircle className="mr-1" size={10} /> Ready
                            </>
                          ) : (
                            <>
                              <FiAlertCircle className="mr-1" size={10} /> Picking
                            </>
                          )}
                        </Badge>
                      </CardHeader>

                      {/* Desktop table */}
                      <div className="hidden overflow-x-auto lg:block">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-slate-50/70 text-[11px] uppercase tracking-wide text-slate-500">
                            <tr>
                              <th className="px-5 py-3 font-semibold">Product / SKU</th>
                              <th className="px-5 py-3 font-semibold">Order</th>
                              <th className="px-5 py-3 text-center font-semibold">Planned</th>
                              <th className="px-5 py-3 text-center font-semibold">Loaded</th>
                              <th className="px-5 py-3 text-center font-semibold">Status</th>
                              <th className="px-5 py-3 text-right font-semibold">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {items.map((item) => {
                              const planned = safeNum(item.planned_quantity);
                              const picked = Number(item.picked_quantity);
                              const draft = displayQty(item);
                              const isFullyPicked = picked >= planned;
                              const isUpdating = updatingItemId === item.id;
                              const hasDraft = item.id in draftQty && draftQty[item.id] !== picked;

                              return (
                                <tr key={item.id} className="transition-colors hover:bg-slate-50/70">
                                  <td className="px-5 py-3.5">
                                    <p className="font-semibold text-slate-900">
                                      {item.product?.name || `Product #${item.product_id}`}
                                    </p>
                                    <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                                      SKU: {item.product?.sku || 'N/A'}
                                    </p>
                                  </td>
                                  <td className="px-5 py-3.5">
                                    <p className="text-[11px] font-semibold text-slate-700">
                                      Order #{safeNum(item.delivery_order_id)}
                                    </p>
                                    <p className="text-[10px] text-slate-400">Trip stop item</p>
                                  </td>
                                  <td className="px-5 py-3.5 text-center font-bold tabular-nums text-slate-900">
                                    {planned}
                                  </td>
                                  <td className="px-5 py-3.5 text-center">
                                    <div className="inline-flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => handleIncrement(item, -1)}
                                        disabled={isUpdating || !canEdit || draft <= 0}
                                        aria-label="Decrease quantity"
                                        className="grid h-7 w-7 place-items-center rounded-md bg-slate-100 text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-30"
                                      >
                                        −
                                      </button>
                                      <input
                                        type="number"
                                        inputMode="numeric"
                                        min={0}
                                        max={planned}
                                        step="1"
                                        value={draft}
                                        onChange={(e) => handleQtyInputChange(item, e.target.value)}
                                        onBlur={() => handleQtyBlur(item)}
                                        onKeyDown={(e) => handleQtyKeyDown(e, item)}
                                        disabled={isUpdating || !canEdit}
                                        aria-label={`Loaded quantity for ${item.product?.name ?? 'item'}`}
                                        className={`h-8 w-16 rounded-md border bg-white px-1.5 text-center text-sm font-bold tabular-nums text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 ${
                                          hasDraft ? 'border-indigo-300 ring-1 ring-indigo-200' : 'border-slate-200'
                                        }`}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleIncrement(item, 1)}
                                        disabled={isUpdating || !canEdit || draft >= planned}
                                        aria-label="Increase quantity"
                                        className="grid h-7 w-7 place-items-center rounded-md bg-slate-100 text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-30"
                                      >
                                        +
                                      </button>
                                    </div>
                                  </td>
                                  <td className="px-5 py-3.5 text-center">
                                    {isFullyPicked ? (
                                      <Badge variant="outline" className="rounded-full border border-emerald-200/70 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                        <FiCheckCircle className="mr-1" size={10} /> Loaded
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="rounded-full border border-amber-200/70 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                                        <FiLayers className="mr-1" size={10} /> {planned - picked} pending
                                      </Badge>
                                    )}
                                  </td>
                                  <td className="px-5 py-3.5 text-right">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleLoadAllItem(item)}
                                      disabled={isUpdating || !canEdit || isFullyPicked}
                                      className="h-8 rounded-lg text-xs"
                                    >
                                      {isUpdating ? (
                                        <FiLoader className="animate-spin" size={12} />
                                      ) : (
                                        'Load all'
                                      )}
                                    </Button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile / tablet card view */}
                      <div className="divide-y divide-slate-100 lg:hidden">
                        {items.map((item) => {
                          const planned = safeNum(item.planned_quantity);
                          const picked = Number(item.picked_quantity);
                          const draft = displayQty(item);
                          const isFullyPicked = picked >= planned;
                          const isUpdating = updatingItemId === item.id;
                          const hasDraft = item.id in draftQty && draftQty[item.id] !== picked;

                          return (
                            <div key={item.id} className="p-3 sm:p-4">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold text-slate-900">
                                    {item.product?.name || `Product #${item.product_id}`}
                                  </p>
                                  <p className="mt-0.5 truncate font-mono text-[10px] text-slate-500">
                                    SKU: {item.product?.sku || 'N/A'} · Order #{safeNum(item.delivery_order_id)}
                                  </p>
                                </div>
                                {isFullyPicked ? (
                                  <Badge variant="outline" className="shrink-0 rounded-full border border-emerald-200/70 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                    Loaded
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="shrink-0 rounded-full border border-amber-200/70 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                    {planned - picked} pending
                                  </Badge>
                                )}
                              </div>
                              <div className="mt-2 flex items-center justify-between gap-2">
                                <p className="text-[11px] text-slate-500">
                                  Planned: <span className="font-semibold text-slate-800">{planned}</span>
                                </p>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleIncrement(item, -1)}
                                    disabled={isUpdating || !canEdit || draft <= 0}
                                    aria-label="Decrease quantity"
                                    className="grid h-7 w-7 place-items-center rounded-md bg-slate-100 text-slate-700 disabled:opacity-30"
                                  >
                                    −
                                  </button>
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    min={0}
                                    max={planned}
                                    step="1"
                                    value={draft}
                                    onChange={(e) => handleQtyInputChange(item, e.target.value)}
                                    onBlur={() => handleQtyBlur(item)}
                                    onKeyDown={(e) => handleQtyKeyDown(e, item)}
                                    disabled={isUpdating || !canEdit}
                                    aria-label={`Loaded quantity for ${item.product?.name ?? 'item'}`}
                                    className={`h-8 w-14 rounded-md border bg-white px-1 text-center text-sm font-bold tabular-nums text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-50 ${
                                      hasDraft ? 'border-indigo-300 ring-1 ring-indigo-200' : 'border-slate-200'
                                    }`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleIncrement(item, 1)}
                                    disabled={isUpdating || !canEdit || draft >= planned}
                                    aria-label="Increase quantity"
                                    className="grid h-7 w-7 place-items-center rounded-md bg-slate-100 text-slate-700 disabled:opacity-30"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                              <div className="mt-2 flex justify-end">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleLoadAllItem(item)}
                                  disabled={isUpdating || !canEdit || isFullyPicked}
                                  className="h-7 rounded-lg text-[11px]"
                                >
                                  {isUpdating ? (
                                    <FiLoader className="animate-spin" size={11} />
                                  ) : (
                                    'Load all'
                                  )}
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
       * PRINT MANIFEST
       * ══════════════════════════════════════════════════ */}
      {currentTrip && (
        <div className="print-manifest hidden text-black bg-white p-4 print:block">
          {/* Header */}
          <div className="border-b-2 border-black pb-3 mb-3 flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-extrabold uppercase tracking-wider text-black">
                  {currentTrip.company?.name || 'NIXA ERP LOGISTICS OPERATIONS'}
                </h1>
                {currentTrip.company?.code && (
                  <span className="text-xs font-mono font-bold px-1.5 py-0.5 border border-black rounded text-black">
                    {currentTrip.company.code}
                  </span>
                )}
              </div>

              <div className="text-xs font-semibold text-black mt-1 flex flex-wrap items-center gap-x-2">
                <span>
                  <strong>Branch Depot:</strong> {currentTrip.branch?.name || 'Main Regional Depot'}
                  {currentTrip.branch?.code ? ` (${currentTrip.branch.code})` : ''}
                </span>
                {currentTrip.branch?.phone && (
                  <span>• <strong>Branch Phone:</strong> {currentTrip.branch.phone}</span>
                )}
                {currentTrip.branch?.address && (
                  <span>• {currentTrip.branch.address}</span>
                )}
              </div>

              <div className="text-[10px] text-gray-700 mt-0.5 flex flex-wrap items-center gap-x-2">
                {currentTrip.company?.gst_number && (
                  <span><strong>GSTIN:</strong> {currentTrip.company.gst_number}</span>
                )}
                {currentTrip.company?.pan_number && (
                  <span>• <strong>PAN:</strong> {currentTrip.company.pan_number}</span>
                )}
                {currentTrip.company?.phone && (
                  <span>• <strong>HQ Phone:</strong> {currentTrip.company.phone}</span>
                )}
                {currentTrip.company?.address && (
                  <span>• {currentTrip.company.address}</span>
                )}
              </div>

              <h2 className="text-sm font-bold uppercase text-black mt-2 tracking-wide border-t border-gray-400 pt-1">
                GODOWN LOADING CHECKLIST &amp; VEHICLE DISPATCH PICKING MANIFEST
              </h2>
              <p className="text-[11px] text-gray-700">
                Wholesale Supply — Staging &amp; Gate Pass
              </p>
            </div>

            <div className="text-right text-[11px] text-gray-800 ml-4 shrink-0">
              <div className="font-mono font-bold text-sm text-black border border-black px-2 py-0.5 bg-gray-50 mb-1">
                TRIP #{currentTrip.trip_code}
              </div>
              <div><strong>Print Date:</strong> {new Date().toLocaleString('en-IN')}</div>
              <div><strong>Planned Date:</strong> {currentTrip.planned_date}</div>
              <div className="text-[10px] text-gray-600 mt-0.5 uppercase tracking-wide">
                Official Staging Document
              </div>
            </div>
          </div>

          {/* Summary box */}
          <div className="border border-black p-3 mb-4 rounded-sm text-xs bg-gray-50/50 page-break-avoid">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <span className="text-[10px] uppercase font-bold text-gray-600 block">Carrier Trip Code:</span>
                <span className="font-mono font-bold text-sm text-black">{currentTrip.trip_code}</span>
                <div className="text-[11px] text-gray-700 mt-0.5"><strong>Date:</strong> {currentTrip.planned_date}</div>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-gray-600 block">Assigned Vehicle:</span>
                <span className="font-bold text-black text-xs">
                  {currentTrip.vehicle?.name || 'Carrier Vehicle'} ({currentTrip.vehicle?.registration_number || 'N/A'})
                </span>
                <div className="text-[11px] text-gray-700 mt-0.5 uppercase">
                  Type: {safeStr(currentTrip.vehicle?.type).replace(/_/g, ' ')} · Max: {currentTrip.vehicle?.max_capacity} {currentTrip.vehicle?.capacity_unit}
                </div>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-gray-600 block">Carrier Driver:</span>
                <span className="font-bold text-black text-xs">
                  {currentTrip.driver?.name || 'Unassigned'}
                </span>
                <div className="text-[11px] text-gray-700 mt-0.5">
                  Phone: {currentTrip.driver?.contact_number || 'N/A'}
                </div>
              </div>
            </div>

            <div className="mt-2 pt-2 border-t border-gray-300 grid grid-cols-3 gap-3 text-[11px]">
              <div>
                <strong>Total Customers:</strong> {safeNum(currentTrip.total_customers)} Orders
              </div>
              <div>
                <strong>Total Packed / Load:</strong> {totals.picked} / {totals.planned} Units ({safeNum(currentTrip.total_items_count)} SKUs)
              </div>
              <div className="uppercase">
                <strong>Loading Status:</strong> {statusLabel(currentTrip.status)}
              </div>
            </div>
          </div>

          {/* Route stops */}
          {currentTrip.stops && currentTrip.stops.length > 0 && (
            <div className="mb-4 page-break-avoid">
              <h3 className="text-xs font-bold uppercase tracking-wider text-black mb-1">
                Route Stop Sequence &amp; Customer Staging Order:
              </h3>
              <table className="w-full text-left text-[11px] border border-black border-collapse">
                <thead>
                  <tr className="bg-gray-100 border-b border-black text-[10px] uppercase">
                    <th className="p-1.5 border-r border-black w-10 text-center">Stop #</th>
                    <th className="p-1.5 border-r border-black">Customer Name &amp; Contact</th>
                    <th className="p-1.5 border-r border-black">Delivery Town / Area</th>
                    <th className="p-1.5 border-r border-black">Destination Address Snapshot</th>
                    <th className="p-1.5 text-center w-24">Order / Inv Ref</th>
                  </tr>
                </thead>
                <tbody>
                  {currentTrip.stops.map((stop, sIdx) => (
                    <tr key={stop.id} className="border-b border-gray-300">
                      <td className="p-1.5 border-r border-black text-center font-bold">
                        {stop.stop_sequence || sIdx + 1}
                      </td>
                      <td className="p-1.5 border-r border-black font-semibold">
                        {stop.customer_name}
                      </td>
                      <td className="p-1.5 border-r border-black">
                        {stop.delivery_area || stop.order?.town || 'Local'}
                      </td>
                      <td className="p-1.5 border-r border-black text-[10px] text-gray-700">
                        {stop.delivery_address || stop.order?.delivery_address || 'Address on file'}
                      </td>
                      <td className="p-1.5 text-center font-mono text-[10px]">
                        Order #{stop.delivery_order_id}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Warehouse items */}
          <div className="mb-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-black mb-1">
              Itemized Physical Picking Checklist (By Godown / Facility):
            </h3>

            {Object.keys(groupedByWarehouse).length === 0 ? (
              <div className="p-4 border border-black text-center text-xs text-gray-600">
                No loading items found for this trip.
              </div>
            ) : (
              Object.entries(groupedByWarehouse).map(([whName, items]) => (
                <div key={whName} className="mb-4 page-break-avoid">
                  <div className="bg-gray-200 border-t border-l border-r border-black px-2.5 py-1 text-xs font-bold uppercase flex justify-between">
                    <span>Facility / Godown: {whName}</span>
                    <span>{items.length} Picking Lines</span>
                  </div>
                  <table className="w-full text-left text-[11px] border border-black border-collapse">
                    <thead>
                      <tr className="bg-gray-100 border-b border-black text-[10px] uppercase">
                        <th className="p-1.5 border-r border-black w-8 text-center">#</th>
                        <th className="p-1.5 border-r border-black">Product Name &amp; SKU</th>
                        <th className="p-1.5 border-r border-black">Customer Destination</th>
                        <th className="p-1.5 border-r border-black text-center w-16">Planned</th>
                        <th className="p-1.5 border-r border-black text-center w-16">Loaded</th>
                        <th className="p-1.5 border-r border-black text-center w-16">Phys. Check</th>
                        <th className="p-1.5">Remarks / Bin Loc</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => {
                        const isDone = safeNum(item.picked_quantity) >= safeNum(item.planned_quantity);
                        return (
                          <tr key={item.id} className="border-b border-gray-300">
                            <td className="p-1.5 border-r border-black text-center font-mono">
                              {idx + 1}
                            </td>
                            <td className="p-1.5 border-r border-black">
                              <span className="font-bold text-black">
                                {item.product?.name || `Product #${item.product_id}`}
                              </span>
                              <span className="font-mono text-[10px] text-gray-600 block">
                                SKU: {item.product?.sku || 'N/A'}
                              </span>
                            </td>
                            <td className="p-1.5 border-r border-black">
                              Order #{safeNum(item.delivery_order_id)}
                            </td>
                            <td className="p-1.5 border-r border-black text-center font-bold">
                              {safeNum(item.planned_quantity)}
                            </td>
                            <td className="p-1.5 border-r border-black text-center font-bold">
                              {safeNum(item.picked_quantity)}
                            </td>
                            <td className="p-1.5 border-r border-black text-center">
                              <span className="inline-block w-4 h-4 border border-black text-center font-bold text-[10px] leading-4">
                                {isDone ? '✓' : ''}
                              </span>
                            </td>
                            <td className="p-1.5 text-[10px] text-gray-600">
                              {item.notes || '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))
            )}
          </div>

          {/* Sign-off */}
          <div className="border border-black p-3 rounded-sm page-break-avoid">
            <div className="text-[10px] font-bold uppercase tracking-wider text-black mb-3 border-b border-gray-300 pb-1">
              Warehouse Picking Handover &amp; Dispatch Authorization Sign-Off
            </div>
            <div className="grid grid-cols-4 gap-4 text-[10px] text-black">
              <div className="border-r border-gray-300 pr-2">
                <span className="font-bold block uppercase mb-1">1. Warehouse Loader:</span>
                <div className="h-8 border-b border-dashed border-gray-400"></div>
                <div className="mt-1">Picked By: ________________</div>
                <div className="mt-1">Date &amp; Time: _____________</div>
              </div>

              <div className="border-r border-gray-300 pr-2">
                <span className="font-bold block uppercase mb-1">2. Godown Supervisor:</span>
                <div className="h-8 border-b border-dashed border-gray-400"></div>
                <div className="mt-1">Verified By: ____________</div>
                <div className="mt-1">Seal &amp; Sign: ____________</div>
              </div>

              <div className="border-r border-gray-300 pr-2">
                <span className="font-bold block uppercase mb-1">3. Carrier Driver:</span>
                <div className="h-8 border-b border-dashed border-gray-400"></div>
                <div className="mt-1">Goods Received in Vehicle</div>
                <div className="mt-1">Driver Sign: _____________</div>
              </div>

              <div>
                <span className="font-bold block uppercase mb-1">4. Security Gate Pass:</span>
                <div className="h-8 border-b border-dashed border-gray-400"></div>
                <div className="mt-1">Gate Pass: Verified [  ]</div>
                <div className="mt-1">Out Time: _______________</div>
              </div>
            </div>
          </div>

          <div className="text-center text-[9px] text-gray-500 mt-2">
            Notice: All items must be counted and verified before vehicle outward dispatch. Retain a signed copy at the warehouse security desk.
          </div>
        </div>
      )}
    </LoadingChecklistBoundary>
  );
};

export default LoadingChecklistPage;