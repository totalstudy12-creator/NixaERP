// src/pages/Delivery/VehicleManagementPage.tsx
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
  FiTruck,
  FiPlus,
  FiEdit2,
  FiCheckCircle,
  FiAlertTriangle,
  FiAlertCircle,
  FiClock,
  FiTool,
  FiRefreshCw,
  FiUser,
  FiShield,
  FiLoader,
  FiX,
  FiUsers,
  FiSearch,
  FiFilter,
} from 'react-icons/fi';
import deliveryService, { DeliveryVehicle, DeliveryDriver } from '../../services/deliveryService';
import { useAuthStore } from '../../store/auth';
import { useNotification } from '../../components/NotificationContext';
import { usePermission } from '../../hooks/usePermission';

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

function useDebouncedValue<T>(value: T, delay: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return v;
}

type VehicleType = 'toto' | 'four_wheeler' | 'carrier' | 'other';
type VehicleStatus = 'available' | 'assigned' | 'on_trip' | 'under_maintenance' | 'inactive';

type VehicleStatusFilter = 'all' | VehicleStatus;

const STATUS_FILTER_OPTIONS: Array<{ value: VehicleStatusFilter; label: string }> = [
  { value: 'all', label: 'All status' },
  { value: 'available', label: 'Available' },
  { value: 'on_trip', label: 'On trip / Assigned' },
  { value: 'under_maintenance', label: 'Under maintenance' },
  { value: 'inactive', label: 'Inactive' },
];

const OWNERSHIP_FILTER_OPTIONS = [
  { value: 'all', label: 'All ownership' },
  { value: 'owned', label: 'Company owned' },
  { value: 'owner_driver', label: 'Owner-Driver (Operated)' },
  { value: 'leased', label: 'Leased' },
  { value: 'rented', label: 'Rented' },
];
type OwnershipType = 'owned' | 'leased' | 'rented';
type MaintenanceStatus = 'good' | 'due' | 'under_service' | 'overdue';

interface FormState {
  vehicleCode: string;
  registrationNumber: string;
  name: string;
  type: VehicleType;
  category: string;
  maxCapacity: string;
  capacityUnit: string;
  defaultDriverId: number | '';
  isDriverOwner: boolean;
  ownershipType: OwnershipType;
  status: VehicleStatus;
  maintenanceStatus: MaintenanceStatus;
  notes: string;
}

const VEHICLE_TYPE_OPTIONS: Array<{ value: VehicleType; label: string }> = [
  { value: 'toto', label: 'Electric TOTO carrier' },
  { value: 'four_wheeler', label: '4-wheeler pickup truck' },
  { value: 'carrier', label: 'Heavy cargo carrier' },
  { value: 'other', label: 'Other fleet' },
];

const CAPACITY_UNIT_OPTIONS = [
  { value: 'pieces', label: 'Pieces / units' },
  { value: 'kg', label: 'Kilograms (kg)' },
  { value: 'cubic_feet', label: 'Cubic feet (cft)' },
  { value: 'cubic_meters', label: 'Cubic meters (m³)' },
];

const VEHICLE_STATUS_OPTIONS: Array<{ value: VehicleStatus; label: string }> = [
  { value: 'available', label: 'Available (ready)' },
  { value: 'assigned', label: 'Assigned to trip' },
  { value: 'on_trip', label: 'On trip (in transit)' },
  { value: 'under_maintenance', label: 'Under maintenance' },
  { value: 'inactive', label: 'Inactive' },
];

const MAINTENANCE_OPTIONS: Array<{ value: MaintenanceStatus; label: string }> = [
  { value: 'good', label: 'Good — running fine' },
  { value: 'due', label: 'Service due soon' },
  { value: 'under_service', label: 'Currently under service' },
  { value: 'overdue', label: 'Overdue service' },
];

const OWNERSHIP_OPTIONS: Array<{ value: OwnershipType; label: string }> = [
  { value: 'owned', label: 'Company owned' },
  { value: 'leased', label: 'Leased' },
  { value: 'rented', label: 'Rented / hired' },
];

const STATUS_CLASSES: Record<string, string> = {
  available: 'border-emerald-200/70 bg-emerald-50 text-emerald-700',
  assigned: 'border-indigo-200/70 bg-indigo-50 text-indigo-700',
  on_trip: 'border-blue-200/70 bg-blue-50 text-blue-700',
  under_maintenance: 'border-amber-200/70 bg-amber-50 text-amber-700',
  inactive: 'border-slate-200 bg-slate-50 text-slate-600',
};
const STATUS_DOT_CLASSES: Record<string, string> = {
  available: 'bg-emerald-500',
  assigned: 'bg-indigo-500',
  on_trip: 'bg-blue-500',
  under_maintenance: 'bg-amber-500',
  inactive: 'bg-slate-400',
};

