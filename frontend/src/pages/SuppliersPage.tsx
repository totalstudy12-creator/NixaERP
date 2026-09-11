import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, ArrowDown, ArrowUp, Building2, CalendarDays, CheckCircle2,
  ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  CreditCard, Download, Eye, FileText, Filter, GitBranch, IndianRupee,
  Landmark, MoreHorizontal, Pencil, Plus, RefreshCw, Search, Trash2, UserCheck,
  UserX, Users, WalletCards, X, MapPin, ShieldCheck, Ban, Phone, Mail,
} from 'lucide-react';

import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';
import { formatDate, formatDateTime } from '../utils/date';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

type Supplier = {
  id: number;
  company_id: number;
  branch_id?: number | null;
  parent_id?: number | null;
  group_id?: number | null;
  name: string;
  type?: string;
  company_type?: string;
  contact_person?: string;
  contact_no?: string;
  email?: string;
  phone?: string;
  gst_number?: string;
  registration_type?: string;
  pan?: string;
  billing_street?: string;
  billing_landmark?: string;
  billing_city?: string;
  billing_state?: string;
  billing_country?: string;
  billing_pincode?: string;
  shipping_street?: string;
  shipping_landmark?: string;
  shipping_city?: string;
  shipping_state?: string;
  shipping_country?: string;
  shipping_pincode?: string;
  eway_bill_distance?: number | string;
  territory?: string;
  zone?: string;
  status?: string;
  credit_limit?: number | string;
  outstanding_amount?: number | string;
  wallet_balance?: number | string;
  commission_rate?: number | string;
  kyc_status?: string;
  approved_at?: string;
  opening_balance?: number | string;
  due_days?: number | string;
  fax?: string;
  website?: string;
  note?: string;
  license_no?: string;
  custom_field_1?: string;
  custom_field_2?: string;
  is_active?: boolean;
  notes?: string;
  company?: { id: number; name: string };
  branch?: { id: number; name: string };
  parent?: { id: number; name: string };
  group?: { id: number; name: string };
  [key: string]: unknown;
};

type Company = { id: number; name: string; code?: string | null };
type Branch = { id: number; company_id: number; name: string; code?: string | null };
type Group = { id: number; name: string };

type Form = Partial<Supplier> & { same_as_billing?: boolean };

const PAGE_SIZE = 15;
const HEAD = 'text-[11px] font-semibold uppercase tracking-wide text-slate-500';

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const money = (v: unknown) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(num(v));

const normalize = <T,>(r: unknown): T[] => {
  if (Array.isArray(r)) return r as T[];
  if (r && typeof r === 'object') {
    const x = r as { data?: unknown };
    if (Array.isArray(x.data)) return x.data as T[];
    if (x.data && typeof x.data === 'object') {
      const y = x.data as { data?: unknown };
      if (Array.isArray(y.data)) return y.data as T[];
    }
  }
  return [];
};

const today = () => new Date().toISOString().slice(0, 10);

const csvSafe = (v: unknown) => {
  const s = String(v ?? '');
  const safe = /^[=+\-@\t\r]/.test(s) ? `\t${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

function StatusBadge({ status }: { status?: string | null }) {
  const value = String(status || 'active').toLowerCase();
  const map: Record<string, string> = {
    active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    inactive: 'border-rose-200 bg-rose-50 text-rose-700',
    pending: 'border-amber-200 bg-amber-50 text-amber-700',
  };
  return (
    <Badge variant="outline" className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${map[value] || map.active}`}>
      {value}
    </Badge>
  );
}

