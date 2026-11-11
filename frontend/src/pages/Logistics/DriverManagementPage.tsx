// src/pages/Delivery/DriverManagementPage.tsx
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
  FiUserCheck,
  FiPlus,
  FiEdit2,
  FiCheckCircle,
  FiAlertTriangle,
  FiAlertCircle,
  FiClock,
  FiPhone,
  FiFileText,
  FiRefreshCw,
  FiSearch,
  FiTruck,
  FiShield,
  FiLoader,
  FiX,
  FiUsers,
} from 'react-icons/fi';
import deliveryService, { DeliveryDriver, DeliveryVehicle } from '../../services/deliveryService';
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

type DriverStatus = 'available' | 'assigned' | 'on_trip' | 'on_leave' | 'inactive';
type StatusFilter = 'all' | DriverStatus | 'owner_drivers';

interface FormState {
  name: string;
  contactNumber: string;
  alternateContact: string;
  licenseNumber: string;
  licenseValidity: string;
  address: string;
  status: DriverStatus;
  notes: string;
  isActive: boolean;
  assignedVehicleId: number | '';
  isVehicleOwner: boolean;
}

const DRIVER_STATUS_OPTIONS: Array<{ value: DriverStatus; label: string }> = [
  { value: 'available', label: 'Available (ready)' },
  { value: 'assigned', label: 'Assigned to trip' },
  { value: 'on_trip', label: 'On trip (in transit)' },
  { value: 'on_leave', label: 'On leave' },
  { value: 'inactive', label: 'Inactive' },
];

const STATUS_FILTER_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'available', label: 'Available' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'on_trip', label: 'On trip' },
  { value: 'on_leave', label: 'On leave' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'owner_drivers', label: 'Owner-drivers' },
];

const STATUS_CLASSES: Record<string, string> = {
  available: 'border-emerald-200/70 bg-emerald-50 text-emerald-700',
  assigned: 'border-purple-200/70 bg-purple-50 text-purple-700',
  on_trip: 'border-blue-200/70 bg-blue-50 text-blue-700',
  on_leave: 'border-amber-200/70 bg-amber-50 text-amber-700',
  inactive: 'border-slate-200 bg-slate-50 text-slate-600',
};

const STATUS_DOT_CLASSES: Record<string, string> = {
  available: 'bg-emerald-500',
  assigned: 'bg-purple-500',
  on_trip: 'bg-blue-500',
  on_leave: 'bg-amber-500',
  inactive: 'bg-slate-400',
};

const LIMITS = {
  nameMax: 100,
  phoneMax: 20,
  licenseMax: 40,
  addressMax: 300,
  notesMax: 500,
} as const;

const LICENSE_EXPIRY_WARN_DAYS = 30;

/* ══════════════════════════════════════════════════════════
 * Helpers
 * ════════════════════════════════════════════════════════ */

const clampStr = (v: unknown, max: number): string => String(v ?? '').slice(0, max);
const phoneSafe = (s: string): string => s.replace(/[^\d+\s\-()]/g, '');
const PHONE_REGEX = /^[+]?[\d\s\-()]{7,20}$/;
const LICENSE_REGEX = /^[A-Z0-9\-/\s]{0,40}$/;

const todayISO = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const daysUntil = (iso: string): number | null => {
  if (!iso) return null;
  const target = new Date(iso + 'T00:00:00');
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((target.getTime() - today.getTime()) / (1000 * 3600 * 24));
};

const initials = (name?: string): string => {
  const s = String(name ?? '').trim();
  if (!s) return 'DR';
  const parts = s.split(/\s+/).filter(Boolean);
  return (
    (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '')
  ).toUpperCase() || 'DR';
};