const LIMITS = {
  codeMax: 40,
  regMax: 20,
  nameMax: 100,
  categoryMax: 50,
  capacityMin: 1,
  capacityMax: 1_000_000,
  notesMax: 500,
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
const clampNum = (v: number, min: number, max: number): number => {
  if (!Number.isFinite(v)) return min;
  return Math.min(Math.max(v, min), max);
};

const initials = (name?: string): string => {
  const s = safeStr(name).trim();
  if (!s) return 'VH';
  const parts = s.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'VH';
};

const statusLabel = (s?: string | null): string =>
  safeStr(s).replace(/_/g, ' ') || 'unknown';

/** Default registration prefix by state (sane defaults for Bihar operations). */
const defaultRegPrefix = (): string => 'BR-27-E-';

function getApiErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (error && typeof error === 'object') {
    const e = error as {
      message?: unknown;
      response?: { status?: number; data?: { message?: unknown; errors?: Record<string, unknown> } };
    };
    const status = e.response?.status;
    const msg =
      (typeof e.response?.data?.message === 'string' && e.response.data.message) ||
      (typeof e.message === 'string' && e.message) ||
      '';
    if (status === 401) return 'Session expired. Please sign in again.';
    if (status === 403) return 'You do not have permission for this action.';
    if (status === 404) return 'Vehicle not found.';
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
class VehicleBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { hasError: false };
  static getDerivedStateFromError(err: unknown): BoundaryState {
    return {
      hasError: true,
      message: err instanceof Error ? err.message : 'Unexpected error.',
    };
  }
  componentDidCatch(err: unknown) {
    // eslint-disable-next-line no-console
    console.error('[VehicleManagementPage]', err);
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
              {this.state.message || 'Unable to render vehicles.'}
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
 * Reusable UI
 * ════════════════════════════════════════════════════════ */

const StatusBadge = React.memo(({ status }: { status?: string | null }) => {
  const key = safeStr(status).toLowerCase();
  const cls = STATUS_CLASSES[key] ?? 'border-slate-200 bg-slate-50 text-slate-600';
  const dot = STATUS_DOT_CLASSES[key] ?? 'bg-slate-400';
  return (
    <Badge
      variant="outline"
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize ${cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {statusLabel(key)}
    </Badge>
  );
});
StatusBadge.displayName = 'StatusBadge';

const KpiCard = ({
  label,
  value,
  icon,
  bg,
  ring,
  valueClass = 'text-slate-900',
}: {
  label: string;
  value: number | string;
  icon: ReactNode;
  bg: string;
  ring: string;
  valueClass?: string;
}) => (
  <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300/80 hover:shadow-[0_8px_24px_-12px_rgba(15,23,42,0.15)] sm:p-4">
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:text-[11px]">
          {label}
        </p>
        <p className={`mt-1.5 text-lg font-bold tabular-nums sm:mt-2 sm:text-xl lg:text-2xl ${valueClass}`}>
          {value}
        </p>
      </div>
      <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl sm:h-10 sm:w-10 ${bg} ring-1 ${ring}`}>
        {icon}
      </div>
    </div>
  </div>
);

const EmptyState = ({ message }: { message: string }) => (
  <div className="py-14 text-center">
    <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-slate-200/70">
      <FiTruck className="h-6 w-6 text-slate-400" />
    </div>
    <p className="mt-4 text-sm font-semibold text-slate-800">No vehicles</p>
    <p className="mt-1 text-xs text-slate-500">{message}</p>
  </div>
);

/* ══════════════════════════════════════════════════════════
 * Main component
 * ════════════════════════════════════════════════════════ */

export const VehicleManagementPage: React.FC = () => {
  const { showError, showSuccess } = useNotification();
  const { can, isSuperAdmin } = usePermission();
  const loadingUser = useAuthStore((s) => s.loadingUser);
  const hasUser = useAuthStore((s) => Boolean(s.user));
  const companyId = useAuthStore(
    (s) => Number((s as any)?.user?.company_id ?? (s as any)?.activeCompany?.id ?? 0)
  );

  /* ── Permissions ── */
  const canView = isSuperAdmin || can('view deliveries') || can('view vehicles');
  const canCreate = isSuperAdmin || can('create deliveries') || can('create vehicles');
  const canEdit = isSuperAdmin || can('edit deliveries') || can('edit vehicles');

  /* ── Data ── */
  const [vehicles, setVehicles] = useState<DeliveryVehicle[]>([]);
  const [drivers, setDrivers] = useState<DeliveryDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ── Filters ── */
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebouncedValue(searchTerm, 250);
  const [statusFilter, setStatusFilter] = useState<VehicleStatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [ownershipFilter, setOwnershipFilter] = useState<string>('all');

  const filteredVehicles = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    return vehicles.filter((v) => {
      if (term) {
        const haystack = [
          v.name,
          v.registration_number,
          v.vehicle_code,
          (v as any).category,
          v.notes,
          v.default_driver?.name,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (statusFilter !== 'all') {
        if (statusFilter === 'on_trip') {
          if (!['on_trip', 'assigned'].includes(v.status)) return false;
        } else if (v.status !== statusFilter) {
          return false;
        }
      }
      if (typeFilter !== 'all' && v.type !== typeFilter) return false;
      if (ownershipFilter !== 'all') {
        if (ownershipFilter === 'owner_driver') {
          const isOwner = Boolean((v as any).is_driver_owner) || /owner[- ]?driver/i.test(v.notes || '');
          if (!isOwner) return false;
        } else if (v.ownership_type !== ownershipFilter) {
          return false;
        }
      }
      return true;
    });
  }, [vehicles, debouncedSearch, statusFilter, typeFilter, ownershipFilter]);

  const hasActiveFilters = Boolean(
    searchTerm.trim() || statusFilter !== 'all' || typeFilter !== 'all' || ownershipFilter !== 'all'
  );

  const resetFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setTypeFilter('all');
    setOwnershipFilter('all');
  };

  /* ── Modal ── */
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<DeliveryVehicle | null>(null);
  const [form, setForm] = useState<FormState>({
    vehicleCode: '',
    registrationNumber: '',
    name: '',
    type: 'toto',
    category: 'Electric Carrier',
    maxCapacity: '500',
    capacityUnit: 'pieces',
    defaultDriverId: '',
    isDriverOwner: false,
    ownershipType: 'owned',
    status: 'available',
    maintenanceStatus: 'good',
    notes: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  const fetchVehiclesAndDrivers = useCallback(async () => {
    if (!canView) return;
    fetchAbortRef.current?.abort();
    const ctrl = new AbortController();
    fetchAbortRef.current = ctrl;

    setLoading(true);
    setError(null);
    try {
      const [vRes, dRes] = await Promise.all([
        deliveryService.getVehicles(),
        deliveryService.getDrivers(),
      ]);
      if (ctrl.signal.aborted || !mountedRef.current) return;
      setVehicles(Array.isArray((vRes as any)?.data) ? (vRes as any).data : []);
      setDrivers(Array.isArray((dRes as any)?.data) ? (dRes as any).data : []);
    } catch (err) {
      if (ctrl.signal.aborted) return;
      const msg = getApiErrorMessage(err, 'Could not load vehicles / drivers.');
      setError(msg);
      setVehicles([]);
      setDrivers([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    void fetchVehiclesAndDrivers();
  }, [fetchVehiclesAndDrivers]);

  /* ══════════════════════════════════════════════════════
   * Modal keyboard + scroll lock
   * ══════════════════════════════════════════════════════ */

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) setModalOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [modalOpen, saving]);

  /* ── Shortcuts ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const key = e.key.toLowerCase();
      if (key === 'r') {
        e.preventDefault();
        void fetchVehiclesAndDrivers();
      } else if (key === 'n') {
        e.preventDefault();
        if (canCreate) openCreateModal();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchVehiclesAndDrivers, canCreate]);

  /* ══════════════════════════════════════════════════════
   * Form
   * ══════════════════════════════════════════════════════ */

  const clearFieldError = useCallback((field: string) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      if (Object.keys(next).length === 0) setFormError(null);
      return next;
    });
  }, []);

  const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    clearFieldError(String(key));
  }, [clearFieldError]);

  const openCreateModal = useCallback(() => {
    if (!canCreate) {
      showError('Permission denied', 'You do not have permission to add vehicles.');
      return;
    }
    setEditingVehicle(null);
    setForm({
      vehicleCode: `VEH-${Date.now().toString().slice(-4)}`,
      registrationNumber: defaultRegPrefix(),
      name: 'Carrier TOTO',
      type: 'toto',
      category: 'Electric Carrier',
      maxCapacity: '500',
      capacityUnit: 'pieces',
      defaultDriverId: '',
      isDriverOwner: false,
      ownershipType: 'owned',
      status: 'available',
      maintenanceStatus: 'good',
      notes: '',
    });
    setFieldErrors({});
    setFormError(null);
    setModalOpen(true);
  }, [canCreate, showError]);

  const openEditModal = useCallback((veh: DeliveryVehicle) => {
    if (!canEdit) {
      showError('Permission denied', 'You do not have permission to edit vehicles.');
      return;
    }
    setEditingVehicle(veh);
    const ownerFlag =
      safeStr((veh as any).is_driver_owner) === 'true' ||
      Boolean((veh as any).is_driver_owner) ||
      /owner[- ]?driver/i.test(safeStr(veh.notes));
    setForm({
      vehicleCode: safeStr(veh.vehicle_code),
      registrationNumber: safeStr(veh.registration_number),
      name: safeStr(veh.name),
      type: (safeStr(veh.type) as VehicleType) || 'toto',
      category: safeStr((veh as any).category),
      maxCapacity: String(safeNum(veh.max_capacity)),
      capacityUnit: safeStr(veh.capacity_unit) || 'pieces',
      defaultDriverId: veh.default_driver_id ?? '',
      isDriverOwner: ownerFlag,
      ownershipType: (safeStr(veh.ownership_type) as OwnershipType) || 'owned',
      status: (safeStr(veh.status) as VehicleStatus) || 'available',
      maintenanceStatus:
        (safeStr(veh.maintenance_status) as MaintenanceStatus) || 'good',
      notes: safeStr(veh.notes),
    });
    setFieldErrors({});
    setFormError(null);
    setModalOpen(true);
  }, [canEdit, showError]);

  /* ── Validate ── */
  const validate = useCallback((): boolean => {
    const errs: Record<string, string[]> = {};

    const code = form.vehicleCode.trim();
    if (!code) errs.vehicle_code = ['Vehicle code is required.'];
    else if (code.length > LIMITS.codeMax) errs.vehicle_code = [`Max ${LIMITS.codeMax} characters.`];

    const reg = form.registrationNumber.trim();
    if (!reg) errs.registration_number = ['Registration number is required.'];
    else if (reg.length > LIMITS.regMax) errs.registration_number = [`Max ${LIMITS.regMax} characters.`];

    const name = form.name.trim();
    if (!name) errs.name = ['Vehicle name is required.'];
    else if (name.length > LIMITS.nameMax) errs.name = [`Max ${LIMITS.nameMax} characters.`];

    const cap = Number(form.maxCapacity);
    if (!Number.isFinite(cap)) errs.max_capacity = ['Capacity must be a number.'];
    else if (cap < LIMITS.capacityMin) errs.max_capacity = [`Minimum ${LIMITS.capacityMin}.`];
    else if (cap > LIMITS.capacityMax) errs.max_capacity = [`Maximum ${LIMITS.capacityMax.toLocaleString()}.`];

    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      setFormError(Object.values(errs)[0]?.[0] ?? 'Please fix highlighted fields.');
      return false;
    }
    setFormError(null);
    return true;
  }, [form]);

  /* ── Save ── */
  const handleSave = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        company_id: companyId || 1,
        vehicle_code: form.vehicleCode.trim(),
        registration_number: form.registrationNumber.trim(),
        name: form.name.trim(),
        type: form.type,
        category: form.category.trim() || undefined,
        max_capacity: Number(form.maxCapacity),
        capacity_unit: form.capacityUnit,
        default_driver_id: form.defaultDriverId ? Number(form.defaultDriverId) : null,
        is_driver_owner: form.isDriverOwner,
        ownership_type: form.isDriverOwner ? 'owned' : form.ownershipType,
        status: form.status,
        maintenance_status: form.maintenanceStatus,
        notes: form.notes.trim() || undefined,
      };

      if (editingVehicle) {
        await deliveryService.updateVehicle(editingVehicle.id, payload);
        showSuccess('Vehicle updated', `"${form.name}" saved.`);
      } else {
        await deliveryService.createVehicle(payload);
        showSuccess('Vehicle registered', `"${form.name}" added to fleet.`);
      }
      setModalOpen(false);
      void fetchVehiclesAndDrivers();
    } catch (err) {
      const responseData = (err as any)?.response?.data;
      const validationErrors = responseData?.errors as Record<string, string[]> | undefined;
      if (validationErrors && typeof validationErrors === 'object' && Object.keys(validationErrors).length > 0) {
        setFieldErrors(validationErrors);
        setFormError(
          Object.values(validationErrors).flat()[0] ??
            responseData?.message ??
            'Please fix the highlighted fields.'
        );
      } else {
        setFormError(getApiErrorMessage(err, 'Could not save vehicle.'));
      }
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }, [validate, companyId, form, editingVehicle, fetchVehiclesAndDrivers, showSuccess]);

  /* ══════════════════════════════════════════════════════
   * Derived
   * ══════════════════════════════════════════════════════ */

  const kpi = useMemo(() => {
    const total = vehicles.length;
    const available = vehicles.filter((v) => v.status === 'available').length;
    const onTrip = vehicles.filter((v) => ['on_trip', 'assigned'].includes(v.status)).length;
    const underService = vehicles.filter(
      (v) =>
        v.status === 'under_maintenance' ||
        safeStr(v.maintenance_status) === 'under_service' ||
        safeStr(v.maintenance_status) === 'overdue'
    ).length;
    return { total, available, onTrip, underService };
  }, [vehicles]);

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
            You don't have permission to view vehicles.
          </p>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════
   * Render
   * ══════════════════════════════════════════════════════ */

  const fieldClass = (field: string) =>
    `h-10 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm outline-none transition ${
      fieldErrors[field]
        ? 'border-rose-300 ring-2 ring-rose-200'
        : 'border-slate-200 text-slate-700 hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10'
    }`;

  return (
    <VehicleBoundary>
      <div className="min-h-full bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100/60">
        <div className="mx-auto w-full max-w-[1500px] space-y-4 p-3 sm:space-y-5 sm:p-4 lg:p-5 xl:p-6">

          {/* ════════ Hero ════════ */}
          <section className="relative overflow-hidden rounded-2xl border border-slate-800/10 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-4 py-5 shadow-[0_20px_40px_-20px_rgba(15,23,42,0.45)] sm:px-6 sm:py-6 lg:px-7">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />
            <div className="relative flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200 backdrop-blur">
                  <FiTruck size={12} /> Logistics · Fleet
                </div>
                <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl xl:text-[30px]">
                  Carrier Fleet Management
                </h1>
                <p className="mt-1.5 max-w-2xl text-xs text-slate-300 sm:text-sm">
                  Manage TOTO carriers, 4-wheelers, capacity limits, driver ownership, and maintenance.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void fetchVehiclesAndDrivers()}
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
                {canCreate && (
                  <button
                    type="button"
                    onClick={openCreateModal}
                    title="Add vehicle (Ctrl+N)"
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-b from-cyan-300 to-cyan-400 px-4 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:from-cyan-200 hover:to-cyan-300"
                  >
                    <FiPlus size={14} /> Register vehicle
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* ════════ KPIs ════════ */}
          <section className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4 md:gap-4">
            <KpiCard
              label="Total fleet"
              value={kpi.total}
              icon={<FiTruck size={16} className="text-indigo-600" />}
              bg="bg-indigo-50"
              ring="ring-indigo-500/10"
            />
            <KpiCard
              label="Available"
              value={kpi.available}
              icon={<FiCheckCircle size={16} className="text-emerald-600" />}
              bg="bg-emerald-50"
              ring="ring-emerald-500/10"
              valueClass="text-emerald-700"
            />
            <KpiCard
              label="On trip"
              value={kpi.onTrip}
              icon={<FiClock size={16} className="text-blue-600" />}
              bg="bg-blue-50"
              ring="ring-blue-500/10"
              valueClass="text-blue-700"
            />
            <KpiCard
              label="Under service"
              value={kpi.underService}
              icon={<FiTool size={16} className="text-amber-600" />}
              bg="bg-amber-50"
              ring="ring-amber-500/10"
              valueClass="text-amber-700"
            />
          </section>

          {/* ════════ Error ════════ */}
          {error && (
            <div role="alert" className="flex flex-col gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-rose-700 sm:flex-row sm:items-start sm:gap-3 sm:p-4">
              <div className="flex items-start gap-2 sm:flex-1">
                <FiAlertCircle className="mt-0.5 shrink-0" size={18} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Could not load fleet</p>
                  <p className="text-xs sm:text-sm">{error}</p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => void fetchVehiclesAndDrivers()}
                className="w-full shrink-0 rounded-xl border-rose-300 bg-white text-xs font-semibold text-rose-700 hover:bg-rose-50 sm:w-auto"
              >
                Retry
              </Button>
            </div>
          )}

          {/* ════════ Filters ════════ */}
          <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <CardContent className="p-3 sm:p-4">
              <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
                {/* Search */}
                <div className="relative flex-1">
                  <FiSearch
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    size={15}
                  />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(clampStr(e.target.value, LIMITS.nameMax))}
                    placeholder="Search vehicle name, registration number, code, driver…"
                    maxLength={LIMITS.nameMax}
                    autoComplete="off"
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-10 text-sm text-slate-800 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      aria-label="Clear search"
                      className="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    >
                      <FiX size={14} />
                    </button>
                  )}
                </div>

                {/* Dropdown Filters */}
                <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                  {/* Type Filter */}
                  <select
                    aria-label="Filter by vehicle type"
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 sm:text-sm"
                  >
                    <option value="all">All vehicle types</option>
                    {VEHICLE_TYPE_OPTIONS.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>

                  {/* Ownership Filter */}
                  <select
                    aria-label="Filter by ownership"
                    value={ownershipFilter}
                    onChange={(e) => setOwnershipFilter(e.target.value)}
                    className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 sm:text-sm"
                  >
                    {OWNERSHIP_FILTER_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>

                  {hasActiveFilters && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={resetFilters}
                      className="h-10 shrink-0 gap-1 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                    >
                      <FiX size={13} /> Reset
                    </Button>
                  )}
                </div>
              </div>

              {/* Status pills */}
              <div className="mt-3 flex gap-1 overflow-x-auto border-t border-slate-100 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {STATUS_FILTER_OPTIONS.map((opt) => {
                  const active = statusFilter === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setStatusFilter(opt.value)}
                      className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        active
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* ════════ Fleet Card ════════ */}
          <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-slate-100 bg-white px-3 py-3 sm:px-5 sm:py-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                  <FiTruck size={14} />
                </div>
                <div className="min-w-0">
                  <CardTitle className="truncate text-xs font-semibold text-slate-800 sm:text-sm">
                    Fleet vehicles
                  </CardTitle>
                  <CardDescription className="truncate text-[10px] text-slate-500 sm:text-[11px]">
                    {loading
                      ? 'Loading…'
                      : hasActiveFilters
                      ? `${filteredVehicles.length} of ${vehicles.length} vehicle${vehicles.length === 1 ? '' : 's'}`
                      : `${vehicles.length} vehicle${vehicles.length === 1 ? '' : 's'}`}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            {/* Table (lg+) */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50/70 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Vehicle / Reg</th>
                    <th className="px-5 py-3 font-semibold">Type</th>
                    <th className="px-5 py-3 font-semibold">Capacity</th>
                    <th className="px-5 py-3 font-semibold">Driver / Owner</th>
                    <th className="px-5 py-3 font-semibold">Ownership</th>
                    <th className="px-5 py-3 text-center font-semibold">Status</th>
                    <th className="px-5 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        {Array.from({ length: 7 }).map((__, c) => (
                          <td key={c} className="px-5 py-3.5">
                            <div className="h-4 animate-pulse rounded bg-slate-100" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : filteredVehicles.length === 0 ? (
                    <tr><td colSpan={7}><EmptyState message={hasActiveFilters ? "No vehicles match your active filters." : "Register a vehicle to get started."} /></td></tr>
                  ) : (
                    filteredVehicles.map((veh) => {
                      const ownerFlag =
                        Boolean((veh as any).is_driver_owner) ||
                        /owner[- ]?driver/i.test(safeStr(veh.notes));
                      return (
                        <tr key={veh.id} className="transition-colors hover:bg-slate-50/70">
                          <td className="px-5 py-3.5">
                            <p className="font-mono font-semibold text-slate-900">
                              {safeStr(veh.registration_number, '—')}
                            </p>
                            <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                              {safeStr(veh.vehicle_code, '—')}
                            </p>
                          </td>
                          <td className="px-5 py-3.5">
                            <p className="flex items-center gap-1.5 font-medium text-slate-900">
                              <FiTruck size={12} className="text-slate-400" />
                              {safeStr(veh.name, '—')}
                            </p>
                            <p className="mt-0.5 text-[11px] capitalize text-slate-500">
                              {statusLabel(veh.type)}
                              {(veh as any).category ? ` · ${safeStr((veh as any).category)}` : ''}
                            </p>
                          </td>
                          <td className="px-5 py-3.5 font-semibold tabular-nums text-slate-900">
                            {safeNum(veh.max_capacity)}
                            <span className="ml-1 text-[11px] font-normal text-slate-500">
                              {safeStr(veh.capacity_unit, '')}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            {veh.default_driver ? (
                              <div>
                                <p className="flex items-center gap-1.5 font-medium text-slate-900">
                                  <FiUser size={11} className="text-indigo-500" />
                                  {safeStr(veh.default_driver.name, '—')}
                                  {ownerFlag && (
                                    <span className="inline-flex items-center gap-0.5 rounded bg-purple-100 px-1.5 py-0.2 text-[9px] font-bold uppercase text-purple-700">
                                      <FiShield size={9} /> Owner
                                    </span>
                                  )}
                                </p>
                                <p className="mt-0.5 text-[11px] text-slate-500">
                                  {safeStr(veh.default_driver.contact_number, '—')}
                                </p>
                              </div>
                            ) : (
                              <span className="text-[11px] italic text-slate-400">
                                No primary driver
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-[11px] capitalize text-slate-700">
                            {ownerFlag ? 'Owner-operated' : safeStr(veh.ownership_type, '—')}
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <StatusBadge status={veh.status} />
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            {canEdit && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => openEditModal(veh)}
                                aria-label="Edit vehicle"
                                className="h-8 rounded-lg"
                              >
                                <FiEdit2 size={13} />
                              </Button>
                            )}
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
              ) : filteredVehicles.length === 0 ? (
                <EmptyState message={hasActiveFilters ? "No vehicles match your active filters." : "Register a vehicle to get started."} />
              ) : (
                filteredVehicles.map((veh) => {
                  const ownerFlag =
                    Boolean((veh as any).is_driver_owner) ||
                    /owner[- ]?driver/i.test(safeStr(veh.notes));
                  return (
                    <div key={veh.id} className="p-3 sm:p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 flex-1 items-start gap-2">
                          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[11px] font-bold text-white">
                            {initials(veh.name)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="truncate font-mono text-sm font-semibold text-slate-900">
                                {safeStr(veh.registration_number, '—')}
                              </p>
                              <StatusBadge status={veh.status} />
                              {ownerFlag && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-purple-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-purple-700">
                                  <FiShield size={9} /> Owner
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 truncate text-xs text-slate-700">
                              {safeStr(veh.name, '—')}
                              {(veh as any).category ? ` · ${safeStr((veh as any).category)}` : ''}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] text-slate-500">
                              {safeNum(veh.max_capacity)} {safeStr(veh.capacity_unit, '')} ·{' '}
                              {veh.default_driver ? safeStr(veh.default_driver.name, '—') : 'No driver'}
                            </p>
                          </div>
                        </div>
                        {canEdit && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openEditModal(veh)}
                            className="h-8 shrink-0 rounded-lg"
                          >
                            <FiEdit2 size={13} />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* ════════ Modal ════════ */}
      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={(e) => { if (e.target === e.currentTarget && !saving) setModalOpen(false); }}
        >
          <div
            className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <FiTruck size={18} />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-bold text-slate-900 sm:text-base">
                    {editingVehicle ? 'Edit carrier vehicle' : 'Register carrier vehicle'}
                  </h3>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    Registration, capacity, driver, ownership.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !saving && setModalOpen(false)}
                disabled={saving}
                aria-label="Close modal"
                className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
              >
                <FiX size={16} />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col">
              <div className="space-y-3 overflow-y-auto px-4 py-4 sm:px-6">
                {formError && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                    <div className="flex items-start gap-2">
                      <FiAlertCircle className="mt-0.5 shrink-0" size={15} />
                      <span className="break-words font-medium">{formError}</span>
                    </div>
                    {Object.keys(fieldErrors).length > 0 && (
                      <ul className="mt-2 list-inside list-disc space-y-0.5 pl-1 text-xs text-rose-700">
                        {Object.entries(fieldErrors).slice(0, 4).map(([k, msgs]) => (
                          <li key={k}>
                            <span className="font-semibold capitalize">{k.replace(/_/g, ' ')}:</span>{' '}
                            {msgs[0]}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Vehicle code <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.vehicleCode}
                      onChange={(e) => updateField('vehicleCode', clampStr(e.target.value, LIMITS.codeMax))}
                      maxLength={LIMITS.codeMax}
                      className={`${fieldClass('vehicle_code')} font-mono`}
                    />
                    {fieldErrors.vehicle_code && (
                      <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-rose-600">
                        <FiAlertCircle size={10} /> {fieldErrors.vehicle_code[0]}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Registration <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.registrationNumber}
                      onChange={(e) =>
                        updateField(
                          'registrationNumber',
                          clampStr(e.target.value.toUpperCase(), LIMITS.regMax)
                        )
                      }
                      maxLength={LIMITS.regMax}
                      placeholder="BR-27-E-1234"
                      spellCheck={false}
                      className={`${fieldClass('registration_number')} font-mono`}
                    />
                    {fieldErrors.registration_number && (
                      <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-rose-600">
                        <FiAlertCircle size={10} /> {fieldErrors.registration_number[0]}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Vehicle name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => updateField('name', clampStr(e.target.value, LIMITS.nameMax))}
                      maxLength={LIMITS.nameMax}
                      placeholder="Carrier TOTO 01"
                      className={fieldClass('name')}
                    />
                    {fieldErrors.name && (
                      <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-rose-600">
                        <FiAlertCircle size={10} /> {fieldErrors.name[0]}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Carrier type <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={form.type}
                      onChange={(e) => updateField('type', e.target.value as VehicleType)}
                      className={fieldClass('type')}
                    >
                      {VEHICLE_TYPE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Max capacity <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={LIMITS.capacityMin}
                      max={LIMITS.capacityMax}
                      step="1"
                      value={form.maxCapacity}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        updateField(
                          'maxCapacity',
                          String(clampNum(n, LIMITS.capacityMin, LIMITS.capacityMax))
                        );
                      }}
                      className={fieldClass('max_capacity')}
                    />
                    {fieldErrors.max_capacity && (
                      <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-rose-600">
                        <FiAlertCircle size={10} /> {fieldErrors.max_capacity[0]}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Capacity unit <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={form.capacityUnit}
                      onChange={(e) => updateField('capacityUnit', e.target.value)}
                      className={fieldClass('capacity_unit')}
                    >
                      {CAPACITY_UNIT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Driver + owner block */}
                <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3">
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-indigo-900">
                    <FiUser size={13} /> Driver &amp; ownership
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Assigned primary driver
                    </label>
                    <select
                      value={String(form.defaultDriverId)}
                      onChange={(e) =>
                        updateField(
                          'defaultDriverId',
                          e.target.value ? Number(e.target.value) : ''
                        )
                      }
                      className={fieldClass('default_driver_id')}
                    >
                      <option value="">— No default driver —</option>
                      {drivers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {safeStr(d.name)} ({safeStr(d.contact_number)}) [{statusLabel(d.status)}]
                        </option>
                      ))}
                    </select>
                  </div>
                  {form.defaultDriverId !== '' && (
                    <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-lg border border-indigo-200 bg-white p-2">
                      <input
                        type="checkbox"
                        checked={form.isDriverOwner}
                        onChange={(e) => updateField('isDriverOwner', e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-xs text-slate-700">
                        <span className="block font-semibold text-indigo-900">
                          Driver owns this vehicle (owner-operator)
                        </span>
                        <span className="mt-0.5 block text-[10px] text-slate-500">
                          Enables "same driver as owner" — the driver operates the fleet vehicle under contract.
                        </span>
                      </span>
                    </label>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Ownership
                    </label>
                    <select
                      disabled={form.isDriverOwner}
                      value={form.isDriverOwner ? 'owned' : form.ownershipType}
                      onChange={(e) => updateField('ownershipType', e.target.value as OwnershipType)}
                      className={`${fieldClass('ownership_type')} disabled:bg-slate-50 disabled:text-slate-500`}
                    >
                      {OWNERSHIP_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {form.isDriverOwner && o.value === 'owned' ? 'Owner-operated (driver)' : o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Dispatch status
                    </label>
                    <select
                      value={form.status}
                      onChange={(e) => updateField('status', e.target.value as VehicleStatus)}
                      className={fieldClass('status')}
                    >
                      {VEHICLE_STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Maintenance status
                  </label>
                  <select
                    value={form.maintenanceStatus}
                    onChange={(e) => updateField('maintenanceStatus', e.target.value as MaintenanceStatus)}
                    className={fieldClass('maintenance_status')}
                  >
                    {MAINTENANCE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Operational notes
                  </label>
                  <textarea
                    rows={2}
                    value={form.notes}
                    onChange={(e) => updateField('notes', clampStr(e.target.value, LIMITS.notesMax))}
                    maxLength={LIMITS.notesMax}
                    placeholder="e.g. Equipped for heavy tent pipe loading, Warisaliganj deliveries"
                    className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                  />
                  <p className="mt-1 text-right text-[10px] text-slate-400">
                    {form.notes.length}/{LIMITS.notesMax}
                  </p>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3 sm:flex-row sm:justify-end sm:px-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                  className="rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-indigo-600 font-semibold hover:bg-indigo-700"
                >
                  {saving && <FiLoader className="mr-1.5 animate-spin" size={13} />}
                  {saving ? 'Saving…' : editingVehicle ? 'Update vehicle' : 'Save vehicle'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </VehicleBoundary>
  );
};

export default VehicleManagementPage;