function KycBadge({ value }: { value?: string | null }) {
  const status = String(value || 'pending').toLowerCase();
  const cls =
    status === 'verified'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : status === 'rejected'
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : 'border-amber-200 bg-amber-50 text-amber-700';

  return (
    <Badge variant="outline" className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cls}`}>
      {status}
    </Badge>
  );
}

function SelectBox({
  value, onChange, options, label, disabled = false, className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 disabled:bg-slate-50 disabled:text-slate-400"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

function Kpi({
  title, value, icon: Icon, tone,
}: {
  title: string; value: string; icon: React.ElementType;
  tone: 'blue' | 'emerald' | 'rose' | 'amber';
}) {
  const c = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    rose: 'bg-rose-50 text-rose-600',
    amber: 'bg-amber-50 text-amber-600',
  }[tone];

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,.04)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-slate-400">{title}</p>
          <p className="mt-2 truncate text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{value}</p>
        </div>
        <div className={`grid h-10 w-10 place-items-center rounded-xl ${c}`}><Icon className="h-5 w-5" /></div>
      </div>
    </div>
  );
}

const emptyForm = (): Form => ({
  company_id: 0,
  branch_id: undefined,
  parent_id: undefined,
  group_id: undefined,
  name: '',
  type: 'supplier',
  company_type: '',
  contact_person: '',
  contact_no: '',
  email: '',
  phone: '',
  gst_number: '',
  registration_type: '',
  pan: '',
  billing_street: '',
  billing_landmark: '',
  billing_city: '',
  billing_state: '',
  billing_country: 'India',
  billing_pincode: '',
  shipping_street: '',
  shipping_landmark: '',
  shipping_city: '',
  shipping_state: '',
  shipping_country: 'India',
  shipping_pincode: '',
  eway_bill_distance: '',
  territory: '',
  zone: '',
  status: 'active',
  credit_limit: 0,
  outstanding_amount: 0,
  wallet_balance: 0,
  commission_rate: 0,
  kyc_status: 'pending',
  approved_at: '',
  opening_balance: 0,
  due_days: '',
  fax: '',
  website: '',
  note: '',
  license_no: '',
  custom_field_1: '',
  custom_field_2: '',
  is_active: true,
  notes: '',
  same_as_billing: true,
});

export function SuppliersPage() {
  const { showSuccess, showError } = useNotification();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [company, setCompany] = useState('all');
  const [branch, setBranch] = useState('all');
  const [status, setStatus] = useState('all');
  const [territory, setTerritory] = useState('all');
  const [zone, setZone] = useState('all');
  const [kyc, setKyc] = useState('all');
  const [group, setGroup] = useState('all');
  const [balanceFilter, setBalanceFilter] = useState('all');

  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [viewing, setViewing] = useState<Supplier | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [form, setForm] = useState<Form>(emptyForm());
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const [newGroup, setNewGroup] = useState('');
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupSaving, setGroupSaving] = useState(false);
  const [gstLoading, setGstLoading] = useState(false);

  const [menuId, setMenuId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, c, b, g] = await Promise.all([
        apiClient.getSuppliers(),
        apiClient.getCompanies(),
        apiClient.getBranches(),
        apiClient.getSupplierGroups(),
      ]);

      setSuppliers(normalize<Supplier>(s));
      setCompanies(normalize<Company>(c));
      setBranches(normalize<Branch>(b));
      setGroups(normalize<Group>(g));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load suppliers.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const companyBranches = useMemo(
    () => company === 'all'
      ? branches
      : branches.filter((b) => b.company_id === Number(company)),
    [branches, company],
  );

  useEffect(() => {
    if (branch !== 'all' && !companyBranches.some((b) => b.id === Number(branch))) {
      setBranch('all');
    }
  }, [branch, companyBranches]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();

    return suppliers.filter((s) => {
      if (term && ![
        s.name, s.contact_person, s.contact_no, s.email, s.phone,
        s.gst_number, s.pan, s.territory, s.zone, s.billing_city,
      ].filter(Boolean).join(' ').toLowerCase().includes(term)) return false;

      if (company !== 'all' && s.company_id !== Number(company)) return false;
      if (branch !== 'all' && s.branch_id !== Number(branch)) return false;
      if (status !== 'all' && String(s.status || 'active') !== status) return false;
      if (territory !== 'all' && s.territory !== territory) return false;
      if (zone !== 'all' && s.zone !== zone) return false;
      if (kyc !== 'all' && String(s.kyc_status || 'pending') !== kyc) return false;
      if (group !== 'all' && s.group_id !== Number(group)) return false;

      const due = num(s.outstanding_amount);
      if (balanceFilter === 'due' && due <= 0) return false;
      if (balanceFilter === 'clear' && due > 0) return false;
      if (balanceFilter === 'credit' && num(s.credit_limit) <= 0) return false;

      return true;
    });
  }, [
    suppliers, search, company, branch, status, territory, zone, kyc, group, balanceFilter,
  ]);

  useEffect(() => setPage(1), [
    search, company, branch, status, territory, zone, kyc, group, balanceFilter,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const summary = useMemo(() => ({
    total: suppliers.length,
    active: suppliers.filter((s) => s.status === 'active').length,
    inactive: suppliers.filter((s) => s.status === 'inactive').length,
    credit: suppliers.reduce((a, s) => a + num(s.credit_limit), 0),
    outstanding: suppliers.reduce((a, s) => a + num(s.outstanding_amount), 0),
    verified: suppliers.filter((s) => s.kyc_status === 'verified').length,
  }), [suppliers]);

  const territories = useMemo(
    () => [...new Set(suppliers.map((s) => s.territory).filter(Boolean))] as string[],
    [suppliers],
  );

  const zones = useMemo(
    () => [...new Set(suppliers.map((s) => s.zone).filter(Boolean))] as string[],
    [suppliers],
  );

  const formBranches = useMemo(
    () => branches.filter((b) => b.company_id === Number(form.company_id)),
    [branches, form.company_id],
  );

  const validate = () => {
    const e: Record<string, boolean> = {};
    if (!form.name?.trim()) e.name = true;
    if (!form.company_id) e.company_id = true;
    if (!form.billing_city?.trim()) e.billing_city = true;
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = true;
    if (form.contact_no && !/^\d{10}$/.test(form.contact_no.replace(/\D/g, ''))) e.contact_no = true;

    setFormErrors(e);

    if (Object.keys(e).length) {
      showError('Validation', 'Please fix the highlighted supplier fields.');
      return false;
    }
    return true;
  };

  const saveSupplier = async () => {
    if (!validate()) return;

    const {
      same_as_billing,
      ...raw
    } = form;

    const payload = {
      ...raw,
      company_id: Number(form.company_id),
      branch_id: form.branch_id ? Number(form.branch_id) : null,
      parent_id: form.parent_id ? Number(form.parent_id) : null,
      group_id: form.group_id ? Number(form.group_id) : null,
      eway_bill_distance: form.eway_bill_distance ? Number(form.eway_bill_distance) : null,
      credit_limit: num(form.credit_limit),
      outstanding_amount: num(form.outstanding_amount),
      wallet_balance: num(form.wallet_balance),
      commission_rate: num(form.commission_rate),
      opening_balance: num(form.opening_balance),
      due_days: form.due_days ? Number(form.due_days) : null,
    };

    setSaving(true);
    try {
      if (editingId) {
        await apiClient.updateSupplier(editingId, payload);
        showSuccess('Supplier updated', `${form.name} updated successfully.`);
        addAppLog({ module: 'Suppliers', action: 'Update', status: 'success', message: form.name || '' });
      } else {
        await apiClient.createSupplier(payload);
        showSuccess('Supplier created', `${form.name} added successfully.`);
        addAppLog({ module: 'Suppliers', action: 'Create', status: 'success', message: form.name || '' });
      }

      setEditOpen(false);
      await load();
    } catch (e) {
      showError('Save failed', e instanceof Error ? e.message : 'Unable to save supplier.');
    } finally {
      setSaving(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFormErrors({});
    setEditOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setMenuId(null);
    setEditingId(s.id);
    setForm({
      ...s,
      same_as_billing:
        !s.shipping_street ||
        (
          s.shipping_street === s.billing_street &&
          s.shipping_city === s.billing_city &&
          s.shipping_state === s.billing_state
        ),
    });
    setFormErrors({});
    setEditOpen(true);
  };

  const openView = (s: Supplier) => {
    setMenuId(null);
    setViewing(s);
    setViewOpen(true);
  };

  const deleteSupplier = async (s: Supplier) => {
    setMenuId(null);

    if (!window.confirm(`Delete supplier "${s.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await apiClient.deleteSupplier(s.id);
      showSuccess('Supplier deleted', `${s.name} removed successfully.`);
      addAppLog({ module: 'Suppliers', action: 'Delete', status: 'success', message: s.name });
      if (viewing?.id === s.id) {
        setViewing(null);
        setViewOpen(false);
      }
      await load();
    } catch (e) {
      showError('Delete failed', e instanceof Error ? e.message : 'Unable to delete supplier.');
    }
  };

  const lookupGst = async () => {
    const gst = String(form.gst_number || '').trim().toUpperCase();
    if (gst.length < 10) {
      showError('GSTIN', 'Enter a valid GSTIN first.');
      return;
    }

    setGstLoading(true);
    try {
      const result = await apiClient.lookupGst(gst) as any;

      if (!result) {
        showError('GSTIN', 'GSTIN details were not returned.');
        return;
      }

      setForm((current) => ({
        ...current,
        gst_number: gst,
        name: result.company_name || current.name,
        billing_street: result.billing_street || current.billing_street,
        billing_city: result.billing_city || current.billing_city,
        billing_state: result.billing_state || current.billing_state,
        billing_pincode: result.billing_pincode || current.billing_pincode,
        billing_country: result.billing_country || current.billing_country,
        registration_type: result.registration_type || current.registration_type,
        pan: result.pan || current.pan,
      }));

      showSuccess('GSTIN updated', 'Available GSTIN details were filled.');
    } catch (e) {
      showError('GSTIN lookup failed', e instanceof Error ? e.message : 'Unable to fetch GSTIN details.');
    } finally {
      setGstLoading(false);
    }
  };

  const addGroup = async () => {
    const name = newGroup.trim();
    if (!name) return;

    setGroupSaving(true);
    try {
      await apiClient.createSupplierGroup({ name });
      const result = await apiClient.getSupplierGroups();
      setGroups(normalize<Group>(result));
      setNewGroup('');
      setGroupOpen(false);
      showSuccess('Group added', `${name} created successfully.`);
    } catch (e) {
      showError('Group creation failed', e instanceof Error ? e.message : 'Unable to create group.');
    } finally {
      setGroupSaving(false);
    }
  };

  const exportCsv = () => {
    if (!filtered.length) {
      showError('Nothing to export', 'No suppliers match the current filters.');
      return;
    }

    const headers = [
      'Name', 'Company', 'Branch', 'Contact Person', 'Contact No', 'Email',
      'GSTIN', 'PAN', 'Territory', 'Zone', 'Group', 'Status', 'KYC',
      'Credit Limit', 'Outstanding', 'Wallet', 'Opening Balance', 'Due Days',
    ];

    const lines = filtered.map((s) => [
      s.name,
      companies.find((c) => c.id === s.company_id)?.name || '',
      branches.find((b) => b.id === s.branch_id)?.name || '',
      s.contact_person || '',
      s.contact_no || '',
      s.email || '',
      s.gst_number || '',
      s.pan || '',
      s.territory || '',
      s.zone || '',
      groups.find((g) => g.id === s.group_id)?.name || '',
      s.status || '',
      s.kyc_status || '',
      num(s.credit_limit).toFixed(2),
      num(s.outstanding_amount).toFixed(2),
      num(s.wallet_balance).toFixed(2),
      num(s.opening_balance).toFixed(2),
      s.due_days || '',
    ].map(csvSafe).join(','));

    const blob = new Blob(
      [[headers.map(csvSafe).join(','), ...lines].join('\n')],
      { type: 'text/csv;charset=utf-8;' },
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `suppliers-${today()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    showSuccess('Export complete', `${filtered.length} supplier(s) exported.`);
  };

  const activeFilters = [
    search,
    company !== 'all' ? company : '',
    branch !== 'all' ? branch : '',
    status !== 'all' ? status : '',
    territory !== 'all' ? territory : '',
    zone !== 'all' ? zone : '',
    kyc !== 'all' ? kyc : '',
    group !== 'all' ? group : '',
    balanceFilter !== 'all' ? balanceFilter : '',
  ].filter(Boolean).length;

  const field = (
    label: string,
    key: keyof Form,
    type: 'text' | 'email' | 'number' = 'text',
    required = false,
  ) => {
    const value = form[key] ?? '';
    const hasError = !!formErrors[String(key)];

    return (
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-600">
          {label}{required && <span className="text-rose-500"> *</span>}
        </label>

        <Input
          type={type}
          value={value as string | number}
          onChange={(e) =>
            setForm((x) => ({ ...x, [key]: e.target.value }))
          }
          className={
            hasError
              ? 'border-rose-400 ring-4 ring-rose-100'
              : ''
          }
        />
      </div>
    );
  };

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100/60">
      <div className="mx-auto w-full max-w-[1900px] space-y-5 p-3 sm:p-4 lg:space-y-6 lg:p-6">

        {/* Header */}
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 px-5 py-6 shadow-[0_20px_40px_-20px_rgba(15,23,42,.45)] sm:px-7 lg:px-8">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-emerald-500/15 blur-3xl" />

          <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.18em] text-emerald-200">
                <Users className="h-3 w-3" />
                Purchase · Supplier Network
              </div>

              <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                <Landmark className="h-7 w-7 text-emerald-300" />
                Supplier workspace
              </h1>

              <p className="mt-1.5 max-w-2xl text-sm text-slate-300">
                Manage suppliers, GSTIN, branches, groups, credit, outstanding,
                KYC and contact information.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={exportCsv}
                disabled={loading || !filtered.length}
                className="h-10 rounded-xl border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              >
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>

              <Button
                onClick={openCreate}
                className="h-10 rounded-xl bg-emerald-400 font-semibold text-slate-950 hover:bg-emerald-300"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add supplier
              </Button>
            </div>
          </div>
        </section>

        {/* KPI */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Kpi title="Suppliers" value={summary.total.toLocaleString('en-IN')} icon={Users} tone="blue" />
          <Kpi title="Active" value={String(summary.active)} icon={UserCheck} tone="emerald" />
          <Kpi title="Inactive" value={String(summary.inactive)} icon={UserX} tone="rose" />
          <Kpi title="Verified KYC" value={String(summary.verified)} icon={ShieldCheck} tone="emerald" />
          <Kpi title="Credit limit" value={money(summary.credit)} icon={CreditCard} tone="amber" />
          <Kpi title="Outstanding" value={money(summary.outstanding)} icon={IndianRupee} tone="rose" />
        </section>

        {/* Filters */}
        <Card className="overflow-hidden rounded-2xl border-slate-200/80">
          <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
                <Filter className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">Supplier filters</p>
                <p className="text-[11px] text-slate-500">
                  {activeFilters
                    ? `${activeFilters} active filter${activeFilters > 1 ? 's' : ''}`
                    : 'Search, scope, status, KYC and balances'}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="lg:hidden"
                onClick={() => setFiltersOpen((v) => !v)}
              >
                <Filter className="mr-2 h-3.5 w-3.5" />
                {filtersOpen ? 'Hide' : 'Show'}
              </Button>

              {activeFilters > 0 && (
                <Button variant="ghost" size="sm" onClick={() => {
                  setSearch('');
                  setCompany('all');
                  setBranch('all');
                  setStatus('all');
                  setTerritory('all');
                  setZone('all');
                  setKyc('all');
                  setGroup('all');
                  setBalanceFilter('all');
                }}>
                  <X className="mr-1.5 h-3.5 w-3.5" />
                  Reset
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent className={`${filtersOpen ? 'block' : 'hidden'} space-y-3 p-4 sm:p-5 lg:block`}>
            <div className="grid gap-3 lg:grid-cols-12">
              <div className="relative lg:col-span-4">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search supplier, GSTIN, phone, city…"
                  className="h-10 rounded-xl pl-10"
                />
              </div>

              <SelectBox
                value={company}
                onChange={(v) => { setCompany(v); setBranch('all'); }}
                label="Company"
                options={[
                  { value: 'all', label: 'All companies' },
                  ...companies.map((c) => ({ value: String(c.id), label: c.name })),
                ]}
                className="lg:col-span-2"
              />

              <SelectBox
                value={branch}
                onChange={setBranch}
                label="Branch"
                options={[
                  { value: 'all', label: 'All branches' },
                  ...companyBranches.map((b) => ({ value: String(b.id), label: b.name })),
                ]}
                className="lg:col-span-2"
              />

              <SelectBox
                value={status}
                onChange={setStatus}
                label="Status"
                options={[
                  { value: 'all', label: 'All status' },
                  { value: 'active', label: 'Active' },
                  { value: 'inactive', label: 'Inactive' },
                  { value: 'pending', label: 'Pending' },
                ]}
                className="lg:col-span-2"
              />

              <SelectBox
                value={kyc}
                onChange={setKyc}
                label="KYC"
                options={[
                  { value: 'all', label: 'All KYC' },
                  { value: 'verified', label: 'Verified' },
                  { value: 'pending', label: 'Pending' },
                  { value: 'rejected', label: 'Rejected' },
                ]}
                className="lg:col-span-2"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-12">
              <SelectBox
                value={territory}
                onChange={setTerritory}
                label="Territory"
                options={[
                  { value: 'all', label: 'All territories' },
                  ...territories.map((v) => ({ value: v, label: v })),
                ]}
                className="lg:col-span-2"
              />

              <SelectBox
                value={zone}
                onChange={setZone}
                label="Zone"
                options={[
                  { value: 'all', label: 'All zones' },
                  ...zones.map((v) => ({ value: v, label: v })),
                ]}
                className="lg:col-span-2"
              />

              <SelectBox
                value={group}
                onChange={setGroup}
                label="Supplier group"
                options={[
                  { value: 'all', label: 'All groups' },
                  ...groups.map((g) => ({ value: String(g.id), label: g.name })),
                ]}
                className="lg:col-span-2"
              />

              <SelectBox
                value={balanceFilter}
                onChange={setBalanceFilter}
                label="Balance"
                options={[
                  { value: 'all', label: 'All balances' },
                  { value: 'due', label: 'Outstanding > 0' },
                  { value: 'clear', label: 'No outstanding' },
                  { value: 'credit', label: 'Has credit limit' },
                ]}
                className="lg:col-span-2"
              />

              <div className="flex items-end gap-2 lg:col-span-4">
                <div className="flex flex-1 items-center rounded-xl border border-slate-200 bg-white p-1">
                  <div className="px-2 text-slate-400">
                    <CalendarDays className="h-4 w-4" />
                  </div>
                  <span className="text-xs text-slate-500">
                    Live supplier directory · {filtered.length} matching
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
            <div>
              <p className="font-semibold">Unable to load suppliers</p>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Table */}
        <Card className="overflow-hidden rounded-2xl border-slate-200/80">
          <CardHeader className="flex flex-col gap-2 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600">
                <Users className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold">Supplier directory</p>
                <p className="text-[11px] text-slate-500">
                  {loading ? 'Loading suppliers…' : `${filtered.length} matching supplier${filtered.length === 1 ? '' : 's'}`}
                </p>
              </div>
            </div>
          </CardHeader>

          <div className="overflow-x-auto">
            <Table className="min-w-[1180px]">
              <TableHeader>
                <TableRow className="bg-slate-50/70">
                  <TableHead><span className={HEAD}>Supplier</span></TableHead>
                  <TableHead><span className={HEAD}>Company / Branch</span></TableHead>
                  <TableHead><span className={HEAD}>Contact</span></TableHead>
                  <TableHead><span className={HEAD}>GST / KYC</span></TableHead>
                  <TableHead><span className={HEAD}>Group</span></TableHead>
                  <TableHead><span className={HEAD}>Credit</span></TableHead>
                  <TableHead><span className={HEAD}>Outstanding</span></TableHead>
                  <TableHead><span className={HEAD}>Status</span></TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>

              <TableBody>
                {loading &&
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 9 }).map((__, x) => (
                        <TableCell key={x}>
                          <div className="h-4 animate-pulse rounded bg-slate-100" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}

                {!loading && rows.map((s) => (
                  <TableRow
                    key={s.id}
                    onClick={() => openView(s)}
                    className="cursor-pointer border-slate-100 hover:bg-slate-50/80"
                  >
                    <TableCell>
                      <div className="min-w-[190px]">
                        <p className="font-semibold text-slate-900">{s.name}</p>
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          {s.contact_person || 'No contact person'}
                        </p>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="min-w-[190px] space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs text-slate-700">
                          <Building2 className="h-3.5 w-3.5 text-indigo-500" />
                          {s.company?.name || companies.find((c) => c.id === s.company_id)?.name || '—'}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                          <GitBranch className="h-3.5 w-3.5 text-violet-500" />
                          {s.branch?.name || branches.find((b) => b.id === s.branch_id)?.name || 'Main / unassigned'}
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="min-w-[170px]">
                        {s.contact_no && (
                          <p className="flex items-center gap-1.5 text-xs text-slate-700">
                            <Phone className="h-3 w-3 text-slate-400" />
                            {s.contact_no}
                          </p>
                        )}
                        {s.email && (
                          <p className="mt-1 flex items-center gap-1.5 truncate text-[11px] text-slate-500">
                            <Mail className="h-3 w-3 text-slate-400" />
                            {s.email}
                          </p>
                        )}
                        {(s.territory || s.zone) && (
                          <p className="mt-1 text-[10px] text-slate-400">
                            {s.territory || '—'} · {s.zone || '—'}
                          </p>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-slate-700">
                          {s.gst_number || 'No GSTIN'}
                        </p>
                        <KycBadge value={s.kyc_status} />
                      </div>
                    </TableCell>

                    <TableCell>
                      <Badge variant="outline" className="rounded-full">
                        {s.group?.name || groups.find((g) => g.id === s.group_id)?.name || 'No group'}
                      </Badge>
                    </TableCell>

                    <TableCell className="whitespace-nowrap text-sm font-semibold tabular-nums text-slate-800">
                      {money(s.credit_limit)}
                    </TableCell>

                    <TableCell className="whitespace-nowrap">
                      <span className={`text-sm font-semibold tabular-nums ${
                        num(s.outstanding_amount) > 0 ? 'text-rose-600' : 'text-emerald-600'
                      }`}>
                        {money(s.outstanding_amount)}
                      </span>
                    </TableCell>

                    <TableCell>
                      <StatusBadge status={s.status} />
                    </TableCell>

                    <TableCell onClick={(e) => e.stopPropagation()} className="text-right">
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setMenuId((v) => v === s.id ? null : s.id)}
                          className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>

                        {menuId === s.id && (
                          <div className="absolute right-0 top-9 z-50 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 text-left shadow-xl">
                            <button
                              type="button"
                              onClick={() => openView(s)}
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                            >
                              <Eye className="h-4 w-4 text-slate-400" />
                              View details
                            </button>

                            <button
                              type="button"
                              onClick={() => openEdit(s)}
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                            >
                              <Pencil className="h-4 w-4 text-slate-400" />
                              Edit supplier
                            </button>

                            <Separator className="my-1" />

                            <button
                              type="button"
                              onClick={() => deleteSupplier(s)}
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete supplier
                            </button>
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}

                {!loading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-20 text-center">
                      <div className="mx-auto max-w-md">
                        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100">
                          <Search className="h-6 w-6 text-slate-400" />
                        </div>
                        <p className="mt-4 font-semibold text-slate-800">No suppliers found</p>
                        <p className="mt-1 text-sm text-slate-500">
                          Adjust the search or filters and try again.
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3.5 sm:px-5 md:flex-row md:items-center md:justify-between">
            <p className="text-xs text-slate-500">
              Showing{' '}
              <b>{filtered.length ? (page - 1) * PAGE_SIZE + 1 : 0}</b>
              {' – '}
              <b>{Math.min(page * PAGE_SIZE, filtered.length)}</b>
              {' of '}
              <b>{filtered.length}</b>
            </p>

            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="icon" className="h-9 w-9" disabled={page === 1} onClick={() => setPage(1)}>
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-9 w-9" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-[70px] rounded-lg bg-slate-100 px-3 py-1.5 text-center text-xs font-semibold">
                {page} / {totalPages}
              </div>
              <Button variant="outline" size="icon" className="h-9 w-9" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-9 w-9" disabled={page === totalPages} onClick={() => setPage(totalPages)}>
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* View sheet */}
      <Sheet open={viewOpen} onOpenChange={(open) => {
        setViewOpen(open);
        if (!open) setViewing(null);
      }}>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-lg">
          {viewing && (
            <>
              <div className="sticky top-0 z-20 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur">
                <SheetHeader>
                  <SheetTitle className="pr-8">
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                        <Users className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-base font-bold">{viewing.name}</p>
                        <p className="text-[11px] text-slate-400">Supplier #{viewing.id}</p>
                      </div>
                    </div>
                  </SheetTitle>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <StatusBadge status={viewing.status} />
                    <KycBadge value={viewing.kyc_status} />
                  </div>
                </SheetHeader>
              </div>

              <div className="space-y-4 px-5 py-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border bg-slate-50 p-3">
                    <p className="text-[10px] uppercase text-slate-400">Credit limit</p>
                    <p className="mt-1 text-lg font-bold">{money(viewing.credit_limit)}</p>
                  </div>
                  <div className={`rounded-xl border p-3 ${
                    num(viewing.outstanding_amount) > 0
                      ? 'border-rose-100 bg-rose-50'
                      : 'border-emerald-100 bg-emerald-50'
                  }`}>
                    <p className="text-[10px] uppercase text-slate-500">Outstanding</p>
                    <p className="mt-1 text-lg font-bold">{money(viewing.outstanding_amount)}</p>
                  </div>
                </div>

                <div className="rounded-xl border bg-white">
                  <div className="border-b bg-slate-50/70 px-3.5 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide">Business scope</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 p-3.5">
                    <div>
                      <p className="text-[10px] uppercase text-slate-400">Company</p>
                      <p className="mt-1 text-xs font-semibold">
                        {viewing.company?.name || companies.find((c) => c.id === viewing.company_id)?.name || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-slate-400">Branch</p>
                      <p className="mt-1 text-xs font-semibold">
                        {viewing.branch?.name || branches.find((b) => b.id === viewing.branch_id)?.name || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-slate-400">Territory</p>
                      <p className="mt-1 text-xs font-semibold">{viewing.territory || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-slate-400">Zone</p>
                      <p className="mt-1 text-xs font-semibold">{viewing.zone || '—'}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border bg-white">
                  <div className="border-b bg-slate-50/70 px-3.5 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide">Identity & contact</p>
                  </div>
                  <div className="divide-y">
                    {[
                      ['Contact person', viewing.contact_person],
                      ['Phone', viewing.contact_no || viewing.phone],
                      ['Email', viewing.email],
                      ['GSTIN', viewing.gst_number],
                      ['PAN', viewing.pan],
                      ['Registration', viewing.registration_type],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between gap-4 px-3.5 py-3">
                        <span className="text-[11px] text-slate-400">{label}</span>
                        <span className="max-w-[60%] text-right text-xs font-semibold break-words">
                          {String(value || '—')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border bg-white">
                  <div className="border-b bg-slate-50/70 px-3.5 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide">Balance & terms</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 p-3.5">
                    <div>
                      <p className="text-[10px] uppercase text-slate-400">Opening balance</p>
                      <p className="mt-1 text-xs font-semibold">{money(viewing.opening_balance)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-slate-400">Wallet</p>
                      <p className="mt-1 text-xs font-semibold">{money(viewing.wallet_balance)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-slate-400">Due days</p>
                      <p className="mt-1 text-xs font-semibold">{viewing.due_days || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-slate-400">Commission</p>
                      <p className="mt-1 text-xs font-semibold">{num(viewing.commission_rate)}%</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border bg-white p-3.5">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-emerald-500" />
                    <p className="text-xs font-semibold uppercase tracking-wide">Billing address</p>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {[
                      viewing.billing_street,
                      viewing.billing_landmark,
                      viewing.billing_city,
                      viewing.billing_state,
                      viewing.billing_pincode,
                      viewing.billing_country,
                    ].filter(Boolean).join(', ') || 'No address available.'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 pb-4">
                  <Button variant="outline" className="h-10 rounded-xl" onClick={() => {
                    setViewOpen(false);
                    openEdit(viewing);
                  }}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                  <Button
                    variant="destructive"
                    className="h-10 rounded-xl !bg-rose-600 !text-white hover:!bg-rose-700"
                    onClick={() => deleteSupplier(viewing)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Create/Edit */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-xl">
          <div className="sticky top-0 z-20 border-b bg-white/95 px-5 py-4 backdrop-blur">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 pr-8">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
                  {editingId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                </span>
                {editingId ? 'Edit supplier' : 'Add supplier'}
              </SheetTitle>
            </SheetHeader>
          </div>

          <div className="space-y-4 px-5 py-5 pb-24">
            <section className="rounded-2xl border bg-white p-4">
              <p className="mb-3 text-sm font-semibold">Supplier details</p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold">Company *</label>
                  <select
                    value={form.company_id || 0}
                    onChange={(e) => setForm((x) => ({
                      ...x,
                      company_id: Number(e.target.value),
                      branch_id: undefined,
                    }))}
                    className={`h-10 w-full rounded-xl border bg-white px-3 text-sm ${
                      formErrors.company_id ? 'border-rose-400 ring-4 ring-rose-100' : 'border-slate-200'
                    }`}
                  >
                    <option value={0}>Select company</option>
                    {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold">Branch</label>
                  <select
                    value={form.branch_id || ''}
                    disabled={!form.company_id}
                    onChange={(e) => setForm((x) => ({
                      ...x,
                      branch_id: e.target.value ? Number(e.target.value) : undefined,
                    }))}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-50"
                  >
                    <option value="">Select branch</option>
                    {formBranches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>

                {field('Supplier name', 'name', 'text', true)}
                {field('Contact person', 'contact_person')}
                {field('Contact number', 'contact_no')}
                {field('Email', 'email', 'email')}

                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold">GSTIN</label>
                  <div className="flex gap-2">
                    <Input
                      value={form.gst_number || ''}
                      onChange={(e) => setForm((x) => ({
                        ...x,
                        gst_number: e.target.value.toUpperCase(),
                      }))}
                      placeholder="GSTIN"
                    />
                    <Button
                      type="button"
                      disabled={gstLoading || !form.gst_number}
                      onClick={lookupGst}
                      className="shrink-0 bg-indigo-600 hover:bg-indigo-700"
                    >
                      {gstLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Auto fill'}
                    </Button>
                  </div>
                </div>

                {field('PAN', 'pan')}

                <div>
                  <label className="mb-1.5 block text-xs font-semibold">Registration</label>
                  <select
                    value={form.registration_type || ''}
                    onChange={(e) => setForm((x) => ({
                      ...x,
                      registration_type: e.target.value,
                    }))}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                  >
                    <option value="">Select</option>
                    <option value="Registered">Registered</option>
                    <option value="Unregistered">Unregistered</option>
                  </select>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-4">
              <p className="mb-3 text-sm font-semibold">Billing address</p>

              <div className="space-y-4">
                {field('Address', 'billing_street')}

                <div className="grid gap-4 sm:grid-cols-2">
                  {field('City', 'billing_city', 'text', true)}
                  {field('State', 'billing_state')}
                  {field('Country', 'billing_country')}
                  {field('Pincode', 'billing_pincode')}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">Shipping address</p>

                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={form.same_as_billing ?? true}
                    onChange={(e) => {
                      const checked = e.target.checked;

                      setForm((x) => ({
                        ...x,
                        same_as_billing: checked,
                        ...(checked ? {
                          shipping_street: x.billing_street,
                          shipping_landmark: x.billing_landmark,
                          shipping_city: x.billing_city,
                          shipping_state: x.billing_state,
                          shipping_country: x.billing_country,
                          shipping_pincode: x.billing_pincode,
                        } : {}),
                      }));
                    }}
                  />
                  Same as billing
                </label>
              </div>

              {!form.same_as_billing && (
                <div className="mt-4 space-y-4">
                  {field('Address', 'shipping_street')}

                  <div className="grid gap-4 sm:grid-cols-2">
                    {field('City', 'shipping_city')}
                    {field('State', 'shipping_state')}
                    {field('Country', 'shipping_country')}
                    {field('Pincode', 'shipping_pincode')}
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-2xl border bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold">Group & balances</p>
                <button
                  type="button"
                  onClick={() => setGroupOpen(true)}
                  className="text-xs font-semibold text-indigo-600 hover:underline"
                >
                  + Add group
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold">Supplier group</label>
                  <select
                    value={form.group_id || ''}
                    onChange={(e) => setForm((x) => ({
                      ...x,
                      group_id: e.target.value ? Number(e.target.value) : undefined,
                    }))}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                  >
                    <option value="">No group</option>
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>

                {field('Opening balance', 'opening_balance', 'number')}
                {field('Credit limit', 'credit_limit', 'number')}
                {field('Outstanding amount', 'outstanding_amount', 'number')}
                {field('Wallet balance', 'wallet_balance', 'number')}
                {field('Due days', 'due_days', 'number')}
                {field('Commission rate %', 'commission_rate', 'number')}
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-4">
              <p className="mb-3 text-sm font-semibold">Supplier settings</p>

              <div className="grid gap-4 sm:grid-cols-2">
                {field('Territory', 'territory')}
                {field('Zone', 'zone')}

                <div>
                  <label className="mb-1.5 block text-xs font-semibold">Status</label>
                  <select
                    value={form.status || 'active'}
                    onChange={(e) => setForm((x) => ({
                      ...x,
                      status: e.target.value,
                    }))}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold">KYC</label>
                  <select
                    value={form.kyc_status || 'pending'}
                    onChange={(e) => setForm((x) => ({
                      ...x,
                      kyc_status: e.target.value,
                    }))}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                  >
                    <option value="pending">Pending</option>
                    <option value="verified">Verified</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>

                {field('License number', 'license_no')}
                {field('Website', 'website')}

                <div className="sm:col-span-2">
                  {field('Notes', 'notes')}
                </div>

                <label className="flex items-center gap-2 text-sm text-slate-600 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={form.is_active ?? true}
                    onChange={(e) => setForm((x) => ({
                      ...x,
                      is_active: e.target.checked,
                    }))}
                  />
                  Supplier is active and available on documents
                </label>
              </div>
            </section>
          </div>

          <div className="fixed bottom-0 right-0 z-30 w-full border-t bg-white/95 px-5 py-3 backdrop-blur sm:max-w-xl">
            <div className="flex justify-between gap-2">
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => setEditOpen(false)}
                className="h-10 rounded-xl"
              >
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>

              <Button
                disabled={saving}
                onClick={saveSupplier}
                className="h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700"
              >
                {saving ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {editingId ? 'Update supplier' : 'Save supplier'}
                  </>
                )}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Group modal */}
      {groupOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">Add supplier group</h3>
              <button onClick={() => setGroupOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <Input
              autoFocus
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
              placeholder="Group name"
              className="mt-4"
            />

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setGroupOpen(false)} disabled={groupSaving}>
                Cancel
              </Button>

              <Button
                onClick={addGroup}
                disabled={groupSaving || !newGroup.trim()}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {groupSaving ? 'Adding…' : 'Add group'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SuppliersPage;