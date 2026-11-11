// src/pages/CashDrawerPage.tsx
import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  Component,
  type ReactNode,
} from 'react';
import {
  FiActivity,
  FiBox,
  FiDollarSign,
  FiFileText,
  FiLayers,
  FiPlus,
  FiRefreshCw,
  FiRepeat,
  FiShield,
  FiAlertCircle,
  FiLoader,
  FiCalendar,
} from 'react-icons/fi';
import {
  CashDrawer,
  CashDrawerSession,
  CashDrawerTransaction,
  CashDrawerTransfer,
  CashDrawerDashboardData,
} from '../types/cashDrawer';
import cashDrawerService from '../services/cashDrawerService';
import apiClient from '../api';
import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';

import { CashDrawerDashboardTab } from './CashDrawer/CashDrawerDashboardTab';
import { CashDrawerListTab } from './CashDrawer/CashDrawerListTab';
import { CashDrawerLedgerTab } from './CashDrawer/CashDrawerLedgerTab';
import { CashTransfersTab } from './CashDrawer/CashTransfersTab';
import { CashDrawerReportsTab } from './CashDrawer/CashDrawerReportsTab';
import { CashDrawerAuditTab } from './CashDrawer/CashDrawerAuditTab';
import { OpenDrawerModal } from './CashDrawer/OpenDrawerModal';
import { CloseDrawerModal } from './CashDrawer/CloseDrawerModal';
import { CashInModal } from './CashDrawer/CashInModal';
import { CashOutModal } from './CashDrawer/CashOutModal';
import { InitiateTransferModal } from './CashDrawer/InitiateTransferModal';
import { CashDrawerCreateModal } from './CashDrawer/CashDrawerCreateModal';

/* ──────────────────────────────────────────────────────────
 * Types & Constants
 * ──────────────────────────────────────────────────────── */

type TabKey = 'dashboard' | 'drawers' | 'ledger' | 'transfers' | 'reports' | 'audit';

type DatePresetKey =
  | 'today'
  | 'yesterday'
  | '7d'
  | '30d'
  | 'this_month'
  | 'last_month'
  | 'custom';

interface BranchOption { id: number; name: string }

interface ApiListResponse<T> {
  data?: T[];
  [key: string]: unknown;
}

const STORAGE_KEYS = {
  branch: 'cashDrawer:branchId',
  drawer: 'cashDrawer:drawerId',
  dateFrom: 'cashDrawer:dateFrom',
  dateTo: 'cashDrawer:dateTo',
  preset: 'cashDrawer:datePreset',
} as const;

const DATE_PRESETS: { key: DatePresetKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'custom', label: 'Custom' },
];

/* ──────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────── */

const todayISO = (offset = 0): string => {
  const d = new Date();
  if (offset) d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

function presetToRange(preset: DatePresetKey): { from: string; to: string } {
  const now = new Date();
  const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
  const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);

  switch (preset) {
    case 'today':
      return { from: todayISO(), to: todayISO() };
    case 'yesterday':
      return { from: todayISO(-1), to: todayISO(-1) };
    case '7d':
      return { from: todayISO(-6), to: todayISO() };
    case '30d':
      return { from: todayISO(-29), to: todayISO() };
    case 'this_month': {
      const s = startOfMonth(now);
      return { from: s.toISOString().slice(0, 10), to: todayISO() };
    }
    case 'last_month': {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const start = startOfMonth(prev);
      const end = endOfMonth(prev);
      return {
        from: start.toISOString().slice(0, 10),
        to: end.toISOString().slice(0, 10),
      };
    }
    case 'custom':
    default:
      return { from: todayISO(), to: todayISO() };
  }
}

function safeReadNumber(key: string, fallback: number | 'all'): number | 'all' {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    if (raw === 'all') return 'all';
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

function safeReadString(key: string, fallback: string): string {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}

function safeWrite(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* quota */ }
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
    if (status === 404) return 'The record was not found.';
    if (status === 422 && msg) return msg;
    if (status && status >= 500) return 'Server error. Please try again.';
    if (msg) return msg;
  }
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/* ──────────────────────────────────────────────────────────
 * Error Boundary
 * ──────────────────────────────────────────────────────── */

