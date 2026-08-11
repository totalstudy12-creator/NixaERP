import { useEffect, useState, useCallback, useMemo, useRef, lazy, Suspense, memo } from 'react';
import {
  FiPlus, FiRefreshCw, FiTrash2, FiEdit, FiDownload,
  FiUsers, FiUserCheck, FiUserX, FiCreditCard, FiAlertCircle,
  FiFilter, FiSearch, FiX
} from 'react-icons/fi';

const ModernDataTable = lazy(() =>
  import('../components/ModernDataTable').then(m => ({ default: m.ModernDataTable }))
);
const Offcanvas = lazy(() =>
  import('../components/Offcanvas').then(m => ({ default: m.Offcanvas }))
);

import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';

// ── Stable API Cache Hook (uses ref for fetcher to prevent infinite loops) ──
function useApiCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = 300_000
) {
  const cache = useRef(new Map<string, { data: T; timestamp: number }>()).current;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetcherRef = useRef(fetcher);
  useEffect(() => { fetcherRef.current = fetcher; });

  const fetchData = useCallback(async (skipCache = false) => {
    if (!skipCache) {
      const entry = cache.get(key);
      if (entry && Date.now() - entry.timestamp < ttlMs) {
        setData(entry.data);
        setLoading(false);
        return;
      }
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetcherRef.current();
      const result = Array.isArray(res) ? res : (res as any).data ?? [];
      cache.set(key, { data: result, timestamp: Date.now() });
      setData(result);
    } catch (err: any) {
      const msg = err.message || 'Failed to load';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [key, ttlMs]);

  useEffect(() => { fetchData(); }, [fetchData]);
  return { data, loading, error, refresh: () => fetchData(true) };
}

// ── Types ──
type Supplier = {
  id: number;
  company_id: number;
  branch_id?: number;
  parent_id?: number;
  group_id?: number;
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
  eway_bill_distance?: number;
  territory?: string;
  zone?: string;
  status?: string;
  credit_limit?: number;
  outstanding_amount?: number;
  wallet_balance?: number;
  commission_rate?: number;
  kyc_status?: string;
  approved_at?: string;
  opening_balance?: number;
  due_days?: number;
  fax?: string;
  website?: string;
  note?: string;
  license_no?: string;
  custom_field_1?: string;
  custom_field_2?: string;
  is_active: boolean;
  notes?: string;
  company?: { id: number; name: string };
  branch?: { id: number; name: string };
  parent?: { id: number; name: string };
  group?: { id: number; name: string };
};

type SupplierFormData = Partial<Supplier> & { same_as_billing?: boolean };

// ── Skeletons ──
const StatCardSkeleton = memo(() => (
  <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-4 animate-pulse">
    <div className="h-10 w-10 rounded-xl bg-slate-200" />
    <div className="space-y-2 flex-1">
      <div className="h-3 w-16 bg-slate-200 rounded" />
      <div className="h-6 w-8 bg-slate-200 rounded" />
    </div>
  </div>
));

const TableSkeleton = memo(() => (
  <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4 animate-pulse">
    <div className="h-6 w-48 bg-slate-200 rounded" />
    {[...Array(8)].map((_, i) => (
      <div key={i} className="flex gap-4">
        <div className="h-4 w-1/4 bg-slate-200 rounded" />
        <div className="h-4 w-1/5 bg-slate-200 rounded" />
        <div className="h-4 w-1/6 bg-slate-200 rounded" />
        <div className="h-4 w-1/6 bg-slate-200 rounded" />
        <div className="h-4 w-1/4 bg-slate-200 rounded" />
      </div>
    ))}
  </div>
));

const StatCard = memo(({ icon: Icon, label, value, tone }: {
  icon: any; label: string; value: number | string;
  tone: 'blue' | 'emerald' | 'amber' | 'rose';
}) => {
  const bg = tone === 'blue' ? 'bg-blue-100 text-blue-600' :
             tone === 'emerald' ? 'bg-emerald-100 text-emerald-600' :
             tone === 'amber' ? 'bg-amber-100 text-amber-600' :
             'bg-rose-100 text-rose-600';
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${bg}`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
});

// ── GST Lookup (reused) ──
function useGstLookup() {
  const [lookingUp, setLookingUp] = useState(false);
  const lookupGst = useCallback(async (gstin: string) => {
    if (!gstin || gstin.length < 10) return null;
    setLookingUp(true);
    try {
      const result = await apiClient.lookupGst(gstin);
      return result;
    } catch { return null; }
    finally { setLookingUp(false); }
  }, []);
  return { lookupGst, lookingUp };
}

export function SuppliersPage() {
  const { showSuccess, showError } = useNotification();

  // Fetch all suppliers (per_page=1000)
  const {
    data: suppliers,
    loading,
    error,
    refresh,
  } = useApiCache<Supplier[]>('suppliers', () => apiClient.getSuppliers());

  // Other data
  const { data: companies } = useApiCache<any[]>('companies', () => apiClient.getCompanies());
  const { data: branches } = useApiCache<any[]>('branches', () => apiClient.getBranches());
  const { data: supplierGroups, refresh: refreshGroups } = useApiCache<any[]>('supplierGroups', () => apiClient.getSupplierGroups());

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterTerritory, setFilterTerritory] = useState('all');
  const [filterZone, setFilterZone] = useState('all');

  // Form
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<SupplierFormData>({
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
    approved_at: undefined,
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
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({});

  const [showGroupModal, setShowGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [addingGroup, setAddingGroup] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;

  // ── Derived data ──
  const supplierList = useMemo(() => suppliers || [], [suppliers]);

  const filteredSuppliers = useMemo(() => {
    let filtered = [...supplierList];
    const term = searchTerm.toLowerCase().trim();
    if (term) {
      filtered = filtered.filter(s =>
        s.name?.toLowerCase().includes(term) ||
        s.contact_person?.toLowerCase().includes(term) ||
        s.territory?.toLowerCase().includes(term) ||
        s.zone?.toLowerCase().includes(term) ||
        s.email?.toLowerCase().includes(term)
      );
    }
    if (filterStatus !== 'all') filtered = filtered.filter(s => s.status === filterStatus);
    if (filterTerritory !== 'all') filtered = filtered.filter(s => s.territory === filterTerritory);
    if (filterZone !== 'all') filtered = filtered.filter(s => s.zone === filterZone);
    return filtered;
  }, [supplierList, searchTerm, filterStatus, filterTerritory, filterZone]);

  const totalPages = Math.ceil(filteredSuppliers.length / rowsPerPage);
  const paginatedSuppliers = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredSuppliers.slice(start, start + rowsPerPage);
  }, [filteredSuppliers, currentPage]);

  useEffect(() => setCurrentPage(1), [searchTerm, filterStatus, filterTerritory, filterZone]);

  const summary = useMemo(() => ({
    total: supplierList.length,
    active: supplierList.filter(s => s.status === 'active').length,
    inactive: supplierList.filter(s => s.status === 'inactive').length,
    totalCredit: supplierList.reduce((sum, s) => sum + (Number(s.credit_limit) || 0), 0),
  }), [supplierList]);

  const territories = useMemo(() => [...new Set(supplierList.map(s => s.territory).filter(Boolean))], [supplierList]);
  const zones = useMemo(() => [...new Set(supplierList.map(s => s.zone).filter(Boolean))], [supplierList]);

  // Branch filter for form
  const filteredBranchesForm = useMemo(() => {
    if (formData.company_id && branches) {
      return branches.filter((b: any) => b.company_id === Number(formData.company_id));
    }
    return [];
  }, [formData.company_id, branches]);

  // ── GST Auto‑fill ──
  const { lookupGst, lookingUp } = useGstLookup();
  const handleGstChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, gst_number: e.target.value }));
  };
  const handleAutoFill = async () => {
    if (!formData.gst_number) return;
    const data = await lookupGst(formData.gst_number);
    if (data) {
      setFormData(prev => ({
        ...prev,
        name: data.company_name || prev.name,
        billing_street: data.billing_street || prev.billing_street,
        billing_city: data.billing_city || prev.billing_city,
        billing_state: data.billing_state || prev.billing_state,
        billing_pincode: data.billing_pincode || prev.billing_pincode,
        billing_country: data.billing_country || prev.billing_country,
        registration_type: data.registration_type || prev.registration_type,
        pan: data.pan || prev.pan,
      }));
      showSuccess('GSTIN details auto‑filled');
    } else {
      showError('Unable to fetch GSTIN details.');
    }
  };

  // ── Same as Billing ──
  const handleSameAsBillingToggle = (checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      same_as_billing: checked,
      ...(checked ? {
        shipping_street: prev.billing_street,
        shipping_landmark: prev.billing_landmark,
        shipping_city: prev.billing_city,
        shipping_state: prev.billing_state,
        shipping_country: prev.billing_country,
        shipping_pincode: prev.billing_pincode,
      } : {}),
    }));
  };

  // ── Group add ──
  const handleAddGroup = async () => {
    if (!newGroupName.trim()) return;
    setAddingGroup(true);
    try {
      await apiClient.createSupplierGroup({ name: newGroupName.trim() });
      refreshGroups();
      setNewGroupName('');
      setShowGroupModal(false);
      showSuccess('Group added');
    } catch (err: any) {
      showError('Failed to add group', err.message);
    } finally { setAddingGroup(false); }
  };

  // ── CRUD ──
  const handleCreate = useCallback(() => {
    setEditingId(null);
    setFormData({
      company_id: 0, branch_id: undefined, parent_id: undefined, group_id: undefined,
      name: '', type: 'supplier', company_type: '', contact_person: '', contact_no: '',
      email: '', phone: '', gst_number: '', registration_type: '', pan: '',
      billing_street: '', billing_landmark: '', billing_city: '', billing_state: '', billing_country: 'India', billing_pincode: '',
      shipping_street: '', shipping_landmark: '', shipping_city: '', shipping_state: '', shipping_country: 'India', shipping_pincode: '',
      eway_bill_distance: '', territory: '', zone: '', status: 'active',
      credit_limit: 0, outstanding_amount: 0, wallet_balance: 0, commission_rate: 0,
      kyc_status: 'pending', approved_at: undefined, opening_balance: 0, due_days: '',
      fax: '', website: '', note: '', license_no: '', custom_field_1: '', custom_field_2: '',
      is_active: true, notes: '', same_as_billing: true,
    });
    setFormErrors({});
    setIsPanelOpen(true);
  }, []);

  const handleEdit = useCallback((supplier: Supplier) => {
    setEditingId(supplier.id);
    setFormData({
      ...supplier,
      same_as_billing: !supplier.shipping_street ||
        (supplier.shipping_street === supplier.billing_street &&
         supplier.shipping_city === supplier.billing_city),
    });
    setFormErrors({});
    setIsPanelOpen(true);
  }, []);

  const handleDelete = useCallback(async (supplier: Supplier) => {
    if (!confirm(`Delete supplier ${supplier.name}?`)) return;
    try {
      await apiClient.deleteSupplier(supplier.id);
      showSuccess('Supplier deleted', `${supplier.name} removed.`);
      addAppLog({ module: 'Suppliers', action: 'Delete', status: 'success', message: `Deleted ${supplier.name}` });
      refresh();
    } catch (err: any) {
      showError('Delete failed', err.message);
    }
  }, [refresh, showSuccess, showError]);

  // ── Validation ──
  const validateForm = (): boolean => {
    const errors: Record<string, boolean> = {};
    let valid = true;
    if (!formData.name?.trim()) { errors.name = true; valid = false; }
    if (!formData.company_id || formData.company_id === 0) { errors.company_id = true; valid = false; }
    if (!formData.billing_city?.trim()) { errors.billing_city = true; valid = false; }
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = true; valid = false;
    }
    if (formData.contact_no && !/^\d+$/.test(formData.contact_no.trim())) {
      errors.contact_no = true; valid = false;
    }
    setFormErrors(errors);
    if (!valid) showError('Validation', 'Please fix the highlighted required fields.');
    return valid;
  };

  const handleSubmit = useCallback(async () => {
    if (!validateForm()) return;
    const { same_as_billing, ...payload } = {
      ...formData,
      company_id: Number(formData.company_id),
      branch_id: formData.branch_id ? Number(formData.branch_id) : null,
      parent_id: formData.parent_id ? Number(formData.parent_id) : null,
      group_id: formData.group_id ? Number(formData.group_id) : null,
      eway_bill_distance: formData.eway_bill_distance ? Number(formData.eway_bill_distance) : null,
      credit_limit: Number(formData.credit_limit) || 0,
      outstanding_amount: Number(formData.outstanding_amount) || 0,
      wallet_balance: Number(formData.wallet_balance) || 0,
      commission_rate: Number(formData.commission_rate) || 0,
      opening_balance: Number(formData.opening_balance) || 0,
      due_days: formData.due_days ? Number(formData.due_days) : null,
    };

    setSubmitting(true);
    try {
      if (editingId) {
        await apiClient.updateSupplier(editingId, payload);
        showSuccess('Supplier updated', `${payload.name} updated.`);
        addAppLog({ module: 'Suppliers', action: 'Update', status: 'success', message: `Updated ${payload.name}` });
      } else {
        await apiClient.createSupplier(payload);
        showSuccess('Supplier created', `${payload.name} added.`);
        addAppLog({ module: 'Suppliers', action: 'Create', status: 'success', message: `Created ${payload.name}` });
      }
      setIsPanelOpen(false);
      refresh();
    } catch (err: any) {
      showError('Save failed', err.message);
      addAppLog({ module: 'Suppliers', action: 'Save', status: 'error', message: err.message });
    } finally { setSubmitting(false); }
  }, [formData, editingId, refresh, showSuccess, showError]);

  const handleExport = useCallback(() => {
    const headers = ['Name', 'Contact', 'Email', 'Phone', 'Territory', 'Zone', 'Status', 'Credit Limit', 'Outstanding'];
    const rows = filteredSuppliers.map(s => [
      s.name, s.contact_person || '', s.email || '', s.phone || '',
      s.territory || '', s.zone || '', s.status || '',
      s.credit_limit || 0, s.outstanding_amount || 0
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `suppliers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    showSuccess('Export', 'Supplier data exported.');
  }, [filteredSuppliers, showSuccess]);

  // ── Render field helper (red glow) ──
  const renderField = (label: string, field: keyof SupplierFormData, type: 'text' | 'number' | 'email' = 'text', required = false) => {
    const value = (formData as any)[field] ?? '';
    const id = `field-${field}`;
    const hasError = formErrors[field];
    return (
      <div>
        <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        <input
          id={id}
          type={type}
          value={value as string | number}
          onChange={(e) => setFormData(prev => ({ ...prev, [field]: e.target.value }))}
          className={`w-full rounded-lg border bg-white px-3 py-2 text-sm shadow-sm transition ${
            hasError ? 'border-red-400 ring-2 ring-red-200' : 'border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200'
          }`}
          placeholder={`Enter ${label}`}
        />
      </div>
    );
  };

  // ── Table Columns ──
  const columns = useMemo(() => [
    {
      name: 'Name',
      selector: (row: Supplier) => row.name,
      sortable: true,
      cell: (row: Supplier) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center text-white text-xs font-bold">
            {row.name?.[0] || 'S'}
          </div>
          <div>
            <div className="font-medium text-slate-800">{row.name}</div>
            <div className="text-xs text-slate-400">{row.contact_person || ''}</div>
          </div>
        </div>
      ),
      width: '200px',
    },
    {
      name: 'Company',
      selector: (row: Supplier) => row.company_id,
      cell: (row: Supplier) => {
        const comp = (companies || []).find((c: any) => c.id === row.company_id);
        return <span className="text-sm">{comp?.name || `ID: ${row.company_id}`}</span>;
      },
      width: '130px',
    },
    {
      name: 'Territory',
      selector: (row: Supplier) => row.territory || '-',
      cell: (row: Supplier) => <span className="text-sm">{row.territory || '-'}</span>,
      width: '130px',
    },
    {
      name: 'Zone',
      selector: (row: Supplier) => row.zone || '-',
      cell: (row: Supplier) => <span className="text-sm">{row.zone || '-'}</span>,
      width: '100px',
    },
    {
      name: 'Credit Limit',
      selector: (row: Supplier) => Number(row.credit_limit) || 0,
      cell: (row: Supplier) => <span className="text-sm">₹{(Number(row.credit_limit) || 0).toLocaleString()}</span>,
      width: '120px',
    },
    {
      name: 'Outstanding',
      selector: (row: Supplier) => Number(row.outstanding_amount) || 0,
      cell: (row: Supplier) => <span className={`text-sm ${Number(row.outstanding_amount) > 0 ? 'text-rose-600' : 'text-slate-600'}`}>₹{(Number(row.outstanding_amount) || 0).toLocaleString()}</span>,
      width: '110px',
    },
    {
      name: 'Status',
      selector: (row: Supplier) => row.status || 'active',
      cell: (row: Supplier) => {
        const colors: Record<string, string> = {
          active: 'bg-emerald-100 text-emerald-700',
          inactive: 'bg-rose-100 text-rose-700',
          pending: 'bg-amber-100 text-amber-700',
        };
        const status = row.status || 'active';
        return <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${colors[status]}`}>{status}</span>;
      },
      width: '100px',
    },
    {
      name: 'Actions',
      cell: (row: Supplier) => (
        <div className="flex items-center gap-2">
          <button onClick={() => handleEdit(row)} className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50" title="Edit"><FiEdit size={16} /></button>
          <button onClick={() => handleDelete(row)} className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50" title="Delete"><FiTrash2 size={16} /></button>
        </div>
      ),
      width: '100px',
    },
  ], [handleEdit, handleDelete, companies]);

  // ── Render ──
  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 md:p-7 text-slate-800">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 mb-6 rounded-3xl bg-slate-950 px-5 py-6 md:px-8 md:py-7 shadow-xl shadow-slate-300/50">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> Supplier Network
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl flex items-center gap-3">
            <FiUsers className="text-emerald-300" /> Suppliers
            <span className="text-sm font-normal text-emerald-100/70 ml-2">Directory</span>
          </h1>
          <p className="text-sm text-slate-300">Manage suppliers, credit limits, and outstanding balances</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} disabled={loading} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 hover:bg-white/20 disabled:opacity-60">
            <FiRefreshCw className={loading ? 'animate-spin inline mr-1' : 'inline mr-1'} size={14} /> Refresh
          </button>
          <button onClick={handleExport} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 hover:bg-white/20">
            <FiDownload className="inline mr-1" size={14} /> Export
          </button>
          <button onClick={handleCreate} className="rounded-xl bg-emerald-400 text-slate-950 px-3 py-2 text-sm font-medium hover:bg-emerald-300 shadow-md shadow-emerald-500/20">
            <FiPlus className="inline mr-1" size={14} /> Add Supplier
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <FiSearch className="absolute left-3 top-2.5 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search by name, territory..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 transition"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FiFilter size={16} className="text-slate-500" />
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-xl border-slate-200 bg-white py-2 px-3 text-sm">
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="pending">Pending</option>
          </select>
          <select value={filterTerritory} onChange={(e) => setFilterTerritory(e.target.value)} className="rounded-xl border-slate-200 bg-white py-2 px-3 text-sm">
            <option value="all">All Territories</option>
            {territories.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filterZone} onChange={(e) => setFilterZone(e.target.value)} className="rounded-xl border-slate-200 bg-white py-2 px-3 text-sm">
            <option value="all">All Zones</option>
            {zones.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {loading ? (
          [...Array(4)].map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard icon={FiUsers} label="Total Suppliers" value={summary.total} tone="blue" />
            <StatCard icon={FiUserCheck} label="Active" value={summary.active} tone="emerald" />
            <StatCard icon={FiUserX} label="Inactive" value={summary.inactive} tone="rose" />
            <StatCard icon={FiCreditCard} label="Total Credit" value={`₹${summary.totalCredit.toLocaleString()}`} tone="amber" />
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-2 animate-shake">
          <FiAlertCircle size={20} /> {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <Suspense fallback={<TableSkeleton />}>
          {loading ? (
            <TableSkeleton />
          ) : (
            <>
              <ModernDataTable
                title="Supplier Directory"
                columns={columns}
                data={paginatedSuppliers}
                loading={false}
                striped
                highlightOnHover
                pointerOnHover
              />
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-3 border-t">
                  <span className="text-sm text-slate-600">
                    Showing {((currentPage - 1) * rowsPerPage) + 1} to {Math.min(currentPage * rowsPerPage, filteredSuppliers.length)} of {filteredSuppliers.length}
                  </span>
                  <div className="flex gap-1">
                    <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40">««</button>
                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40">‹</button>
                    <span className="px-3 py-1 text-sm font-medium">{currentPage} / {totalPages}</span>
                    <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40">›</button>
                    <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40">»»</button>
                  </div>
                </div>
              )}
            </>
          )}
        </Suspense>
      </div>

      {/* Offcanvas – Full Supplier Form */}
      {isPanelOpen && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"><div className="bg-white p-8 rounded-2xl">Loading...</div></div>}>
          <Offcanvas
            isOpen={isPanelOpen}
            title={editingId ? 'Edit Supplier' : 'Add Supplier'}
            onClose={() => setIsPanelOpen(false)}
            footer={
              <div className="flex justify-between w-full">
                <button onClick={() => setIsPanelOpen(false)} className="px-4 py-2 rounded-lg border text-slate-600 hover:bg-slate-50" disabled={submitting}>
                  <FiX className="inline mr-1" /> Close
                </button>
                <button onClick={handleSubmit} disabled={submitting} className="px-5 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50">
                  {submitting ? 'Saving...' : 'Save'}
                </button>
              </div>
            }
          >
            <div className="space-y-5 overflow-y-auto hide-scrollbar pr-2" style={{ maxHeight: '70vh' }}>
              {/* Supplier Detail */}
              <fieldset className="border rounded-lg p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Supplier Detail
                </legend>
                <div className="mt-3 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Company *</label>
                      <select
                        value={formData.company_id as number}
                        onChange={(e) => setFormData(prev => ({ ...prev, company_id: Number(e.target.value), branch_id: undefined }))}
                        className={`w-full rounded-lg border bg-white px-3 py-2 text-sm ${formErrors.company_id ? 'border-red-400 ring-2 ring-red-200' : 'border-gray-300'}`}
                      >
                        <option value={0}>Select Company</option>
                        {(companies || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
                      <select
                        value={formData.branch_id as number}
                        onChange={(e) => setFormData(prev => ({ ...prev, branch_id: e.target.value ? Number(e.target.value) : undefined }))}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                      >
                        <option value="">None</option>
                        {filteredBranchesForm.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">GSTIN</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={formData.gst_number || ''}
                        onChange={handleGstChange}
                        className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                        placeholder="Enter GSTIN"
                      />
                      <button type="button" onClick={handleAutoFill} disabled={lookingUp || !formData.gst_number} className="rounded-lg bg-blue-500 px-4 py-2 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50 whitespace-nowrap">
                        {lookingUp ? 'Fetching...' : 'Auto Fill'}
                      </button>
                    </div>
                  </div>
                  {renderField('Company Name *', 'name', 'text', true)}
                  <div className="grid grid-cols-2 gap-4">
                    {renderField('Contact Person', 'contact_person')}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Contact No</label>
                      <input
                        type="tel"
                        value={formData.contact_no || ''}
                        onChange={(e) => { const val = e.target.value.replace(/\D/g, ''); setFormData(prev => ({ ...prev, contact_no: val })); }}
                        className={`w-full rounded-lg border bg-white px-3 py-2 text-sm ${formErrors.contact_no ? 'border-red-400 ring-2 ring-red-200' : 'border-gray-300'}`}
                        placeholder="Enter Contact No"
                      />
                    </div>
                  </div>
                  {renderField('Email', 'email', 'email')}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Registration Type</label>
                      <select value={formData.registration_type || ''} onChange={(e) => setFormData(prev => ({ ...prev, registration_type: e.target.value }))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
                        <option value="">Select</option>
                        <option value="Registered">Registered</option>
                        <option value="Unregistered">Unregistered</option>
                      </select>
                    </div>
                    {renderField('PAN', 'pan')}
                  </div>
                </div>
              </fieldset>

              {/* Billing Address */}
              <fieldset className="border rounded-lg p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Billing Address
                </legend>
                <div className="mt-3 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                    <textarea value={formData.billing_street || ''} onChange={(e) => setFormData(prev => ({ ...prev, billing_street: e.target.value }))} rows={2} className={`w-full rounded-lg border bg-white px-3 py-2 text-sm ${formErrors.billing_city ? 'border-red-400 ring-2 ring-red-200' : 'border-gray-300'}`} placeholder="Enter Address" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {renderField('City *', 'billing_city', 'text', true)}
                    {renderField('State', 'billing_state')}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {renderField('Country', 'billing_country')}
                    {renderField('Pincode', 'billing_pincode')}
                  </div>
                </div>
              </fieldset>

              {/* Shipping Address */}
              <fieldset className="border rounded-lg p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-teal-500"></span> Shipping Address
                </legend>
                <div className="mt-3">
                  <label className="flex items-center gap-2 cursor-pointer mb-3">
                    <input type="checkbox" checked={formData.same_as_billing ?? true} onChange={(e) => handleSameAsBillingToggle(e.target.checked)} className="rounded border-gray-300 text-blue-600" />
                    <span className="text-sm text-gray-600">Same as Billing Address</span>
                  </label>
                  {!formData.same_as_billing && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                        <textarea value={formData.shipping_street || ''} onChange={(e) => setFormData(prev => ({ ...prev, shipping_street: e.target.value }))} rows={2} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" placeholder="Enter Shipping Address" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-sm font-medium text-gray-700 mb-1">City</label><input type="text" value={formData.shipping_city || ''} onChange={(e) => setFormData(prev => ({ ...prev, shipping_city: e.target.value }))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" placeholder="City" /></div>
                        <div><label className="block text-sm font-medium text-gray-700 mb-1">State</label><input type="text" value={formData.shipping_state || ''} onChange={(e) => setFormData(prev => ({ ...prev, shipping_state: e.target.value }))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" placeholder="State" /></div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-sm font-medium text-gray-700 mb-1">Country</label><input type="text" value={formData.shipping_country || ''} onChange={(e) => setFormData(prev => ({ ...prev, shipping_country: e.target.value }))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" placeholder="Country" /></div>
                        <div><label className="block text-sm font-medium text-gray-700 mb-1">Pincode</label><input type="text" value={formData.shipping_pincode || ''} onChange={(e) => setFormData(prev => ({ ...prev, shipping_pincode: e.target.value }))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" placeholder="Pincode" /></div>
                      </div>
                    </div>
                  )}
                </div>
              </fieldset>

              {/* Group & Balance */}
              <fieldset className="border rounded-lg p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span> Group & Balance
                </legend>
                <div className="mt-3 space-y-4">
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Group</label>
                      <select value={formData.group_id as number} onChange={(e) => setFormData(prev => ({ ...prev, group_id: e.target.value ? Number(e.target.value) : undefined }))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
                        <option value="">Select Group</option>
                        {(supplierGroups || []).map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                    </div>
                    <button type="button" onClick={() => setShowGroupModal(true)} className="mb-0.5 text-blue-600 text-sm hover:underline whitespace-nowrap">+ Add Group</button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {renderField('Opening Balance', 'opening_balance', 'number')}
                    {renderField('Credit Limit', 'credit_limit', 'number')}
                  </div>
                  {renderField('Due Days', 'due_days', 'number')}
                </div>
              </fieldset>

              {/* Supplier-specific fields */}
              <fieldset className="border rounded-lg p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Supplier Settings
                </legend>
                <div className="mt-3 grid grid-cols-2 gap-4">
                  {renderField('Territory', 'territory')}
                  {renderField('Zone', 'zone')}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select value={formData.status || 'active'} onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="pending">Pending</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">KYC Status</label>
                    <select value={formData.kyc_status || 'pending'} onChange={(e) => setFormData(prev => ({ ...prev, kyc_status: e.target.value }))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
                      <option value="pending">Pending</option>
                      <option value="verified">Verified</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>
                  {renderField('Outstanding Amount', 'outstanding_amount', 'number')}
                  {renderField('Wallet Balance', 'wallet_balance', 'number')}
                  {renderField('Commission Rate (%)', 'commission_rate', 'number')}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Approved At</label>
                    <input type="datetime-local" value={formData.approved_at ? new Date(formData.approved_at).toISOString().slice(0, 16) : ''} onChange={(e) => setFormData(prev => ({ ...prev, approved_at: e.target.value }))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <textarea value={formData.notes || ''} onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))} rows={2} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" placeholder="Notes" />
                  </div>
                </div>
              </fieldset>

              {/* Custom Fields */}
              <fieldset className="border rounded-lg p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Custom Fields
                </legend>
                <div className="mt-3 grid grid-cols-3 gap-4">
                  {renderField('License No.', 'license_no')}
                  {renderField('Custom Field 1', 'custom_field_1')}
                  {renderField('Custom Field 2', 'custom_field_2')}
                </div>
              </fieldset>

              {/* Additional Details */}
              <fieldset className="border rounded-lg p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span> Additional Details
                </legend>
                <div className="mt-3 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {renderField('Fax No', 'fax')}
                    {renderField('Website', 'website')}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {renderField('Credit Limit', 'credit_limit', 'number')}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
                      <textarea value={formData.note || ''} onChange={(e) => setFormData(prev => ({ ...prev, note: e.target.value }))} rows={2} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" placeholder="Enter Note" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <input type="checkbox" checked={formData.is_active ?? true} onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))} className="rounded border-gray-300 text-blue-600" />
                    <label className="text-sm text-gray-700">Enable – visible on all documents</label>
                  </div>
                </div>
              </fieldset>
            </div>
          </Offcanvas>
        </Suspense>
      )}

      {/* Add Group Modal */}
      {showGroupModal && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Add Supplier Group</h3>
            <input type="text" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm mb-4" placeholder="Group name" />
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowGroupModal(false); setNewGroupName(''); }} className="px-4 py-2 rounded-lg border text-sm" disabled={addingGroup}>Cancel</button>
              <button onClick={handleAddGroup} disabled={addingGroup || !newGroupName.trim()} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {addingGroup ? 'Adding...' : 'Add Group'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}