const safeStr = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v : v == null ? fallback : String(v);

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
    if (status === 404) return 'Driver not found.';
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
class DriverManagementBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { hasError: false };
  static getDerivedStateFromError(err: unknown): BoundaryState {
    return {
      hasError: true,
      message: err instanceof Error ? err.message : 'Unexpected error.',
    };
  }
  componentDidCatch(err: unknown) {
    // eslint-disable-next-line no-console
    console.error('[DriverManagementPage]', err);
  }
  reset = () => this.setState({ hasError: false, message: undefined });
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[400px] items-center justify-center p-6">
          <div className="max-w-md rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
            <FiAlertTriangle className="mx-auto mb-3 text-rose-600" size={32} />
            <h2 className="text-base font-bold text-slate-900">Something went wrong</h2>
            <p className="mt-1 text-sm text-slate-600">{this.state.message || 'Unable to render drivers.'}</p>
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
  const key = safeStr(status).toLowerCase();
  const cls = STATUS_CLASSES[key] ?? 'border-slate-200 bg-slate-50 text-slate-600';
  const dot = STATUS_DOT_CLASSES[key] ?? 'bg-slate-400';
  const label = key ? key.replace(/_/g, ' ') : 'unknown';
  return (
    <Badge
      variant="outline"
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize ${cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </Badge>
  );
});
StatusBadge.displayName = 'StatusBadge';

const LicenseChip = ({ validity }: { validity?: string | null }) => {
  const days = daysUntil(safeStr(validity));
  if (days === null) return null;

  if (days < 0) {
    return (
      <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600">
        <FiFileText size={10} /> Expired {Math.abs(days)} day{Math.abs(days) === 1 ? '' : 's'} ago
      </span>
    );
  }
  if (days < LICENSE_EXPIRY_WARN_DAYS) {
    return (
      <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600">
        <FiFileText size={10} /> Valid till {validity} (expires in {days}d)
      </span>
    );
  }
  return (
    <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-500">
      <FiFileText size={10} /> Valid till {validity}
    </span>
  );
};

/* ══════════════════════════════════════════════════════════
 * Main component
 * ════════════════════════════════════════════════════════ */