interface BoundaryState { hasError: boolean; message?: string }
class TabErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(err: unknown): BoundaryState {
    return {
      hasError: true,
      message: err instanceof Error ? err.message : 'Unexpected error in this tab.',
    };
  }

  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.error('[CashDrawer][TabErrorBoundary]', error);
    try {
      addAppLog({
        module: 'Cash Drawer',
        action: 'Tab Error',
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    } catch { /* noop */ }
  }

  reset = () => this.setState({ hasError: false, message: undefined });

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-white text-rose-600 ring-1 ring-rose-200">
            <FiAlertCircle size={22} />
          </div>
          <h3 className="text-base font-bold text-slate-900">Something went wrong in this tab</h3>
          <p className="mt-1 text-sm text-slate-600">{this.state.message || 'Unknown error'}</p>
          <button
            type="button"
            onClick={this.reset}
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <FiRefreshCw size={14} /> Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ──────────────────────────────────────────────────────────
 * Main CashDrawerPage Component
 * ──────────────────────────────────────────────────────── */

export const CashDrawerPage: React.FC = () => {
  const { showError, showSuccess, showInfo } = useNotification();

  /* ---- Tabs ---- */
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');

  /* ---- Master data ---- */
  const [drawers, setDrawers] = useState<CashDrawer[]>([]);
  const [dashboardData, setDashboardData] = useState<CashDrawerDashboardData | null>(null);
  const [transactions, setTransactions] = useState<CashDrawerTransaction[]>([]);
  const [transfers, setTransfers] = useState<CashDrawerTransfer[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);

  /* ---- Filters (persisted) ---- */
  const [selectedBranchId, setSelectedBranchId] = useState<number | 'all'>(
    () => safeReadNumber(STORAGE_KEYS.branch, 'all')
  );
  const [selectedDrawerId, setSelectedDrawerId] = useState<number | 'all'>(
    () => safeReadNumber(STORAGE_KEYS.drawer, 'all')
  );
  const [datePreset, setDatePreset] = useState<DatePresetKey>(
    () => (safeReadString(STORAGE_KEYS.preset, 'today') as DatePresetKey) || 'today'
  );
  const initialPresetRange = useMemo(() => presetToRange(datePreset), []);
  const [dateFrom, setDateFrom] = useState(
    () => safeReadString(STORAGE_KEYS.dateFrom, initialPresetRange.from)
  );
  const [dateTo, setDateTo] = useState(
    () => safeReadString(STORAGE_KEYS.dateTo, initialPresetRange.to)
  );
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebouncedValue(searchTerm, 400);
  const [typeFilter, setTypeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  /* ---- Loading states ---- */
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingDrawers, setLoadingDrawers] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [loadingTransfers, setLoadingTransfers] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [closeDrawerLoading, setCloseDrawerLoading] = useState(false);

  /* ---- Error states ---- */
  const [errorDrawers, setErrorDrawers] = useState<string | null>(null);
  const [errorDashboard, setErrorDashboard] = useState<string | null>(null);
  const [errorTransactions, setErrorTransactions] = useState<string | null>(null);
  const [errorTransfers, setErrorTransfers] = useState<string | null>(null);

  /* ---- Modals state ---- */
  const [openModalDrawer, setOpenModalDrawer] = useState<CashDrawer | null>(null);
  const [closeModalDrawer, setCloseModalDrawer] = useState<CashDrawer | null>(null);
  const [closeModalSession, setCloseModalSession] = useState<CashDrawerSession | null>(null);
  const [cashInDrawer, setCashInDrawer] = useState<CashDrawer | null>(null);
  const [cashOutDrawer, setCashOutDrawer] = useState<CashDrawer | null>(null);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferDefaultSource, setTransferDefaultSource] = useState<CashDrawer | null>(null);
  const [isCreateDrawerOpen, setIsCreateDrawerOpen] = useState(false);

  /* ------------------------------------------------------------
   * Persistence of filter values
   * ---------------------------------------------------------- */
  useEffect(() => {
    safeWrite(STORAGE_KEYS.branch, String(selectedBranchId));
  }, [selectedBranchId]);

  useEffect(() => {
    safeWrite(STORAGE_KEYS.drawer, String(selectedDrawerId));
  }, [selectedDrawerId]);

  useEffect(() => {
    safeWrite(STORAGE_KEYS.dateFrom, dateFrom);
  }, [dateFrom]);

  useEffect(() => {
    safeWrite(STORAGE_KEYS.dateTo, dateTo);
  }, [dateTo]);

  useEffect(() => {
    safeWrite(STORAGE_KEYS.preset, datePreset);
  }, [datePreset]);

  /* ------------------------------------------------------------
   * Fetchers
   * ---------------------------------------------------------- */

  const fetchBranches = useCallback(async () => {
    setLoadingBranches(true);
    try {
      const res = (await apiClient.getBranches()) as unknown as ApiListResponse<BranchOption>;
      const list = Array.isArray(res) ? res : res?.data ?? [];
      setBranches(list.map((b) => ({ id: b.id, name: b.name })));
    } catch {
      // Branches are optional if single-branch
    } finally {
      setLoadingBranches(false);
    }
  }, []);

  const fetchDrawers = useCallback(async () => {
    setLoadingDrawers(true);
    setErrorDrawers(null);
    try {
      const params: Record<string, unknown> = {};
      if (selectedBranchId !== 'all') params.branch_id = selectedBranchId;
      const res = await cashDrawerService.listDrawers(params);
      setDrawers(res.data || []);
    } catch (err) {
      const msg = getApiErrorMessage(err, 'Failed to load cash drawers.');
      setErrorDrawers(msg);
      showError('Could not load cash drawers', msg);
    } finally {
      setLoadingDrawers(false);
    }
  }, [selectedBranchId, showError]);

  const fetchDashboard = useCallback(async () => {
    setLoadingDashboard(true);
    setErrorDashboard(null);
    try {
      const params: Record<string, unknown> = {};
      if (selectedBranchId !== 'all') params.branch_id = selectedBranchId;
      if (selectedDrawerId !== 'all') params.cash_drawer_id = selectedDrawerId;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const res = await cashDrawerService.getDashboardMetrics(params);
      setDashboardData(res.data);
    } catch (err) {
      const msg = getApiErrorMessage(err, 'Failed to load dashboard metrics.');
      setErrorDashboard(msg);
      showError('Could not load cash metrics', msg);
    } finally {
      setLoadingDashboard(false);
    }
  }, [selectedBranchId, selectedDrawerId, dateFrom, dateTo, showError]);

  const fetchTransactions = useCallback(async () => {
    setLoadingTransactions(true);
    setErrorTransactions(null);
    try {
      const params: Record<string, unknown> = {};
      if (selectedBranchId !== 'all') params.branch_id = selectedBranchId;
      if (selectedDrawerId !== 'all') params.cash_drawer_id = selectedDrawerId;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (typeFilter !== 'all') params.transaction_type = typeFilter;
      if (categoryFilter !== 'all') params.category = categoryFilter;
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();

      const res = await cashDrawerService.listTransactions(params);
      setTransactions(res.data || []);
    } catch (err) {
      const msg = getApiErrorMessage(err, 'Failed to load transactions.');
      setErrorTransactions(msg);
      showError('Could not load transactions', msg);
    } finally {
      setLoadingTransactions(false);
    }
  }, [
    selectedBranchId,
    selectedDrawerId,
    dateFrom,
    dateTo,
    typeFilter,
    categoryFilter,
    debouncedSearch,
    showError,
  ]);

  const fetchTransfers = useCallback(async () => {
    setLoadingTransfers(true);
    setErrorTransfers(null);
    try {
      const params: Record<string, unknown> = {};
      if (selectedBranchId !== 'all') params.branch_id = selectedBranchId;
      const res = await cashDrawerService.listTransfers(params);
      setTransfers(res.data || []);
    } catch (err) {
      const msg = getApiErrorMessage(err, 'Failed to load transfers.');
      setErrorTransfers(msg);
      showError('Could not load transfers', msg);
    } finally {
      setLoadingTransfers(false);
    }
  }, [selectedBranchId, showError]);

  /* ------------------------------------------------------------
   * Effects
   * ---------------------------------------------------------- */

  useEffect(() => {
    void fetchBranches();
  }, [fetchBranches]);

  useEffect(() => {
    void fetchDrawers();
  }, [fetchDrawers]);

  useEffect(() => {
    if (activeTab === 'dashboard') {
      void fetchDashboard();
    }
  }, [activeTab, fetchDashboard]);

  useEffect(() => {
    if (activeTab === 'ledger') {
      void fetchTransactions();
    }
  }, [activeTab, fetchTransactions]);

  useEffect(() => {
    if (activeTab === 'transfers') {
      void fetchTransfers();
    }
  }, [activeTab, fetchTransfers]);

  useEffect(() => {
    if (activeTab !== 'transfers') {
      void fetchTransfers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId]);

  /* ------------------------------------------------------------
   * Actions
   * ---------------------------------------------------------- */

  const loadAllData = useCallback(async () => {
    await Promise.all([fetchDrawers(), fetchDashboard(), fetchTransactions(), fetchTransfers()]);
  }, [fetchDrawers, fetchDashboard, fetchTransactions, fetchTransfers]);

  const handleManualRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadAllData();
      showInfo('Refreshed', 'Cash drawer data updated.');
    } catch {
      showError('Refresh failed', 'Could not reload data. Please try again.');
    } finally {
      setRefreshing(false);
    }
  }, [loadAllData, showInfo, showError]);

  /* Keyboard shortcuts */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key.toLowerCase() === 'r') {
        e.preventDefault();
        if (!refreshing) void handleManualRefresh();
      } else if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setIsCreateDrawerOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleManualRefresh, refreshing]);

  /* ---- Modal handlers ---- */
  const handleOpenDrawerAction = useCallback((drawer: CashDrawer) => {
    setOpenModalDrawer(drawer);
  }, []);

  const handleCloseDrawerAction = useCallback(
    async (drawer: CashDrawer) => {
      setCloseDrawerLoading(true);
      try {
        const res = await cashDrawerService.getActiveSession(drawer.id);
        const session = (res as any)?.data as CashDrawerSession | null;
        if (!session) {
          showError(
            'No active session',
            `“${drawer.name ?? 'Drawer'}” is not currently open. Open it first, then close.`
          );
          return;
        }
        setCloseModalDrawer(drawer);
        setCloseModalSession(session);
      } catch (err) {
        showError('Could not load session', getApiErrorMessage(err));
      } finally {
        setCloseDrawerLoading(false);
      }
    },
    [showError]
  );

  const handleCashInAction = useCallback((drawer: CashDrawer) => {
    setCashInDrawer(drawer);
  }, []);

  const handleCashOutAction = useCallback((drawer: CashDrawer) => {
    setCashOutDrawer(drawer);
  }, []);

  const handleInitiateTransferAction = useCallback((drawer?: CashDrawer) => {
    setTransferDefaultSource(drawer || null);
    setIsTransferModalOpen(true);
  }, []);

  const handleViewTransactions = useCallback((drawer: CashDrawer) => {
    setSelectedDrawerId(drawer.id);
    setActiveTab('ledger');
  }, []);

  const handlePresetChange = useCallback((preset: DatePresetKey) => {
    setDatePreset(preset);
    if (preset !== 'custom') {
      const { from, to } = presetToRange(preset);
      setDateFrom(from);
      setDateTo(to);
    }
  }, []);

  const handleModalSuccess = useCallback(async () => {
    showSuccess('Saved', 'Cash drawer updated.');
    await loadAllData();
  }, [loadAllData, showSuccess]);

  /* ---- Derived stats ---- */
  const inTransitCount = useMemo(
    () => transfers.filter((t) => ['initiated', 'in_transit'].includes(t.status)).length,
    [transfers]
  );
  const anyLoading =
    loadingDrawers || loadingDashboard || loadingTransactions || loadingTransfers;

  const tabs: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = useMemo(
    () => [
      { key: 'dashboard', label: 'Dashboard & KPIs', icon: <FiActivity size={16} /> },
      { key: 'drawers', label: `Cash Drawers (${drawers.length})`, icon: <FiBox size={16} /> },
      { key: 'ledger', label: 'Cash Ledger', icon: <FiLayers size={16} /> },
      {
        key: 'transfers',
        label: `Transfers${inTransitCount ? ` (${inTransitCount} in transit)` : ''}`,
        icon: <FiRepeat size={16} />,
      },
      { key: 'reports', label: 'Reconciliation', icon: <FiFileText size={16} /> },
      { key: 'audit', label: 'Audit Trail', icon: <FiShield size={16} /> },
    ],
    [drawers.length, inTransitCount]
  );

  /* ------------------------------------------------------------
   * Render
   * ---------------------------------------------------------- */

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100/60 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="mx-auto w-full max-w-[1900px] space-y-5 p-3 sm:p-4 lg:space-y-6 lg:p-6">

        {/* ── Executive Gradient Header ── */}
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-5 py-6 shadow-[0_20px_40px_-20px_rgba(15,23,42,0.45)] sm:px-7">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />

          <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
                <FiDollarSign className="h-3 w-3" />
                Finance · Cash Drawer Management
              </div>
              <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                <FiDollarSign className="h-7 w-7 text-cyan-300" />
                Cash Drawer Workspace
              </h1>
              <p className="mt-1.5 max-w-2xl text-sm text-slate-300">
                Track physical tills, opening/closing shifts, cash-in receipts, cash-out expenses, inter-drawer transit, and discrepancy reconciliation.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleManualRefresh}
                disabled={refreshing || anyLoading}
                className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl border border-white/10 bg-white/5 text-white text-xs font-semibold hover:bg-white/10 disabled:opacity-50 transition-colors shadow-none"
                title="Refresh data (Ctrl+R)"
              >
                <FiRefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                <span>{refreshing ? 'Refreshing…' : 'Refresh'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleInitiateTransferAction()}
                className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl border border-white/10 bg-white/5 text-white text-xs font-semibold hover:bg-white/10 transition-colors shadow-none"
                title="Initiate Inter-Drawer or Vault Transfer"
              >
                <FiRepeat size={14} />
                <span>Transfer Cash</span>
              </button>

              <button
                type="button"
                onClick={() => setIsCreateDrawerOpen(true)}
                className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-cyan-400 font-semibold text-slate-950 hover:bg-cyan-300 text-xs shadow-sm transition-colors"
                title="Create New Cash Drawer (Ctrl+N)"
              >
                <FiPlus size={16} />
                <span>New Drawer</span>
              </button>
            </div>
          </div>

          {/* Quick Summary Pill Strip */}
          <div className="relative mt-5 grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Total Cash on Hand</p>
              <p className="mt-1 text-sm font-bold text-emerald-300">
                ₹{(dashboardData?.total_current_cash ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Open Registers</p>
              <p className="mt-1 text-sm font-bold text-cyan-300">
                {dashboardData?.open_drawers ?? 0} of {drawers.length} active
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">In-Transit Transfers</p>
              <p className={`mt-1 text-sm font-bold ${inTransitCount > 0 ? 'text-amber-300' : 'text-slate-300'}`}>
                {inTransitCount} transfers pending receipt
              </p>
            </div>
          </div>
        </section>

        {/* ── Filter Bar ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-xs text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <FiCalendar className="text-slate-400" size={14} />
            <span className="text-slate-500 font-medium">Date Range:</span>
            <select
              value={datePreset}
              onChange={(e) => handlePresetChange(e.target.value as DatePresetKey)}
              className="h-8 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              aria-label="Date range preset"
            >
              {DATE_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>

            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDatePreset('custom');
                setDateFrom(e.target.value);
              }}
              className="h-8 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              aria-label="From date"
            />
            <span className="text-slate-400">→</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDatePreset('custom');
                setDateTo(e.target.value);
              }}
              min={dateFrom || undefined}
              className="h-8 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              aria-label="To date"
            />
          </div>

          <div className="flex items-center gap-2">
            {branches.length > 1 && (
              <select
                value={selectedBranchId}
                onChange={(e) =>
                  setSelectedBranchId(e.target.value === 'all' ? 'all' : Number(e.target.value))
                }
                disabled={loadingBranches || refreshing}
                className="h-8 pl-3 pr-8 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-xs"
                aria-label="Filter by branch"
              >
                <option value="all">All branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            )}

            {selectedDrawerId !== 'all' && (
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                Drawer: {drawers.find((d) => d.id === selectedDrawerId)?.name ?? `#${selectedDrawerId}`}
                <button
                  type="button"
                  onClick={() => setSelectedDrawerId('all')}
                  className="text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-200 font-bold"
                  aria-label="Clear drawer filter"
                >
                  ×
                </button>
              </span>
            )}
          </div>
        </div>

        {/* ── Navigation Tabs ── */}
        <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 overflow-x-auto text-xs sm:text-sm font-semibold">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                aria-current={isActive ? 'page' : undefined}
                className={`py-3 px-4 border-b-2 flex items-center gap-2 transition-all whitespace-nowrap ${
                  isActive
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── Tab Panels wrapped in error boundaries ── */}
        <TabErrorBoundary key={activeTab}>
          {activeTab === 'dashboard' && (
            <CashDrawerDashboardTab
              data={dashboardData}
              loading={loadingDashboard}
              onOpenDrawer={handleOpenDrawerAction}
              onCloseDrawer={handleCloseDrawerAction}
              onCashIn={handleCashInAction}
              onCashOut={handleCashOutAction}
            />
          )}

          {activeTab === 'drawers' && (
            <CashDrawerListTab
              drawers={drawers}
              loading={loadingDrawers}
              onOpenDrawer={handleOpenDrawerAction}
              onCloseDrawer={(drawer) => { void handleCloseDrawerAction(drawer); }}
              onCashIn={handleCashInAction}
              onCashOut={handleCashOutAction}
              onInitiateTransfer={handleInitiateTransferAction}
              onCreateDrawer={() => setIsCreateDrawerOpen(true)}
              onViewTransactions={handleViewTransactions}
            />
          )}

          {activeTab === 'ledger' && (
            <CashDrawerLedgerTab
              transactions={transactions}
              loading={loadingTransactions}
              error={errorTransactions ?? undefined}
              onRetry={fetchTransactions}
              drawers={drawers}
              selectedDrawerId={selectedDrawerId}
              onDrawerChange={setSelectedDrawerId}
              dateFrom={dateFrom}
              dateTo={dateTo}
              onDateFromChange={(v) => { setDatePreset('custom'); setDateFrom(v); }}
              onDateToChange={(v) => { setDatePreset('custom'); setDateTo(v); }}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              typeFilter={typeFilter}
              onTypeFilterChange={setTypeFilter}
              categoryFilter={categoryFilter}
              onCategoryFilterChange={setCategoryFilter}
            />
          )}

          {activeTab === 'transfers' && (
            <CashTransfersTab
              transfers={transfers}
              loading={loadingTransfers}
              error={errorTransfers ?? undefined}
              onRetry={fetchTransfers}
              onInitiateTransfer={() => handleInitiateTransferAction()}
              onRefresh={loadAllData}
            />
          )}

          {activeTab === 'reports' && (
            <CashDrawerReportsTab
              drawers={drawers}
              onRefresh={loadAllData}
            />
          )}

          {activeTab === 'audit' && (
            <CashDrawerAuditTab
              drawerId={selectedDrawerId !== 'all' ? selectedDrawerId : undefined}
            />
          )}
        </TabErrorBoundary>

        {/* Close-session loading veil */}
        {closeDrawerLoading && (
          <div className="fixed inset-0 z-[60] bg-slate-900/20 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
            <div className="rounded-2xl bg-white dark:bg-slate-900 shadow-2xl px-5 py-3.5 flex items-center gap-2.5 pointer-events-auto border border-slate-200 dark:border-slate-800">
              <FiLoader className="animate-spin text-indigo-600" size={16} />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Loading active session…</span>
            </div>
          </div>
        )}

        {/* ── Modals: Conditionally mounted, never showing simultaneously ── */}
        {openModalDrawer && (
          <OpenDrawerModal
            isOpen={Boolean(openModalDrawer)}
            drawer={openModalDrawer}
            onClose={() => setOpenModalDrawer(null)}
            onSuccess={handleModalSuccess}
          />
        )}

        {closeModalDrawer && closeModalSession && (
          <CloseDrawerModal
            isOpen={Boolean(closeModalDrawer && closeModalSession)}
            drawer={closeModalDrawer}
            session={closeModalSession}
            onClose={() => {
              setCloseModalDrawer(null);
              setCloseModalSession(null);
            }}
            onSuccess={handleModalSuccess}
          />
        )}

        {cashInDrawer && (
          <CashInModal
            isOpen={Boolean(cashInDrawer)}
            drawer={cashInDrawer}
            onClose={() => setCashInDrawer(null)}
            onSuccess={handleModalSuccess}
          />
        )}

        {cashOutDrawer && (
          <CashOutModal
            isOpen={Boolean(cashOutDrawer)}
            drawer={cashOutDrawer}
            onClose={() => setCashOutDrawer(null)}
            onSuccess={handleModalSuccess}
          />
        )}

        {isTransferModalOpen && (
          <InitiateTransferModal
            isOpen={isTransferModalOpen}
            drawers={drawers}
            defaultSourceDrawer={transferDefaultSource}
            onClose={() => {
              setIsTransferModalOpen(false);
              setTransferDefaultSource(null);
            }}
            onSuccess={handleModalSuccess}
          />
        )}

        {isCreateDrawerOpen && (
          <CashDrawerCreateModal
            isOpen={isCreateDrawerOpen}
            branches={branches}
            onClose={() => setIsCreateDrawerOpen(false)}
            onSuccess={handleModalSuccess}
          />
        )}
      </div>
    </div>
  );
};

export default CashDrawerPage;