export const DriverManagementPage: React.FC = () => {
  const { showError, showSuccess } = useNotification();
  const { can, isSuperAdmin } = usePermission();
  const loadingUser = useAuthStore((s) => s.loadingUser);
  const hasUser = useAuthStore((s) => Boolean(s.user));
  const companyId = useAuthStore(
    (s) => Number((s as any)?.user?.company_id ?? (s as any)?.activeCompany?.id ?? 0)
  );

  /* ── Permissions ── */
  const canView = isSuperAdmin || can('view deliveries') || can('view drivers');
  const canCreate = isSuperAdmin || can('create deliveries') || can('create drivers');
  const canEdit = isSuperAdmin || can('edit deliveries') || can('edit drivers');

  /* ── Data ── */
  const [drivers, setDrivers] = useState<DeliveryDriver[]>([]);
  const [vehicles, setVehicles] = useState<DeliveryVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ── Filters ── */
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebouncedValue(searchTerm, 250);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  /* ── Modal ── */
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<DeliveryDriver | null>(null);
  const [form, setForm] = useState<FormState>({
    name: '',
    contactNumber: '',
    alternateContact: '',
    licenseNumber: '',
    licenseValidity: '',
    address: '',
    status: 'available',
    notes: '',
    isActive: true,
    assignedVehicleId: '',
    isVehicleOwner: false,
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  /* ── Refs ── */
  const listAbortRef = useRef<AbortController | null>(null);
  const modalBodyRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      listAbortRef.current?.abort();
    };
  }, []);

  /* ── Fetch ── */
  const fetchDriversAndVehicles = useCallback(async () => {
    if (!canView) return;
    listAbortRef.current?.abort();
    const ctrl = new AbortController();
    listAbortRef.current = ctrl;

    setLoading(true);
    setError(null);
    try {
      const [dRes, vRes] = await Promise.all([
        deliveryService.getDrivers(),
        deliveryService.getVehicles(),
      ]);
      if (ctrl.signal.aborted || !mountedRef.current) return;
      setDrivers(Array.isArray(dRes?.data) ? dRes.data : []);
      setVehicles(Array.isArray(vRes?.data) ? vRes.data : []);
    } catch (err) {
      if (ctrl.signal.aborted) return;
      const msg = getApiErrorMessage(err, 'Could not load drivers / vehicles.');
      setError(msg);
      setDrivers([]);
      setVehicles([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    void fetchDriversAndVehicles();
  }, [fetchDriversAndVehicles]);

  /* ── Shortcut: Ctrl/Cmd + N ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta || e.key.toLowerCase() !== 'n') return;
      if (!canCreate) return;
      e.preventDefault();
      openCreate();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCreate]);

  /* ══════════════════════════════════════════════════════
   * Modal form helpers
   * ══════════════════════════════════════════════════════ */

  const clearFieldError = useCallback((field: string) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    // Only clear the banner when there are no field errors left
    setFieldErrors((prev) => {
      if (Object.keys(prev).length === 0) setFormError(null);
      return prev;
    });
  }, []);

  const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    clearFieldError(String(key));
  }, [clearFieldError]);

  const openCreate = useCallback(() => {
    if (!canCreate) {
      showError('Permission denied', 'You do not have permission to add drivers.');
      return;
    }
    setEditingDriver(null);
    setForm({
      name: '',
      contactNumber: '',
      alternateContact: '',
      licenseNumber: '',
      licenseValidity: '',
      address: '',
      status: 'available',
      notes: '',
      isActive: true,
      assignedVehicleId: '',
      isVehicleOwner: false,
    });
    setFormError(null);
    setFieldErrors({});
    setModalOpen(true);
  }, [canCreate, showError]);

  const openEdit = useCallback((driver: DeliveryDriver) => {
    if (!canEdit) {
      showError('Permission denied', 'You do not have permission to edit drivers.');
      return;
    }
    setEditingDriver(driver);

    /* Determine if a vehicle is already linked */
    const driverVehicle =
      Array.isArray(driver.vehicles) && driver.vehicles.length > 0
        ? driver.vehicles[0]
        : (vehicles ?? []).find((v) => v.default_driver_id === driver.id);

    setForm({
      name: safeStr(driver.name),
      contactNumber: safeStr(driver.contact_number),
      alternateContact: safeStr(driver.alternate_contact),
      licenseNumber: safeStr(driver.license_number),
      licenseValidity: safeStr(driver.license_validity),
      address: safeStr(driver.address),
      status: (driver.status as DriverStatus) ?? 'available',
      notes: safeStr(driver.notes),
      isActive: driver.is_active !== false,
      assignedVehicleId: driverVehicle?.id ?? '',
      isVehicleOwner:
        driverVehicle?.ownership_type === 'owned' &&
        safeStr(driverVehicle?.notes).includes('Owner-Driver'),
    });
    setFormError(null);
    setFieldErrors({});
    setModalOpen(true);
  }, [canEdit, showError, vehicles]);

  /* ══════════════════════════════════════════════════════
   * Validate + submit
   * ══════════════════════════════════════════════════════ */

  const validateForm = useCallback((): boolean => {
    const errors: Record<string, string[]> = {};
    if (!form.name.trim()) errors.name = ['Full name is required.'];
    if (!form.contactNumber.trim()) errors.contact_number = ['Contact number is required.'];
    else if (!PHONE_REGEX.test(form.contactNumber)) errors.contact_number = ['Invalid phone format.'];
    if (form.alternateContact && !PHONE_REGEX.test(form.alternateContact)) {
      errors.alternate_contact = ['Invalid phone format.'];
    }
    if (form.licenseNumber && !LICENSE_REGEX.test(form.licenseNumber)) {
      errors.license_number = ['Only letters, digits, dashes and slashes allowed.'];
    }
    if (form.licenseValidity && form.licenseValidity < todayISO()) {
      errors.license_validity = ['License validity cannot be in the past.'];
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      const first = Object.values(errors)[0]?.[0] ?? 'Please fix the highlighted fields.';
      setFormError(first);
      return false;
    }
    setFormError(null);
    return true;
  }, [form]);

  const handleSave = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!validateForm()) return;

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        company_id: companyId || 1,
        name: form.name.trim(),
        contact_number: form.contactNumber.trim(),
        alternate_contact: form.alternateContact.trim() || undefined,
        license_number: form.licenseNumber.trim() || undefined,
        license_validity: form.licenseValidity || undefined,
        address: form.address.trim() || undefined,
        status: form.status,
        notes: form.notes.trim() || undefined,
        is_active: form.isActive,
        assigned_vehicle_id: form.assignedVehicleId ? Number(form.assignedVehicleId) : null,
        is_vehicle_owner: form.isVehicleOwner,
      };

      if (editingDriver) {
        await deliveryService.updateDriver(editingDriver.id, payload);
        showSuccess('Driver updated', `"${form.name}" saved.`);
      } else {
        await deliveryService.createDriver(payload);
        showSuccess('Driver registered', `"${form.name}" added to fleet.`);
      }
      setModalOpen(false);
      void fetchDriversAndVehicles();
    } catch (err) {
      const responseData = (err as any)?.response?.data;
      const validationErrors = responseData?.errors as Record<string, string[]> | undefined;

      if (validationErrors && typeof validationErrors === 'object' && Object.keys(validationErrors).length > 0) {
        setFieldErrors(validationErrors);
        const first = Object.values(validationErrors).flat()[0] ?? '';
        setFormError(first || responseData?.message || 'Please fix the highlighted fields.');
      } else {
        setFormError(getApiErrorMessage(err, 'Could not save driver.'));
      }
    } finally {
      setSaving(false);
    }
  }, [companyId, form, editingDriver, validateForm, fetchDriversAndVehicles, showSuccess]);

  /* ══════════════════════════════════════════════════════
   * Derived data
   * ══════════════════════════════════════════════════════ */

  const filteredDrivers = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    return drivers.filter((d) => {
      if (term) {
        const haystack = [
          d.name,
          d.contact_number,
          d.alternate_contact,
          d.license_number,
        ]
          .map((v) => safeStr(v).toLowerCase())
          .join(' ');
        if (!haystack.includes(term)) return false;
      }
      if (statusFilter === 'all') return true;
      if (statusFilter === 'owner_drivers') {
        return (
          (Array.isArray(d.vehicles) &&
            d.vehicles.some((v) => safeStr(v?.notes).includes('Owner-Driver'))) ||
          (vehicles ?? []).some(
            (v) =>
              v.default_driver_id === d.id &&
              safeStr(v.notes).includes('Owner-Driver')
          )
        );
      }
      return d.status === statusFilter;
    });
  }, [drivers, vehicles, debouncedSearch, statusFilter]);

  const kpi = useMemo(() => {
    const total = drivers.length;
    const available = drivers.filter((d) => d.status === 'available').length;
    const onTrip = drivers.filter((d) => d.status === 'on_trip').length;
    const onLeave = drivers.filter((d) => d.status === 'on_leave').length;
    const inactive = drivers.filter((d) => d.status === 'inactive' || d.is_active === false).length;
    return { total, available, onTrip, onLeave, inactive };
  }, [drivers]);

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
            You don't have permission to view drivers.
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
    <DriverManagementBoundary>
      <div className="min-h-full bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100/60">
        <div className="mx-auto w-full max-w-[1500px] space-y-4 p-3 sm:space-y-5 sm:p-4 lg:p-5 xl:p-6">

          {/* ── Hero ── */}
          <section className="relative overflow-hidden rounded-2xl border border-slate-800/10 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-4 py-5 shadow-[0_20px_40px_-20px_rgba(15,23,42,0.45)] sm:px-6 sm:py-6 lg:px-7">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />
            <div className="relative flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200 backdrop-blur">
                  <FiUserCheck size={12} /> Logistics · Drivers
                </div>
                <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl xl:text-[30px]">
                  Carrier Driver Management
                </h1>
                <p className="mt-1.5 max-w-2xl text-xs text-slate-300 sm:text-sm">
                  Manage carrier drivers, license validity, contact details, and owner-operator fleet.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void fetchDriversAndVehicles()}
                  disabled={loading}
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
                    onClick={openCreate}
                    title="Add driver (Ctrl+N)"
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-b from-cyan-300 to-cyan-400 px-4 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:from-cyan-200 hover:to-cyan-300"
                  >
                    <FiPlus size={14} /> Add Driver
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* ── KPI ── */}
          <section className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4 md:gap-4">
            <KpiCard
              label="Total Drivers"
              value={kpi.total}
              icon={<FiUsers size={16} className="text-slate-600" />}
              bg="bg-slate-100"
              ring="ring-slate-500/10"
            />
            <KpiCard
              label="Ready for Trip"
              value={kpi.available}
              icon={<FiCheckCircle size={16} className="text-emerald-600" />}
              bg="bg-emerald-50"
              ring="ring-emerald-500/10"
              valueClass="text-emerald-700"
            />
            <KpiCard
              label="On Trip"
              value={kpi.onTrip}
              icon={<FiClock size={16} className="text-blue-600" />}
              bg="bg-blue-50"
              ring="ring-blue-500/10"
              valueClass="text-blue-700"
            />
            <KpiCard
              label="On Leave / Inactive"
              value={kpi.onLeave + kpi.inactive}
              icon={<FiAlertTriangle size={16} className="text-amber-600" />}
              bg="bg-amber-50"
              ring="ring-amber-500/10"
              valueClass="text-amber-700"
            />
          </section>

          {/* ── Filters ── */}
          <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <CardContent className="p-3 sm:p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <FiSearch
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    size={15}
                  />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(clampStr(e.target.value, LIMITS.nameMax))}
                    placeholder="Search name, phone, license…"
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

                <div className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {STATUS_FILTER_OPTIONS.map((opt) => {
                    const active = statusFilter === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setStatusFilter(opt.value)}
                        className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition ${
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
              </div>
            </CardContent>
          </Card>

          {/* ── Error banner ── */}
          {error && (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-rose-700 sm:flex-row sm:items-start sm:gap-3 sm:p-4"
            >
              <div className="flex items-start gap-2 sm:flex-1">
                <FiAlertCircle className="mt-0.5 shrink-0" size={18} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Could not load drivers</p>
                  <p className="text-xs sm:text-sm">{error}</p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => void fetchDriversAndVehicles()}
                className="w-full shrink-0 rounded-xl border-rose-300 bg-white text-xs font-semibold text-rose-700 hover:bg-rose-50 sm:w-auto"
              >
                Retry
              </Button>
            </div>
          )}

          {/* ── Drivers Card ── */}
          <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-slate-100 bg-white px-3 py-3 sm:px-5 sm:py-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                  <FiUserCheck size={14} />
                </div>
                <div className="min-w-0">
                  <CardTitle className="truncate text-xs font-semibold text-slate-800 sm:text-sm">
                    Fleet Drivers
                  </CardTitle>
                  <CardDescription className="truncate text-[10px] text-slate-500 sm:text-[11px]">
                    {loading
                      ? 'Loading…'
                      : `${filteredDrivers.length} of ${drivers.length} driver${drivers.length === 1 ? '' : 's'}`}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            {/* ── Table (lg+) ── */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50/70 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Driver / Vehicle</th>
                    <th className="px-5 py-3 font-semibold">Contact</th>
                    <th className="px-5 py-3 font-semibold">License</th>
                    <th className="px-5 py-3 font-semibold">Address</th>
                    <th className="px-5 py-3 text-center font-semibold">Status</th>
                    <th className="px-5 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        {Array.from({ length: 6 }).map((__, c) => (
                          <td key={c} className="px-5 py-3.5">
                            <div className="h-4 animate-pulse rounded bg-slate-100" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : filteredDrivers.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <EmptyState message="No drivers match your filter." />
                      </td>
                    </tr>
                  ) : (
                    filteredDrivers.map((driver) => {
                      const assignedVeh =
                        Array.isArray(driver.vehicles) && driver.vehicles.length > 0
                          ? driver.vehicles[0]
                          : (vehicles ?? []).find((v) => v.default_driver_id === driver.id) ?? null;
                      const isOwner = safeStr(assignedVeh?.notes).includes('Owner-Driver');
                      return (
                        <tr key={driver.id} className="transition-colors hover:bg-slate-50/70">
                          <td className="px-5 py-3.5">
                            <div className="flex items-start gap-2.5">
                              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[11px] font-bold text-white">
                                {initials(driver.name)}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="truncate font-semibold text-slate-900">
                                    {safeStr(driver.name, '—')}
                                  </p>
                                  {isOwner && (
                                    <span className="inline-flex items-center gap-0.5 rounded bg-purple-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-purple-700">
                                      <FiShield size={9} /> Owner
                                    </span>
                                  )}
                                </div>
                                {assignedVeh ? (
                                  <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] font-medium text-indigo-600">
                                    <FiTruck size={10} />
                                    {safeStr(assignedVeh.name)} ({safeStr(assignedVeh.registration_number)})
                                  </p>
                                ) : (
                                  <p className="mt-0.5 text-[11px] italic text-slate-400">
                                    No vehicle linked
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <p className="flex items-center gap-1 font-medium text-slate-900">
                              <FiPhone size={11} className="text-slate-400" />
                              {safeStr(driver.contact_number, '—')}
                            </p>
                            {driver.alternate_contact && (
                              <p className="mt-0.5 text-[11px] text-slate-500">
                                Alt: {safeStr(driver.alternate_contact)}
                              </p>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            <p className="font-mono text-[11px] font-semibold text-slate-800">
                              {safeStr(driver.license_number) || (
                                <span className="font-normal italic text-slate-400">None</span>
                              )}
                            </p>
                            {driver.license_validity && (
                              <LicenseChip validity={driver.license_validity} />
                            )}
                          </td>
                          <td className="max-w-[180px] px-5 py-3.5 text-xs text-slate-600">
                            <span className="block truncate">
                              {safeStr(driver.address) || (
                                <span className="italic text-slate-400">Not specified</span>
                              )}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <StatusBadge status={driver.status} />
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            {canEdit && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => openEdit(driver)}
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

            {/* ── Cards (mobile / tablet) ── */}
            <div className="divide-y divide-slate-100 lg:hidden">
              {loading ? (
                <div className="space-y-2 p-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />
                  ))}
                </div>
              ) : filteredDrivers.length === 0 ? (
                <EmptyState message="No drivers match your filter." />
              ) : (
                filteredDrivers.map((driver) => {
                  const assignedVeh =
                    Array.isArray(driver.vehicles) && driver.vehicles.length > 0
                      ? driver.vehicles[0]
                      : (vehicles ?? []).find((v) => v.default_driver_id === driver.id) ?? null;
                  const isOwner = safeStr(assignedVeh?.notes).includes('Owner-Driver');
                  return (
                    <div key={driver.id} className="p-3 sm:p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 flex-1 items-start gap-2">
                          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[11px] font-bold text-white">
                            {initials(driver.name)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="truncate text-sm font-semibold text-slate-900">
                                {safeStr(driver.name, '—')}
                              </p>
                              <StatusBadge status={driver.status} />
                              {isOwner && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-purple-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-purple-700">
                                  <FiShield size={9} /> Owner
                                </span>
                              )}
                            </div>
                            <p className="mt-1 flex items-center gap-1 truncate text-xs text-slate-700">
                              <FiPhone size={10} className="text-slate-400" />
                              {safeStr(driver.contact_number, '—')}
                            </p>
                            {driver.license_number && (
                              <p className="mt-0.5 truncate font-mono text-[11px] text-slate-500">
                                {safeStr(driver.license_number)}
                              </p>
                            )}
                            <LicenseChip validity={driver.license_validity} />
                            {assignedVeh ? (
                              <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] font-medium text-indigo-600">
                                <FiTruck size={10} />
                                {safeStr(assignedVeh.name)} ({safeStr(assignedVeh.registration_number)})
                              </p>
                            ) : (
                              <p className="mt-0.5 text-[11px] italic text-slate-400">No vehicle</p>
                            )}
                          </div>
                        </div>
                        {canEdit && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openEdit(driver)}
                            className="h-8 shrink-0 rounded-lg"
                            aria-label="Edit driver"
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

      {/* ══════════════════════════════════════════════════
       * Modal
       * ══════════════════════════════════════════════════ */}
      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={(e) => { if (e.target === e.currentTarget && !saving) setModalOpen(false); }}
        >
          <div
            ref={modalBodyRef}
            className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <FiUserCheck size={18} />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-bold text-slate-900 sm:text-base">
                    {editingDriver ? 'Edit Carrier Driver' : 'Register New Carrier Driver'}
                  </h3>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    Enter driver profile, license, and vehicle linkage.
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

            {/* Body */}
            <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col">
              <div className="space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
                {/* Error banner */}
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
                            <span className="font-semibold capitalize">
                              {k.replace(/_/g, ' ')}:
                            </span>{' '}
                            {msgs[0]}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* Name */}
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Full name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => updateField('name', clampStr(e.target.value, LIMITS.nameMax))}
                    maxLength={LIMITS.nameMax}
                    placeholder="e.g. Ramesh Kumar"
                    className={fieldClass('name')}
                  />
                  {fieldErrors.name && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-rose-600">
                      <FiAlertCircle size={10} /> {fieldErrors.name[0]}
                    </p>
                  )}
                </div>

                {/* Phones */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Primary phone <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="tel"
                      inputMode="tel"
                      required
                      value={form.contactNumber}
                      onChange={(e) => updateField('contactNumber', phoneSafe(clampStr(e.target.value, LIMITS.phoneMax)))}
                      maxLength={LIMITS.phoneMax}
                      pattern="[+]?[0-9\s\-()]{7,20}"
                      placeholder="+91 98765 43210"
                      className={fieldClass('contact_number')}
                    />
                    {fieldErrors.contact_number && (
                      <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-rose-600">
                        <FiAlertCircle size={10} /> {fieldErrors.contact_number[0]}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Alternate phone
                    </label>
                    <input
                      type="tel"
                      inputMode="tel"
                      value={form.alternateContact}
                      onChange={(e) => updateField('alternateContact', phoneSafe(clampStr(e.target.value, LIMITS.phoneMax)))}
                      maxLength={LIMITS.phoneMax}
                      pattern="[+]?[0-9\s\-()]{7,20}"
                      placeholder="Optional"
                      className={fieldClass('alternate_contact')}
                    />
                    {fieldErrors.alternate_contact && (
                      <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-rose-600">
                        <FiAlertCircle size={10} /> {fieldErrors.alternate_contact[0]}
                      </p>
                    )}
                  </div>
                </div>

                {/* License */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Driving license no.
                    </label>
                    <input
                      type="text"
                      value={form.licenseNumber}
                      onChange={(e) => updateField('licenseNumber', clampStr(e.target.value.toUpperCase(), LIMITS.licenseMax))}
                      maxLength={LIMITS.licenseMax}
                      placeholder="BR-27-2020-00123"
                      spellCheck={false}
                      className={`${fieldClass('license_number')} font-mono`}
                    />
                    {fieldErrors.license_number && (
                      <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-rose-600">
                        <FiAlertCircle size={10} /> {fieldErrors.license_number[0]}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      License validity
                    </label>
                    <input
                      type="date"
                      value={form.licenseValidity}
                      min={todayISO()}
                      onChange={(e) => updateField('licenseValidity', e.target.value)}
                      className={fieldClass('license_validity')}
                    />
                    {fieldErrors.license_validity && (
                      <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-rose-600">
                        <FiAlertCircle size={10} /> {fieldErrors.license_validity[0]}
                      </p>
                    )}
                  </div>
                </div>

                {/* Vehicle + Owner section */}
                <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3">
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-indigo-900">
                    <FiTruck size={13} /> Vehicle &amp; owner
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Primary assigned vehicle
                    </label>
                    <select
                      value={String(form.assignedVehicleId)}
                      onChange={(e) => updateField('assignedVehicleId', e.target.value ? Number(e.target.value) : '')}
                      className={fieldClass('assigned_vehicle_id')}
                    >
                      <option value="">— No vehicle (roving driver) —</option>
                      {(vehicles ?? []).map((v) => (
                        <option key={v.id} value={v.id}>
                          {safeStr(v.name)} ({safeStr(v.registration_number)}) — {safeStr(v.type).toUpperCase()} [{v.max_capacity} {safeStr(v.capacity_unit)}]
                        </option>
                      ))}
                    </select>
                  </div>
                  {form.assignedVehicleId !== '' && (
                    <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-lg border border-indigo-200 bg-white p-2">
                      <input
                        type="checkbox"
                        checked={form.isVehicleOwner}
                        onChange={(e) => updateField('isVehicleOwner', e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-xs text-slate-700">
                        <span className="block font-semibold text-indigo-900">
                          Driver owns this vehicle (owner-operator)
                        </span>
                        <span className="mt-0.5 block text-[10px] text-slate-500">
                          Check if the driver operates the carrier under contract or private ownership.
                        </span>
                      </span>
                    </label>
                  )}
                </div>

                {/* Address */}
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Residential address
                  </label>
                  <textarea
                    rows={2}
                    value={form.address}
                    onChange={(e) => updateField('address', clampStr(e.target.value, LIMITS.addressMax))}
                    maxLength={LIMITS.addressMax}
                    placeholder="e.g. Warisaliganj Market, Nawada, Bihar"
                    className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                  />
                </div>

                {/* Status + Active */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Dispatch status
                    </label>
                    <select
                      value={form.status}
                      onChange={(e) => updateField('status', e.target.value as DriverStatus)}
                      className={fieldClass('status')}
                    >
                      {DRIVER_STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Active
                    </label>
                    <div className="flex h-10 items-center">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={form.isActive}
                        onClick={() => updateField('isActive', !form.isActive)}
                        className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-4 focus:ring-indigo-500/20 ${
                          form.isActive ? 'bg-indigo-600' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${
                            form.isActive ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                      <span className="ml-2 text-xs font-medium text-slate-600">
                        {form.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Internal notes
                  </label>
                  <input
                    type="text"
                    value={form.notes}
                    onChange={(e) => updateField('notes', clampStr(e.target.value, LIMITS.notesMax))}
                    maxLength={LIMITS.notesMax}
                    placeholder="e.g. Experienced with Nalanda rural routes"
                    className={fieldClass('notes')}
                  />
                </div>
              </div>

              {/* Footer */}
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
                  {saving ? 'Saving…' : editingDriver ? 'Save Changes' : 'Register Driver'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DriverManagementBoundary>
  );
};

/* ══════════════════════════════════════════════════════════
 * Small helpers
 * ════════════════════════════════════════════════════════ */

function KpiCard({
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
}) {
  return (
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
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-14 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-slate-200/70">
        <FiUsers className="h-6 w-6 text-slate-400" />
      </div>
      <p className="mt-4 text-sm font-semibold text-slate-800">No drivers</p>
      <p className="mt-1 text-xs text-slate-500">{message}</p>
    </div>
  );
}

export default DriverManagementPage;